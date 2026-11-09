// app/students/page.tsx — where the UTA student month used to be offered.
//
// The month (lib/socria-edu.ts STUDENT_OFFER) was retired on 31 October 2026
// with the other free grants of Socria One. The address stays, because flyers
// and links still point at it: it says plainly that the month has ended, what
// the free plan holds and what Socria One costs, and it stays out of search
// results. It does not keep promising a month nobody can start.

import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { priceWithPeriod } from '@/lib/socria-one';
import { StudentsBody } from './StudentsBody';
import '../app-shell.css';

export const metadata: Metadata = pageMetadata({
  path: '/students',
  title: 'The UTA student month has ended',
  description: `The UTA student month has ended. Every account starts with a seven-day trial, then Socria One is ${priceWithPeriod()}.`,
  og: 'students',
  noindex: true,
});

export default function StudentsPage() {
  return <StudentsBody />;
}
