'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

const NAV_ITEMS = [
  { href: '/calendar', label: 'カレンダー', icon: '◎' },
  { href: '/ai', label: 'AI提案', icon: '◇' },
  { href: '/settings', label: '設定', icon: '⚙' },
];

export function AppNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <nav style={styles.nav}>
      <a href="/calendar" style={styles.logo}>
        Calendar<span style={styles.logoAccent}>Hub</span>
      </a>

      <div style={styles.links}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <a
              key={item.href}
              href={item.href}
              style={{
                ...styles.link,
                color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
                background: active ? 'var(--color-accent-glow)' : 'transparent',
              }}
            >
              <span style={{ fontSize: '12px' }}>{item.icon}</span>
              {item.label}
            </a>
          );
        })}
      </div>

      {user && <span style={styles.email}>{user.email}</span>}
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    borderBottom: '1px solid var(--color-border)',
    background: 'rgba(10, 10, 15, 0.8)',
    backdropFilter: 'blur(12px)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  logo: {
    fontFamily: 'var(--font-display)',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--color-text)',
    textDecoration: 'none',
    letterSpacing: '-0.5px',
  },
  logoAccent: {
    color: 'var(--color-accent)',
  },
  links: {
    display: 'flex',
    gap: '4px',
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    textDecoration: 'none',
    transition: 'all 0.2s ease',
    letterSpacing: '0.3px',
  },
  email: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    maxWidth: '180px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};
