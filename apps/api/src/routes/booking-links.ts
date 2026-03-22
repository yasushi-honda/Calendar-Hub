import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { FieldValue } from 'firebase-admin/firestore';
import type { AppEnv } from '../types.js';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../lib/firebase-admin.js';
import type { BookingLink, CreateBookingLinkInput } from '@calendar-hub/shared';

const VALID_DURATIONS = [15, 30, 45, 60, 90, 120];

export const bookingLinkRoutes = new Hono<AppEnv>();

// リンク作成
bookingLinkRoutes.post('/', requireAuth, async (c) => {
  const user = c.get('user');
  const body = (await c.req.json()) as CreateBookingLinkInput;

  if (!body.title || !body.durationMinutes || !body.accountIds?.length) {
    return c.json({ error: 'title, durationMinutes, accountIds are required' }, 400);
  }

  if (!VALID_DURATIONS.includes(body.durationMinutes)) {
    return c.json({ error: `durationMinutes must be one of: ${VALID_DURATIONS.join(', ')}` }, 400);
  }

  if (!body.calendarIdForEvent || !body.accountIdForEvent) {
    return c.json({ error: 'calendarIdForEvent and accountIdForEvent are required' }, 400);
  }

  const id = nanoid(12);
  const now = new Date();

  const link: BookingLink = {
    id,
    ownerUid: user.uid,
    title: body.title,
    description: body.description ?? undefined,
    durationMinutes: body.durationMinutes,
    accountIds: body.accountIds,
    calendarIdForEvent: body.calendarIdForEvent,
    accountIdForEvent: body.accountIdForEvent,
    freeTimeOptions: {
      dayStartHour: body.freeTimeOptions?.dayStartHour ?? 9,
      dayEndHour: body.freeTimeOptions?.dayEndHour ?? 18,
    },
    availableDays: body.availableDays ?? [1, 2, 3, 4, 5], // 月-金
    rangeDays: body.rangeDays ?? 14,
    bufferMinutes: body.bufferMinutes ?? 0,
    status: 'active',
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    createdAt: now,
    updatedAt: now,
  };

  const db = getDb();
  await db
    .collection('bookingLinks')
    .doc(id)
    .set({
      ...link,
      description: link.description ?? null,
      expiresAt: link.expiresAt ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  return c.json({ link }, 201);
});

// 自分のリンク一覧
bookingLinkRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const db = getDb();

  const snap = await db
    .collection('bookingLinks')
    .where('ownerUid', '==', user.uid)
    .orderBy('createdAt', 'desc')
    .get();

  const links = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
      expiresAt: data.expiresAt?.toDate?.() ?? null,
    } as BookingLink;
  });

  return c.json({ links });
});

// リンク更新
bookingLinkRoutes.patch('/:linkId', requireAuth, async (c) => {
  const user = c.get('user');
  const linkId = c.req.param('linkId');
  const body = await c.req.json();

  const db = getDb();
  const ref = db.collection('bookingLinks').doc(linkId);
  const doc = await ref.get();

  if (!doc.exists || doc.data()?.ownerUid !== user.uid) {
    return c.json({ error: 'Not found' }, 404);
  }

  // バリデーション
  if (body.status !== undefined && !['active', 'paused'].includes(body.status)) {
    return c.json({ error: 'status must be "active" or "paused"' }, 400);
  }
  if (body.availableDays !== undefined) {
    if (
      !Array.isArray(body.availableDays) ||
      body.availableDays.some((d: unknown) => typeof d !== 'number' || d < 0 || d > 6)
    ) {
      return c.json({ error: 'availableDays must be array of 0-6' }, 400);
    }
  }
  if (body.rangeDays !== undefined && (body.rangeDays < 1 || body.rangeDays > 90)) {
    return c.json({ error: 'rangeDays must be 1-90' }, 400);
  }
  if (body.freeTimeOptions !== undefined) {
    const { dayStartHour, dayEndHour } = body.freeTimeOptions;
    if (dayStartHour >= dayEndHour) {
      return c.json({ error: 'dayStartHour must be less than dayEndHour' }, 400);
    }
  }

  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (body.title !== undefined) update.title = body.title;
  if (body.description !== undefined) update.description = body.description ?? null;
  if (body.status !== undefined) update.status = body.status;
  if (body.availableDays !== undefined) update.availableDays = body.availableDays;
  if (body.rangeDays !== undefined) update.rangeDays = body.rangeDays;
  if (body.bufferMinutes !== undefined) update.bufferMinutes = body.bufferMinutes;
  if (body.freeTimeOptions !== undefined) update.freeTimeOptions = body.freeTimeOptions;
  if (body.expiresAt !== undefined)
    update.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

  await ref.update(update);

  const updated = await ref.get();
  const data = updated.data()!;
  return c.json({
    link: {
      ...data,
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
      expiresAt: data.expiresAt?.toDate?.() ?? null,
    } as BookingLink,
  });
});

// リンク削除
bookingLinkRoutes.delete('/:linkId', requireAuth, async (c) => {
  const user = c.get('user');
  const linkId = c.req.param('linkId');
  const db = getDb();
  const ref = db.collection('bookingLinks').doc(linkId);
  const doc = await ref.get();

  if (!doc.exists || doc.data()?.ownerUid !== user.uid) {
    return c.json({ error: 'Not found' }, 404);
  }

  await ref.delete();
  return c.json({ success: true });
});

// 予約一覧
bookingLinkRoutes.get('/bookings', requireAuth, async (c) => {
  const user = c.get('user');
  const status = c.req.query('status');
  const db = getDb();

  let query = db
    .collection('bookings')
    .where('ownerUid', '==', user.uid)
    .orderBy('slotStart', 'desc')
    .limit(50);

  if (status) {
    query = db
      .collection('bookings')
      .where('ownerUid', '==', user.uid)
      .where('status', '==', status)
      .orderBy('slotStart', 'desc')
      .limit(50);
  }

  const snap = await query.get();
  const bookings = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      slotStart: data.slotStart?.toDate?.() ?? new Date(),
      slotEnd: data.slotEnd?.toDate?.() ?? new Date(),
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
    };
  });

  return c.json({ bookings });
});

// 予約キャンセル（オーナー）
bookingLinkRoutes.patch('/bookings/:bookingId/cancel', requireAuth, async (c) => {
  const user = c.get('user');
  const bookingId = c.req.param('bookingId');
  const db = getDb();

  const ref = db.collection('bookings').doc(bookingId);
  const doc = await ref.get();

  if (!doc.exists || doc.data()?.ownerUid !== user.uid) {
    return c.json({ error: 'Not found' }, 404);
  }

  if (doc.data()?.status !== 'confirmed') {
    return c.json({ error: 'Booking is not confirmed' }, 400);
  }

  await ref.update({
    status: 'cancelled_by_owner',
    updatedAt: FieldValue.serverTimestamp(),
  });

  return c.json({ success: true });
});
