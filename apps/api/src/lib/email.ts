import nodemailer from 'nodemailer';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
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

  await transporter.sendMail({
    from: `Calendar Hub <${auth.email}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
