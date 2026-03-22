import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../lib/firebase-admin.js';
import { createAdapter } from '../lib/adapter-factory.js';
import { listConnectedAccounts } from '../lib/token-store.js';
import { getRefreshToken } from '../lib/token-store.js';
import { refreshAccessToken } from '../lib/google-oauth.js';
import {
  sendEmail,
  buildBookingNotificationHtml,
  buildBookingConfirmationHtml,
} from '../lib/email.js';
import { calculateFreeSlots, splitFreeIntoBookingSlots } from '@calendar-hub/shared/free-time';
import type {
  CalendarEvent,
  BookingLink,
  PublicBookingLinkInfo,
  CreateBookingInput,
} from '@calendar-hub/shared';

export const publicBookingRoutes = new Hono();

// ヘルパー: BookingLink ドキュメント取得 + 検証
async function getActiveBookingLink(
  linkId: string,
): Promise<{ link: BookingLink; error: null } | { link: null; error: string }> {
  const db = getDb();
  const doc = await db.collection('bookingLinks').doc(linkId).get();

  if (!doc.exists) {
    return { link: null, error: 'Booking link not found' };
  }

  const data = doc.data()!;
  const link = {
    ...data,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    expiresAt: data.expiresAt?.toDate?.() ?? null,
  } as BookingLink;

  if (link.status !== 'active') {
    return { link: null, error: 'This booking link is currently paused' };
  }

  if (link.expiresAt && link.expiresAt < new Date()) {
    return { link: null, error: 'This booking link has expired' };
  }

  return { link, error: null };
}

// ヘルパー: オーナーの全イベント取得
async function fetchOwnerEvents(
  ownerUid: string,
  accountIds: string[],
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEvent[]> {
  const results = await Promise.allSettled(
    accountIds.map(async (accountId) => {
      const adapter = await createAdapter(ownerUid, accountId);
      const calendars = await adapter.listCalendars();
      const allEvents = await Promise.all(
        calendars.map((cal) => adapter.listEvents(cal.id, timeMin, timeMax)),
      );
      return allEvents.flat();
    }),
  );

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`Booking: calendar fetch failed for account ${accountIds[i]}:`, r.reason);
    }
  });

  return results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
}

// ヘルパー: オーナーの確定済み予約をダミーイベントとしてマージ
async function getConfirmedBookingEventsForOwner(
  ownerUid: string,
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEvent[]> {
  const db = getDb();
  const snap = await db
    .collection('bookings')
    .where('ownerUid', '==', ownerUid)
    .where('status', '==', 'confirmed')
    .where('slotStart', '>=', timeMin)
    .where('slotStart', '<=', timeMax)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      source: 'google' as const,
      originalId: doc.id,
      calendarId: 'booking',
      title: 'Reserved',
      start: data.slotStart.toDate(),
      end: data.slotEnd.toDate(),
      isAllDay: false,
      status: 'confirmed' as const,
    };
  });
}

// リンク情報取得（公開安全型）
publicBookingRoutes.get('/:linkId', async (c) => {
  const linkId = c.req.param('linkId');
  const res = await getActiveBookingLink(linkId);

  if (!res.link) {
    const status = res.error.includes('not found') ? 404 : 400;
    return c.json({ error: res.error }, status);
  }

  const link = res.link;

  // オーナーの表示名を取得
  const db = getDb();
  const userDoc = await db.collection('users').doc(link.ownerUid).get();
  const ownerDisplayName = userDoc.data()?.displayName ?? userDoc.data()?.email ?? 'User';

  const publicInfo: PublicBookingLinkInfo = {
    id: link.id,
    title: link.title,
    description: link.description,
    durationMinutes: link.durationMinutes,
    ownerDisplayName,
    availableDays: link.availableDays,
    rangeDays: link.rangeDays,
    status: link.status,
  };

  return c.json({ link: publicInfo });
});

// 空きスロット取得
publicBookingRoutes.get('/:linkId/slots', async (c) => {
  const linkId = c.req.param('linkId');
  const res = await getActiveBookingLink(linkId);

  if (!res.link) {
    const status = res.error.includes('not found') ? 404 : 400;
    return c.json({ error: res.error }, status);
  }

  const link = res.link;
  const dateParam = c.req.query('date');

  // 日付範囲を決定
  const now = new Date();
  let rangeStart: Date;
  let rangeEnd: Date;

  if (dateParam) {
    // 特定日のみ
    rangeStart = new Date(dateParam);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
  } else {
    // 今日から rangeDays 日分
    rangeStart = new Date(now);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + link.rangeDays);
  }

  // 過去のスロットは除外するため、rangeStartを現在時刻に調整
  if (rangeStart < now) {
    rangeStart = now;
  }

  // オーナーのカレンダーイベント取得
  const [calendarEvents, bookingEvents] = await Promise.all([
    fetchOwnerEvents(link.ownerUid, link.accountIds, rangeStart, rangeEnd),
    getConfirmedBookingEventsForOwner(link.ownerUid, rangeStart, rangeEnd),
  ]);

  const allEvents = [...calendarEvents, ...bookingEvents];

  // 空きスロット計算
  const freeSlots = calculateFreeSlots(allEvents, rangeStart, rangeEnd, {
    dayStartHour: link.freeTimeOptions.dayStartHour,
    dayEndHour: link.freeTimeOptions.dayEndHour,
    minSlotMinutes: link.durationMinutes,
  });

  // availableDays でフィルタリング
  const filteredSlots = freeSlots.filter((slot) =>
    link.availableDays.includes(slot.start.getDay()),
  );

  // duration 単位で分割
  const slots = splitFreeIntoBookingSlots(filteredSlots, link.durationMinutes, link.bufferMinutes);

  return c.json({
    slots,
    durationMinutes: link.durationMinutes,
    title: link.title,
  });
});

// 予約作成
publicBookingRoutes.post('/:linkId/book', async (c) => {
  const linkId = c.req.param('linkId');
  const res = await getActiveBookingLink(linkId);

  if (!res.link) {
    const status = res.error.includes('not found') ? 404 : 400;
    return c.json({ error: res.error }, status);
  }

  const link = res.link;

  let body: CreateBookingInput;
  try {
    body = (await c.req.json()) as CreateBookingInput;
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // 入力バリデーション
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

  const slotStart = new Date(body.slotStart);
  if (isNaN(slotStart.getTime())) {
    return c.json({ error: 'Invalid slotStart date' }, 400);
  }

  if (body.guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.guestEmail)) {
    return c.json({ error: 'Invalid email format' }, 400);
  }

  if (body.guestMessage && body.guestMessage.length > 1000) {
    return c.json({ error: 'Message too long (max 1000 chars)' }, 400);
  }

  const slotEnd = new Date(slotStart.getTime() + link.durationMinutes * 60000);

  // 過去のスロットを拒否
  if (slotStart < new Date()) {
    return c.json({ error: 'Cannot book a slot in the past' }, 400);
  }

  // 営業時間・曜日チェック
  const slotHour = slotStart.getHours();
  const slotDay = slotStart.getDay();
  if (
    slotHour < link.freeTimeOptions.dayStartHour ||
    slotHour >= link.freeTimeOptions.dayEndHour ||
    !link.availableDays.includes(slotDay)
  ) {
    return c.json({ error: 'Slot is outside available hours/days' }, 400);
  }

  // 二重予約チェック（Firestoreトランザクション — 範囲重複で検証）
  const db = getDb();
  const bookingId = nanoid(12);

  try {
    await db.runTransaction(async (tx) => {
      // 範囲重複: slotStart < 既存slotEnd && slotEnd > 既存slotStart
      const existingBookings = await db
        .collection('bookings')
        .where('ownerUid', '==', link.ownerUid)
        .where('status', '==', 'confirmed')
        .where('slotStart', '<', slotEnd)
        .get();

      const hasOverlap = existingBookings.docs.some((doc) => {
        const existing = doc.data();
        const existingEnd = existing.slotEnd.toDate();
        return existingEnd > slotStart;
      });

      if (hasOverlap) {
        throw new Error('SLOT_TAKEN');
      }

      // 予約書き込み
      const bookingRef = db.collection('bookings').doc(bookingId);
      tx.set(bookingRef, {
        id: bookingId,
        linkId,
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

  // カレンダーにイベント作成（非同期、失敗してもbookingは確定）
  createCalendarEventAsync(link, bookingId, body.guestName, body.guestMessage, slotStart, slotEnd);

  // メール通知（非同期）
  sendBookingNotificationsAsync(
    link,
    bookingId,
    body.guestName,
    body.guestEmail,
    body.guestMessage,
    slotStart,
    slotEnd,
  );

  // オーナーの表示名を取得
  const userDoc = await db.collection('users').doc(link.ownerUid).get();
  const ownerDisplayName = userDoc.data()?.displayName ?? userDoc.data()?.email ?? 'User';

  return c.json(
    {
      booking: {
        id: bookingId,
        slotStart: slotStart.toISOString(),
        slotEnd: slotEnd.toISOString(),
        guestName: body.guestName,
        linkTitle: link.title,
        ownerDisplayName,
      },
    },
    201,
  );
});

// 非同期: カレンダーイベント作成
function createCalendarEventAsync(
  link: BookingLink,
  bookingId: string,
  guestName: string,
  guestMessage: string | undefined,
  slotStart: Date,
  slotEnd: Date,
) {
  (async () => {
    try {
      const adapter = await createAdapter(link.ownerUid, link.accountIdForEvent);
      const event = await adapter.createEvent(link.calendarIdForEvent, {
        title: `${link.title} - ${guestName}`,
        description: guestMessage ?? `予約者: ${guestName}`,
        start: slotStart,
        end: slotEnd,
        isAllDay: false,
      });

      // calendarEventId を保存
      const db = getDb();
      await db.collection('bookings').doc(bookingId).update({ calendarEventId: event.id });
    } catch (err) {
      console.error(`Failed to create calendar event for booking ${bookingId}:`, err);
    }
  })();
}

// 非同期: メール通知
function sendBookingNotificationsAsync(
  link: BookingLink,
  bookingId: string,
  guestName: string,
  guestEmail: string | undefined,
  guestMessage: string | undefined,
  slotStart: Date,
  slotEnd: Date,
) {
  (async () => {
    const db = getDb();

    // オーナーのGoogleアカウントを探す
    const accounts = await listConnectedAccounts(link.ownerUid);
    const googleAccount = accounts.find((a) => a.provider === 'google' && a.isActive);

    if (!googleAccount) {
      console.error(`No Google account for booking notification: ${bookingId}`);
      return;
    }

    try {
      const refreshToken = await getRefreshToken(link.ownerUid, googleAccount.id);
      if (!refreshToken) return;

      const tokens = await refreshAccessToken(refreshToken);
      if (!tokens.access_token) return;

      const auth = {
        email: googleAccount.email,
        accessToken: tokens.access_token,
      };

      // オーナーへ通知
      try {
        await sendEmail(auth, {
          to: googleAccount.email,
          subject: `新しい予約: ${link.title} - ${guestName}`,
          html: buildBookingNotificationHtml({
            linkTitle: link.title,
            guestName,
            guestEmail,
            guestMessage,
            slotStart,
            slotEnd,
          }),
        });

        await db.collection('bookings').doc(bookingId).update({ notificationSentToOwner: true });
      } catch (err) {
        console.error(`Failed to send owner notification: ${bookingId}`, err);
      }

      // ゲストへ確認メール
      if (guestEmail) {
        try {
          const userDoc = await db.collection('users').doc(link.ownerUid).get();
          const ownerName = userDoc.data()?.displayName ?? googleAccount.email;

          await sendEmail(auth, {
            to: guestEmail,
            subject: `予約確認: ${link.title}`,
            html: buildBookingConfirmationHtml({
              linkTitle: link.title,
              ownerDisplayName: ownerName,
              guestName,
              slotStart,
              slotEnd,
              durationMinutes: link.durationMinutes,
            }),
          });

          await db.collection('bookings').doc(bookingId).update({ notificationSentToGuest: true });
        } catch (err) {
          console.error(`Failed to send guest confirmation: ${bookingId}`, err);
        }
      }
    } catch (err) {
      console.error(`Failed to send booking notifications: ${bookingId}`, err);
    }
  })();
}
