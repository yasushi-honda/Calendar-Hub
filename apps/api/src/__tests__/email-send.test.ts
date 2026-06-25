import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendMock = vi.fn();
const setCredentialsMock = vi.fn();

vi.mock('googleapis', () => {
  class MockOAuth2 {
    setCredentials(credentials: unknown) {
      return setCredentialsMock(credentials);
    }
  }
  return {
    google: {
      auth: { OAuth2: MockOAuth2 },
      gmail: () => ({
        users: {
          messages: {
            send: sendMock,
          },
        },
      }),
    },
  };
});

// モック登録後に import する（vi.mock は hoisted だが、明示的に順序を示す）
const { sendEmail } = await import('../lib/email.js');

describe('sendEmail integration (Gmail API)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sendMock.mockReset();
    setCredentialsMock.mockReset();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('rethrows AUTH errors; with context it also emits [MAIL-FAIL] kind=AUTH', async () => {
    // Gmail API の典型的な認証エラー (Gaxios 形状)
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error('Request had invalid authentication credentials.'), {
        response: { status: 401, data: {} },
      }),
    );

    await expect(
      sendEmail(
        { email: 'owner@example.com', accessToken: 'tok' },
        {
          to: 'recipient@example.com',
          subject: 's',
          html: '<p>h</p>',
          context: 'owner-notification',
        },
      ),
    ).rejects.toThrow(/invalid authentication credentials/);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = errorSpy.mock.calls[0][0];
    expect(line).toContain('[MAIL-FAIL]');
    expect(line).toContain('context=owner-notification');
    expect(line).toContain('kind=AUTH');
    expect(line).toContain('recipient=***@example.com');
  });

  it('without context, rethrows but does NOT emit [MAIL-FAIL]', async () => {
    sendMock.mockRejectedValueOnce(new Error('network down'));

    await expect(
      sendEmail(
        { email: 'owner@example.com', accessToken: 'tok' },
        { to: 'r@example.com', subject: 's', html: '<p>h</p>' },
      ),
    ).rejects.toThrow(/network down/);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('success path does not emit [MAIL-FAIL] and sends base64url-encoded raw message', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'm1' } });

    await sendEmail(
      { email: 'owner@example.com', accessToken: 'tok' },
      { to: 'r@example.com', subject: '件名', html: '<p>本文</p>', context: 'test-notification' },
    );

    expect(errorSpy).not.toHaveBeenCalled();
    expect(setCredentialsMock).toHaveBeenCalledWith({ access_token: 'tok' });
    expect(sendMock).toHaveBeenCalledTimes(1);

    const callArg = sendMock.mock.calls[0][0];
    expect(callArg).toMatchObject({ userId: 'me' });
    expect(callArg.requestBody.raw).toBeTruthy();
    // base64url 形式: +/= が含まれない
    expect(callArg.requestBody.raw).not.toMatch(/[+/=]/);
    // raw を decode すると From / To が含まれる
    const decoded = Buffer.from(callArg.requestBody.raw, 'base64url').toString('utf8');
    expect(decoded).toContain('From: Calendar Hub <owner@example.com>');
    expect(decoded).toContain('To: r@example.com');
  });
});
