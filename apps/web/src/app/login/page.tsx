'use client';

import { signInWithPopup } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth, googleProvider } from '../../lib/firebase';
import { useAuth } from '../../components/AuthProvider';
import { useEffect } from 'react';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

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

  if (loading) return <main style={{ padding: '2rem' }}>Loading...</main>;

  return (
    <main style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto', textAlign: 'center' }}>
      <h1 style={{ marginBottom: '1rem' }}>Calendar Hub</h1>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        複数カレンダーを統合し、AIが最適なスケジュールを提案
      </p>
      <button
        onClick={handleLogin}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          cursor: 'pointer',
          border: '1px solid #ddd',
          borderRadius: '8px',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          margin: '0 auto',
        }}
      >
        Googleでログイン
      </button>
    </main>
  );
}
