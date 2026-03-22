import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import type { AppEnv } from '../types.js';
import { requireAuth } from '../middleware/auth.js';
import { generateAuthUrl, exchangeCode, getGoogleUserInfo } from '../lib/google-oauth.js';
import {
  saveConnectedAccount,
  listConnectedAccounts,
  deactivateAccount,
} from '../lib/token-store.js';
import { getDb } from '../lib/firebase-admin.js';

export const authRoutes = new Hono<AppEnv>();

// ユーザー初回ログイン時にFirestoreにユーザードキュメント作成
authRoutes.post('/init', requireAuth, async (c) => {
  const user = c.get('user');
  const db = getDb();
  const userRef = db.collection('users').doc(user.uid);
  const doc = await userRef.get();

  if (!doc.exists) {
    await userRef.set({
      email: user.email,
      displayName: '',
      primaryGoogleAccountId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return c.json({ uid: user.uid, email: user.email });
});

// Google追加アカウント連携: OAuth URLを生成
authRoutes.get('/connect/google', requireAuth, async (c) => {
  const user = c.get('user');

  const state = randomBytes(32).toString('hex');
  const db = getDb();
  await db
    .collection('oauthStates')
    .doc(state)
    .set({
      userId: user.uid,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt: FieldValue.serverTimestamp(),
    });

  const url = generateAuthUrl(state);
  return c.json({ url });
});

// Google OAuth callback
authRoutes.get('/callback/google', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    return c.redirect(`${getFrontendUrl()}/settings?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return c.redirect(`${getFrontendUrl()}/settings?error=missing_params`);
  }

  const db = getDb();
  const stateRef = db.collection('oauthStates').doc(state);
  const stateDoc = await stateRef.get();

  if (!stateDoc.exists) {
    return c.redirect(`${getFrontendUrl()}/settings?error=invalid_state`);
  }

  const pending = stateDoc.data()!;
  const expiresAt = pending.expiresAt?.toDate?.() ?? new Date(pending.expiresAt);
  if (expiresAt < new Date()) {
    await stateRef.delete();
    return c.redirect(`${getFrontendUrl()}/settings?error=expired_state`);
  }

  // 1回限り使用: 即座に削除
  await stateRef.delete();

  try {
    const tokens = await exchangeCode(code);

    if (!tokens.refresh_token) {
      return c.redirect(`${getFrontendUrl()}/settings?error=no_refresh_token`);
    }

    const userInfo = await getGoogleUserInfo(tokens.access_token!);

    await saveConnectedAccount(
      pending.userId,
      'google',
      userInfo.email,
      tokens.refresh_token,
      tokens.scope?.split(' ') ?? [],
    );

    // メインアカウントが未設定なら設定
    const db = getDb();
    const userDoc = await db.collection('users').doc(pending.userId).get();
    if (userDoc.exists && !userDoc.data()?.primaryGoogleAccountId) {
      await db
        .collection('users')
        .doc(pending.userId)
        .update({
          primaryGoogleAccountId: `google_${userInfo.email.replace(/[^a-zA-Z0-9]/g, '_')}`,
          updatedAt: FieldValue.serverTimestamp(),
        });
    }

    return c.redirect(
      `${getFrontendUrl()}/settings?success=connected&email=${encodeURIComponent(userInfo.email)}`,
    );
  } catch (err) {
    console.error('OAuth callback error:', err);
    return c.redirect(`${getFrontendUrl()}/settings?error=token_exchange_failed`);
  }
});

// 連携アカウント一覧
authRoutes.get('/accounts', requireAuth, async (c) => {
  const user = c.get('user');
  const accounts = await listConnectedAccounts(user.uid);
  return c.json({ accounts });
});

// TimeTreeアカウント連携: email/passwordでログイン、またはセッション直接登録
authRoutes.post('/connect/timetree', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  // セッション直接登録モード（ブラウザから取得したsession）
  if (body.sessionId && body.csrfToken && body.email) {
    try {
      await saveConnectedAccount(
        user.uid,
        'timetree',
        body.email,
        JSON.stringify({ sessionId: body.sessionId, csrfToken: body.csrfToken }),
        ['calendar.read', 'calendar.write'],
      );
      return c.json({ success: true, email: body.email });
    } catch (err) {
      console.error('TimeTree session save error:', err);
      return c.json({ error: 'Failed to save TimeTree session' }, 500);
    }
  }

  // email/passwordログインモード
  const { email, password } = body;
  if (!email || !password) {
    return c.json({ error: 'email and password (or sessionId+csrfToken) are required' }, 400);
  }

  try {
    const { TimeTreeAdapter } = await import('@calendar-hub/calendar-sdk');
    const session = await TimeTreeAdapter.login(email, password);

    await saveConnectedAccount(
      user.uid,
      'timetree',
      email,
      JSON.stringify({ sessionId: session.sessionId, csrfToken: session.csrfToken }),
      ['calendar.read', 'calendar.write'],
    );

    return c.json({ success: true, email });
  } catch (err) {
    console.error('TimeTree login error:', err);
    return c.json({ error: 'TimeTree login failed' }, 401);
  }
});

// アカウント連携解除
authRoutes.delete('/accounts/:accountId', requireAuth, async (c) => {
  const user = c.get('user');
  const accountId = c.req.param('accountId');
  await deactivateAccount(user.uid, accountId);
  return c.json({ success: true });
});

function getFrontendUrl(): string {
  return process.env.FRONTEND_URL ?? 'http://localhost:3000';
}
