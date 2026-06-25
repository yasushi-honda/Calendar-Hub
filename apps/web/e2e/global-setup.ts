import http from 'node:http';
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
 *
 * Issue #145 診断: CI で API server 到達性 (IPv4 vs IPv6) を probe してログ出力。
 * webServer は本関数の前に既に立ち上がっているので、ここで 3 種の hostname に接続を試みる。
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

  // Issue #145 診断: API server (8088) への到達性を 3 種 hostname で確認
  if (process.env.CI) {
    console.log('[E2E-DIAG] API server (port 8088) reachability:');

    console.log(`[E2E-DIAG]   127.0.0.1 => ${await probe('127.0.0.1', 8088, 4)}`);

    console.log(`[E2E-DIAG]   localhost => ${await probe('localhost', 8088)}`);

    console.log(`[E2E-DIAG]   ::1       => ${await probe('::1', 8088, 6)}`);
  }
}

function probe(host: string, port: number, family?: 4 | 6): Promise<string> {
  return new Promise((resolve) => {
    const opts: http.RequestOptions = {
      host,
      port,
      path: '/health',
      method: 'GET',
      timeout: 5_000,
    };
    if (family) opts.family = family;
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => resolve(`HTTP ${res.statusCode} ${data.slice(0, 80)}`));
    });
    req.on('error', (e: NodeJS.ErrnoException) => resolve(`ERROR ${e.code ?? e.message}`));
    req.on('timeout', () => {
      req.destroy();
      resolve('TIMEOUT (5s)');
    });
    req.end();
  });
}
