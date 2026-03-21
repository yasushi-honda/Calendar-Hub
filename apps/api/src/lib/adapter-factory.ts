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
    // TimeTreeはsession_id + csrfTokenで認証（JSON形式で暗号化保存している）
    const stored = await getRefreshToken(userId, accountId);
    if (!stored) throw new Error(`No session for account: ${accountId}`);

    const session = JSON.parse(stored) as { sessionId: string; csrfToken: string };
    return new TimeTreeAdapter(session);
  }

  throw new Error(`Unknown provider: ${provider}`);
}
