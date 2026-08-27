// The comparison page. Checkable against SOCRIA_MODELS in lib/socria-prompt.ts.

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
        Socria ships three models behind one switcher, and they are not three
        sizes of the same thing — they are three different amounts of{' '}
        <em>machinery around the conversation</em>. Core 2 is a voice. Core 3.1
        is a voice with a memory and a running read of the thread. Logos is an
        environment.
      </p>

      <H2 id="compare">Side by side</H2>
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Core 2</th>
              <th>Core 3.1</th>
              <th>Logos</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>In a sentence</strong></td>
              <td>Calm, restrained Socratic questioning in plain prose</td>
              <td>Assertive pattern-naming with thread memory and adjustable depth</td>
              <td>The conversation plus a live map of your reasoning</td>
            </tr>
            <tr>
              <td><strong>Account</strong></td>
              <td>Not required — one free session signed out</td>
              <td>Sign-in (or an access key)</td>
              <td>Sign-in (or an access key)</td>
            </tr>
            <tr>
              <td><strong>Thinking Depth control</strong></td>
              <td>—</td>
              <td>All four modes</td>
              <td>Its own depth control; all four with <Link href="/docs/socria-one">One</Link></td>
            </tr>
            <tr>
              <td><strong>Memory</strong></td>
              <td>None beyond the visible thread</td>
              <td>Thread memory, syntheses, insights, a cross-conversation journey</td>
              <td>The map itself — plus saved lines of thinking</td>
            </tr>
            <tr>
              <td><strong>Extra surfaces</strong></td>
              <td>—</td>
              <td>Synthesis &amp; insight cards, choice chips</td>
              <td>Thinking Map, Board, plots, Draft Space, Research</td>
            </tr>
            <tr>
              <td><strong>Writes prose for you</strong></td>
              <td>Only refining material you brought</td>
              <td>Only refining material you brought</td>
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
          <strong>Core 2</strong> — you want questions, not machinery. It is
          also the model that works with no account at all.
        </li>
        <li>
          <strong>Core 3.1</strong> — a thread you will return to. It notices
          your language, names patterns without hedging, asks at most one
          question per turn, and periodically hands you a structured synthesis
          of what you have actually worked out.
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
          known-good fallback engine if their configured one is rejected —
          details in the <Link href="/docs/technical">technical
          reference</Link>. The models differ far more in their prompting,
          per-turn control loops and surrounding machinery than in raw
          engine.
        </p>
      </Callout>
    </Article>
  );
}
