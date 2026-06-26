import { google } from 'googleapis';
import { logMailFailure } from './mail-fail.js';
import { getDb } from './firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { assertE2EMockSafe } from './e2e-guard.js';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /**
   * 失敗時のアラート／トリアージに使う識別子。
   * 例: `owner-notification`, `guest-confirmation`, `ai-suggestion`, `test-notification`.
   * 指定すると送信失敗時に `[MAIL-FAIL] context=<context> ...` として console.error し、
   * その後エラーを再 throw する（呼び出し側の既存 try-catch ロジックには非互換変更なし）。
   */
  context?: string;
}

interface GmailAuth {
  email: string;
  accessToken: string;
}

/**
 * RFC 2822 形式の MIME message を構築する pure 関数。
 * 件名・本文は日本語を扱うため UTF-8 + base64 で encode する。
 *
 * - 件名: RFC 2047 encoded-word (`=?UTF-8?B?<base64>?=`)
 * - 本文: `Content-Transfer-Encoding: base64`
 * - text/html 両方ある場合は multipart/alternative
 */
export function buildMimeMessage(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
}): string {
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(opts.subject, 'utf8').toString('base64')}?=`;
  const fromHeader = `Calendar Hub <${opts.from}>`;

  if (opts.text && opts.html) {
    const boundary = `boundary_${Buffer.from(opts.subject + opts.to)
      .toString('base64')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 24)}`;
    return [
      `From: ${fromHeader}`,
      `To: ${opts.to}`,
      `Subject: ${subjectEncoded}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(opts.text, 'utf8').toString('base64'),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(opts.html, 'utf8').toString('base64'),
      '',
      `--${boundary}--`,
    ].join('\r\n');
  }

  return [
    `From: ${fromHeader}`,
    `To: ${opts.to}`,
    `Subject: ${subjectEncoded}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(opts.html, 'utf8').toString('base64'),
  ].join('\r\n');
}

/**
 * Gmail API (users.messages.send) でメール送信。
 * OAuth scope は `https://www.googleapis.com/auth/gmail.send` のみで動作する。
 * (旧実装の nodemailer SMTP は `https://mail.google.com/` scope が必要だったため
 *  535 認証エラーが発生していた。)
 */
export async function sendEmail(auth: GmailAuth, options: SendEmailOptions): Promise<void> {
  if (process.env.E2E_MAIL_MOCK === '1') {
    assertE2EMockSafe('E2E_MAIL_MOCK');
    await getDb()
      .collection('_e2eMail')
      .add({
        from: auth.email,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text ?? null,
        context: options.context ?? null,
        sentAt: FieldValue.serverTimestamp(),
      });
    return;
  }

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: auth.accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const message = buildMimeMessage({
      from: auth.email,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    const encodedMessage = Buffer.from(message, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });
  } catch (err) {
    if (options.context) {
      logMailFailure({ context: options.context, recipient: options.to }, err);
    }
    throw err;
  }
}

/**
 * 予約通知メールで使う JST 日時フォーマット (秒なし)。
 * 例: `2026/6/28 12:00`
 */
export function formatJstDateTime(date: Date): string {
  return date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 同上、時分のみ (時間レンジの終端表記用)。
 * 例: `13:00`
 */
export function formatJstTime(date: Date): string {
  return date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * AI提案通知メールのHTML生成
 */
export function buildSuggestionEmailHtml(
  suggestions: Array<{
    title: string;
    start: string;
    end: string;
    reasoning: string;
  }>,
  insights: string,
): string {
  const suggestionsHtml = suggestions
    .map(
      (s) => `
    <div style="border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:12px;">
      <h3 style="margin:0 0 8px;">${escapeHtml(s.title)}</h3>
      <p style="margin:4px 0;color:#666;">
        ${escapeHtml(s.start)} 〜 ${escapeHtml(s.end)}
      </p>
      <p style="margin:4px 0;font-size:14px;">${escapeHtml(s.reasoning)}</p>
    </div>`,
    )
    .join('');

  const insightsHtml = insights ? `<h2>Insights</h2><p>${escapeHtml(insights)}</p>` : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h1 style="color:#333;">Calendar Hub - AI提案</h1>
  <p>新しいスケジュール提案があります：</p>
  ${suggestionsHtml}
  ${insightsHtml}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="font-size:12px;color:#999;">
    この通知はCalendar Hubから自動送信されています。
    設定画面から通知をオフにできます。
  </p>
</body>
</html>`;
}

/**
 * テスト通知メールのHTML生成
 */
export function buildTestEmailHtml(): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h1 style="color:#333;">Calendar Hub - テスト通知</h1>
  <p>メール通知が正常に設定されています。</p>
  <p style="font-size:14px;color:#666;">送信日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
</body>
</html>`;
}

/**
 * 予約通知メールのHTML生成（オーナー向け）
 */
/**
 * Google Calendar の event 作成画面 (deep link) を開く URL を生成する。
 *
 * - クリック → Google にログイン中のユーザーで「予定を作成」画面がプレフィルされた状態で開く
 * - OAuth scope / API 呼び出し不要
 * - ユーザーが「保存」を押すまで予定は作成されない (= 確認後に登録できる)
 *
 * @see https://stackoverflow.com/questions/22757908/google-calendar-render-action-template-parameter-documentation
 */
export function buildGoogleCalendarRenderUrl(params: {
  title: string;
  start: Date;
  end: Date;
  details?: string;
}): string {
  const { title, start, end, details } = params;
  const u = new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action', 'TEMPLATE');
  u.searchParams.set('text', title);
  u.searchParams.set('dates', `${formatGCalDate(start)}/${formatGCalDate(end)}`);
  if (details) u.searchParams.set('details', details);
  return u.toString();
}

/** Google Calendar render URL の `dates` パラメータ形式 `YYYYMMDDTHHMMSSZ` (basic ISO 8601 UTC) */
function formatGCalDate(d: Date): string {
  // 2026-07-04T08:00:00.000Z → 20260704T080000Z
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

export function buildBookingNotificationHtml(params: {
  linkTitle: string;
  guestName: string;
  guestEmail?: string;
  guestMessage?: string;
  slotStart: Date;
  slotEnd: Date;
}): string {
  const { linkTitle, guestName, guestEmail, guestMessage, slotStart, slotEnd } = params;
  const startStr = formatJstDateTime(slotStart);
  const endStr = formatJstTime(slotEnd);

  const guestEmailHtml = guestEmail
    ? `<p style="margin:4px 0;font-size:14px;">メール: <a href="mailto:${escapeHtml(guestEmail)}">${escapeHtml(guestEmail)}</a></p>`
    : '';

  const messageHtml = guestMessage
    ? `<p style="margin:8px 0;padding:12px;background:#f5f5f5;border-radius:6px;font-size:14px;">${escapeHtml(guestMessage)}</p>`
    : '';

  // Google Calendar event 作成画面への deep link
  // タイトル: 「<linkTitle> - <guestName>」、詳細: 予約者・メール・メッセージ
  const detailsLines = [
    `予約者: ${guestName}`,
    guestEmail ? `メール: ${guestEmail}` : '',
    guestMessage ? `メッセージ: ${guestMessage}` : '',
  ].filter(Boolean);
  const gcalUrl = buildGoogleCalendarRenderUrl({
    title: `${linkTitle} - ${guestName}`,
    start: slotStart,
    end: slotEnd,
    details: detailsLines.join('\n'),
  });

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h1 style="color:#333;font-size:20px;">新しい予約が入りました</h1>
  <div style="border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin:16px 0;">
    <h2 style="margin:0 0 12px;font-size:16px;color:#e07850;">${escapeHtml(linkTitle)}</h2>
    <p style="margin:4px 0;font-size:14px;"><strong>予約者:</strong> ${escapeHtml(guestName)}</p>
    ${guestEmailHtml}
    <p style="margin:4px 0;font-size:14px;"><strong>日時:</strong> ${escapeHtml(startStr)} 〜 ${escapeHtml(endStr)}</p>
    ${messageHtml}
  </div>
  <div style="text-align:center;margin:20px 0;">
    <a href="${escapeHtml(gcalUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 24px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">
      📅 Google カレンダーに追加
    </a>
    <p style="font-size:11px;color:#999;margin:8px 0 0;">ボタンを押すと予定の作成画面が開きます (保存するまで登録されません)</p>
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="font-size:12px;color:#999;">Calendar Hub から自動送信されています。</p>
</body>
</html>`;
}

/**
 * 予約確認メールのHTML生成（ゲスト向け）
 */
export function buildBookingConfirmationHtml(params: {
  linkTitle: string;
  ownerDisplayName: string;
  guestName: string;
  slotStart: Date;
  slotEnd: Date;
  durationMinutes: number;
}): string {
  const { linkTitle, ownerDisplayName, guestName, slotStart, slotEnd, durationMinutes } = params;
  const startStr = formatJstDateTime(slotStart);
  const endStr = formatJstTime(slotEnd);

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h1 style="color:#333;font-size:20px;">予約が確定しました</h1>
  <p>${escapeHtml(guestName)} さん、予約が確定しました。</p>
  <div style="border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin:16px 0;">
    <h2 style="margin:0 0 12px;font-size:16px;color:#e07850;">${escapeHtml(linkTitle)}</h2>
    <p style="margin:4px 0;font-size:14px;"><strong>主催者:</strong> ${escapeHtml(ownerDisplayName)}</p>
    <p style="margin:4px 0;font-size:14px;"><strong>日時:</strong> ${escapeHtml(startStr)} 〜 ${escapeHtml(endStr)}</p>
    <p style="margin:4px 0;font-size:14px;"><strong>所要時間:</strong> ${durationMinutes}分</p>
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="font-size:12px;color:#999;">このメールは Calendar Hub から自動送信されています。</p>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
