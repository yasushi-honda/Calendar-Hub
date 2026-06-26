import { describe, it, expect } from 'vitest';
import {
  parseSlotResponse,
  resolveScheduleId,
  BookingMirrorError,
} from '../lib/google-booking-mirror.js';

describe('parseSlotResponse', () => {
  it('PoC で取得した実 fixture から slot 配列を抽出する', () => {
    // 2026-06-26 PoC で実際に取得した gRPC-web response の縮約版
    // [[[[["1782466200"],60]],[[["1782469800"],60]],[[["1782514800"],60]]]]
    const fixture = [[[[['1782466200'], 60]], [[['1782469800'], 60]], [[['1782514800'], 60]]]];
    const result = parseSlotResponse(fixture);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ startUnix: 1782466200, durationMinutes: 60 });
    expect(result[1]).toEqual({ startUnix: 1782469800, durationMinutes: 60 });
    expect(result[2]).toEqual({ startUnix: 1782514800, durationMinutes: 60 });
  });

  it('data[0] が null のとき空配列を返す (営業時間外 / 全予定埋まり)', () => {
    const result = parseSlotResponse([null]);
    expect(result).toEqual([]);
  });

  it('top-level が array でないとき invalid_shape エラーを投げる', () => {
    expect(() => parseSlotResponse({ foo: 'bar' } as unknown)).toThrowError(BookingMirrorError);
    try {
      parseSlotResponse('not array' as unknown);
    } catch (err) {
      expect(err).toBeInstanceOf(BookingMirrorError);
      expect((err as BookingMirrorError).kind).toBe('parse');
      expect((err as BookingMirrorError).subKind).toBe('invalid_shape');
    }
  });

  it('Google エラーペイロード形式 ({error: {...}}) を検出する', () => {
    const errorPayload = { error: { code: 403, message: 'PERMISSION_DENIED' } };
    try {
      parseSlotResponse(errorPayload);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BookingMirrorError);
      expect((err as BookingMirrorError).subKind).toBe('google_error_payload');
    }
  });

  it('不完全な slot 要素は skip される (defensive)', () => {
    const fixture = [
      [
        [[['1782466200'], 60]], // OK
        [[['not-a-number'], 60]], // OK (parseInt → NaN → skip)
        [[['1782469800']]], // duration なし → skip
        [[[1782514800], 60]], // ts not string → skip
        [[['1782514800'], 60]], // OK
      ],
    ];
    const result = parseSlotResponse(fixture);
    // 'not-a-number' は parseInt で NaN になり skip される
    expect(result).toEqual([
      { startUnix: 1782466200, durationMinutes: 60 },
      { startUnix: 1782514800, durationMinutes: 60 },
    ]);
  });
});

describe('resolveScheduleId (完全 URL のみ、短縮 URL は network)', () => {
  it('完全 URL から schedule ID を抽出する', async () => {
    const id = await resolveScheduleId(
      'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ1eaFrYGKa4y8yOXMORxwrEGNl3cTSsOyTf38BAxmiukcpKjxE2apxUVBayl6IXHEIVJ47tculQ',
    );
    expect(id).toBe(
      'AcZssZ1eaFrYGKa4y8yOXMORxwrEGNl3cTSsOyTf38BAxmiukcpKjxE2apxUVBayl6IXHEIVJ47tculQ',
    );
  });

  it('空文字を渡すと invalid_input エラー', async () => {
    await expect(resolveScheduleId('')).rejects.toThrowError(BookingMirrorError);
    await expect(resolveScheduleId('   ')).rejects.toThrowError(BookingMirrorError);
  });

  it('URL でない文字列は not_url エラー', async () => {
    try {
      await resolveScheduleId('not-a-url');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BookingMirrorError);
      expect((err as BookingMirrorError).subKind).toBe('not_url');
    }
  });

  it('サポート対象外ホストの URL は unsupported_host エラー', async () => {
    try {
      await resolveScheduleId('https://example.com/foo');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BookingMirrorError);
      expect((err as BookingMirrorError).subKind).toBe('unsupported_host');
    }
  });

  it('完全 URL に schedule ID が含まれていない場合 no_id_in_path エラー', async () => {
    try {
      await resolveScheduleId('https://calendar.google.com/calendar/u/0/appointments/schedules/');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BookingMirrorError);
      expect((err as BookingMirrorError).subKind).toBe('no_id_in_path');
    }
  });
});
