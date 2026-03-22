'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const BookingLinksContent = dynamic(
  () => import('./booking-links-content').then((m) => m.BookingLinksContent),
  { ssr: false },
);

export default function BookingLinksPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
      <BookingLinksContent />
    </Suspense>
  );
}
