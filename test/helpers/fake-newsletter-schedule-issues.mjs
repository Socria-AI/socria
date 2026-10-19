// Issues for the schedule suite, in place of lib/newsletter-issues.ts. The
// array is the module's own, so the suite edits it in place — approving a
// draft, adding an issue — the way a deploy would change the real list.
export const NEWSLETTER_ISSUES = [
  { id: 'issue-a', subject: 'First', paragraphs: ['Issue A.'] },
  { id: 'issue-b', subject: 'Second', paragraphs: ['Issue B.'] },
  { id: 'issue-c', draft: true, subject: 'Third, not approved', paragraphs: ['Issue C.'] },
];
