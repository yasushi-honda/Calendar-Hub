'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../components/AuthProvider';
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api';
import type { ConnectedAccountPublic, NotificationSettings } from '@calendar-hub/shared';

export function SettingsContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<ConnectedAccountPublic[]>([]);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const email = searchParams.get('email');

    if (success === 'connected' && email) {
      setMessage(`${email} を連携しました`);
    } else if (error) {
      setMessage(`エラー: ${error}`);
    }
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

  if (loading) return <main style={{ padding: '2rem' }}>Loading...</main>;
  if (!user) return null;

  return (
    <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1rem' }}>設定</h1>

      <section style={{ marginBottom: '2rem' }}>
        <p>ログイン中: {user.email}</p>
        <button onClick={handleLogout} style={buttonStyle}>
          ログアウト
        </button>
      </section>

      {message && (
        <div
          style={{
            padding: '12px',
            marginBottom: '1rem',
            background: message.startsWith('エラー') ? '#fee' : '#efe',
            borderRadius: '8px',
          }}
        >
          {message}
        </div>
      )}

      <section>
        <h2 style={{ marginBottom: '1rem' }}>連携アカウント</h2>

        {accounts.length === 0 ? (
          <p style={{ color: '#666' }}>連携中のアカウントはありません</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {accounts.map((account) => (
              <li
                key={account.id}
                style={{
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong>{account.email}</strong>
                  <br />
                  <small style={{ color: '#666' }}>
                    {account.provider === 'google' ? 'Google' : 'TimeTree'}
                    {!account.isActive && ' (無効)'}
                  </small>
                </div>
                <button onClick={() => handleDisconnect(account.id)} style={buttonStyleSmall}>
                  解除
                </button>
              </li>
            ))}
          </ul>
        )}

        <div style={{ marginTop: '1rem', display: 'flex', gap: '8px' }}>
          <button onClick={handleConnectGoogle} style={buttonStyle}>
            + Googleアカウントを追加
          </button>
        </div>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>通知設定</h2>

        {notifSettings && (
          <div
            style={{
              padding: '16px',
              border: '1px solid #ddd',
              borderRadius: '8px',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notifSettings.enabled}
                onChange={(e) => handleToggleNotifications(e.target.checked)}
              />
              メール通知を有効にする
            </label>
            <p style={{ fontSize: '13px', color: '#666', margin: '8px 0' }}>
              AI提案の結果をメールで受け取ります
            </p>

            {notifSettings.enabled && (
              <button
                onClick={handleTestNotification}
                disabled={testSending}
                style={{ ...buttonStyleSmall, marginTop: '8px' }}
              >
                {testSending ? '送信中...' : 'テスト通知を送信'}
              </button>
            )}
          </div>
        )}
      </section>

      <div style={{ marginTop: '2rem' }}>
        <a href="/" style={{ color: '#666' }}>
          ← ホームに戻る
        </a>
      </div>
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: '14px',
  cursor: 'pointer',
  border: '1px solid #ddd',
  borderRadius: '8px',
  background: '#fff',
};

const buttonStyleSmall: React.CSSProperties = {
  ...buttonStyle,
  padding: '6px 12px',
  fontSize: '12px',
};
