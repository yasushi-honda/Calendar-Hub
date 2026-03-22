'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { apiGet, apiDelete, apiPatch } from '../../lib/api';
import { PageShell, PageLoading } from '../../components/PageShell';
import type { BookingLink } from '@calendar-hub/shared';

export function BookingLinksContent() {
  const { user, loading: authLoading } = useRequireAuth();
  const router = useRouter();
  const [links, setLinks] = useState<BookingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadLinks = useCallback(async () => {
    try {
      const res = await apiGet<{ links: BookingLink[] }>('/api/booking-links');
      setLinks(res.links);
    } catch (err) {
      console.error('Failed to load links:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadLinks();
  }, [user, loadLinks]);

  const handleToggleStatus = async (link: BookingLink) => {
    const newStatus = link.status === 'active' ? 'paused' : 'active';
    try {
      const res = await apiPatch<{ link: BookingLink }>(`/api/booking-links/${link.id}`, {
        status: newStatus,
      });
      setLinks((prev) => prev.map((l) => (l.id === link.id ? res.link : l)));
      setMessage(newStatus === 'active' ? 'リンクを有効にしました' : 'リンクを一時停止しました');
    } catch {
      setMessage('更新に失敗しました');
    }
  };

  const handleDelete = async (linkId: string) => {
    if (!confirm('このリンクを削除しますか？')) return;
    try {
      await apiDelete(`/api/booking-links/${linkId}`);
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
      setMessage('リンクを削除しました');
    } catch {
      setMessage('削除に失敗しました');
    }
  };

  const handleCopyLink = (linkId: string) => {
    const url = `${window.location.origin}/book/${linkId}`;
    navigator.clipboard.writeText(url);
    setMessage('リンクをコピーしました');
  };

  if (authLoading) return <PageLoading />;
  if (!user) return null;

  return (
    <PageShell maxWidth="medium">
      <div style={s.header}>
        <h1 style={s.title}>予約リンク</h1>
        <button onClick={() => router.push('/booking-links/new')} style={s.addBtn}>
          + 新規作成
        </button>
      </div>

      {message && (
        <div style={s.toast} onClick={() => setMessage('')}>
          {message}
        </div>
      )}

      {loading ? (
        <div style={s.loadingMsg}>読み込み中...</div>
      ) : links.length === 0 ? (
        <div style={s.empty}>
          <p style={s.emptyText}>予約リンクがまだありません</p>
          <p style={s.emptyHint}>新規作成して公開URLを共有すると、先方が空き時間から予約できます</p>
        </div>
      ) : (
        <div style={s.list}>
          {links.map((link) => (
            <div key={link.id} style={s.card}>
              <div style={s.cardHeader}>
                <div>
                  <h3 style={s.cardTitle}>{link.title}</h3>
                  <span style={s.cardDuration}>{link.durationMinutes}分</span>
                </div>
                <span
                  style={{
                    ...s.statusBadge,
                    background:
                      link.status === 'active' ? 'rgba(76,175,80,0.15)' : 'rgba(255,152,0,0.15)',
                    color: link.status === 'active' ? '#81c784' : '#ffb74d',
                  }}
                >
                  {link.status === 'active' ? '有効' : '一時停止'}
                </span>
              </div>

              {link.description && <p style={s.cardDesc}>{link.description}</p>}

              <div style={s.cardActions}>
                <button onClick={() => handleCopyLink(link.id)} style={s.actionBtn}>
                  URLコピー
                </button>
                <button
                  onClick={() => window.open(`/book/${link.id}`, '_blank')}
                  style={s.actionBtn}
                >
                  プレビュー
                </button>
                <button onClick={() => handleToggleStatus(link)} style={s.actionBtn}>
                  {link.status === 'active' ? '一時停止' : '有効化'}
                </button>
                <button
                  onClick={() => handleDelete(link.id)}
                  style={{ ...s.actionBtn, color: '#ef9a9a' }}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '24px',
    fontWeight: 600,
  },
  addBtn: {
    padding: '10px 20px',
    background: 'var(--color-accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  toast: {
    padding: '10px 16px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    fontSize: '13px',
    marginBottom: '16px',
    cursor: 'pointer',
    color: 'var(--color-accent)',
  },
  loadingMsg: {
    textAlign: 'center',
    padding: '40px',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
  },
  empty: {
    textAlign: 'center',
    padding: '60px 20px',
  },
  emptyText: {
    fontSize: '16px',
    fontWeight: 500,
    marginBottom: '8px',
  },
  emptyHint: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    lineHeight: 1.6,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  card: {
    padding: '20px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '4px',
  },
  cardDuration: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  statusBadge: {
    fontSize: '11px',
    padding: '4px 10px',
    borderRadius: '6px',
    fontWeight: 500,
  },
  cardDesc: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
    marginBottom: '12px',
  },
  cardActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    borderTop: '1px solid var(--color-border)',
    paddingTop: '12px',
    marginTop: '4px',
  },
  actionBtn: {
    padding: '6px 14px',
    background: 'none',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
  },
};
