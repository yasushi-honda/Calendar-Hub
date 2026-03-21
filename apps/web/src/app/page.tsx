'use client';

import { useAuth } from '../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) return <main style={{ padding: '2rem' }}>Loading...</main>;
  if (!user) return null;

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Calendar Hub</h1>
      <p style={{ color: '#666' }}>ようこそ、{user.email} さん</p>
      <nav style={{ marginTop: '2rem' }}>
        <a href="/settings" style={{ color: '#0070f3' }}>
          設定・アカウント連携
        </a>
      </nav>
    </main>
  );
}
