import { test, expect, type Page } from '@playwright/test';
import { clearAllCollections, seedStandardLinkAndOwner } from '../fixtures/seed';

test.describe('予約ページのナビゲーション', () => {
  test.beforeEach(async () => {
    await clearAllCollections();
  });

  async function openBookingPage(page: Page, linkId: string) {
    await page.goto(`/book/${linkId}`);
    await page.waitForLoadState('networkidle', { timeout: 60_000 });
    await expect(page.getByText('読み込み中...')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('.date-card').first()).toBeVisible({ timeout: 30_000 });
  }

  const selectedCard = (page: Page) => page.locator('.date-card[aria-pressed="true"]');
  const logo = (page: Page) => page.getByTestId('booking-logo');

  /** ロゴ復帰後の /slots 再取得完了を待つ（再描画中の要素 detach によるフレークを避ける） */
  async function clickLogoAndWaitRefresh(page: Page) {
    const refreshed = page.waitForResponse(
      (res) => res.url().includes('/slots') && res.request().method() === 'GET',
    );
    await logo(page).click();
    await refreshed;
  }

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

  test('日付カードにフォーカス中に矢印キーで移動すると、フォーカスも追従する', async ({ page }) => {
    const { linkId } = await seedStandardLinkAndOwner('arrow-focus');
    await openBookingPage(page, linkId);

    const cards = page.locator('.date-card');
    await cards.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(cards.nth(1)).toBeFocused();

    // Enter で元のカードに選択が戻らない（フォーカスが追従していない場合の実害）
    await page.keyboard.press('Enter');
    await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
  });

  test('先頭で ← / 末尾で → を押しても範囲外に出ない', async ({ page }) => {
    const { linkId } = await seedStandardLinkAndOwner('arrow-bounds');
    await openBookingPage(page, linkId);

    const cards = page.locator('.date-card');
    const last = (await cards.count()) - 1;

    await page.keyboard.press('ArrowLeft');
    await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');

    // 1 回ごとに反映を待つ（連打時の取りこぼしによるフレークを避ける）
    for (let i = 1; i <= last; i++) {
      await page.keyboard.press('ArrowRight');
      await expect(cards.nth(i)).toHaveAttribute('aria-pressed', 'true');
    }
    await page.keyboard.press('ArrowRight');
    await expect(cards.nth(last)).toHaveAttribute('aria-pressed', 'true');
    await expect(selectedCard(page)).toHaveCount(1);
  });

  test('修飾キー併用・IME変換中は矢印キーで日付が動かない', async ({ page }) => {
    const { linkId } = await seedStandardLinkAndOwner('arrow-modifier');
    await openBookingPage(page, linkId);

    const cards = page.locator('.date-card');
    await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');

    // Alt+← はブラウザの「戻る」、Cmd/Ctrl+矢印・Shift+矢印も別の意味を持つため奪わない
    for (const combo of ['Shift+ArrowRight', 'Alt+ArrowRight', 'Control+ArrowRight']) {
      await page.keyboard.press(combo);
    }
    await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');

    // IME 変換中(isComposing)のキーも無視する
    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', isComposing: true, bubbles: true }),
      );
    });
    await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');

    // 対照: 修飾キー無しなら動く（テストが空振りでないことの確認）
    await page.keyboard.press('ArrowRight');
    await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
  });

  test('ロゴをクリックすると最初の画面(日時選択)に戻る', async ({ page }) => {
    const { linkId } = await seedStandardLinkAndOwner('logo-reset');
    await openBookingPage(page, linkId);

    const cards = page.locator('.date-card');
    await cards.nth(2).click();
    await page.locator('.slot-btn').first().click();
    await page.fill('input[type="text"]', '山田 太郎');
    await expect(page.locator('.submit-btn')).toBeVisible();

    await clickLogoAndWaitRefresh(page);

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

  test('予約確定後の画面からロゴで日時選択に戻れる', async ({ page }) => {
    const { linkId } = await seedStandardLinkAndOwner('logo-after-confirm');
    await openBookingPage(page, linkId);

    // 今日の枠は現在時刻から始まり予約時点で過去になりうる(Issue #226)ため、
    // 実行時刻に依存しないよう、必ず明日以降の日付(2 枚目以降のカード)を選ぶ
    await page.locator('.date-card').nth(1).click();
    await page.locator('.slot-btn').first().click();
    await page.fill('input[type="text"]', '山田 太郎');
    await page.getByTestId('submit-btn').click();
    await expect(page.getByText('予約が確定しました')).toBeVisible({ timeout: 15_000 });

    await clickLogoAndWaitRefresh(page);

    await expect(page.getByText('予約が確定しました')).toBeHidden();
    await expect(page.getByText('日付を選択')).toBeVisible();
    await expect(page.locator('.date-card').first()).toHaveAttribute('aria-pressed', 'true');
  });

  test('Cmd/Ctrl+クリックは通常のリンク動作(新規タブ)で、元のページはリセットされない', async ({
    page,
    context,
  }) => {
    const { linkId } = await seedStandardLinkAndOwner('logo-modifier');
    await openBookingPage(page, linkId);

    await page.locator('.slot-btn').first().click();
    await page.fill('input[type="text"]', '山田 太郎');

    const popupPromise = context.waitForEvent('page');
    // 新規タブを開く修飾キーは OS ごとに異なる (macOS: Cmd, Linux/Windows: Ctrl)
    const newTabModifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await logo(page).click({ modifiers: [newTabModifier] });
    const popup = await popupPromise;
    await popup.close();

    // 元のタブはフォーム画面のまま、入力も保持されている
    await expect(page.locator('.submit-btn')).toBeVisible();
    await expect(page.locator('input[type="text"]')).toHaveValue('山田 太郎');
  });
});
