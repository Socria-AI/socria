// app/layout.tsx
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Instrument_Serif, Inter } from 'next/font/google';
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
  openGraph: {
    title: 'Socria — AI that sharpens your thinking',
    description:
      'AI that strengthens human thinking, not replaces it. Think before the machine.',
    type: 'website',
  },
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
          colorPrimary: '#5e7633',
          colorBackground: '#F5F3EB',
          colorText: '#1F1F1F',
          colorInputBackground: '#FFFFFF',
          borderRadius: '0.5rem',
        },
      }}
    >
      <html lang="en" className={`${serif.variable} ${sans.variable}`}>
        <body className="paper-bg antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
