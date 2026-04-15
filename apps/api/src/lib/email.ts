import nodemailer from 'nodemailer';
import { logMailFailure } from './mail-fail.js';

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
 * Gmail OAuth2経由でメール送信
 * access_tokenはrefreshAccessToken()で事前に取得しておく
 */
export async function sendEmail(auth: GmailAuth, options: SendEmailOptions): Promise<void> {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: auth.email,
      accessToken: auth.accessToken,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  });

  try {
    await transporter.sendMail({
      from: `Calendar Hub <${auth.email}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
  } catch (err) {
    if (options.context) {
      logMailFailure({ context: options.context, recipient: options.to }, err);
    }
    throw err;
  }
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
export function buildBookingNotificationHtml(params: {
  linkTitle: string;
  guestName: string;
  guestEmail?: string;
  guestMessage?: string;
  slotStart: Date;
  slotEnd: Date;
}): string {
  const { linkTitle, guestName, guestEmail, guestMessage, slotStart, slotEnd } = params;
  const startStr = slotStart.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const endStr = slotEnd.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  });

  const guestEmailHtml = guestEmail
    ? `<p style="margin:4px 0;font-size:14px;">メール: <a href="mailto:${escapeHtml(guestEmail)}">${escapeHtml(guestEmail)}</a></p>`
    : '';

  const messageHtml = guestMessage
    ? `<p style="margin:8px 0;padding:12px;background:#f5f5f5;border-radius:6px;font-size:14px;">${escapeHtml(guestMessage)}</p>`
    : '';

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
  const startStr = slotStart.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const endStr = slotEnd.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  });

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
