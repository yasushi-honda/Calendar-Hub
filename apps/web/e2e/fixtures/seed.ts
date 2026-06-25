import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore, Timestamp } from 'firebase-admin/firestore';
import type { BookingLinkStatus, DurationOption } from '@calendar-hub/shared';

/** API server の base URL (Playwright config の PORT と一致させる) */
export const API_BASE = 'http://localhost:8088';

/**
 * E2E テスト用 Firestore Emulator アクセス helper。
 *
 * `FIRESTORE_EMULATOR_HOST` が設定されていることを前提とする (firebase emulators:exec 経由)。
 * projectId は demo- prefix を使うので Firebase Admin SDK は credential なしで動作する。
 */
function getEmulatorDb(): Firestore {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST not set');
  }
  if (getApps().length === 0) {
    initializeApp({ projectId: process.env.GCP_PROJECT_ID ?? 'demo-calendar-hub-e2e' });
  }
  return getFirestore();
}

export interface SeedOwnerInput {
  uid: string;
  displayName: string;
  email: string;
}

export interface SeedBookingLinkInput {
  id: string;
  ownerUid: string;
  title: string;
  description?: string;
  durationMinutes: DurationOption;
  accountIds: string[];
  freeTimeOptions: { dayStartHour: number; dayEndHour: number };
  availableDays: number[];
  rangeDays: number;
  bufferMinutes: number;
  status: BookingLinkStatus;
  autoCreateCalendarEvent: boolean;
  calendarIdsForAvailability: string[] | null;
  calendarIdForEvent: string | null;
  accountIdForEvent: string | null;
}

export async function seedOwner(input: SeedOwnerInput): Promise<void> {
  await getEmulatorDb().collection('users').doc(input.uid).set({
    uid: input.uid,
    displayName: input.displayName,
    email: input.email,
  });

  // 公開予約フローは accountIds をループするので、最低限ダミーの connectedAccount が必要。
  // listConnectedAccounts (booking 通知用) も使うので isActive=true, provider=google を入れる。
  for (const accountId of ['google_e2e_mock']) {
    await getEmulatorDb()
      .collection('users')
      .doc(input.uid)
      .collection('connectedAccounts')
      .doc(accountId)
      .set({
        id: accountId,
        provider: 'google',
        email: input.email,
        isActive: true,
        encryptedRefreshToken: 'e2e-mock-not-used',
      });
  }
}

export async function seedBookingLink(input: SeedBookingLinkInput): Promise<void> {
  await getEmulatorDb()
    .collection('bookingLinks')
    .doc(input.id)
    .set({
      ...input,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      expiresAt: null,
    });
}

export async function clearAllCollections(): Promise<void> {
  const db = getEmulatorDb();
  const collections = ['users', 'bookingLinks', 'bookings', '_e2eMail'];
  for (const name of collections) {
    const snap = await db.collection(name).get();
    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    if (snap.size > 0) await batch.commit();
  }
  // users/<uid>/connectedAccounts のサブコレクションは collection-group 削除が必要だが、
  // E2E では users 削除で参照されなくなるので残存しても問題ない。
}

export async function getBookings(ownerUid: string): Promise<Array<Record<string, unknown>>> {
  const snap = await getEmulatorDb().collection('bookings').where('ownerUid', '==', ownerUid).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getMailLog(): Promise<Array<Record<string, unknown>>> {
  const snap = await getEmulatorDb().collection('_e2eMail').orderBy('sentAt').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function setBookingStatus(
  bookingId: string,
  status: 'confirmed' | 'cancelled_by_owner' | 'cancelled_by_guest',
): Promise<void> {
  await getEmulatorDb().collection('bookings').doc(bookingId).update({ status });
}

/**
 * 標準的な E2E テスト用リンクを作成する shortcut.
 * - 60 分枠
 * - 8-23 時 / 全曜日 / 30 日先まで
 * - autoCreateCalendarEvent=true, calendarIdForEvent='primary'
 */
export interface StandardSeedResult {
  ownerUid: string;
  linkId: string;
  accountId: string;
}

export async function seedStandardLinkAndOwner(idSuffix: string): Promise<StandardSeedResult> {
  const ownerUid = `e2e-owner-${idSuffix}`;
  const linkId = `e2e-link-${idSuffix}`;
  const accountId = 'google_e2e_mock';

  await seedOwner({ uid: ownerUid, displayName: 'E2E Owner', email: 'e2e-owner@example.com' });
  await seedBookingLink({
    id: linkId,
    ownerUid,
    title: 'E2E Test Booking',
    description: 'Playwright fixture',
    durationMinutes: 60,
    accountIds: [accountId],
    freeTimeOptions: { dayStartHour: 8, dayEndHour: 23 },
    availableDays: [0, 1, 2, 3, 4, 5, 6],
    rangeDays: 30,
    bufferMinutes: 0,
    status: 'active',
    autoCreateCalendarEvent: true,
    calendarIdForEvent: 'primary',
    accountIdForEvent: accountId,
    calendarIdsForAvailability: null,
  });

  return { ownerUid, linkId, accountId };
}

/**
 * 翌日 14:00 JST (= UTC 05:00) の Date を返す。営業時間内 (8-23) で安定的に空いている枠。
 */
export function nextDay14JST(): Date {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(now.getUTCDate() + 1);
  tomorrow.setUTCHours(5, 0, 0, 0); // 14:00 JST
  return tomorrow;
}
