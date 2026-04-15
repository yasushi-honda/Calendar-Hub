import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../lib/firebase-admin.js';
import { sendEmail, buildTestEmailHtml } from '../lib/email.js';
import { listConnectedAccounts, getRefreshToken } from '../lib/token-store.js';
import { refreshAccessToken, getGoogleUserInfo } from '../lib/google-oauth.js';
import type { NotificationSettings } from '@calendar-hub/shared';

export const notificationRoutes = new Hono<AppEnv>();

// 通知設定取得
notificationRoutes.get('/settings', requireAuth, async (c) => {
  const user = c.get('user');
  const db = getDb();

  const doc = await db.collection('users').doc(user.uid).get();
  const data = doc.data();
  const settings: NotificationSettings = data?.notificationSettings ?? {
    enabled: false,
    channels: [],
    dailySummary: false,
    aiSuggestionNotify: false,
  };

  return c.json({ settings });
});

// 通知設定更新
notificationRoutes.put('/settings', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const settings = body.settings as Partial<NotificationSettings>;

  if (settings.enabled === undefined && settings.channels === undefined) {
    return c.json({ error: 'At least one setting field is required' }, 400);
  }

  const db = getDb();
  await db
    .collection('users')
    .doc(user.uid)
    .set({ notificationSettings: settings }, { merge: true });

  return c.json({ success: true, settings });
});

// テスト通知送信
notificationRoutes.post('/test', requireAuth, async (c) => {
  const user = c.get('user');

  // 通知設定確認
  const db = getDb();
  const userDoc = await db.collection('users').doc(user.uid).get();
  const settings = userDoc.data()?.notificationSettings as NotificationSettings | undefined;

  if (!settings?.enabled) {
    return c.json({ error: 'Notifications are not enabled' }, 400);
  }

  // Googleアカウントからメール送信用トークンを取得
  const accounts = await listConnectedAccounts(user.uid);
  const googleAccount = accounts.find((a) => a.provider === 'google' && a.isActive);

  if (!googleAccount) {
    return c.json({ error: 'No active Google account connected' }, 400);
  }

  try {
    const refreshToken = await getRefreshToken(user.uid, googleAccount.id);
    if (!refreshToken) throw new Error('No refresh token');

    const tokens = await refreshAccessToken(refreshToken);
    if (!tokens.access_token) throw new Error('Failed to get access token');

    const userInfo = await getGoogleUserInfo(tokens.access_token);

    await sendEmail(
      { email: userInfo.email, accessToken: tokens.access_token },
      {
        to: userInfo.email,
        subject: 'Calendar Hub - テスト通知',
        html: buildTestEmailHtml(),
        context: 'test-notification',
      },
    );

    return c.json({ success: true, sentTo: userInfo.email });
  } catch (err) {
    console.error('Test notification error:', err);
    return c.json({ error: 'Failed to send test notification' }, 500);
  }
});
