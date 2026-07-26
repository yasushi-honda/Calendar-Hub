import { describe, it, expect } from 'vitest';
import {
  buildBookingMirrorLinkFromFirestoreData,
  excludeOverlappingSlots,
} from '../lib/booking-mirror-link-utils.js';
import type { GoogleSlot } from '../lib/google-booking-mirror.js';

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

describe('excludeOverlappingSlots', () => {
  function slot(startIso: string, durationMinutes: number): GoogleSlot {
    return {
      startUnix: Math.floor(new Date(startIso).getTime() / 1000),
      durationMinutes,
    };
  }

  it('確定予約が無ければ全ての slot をそのまま返す', () => {
    const slots = [slot('2026-08-01T10:00:00Z', 60)];

    const result = excludeOverlappingSlots(slots, []);

    expect(result).toEqual(slots);
  });

  it('slot と完全一致する確定予約があれば除外する', () => {
    const slots = [slot('2026-08-01T10:00:00Z', 60)];
    const booked = [
      { start: new Date('2026-08-01T10:00:00Z'), end: new Date('2026-08-01T11:00:00Z') },
    ];

    const result = excludeOverlappingSlots(slots, booked);

    expect(result).toEqual([]);
  });

  it('確定予約が slot の一部と重なるだけでも除外する', () => {
    const slots = [slot('2026-08-01T10:00:00Z', 60)]; // 10:00-11:00
    const booked = [
      // 10:30-10:45 (slot の内側に完全に収まる部分重複)
      { start: new Date('2026-08-01T10:30:00Z'), end: new Date('2026-08-01T10:45:00Z') },
    ];

    const result = excludeOverlappingSlots(slots, booked);

    expect(result).toEqual([]);
  });

  it('確定予約が slot の終了時刻ちょうどに開始する場合は除外しない (隣接は重複ではない)', () => {
    const slots = [slot('2026-08-01T10:00:00Z', 60)]; // 10:00-11:00
    const booked = [
      { start: new Date('2026-08-01T11:00:00Z'), end: new Date('2026-08-01T12:00:00Z') },
    ];

    const result = excludeOverlappingSlots(slots, booked);

    expect(result).toEqual(slots);
  });

  it('確定予約が slot の開始時刻ちょうどに終了する場合は除外しない (隣接は重複ではない)', () => {
    const slots = [slot('2026-08-01T10:00:00Z', 60)]; // 10:00-11:00
    const booked = [
      { start: new Date('2026-08-01T09:00:00Z'), end: new Date('2026-08-01T10:00:00Z') },
    ];

    const result = excludeOverlappingSlots(slots, booked);

    expect(result).toEqual(slots);
  });

  it('複数 slot のうち重なるものだけを除外する', () => {
    const slotA = slot('2026-08-01T10:00:00Z', 60); // 10:00-11:00 (重複させる)
    const slotB = slot('2026-08-01T14:00:00Z', 60); // 14:00-15:00 (無関係)
    const booked = [
      { start: new Date('2026-08-01T10:30:00Z'), end: new Date('2026-08-01T10:45:00Z') },
    ];

    const result = excludeOverlappingSlots([slotA, slotB], booked);

    expect(result).toEqual([slotB]);
  });

  it('複数の確定予約のいずれかと重なれば除外する', () => {
    const slots = [slot('2026-08-01T10:00:00Z', 60)];
    const booked = [
      { start: new Date('2026-08-01T08:00:00Z'), end: new Date('2026-08-01T09:00:00Z') }, // 無関係
      { start: new Date('2026-08-01T10:30:00Z'), end: new Date('2026-08-01T10:45:00Z') }, // 重複
    ];

    const result = excludeOverlappingSlots(slots, booked);

    expect(result).toEqual([]);
  });
});
