import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Your Companion',
  description: 'A warm voice and text companion for older adults.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#fdf6e3] text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
