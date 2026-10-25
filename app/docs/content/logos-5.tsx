// Logos 5 — the one Socria. Checkable against docs/LOGOS-5.md (the screen),
// docs/LOGOS-5-RUNTIME.md (what happens on a turn, at the level this page
// says it), lib/logos5/views.ts (the four views and Split View),
// lib/inline-ui.ts (the six interactive elements), lib/runtime/replay.ts
// (Core 4's allocator over the conversation) and lib/entitlements.ts (every
// count on this page).
//
// PUBLIC LEVEL ONLY. What a person can see and rely on — never the model
// behind a call, a threshold, a prompt, or how anything is kept safe. The
// internal account is app/dev/architecture.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def } from '../Article';
import { LineOfThinking, OneTurn } from '../Diagrams';
import { docPage } from '../registry';
import { PLANS } from '@/lib/entitlements';

const page = docPage('logos-5')!;
const FREE = PLANS.free;
const ONE = PLANS.one;
const sections = [
  { id: 'what', heading: 'What it is' },
  { id: 'home', heading: 'Home: the Universal Map' },
  { id: 'views', heading: 'A line of thinking, in four views' },
  { id: 'replies', heading: 'Replies that turn interactive' },
  { id: 'turn', heading: 'What happens when you send a message' },
  { id: 'yours', heading: 'Which part of the work is yours' },
  { id: 'checked', heading: 'What is checked' },
  { id: 'study', heading: 'Studying from your files' },
  { id: 'write', heading: 'Write' },
  { id: 'memory', heading: 'Memory' },
  { id: 'settings', heading: 'Settings, voice and themes' },
  { id: 'plans', heading: 'Plans and access' },
  { id: 'limits', heading: 'What it does not do' },
];

export function Logos5() {
  return (
    <Article page={page} sections={sections}>
      <H2 id="what">What it is</H2>
      <p>
        Logos 5 is Socria. Since 24 October 2026 it is the only model: one place to think something
        through, study, write, research, build a model of something or make a picture of it — a calm
        conversation that grows a workspace beside it when there is something to show, and never a graph
        forced onto a chat.
      </p>
      <p>
        It is not new machinery so much as the earlier models put together. The conversation is the one
        Logos has always had; the decision about which part of the work is yours is{' '}
        <Link href="/docs/core-4">Core 4</Link>&rsquo;s, running inside it; the map, the models, the 3D
        designs, the everyday displays and the documents are the ones{' '}
        <Link href="/docs/logos-2">Logos 2</Link>, <Link href="/docs/logos-3">Logos 3</Link> and{' '}
        <Link href="/docs/logos-3-5">Logos 3.5</Link> built. <Link href="/docs/history">The history</Link>{' '}
        says which came from where. Every conversation you had with any of them opens here.
      </p>

      <H2 id="home">Home: the Universal Map</H2>
      <p>
        You arrive on the <strong>Universal Map</strong>: every conversation you have had, on one map. A
        long piece of work is a hub; a quick question is a small dot beside it. Read it as{' '}
        <em>Today</em> (exactly what was begun today, nothing earlier), <em>This week</em>,{' '}
        <em>This month</em> or <em>All time</em>; your Projects sit on it as places of their own, and a
        conversation can be moved into one from its card. Everything begins from the map&rsquo;s box: type,
        or drop files on it.
      </p>
      <p>
        A conversation is named from its first message, and once it has a subject, after the subject
        itself — never over a name you gave it. Search (<kbd>⌘K</kbd> or <kbd>Ctrl K</kbd>, from anywhere)
        finds every line of thinking, what was said in it, your documents and their passages, what was
        made, and the ideas on its map, and opens a result where it lives.
      </p>

      <H2 id="views">A line of thinking, in four views</H2>
      <LineOfThinking />
      <Defs>
        <Def term="Chat">
          Where a line of thinking opens, and where talk stays. Every reply can be stopped, retried, copied
          and replied to; what you sent can be edited.
        </Def>
        <Def term="Content">
          The documents, notes and pictures you brought, as cards you can arrange and stack. A document
          opens as Socria read it, with the topics it was sorted into.
        </Def>
        <Def term="Artifacts">
          Everything made: your <Link href="/docs/drafts-grounding">writing</Link>, models and their
          pictures, plots, designs in 3D, charts, plans, comparisons, practice.
        </Def>
        <Def term="Logic Map">
          The <Link href="/docs/thinking-map">Thinking Map</Link> of the conversation — your claims,
          assumptions, tensions and evidence. It is drawn when you ask for structure, while you are looking
          at it, and now and then as a conversation grows; open it on a map that is behind and it catches
          up.
        </Def>
      </Defs>
      <p>
        The view moves only when what you asked for lives somewhere else. A question stays in Chat. A file
        is read into Content in the background, and the turn says so — the screen does not move. Something
        you asked to be made opens Artifacts; structure you asked for opens the Logic Map. On a wide screen
        the conversation stays beside either, so the reply is read next to what it made.{' '}
        <strong>Split View</strong> docks one more panel beside whichever view is open — a plot, a model, a
        design, a display, the map, its trace, or your memory. A phone shows one thing at a time.
      </p>

      <H2 id="replies">Replies that turn interactive</H2>
      <p>
        A reply is plain conversation, and most stay that way. Where it genuinely helps, a part of one
        becomes something you can use in place:
      </p>
      <Defs>
        <Def term="A chart">of amounts you gave, or that a source this turn carried — bar, line or pie.</Def>
        <Def term="A slider">for a quantity that moves with something you can vary; it computes in your browser.</Def>
        <Def term="A comparison">when options are set against each other.</Def>
        <Def term="Folded reasoning">the steps of a check, open when you want them.</Def>
        <Def term="Choices">to tap, for an open request for help — the choice you tap is simply your next message.</Def>
        <Def term="A draft">for practical writing you handed over, edited in place.</Def>
      </Defs>
      <p>
        Never on a hello, a joke or something personal; never more than two in a reply; never reasoning that
        is yours to do. A chart is drawn only from numbers you gave or a source carried — anything else is
        said in words, or drawn plainly labelled as an example. What you do with one (a slider moved, a
        choice tapped, a draft edited) is kept with the message, and a chart or comparison can be opened in
        Artifacts as a real display you can keep working on.
      </p>

      <H2 id="turn">What happens when you send a message</H2>
      <OneTurn />
      <p>
        Before anything is written, your message is read — in code, not by asking a model about you. What
        kind of exchange is this: a greeting, a joke, something personal, a brainstorm, pushback, or work?
        Which view does it need? Which parts of the work are yours to do? A hello is answered as a hello,
        not as a task, and nobody is asked what they would like to work on today.
      </p>

      <H2 id="yours">Which part of the work is yours</H2>
      <p>
        This is <Link href="/docs/core-4">Core 4</Link>&rsquo;s decision, carried whole into Logos 5, and it
        is made over the whole conversation rather than the latest message — so something you said twenty
        messages ago still holds.
      </p>
      <ul>
        <li>
          <strong>Socria does the mechanical work.</strong> Calculations (computed, never recalled),
          formatting, looking things up, explaining what is established — directly.
        </li>
        <li>
          <strong>Your decisions stay yours.</strong> Socria lays out what a decision rests on and, asked,
          says what it would weigh; &ldquo;you decide&rdquo; gets its view, plainly marked as a view, with
          what would change it. The choice is still yours.
        </li>
        <li>
          <strong>So does the substance of your writing.</strong> Structure, critique, every mechanical part
          and sharper versions of your sentences — not a finished essay from nothing. &ldquo;Just write the
          whole essay&rdquo; gets everything but the premise and the ideas. A practical piece — an email to a
          landlord — is simply written.
        </li>
        <li>
          <strong>Something is held back only on your own words.</strong> &ldquo;I want to work these out
          myself&rdquo;, &ldquo;don&rsquo;t tell me the answer&rdquo;, a Project&rsquo;s &ldquo;hints
          only&rdquo;, work you said is graded. Never on a guess about you. When it happens Socria says so
          once, says what you can have instead, and you can always simply ask for it.
        </li>
        <li>
          <strong>Practising has a floor.</strong> A wrong attempt still hears that it is wrong, and where;
          after repeated attempts on the same thing, Socria works it through fully and the next one is yours
          again.
        </li>
        <li>
          <strong>Harm comes first.</strong> In an emergency every one of these is set aside for plain,
          direct help.
        </li>
      </ul>
      <p>
        The <Link href="/docs/mathematics">Answer Guard</Link> is still there for mathematics you are
        learning, switched on by you, with &ldquo;Show solution&rdquo; always one press away.
      </p>

      <H2 id="checked">What is checked</H2>
      <ul>
        <li>
          <strong>Mathematics is computed.</strong> A derivative, integral, limit, root or identity you ask
          about is worked out by the engine rather than recalled, and your own steps are checked against it. Push back on an answer and Socria
          checks again: it owns a real mistake and does not give way to insistence.
        </li>
        <li>
          <strong>Citations must point at something real.</strong> A reply may cite only the passages of
          your documents and the sources the turn actually had; one that names anything else is removed as
          the reply streams.
        </li>
        <li>
          <strong>Claims of fact are held to the evidence.</strong> When sources disagree, the reply says so.
          When nothing settles a claim, it says that instead. Ordinary reasoning, brainstorming and creative
          work are not policed; facts are.
        </li>
      </ul>
      <Callout tag="What this does not mean">
        <p>
          None of this makes Socria incapable of being wrong. The checks remove what can be shown to be
          invented and correct what can be computed; a model can still misread you, or be wrong about
          something nothing on hand can check. When it matters, the sources and the working are there for
          you to look at.
        </p>
      </Callout>

      <H2 id="study">Studying from your files</H2>
      <p>
        Drop notes, slides or an exam review on the map&rsquo;s box and say what for. Socria sorts them into
        topics in their own words — every quote the file&rsquo;s own, with its page — foundations first,
        with one marked as the place to start. Practice is made only when you ask for it (journal entries
        for bookkeeping, fill-in-the-blank cut from the files&rsquo; own sentences for anything else), and
        checked exactly when you submit: each line right or wrong, and each gap with why and its page.
        Ask why, explain it simply, or challenge me, and the conversation picks the topic up.
      </p>

      <H2 id="write">Write</H2>
      <p>
        Your writing is one of a line of thinking&rsquo;s Artifacts, opened only when you want it: a word
        processor with headings, fonts, colours, tables, pictures, page layout, find and replace, versions,
        and Word, PDF, Markdown, text and web-page export. <strong>Socria never writes into it.</strong>{' '}
        Ask, and one panel offers <em>Check</em> (spelling, grammar, clarity and whether research is cited),{' '}
        <em>Improve</em> (clearer, shorter, other wordings — each edit shown on your words and applied only
        if you accept it) and <em>Think it through</em> (questions to develop it, where it gives way, and how
        it is organised). The full account is on <Link href="/docs/drafts-grounding">Write, Notes &amp;
        grounding</Link>.
      </p>

      <H2 id="memory">Memory</H2>
      <p>
        Signed in, Socria remembers what it learns about how you think across conversations, and shows it
        to you as a map of its own — what it holds, what changed and what is waiting for you to look at.
        Each memory says where it came from: <em>in your words</em>, <em>from your file</em>,{' '}
        <em>from a source</em>, or <em>Socria&rsquo;s reading</em>. Something is recorded as yours only if
        you actually said it; a file you attached is never taken as a statement about you; and a reading of
        Socria&rsquo;s waits for a second conversation before it counts. Press <em>That&rsquo;s right</em> on
        a memory and it is confirmed; edit one and your words are kept from then on. Say &ldquo;off the
        record&rdquo; and nothing more of that conversation is remembered until you say it can be; a
        conversation about something sensitive — a diagnosis, a divorce, a debt — is remembered only inside
        itself.
      </p>
      <p>
        The free plan carries {FREE.memoryEntries} things about you between conversations;{' '}
        <Link href="/docs/socria-one">Socria One</Link> carries {ONE.memoryEntries}. It is one store either
        way — the plan sets how much of it travels.
      </p>

      <H2 id="settings">Settings, voice and themes</H2>
      <p>
        There is one setting on a reply: <strong>Concise</strong>, <strong>Balanced</strong> or{' '}
        <strong>Detailed</strong>. It is how long, never how carefully — no setting changes how readily an
        answer is given. Your <Link href="/docs/depth-personality">Conversation Style</Link> and your own
        instructions apply as they always have. Hold the microphone to talk; let go and your words land in
        the box, never sent by themselves. Socria reads in Paper by default, or in White, Dark, or{' '}
        <em>Celestial</em>, where the Universal Map is a star chart.
      </p>

      <H2 id="plans">Plans and access</H2>
      <p>
        Logos 5 needs a free account; signed out, you are asked to make one. On the free plan it holds{' '}
        {FREE.counters.chats} new lines of thinking a calendar month and {FREE.counters.messages} messages a
        day; going back to a line of thinking you have begun costs only its messages, and reaching either
        count leaves everything you started open. <Link href="/docs/socria-one">Socria One</Link> has no
        daily count. A line of thinking or a Project can be shared by invitation, by link or by code; on the
        free plan, one chat at a time.
      </p>

      <H2 id="limits">What it does not do</H2>
      <ul>
        <li>It does not decide for you, and it does not write the substance of your work for you.</li>
        <li>It does not invent a source, a citation, a figure or a memory — and says so when it has none.</li>
        <li>It does not read your mind: what it cannot tell from your words it leaves alone.</li>
        <li>
          It reads the room in English best. In another language the conversation is the same; the readings
          that shape a turn are fewer.
        </li>
        <li>
          It has not been studied with the people who use it. What is on this page is what the product does;
          whether it makes thinking better is a question it has not yet been asked in a study.
        </li>
      </ul>
    </Article>
  );
}
