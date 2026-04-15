import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendMailMock = vi.fn();
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
  },
}));

// モック登録後に import する（vi.mock は hoisted だが、明示的に順序を示す）
const { sendEmail } = await import('../lib/email.js');

describe('sendEmail integration', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sendMailMock.mockReset();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('rethrows errors; with context it also emits [MAIL-FAIL]', async () => {
    sendMailMock.mockRejectedValueOnce(
      Object.assign(new Error('Invalid login: 535-5.7.8'), { responseCode: 535 }),
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
    ).rejects.toThrow(/Invalid login/);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = errorSpy.mock.calls[0][0];
    expect(line).toContain('[MAIL-FAIL]');
    expect(line).toContain('context=owner-notification');
    expect(line).toContain('kind=AUTH');
    expect(line).toContain('recipient=***@example.com');
  });

  it('without context, rethrows but does NOT emit [MAIL-FAIL]', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('network down'));

    await expect(
      sendEmail(
        { email: 'owner@example.com', accessToken: 'tok' },
        { to: 'r@example.com', subject: 's', html: '<p>h</p>' },
      ),
    ).rejects.toThrow(/network down/);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('success path does not emit [MAIL-FAIL]', async () => {
    sendMailMock.mockResolvedValueOnce({ messageId: 'm1' });

    await sendEmail(
      { email: 'owner@example.com', accessToken: 'tok' },
      { to: 'r@example.com', subject: 's', html: '<p>h</p>', context: 'test-notification' },
    );

    expect(errorSpy).not.toHaveBeenCalled();
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });
});
