import { test, expect } from '@playwright/test';
import { API_BASE, clearAllCollections, seedStandardLinkAndOwner } from '../fixtures/seed';

/**
 * Issue #226: 営業時間中、今日の枠が現在時刻から始まり(例: 08:41)揃わず、
 * 先頭の枠は予約時点で過去になって 400 になっていた。
 *
 * これは API を実時刻で叩く煙テストで、修正の挙動(今日の最初の枠の切り上げ・予定直後の枠・
 * 翌日以降の不変・リードタイム・?date= 指定)の網羅は、時刻を固定した単体テスト
 * (packages/shared/src/__tests__/booking-slots.test.ts)が担う。
 *
 * 実行時刻と期待:
 *  - JST 9〜20 時(seed の営業 8〜23 時のなかで、リードや所要時間の余裕が十分ある時間帯):
 *    先頭の枠は必ず「今日」。翌日の枠しか返らなければ、今日の枠が消える退行として失敗させる。
 *  - それ以外の時刻: 先頭が今日になるかは境界(営業開始前・終了間際)で変わるため、検証せず注記だけ残す。
 *    (夜間は先頭が翌日 08:00 になり、修正がなくても通る。緑でも修正を検証していないことが分かるようにする)
 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const jstDate = (ms: number) => new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 10);
const jstHour = (ms: number) => new Date(ms + JST_OFFSET_MS).getUTCHours();

/** 先頭の枠が今日であることを、時刻に応じて検証する(日中は必須、それ以外は注記のみ) */
function expectTodayFirstSlotWhenOpen(firstSlotStart: string, requestedAt: number) {
  const firstIsToday = jstDate(new Date(firstSlotStart).getTime()) === jstDate(requestedAt);
  const hour = jstHour(requestedAt);
  if (hour >= 9 && hour <= 20) {
    expect(
      firstIsToday,
      `JST ${hour} 時台なので今日の枠が先頭のはずだが、先頭は ${firstSlotStart}(今日の枠が消える退行の疑い)`,
    ).toBe(true);
    return;
  }
  if (!firstIsToday) {
    test.info().annotations.push({
      type: 'note',
      description:
        '営業開始前・終了間際の時間帯のため、今日の枠の有無は検証していない(修正の挙動は単体テストが担保)',
    });
  }
}

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

    expectTodayFirstSlotWhenOpen(body.slots[0].start, requestedAt);

    const first = new Date(body.slots[0].start);
    // JST(+9h) は 30 分の倍数なので、UTC の分・秒・ミリ秒で判定できる
    expect([0, 30]).toContain(first.getUTCMinutes());
    expect(first.getUTCSeconds()).toBe(0);
    expect(first.getUTCMilliseconds()).toBe(0);
    expect(first.getTime()).toBeGreaterThanOrEqual(requestedAt + 30 * 60_000);
  });

  test('60 分枠のとき、表示された枠はすべて開始時刻が 30 分刻みに揃っている', async ({
    request,
  }) => {
    const { linkId } = await seedStandardLinkAndOwner('slot-alignment-all');

    // seed は所要時間 60 分・予定なし。後続の枠は所要時間の刻みで並ぶため、この「全枠が 30 分刻み」は
    // 60 分枠(と予定なし)の前提でのみ成り立つ。所要時間別の挙動は単体テストで見る。
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
    expectTodayFirstSlotWhenOpen(body.slots[0].start, Date.now());

    // 修正前は、営業時間中の先頭の枠が「リクエストの瞬間」で、予約時点で過去になり 400 だった
    const bookRes = await request.post(`${API_BASE}/api/public/booking/${linkId}/book`, {
      data: { slotStart: body.slots[0].start, guestName: '先頭の枠' },
    });
    expect(bookRes.status()).toBe(201);
  });
});
