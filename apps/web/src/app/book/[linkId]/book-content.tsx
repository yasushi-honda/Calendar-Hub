'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { publicGet, publicPost } from '../../../lib/public-api';
import type {
  PublicBookingLinkInfo,
  BookingSlot,
  PublicBookingConfirmation,
} from '@calendar-hub/shared';

type Step = 'select' | 'form' | 'confirmed';

interface SlotsResponse {
  slots: BookingSlot[];
  durationMinutes: number;
  title: string;
}

export function BookContent() {
  const params = useParams();
  const linkId = params.linkId as string;

  const [linkInfo, setLinkInfo] = useState<PublicBookingLinkInfo | null>(null);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [error, setError] = useState('');

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [step, setStep] = useState<Step>('select');

  // Form state
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestMessage, setGuestMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<PublicBookingConfirmation | null>(null);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // リンク情報 + スロットを並列取得
  useEffect(() => {
    if (!linkId) return;
    (async () => {
      setSlotsLoading(true);
      try {
        const [linkRes, slotsRes] = await Promise.all([
          publicGet<{ link: PublicBookingLinkInfo }>(`/api/public/booking/${linkId}`),
          publicGet<SlotsResponse>(`/api/public/booking/${linkId}/slots`),
        ]);
        setLinkInfo(linkRes.link);
        setSlots(slotsRes.slots);
        if (slotsRes.slots.length > 0) {
          setSelectedDate(slotsRes.slots[0].start.split('T')[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
        setSlotsLoading(false);
      }
    })();
  }, [linkId]);

  // 日付別グルーピング
  const dateGroups = useMemo(() => {
    const groups: Record<string, BookingSlot[]> = {};
    for (const slot of slots) {
      const date = slot.start.split('T')[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(slot);
    }
    return groups;
  }, [slots]);

  const availableDates = useMemo(() => Object.keys(dateGroups).sort(), [dateGroups]);

  const slotsForSelectedDate = useMemo(
    () => (selectedDate ? (dateGroups[selectedDate] ?? []) : []),
    [selectedDate, dateGroups],
  );

  const handleSelectSlot = useCallback((slot: BookingSlot) => {
    setSelectedSlot(slot);
    setStep('form');
  }, []);

  const handleBack = useCallback(() => {
    setSelectedSlot(null);
    setStep('select');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedSlot || !guestName.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await publicPost<{ booking: PublicBookingConfirmation }>(
        `/api/public/booking/${linkId}/book`,
        {
          slotStart: selectedSlot.start,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim() || undefined,
          guestMessage: guestMessage.trim() || undefined,
        },
      );
      setConfirmation(res.booking);
      setStep('confirmed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  }, [selectedSlot, guestName, guestEmail, guestMessage, linkId]);

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.meshBg}>
          <div style={{ ...s.meshOrb, ...s.orb1 }} />
        </div>
        <div style={s.grain} />
        <div style={s.loadingCenter}>
          <div style={s.spinner} />
        </div>
        <style>{keyframes}</style>
      </div>
    );
  }

  if (error && !linkInfo) {
    return (
      <div style={s.page}>
        <div style={s.meshBg}>
          <div style={{ ...s.meshOrb, ...s.orb1 }} />
        </div>
        <div style={s.grain} />
        <div style={s.errorCenter}>
          <h2 style={s.errorTitle}>Link not available</h2>
          <p style={s.errorMsg}>{error}</p>
        </div>
        <style>{keyframes}</style>
      </div>
    );
  }

  if (!linkInfo) return null;

  return (
    <div style={s.page}>
      {/* Background */}
      <div style={s.meshBg}>
        <div style={{ ...s.meshOrb, ...s.orb1 }} />
      </div>
      <div style={s.grain} />

      {/* Main layout */}
      <div
        style={{
          ...s.layout,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(16px)',
        }}
      >
        {/* Left: Info panel */}
        <aside style={s.infoPanel}>
          <a href="/" style={s.logo}>
            Calendar<span style={s.logoAccent}>Hub</span>
          </a>

          <div style={s.ownerName}>{linkInfo.ownerDisplayName}</div>
          <h1 style={s.meetingTitle}>{linkInfo.title}</h1>

          <div style={s.durationBadge}>
            <span style={s.durationIcon}>◷</span>
            {linkInfo.durationMinutes}分
          </div>

          {linkInfo.description && <p style={s.description}>{linkInfo.description}</p>}

          <div style={s.divider} />

          <div style={s.steps}>
            <div
              style={{
                ...s.stepItem,
                color: step === 'select' ? 'var(--color-accent)' : 'var(--color-text-muted)',
              }}
            >
              <span style={s.stepNum}>1</span> 日時を選択
            </div>
            <div
              style={{
                ...s.stepItem,
                color: step === 'form' ? 'var(--color-accent)' : 'var(--color-text-muted)',
              }}
            >
              <span style={s.stepNum}>2</span> 情報を入力
            </div>
            <div
              style={{
                ...s.stepItem,
                color: step === 'confirmed' ? 'var(--color-accent)' : 'var(--color-text-muted)',
              }}
            >
              <span style={s.stepNum}>3</span> 確認
            </div>
          </div>
        </aside>

        {/* Right: Content area */}
        <main style={s.contentPanel}>
          {error && <div style={s.errorBanner}>{error}</div>}

          {step === 'select' && (
            <>
              {/* Date cards */}
              <div style={s.sectionLabel}>日付を選択</div>
              {slotsLoading ? (
                <div style={s.slotsLoading}>読み込み中...</div>
              ) : availableDates.length === 0 ? (
                <div style={s.noSlots}>利用可能な日程がありません</div>
              ) : (
                <>
                  <div style={s.dateCardsWrap}>
                    <div style={s.dateCards}>
                      {availableDates.map((date) => (
                        <button
                          key={date}
                          onClick={() => {
                            setSelectedDate(date);
                            setSelectedSlot(null);
                          }}
                          className="date-card"
                          style={{
                            ...s.dateCard,
                            borderColor:
                              selectedDate === date ? 'var(--color-accent)' : 'var(--color-border)',
                            background:
                              selectedDate === date
                                ? 'var(--color-accent-glow)'
                                : 'var(--color-surface)',
                          }}
                        >
                          <span style={s.dateWeekday}>{formatWeekday(date)}</span>
                          <span
                            style={{
                              ...s.dateNum,
                              color:
                                selectedDate === date ? 'var(--color-accent)' : 'var(--color-text)',
                            }}
                          >
                            {formatDateNum(date)}
                          </span>
                          <span style={s.dateSlotCount}>{dateGroups[date].length}枠</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time slots */}
                  {selectedDate && (
                    <>
                      <div style={s.sectionLabel}>{formatDate(selectedDate)} の空き時間</div>
                      <div style={s.slotsGrid}>
                        {slotsForSelectedDate.map((slot) => (
                          <button
                            key={slot.start}
                            onClick={() => handleSelectSlot(slot)}
                            className="slot-btn"
                            style={s.slotBtn}
                          >
                            {formatTime(slot.start)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {step === 'form' && selectedSlot && (
            <div style={s.formWrap}>
              <button onClick={handleBack} style={s.backBtn}>
                ← 日時選択に戻る
              </button>

              <div style={s.selectedTime}>
                <span style={s.selectedTimeLabel}>選択した日時</span>
                <span style={s.selectedTimeValue}>
                  {formatDate(selectedSlot.start.split('T')[0])} {formatTime(selectedSlot.start)} -{' '}
                  {formatTime(selectedSlot.end)}
                </span>
              </div>

              <div style={s.formFields}>
                <label style={s.label}>
                  お名前 <span style={s.required}>*</span>
                </label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="山田 太郎"
                  style={s.input}
                  autoFocus
                />

                <label style={s.label}>メールアドレス</label>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="email@example.com"
                  style={s.input}
                />
                <span style={s.hint}>入力すると確認メールをお送りします</span>

                <label style={s.label}>メッセージ</label>
                <textarea
                  value={guestMessage}
                  onChange={(e) => setGuestMessage(e.target.value)}
                  placeholder="ご要望など"
                  rows={3}
                  style={{ ...s.input, resize: 'vertical' as const }}
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={!guestName.trim() || submitting}
                className="submit-btn"
                style={{
                  ...s.submitBtn,
                  opacity: !guestName.trim() || submitting ? 0.5 : 1,
                }}
              >
                {submitting ? '予約中...' : '予約を確定する'}
              </button>
            </div>
          )}

          {step === 'confirmed' && confirmation && (
            <div style={s.confirmedWrap}>
              <div style={s.checkCircle}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="22" stroke="var(--color-accent)" strokeWidth="2" />
                  <path
                    d="M14 24L21 31L34 18"
                    stroke="var(--color-accent)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h2 style={s.confirmedTitle}>予約が確定しました</h2>
              <div style={s.confirmedCard}>
                <p style={s.confirmedItem}>
                  <strong>{confirmation.linkTitle}</strong>
                </p>
                <p style={s.confirmedItem}>
                  {formatDate(confirmation.slotStart.split('T')[0])}{' '}
                  {formatTime(confirmation.slotStart)} - {formatTime(confirmation.slotEnd)}
                </p>
                <p style={s.confirmedItem}>主催: {confirmation.ownerDisplayName}</p>
              </div>
              {guestEmail && (
                <p style={s.confirmedHint}>確認メールを {guestEmail} に送信しました</p>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <div style={s.footer}>
        <span style={s.footerText}>
          Calendar<span style={s.logoAccent}>Hub</span>
        </span>
      </div>

      <style>{keyframes}</style>
    </div>
  );
}

// --- ユーティリティ（モジュールスコープ） ---

function toLocalDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

function formatDate(dateStr: string): string {
  return toLocalDate(dateStr).toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  });
}

function formatDateNum(dateStr: string): string {
  return toLocalDate(dateStr).getDate().toString();
}

function formatWeekday(dateStr: string): string {
  return toLocalDate(dateStr).toLocaleDateString('ja-JP', { weekday: 'short' });
}

const keyframes = `
  @keyframes float1 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(30px, -50px) scale(1.1); }
    66% { transform: translate(-20px, 20px) scale(0.9); }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes scaleIn {
    from { transform: scale(0); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  .date-card:hover {
    transform: translateY(-2px);
    border-color: var(--color-accent) !important;
  }
  .slot-btn:hover {
    background: var(--color-accent-glow) !important;
    border-color: var(--color-accent) !important;
    color: var(--color-accent) !important;
  }
  .submit-btn:hover:not(:disabled) {
    background: #c86840 !important;
  }
  @media (max-width: 768px) {
    .book-layout {
      flex-direction: column !important;
    }
    .book-info-panel {
      border-right: none !important;
      border-bottom: 1px solid var(--color-border) !important;
      max-width: 100% !important;
      padding: 24px !important;
    }
  }
`;

const s: Record<string, React.CSSProperties> = {
  page: {
    position: 'relative',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meshBg: {
    position: 'fixed',
    inset: 0,
    overflow: 'hidden',
    zIndex: 0,
    pointerEvents: 'none',
  },
  meshOrb: {
    position: 'absolute',
    borderRadius: '50%',
    filter: 'blur(120px)',
  },
  orb1: {
    width: '600px',
    height: '600px',
    background: 'radial-gradient(circle, rgba(224, 120, 80, 0.12) 0%, transparent 70%)',
    top: '-15%',
    right: '-10%',
    animation: 'float1 20s ease-in-out infinite',
  },
  grain: {
    position: 'fixed',
    inset: 0,
    background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
    zIndex: 1,
    pointerEvents: 'none',
  },
  layout: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    width: '100%',
    maxWidth: '960px',
    minHeight: '580px',
    margin: '40px 20px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid var(--color-border)',
    borderRadius: '20px',
    overflow: 'hidden',
    backdropFilter: 'blur(8px)',
    transition: 'opacity 0.6s ease, transform 0.6s ease',
  },

  // Info panel (left)
  infoPanel: {
    width: '38.2%',
    minWidth: '240px',
    padding: '36px 28px',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
  },
  logo: {
    fontFamily: 'var(--font-display)',
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--color-text)',
    textDecoration: 'none',
    letterSpacing: '-0.5px',
    marginBottom: '32px',
  },
  logoAccent: { color: 'var(--color-accent)' },
  ownerName: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    marginBottom: '6px',
    letterSpacing: '0.3px',
  },
  meetingTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '22px',
    fontWeight: 600,
    letterSpacing: '-0.3px',
    marginBottom: '14px',
    lineHeight: 1.3,
  },
  durationBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    background: 'var(--color-accent-glow)',
    border: '1px solid rgba(224, 120, 80, 0.2)',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-accent)',
    marginBottom: '16px',
    width: 'fit-content',
  },
  durationIcon: { fontSize: '14px' },
  description: {
    fontSize: '13px',
    lineHeight: 1.7,
    color: 'var(--color-text-muted)',
    marginBottom: '16px',
  },
  divider: {
    height: '1px',
    background: 'var(--color-border)',
    margin: '8px 0 20px',
  },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginTop: 'auto',
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '13px',
    fontWeight: 500,
    transition: 'color 0.2s ease',
  },
  stepNum: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    border: '1px solid currentColor',
    fontSize: '11px',
    fontWeight: 600,
  },

  // Content panel (right)
  contentPanel: {
    flex: 1,
    padding: '32px',
    overflowY: 'auto',
    maxHeight: '80vh',
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    marginBottom: '14px',
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
  errorBanner: {
    padding: '10px 14px',
    background: 'rgba(229,57,53,0.1)',
    border: '1px solid rgba(229,57,53,0.2)',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '13px',
    color: '#ef9a9a',
  },

  // Date cards
  dateCardsWrap: {
    overflowX: 'auto',
    marginBottom: '24px',
    paddingBottom: '4px',
  },
  dateCards: {
    display: 'flex',
    gap: '8px',
  },
  dateCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '12px 16px',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    background: 'var(--color-surface)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    minWidth: '64px',
    fontFamily: 'inherit',
    color: 'inherit',
  },
  dateWeekday: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    fontWeight: 500,
  },
  dateNum: {
    fontSize: '20px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
  },
  dateSlotCount: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
  },

  // Time slots
  slotsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
    gap: '8px',
    marginBottom: '16px',
  },
  slotBtn: {
    padding: '10px 8px',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    fontSize: '14px',
    fontWeight: 500,
    fontFamily: 'var(--font-display)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    letterSpacing: '0.5px',
  },
  slotsLoading: {
    textAlign: 'center',
    padding: '40px',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
  },
  noSlots: {
    textAlign: 'center',
    padding: '40px',
    color: 'var(--color-text-muted)',
    fontSize: '14px',
  },

  // Form
  formWrap: {
    animation: 'scaleIn 0.3s ease',
  },
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
  selectedTime: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '16px',
    background: 'var(--color-accent-glow)',
    border: '1px solid rgba(224, 120, 80, 0.2)',
    borderRadius: '12px',
    marginBottom: '24px',
  },
  selectedTimeLabel: {
    fontSize: '11px',
    color: 'var(--color-accent)',
    fontWeight: 600,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
  selectedTimeValue: {
    fontSize: '16px',
    fontWeight: 500,
    fontFamily: 'var(--font-display)',
  },
  formFields: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '24px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    marginTop: '8px',
  },
  required: { color: 'var(--color-accent)' },
  input: {
    padding: '12px 14px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    color: 'var(--color-text)',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  hint: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    marginTop: '-4px',
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
    letterSpacing: '0.3px',
  },

  // Confirmed
  confirmedWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '40px 20px',
  },
  checkCircle: {
    marginBottom: '20px',
    animation: 'scaleIn 0.4s ease',
  },
  confirmedTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '22px',
    fontWeight: 600,
    marginBottom: '20px',
  },
  confirmedCard: {
    padding: '20px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '320px',
  },
  confirmedItem: {
    fontSize: '14px',
    margin: '6px 0',
    color: 'var(--color-text-muted)',
  },
  confirmedHint: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    marginTop: '16px',
  },

  // Footer
  footer: {
    position: 'relative',
    zIndex: 10,
    padding: '20px',
    textAlign: 'center',
  },
  footerText: {
    fontFamily: 'var(--font-display)',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    opacity: 0.5,
    letterSpacing: '-0.3px',
  },

  // Loading / Error states
  loadingCenter: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '200px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '2px solid var(--color-border)',
    borderTopColor: 'var(--color-accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  errorCenter: {
    position: 'relative',
    zIndex: 10,
    textAlign: 'center',
    padding: '60px 20px',
  },
  errorTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: '8px',
  },
  errorMsg: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
  },
};
