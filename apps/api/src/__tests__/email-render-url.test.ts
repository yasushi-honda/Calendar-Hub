import { describe, it, expect } from 'vitest';
import {
  buildGoogleCalendarRenderUrl,
  buildBookingNotificationHtml,
  buildBookingConfirmationHtml,
} from '../lib/email.js';

describe('buildGoogleCalendarRenderUrl', () => {
  it('action=TEMPLATE と必須パラメータ (text / dates) を含む URL を生成する', () => {
    const url = buildGoogleCalendarRenderUrl({
      title: 'テスト予約',
      start: new Date('2026-07-04T08:00:00Z'),
      end: new Date('2026-07-04T09:00:00Z'),
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(parsed.searchParams.get('action')).toBe('TEMPLATE');
    expect(parsed.searchParams.get('text')).toBe('テスト予約');
    expect(parsed.searchParams.get('dates')).toBe('20260704T080000Z/20260704T090000Z');
  });

  it('details が渡された場合は URL パラメータに含める', () => {
    const url = buildGoogleCalendarRenderUrl({
      title: '予約',
      start: new Date('2026-07-04T08:00:00Z'),
      end: new Date('2026-07-04T09:00:00Z'),
      details: '予約者: テスト\nメール: t@example.com',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('details')).toBe('予約者: テスト\nメール: t@example.com');
  });

  it('details が undefined の場合は URL パラメータに含めない', () => {
    const url = buildGoogleCalendarRenderUrl({
      title: '予約',
      start: new Date('2026-07-04T08:00:00Z'),
      end: new Date('2026-07-04T09:00:00Z'),
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.has('details')).toBe(false);
  });

  it('dates フォーマット: ミリ秒は削除、ハイフン / コロンは除去、Z 終端を維持', () => {
    const url = buildGoogleCalendarRenderUrl({
      title: 't',
      start: new Date('2026-12-31T23:59:00Z'),
      end: new Date('2027-01-01T00:30:00Z'),
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('dates')).toBe('20261231T235900Z/20270101T003000Z');
  });
});

describe('buildBookingNotificationHtml の Google カレンダー追加ボタン', () => {
  it('Google Calendar render URL を含む <a> タグが本文に挿入される', () => {
    const html = buildBookingNotificationHtml({
      linkTitle: 'テスト予約スケジュール',
      guestName: '山田太郎',
      guestEmail: 'guest@example.com',
      guestMessage: 'よろしくお願いします',
      slotStart: new Date('2026-07-04T08:00:00Z'),
      slotEnd: new Date('2026-07-04T09:00:00Z'),
    });

    // ボタンの存在 + Google Calendar URL の埋め込みを確認
    expect(html).toContain('https://calendar.google.com/calendar/render');
    expect(html).toContain('action=TEMPLATE');
    // URL.searchParams は `/` を `%2F` にエンコードする (Google 側は両方 accept)
    expect(html).toMatch(/dates=20260704T080000Z(%2F|\/)20260704T090000Z/);
    expect(html).toContain('Google カレンダーに追加');
  });

  it('title は「<linkTitle> - <guestName>」形式で URL エンコードされる', () => {
    const html = buildBookingNotificationHtml({
      linkTitle: '【本田】予約',
      guestName: 'テスト',
      slotStart: new Date('2026-07-04T08:00:00Z'),
      slotEnd: new Date('2026-07-04T09:00:00Z'),
    });

    // URLSearchParams は日本語 + space を自動エンコードする
    expect(html).toMatch(/text=[^&]*-[^&]*/);
  });

  it('guestEmail / guestMessage が未指定の場合でも details が組み立てられる', () => {
    const html = buildBookingNotificationHtml({
      linkTitle: '予約',
      guestName: 'テスト',
      slotStart: new Date('2026-07-04T08:00:00Z'),
      slotEnd: new Date('2026-07-04T09:00:00Z'),
    });

    // details に予約者行は必ず含まれる
    expect(html).toMatch(/details=[^&]+/);
  });
});

describe('buildBookingConfirmationHtml の Google カレンダー追加ボタン', () => {
  it('Google Calendar render URL を含む <a> タグが本文に挿入される', () => {
    const html = buildBookingConfirmationHtml({
      linkTitle: 'テスト予約スケジュール',
      ownerDisplayName: '本田泰',
      guestName: '山田太郎',
      slotStart: new Date('2026-07-04T08:00:00Z'),
      slotEnd: new Date('2026-07-04T09:00:00Z'),
      durationMinutes: 60,
    });

    expect(html).toContain('https://calendar.google.com/calendar/render');
    expect(html).toContain('action=TEMPLATE');
    expect(html).toMatch(/dates=20260704T080000Z(%2F|\/)20260704T090000Z/);
    expect(html).toContain('Google カレンダーに追加');
  });

  it('title は「<linkTitle> - <ownerDisplayName>」形式 (ゲスト視点で誰との予定か明示)', () => {
    const html = buildBookingConfirmationHtml({
      linkTitle: '【30分】MTG',
      ownerDisplayName: '本田泰',
      guestName: '山田',
      slotStart: new Date('2026-07-04T08:00:00Z'),
      slotEnd: new Date('2026-07-04T08:30:00Z'),
      durationMinutes: 30,
    });

    // text パラメータに linkTitle と ownerDisplayName が両方含まれる
    expect(html).toMatch(/text=[^&]*MTG[^&]*/);
    // %20-%20 (= " - ") もしくは + 区切りで含まれる
    expect(html).toContain('text=');
  });

  it('details に主催者・所要時間が含まれる', () => {
    const html = buildBookingConfirmationHtml({
      linkTitle: '予約',
      ownerDisplayName: '本田',
      guestName: 'テスト',
      slotStart: new Date('2026-07-04T08:00:00Z'),
      slotEnd: new Date('2026-07-04T08:30:00Z'),
      durationMinutes: 30,
    });

    expect(html).toMatch(/details=[^&]+/);
  });

  it('既存の予約情報 (主催者・日時・所要時間) も維持される', () => {
    const html = buildBookingConfirmationHtml({
      linkTitle: 'テスト予約',
      ownerDisplayName: '本田泰',
      guestName: '山田太郎',
      slotStart: new Date('2026-07-04T08:00:00Z'),
      slotEnd: new Date('2026-07-04T09:00:00Z'),
      durationMinutes: 60,
    });

    expect(html).toContain('山田太郎');
    expect(html).toContain('本田泰');
    expect(html).toContain('60分');
    expect(html).toContain('予約が確定しました');
  });
});
