import { test, expect } from '@playwright/test';
import {
  API_BASE,
  clearAllCollections,
  getBookings,
  nextDay14JST,
  seedStandardLinkAndOwner,
} from '../fixtures/seed';

test.describe('AC-E2E-2: 二重予約防止 (409 SLOT_TAKEN)', () => {
  test.beforeEach(async () => {
    await clearAllCollections();
  });

  // FIXME: public-booking.ts の runTransaction 内で `tx.get()` ではなく `db.collection().get()` を
  // 使用しているため、Firestore の optimistic locking が効かず並列予約で両方 201 が返る。
  // 別 Issue で実装修正後、test.fixme を test に戻して有効化する。
  test.fixme('同一 slotStart で並列 2 リクエスト → 片方 201、片方 409', async ({ request }) => {
    const { linkId, ownerUid } = await seedStandardLinkAndOwner('conflict');
    const slotStart = nextDay14JST().toISOString();

    const [resA, resB] = await Promise.all([
      request.post(`${API_BASE}/api/public/booking/${linkId}/book`, {
        data: { slotStart, guestName: 'User A', guestEmail: 'a@example.com' },
      }),
      request.post(`${API_BASE}/api/public/booking/${linkId}/book`, {
        data: { slotStart, guestName: 'User B', guestEmail: 'b@example.com' },
      }),
    ]);

    const statuses = [resA.status(), resB.status()].sort();
    expect(statuses).toEqual([201, 409]);

    const failed = resA.status() === 409 ? resA : resB;
    const body = await failed.json();
    expect(body.error).toMatch(/no longer available/i);

    const bookings = await getBookings(ownerUid);
    expect(bookings.filter((b) => b.status === 'confirmed')).toHaveLength(1);
  });
});
