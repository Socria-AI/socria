// Depth, Conversation Style, Personality, custom instructions — and the
// hierarchy that keeps them honest. Checkable against lib/socria-prompt.ts,
// lib/conversation-style.ts, lib/core4/voice.ts, lib/logos-personality.ts and
// lib/logos-style.ts.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def, TableWrap } from '../Article';
import { DemoControls, DemoPersonality } from '@/app/logos/LogosDemo';
import { docPage } from '../registry';

const page = docPage('depth-personality')!;
const sections = [
  { id: 'hierarchy', heading: 'The hierarchy' },
  { id: 'depth', heading: 'Thinking Depth' },
  { id: 'style', heading: 'Conversation Style' },
  { id: 'personality', heading: 'Socria Personality' },
  { id: 'instructions', heading: 'Custom instructions' },
];

export function DepthPersonality() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Four layers of configuration shape how Socria works with you, and
        they answer different questions on purpose. <strong>Depth</strong>{' '}
        decides how far the thinking goes. <strong>Conversation Style</strong>{' '}
        is the character Socria talks in, in Core 4 and in Logos alike.{' '}
        <strong>Personality</strong> fine-tunes how Logos sounds on the way.{' '}
        <strong>Custom instructions</strong> say, in your own words, whatever
        the others don&rsquo;t.
      </p>

      <H2 id="hierarchy">The hierarchy</H2>
      <p>When settings could conflict, the order is fixed — top wins:</p>
      <ol>
        <li>
          <strong>Protected Human-First principles</strong> — authorship, the
          Answer Guard, transparency. No setting reaches these.
        </li>
        <li><strong>Thinking Depth</strong> — how deeply the thinking goes.</li>
        <li><strong>Conversation Style</strong> — the character it talks in.</li>
        <li><strong>Socria Personality</strong> — finer dials on how Logos communicates; a dial you moved wins on the one thing it sets.</li>
        <li><strong>Custom instructions</strong> — your free-text preferences.</li>
        <li><strong>The conversation itself</strong> — what this moment needs. Asking for something different here wins for that conversation.</li>
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
        The depth control sits beside the box you type in, in the model picker,
        in Core 3.1 and Logos 3. Core 4 and Logos 2 have none: Core 4 judges how
        far to go itself, and Logos 2 answers at one depth and puts the effort
        into the map and the model.
        Four registers:
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
        Depth changes how far the thinking goes — length follows the
        thinking, so Quick is not a truncated Deep and Deep is not Quick with
        padding. And no depth changes how readily an answer is revealed. In
        Core 3.1 and in Logos alike, all four registers come with sign-in, on
        every plan — Logos used to think at Balanced unless you held{' '}
        <Link href="/docs/socria-one">Socria One</Link>, and that clip came out:
        depth is what makes Socria worth returning to, so charging to see it was
        charging people not to. Pick a register below — the reply is the same
        question answered there:
      </p>
      <DemoControls />


      <H2 id="style">Conversation Style</H2>
      <p>
        One choice, under <strong>Manage Account → Personalization</strong>,
        kept with your account so it follows you to every device. It applies
        to Core 4 and to Logos — to new conversations and to the next message
        of one you already have open. Four styles, and the first is Socria as
        it already is:
      </p>
      <TableWrap>
        <table>
          <thead>
            <tr><th>Style</th><th>In Core 4</th><th>In Logos</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>The Thinker</strong> (default)</td><td>Measured and Socratic — the voice as written.</td><td>Curious and inventive — the voice as written.</td></tr>
            <tr><td><strong>The Direct</strong></td><td>The substance first, shorter replies, a question only when the answer would change what comes next.</td><td>Builds first and talks less; statements over questions.</td></tr>
            <tr><td><strong>The Companion</strong></td><td>Warmer and more conversational; encouragement that names what is actually good; humour when it fits.</td><td>Good company in the work — playful, enjoys a surprising result, pushes where it matters.</td></tr>
            <tr><td><strong>The Challenger</strong></td><td>Leads with the weakest load-bearing point, asks for the evidence and what would change your mind.</td><td>Points at the test: the parameter to move, the case that would break the model; flags every guessed number.</td></tr>
          </tbody>
        </table>
      </TableWrap>
      <p>
        It is more than a line of text in the prompt. In Core 4 it also moves
        the per-turn register — the warmth, edge, humour and density the turn
        is written in — and the Direct leans replies brief the way a Concise
        reply length does, unless you set a length yourself. In Logos it sits
        above the Personality dials, which fine-tune it.
      </p>
      <Callout tag="What no style changes">
        <p>
          Facts, mathematics and computation are the same in every style. What
          is yours to work out stays yours, and the Answer Guard holds. You
          steer: no style decides for you or argues past a choice you have
          made. Depth is untouched. When you are struggling, every style goes
          quiet: a Challenger does not push on a bad day, and a Companion does
          not joke through one. In Core 4 a few other moments keep their own
          register too, whatever you chose — a safety concern, real time
          pressure, or you saying a reply gave too much away.
        </p>
      </Callout>
      <p>
        Core 3.1 keeps its own voice: there, depth already sets the voice, and
        a second one beside it would argue about the same sentence.
      </p>


      <H2 id="personality">Socria Personality</H2>
      <p>
        In Logos, nine dials, each a small range of named registers rather
        than a persona preset — every combination is still recognizably
        Socria, wearing different manners. Each dial&rsquo;s default
        contributes nothing: the default voice lives in the product itself,
        and only departures from it add instruction. They refine your
        Conversation Style: a dial you moved wins on the one thing it sets.
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
      <DemoPersonality />


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
