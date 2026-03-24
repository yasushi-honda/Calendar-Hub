'use client';

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../lib/api';
import { PageShell, PageLoading } from '../../components/PageShell';
import type {
  ConnectedAccountPublic,
  SyncConfig,
  SyncLog,
  SyncIntervalMinutes,
} from '@calendar-hub/shared';

// @calendar-hub/shared のバレルimportはnode:cryptoを含むためランタイム値はローカル定義
const SYNC_INTERVAL_OPTIONS: readonly SyncIntervalMinutes[] = [1, 3, 5, 10, 15];

export function SyncSettingsContent() {
  const { user, loading: authLoading } = useRequireAuth();
  const [accounts, setAccounts] = useState<ConnectedAccountPublic[]>([]);
  const [configs, setConfigs] = useState<SyncConfig[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // フォーム状態
  const [formTtAccountId, setFormTtAccountId] = useState('');
  const [formGgAccountId, setFormGgAccountId] = useState('');
  // TimeTreeは常に全カレンダー同期
  const [formGgCalendarId, setFormGgCalendarId] = useState('');
  const [ggCalendars, setGgCalendars] = useState<{ id: string; name: string; primary?: boolean }[]>(
    [],
  );
  const [loadingCalendars, setLoadingCalendars] = useState(false);

  const showToast = useCallback((msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [accountsRes, configsRes] = await Promise.all([
        apiGet<{ accounts: ConnectedAccountPublic[] }>('/api/auth/accounts'),
        apiGet<{ configs: SyncConfig[] }>('/api/sync/config'),
      ]);
      setAccounts(accountsRes.accounts);
      setConfigs(configsRes.configs);
    } catch {
      showToast('データの読み込みに失敗しました', 'err');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadLogs = useCallback(
    async (configId: string) => {
      try {
        const res = await apiGet<{ logs: SyncLog[] }>(`/api/sync/logs?configId=${configId}`);
        setLogs(res.logs);
        setSelectedConfigId(configId);
      } catch {
        showToast('ログの取得に失敗しました', 'err');
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  // Google アカウント選択時にカレンダー一覧を取得
  const loadGoogleCalendars = useCallback(
    async (accountId: string) => {
      setLoadingCalendars(true);
      setGgCalendars([]);
      setFormGgCalendarId('');
      try {
        const res = await apiGet<{
          calendars: { id: string; name: string; primary?: boolean; accountId: string }[];
        }>('/api/calendars');
        const filtered = res.calendars.filter((c) => c.accountId === accountId);
        setGgCalendars(filtered);
        const primary = filtered.find((c) => c.primary);
        if (primary) setFormGgCalendarId(primary.id);
      } catch {
        showToast('カレンダーの取得に失敗しました', 'err');
      } finally {
        setLoadingCalendars(false);
      }
    },
    [showToast],
  );

  const handleCreate = async () => {
    if (!formTtAccountId || !formGgAccountId || !formGgCalendarId) {
      showToast('すべてのフィールドを選択してください', 'err');
      return;
    }

    try {
      await apiPost('/api/sync/config', {
        timetreeAccountId: formTtAccountId,
        googleAccountId: formGgAccountId,
        timetreeCalendarId: '__all__',
        googleCalendarId: formGgCalendarId,
        syncIntervalMinutes: 5,
      });
      showToast('同期設定を作成しました', 'ok');
      setShowForm(false);
      setFormTtAccountId('');
      setFormGgAccountId('');
      setFormGgCalendarId('');
      setGgCalendars([]);
      await loadData();
    } catch {
      showToast('作成に失敗しました', 'err');
    }
  };

  const handleToggle = async (configId: string, isEnabled: boolean) => {
    try {
      await apiPatch(`/api/sync/config/${configId}`, { isEnabled: !isEnabled });
      setConfigs((prev) =>
        prev.map((c) => (c.id === configId ? { ...c, isEnabled: !isEnabled } : c)),
      );
    } catch {
      showToast('更新に失敗しました', 'err');
    }
  };

  const handleIntervalChange = async (configId: string, minutes: number) => {
    try {
      await apiPatch(`/api/sync/config/${configId}`, { syncIntervalMinutes: minutes });
      setConfigs((prev) =>
        prev.map((c) =>
          c.id === configId ? { ...c, syncIntervalMinutes: minutes as SyncIntervalMinutes } : c,
        ),
      );
    } catch {
      showToast('更新に失敗しました', 'err');
    }
  };

  const handleDelete = async (configId: string) => {
    if (!confirm('この同期設定を削除しますか？')) return;
    try {
      await apiDelete(`/api/sync/config/${configId}`);
      setConfigs((prev) => prev.filter((c) => c.id !== configId));
      if (selectedConfigId === configId) {
        setSelectedConfigId(null);
        setLogs([]);
      }
      showToast('削除しました', 'ok');
    } catch {
      showToast('削除に失敗しました', 'err');
    }
  };

  if (authLoading) return <PageLoading />;
  if (!user) return null;

  const ttAccounts = accounts.filter((a) => a.provider === 'timetree');
  const ggAccounts = accounts.filter((a) => a.provider === 'google');

  return (
    <PageShell maxWidth="compact">
      {toast && (
        <div
          style={{
            ...s.toast,
            borderColor: toast.type === 'ok' ? 'rgba(80,200,120,0.3)' : 'rgba(224,120,80,0.3)',
            background: toast.type === 'ok' ? 'rgba(80,200,120,0.08)' : 'rgba(224,120,80,0.08)',
            color: toast.type === 'ok' ? '#50c878' : '#e07850',
          }}
        >
          {toast.msg}
        </div>
      )}

      <div style={s.header}>
        <h1 style={s.title}>同期設定</h1>
        <p style={s.subtitle}>TimeTree → Google Calendar の自動同期</p>
      </div>

      {/* 新規作成 */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>同期設定</span>
          <button style={s.addBtn} onClick={() => setShowForm(!showForm)}>
            {showForm ? '閉じる' : '＋ 新規作成'}
          </button>
        </div>

        {showForm && (
          <div style={s.card}>
            <div style={s.formGrid}>
              <div>
                <label style={s.label}>TimeTree アカウント</label>
                <select
                  style={s.select}
                  value={formTtAccountId}
                  onChange={(e) => setFormTtAccountId(e.target.value)}
                >
                  <option value="">選択...</option>
                  {ttAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={s.label}>TimeTree カレンダー</label>
                <div style={{ ...s.select, opacity: 0.6 }}>全カレンダー（自動）</div>
              </div>

              <div>
                <label style={s.label}>Google アカウント</label>
                <select
                  style={s.select}
                  value={formGgAccountId}
                  onChange={(e) => {
                    setFormGgAccountId(e.target.value);
                    if (e.target.value) loadGoogleCalendars(e.target.value);
                  }}
                >
                  <option value="">選択...</option>
                  {ggAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={s.label}>Google カレンダー</label>
                {loadingCalendars ? (
                  <div style={{ ...s.select, opacity: 0.6 }}>読み込み中...</div>
                ) : (
                  <select
                    style={s.select}
                    value={formGgCalendarId}
                    onChange={(e) => setFormGgCalendarId(e.target.value)}
                  >
                    <option value="">選択...</option>
                    {ggCalendars.map((cal) => (
                      <option key={cal.id} value={cal.id}>
                        {cal.name}
                        {cal.primary ? ' (デフォルト)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <button style={s.submitBtn} onClick={handleCreate}>
              作成
            </button>
          </div>
        )}

        {/* 設定一覧 */}
        {loading ? (
          <p style={s.muted}>読み込み中...</p>
        ) : configs.length === 0 ? (
          <p style={s.muted}>同期設定がありません。「新規作成」から追加してください。</p>
        ) : (
          configs.map((config) => {
            const ttAcc = accounts.find((a) => a.id === config.timetreeAccountId);
            const ggAcc = accounts.find((a) => a.id === config.googleAccountId);
            return (
              <div key={config.id} style={s.card}>
                <div style={s.configRow}>
                  <div style={{ flex: 1 }}>
                    <div style={s.configLabel}>
                      <span style={s.badge}>TimeTree</span>
                      {ttAcc?.email ?? config.timetreeAccountId}
                      <span style={s.muted}>
                        {' '}
                        /{' '}
                        {config.timetreeCalendarId === '__all__'
                          ? '全カレンダー'
                          : config.timetreeCalendarId}
                      </span>
                    </div>
                    <div style={{ ...s.configLabel, marginTop: 4 }}>
                      <span
                        style={{
                          ...s.badge,
                          background: 'rgba(66,133,244,0.15)',
                          color: '#4285f4',
                        }}
                      >
                        Google
                      </span>
                      {ggAcc?.email ?? config.googleAccountId}
                      <span style={s.muted}> / {config.googleCalendarId}</span>
                    </div>
                  </div>

                  <div style={s.configActions}>
                    <select
                      style={{ ...s.select, width: 80 }}
                      value={config.syncIntervalMinutes}
                      onChange={(e) => handleIntervalChange(config.id, Number(e.target.value))}
                    >
                      {SYNC_INTERVAL_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {m}分
                        </option>
                      ))}
                    </select>

                    <button
                      style={config.isEnabled ? s.enabledBtn : s.disabledBtn}
                      onClick={() => handleToggle(config.id, config.isEnabled)}
                    >
                      {config.isEnabled ? 'ON' : 'OFF'}
                    </button>

                    <button style={s.logBtn} onClick={() => loadLogs(config.id)}>
                      ログ
                    </button>

                    <button style={s.dangerBtn} onClick={() => handleDelete(config.id)}>
                      削除
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ログ表示 */}
      {selectedConfigId && (
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <span style={s.sectionTitle}>同期ログ</span>
            <button
              style={s.addBtn}
              onClick={() => {
                setSelectedConfigId(null);
                setLogs([]);
              }}
            >
              閉じる
            </button>
          </div>

          {logs.length === 0 ? (
            <p style={s.muted}>ログがありません。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {logs.map((log, i) => (
                <div key={i} style={s.logRow}>
                  <span
                    style={{
                      ...s.statusBadge,
                      background:
                        log.status === 'success'
                          ? 'rgba(80,200,120,0.15)'
                          : log.status === 'partial'
                            ? 'rgba(255,200,50,0.15)'
                            : 'rgba(224,120,80,0.15)',
                      color:
                        log.status === 'success'
                          ? '#50c878'
                          : log.status === 'partial'
                            ? '#c8c832'
                            : '#e07850',
                    }}
                  >
                    {log.status}
                  </span>
                  <span style={s.logStats}>
                    +{log.eventsCreated} ↻{log.eventsUpdated} −{log.eventsDeleted}
                    {log.eventsSkipped > 0 && ` ⚠${log.eventsSkipped}`}
                  </span>
                  <span style={s.logDuration}>{log.durationMs}ms</span>
                  <span style={s.logDate}>{new Date(log.executedAt).toLocaleString('ja-JP')}</span>
                  {log.errorMessage && (
                    <span style={{ ...s.muted, fontSize: 11 }}>{log.errorMessage}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}

const s: Record<string, CSSProperties> = {
  toast: {
    position: 'fixed',
    top: 16,
    right: 16,
    padding: '10px 16px',
    borderRadius: 10,
    fontSize: 13,
    border: '1px solid',
    zIndex: 999,
    fontFamily: 'var(--font-body)',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    color: 'var(--color-text)',
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--color-text-muted)',
    marginTop: 4,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  addBtn: {
    padding: '6px 14px',
    fontSize: 12,
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    cursor: 'pointer',
  },
  card: {
    padding: 16,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    marginBottom: 8,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    marginBottom: 12,
  },
  label: {
    display: 'block',
    fontSize: 12,
    color: 'var(--color-text-muted)',
    marginBottom: 4,
    fontFamily: 'var(--font-body)',
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    color: 'var(--color-text)',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
  },
  submitBtn: {
    padding: '8px 20px',
    fontSize: 13,
    border: '1px solid var(--color-accent)',
    borderRadius: 6,
    background: 'var(--color-accent-glow)',
    color: 'var(--color-accent)',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  muted: {
    fontSize: 13,
    color: 'var(--color-text-muted)',
  },
  configRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  configLabel: {
    fontSize: 13,
    color: 'var(--color-text)',
  },
  configActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  badge: {
    display: 'inline-block',
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 4,
    background: 'rgba(80,200,120,0.15)',
    color: '#50c878',
    marginRight: 6,
    fontWeight: 600,
  },
  enabledBtn: {
    padding: '4px 10px',
    fontSize: 11,
    border: '1px solid rgba(80,200,120,0.3)',
    borderRadius: 4,
    background: 'rgba(80,200,120,0.1)',
    color: '#50c878',
    cursor: 'pointer',
    fontWeight: 600,
  },
  disabledBtn: {
    padding: '4px 10px',
    fontSize: 11,
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    background: 'var(--color-surface)',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    fontWeight: 600,
  },
  logBtn: {
    padding: '4px 10px',
    fontSize: 11,
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    cursor: 'pointer',
  },
  dangerBtn: {
    padding: '4px 10px',
    fontSize: 11,
    border: '1px solid rgba(224,120,80,0.3)',
    borderRadius: 4,
    background: 'rgba(224,120,80,0.08)',
    color: '#e07850',
    cursor: 'pointer',
  },
  logRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    fontSize: 12,
    flexWrap: 'wrap',
  },
  statusBadge: {
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
  },
  logStats: {
    color: 'var(--color-text)',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  logDuration: {
    color: 'var(--color-text-muted)',
    fontSize: 11,
  },
  logDate: {
    color: 'var(--color-text-muted)',
    fontSize: 11,
    marginLeft: 'auto',
  },
};
