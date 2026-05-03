import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimeTreeAdapter, type TimeTreeSession } from '../adapters/timetree.js';

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

  it('should log [TT-SESSION-EXPIRED] reason=httpStatus when 401 received without reLoginFn', async () => {
    fetchSpy = mockFetchSequence([{ status: 401 }]);
    vi.stubGlobal('fetch', fetchSpy);

    const adapter = new TimeTreeAdapter(validSession);
    await expect(adapter.listCalendars()).rejects.toThrow(/TimeTree listCalendars failed: 401/);

    const warned = warnSpy.mock.calls.flat().join(' ');
    expect(warned).toContain('[TT-SESSION-EXPIRED]');
    expect(warned).toContain('reason=httpStatus');
    expect(warned).toContain('status=401');
    expect(warned).toContain('reLoginAvailable=false');
  });

  it('should log [TT-SESSION-EXPIRED] reason=expiresAt when session is past expiresAt', async () => {
    fetchSpy = mockFetchOk({ calendars: [] });
    vi.stubGlobal('fetch', fetchSpy);

    const adapter = new TimeTreeAdapter(expiredSession);
    await adapter.listCalendars();

    const warned = warnSpy.mock.calls.flat().join(' ');
    expect(warned).toContain('[TT-SESSION-EXPIRED]');
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

    const adapter = new TimeTreeAdapter(validSession, reLoginFn);
    await adapter.listCalendars();

    const warned = warnSpy.mock.calls.flat().join(' ');
    const informed = infoSpy.mock.calls.flat().join(' ');
    expect(warned).toContain('[TT-SESSION-EXPIRED]');
    expect(warned).toContain('reLoginAvailable=true');
    expect(informed).toContain('[TT-SESSION-RELOGIN-ATTEMPT]');
    expect(informed).toContain('[TT-SESSION-RELOGIN-OK]');
    expect(reLoginFn).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should log RELOGIN-FAIL and rethrow when reLoginFn throws', async () => {
    fetchSpy = mockFetchSequence([{ status: 401 }]);
    vi.stubGlobal('fetch', fetchSpy);

    const reLoginFn = vi.fn().mockRejectedValue(new Error('login server down'));

    const adapter = new TimeTreeAdapter(validSession, reLoginFn);
    await expect(adapter.listCalendars()).rejects.toThrow(/login server down/);

    const errored = errorSpy.mock.calls.flat().join(' ');
    expect(errored).toContain('[TT-SESSION-RELOGIN-FAIL]');
    expect(errored).toContain('login server down');
  });
});
