// app/support/page.tsx — Support.
//
// A server component that does almost nothing, because the page itself has to
// be a client one: it searches, filters and opens answers. Keeping the
// metadata out here means the page is still described for crawlers even though
// its body only exists once React has mounted.
//
// IT EXISTS AT ALL BECAUSE THE COLOPHON PROMISED IT. The design project's
// footer has linked "Support" for three syncs; this branch had no such route,
// so the one page a stuck person looks for was the one page that was not there.

import type { Metadata } from 'next';
import { SupportPage } from './SupportPage';

export const metadata: Metadata = {
  title: 'Support — Socria',
  description:
    'Answers to what people actually ask about Socria, and a way to reach a person.',
};

export default function Page() {
  return <SupportPage />;
}
