/**
 * E2E mock 機構の本番事故防止 guard。
 *
 * `E2E_MAIL_MOCK=1` / `E2E_CALENDAR_MOCK=1` 等の環境変数が誤って本番 Cloud Run に
 * 設定された場合、Gmail / Google Calendar への実送信が黙って bypass され、
 * Firestore の `_e2eMail` collection に通知が書き込まれる silent disaster になる。
 *
 * 本 helper は各 mock 分岐の冒頭で呼び、`NODE_ENV === 'production'` のときは
 * fail-fast (throw) して silent fail を防ぐ。
 */
export function assertE2EMockSafe(flagName: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${flagName} must not be enabled in production (NODE_ENV=production detected)`);
  }
}
