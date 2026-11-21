# One chat, one objective

Logos 6, November 2026. The model and its rules are pure code in `lib/logos6/objective.ts`. The line over the chatbox is `components/logos6/ObjectiveLine.tsx` with `objective.css`. Core reads it through `app/api/logos/chat/route.ts`.

A Socria conversation is no longer only a record of questions and answers. It is where someone works towards something:
- "Master Calculus I";
- "Build SocriaUX";
- "Prepare for the board presentation".

The conversation is still the interface, and still the one container. Nothing here is a dashboard, a second workspace or a second memory. A chat now knows what it is for, Core keeps that in view, and the work that builds up in the chat is easy to see and return to.

## 1. Where the objective lives

The objective sits on the conversation's own map, as `ThinkingMap.objective`. The map is already the conversation's record:
- saved with it by `/api/conversations`, in the `map` jsonb column;
- cleaned on the server (`sanitizeMap`);
- synced between people thinking together, and kept in local storage for guests.

So the objective needed **no schema change and no migration**. A map without one is a map as before.

| Field | What it holds |
|---|---|
| `goal` | what they are working towards, in a few words (up to 100 characters) |
| `outcome` | the outcome they want, when they said one |
| `kind` | learn, understand, build, write, research, prepare, decide, solve, explore |
| `source` | `stated` (their words), `inferred` (read from how the chat began), `title` (an older chat's name) |
| `threads` | subjects that belong to it, read from the work or kept by them ("Keep it here") |
| `notes` | what they asked to keep in mind for it ("the exam is open-book") |
| `set`, `edited` | when |

`sanitizeObjective` clips and bounds everything, whatever arrives. The map pass never writes the objective: `keepPlaced` carries it over every pass, including the first map of a chat that has no cards yet.

## 2. How a chat gets its objective

There is no form and nothing is asked first.
- **An empty chat** shows one quiet line above the chatbox: *"One chat, one objective. Say what you want to work towards — Socria keeps it in view as the work builds up here."*
- **The first message establishes it** (`inferObjective`):
  - A goal they stated becomes the objective. "Help me prepare for the board presentation on Thursday" gives *Prepare for the board presentation*, and "My goal is to ship the SocriaUX beta" gives *Ship the SocriaUX beta*. The time, the "please" and the reasons are cut.
  - A question with no stated goal is read as understanding what it is about.
  - Nothing more is read than the words say.
- **After the first reply**, for accounts, the same small model call that names the chat may phrase the goal better. It is asked to do so only when the opening states or clearly implies one. It never replaces the person's own words (`refineGoal`).
- **The title** is still the topic, named as before (`titleFor`, `lib/logos5/title.ts`), and can still be renamed from the rail.

## 3. Changing it

- **In place:** press the goal in the line above the chatbox to edit the goal and, optionally, the outcome. From then on it is theirs (`source: stated`).
- **In words**, handled on the device, said back, and never sent to a model:
  - "Change the objective to passing the final", "Our goal is now to ship v2" and "New objective: …" all work.
  - "Keep in mind that the exam is open-book" keeps a note with the objective. It takes one sentence only, and the word "remember" is left alone because it belongs to Socria's memory of the person.
- Changing the objective keeps everything the chat already holds.

## 4. What the chat holds for it

`workOf` reads what the chat already has, from that chat only:
- the Thinking Canvas: decisions, assumptions not yet checked, open questions, settled ones, and the subjects (groups) within it;
- the sources brought in: documents, images, notes and the web pages read;
- the artifacts made, and each quiz's standing with the topics missed.

None of it is copied, so it can't go out of date, and it is there with no model at all.

**The line over the chatbox** (`ObjectiveLine`) shows the objective, where it came from, and the work in counts ("6 ideas · 1 decision · 2 open questions · 3 sources · 1 quiz"). **What this chat holds** opens the lists. Each list links to the view that has it (the Mind Map, Files or Artifacts), and the panel closes as it goes. It sits in the dock, so it is the same in every view. In a chat they can only read, it is read-only.

**The conversation list** names each chat's objective in the row's tooltip and in what a screen reader says.

## 5. What Core is told

Each turn, the browser sends the objective and the work (`body.objective`). The server re-sanitises it (`sanitizeObjectiveTurn`). Core reads it as one block of context, just before what it remembers about the person (`objectiveBlock`):
- the goal, the outcome, and what the chat holds;
- what to keep in mind;
- the rule: connect the turn to earlier work in this chat when that genuinely helps (a quiz mistake, a source, a decision, an open question), and never ask again for anything already stated. Several subjects can serve one objective. Never steer the person back to it, police the topic, or refuse what lies outside it.

**Earlier in this conversation** (`recallEarlier`, `recallBlock`): Core reads the most recent turns in full (24, or the runtime's cache-friendly window). From the turns older than that, the few that bear on this message are found by the meaningful words they share with it (and with the objective). Each is cut to its sentences that matter and given to Core as context, labelled by turn. So "what was the mistake I kept making with the chain rule?" finds the turn where it was explained, fifty messages back.

This reuses what exists:
- the person's memory and the Mind graph, unchanged;
- the documents, sent as before;
- artifacts and quizzes, which already reach Core every turn through `objects`.

The objective block names them; it does not repeat them.

## 6. A different objective

A message may start something else. That's detected in two ways:
- The **existing misfiled-message reader** (`readDrift`, `lib/topic-drift.ts`) now also reads the objective's goal.
- **`driftOf`** offers a separate chat when a message says it is unrelated ("unrelated, but…", "different topic"), or states a goal of its own that shares nothing with the objective, its subjects or its work.

It stays silent in these cases:
- the chat is too new (fewer than two messages from them);
- the message is in the same field as the objective (integrals within *Master Calculus I*);
- the subject was kept here before.

The offer is the existing one, beside the answer: *"That sounds like a separate objective — “Plan a weekend trip to Lisbon”. This chat is for “Pass the economics final”. Keep it here, or give it its own chat?"*
- **Keep it here** keeps the subject with this objective, and it is not offered again.
- **Start a new chat for it** moves that turn into a new chat, which then reads its own objective from it.

The message is answered where it was sent either way. Core is told not to tie it to the objective, and not to suggest a new chat itself. Nothing is ever split automatically. After three dismissals, the offer stops.

## 7. Chats from before objectives

Nothing is migrated in bulk and nothing is lost:
- An older chat reads its objective from how it began (`objectiveOf`), or else from its own name.
- An empty, untitled chat has none: nothing is made up.
- The objective is written to the chat's map the next time a message is sent there. Until then, nothing stored changes.
- Messages, artifacts, attachments, maps and titles are untouched.

## 8. Validation

- `test/objective.test.mjs`, 60 checks against the ten acceptance criteria:
  - inference on six phrasings, a question and empty input;
  - storage, cleaning of hostile input, and survival through map passes;
  - the Core block and its wiring in the route;
  - recall of a turn fifty messages back, and silence when nothing bears on the message;
  - the work read from canvas, sources, artifacts and a quiz;
  - five same-objective messages not flagged; two different objectives offered; "Keep it here";
  - restating in words; keep-in-mind; legacy chats; the empty-chat hint; the line and its read-only form; the rail.
- **In the real app** (the Playwright harness with Clerk stubbed and a conversations store that saves what is sent, so a reload reads it back):
  1. a chat from before objectives shows its objective read from its first message, with nothing stored;
  2. *What this chat holds* opens, and opens the Mind Map beside the board;
  3. the objective is changed in place, and saved with its outcome;
  4. the next message carries it to Core;
  5. "Change the objective to pass the economics final" changes it with no request to a model;
  6. "Keep in mind that the exam is open-book" keeps a note;
  7. "Unrelated, but help me plan a weekend trip to Lisbon" brings the offer, and Core is told; *Keep it here* keeps it as a subject;
  8. a reload reads it all back, with every message kept;
  9. a new chat shows the hint and no fields, and its first message establishes *Prepare for the board presentation*;
  10. the older chat is untouched by the new one.

  There were no page errors.

## 9. Limits

- Inference from the first message is deterministic, by patterns. A goal phrased unusually is read as the topic instead, until the model's phrasing (accounts only) or the person corrects it.
- Recall of earlier turns is by shared words. It finds what is said in the same words, not what is said in different ones (no embeddings).
- Recognising the same field uses the existing domain list in `lib/topic-drift.ts` (maths, code, writing, science, business, career, marketing, personal). Outside those fields, a related subject phrased in new words may be offered a separate chat. It is only an offer, and "Keep it here" settles it for good.
- Progress is shown as what the chat holds (decisions, settled questions, quiz results). There are no separate milestones to tick off, by design: the chat is not a project plan.
