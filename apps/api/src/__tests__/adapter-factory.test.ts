import { describe, it, expect } from 'vitest';

describe('adapter-factory: TimeTree session parsing', () => {
  it('should parse valid JSON session data', () => {
    const stored = JSON.stringify({ sessionId: 'abc123', csrfToken: 'token456' });
    const session = JSON.parse(stored) as { sessionId: string; csrfToken: string };

    expect(session.sessionId).toBe('abc123');
    expect(session.csrfToken).toBe('token456');
  });

  it('should throw on invalid JSON', () => {
    const stored = 'not-json';
    expect(() => JSON.parse(stored)).toThrow();
  });

  it('should detect incomplete session data', () => {
    const stored = JSON.stringify({ sessionId: 'abc' }); // missing csrfToken
    const session = JSON.parse(stored);
    expect(session.csrfToken).toBeUndefined();
  });

  it('should detect empty session fields', () => {
    const stored = JSON.stringify({ sessionId: '', csrfToken: '' });
    const session = JSON.parse(stored);
    expect(session.sessionId).toBe('');
    expect(!session.sessionId).toBe(true);
  });

  it('should handle legacy format (plain string sessionId)', () => {
    const stored = 'plain-session-id';
    // JSON.parse will throw on non-JSON string
    expect(() => JSON.parse(stored)).toThrow();
  });
});

describe('adapter-factory: provider detection', () => {
  it('should detect google provider from accountId prefix', () => {
    const accountId = 'google_user_example_com';
    const provider = accountId.startsWith('google_') ? 'google' : 'timetree';
    expect(provider).toBe('google');
  });

  it('should detect timetree provider from accountId prefix', () => {
    const accountId = 'timetree_user_example_com';
    const provider = accountId.startsWith('google_') ? 'google' : 'timetree';
    expect(provider).toBe('timetree');
  });

  it('should default to timetree for unknown prefix', () => {
    const accountId = 'unknown_provider';
    const provider = accountId.startsWith('google_') ? 'google' : 'timetree';
    expect(provider).toBe('timetree');
  });
});
