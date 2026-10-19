// lib/newsletter-issues.ts
//
// Every issue of the Socria newsletter, oldest first.
//
// An issue is written here, reviewed like any other change, and deployed
// before it can be sent: the senders (the daily schedule, app/api/cron/
// newsletter, and the hand-send route, app/api/email/newsletter) send only an
// issue they find in this list, by id. Nothing posted to either can put words
// in front of subscribers that were not committed here first.
//
// THE SCHEDULE. Every issue without `draft` is approved, and approved issues
// go out one every other day (NEWSLETTER_EVERY_DAYS), in the order they are
// listed here. Approving an issue is taking its `draft` off and deploying;
// holding one back is putting `draft: true` back. With no approved issue
// waiting, nothing goes — the schedule never writes one.
//
// Before approving, rehearse: the hand-send route's dry run renders the issue
// and counts who would get it, and sends nothing. The commands are in
// docs/DEPLOYMENT.md under "Newsletter".
//
// Each draft below says what must be true on production before it is
// approved: an issue only ever describes what subscribers can use today.
//
// An id is permanent once an issue has gone out to anyone — it is the key
// that makes the issue once-ever per person, so a changed id is a new issue
// and would go to everyone again. The suite checks every entry here with
// issueProblems (lib/newsletter.ts), so a malformed issue fails the build
// rather than the send.

import type { NewsletterIssue } from './newsletter';

export const NEWSLETTER_ISSUES: readonly NewsletterIssue[] = [
  {
    // LIVE ON PRODUCTION (Logos 3.5 documents).
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
  {
    // LIVE ON PRODUCTION (computed mathematics and pushback, Core 4 and Logos 3.5).
    id: '2026-10-checked-maths',
    draft: true,
    subject: 'Socria now checks its maths, and holds its ground',
    preheader: 'Derivatives, integrals and limits are worked out, not recalled. Push back and it re-derives.',
    paragraphs: [
      'When a reply does calculus, algebra or arithmetic, Socria now works it out rather than recalling it: derivatives, integrals, limits, the solutions of an equation, unit conversions. If a step does not match what was computed, the reply is corrected, and says so.',
      'It also holds its ground. Ask "isn\u2019t that positive?" or "my textbook says otherwise" and it re-derives the step instead of agreeing with whoever spoke last. If you caught a real mistake, it says so plainly. If you did not, it shows you where the step goes.',
      'This works the same in the Core chat and in Logos.',
    ],
    link: { label: 'Try it in Socria', path: '/chat' },
  },
  {
    // LIVE ON PRODUCTION (charts from the person's own words, Logos 3.5).
    id: '2026-10-charts-from-words',
    draft: true,
    subject: 'Type your numbers. Get the chart.',
    preheader: 'Every number exactly as you wrote it. No model retypes them.',
    paragraphs: [
      'In Logos, write your numbers the way you would say them, such as "chart my spending: rent $1,200, food $400, transport $150", and the chart is drawn straight from your words. No model copies the numbers across, so none can be dropped, rounded or relabelled on the way.',
      'Ask for the form you want, such as a pie, bars or a line over time, or switch it afterwards. Every cell can be edited by hand, and the chart says where its numbers came from.',
    ],
    link: { label: 'Open Logos', path: '/chat?model=logos' },
  },
  {
    // APPROVE ONLY ONCE Sharing works on production (supabase/think-together.sql
    // has been run there; docs/SHARING.md).
    id: '2026-11-think-together',
    draft: true,
    subject: 'Think it through together',
    preheader: 'Share a line of thinking. Everyone can write in it, and Socria answers when asked.',
    paragraphs: [
      'You can now share a line of thinking, in Logos or in a Core conversation, with the people you are working it out with. Invite them to read it, comment on it, or think in it with you. Everyone sees the same conversation and the same map.',
      'Socria is in the conversation too, and answers when someone asks it: mention @socria, or reply to one of its messages. The rest of the time it stays out of the way, and nothing anyone writes, Socria included, disappears.',
    ],
    link: { label: 'Open Logos', path: '/chat?model=logos' },
  },
  {
    // APPROVE ONLY ONCE Logos 4 is live on production (it is on dev only).
    id: '2026-11-point-and-ask',
    draft: true,
    subject: 'Point at it, then ask',
    preheader: 'Select a card, a bar, a cell or a passage, and your question is about that.',
    paragraphs: [
      'In Logos you can now select almost anything and ask about it: a card on your map, a bar or a slice of a chart, a cell in a table, a passage in a document, or a formula in one of Socria\u2019s replies.',
      'The message box shows what is selected, so "why is this one so high?" means that bar. The conversation keeps a note of what each question was about, so it still reads correctly when you come back to it.',
    ],
    link: { label: 'Open Logos', path: '/chat?model=logos' },
  },
  {
    // APPROVE ONLY ONCE Logos 4 is live on production (it is on dev only).
    id: '2026-11-pick-up-where-you-left',
    draft: true,
    subject: 'Logos opens where you left it',
    preheader: 'Your place in the conversation, the message you were writing, what you had selected.',
    paragraphs: [
      'Close the tab, reload, or switch to another line of thinking and back, and Logos opens where you were: scrolled to the same place, the message you had half written still in the box, the same thing selected, and a document open at the page you were reading.',
      'This is kept in your browser, on that device, and nowhere else. When you start something new, Logos offers the latest line of thinking that is still waiting on you, with the question it was waiting on.',
    ],
    link: { label: 'Open Logos', path: '/chat?model=logos' },
  },
  {
    // APPROVE ONLY ONCE Logos 4 is live on production, and the `captures`
    // table has been created there (supabase/schema.sql and rls.sql).
    id: '2026-11-quick-capture',
    draft: true,
    subject: 'Keep a thought for later, in two taps',
    preheader: 'A note or a photo of a whiteboard, saved without starting a conversation.',
    paragraphs: [
      'Quick Capture is a private inbox in Logos. Tap Capture beside the message box, write a line or add a photo of a whiteboard or a page of notes, and save it. A photo is read once, so its words come with it.',
      'When you are ready, turn a capture into a new line of thinking, a card on your map, or part of the message you are writing. Nothing is sent or filed by itself, and any capture can be edited or deleted. Signed in, your captures are kept in your account.',
    ],
    link: { label: 'Open Logos', path: '/chat?model=logos' },
  },
  {
    // APPROVE ONLY ONCE Logos 4 is live on production and the mic has been
    // tried there (it transcribes with the production OpenAI key).
    id: '2026-11-voice',
    draft: true,
    subject: 'Talk instead of type',
    preheader: 'Speak into Logos. The words land in the box for you to edit before anything is sent.',
    paragraphs: [
      'The message box in Logos has a microphone now. Tap it, say what you are working through, tap Done, and your words appear where your cursor was, ready to read, fix and send when you choose. Nothing is sent by itself.',
      'The recording is turned into text and then discarded: the audio is not stored. A recording can be up to two minutes long.',
    ],
    link: { label: 'Open Logos', path: '/chat?model=logos' },
  },
  {
    // APPROVE ONLY ONCE the events pages are live on production (they are on
    // dev only). Says no date on purpose: the date is not confirmed. Do not add
    // food, prizes or anything else until it is confirmed.
    id: '2026-11-in-public-002',
    draft: true,
    subject: 'Socria: In Public 002, at UT Arlington',
    preheader: 'An open conversation about building Socria in public. Free to attend.',
    paragraphs: [
      'We are holding the second In Public: an open conversation about how Socria is being built, what is working, what is not and the decisions behind it, and about starting something, building a product people use, and working with AI without handing it your thinking.',
      'It is in Maverick Hall, Room 1309, at the University of Texas at Arlington, and admission is free. The date and time will be on the event page as soon as they are set.',
      'If you are nearby, RSVP so we know you are coming.',
    ],
    link: { label: 'See the event and RSVP', path: '/events/in-public-002' },
  },
];
