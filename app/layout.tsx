import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Filio — Video review',
  description: 'Self-hosted video review voor editor en klanten',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
