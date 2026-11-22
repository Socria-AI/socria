// app/socratic-ai/page.tsx — Socratic AI: what it is, and how Socria uses it.
//
// The page for somebody searching "Socratic AI", "an AI that asks questions" or "AI for critical thinking": what
// Socratic questioning is, why an answer-first chatbot does not do it, and exactly what Socria does instead — each
// claim one the docs make (Logos 5: Which part of the work is yours, What is checked; Mathematics: the Answer Guard),
// none an outcome. The examples are the homepage's own.

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
  path: '/socratic-ai',
  title: 'Socratic AI: an AI that helps you think',
  description:
    'Socratic AI asks the questions that make you think instead of handing you the answer. How Socria uses it for critical thinking, and when it simply answers.',
});

const SECTIONS: GuideSection[] = [
  {
    id: 'what',
    heading: 'What Socratic questioning is',
    body: (
      <>
        <p>
          Socrates taught by asking. What do you mean by that word? What are you assuming? If that is true, what
          follows? What would change your mind? None of those questions hands over an answer. Each one makes the
          person asked do a piece of thinking they had skipped.
        </p>
        <p>
          A good tutor works the same way. The question comes before the explanation because the thinking it sets
          off is the part that stays with you. Socratic AI is that habit built into an AI: it asks the question that
          matters, at the step that matters, and then helps.
        </p>
      </>
    ),
  },
  {
    id: 'answer-first',
    heading: 'Why an answer-first chatbot is not the same',
    body: (
      <>
        <p>
          Most AI chat is built to answer as quickly and completely as it can. For a fact, a format or a quick
          rewrite, that is exactly right. For anything you need to understand, decide or defend, an answer that
          arrives before your own thinking can replace it: you get the result without the reasoning, and the next
          problem needs the same help again.
        </p>
        <p>
          Socria is built the other way round. It is a Human-First AI, made to leave the person using it more
          capable rather than more dependent. <Link href="/charter">The Socria Charter</Link> says why.
        </p>
      </>
    ),
  },
  {
    id: 'how',
    heading: 'How Socria uses it',
    body: (
      <>
        <p>
          <strong>It asks first when the thinking is the point.</strong> Bring a problem set and it checks the rule
          you used before it checks your number. Bring a plan and it asks what the plan assumes. Bring a letter you
          keep not writing and it asks what you want to have happened by Friday. One question, about the step that
          matters, then help.
        </p>
        <p>
          <strong>It does the mechanical work directly.</strong> Calculations (computed, never recalled),
          formatting, looking things up and explaining what is established are simply done. Socria is not a riddle.
        </p>
        <p>
          <strong>It leaves the substance to you.</strong> Your decisions stay yours: it lays out what a decision
          rests on and, asked, gives its view, marked as a view. Your writing stays yours: structure, critique and
          sharper sentences, but not a finished essay from nothing.
        </p>
        <p>
          <strong>In maths you are learning, it guides rather than solves.</strong> The Answer Guard climbs from a
          nudge to a hint to one small step, and shows the full solution when you choose to see it.{' '}
          <Link href="/docs/mathematics">How the Answer Guard works</Link>.
        </p>
        <p>
          <strong>It shows the reasoning.</strong> As you talk, the Logic Map fills in with your claims, what they
          assume, the open questions and the evidence for each, so what you are taking for granted is something you
          can see and check. <Link href="/docs/thinking-map">The Logic Map</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'example',
    heading: 'What it looks like',
    body: (
      <>
        <p>
          You write: <em>My thesis: the printing press caused the Reformation.</em> An answer-first chatbot writes the
          essay. Socria asks: <em>Caused it, or made it impossible to contain? What was already moving before 1517
          that the press didn’t start?</em> You think of Hus and Wycliffe, a century earlier. It asks what the press
          changed: whether the idea spread, or how fast it could be put down. Four turns later the thesis is sharper
          than the one you came in with, and it is still yours.
        </p>
        <p>
          The same move works on a hire before a launch, an accounting problem or a pricing proposal.{' '}
          <Link href="/explore">See what people bring to it</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'checks',
    heading: 'What keeps it honest',
    body: (
      <>
        <p>
          A Socratic conversation is only as good as what it rests on. Mathematics is computed rather than recalled,
          and your own steps are checked against it. A reply may cite only the passages of your documents and the
          sources it actually read; a citation to anything else is taken out. When sources disagree, it says so.
        </p>
        <p>
          None of that makes it incapable of being wrong, and Socria has not been studied with the people who use
          it. What this page describes is what the product does.{' '}
          <Link href="/docs/logos-5">The full account is in the docs</Link>.
        </p>
      </>
    ),
  },
];

const QUESTIONS: GuideQuestion[] = [
  {
    q: 'Does Socria refuse to give answers?',
    a: [
      'No. It asks first when a question would help you think, and it does facts and mechanical work directly. It holds something back only when you ask it to, for example “don’t tell me the answer”, or in maths you are learning, where it gives hints until you choose to see the solution.',
    ],
  },
  {
    q: 'How is this different from an ordinary AI chatbot?',
    a: [
      'An ordinary chatbot is built to answer. Socria is built so you understand the answer: it asks the question you skipped, maps your reasoning as you go, and keeps the decisions and the writing yours.',
    ],
  },
  {
    q: 'Is it only for students?',
    a: [
      'No. People bring essays and problem sets, but also proposals, decisions, research and letters. Anything where your own reasoning matters is a fit.',
    ],
  },
  {
    q: 'Can I try it without an account?',
    a: [
      `Yes. Without an account you can start a line of thinking and send up to ${GUEST_TURNS} messages. Every account starts with ${freePlanSentence()}, and Socria One, without a daily limit, is ${priceWithPeriod()}.`,
    ],
  },
];

export default function SocraticAiPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: 'Socria', path: '/' },
            { name: 'Socratic AI', path: '/socratic-ai' },
          ]),
          faqPageLd(faqOf(QUESTIONS)),
        ]}
      />
      <Guide
        eyebrow="Socratic AI · How Socria works"
        title="Socratic AI: the AI that asks before it answers"
        deck="It asks the question you skipped, so the thinking stays yours. And it still answers."
        intro={
          <p>
            Socria is an AI built on an old idea: the fastest way to understand something is to be asked the right
            question about it. This page explains what Socratic questioning is, how it differs from an answer-first
            chatbot, and exactly what Socria does with it.
          </p>
        }
        sections={SECTIONS}
        questions={QUESTIONS}
        cta="Start a conversation"
        note="No account needed to start."
        related={[
          { href: '/for-students', label: 'Socria for students' },
          { href: '/docs/thinking-map', label: 'The Logic Map' },
          { href: '/docs/mathematics', label: 'Mathematics and the Answer Guard' },
          { href: '/charter', label: 'The Socria Charter' },
        ]}
      />
    </>
  );
}
