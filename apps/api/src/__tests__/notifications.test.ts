import { describe, it, expect } from 'vitest';
import { buildSuggestionEmailHtml, buildTestEmailHtml } from '../lib/email.js';

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
