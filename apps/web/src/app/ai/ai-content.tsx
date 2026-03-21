'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { startOfWeek, endOfWeek } from 'date-fns';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useAuth } from '../../components/AuthProvider';
import { apiGet, apiPost, apiPatch } from '../../lib/api';

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

const TYPE_LABELS: Record<string, string> = {
  schedule: '予定',
  break: '休憩',
  task: 'タスク',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: '#e53935',
  medium: '#fb8c00',
  low: '#43a047',
};

export function AiContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [insights, setInsights] = useState('');
  const [generating, setGenerating] = useState(false);
  const [loadingList, setLoadingList] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

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
        { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() },
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

  if (loading) return <main style={{ padding: '2rem' }}>Loading...</main>;
  if (!user) return null;

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <h1 style={{ fontSize: '20px', margin: 0 }}>AI提案</h1>
        <nav style={{ display: 'flex', gap: '12px' }}>
          <a href="/calendar" style={{ color: '#666', fontSize: '14px' }}>
            カレンダー
          </a>
          <a href="/settings" style={{ color: '#666', fontSize: '14px' }}>
            設定
          </a>
        </nav>
      </header>

      <button
        onClick={handleGenerate}
        disabled={generating}
        style={{
          padding: '12px 24px',
          fontSize: '15px',
          cursor: generating ? 'not-allowed' : 'pointer',
          border: 'none',
          borderRadius: '8px',
          background: generating ? '#ccc' : '#4285f4',
          color: '#fff',
          marginBottom: '1.5rem',
        }}
      >
        {generating ? 'AI分析中...' : '今週のスケジュールを分析'}
      </button>

      {insights && (
        <div
          style={{
            padding: '12px',
            background: '#f0f7ff',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            fontSize: '14px',
          }}
        >
          {insights}
        </div>
      )}

      {loadingList ? (
        <p style={{ color: '#666' }}>提案を読み込み中...</p>
      ) : suggestions.length === 0 ? (
        <p style={{ color: '#999' }}>
          まだ提案はありません。上のボタンでAI分析を開始してください。
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {suggestions.map((s) => (
            <div
              key={s.id}
              style={{
                padding: '16px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                borderLeft: `4px solid ${PRIORITY_COLORS[s.priority] ?? '#666'}`,
                opacity: s.status !== 'pending' ? 0.6 : 1,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'center',
                      marginBottom: '4px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: '#eee',
                      }}
                    >
                      {TYPE_LABELS[s.type] ?? s.type}
                    </span>
                    <h3 style={{ fontSize: '15px', margin: 0 }}>{s.title}</h3>
                  </div>
                  <p style={{ fontSize: '13px', color: '#333', margin: '4px 0' }}>
                    {s.description}
                  </p>
                  {s.start && s.end && (
                    <p style={{ fontSize: '12px', color: '#666' }}>
                      {format(new Date(s.start), 'M/d (E) HH:mm', { locale: ja })} -{' '}
                      {format(new Date(s.end), 'HH:mm')}
                    </p>
                  )}
                  <p style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>{s.reasoning}</p>
                </div>

                {s.status === 'pending' ? (
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                    <button
                      onClick={() => handleAction(s.id, 'accepted')}
                      style={{ ...btnStyle, background: '#43a047', color: '#fff' }}
                    >
                      承認
                    </button>
                    <button
                      onClick={() => handleAction(s.id, 'rejected')}
                      style={{ ...btnStyle, background: '#e53935', color: '#fff' }}
                    >
                      却下
                    </button>
                  </div>
                ) : (
                  <span
                    style={{
                      fontSize: '12px',
                      color: s.status === 'accepted' ? '#43a047' : '#e53935',
                      flexShrink: 0,
                    }}
                  >
                    {s.status === 'accepted' ? '承認済み' : '却下済み'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: '13px',
  cursor: 'pointer',
  border: 'none',
  borderRadius: '6px',
};
