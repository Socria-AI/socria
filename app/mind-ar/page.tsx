// app/mind-ar/page.tsx — the Mind Graph in AR. A secret bench, dev only.
//
// Not linked from anywhere, never indexed, and a 404 on production: it is
// reachable on the dev and preview deployments (and locally) by typing the
// address. The gate is on the server, so production never even ships the
// page's markup.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isProduction } from '@/lib/environment';
import { MindAR } from './MindAR';
import './mind-ar.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mind Graph · AR — Socria',
  robots: { index: false, follow: false },
};

export default function MindArPage() {
  if (isProduction()) notFound();
  return <MindAR />;
}
