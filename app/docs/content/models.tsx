// The comparison page. Checkable against SOCRIA_MODELS in lib/socria-prompt.ts.
//
// Logos 2 — the two-person room — is deliberately not in this table yet: it
// is the same surface and the same model as Logos with a second seat, and a
// column for it would be four cells of "same as Logos" and one that matters.
// It gets its own page when the room ships to everyone.

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
        sizes of the same thing — they are four different amounts of{' '}
        <em>machinery around the conversation</em>. Core 2 is a voice. Core 3.1
        is a voice with a memory and a running read of the thread. Core 4 is a
        voice that decides, each turn, which part of the work is yours. Logos
        is an environment.
      </p>

      <H2 id="compare">Side by side</H2>
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Core 2</th>
              <th>Core 3.1</th>
              <th>Core 4</th>
              <th>Logos</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>In a sentence</strong></td>
              <td>Calm, restrained Socratic questioning in plain prose</td>
              <td>Assertive pattern-naming with thread memory and adjustable depth</td>
              <td>Contributes by default; holds work back only on a reason you gave</td>
              <td>The conversation plus a live map of your reasoning</td>
            </tr>
            <tr>
              <td><strong>Account</strong></td>
              <td>Not required — one free session signed out</td>
              <td>Sign-in (or an access key)</td>
              <td>Sign-in (or an access key)</td>
              <td>Sign-in (or an access key)</td>
            </tr>
            <tr>
              <td><strong>Thinking Depth control</strong></td>
              <td>—</td>
              <td>All four modes</td>
              <td>None, deliberately — it judges depth itself, and gives you
                readability and length instead</td>
              <td>Its own depth control; all four modes</td>
            </tr>
            <tr>
              <td><strong>Memory</strong></td>
              <td>None beyond the visible thread</td>
              <td>Thread memory, syntheses, insights, a cross-conversation journey</td>
              <td>A record of the reasoning itself — every claim, objection and
                decision with whose it is, enforced in code</td>
              <td>The map itself — plus saved lines of thinking</td>
            </tr>
            <tr>
              <td><strong>Extra surfaces</strong></td>
              <td>—</td>
              <td>Synthesis &amp; insight cards, choice chips</td>
              <td>Projects, source cards, exact arithmetic, attachments</td>
              <td>Thinking Map, Board, plots, Draft Space, Research</td>
            </tr>
            <tr>
              <td><strong>Writes prose for you</strong></td>
              <td>Only refining material you brought</td>
              <td>Only refining material you brought</td>
              <td>Yes, unless the authorship is the point — and it says so when it stops</td>
              <td>Never — even Draft Space&rsquo;s Refine is a proposal that lands only when you apply it</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>

      <H2 id="switching">Switching between them</H2>
      <p>
        The model picker sits bottom-right, beside the chat box. Picking Logos
        does not navigate anywhere: the whole surface swaps in place inside{' '}
        <code>/chat</code>, because Logos is a model, not a destination — and
        leaving Logos returns you to whichever Core model you were on before,
        not to a default.
      </p>
      <p>
        Your choice is remembered per browser. In the sidebar, chat and Logos
        sessions sit in one list ordered by when you last touched each; Logos
        sessions carry the Logos mark, and opening one switches you into
        Logos. The way back is the <em>Socria chat</em> button in the Logos
        header, which returns you to whichever Core model you were on.
      </p>
      <DemoModelPicker />


      <H2 id="choosing">Which one, when</H2>
      <ul>
        <li>
          <strong>Core 2</strong> — you want questions, not machinery.{' '}
          <em>It retires on 2 October</em>, and the model that works with no
          account at all is Core 3.1 from now on.
        </li>
        <li>
          <strong>Core 3.1</strong> — a thread you will return to. It notices
          your language, names patterns without hedging, asks at most one
          question per turn, and periodically hands you a structured synthesis
          of what you have actually worked out.
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
          <strong>Logos</strong> — thinking with structure: decisions,
          learning, math, anything where seeing the reasoning matters as much
          as having it.
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
