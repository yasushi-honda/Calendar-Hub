import { describe, it, expect } from 'vitest';
import type { BookingMirrorLink } from '@calendar-hub/shared';
import {
  buildBookingMirrorLinkFromFirestoreData,
  applyBookingMirrorLinkDefaults,
  shouldCreateBlockEvent,
  validateBookingMirrorLinkInvariant,
  buildBookingMirrorLinkPatchUpdate,
} from '../lib/booking-mirror-link-utils.js';

// Firestore Timestamp のダミー実装 (toDate() のみ持てば十分)
function fakeTimestamp(date: Date) {
  return { toDate: () => date };
}

describe('buildBookingMirrorLinkFromFirestoreData', () => {
  it('必須フィールドをそのまま引き継ぐ', () => {
    const data = {
      id: 'link1',
      ownerUid: 'u1',
      title: 'タイトル',
      sourceUrl: 'https://calendar.app.google/abc',
      scheduleId: 'sched1',
      notificationEmail: 'owner@example.com',
      rangeDays: 30,
      status: 'active',
      expiresAt: null,
      createdAt: fakeTimestamp(new Date('2026-01-01T00:00:00Z')),
      updatedAt: fakeTimestamp(new Date('2026-01-02T00:00:00Z')),
    };

    const link = buildBookingMirrorLinkFromFirestoreData(data);

    expect(link.id).toBe('link1');
    expect(link.ownerUid).toBe('u1');
    expect(link.title).toBe('タイトル');
    expect(link.sourceUrl).toBe('https://calendar.app.google/abc');
    expect(link.scheduleId).toBe('sched1');
    expect(link.notificationEmail).toBe('owner@example.com');
    expect(link.rangeDays).toBe(30);
    expect(link.status).toBe('active');
  });

  it('Firestore Timestamp を Date に変換する', () => {
    const data = {
      id: 'link1',
      ownerUid: 'u1',
      title: 't',
      sourceUrl: 'https://calendar.app.google/abc',
      scheduleId: 'sched1',
      notificationEmail: 'owner@example.com',
      rangeDays: 30,
      status: 'active',
      expiresAt: fakeTimestamp(new Date('2026-06-01T00:00:00Z')),
      createdAt: fakeTimestamp(new Date('2026-01-01T00:00:00Z')),
      updatedAt: fakeTimestamp(new Date('2026-01-02T00:00:00Z')),
    };

    const link = buildBookingMirrorLinkFromFirestoreData(data);

    expect(link.createdAt).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(link.updatedAt).toEqual(new Date('2026-01-02T00:00:00Z'));
    expect(link.expiresAt).toEqual(new Date('2026-06-01T00:00:00Z'));
  });

  it('expiresAt が無ければ null を返す', () => {
    const data = {
      id: 'link1',
      ownerUid: 'u1',
      title: 't',
      sourceUrl: 'https://calendar.app.google/abc',
      scheduleId: 'sched1',
      notificationEmail: 'owner@example.com',
      rangeDays: 30,
      status: 'active',
      createdAt: fakeTimestamp(new Date()),
      updatedAt: fakeTimestamp(new Date()),
    };

    const link = buildBookingMirrorLinkFromFirestoreData(data);

    expect(link.expiresAt).toBeNull();
  });

  it('description が無ければ undefined を返す', () => {
    const data = {
      id: 'link1',
      ownerUid: 'u1',
      title: 't',
      sourceUrl: 'https://calendar.app.google/abc',
      scheduleId: 'sched1',
      notificationEmail: 'owner@example.com',
      rangeDays: 30,
      status: 'active',
      createdAt: fakeTimestamp(new Date()),
      updatedAt: fakeTimestamp(new Date()),
    };

    const link = buildBookingMirrorLinkFromFirestoreData(data);

    expect(link.description).toBeUndefined();
  });

  it('description が Firestore 上 null で保存されていても undefined に変換する (spread化での回帰防止)', () => {
    // 作成 API は description 未指定時に null を明示保存するため (booking-mirror-links.ts)、
    // spread ベースの mapper でも null が漏れ出ないことを固定する
    const data = {
      id: 'link1',
      ownerUid: 'u1',
      title: 't',
      description: null,
      sourceUrl: 'https://calendar.app.google/abc',
      scheduleId: 'sched1',
      notificationEmail: 'owner@example.com',
      rangeDays: 30,
      status: 'active',
      createdAt: fakeTimestamp(new Date()),
      updatedAt: fakeTimestamp(new Date()),
    };

    const link = buildBookingMirrorLinkFromFirestoreData(data);

    expect(link.description).toBeUndefined();
  });

  it('未知のフィールドが Firestore data にあっても spread で自動的に引き継がれる', () => {
    // 将来 BookingMirrorLink に追加されるフィールド (C1 拡張の autoCreateBlockEvent 等) が
    // このマッパーの更新漏れでサイレントに欠落しないことを保証する
    const data = {
      id: 'link1',
      ownerUid: 'u1',
      title: 't',
      sourceUrl: 'https://calendar.app.google/abc',
      scheduleId: 'sched1',
      notificationEmail: 'owner@example.com',
      rangeDays: 30,
      status: 'active',
      createdAt: fakeTimestamp(new Date()),
      updatedAt: fakeTimestamp(new Date()),
      futureField: 'future-value',
    };

    const link = buildBookingMirrorLinkFromFirestoreData(data);

    expect((link as unknown as Record<string, unknown>).futureField).toBe('future-value');
  });

  it('createdAt/updatedAt が無ければ現在時刻にフォールバックする', () => {
    const data = {
      id: 'link1',
      ownerUid: 'u1',
      title: 't',
      sourceUrl: 'https://calendar.app.google/abc',
      scheduleId: 'sched1',
      notificationEmail: 'owner@example.com',
      rangeDays: 30,
      status: 'active',
    };

    const link = buildBookingMirrorLinkFromFirestoreData(data);

    expect(link.createdAt).toBeInstanceOf(Date);
    expect(link.updatedAt).toBeInstanceOf(Date);
  });
});

describe('applyBookingMirrorLinkDefaults', () => {
  it('既存 document に autoCreateBlockEvent が無ければ false (稼働中リンクが突然書き込みを始めない)', () => {
    const result = applyBookingMirrorLinkDefaults({ title: 'old-link' });
    expect(result.autoCreateBlockEvent).toBe(false);
  });

  it('既存 document に blockCalendarId/blockAccountId が無ければ両方 null', () => {
    const result = applyBookingMirrorLinkDefaults({});
    expect(result.blockCalendarId).toBeNull();
    expect(result.blockAccountId).toBeNull();
  });

  it('明示的に true が指定されていれば true を返す', () => {
    const result = applyBookingMirrorLinkDefaults({ autoCreateBlockEvent: true });
    expect(result.autoCreateBlockEvent).toBe(true);
  });
});

function buildMirrorLink(overrides: Partial<BookingMirrorLink>): BookingMirrorLink {
  return {
    id: 'link1',
    ownerUid: 'u1',
    title: 't',
    sourceUrl: 'https://calendar.app.google/abc',
    scheduleId: 'sched1',
    notificationEmail: 'owner@example.com',
    rangeDays: 30,
    status: 'active',
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    autoCreateBlockEvent: false,
    blockCalendarId: null,
    blockAccountId: null,
    ...overrides,
  };
}

describe('shouldCreateBlockEvent', () => {
  it('autoCreateBlockEvent が false なら false', () => {
    expect(shouldCreateBlockEvent(buildMirrorLink({ autoCreateBlockEvent: false }))).toBe(false);
  });

  it('autoCreateBlockEvent が true でも blockCalendarId が無ければ false', () => {
    const link = buildMirrorLink({
      autoCreateBlockEvent: true,
      blockCalendarId: null,
      blockAccountId: 'acc1',
    });
    expect(shouldCreateBlockEvent(link)).toBe(false);
  });

  it('autoCreateBlockEvent が true でも blockAccountId が無ければ false', () => {
    const link = buildMirrorLink({
      autoCreateBlockEvent: true,
      blockCalendarId: 'cal1',
      blockAccountId: null,
    });
    expect(shouldCreateBlockEvent(link)).toBe(false);
  });

  it('3条件が全て揃えば true', () => {
    const link = buildMirrorLink({
      autoCreateBlockEvent: true,
      blockCalendarId: 'cal1',
      blockAccountId: 'acc1',
    });
    expect(shouldCreateBlockEvent(link)).toBe(true);
  });
});

describe('validateBookingMirrorLinkInvariant', () => {
  it('autoCreateBlockEvent=false なら blockCalendarId/blockAccountId が null でも ok', () => {
    const result = validateBookingMirrorLinkInvariant({
      autoCreateBlockEvent: false,
      blockCalendarId: null,
      blockAccountId: null,
    });
    expect(result.ok).toBe(true);
  });

  it('autoCreateBlockEvent=true で blockCalendarId が無ければ 400 相当のエラー', () => {
    const result = validateBookingMirrorLinkInvariant({
      autoCreateBlockEvent: true,
      blockCalendarId: null,
      blockAccountId: 'acc1',
    });
    expect(result.ok).toBe(false);
  });

  it('autoCreateBlockEvent=true で両方揃っていれば ok', () => {
    const result = validateBookingMirrorLinkInvariant({
      autoCreateBlockEvent: true,
      blockCalendarId: 'cal1',
      blockAccountId: 'acc1',
    });
    expect(result.ok).toBe(true);
  });
});

describe('buildBookingMirrorLinkPatchUpdate (Partial Update: 更新対象外フィールドは含めない)', () => {
  it('title のみ指定 → update に title のみ含まれる', () => {
    const update = buildBookingMirrorLinkPatchUpdate({ title: 'new' });
    expect(Object.keys(update)).toEqual(['title']);
    expect(update.title).toBe('new');
  });

  it('autoCreateBlockEvent のみ指定 → 他フィールドは update に含まれない', () => {
    const update = buildBookingMirrorLinkPatchUpdate({ autoCreateBlockEvent: true });
    expect(Object.keys(update)).toEqual(['autoCreateBlockEvent']);
    expect(update.autoCreateBlockEvent).toBe(true);
    expect(update.blockCalendarId).toBeUndefined();
    expect(update.blockAccountId).toBeUndefined();
    expect(update.title).toBeUndefined();
    expect(update.status).toBeUndefined();
  });

  it('blockCalendarId のみ指定 → 他フィールドは update に含まれない', () => {
    const update = buildBookingMirrorLinkPatchUpdate({ blockCalendarId: 'cal1' });
    expect(Object.keys(update)).toEqual(['blockCalendarId']);
    expect(update.autoCreateBlockEvent).toBeUndefined();
    expect(update.blockAccountId).toBeUndefined();
  });

  it('description: null を明示指定 → update.description は null (undefined とは区別する)', () => {
    const update = buildBookingMirrorLinkPatchUpdate({ description: null });
    expect(Object.keys(update)).toEqual(['description']);
    expect(update.description).toBeNull();
  });

  it('expiresAt: null を明示指定 → update.expiresAt は null', () => {
    const update = buildBookingMirrorLinkPatchUpdate({ expiresAt: null });
    expect(Object.keys(update)).toEqual(['expiresAt']);
    expect(update.expiresAt).toBeNull();
  });

  it('何も指定しない → update は空オブジェクト (Firestore 側の既存値を一切変更しない)', () => {
    const update = buildBookingMirrorLinkPatchUpdate({});
    expect(update).toEqual({});
  });

  it('複数フィールド指定 → 指定分のみ含まれ、他は含まれない', () => {
    const update = buildBookingMirrorLinkPatchUpdate({
      status: 'paused',
      autoCreateBlockEvent: false,
    });
    expect(Object.keys(update).sort()).toEqual(['autoCreateBlockEvent', 'status']);
    expect(update.title).toBeUndefined();
    expect(update.blockCalendarId).toBeUndefined();
  });
});
