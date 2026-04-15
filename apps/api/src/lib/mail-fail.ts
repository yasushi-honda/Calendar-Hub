/**
 * メール送信失敗の分類と `[MAIL-FAIL]` 形式でのログ出力。
 *
 * Issue #74 の要件:
 *   - ログベースメトリクス `calendar_hub_mail_fail` でアラート化するため、
 *     console.error 先頭に一意な `[MAIL-FAIL]` プレフィックスを付けて出力する。
 *   - 失敗の原因を `kind` で分類し、AUTH（トークン失効）と TRANSIENT（一時障害）を
 *     観測側で区別できるようにする（AUTH は再ログイン誘導、TRANSIENT はリトライ）。
 */

export type MailFailKind = 'AUTH' | 'TRANSIENT' | 'UNKNOWN';

export interface MailFailClassification {
  kind: MailFailKind;
  reason: string;
}

interface MailFailContext {
  context: string;
  recipient: string;
}

/**
 * 受信したエラーを AUTH / TRANSIENT / UNKNOWN に分類する。
 * nodemailer + googleapis の典型エラー形状を見る:
 *   - `responseCode` (SMTP: 401/403/429/503)
 *   - `response.data.error` (OAuth2: invalid_grant)
 *   - `code` (Node.js: ETIMEDOUT, ECONNRESET)
 *   - `message` (nodemailer SMTP 535-5.7.8 = auth 失敗)
 */
export function classifyMailError(err: unknown): MailFailClassification {
  if (err === null || err === undefined) {
    return { kind: 'UNKNOWN', reason: 'nullish error' };
  }

  if (typeof err !== 'object') {
    return { kind: 'UNKNOWN', reason: String(err) };
  }

  const e = err as Record<string, unknown>;
  const message = typeof e.message === 'string' ? e.message : '';
  const code = typeof e.code === 'string' ? e.code : '';
  const responseCode = typeof e.responseCode === 'number' ? e.responseCode : undefined;
  const oauthError = readOAuthErrorField(e);

  // AUTH 判定
  if (oauthError === 'invalid_grant' || oauthError === 'unauthorized_client') {
    return { kind: 'AUTH', reason: `oauth_error=${oauthError}` };
  }
  if (responseCode === 401 || responseCode === 403) {
    return { kind: 'AUTH', reason: `http=${responseCode}` };
  }
  if (/\b535-5\.7\.\d\b|Invalid login|Username and Password not accepted/i.test(message)) {
    return { kind: 'AUTH', reason: 'smtp_auth_rejected' };
  }

  // TRANSIENT 判定
  if (responseCode === 429 || responseCode === 503 || responseCode === 504) {
    return { kind: 'TRANSIENT', reason: `http=${responseCode}` };
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ECONNREFUSED') {
    return { kind: 'TRANSIENT', reason: `code=${code}` };
  }

  return { kind: 'UNKNOWN', reason: message || 'no-message' };
}

function readOAuthErrorField(e: Record<string, unknown>): string | undefined {
  const response = e.response as { data?: { error?: unknown } } | undefined;
  const nested = response?.data?.error;
  if (typeof nested === 'string') return nested;
  if (typeof e.error === 'string') return e.error;
  return undefined;
}

/**
 * recipient をアラート時のログに安全に残すため、ローカル部分を伏せてドメインだけ残す。
 * `user@example.com` → `***@example.com`
 * PII を Cloud Logging に流さない方針（GCP 側の永続化期間内で不要）。
 */
function maskRecipient(recipient: string): string {
  const atIndex = recipient.lastIndexOf('@');
  if (atIndex <= 0) return '***';
  return `***@${recipient.slice(atIndex + 1)}`;
}

/**
 * `[MAIL-FAIL] context=<x> recipient=<y> kind=<K> reason=<R>` 形式で console.error。
 * 第二引数として元のエラーを渡し、Cloud Logging 上でスタックトレースを確認できるようにする。
 */
export function logMailFailure(ctx: MailFailContext, err: unknown): void {
  const { kind, reason } = classifyMailError(err);
  const line = `[MAIL-FAIL] context=${ctx.context} recipient=${maskRecipient(ctx.recipient)} kind=${kind} reason=${reason}`;
  console.error(line, err);
}
