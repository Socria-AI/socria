// app/layout.tsx
import type { Metadata } from 'next';
import { Instrument_Serif, Inter, Kalam, STIX_Two_Text } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';
import {
  clerkConfigured,
  clerkKeyMismatch,
  currentEnv,
  isProduction,
} from '@/lib/environment';
import { EnvBadge } from '@/components/EnvBadge';
import { SetupNotice } from '@/components/SetupNotice';

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

// The Board's two voices: Kalam for handwritten notes/annotations, STIX Two
// Math for equations. Loaded here so the whole app can reach them via CSS vars.
const hand = Kalam({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
  variable: '--font-hand',
  display: 'swap',
});

const stix = STIX_Two_Text({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-stix',
  display: 'swap',
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://socria.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  // A preview build carries its own noindex, so it stays out of search even
  // if something links to it. robots.txt asks; this tells.
  ...(isProduction()
    ? {}
    : { robots: { index: false, follow: false, nocache: true } }),
  title: {
    default: 'Socria — AI that sharpens your thinking',
    template: '%s — Socria',
  },
  description:
    'Socria helps you reason through ideas, decisions, and uncertainty without outsourcing your thinking. Human-first AI.',
  applicationName: 'Socria',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: 'Socria',
    title: 'Socria — AI that sharpens your thinking',
    description:
      'Human-first AI that strengthens how you think instead of thinking for you. Think for yourself.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Socria — AI that sharpens your thinking',
    description:
      'Human-first AI that strengthens how you think instead of thinking for you.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A build with no Clerk credentials cannot mount ClerkProvider, and until
  // now that was a 500 with nothing to read. On a preview or a local build it
  // is nearly always one missing pair of environment variables, so say which
  // ones. Production keeps failing loudly: there, missing auth is not a
  // configuration note, it is an outage.
  if (!clerkConfigured() && !isProduction()) {
    return (
      <html lang="en" className={`${serif.variable} ${sans.variable} ${hand.variable} ${stix.variable}`}>
        <body className="paper-bg antialiased">
          <SetupNotice env={currentEnv()} />
        </body>
      </html>
    );
  }

  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/chat"
      signUpFallbackRedirectUrl="/chat"
      appearance={{
        variables: {
          colorPrimary: '#5e7633',
          colorText: '#1F1F1F',
          colorTextSecondary: 'rgba(31,31,31,0.62)',
          colorBackground: '#ffffff',
          colorInputBackground: '#ffffff',
          colorInputText: '#1F1F1F',
          fontFamily: 'var(--font-sans), Inter, system-ui, sans-serif',
          fontFamilyButtons: 'var(--font-sans), Inter, system-ui, sans-serif',
          fontSize: '15px',
          borderRadius: '12px',
        },
        elements: {
          rootBox: 'w-full',
          card: 'shadow-none border border-ink/10 bg-white rounded-2xl',
          headerTitle: 'font-serif text-2xl md:text-3xl text-ink tracking-tight',
          headerSubtitle: 'text-ink/60 text-[14px]',
          socialButtonsBlockButton:
            'border border-ink/12 hover:bg-ink/[0.03] rounded-lg text-[14px]',
          socialButtonsBlockButtonText: 'font-medium text-ink',
          dividerLine: 'bg-ink/10',
          dividerText: 'text-ink/40 text-[11px] uppercase tracking-widest',
          formFieldLabel: 'text-ink/70 text-[13px] font-medium',
          formFieldInput:
            'border border-ink/15 focus:border-moss-600 rounded-lg bg-white',
          formButtonPrimary:
            'bg-moss-600 hover:bg-moss-700 text-paper rounded-full h-11 text-[14px] font-medium tracking-tight transition-colors normal-case shadow-none',
          formButtonReset: 'text-ink/60 hover:text-ink',
          footerActionText: 'text-ink/60',
          footerActionLink:
            'text-moss-700 hover:text-moss-800 font-medium underline underline-offset-4 decoration-1',
          identityPreviewText: 'text-ink',
          identityPreviewEditButton: 'text-moss-700 hover:text-moss-800',
          otpCodeFieldInput: 'border-ink/15 focus:border-moss-600',
          formResendCodeLink: 'text-moss-700 hover:text-moss-800',
          alert: 'rounded-lg',
          badge: 'bg-moss-50 text-moss-700 border-moss-200',
          navbar: 'bg-paper/60 backdrop-blur border-r border-ink/10',
          navbarButton:
            'text-ink/70 hover:text-ink data-[active=true]:text-moss-700 data-[active=true]:bg-moss-50/60',
          profileSectionTitle:
            'font-serif text-[18px] text-ink border-b border-ink/8',
          profileSectionPrimaryButton:
            'text-moss-700 hover:text-moss-800 font-medium',
          userButtonAvatarBox: 'ring-1 ring-ink/10',
          userButtonPopoverCard: 'shadow-lg border border-ink/10 rounded-2xl',
          userButtonPopoverActionButton: 'hover:bg-ink/[0.03]',
          userButtonPopoverActionButtonText: 'text-ink text-[14px]',
        },
        layout: {
          socialButtonsPlacement: 'top',
          socialButtonsVariant: 'blockButton',
          logoPlacement: 'none',
          shimmer: true,
        },
      }}
    >
      <html lang="en" className={`${serif.variable} ${sans.variable} ${hand.variable} ${stix.variable}`}>
        <body className="paper-bg antialiased">
          {children}
          {/* Non-production only, so the real site never carries it. */}
          {!isProduction() && (
            <EnvBadge
              env={currentEnv() === 'preview' ? 'preview' : 'development'}
              clerk={
                clerkKeyMismatch() ? 'mismatch' : clerkConfigured() ? 'ok' : 'missing'
              }
            />
          )}
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
