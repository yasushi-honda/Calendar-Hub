import { test, expect } from '@playwright/test';
import {
  API_BASE,
  clearAllCollections,
  getBookings,
  seedStandardLinkAndOwner,
} from '../fixtures/seed';

test.describe('AC-E2E-3: バリデーション (営業時間外/過去/欠損)', () => {
  test.beforeEach(async () => {
    await clearAllCollections();
  });

  test('営業時間外の slot を POST → 400', async ({ request }) => {
    const { linkId, ownerUid } = await seedStandardLinkAndOwner('outsidehours');

    // UTC 19:00 = JST 翌日 04:00、リンクの dayStartHour=8 より早い枠
    const target = new Date();
    target.setUTCDate(target.getUTCDate() + 1);
    target.setUTCHours(19, 0, 0, 0);

    const res = await request.post(`${API_BASE}/api/public/booking/${linkId}/book`, {
      data: {
        slotStart: target.toISOString(),
        guestName: 'Out of hours',
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/outside available hours/i);

    const bookings = await getBookings(ownerUid);
    expect(bookings).toHaveLength(0);
  });

  test('guestName 欠損 → 400', async ({ request }) => {
    const { linkId } = await seedStandardLinkAndOwner('missing-name');

    const target = new Date();
    target.setUTCDate(target.getUTCDate() + 1);
    target.setUTCHours(5, 0, 0, 0); // 14:00 JST

    const res = await request.post(`${API_BASE}/api/public/booking/${linkId}/book`, {
      data: { slotStart: target.toISOString() },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/guestName is required/i);
  });

  test('過去の slot → 400', async ({ request }) => {
    const { linkId } = await seedStandardLinkAndOwner('past');

    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 1); // 昨日

    const res = await request.post(`${API_BASE}/api/public/booking/${linkId}/book`, {
      data: { slotStart: past.toISOString(), guestName: 'Past' },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/past/i);
  });
});
