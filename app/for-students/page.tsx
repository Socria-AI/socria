// app/for-students/page.tsx — Socria for students: studying with an AI that makes you do the thinking.
//
// For somebody searching "AI for students", "an AI study tool" or "an AI learning assistant": what Socria does with a
// problem set, an essay, a reading and an exam, each claim one the docs make (Logos 5: Which part of the work is yours,
// What is checked, Studying from your files, Write; Mathematics: the Answer Guard), none a promise about grades. Not to
// be confused with /students, the retired UTA offer, which stays out of search.

import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/JsonLd';
import { Guide, faqOf, type GuideQuestion, type GuideSection } from '@/components/site/Guide';
import { freePlanSentence } from '@/lib/entitlements';
import { GUEST_TURNS } from '@/lib/guest-limits';
import { pageMetadata } from '@/lib/seo';
import { priceWithPeriod } from '@/lib/socria-one';
import { breadcrumbLd, faqPageLd } from '@/lib/structured-data';

export const metadata: Metadata = pageMetadata({
  path: '/for-students',
  title: 'Socria for Students: AI That Helps You Learn',
  absolute: true,
  description:
    'Study with an AI that makes you do the thinking: problem sets checked by method, essays mapped, readings cited honestly and practice made from your notes.',
});

const SECTIONS: GuideSection[] = [
  {
    id: 'problems',
    heading: 'Problem sets: your method before your number',
    body: (
      <>
        <p>
          Ask whether $4,200 is the right figure for accrued expenses and Socria asks first which entry you adjusted,
          and why. Once the rule is clear, it has you put the number through the same test. The second time you meet
          an accrual, you will not need to ask.
        </p>
        <p>
          In maths you are working to learn, the Answer Guard gives a nudge, then a hint, then one small step, and
          shows the full solution only when you press for it. Calculations are computed, never recalled, and your own
          steps are checked against them. Graphs are ones you can drive.{' '}
          <Link href="/docs/mathematics">Mathematics in Socria</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'essays',
    heading: 'Essays: your argument, on a map',
    body: (
      <>
        <p>
          Say your thesis and Socria asks what it rests on, and what pushes against it. The Logic Map fills in as you
          talk: your claim, its assumptions, the counterpoints and the sources for each, so the shape of the argument
          is in front of you before a paragraph is written. <Link href="/docs/thinking-map">The Logic Map</Link>.
        </p>
        <p>
          The writing stays yours. Your draft is a document Socria never writes into: ask, and it checks spelling,
          clarity and whether research is cited, suggests clearer wordings you can accept or not, and asks questions
          that develop the argument. <Link href="/docs/drafts-grounding">Write, notes and grounding</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'readings',
    heading: 'Readings: citations that point at something real',
    body: (
      <p>
        Attach a chapter, a paper or slides and ask about them. A reply may cite only the passages of your documents
        and the sources it actually read; a citation to anything else is taken out before you see it. When sources
        disagree, it says so, and when nothing settles a claim, it says that instead.
      </p>
    ),
  },
  {
    id: 'exams',
    heading: 'Exams: practice from your own material',
    body: (
      <p>
        Drop in your notes or an exam review and say what it is for. Socria sorts it into topics, foundations first,
        every quote the file’s own with its page. Practice is made only when you ask for it, from your own material,
        and checked when you submit: each answer right or wrong, with why and where in your notes. Ask for a quiz on a
        topic and it is made the same way.
      </p>
    ),
  },
  {
    id: 'yours',
    heading: 'Learning, not shortcuts',
    body: (
      <>
        <p>
          Socria is a Human-First AI: it is built to leave you more capable, not more dependent. It asks before it
          answers when the thinking is the point, keeps your decisions and your writing yours, and holds back an answer
          whenever you tell it the work is yours to do.
        </p>
        <p>
          Your course’s rules on using AI still apply, and only you know them. Socria will not pretend otherwise.{' '}
          <Link href="/socratic-ai">How Socria’s Socratic approach works</Link>.
        </p>
      </>
    ),
  },
];

const QUESTIONS: GuideQuestion[] = [
  {
    q: 'Will Socria do my homework for me?',
    a: [
      'It is built not to. It does calculations, formatting and explanations of what is established directly, but it keeps the substance of your work yours: asked for a whole essay, it gives everything but the premise and the ideas. Tell it the work is graded, or that you want to work it out yourself, and it holds the answer back.',
    ],
  },
  {
    q: 'Can it help with maths?',
    a: [
      'Yes. Mathematics is computed rather than recalled, your steps are checked against it, and graphs are interactive. When you are working a problem to learn it, the Answer Guard guides you a step at a time and shows the full solution when you choose to see it.',
    ],
  },
  {
    q: 'Does it work with my own notes and readings?',
    a: [
      'Yes. Attach documents such as PDFs, Word files, slides or spreadsheets. Socria reads them, cites only what is in them, and can make practice from them when you ask.',
    ],
  },
  {
    q: 'What does it cost?',
    a: [
      `You can start without an account and send up to ${GUEST_TURNS} messages. Every account starts with ${freePlanSentence()}. Socria One, without a daily limit, is ${priceWithPeriod()}.`,
    ],
  },
];

export default function ForStudentsPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: 'Socria', path: '/' },
            { name: 'For students', path: '/for-students' },
          ]),
          faqPageLd(faqOf(QUESTIONS)),
        ]}
      />
      <Guide
        eyebrow="Socria for students"
        title="Study with an AI that makes you think"
        deck="Problem sets, essays, readings and exams, with an AI that asks before it answers and leaves the work yours."
        intro={
          <p>
            Most AI will finish your assignment if you ask. Socria is built to help you understand it instead: it asks
            the question you skipped, maps your argument, reads your sources honestly and makes practice from your own
            notes. Here is what it does with each part of studying.
          </p>
        }
        sections={SECTIONS}
        questions={QUESTIONS}
        cta="Start studying"
        note="No account needed to start."
        related={[
          { href: '/socratic-ai', label: 'Socratic AI, explained' },
          { href: '/docs/use-cases', label: 'What to use it for' },
          { href: '/docs/mathematics', label: 'Mathematics and the Answer Guard' },
          { href: '/one', label: 'Socria One' },
        ]}
      />
    </>
  );
}
