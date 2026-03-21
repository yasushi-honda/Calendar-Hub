'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const CalendarContent = dynamic(() => import('./calendar-content').then((m) => m.CalendarContent), {
  ssr: false,
});

export default function CalendarPage() {
  return (
    <Suspense fallback={<main style={{ padding: '2rem' }}>Loading...</main>}>
      <CalendarContent />
    </Suspense>
  );
}
