import { describe, it, expect } from 'vitest';
import {
  buildSuggestionEmailHtml,
  buildTestEmailHtml,
  buildMimeMessage,
  buildBookingNotificationHtml,
  buildBookingConfirmationHtml,
  formatJstDateTime,
  formatJstTime,
} from '../lib/email.js';

describe('buildSuggestionEmailHtml', () => {
  it('should generate HTML with suggestion details', () => {
    const html = buildSuggestionEmailHtml(
      [
        {
          title: 'ミーティング',
          start: '2026-03-22 10:00',
          end: '2026-03-22 11:00',
          reasoning: '午前中の空き時間を活用',
        },
      ],
      '今週は会議が少ないため集中作業に適しています',
    );

    expect(html).toContain('ミーティング');
    expect(html).toContain('2026-03-22 10:00');
    expect(html).toContain('2026-03-22 11:00');
    expect(html).toContain('午前中の空き時間を活用');
    expect(html).toContain('今週は会議が少ない');
    expect(html).toContain('Calendar Hub');
  });

  it('should escape HTML in user input', () => {
    const html = buildSuggestionEmailHtml(
      [
        {
          title: '<script>alert("xss")</script>',
          start: '10:00',
          end: '11:00',
          reasoning: 'test & "quotes"',
        },
      ],
      '',
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('test &amp; &quot;quotes&quot;');
  });

  it('should handle empty suggestions array', () => {
    const html = buildSuggestionEmailHtml([], '');
    expect(html).toContain('Calendar Hub');
    expect(html).not.toContain('undefined');
  });

  it('should handle multiple suggestions', () => {
    const html = buildSuggestionEmailHtml(
      [
        { title: 'Task A', start: '09:00', end: '10:00', reasoning: 'r1' },
        { title: 'Task B', start: '14:00', end: '15:00', reasoning: 'r2' },
        { title: 'Task C', start: '16:00', end: '17:00', reasoning: 'r3' },
      ],
      'insights text',
    );

    expect(html).toContain('Task A');
    expect(html).toContain('Task B');
    expect(html).toContain('Task C');
    expect(html).toContain('insights text');
  });

  it('should omit insights section when insights is empty', () => {
    const html = buildSuggestionEmailHtml(
      [{ title: 'T', start: '09:00', end: '10:00', reasoning: 'r' }],
      '',
    );

    expect(html).not.toContain('<h2>Insights</h2>');
  });
});

describe('buildTestEmailHtml', () => {
  it('should generate test email HTML', () => {
    const html = buildTestEmailHtml();
    expect(html).toContain('テスト通知');
    expect(html).toContain('正常に設定されています');
    expect(html).toContain('送信日時');
  });
});

describe('buildMimeMessage (Gmail API への RFC 2822 メッセージ構築)', () => {
  it('Subject を RFC 2047 base64 encoded-word でエンコードする', () => {
    const msg = buildMimeMessage({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: '日本語件名',
      html: '<p>hello</p>',
    });
    const expected = `=?UTF-8?B?${Buffer.from('日本語件名', 'utf8').toString('base64')}?=`;
    expect(msg).toContain(`Subject: ${expected}`);
  });

  it('From ヘッダに "Calendar Hub <email>" 形式が含まれる', () => {
    const msg = buildMimeMessage({
      from: 'me@example.com',
      to: 'you@example.com',
      subject: 'test',
      html: '<p>hi</p>',
    });
    expect(msg).toContain('From: Calendar Hub <me@example.com>');
  });

  it('To ヘッダが含まれる', () => {
    const msg = buildMimeMessage({
      from: 'a@example.com',
      to: 'b@example.com',
      subject: 't',
      html: '<p></p>',
    });
    expect(msg).toContain('To: b@example.com');
  });

  it('MIME-Version: 1.0 が含まれる', () => {
    const msg = buildMimeMessage({
      from: 'a@example.com',
      to: 'b@example.com',
      subject: 't',
      html: '<p></p>',
    });
    expect(msg).toContain('MIME-Version: 1.0');
  });

  it('html のみの場合は text/html charset=UTF-8 + base64 で body が encode される', () => {
    const html = '<p>こんにちは</p>';
    const msg = buildMimeMessage({
      from: 'a@example.com',
      to: 'b@example.com',
      subject: 't',
      html,
    });
    expect(msg).toContain('Content-Type: text/html; charset=UTF-8');
    expect(msg).toContain('Content-Transfer-Encoding: base64');
    expect(msg).toContain(Buffer.from(html, 'utf8').toString('base64'));
  });

  it('text + html の場合は multipart/alternative で構築され、両 body が base64 で含まれる', () => {
    const text = 'プレーンテキスト本文';
    const html = '<p>HTML 本文</p>';
    const msg = buildMimeMessage({
      from: 'a@example.com',
      to: 'b@example.com',
      subject: 't',
      html,
      text,
    });
    expect(msg).toMatch(/Content-Type: multipart\/alternative; boundary="boundary_[A-Za-z0-9]+"/);
    expect(msg).toContain(Buffer.from(text, 'utf8').toString('base64'));
    expect(msg).toContain(Buffer.from(html, 'utf8').toString('base64'));
  });

  it('ヘッダと body は CRLF (\\r\\n) で改行される (RFC 2822 準拠)', () => {
    const msg = buildMimeMessage({
      from: 'a@example.com',
      to: 'b@example.com',
      subject: 't',
      html: '<p></p>',
    });
    expect(msg).toContain('\r\n');
    expect(msg).not.toMatch(/[^\r]\n/);
  });

  it('日本語の件名と本文を正しく扱える', () => {
    const subject = '【本田】予約スケジュール - 山田 太郎';
    const html = '<p>こんにちは、世界！🌏</p>';
    const msg = buildMimeMessage({
      from: 'a@example.com',
      to: 'b@example.com',
      subject,
      html,
    });
    expect(msg).toContain(`=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`);
    expect(msg).toContain(Buffer.from(html, 'utf8').toString('base64'));
  });

  it('multipart の boundary は 1 つのメッセージ内で一意 (closing boundary --<b>-- が出現)', () => {
    const msg = buildMimeMessage({
      from: 'a@example.com',
      to: 'b@example.com',
      subject: 't',
      html: '<p>h</p>',
      text: 't',
    });
    const match = msg.match(/boundary="(boundary_[A-Za-z0-9]+)"/);
    expect(match).not.toBeNull();
    const boundary = match![1];
    // 開く側 2 回 (text part / html part), 閉じる側 1 回
    const openCount = (msg.match(new RegExp(`^--${boundary}$`, 'gm')) ?? []).length;
    const closeCount = (msg.match(new RegExp(`^--${boundary}--$`, 'gm')) ?? []).length;
    expect(openCount).toBe(2);
    expect(closeCount).toBe(1);
  });
});

describe('formatJstDateTime', () => {
  it('JST 12:00 (UTC 03:00) を秒なしで整形する', () => {
    // 2026-06-28T03:00:00Z = JST 2026-06-28 12:00
    const d = new Date('2026-06-28T03:00:00Z');
    expect(formatJstDateTime(d)).toBe('2026/6/28 12:00');
  });

  it('UTC が日付境界をまたいでも JST に変換される', () => {
    // UTC 2026-06-27T15:30:00Z = JST 2026-06-28 00:30
    const d = new Date('2026-06-27T15:30:00Z');
    expect(formatJstDateTime(d)).toBe('2026/6/28 00:30');
  });

  it('秒の情報は出力に含まれない (本田様報告 12:00:00 → 12:00 の修正)', () => {
    const d = new Date('2026-06-28T03:00:42Z');
    const out = formatJstDateTime(d);
    expect(out).not.toMatch(/:\d{2}:\d{2}/); // HH:MM:SS パターンが残らない
    expect(out).toMatch(/\d+:\d{2}$/); // 末尾は HH:MM
  });
});

describe('formatJstTime', () => {
  it('時分のみを返す (時間レンジの終端用)', () => {
    const d = new Date('2026-06-28T04:00:00Z'); // JST 13:00
    expect(formatJstTime(d)).toBe('13:00');
  });

  it('秒は含まれない', () => {
    const d = new Date('2026-06-28T04:00:55Z');
    expect(formatJstTime(d)).toBe('13:00');
  });
});

describe('buildBookingNotificationHtml (オーナー向け)', () => {
  it('日時表記が "YYYY/M/D HH:MM 〜 HH:MM" 形式 (秒なし)', () => {
    const html = buildBookingNotificationHtml({
      linkTitle: '【本田】予約スケジュール',
      guestName: '山田 太郎',
      slotStart: new Date('2026-06-28T03:00:00Z'), // JST 12:00
      slotEnd: new Date('2026-06-28T04:00:00Z'), // JST 13:00
    });
    expect(html).toContain('2026/6/28 12:00 〜 13:00');
    expect(html).not.toContain('12:00:00'); // 本田様報告のリグレッション防止
  });

  it('guestEmail があれば mailto リンクが含まれる', () => {
    const html = buildBookingNotificationHtml({
      linkTitle: 'タイトル',
      guestName: 'ゲスト',
      guestEmail: 'guest@example.com',
      slotStart: new Date('2026-06-28T03:00:00Z'),
      slotEnd: new Date('2026-06-28T04:00:00Z'),
    });
    expect(html).toContain('mailto:guest@example.com');
  });

  it('guestMessage を含む', () => {
    const html = buildBookingNotificationHtml({
      linkTitle: 't',
      guestName: 'g',
      guestMessage: '備考メモ',
      slotStart: new Date('2026-06-28T03:00:00Z'),
      slotEnd: new Date('2026-06-28T04:00:00Z'),
    });
    expect(html).toContain('備考メモ');
  });
});

describe('buildBookingConfirmationHtml (ゲスト向け)', () => {
  it('日時表記が "YYYY/M/D HH:MM 〜 HH:MM" 形式 (秒なし)', () => {
    const html = buildBookingConfirmationHtml({
      linkTitle: 't',
      ownerDisplayName: '本田',
      guestName: '山田',
      slotStart: new Date('2026-06-28T03:00:00Z'),
      slotEnd: new Date('2026-06-28T04:00:00Z'),
      durationMinutes: 60,
    });
    expect(html).toContain('2026/6/28 12:00 〜 13:00');
    expect(html).not.toContain('12:00:00');
  });

  it('所要時間 (分) が含まれる', () => {
    const html = buildBookingConfirmationHtml({
      linkTitle: 't',
      ownerDisplayName: '本田',
      guestName: '山田',
      slotStart: new Date('2026-06-28T03:00:00Z'),
      slotEnd: new Date('2026-06-28T04:00:00Z'),
      durationMinutes: 60,
    });
    expect(html).toContain('60分');
  });
});
