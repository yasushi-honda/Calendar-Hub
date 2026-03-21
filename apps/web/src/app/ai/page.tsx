'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const AiContent = dynamic(() => import('./ai-content').then((m) => m.AiContent), { ssr: false });

export default function AiPage() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem' }}>Loading...</main>}>
      <AiContent />
    </Suspense>
  );
}
