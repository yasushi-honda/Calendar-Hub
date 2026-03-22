'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '../../../hooks/useRequireAuth';
import { apiGet, apiPost } from '../../../lib/api';
import { PageShell, PageLoading } from '../../../components/PageShell';
import type { ConnectedAccountPublic } from '@calendar-hub/shared';

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

interface Calendar {
  id: string;
  name: string;
  accountId: string;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function NewLinkContent() {
  const { user, loading: authLoading } = useRequireAuth();
  const router = useRouter();

  const [accounts, setAccounts] = useState<ConnectedAccountPublic[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Form state
  const [title, setTitle] = useState('30分ミーティング');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [calendarIdForEvent, setCalendarIdForEvent] = useState('');
  const [accountIdForEvent, setAccountIdForEvent] = useState('');
  const [dayStartHour, setDayStartHour] = useState(9);
  const [dayEndHour, setDayEndHour] = useState(18);
  const [availableDays, setAvailableDays] = useState([1, 2, 3, 4, 5]);
  const [rangeDays, setRangeDays] = useState(14);
  const [bufferMinutes, setBufferMinutes] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // アカウント＆カレンダー読み込み
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [accRes, calRes] = await Promise.all([
          apiGet<{ accounts: ConnectedAccountPublic[] }>('/api/auth/accounts'),
          apiGet<{ calendars: Calendar[] }>('/api/calendars'),
        ]);
        setAccounts(accRes.accounts.filter((a) => a.isActive));
        setCalendars(calRes.calendars);

        // デフォルト: 全アカウント選択、最初のカレンダーをイベント作成先に
        const activeIds = accRes.accounts.filter((a) => a.isActive).map((a) => a.id);
        setSelectedAccountIds(activeIds);

        if (calRes.calendars.length > 0) {
          setCalendarIdForEvent(calRes.calendars[0].id);
          setAccountIdForEvent(calRes.calendars[0].accountId);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoadingData(false);
      }
    })();
  }, [user]);

  const toggleDay = useCallback((day: number) => {
    setAvailableDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }, []);

  const handleCalendarSelect = useCallback(
    (calId: string) => {
      setCalendarIdForEvent(calId);
      const cal = calendars.find((c) => c.id === calId);
      if (cal) setAccountIdForEvent(cal.accountId);
    },
    [calendars],
  );

  const handleSubmit = async () => {
    if (!title.trim() || !calendarIdForEvent || selectedAccountIds.length === 0) {
      setError('タイトル、カレンダー、アカウントを設定してください');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiPost('/api/booking-links', {
        title: title.trim(),
        description: description.trim() || undefined,
        durationMinutes,
        accountIds: selectedAccountIds,
        calendarIdForEvent,
        accountIdForEvent,
        freeTimeOptions: { dayStartHour, dayEndHour },
        availableDays,
        rangeDays,
        bufferMinutes,
      });
      router.push('/booking-links');
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
      <div style={s.header}>
        <button onClick={() => router.push('/booking-links')} style={s.backBtn}>
          ← 戻る
        </button>
        <h1 style={s.title}>予約リンクを作成</h1>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {loadingData ? (
        <div style={s.loading}>読み込み中...</div>
      ) : (
        <div style={s.form}>
          {/* 基本情報 */}
          <div style={s.section}>
            <h2 style={s.sectionTitle}>基本情報</h2>
            <label style={s.label}>タイトル</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={s.input}
            />

            <label style={s.label}>説明（任意）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ ...s.input, resize: 'vertical' as const }}
            />

            <label style={s.label}>所要時間</label>
            <div style={s.durationGrid}>
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDurationMinutes(d)}
                  style={{
                    ...s.durationBtn,
                    borderColor:
                      durationMinutes === d ? 'var(--color-accent)' : 'var(--color-border)',
                    background:
                      durationMinutes === d ? 'var(--color-accent-glow)' : 'var(--color-surface)',
                    color: durationMinutes === d ? 'var(--color-accent)' : 'var(--color-text)',
                  }}
                >
                  {d}分
                </button>
              ))}
            </div>
          </div>

          {/* カレンダー設定 */}
          <div style={s.section}>
            <h2 style={s.sectionTitle}>カレンダー設定</h2>

            <label style={s.label}>空き時間の計算に使うアカウント</label>
            <div style={s.checkboxList}>
              {accounts.map((acc) => (
                <label key={acc.id} style={s.checkboxItem}>
                  <input
                    type="checkbox"
                    checked={selectedAccountIds.includes(acc.id)}
                    onChange={() => {
                      setSelectedAccountIds((prev) =>
                        prev.includes(acc.id)
                          ? prev.filter((id) => id !== acc.id)
                          : [...prev, acc.id],
                      );
                    }}
                  />
                  <span>
                    {acc.provider === 'google' ? 'Google' : 'TimeTree'} - {acc.email}
                  </span>
                </label>
              ))}
            </div>

            <label style={s.label}>予約イベントを作成するカレンダー</label>
            <select
              value={calendarIdForEvent}
              onChange={(e) => handleCalendarSelect(e.target.value)}
              style={s.select}
            >
              {calendars.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.name}
                </option>
              ))}
            </select>
          </div>

          {/* 受付設定 */}
          <div style={s.section}>
            <h2 style={s.sectionTitle}>受付設定</h2>

            <label style={s.label}>受付可能な曜日</label>
            <div style={s.daysRow}>
              {WEEKDAYS.map((name, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  style={{
                    ...s.dayBtn,
                    borderColor: availableDays.includes(i)
                      ? 'var(--color-accent)'
                      : 'var(--color-border)',
                    background: availableDays.includes(i)
                      ? 'var(--color-accent-glow)'
                      : 'var(--color-surface)',
                    color: availableDays.includes(i)
                      ? 'var(--color-accent)'
                      : 'var(--color-text-muted)',
                  }}
                >
                  {name}
                </button>
              ))}
            </div>

            <div style={s.row}>
              <div style={s.halfField}>
                <label style={s.label}>開始時刻</label>
                <select
                  value={dayStartHour}
                  onChange={(e) => setDayStartHour(Number(e.target.value))}
                  style={s.select}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </div>
              <div style={s.halfField}>
                <label style={s.label}>終了時刻</label>
                <select
                  value={dayEndHour}
                  onChange={(e) => setDayEndHour(Number(e.target.value))}
                  style={s.select}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {String(i).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={s.row}>
              <div style={s.halfField}>
                <label style={s.label}>公開日数</label>
                <select
                  value={rangeDays}
                  onChange={(e) => setRangeDays(Number(e.target.value))}
                  style={s.select}
                >
                  {[7, 14, 21, 30, 60].map((d) => (
                    <option key={d} value={d}>
                      {d}日先まで
                    </option>
                  ))}
                </select>
              </div>
              <div style={s.halfField}>
                <label style={s.label}>前後バッファ</label>
                <select
                  value={bufferMinutes}
                  onChange={(e) => setBufferMinutes(Number(e.target.value))}
                  style={s.select}
                >
                  {[0, 5, 10, 15, 30].map((m) => (
                    <option key={m} value={m}>
                      {m === 0 ? 'なし' : `${m}分`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              ...s.submitBtn,
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? '作成中...' : '予約リンクを作成'}
          </button>
        </div>
      )}
    </PageShell>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: {
    marginBottom: '24px',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '0',
    marginBottom: '12px',
    fontFamily: 'inherit',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '24px',
    fontWeight: 600,
  },
  error: {
    padding: '10px 14px',
    background: 'rgba(229,57,53,0.1)',
    border: '1px solid rgba(229,57,53,0.2)',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '13px',
    color: '#ef9a9a',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  section: {
    padding: '20px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    marginBottom: '16px',
    color: 'var(--color-text)',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    marginBottom: '6px',
    marginTop: '12px',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    color: 'var(--color-text)',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  select: {
    width: '100%',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    color: 'var(--color-text)',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  durationGrid: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  durationBtn: {
    padding: '8px 18px',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
  },
  checkboxList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  checkboxItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  daysRow: {
    display: 'flex',
    gap: '6px',
  },
  dayBtn: {
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s ease',
  },
  row: {
    display: 'flex',
    gap: '12px',
  },
  halfField: {
    flex: 1,
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
    transition: 'all 0.2s ease',
  },
};
