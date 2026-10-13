// Issues for the newsletter suite, in place of lib/newsletter-issues.ts — so
// the send route can be driven through a ready issue, a draft and a broken
// one without the real list having to carry any of them.
export const NEWSLETTER_ISSUES = [
  {
    id: 'ready-issue',
    subject: 'What is new',
    preheader: 'A short line beside the subject.',
    paragraphs: ['First paragraph — Tom & Jerry’s "quotes".', 'Second paragraph.'],
    link: { label: 'Open Logos', path: '/chat?model=logos' },
  },
  { id: 'second-issue', subject: 'Again', paragraphs: ['Another issue.'] },
  { id: 'draft-issue', draft: true, subject: 'Not yet', paragraphs: ['A draft.'] },
  { id: 'bad-issue', subject: 'Bad link', paragraphs: ['Body.'], link: { label: 'Elsewhere', path: '//evil.example' } },
];
