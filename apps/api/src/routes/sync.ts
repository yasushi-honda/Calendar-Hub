import { Hono } from 'hono';
import { getDb } from '../lib/firebase-admin.js';
import { createAdapter } from '../lib/adapter-factory.js';
import { requireAuth } from '../middleware/auth.js';
import {
  fetchTimeTreeEvents,
  fetchGoogleEvents,
  buildSyncActions,
  executeSyncActions,
  recordSyncLog,
} from '../lib/timetree-google-sync.js';
import { nanoid } from 'nanoid';
import { FieldValue } from 'firebase-admin/firestore';
import { SYNC_INTERVAL_OPTIONS } from '@calendar-hub/shared';
import type { SyncConfig } from '@calendar-hub/shared';
import type { AppEnv } from '../types.js';

export const syncRoutes = new Hono<AppEnv>();

// --- ヘルパー ---

function toSyncConfig(data: FirebaseFirestore.DocumentData): SyncConfig {
  return {
    ...data,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
  } as SyncConfig;
}

const getErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/**
 * Cloud Scheduler呼び出し用。
 * Authorization: Bearer <SECRET_TOKEN>
 */
syncRoutes.post('/timetree-to-google', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  const expectedToken = process.env.SYNC_SCHEDULER_TOKEN;

  if (!token || token !== expectedToken) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = getDb();
  const jobStartTime = Date.now();

  try {
    const snap = await db.collectionGroup('syncConfig').where('isEnabled', '==', true).get();

    const configs = snap.docs.map((doc) => ({
      docId: doc.id,
      ownerUid: doc.ref.parent.parent?.id || '',
      data: toSyncConfig(doc.data()),
    }));

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalDeleted = 0;
    let totalSkipped = 0;
    let failureCount = 0;

    for (const { docId, ownerUid, data: config } of configs) {
      const configStartTime = Date.now();
      try {
        const now = new Date();
        const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 1);

        const ttAdapter = await createAdapter(ownerUid, config.timetreeAccountId);
        const ggAdapter = await createAdapter(ownerUid, config.googleAccountId);

        const ttEvents = await fetchTimeTreeEvents(ttAdapter, timeMin, timeMax);
        const { events: ggEvents, tagged: taggedGoogleIds } = await fetchGoogleEvents(
          ggAdapter,
          config.googleCalendarId,
          timeMin,
          timeMax,
        );

        const actions = buildSyncActions(ttEvents, ggEvents, taggedGoogleIds);
        const stats = await executeSyncActions(ggAdapter, config.googleCalendarId, actions);

        totalCreated += stats.created;
        totalUpdated += stats.updated;
        totalDeleted += stats.deleted;
        totalSkipped += stats.skipped;

        const status = stats.skipped > 0 ? 'partial' : 'success';
        await recordSyncLog(docId, ownerUid, status, stats, Date.now() - configStartTime);

        console.log(
          `Sync completed for ${ownerUid}/${config.googleCalendarId}: ${stats.created} created, ${stats.updated} updated, ${stats.deleted} deleted`,
        );
      } catch (err) {
        failureCount++;
        console.error(`Sync failed for ${ownerUid}:`, err);

        await recordSyncLog(
          docId,
          ownerUid,
          'failed',
          { created: 0, updated: 0, deleted: 0, skipped: 0 },
          Date.now() - configStartTime,
          getErrorMessage(err),
        ).catch((e) => console.error('Failed to record sync log:', e));
      }
    }

    return c.json({
      status: 'completed',
      configsProcessed: configs.length,
      failures: failureCount,
      stats: {
        eventsCreated: totalCreated,
        eventsUpdated: totalUpdated,
        eventsDeleted: totalDeleted,
        eventsSkipped: totalSkipped,
      },
      durationMs: Date.now() - jobStartTime,
    });
  } catch (err) {
    console.error('Sync job failed:', err);
    return c.json(
      {
        error: 'Sync job failed',
        message: getErrorMessage(err),
      },
      500,
    );
  }
});

// --- 設定管理 ---

syncRoutes.get('/config', requireAuth, async (c) => {
  const user = c.get('user')!;

  const db = getDb();
  const snap = await db
    .collection('users')
    .doc(user.uid)
    .collection('syncConfig')
    .orderBy('createdAt', 'desc')
    .get();

  const configs = snap.docs.map((doc) => toSyncConfig(doc.data()));
  return c.json({ configs });
});

syncRoutes.post('/config', requireAuth, async (c) => {
  const user = c.get('user')!;

  const body = await c.req.json<{
    timetreeAccountId?: string;
    googleAccountId?: string;
    timetreeCalendarId?: string;
    googleCalendarId?: string;
    syncIntervalMinutes?: number;
  }>();

  const {
    timetreeAccountId,
    googleAccountId,
    timetreeCalendarId,
    googleCalendarId,
    syncIntervalMinutes = 5,
  } = body;

  if (!timetreeAccountId || !googleAccountId || !timetreeCalendarId || !googleCalendarId) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  if (!(SYNC_INTERVAL_OPTIONS as readonly number[]).includes(syncIntervalMinutes)) {
    return c.json({ error: 'Invalid syncIntervalMinutes' }, 400);
  }

  const db = getDb();
  const configId = nanoid(12);

  await db.collection('users').doc(user.uid).collection('syncConfig').doc(configId).set({
    id: configId,
    ownerUid: user.uid,
    timetreeAccountId,
    googleAccountId,
    timetreeCalendarId,
    googleCalendarId,
    isEnabled: true,
    syncIntervalMinutes,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return c.json({ config: { id: configId } }, 201);
});

syncRoutes.patch('/config/:configId', requireAuth, async (c) => {
  const user = c.get('user')!;
  const configId = c.req.param('configId');

  const body = await c.req.json<{
    isEnabled?: boolean;
    syncIntervalMinutes?: number;
  }>();

  const { isEnabled, syncIntervalMinutes } = body;

  if (
    syncIntervalMinutes !== undefined &&
    !(SYNC_INTERVAL_OPTIONS as readonly number[]).includes(syncIntervalMinutes)
  ) {
    return c.json({ error: 'Invalid syncIntervalMinutes' }, 400);
  }

  const db = getDb();
  const configRef = db.collection('users').doc(user.uid).collection('syncConfig').doc(configId);

  const doc = await configRef.get();
  if (!doc.exists) {
    return c.json({ error: 'Config not found' }, 404);
  }

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (isEnabled !== undefined) updates.isEnabled = isEnabled;
  if (syncIntervalMinutes !== undefined) updates.syncIntervalMinutes = syncIntervalMinutes;

  await configRef.update(updates);

  return c.json({ status: 'updated' });
});

syncRoutes.delete('/config/:configId', requireAuth, async (c) => {
  const user = c.get('user')!;
  const configId = c.req.param('configId');
  const db = getDb();

  await db.collection('users').doc(user.uid).collection('syncConfig').doc(configId).delete();

  return c.json({ status: 'deleted' });
});

syncRoutes.get('/logs', requireAuth, async (c) => {
  const user = c.get('user')!;
  const configId = c.req.query('configId');

  const db = getDb();
  let query: FirebaseFirestore.Query = db.collection('syncLogs').where('ownerUid', '==', user.uid);

  if (configId) {
    query = query.where('syncConfigId', '==', configId);
  }

  const snap = await query.orderBy('executedAt', 'desc').limit(50).get();

  const logs = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      executedAt: data.executedAt?.toDate?.() ?? new Date(),
    };
  });

  return c.json({ logs });
});
