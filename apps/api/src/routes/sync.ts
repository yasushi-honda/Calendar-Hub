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
  computeSyncGap,
  acquireSyncLease,
  releaseSyncLease,
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
    lastSyncedAt: data.lastSyncedAt?.toDate?.() ?? undefined,
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
      // syncIntervalMinutes に基づく経過時間チェック + リース取得をトランザクションで
      // 原子的に行う (Issue #196: 従来の check-then-act な判定は並列/再試行実行時に
      // 同一設定を二重処理しうるレースコンディションがあった)。
      // 従来の判定は同期的で例外を投げないプロパティ読み取りだったが、Firestore
      // トランザクションは一時的なエラーで reject しうるため、この呼び出し自体を
      // ループ本体の try/catch とは独立して捕捉する。捕捉しないと1件のFirestore
      // エラーがジョブ全体 (残り全configs) を中断させてしまう (/code-review medium指摘)。
      let leaseAcquired: boolean;
      try {
        leaseAcquired = await acquireSyncLease(ownerUid, docId);
      } catch (err) {
        failureCount++;
        console.error(`Failed to acquire sync lease for ${ownerUid}/${docId}:`, err);
        continue;
      }
      if (!leaseAcquired) {
        continue;
      }

      const configStartTime = Date.now();
      try {
        const now = new Date();
        const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 1);

        const ttAdapter = await createAdapter(ownerUid, config.timetreeAccountId);
        const ggAdapter = await createAdapter(ownerUid, config.googleAccountId);

        const ttEvents = await fetchTimeTreeEvents(ttAdapter, timeMin, timeMax);
        const {
          events: ggEvents,
          tagged: taggedGoogleIds,
          tagMap,
        } = await fetchGoogleEvents(ggAdapter, config.googleCalendarId, timeMin, timeMax);

        const ttRecurring = ttEvents.filter((e) => /_R\d{8}/.test(e.originalId)).length;
        const actions = buildSyncActions(ttEvents, ggEvents, taggedGoogleIds, tagMap);
        console.log(
          `[SYNC-STATS] tt=${ttEvents.length} (recurring=${ttRecurring}) gg=${ggEvents.length} tagged=${taggedGoogleIds.size} actions: c=${actions.toCreate.length} u=${actions.toUpdate.length} d=${actions.toDelete.length}`,
        );
        const stats = await executeSyncActions(ggAdapter, config.googleCalendarId, actions);

        // 事後整合性チェック: sync後に tt と (taggedBefore + created - deleted) が一致するはず。
        // 不一致 → 同期漏れ（静かな欠落）の可能性。Cloud Monitoring alertで検知する。
        const gap = computeSyncGap({
          ttCount: ttEvents.length,
          taggedBefore: taggedGoogleIds.size,
          created: stats.created,
          deleted: stats.deleted,
        });
        if (gap.hasGap) {
          // taggedBefore も出力することで、diff<0（過剰tagged残存）のケースで
          // 「元から多かったのか」「delete漏れか」を切り分けやすくする
          console.error(
            `[SYNC-GAP] calendar=${config.googleCalendarId} tt=${ttEvents.length} taggedBefore=${taggedGoogleIds.size} diff=${gap.diff} created=${stats.created} deleted=${stats.deleted} skipped=${stats.skipped}`,
          );
        }

        totalCreated += stats.created;
        totalUpdated += stats.updated;
        totalDeleted += stats.deleted;
        totalSkipped += stats.skipped;

        const status = stats.skipped > 0 ? 'partial' : 'success';
        await recordSyncLog(docId, ownerUid, status, stats, Date.now() - configStartTime);

        // lastSyncedAt を更新 (リースも解放)
        await db
          .collection('users')
          .doc(ownerUid)
          .collection('syncConfig')
          .doc(docId)
          .update({ lastSyncedAt: FieldValue.serverTimestamp(), syncLeaseAt: FieldValue.delete() });

        console.log(
          `Sync completed for ${ownerUid}/${config.googleCalendarId}: ${stats.created} created, ${stats.updated} updated, ${stats.deleted} deleted`,
        );
      } catch (err) {
        failureCount++;
        console.error(`Sync failed for ${ownerUid}:`, err);

        // 状態復旧 (リース解放) を最優先で行う (rules/error-handling.md §1:
        // 状態復旧 > ログ記録 > 通知の優先順)。lastSyncedAt は更新しないため、
        // 次回インターバル判定で再試行対象になる。独立したtry-catchで囲む。
        await releaseSyncLease(ownerUid, docId).catch((e) =>
          console.error('Failed to release sync lease:', e),
        );

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
