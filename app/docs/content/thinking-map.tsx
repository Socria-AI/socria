// The map's full vocabulary: node types, relations, lenses, moves.
// Checkable against lib/logos.ts, lib/logos-layout.ts, lib/logos-explore.ts.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def, TableWrap } from '../Article';
import { docPage } from '../registry';

const page = docPage('thinking-map')!;
const sections = [
  { id: 'nodes', heading: 'Node types' },
  { id: 'edges', heading: 'Relationships' },
  { id: 'honesty', heading: 'How the map stays honest' },
  { id: 'lenses', heading: 'The lenses' },
  { id: 'moves', heading: 'The four moves' },
];

export function ThinkingMapDoc() {
  return (
    <Article page={page} sections={sections}>
      <p>
        The Thinking Map is a typed graph of your reasoning, extracted fresh
        from the conversation on every turn. Everything on it is something{' '}
        <em>you</em> said or clearly hold — labeled in your own language, two
        to eight words a node.
      </p>

      <H2 id="nodes">Node types</H2>
      <p>
        Thirty types, grouped by the kind of thinking they belong to. A
        conversation uses the handful that fit it:
      </p>
      <TableWrap>
        <table>
          <thead>
            <tr><th>Group</th><th>Types</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Deciding</strong></td>
              <td>goal · decision · value · belief · idea · assumption · evidence · question · tension · consequence</td>
            </tr>
            <tr>
              <td><strong>Arguing &amp; researching</strong></td>
              <td>claim · counterpoint · source</td>
            </tr>
            <tr>
              <td><strong>Learning</strong></td>
              <td>concept · misconception</td>
            </tr>
            <tr>
              <td><strong>Making</strong></td>
              <td>theme · character</td>
            </tr>
            <tr>
              <td><strong>Planning</strong></td>
              <td>constraint · milestone</td>
            </tr>
            <tr>
              <td><strong>Mathematics</strong></td>
              <td>given · unknown · equation · definition · transformation · theorem · step · inference · verification · result · error</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>
      <p>
        A few distinctions carry weight: a <strong>belief</strong> is something
        you hold; an <strong>assumption</strong> is taken as true but
        unexamined. A <strong>source</strong> is the container, not the fact —
        the study you cited, separate from the evidence inside it. And an{' '}
        <strong>error</strong> in math is kept and repaired in place, never
        deleted — mistakes are part of the record of the work.
      </p>
      <p>
        Nodes carry status (<code>open</code> → <code>supported</code> /{' '}
        <code>resolved</code> / <code>revised</code>), optional LaTeX, an
        optional note, and a &ldquo;+N folded in&rdquo; badge listing wordings
        that were merged into them. Maps hold up to 16 nodes and 22 edges —
        26 and 34 for math, because a solution chain is long by nature. On
        the free tier the map stops taking on <em>new</em> nodes at four;{' '}
        <Link href="/docs/socria-one">Socria One</Link> lets it keep growing,
        and nothing already drawn is ever taken back.
      </p>

      <H2 id="edges">Relationships</H2>
      <p>Eleven edge types, each read in plain language on the map itself:</p>
      <Defs>
        <Def term={<code>supports</code>}>evidence or reasons holding a node up</Def>
        <Def term={<code>conflicts</code>}>two things pulling against each other</Def>
        <Def term={<code>depends</code>}>one thing needing another to hold</Def>
        <Def term={<code>relates</code>}>a connection that matters but fits no sharper type</Def>
        <Def term={<code>leads_to</code>}>consequence; one thing producing another</Def>
        <Def term={<code>revises</code>}>a changed mind — the new thought pointing at the old one</Def>
        <Def term={<code>precedes</code>}>chronology; comes before</Def>
        <Def term={<code>part_of</code>}>structure; sits inside</Def>
        <Def term={<code>transforms_to</code>}>math: one expression becoming the next, the operation written on the edge</Def>
        <Def term={<code>implies</code>}>logic: A logically implies B, the spine of proofs</Def>
        <Def term={<code>justifies</code>}>a theorem or definition licensing a step</Def>
      </Defs>
      <p>
        Edges have strength — weak, normal, strong. A relationship that stops
        carrying weight is <em>weakened, not deleted</em>; strong is reserved
        for connections the whole argument rests on.
      </p>

      <H2 id="honesty">How the map stays honest</H2>
      <p>
        Before adding anything, each extraction is required to reorganize:
        merge duplicate ideas (keeping the absorbed wording visible), mark a
        supported claim supported, mark an answered question resolved — kept
        on the map, never silently deleted — and when you change your mind,
        create the new thought and point it at the old one with{' '}
        <code>revises</code>, so the history of the reasoning stays legible.
      </p>
      <Callout tag="The rule underneath">
        <p>
          The extractor may never mark something resolved, supported, or
          revised that <em>you</em> have not actually resolved, supported, or
          revised. The map records your reasoning; it does not advance it.
        </p>
      </Callout>

      <H2 id="lenses">The lenses</H2>
      <p>
        One map, up to seven readings of it. Lenses appear only when the map
        has something for them to show:
      </p>
      <TableWrap>
        <table>
          <thead>
            <tr><th>Lens</th><th>Reads</th><th>Appears when</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>Graph</strong></td><td>everything at once — a live force-directed layout that settles as you watch</td><td>the map has any node</td></tr>
            <tr><td><strong>Structure</strong></td><td>what rests on what, as a layered tree</td><td>more than one node</td></tr>
            <tr><td><strong>Tensions</strong></td><td>each conflict as an opposing pair, facing each other</td><td>a conflict, tension or counterpoint exists</td></tr>
            <tr><td><strong>Evidence</strong></td><td>claims in columns with their actual support beneath</td><td>evidence or sources exist</td></tr>
            <tr><td><strong>Solution</strong></td><td>the worked chain, step by step, operations written beside the arrows</td><td>math, with a chain to follow</td></tr>
            <tr><td><strong>Plot</strong></td><td>the functions on the map, graphed</td><td>math, with something plottable</td></tr>
            <tr><td><strong>Board</strong></td><td>the work laid out by hand — see <Link href="/docs/mathematics">Mathematics</Link></td><td>math, with any node</td></tr>
          </tbody>
        </table>
      </TableWrap>
      <p>
        Math work leads with the Solution lens automatically — until you pick
        a lens by hand, after which the choice is yours and stays yours. On
        the free tier only the map&rsquo;s lead lens is open — Solution for
        math work, Graph otherwise; the other readings are{' '}
        <Link href="/docs/socria-one">Socria One</Link>&rsquo;s.
      </p>

      <H2 id="moves">The four moves</H2>
      <p>
        Click any node and a menu opens: four ways to act on it, all of which
        stop short of resolving it for you. Each returns the same anatomy — a
        concept, a framing (a frame, never a conclusion), a connection back to
        your own words, and one question only you can answer — plus its own
        specialty:
      </p>
      <Defs>
        <Def term="Explore">
          What this idea is, and what it isn&rsquo;t. Searches the web for
          conceptual context; research informs the frame, never the decision.
        </Def>
        <Def term="Challenge">
          Where this would break: up to four pressure points, each a condition
          to test rather than a criticism. It steelmans the other side and is
          forbidden from being contrarian for its own sake.
        </Def>
        <Def term="Research">
          What the evidence actually says, from a live web search. Sources it
          actually cited are marked; disagreement is reported as disagreement,
          and thin evidence is called thin.
        </Def>
        <Def term="Trace">
          Where this came from: verbatim quotes from the transcript. The model
          only chooses <em>which</em> moments — the quote text is sliced from
          the real transcript by the server, so a fabricated quote is
          impossible.
        </Def>
      </Defs>
      <p>
        The menu also offers <strong>Add context</strong> (ground the node in
        your own material) and, while a draft is open, <strong>Hold in
        view</strong>. Each node keeps one conversation thread across all four
        moves — switching from Explore to Challenge is a change of lens, not a
        new conversation — and anything you type there is folded back into the
        session so the map can use it.
      </p>
      <Callout tag="If no sources appear">
        <p>
          Explore and Research search the live web only when the deployment
          has a search provider configured. Without one they still produce the
          framing and the question — with zero sources, rather than inventing
          citations.
        </p>
      </Callout>
    </Article>
  );
}
