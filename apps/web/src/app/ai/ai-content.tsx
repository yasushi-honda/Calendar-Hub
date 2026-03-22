'use client';

import { useState, useEffect } from 'react';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { apiGet, apiPost, apiPatch } from '../../lib/api';
import { PageShell, PageLoading } from '../../components/PageShell';

interface Suggestion {
  id: string;
  type: 'schedule' | 'break' | 'task';
  title: string;
  description: string;
  start: string;
  end: string;
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'accepted' | 'rejected';
}

const TYPE_CONFIG: Record<string, { label: string; icon: string }> = {
  schedule: { label: '予定', icon: '◉' },
  break: { label: '休憩', icon: '◌' },
  task: { label: 'タスク', icon: '◈' },
};

const PRIORITY_COLORS: Record<string, string> = {
  high: '#e07850',
  medium: '#c4943a',
  low: '#5a9a6a',
};

export function AiContent() {
  const { user, loading } = useRequireAuth();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [insights, setInsights] = useState('');
  const [generating, setGenerating] = useState(false);
  const [loadingList, setLoadingList] = useState(false);

  useEffect(() => {
    if (user) loadSuggestions();
  }, [user]);

  const loadSuggestions = async () => {
    setLoadingList(true);
    try {
      const data = await apiGet<{ suggestions: Suggestion[] }>('/api/ai/suggestions');
      setSuggestions(data.suggestions);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
    } finally {
      setLoadingList(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const now = new Date();
      const timeMin = startOfWeek(now, { weekStartsOn: 1 });
      const timeMax = endOfWeek(now, { weekStartsOn: 1 });
      const data = await apiPost<{ suggestions: Suggestion[]; insights: string }>(
        '/api/ai/suggest',
        {
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
        },
      );
      setSuggestions((prev) => [...data.suggestions, ...prev]);
      setInsights(data.insights);
    } catch (err) {
      console.error('AI suggestion failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleAction = async (id: string, status: 'accepted' | 'rejected') => {
    try {
      await apiPatch(`/api/ai/suggestions/${id}`, { status });
      setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    } catch (err) {
      console.error('Failed to update suggestion:', err);
    }
  };

  if (loading) return <PageLoading />;
  if (!user) return null;

  return (
    <PageShell maxWidth="medium">
      <div style={s.header}>
        <div>
          <h1 style={s.title}>AI提案</h1>
          <p style={s.desc}>あなたのスケジュールをAIが分析し、最適な予定を提案します</p>
        </div>
        <button onClick={handleGenerate} disabled={generating} style={s.generateBtn}>
          {generating ? <span style={s.spinner}>◎ 分析中...</span> : '今週のスケジュールを分析'}
        </button>
      </div>

      {insights && (
        <div style={s.insightsCard}>
          <span style={s.insightsIcon}>◇</span>
          <p style={s.insightsText}>{insights}</p>
        </div>
      )}

      {loadingList ? (
        <p style={s.emptyText}>提案を読み込み中...</p>
      ) : suggestions.length === 0 ? (
        <div style={s.emptyState}>
          <span style={s.emptyIcon}>◇</span>
          <p style={s.emptyText}>まだ提案はありません</p>
          <p style={s.emptyHint}>上のボタンでAI分析を開始してください</p>
        </div>
      ) : (
        <div style={s.list}>
          {suggestions.map((sg) => {
            const cfg = TYPE_CONFIG[sg.type] ?? TYPE_CONFIG.schedule;
            const isPending = sg.status === 'pending';
            return (
              <div key={sg.id} style={{ ...s.card, opacity: isPending ? 1 : 0.5 }}>
                <div
                  style={{ ...s.cardBorder, background: PRIORITY_COLORS[sg.priority] ?? '#666' }}
                />
                <div style={s.cardBody}>
                  <div style={s.cardTop}>
                    <div style={s.badges}>
                      <span style={s.typeBadge}>
                        {cfg.icon} {cfg.label}
                      </span>
                      <span style={{ ...s.priBadge, color: PRIORITY_COLORS[sg.priority] }}>
                        {sg.priority}
                      </span>
                    </div>
                    {isPending ? (
                      <div style={s.actions}>
                        <button onClick={() => handleAction(sg.id, 'accepted')} style={s.acceptBtn}>
                          承認
                        </button>
                        <button onClick={() => handleAction(sg.id, 'rejected')} style={s.rejectBtn}>
                          却下
                        </button>
                      </div>
                    ) : (
                      <span
                        style={{
                          ...s.statusLabel,
                          color: sg.status === 'accepted' ? '#5a9a6a' : '#e07850',
                        }}
                      >
                        {sg.status === 'accepted' ? '承認済み' : '却下済み'}
                      </span>
                    )}
                  </div>
                  <h3 style={s.cardTitle}>{sg.title}</h3>
                  <p style={s.cardDesc}>{sg.description}</p>
                  {sg.start && sg.end && (
                    <p style={s.cardTime}>
                      {format(new Date(sg.start), 'M/d (E) HH:mm', { locale: ja })} -{' '}
                      {format(new Date(sg.end), 'HH:mm')}
                    </p>
                  )}
                  <p style={s.cardReason}>{sg.reasoning}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </PageShell>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '28px',
    gap: '16px',
    flexWrap: 'wrap',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '24px',
    fontWeight: 700,
    marginBottom: '6px',
    color: 'var(--color-text)',
  },
  desc: { fontSize: '13px', color: 'var(--color-text-muted)' },
  generateBtn: {
    padding: '10px 20px',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: 'var(--font-body)',
    cursor: 'pointer',
    border: '1px solid var(--color-accent)',
    borderRadius: '10px',
    background: 'var(--color-accent-glow)',
    color: 'var(--color-accent)',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  spinner: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    animation: 'spin 2s linear infinite',
  },
  insightsCard: {
    display: 'flex',
    gap: '12px',
    padding: '14px 18px',
    background: 'rgba(224,120,80,0.06)',
    border: '1px solid rgba(224,120,80,0.12)',
    borderRadius: 'var(--radius)',
    marginBottom: '24px',
  },
  insightsIcon: { color: 'var(--color-accent)', fontSize: '16px', marginTop: '2px' },
  insightsText: { fontSize: '13px', color: 'var(--color-text)', lineHeight: 1.7 },
  emptyState: { textAlign: 'center', padding: '60px 0' },
  emptyIcon: { fontSize: '32px', color: 'var(--color-text-muted)', opacity: 0.3 },
  emptyText: { fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '12px' },
  emptyHint: { fontSize: '12px', color: 'var(--color-text-muted)', opacity: 0.5, marginTop: '6px' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  card: {
    display: 'flex',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    transition: 'opacity 0.3s',
  },
  cardBorder: { width: '4px', flexShrink: 0 },
  cardBody: { flex: 1, padding: '16px 18px' },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  badges: { display: 'flex', gap: '8px', alignItems: 'center' },
  typeBadge: {
    fontSize: '11px',
    padding: '3px 8px',
    borderRadius: '6px',
    background: 'rgba(255,255,255,0.06)',
    color: 'var(--color-text-muted)',
    fontWeight: 500,
  },
  priBadge: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  actions: { display: 'flex', gap: '6px' },
  acceptBtn: {
    padding: '5px 14px',
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'var(--font-body)',
    cursor: 'pointer',
    border: '1px solid rgba(90,154,106,0.3)',
    borderRadius: '6px',
    background: 'rgba(90,154,106,0.1)',
    color: '#5a9a6a',
    transition: 'all 0.2s',
  },
  rejectBtn: {
    padding: '5px 14px',
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'var(--font-body)',
    cursor: 'pointer',
    border: '1px solid rgba(224,120,80,0.3)',
    borderRadius: '6px',
    background: 'rgba(224,120,80,0.1)',
    color: '#e07850',
    transition: 'all 0.2s',
  },
  statusLabel: { fontSize: '12px', fontWeight: 500 },
  cardTitle: { fontSize: '15px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '4px' },
  cardDesc: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
    marginBottom: '6px',
  },
  cardTime: { fontSize: '12px', color: 'var(--color-accent)', marginBottom: '6px' },
  cardReason: { fontSize: '12px', color: 'var(--color-text-muted)', opacity: 0.7, lineHeight: 1.5 },
};
