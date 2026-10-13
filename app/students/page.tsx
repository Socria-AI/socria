// app/students/page.tsx — UTA students: the first month of Socria One, free.
//
// The offer has existed since EDU-MONTH, but only inside account settings —
// somebody had to make an account to find out it was there. This is the page
// a link, a flyer or a search can point at.
//
// Every line is the programme's own rule (lib/socria-edu.ts STUDENT_OFFER):
// the domain, the thirty days, the close, no card and nothing renewing. After
// the close the page says so plainly and leaves search results; it does not
// keep promising a month nobody can start.

import type { Metadata } from 'next';
import { STUDENT_OFFER } from '@/lib/socria-edu';
import { pageMetadata, studentPageOpen } from '@/lib/seo';
import { CLOSES, StudentsBody } from './StudentsBody';
import '../app-shell.css';

// The close is a date; the page is re-rendered within the hour of it.
export const revalidate = 3600;

export function generateMetadata(): Metadata {
  const open = studentPageOpen(Date.now());
  return pageMetadata({
    path: '/students',
    title: 'UTA students: your first month of Socria One, free',
    description: open
      ? `Verify your UTA email by ${CLOSES} and get ${STUDENT_OFFER.days} days of Socria One — no card, nothing renews. Think for yourself.`
      : 'The UTA free month has closed. Socria is still free to start — no account needed.',
    og: 'students',
    noindex: !open,
  });
}

export default function StudentsPage() {
  const open = studentPageOpen(Date.now());
  return <StudentsBody open={open} />;
}
