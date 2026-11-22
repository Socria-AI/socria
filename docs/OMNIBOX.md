# One input, one workspace

Logos 6, November 2026. The Omnibox's reader is `lib/logos6/omnibox.ts`. The chat's work on the canvas is `lib/logos6/work.ts`, and what Core is told about the canvas is `lib/logos6/focus-context.ts`. All three are pure. They are wired into `components/LogosApp.tsx` (`omniCommand`, `openWork`, `placeWork`), `components/logos6/ThinkingCanvas.tsx` and `components/LogosComposer.tsx`. It builds on [One chat, one objective](OBJECTIVES.md) and [Mind Map 2.0](MIND-MAP-2.md).

Nobody has to decide first whether they need a chatbot, a mind map, a quiz or a document. They write what they are thinking or want done in the one box:
- what is theirs to keep is kept as theirs;
- what is Socria's to answer is answered;
- what changes their reasoning is proposed, for them to confirm.

The work builds up in one place: the Thinking Canvas of that chat.

## 1. The Omnibox

**No second router.** Everything is still read by what already reads it:
- questions and requests go through the conversation's routing (`lib/runtime/orchestrate.ts`);
- "quiz me on…" goes to the quiz (`lib/quiz/scope.ts`);
- "highlight the demand curve" goes to the picture (`lib/visual/intent.ts`);
- "make the chart blue" goes to the artifact (`lib/artifact-focus.ts`);
- the workspace's own commands go through `lib/logos5/commands.ts`;
- documents are brought in as before.

The Omnibox adds only the few things that were never a model's to do. It runs after the workspace's own commands and before anything goes to a model.

| What is typed | What happens | AI call |
|---|---|---|
| "I think AI makes students too dependent on answers." | **Kept as their thought:** a card of theirs on the Mind Map ("AI makes students too dependent on answers"), their turn in the conversation marked *Your thought · on the Mind Map*, and **no reply**. A note offers **Ask Socria about it**. | none |
| "Idea: …", "Note: …", "Maybe …", "I assume …" | kept the same way, as an idea, a note or an assumption | none |
| "Idea: price discrimination inside Monopoly", "add an idea called elasticity inside Microeconomics" | **an idea made inside the card named**, a line of structure as Structure draws it ("inside this": the card selected on the canvas). It is read only in the marked form ("Idea: …") or the add command, and only when the words after "inside" or "within" name one card plainly; otherwise they are the idea's own ("Idea: thinking inside the box"), and "I think … inside …" is a claim, whole. | none |
| "Note: …" with a card selected | added to that card's notes | none |
| "Connect this to my earlier argument" | "this" is the selected card, or else their newest. Their earlier argument is found among their own claims and ideas. A **suggested line** is drawn dashed and opened in the line inspector to confirm, change or dismiss. When more than one card fits, they are asked which (buttons, or "the second"). | none |
| "Link the survey to students outsourcing thinking as support" | the same, with the kind read from the words (support, tension, cause, dependency, example, part) | none |
| "Organize these ideas into a hierarchy" | **a structure proposed** from the lines already on the map (Structure's inference, `structureProposal`), shown on the canvas in Structure. **Apply this structure** writes the person's structure; **Not now** leaves everything as it was. | none |
| "Milestone: finish chapter 5", "Mark milestone finish chapter 5 as done" | a milestone of the chat's objective, added or ticked off by them | none |
| "Why does AI dependency happen?" | answered by Socria, streaming as always | as always |
| "Quiz me on monopoly pricing." | the adaptive quiz, in the workspace | as always |
| "Show me how derivatives work." | the visual route, as always | as always |
| "Highlight the demand curve." | done on the picture, as always | none |

**Careful about what it keeps without a reply.** A message is kept as a thought only when its words plainly offer a view: "I think…", "I believe…", "My argument is…", "Idea: …", "Maybe…". It is never kept this way when:
- Socria's last reply ended on a question (then it is their answer, and is answered);
- a quiz or a guess is waiting;
- files are attached;
- it holds a question mark or a request ("can you", "please", "explain", "help me", "let's", "should we", "…right?");
- it is more than two sentences;
- it is said about the conversation itself ("I think I get it", "I think you're right").

A bare statement with no opener still goes to Socria.

**Ideas are made here, and only here.** The Mind Map has no add field and no double-click to add. A new card's words, kind, what it hangs from and the card it sits inside are all said in the chat box: "Idea: …", "I think …", "I assume …", "add a question called …", "add a branch called cost to Budget", "… inside Microeconomics", "… inside this" (the card pressed on the canvas, which is "this", "that" and "it" in the chat box's commands). "Add as idea" (Alt+Enter) keeps whatever is typed as an idea, where it is switched on.

**Nothing silent.** While they type, one quiet line over the box says what Enter will do, for example *"↵ A thought — kept on your Mind Map as yours, with no reply"* or *"↵ Add “Elasticity” inside “Microeconomics”"* (a screen reader hears "On Enter:" first), with **Ask Socria instead**. It shows for a thought, an idea added in words, a note, a connection, a structure, a milestone or a quiz, and says nothing for an ordinary message. Consequential changes are only ever proposals: a suggested line, a proposed structure.

**One note at a time.** Over the box stands at most one note: a card to choose first ("Connect … to which?"), then an offer about the message just sent (a separate objective), then the word that a thought was kept. The kept note has one action, **Ask Socria about it**; "the Mind Map" in its words is the way to see the card. It goes as soon as they type again.

**Context it reads** (`OmniContext`):
- whether Socria's last reply asked them something (`replyAsked`, or the reply's thread note);
- whether a quiz or guess is waiting;
- attachments;
- the card selected on the canvas (from the visual bus);
- the map's cards.

## 2. The chat's work, on the canvas

The Thinking Canvas is where the chat's work lives together:
- ideas, explainable lines, structure (Ideas, Logic and Structure as ways of working);
- practice, artifacts and sources.

`workItemsOf` reads the work from where it already is:
- quizzes with their standing ("1/2 · missed Deadweight loss");
- the artifacts kept from replies and made in the workspace;
- the documents, images and notes brought in, each document once.

Each has a stable key: `o:<object id>`, `f:<document id>`, `a:<message>:<attachment>`.

- **This chat’s work** (*Work* on a phone), a button in the canvas’s tools row, lists them under it. Each item offers:
  - **Open:** in focus, in the artifact's own expanded view beside the board. A document opens as it was read. When it is closed, **the canvas comes back** as it was. It is the same quiz or artifact, so nothing is lost either way.
  - **Place on canvas:** a card that **stands for it**, a node whose `obj` is that object, with `origin: 'source'` for a source. It is one thing, never a copy. It can be connected, structured, annotated and asked about like any idea. Its kicker says what it is ("Quiz · 1/2 · in progress"), and its inspector has **Open the quiz**.
  - **Show card**, once it is placed.
- The map pass keeps a placed card and what it stands for (`keepPlaced` carries `obj` and `origin`).
- Images and notes have no workspace object to stand for, so they open (in Files) but are not placed.

The **Everything** view still shows the quiz and the artifacts live, beside the turns that made them, and a kept thought there reads *Your thought · on the Mind Map · no reply*. The Files and Artifacts views stay as the overview and the full-size editors. The canvas is where the work is done together, without moving anything between views.

## 3. Who decides what

| Socria does on its own | Socria proposes | Only the person does |
|---|---|---|
| read and index documents; keep sources, artifacts and quizzes with the chat; retrieve context; keep the workspace continuous | lines between cards (dashed, *Suggested*); a structure (*Proposed structure*); "What am I missing?" findings (the existing challenge engine) | confirm a line; apply a structure; merge or take off cards; decide; tick off a milestone; keep a thought |

- A suggested line is drawn dashed and called suggested until they confirm it. Core is told its status.
- Socria never ticks off a milestone. Core is told *"Only they tick one off — never say one is reached."*

## 4. What Core is told

Everything below is curated and cleaned on the server, never the whole graph.

- **The selected card or line** (`focusOf` in the browser, `sanitizeCanvasFocus` and `canvasFocusBlock` on the server):
  - for a card: its meaning, why it matters and notes (their words), Socria's earlier reading (labelled as such), tags, assumptions, sources, where it sits, what it stands for, and its lines, each with its why and status;
  - for a line: its ends, kind, why, what bears it out, and status.
  - So "What does this node mean?" and "Why are these connected?" are answered from what is stored. Where nothing is stored, Core says so. A suggested or read line is never called confirmed.
- **The objective and the chat's work** ([OBJECTIVES.md](OBJECTIVES.md)):
  - decisions, assumptions, open questions, sources, artifacts, quiz results and missed topics;
  - milestones;
  - **recent changes**: the map's own record, newest first, whose change each was. "Show me what changed" is answered from it.
- **Earlier turns** that bear on the message (`recallEarlier`).
- **A kept thought** in the history is labelled *"A thought of theirs, kept on their map; no reply was asked for"*, so it is never answered late or read as a question left hanging.

## 5. Persistence and compatibility

No schema change, and nothing migrated in bulk:
- a thought is a message with `via: 'thought'` (stored by `/api/conversations`, like `voice` and `quiz`);
- the card is an ordinary node with `hand: true`;
- a placed work card is a node with `obj` (and `origin: 'source'`), which the map model already had;
- milestones live on the objective (`map.objective.milestones`).

Older chats, maps, quizzes, artifacts and attachments read exactly as before. The test harness confirmed this after a reload, with an older chat untouched.

## 6. Validation

- `test/omnibox.test.mjs`, 96 checks:
  - thought capture, and the many things not captured: questions, requests, answers to Socria, files, words about the conversation, bare statements;
  - notes; connections, including clarification and picking an answer; organisation proposed and applied without copies; milestones;
  - work items, placement and reference survival through the map pass;
  - the Core focus for a card and a line, cleaning, and recent changes;
  - the wiring in the app, route and storage;
  - the simplification and the layout fixes of section 7;
  - ideas made only in the chat box, inside a card when one is named.
- `test/objective.test.mjs` (62), `test/mind-map.test.mjs` (76) and `test/onboarding-tips.test.mjs` (46) pass.
- **The twelve workflows in the real app** (Playwright, Clerk stubbed, a store that saves what is sent; a real quiz made the way the quiz suite makes one):
  1. a thought is kept on the map and marked in the conversation, with **no request to a model**;
  2. a question is answered, carrying the objective;
  3. the quiz is listed on the canvas with its standing, and "Quiz me on monopoly pricing." goes to the quiz;
  4. a thought is connected to the earlier argument: proposed as *Suggested*, opened, confirmed by the person;
  5. the hierarchy is proposed in Structure and applied, with cards 4 before and 4 after, and lines of meaning kept;
  6. the source is listed with the work and sent to Core;
  7. the quiz is opened in focus and closed again: the canvas comes back, and the quiz's state is byte-for-byte unchanged;
  8. a selected card reaches Core with its meaning and its three lines;
  9. the suggested line stays suggested until confirmed;
  10. after a reload, the thought, the confirmed line, the structure and the quiz card are all back, and the older chat is intact;
  11. with the model down (503), a thought is still kept and no request is made;
  12. the canvas holds cards, a work card and the work tray in one place.

  There were no page errors.

## 7. Simple by default

The chat stays in the middle and works like any chatbot. Everything else is there when it is needed, and not before. Every control below is still there, a press away; nothing useful was removed to look minimal. The reply-length picker (*Balanced*) stayed: one control with a clear job.

| Where | Before this pass | Now |
|---|---|---|
| Over the chatbox | an OBJECTIVE label, the goal, "read from how this chat began" and "What this chat holds" with every count, over two rows; on an empty chat, a hint line | one row that never wraps: *Working towards* the goal, and at most three counts, which open the work. Where the goal came from is its tooltip. Nothing over an empty chat: the new chat and the box already ask |
| Notes over the box | a kept-thought note, an offer and a card choice could stand together; the thought note had two buttons | one note at a time, the thought note with one action (section 1) |
| What Enter will do | an uppercase ON ENTER label | a quiet ↵ and the sentence |
| The Mind Map's bar | the mode described in words; five filter chips in Logic; Copy the outline and the keyboard help in Structure; the drag help in Ideas; Also drawn as | the ways of working; then only the **Show** choice in Logic, the chat's work, the zoom and **More** (other drawings, Copy the outline). Descriptions are tooltips. Help shows while the map is small, and stays for screen readers |
| Making a card | an add field on the canvas (and double-click to add there) as well as the chat box | the chat box only, which says everything about it, including the card it sits inside |
| A card's inspector | all fifteen of its fields at once | title, meaning, why it matters, explanation, connections, notes; **More details** for the rest, naming what is filled in |
| The chat's work | a pill floating at the canvas's foot | a button in the tools row, its list under it |
| A phone | the canvas ran under the chatbox, so the lower half of a card's sheet (notes, Ask, Take off) was hidden behind it and anything at the canvas's foot sat on the box; the guide's *Another hint* sat on "+ Add a file…" | the Mind Map stops where the box begins (the box's measured height, `--ls-foot`); a card's sheet takes the room it needs; the box's foot wraps |
| Laptop widths, 1000–1280px | in the page view, the controls at the end of the bar spilled over the view switch from 1240px down, and the chat's name shrank to nothing by 1024px | the end keeps its room, the bar tightens (the switch's spacing, the wordmark, the key beside Search; the mark and Search stay), and the name keeps at least about 100px |
| Tips | the + menu's tips could sit on the box's notes | they sit above the whole box, like the Make tip |

**A first-time user, with no tutorial.** Playwright on a desktop (1440×900), an iPhone 13 and an iPad Mini; an empty account, then a chat with work in it:
1. Socria opens on a new chat. The box asks what they are trying to work out, and there is nothing else to learn.
2. The first message is answered, and the objective is read from it: *Working towards Understand why students rely on AI so much*.
3. Typing "I think…" shows what Enter will do. Enter keeps the thought with no request to a model, and the note offers one action and goes when they type.
4. A question is answered as in any chat.
5. The Mind Map is one press away:
   - a card opens to its essentials (4 fields), and More details to the rest (13);
   - Logic's **Show** brings support forward;
   - **More** holds the outline and the other drawings, and goes on a press elsewhere.
6. In a chat with work, the counts open the work, and the quiz is one press from there.
7. On the phone nothing scrolls sideways, the canvas stops above the box, and a card's sheet reaches More details. The tablet is the same.

There were no page errors. The page view's bar was swept from 1440px to 980px with no overlap at any width.

## 8. Limits

- Thought capture is pattern-based and deliberately narrow. A view phrased without an opener goes to Socria. "Ask Socria instead" covers the opposite case.
- The kind of a proposed line is read from cue words, otherwise *relates*, for the person to set in the inspector.
- "Organize" proposes from the lines already on the map. Ideas with no lines between them get no automatic grouping; Socria can be asked in words. AI-proposed groupings are not built here.
- Socria does not propose milestones. They are the person's to add and tick off.
- Work opens in the existing expanded artifact view beside the board, with the canvas restored on close, not in an overlay drawn inside the canvas.
- On a phone the Mind Map shares the screen with the chatbox, so the space for cards is small while a long guide line or note stands over the box. A card's sheet then takes most of what is left.
- The first-time walkthrough ran with the model mocked. Answers, quizzes and naming were not judged for quality there.
- The Everything, Files and Artifacts views remain as the overview and full-size editors, for compatibility. The separate Ideas, Logic Map and Structure entries were already merged into the canvas ([MIND-MAP-2.md](MIND-MAP-2.md)).
- The quiz generation itself was mocked in the browser run. Its routing was verified there, and generation is covered by the quiz suites.
