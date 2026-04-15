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
import { logMailFailure } from '../lib/mail-fail.js';
import { calculateFreeSlots, splitFreeIntoBookingSlots } from '@calendar-hub/shared/free-time';
import type {
  CalendarEvent,
  BookingLink,
  PublicBookingLinkInfo,
  CreateBookingInput,
} from '@calendar-hub/shared';

export const publicBookingRoutes = new Hono();

// --- ヘルパー ---

type LinkResult =
  | { link: BookingLink; error: null; statusCode: null }
  | { link: null; error: string; statusCode: 400 | 404 };

async function getActiveBookingLink(linkId: string): Promise<LinkResult> {
  const db = getDb();
  const doc = await db.collection('bookingLinks').doc(linkId).get();

  if (!doc.exists) {
    return { link: null, error: 'Booking link not found', statusCode: 404 };
  }

  const data = doc.data()!;
  const link = toBookingLink(data);

  if (link.status !== 'active') {
    return { link: null, error: 'This booking link is currently paused', statusCode: 400 };
  }

  if (link.expiresAt && link.expiresAt < new Date()) {
    return { link: null, error: 'This booking link has expired', statusCode: 400 };
  }

  return { link, error: null, statusCode: null };
}

function toBookingLink(data: FirebaseFirestore.DocumentData): BookingLink {
  return {
    ...data,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    expiresAt: data.expiresAt?.toDate?.() ?? null,
  } as BookingLink;
}

async function getOwnerDisplayName(ownerUid: string): Promise<string> {
  const db = getDb();
  const doc = await db.collection('users').doc(ownerUid).get();
  const data = doc.data();
  return data?.displayName ?? data?.email ?? 'User';
}

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

// 既存予約をダミーイベントとしてマージ（全オーナー予約を考慮し二重予約を防止）
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
      source: 'google' as const, // CalendarEvent型に合わせるためのダミー値
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

// --- ルート ---

publicBookingRoutes.get('/:linkId', async (c) => {
  const res = await getActiveBookingLink(c.req.param('linkId'));
  if (!res.link) return c.json({ error: res.error }, res.statusCode);

  const link = res.link;
  const ownerDisplayName = await getOwnerDisplayName(link.ownerUid);

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

publicBookingRoutes.get('/:linkId/slots', async (c) => {
  const res = await getActiveBookingLink(c.req.param('linkId'));
  if (!res.link) return c.json({ error: res.error }, res.statusCode);

  const link = res.link;
  const dateParam = c.req.query('date');
  const now = new Date();
  let rangeStart: Date;
  let rangeEnd: Date;

  if (dateParam) {
    rangeStart = new Date(dateParam);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
  } else {
    rangeStart = new Date(now);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + link.rangeDays);
  }

  if (rangeStart < now) rangeStart = now;

  const [calendarEvents, bookingEvents] = await Promise.all([
    fetchOwnerEvents(link.ownerUid, link.accountIds, rangeStart, rangeEnd),
    getConfirmedBookingEventsForOwner(link.ownerUid, rangeStart, rangeEnd),
  ]);

  // サーバーはUTCで動作するため、JST (UTC+9) オフセットを指定
  const JST_OFFSET = 540;

  const freeSlots = calculateFreeSlots(
    [...calendarEvents, ...bookingEvents],
    rangeStart,
    rangeEnd,
    {
      dayStartHour: link.freeTimeOptions.dayStartHour,
      dayEndHour: link.freeTimeOptions.dayEndHour,
      minSlotMinutes: link.durationMinutes,
      timezoneOffsetMinutes: JST_OFFSET,
    },
  );

  // availableDaysはJSTの曜日で判定する必要がある
  const filteredSlots = freeSlots.filter((slot) => {
    const jstDay = new Date(slot.start.getTime() + JST_OFFSET * 60000).getUTCDay();
    return link.availableDays.includes(jstDay);
  });

  const slots = splitFreeIntoBookingSlots(filteredSlots, link.durationMinutes, link.bufferMinutes);

  return c.json({ slots, durationMinutes: link.durationMinutes, title: link.title });
});

publicBookingRoutes.post('/:linkId/book', async (c) => {
  const linkId = c.req.param('linkId');
  const res = await getActiveBookingLink(linkId);
  if (!res.link) return c.json({ error: res.error }, res.statusCode);

  const link = res.link;

  let body: CreateBookingInput;
  try {
    body = (await c.req.json()) as CreateBookingInput;
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

  if (slotStart < new Date()) {
    return c.json({ error: 'Cannot book a slot in the past' }, 400);
  }

  // JST基準で営業時間・曜日チェック
  const JST_OFFSET_BOOK = 540;
  const slotInJst = new Date(slotStart.getTime() + JST_OFFSET_BOOK * 60000);
  const slotHour = slotInJst.getUTCHours();
  const slotDay = slotInJst.getUTCDay();
  if (
    slotHour < link.freeTimeOptions.dayStartHour ||
    slotHour >= link.freeTimeOptions.dayEndHour ||
    !link.availableDays.includes(slotDay)
  ) {
    return c.json({ error: 'Slot is outside available hours/days' }, 400);
  }

  const db = getDb();
  const bookingId = nanoid(12);

  try {
    await db.runTransaction(async (tx) => {
      const existingBookings = await db
        .collection('bookings')
        .where('ownerUid', '==', link.ownerUid)
        .where('status', '==', 'confirmed')
        .where('slotStart', '<', slotEnd)
        .get();

      const hasOverlap = existingBookings.docs.some((doc) => {
        const existingEnd = doc.data().slotEnd.toDate();
        return existingEnd > slotStart;
      });

      if (hasOverlap) throw new Error('SLOT_TAKEN');

      tx.set(db.collection('bookings').doc(bookingId), {
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

  const ownerDisplayName = await getOwnerDisplayName(link.ownerUid);

  // 非同期処理（失敗してもbookingは確定済み）
  createCalendarEventAsync(link, bookingId, body.guestName, body.guestMessage, slotStart, slotEnd);
  sendBookingNotificationsAsync(
    link,
    bookingId,
    body.guestName,
    body.guestEmail,
    body.guestMessage,
    slotStart,
    slotEnd,
    ownerDisplayName,
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
      },
    },
    201,
  );
});

// --- 非同期処理 ---

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
      const db = getDb();
      await db.collection('bookings').doc(bookingId).update({ calendarEventId: event.id });
    } catch (err) {
      console.error(`Failed to create calendar event for booking ${bookingId}:`, err);
    }
  })();
}

function sendBookingNotificationsAsync(
  link: BookingLink,
  bookingId: string,
  guestName: string,
  guestEmail: string | undefined,
  guestMessage: string | undefined,
  slotStart: Date,
  slotEnd: Date,
  ownerDisplayName: string,
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
    try {
      const refreshToken = await getRefreshToken(link.ownerUid, googleAccount.id);
      if (!refreshToken) {
        // refresh_token が Firestore に残っていないケース。再ログインが必要。
        logMailFailure(
          { context: 'booking-auth', recipient: googleAccount.email },
          new Error('no_refresh_token_stored'),
        );
        return;
      }
      const tokens = await refreshAccessToken(refreshToken);
      if (!tokens.access_token) {
        logMailFailure(
          { context: 'booking-auth', recipient: googleAccount.email },
          new Error('empty_access_token'),
        );
        return;
      }
      auth = { email: googleAccount.email, accessToken: tokens.access_token };
    } catch (err) {
      logMailFailure({ context: 'booking-auth', recipient: googleAccount.email }, err);
      return;
    }

    // オーナーへ通知（独立try-catch: error-handling.mdルール遵守）
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
        context: 'owner-notification',
      });
      await db.collection('bookings').doc(bookingId).update({ notificationSentToOwner: true });
    } catch {
      // sendEmail が context 指定済のため内部で [MAIL-FAIL] 出力済。ここではスタックを握り潰さず無視。
    }

    // ゲストへ確認メール（独立try-catch）
    if (guestEmail) {
      try {
        await sendEmail(auth, {
          to: guestEmail,
          subject: `予約確認: ${link.title}`,
          html: buildBookingConfirmationHtml({
            linkTitle: link.title,
            ownerDisplayName,
            guestName,
            slotStart,
            slotEnd,
            durationMinutes: link.durationMinutes,
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
