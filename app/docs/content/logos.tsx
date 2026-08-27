// The Logos overview: the surfaces and how they cooperate. The map's own
// vocabulary gets its full page at /docs/thinking-map.

import Link from 'next/link';
import { Article, H2, Callout } from '../Article';
import { docPage } from '../registry';

const page = docPage('logos')!;
const sections = [
  { id: 'split', heading: 'The split screen' },
  { id: 'turn', heading: 'What happens when you send a message' },
  { id: 'voice', heading: 'How it talks' },
  { id: 'boundary', heading: 'The boundary' },
  { id: 'sessions', heading: 'Lines of thinking' },
  { id: 'material', heading: 'Bringing your own material' },
];

export function Logos() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Logos is the model that made Socria an environment. Select it and the
        chat becomes a split screen: your conversation on the left, and on the
        right a <Link href="/docs/thinking-map">Thinking Map</Link> that draws
        the structure of what you are saying — claims, assumptions, tensions,
        evidence — live, while you talk. On a phone the two become tabs; the
        thinking is the same.
      </p>

      <H2 id="split">The split screen</H2>
      <p>
        The map is not an illustration of the reply — it is a second, parallel
        reading of <em>you</em>. Its header names the kind of thinking it
        currently sees (Deciding, Learning, Writing, Math…), inferred from
        the conversation rather than chosen from a menu, and it moves as the
        conversation moves. When an extraction reorganizes things, the panel
        says what changed — &ldquo;merged 1 · resolved 2&rdquo; — and the
        affected nodes flash briefly so you can see where.
      </p>

      <H2 id="turn">What happens when you send a message</H2>
      <p>
        Every message you send fires <strong>two independent requests in
        parallel</strong>: one streams the conversational reply; the other
        re-reads the recent conversation and produces a fresh map. The map is
        deliberately not derived from the reply — it reorganizes while the
        answer is still streaming, and if an extraction fails or lags, the
        conversation never notices. The map is allowed to skip a turn; the
        thinking is not.
      </p>

      <H2 id="voice">How it talks</H2>
      <p>
        Two to four sentences of plain prose. One move per turn — ask, notice,
        challenge, connect, clarify, explain, acknowledge, or leave space —
        never several at once, and not every reply ends with a question: one
        appended out of habit teaches you to stop reading the last line.
        Therapist reflexes (&ldquo;It sounds like…&rdquo;, &ldquo;What
        I&rsquo;m hearing is…&rdquo;) are banned as openers, and Logos never
        narrates the map at you — the map itself is how it demonstrates
        understanding.
      </p>
      <p>
        Logos has its own <Link href="/docs/depth-personality">depth
        control</Link> beside the composer. As its footer says: depth changes
        how deeply Logos helps you think — never how quickly it gives
        answers.
      </p>

      <H2 id="boundary">The boundary</H2>
      <Callout tag="The person is the thinker; Logos is the mirror">
        <p>
          Logos contributes structure, questions, research, explanation,
          critique, organization and refinement of what you wrote. You keep
          intent, substantive authorship, consequential judgment and final
          conclusions.
        </p>
      </Callout>
      <p>The prompt&rsquo;s own worked examples draw the line cleanly:</p>
      <ul>
        <li>&ldquo;Write my essay&rdquo; — it won&rsquo;t.</li>
        <li>&ldquo;Make my paragraph clearer&rdquo; — it will.</li>
        <li>
          &ldquo;What does this study say?&rdquo; — it explains.
          Understanding is not authorship.
        </li>
      </ul>
      <p>
        When the work is mathematical, this boundary takes its sharpest form —
        the <Link href="/docs/mathematics">Answer Guard</Link>.
      </p>

      <H2 id="sessions">Lines of thinking</H2>
      <p>
        The left rail keeps every line of thinking, each with a small
        deterministic thumbnail of its map&rsquo;s shape — you recognize a
        session by the shape its reasoning took, not by reading a title.
        A session holds four things together: the conversation, the map, the{' '}
        <Link href="/docs/drafts-grounding">draft</Link> if one exists, and
        any grounded material — reopening one restores all of them.
      </p>
      <p>
        Signed in, sessions sync to your account and appear in the same
        sidebar as your Core conversations, marked with the Logos glyph.
        Unlocked by key without an account, they stay in the browser. Deep
        links work either way: <code>/chat?s=&lt;session&gt;</code> opens a
        specific line of thinking, <code>/chat?model=logos</code> opens
        Logos itself.
      </p>

      <H2 id="material">Bringing your own material</H2>
      <p>
        Paste something long and it becomes an attached note instead of
        flooding the box; attach images and Logos reads them once, at attach
        time, so the reply and the map work from the same reading. Every
        attachment carries an origin you can correct —{' '}
        <strong>My thinking</strong>, <strong>Source material</strong> or{' '}
        <strong>Context</strong> — and the origin decides what the map may do
        with it: someone else&rsquo;s argument can become a claim or a source
        on your map, but never one of <em>your</em> beliefs. Grounding a
        specific node in material is covered under{' '}
        <Link href="/docs/drafts-grounding">Draft Space &amp; grounding</Link>.
      </p>
    </Article>
  );
}
