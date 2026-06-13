// app/layout.tsx
import type { Metadata } from 'next';
import { Instrument_Serif, Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Socria — AI that sharpens your thinking',
  description:
    'Socria helps you reason through ideas, decisions, and uncertainty without outsourcing your thinking. Human-first AI.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#3d6b3a',
          fontFamily: 'var(--font-sans)',
        },
      }}
    >
      <html lang="en" className={`${serif.variable} ${sans.variable}`}>
        <body className="paper-bg antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
