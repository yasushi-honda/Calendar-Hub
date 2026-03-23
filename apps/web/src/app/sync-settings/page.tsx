'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const SyncSettingsContent = dynamic(
  () => import('./sync-settings-content').then((m) => m.SyncSettingsContent),
  { ssr: false },
);

export default function SyncSettingsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
      <SyncSettingsContent />
    </Suspense>
  );
}
