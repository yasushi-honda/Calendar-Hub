import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TimeTreeAdapter,
  TimeTreeSessionExpiredError,
  normalizeAllDayEnd,
  type TimeTreeSession,
} from '../adapters/timetree.js';

const TEST_ACCOUNT_ID = 'timetree_test_acc_001';

// TimeTree内部APIのレスポンス型・パース検証（外部APIモック不要の単体テスト）

describe('TimeTree response parsing', () => {
  it('should parse v2 calendar response', () => {
    const raw = {
      calendars: [
        {
          id: 81277589,
          alias_code: 'uQKEghYYkinP',
          name: '仕事',
          author_id: 6930188,
          badge: 'calendar_badge/b3c2/2022-06-12/0-1655007731201.jpg',
          purpose: 'work',
          order: 1,
          deactivated_at: null,
          updated_at: 1655007731524,
          created_at: 1655007730870,
        },
        {
          id: 13608223,
          alias_code: 'nGU0Kjy2ennE',
          name: 'カレンダー',
          author_id: 6930188,
          badge: 'calendar_badge/dc56/2019-10-10/0-1570673555749.jpg',
          purpose: 'family',
          order: 0,
          deactivated_at: null,
          updated_at: 1623392385287,
          created_at: 1515208159270,
        },
      ],
    };

    const calendars = raw.calendars
      .filter((cal) => cal.deactivated_at === null)
      .map((cal) => ({
        id: String(cal.id),
        name: cal.name,
        description: cal.purpose || undefined,
        provider: 'timetree' as const,
        accountId: '',
      }));

    expect(calendars).toHaveLength(2);
    expect(calendars[0].id).toBe('81277589');
    expect(calendars[0].name).toBe('仕事');
    expect(calendars[1].id).toBe('13608223');
    expect(calendars[1].name).toBe('カレンダー');
  });

  it('should filter deactivated calendars', () => {
    const raw = {
      calendars: [
        { id: 1, name: 'Active', deactivated_at: null, purpose: 'work' },
        { id: 2, name: 'Deleted', deactivated_at: '2026-01-01', purpose: 'old' },
      ],
    };

    const active = raw.calendars.filter((cal) => cal.deactivated_at === null);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('Active');
  });

  it('should parse millisecond timestamps to Date', () => {
    const startMs = 1774828800000; // 2026-03-27T12:00:00.000Z
    const endMs = 1774832400000;

    const start = new Date(startMs);
    const end = new Date(endMs);

    expect(start.getFullYear()).toBe(2026);
    expect(end.getTime() - start.getTime()).toBe(3600000); // 1 hour
  });

  it('should filter events by time range', () => {
    const timeMin = new Date('2026-03-01T00:00:00Z');
    const timeMax = new Date('2026-04-01T00:00:00Z');

    const events = [
      {
        start_at: new Date('2026-03-15T10:00:00Z').getTime(),
        end_at: new Date('2026-03-15T11:00:00Z').getTime(),
      },
      {
        start_at: new Date('2026-02-15T10:00:00Z').getTime(),
        end_at: new Date('2026-02-15T11:00:00Z').getTime(),
      },
      {
        start_at: new Date('2026-04-15T10:00:00Z').getTime(),
        end_at: new Date('2026-04-15T11:00:00Z').getTime(),
      },
      // Edge: event spans boundary
      {
        start_at: new Date('2026-02-28T23:00:00Z').getTime(),
        end_at: new Date('2026-03-01T01:00:00Z').getTime(),
      },
    ];

    const filtered = events.filter((ev) => {
      const start = new Date(ev.start_at);
      const end = new Date(ev.end_at);
      return start < timeMax && end > timeMin;
    });

    expect(filtered).toHaveLength(2); // March event + boundary-spanning event
  });

  it('should handle event with null note/location', () => {
    const raw = {
      id: 'abc',
      title: 'テスト',
      start_at: 1774828800000,
      end_at: 1774832400000,
      all_day: false,
      note: null,
      location: null,
    };

    const event = {
      title: raw.title || '(無題)',
      description: raw.note || undefined,
      location: raw.location || undefined,
    };

    expect(event.title).toBe('テスト');
    expect(event.description).toBeUndefined();
    expect(event.location).toBeUndefined();
  });

  it('should handle event with empty title', () => {
    const rawTitle = '';
    const title = rawTitle || '(無題)';
    expect(title).toBe('(無題)');
  });

  it('should parse CSRF token from HTML', () => {
    const html = '<meta name="csrf-token" content="abc123XYZ_token">';
    const match = html.match(/csrf-token['"]\s+content=['"](.*?)['"]/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('abc123XYZ_token');
  });

  it('should fail gracefully when CSRF token not found', () => {
    const html = '<html><head><title>No CSRF</title></head></html>';
    const match = html.match(/csrf-token['"]\s+content=['"](.*?)['"]/);
    expect(match).toBeNull();
  });
});

describe('TimeTree login body format', () => {
  it('should use uid field (not email)', () => {
    const email = 'user@example.com';
    const password = 'pass';
    const uuid = 'test-uuid';

    const body = JSON.stringify({ uid: email, password, uuid });
    const parsed = JSON.parse(body);

    expect(parsed.uid).toBe(email);
    expect(parsed.email).toBeUndefined();
    expect(parsed.password).toBe(password);
  });
});

describe('TimeTreeAdapter constructor guard', () => {
  it('should throw when options.accountId is empty string', () => {
    const session: TimeTreeSession = {
      sessionId: 'sid',
      csrfToken: 'csrf',
      expiresAt: Date.now() + 60 * 60 * 1000,
    };
    expect(() => new TimeTreeAdapter(session, { accountId: '' })).toThrow(/accountId is required/);
  });
});

describe('TimeTreeAdapter session expiry observability', () => {
  const validSession: TimeTreeSession = {
    sessionId: 'sid',
    csrfToken: 'csrf',
    expiresAt: Date.now() + 60 * 60 * 1000, // 1時間後
  };
  const expiredSession: TimeTreeSession = {
    sessionId: 'sid',
    csrfToken: 'csrf',
    expiresAt: Date.now() - 60 * 60 * 1000, // 1時間前
  };

  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetchOk(payload: unknown): ReturnType<typeof vi.fn> {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response);
  }

  function mockFetchSequence(responses: Array<{ status: number; payload?: unknown }>) {
    const fn = vi.fn();
    for (const r of responses) {
      fn.mockResolvedValueOnce({
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        json: async () => r.payload ?? {},
      } as Response);
    }
    return fn;
  }

  it.each([400, 403])(
    'should log [TT-SESSION-EXPIRED] and throw generic error when %i received without reLoginFn (permanent, not session-related)',
    async (status) => {
      fetchSpy = mockFetchSequence([{ status }]);
      vi.stubGlobal('fetch', fetchSpy);

      const adapter = new TimeTreeAdapter(validSession, { accountId: TEST_ACCOUNT_ID });
      await expect(adapter.listCalendars()).rejects.toThrow(
        new RegExp(`TimeTree listCalendars failed: ${status}`),
      );

      const warned = warnSpy.mock.calls.flat().join(' ');
      expect(warned).toContain('[TT-SESSION-EXPIRED]');
      expect(warned).toContain(`accountId=${TEST_ACCOUNT_ID}`);
      expect(warned).toContain('reason=httpStatus');
      expect(warned).toContain(`status=${status}`);
      expect(warned).toContain('reLoginAvailable=false');
    },
  );

  it.each([400, 403])(
    'should NOT attempt reLogin when %i received even if reLoginFn is provided (permanent error classification)',
    async (status) => {
      fetchSpy = mockFetchSequence([{ status }]);
      vi.stubGlobal('fetch', fetchSpy);
      const reLoginFn = vi.fn().mockResolvedValue({
        sessionId: 'new-sid',
        csrfToken: 'new-csrf',
        expiresAt: Date.now() + 60 * 60 * 1000,
      });

      const adapter = new TimeTreeAdapter(validSession, { accountId: TEST_ACCOUNT_ID, reLoginFn });
      await expect(adapter.listCalendars()).rejects.toThrow(
        new RegExp(`TimeTree listCalendars failed: ${status}`),
      );

      expect(reLoginFn).not.toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    },
  );

  it('should throw TimeTreeSessionExpiredError when 401 received without reLoginFn', async () => {
    fetchSpy = mockFetchSequence([{ status: 401 }]);
    vi.stubGlobal('fetch', fetchSpy);

    const adapter = new TimeTreeAdapter(validSession, { accountId: TEST_ACCOUNT_ID });
    let caught: unknown;
    try {
      await adapter.listCalendars();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TimeTreeSessionExpiredError);
    expect((caught as Error).message).toContain(`accountId=${TEST_ACCOUNT_ID}`);

    const warned = warnSpy.mock.calls.flat().join(' ');
    expect(warned).toContain('[TT-SESSION-EXPIRED]');
    expect(warned).toContain('reason=httpStatus');
    expect(warned).toContain('status=401');
    expect(warned).toContain('reLoginAvailable=false');
  });

  it('should log [TT-SESSION-RELOGIN-INEFFECTIVE] when retry after reLogin still fails', async () => {
    fetchSpy = mockFetchSequence([{ status: 401 }, { status: 401 }]);
    vi.stubGlobal('fetch', fetchSpy);
    const reLoginFn = vi.fn().mockResolvedValue({
      sessionId: 'new-sid',
      csrfToken: 'new-csrf',
      expiresAt: Date.now() + 60 * 60 * 1000,
    });

    const adapter = new TimeTreeAdapter(validSession, { accountId: TEST_ACCOUNT_ID, reLoginFn });
    await expect(adapter.listCalendars()).rejects.toThrow(/TimeTree listCalendars failed: 401/);

    expect(reLoginFn).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const warned = warnSpy.mock.calls.flat().join(' ');
    expect(warned).toContain('[TT-SESSION-RELOGIN-INEFFECTIVE]');
    expect(warned).toContain(`accountId=${TEST_ACCOUNT_ID}`);
    expect(warned).toContain('status=401');
  });

  it('should log [TT-SESSION-EXPIRED] reason=expiresAt when session is past expiresAt', async () => {
    fetchSpy = mockFetchOk({ calendars: [] });
    vi.stubGlobal('fetch', fetchSpy);

    const adapter = new TimeTreeAdapter(expiredSession, { accountId: TEST_ACCOUNT_ID });
    await adapter.listCalendars();

    const warned = warnSpy.mock.calls.flat().join(' ');
    expect(warned).toContain('[TT-SESSION-EXPIRED]');
    expect(warned).toContain(`accountId=${TEST_ACCOUNT_ID}`);
    expect(warned).toContain('reason=expiresAt');
    expect(warned).toContain('reLoginAvailable=false');
  });

  it('should log RELOGIN-ATTEMPT and RELOGIN-OK when reLoginFn succeeds after 401', async () => {
    fetchSpy = mockFetchSequence([{ status: 401 }, { status: 200, payload: { calendars: [] } }]);
    vi.stubGlobal('fetch', fetchSpy);

    const reLoginFn = vi.fn().mockResolvedValue({
      sessionId: 'new-sid',
      csrfToken: 'new-csrf',
      expiresAt: Date.now() + 60 * 60 * 1000,
    });

    const adapter = new TimeTreeAdapter(validSession, { accountId: TEST_ACCOUNT_ID, reLoginFn });
    await adapter.listCalendars();

    const warned = warnSpy.mock.calls.flat().join(' ');
    const informed = infoSpy.mock.calls.flat().join(' ');
    expect(warned).toContain('[TT-SESSION-EXPIRED]');
    expect(warned).toContain(`accountId=${TEST_ACCOUNT_ID}`);
    expect(warned).toContain('reLoginAvailable=true');
    expect(informed).toContain('[TT-SESSION-RELOGIN-ATTEMPT]');
    expect(informed).toContain('[TT-SESSION-RELOGIN-OK]');
    expect(reLoginFn).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should auto-refresh and retry when expiresAt has passed and reLoginFn is provided', async () => {
    fetchSpy = mockFetchOk({ calendars: [] });
    vi.stubGlobal('fetch', fetchSpy);

    const reLoginFn = vi.fn().mockResolvedValue({
      sessionId: 'new-sid',
      csrfToken: 'new-csrf',
      expiresAt: Date.now() + 60 * 60 * 1000,
    });

    const adapter = new TimeTreeAdapter(expiredSession, { accountId: TEST_ACCOUNT_ID, reLoginFn });
    await adapter.listCalendars();

    const warned = warnSpy.mock.calls.flat().join(' ');
    const informed = infoSpy.mock.calls.flat().join(' ');
    expect(warned).toContain('[TT-SESSION-EXPIRED]');
    expect(warned).toContain(`accountId=${TEST_ACCOUNT_ID}`);
    expect(warned).toContain('reason=expiresAt');
    expect(warned).toContain('reLoginAvailable=true');
    expect(informed).toContain('[TT-SESSION-RELOGIN-ATTEMPT]');
    expect(informed).toContain('[TT-SESSION-RELOGIN-OK]');
    expect(reLoginFn).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('should log RELOGIN-FAIL and rethrow when reLoginFn throws', async () => {
    fetchSpy = mockFetchSequence([{ status: 401 }]);
    vi.stubGlobal('fetch', fetchSpy);

    const reLoginFn = vi.fn().mockRejectedValue(new Error('login server down'));

    const adapter = new TimeTreeAdapter(validSession, { accountId: TEST_ACCOUNT_ID, reLoginFn });
    await expect(adapter.listCalendars()).rejects.toThrow(/login server down/);

    const errored = errorSpy.mock.calls.flat().join(' ');
    expect(errored).toContain('[TT-SESSION-RELOGIN-FAIL]');
    expect(errored).toContain('login server down');
  });
});

/**
 * TimeTree all-day end_at の包含/排他解釈正規化 (ADR-008 スコープ外項目の解消)
 *
 * TimeTree raw event の実観測モデル:
 * - 単日終日:        end_at = start_at + 24h (= 翌日0時 JST、exclusive)
 * - 2日間終日:       end_at = start_at + 24h (= 最終日0時 JST、**単日と raw 値が同一**)
 * - N日間終日 (N>=3): end_at = start_at + (N-1)*24h (= 最終日0時 JST、inclusive)
 *
 * 既知の制限: 2日間終日は raw だけでは単日終日と区別不能のため、本関数では未修正のまま。
 * N>=3 のケース (ユーザー報告: 1〜3日終日) のみ正規化される。
 */
describe('normalizeAllDayEnd: TimeTree all-day end_at 包含/排他解釈', () => {
  const oneDayMs = 24 * 60 * 60 * 1000;
  // JST 2026-05-01 00:00 = UTC 2026-04-30 15:00
  const may1JstUtc = new Date('2026-04-30T15:00:00Z').getTime();
  const may2JstUtc = may1JstUtc + oneDayMs;
  const may3JstUtc = may1JstUtc + 2 * oneDayMs;
  const may4JstUtc = may1JstUtc + 3 * oneDayMs;
  const may5JstUtc = may1JstUtc + 4 * oneDayMs;

  it('単日終日 (raw diff=24h): end は変更されない (既に exclusive 翌日0時)', () => {
    // 5/1 単日終日: raw start = 5/1 0:00 JST, raw end = 5/2 0:00 JST
    expect(normalizeAllDayEnd(may1JstUtc, may2JstUtc)).toBe(may2JstUtc);
  });

  it('2日間終日 (raw diff=24h): 単日と raw 値が同一のため変更されない (既知の制限)', () => {
    // 5/1-5/2 終日: raw end = 5/2 0:00 (inclusive 最終日0時) = 単日 5/1 と同じ raw
    // 結果: Google には 5/2 exclusive → 表示 5/1 のみ (本来は 5/1-5/2 が望ましいが、
    // raw 値だけでは判別不能のため本関数のスコープ外。実機観測で別 Issue として対応)
    expect(normalizeAllDayEnd(may1JstUtc, may2JstUtc)).toBe(may2JstUtc);
  });

  it('3日間終日 (raw diff=48h): end は +24h 正規化される (ユーザー報告ケース 1日-3日)', () => {
    // 5/1-5/3 終日: raw end = 5/3 0:00 (inclusive) → 内部 5/4 0:00 (exclusive)
    expect(normalizeAllDayEnd(may1JstUtc, may3JstUtc)).toBe(may4JstUtc);
  });

  it('4日間終日 (raw diff=72h): end は +24h 正規化される', () => {
    // 5/1-5/4 終日: raw end = 5/4 0:00 (inclusive) → 内部 5/5 0:00 (exclusive)
    expect(normalizeAllDayEnd(may1JstUtc, may4JstUtc)).toBe(may5JstUtc);
  });

  it('時間指定 (diff=1h): end は変更されない', () => {
    const oneHourMs = 60 * 60 * 1000;
    expect(normalizeAllDayEnd(may1JstUtc, may1JstUtc + oneHourMs)).toBe(may1JstUtc + oneHourMs);
  });

  it('境界: start == end (異常入力) は変更されない', () => {
    expect(normalizeAllDayEnd(may1JstUtc, may1JstUtc)).toBe(may1JstUtc);
  });

  it('境界: diff が 24h 刻みでない (例: 36h) は変更されない', () => {
    const halfDayMs = 12 * 60 * 60 * 1000;
    const irregular = may1JstUtc + oneDayMs + halfDayMs;
    expect(normalizeAllDayEnd(may1JstUtc, irregular)).toBe(irregular);
  });

  it('異常入力: NaN は元値を返す (silent normalization 防止)', () => {
    expect(normalizeAllDayEnd(NaN, may1JstUtc)).toBe(may1JstUtc);
    expect(normalizeAllDayEnd(may1JstUtc, NaN)).toBeNaN();
  });

  it('異常入力: Infinity は元値を返す', () => {
    expect(normalizeAllDayEnd(may1JstUtc, Infinity)).toBe(Infinity);
    expect(normalizeAllDayEnd(-Infinity, may1JstUtc)).toBe(may1JstUtc);
  });

  it('異常入力: 負値 (end < start) は触らない', () => {
    // diff が負 → diff < 2*oneDay は true → 早期 return (元値返却)
    expect(normalizeAllDayEnd(may2JstUtc, may1JstUtc)).toBe(may1JstUtc);
  });
});

describe('TimeTreeAdapter.listEvents - 複数日終日の end 正規化', () => {
  const validSession: TimeTreeSession = {
    sessionId: 'sid',
    csrfToken: 'csrf',
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
  const oneDayMs = 24 * 60 * 60 * 1000;

  it('3日間終日イベント: 内部 CalendarEvent の end は +24h 正規化される (ユーザー報告ケース)', async () => {
    // JST 5/1-5/3 終日: TimeTree raw は end_at = 5/3 0:00 JST (inclusive)
    const may1JstMs = new Date('2026-04-30T15:00:00Z').getTime(); // 5/1 0:00 JST
    const may3JstMs = may1JstMs + 2 * oneDayMs; // 5/3 0:00 JST (TimeTree end_at)
    const may4JstMs = may1JstMs + 3 * oneDayMs; // 5/4 0:00 JST (期待される内部 end)

    const rawEvent = {
      id: 'tt-multiday-1',
      title: '3日連続イベント',
      start_at: may1JstMs,
      end_at: may3JstMs,
      all_day: true,
      start_timezone: 'Asia/Tokyo',
      end_timezone: 'Asia/Tokyo',
      note: '',
      location: '',
      location_lat: '',
      location_lon: '',
      category: '',
      calendar_id: 'cal-1',
      updated_at: 0,
      created_at: 0,
      recurrences: [],
    };

    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ events: [rawEvent] }),
    } as Response);
    vi.stubGlobal('fetch', fetchSpy);

    const adapter = new TimeTreeAdapter(validSession, { accountId: TEST_ACCOUNT_ID });
    const tMin = new Date('2026-04-01T00:00:00Z');
    const tMax = new Date('2026-06-01T00:00:00Z');
    const events = await adapter.listEvents('cal-1', tMin, tMax);

    expect(events).toHaveLength(1);
    expect(events[0].isAllDay).toBe(true);
    expect(events[0].start.getTime()).toBe(may1JstMs);
    // 修正前は end = may3JstMs (= 5/3 0:00) で Google には 5/3 exclusive → 表示 1-2 日 (バグ)
    // 修正後は end = may4JstMs (= 5/4 0:00) で Google には 5/4 exclusive → 表示 1-3 日 (正しい)
    expect(events[0].end.getTime()).toBe(may4JstMs);

    vi.unstubAllGlobals();
  });

  it('単日終日イベント: 内部 end は raw end_at と同一 (既に exclusive)', async () => {
    const may1JstMs = new Date('2026-04-30T15:00:00Z').getTime();
    const may2JstMs = may1JstMs + oneDayMs;

    const rawEvent = {
      id: 'tt-singleday-1',
      title: '単日イベント',
      start_at: may1JstMs,
      end_at: may2JstMs,
      all_day: true,
      start_timezone: 'Asia/Tokyo',
      end_timezone: 'Asia/Tokyo',
      note: '',
      location: '',
      location_lat: '',
      location_lon: '',
      category: '',
      calendar_id: 'cal-1',
      updated_at: 0,
      created_at: 0,
      recurrences: [],
    };

    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ events: [rawEvent] }),
    } as Response);
    vi.stubGlobal('fetch', fetchSpy);

    const adapter = new TimeTreeAdapter(validSession, { accountId: TEST_ACCOUNT_ID });
    const tMin = new Date('2026-04-01T00:00:00Z');
    const tMax = new Date('2026-06-01T00:00:00Z');
    const events = await adapter.listEvents('cal-1', tMin, tMax);

    expect(events).toHaveLength(1);
    expect(events[0].end.getTime()).toBe(may2JstMs);

    vi.unstubAllGlobals();
  });

  it('時間指定イベント: 内部 end は raw end_at と同一', async () => {
    const start = new Date('2026-05-01T01:00:00Z').getTime();
    const end = new Date('2026-05-01T02:00:00Z').getTime();

    const rawEvent = {
      id: 'tt-timed-1',
      title: '時間指定イベント',
      start_at: start,
      end_at: end,
      all_day: false,
      start_timezone: 'Asia/Tokyo',
      end_timezone: 'Asia/Tokyo',
      note: '',
      location: '',
      location_lat: '',
      location_lon: '',
      category: '',
      calendar_id: 'cal-1',
      updated_at: 0,
      created_at: 0,
      recurrences: [],
    };

    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ events: [rawEvent] }),
    } as Response);
    vi.stubGlobal('fetch', fetchSpy);

    const adapter = new TimeTreeAdapter(validSession, { accountId: TEST_ACCOUNT_ID });
    const tMin = new Date('2026-04-01T00:00:00Z');
    const tMax = new Date('2026-06-01T00:00:00Z');
    const events = await adapter.listEvents('cal-1', tMin, tMax);

    expect(events).toHaveLength(1);
    expect(events[0].end.getTime()).toBe(end);

    vi.unstubAllGlobals();
  });

  it('複数日終日: 終端日付近の取得でも範囲フィルタで欠落しない (Codex 指摘: 範囲フィルタ漏れ修正)', async () => {
    // 5/1-5/3 終日: raw end_at = 5/3 0:00 (inclusive)
    // timeMin = 5/3 0:00 で取得しても、正規化後 end = 5/4 0:00 で範囲内と判定されること
    const may1JstMs = new Date('2026-04-30T15:00:00Z').getTime();
    const may3JstMs = may1JstMs + 2 * oneDayMs; // = raw end_at かつ timeMin
    const may4JstMs = may1JstMs + 3 * oneDayMs;

    const rawEvent = {
      id: 'tt-multiday-boundary',
      title: '終端境界',
      start_at: may1JstMs,
      end_at: may3JstMs,
      all_day: true,
      start_timezone: 'Asia/Tokyo',
      end_timezone: 'Asia/Tokyo',
      note: '',
      location: '',
      location_lat: '',
      location_lon: '',
      category: '',
      calendar_id: 'cal-1',
      updated_at: 0,
      created_at: 0,
      recurrences: [],
    };

    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ events: [rawEvent] }),
    } as Response);
    vi.stubGlobal('fetch', fetchSpy);

    const adapter = new TimeTreeAdapter(validSession, { accountId: TEST_ACCOUNT_ID });
    // 修正前は raw end (= may3JstMs) > timeMin (= may3JstMs) が false で欠落していたケース
    const tMin = new Date(may3JstMs);
    const tMax = new Date('2026-06-01T00:00:00Z');
    const events = await adapter.listEvents('cal-1', tMin, tMax);

    expect(events).toHaveLength(1);
    expect(events[0].end.getTime()).toBe(may4JstMs);

    vi.unstubAllGlobals();
  });

  it('RRULE 経路: 複数日終日の繰り返しマスターも各インスタンスで end が正規化される', async () => {
    // 5/1-5/3 終日を毎週繰り返し: 各インスタンスの end が +24h されること
    const may1JstMs = new Date('2026-04-30T15:00:00Z').getTime();
    const may3JstMs = may1JstMs + 2 * oneDayMs;

    const rawEvent = {
      id: 'tt-multiday-rrule',
      title: '週次複数日終日',
      start_at: may1JstMs,
      end_at: may3JstMs,
      all_day: true,
      start_timezone: 'Asia/Tokyo',
      end_timezone: 'Asia/Tokyo',
      note: '',
      location: '',
      location_lat: '',
      location_lon: '',
      category: '',
      calendar_id: 'cal-1',
      updated_at: 0,
      created_at: 0,
      recurrences: ['RRULE:FREQ=WEEKLY;COUNT=2'],
    };

    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ events: [rawEvent] }),
    } as Response);
    vi.stubGlobal('fetch', fetchSpy);

    const adapter = new TimeTreeAdapter(validSession, { accountId: TEST_ACCOUNT_ID });
    const tMin = new Date('2026-04-01T00:00:00Z');
    const tMax = new Date('2026-06-01T00:00:00Z');
    const events = await adapter.listEvents('cal-1', tMin, tMax);

    expect(events).toHaveLength(2);
    // 各インスタンスの duration が 72h (= 3日分の exclusive 範囲) であること
    for (const ev of events) {
      const durationMs = ev.end.getTime() - ev.start.getTime();
      expect(durationMs).toBe(3 * oneDayMs);
      expect(ev.isAllDay).toBe(true);
    }
    // originalId は start ベースの suffix で生成されるため、_R で始まる
    expect(events[0].originalId).toMatch(/^tt-multiday-rrule_R\d{8}$/);

    vi.unstubAllGlobals();
  });
});
