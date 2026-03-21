import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../lib/firebase-admin.js';
import type { UserProfile } from '@calendar-hub/shared';

export const profileRoutes = new Hono<AppEnv>();

const DEFAULT_PROFILE: UserProfile = {
  workSchedule: {
    workDays: [1, 2, 3, 4, 5],
    workStartHour: 9,
    workEndHour: 18,
  },
  lifestyle: {
    sleepStartHour: 23,
    sleepEndHour: 7,
  },
  preferences: {
    minBreakMinutes: 15,
    maxConsecutiveMeetingMinutes: 120,
    bufferBetweenEventsMinutes: 10,
  },
};

// プロファイル取得
profileRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const db = getDb();
  const doc = await db.collection('users').doc(user.uid).get();

  const profile = doc.data()?.profile as UserProfile | undefined;
  return c.json({ profile: profile ?? DEFAULT_PROFILE });
});

// プロファイル更新
profileRoutes.put('/', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const db = getDb();

  await db.collection('users').doc(user.uid).update({
    profile: body.profile,
  });

  return c.json({ success: true });
});
