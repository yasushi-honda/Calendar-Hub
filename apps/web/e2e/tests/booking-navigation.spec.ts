import { test, expect } from '@playwright/test';
import { clearAllCollections, seedStandardLinkAndOwner } from '../fixtures/seed';

test.describe('予約ページのナビゲーション', () => {
  test.beforeEach(async () => {
    await clearAllCollections();
  });

  async function openBookingPage(page: import('@playwright/test').Page, linkId: string) {
    await page.goto(`/book/${linkId}`);
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await expect(page.getByText('読み込み中...')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('.date-card').first()).toBeVisible({ timeout: 30_000 });
  }

  const selectedCard = (page: import('@playwright/test').Page) =>
    page.locator('.date-card[aria-pressed="true"]');

  test('矢印キー → / ← で日付カードの選択が横に移動する', async ({ page }) => {
    const { linkId } = await seedStandardLinkAndOwner('arrow-nav');
    await openBookingPage(page, linkId);

    const cards = page.locator('.date-card');
    expect(await cards.count()).toBeGreaterThanOrEqual(3);

    // 初期状態は先頭の日付が選択されている
    await expect(selectedCard(page)).toHaveCount(1);
    await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('ArrowRight');
    await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('ArrowRight');
    await expect(cards.nth(2)).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('ArrowLeft');
    await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
  });

  test('先頭で ← / 末尾で → を押しても範囲外に出ない', async ({ page }) => {
    const { linkId } = await seedStandardLinkAndOwner('arrow-bounds');
    await openBookingPage(page, linkId);

    const cards = page.locator('.date-card');
    const last = (await cards.count()) - 1;

    await page.keyboard.press('ArrowLeft');
    await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');

    for (let i = 0; i < last + 3; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(cards.nth(last)).toHaveAttribute('aria-pressed', 'true');
    await expect(selectedCard(page)).toHaveCount(1);
  });

  test('入力欄にフォーカス中は矢印キーで日付が動かない', async ({ page }) => {
    const { linkId } = await seedStandardLinkAndOwner('arrow-input');
    await openBookingPage(page, linkId);

    await page.locator('.slot-btn').first().click();
    const nameInput = page.locator('input[type="text"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('abc');
    await page.keyboard.press('ArrowLeft');
    // フォーム画面のまま・入力が保持されている
    await expect(nameInput).toHaveValue('abc');
  });

  test('ロゴをクリックすると最初の画面(日時選択)に戻る', async ({ page }) => {
    const { linkId } = await seedStandardLinkAndOwner('logo-reset');
    await openBookingPage(page, linkId);

    const cards = page.locator('.date-card');
    await cards.nth(2).click();
    await page.locator('.slot-btn').first().click();
    await page.fill('input[type="text"]', '山田 太郎');
    await expect(page.locator('.submit-btn')).toBeVisible();

    await page.locator('aside a', { hasText: 'Calendar' }).click();

    // 同じ予約ページに留まり、日時選択画面に戻る
    await expect(page).toHaveURL(new RegExp(`/book/${linkId}$`));
    await expect(page.locator('.submit-btn')).toBeHidden();
    await expect(page.getByText('日付を選択')).toBeVisible();
    // 先頭の日付が選択された初期状態に戻る
    await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');

    // 入力内容はリセットされている
    await page.locator('.slot-btn').first().click();
    await expect(page.locator('input[type="text"]')).toHaveValue('');
  });
});
