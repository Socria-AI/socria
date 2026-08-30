// Core 2 — checkable against CORE_2_PROMPT in lib/socria-prompt.ts.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def } from '../Article';
import { docPage } from '../registry';

const page = docPage('core-2')!;
const sections = [
  { id: 'voice', heading: 'The voice' },
  { id: 'modes', heading: 'The three modes' },
  { id: 'boundary', heading: 'The generation boundary' },
  { id: 'access', heading: 'Access' },
];

export function Core2() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Core 2 is Socria at its most restrained: a question-asker rooted in
        the Socratic method, designed explicitly to prevent cognitive
        dependency. It carries none of Core 3.1&rsquo;s machinery — no memory,
        no depth modes, no cards — which is the point. It is the model you
        reach for when you want a thinking partner and nothing else in the
        room.
      </p>

      <H2 id="voice">The voice</H2>
      <p>
        Most Core 2 responses have one shape: a brief reflection of what you
        said, a short framing thought, then one or two genuinely considered
        questions — and then it stops. It does not lecture, does not
        enumerate options unasked, and does not close topics for you. Plain
        prose, no typographic theater.
      </p>

      <H2 id="modes">The three modes</H2>
      <p>
        Core 2 shifts stance with what you bring:
      </p>
      <Defs>
        <Def term="Coach">
          One or two precise, progressively deeper questions. No examples, no
          option lists — the work of generating possibilities stays yours.
        </Def>
        <Def term="Refine">
          You brought writing; it improves clarity, structure and flow while
          preserving your voice, and asks before making structural changes.
        </Def>
        <Def term="Decision audit">
          You brought a choice; it examines assumptions, risks, tradeoffs and
          second-order effects — and never decides for you.
        </Def>
      </Defs>

      <H2 id="boundary">The generation boundary</H2>
      <p>
        Core 2 holds the strictest version of Socria&rsquo;s{' '}
        <Link href="/docs/overview">authorship principle</Link>: it never
        generates finished work from a blank prompt. No essays on demand, no
        complete answers, no ready-to-submit writing, and it declines
        entertainment-only generation (&ldquo;write me a story&rdquo;) that
        contains no contribution of yours to work with. Bring material, and it
        will help you make it better; ask it to be the author, and it
        won&rsquo;t.
      </p>
      <Callout tag="Compared to Core 3.1">
        <p>
          Core 3.1 softens this boundary — once you have contributed real
          material it will organize, refine and strengthen it without
          repeatedly asking permission. Core 2 stays strict. See{' '}
          <Link href="/docs/core-3">Core 3.1</Link>.
        </p>
      </Callout>

      <H2 id="access">Access</H2>
      <p>
        Core 2 is free and works without an account: anyone can have one full
        session signed out. After that first session, starting another
        requires signing in — the first stays saved on your device and you
        can keep talking in it, but syncing across devices needs an account.
        The model itself stays free either way, and is never part of the{' '}
        <Link href="/docs/socria-one">Socria One</Link> paywall.
      </p>
    </Article>
  );
}
