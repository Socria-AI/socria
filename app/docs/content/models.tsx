// The models page — now about there being one. Checkable against SOCRIA_MODELS
// in lib/socria-prompt.ts (what is offered, what is withdrawn and why) and
// lib/socria-model-store.ts (where somebody on a withdrawn model goes).
//
// The count it states is held to the menu by test/docs-wiki.test.mjs: the
// next model offered fails the suite until this page says so.

import Link from 'next/link';
import { Article, H2, Callout, TableWrap } from '../Article';
import { ARCHIVE_DATE, docPage } from '../registry';

const page = docPage('models')!;
const sections = [
  { id: 'one', heading: 'Why one' },
  { id: 'setting', heading: 'The one setting' },
  { id: 'earlier', heading: 'The models before it' },
  { id: 'went', heading: 'Where their conversations went' },
];

export function Models() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Socria offers one model: <Link href="/docs/logos-5">Logos 5</Link>. There is no menu to pick from
        and nothing to switch between — everything the earlier models did that was worth keeping is part of
        it, and the rest was archived on {ARCHIVE_DATE}.
      </p>

      <H2 id="one">Why one</H2>
      <p>
        For a while Socria shipped several models behind a switcher, and they were not sizes of the same
        thing but different amounts of machinery around a conversation: a live map beside it, models the
        engine builds, a workspace of designs, displays and documents. A person had to know which one a
        moment needed before they could begin, and the parts that made each one good could not reach the
        others.
      </p>
      <p>
        Logos 5 ends the choice. It is the environment, and the conversation in it decides in code, on
        every turn, which part of the work is yours — over the whole conversation, not only the latest
        message — with the map, the models, the displays, the documents and your writing beside it. A
        conversation that needs none of that is just a conversation.
      </p>

      <H2 id="setting">The one setting</H2>
      <p>
        What you choose now is how long a reply is — <strong>Concise</strong>, <strong>Balanced</strong> or{' '}
        <strong>Detailed</strong> — beside the box you type in. It changes length, never how carefully
        Socria thinks and never how readily it answers. Your{' '}
        <Link href="/docs/depth-personality">Conversation Style and your own instructions</Link> apply as
        before.
      </p>

      <H2 id="earlier">The models before it</H2>
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>What it was</th>
              <th>What became of it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><Link href="/docs/logos">Logos</Link></td>
              <td>The conversation beside a live map of your reasoning</td>
              <td>Superseded by Logos 2; the map is the Logic Map</td>
            </tr>
            <tr>
              <td><Link href="/docs/logos-2">Logos 2</Link></td>
              <td>Models the engine builds, which you move, edit and undo</td>
              <td>Archived on {ARCHIVE_DATE}; its models are in Artifacts</td>
            </tr>
            <tr>
              <td><Link href="/docs/logos-3">Logos 3</Link> and <Link href="/docs/logos-3-5">3.5</Link></td>
              <td>One workspace: solved models, 3D designs, everyday displays, documents</td>
              <td>Became Logos 4, then Logos 5</td>
            </tr>
            <tr>
              <td>Logos 4</td>
              <td>Point &amp; Ask, Instant Resume, Quick Capture, voice</td>
              <td>Became Logos 5</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>
      <p>
        Each has a page of its own under <em>Earlier Socria</em>, kept as it described the model at the
        time; <Link href="/docs/history">the history</Link> tells it in order, with why each one changed.
      </p>

      <H2 id="went">Where their conversations went</H2>
      <Callout tag="Nothing was deleted">
        <p>
          Every conversation from every earlier model opens in Logos 5, as an ordinary conversation on your
          Universal Map, with everything it held. You can carry on in any of them. Only the screens they
          were made on are gone.
        </p>
      </Callout>
    </Article>
  );
}
