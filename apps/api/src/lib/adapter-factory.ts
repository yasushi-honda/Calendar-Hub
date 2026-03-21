import { GoogleCalendarAdapter, TimeTreeAdapter } from '@calendar-hub/calendar-sdk';
import type { CalendarAdapter } from '@calendar-hub/calendar-sdk';
import { getRefreshToken } from './token-store.js';
import { refreshAccessToken } from './google-oauth.js';

/**
 * 連携アカウントIDからCalendarAdapterを生成
 */
export async function createAdapter(userId: string, accountId: string): Promise<CalendarAdapter> {
  const provider = accountId.startsWith('google_') ? 'google' : 'timetree';

  if (provider === 'google') {
    const refreshToken = await getRefreshToken(userId, accountId);
    if (!refreshToken) throw new Error(`No refresh token for account: ${accountId}`);

    const tokens = await refreshAccessToken(refreshToken);
    if (!tokens.access_token) throw new Error('Failed to get access token');

    return new GoogleCalendarAdapter(tokens.access_token);
  }

  if (provider === 'timetree') {
    // TimeTreeはsession_idで認証（refresh tokenにsession_idを保存している）
    const sessionId = await getRefreshToken(userId, accountId);
    if (!sessionId) throw new Error(`No session for account: ${accountId}`);

    return new TimeTreeAdapter(sessionId);
  }

  throw new Error(`Unknown provider: ${provider}`);
}
