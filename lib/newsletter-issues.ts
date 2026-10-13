// lib/newsletter-issues.ts
//
// Every issue of the Socria newsletter, oldest first.
//
// An issue is written here, reviewed like any other change, and deployed
// before it can be sent: the send route (app/api/email/newsletter) sends only
// an issue it finds in this list, by id. Nothing posted to that route can put
// words in front of subscribers that were not committed here first.
//
// To send one:
//   1. add it with `draft: true` and deploy;
//   2. rehearse — the route's dry run renders it and counts who would get it,
//      and sends nothing;
//   3. take `draft` off, deploy, and send it to yourself with `only`;
//   4. send it.
// The steps, with the commands, are in docs/DEPLOYMENT.md under "Newsletter".
//
// An id is permanent once an issue has gone out to anyone — it is the key
// that makes the issue once-ever per person, so a changed id is a new issue
// and would go to everyone again. The suite checks every entry here with
// issueProblems (lib/newsletter.ts), so a malformed issue fails the build
// rather than the send.

import type { NewsletterIssue } from './newsletter';

export const NEWSLETTER_ISSUES: readonly NewsletterIssue[] = [
  {
    // A first issue, drafted from what has shipped. Read it, change what you
    // like, and take `draft` off when it should go.
    id: '2026-10-documents',
    draft: true,
    subject: 'Logos now reads what you attach',
    preheader: 'A PDF, a Word file, slides or a spreadsheet — and every reply shows where it came from.',
    paragraphs: [
      'Logos 3.5 now reads the documents you give it: a PDF, a Word file, slides or a spreadsheet, scanned pages included.',
      'Ask about one and the reply cites the passage it rests on. Each citation is checked against the document itself and marked when it is a reading of the passage rather than its words — so you can see what is quoted, what is inferred, and what the document does not say.',
      'Open the document beside your map to read it page by page, correct a passage that was read wrongly, or turn one of its tables into a chart.',
    ],
    link: { label: 'Open Logos', path: '/chat?model=logos' },
  },
];
