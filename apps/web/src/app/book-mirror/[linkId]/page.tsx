'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const BookMirrorContent = dynamic(
  () => import('./book-mirror-content').then((m) => m.BookMirrorContent),
  { ssr: false },
);

export default function BookMirrorPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
      <BookMirrorContent />
    </Suspense>
  );
}
