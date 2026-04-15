import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyMailError, logMailFailure } from '../lib/mail-fail.js';

describe('classifyMailError', () => {
  it('classifies invalid_grant as AUTH', () => {
    const err = Object.assign(new Error('invalid_grant'), {
      response: { data: { error: 'invalid_grant' } },
    });
    const result = classifyMailError(err);
    expect(result.kind).toBe('AUTH');
    expect(result.reason).toContain('invalid_grant');
  });

  it('classifies 401 status as AUTH', () => {
    const err = Object.assign(new Error('Unauthorized'), { responseCode: 401 });
    expect(classifyMailError(err).kind).toBe('AUTH');
  });

  it('classifies 403 status as AUTH', () => {
    const err = Object.assign(new Error('Forbidden'), { responseCode: 403 });
    expect(classifyMailError(err).kind).toBe('AUTH');
  });

  it('classifies nodemailer OAuth2 error message as AUTH', () => {
    const err = new Error('Invalid login: 535-5.7.8 Username and Password not accepted');
    expect(classifyMailError(err).kind).toBe('AUTH');
  });

  it('classifies 429 status as TRANSIENT', () => {
    const err = Object.assign(new Error('Rate limit'), { responseCode: 429 });
    expect(classifyMailError(err).kind).toBe('TRANSIENT');
  });

  it('classifies 503 status as TRANSIENT', () => {
    const err = Object.assign(new Error('Service unavailable'), { responseCode: 503 });
    expect(classifyMailError(err).kind).toBe('TRANSIENT');
  });

  it('classifies ETIMEDOUT as TRANSIENT', () => {
    const err = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    expect(classifyMailError(err).kind).toBe('TRANSIENT');
  });

  it('classifies ECONNRESET as TRANSIENT', () => {
    const err = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
    expect(classifyMailError(err).kind).toBe('TRANSIENT');
  });

  it('classifies unknown errors as UNKNOWN', () => {
    const err = new Error('something bizarre');
    expect(classifyMailError(err).kind).toBe('UNKNOWN');
  });

  it('handles non-Error values (string)', () => {
    expect(classifyMailError('plain string').kind).toBe('UNKNOWN');
  });

  it('handles null/undefined', () => {
    expect(classifyMailError(null).kind).toBe('UNKNOWN');
    expect(classifyMailError(undefined).kind).toBe('UNKNOWN');
  });
});

describe('logMailFailure', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('emits [MAIL-FAIL] prefix with context, masked recipient, kind', () => {
    const err = Object.assign(new Error('invalid_grant'), { responseCode: 401 });
    logMailFailure({ context: 'owner-notification', recipient: 'owner@example.com' }, err);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logLine = errorSpy.mock.calls[0][0];
    expect(logLine).toContain('[MAIL-FAIL]');
    expect(logLine).toContain('context=owner-notification');
    // recipient はマスクされる（`user@` は出さず、ドメインのみ）
    expect(logLine).toContain('recipient=***@example.com');
    expect(logLine).toContain('kind=AUTH');
  });

  it('includes classification reason for TRANSIENT errors', () => {
    const err = new Error('timeout');
    Object.assign(err, { code: 'ETIMEDOUT' });
    logMailFailure({ context: 'guest-confirmation', recipient: 'g@example.com' }, err);

    const logLine = errorSpy.mock.calls[0][0];
    expect(logLine).toContain('kind=TRANSIENT');
    // sanitizeReason で `=` は `_` に置換される（key=value パース崩壊防止）
    expect(logLine).toContain('reason=code_ETIMEDOUT');
  });

  it('redacts local part of recipient but keeps domain', () => {
    const err = new Error('Auth fail');
    Object.assign(err, { responseCode: 401 });
    logMailFailure({ context: 'test', recipient: 'user@private.example.com' }, err);

    const logLine = errorSpy.mock.calls[0][0];
    expect(logLine).not.toContain('user@private.example.com');
    expect(logLine).toContain('recipient=***@private.example.com');
  });

  it('outputs *** for recipient without @ (defensive)', () => {
    const err = new Error('whatever');
    logMailFailure({ context: 'test', recipient: 'invalid-no-at' }, err);
    const logLine = errorSpy.mock.calls[0][0];
    expect(logLine).toContain('recipient=***');
    expect(logLine).not.toContain('invalid-no-at');
  });

  it('passes the original error object as second argument for stack trace', () => {
    const err = new Error('boom');
    logMailFailure({ context: 'ai-suggestion', recipient: 'a@b.com' }, err);

    expect(errorSpy.mock.calls[0][1]).toBe(err);
  });

  it('sanitizes whitespace/= in reason so key=value parsing stays intact', () => {
    const err = new Error('multi line\nwith = sign  and  spaces');
    logMailFailure({ context: 'test', recipient: 'a@b.com' }, err);
    const logLine = errorSpy.mock.calls[0][0] as string;
    // 空白・改行・= が連続する場合も 1 つの `_` にまとまる
    expect(logLine).toMatch(/reason=multi_line_with_sign_and_spaces( |$)/);
    expect(logLine).toContain('kind=UNKNOWN');
  });

  it('truncates very long reason to 200 chars + ellipsis', () => {
    const longMessage = 'x'.repeat(500);
    const err = new Error(longMessage);
    logMailFailure({ context: 'test', recipient: 'a@b.com' }, err);
    const logLine = errorSpy.mock.calls[0][0] as string;
    const reasonPart = logLine.split('reason=')[1] ?? '';
    expect(reasonPart.endsWith('...')).toBe(true);
    expect(reasonPart.length).toBeLessThanOrEqual(203);
  });

  it('classifies synthetic Errors from booking-auth flow as UNKNOWN with useful reason', () => {
    const err1 = new Error('no_refresh_token_stored');
    logMailFailure({ context: 'booking-auth', recipient: 'o@example.com' }, err1);
    expect(errorSpy.mock.calls[0][0]).toContain('kind=UNKNOWN');
    expect(errorSpy.mock.calls[0][0]).toContain('reason=no_refresh_token_stored');

    errorSpy.mockClear();
    const err2 = new Error('empty_access_token');
    logMailFailure({ context: 'booking-auth', recipient: 'o@example.com' }, err2);
    expect(errorSpy.mock.calls[0][0]).toContain('reason=empty_access_token');
  });
});
