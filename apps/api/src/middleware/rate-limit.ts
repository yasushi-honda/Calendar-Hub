import { createMiddleware } from 'hono/factory';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * インメモリIPベースレートリミッター。
 * Cloud Run 1-3インスタンスでは厳密なグローバル制限にはならないが、
 * 単一インスタンスへのバースト攻撃を防ぐには十分。
 */
export function rateLimit(opts: { windowMs: number; max: number }) {
  const store = new Map<string, RateLimitEntry>();

  // 期限切れエントリを定期クリーンアップ（メモリリーク防止）
  const CLEANUP_INTERVAL = 60_000;
  let lastCleanup = Date.now();

  function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }

  return createMiddleware(async (c, next) => {
    cleanup();

    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown';

    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || entry.resetAt <= now) {
      store.set(ip, { count: 1, resetAt: now + opts.windowMs });
      c.header('X-RateLimit-Limit', String(opts.max));
      c.header('X-RateLimit-Remaining', String(opts.max - 1));
      await next();
      return;
    }

    entry.count++;

    if (entry.count > opts.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      c.header('X-RateLimit-Limit', String(opts.max));
      c.header('X-RateLimit-Remaining', '0');
      return c.json({ error: 'Too many requests' }, 429);
    }

    c.header('X-RateLimit-Limit', String(opts.max));
    c.header('X-RateLimit-Remaining', String(opts.max - entry.count));
    await next();
  });
}
