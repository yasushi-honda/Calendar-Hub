import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Calendar Hub',
  description: 'AI-powered unified calendar management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
