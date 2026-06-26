'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const BookingMirrorLinksContent = dynamic(
  () => import('./booking-mirror-links-content').then((m) => m.BookingMirrorLinksContent),
  { ssr: false },
);

export default function BookingMirrorLinksPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
      <BookingMirrorLinksContent />
    </Suspense>
  );
}
