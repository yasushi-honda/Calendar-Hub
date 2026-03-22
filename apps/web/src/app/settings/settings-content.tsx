'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api';
import { PageShell, PageLoading } from '../../components/PageShell';
import type { ConnectedAccountPublic, NotificationSettings } from '@calendar-hub/shared';

export function SettingsContent() {
  const { user, loading } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<ConnectedAccountPublic[]>([]);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showTimeTreeForm, setShowTimeTreeForm] = useState(false);
  const [ttEmail, setTtEmail] = useState('');
  const [ttPassword, setTtPassword] = useState('');
  const [ttConnecting, setTtConnecting] = useState(false);

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const email = searchParams.get('email');
    if (success === 'connected' && email) setMessage(`${email} を連携しました`);
    else if (error) setMessage(`エラー: ${error}`);
  }, [searchParams]);

  useEffect(() => {
    if (user) {
      loadAccounts();
      loadNotificationSettings();
    }
  }, [user]);

  const loadAccounts = async () => {
    try {
      const data = await apiGet<{ accounts: ConnectedAccountPublic[] }>('/api/auth/accounts');
      setAccounts(data.accounts);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  };

  const loadNotificationSettings = async () => {
    try {
      const data = await apiGet<{ settings: NotificationSettings }>('/api/notifications/settings');
      setNotifSettings(data.settings);
    } catch (err) {
      console.error('Failed to load notification settings:', err);
    }
  };

  const handleToggleNotifications = async (enabled: boolean) => {
    try {
      const updated: Partial<NotificationSettings> = {
        enabled,
        channels: enabled ? ['email'] : [],
        aiSuggestionNotify: enabled,
      };
      await apiPut('/api/notifications/settings', { settings: updated });
      setNotifSettings((prev) => (prev ? { ...prev, ...updated } : null));
      setMessage(enabled ? 'メール通知を有効にしました' : 'メール通知を無効にしました');
    } catch (err) {
      console.error('Failed to update notification settings:', err);
      setMessage('エラー: 通知設定の更新に失敗しました');
    }
  };

  const handleTestNotification = async () => {
    setTestSending(true);
    try {
      const data = await apiPost<{ success: boolean; sentTo: string }>('/api/notifications/test');
      setMessage(`テストメールを ${data.sentTo} に送信しました`);
    } catch (err) {
      console.error('Failed to send test notification:', err);
      setMessage('エラー: テスト通知の送信に失敗しました');
    } finally {
      setTestSending(false);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      const data = await apiGet<{ url: string }>('/api/auth/connect/google');
      window.location.href = data.url;
    } catch (err) {
      console.error('Failed to get connect URL:', err);
    }
  };

  const handleConnectTimeTree = async () => {
    if (!ttEmail || !ttPassword) return;
    setTtConnecting(true);
    try {
      const data = await apiPost<{ success: boolean; email: string }>(
        '/api/auth/connect/timetree',
        { email: ttEmail, password: ttPassword },
      );
      setMessage(`${data.email} を連携しました`);
      setShowTimeTreeForm(false);
      setTtEmail('');
      setTtPassword('');
      await loadAccounts();
    } catch {
      setMessage('エラー: TimeTreeログインに失敗しました');
    } finally {
      setTtConnecting(false);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    try {
      await apiDelete(`/api/auth/accounts/${accountId}`);
      await loadAccounts();
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  if (loading) return <PageLoading />;
  if (!user) return null;

  return (
    <PageShell maxWidth="compact">
      <h1 style={s.title}>設定</h1>

      {message && (
        <div
          style={{
            ...s.toast,
            borderColor: message.startsWith('エラー')
              ? 'rgba(224,120,80,0.3)'
              : 'rgba(90,154,106,0.3)',
            background: message.startsWith('エラー')
              ? 'rgba(224,120,80,0.06)'
              : 'rgba(90,154,106,0.06)',
          }}
        >
          {message}
        </div>
      )}

      {/* アカウント */}
      <section style={s.section}>
        <div style={s.sectionHeader}>
          <h2 style={s.sectionTitle}>アカウント</h2>
        </div>
        <div style={s.card}>
          <p style={s.email}>{user.email}</p>
          <button onClick={handleLogout} style={s.dangerBtn}>
            ログアウト
          </button>
        </div>
      </section>

      {/* 連携アカウント */}
      <section style={s.section}>
        <div style={s.sectionHeader}>
          <h2 style={s.sectionTitle}>連携アカウント</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleConnectGoogle} style={s.addBtn}>
              + Google追加
            </button>
            <button onClick={() => setShowTimeTreeForm(!showTimeTreeForm)} style={s.addBtn}>
              + TimeTree追加
            </button>
          </div>
        </div>

        {showTimeTreeForm && (
          <div style={s.ttForm}>
            <h3 style={s.ttFormTitle}>TimeTree連携</h3>
            <p style={s.ttFormHint}>TimeTreeのログイン情報を入力してください</p>
            <input
              type="email"
              placeholder="メールアドレス"
              value={ttEmail}
              onChange={(e) => setTtEmail(e.target.value)}
              style={s.ttInput}
            />
            <input
              type="password"
              placeholder="パスワード"
              value={ttPassword}
              onChange={(e) => setTtPassword(e.target.value)}
              style={s.ttInput}
              onKeyDown={(e) => e.key === 'Enter' && handleConnectTimeTree()}
            />
            <div style={s.ttActions}>
              <button
                onClick={handleConnectTimeTree}
                disabled={ttConnecting || !ttEmail || !ttPassword}
                style={s.ttSubmitBtn}
              >
                {ttConnecting ? '連携中...' : '連携する'}
              </button>
              <button
                onClick={() => {
                  setShowTimeTreeForm(false);
                  setTtEmail('');
                  setTtPassword('');
                }}
                style={s.disconnectBtn}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {accounts.length === 0 ? (
          <p style={s.empty}>連携中のアカウントはありません</p>
        ) : (
          <div style={s.accountList}>
            {accounts.map((account) => (
              <div key={account.id} style={s.accountItem}>
                <div>
                  <span style={s.accountEmail}>{account.email}</span>
                  <span
                    style={{
                      ...s.providerBadge,
                      background:
                        account.provider === 'google'
                          ? 'rgba(66,133,244,0.12)'
                          : 'rgba(76,175,80,0.12)',
                      color: account.provider === 'google' ? '#6ea8fe' : '#81c784',
                    }}
                  >
                    {account.provider === 'google' ? 'Google' : 'TimeTree'}
                  </span>
                  {!account.isActive && <span style={s.inactiveBadge}>無効</span>}
                </div>
                <button onClick={() => handleDisconnect(account.id)} style={s.disconnectBtn}>
                  解除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 通知設定 */}
      <section style={s.section}>
        <div style={s.sectionHeader}>
          <h2 style={s.sectionTitle}>通知設定</h2>
        </div>
        {notifSettings && (
          <div style={s.card}>
            <label style={s.toggle}>
              <input
                type="checkbox"
                checked={notifSettings.enabled}
                onChange={(e) => handleToggleNotifications(e.target.checked)}
                style={s.checkbox}
              />
              <span>メール通知を有効にする</span>
            </label>
            <p style={s.toggleHint}>AI提案の結果をメールで受け取ります</p>
            {notifSettings.enabled && (
              <button onClick={handleTestNotification} disabled={testSending} style={s.testBtn}>
                {testSending ? '送信中...' : 'テスト通知を送信'}
              </button>
            )}
          </div>
        )}
      </section>
    </PageShell>
  );
}

const s: Record<string, React.CSSProperties> = {
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '24px',
    fontWeight: 700,
    marginBottom: '24px',
    color: 'var(--color-text)',
  },
  toast: {
    padding: '10px 16px',
    border: '1px solid',
    borderRadius: '10px',
    marginBottom: '20px',
    fontSize: '13px',
    color: 'var(--color-text)',
  },
  section: { marginBottom: '28px' },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  card: {
    padding: '16px 18px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
  },
  email: { fontSize: '14px', color: 'var(--color-text)', marginBottom: '12px' },
  dangerBtn: {
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'var(--font-body)',
    cursor: 'pointer',
    border: '1px solid rgba(224,120,80,0.3)',
    borderRadius: '6px',
    background: 'rgba(224,120,80,0.08)',
    color: '#e07850',
    transition: 'all 0.2s',
  },
  addBtn: {
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'var(--font-body)',
    cursor: 'pointer',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    transition: 'all 0.2s',
  },
  ttForm: {
    padding: '16px 18px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    marginBottom: '12px',
  },
  ttFormTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: '4px',
  },
  ttFormHint: { fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px' },
  ttInput: {
    display: 'block',
    width: '100%',
    padding: '8px 12px',
    fontSize: '13px',
    fontFamily: 'var(--font-body)',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    color: 'var(--color-text)',
    marginBottom: '8px',
    outline: 'none',
  },
  ttActions: { display: 'flex', gap: '8px', marginTop: '4px' },
  ttSubmitBtn: {
    padding: '6px 16px',
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'var(--font-body)',
    cursor: 'pointer',
    border: '1px solid var(--color-accent)',
    borderRadius: '6px',
    background: 'var(--color-accent-glow)',
    color: 'var(--color-accent)',
    transition: 'all 0.2s',
  },
  empty: { fontSize: '13px', color: 'var(--color-text-muted)', padding: '20px 0' },
  accountList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  accountItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
  },
  accountEmail: { fontSize: '13px', color: 'var(--color-text)', marginRight: '8px' },
  providerBadge: { fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 500 },
  inactiveBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'rgba(255,255,255,0.06)',
    color: 'var(--color-text-muted)',
    marginLeft: '6px',
  },
  disconnectBtn: {
    padding: '4px 10px',
    fontSize: '11px',
    fontFamily: 'var(--font-body)',
    cursor: 'pointer',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    transition: 'all 0.2s',
  },
  toggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    fontSize: '14px',
    color: 'var(--color-text)',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    accentColor: 'var(--color-accent)',
    cursor: 'pointer',
  },
  toggleHint: { fontSize: '12px', color: 'var(--color-text-muted)', margin: '8px 0 0 26px' },
  testBtn: {
    marginTop: '12px',
    marginLeft: '26px',
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'var(--font-body)',
    cursor: 'pointer',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    background: 'var(--color-surface-hover)',
    color: 'var(--color-text)',
    transition: 'all 0.2s',
  },
};
