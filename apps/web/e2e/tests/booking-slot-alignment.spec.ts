import { test, expect } from '@playwright/test';
import { API_BASE, clearAllCollections, seedStandardLinkAndOwner } from '../fixtures/seed';

/**
 * Issue #226: 営業時間中、今日の枠が現在時刻から始まり(例: 08:41)揃わず、
 * 先頭の枠は予約時点で過去になって 400 になっていた。
 *
 * 実行時刻によって「今日の枠がある/無い」が変わるため、どの時刻でも成り立つ性質だけを検証する。
 *  - 先頭の枠の開始は、30 分刻みに揃っている
 *  - 先頭の枠の開始は、リクエスト時点から 30 分以上先
 * (営業時間中に実行すれば、修正前は必ず失敗する)
 */
test.describe('予約枠の揃え方(Issue #226)', () => {
  test.beforeEach(async () => {
    await clearAllCollections();
  });

  test('先頭の枠は 30 分刻みに揃い、現在から 30 分以上先にある', async ({ request }) => {
    const { linkId } = await seedStandardLinkAndOwner('slot-alignment');

    const requestedAt = Date.now();
    const res = await request.get(`${API_BASE}/api/public/booking/${linkId}/slots`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { slots: Array<{ start: string }> };
    expect(body.slots.length).toBeGreaterThan(0);

    const first = new Date(body.slots[0].start);
    // JST(+9h) は 30 分の倍数なので、UTC の分・秒・ミリ秒で判定できる
    expect([0, 30]).toContain(first.getUTCMinutes());
    expect(first.getUTCSeconds()).toBe(0);
    expect(first.getUTCMilliseconds()).toBe(0);
    expect(first.getTime()).toBeGreaterThanOrEqual(requestedAt + 30 * 60_000);
  });

  test('表示された枠はすべて開始時刻が 30 分刻みに揃っている', async ({ request }) => {
    const { linkId } = await seedStandardLinkAndOwner('slot-alignment-all');

    const res = await request.get(`${API_BASE}/api/public/booking/${linkId}/slots`);
    const body = (await res.json()) as { slots: Array<{ start: string }> };
    for (const s of body.slots) {
      expect([0, 30]).toContain(new Date(s.start).getUTCMinutes());
    }
  });

  test('表示された先頭の枠を、表示直後に予約しても 400 にならない', async ({ request }) => {
    const { linkId } = await seedStandardLinkAndOwner('slot-first-bookable');

    const res = await request.get(`${API_BASE}/api/public/booking/${linkId}/slots`);
    const body = (await res.json()) as { slots: Array<{ start: string }> };
    expect(body.slots.length).toBeGreaterThan(0);

    // 修正前は、営業時間中の先頭の枠が「リクエストの瞬間」で、予約時点で過去になり 400 だった
    const bookRes = await request.post(`${API_BASE}/api/public/booking/${linkId}/book`, {
      data: { slotStart: body.slots[0].start, guestName: '先頭の枠' },
    });
    expect(bookRes.status()).toBe(201);
  });
});
