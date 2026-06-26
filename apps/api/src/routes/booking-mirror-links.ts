import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { FieldValue } from 'firebase-admin/firestore';
import type { AppEnv } from '../types.js';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../lib/firebase-admin.js';
import type {
  BookingMirrorLink,
  BookingMirrorLinkStatus,
  CreateBookingMirrorLinkInput,
  UpdateBookingMirrorLinkInput,
} from '@calendar-hub/shared';
import { resolveScheduleId, BookingMirrorError } from '../lib/google-booking-mirror.js';

export const bookingMirrorLinkRoutes = new Hono<AppEnv>();

const MAX_RANGE_DAYS = 60;
const DEFAULT_RANGE_DAYS = 30;
const DEFAULT_NOTIFICATION_EMAIL =
  process.env.DEFAULT_NOTIFICATION_EMAIL ?? 'hy.unimail.11@gmail.com';

// --- ヘルパー ---

function fromFirestoreData(data: FirebaseFirestore.DocumentData): BookingMirrorLink {
  return {
    id: data.id,
    ownerUid: data.ownerUid,
    title: data.title,
    description: data.description ?? undefined,
    sourceUrl: data.sourceUrl,
    scheduleId: data.scheduleId,
    notificationEmail: data.notificationEmail,
    rangeDays: data.rangeDays,
    status: data.status,
    expiresAt: data.expiresAt?.toDate?.() ?? null,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
  };
}

function buildPatchUpdate(body: UpdateBookingMirrorLinkInput): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.description !== undefined) update.description = body.description ?? null;
  if (body.notificationEmail !== undefined) update.notificationEmail = body.notificationEmail;
  if (body.rangeDays !== undefined) update.rangeDays = body.rangeDays;
  if (body.status !== undefined) update.status = body.status;
  if (body.expiresAt !== undefined) {
    update.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  }
  return update;
}

function validateStatus(value: unknown): value is BookingMirrorLinkStatus {
  return value === 'active' || value === 'paused';
}

function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// --- ルート ---

// 一覧
bookingMirrorLinkRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const db = getDb();
  const snap = await db
    .collection('bookingMirrorLinks')
    .where('ownerUid', '==', user.uid)
    .orderBy('createdAt', 'desc')
    .get();
  const links = snap.docs.map((d) => fromFirestoreData(d.data()));
  return c.json({ links });
});

// 新規作成
bookingMirrorLinkRoutes.post('/', requireAuth, async (c) => {
  const user = c.get('user');
  let body: CreateBookingMirrorLinkInput;
  try {
    body = (await c.req.json()) as CreateBookingMirrorLinkInput;
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.sourceUrl || typeof body.sourceUrl !== 'string') {
    return c.json({ error: 'sourceUrl is required' }, 400);
  }
  if (body.notificationEmail !== undefined && !validateEmail(body.notificationEmail)) {
    return c.json({ error: 'Invalid notificationEmail format' }, 400);
  }
  const rangeDays = body.rangeDays ?? DEFAULT_RANGE_DAYS;
  if (!Number.isInteger(rangeDays) || rangeDays < 1 || rangeDays > MAX_RANGE_DAYS) {
    return c.json({ error: `rangeDays must be 1-${MAX_RANGE_DAYS}` }, 400);
  }

  // schedule ID を解決（失敗時は 400）
  let scheduleId: string;
  try {
    scheduleId = await resolveScheduleId(body.sourceUrl);
  } catch (err) {
    if (err instanceof BookingMirrorError) {
      return c.json(
        { error: `failed to resolve schedule id: ${err.subKind}`, detail: err.message },
        400,
      );
    }
    throw err;
  }

  const id = nanoid(12);
  const now = new Date();
  const link: BookingMirrorLink = {
    id,
    ownerUid: user.uid,
    title: body.title?.trim() || '【ミラー】予約スケジュール',
    description: body.description?.trim() || undefined,
    sourceUrl: body.sourceUrl.trim(),
    scheduleId,
    notificationEmail: body.notificationEmail?.trim() || DEFAULT_NOTIFICATION_EMAIL,
    rangeDays,
    status: 'active',
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    createdAt: now,
    updatedAt: now,
  };

  const db = getDb();
  await db
    .collection('bookingMirrorLinks')
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

// 取得
bookingMirrorLinkRoutes.get('/:linkId', requireAuth, async (c) => {
  const user = c.get('user');
  const linkId = c.req.param('linkId');
  const db = getDb();
  const doc = await db.collection('bookingMirrorLinks').doc(linkId).get();
  if (!doc.exists) {
    return c.json({ error: 'Not found' }, 404);
  }
  const data = doc.data()!;
  if (data.ownerUid !== user.uid) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return c.json({ link: fromFirestoreData(data) });
});

// 更新
bookingMirrorLinkRoutes.patch('/:linkId', requireAuth, async (c) => {
  const user = c.get('user');
  const linkId = c.req.param('linkId');

  let body: UpdateBookingMirrorLinkInput;
  try {
    body = (await c.req.json()) as UpdateBookingMirrorLinkInput;
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const db = getDb();
  const ref = db.collection('bookingMirrorLinks').doc(linkId);
  const doc = await ref.get();
  if (!doc.exists) {
    return c.json({ error: 'Not found' }, 404);
  }
  if (doc.data()!.ownerUid !== user.uid) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  if (body.status !== undefined && !validateStatus(body.status)) {
    return c.json({ error: 'status must be active or paused' }, 400);
  }
  if (body.notificationEmail !== undefined && !validateEmail(body.notificationEmail)) {
    return c.json({ error: 'Invalid notificationEmail format' }, 400);
  }
  if (
    body.rangeDays !== undefined &&
    (!Number.isInteger(body.rangeDays) || body.rangeDays < 1 || body.rangeDays > MAX_RANGE_DAYS)
  ) {
    return c.json({ error: `rangeDays must be 1-${MAX_RANGE_DAYS}` }, 400);
  }

  const update = buildPatchUpdate(body);
  update.updatedAt = FieldValue.serverTimestamp();
  await ref.update(update);

  const updated = await ref.get();
  return c.json({ link: fromFirestoreData(updated.data()!) });
});

// 削除
bookingMirrorLinkRoutes.delete('/:linkId', requireAuth, async (c) => {
  const user = c.get('user');
  const linkId = c.req.param('linkId');
  const db = getDb();
  const ref = db.collection('bookingMirrorLinks').doc(linkId);
  const doc = await ref.get();
  if (!doc.exists) {
    return c.json({ error: 'Not found' }, 404);
  }
  if (doc.data()!.ownerUid !== user.uid) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await ref.delete();
  return c.json({ success: true });
});
