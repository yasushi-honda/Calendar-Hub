import type { FullConfig } from '@playwright/test';

/**
 * Playwright global setup.
 *
 * 環境変数チェックと emulator 接続確認のみ行う。Firestore へのデータ投入は
 * 各 spec が `fixtures/seed.ts` の helper を介して spec 毎に行う（並列実行を将来許容する場合に
 * spec 間の seed 干渉を避けるため）。
 *
 * `firebase emulators:exec` 経由で起動された場合、`FIRESTORE_EMULATOR_HOST` /
 * `FIREBASE_AUTH_EMULATOR_HOST` が親プロセスから子の API サーバーに継承される。
 * Playwright プロセス本体は webServer を spawn するだけなので、ここでは確認のみ。
 */
export default async function globalSetup(_config: FullConfig) {
  const required = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `E2E global setup: required env vars not set: ${missing.join(', ')}. ` +
        `Run via \`pnpm e2e\` (which wraps firebase emulators:exec).`,
    );
  }
}
