'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '../../../hooks/useRequireAuth';
import { apiPost } from '../../../lib/api';
import { PageShell, PageLoading } from '../../../components/PageShell';
import type { BookingMirrorLink, CreateBookingMirrorLinkInput } from '@calendar-hub/shared';

export function NewMirrorLinkContent() {
  const { user, loading: authLoading } = useRequireAuth();
  const router = useRouter();

  const [sourceUrl, setSourceUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [rangeDays, setRangeDays] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!sourceUrl.trim()) {
      setError('Google 予約スケジュール URL は必須です');
      return;
    }
    setSubmitting(true);
    try {
      const input: CreateBookingMirrorLinkInput = {
        sourceUrl: sourceUrl.trim(),
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        notificationEmail: notificationEmail.trim() || undefined,
        rangeDays,
      };
      await apiPost<{ link: BookingMirrorLink }>('/api/booking-mirror-links', input);
      router.push('/booking-mirror-links');
    } catch (err) {
      setError(err instanceof Error ? err.message : '作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) return <PageLoading />;
  if (!user) return null;

  return (
    <PageShell maxWidth="medium">
      <button onClick={() => router.back()} style={s.backBtn}>
        ← 戻る
      </button>

      <h1 style={s.title}>新規ミラーリンク作成</h1>
      <p style={s.intro}>
        Google 予約スケジュールの公開ページ URL を貼り付けると、その内容がそのまま CalendarHub
        の公開予約ページに反映されます。Google 側設定（営業時間 / 既存予定 / Buffer 等）はすべて
        Google 予約スケジュールの判定をそのまま使います。
      </p>

      {error && <div style={s.errorBox}>{error}</div>}

      <div style={s.section}>
        <label style={s.label}>
          Google 予約スケジュール URL <span style={s.required}>*</span>
        </label>
        <input
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://calendar.app.google/XXX または完全 URL"
          style={s.input}
          autoFocus
        />
        <span style={s.hint}>
          短縮 URL (`calendar.app.google/...`) と完全 URL
          (`calendar.google.com/calendar/.../schedules/...`) のどちらも入力可能です
        </span>

        <label style={s.label}>タイトル (任意)</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: 【本田】予約スケジュール"
          style={s.input}
        />
        <span style={s.hint}>未入力時は「【ミラー】予約スケジュール」になります</span>

        <label style={s.label}>説明 (任意)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="ご相談・お打ち合わせのご予約はこちらから（60分）"
          rows={3}
          style={{ ...s.input, resize: 'vertical' as const }}
        />

        <label style={s.label}>通知先メール (任意)</label>
        <input
          type="email"
          value={notificationEmail}
          onChange={(e) => setNotificationEmail(e.target.value)}
          placeholder="hy.unimail.11@gmail.com"
          style={s.input}
        />
        <span style={s.hint}>未入力時は hy.unimail.11@gmail.com に通知が送られます</span>

        <label style={s.label}>公開日数</label>
        <select
          value={rangeDays}
          onChange={(e) => setRangeDays(Number(e.target.value))}
          style={s.input}
        >
          {[7, 14, 30, 45, 60].map((d) => (
            <option key={d} value={d}>
              {d} 日先まで
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!sourceUrl.trim() || submitting}
        style={{ ...s.submitBtn, opacity: !sourceUrl.trim() || submitting ? 0.5 : 1 }}
      >
        {submitting ? '作成中...' : 'ミラーリンクを作成'}
      </button>
    </PageShell>
  );
}

const s: Record<string, React.CSSProperties> = {
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '0',
    marginBottom: '20px',
    fontFamily: 'inherit',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '22px',
    fontWeight: 600,
    marginBottom: '8px',
  },
  intro: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    marginBottom: '24px',
    lineHeight: 1.6,
  },
  errorBox: {
    padding: '10px 14px',
    background: 'rgba(229,57,53,0.1)',
    border: '1px solid rgba(229,57,53,0.2)',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '13px',
    color: '#ef9a9a',
  },
  section: {
    padding: '20px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    marginBottom: '24px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    marginTop: '12px',
    marginBottom: '6px',
  },
  required: { color: 'var(--color-accent)' },
  input: {
    width: '100%',
    padding: '12px 14px',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    color: 'var(--color-text)',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
  },
  hint: {
    display: 'block',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    marginTop: '-2px',
    lineHeight: 1.5,
  },
  submitBtn: {
    width: '100%',
    padding: '14px',
    background: 'var(--color-accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
};
