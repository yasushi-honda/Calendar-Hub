import { Hono } from 'hono';
import { FieldValue } from 'firebase-admin/firestore';
import type { AppEnv } from '../types.js';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../lib/firebase-admin.js';
import { createAdapter } from '../lib/adapter-factory.js';
import { listConnectedAccounts } from '../lib/token-store.js';
import type {
  CalendarEvent,
  UserProfile,
  AiSuggestionStatus,
  NotificationSettings,
} from '@calendar-hub/shared';
import { calculateFreeSlots } from '@calendar-hub/shared/free-time';
import { generateSuggestions } from '@calendar-hub/ai-sdk';
import { getRefreshToken } from '../lib/token-store.js';
import { refreshAccessToken, getGoogleUserInfo } from '../lib/google-oauth.js';
import { sendEmail, buildSuggestionEmailHtml } from '../lib/email.js';

export const aiRoutes = new Hono<AppEnv>();

// AI提案を生成
aiRoutes.post('/suggest', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { timeMin, timeMax, userRequest } = body;

  if (!timeMin || !timeMax) {
    return c.json({ error: 'timeMin, timeMax are required' }, 400);
  }

  const db = getDb();

  // ユーザープロファイル取得
  const userDoc = await db.collection('users').doc(user.uid).get();
  const profile = (userDoc.data()?.profile as UserProfile) ?? null;

  // 全カレンダーのイベント取得
  const accounts = await listConnectedAccounts(user.uid);
  const activeAccounts = accounts.filter((a) => a.isActive);

  const eventResults = await Promise.allSettled(
    activeAccounts.map(async (account) => {
      const adapter = await createAdapter(user.uid, account.id);
      const calendars = await adapter.listCalendars();
      const events = await Promise.all(
        calendars.map((cal) => adapter.listEvents(cal.id, new Date(timeMin), new Date(timeMax))),
      );
      return events.flat();
    }),
  );

  const allEvents: CalendarEvent[] = eventResults
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .map((e) => ({
      ...e,
      start: new Date(e.start),
      end: new Date(e.end),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // 空き時間算出
  const freeSlots = calculateFreeSlots(allEvents, new Date(timeMin), new Date(timeMax));

  // AI提案生成
  const result = await generateSuggestions({
    profile,
    events: allEvents,
    freeSlots,
    userRequest,
  });

  // Firestoreに提案を保存
  const batch = db.batch();
  const suggestionIds: string[] = [];

  for (const suggestion of result.suggestions) {
    const ref = db.collection('users').doc(user.uid).collection('aiSuggestions').doc();
    suggestionIds.push(ref.id);
    batch.set(ref, {
      ...suggestion,
      status: 'pending' as AiSuggestionStatus,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();

  // メール通知（非同期、レスポンスをブロックしない）
  sendSuggestionNotification(
    user.uid,
    db,
    result.suggestions,
    result.insights,
    activeAccounts,
  ).catch((err) => console.error('Notification send failed:', err));

  return c.json({
    suggestions: result.suggestions.map((s, i) => ({
      id: suggestionIds[i],
      ...s,
      status: 'pending',
    })),
    insights: result.insights,
  });
});

// 提案一覧取得
aiRoutes.get('/suggestions', requireAuth, async (c) => {
  const user = c.get('user');
  const db = getDb();

  const snapshot = await db
    .collection('users')
    .doc(user.uid)
    .collection('aiSuggestions')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  const suggestions = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() ?? new Date(),
  }));

  return c.json({ suggestions });
});

// 提案の承認/却下
aiRoutes.patch('/suggestions/:suggestionId', requireAuth, async (c) => {
  const user = c.get('user');
  const suggestionId = c.req.param('suggestionId');
  const { status } = await c.req.json();

  if (status !== 'accepted' && status !== 'rejected') {
    return c.json({ error: 'status must be "accepted" or "rejected"' }, 400);
  }

  const db = getDb();
  const ref = db.collection('users').doc(user.uid).collection('aiSuggestions').doc(suggestionId);

  await ref.update({ status });

  // 承認された場合、カレンダーにイベントを作成（将来実装）
  // if (status === 'accepted') { ... }

  return c.json({ success: true, status });
});

/**
 * AI提案のメール通知を送信（通知設定が有効な場合のみ）
 */
async function sendSuggestionNotification(
  userId: string,
  db: FirebaseFirestore.Firestore,
  suggestions: Array<{
    title: string;
    start: string;
    end: string;
    reasoning: string;
  }>,
  insights: string,
  activeAccounts: Array<{ id: string; provider: string; isActive: boolean }>,
): Promise<void> {
  // 通知設定チェック
  const userDoc = await db.collection('users').doc(userId).get();
  const notifSettings = userDoc.data()?.notificationSettings as NotificationSettings | undefined;

  if (!notifSettings?.enabled || !notifSettings.aiSuggestionNotify) return;
  if (!notifSettings.channels.includes('email')) return;

  // Googleアカウントでメール送信
  const googleAccount = activeAccounts.find((a) => a.provider === 'google');
  if (!googleAccount) return;

  const refreshToken = await getRefreshToken(userId, googleAccount.id);
  if (!refreshToken) return;

  const tokens = await refreshAccessToken(refreshToken);
  if (!tokens.access_token) return;

  const userInfo = await getGoogleUserInfo(tokens.access_token);
  const html = buildSuggestionEmailHtml(suggestions, insights);

  await sendEmail(
    { email: userInfo.email, accessToken: tokens.access_token },
    {
      to: userInfo.email,
      subject: `Calendar Hub - ${suggestions.length}件の新しいスケジュール提案`,
      html,
    },
  );
}
