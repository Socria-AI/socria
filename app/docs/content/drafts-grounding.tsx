// Draft Space and grounding: the one generative surface, and how outside
// material enters the thinking. Checkable against lib/logos-draft.ts,
// lib/logos-attachments.ts, lib/logos-sources.ts.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def } from '../Article';
import { docPage } from '../registry';

const page = docPage('drafts-grounding')!;
const sections = [
  { id: 'draft', heading: 'Draft Space' },
  { id: 'actions', heading: 'The five selection actions' },
  { id: 'mapdraft', heading: 'The map, while you write' },
  { id: 'grounding', heading: 'Grounding nodes in your material' },
  { id: 'research', heading: 'Research and sources' },
  { id: 'connections', heading: 'Connected accounts' },
];

export function DraftsGrounding() {
  return (
    <Article page={page} sections={sections}>
      <H2 id="draft">Draft Space</H2>
      <p>
        Draft Space is where the person writes.{' '}
        <strong>Logos never writes into it.</strong> The page starts blank
        and stays yours; Logos responds beside it, and the one action that
        proposes wording at all — Refine — lands on the page only when you
        apply it.
      </p>
      <p>
        A draft belongs to its line of thinking: it is saved with the
        session (autosaving as you type), reopens with it, and sits beside
        the same map that produced the thinking it argues. Draft Space is a{' '}
        <Link href="/docs/socria-one">Socria One</Link> surface.
      </p>

      <H2 id="actions">The five selection actions</H2>
      <p>Select any passage of your draft and five actions appear:</p>
      <Defs>
        <Def term="Clarify">What are you actually trying to say?</Def>
        <Def term="Challenge">Where this gives way.</Def>
        <Def term="Trace">
          Which of your thinking — which real nodes on the map — this
          passage rests on.
        </Def>
        <Def term="Research">
          What is known about this; the only action that searches the web.
        </Def>
        <Def term="Refine">Same meaning, clearer.</Def>
      </Defs>
      <Callout tag="Only Refine produces prose — and it proposes">
        <p>
          Refine returns a proposal with notes on what changed, and it lands
          on the page only when you click <em>Use this</em> —{' '}
          <em>Keep mine</em> dismisses it untouched. Its hard limits: no
          strengthening, softening or extending your claims; no new ideas,
          examples or evidence; your voice preserved — and a passage that is
          already clear comes back unchanged.
        </p>
      </Callout>

      <H2 id="mapdraft">The map, while you write</H2>
      <p>
        As you write, the map softly lights the nodes your current passage
        rests on — computed by plain word overlap, no model call, so it
        costs nothing and cannot editorialize. From any node&rsquo;s menu,{' '}
        <strong>Hold in view</strong> pins that node (with its lineage)
        beside the draft — keeping the reasoning in sight without copying a
        word of it into the text.
      </p>

      <H2 id="grounding">Grounding nodes in your material</H2>
      <p>
        <strong>Add context</strong>, on any node&rsquo;s menu, attaches
        real material to that node — up to four pieces. Paste it, upload it,
        or bring a page from the web. Attaching triggers a fresh map
        extraction, because grounding can legitimately sharpen a node.
        Grounded nodes wear a small paperclip badge with the count.
      </p>
      <Callout tag="Context, not authority">
        <p>
          Grounded material may sharpen a label or justify marking a claim
          supported. It never creates beliefs, never resolves questions, and
          never outranks what you actually said. And material marked{' '}
          <em>Source material</em> — someone else&rsquo;s argument — can
          become a claim, counterpoint or source on the map, but never one
          of <em>your</em> beliefs, values or goals.
        </p>
      </Callout>

      <H2 id="research">Research and sources</H2>
      <p>
        Wherever Logos searches, only what was genuinely fetched is ever
        shown. In Explore and Research on a map node, the sources the
        reasoning actually drew on are marked cited, ahead of the rest of
        what the search returned; the draft&rsquo;s Research action lists
        what the search returned, shown for you to judge. If the deployment
        has no search provider configured, the thinking still happens — with
        zero sources, rather than invented ones. No fabricated studies, no
        imagined citations, and thin evidence is called thin.
      </p>

      <H2 id="connections">Connected accounts</H2>
      <p>
        Logos was built to read your own material through connected
        accounts — Google Drive (Docs and Sheets), Calendar, Gmail, and
        Notion — through a per-user, read-only OAuth flow with tokens
        encrypted at rest.{' '}
        <strong>These connectors currently ship dormant.</strong>{' '}
        Google&rsquo;s Drive and Gmail scopes are restricted APIs whose
        public approval requires a paid third-party security assessment;
        rather than gate the product on that, Socria ships with connections
        off, and Paste, Upload and Web cover the same ground with no setup.
        Operators can re-enable the flow through the environment
        configuration documented in the repository.
      </p>
    </Article>
  );
}
