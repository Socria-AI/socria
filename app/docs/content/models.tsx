// The comparison page. Checkable against SOCRIA_MODELS in lib/socria-prompt.ts.
//
// Logos 2 IS in the table, and what it is has changed under the name: it
// was a two-seat room, and the room is gone (see the production cut on
// main). What earns it a column now is the model workspace — objects the
// engine builds, with identity, revisions and undo — which is a different
// kind of thing in the workspace rather than a second seat on the same
// one. See /docs/logos-2.

import Link from 'next/link';
import { Article, H2, Callout, TableWrap } from '../Article';
import { DemoModelPicker } from '../DocsDemo';
import { docPage } from '../registry';

const page = docPage('models')!;
const sections = [
  { id: 'compare', heading: 'Side by side' },
  { id: 'switching', heading: 'Switching between them' },
  { id: 'choosing', heading: 'Which one, when' },
];

export function Models() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Socria ships four models behind one switcher, and they are not four
        sizes of the same thing — they are different amounts of{' '}
        <em>machinery around the conversation</em>. Core 3.1 is a voice with a
        memory and a running read of the thread. Core 4 is a voice that
        decides, each turn, which part of the work is yours. Logos 2 is an
        environment: the conversation beside a live map of your reasoning,
        with models the engine builds inside it. Logos 3 is that environment
        with a second seat.
      </p>
      <Callout tag="Retired">
        <p>
          <Link href="/docs/core-2">Core 2</Link> retired on 2 October; Core 3.1
          took over as the model that needs no account. The original{' '}
          <Link href="/docs/logos">Logos</Link> is no longer offered — Logos 2
          is the same surface with the model workspace in it, and anybody on
          the original is moved there.
        </p>
      </Callout>

      <H2 id="compare">Side by side</H2>
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Core 3.1</th>
              <th>Core 4</th>
              <th>Logos 2</th>
              <th>Logos 3</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>In a sentence</strong></td>
              <td>Assertive pattern-naming with thread memory and adjustable depth</td>
              <td>Contributes by default; holds work back only on a reason you gave</td>
              <td>The conversation plus a live map of your reasoning, and models
                the engine builds, which you move, read, edit and undo</td>
              <td>Logos 2 for two people at once, with Socria as the layer between
                them</td>
            </tr>
            <tr>
              <td><strong>Account</strong></td>
              <td>Not required</td>
              <td>Sign-in (or an access key)</td>
              <td>Sign-in (or an access key). Two lines of thinking a month free,
                then <Link href="/docs/socria-one">Socria One</Link></td>
              <td>Sign-in, for both people</td>
            </tr>
            <tr>
              <td><strong>Thinking depth</strong></td>
              <td>All four modes</td>
              <td>None, deliberately — it judges depth itself, and gives you
                readability and length instead</td>
              <td>None — no depth modes. It answers at one depth and puts the
                effort into the map and the model</td>
              <td>None, as Logos 2</td>
            </tr>
            <tr>
              <td><strong>Memory</strong></td>
              <td>Thread memory, syntheses, insights, a cross-conversation journey</td>
              <td>A record of the reasoning itself — every claim, objection and
                decision with whose it is, enforced in code</td>
              <td>The map, the models and their revisions — a model keeps its
                history, so you can undo an edit rather than regenerate a picture</td>
              <td>The room keeps its own record, each line with who wrote it; a
                shared room is saved to neither account and never feeds memory</td>
            </tr>
            <tr>
              <td><strong>Extra surfaces</strong></td>
              <td>Synthesis &amp; insight cards, choice chips</td>
              <td>Projects, source cards, exact arithmetic, attachments</td>
              <td>Thinking Map, Board, plots, Draft Space, Research, and the
                model workspace: surfaces, mechanisms, systems of equations,
                fitted specifications and three simulations — a black hole, the
                expanding universe, an orbit</td>
              <td>All of Logos 2, plus the room: an invite, two seats, every line
                and every idea marked with whose it is</td>
            </tr>
            <tr>
              <td><strong>Writes prose for you</strong></td>
              <td>Only refining material you brought</td>
              <td>Yes, unless the authorship is the point — and it says so when it stops</td>
              <td>Never. It may propose a model, and the engine decides whether
                it computes — a proposal is never presented as a result</td>
              <td>Never — and between two people it never takes a side either</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>

      <H2 id="switching">Switching between them</H2>
      <p>
        The model picker sits bottom-right, beside the chat box. Picking
        Logos 2 does not navigate anywhere: the whole surface swaps in place
        inside <code>/chat</code>, because Logos 2 is a model, not a
        destination — and leaving it returns you to whichever Core model you
        were on before, not to a default.
      </p>
      <p>
        Your choice is remembered per browser. In the sidebar, chats and lines
        of thinking sit in one list ordered by when you last touched each;
        lines of thinking carry a small map mark, and opening one switches you
        into Logos 2. The way back is the <em>Socria chat</em> button in the
        Logos 2 header — <em>Chat</em> on a narrower screen — which returns you to whichever Core model you were on.
      </p>
      <DemoModelPicker />


      <H2 id="choosing">Which one, when</H2>
      <ul>
        <li>
          <strong>Core 3.1</strong> — a thread you will return to, or no
          account at all. It notices your language, names patterns without
          hedging, asks at most one question per turn, and periodically hands
          you a structured synthesis of what you have actually worked out.
        </li>
        <li>
          <strong><Link href="/docs/core-4">Core 4</Link></strong> — long,
          consequential work you will come back to: a decision that lives over
          weeks, a piece of research, a plan whose load-bearing assumption is
          worth finding. It contributes by default, almost never asks a
          question you do not need, and does not re-raise what you have
          already settled. It is the wrong tool for a quick answer, and it
          starts flat: on a first message there is nothing yet to be
          continuous with.
        </li>
        <li>
          <strong><Link href="/docs/logos-2">Logos 2</Link></strong> — thinking
          with structure, or thinking about a <em>system</em>: decisions,
          learning, math, and anything you would rather move than read about —
          a surface, a mechanism, a set of differential equations, a model
          fitted to data, a black hole.
        </li>
        <li>
          <strong><Link href="/docs/logos-3">Logos 3</Link></strong> — the same,
          with somebody else: a decision two people share, a disagreement worth
          making precise, a plan you are building together.
        </li>
      </ul>
      <Callout tag="Under the hood">
        <p>
          Each Socria model runs on its own underlying engine, configurable
          per deployment; Core 3.1 and Logos additionally retry on a
          known-good fallback engine if their configured one is rejected.
          The models differ far more in their prompting, per-turn control
          loops and surrounding machinery than in raw engine.
        </p>
      </Callout>
    </Article>
  );
}
