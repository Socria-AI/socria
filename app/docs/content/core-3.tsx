// Core 3.1 — the model with the most moving parts. Checkable against
// CORE_3_PROMPT, the conversation controller, and the chat page wiring.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def } from '../Article';
import { docPage } from '../registry';

const page = docPage('core-3')!;
const sections = [
  { id: 'stance', heading: 'The stance' },
  { id: 'turn', heading: 'What happens on every turn' },
  { id: 'memory', heading: 'What it remembers' },
  { id: 'cards', heading: 'Syntheses, insights, chips' },
  { id: 'journey', heading: 'The Thinking Journey' },
  { id: 'import', heading: 'Importing history from another AI' },
];

export function Core3() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Core 3.1 is the conversation that keeps up. Where Core 2 withholds and
        asks, Core 3.1 actively contributes — observations, distinctions,
        reframes — and it responds to a question underneath your message
        rather than the message itself:{' '}
        <em>&ldquo;what changed in my understanding because they said
        this?&rdquo;</em>
      </p>

      <H2 id="stance">The stance</H2>
      <p>
        A mentor optimizing for maximum insight in the minimum necessary
        words. The signature turn is one observation, one distinction or
        reframe, and at most one focused question — many replies end with
        none, because questions are earned, not default. It states supported
        patterns without hedging, keeps paragraphs short and conversational,
        and marks the one phrase that matters with{' '}
        <em>italic emphasis</em> — its visible signature, used once per reply
        when genuinely earned.
      </p>
      <p>
        It is also aggressively de-programmed against generic coaching
        language: openers like &ldquo;It sounds like…&rdquo;, &ldquo;That
        makes sense&rdquo; and &ldquo;Tell me more&rdquo; are banned outright,
        and everyday questions get everyday answers — depth is never imposed
        on a practical moment.
      </p>

      <H2 id="turn">What happens on every turn</H2>
      <p>
        Two layers steer each reply before the model writes a word:
      </p>
      <Defs>
        <Def term="A deterministic controller">
          Pure code, no extra AI call. It tracks the conversation&rsquo;s
          stage (observe → clarify → challenge → connect → synthesize), your
          engagement, and readiness for synthesis; it varies the reply&rsquo;s
          move so two turns never repeat the same shape; and it scans the last
          two replies against a list of twenty-two banned coaching patterns,
          forbidding any that just appeared. Two questions in a row? The third
          reply is not allowed to ask one.
        </Def>
        <Def term="A living understanding">
          From your second message on, a lightweight semantic pass keeps a
          one-sentence running read of what the conversation is actually
          about, how your last message changed it — confirmed, refined,
          contradicted, or replaced it — and what is already resolved and must
          not be re-investigated. The reply is written <em>from</em> that
          state, not from your last message in isolation. It also weighs
          stakes: an everyday question is flagged as everyday, so it gets no
          hidden-meaning excavation.
        </Def>
      </Defs>

      <H2 id="memory">What it remembers</H2>
      <p>
        After every exchange, a background pass updates the thread&rsquo;s
        memory: your goals, values, constraints, preferences, decisions,
        uncertainties and insights, plus Socria&rsquo;s own emerging
        understanding and a private read of your thinking style. Changed
        positions replace old ones rather than piling up contradictions, and
        nothing is ever invented.
      </p>
      <Callout tag="The machinery stays invisible">
        <p>
          Core 3.1 is forbidden from citing its own apparatus — no
          &ldquo;according to your profile&rdquo;, no &ldquo;my memory
          says&rdquo;. It should simply feel like being remembered.
        </p>
      </Callout>
      <p>
        Conversations also title themselves: once a thread has real substance,
        it gets a name that captures the underlying question
        (&ldquo;Ambition vs Security&rdquo;), never a generic label — and the
        auto-titler only ever replaces its own suggestions or the default
        name; a title it did not write is left alone.
      </p>

      <H2 id="cards">Syntheses, insights, chips</H2>
      <Defs>
        <Def term="Synthesis cards">
          At a cadence paced by your depth setting, Core 3.1 gathers what you
          have worked out into a structured card — recurring themes, tensions,
          hidden assumptions, shifts in thinking, areas of clarity, possible
          reframes — with a short title. It waits if you still have one unread.
        </Def>
        <Def term="Insight cards">
          Occasionally, one reflection in one to three sentences, grounded
          entirely in what you said — never advice, never a
          motivational poster.
        </Def>
        <Def term="Choice chips">
          When a reply ends on a question, it offers four to six tappable
          answers written in your first-person voice — including at least one
          that questions the premise or admits uncertainty. Pick one or type
          your own.
        </Def>
      </Defs>

      <H2 id="journey">The Thinking Journey</H2>
      <p>
        Across conversations, Core 3.1 keeps a short narrative understanding
        of your thinking: what you are wrestling with and why, up to four
        open threads, and a timeline of moments. Understanding, not
        surveillance — &ldquo;wrestling with monetization timing because they
        want sustainable growth,&rdquo; not a dossier. Open a new conversation
        and it may check in on a thread you left open; it will never guilt you
        for time away, and it updates only every few turns, never inventing
        dates.
      </p>

      <H2 id="import">Importing history from another AI</H2>
      <p>
        If you have months of context in ChatGPT or Claude, Socria gives you a
        prompt to paste <em>there</em>; the profile it writes back can be
        imported into Core 3.1 as background. The live conversation always
        wins over the import, and the pasted text is sanitized so it cannot
        impersonate Socria&rsquo;s own structured output.
      </p>
      <p>
        Core 3.1 requires signing in (or an access key). Its depth control and
        everything on this page come with it — see{' '}
        <Link href="/docs/depth-personality">Depth &amp; Personality</Link>{' '}
        for the settings themselves.
      </p>
    </Article>
  );
}
