// Depth, Personality, custom instructions — and the hierarchy that keeps
// them honest. Checkable against lib/socria-prompt.ts, lib/logos-personality.ts
// and lib/logos-style.ts.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def, TableWrap } from '../Article';
import { docPage } from '../registry';

const page = docPage('depth-personality')!;
const sections = [
  { id: 'hierarchy', heading: 'The hierarchy' },
  { id: 'depth', heading: 'Thinking Depth' },
  { id: 'personality', heading: 'Socria Personality' },
  { id: 'instructions', heading: 'Custom instructions' },
];

export function DepthPersonality() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Three layers of configuration shape how Socria works with you, and
        they answer different questions on purpose. <strong>Depth</strong>{' '}
        decides how far the thinking goes. <strong>Personality</strong>{' '}
        decides how it sounds on the way. <strong>Custom instructions</strong>{' '}
        say, in your own words, whatever the other two don&rsquo;t.
      </p>

      <H2 id="hierarchy">The hierarchy</H2>
      <p>When settings could conflict, the order is fixed — top wins:</p>
      <ol>
        <li>
          <strong>Protected Human-First principles</strong> — authorship, the
          Answer Guard, transparency. No setting reaches these.
        </li>
        <li><strong>Thinking Depth</strong> — how deeply the thinking goes.</li>
        <li><strong>Socria Personality</strong> — how it communicates.</li>
        <li><strong>Custom instructions</strong> — your free-text preferences.</li>
        <li><strong>The conversation itself</strong> — what this moment needs.</li>
      </ol>
      <Callout tag="Why depth and personality are separate">
        <p>
          They are orthogonal on purpose: Abstract&nbsp;+&nbsp;Casual&nbsp;+&nbsp;Blunt
          and Abstract&nbsp;+&nbsp;Academic&nbsp;+&nbsp;Gentle think equally
          far, and feel nothing alike.
        </p>
      </Callout>

      <H2 id="depth">Thinking Depth</H2>
      <p>
        The depth control sits beside the box you type in — in Logos and in
        Core 3.1 (Core 2 has no depth machinery). Four registers:
      </p>
      <TableWrap>
        <table>
          <thead>
            <tr><th>Depth</th><th>Register</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>Quick</strong></td><td>Plain, conversational. Immediate clarity — an everyday question gets an everyday answer, no excavation.</td></tr>
            <tr><td><strong>Balanced</strong></td><td>Thoughtful, considered; a mentor keeping your pace. The default.</td></tr>
            <tr><td><strong>Deep</strong></td><td>Rigorous, pattern-spotting, precise distinctions — assumptions and tensions get pressed.</td></tr>
            <tr><td><strong>Abstract</strong></td><td>Philosophically literate; principles, structures, values and meaning — grounded in your actual situation, never escaping it.</td></tr>
          </tbody>
        </table>
      </TableWrap>
      <p>
        Depth changes altitude, not length — Quick is not a truncated Deep,
        and Deep is not Quick with padding. On the free tier, depth is fixed
        at Balanced; <Link href="/docs/socria-one">Socria One</Link> opens all
        four.
      </p>

      <H2 id="personality">Socria Personality</H2>
      <p>
        Nine dials, each a small range of named registers rather than a
        persona preset — every combination is still recognizably Socria,
        wearing different manners. Each dial&rsquo;s default contributes
        nothing: the default voice lives in the product itself, and only
        departures from it add instruction.
      </p>
      <TableWrap>
        <table>
          <thead>
            <tr><th>Dial</th><th>Registers</th></tr>
          </thead>
          <tbody>
            <tr><td>Base style</td><td>Socria · Friendly · Casual · Professional · Academic · Reserved</td></tr>
            <tr><td>Warmth</td><td>Low · Default · High</td></tr>
            <tr><td>Directness</td><td>Gentle · Default · Blunt</td></tr>
            <tr><td>Challenge</td><td>Supportive · Balanced · Rigorous</td></tr>
            <tr><td>Questioning</td><td>Fewer · Default · Exploratory</td></tr>
            <tr><td>Length</td><td>Concise · Default · Detailed</td></tr>
            <tr><td>Humor</td><td>None · Occasional · Frequent</td></tr>
            <tr><td>Formatting</td><td>Minimal · Default · Structured</td></tr>
            <tr><td>Language noticing</td><td>Subtle · Default · Frequent</td></tr>
          </tbody>
        </table>
      </TableWrap>
      <p>
        The dials are real controls — click a tick, drag the needle, or use
        the arrow keys — and a faint mark stays at Socria&rsquo;s default so a
        moved dial reads as moved. A note on one of them:{' '}
        <em>High warmth is never therapeutic</em>. Warmth shows in attention,
        not in reflexive reassurance.
      </p>

      <H2 id="instructions">Custom instructions</H2>
      <p>
        Below the dials, a free-text field (up to 1,200 characters) layered
        over the settings — &ldquo;talk casually, challenge my assumptions
        more, for math act like a lab instructor.&rdquo; Two ways to change it
        without opening the sheet:
      </p>
      <Defs>
        <Def term="For one conversation">
          Just ask in the chat — &ldquo;be more casual&rdquo;, &ldquo;fewer
          questions&rdquo; — and Socria adapts on the spot.
        </Def>
        <Def term="Permanently">
          Say &ldquo;remember this&rdquo; and Socria updates the written
          instructions itself; what&rsquo;s written there is what&rsquo;s
          remembered.
        </Def>
      </Defs>
      <p>
        However it is set, this layer shapes personality, not principles —
        your authorship, the Answer Guard and the transparency moves hold on
        every setting.
      </p>
    </Article>
  );
}
