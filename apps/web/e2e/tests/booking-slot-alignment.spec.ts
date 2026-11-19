import { test, expect } from '@playwright/test';
import { API_BASE, clearAllCollections, seedStandardLinkAndOwner } from '../fixtures/seed';

/**
 * Issue #226: 営業時間中、今日の枠が現在時刻から始まり(例: 08:41)揃わず、
 * 先頭の枠は予約時点で過去になって 400 になっていた。
 *
 * これは API を実時刻で叩く煙テストで、修正の挙動(今日の最初の枠の切り上げ・予定直後の枠・
 * 翌日以降の不変・リードタイム)の網羅は、時刻を固定した単体テスト
 * (packages/shared/src/__tests__/booking-slots.test.ts)が担う。
 *
 * 注意: 「今日の枠」が出るのは、営業時間(seed は JST 8〜23 時)から 30 分のリードを除いた
 * およそ JST 7:30〜22:30 の間だけ。それ以外の時刻は先頭が翌日 08:00 になり、修正がなくても通る。
 * その場合は注記を残し、緑でも修正を検証していないことが分かるようにする。
 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const jstDate = (ms: number) => new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 10);

function noteIfTodayNotExercised(firstSlotStart: string, requestedAt: number) {
  if (jstDate(new Date(firstSlotStart).getTime()) !== jstDate(requestedAt)) {
    test.info().annotations.push({
      type: 'note',
      description:
        '今日の枠が無い時間帯(JST 7:30 前 / 22:30 以降)のため、先頭の枠は翌日 08:00。修正の挙動は検証していない(単体テストが担保)',
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

    noteIfTodayNotExercised(body.slots[0].start, requestedAt);

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
    noteIfTodayNotExercised(body.slots[0].start, Date.now());

    // 修正前は、営業時間中の先頭の枠が「リクエストの瞬間」で、予約時点で過去になり 400 だった
    const bookRes = await request.post(`${API_BASE}/api/public/booking/${linkId}/book`, {
      data: { slotStart: body.slots[0].start, guestName: '先頭の枠' },
    });
    expect(bookRes.status()).toBe(201);
  });
});
