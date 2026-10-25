// The history of Socria — every Logos, in order, with what each added and why
// the next one changed it. Checkable against the archived pages it links to,
// docs/LOGOS-3.5.md, docs/LOGOS-4.md, docs/LOGOS-5.md and
// docs/LOGOS-5-RUNTIME.md, and the dates against `git log` (where the history
// reaches) and the models' own retirement notes in lib/socria-prompt.ts.
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
  { id: 'line', heading: 'One line' },
  { id: 'arc', heading: 'The thread through all of them' },
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
        Socria has been several models, and for a while you picked between them from a menu beside the
        chat box. Since {ARCHIVE_DATE} there is one, <Link href="/docs/logos-5">Logos 5</Link>, and the
        pages of the Logos before it are kept in this section as a record of how each one worked.
      </p>

      <H2 id="line">One line</H2>
      <HistoryTimeline />
      <p>
        Each Logos was an environment around a conversation, and each led to the next: the conversation
        beside a live map of your reasoning, then models the engine computes, then designs in 3D, then
        everyday displays and your documents, then all of it behind one decision about how to help.
        Logos 5 is where they arrived.
      </p>

      <H2 id="arc">The thread through all of them</H2>
      <p>
        Every version answered one question differently: <em>how does an AI help someone think without
        doing their thinking for them?</em> The first Logos answered it as a mirror — it drew the structure
        of what you said and gave you questions and explanation, and the conclusions were yours. Each later
        model gave you more to think with, and Logos 4 decided in code, on every turn, how to help. Logos 5
        contributes by default and holds something back only for a reason you gave in your own words,
        decided over the whole conversation, inside an environment that can show the thinking as well as
        talk about it.
      </p>
      <Callout tag="What has not moved">
        <p>
          Through every version: conclusions stay yours, nothing is presented as yours that you did not
          say, and the way out — reveal the answer, ask for it plainly — is never closed and never charged
          for.
        </p>
      </Callout>

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
        October), and from 21 October every conversation from before was on it, as an ordinary
        conversation. It was open to early users from 22 October, while everyone else kept Logos 4&rsquo;s
        screen; by 24 October it had its four views, replies that turn interactive only where that helps, a
        word processor for your own writing, a reading of the room that answers a hello as a hello, and a
        decision, made in code over the whole conversation, about which part of the work is yours. On{' '}
        {ARCHIVE_DATE} it became everyone&rsquo;s Socria, and the models still offered beside it were
        archived.
      </p>

      <H2 id="carried">What carried into Logos 5</H2>
      <CarriedIntoLogos5 />

      <H2 id="conversations">Your conversations from before</H2>
      <p>
        Nothing was deleted. A conversation from any earlier model opens in Logos 5 as an ordinary
        conversation on your Universal Map, with everything it held — its messages, its map, its writing
        and its files — and you can carry on in it. What Socria remembered about you carries on too. Only
        the earlier screens are gone.
      </p>
    </Article>
  );
}
