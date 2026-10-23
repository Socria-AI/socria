// The Draft Space and the Writing Space, and grounding: the one surface built
// for prose, and how outside material enters the thinking. Checkable against
// lib/write/ (the document, the checks, the assist route's rules, Word in and
// out), lib/logos-attachments.ts and lib/logos-sources.ts.

import { Article, H2, Callout, Defs, Def } from '../Article';
import { docPage } from '../registry';

const page = docPage('drafts-grounding')!;
const sections = [
  { id: 'draft', heading: 'The Draft Space and the Writing Space' },
  { id: 'board', heading: 'Putting an argument together' },
  { id: 'writing', heading: 'Writing' },
  { id: 'actions', heading: 'Asking Socria about your writing' },
  { id: 'proofreading', heading: 'Proofreading' },
  { id: 'word', heading: 'Word, Markdown and PDF' },
  { id: 'mapdraft', heading: 'The map, while you write' },
  { id: 'grounding', heading: 'Grounding nodes in your material' },
  { id: 'research', heading: 'Research and sources' },
  { id: 'connections', heading: 'Connected accounts' },
];

export function DraftsGrounding() {
  return (
    <Article page={page} sections={sections}>
      <H2 id="draft">The Draft Space and the Writing Space</H2>
      <p>
        One document, two faces. The <strong>Draft Space</strong> is where an
        argument is put together before it is prose; the{' '}
        <strong>Writing Space</strong> is the page. On a wide screen they sit
        side by side. In Logos 5 the document is the first of a line of
        thinking&rsquo;s Artifacts — blank until you write, and ready to type
        into the moment it opens.
      </p>
      <p>
        <strong>Socria never writes into it.</strong> Writing without Socria
        needs nothing switched off: no model is asked anything while you
        write. The document is saved with the line of thinking a moment after
        you stop typing, a copy is kept in your browser in case a save never
        lands (and offered back if one did not), and versions are kept as you
        go — every ten minutes or so of writing, whenever you ask, and before
        anything replaces your words.
      </p>

      <H2 id="board">Putting an argument together</H2>
      <p>
        Brain-dump an idea and press Enter, or paste a list and every line
        becomes a card. Each card wears a kind — idea, claim, evidence,
        example, counterargument, conclusion or question — guessed from its
        words and changed with one tap. Sort cards into piles, each of which
        will become a paragraph; drag them, move them with the keyboard,
        merge them, and link them to a passage of your files, an idea on your
        Logic Map, or another card. Nothing is a template: a pile is any
        cards, in any order.
      </p>
      <p>
        The board says quietly what its shape shows — a claim with nothing
        behind it, evidence that supports nothing, an objection left
        unanswered, two cards saying the same thing — and moves nothing.{' '}
        <strong>Look for gaps</strong> asks Socria to read the reasoning for a
        missing step; what it finds is shown beside the cards, which stay as
        they are. <strong>Turn into an outline</strong> adds the board to the
        end of your writing — headings for named piles, the cards as an
        outline in your own words, linked evidence as citations. What is
        already written is never touched, and a card already in the writing
        is not added twice.
      </p>

      <H2 id="writing">Writing</H2>
      <p>
        A page with headings, quotations, bulleted and numbered lists, and
        bold, italic and underline — with the keys you already know, and
        Markdown&rsquo;s habits (<code>#</code>, <code>-</code>,{' '}
        <code>1.</code>, <code>&gt;</code>) at the start of a line. Paragraphs
        are moved by their handle or with Alt+Shift+↑/↓ (Ctrl+Shift on a Mac).
        Undo and redo are the document&rsquo;s own. A paragraph can cite a
        passage from your files; nothing else can make a citation.
      </p>

      <H2 id="actions">Asking Socria about your writing</H2>
      <p>Select some of your words and ask, or don&rsquo;t:</p>
      <Defs>
        <Def term="Ask">The words become what the conversation is about.</Def>
        <Def term="Explain">What they say, as a reader would take them.</Def>
        <Def term="Critique">Where they give way, and one question to test it.</Def>
        <Def term="Shorten · Improve">
          Small edits, each shown on its own with why — accept or reject them one at a time.
        </Def>
        <Def term="Develop">
          For a half-formed thought: questions only you can answer, and a shape with gaps for your words. Not the words.
        </Def>
        <Def term="Other wordings">Alternatives, only when you ask for them.</Def>
      </Defs>
      <Callout tag="Checked by code, not just asked for">
        <p>
          An edit is shown only if its words are really in your passage, and
          never if it would bring in a number, a citation, a quotation or an
          address you had not written — Socria does not supply sources or
          facts. Edits never apply themselves: each changes the page only
          when you accept it, and undo takes it back.
        </p>
      </Callout>

      <H2 id="proofreading">Proofreading</H2>
      <p>
        Rules that need no model run on your device as you write: spelling
        slips that are never words, doubled words, “could of”, a or an,
        capitals, spacing, very long sentences and paragraphs, the same
        sentence twice, and research or figures with nothing cited. Each
        finding says how sure it is — <em>definite</em>, <em>likely</em> (and
        when it would be right after all), or <em>a judgement call</em> — and
        only the definite and likely are underlined. Accept a fix, or dismiss
        the finding and it stays dismissed. Whether an argument follows needs
        a reading: <strong>Ask Socria to proofread</strong> sends the
        selection, the document, or the section you are in, and its findings
        come back marked as Socria&rsquo;s, located on your exact words.
        Quotations are someone else&rsquo;s words: only whether they are
        cited is checked.
      </p>

      <H2 id="word">Word, Markdown and PDF</H2>
      <p>
        Save a copy as a Word document (.docx) with Word&rsquo;s own heading,
        quotation and list styles, as Markdown, plain text or a web page, or
        print it to PDF. Open a Word document, Markdown, text or HTML file into
        the page: Word files are read in your browser and never leave it,
        with their headings, lists and emphasis; whatever cannot come in — a
        picture, a footnote, a table&rsquo;s grid — is said, not dropped
        silently.
      </p>

      <H2 id="mapdraft">The map, while you write</H2>
      <p>
        As you write, the map softly lights the nodes the paragraph you are in
        touches — computed by plain word overlap, no model call, so it costs
        nothing and cannot editorialize. From any node&rsquo;s menu,{' '}
        <strong>Add to draft</strong> makes it a card in your Draft Space,
        linked back to the node it came from.
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
        what the search returned. In the writing, a citation is always a
        passage you chose from your own files. If the deployment
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
