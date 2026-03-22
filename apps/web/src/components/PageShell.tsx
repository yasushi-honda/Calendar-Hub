'use client';

import type { ReactNode } from 'react';
import { AppNav } from './AppNav';

const MAX_WIDTH = {
  compact: '640px',
  medium: '800px',
  wide: '1400px',
} as const;

interface PageShellProps {
  children: ReactNode;
  maxWidth?: keyof typeof MAX_WIDTH;
}

export function PageShell({ children, maxWidth = 'medium' }: PageShellProps) {
  return (
    <div style={s.page}>
      <AppNav />
      <main style={{ ...s.main, maxWidth: MAX_WIDTH[maxWidth] }}>{children}</main>
    </div>
  );
}

export function PageLoading() {
  return <div style={s.loading}>Loading...</div>;
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'var(--color-bg)' },
  main: { padding: '24px', margin: '0 auto' },
  loading: { padding: '2rem', color: 'var(--color-text-muted)' },
};
