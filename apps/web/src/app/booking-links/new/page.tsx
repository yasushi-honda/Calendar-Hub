'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const NewLinkContent = dynamic(() => import('./new-link-content').then((m) => m.NewLinkContent), {
  ssr: false,
});

export default function NewBookingLinkPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
      <NewLinkContent />
    </Suspense>
  );
}
