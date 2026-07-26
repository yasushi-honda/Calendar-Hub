import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../lib/firebase-admin.js';
import { listConnectedAccounts, getRefreshToken } from '../lib/token-store.js';
import { refreshAccessToken } from '../lib/google-oauth.js';
import {
  sendEmail,
  buildBookingNotificationHtml,
  buildBookingConfirmationHtml,
} from '../lib/email.js';
import { logMailFailure } from '../lib/mail-fail.js';
import {
  resolveScheduleId,
  fetchAvailableSlots,
  BookingMirrorError,
  type GoogleSlot,
} from '../lib/google-booking-mirror.js';
import { assertE2EMockSafe } from '../lib/e2e-guard.js';
import { pickOwnerDisplayName } from '../lib/owner-display-name.js';
import {
  buildBookingMirrorLinkFromFirestoreData,
  shouldCreateBlockEvent,
} from '../lib/booking-mirror-link-utils.js';
import { excludeOverlappingSlots } from '../lib/booking-mirror-slots.js';
import { getConfirmedBookingEventsForOwner, OVERLAP_LOOKBACK_MS } from '../lib/booking-events.js';
import { createAdapter } from '../lib/adapter-factory.js';
import { createBlockEvent, type BlockEventResult } from '../lib/block-event.js';
import type {
  BookingMirrorLink,
  BookingMirrorSlot,
  CreateBookingMirrorInput,
  PublicBookingMirrorLinkInfo,
} from '@calendar-hub/shared';

export const publicBookingMirrorRoutes = new Hono();

type LinkResult =
  | { link: BookingMirrorLink; error: null; statusCode: null }
  | { link: null; error: string; statusCode: 400 | 404 };

async function getActiveLink(linkId: string): Promise<LinkResult> {
  const db = getDb();
  const doc = await db.collection('bookingMirrorLinks').doc(linkId).get();
  if (!doc.exists) {
    return { link: null, error: 'Booking mirror link not found', statusCode: 404 };
  }
  const data = doc.data()!;
  const link = buildBookingMirrorLinkFromFirestoreData(data);
  if (link.status !== 'active') {
    return { link: null, error: 'This booking link is currently paused', statusCode: 400 };
  }
  if (link.expiresAt && link.expiresAt < new Date()) {
    return { link: null, error: 'This booking link has expired', statusCode: 400 };
  }
  return { link, error: null, statusCode: null };
}

async function getOwnerDisplayName(ownerUid: string): Promise<string> {
  const db = getDb();
  const doc = await db.collection('users').doc(ownerUid).get();
  return pickOwnerDisplayName(doc.data());
}

/** GoogleSlot[] を CalendarHub の BookingMirrorSlot[] に変換 */
function toMirrorSlots(slots: GoogleSlot[]): BookingMirrorSlot[] {
  return slots.map((s) => {
    const startDate = new Date(s.startUnix * 1000);
    const endDate = new Date((s.startUnix + s.durationMinutes * 60) * 1000);
    return {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      durationMinutes: s.durationMinutes,
    };
  });
}

/** scheduleId が空の場合は sourceUrl から再解決して Firestore に保存し直す */
async function ensureScheduleId(link: BookingMirrorLink): Promise<string> {
  if (link.scheduleId) return link.scheduleId;
  const resolved = await resolveScheduleId(link.sourceUrl);
  const db = getDb();
  await db
    .collection('bookingMirrorLinks')
    .doc(link.id)
    .update({ scheduleId: resolved, updatedAt: FieldValue.serverTimestamp() });
  return resolved;
}

// --- ルート ---

publicBookingMirrorRoutes.get('/:linkId', async (c) => {
  const res = await getActiveLink(c.req.param('linkId'));
  if (!res.link) return c.json({ error: res.error }, res.statusCode as 400 | 404);
  const link = res.link;
  const ownerDisplayName = await getOwnerDisplayName(link.ownerUid);
  const info: PublicBookingMirrorLinkInfo = {
    id: link.id,
    title: link.title,
    description: link.description,
    ownerDisplayName,
    status: link.status,
  };
  return c.json({ link: info });
});

publicBookingMirrorRoutes.get('/:linkId/slots', async (c) => {
  const res = await getActiveLink(c.req.param('linkId'));
  if (!res.link) return c.json({ error: res.error }, res.statusCode as 400 | 404);
  const link = res.link;

  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + link.rangeDays);
  const startUnix = Math.floor(now.getTime() / 1000);
  const endUnix = Math.floor(endDate.getTime() / 1000);

  let scheduleId: string;
  try {
    scheduleId = await ensureScheduleId(link);
  } catch (err) {
    console.error(`[booking-mirror] resolveScheduleId failed for link ${link.id}:`, err);
    return c.json({ error: 'Failed to resolve schedule id', slots: [] }, 502);
  }

  // fetchAvailableSlots (Google gRPC, 最大8s) と getConfirmedBookingEventsForOwner
  // (Firestore) は互いに独立しているため並列実行する。
  // 後者は Calendar Hub 側で既に確定済みの予約 (mirror/非mirror問わず同一オーナー) を
  // 除外するために使う。Google 側はこの予約を認識しないため、ここで差し引かないと
  // 同じ枠がミラーページ上に空きとして表示され続け、次のゲストが予約しようとすると
  // 409 になる。
  const [slotsResult, bookedResult] = await Promise.allSettled([
    fetchAvailableSlots(scheduleId, startUnix, endUnix),
    getConfirmedBookingEventsForOwner(link.ownerUid, now, endDate),
  ]);

  if (slotsResult.status === 'rejected') {
    const err = slotsResult.reason;
    if (err instanceof BookingMirrorError) {
      console.error(
        `[booking-mirror] fetchAvailableSlots ${err.kind}/${err.subKind} for link ${link.id}: ${err.message}`,
      );
      if (err.kind === 'timeout') {
        return c.json({ error: 'Upstream timeout', slots: [] }, 504);
      }
      return c.json({ error: 'Upstream unavailable', slots: [] }, 502);
    }
    throw err;
  }

  if (bookedResult.status === 'rejected') {
    console.error(
      `[booking-mirror] getConfirmedBookingEventsForOwner failed for link ${link.id}:`,
      bookedResult.reason,
    );
    return c.json({ error: 'Failed to check existing bookings', slots: [] }, 502);
  }

  const availableSlots = excludeOverlappingSlots(slotsResult.value, bookedResult.value);
  const slots = toMirrorSlots(availableSlots);
  return c.json({ slots, title: link.title });
});

publicBookingMirrorRoutes.post('/:linkId/book', async (c) => {
  const linkId = c.req.param('linkId');
  const res = await getActiveLink(linkId);
  if (!res.link) return c.json({ error: res.error }, res.statusCode as 400 | 404);
  const link = res.link;

  let body: CreateBookingMirrorInput;
  try {
    body = (await c.req.json()) as CreateBookingMirrorInput;
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (
    typeof body.guestName !== 'string' ||
    body.guestName.trim().length === 0 ||
    body.guestName.length > 100
  ) {
    return c.json({ error: 'guestName is required (max 100 chars)' }, 400);
  }
  if (!body.slotStart || typeof body.slotStart !== 'string') {
    return c.json({ error: 'slotStart is required' }, 400);
  }
  if (!body.slotEnd || typeof body.slotEnd !== 'string') {
    return c.json({ error: 'slotEnd is required' }, 400);
  }
  const slotStart = new Date(body.slotStart);
  const slotEnd = new Date(body.slotEnd);
  if (isNaN(slotStart.getTime()) || isNaN(slotEnd.getTime())) {
    return c.json({ error: 'Invalid date format' }, 400);
  }
  if (slotEnd <= slotStart) {
    return c.json({ error: 'slotEnd must be after slotStart' }, 400);
  }
  if (slotStart < new Date()) {
    return c.json({ error: 'Cannot book a slot in the past' }, 400);
  }
  if (body.guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.guestEmail)) {
    return c.json({ error: 'Invalid email format' }, 400);
  }
  if (body.guestMessage && body.guestMessage.length > 1000) {
    return c.json({ error: 'Message too long (max 1000 chars)' }, 400);
  }

  // 予約直前に gRPC slots を再取得して、指定 slot が依然 available か検証 (Codex review High)
  let scheduleId: string;
  try {
    scheduleId = await ensureScheduleId(link);
  } catch {
    return c.json({ error: 'Failed to resolve schedule id' }, 502);
  }
  const startUnix = Math.floor(slotStart.getTime() / 1000);
  const endUnix = Math.floor(slotEnd.getTime() / 1000) + 60; // 終了直後まで取って境界に含める

  let fresh: GoogleSlot[];
  try {
    fresh = await fetchAvailableSlots(scheduleId, startUnix, endUnix);
  } catch (err) {
    if (err instanceof BookingMirrorError) {
      console.error(`[booking-mirror] book revalidate ${err.kind}/${err.subKind}: ${err.message}`);
      return c.json({ error: 'Upstream unavailable' }, 502);
    }
    throw err;
  }
  const matched = fresh.find(
    (s) =>
      s.startUnix === Math.floor(slotStart.getTime() / 1000) &&
      s.durationMinutes === (slotEnd.getTime() - slotStart.getTime()) / 60000,
  );
  if (!matched) {
    return c.json({ error: 'This time slot is no longer available' }, 409);
  }

  const db = getDb();
  const bookingId = nanoid(12);

  try {
    // slotStart に下限を付けず全期間をスキャンすると、予約件数の増加に比例して
    // 読み取り件数・レイテンシが線形に悪化する (Issue #197、非mirror版と同一パターン)。
    const overlapQueryLowerBound = new Date(slotStart.getTime() - OVERLAP_LOOKBACK_MS);
    const overlapQuery = db
      .collection('bookings')
      .where('ownerUid', '==', link.ownerUid)
      .where('status', '==', 'confirmed')
      .where('slotStart', '>=', overlapQueryLowerBound)
      .where('slotStart', '<', slotEnd);

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(overlapQuery);
      const hasOverlap = existing.docs.some((doc) => {
        const eEnd = doc.data().slotEnd.toDate();
        return eEnd > slotStart;
      });
      if (hasOverlap) throw new Error('SLOT_TAKEN');

      tx.set(db.collection('bookings').doc(bookingId), {
        id: bookingId,
        linkId,
        linkType: 'bookingMirrorLink',
        ownerUid: link.ownerUid,
        guestName: body.guestName,
        guestEmail: body.guestEmail ?? null,
        guestMessage: body.guestMessage ?? null,
        slotStart,
        slotEnd,
        status: 'confirmed',
        calendarEventId: null,
        notificationSentToOwner: false,
        notificationSentToGuest: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'SLOT_TAKEN') {
      return c.json({ error: 'This time slot is no longer available' }, 409);
    }
    throw err;
  }

  // block event 作成は booking doc の確定 (orphan event 防止) の後、レスポンス返却の前に
  // 同期実行する。Cloud Run が --no-cpu-throttling 無しの min-instances=0 で動いているため、
  // レスポンス返却後の非同期処理は完走が保証されない (計画書参照)。
  // getOwnerDisplayName (Firestore 読み取り) は block event 作成結果に依存しないため、
  // 並列実行して最大 25〜33 秒かかりうる block event フェーズにこれ以上レイテンシを積まない。
  const [blockEventResult, ownerDisplayName] = await Promise.all([
    shouldCreateBlockEvent(link)
      ? createAndRecordBlockEvent(link, bookingId, scheduleId, slotStart, slotEnd)
      : Promise.resolve(null as BlockEventResult | null),
    getOwnerDisplayName(link.ownerUid),
  ]);
  sendBookingNotificationsAsync(
    link,
    bookingId,
    body.guestName,
    body.guestEmail,
    body.guestMessage,
    slotStart,
    slotEnd,
    ownerDisplayName,
    blockEventResult,
  );

  return c.json(
    {
      booking: {
        id: bookingId,
        slotStart: slotStart.toISOString(),
        slotEnd: slotEnd.toISOString(),
        guestName: body.guestName,
        linkTitle: link.title,
        ownerDisplayName,
        blockEventStatus: blockEventResult?.status ?? 'skipped',
      },
    },
    201,
  );
});

/**
 * block event を作成し、結果を booking doc に記録する。
 * doc 更新の失敗 (createBlockEvent 自体は成功) は独立した try-catch で握り潰す
 * (error-handling.md: 状態復旧 > ログ記録 > 通知の優先順)。
 */
async function createAndRecordBlockEvent(
  link: BookingMirrorLink,
  bookingId: string,
  scheduleId: string,
  slotStart: Date,
  slotEnd: Date,
): Promise<BlockEventResult> {
  let result: BlockEventResult;
  try {
    const adapter = await createAdapter(link.ownerUid, link.blockAccountId!);
    result = await createBlockEvent({
      adapter,
      calendarId: link.blockCalendarId!,
      scheduleId,
      slotStart,
      slotEnd,
    });
  } catch (err) {
    result = { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }

  if (result.status === 'created_unverified') {
    console.error(
      `[BLOCK-UNVERIFIED] linkId=${link.id} bookingId=${bookingId} eventId=${result.eventId}`,
    );
  }

  try {
    await getDb()
      .collection('bookings')
      .doc(bookingId)
      .update({
        blockEventStatus: result.status,
        blockEventId: result.status === 'failed' ? null : result.eventId,
        blockCalendarId: link.blockCalendarId,
        blockAccountId: link.blockAccountId,
        ...(result.status === 'failed' ? { blockEventError: result.error } : {}),
      });
  } catch (err) {
    console.error(`Failed to record blockEventStatus for booking ${bookingId}:`, err);
  }

  return result;
}

// --- 非同期処理 ---

function sendBookingNotificationsAsync(
  link: BookingMirrorLink,
  bookingId: string,
  guestName: string,
  guestEmail: string | undefined,
  guestMessage: string | undefined,
  slotStart: Date,
  slotEnd: Date,
  ownerDisplayName: string,
  blockEventResult: BlockEventResult | null,
) {
  (async () => {
    const db = getDb();
    const accounts = await listConnectedAccounts(link.ownerUid);
    const googleAccount = accounts.find((a) => a.provider === 'google' && a.isActive);

    if (!googleAccount) {
      console.error(`No Google account for booking notification: ${bookingId}`);
      return;
    }

    let auth: { email: string; accessToken: string };
    if (process.env.E2E_MAIL_MOCK === '1') {
      assertE2EMockSafe('E2E_MAIL_MOCK');
      auth = { email: googleAccount.email, accessToken: 'e2e-mock-token' };
    } else {
      try {
        const refreshToken = await getRefreshToken(link.ownerUid, googleAccount.id);
        if (!refreshToken) {
          logMailFailure(
            { context: 'booking-mirror-auth', recipient: link.notificationEmail },
            new Error('no_refresh_token_stored'),
          );
          return;
        }
        const tokens = await refreshAccessToken(refreshToken);
        if (!tokens.access_token) {
          logMailFailure(
            { context: 'booking-mirror-auth', recipient: link.notificationEmail },
            new Error('empty_access_token'),
          );
          return;
        }
        auth = { email: googleAccount.email, accessToken: tokens.access_token };
      } catch (err) {
        logMailFailure({ context: 'booking-mirror-auth', recipient: link.notificationEmail }, err);
        return;
      }
    }

    // オーナー (= notificationEmail 宛) へ通知
    const blockEventWarning =
      blockEventResult?.status === 'created_unverified'
        ? 'Google カレンダーに「予定あり」を作成しましたが、予約スケジュール側の枠消失を確認できませんでした。書き込み先カレンダーの設定をご確認ください。'
        : blockEventResult?.status === 'failed'
          ? 'Google カレンダーへの「予定あり」自動登録に失敗しました。下のボタンから手動で登録してください。'
          : undefined;
    try {
      await sendEmail(auth, {
        to: link.notificationEmail,
        subject: `新しい予約: ${link.title} - ${guestName}`,
        html: buildBookingNotificationHtml({
          linkTitle: link.title,
          guestName,
          guestEmail,
          guestMessage,
          slotStart,
          slotEnd,
          blockEventWarning,
        }),
        context: 'owner-notification',
      });
      await db.collection('bookings').doc(bookingId).update({ notificationSentToOwner: true });
    } catch {
      // sendEmail 内で [MAIL-FAIL] 出力済
    }

    // ゲストへ確認メール
    if (guestEmail) {
      try {
        const durationMinutes = Math.round((slotEnd.getTime() - slotStart.getTime()) / 60000);
        await sendEmail(auth, {
          to: guestEmail,
          subject: `予約確認: ${link.title}`,
          html: buildBookingConfirmationHtml({
            linkTitle: link.title,
            ownerDisplayName,
            guestName,
            slotStart,
            slotEnd,
            durationMinutes,
          }),
          context: 'guest-confirmation',
        });
        await db.collection('bookings').doc(bookingId).update({ notificationSentToGuest: true });
      } catch {
        // sendEmail 内で [MAIL-FAIL] 出力済
      }
    }
  })();
}
