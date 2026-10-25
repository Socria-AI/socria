// The history of Socria — every Core and every Logos, in order, with what
// each added and why the next one changed it. Checkable against the archived
// pages it links to, docs/CORE-4-ARCHITECTURE.md, docs/LOGOS-3.5.md,
// docs/LOGOS-4.md, docs/LOGOS-5.md and docs/LOGOS-5-RUNTIME.md, and the
// dates against `git log` (where the history reaches) and the models' own
// retirement notes in lib/socria-prompt.ts.
//
// Dates are given only where they are on record. The earlier models' launch
// days are not in the history this repository carries, so they are placed
// "before October 2026" rather than given a day nobody can check.
//
// PUBLIC LEVEL ONLY — what each was and why it changed. How each was built
// inside, with its file paths, is app/dev/architecture.

import Link from 'next/link';
import { Article, H2, Callout } from '../Article';
import { CarriedIntoLogos5, HistoryTimeline } from '../Diagrams';
import { ARCHIVE_DATE, docPage } from '../registry';

const page = docPage('history')!;
const sections = [
  { id: 'lines', heading: 'Two lines' },
  { id: 'arc', heading: 'The thread through all of them' },
  { id: 'core-2', heading: 'Core 2' },
  { id: 'core-3', heading: 'Core 3 and 3.1' },
  { id: 'core-4', heading: 'Core 4' },
  { id: 'logos', heading: 'Logos' },
  { id: 'logos-2', heading: 'Logos 2' },
  { id: 'logos-3', heading: 'Logos 3' },
  { id: 'logos-3-5', heading: 'Logos 3.5' },
  { id: 'logos-4', heading: 'Logos 4' },
  { id: 'logos-5', heading: 'Logos 5' },
  { id: 'carried', heading: 'What carried into Logos 5' },
  { id: 'conversations', heading: 'Your conversations from before' },
];

export function History() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Socria has been several models. Some were conversations, some were an environment around one, and
        for a while you picked between them from a menu beside the chat box. Since {ARCHIVE_DATE} there is
        one, <Link href="/docs/logos-5">Logos 5</Link>, and every earlier model&rsquo;s page is kept in
        this section as a record of how it worked.
      </p>

      <H2 id="lines">Two lines</H2>
      <HistoryTimeline />
      <p>
        The <strong>Core</strong> models were a conversation: a voice, and more and more machinery around
        it deciding how to answer. The <strong>Logos</strong> models were an environment: the conversation
        beside a live map of your reasoning, then models the engine computes, then designs in 3D, then
        everyday displays and your documents. Core 4 and the Logos line converged — Core 4&rsquo;s decision
        about whose work is whose moved into Logos — and Logos 5 is where they met.
      </p>

      <H2 id="arc">The thread through all of them</H2>
      <p>
        Every version answered one question differently: <em>how does an AI help someone think without
        doing their thinking for them?</em> The first answer was to hold back — ask, reflect, and leave the
        work alone. It protected the person&rsquo;s thinking and often failed to help it: someone who needed
        an answer got a question, and someone stuck got another hint. Each later model moved the line. Core
        3.1 contributed. Core 4 contributed by default and held back only for a reason the person gave in
        their own words. Logos 5 does the same over the whole conversation, inside an environment that can
        show the thinking as well as talk about it.
      </p>
      <Callout tag="What has not moved">
        <p>
          Through every version: conclusions stay yours, nothing is presented as yours that you did not
          say, and the way out — reveal the answer, ask for it plainly — is never closed and never charged
          for.
        </p>
      </Callout>

      <H2 id="core-2">Core 2</H2>
      <p>
        <Link href="/docs/core-2">Core 2</Link> was Socria at its most restrained: a short reflection, a
        framing thought, one or two considered questions, and then it stopped. It had three stances — coach,
        refine and decision audit — no memory and no settings, and the strictest form of the authorship
        rule: it never generated finished work from a blank prompt. It worked without an account.
      </p>
      <p>
        <strong>Why it changed.</strong> Restraint was its whole design, and restraint alone does not
        always help. It retired on 2 October 2026, and Core 3.1 — which contributes — took over its job as
        the model anyone could open without an account.
      </p>

      <H2 id="core-3">Core 3 and 3.1</H2>
      <p>
        <Link href="/docs/core-3">Core 3.1</Link> was the conversation that kept up. It answered the
        question underneath a message rather than the message itself, with an observation, a distinction or
        a reframe and at most one question. Code steered every reply — the stage of the conversation, the
        shape of the last few replies, coaching clichés it was not allowed to repeat — and a running read of
        what the conversation was really about. It remembered within a thread, wrote syntheses of what you
        had worked out, offered tappable answers in your own voice, kept a short <em>Thinking
        Journey</em> across conversations, and had four depths.
      </p>
      <p>
        <strong>Why it changed.</strong> It decided <em>how</em> to answer but never <em>whose</em> work a
        turn was, so whether it helped or held back was a matter of tone. Core 4 was built to make that a
        decision. Core 3.1 stayed alongside it, as the model needing no account, until {ARCHIVE_DATE}.
      </p>

      <H2 id="core-4">Core 4</H2>
      <p>
        <Link href="/docs/core-4">Core 4</Link> decided, each turn, which parts of the work were worth your
        doing and which were machinery it should simply perform — in code, from your own words, with a
        reason recorded for anything it held back. It would hold something back only on something you said
        (an inference never withholds anything); a practice ladder bottomed out in a worked explanation
        after repeated attempts; graded work you would submit got the method in full and not the answer; a
        safety concern set every contract aside. It kept a record of the reasoning — every claim, objection
        and decision, and whose it was — so long work stopped circling, and it checked mathematics by
        computing it. It was measured against a strong prompt on the same engine, and the page says where
        it did not win.
      </p>
      <p>
        <strong>Why it changed.</strong> Core 4 was a conversation beside an environment, not inside one,
        and its reading of each turn cost an extra model call every time. Logos 5 keeps the decision itself
        — Core 4&rsquo;s own code, run over the conversation — reads the turn without that extra call, and
        puts it under the Universal Map, the views and the documents.
      </p>

      <H2 id="logos">Logos</H2>
      <p>
        The original <Link href="/docs/logos">Logos</Link> made Socria an environment: the conversation on
        one side and, on the other, a <Link href="/docs/thinking-map">Thinking Map</Link> drawing your
        claims, assumptions, tensions and evidence while you talked. Every message started two things at
        once — the reply, and a fresh reading of the conversation into the map — so the map could lag a
        turn and the conversation never noticed. Its stance was the mirror: Logos gave structure and
        questions, and the conclusions were yours.
      </p>
      <p>
        <strong>Why it changed.</strong> Everything it drew was a picture, made again each time. Logos 2
        added things you could own.
      </p>

      <H2 id="logos-2">Logos 2</H2>
      <p>
        <Link href="/docs/logos-2">Logos 2</Link> was the same surface with a <em>model workspace</em>: say
        what a system is — a surface, a mechanism, a set of equations, a relationship in data, an orbit —
        and the engine built a model of it you could move, read, edit and undo, with an identity that
        survived edits, revisions and branches. A proposal the engine could not compute was refused with
        what was missing, never drawn anyway.
      </p>
      <p>
        <strong>Why it changed.</strong> Models were one kind of thing beside the map; the workspace
        around them had room for more.
      </p>

      <H2 id="logos-3">Logos 3</H2>
      <p>
        <Link href="/docs/logos-3">Logos 3</Link> turned that into one workspace: the conversation, the map,
        models the engine solved, and designs drawn in 3D from your words, arranged in panels — with
        engineering and dynamics worked through live, and the beginnings of room for a second person.
      </p>
      <p>
        <strong>Why it changed.</strong> It showed what the engine could compute. Logos 3.5 pointed the same
        machinery at ordinary thinking.
      </p>

      <H2 id="logos-3-5">Logos 3.5</H2>
      <p>
        <Link href="/docs/logos-3-5">Logos 3.5</Link> (from 11 October 2026) added the everyday displays as
        things to think with rather than pictures: charts of your own numbers, plans, calendars,
        comparisons, argument maps, diagrams, Venn diagrams, worksheets and exercises, made from your words
        and never filled with invented numbers. It began reading documents you attached — every reply
        citing the passage it used, every citation checked — and a memory that tracks how your thinking
        changes, with your say over it.
      </p>
      <p>
        <strong>Why it changed.</strong> It could do a great deal, and a person had to know where to look
        for each part of it.
      </p>

      <H2 id="logos-4">Logos 4</H2>
      <p>
        Logos 4 (named on 19 October 2026) added no new engine. It put everything Logos 3 and 3.5 did behind
        one decision, made in code on every turn, about how to help — inform, explain, verify, build,
        challenge, offer perspective, ask, or leave space — and added four everyday features:{' '}
        <strong>Point &amp; Ask</strong> (select anything and ask about it), <strong>Instant Resume</strong>{' '}
        (come back exactly where you were), <strong>Quick Capture</strong> (a note or photo saved in two
        taps) and <strong>Voice to Text</strong>. Its emphasis was reliability, phones and cost.
      </p>
      <p>
        <strong>Why it changed.</strong> Its screen put the map first on every turn, even for a message
        that was only talk, and folded the conversation away under it. Logos 5 turned that around.
      </p>

      <H2 id="logos-5">Logos 5</H2>
      <p>
        <Link href="/docs/logos-5">Logos 5</Link> began on 19 October 2026: conversation first, with a
        workspace beside it only when there is something to show. Home became the Universal Map (20
        October), and the Core conversations became ordinary conversations on it (21 October). It was open
        to early users from 22 October, while everyone else kept Logos 4&rsquo;s screen; by 24 October it
        had its four views, replies that turn interactive only where that helps, a word processor for your
        own writing, a reading of the room that answers a hello as a hello, and Core 4&rsquo;s decision
        about whose work is whose. On {ARCHIVE_DATE} it became everyone&rsquo;s Socria, and the Core models
        and Logos 2 were archived.
      </p>

      <H2 id="carried">What carried into Logos 5</H2>
      <CarriedIntoLogos5 />

      <H2 id="conversations">Your conversations from before</H2>
      <p>
        Nothing was deleted. A conversation from Core 2, Core 3.1, Core 4 or any Logos opens in Logos 5 as
        an ordinary conversation on your Universal Map, with everything it held — its messages, its map,
        its writing and its files — and you can carry on in it. What Socria remembered about you carries on
        too. Only the earlier screens are gone.
      </p>
    </Article>
  );
}
