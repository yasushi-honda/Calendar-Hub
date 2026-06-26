'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const NewMirrorLinkContent = dynamic(
  () => import('./new-mirror-link-content').then((m) => m.NewMirrorLinkContent),
  { ssr: false },
);

export default function NewBookingMirrorLinkPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
      <NewMirrorLinkContent />
    </Suspense>
  );
}
