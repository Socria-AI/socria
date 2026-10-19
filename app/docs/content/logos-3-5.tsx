// What's new in Logos 3.5 — the everyday displays, the experiences, and a
// memory that keeps up.
//
// Logos 3.5 is Logos 3 updated in place (the same model in the picker, the same
// workspace). This page says what was added, shows the displays live — made
// from the words above each one by the product's own code
// (app/docs/DocsDisplays.tsx) — and says as plainly what it will not do and
// what is not there yet.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def, TableWrap } from '../Article';
import { DisplaysShowcase } from '../demos';
import type { DisplayExample } from '../DocsDisplays';
import { docPage } from '../registry';

const page = docPage('logos-3-5')!;
const sections = [
  { id: 'glance', heading: 'At a glance' },
  { id: 'displays', heading: 'Displays beside the map' },
  { id: 'live', heading: 'Try them here' },
  { id: 'asking', heading: 'Asking for one' },
  { id: 'words', heading: 'Made from your words' },
  { id: 'working', heading: 'Working in a display' },
  { id: 'math', heading: 'Graphs and number lines' },
  { id: 'experiences', heading: 'The experiences' },
  { id: 'documents', heading: 'Documents you attach' },
  { id: 'memory', heading: 'A memory that keeps up' },
  { id: 'not', heading: 'What it will not do' },
  { id: 'yet', heading: 'Not there yet' },
];

const EXAMPLES: DisplayExample[] = [
  {
    said: 'Chart my monthly spending: rent 1200, food 400, transport 150',
    caption: 'Your three numbers, exactly as written, as bars. Switch it to a pie, a table or a line above the chart.',
  },
  {
    said: 'Make a calendar of these deadlines.',
    before: 'Essay due Oct 20, quiz on Oct 22, trip Oct 30 – Nov 2, project Nov 3.',
    caption: 'The deadlines you wrote just before, on their days. Drag one to another day, or select it and use the arrow keys.',
  },
  {
    said: 'Visualize the interval x > 3',
    caption: 'Open at 3, running on to the right. Click the end to include it; drag it; add “x < −2” below and the union is written out.',
  },
  {
    said: 'Compare iPhone and Pixel on price, camera and battery',
    caption: 'The options and criteria you named, every criterion weighted evenly and every score empty — how each one does is yours to say.',
  },
  {
    said: 'Make a flowchart: wake up -> shower -> breakfast -> leave',
    caption: 'Your steps, joined in your order, with nothing added between them.',
  },
  {
    said: 'Pros and cons of moving to Denver. Pros: cheaper rent, mountains; cons: far from family, cold winters',
    caption: 'The option and not doing it, with what you listed for and against. Nothing is weighed or decided for you.',
  },
];

export function Logos35() {
  return (
    <Article page={page} sections={sections}>
      <Callout tag="Now Logos 4">
        Logos 3.5 has been updated to <strong>Logos 4</strong>: everything on this page, plus Point &amp;
        Ask (select a card, a bar, a cell or a passage and ask about that), Instant Resume (it opens where
        you left it), Quick Capture (a private inbox for a thought or a photo) and Voice (speak into the
        message box; nothing is sent by itself).
      </Callout>
      <p>
        Logos 3.5 is the next version of <Link href="/docs/logos-3">Logos 3</Link>, and it replaces it in
        the model menu: same workspace, same map, same models and designs, same room for a second person.
        What is new is everything you can now ask to have <em>beside</em> the map — charts, plans,
        calendars, comparisons, diagrams, number lines, decisions — made from your own words, worked in
        by hand or by saying so, and kept with the line of thinking.
      </p>

      <H2 id="glance">At a glance</H2>
      <ul>
        <li>
          <strong>Everyday displays.</strong> Ask for a chart, a checklist, a timeline, a calendar, a
          kanban board, a flowchart, a mind map, a decision tree, a Venn diagram, a comparison, an argument
          map or a number line, and it opens beside the map.
        </li>
        <li>
          <strong>Made from what you wrote.</strong> “Chart my spending: rent 1200, food 400” is read
          straight from your words — every number exactly as you typed it. Nothing you did not give is
          filled in.
        </li>
        <li>
          <strong>Graphs from the expression.</strong> “Graph y = x²” draws the curve you wrote, every
          time.
        </li>
        <li>
          <strong>Four experiences</strong> for harder thinking: a decision (Crossroads), a brain dump
          (Untangle), a shared question (Common Ground), and how your thinking changed (Time Machine).
        </li>
        <li>
          <strong>A memory that keeps up.</strong> When your thinking changes, what Socria remembers is
          shown changing too — and the change is yours to confirm or reject.
        </li>
        <li>
          <strong>Documents, read and cited.</strong> Attach a PDF, a Word file, slides or a spreadsheet:
          replies cite the passages they rely on, each citation is checked against its passage, and the
          document opens beside the map as it was read.
        </li>
        <li>
          <strong>A gallery</strong> of everything it can make, under <em>New…</em> in the display
          panel, each with things to say to start one.
        </li>
      </ul>

      <H2 id="displays">Displays beside the map</H2>
      <p>
        A display is something to look at and work in — not a model of anything. Each one is a single
        piece of state shown in several views; switching the view changes how it looks, never what is in
        it.
      </p>
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th>Display</th>
              <th>Views</th>
              <th>Good for</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Chart</strong></td>
              <td>table, bar, line, area, scatter, pie, histogram, heatmap</td>
              <td>Your own numbers — spending, grades, hours, sales. Totals, shares, scales and bins are computed.</td>
            </tr>
            <tr>
              <td><strong>Plan</strong></td>
              <td>timeline, calendar, board, checklist, storyboard, list</td>
              <td>Things to do or that happen — deadlines, a project, a trip, a video’s shots.</td>
            </tr>
            <tr>
              <td><strong>Diagram</strong></td>
              <td>concept map, mind map, hierarchy, flowchart, decision tree, outline</td>
              <td>How things connect — a process, an org chart, a choice and what follows from it.</td>
            </tr>
            <tr>
              <td><strong>Comparison</strong></td>
              <td>matrix, ranking, sensitivity</td>
              <td>Options against criteria, with weights that re-rank as you move them.</td>
            </tr>
            <tr>
              <td><strong>Venn diagram</strong></td>
              <td>circles, table</td>
              <td>Two or three sets and what they share.</td>
            </tr>
            <tr>
              <td><strong>Argument map</strong></td>
              <td>map, outline</td>
              <td>A thesis, its claims, evidence, counterarguments and rebuttals.</td>
            </tr>
            <tr>
              <td><strong>Number line</strong></td>
              <td>line, notation</td>
              <td>Inequalities and intervals, with interval notation and set-builder form.</td>
            </tr>
            <tr>
              <td><strong>Practice</strong></td>
              <td>market, accounting worksheet, labeling and recall</td>
              <td>Predict-then-reveal supply and demand; balance sheets and journal entries checked by standard rules; practice over a diagram or your own map.</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>

      <H2 id="live">Try them here</H2>
      <p>
        Each display below is made on this page by Logos 3.5’s own code from the words above it — the
        same reader and the same figures the workspace uses. Work in them: switch views, drag, tick,
        undo. Nothing here is saved.
      </p>
      <DisplaysShowcase items={EXAMPLES} />

      <H2 id="asking">Asking for one</H2>
      <p>Say it the way you would say it to a person. A few that work:</p>
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th>You say</th>
              <th>You get</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Chart my spending: rent 1200, food 400, transport 150</td><td>A bar chart of those numbers</td></tr>
            <tr><td>Make a pie chart of these expenses.</td><td>A pie of the numbers you gave just before</td></tr>
            <tr><td>Plot my revenue: Jan 10, Feb 12, Mar 15</td><td>A line chart, months along the bottom</td></tr>
            <tr><td>Histogram of these scores: 70, 85, 90, 65, 88</td><td>A histogram with its bins computed</td></tr>
            <tr><td>Make a checklist: buy milk, call mom, pay rent</td><td>A checklist, in your order</td></tr>
            <tr><td>Create a timeline: kickoff Jan 5, design Feb 1 – Feb 10, launch Mar 15</td><td>A timeline on those days, design lasting ten days</td></tr>
            <tr><td>Turn this map into a checklist</td><td>A checklist made from the map’s own ideas</td></tr>
            <tr><td>Make a mind map of my project: design, budget, team</td><td>Your project at the centre, your branches round it</td></tr>
            <tr><td>Create a decision tree for whether to launch now or wait</td><td>The decision and one branch per option</td></tr>
            <tr><td>Venn diagram: cats: fur, purr; dogs: fur, bark</td><td>Two circles, with fur in both</td></tr>
            <tr><td>Graph y = x^(2/3) from −8 to 8</td><td>That curve, on that window</td></tr>
            <tr><td>Show −2 ≤ x &lt; 5 or x = 7 on a number line</td><td>[−2, 5) ∪ {'{7}'}, drawn</td></tr>
          </tbody>
        </table>
      </TableWrap>
      <p>
        A question about a display (“how do I make a pie chart in Excel?”) is answered as a question, and
        “turn this into a timeline” still reshapes the map itself, as it always has.
      </p>

      <H2 id="words">Made from your words</H2>
      <p>
        When your words hold what the display needs, code reads them and no language model is asked to
        copy them — so no number is dropped, rounded or relabelled on the way. What that means in
        practice:
      </p>
      <Defs>
        <Def term="Your numbers, as written">
          “1,200”, “$1,200”, “40%”, “1.2k”, “−50” are read as you wrote them, and the chart says they are
          yours. Pasted tables (CSV, tab- or pipe-separated) work too.
        </Def>
        <Def term="Nothing given, nothing invented">
          “Plot revenue over six months” with no numbers opens an empty line chart with six rows to fill
          in, and says so. It does not make up revenue.
        </Def>
        <Def term="Drafted, and labelled">
          When your words do not hold the contents (“a mind map of photosynthesis”), Socria drafts one —
          marked as Socria’s, and checked by the display’s own rules before it is kept. A drafted chart
          whose numbers are not in what you wrote is marked as example numbers.
        </Def>
        <Def term="Judgments stay yours">
          A drafted comparison never arrives with scores or weights you did not give, a decision tree has
          no chances or payoffs you did not state, and nothing is decided for you.
        </Def>
      </Defs>
      <p>
        Each display says what it was made from — <em>Made from what you wrote</em>,{' '}
        <em>Made from your map</em>, <em>Made from a template</em> or <em>Drafted by Socria</em>.
      </p>

      <H2 id="working">Working in a display</H2>
      <ul>
        <li>
          <strong>By hand.</strong> Edit a cell, drag a bar or a calendar item, tick a checklist, move a
          card between columns, drag a number line’s end, re-weight a criterion. Every gesture also has a
          keyboard path.
        </li>
        <li>
          <strong>By saying so.</strong> “Set food to 450”, “show it as a pie chart”, “sort by amount
          descending”, “use 10 bins”, “show it as a calendar”, “exclude 3” — said in the chat, applied to
          the display you are in.
        </li>
        <li>
          <strong>Undo and redo</strong> every step, and a history of who changed what. Socria never
          overwrites what you wrote.
        </li>
        <li>
          <strong>Kept with the line of thinking.</strong> Displays are saved with the map, open beside
          it, go full screen, and in a shared line of thinking everyone in it works in the same ones.
        </li>
      </ul>

      <H2 id="math">Graphs and number lines</H2>
      <p>
        “Graph y = x²”, “plot sin(x) and cos(x)”, “sketch f(x) = 1/x on [−2, 2]”: the curve you wrote is
        drawn on the Plot lens — real values for powers like x<sup>2/3</sup> on both sides of zero, a
        cusp where there is one, the window you asked for. A curve with a letter whose value you have not
        given is not guessed at.
      </p>
      <p>
        An inequality or an interval — “x &gt; 3”, “−2 ≤ x &lt; 5”, “[2, 5)”, “|x − 1| &lt; 3”, “x ≠ 2” —
        is a set, and it goes on a <strong>number line</strong>: filled dots where an end is included,
        open ones where it is not, arrows where it runs on for ever, and its interval notation,
        inequality and set-builder form written out beside it. It is drawn as written; it does not solve
        “2x + 1 &gt; 7” for you.
      </p>

      <H2 id="experiences">The experiences</H2>
      <p>For thinking that is harder than a chart. Each starts from your own words and nothing else.</p>
      <Defs>
        <Def term="Crossroads">
          A decision. “Should I take the job in Austin or stay in Dallas?” — your options, what matters to
          you, pros and cons, assumptions, scenarios, and the questions you have not answered yet. Ratings
          and the decision are yours alone; a weighted score says it is not a verdict.
        </Def>
        <Def term="Untangle">
          A brain dump, separated into thoughts in your words, then sorted — tasks, ideas, problems,
          questions, goals, uncertainties — with the connections between them suggested, never assumed.
        </Def>
        <Def term="Common Ground">
          A question two or more people share. Each person writes their own perspective under their own
          name; what everyone agrees on is shown as shared, and Socria never speaks for anyone.
        </Def>
        <Def term="Time Machine">
          How your thinking on something changed — what it was, what it became, and the reasons you gave,
          from the history the workspace already keeps.
        </Def>
      </Defs>

      <H2 id="documents">Documents you attach</H2>
      <p>
        Attach a file with the paperclip, or drop it on the box you type in: PDF, Word, PowerPoint, Excel,
        OpenDocument, RTF, Markdown, CSV, HTML, LaTeX, a notebook or plain text. It is read once — headings,
        paragraphs, lists, tables, equations, captions, footnotes and speaker notes, in reading order —
        and what the reading could not do is said beside it rather than smoothed over.
      </p>
      <Defs>
        <Def term="Every passage has a key">
          [A3.12] is document A, page 3, passage 12. Replies cite the passages they rely on, right after
          what they say; a citation opens the document at that passage. Each one is checked by code
          against the passage it names — whether it holds the sentence’s numbers and words — and marked as
          said by the document, calculated from it, a reading of it, or not found in it (⚠).
        </Def>
        <Def term="Data, never instructions">
          What a document says is shown to Socria as the file’s content, never as instructions. Socria is
          told never to follow instructions written inside a file, and to say when a file contains them;
          text in a file cannot pass itself off as part of the conversation.
        </Def>
        <Def term="Kept apart">
          What the document says, what Socria calculated from its numbers, Socria’s own reading of it, and
          what it does not say are kept apart in the reply. If the document does not answer the question,
          the reply says so.
        </Def>
        <Def term="A look at the file">
          Preview a document under its chip in the conversation. A PDF shows its own pages, drawn in your
          browser from the file; anything else shows its reading, page by page, and says that is what it is.
        </Def>
        <Def term="Beside the map">
          The document opens as it was read: every passage with its key, how it was read and how sure the
          reading is, its tables and equations, an outline, and the checks the reading passed. Select a
          passage and ask about “this” — the question is about that passage.
        </Def>
        <Def term="Scans and photographs">
          A page with no text in it is read from its picture by a vision model — the first 12 pages when
          you attach it, the rest when you ask in the document view. Those passages are marked as read
          from the image; numbers the page’s own text does not confirm are marked; what could not be read
          says [illegible] and is never guessed.
        </Def>
        <Def term="Yours to correct">
          Correct a passage that was read wrongly, or mark it as read wrongly. Socria is told which
          passages you corrected and which you doubt; the original reading is kept, and taking a
          correction back restores it.
        </Def>
        <Def term="Tables and equations">
          A table can be charted — a chart display of its numbers that names the table and page they came
          from. An equation the engine can plot as a function of one variable can be sent to the
          conversation to work with.
        </Def>
      </Defs>
      <p>
        The full reading is kept in your browser and sent with the turns that use it; the server that
        reads the file keeps nothing. The conversation keeps a document’s text, up to 24,000 characters,
        like any attachment.
      </p>

      <H2 id="memory">A memory that keeps up</H2>
      <p>
        What Socria remembers about your beliefs, goals, decisions and assumptions used to be overwritten
        when they changed. Now a change is kept as a change:
      </p>
      <ul>
        <li>In the Mind Graph, what a new conversation changed is ringed, and what it affects is marked.</li>
        <li>A contradiction with something you said before is noticed and shown, not silently resolved.</li>
        <li>Open a memory to see how it changed over time — the old version is kept, not erased.</li>
        <li>Proposed updates are yours to confirm or reject.</li>
        <li>
          Core and Logos both read how your thinking has changed — a change you have not confirmed as
          Socria’s reading, to be checked with you, never as settled.
        </li>
      </ul>

      <H2 id="not">What it will not do</H2>
      <ul>
        <li>Make up your numbers, your dates, your sources or your data — an empty display says it is empty.</li>
        <li>Decide for you, rank your options for you, or give odds you did not give.</li>
        <li>Write a quiz about a topic out of nothing — practice is made from a diagram or your own map.</li>
        <li>Solve an inequality or an equation when you asked to see it — it draws what you wrote.</li>
      </ul>
      <Callout tag="Honest about what it made">
        If a display cannot be made, the reply says why in a sentence and nothing is added. It never says
        a display was made when it was not.
      </Callout>

      <H2 id="yet">Not there yet</H2>
      <p>Things people ask for that Logos 3.5 does not do yet, so you are not left guessing:</p>
      <ul>
        <li>Horizontal and stacked bar charts; a donut is drawn as a pie.</li>
        <li>Collapsing branches of a mind map or org chart.</li>
        <li>Filters and formulas in tables; nested checklist items; custom kanban columns.</li>
        <li>A day view in the calendar (month and week are there); images in storyboard frames.</li>
        <li>A coordinate plane to drag points on, and 2D geometry with measurements, as displays.</li>
        <li>
          Filling an empty chart by listing numbers in the chat — type them into its table, which shows
          under the chart until every row is filled.
        </li>
        <li>
          A document’s reading is kept in the browser that read it: on another device, or for someone
          else in a shared line of thinking, the document view says it is not there. A PDF is read up to
          150 pages at a time, and the pages past that are named, not read.
        </li>
        <li>Ideas on the map are not yet linked to the passages they came from.</li>
      </ul>
      <p>
        Everything else in Logos — the map, the models, Live 3D, depth and thinking together — is on the{' '}
        <Link href="/docs/logos-3">Logos 3 page</Link>, and works exactly as it says there.
      </p>
    </Article>
  );
}
