import { test, expect } from '@playwright/test';
import {
  clearAllCollections,
  getBookings,
  getMailLog,
  nextDay14JST,
  seedStandardLinkAndOwner,
} from '../fixtures/seed';

const isCI = !!process.env.CI;

test.describe('AC-E2E-1: 予約成功パス', () => {
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

  test('公開ページから予約 → Firestore 永続化 + mock mail 2 件', async ({ page }) => {
    const { linkId, ownerUid } = await seedStandardLinkAndOwner('success');

    // 翌日 14:00 JST を狙う (確実に未来 + 営業時間内 8-23)
    const targetIso = nextDay14JST().toISOString();
    const targetDateKey = targetIso.split('T')[0]; // YYYY-MM-DD

    await page.goto(`/book/${linkId}`);
    // 初回 /slots fetch + render 完了を待つ (CI で Next.js dev compile が遅い)
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await expect(page.getByText('読み込み中...')).toBeHidden({ timeout: 30_000 });

    // 翌日の日付カードをクリック (CI で遅延しうるので timeout を伸ばす)
    const targetDateCard = page.getByTestId(`date-card-${targetDateKey}`);
    await expect(targetDateCard).toBeVisible({ timeout: 30_000 });
    await targetDateCard.click();

    // 14:00 スロットをクリック
    const slot14 = page.getByTestId(`slot-btn-${targetIso}`);
    await expect(slot14).toBeVisible({ timeout: 10_000 });
    await slot14.click();

    // フォーム入力
    await page.fill('input[type="text"]', '山田 太郎');
    await page.fill('input[type="email"]', 'guest@example.com');

    // 送信
    await page.getByTestId('submit-btn').click();

    // 完了画面表示確認
    await expect(page.getByText('予約が確定しました')).toBeVisible({ timeout: 15_000 });

    // Firestore: bookings に 1 件
    const bookings = await getBookings(ownerUid);
    expect(bookings).toHaveLength(1);
    expect(bookings[0].status).toBe('confirmed');
    expect(bookings[0].guestName).toBe('山田 太郎');
    expect(bookings[0].guestEmail).toBe('guest@example.com');

    // メール mock: owner + guest 計 2 件
    // 非同期で実行されるので最大 10 秒 retry
    await expect.poll(async () => (await getMailLog()).length, { timeout: 10_000 }).toBe(2);

    const mails = await getMailLog();
    const contexts = mails.map((m) => m.context).sort();
    expect(contexts).toEqual(['guest-confirmation', 'owner-notification']);

    // mock calendar adapter で createEvent が呼ばれて calendarEventId が設定されることも
    // 非同期処理なので poll
    await expect
      .poll(
        async () => {
          const list = await getBookings(ownerUid);
          return list[0]?.calendarEventId ?? null;
        },
        { timeout: 10_000 },
      )
      .not.toBeNull();
    const updated = await getBookings(ownerUid);
    expect((updated[0].calendarEventId as string).startsWith('mock_')).toBe(true);
  });
});
