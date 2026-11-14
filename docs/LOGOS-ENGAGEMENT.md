# Conversational engagement, as a dimension of Cognitive Allocation

Cognitive Allocation decides, each turn, who does the thinking and which move helps. This adds one more reading to it, made the same way (in code, from the person's words and the transcript, with no model call): **how the reply meets their thinking**. That is a strategy, how strongly the reply invites more, and what it does to the conversation.

It is not a separate engine, mode or pass. It is a field of the allocation (`RuntimeAllocation.engagement`), computed inside `allocate()` and rendered as at most one line of the allocation's own block.

**Status.** Built, tested in code and through the real route, and switched **off in production** by default (`LOGOS_ENGAGEMENT`, §7). What has been checked is what the product decides and what the reply model is told. What a live model writes with it, and whether people take part more willingly, have **not** been measured (§8.4, §9).

> Nothing here shows that Socria is more enjoyable to talk to. The evaluation below is of decisions and instructions, on conversations we scripted. People's own conversations are the only test of the claim, and §9 says how to run it without counting messages.

---

## 1. What was audited

The brief asked for nine things to be read in the code before anything was changed. This is where each lives.

| Question | Where | What it does |
|---|---|---|
| How Cognitive Allocation operates | `lib/runtime/allocation.ts` `allocate()`, `lib/cognition/assist.ts` `chooseAssist`, `lib/runtime/replay.ts`, `lib/core4/allocation.ts` | Per turn, in code: the split (who does the reasoning, the judgment, the making), ownership, and one move with a question budget of 0 or 1. Core 4's allocator is replayed over the kept conversation and reconciled with the move, unless `LOGOS_ALLOCATION=lite`. Rendered as the "This turn" block that follows the history. Nothing is stored. |
| How intent is inferred | `lib/runtime/orchestrate.ts` `routeTurn`, `lib/cognition/register.ts` `readExchange`, `lib/core4/signals.ts` `readSignals`, `lib/runtime/state.ts` `readTurnState` | Four readers, all code. The register sorts a turn into eight kinds of exchange (social, playful, personal, brainstorm, discussion, disagreement, conversation, task) with a feeling they named, joking, and manner. Signals are things they said in so many words: vent, "just tell me", "stop asking", frustration, learning, a short close, safety. |
| Reasoning depth | `lib/model-router.ts` `levelOf` | light, standard or deep: which model and how much effort. Talk of 80 characters or fewer is light. |
| Response complexity | `lib/runtime/presentation.ts` `planPresentation`, `lib/runtime/behavior.ts` `replyCeiling`, MR's ceiling | The reply's shape (open, deeper, layer, understand, practical), the inline elements on offer, and a token ceiling from the length setting (480, 700, 1200). |
| Tone and personality | `lib/runtime/behavior.ts` `LOGOS5_CORE` (READ THE ROOM, QUESTIONS, ABOUT YOU), `allocation.ts` `EXCHANGE_LINE` and the manner line, `lib/conversation-style.ts` | The cached core says who Socria is. Each kind of exchange gets one line naming what a help desk would do in its place and ruling it out. |
| How Socratic questioning is triggered | Core 4's withholding and the Answer Guard, the split (`reasoning: scaffold \| human`), `chooseAssist` (ask, challenge, verify, construct), `lib/runtime/explain.ts` | Something is kept with the person when the work is theirs; on learning turns the explanation engine plans one closing question (a prediction, a check, saying it back, a recall). Always inside the budget of one. |
| How history influences replies | `lib/runtime/orchestrate.ts` `historyStart`, `replay.ts`, the map's open questions, MR's ledger | The last 16 to 31 messages go to the model verbatim; older ones are dropped, and nothing is summarised. Core 4's state (question streak and density, attempts, a standing "just tell me") is rebuilt from the kept conversation every turn. |
| How MR contributes to continuity | `lib/mr/` | Typed, scoped, expiring controls that narrow the move: "stop asking" removes every question, "just tell me" closes the budget for a while, two answers that did not advance close it for three turns. Within the conversation; across conversations only with consent. |
| Ask or answer | `lib/core4/budget.ts` `budgetFrom`, the core's QUESTIONS rule, `lib/core4/stream-gate.ts` | The budget is 0 after two asking replies in a row, after one when half the recent replies asked, on diminishing returns, and on their words. The core allows a question "only when its answer would change what you say next". The gate holds every trailing question and ships it only inside the budget. |
| Anti-loop and anti-sycophancy | the budget's streak and density rules, MR's `observed.unproductive_questions`, `explain.ts` (never a second closing question while one waits), the gate (closing offers always dropped, a sycophantic opener stripped, `LOGOS_TRIM` filler), the core ("you never flatter"), the safety reader | Each removes something a habit adds. |

### What they add up to at the end of a reply

Read together, every instruction that touches the end of a reply closes it.

- The core: "most replies end on a statement", and a question "never as a habit, a sign-off or a way to hand the turn back".
- The question rule is epistemic and nothing else: ask "only when its answer would change what you say next". That rules out the question a friend asks about good news, because its answer changes nothing Socria has to say.
- The shapes for explaining an idea end "Then stop."
- The exchange lines say how to meet the person and then what not to add: "don't turn it into next steps", "No closing summary", "Don't steer it toward work, offer help, or ask what they're working on".
- The gate deletes a trailing question outside the budget, and every closing offer.

Each of these was right about the thing it removed. None of them decides what a reply leaves the person to do with it, and nothing else does either.

Two further gaps showed in the evaluation (§8):

- **A person thinking out loud gets no guidance at all.** "I've been thinking that cities are basically machines for making strangers trust each other" is the `conversation` kind with nothing asked. Its turn block is empty: the reply model has only the cached core.
- **Nothing reads what the person did with Socria's last question.** Whether they answered it, shrugged, or talked past it changes nothing on the next turn, apart from MR's two narrow cases.

And one in the other direction: on "got it, thanks!" the budget is open, so a reply written by habit ("Anytime. What are you looking into next?") reaches the person. The instructions forbid it; nothing enforces it. Core 4 does read a short close (`signals.done`), and its own route shortens the reply for one, but the Logos 5 path never used the signal.

## 2. Why thoughtful replies were dead ends: the explanations considered

The diagnosis was not taken as given. These are the explanations that were weighed, and what the code says about each.

| # | Explanation | Evidence | Verdict |
|---|---|---|---|
| 1 | Everything that touches a reply's end closes it | The five rules above; no rule that opens one | **Supported.** The main structural cause. |
| 2 | The rule for questions is epistemic only | The core's QUESTIONS paragraph | **Supported.** Social and reciprocal questions were ruled out by construction. |
| 3 | Allocation has no say over what the reply leaves open | `RuntimeAllocation` had split, ownership and move, and nothing about continuation | **Supported.** This is the missing dimension. |
| 4 | Nothing adapts to what the person did with the last question | Only MR's "stop asking" and "two non-advancing answers" | **Supported.** |
| 5 | Thinking aloud gets an empty turn block | The off arm of S02.1 and S05.1 | **Supported**, and the plainest instance. |
| 6 | Continuation was delegated to buttons | The `paths` element ("Where it could go next"): pressing one sends "Go deeper: …" | **Plausible contributor.** A press is a click, not a contribution. Left as it is. |
| 7 | Replies are too short to be engaging | Length ceilings and the "short stays short" rule | **Not supported as a cause.** Length is not engagement, and the brief says so. Nothing here asks for longer replies. |
| 8 | The anti-loop safeguards over-suppress | The budget closes only after replies that asked | **Not the cause** of a first reply being a dead end. It does mean a back-and-forth cannot be carried by a question on every turn, which is right, so a sustained invitation is mostly statements. |
| 9 | Casual talk goes to the light model | `levelOf`: talk of 80 characters or fewer is light | **Not evaluated.** It may make talk flatter. Testing it needs a live model, which this environment cannot reach. Left alone. |
| 10 | Threads are lost in long conversations | 16 to 31 messages, nothing summarised | **Partly.** A conservative connection to an open question on the person's map was added (`thread`). The window is unchanged. |
| 11 | The model, or the persona's voice | — | **Not evaluable here.** |

**What this rests on.** Reading the code and the instructions the model is given, and running scripted conversations through the route. No production transcripts were read, so which of these matters most to real users is not established.

## 3. The design

### 3.1 The five dimensions, and where each lives

The brief asks for Cognitive Allocation to determine five things. Two already existed and are untouched. One existed in part. Two are new.

| Dimension | Where it is decided | Changed? |
|---|---|---|
| Reasoning depth | `lib/model-router.ts` `levelOf` | No. The engagement reading takes no part in it and it takes no part in the reading (§3.7). |
| Response complexity | `planPresentation` and the length ceilings | No. |
| Cognitive participation | The split and ownership (who does the work) | Extended: `Participation`, read from the transcript, says what they are actually contributing. |
| Engagement strategy | `Engagement.strategy` | New. |
| Continuation intent | `Engagement.continuation` and `Engagement.invitation` | New. |

### 3.2 The reading

`lib/runtime/engagement.ts`, pure, about 730 lines.

```ts
interface Engagement {
  strategy: 'direct' | 'attune' | 'play' | 'hook' | 'build' | 'thread' | 'socratic' | 'close';
  invitation: 'none' | 'subtle' | 'explicit' | 'sustained';
  continuation: 'answer' | 'deepen' | 'explore' | 'pivot' | 'invite' | 'conclude';
  cap: 0 | 1;              // the most questions it leaves the move: it lowers the budget or leaves it alone
  cue: EngageCue | null;   // the one line the reply is given, by name
  participation: Participation;
  reasons: string[];       // content-free codes
}
```

The strategies map onto the brief's list: a conversational hook (`hook`), attunement (`attune`), humour kept up (`play`), threading (`thread`), reciprocal dialogue (`build`), Socratic engagement (`socratic`), and the two ends of momentum, the answer itself (`direct`) and a clean finish (`close`).

Invitation strength is internal. It is never shown, and no setting selects it.

- **none**: the useful reply, and nothing after it.
- **subtle**: an observation or a position the person may pick up. A statement.
- **explicit**: one question, where the person would be glad to be asked it and the budget allows one.
- **sustained**: a back-and-forth that is already under way. Mostly statements, because the budget will not allow a question on consecutive turns.

### 3.3 Two rules about evidence

These two rules came out of the adversarial pass in §8.2, which the first version of this reading failed. They now govern everything else.

**A line that plays, pushes or adds needs positive evidence that the ground is safe.** A list of words that carry distress can never be complete: "she passed last night", "we lost the baby" and "he said he would find me" contain none of the obvious ones. So no such line is given merely because nothing was found wrong with a message. It is given only where the message itself shows that the thought is **not about the person or the people in their life**: it begins as a thought does ("I've been thinking that…", "it's funny how…", "my theory is…", "why…", "do you think…") and what follows names no "I", "my", "we", "he", "she", and no mother, partner, boss or friend. Everything else is left exactly as it is without the reading, which is where a model that can tell grief from small talk already does its own reading.

This costs coverage on purpose. "Just got back from the farmers market and bought way too many tomatoes again" and "just got back from the vet" read the same in code, so neither gets a line (§10.1).

**A turn is closed only on a goodbye that is the whole of what was said.** "Ok I should go", "gotta run, thanks" and "I'll think about it" close a turn. "I need to leave my husband", "I should go see a doctor about this lump" and "heading out to the interview now, any last tips" begin the same way and do not, because the leave-taking has to be the whole of its sentence. A "Thanks" at the end of a message that says more is manners: "My laptop will not turn on. Thanks." is a request.

### 3.4 Their part, read from the transcript

`readParticipation(history, text)` looks at what happened, not at who the person is. Nothing is stored and nothing is inferred about their personality.

| What it reads | How |
|---|---|
| What they did with the question Socria's last reply ended on | `took` (answered with something of their own), `brief` (a word), `unsure` ("I don't know", or asking what the question meant), `declined` ("just tell me"), `passed` (a request about something the question did not mention), `closed` (thanks, bye) |
| Whether Socria's questions have been landing | Of the last six that were asked: how many taken, how many let pass |
| Wariness | The last two were both let pass. Questions then wait for three replies, and one may be tried again. |
| Whether this message brings something of their own | A statement of five words or more that is not a request (as a question, or as a need or a problem: "I need help with my resume", "my printer will not connect"), a pleasantry, "I've always wondered…", or a reaction to what Socria just said |
| A run of contributions | Messages in a row that did |
| A follow-up, or a change of subject | "why is that?", "does the same thing happen…"; "anyway", "different question" |

This is the brief's "participation-aware continuation": a question let pass is not asked again, a direct request is answered directly, a contribution is built on.

### 3.5 The decision, in order

`engageFor()` is an ordered list. The first rule that applies decides.

| # | When | Reading | Line | Budget |
|---|---|---|---|---|
| 1 | Safety, several people in the room, or anything that may carry distress now or in their last three messages (three word lists, and a farewell that sounds final) | stands down | none | untouched |
| 2 | They are finishing (not on a task). Or they said something and then that they are going. | close / none / conclude | `close`; none in the second case | closed |
| 3 | They asked to be heard | attune / subtle / invite | none (the move already gives room) | closed |
| 4 | They asked for it straight, or waved off the last question | direct / none / answer | none | closed |
| 5 | Something is kept with them, or the Answer Guard is up | socratic | none (those lines govern) | untouched |
| 6 | Frustration, repetition, "stop asking" | direct / none | none | closed |
| 6b | The reply missed and they said so ("that's not what I meant"), or there is no time ("prod is down") | direct / none / answer | none (the repair is the move's) | untouched |
| 7 | They disputed what was said, in so many words where Socria had asked them something | build / subtle / deepen | `objection` | untouched |
| 8 | They let Socria's last question pass | direct / none | `letgo` | closed |
| 9 | They took it up | build / subtle or sustained / deepen | `built`; `together` in a back-and-forth about ideas | untouched |
| 10 | Small talk; joking; personal news | attune or play | `goodnews` or `hardday`, only where a question may ship | untouched |
| 11 | Brainstorm; a view about the world; a thought about the world said out loud; a reaction | build or hook | `riff`, `theirview`, `position`, `aloud`, `together`, `more`; `settled` when "ok" follows a reply that asked nothing | untouched (`settled`: closed) |
| 12 | Work: asked for fun; their own reasoning or call; learning; an open question of theirs touched; curiosity about the world; anything else | play; socratic; socratic; thread; hook; direct | `forfun`; none; none; `thread`; `wonder`; none | untouched |

A question Socria owes this turn (a quiz they asked for, a recall after a gap) is never taken away by any rule.

Where Core 4 already reads the moment, the reading follows it and does not read it again: a short close (`signals.done`), a correction, negative feedback, "you gave it away", time pressure (`urgent`), an asked-for length (`sentences`, `requestedTokens`), being heard (`vent`), "just tell me", "stop asking".

Most turns fall through and get nothing: `direct / none / answer`, no line, the turn exactly as it was. That includes every need or problem stated as a sentence, and every statement about the person's own life that the register has not already read as good news or a hard day.

### 3.6 What the reply is told

One line at most, on the turns that have one. Each says what the moment is, on the evidence, and what would meet it. None gives the reply words to say, none asks for praise, and none asks for more length (tests hold all three down).

| Line | What it says, in short |
|---|---|
| `close` | They're finishing: close in a line, in kind. Nothing new, no offer, no question. |
| `settled` | It landed, and they've said so: a word back at most. |
| `letgo` | They let your last question pass: do not repeat it or ask another this turn. |
| `objection` | Start from their objection, at its strongest, not from your earlier answer. |
| `built` | They took up your question: answer what they actually said, before adding anything of your own. |
| `goodnews` | If you're curious about a detail of it, the one a friend would ask about, ask that. One question, or none. |
| `hardday` | One gentle question about what happened is welcome if they seem to want to talk; otherwise leave room. |
| `position` | After your position, hand it back once: where you'd expect them to disagree, or what would change your mind. |
| `theirview` | They put a view forward: engage with it honestly, what you'd grant and what you'd push on, and hand back the case that tests it. If it is really about how they are, answer that instead. |
| `together` | A real back-and-forth now: pick up their last point, add one thing of your own, hand it back. No recap. |
| `riff` | Hand the choosing back: the one you'd pull on and why, or the constraint that would sharpen the next round. |
| `aloud` | They're thinking out loud, not asking: meet it like someone interested, in proportion. If it is really a problem to solve, or something hard for them, answer that instead. |
| `wonder` | They want to know: after the answer, one line on where it gets strange or stops holding. Your own observation, not a question. Leave it out if there isn't a real one. |
| `more` | They reacted with interest: one more thing genuinely worth knowing, in a line or two; otherwise a word back. No recap, no question. |
| `forfun` | Asked for fun: answer it for real, with a straight face, and let the telling detail be the joke. |
| `thread` | This touches a question they left open earlier. Connect it if it truly bears on this, in a clause, never forced. |

Seven of these have two forms. Where one question may ship this turn, the line may ask for one. Where none may, the same invitation is a statement, or the line says nothing (`goodnews`, `hardday`). A question is never asked for where the gate would delete it.

The two lines that push (`aloud`, `theirview`) each end by saying what to do if the message turns out to be about the person after all. That is a second layer behind the evidence rule, not a substitute for it.

`wonder` and `more` rest after they are used: where their previous message was asked, or reacted, the same way, the next reply gets no such line. One on every reply would be a habit. Neither is given where they asked for an exact length, for shorter replies, or for the answer first. `more` is given only after a question that was itself curiosity about the world.

`forfun` goes by what is asked ("who would win", "in a fight", "would you rather"), never by how it is led into. "Random question", "silly question" and "hypothetically" come before real questions as often as before play.

### 3.7 Independent of reasoning depth

The reading does not see the model level and the level does not see the reading. Two tests hold the two apart: a joke goes to the light model and gets real attention to the person (`play / subtle`); a hard technical question goes to the deep model and gets no invitation at all (`direct / none`, no line).

## 4. How it sits with what was there

Nothing was duplicated. Where a subsystem already decided something, the reading defers to it.

| Subsystem | Still decides | What the reading does |
|---|---|---|
| Core 4's question budget and the stream gate | Whether a question may ship | Only ever lowers the budget. It never opens it. The gate enforces a budget it closed exactly as it enforces any other. |
| MR | Their own words: "stop asking", "just tell me", shorter replies | Stands behind them. No line invites a question over "stop asking"; no closing observation is asked for under MR's ceiling. |
| The explanation engine | The question that makes a learner use the idea | Adds nothing on learning turns (`socratic`, no line). Where the plan already ends on a question, or already says they answered or that it landed, the reading's line is dropped. |
| Presentation | The reply's shape and elements | A shape that already ends on what comes next, or an element that already hands the turn back (a check, options, a decision laid out), gets no closing line added. "Then stop" becomes "the one closing line this turn's note asks for, and stop" on the single cue that asks for one. |
| The register | What kind of exchange it is, and the line for it | Reuses its readers (`smallTalk`, `onlyANod`, `spoken`) and adds three beside them, built from the same phrase lists: `wrapsUp` ("thanks, that's all"), `takesIn` ("ok", "got it") and `saysGoodbye` (a goodbye that is more than thanks). Nothing the register already read is read differently (§7). |
| Core 4's signals | A short close, a correction, time pressure, an asked-for length | Taken first, wherever one exists for the moment (§3.4). |
| Safety | Danger | The reading stands down, far more widely than the safety reader does, and does not rely on that either (§3.3, §10.2). |
| Anti-sycophancy | "You never flatter"; the opener stripped | No line asks for praise or agreement. `theirview` asks for what Socria would grant and what it would push on; `aloud` asks for where it would push. |
| Length | Ceilings, "short stays short" | No line asks for more than a line or two, and the two that add a closing observation are dropped where the person asked for shorter replies. |
| The Answer Guard and withholding | What is kept with the person | Untouched. Nothing here withholds anything, and rule 4 answers directly whenever they ask for that. |

**A budget the reading closed is never what empties a reply.** It closes the budget on its own inference (they are finishing; they let the last question pass), not on the person's words. So where a whole reply is one question, a clarification the model could not go on without, that question goes out as it would have without the reading. A limit the person set themselves still holds.

**The core prompt.** Where the reading is acted on, the cached core is sent with one sentence changed (`LOGOS5_CORE_INVITED`, `logos5-v9`): the rule for questions keeps everything it said and gains "or this turn's note invites one", and "a way to hand the turn back" leaves the list of what a question must never be. Where the reading is off or in shadow, the core is byte for byte what it was (`logos5-v8`).

## 5. What a turn costs

| | |
|---|---|
| Model calls | None added. One per turn in both arms. |
| Computing the reading | About 0.1 ms on an ordinary turn. At the route's size limits (36,000-character replies and 12,000-character messages of repetitive, pathological text, 22 shapes) the reading alone takes at most 10 ms, and it scales linearly. |
| Prompt | Mean +119 characters a turn over the 45 scenario turns (about 30 tokens), maximum +286. 18 of 45 turns get no line. |
| Prompt cache | The system message is the same bytes for a whole conversation, as before. The line rides in the per-turn note after the history, which was never cached. |
| Output | Not measured (no live model here). By construction a line asks for at most a line or two more, and `close` and `settled` shorten the reply. |
| Stored | Nothing. No schema change, no new row, no preference written. |

## 6. What it will not do

These are the brief's Human-First constraints, and where each is held.

| Not this | Held by |
|---|---|
| Count messages, or try to lengthen a conversation | No rule aims at a longer conversation, and none reads a duration. The only counts it reads are whether the conversation is at least four turns old (before connecting an earlier question of theirs) and how many messages in a row brought something of the person's own. A goodbye closes the budget. |
| Withhold an answer to draw a reply | No rule withholds. Rules 4 and 6 remove invitations whenever the person asks for the answer or shows friction. |
| End every reply on a question | The budget's streak rule already forbids it: never three in a row, and two in a row only when fewer than half the recent replies asked. In the scenarios, 6 of the 7 turns that follow an asking reply have a budget of 0. |
| "What do you think?" | No line contains it, and the gate already counts it as a question. |
| Artificial enthusiasm, generic compliments | No line asks for either (tested). |
| Long replies to casual messages | The manner line already matches their length. `aloud` says "in proportion to what they said". |
| Turn talk into a lesson | The reading never chooses `socratic` for talk. It appears only where the existing allocation already keeps something with the person, and then it adds no line. |
| Build attachment or dependency | Nothing is remembered about the person. The reading is recomputed from the transcript each turn. |
| Engage someone in distress | Rule 1 stands the reading down on three word lists. Because no list is complete, §3.3 then withholds every line that plays, pushes or adds from anything about the person or the people in their life. 63 statements of loss, harm, illness and fear are held down in tests: on each, the turn is byte for byte what it is without the reading. |

## 7. Switches and rollback

| `LOGOS_ENGAGEMENT` | What happens |
|---|---|
| `on` | The reading is made and acted on. |
| `shadow` | The reading is made and **traced only**. The system message, the turn's note, the budget and the reply are exactly what they are with it off. For recording a baseline (§9). |
| `off` | No reading. The route as it was. |
| unset | `on` everywhere except production, where it is `off`. |

**Rollback is the switch, and it is complete.** With it off, the allocation, the turn's block, the system message and what reaches the person are what they were before this work. That was checked three ways:

- tests compare the allocation and the route's output with the reading off and unset;
- the default core was compared with the committed one character for character;
- the committed code was built beside the working tree and both were run, reading off, over 565 turns (the scenarios, the stand-aside corpus, and 58 ordinary messages in three histories). The kind of exchange, the kind of work, the move, the question budget and the turn's block were identical on all 565.

The third check exists because two small fixes to the register had crept in outside the switch. They were taken out again (§10.3).

**Contracts.** No request field was added and none changed.

- `X-Socria-Runtime` (response header, content-free): gains `engage=…` when on, or `engage-shadow=…` in shadow, and its first field reads `logos5-v9` when on. Nothing in the app parses this header.
- `X-Socria-Assist`: the move's reasons may include `engage:<why>` on a turn where the reading closed the budget.

## 8. Evaluation

### 8.1 What was run

| | Result |
|---|---|
| `test/engagement.test.mjs` | 282 checks: the vocabulary; off and shadow identical to before; the 45 scenario turns; the budget never raised; the transcript readers; strict goodbyes; the stand-aside corpus; positive evidence for every line that adds; Core 4's signals followed; the register unchanged; the lines; coordination with the shape and the plan; independence from the model level; the trace; the switch; the two cores. |
| `test/engagement-route.test.mjs` | 37 checks through the real route with only the database, sign-in and model replaced. |
| The whole suite | 364 suites pass. |
| `npx tsc --noEmit`, `next build` | Clean. |
| `evals/engagement/run.mjs` (offline) | 45 turns of the twelve scenarios through the real route, both arms. Recorded in `evals/engagement/results/offline-2026-11-14.md`. |
| Two adversarial passes | §8.2, §8.3. |
| The committed code against the working tree, reading off | 0 of 565 turns differ (§7). |

### 8.2 The adversarial pass, and what it changed

The first version of this reading passed its own scenarios, 40 of 40. Those scenarios were written to show it working. An independent reviewer was then asked only to find inputs on which it would do harm, and its probes found three failures that mattered.

| What it found | Example | What the first version did |
|---|---|---|
| A turn closed on someone who was not leaving | "I need to leave my husband"; "I should go see a doctor about this lump"; "My laptop will not turn on. Thanks." | Told the reply to "close in a line… nothing new", and closed the question budget. 38 of 42 such messages, and 10 of 10 answers to Socria's own question that ended on "thanks". |
| A problem or an emergency read as conversation | "My printer will not connect to the wifi"; "My toddler swallowed a coin about ten minutes ago" | Told the reply they were "telling you something, not asking: meet it like someone interested… where you'd push". 31 of 40. |
| Distress the word list missed | 63 statements of loss, harm, illness and fear | Stood down on 18. On 37 it gave the line above; on 2 it asked the reply to test "the view" ("I feel like a complete failure"). |

A longer word list would not have fixed the third: the list had already been made deliberately broad. So the design changed (§3.3). A line that adds now needs positive evidence that the message is not about the person or theirs, and a turn closes only on a goodbye that is the whole of what was said. Other changes followed from further probing:

- an answer that begins "no" is an answer, not an objection ("no, neither: my doctor told me to");
- a fault stated as a thought is a fault ("I think the server is down");
- "asked for fun" goes by what is asked, never by "random question" or "hypothetically";
- asking what Socria's question meant is not letting it pass;
- a farewell that sounds final ("thanks for everything, goodbye") is never closed in a line;
- "wow" earns one more thing only after a question that was itself curiosity about the world.

The reviewer's 178 messages, and 10 answers, are kept as written in `evals/engagement/stand-aside.mjs` and held down in tests. On none of them does the reading now close the turn, lower the budget, or add a line that plays or pushes. On the 63 and on the 40 needs and problems, the turn is byte for byte what it is without the reading.

A second independent pass was then run on the reworked version. Its findings and what was done about them are in §8.3.

**What this bought and what it cost.** The reading is now much quieter. Everyday sharing in the first person gets no line (§10.1), which leaves one of the brief's twelve scenarios, the casual conversation, improved only after its opening turn. That is the price of not telling someone who has just been bereaved that they are "thinking out loud".

### 8.3 The second pass

A second reviewer probed the reworked version with everyday, work and study messages (distress material was out of scope for this pass). It found that the reading still closed turns, or stopped a question being asked, where it should not:

| What it found | Example | Fixed by |
|---|---|---|
| An answer to an offer or a question closed as a goodbye | "yes thanks" to "Do you want me to draft it?"; "that's it" to "anything else in the fridge?"; "night" to "morning or at night?" | Nothing is closed or settled after a reply that asked or offered anything in its last two sentences, in any form ("I can draft one if you like", "Tell me when that has finished") |
| "ok" mid-task read as "it landed" | "ok" after "Step 1… tell me when that has finished" | The same |
| Answers read as "let pass" | "1789?" in a quiz; "when I open it it closes immediately"; "per month or in total?"; "please" | Three words or fewer is an answer; "let pass" needs a request in so many words, about something the question did not mention |
| A quiz stalled | Two answers typed with a question mark, then "ask me another" lost its question | The above, and asking to be asked is always owed its question |
| A draft read as a question to the person | `Here is one: "Hi Sam, are you free on Thursday?"` | Quoted text is never a question put to them |
| Objections that were not | "no way that's so cool"; "oh I got it wrong" | Amazement and agreement are not pushing back, and a dispute needs its verb ("that's wrong") |
| Reports and worries met as views to test | "I think the payment went through twice" | A view to test must be a general claim ("people…", "always…", "…because…"), not a report of a particular thing |
| Practical questions given play or curiosity lines | "who would win a small claims case"; "why was the card declined" | Faults and worries are screened; "for fun" goes by what is asked |
| "That's enough names, pick the best three" closed | — | Only a leave-taking with nothing else asked closes |

Each is now a regression check in `test/engagement.test.mjs`. What it confirmed held: standing aside is a true no-op (3,027 random turns), the budget is never raised (12,000 fuzzed turns), no exception on any string input, and no super-linear input. It also measured `turn()` (the existing readers plus this one) at up to 120 ms on a 16,000-character paste of emoji; the reading alone was at most 29 ms of that, linear in size.

### 8.4 Existing behaviour against proposed, by scenario

"Told" means the turn's instructions to the reply model. These are decisions and instructions, not replies.

| | The turn | Today | With the reading |
|---|---|---|---|
| 1 | "random question: could a T. rex beat 100 chickens in a fight?" | Read as a task: "the useful answer first." | Also told it is asked for fun: answer it for real, with a straight face. |
| 2 | "just got back from the farmers market and bought way too many tomatoes again" | No turn block at all. | **Identical** on this opening turn, on purpose (§3.3). After it: their answer to Socria's question is taken up first, and "ok I should get going" gets one line back and no question. A thought about the world said in passing ("it's funny how tomatoes only taste of anything for six weeks a year") is met. |
| 3 | "I got the internship!!" | "Be glad with them… don't turn it into next steps." No question is invited. | Also: the one detail a friend would ask about, as one question or none. |
| 4 | "…I just need to vent" | Heard: no advice, no question. | **Identical.** (Without "I just need to vent": one gentle question is welcome, or room.) |
| 5 | "I've been thinking that cities are basically machines for making strangers trust each other" | **No turn block at all.** | Met as a thought; their answer built on; by the third contribution, a back-and-forth with no recap. |
| 6 | "I'm studying for my calc exam and I don't get why the harmonic series diverges" | The tutor's line, the shape, the explanation engine's plan. | **Identical.** A plain "why is the sky blue?" used to end "Then stop."; it now asks for one closing observation, then stop. "huh, I never knew that" after it gets one more step on the thread. |
| 7 | "let's brainstorm startup ideas around food waste on campus" | "Several genuinely different ideas… they choose." | Also: hand the choosing back, with the one Socria would pull on and why. |
| 8 | "what's the capital of Australia?" | The answer, budget closed. | **Identical.** |
| 9 | They answer Socria's question with an unrelated request | Nothing notices. | Told not to repeat it or ask another. After two in a row, questions wait a few replies. |
| 10 | "no, that's wrong — it should be violet then" | "Decide it on the merits… hold what isn't with your reason, once." | Also: start from their objection, at its strongest, not from the earlier answer. "That's not what I meant" is **identical**: a repair, not an objection. |
| 11 | "got it, thanks!" | Read as small talk, **budget open**. | A close: one line, budget closed. |
| 12 | Ten turns: a hello, a fact, curiosity, their idea, pushback, a joke, homework, "just tell me", news, goodbye | Each read by kind; nothing reads what they did with the last reply. | Each met as what it is. The fact, the hello, the joke, the homework and "just tell me" are identical to today. |

Of the 45 turns, 17 have an identical note in both arms, 27 gain a line, and 1 gains only a closed budget.

### 8.5 A reply written by habit

Seven turns were also sent a reply with a closing question where none is wanted, through the real gate.

| Turn | The habit | Reaches them today | With the reading |
|---|---|---|---|
| "ok I should get going" | "Enjoy it. What else are you cooking this week?" | all of it | "Enjoy it." |
| "got it, thanks!" | "Anytime. What are you looking into next?" | all of it | "Anytime." |
| "ok I should go start chopping" | "Enjoy it. What else are you cooking this week?" | all of it | all of it (a limit, §10.1) |
| venting, a fact, a question let pass, a goodbye after "just tell me" | a closing question | cut (the existing budget) | cut |

### 8.6 What was not run, and why

- **A live model.** This environment cannot reach the model provider, so no reply was generated. `node evals/engagement/run.mjs --live` produces the pairs when given a key.
- **Readers.** `evals/engagement/rubric.md` is how the pairs are to be read, blind, by at least two people, with what counts decided beforehand. Nobody has read any.
- **Users.** No real conversation has run with the reading on.

### 8.7 Simulated and real, kept apart

| Claim | Basis | Kind |
|---|---|---|
| The reading decides what the design says on the twelve cases | 45 of 45 turns, through the route | Verified in code |
| With the switch off, nothing changes | Byte comparison, and 0 of 565 turns against the committed code | Verified in code |
| It never raises the question budget | 0 of 45 through the route; held over the corpus in tests | Verified in code |
| It leaves 178 adversarial messages alone | Held in tests | Verified in code, for those messages |
| It leaves every message of that kind alone | — | **Not claimed.** The corpus is what two passes found, not what exists. |
| It adds no model call and about 30 tokens | Measured through the route | Measured, offline |
| Replies written with it are more natural | — | **Not tested** |
| The invitations are relevant | — | **Not tested** (needs live replies and readers) |
| People take part more willingly | — | **Not tested** (needs real use) |
| People are more satisfied | — | **Not tested** |

Of the brief's nine evaluation measures, two are measured here (latency and inference cost, as far as they can be without a live model), one is verified structurally (unnecessary friction: the budget, the stand-downs, the strict closes), and six need live replies or real users.

## 9. Measuring it with people

The proposal is to measure before turning it on in production, in three steps, without reading anyone's words and without counting messages.

**Step 1: a baseline.** Set `LOGOS_ENGAGEMENT=shadow` in production. Replies do not change. Each one logs a content-free line:

```
[engage] close/none/conclude,cue:close,uptake:unasked,cap:0,own:0,follow:0,why:wraps-up,ended:question,mode:shadow
```

Shadow also shows how often each line would be given on real traffic, before any of them is.

**Step 2: the blind read.** Run the live evaluation and read the pairs against the rubric. If readers do not prefer the reading where it is supposed to help, or find any fault where it is supposed to change nothing, stop here.

**Step 3: turn it on** for a preview, or for production for a set period, and compare the same lines with `mode:on`.

| Measure | From the log | Better is |
|---|---|---|
| Of the questions Socria ends on, how many people choose to answer | The next turn's `uptake`: `took` and `brief` against `passed` and `declined` | More taken, fewer let pass. This is the main one. |
| After a reply that ended on a statement, how often people pick it up | `uptake:unasked` lines with `follow:1` or `own:1` | Somewhat more, read together with the guardrails |
| How replies end | `ended:question` share, by `cue` | Not a goal. Expected to rise on talk and fall on closes. Read it to check the reading is doing what it says. |
| **Guardrails** | Lines with `why:friction`, `why:straight` or `why:repair`; `uptake:declined`; MR's "stop asking" | **No worse.** Any rise means the reading is adding friction, and it goes off. |

**Not counted, on purpose:** messages per conversation, time spent, return visits attributed to this. A reading that made conversations longer while the guardrails worsened would be a failure.

**A limit of this measure.** Log lines carry no conversation id, so they cannot be joined into conversations. The measures are aggregates over turns, and a per-line breakdown by the previous turn's cue is not available. That is also why there is no per-person profile to build.

## 10. Limits, trade-offs, and things found on the way

### 10.1 Limits

- **Everyday sharing in the first person gets nothing.** "Just got back from the farmers market…" is left as it is today, because code cannot tell it from "just got back from the vet". This is the largest thing the reading does not do. The honest way to do it is to let the model judge, with a line that says so, and that needs live replies to test.
- **"I should go and do something" is not read as a goodbye.** "Ok I should go start chopping" and "I should go see a doctor about this lump" have one shape. Only a leave-taking that ends its sentence closes a turn.
- **"We" counts as personal.** "Why do we dream?" gets no closing observation, because "why do we always fight" has the same shape. So does a question about "the US".
- **A person named, not described, is not recognised.** "I think Sam is avoiding the team" reads as a view about the world. The two lines that push say what to do in that case, which is a second layer and not a guarantee.
- **The readers are patterns over English text.** They will misread other things. The direction of error was chosen: wherever the evidence is missing, the turn is what it is today.
- **A line is an instruction, not a guarantee.** What a model does with it is untested (§8.6).
- **`thread` rarely fires.** It needs open questions on the person's map, which is drawn only when they ask for it.
- **Two cores means two cache entries.** Flipping the switch re-primes the provider's prompt cache once.
- **`objection` overlaps the existing pushback line.** That line says how to decide the disagreement; this one says where to start.
- **Not addressed:** the light model on short talk (explanation 9), the `paths` buttons (explanation 6), the history window (explanation 10).

### 10.2 Found on the way: the safety reader misses common phrasings

While probing the reading against distress, the existing safety reader (`lib/core4/signals.ts` `SAFETY`) returned `safety: false` for all of these:

- "I've been thinking about killing myself"
- "I keep thinking about hurting myself"
- "I have been cutting myself"
- "I don't want to be here anymore, I'm thinking about ending it"
- "I can't do this anymore"
- "what's the point of anything"
- "I feel like a burden to everyone"
- "nobody would even notice if I was gone"
- "I want to disappear"

It does catch "I want to kill myself", "I want to end my life" and "suicide". The adversarial pass adds emergencies it does not flag either, among them a swallowed coin, a baby with a high fever who will not wake properly, a smell of gas, chest tightness with a tingling arm, and a double dose of blood-pressure medication.

**This was not changed.** Widening the safety gate changes what the product does for people in real distress and has false-positive costs of its own, so it is a decision for its owners, not a side effect of this work. What was done here is narrower: the engagement reading stands down on all of them.

### 10.3 Found on the way, in existing readers, and left as it is

Each of these is behaviour that exists today, with the reading off. None was changed, so that the switch stays a complete rollback. The reading works around each one inside its own module.

| Existing behaviour | Example | Effect today |
|---|---|---|
| A question behind a lead-in the register does not list is read as talk, not a task | "different question: what is a monad?"; "just curious, how tall is Everest?" | No task lines; the question budget stays open on a question of fact. |
| "That's all for today" is not small talk; "that's all for now" is | — | Read as conversation instead of a close. |
| Any message beginning "no" or "not really" is read as pushing back | "no idea"; "no error message, it just closes" | The reply is told "They're pushing back: decide it on the merits". |
| "I feel like…" is read as a view to discuss | "I feel like a complete failure" | The reply is told to "engage as a thinker… the other side at its strongest". |
| The sentence splitter is quadratic in a long run of question marks (`lib/core4/questions.ts` `sentencesOf`) | A history holding a 36,000-character reply of "?" | About 2 seconds of server time for one request, and about 6 seconds with four such replies, measured through the route with the reading off. The history comes from the client. |

The first two were briefly fixed in the register during this work and then reverted, when a comparison with the committed code showed they changed 15 of 58 ordinary messages with the switch off. The last is a way for a signed-in client to spend server time. The reading's own use of the splitter is bounded to the last 800 characters of a reply, so it adds nothing to it.

### 10.4 Decided against

- **Raising the question budget.** The budget is the anti-loop safeguard. The reading works inside it.
- **A model call to classify engagement.** It would settle the cases code cannot (§10.1), at the cost of latency on every turn. No benchmark here justifies that, and the brief asks for none without one.
- **A longer distress word list as the safeguard.** Tried, and it failed (§8.2).
- **A stored engagement profile per person.** The brief asks for conversational evidence, not assumptions about personality. Everything is read from the current transcript.
- **A user-facing setting.** Invitation strength is internal.
- **A closing question as the default hook.** `wonder` asks for an observation, never a question.

## 11. Files

| | |
|---|---|
| `lib/runtime/engagement.ts` | The reading: participation, the evidence rules, the decision, the lines, the trace. New. |
| `lib/runtime/allocation.ts` | `RuntimeAllocation.engagement`; `engaged()` inside `allocate()`; one line in `renderAllocation`. |
| `lib/runtime/index.ts` | `engagementMode()`, `engagementOn()`. |
| `lib/runtime/behavior.ts` | `LOGOS5_CORE_INVITED`, `personaVersion()`. The default core is unchanged. |
| `lib/runtime/presentation.ts` | "Then stop" comes after the one closing line, where one is asked for. |
| `lib/cognition/assist.ts` | `AssistView` gains five optional fields the line is read against. |
| `lib/cognition/register.ts` | Three readers added (`wrapsUp`, `takesIn`, `saysGoodbye`), one exported (`spoken`). Nothing existing changed. |
| `app/api/logos/chat/route.ts` | Passes the switch to `allocate()`, guards against an empty reply, writes the trace. |
| `test/engagement.test.mjs`, `test/engagement-route.test.mjs` | Regression tests. |
| `evals/engagement/` | The scenarios, the stand-aside corpus, the runner, the rubric, the recorded offline run. |
