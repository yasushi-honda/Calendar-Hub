'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const SettingsContent = dynamic(() => import('./settings-content').then((m) => m.SettingsContent), {
  ssr: false,
});

export default function SettingsPage() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem' }}>Loading...</main>}>
      <SettingsContent />
    </Suspense>
  );
}
