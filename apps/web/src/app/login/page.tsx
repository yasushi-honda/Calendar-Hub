'use client';

import { signInWithPopup } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth, googleProvider } from '../../lib/firebase';
import { useAuth } from '../../components/AuthProvider';
import { useEffect, useState } from 'react';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (user && !loading) {
      router.push('/');
    }
  }, [user, loading, router]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      router.push('/');
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  return (
    <div style={styles.container}>
      {/* Animated gradient mesh background */}
      <div style={styles.meshBg}>
        <div style={{ ...styles.meshOrb, ...styles.orb1 }} />
        <div style={{ ...styles.meshOrb, ...styles.orb2 }} />
        <div style={{ ...styles.meshOrb, ...styles.orb3 }} />
      </div>

      {/* Grain overlay */}
      <div style={styles.grain} />

      {/* Grid lines decoration */}
      <div style={styles.gridLines}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ ...styles.gridLine, left: `${(i + 1) * 14.28}%` }} />
        ))}
      </div>

      {mounted && (
        <div style={styles.timeIndicator}>
          <TimeDisplay />
        </div>
      )}

      {/* Main content */}
      <main
        style={{
          ...styles.main,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(20px)',
        }}
      >
        {/* Logo mark */}
        <div style={styles.logoMark}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect
              x="4"
              y="4"
              width="40"
              height="40"
              rx="12"
              stroke="var(--color-accent)"
              strokeWidth="1.5"
              opacity="0.6"
            />
            <rect
              x="10"
              y="10"
              width="28"
              height="28"
              rx="8"
              stroke="var(--color-accent)"
              strokeWidth="1.5"
            />
            <line
              x1="24"
              y1="16"
              x2="24"
              y2="24"
              stroke="var(--color-accent)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="24"
              y1="24"
              x2="30"
              y2="28"
              stroke="var(--color-accent)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="24" cy="24" r="2" fill="var(--color-accent)" />
          </svg>
        </div>

        <h1 style={styles.title}>
          Calendar<span style={styles.titleAccent}>Hub</span>
        </h1>

        <p style={styles.subtitle}>
          複数カレンダーを統合し
          <br />
          <span style={styles.subtitleHighlight}>AIが最適なスケジュールを提案</span>
        </p>

        <div style={styles.features}>
          {[
            { icon: '◉', label: 'Google Calendar 統合' },
            { icon: '◈', label: 'TimeTree 連携' },
            { icon: '◇', label: 'AI スケジュール提案' },
          ].map((f, i) => (
            <div
              key={i}
              style={{
                ...styles.featureItem,
                transitionDelay: `${0.3 + i * 0.1}s`,
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateX(0)' : 'translateX(-10px)',
              }}
            >
              <span style={styles.featureIcon}>{f.icon}</span>
              <span style={styles.featureLabel}>{f.label}</span>
            </div>
          ))}
        </div>

        <button onClick={handleLogin} className="login-btn" style={styles.loginButton}>
          <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span>Googleでログイン</span>
        </button>

        <p style={styles.footer}>あなた専用のスケジュール管理を始めましょう</p>
      </main>

      <style>{`
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-40px, 30px) scale(1.15); }
          66% { transform: translate(25px, -35px) scale(0.85); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(20px, 40px) scale(0.95); }
          66% { transform: translate(-35px, -25px) scale(1.05); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .login-btn:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-accent);
          box-shadow: 0 0 30px var(--color-accent-glow), inset 0 0 30px var(--color-accent-glow);
        }
        .login-btn:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
}

function TimeDisplay() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Asia/Tokyo',
        }),
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return <>{time}</>;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  meshBg: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    zIndex: 0,
  },
  meshOrb: {
    position: 'absolute',
    borderRadius: '50%',
    filter: 'blur(100px)',
  },
  orb1: {
    width: '500px',
    height: '500px',
    background: 'radial-gradient(circle, rgba(224, 120, 80, 0.15) 0%, transparent 70%)',
    top: '-10%',
    right: '-5%',
    animation: 'float1 20s ease-in-out infinite',
  },
  orb2: {
    width: '400px',
    height: '400px',
    background: 'radial-gradient(circle, rgba(100, 140, 200, 0.1) 0%, transparent 70%)',
    bottom: '-5%',
    left: '-5%',
    animation: 'float2 25s ease-in-out infinite',
  },
  orb3: {
    width: '300px',
    height: '300px',
    background: 'radial-gradient(circle, rgba(180, 100, 160, 0.08) 0%, transparent 70%)',
    top: '40%',
    left: '30%',
    animation: 'float3 18s ease-in-out infinite',
  },
  grain: {
    position: 'absolute',
    inset: 0,
    background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
    zIndex: 1,
    pointerEvents: 'none',
  },
  gridLines: {
    position: 'absolute',
    inset: 0,
    zIndex: 1,
    pointerEvents: 'none',
  },
  gridLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '1px',
    background:
      'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.03) 30%, rgba(255,255,255,0.03) 70%, transparent 100%)',
  },
  timeIndicator: {
    position: 'absolute',
    top: '32px',
    right: '40px',
    fontFamily: 'var(--font-display)',
    fontSize: '13px',
    fontWeight: 300,
    letterSpacing: '3px',
    color: 'var(--color-text-muted)',
    zIndex: 10,
    transition: 'opacity 0.8s ease',
    animation: 'pulse 4s ease-in-out infinite',
  },
  main: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '48px',
    maxWidth: '440px',
    width: '100%',
    transition: 'opacity 0.8s ease, transform 0.8s ease',
  },
  logoMark: {
    marginBottom: '32px',
    opacity: 0.9,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '42px',
    fontWeight: 700,
    letterSpacing: '-1px',
    marginBottom: '16px',
    lineHeight: 1,
  },
  titleAccent: {
    color: 'var(--color-accent)',
    marginLeft: '2px',
  },
  subtitle: {
    fontSize: '15px',
    lineHeight: 1.8,
    color: 'var(--color-text-muted)',
    textAlign: 'center',
    marginBottom: '40px',
    letterSpacing: '0.5px',
  },
  subtitleHighlight: {
    color: 'var(--color-text)',
    fontWeight: 500,
  },
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '40px',
    width: '100%',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    transition: 'opacity 0.6s ease, transform 0.6s ease',
  },
  featureIcon: {
    fontSize: '14px',
    color: 'var(--color-accent)',
    width: '24px',
    textAlign: 'center',
  },
  featureLabel: {
    fontSize: '13px',
    fontWeight: 500,
    letterSpacing: '0.3px',
  },
  loginButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    padding: '14px 24px',
    fontSize: '14px',
    fontWeight: 500,
    fontFamily: 'var(--font-body)',
    letterSpacing: '0.5px',
    color: 'var(--color-text)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    marginBottom: '24px',
  },
  footer: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    letterSpacing: '0.5px',
    opacity: 0.6,
  },
};
