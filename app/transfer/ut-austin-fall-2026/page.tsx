// app/transfer/ut-austin-fall-2026/page.tsx — UT Austin's Fall 2026 transfer
// decisions as applicants reported them, to filter, read and compare.
//
// Public, and open whatever the relaunch is doing (lib/takeover.ts OPEN):
// students share this address with each other. The data and every figure on
// the page come from lib/transfer/explore.ts.

import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { ROWS } from '@/lib/transfer/explore';
import { TransferExplorer } from './TransferExplorer';
import '../transfer.css';

export const metadata: Metadata = pageMetadata({
  path: '/transfer/ut-austin-fall-2026',
  title: 'UT Austin Fall 2026 transfer decisions',
  description: `${ROWS.length} UT Austin transfer applicants' self-reported decisions, GPAs, credit hours and extracurriculars for Fall 2026. Plus a Fall 2023 sheet of CAP admits and CAP students' own stories.`,
  og: 'transfer',
});

export default function TransferPage() {
  return <TransferExplorer />;
}
