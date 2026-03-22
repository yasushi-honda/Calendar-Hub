'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const BookContent = dynamic(() => import('./book-content').then((m) => m.BookContent), {
  ssr: false,
});

export default function BookPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
      <BookContent />
    </Suspense>
  );
}
