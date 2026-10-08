// Socria Logos 3 — Logos 2 with a second seat.
//
// The room was parked for the production cut and shipped as Logos 3. This
// page says what it does and, as plainly, what happens to what two people
// write in it — the part somebody inviting a colleague needs to know first.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def } from '../Article';
import { docPage } from '../registry';

const page = docPage('logos-3')!;
const sections = [
  { id: 'what', heading: 'Two people, one map' },
  { id: 'start', heading: 'Starting a room' },
  { id: 'between', heading: 'What Socria does between you' },
  { id: 'yours', heading: 'Whose words are whose' },
  { id: 'limits', heading: 'What it does not do' },
  { id: 'engineering', heading: 'Engineering examples' },
];

export function Logos3() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Logos 3 is <Link href="/docs/logos-2">Logos 2</Link> — the conversation, the live{' '}
        <Link href="/docs/thinking-map">Thinking Map</Link> and the models the engine builds —
        with room for a second person. Two people think in one line of thinking, and Socria
        sits between them.
      </p>

      <H2 id="what">Two people, one map</H2>
      <p>
        Both people see the same conversation, the same map and the same models, as they
        change. Every line a person writes is signed with their name in their own colour, and
        every idea on the map carries a dot saying whose it was — so a glance tells you which of
        you said the thing you are now arguing about.
      </p>

      <H2 id="start">Starting a room</H2>
      <ol>
        <li>
          Pick <strong>Logos 3</strong> in the model menu — it is listed under{' '}
          <em>think together</em>.
        </li>
        <li>
          Press <strong>Think together</strong> in the header. A room opens around the line of
          thinking you are in, and the header shows an invite with the room&rsquo;s code.
        </li>
        <li>
          Press the invite to copy the link, and send it. The other person opens it, signed in,
          and is seated beside you. The header then reads <em>Thinking together</em>, with both
          your initials.
        </li>
        <li>
          <strong>Leave</strong> ends your part in the room; on your own, it is Logos 2 again.
        </li>
      </ol>
      <Callout tag="Signed in, both of you">
        A room holds two people, and both need an account. The code is how somebody asks to
        join, not proof that they belong: Socria&rsquo;s server checks who each person is on
        every exchange, and a third person with the link is not let in.
      </Callout>

      <H2 id="between">What Socria does between you</H2>
      <p>
        With two people in the room, Socria stops being a third voice and becomes the layer
        between you. It knows who said what, and its job narrows to making visible what is
        between you:
      </p>
      <Defs>
        <Def term="Connections">
          Where something one of you said bears on something the other said — named, with both
          names.
        </Def>
        <Def term="Disagreements">
          What each of you is actually claiming, and what each would have to believe for it to
          hold. Made precise; never resolved for you.
        </Def>
        <Def term="Assumptions">
          What one of you is taking for granted that the other has not examined.
        </Def>
        <Def term="Questions">
          The one neither of you has asked yet, if there is one.
        </Def>
      </Defs>
      <p>
        It never takes a side and never tells you who is right. Reaching that is the point of
        the two of you being there.
      </p>

      <H2 id="yours">Whose words are whose</H2>
      <ul>
        <li>
          <strong>A shared room is not saved into either person&rsquo;s account.</strong> The
          room keeps its own record, and every entry in it carries who wrote it — so neither of
          you ends up holding the other&rsquo;s words in your own history, exports or deletions.
        </li>
        <li>
          <strong>Nothing from a room reaches what Socria remembers about you.</strong> The pass
          that learns how you think reads only your own lines of thinking, never a shared one,
          because it would otherwise fold the other person&rsquo;s words into your private
          memory.
        </li>
        <li>
          Socria is told the two first names in the room and nothing else about either of you.
        </li>
      </ul>

      <H2 id="limits">What it does not do</H2>
      <ul>
        <li>
          <strong>Two seats.</strong> Not three, and not an audience.
        </li>
        <li>
          <strong>Both of you, at the same time.</strong> The room is live; it is not a document
          the other person reads later.
        </li>
        <li>
          <strong>Everything else is Logos 2.</strong> The lenses, the moves on each card, the
          models and what they cannot do yet are on{' '}
          <Link href="/docs/logos-2">that page</Link> — except depth. Logos 3 has the four{' '}
          <Link href="/docs/depth-personality">depth modes</Link>, in the model picker.
        </li>
      </ul>

      <H2 id="engineering">Engineering examples</H2>
      <p>
        What Logos 3 can build for engineering work — engines, mechanisms and vibration, circuits, beams and columns,
        cooling and flow, rockets and orbits, reactions, control loops — is on{' '}
        <Link href="/docs/logos-3-engineering">Engineering in Logos 3</Link>: the words to ask with, the model the engine
        builds, live, and the numbers it computes. The same page has{' '}
        <Link href="/docs/logos-3-engineering#live3d">CAD-style designs built in Live 3D from the chat</Link> — a bearing, an
        I-beam, a truss, a heat sink, a rotor and more — each drawn in 3D from the words that describe it.
        Maps and chaos — the road to chaos and Feigenbaum’s δ, a strange attractor, the Lorenz butterfly cut by a
        Poincaré section — are on <Link href="/docs/logos-3-dynamics">Dynamics and chaos in Logos 3</Link>.
      </p>
    </Article>
  );
}
