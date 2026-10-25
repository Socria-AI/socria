// Length, Conversation Style — the one personality — and custom instructions,
// with the hierarchy that keeps them honest. Checkable against
// components/logos5/ConcisePicker.tsx and lib/runtime/behavior.ts (the length
// and what it does), lib/conversation-style.ts and lib/logos-style.ts.
//
// The slug is still depth-personality, so links to it keep working; Thinking
// Depth itself belonged to the models before Logos 5, and is said here only as
// what the length setting replaced.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def, TableWrap } from '../Article';
import { docPage } from '../registry';

const page = docPage('depth-personality')!;
const sections = [
  { id: 'hierarchy', heading: 'The hierarchy' },
  { id: 'length', heading: 'Length' },
  { id: 'style', heading: 'Conversation Style' },
  { id: 'instructions', heading: 'Custom instructions' },
];

export function DepthPersonality() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Three layers of configuration shape how Socria works with you, and
        they answer different questions on purpose. <strong>Length</strong>{' '}
        decides how long a reply is. <strong>Conversation Style</strong> is
        Socria&rsquo;s personality: the character it talks in, chosen once.{' '}
        <strong>Custom instructions</strong> say, in your own words, whatever
        the style doesn&rsquo;t.
      </p>

      <H2 id="hierarchy">The hierarchy</H2>
      <p>When settings could conflict, the order is fixed — top wins:</p>
      <ol>
        <li>
          <strong>Protected Human-First principles</strong> — authorship, the
          Answer Guard, transparency. No setting reaches these.
        </li>
        <li><strong>Conversation Style</strong> — the personality.</li>
        <li><strong>Custom instructions</strong> — your free-text preferences, layered over the style.</li>
        <li><strong>The conversation itself</strong> — what this moment needs. Asking for something different here wins for that conversation.</li>
      </ol>
      <Callout tag="Why length is not on the list">
        <p>
          Length does not compete with anything above it: it says how much
          room a reply has, and nothing about what goes in it. A Concise reply
          from the Challenger and a Detailed one from the Companion are
          equally careful, and feel nothing alike.
        </p>
      </Callout>

      <H2 id="length">Length</H2>
      <p>
        One setting, beside the box you type in: <strong>Concise</strong>,{' '}
        <strong>Balanced</strong> (the default) or <strong>Detailed</strong>.
        It sets how long a reply runs, and nothing else — not how carefully
        Socria thinks, and never how readily it gives an answer. A reply that
        needs room for a chart or a draft gets it whatever the setting. It is
        kept in this browser.
      </p>
      <p>
        It replaced Thinking Depth — Quick, Balanced, Deep and Abstract — which
        the models before Logos 5 had. Depth tried to set how far the thinking
        went; in Logos 5 that is decided by what each turn needs, read in code
        from what you have said (see{' '}
        <Link href="/docs/logos-5#yours">which part of the work is yours</Link>),
        and what is left for you to choose is how much you want to read.
      </p>

      <H2 id="style">Conversation Style</H2>
      <p>
        One choice, under <strong>Manage Account → Personalization</strong>,
        kept with your account so it follows you to every device. It applies
        to new conversations and to the next message of one you already have
        open. Four styles, and the first is Socria as it already is:
      </p>
      <TableWrap>
        <table>
          <thead>
            <tr><th>Style</th><th>How it talks</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>The Thinker</strong> (default)</td><td>Curious and inventive — the voice as written.</td></tr>
            <tr><td><strong>The Direct</strong></td><td>Builds first and talks less; statements over questions.</td></tr>
            <tr><td><strong>The Companion</strong></td><td>Good company in the work — playful, enjoys a surprising result, pushes where it matters.</td></tr>
            <tr><td><strong>The Challenger</strong></td><td>Points at the test: the parameter to move, the case that would break the model; flags every guessed number.</td></tr>
          </tbody>
        </table>
      </TableWrap>
      <p>
        It sits above your own instructions, which layer over it. There are no
        separate personality dials: this is the one personality, so Socria
        sounds like the same Socria everywhere.
      </p>
      <Callout tag="What no style changes">
        <p>
          Facts, mathematics and computation are the same in every style. What
          is yours to work out stays yours, and the Answer Guard holds. You
          steer: no style decides for you or argues past a choice you have
          made. When you are struggling, every style goes quiet: a Challenger
          does not push on a bad day, and a Companion does not joke through
          one.
        </p>
      </Callout>

      <H2 id="instructions">Custom instructions</H2>
      <p>
        A free-text field (up to 1,200 characters) layered over your
        Conversation Style — &ldquo;talk casually, challenge my assumptions
        more, for math act like a lab instructor.&rdquo; It is under Manage
        Account → Personalization. Two ways to change it without opening it:
      </p>
      <Defs>
        <Def term="For one conversation">
          Just ask in the chat — &ldquo;be more casual&rdquo;, &ldquo;fewer
          questions&rdquo; — and Socria adapts on the spot.
        </Def>
        <Def term="Permanently">
          Say &ldquo;remember this&rdquo; or &ldquo;from now on&rdquo; and
          Socria updates the written instructions itself; what&rsquo;s written
          there is what&rsquo;s remembered.
        </Def>
      </Defs>
      <p>
        However it is set, this layer shapes how Socria works with you, not its
        principles — your authorship, the Answer Guard and the transparency
        moves hold whatever you write.
      </p>
    </Article>
  );
}
