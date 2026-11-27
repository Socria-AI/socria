// app/new-logos/layout.tsx — New Logos' frame (docs/NEW-LOGOS.md). `/new-logos` is an internal development address,
// not a product name: nothing under it carries the site's name, marks, colours or typefaces. The metadata below
// replaces every branded field the site-wide layout sets (title, application name, preview cards, icons; the root
// favicon.ico, which a route cannot drop, is repointed by NeutralIcon), and the stylesheet covers its background and
// hides its badges. Never indexed.

import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import './nl.css';
import { NEUTRAL_ICON as ICON } from '@/components/new-logos/icon';
import { NeutralIcon } from '@/components/new-logos/NeutralIcon';

export const metadata: Metadata = {
  title: { absolute: 'Workspace', template: '%s · Workspace' },
  description: 'Workspace',
  applicationName: 'Workspace',
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: [{ url: ICON, type: 'image/svg+xml' }], shortcut: [{ url: ICON }], apple: [{ url: ICON }] },
  openGraph: { title: 'Workspace', description: 'Workspace', siteName: 'Workspace', images: [] },
  twitter: { card: 'summary', title: 'Workspace', description: 'Workspace', images: [] },
};

export default function NewLogosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="nl-root">
      <NeutralIcon />
      {children}
    </div>
  );
}
