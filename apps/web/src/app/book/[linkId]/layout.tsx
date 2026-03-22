import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Schedule a Meeting - Calendar Hub',
  description: 'Pick a time that works for you',
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
