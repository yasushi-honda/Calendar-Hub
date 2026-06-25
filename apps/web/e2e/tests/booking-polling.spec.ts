import { test, expect } from '@playwright/test';
import {
  API_BASE,
  clearAllCollections,
  getBookings,
  setBookingStatus,
  seedStandardLinkAndOwner,
} from '../fixtures/seed';

const isCI = !!process.env.CI;

test.describe('AC-E2E-4 / AC-E2E-5: ポーリング + キャンセル後の枠復活', () => {
  test.beforeEach(async ({ page }) => {
    await clearAllCollections();
    // Issue #145 診断: CI ではブラウザ console/network エラーをログ出力
    if (isCI) {
      page.on('console', (msg) => {
        console.log(`[browser console] [${msg.type()}] ${msg.text()}`);
      });
      page.on('pageerror', (err) => {
        console.log(`[browser pageerror] ${err.message}`);
      });
      page.on('requestfailed', (req) => {
        console.log(
          `[browser requestfailed] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`,
        );
      });
      page.on('response', (res) => {
        if (res.url().includes('/api/')) {
          console.log(`[browser response] ${res.status()} ${res.url()}`);
        }
      });
    }
  });

  test('60s ごとに /slots 再取得、フォーム遷移で停止', async ({ page }) => {
    test.setTimeout(180_000); // ポーリング検証のため 3 分

    const { linkId } = await seedStandardLinkAndOwner('polling');

    let slotsRequests = 0;
    await page.route('**/api/public/booking/*/slots', async (route) => {
      slotsRequests++;
      await route.continue();
    });

    await page.goto(`/book/${linkId}`);
    // 初回 /slots が確実に到達するまで network idle を待つ (CI で Next.js dev compile が遅い)
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await expect(page.getByText('読み込み中...')).toBeHidden({ timeout: 30_000 });

    // 初回 fetch を route handler 側のカウンタで確実に待つ (CI race 回避)
    await expect.poll(() => slotsRequests, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
    const initialCount = slotsRequests;

    // 65s 待ってポーリングが 1 回以上発火
    await expect.poll(() => slotsRequests, { timeout: 75_000 }).toBeGreaterThan(initialCount);
    const afterPollCount = slotsRequests;

    // フォーム遷移
    await page.locator('.date-card').first().click();
    await page.locator('.slot-btn').first().click();
    await expect(page.locator('.submit-btn')).toBeVisible();

    // 65s 待ってフォーム中はポーリング発火しない
    await page.waitForTimeout(65_000);
    expect(slotsRequests).toBe(afterPollCount);
  });

  test('キャンセル後に /slots を再取得すると枠が復活する', async ({ page, request }) => {
    const { linkId, ownerUid } = await seedStandardLinkAndOwner('cancel-restore');

    // 翌日 14:00 JST に予約を作る
    const slotStart = new Date();
    slotStart.setUTCDate(slotStart.getUTCDate() + 1);
    slotStart.setUTCHours(5, 0, 0, 0);

    const bookRes = await request.post(`${API_BASE}/api/public/booking/${linkId}/book`, {
      data: { slotStart: slotStart.toISOString(), guestName: 'To be cancelled' },
    });
    expect(bookRes.status()).toBe(201);

    // /slots を取得して 14:00 が含まれないことを確認
    const slotsBefore = await request.get(`${API_BASE}/api/public/booking/${linkId}/slots`);
    const slotsBeforeBody = await slotsBefore.json();
    const startsBefore = (slotsBeforeBody.slots as Array<{ start: string }>).map((s) => s.start);
    expect(startsBefore).not.toContain(slotStart.toISOString());

    // 予約管理 UI 未実装のため Firestore を直接書き換え (cancelled_by_owner)
    const bookings = await getBookings(ownerUid);
    const target = bookings.find((b) => b.status === 'confirmed');
    expect(target).toBeDefined();
    await setBookingStatus(target!.id as string, 'cancelled_by_owner');

    // /slots を再取得すると 14:00 枠が復活
    const slotsAfter = await request.get(`${API_BASE}/api/public/booking/${linkId}/slots`);
    const slotsAfterBody = await slotsAfter.json();
    const startsAfter = (slotsAfterBody.slots as Array<{ start: string }>).map((s) => s.start);
    expect(startsAfter).toContain(slotStart.toISOString());

    void page;
  });
});
