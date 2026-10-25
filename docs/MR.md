# Metacognitive Regulation (MR)

MR is a supervisory control plane around the Logos 5 runtime. It watches
whether the help Socria is giving is working and, when there is evidence that
it is not, issues a **typed, scoped, expiring decision that the runtime
enforces in code**. Most turns it decides nothing. It never makes a model call
unless the optional deliberative loop is switched on, and it is **off by
default** (`LOGOS_MR`), so the route is exactly what it was until MR is turned
on for a deployment.

Primary invariant: Socria must not replace meaningful human cognition
unnecessarily. Secondary invariant: **Human-First is not Question-First.** MR
regulates in both directions: it removes questions that are not helping and
puts the answer first when that is what serves someone, and it **keeps** the
difficulty when they asked to be quizzed.

The spec is the October 2026 proposal ("MR 3.0"). This document is the
implementation; [MR-RESEARCH.md](MR-RESEARCH.md) is what exists for a future
study and what does not.

> Nothing here demonstrates that MR improves anybody's thinking, learning or
> autonomy. The benchmark below measures MR's control plane against a
> simulated assistant. Human outcomes need a real study (MR-RESEARCH.md).

---

## 1. Where MR sits

The proposal names six existing subsystems. In this repository they are:

| Proposal | Here | Notes |
|---|---|---|
| Behavioral Control | `lib/runtime/behavior.ts`, `lib/logos-style.ts`, `lib/conversation-style.ts`, `lib/core4/stream-gate.ts` | Prompt text plus the sentence gate, which is the only code-level conduct enforcement. |
| Epistemic Control | `lib/runtime/epistemic.ts`, `lib/accuracy/accuracy.ts`, `lib/core4/guard2.ts` | Evidence, citations, the maths engine's held path. MR never touches it; it removes MR-prompted "I checked…" claims that did not happen (§11). |
| Adaptive Cognitive Synthesis (ACS) | `lib/cognition/assist.ts` `chooseAssist` + `lib/runtime/allocation.ts` `allocate`/`reconcile` (+ `lib/runtime/replay.ts`, Core 4's allocator) | The repo calls it **Cognitive Allocation**. It picks one move per turn (`AssistDecision`); MR's controls narrow that decision. |
| Cognitive State Model | `lib/runtime/state.ts` (`TurnState`), `lib/core4/signals.ts`, `lib/core4/merge.ts` | Per turn, never stored. MR's state is separate (§4). |
| Representation Layer | `lib/representation.ts`, `lib/runtime/representation.ts`, the workspace | Untouched by MR. |
| Inference Orchestration | `lib/runtime/orchestrate.ts`, the route | MR adds no call on the fast loop. |
| **Metacognitive Regulation** | **`lib/mr/`**, the route integration, `app/api/mr`, `components/account/MRSettings.tsx` | This document. |

### The turn, with MR in it (`app/api/logos/chat/route.ts`)

```
request ─ auth, sharedTurn
        ├─ mrPriorP ── settings ∥ this conversation's ledger ∥ incognito        ← started HERE, overlapping the allowance
        │              (+ standing rows elsewhere, only with consent to carry)     checks; bounded (800–900 ms), fail closed
        ├─ limits, plan, planTurn (accuracy) ─ readSignals ─ routeTurn/readTurnState ─ allocate (ACS)
        │
        ├─ MR FAST LOOP  regulateTurn()                         ← no model call; ~1 ms warm
        │     fold the conversation: their words from every turn; over the last 24, observe (ifr)
        │       → outcome of the last adjustment → expire/revoke → decide (policy) → integrity checks
        │     execute: precedence, then typed controls → AssistDecision', ceiling, reply filters, block
        │  [deliberate() only in the full arm, not shadow, not when they switched MR off, not during a
        │   freeze, and only if the fold names a reason; deterministic unless LOGOS_MR_DELIBERATE=on;
        │   whatever it picks is COMPOSED with what is in force]
        │
        ├─ assist = MR's narrowed move (or ACS's, when MR is off / not enforcing)
        ├─ planPresentation(questions = assist.questions) … turnContext += renderAllocation + MR block
        ├─ max_tokens = min(route ceiling, MR ceiling) + presentation room
        ├─ one streamed model call (or the held maths path)
        ├─ SentenceGate(drop: MR's replyGate ∪ tool claims) .finish(assist.questions)
        │     replyGate, quote-aware across sentences: every question when "stop asking" (hard); a check-in
        │     anywhere when questions were taken away; "you've improved" claims (not in a draft for somebody
        │     else, not on a safety turn). The held path runs the same gate, filter-only. An empty result
        │     sends the offers it removed rather than nothing.
        └─ finally: afterReply() measures the reply (content-free) → [mr] log line
                    → ledger rows via waitUntil (only where the privacy boundary allows)
headers: X-Socria-Assist (regulated move), X-Socria-MR (MR's trace), X-Socria-Runtime unchanged
```

MR text goes only into `turnContext` (after the history), never into the
cache-stable prefix. With `LOGOS_MR` unset or `off`, none of this runs: the
prompt, `max_tokens` and headers are byte-identical (`test/mr-route.test.mjs`).

---

## 2. The decision contract (`lib/mr/types.ts`)

Every adjustment is an `MRDecision`:

| Field | Purpose |
|---|---|
| `policyVersion`, `interventionId` | Attributable and reproducible. The id is a deterministic hash of policy, conversation, turn, rule and action. |
| `trigger`, `evidenceRefs` | The rule that fired; pointers `{turn, role, code}` into the conversation — never a quote. |
| `target`, `controls` | Which runtime component, and the typed controls (below). |
| `scope`, `expiration` | `turn` / `turns` / `conversation` / `standing`; the last turn it applies to and the codes that revoke it. |
| `confidence`, `uncertainty` | The weakest evidence it rests on; what MR does not know, as codes. |
| `evaluationPlan`, `rollback` | The outcome dimension it is meant to move and what to expect; what reverts it. |
| `loop` | `fast`, `deliberative` or `longitudinal`. |
| `constrainedBy`, `composedOf`, `carried` | What a higher layer took out of it; the members of a composed decision; made at an earlier turn or conversation. |

A no-action turn is still a decision (`action: 'none'`, with an id). The
ledger records no-action turns too; that is what makes a comparison
possible.

### Typed controls, and how each is enforced

| Control | Enforced by | Kind |
|---|---|---|
| `questionBudget {max, enforcement:'hard'}` | The reply gate drops **every** interrogative sentence of Socria's own, mid-reply too, on the streamed and the held path alike — never somebody else's words (a quotation, a `>` line, a table row, fenced code, a list introduced as questions — "Ask these:" — or a labelled one — "Ask: …?"), and never a question the next sentence answers (below). What it keeps, the stream gate's tail cap keeps too (`SentenceGate` `keep`). Used only for their explicit "stop asking". When they ask for questions as content this turn (a list of interview questions, a draft to a friend) it is lowered to `tail` for the turn, recorded as `user_instruction:questionBudget.hard`, and the question budget stays ACS's: the tail cap at 0 deleted the closing question of the email they asked for. | **hard** |
| `questionBudget {max:0, enforcement:'tail'}` | `assist.questions` → `SentenceGate.finish()` for the close, plus a check-in ("Does that make sense?", "Want me to compare?") dropped **anywhere** (`gate.dropCheckIns`) — only an offer-shaped question put to them, standing on its own ("Want me to…?", "Does that make sense?"), never a sentence of advice that starts "if you want", never a question Socria asks itself and answers ("Should I go for 16GB? Yes…"), and never on a turn whose questions are the content they asked for. An explicit question followed by exposition can still ship (it is rhetorical). | **tail** + check-ins |
| `questionWindow {max, turns}` | Spent → budget 0 this turn. Its line asks for their best answer now — under the Answer Guard or a withhold, for the next step or a hint instead, the answer staying theirs (`…:questionWindow.hint`). | tail |
| `verbosity {ceilingTokens}` | `max_tokens` lowered for the reply call. | **hard** |
| `strategy` (direct, execute, worked_example, preserve_challenge, edit_as_asked, guided) | Narrows ACS's move (mode, forced, scaffold) plus one instruction line. | move + prompt |
| `scaffolding`, `simplify`, `answerFirst`, `noRevealAnswers`, `verification` | Move fields where they exist, otherwise instruction lines. | prompt |
| (always, when MR is regulating) unsupported improvement claims | The reply gate drops "you've really improved"-type sentences in Socria's own words. Nothing one conversation holds supports one — a single engine-verified attempt is one observation and may echo the answer just given — so no verdict unlocks them. Not applied inside quotations, in writing they asked for (a draft for somebody else — "a note to my student Maya", or a revision of one: "make it warmer" — or any card, note, letter, speech or message asked for: "write a card for my son saying how much he has improved"), or on a safety turn. Armed on every regulated full-arm turn; the trace says so (`g=…c`), and a dropped sentence is an integrity row. | **hard** |

**What the reply gate never touches.** Each SENTENCE of Socria's own is
judged by itself — also where the stream gate does not cut, after "?**",
"!*", "._", an emoji, or inside brackets: "**Do you have a stud finder?**
Mark the studs first" loses the question and keeps the advice; "Pick the Air
(do you edit video?) unless you need ports" loses the bracket; "Yes, 3/4 is
6/8 (you've really improved at this), and the next one is…" keeps the next
one. These stay whole even when a sentence of Socria's own beside them is
taken out: a heading;
a `>` line; a table row (a cell ending in "?" is not a question put to
them); fenced code, an unclosed fence too (the gate's block hook tells the
filter where fences are, `sawBlock`, because the stream gate sends a fence
that arrives in pieces as a block of its own); a list right after a line that
introduces questions as content, wherever on its line the intro stands ("Ask
these:", "Bring your results. Questions to ask your doctor:", "Consider
asking:", "Make sure you ask:", "Things to clarify with the landlord:",
"Here are some questions for you to ask the landlord:", "Questions for your
doctor:", "Here's what to ask:", "Questions the interviewer may ask:", or a
heading or bold label of that kind with no colon, "### Questions to ask your
doctor") — never Socria's own
("Before I pick one, a few questions for you:", "Quick questions:", "A few
questions for your situation:", "Questions worth asking yourself:"); the
sentence after a label that hands them somebody else's words ("Ask: When
will the leak be fixed?", "At the end, ask: …?", "You could text: …", also
indented), and the line after one that ends its line ("At the end, you could
ask:\n\nWhat does success look like…?", "Here's a text you can send:\n\nHey
Sam, are you free on Friday?") — not "For example:", "Try:" or "Q:", which
Socria uses for its own; and anything inside a quotation. A quotation is followed across the
sentences the stream gate cuts, nested ones too: “…” always; ‘…’ and a
straight quote only where one can open (after a space, a colon, a comma, a
bracket, emphasis or a slash — `**"Would you mind…?"**`, `"Are you
in?"/"Are you free?"` — before a word; never `12"`, `5'10"`, "don't", "the
'90s", "the ‘90s", "'cause" or "'cos") and close (before a space or an end —
never the plural possessive inside a quoted phrase, "the kids' bikes", while
a quoted word like 'spices' and a phrase like 'thanks for having us' or
'thanks to the hosts' still close); never inside `inline code`. A blank line
closes anything left open. Emphasis hides nothing: "**What is your budget?**"
is a question. A piece of the stream that is only a line break is shown to the
filter too (`SentenceGate` `see`), so where a line ends never depends on how
the stream was cut.

**What is taken out leaves the text whole.** A line goes with its own line
break and leaves the others ("**Your progress**" stays a heading on its own
line; Socria's own sentence is never pulled into the quoted draft above it);
a sentence taken out whole leaves the paragraph or line break it carried for
the next one ("…first.\n\n## Step 2" stays two blocks, and a table after it
still renders); a numbered item goes with its number ("2." never stands
alone, also after a run of question items), and an item whose opening
question goes keeps its number ("1. **Do you overpronate?** Get a stability
shoe." and "1. Do you overpronate? Get a stability shoe." → "1. Get a
stability shoe."); a number with no item after it ("42.", the whole answer,
or "2." on a line of its own) goes out as written. A number the filter holds
is given back to the stream gate as a piece of its own, apart from its item,
whenever nothing of the item was taken out (the gate's opt-in `rewriteAll`),
so the gate reads "7. " and "Do you want them listed?" as it would without
MR: with nothing in force the text is MR unset's. What waits before a code
block goes out before it, and the fence still starts its own line;
whitespace goes out exactly as it came (indentation, hard breaks), and a
question on a line of its own goes with that line's break wherever the
stream cut it. A question aside goes alone ("Pick the Air — do you really
need ports? — unless you edit video." → "Pick the Air unless you edit
video."; "Book the train early (why? prices double in June) and…" → "(prices
double in June)"), and so does an improvement claim that is one clause of
its sentence ("Yes, 3/4 is 6/8 — you've really improved at this — and the
next one is…", "The answer is 7/8, **you've really improved**, and…",
"You've really improved, so here is a harder one: …" → "Here is a harder
one: …").

A question Socria answers itself is not put to them and stays with its
answer — in the same breath ("**Should I buy AppleCare?** Only if…"), in the
next sentence ("Is it safe to fly while pregnant? It is, until about 36
weeks."), on the next line ("**Do you need a visa?**\nYes, if…", "Q: Do I
need a visa?\nA: Yes, if…"), or a condition put as a question ("Want a
crispier crust? Leave it in five more minutes.": without it the advice would
read as an instruction). Answered in so many words ("Yes, …", "No, not
until…", "Only if…", "Because…", "It depends"), it stays whatever it asked,
because taking it out would leave an answer to nothing ("Does that fit your
shelf? Only if the alcove is 40 cm deep."). A question about THEIR mind —
what they feel, think, want or plan, their budget or their view ("How do
you feel about that?", "What is your budget?") — is answered by nothing
less. An adverb answers only standing as one ("Usually, yes." — never
"Always do that before an update."), and "It is…", "There are…", "You do…"
fit only a question of that form not put to them ("Is it…? It is…", never
"Do you have room for it? It is oak." or "Which phone do you have? It's
different on Android."). A question the next sentence only continues as an
offer goes, and the offer with it — short, one sentence, and nothing after
a colon ("Sound good? Then I will lay it out.", "Would you like a list? If
so, I can write one.", "**Want me to make a cut list?** I can do it in a
minute."); a recommendation or an explanation after it stays ("Do you
mostly browse? Then I'd get the Air.", "Curious how it works? I'll walk you
through it: it moves heat…"). "Got it?" is a check-in, never a condition;
"Do you have a stud finder? Mark the studs…" still loses its question.
All of it holds whatever size the stream's pieces are (`mr-review` runs
every case in pieces of 1, 2, 3, 5, 7, 13 and 16 characters and whole).

**Never an empty turn.** When MR's filters would leave nothing, the person
gets the offers that are not questions, or one fixed line from the integrity
monitor — "Understood." after a "stop asking", or, when what was removed was
a claim that they improved, "From one conversation I can't tell how much
you've improved — trying a new problem on your own would show it." These are
the only words MR ever puts into a reply (`lib/mr/index.ts EMPTY_REPLY_LINES`),
and an integrity row records that it did.

What is prompt-only is **measured** after the reply (`afterReply`: questions
over budget, answer-first violated → `control_violation` findings) and read
next turn by the outcome model (did the steps arrive, did they have to ask
again). It is never assumed.

---

## 3. Precedence (`lib/mr/execute.ts constrain`)

Top wins. Each layer can only take something **out** of MR's decision, and
what it took is recorded as `layer:control`:

1. **safety:** `signals.safety` or a safety move. Nothing changes — not the
   move, not the reply filters — and the decision is recorded with no
   surviving controls, as not enforced.
2. **user_instruction:** their words this turn, **as IFR confirmed them**
   (the newest turn's `explicit.*` codes), never readSignals' raw fields,
   which read "don't quiz me", "the exam will test me" and "let me know" as
   the opposite of what was said. If they ask for questions, MR does not
   lower the budget. If they ask for questions as content, a hard "stop
   asking" holds at the tail only. If they say they want to work it out, MR
   does not hand it over. If they ask for the answer or the steps, nothing is
   kept back that turn. Their length setting caps, and is never lengthened.
   Their MR switch, consent and privacy choices.
3. **app_policy:** the Answer Guard and a Core 4 withhold (their own quoted
   words, their Project, graded work). The guard binds on every turn it is
   up, not only on turns that read as maths — "just tell me the answer" has
   no maths in it, and is where loosening it would matter. MR may lower questions or
   change the explanation under them, but never give away what they keep:
   questions that did not help are cut as the next step or a hint, never
   "give your best answer now" (`…:questionWindow.hint`). A
   worked example becomes one of an ANALOGOUS problem under either (recorded
   as `…:strategy.analogous`), and ACS's check of their own attempt stays the
   move. A "heard" turn is left as room.
4. **acs:** what is left narrows `AssistDecision`.
5. **mr**

The one widening is a question kept in a quiz they asked for. It rests on the
user-instruction layer above ACS and is marked `mr:user_instruction:quiz`.

**Inconsistency with the proposal, recorded rather than changed.** The proposal
orders user instructions above application policy. The existing product
deliberately puts some invariants above explicit instructions. Graded-work
integrity holds against "just tell me", and "just write it" still keeps the
substance of someone's own writing theirs (`lib/core4/allocation.ts`,
`lib/conversation-style.ts`). MR sits at the bottom and does not change that
ordering. Changing it is a product decision, not something MR should do
quietly.

---

## 4. The seven modules

| Module | File(s) | What it does |
|---|---|---|
| 1. Metacognitive State Engine | `lib/mr/state.ts` | Folds the conversation turn by turn (observe → outcome → expire/revoke → decide → integrity) into a versioned `MRState`: their words from every turn, the counts over the last 24. Goals and preferences are stored as codes with provenance, and the state holds no text. Deterministic given its inputs (transcript, policy, condition, ACS's move, verdicts, length, carried facts, reset); the ledger does not keep all of those (MR-RESEARCH §3). |
| 2. Cognitive Outcome Model | `lib/mr/outcome.ts` | Six separate dimensions per decision, never summed. Task completion (structural), satisfaction (their words only, never counted as learning), friction (counts), independent performance (one engine-verified attempt after a reply that kept the answer back), retention and autonomy (always `unknown` in a conversation). `regulation` (keep/revert/inconclusive) is for regulation only. |
| 3. Intervention Policy Engine | `lib/mr/policy.ts` | Deterministic rule table (§5). Explicit words act at once. Moderate observations act for a few turns and then expire. Weak signals never act. Dwell, freeze and composition rules prevent flapping. |
| 4. Causal Evaluation System | `lib/mr/experiment.ts`, `evals/mr/` | Arms (baseline, prompt_reflection, state_only, full; IFR on/off; shadow), stable salted-hash assignment with consent, exposure logging, the benchmark, seeded bootstrap analysis with evidence labels. |
| 5. Regulatory Execution Layer | `lib/mr/execute.ts`, the route | Precedence, then controls compiled into the move, the ceiling, the reply gate and instruction lines. |
| 6. Longitudinal Adaptation Engine | `lib/mr/adaptation.ts`, `lib/mr/config.ts STRATEGIES` | Versioned strategies. Only stated "from now on" preferences carry across conversations, and only with consent. Promotion verdicts and evidence levels for offline evaluation reports. **No automatic policy learning.** |
| 7. Metacognitive Integrity Monitor | `lib/mr/integrity.ts` | Run on every turn: the contract and authorisation of every decision (`checkDecision`; `assertDecision` makes a rejected one fail loudly under test), oscillation, excessive intervention, goal drift (`checkHistory`), task regression, the latency budget, unsupported improvement claims (the reply gate). Run where they apply: the deliberation cost budget (`checkCost`, in `deliberate`), the privacy boundary (`checkPrivacy`, the route's store gate). Not run by the product: proxy gaming (`checkOutcomeUse`) — the product makes no outcome claims; it is for analysis code. Actions: reject, freeze, revert, drop sentence, block write. |
| Interaction Friction Regulation | `lib/mr/ifr.ts` + the `ifr.*` rules | §5. |

Also: `lib/mr/index.ts` (the fast loop, `afterReply`, the trace),
`lib/mr/deliberate.ts` (the deliberative loop), `lib/mr/ledger.ts` +
`lib/mr/store.ts` (persistence), `lib/mr/research.ts` (research export
shaping), `lib/mr/words.ts` (plain words for the settings page).

---

## 5. Interaction Friction Regulation and the rules

**Readers** (`lib/mr/ifr.ts observeTurn`) produce `Observation`s with
provenance, strength and confidence. They are English regular expressions
applied to `speech()`, so quoted text is not read as an instruction.

- **explicit**: direct answer (incl. "just pick one", "you decide"), show
  the steps, stop asking, wants questions, quiz, end of practice, shorter (a
  complaint or a one-off length), longer, simpler, verify, own work, edit
  only, learning goal, confused, revoke (scoped: questions or everything),
  positive/negative, frustration (their word only), standing.

  **What STARTS something is read strictly; what ENDS it, generously.** A
  false reading of an instruction that starts something — a quiz, "let me try
  it first", a "stop asking", "shorter", edit only, a standing preference —
  changes how somebody is helped who asked for nothing: those are read only
  addressed (below). A false reading of words that END something MR keeps in
  force only returns the turn to how it would be without MR, while a MISSED
  ending keeps an old instruction in force against their newest words. So
  endings are read where they are said, hedges included: "I think you can
  ask me questions again", "I guess you can quiz me again", "turns out I do
  want you to ask me questions", "why don't you ask me some questions?",
  "feel free to ask questions", "questions are fine", "ask me a question";
  "don't quiz me anymore", "stop testing me", "let's stop", "I'm done now",
  "end quiz", "let's wrap this up" (and "I'll do another one next week" does
  not keep a quiz going); "more details", "too short", "longer please",
  "describe it in detail", "the long version", "you don't have to keep it
  short", a length of 500 words or more; "now rewrite it", "add a
  conclusion", "change my wording" after "just fix the grammar" (never
  "can you rephrase that explanation?", which is about Socria's words, nor
  "redo the same fixes on this paragraph"). Inside a
  running quiz, anything asked for but its next question — "just tell me",
  "the capital of Kenya", "a cheat sheet of the capitals", "I give up, what
  is it?" — ends it, and so does declining Socria's "Want another one?" ("No
  thanks.", "I'm good.", "Maybe later.", "No, that's enough.") or "that's
  enough capitals for today"; "just give me the next one", "tell me if I'm right",
  "you pick the next country" are how it runs. So is an answer, however it is
  put ("What about Nairobi?", "Give me a sec… Nairobi?", "Who is
  Shakespeare?", "Yes, that's enough." to "Is there enough O2?"), a hint
  asked for ("the first letter", "a clue", "multiple choice", "give me a
  hint"), the next item in other words ("just give me one", "a word to
  translate"), "that's enough easy ones, give me a harder one", and "Yes,
  that's enough." where the question asked about enough ("Is there enough
  O2?"). A quiz asked for in the same message as a stop is the quiz, in
  either order ("Quiz me on verbs and stop asking me questions about it"). A quiz asked for after a stop
  in the same message is the newest word ("stop asking me what I want, just
  quiz me"); "stop asking me so many questions at once" is not a stop.

  **Addressed to Socria, or nothing.** The instructions that start something
  — a quiz, a "stop asking", "shorter", edit only, "show me the steps", and
  their own "let me try it first" — count only where, inside their clause,
  nothing stands before them
  but a lead-in: fillers ("ok so", "please", "actually", "from now on") and a
  request frame ("can you", "I want you to", "let's", "you can"); and where
  their sentence does not put them off ("quiz me next week", "you can test me
  tomorrow", "later, not now" — a time word that dates something else does
  not: "quiz me on hiragana before my test tomorrow", "quiz me now because I
  fly out tomorrow"; a stop with an end is still a stop now: "stop quizzing
  me until tomorrow"). So "my sister likes to quiz me", "is there a
  website that can quiz me", "I did not ask you to quiz me", "instead of
  trying to quiz me", "don't stop asking me questions", "why did you stop
  asking me questions?", "my teacher told me to stop asking", "how long does
  it take to get back to normal", "go back to asking my surgeon", "no short
  answers please", "the long version, not the short one", "last time you
  fixed only the typos" are none of them instructions, and MR does nothing
  with them (a miss is the turn without MR). readSignals' own "stop asking"
  and practice readings are confirmed this way, never taken raw. A bare
  question asked back ("Go back to asking me questions? No, keep it as it
  is.") revokes nothing. "Exercises" alone is not a quiz ("exercises to
  strengthen my knee"); a quiz "that I can give my kids" is theirs to give.
  Edit-only never stands beside a rewrite or new text they asked for
  ("rewrite it completely, but keep my voice", "keep my style and add a
  conclusion"). "My boss wants shorter replies to customers", "my emails are
  a wall of text" and "our teacher wants us to show the steps" are somebody
  else's. A restated stop is never questions asked for as content ("make sure
  not to ask questions", "facts not questions", "without questions").
  Somebody else's words after a colon or a dash are theirs ("She said: no
  more questions", "Her text just says: stop asking me questions", "Feedback
  from my boss: get to the point"), and words named rather than said start
  nothing ("'Get to the point' is my manager's favourite phrase", "Quiz me is
  what my little brother says"), nor do words after a comma behind a
  speaker or a sign ("My mom always says, stop asking me questions", "He
  texted, no more questions please", "The sign on his door, stop asking me
  questions, …") or a slogan ("Our slogan: keep it short"). Asking to be
  questioned as the means of a request is asking for questions ("Help me
  practise for my theory test by asking me questions"); a complaint about
  it is not ("Please stop wasting my time by asking me questions"). "Make
  it shorter. Actually, no — make it longer" asks for longer. "Keep my
  voice" beside a revision is what the revision keeps ("Make it more
  persuasive, but keep my voice"), and saying what not to do keeps
  edit-only ("Just fix the grammar. Don't rewrite it or add a
  conclusion."). Their own
  goals are not requests to Socria: "I need to get to the point in my
  presentations", "I want to practise piano", "give me 3 problems with
  nuclear energy", "can we do a quiz night at work?" start nothing. A stop
  about one subject ("quiz me, and stop asking me questions about my level")
  is not a stop; "…about it" is. A take-back must open its sentence (after
  a hedge: "I think", "I changed my mind,"): advice ("In an interview, you
  should ask questions"), their own plan ("I need to get back to asking
  questions in class") and "I want to get back to normal" take nothing back.
  Refusing length keeps "shorter" ("Don't give me the long version", "Spare
  me all the details"), and so does the length of something else ("the long
  version of the film", "my essay has to be 2000 words").

  **"Let me try it first" is not a quiz.** "Let me try it first", "hints
  only", "just a hint", "don't tell me the answer" keep the answer to THAT
  problem theirs (`explicit.own_try`, below): no question is added, their
  "stop asking" stands, and it ends when they ask for the answer, end it, or
  move on to something else ("Great. What is the capital of Australia?",
  "Tell me about the French Revolution.", "How do I solve 3x + 5 = 11?"). It
  is never read beside a how-to or a what-next question ("I'd like to do it
  myself. How do I change a car tyre?", "Let me try it first. If it does not
  work, what is plan B?", "How do I replace the 12V battery?") — unless
  that question is the exercise, with working in it ("What is the derivative
  of x^2 sin x? Let me try it first.", "Solve 2x + 3 = 11."). A hint asked
  for, or a short question back about the problem ("The product rule?" after
  "Which rule applies?"), keeps it; a new problem ends it, also put as an
  imperative ("Solve 2x + 1 = 7.", "Now a new problem: what is 7 * 8?").

  **A "from now on" is in force everywhere until their take-back.** A
  preference carried in from another conversation holds here from the first
  turn it was carried in (this conversation's own rows say which,
  `carriedIn`): words said here before it existed never end it ("feel free
  to ask me questions", then, elsewhere, "from now on, stop asking"), and
  words said since lift it here for good (a quiz, "ask me some questions to
  help me pick a laptop", "more detail" for a "shorter") — and nowhere else.
  Only their words taking it back ("you can ask me questions again",
  `explicit.revoke`; never a request for questions IFR reads as one) end it
  in every conversation; so do Reset, "forget what Socria worked out", and
  deleting the conversation it was said in. The same holds in the
  conversation it was said in: a quiz there lifts it there, and saying the
  same thing again without "from now on" ("Stop asking me questions.", "Just
  give me the answer: serif or sans?") neither ends nor narrows it. A
  learning goal stated ("I'm learning Spanish. What's the word for apple?")
  does not override "just give me the answer" either, and neither does
  readSignals' own "hint" in "give me the answer, not just a hint".

  **Standing** needs the horizon words and the instruction in one clause,
  and the instruction leading it: "from now on, stop asking me questions",
  "stop asking me questions from now on", "from now on I want short answers",
  "please always give me the answer first" — not "just give me the answer.
  From now on, the deadlines are stricter at my school", nor "you never give
  me a straight answer", nor "my mom said always ask for help", nor "from now
  on our teacher wants us to show the steps". Held to this conversation: "for the rest of
  this chat", or open-ended words with "in this chat", "only here", "until
  we're done" — standing for the conversation and never carried across.

  **A quiz and the answer in one message.** A later clause that asks for the
  answer or the steps after a quiz is read three ways. Taken back — it opens
  on a retraction ("no", "wait", "actually", "or rather", "instead", "changed
  my mind", "I take that back"), or a clause only cancels: "quiz me — no,
  just tell me the answer", "quiz me on these. Actually just tell me which one
  is right", "no wait, just answer my question: what is…?", "quiz me on
  mitosis. Actually, no, just explain it", "no — explain prophase instead":
  after a "no", whatever follows is what they now want, and the quiz is not
  read at all. How the quiz runs — a condition on their answers ("if
  I miss one", "for the ones I get wrong", "…tell me if I got each one
  right"), a time in it ("afterwards", "at the end", "then show me the
  steps"), what it hands them ("just tell me right or wrong", "just give me
  10", "feedback"), what they will do ("…and I'll name it"): the quiz stands.
  Neither — MR does not choose: it enforces neither, ends nothing (a "stop
  asking" in force stands, and holds that turn), and leaves the message to
  ACS (the fold names the conflict); the quiz's answers are still answers
  ("Lima" is not a reply that moved nothing). "Let's move on" or "let's
  switch to harder ones" inside a quiz is the next question. A complaint is
  not a request: "you quiz me every time" asks for no quiz.
- **observed**: question streak, unproductive questions (asking replies whose
  answers did not advance anything — never during a quiz they asked for,
  where "Lima" is an answer; a stated learning goal is not a quiz), repeated
  confusion after explanations, failed attempts (engine-refuted, and this
  turn an attempt: "thanks, that makes sense" is not one), verified
  correct/incorrect, repeated request (the same
  request again, adding no new content word: "…the Ottoman empire" after
  "…the Roman empire" is the next item, not a repeat), verbose replies,
  routine task (ACS's own fact/computation reader or the engine having
  computed the answer, not the runtime's coarse work reading), writing task,
  practice.
- **weak** (hypotheses, never acted on): short reply ("ok", "k"), terse run.
  A short message never yields frustration or unproductive questions on its
  own.

**Rules** (`lib/mr/policy.ts RULES`, priority order):

| Rule | Family | Action, controls | Scope |
|---|---|---|---|
| `ifr.explicit.stop_questions` | ifr | fewer_questions, **hard** q0 | conversation (standing only with open-ended words and consent) |
| `ifr.explicit.show_steps` / `direct_answer` | ifr | direct, answer first, q0 tail | 2 turns (`momentaryTurns`), or the conversation if standing |
| `mr.explicit.quiz` | mr | preserve_challenge, no reveal, q1 | conversation, until they ask for the answer (or anything but the next question), stop the questions, or end the practice |
| `mr.explicit.own_try` | mr | guided, no reveal (no question added) | until they ask for the answer or the steps, end it, or move on to a question about something else |
| `ifr.explicit.shorter` | ifr | ceiling (360 tokens) | conversation, or one reply for a one-off length |
| `mr.explicit.simpler` / `verify` / `edit_only` | mr | simplify; verify out loud; edit only what was asked, q0 | 3 turns; 1; 3 (or until they ask for a rewrite) |
| `ifr.observed.unproductive_questions` | ifr | q0, at most one asking reply in 3, **answer now from what they said** (under the guard or a withhold: the next step or a hint) | 3 turns |
| `ifr.observed.repeated_confusion` | ifr | worked example, more scaffolding, simpler, q0 | 1 turn, then guided work resumes |
| `mr.observed.failed_attempts` | mr | worked example (analogous under a withhold) | 1 turn |
| `ifr.observed.repeated_request` | ifr | answer first, q0 | 1 turn |
| `ifr.observed.verbose_replies` | ifr | ceiling | 3 turns |
| `ifr.observed.routine_task` | ifr | execute, q0 (only when ACS was about to make it an exercise) | 1 turn |

**Against flapping:** an observed rule may not change a strategy that MR set
fewer than 2 turns ago (`minDwellTurns`). More than 3 strategy changes in 6
turns, or MR acting on more than 75% of the last 8 turns, freezes observed
rules (and the deliberative loop) for 3 turns and rolls MR's own adjustments
back. Their words still count during a freeze. A return after an outcome
rollback or a planned expiry is a correction, not a change of course, so it
never counts as a flip. An outcome that went wrong rolls back MR's
adjustment, but **never their own instruction**: only words the rule lists
(its `onRevoke`) end it — "that doesn't answer it" is about the reply, not a
"you can ask questions again". A reply that ignored "stop asking" leaves
"stop asking" in force and records a `control_violation`. Each adjustment's
outcome is judged against the controls actually in force when the reply was
written (a worked example inside a quiz kept the quiz's one question).

**Composition** (`compose`): several adjustments in force combine into one
decision: the tightest question budget, the lowest ceiling, and for the
strategy their newest words. The exception is a worked example made this
turn, which takes its one turn even inside a quiz. The quiz's question (and
its "do not reveal the answer") is kept only while the quiz is the move, or
the worked example inside it — a newer instruction of theirs ("just fix the
grammar") is not edited as a quiz. The deliberative loop composes the same
way: it can narrow what is in force, never lift their instructions; its
"none" leaves everything as it is, and its "revert" ends only MR's own
adjustments.

**The proposal's scenarios** (all in `test/mr-core.test.mjs` and through the
route in `test/mr-route.test.mjs`):

- **A — "just show me the steps":** given at once, no diagnostic question.
- **B — "quiz me":** challenge kept, answers not revealed, questions kept even
  though ACS's own budget would end them after three asking replies.
- **C — routine calculation:** executed, but only where ACS was about to turn
  it into an exercise.
- **D — failed explanations:** a worked example, then guided work again. An
  analogous example under a withhold.
- **E — their essay:** only the edits asked for. No rewrite, no lesson.

---

## 6. State, persistence, privacy

**What is stored.**
- `mr_ledger` (`supabase/schema.sql`): append-only, content-free rows. 180-day
  retention: never read or exported past it; purged at write for the person
  writing, and daily for everybody by `/api/cron/lifecycle` (`purgeExpired`,
  bounded).
  - **exposure**, one per regulated turn: arm, IFR, shadow, source,
    experiment, action, ids in force, MR ms, every rule their words have
    revoked in that conversation so far (repeated on each later row), whether
    the decision changed the reply (`enforced`), whether a model was asked
    (`modelDeliberated`), `local` for a conversation kept to itself, and
    `resetTurn`. Only a "from now on" (said there or carried in) taken back
    in their own words is listed as revoked (§5) — never one taken back
    before their last reset, and never an instruction for that conversation
    alone, whose rule a "from now on" elsewhere may share. `carriedIn` lists
    every preference carried into it so far, lifted there or not.
  - **decision**, one per decision made: the `MRDecision` itself as it was
    made (the controls asked for, and in `constrainedBy` what a higher layer
    took out that turn), which holds no text.
  - **outcome**: an `OutcomeVector`.
  - **integrity**: a finding.
  - Records are sanitised on write and on read. Any string that is not a
    printable-ASCII code with no whitespace refuses the whole record.
- `user_profiles.mr` (jsonb): their settings.
  - `enabled` (default on).
  - `carryAcross` (default **off**): carry "from now on" preferences into
    other conversations.
  - `resetAt`.
  - `research` (set only by an approved study's consent flow; `/api/mr`
    refuses it).
  - two server-kept, content-free markers, never shown by `/api/mr`:
    `revokedStanding` (the rules their words took back, by rule and time —
    so a "you can ask me questions again" outlives deleting the conversation
    it was said in; only one said at the turn being written, never one a row
    says again; and a turn never creates their profile row for it) and `forgotten` (hashes of conversations deleted in the
    last day, so a turn still in flight cannot write rows for one).

**When nothing is written.** No user (guest), a shared room or line of thinking,
a node's side thread, any turn whose messages carry an author (a room, even
with one person present), sharing that could not be confirmed, off the record
(`logosPersistPolicy` = none, read over the WHOLE conversation, not the
model's history window), incognito true **or unreadable**,
`LOGOS_MR_STORE=off`, or the ledger read failed for the turn — the integrity
monitor's `checkPrivacy` decides, and the `[mr]` line says why as codes
(`store=0:…`). A conversation kept to itself (`conversation_only`) never
carries its preferences elsewhere, including ones said before it became
one. "For the rest of this chat" is never carried, whatever the setting. When
their MR switch is off, only a bare exposure row is written: nothing of
theirs is folded, not even as a would-be decision.

**Where nothing of a turn is kept, one of their choices still counts.** In an
incognito or off-the-record conversation no row is written — but taking back
a carried "from now on" in their own words ("you can ask me questions
again") goes into their settings as a rule and a time (`revokedStanding`),
so it stops crossing into other conversations.

**What carries.** A "from now on" from another conversation is carried
while its own conversation's rows are there and nothing has ended it
everywhere (§5): what holds in its own conversation now does not decide it.

**An account deleted while a turn streams.** The turn writes nothing when
their profile was there when it began and is gone when it writes (account
deletion removes it), and a revocation never creates a profile row.

**Going off the record deletes nothing.** MR stops recording from that turn
on, as the Mind Graph does. What it kept of the conversation before holds no
text (codes, ids, times) and stays, and a "from now on" said earlier in it
is still carried. No reading of their words is a reason to delete: three
rounds of review each found everyday sentences that a reader took as their
word to delete what MR kept ("When I talk to reporters, it's off the
record", "Don't save any of this to the spreadsheet yet", a reply quoting
Socria's own "Open with 'This is off the record'"). What deletes is an
action of theirs, never a reading: "Forget what Socria worked out", Reset,
deleting the conversation, deleting the account. What MR may keep is the stricter of the persist
policy over the model's history window and over the whole conversation (an
"off the record" forty turns ago still holds; an old one later lifted does
not loosen the window's reading); an older message is read in full to its
first 4,000 characters and, past them, wherever it mentions the record —
read as one text, so an "off the record" across the 4,000th character, or
followed in the same message by "remember this ratio", still holds as it
would in the whole message (`recordPieces`). The Mind Graph keeps its
own reading over the window, exactly as before MR (with MR off nothing
changes); that it can lose an "off the record" said before the window is a
gap of the Mind Graph's that predates MR, not fixed here.

**Reads fail closed.** If the settings read fails, MR is off for the turn
(their "off" might be unreadable).

**Their controls.**
- **Manage Account → Personalization → "How Socria adjusts to you":** MR
  on/off, carry across conversations, the latest adjustments in plain words,
  and Reset. The section is shown only where MR is `on`; shadow mode has
  nothing to offer.
- **`/api/mr`:** GET, PUT (`enabled`, `carryAcross` only; the answer carries
  the settings' stamp, and the sheet adopts only the newest), and DELETE (one
  conversation, or everything plus `resetAt`). A reset that removed the rows
  but could not save its stamp answers `{ok:false, deleted:true,
  stamped:false}`, and the sheet says to reset again.
- **What Reset does.** It stamps `resetAt` first, then deletes their rows.
  In every conversation Socria kept a record of, the adjustments MR made on
  its own end from their next message there (the fold's reset boundary);
  what they asked for in their own words still holds in the conversation
  they said it in; nothing from before is carried into another
  conversation. A conversation nothing was recorded for (incognito, off the
  record) has nothing to reset. "Forget what Socria worked out" stamps the
  same reset first; deleting a conversation marks it forgotten first.
- **Account deletion, export, "forget what Socria worked out", and conversation
  delete** all include `mr_ledger`. Export and delete are test-enforced (as for
  every table); forget and the conversation cascade have their own tests.

**Migration.** `schema.sql` and `rls.sql` are idempotent and additive: one
table, three indexes, one nullable column, RLS enabled, forced and revoked.
They must be applied by hand (docs/MANUAL-SETUP.md). Until they are, the store
reports `ok:false`, MR still regulates from the transcript, and nothing is
written. **Rollback:** `LOGOS_MR=off` (or a code revert). With MR off nothing
new is written; GET `/api/mr` and the export still show what is there, and
the daily purge still removes rows past 180 days. Dropping the table or the
column is a separate, destructive decision.

---

## 7. Switches (`lib/mr/config.ts`, read per call)

| Switch | Default | Means |
|---|---|---|
| `LOGOS_MR` | **off** | `shadow`: decide and trace, enforce nothing. `on`: enforce. Anything unrecognised is off. |
| `LOGOS_MR_ARM` | `full` | `baseline`, `prompt_reflection`, `state_only` or `full` when MR is on (for comparisons). |
| `LOGOS_IFR` | on | `off`: the `ifr.*` rules are not enforced (the IFR-on/off factor). They are still folded, and recorded as `not_enforced`, so both arms measure the same things. |
| `LOGOS_MR_POLICY` | current | Pin an earlier policy version (rollback). An unknown pin is ignored and reported. |
| `LOGOS_MR_DELIBERATE` | off | `on`: the deliberative loop may make one small structured model call (tracked as `logos/mr`), at most 2 per conversation (counted from the ledger's exposure rows that record a model call; where the count cannot be read, or the conversation's turns are not recorded — incognito, off the record — no model call is made), 1.5 s timeout, choosing only from a menu that precedence filtered. Never for somebody who switched MR off, in shadow, or in a comparison arm. |
| `LOGOS_MR_STORE` | on | `off`: never read or write the ledger. |
| `LOGOS_MR_EXPERIMENT` | none | The active experiment enrolled (consented) participants are in. |
| `OPENAI_MODEL_MR` | the memory model | The deliberation model. |

Vercel env changes apply from the next deployment.

---

## 8. Measured

All numbers come from the suites and the benchmark, run in this checkout.

- **MR's own time per turn:** mean 1.0–1.5 ms per arm across the benchmark's
  warm runs. Long conversations, warm (the median of each of three runs, on a
  shared machine whose timings varied by half): 80 messages 8–10 ms, 400
  short messages 19–25 ms, 400 messages of 2,000 characters 92–117 ms in the
  fold alone (the seventh round's readers added about a fifth; a reader that
  was quadratic on a long reply with no question mark was found by profiling
  and made linear) (over the 40 ms budget, which is then recorded as a
  `latency_budget` finding; through the route, with every other reader of a
  long conversation, more). Reading the costly instructions only where they
  are addressed (§5) added about a millisecond at 80 messages and five at 400
  long ones. Every
  message is read in full, because reading part of an old one turned quoted
  words into instructions and dropped instructions said in the middle. The first MR call in a process pays for compiling the patterns
  (57–151 ms across runs, the slower with other work on the machine;
  the benchmark's untimed warm-up absorbs it).
  An 81-message conversation regulates in a median under 40 ms (`mr-core`). A
  61-message conversation through the route stays under its 40 ms budget
  (`mr-route`).
- **Model calls:** one per turn in every arm (`mr-eval`). The deliberative loop
  adds one only when switched on, in the full arm, and triggered — at most two
  per conversation (`mr-route`).
- **Prompt:** 0 extra tokens on most turns, about 50–80 tokens on a regulated
  turn (210–320 characters), and nothing in the cached prefix. The
  prompt-only reflection arm adds about 75 tokens on every turn.
- **Persistence, after the stream:** a settings read, one upsert, a second
  settings read (a reset or delete that landed meanwhile is honoured), at
  most one purge delete, and a settings write only when the turn recorded a
  revocation not yet in their settings. The prior-state read starts before
  the allowance checks, its reads run together, and it is bounded (800–900
  ms). With carry-across on (their opt-in), the read of standing preferences
  needs their settings first: one more round trip, bounded at 900 ms, and
  skipped when the conversation's own read already failed.
- **Benchmark (simulated assistant; `node evals/mr/run.mjs`; 14 scenarios ×
  6 arms × 2 profiles, after an untimed warm-up, arms in rotated order).**
  "Questions" counts every question put to the person — explicit, disguised,
  and offers or check-ins. Means with 95% bootstrap intervals over scenarios
  (seed 7); the difference is paired, full − baseline:

  | | baseline | full | full − baseline |
  |---|---|---|---|
  | Unnecessary questions (question-prone) | 1.00 [0.43, 1.79] | 0.00 [0.00, 0.00] | −1.00 [−1.79, −0.43] |
  | Unnecessary questions (compliant) | 0.14 [0.00, 0.36] | 0.00 [0.00, 0.00] | −0.14 [−0.36, 0.00], includes zero |
  | User-control compliance (question-prone) | 0.33 [0.11, 0.67] | 1.00 [1.00, 1.00] | +0.67 [0.33, 0.89] |
  | User-control compliance (compliant) | 0.63 [0.33, 0.89] | 1.00 [1.00, 1.00] | +0.37 [0.11, 0.67] |
  | Task success (question-prone) | 0.55 [0.27, 0.82] | 1.00 [1.00, 1.00] | +0.45 [0.18, 0.73] |
  | Task success (compliant) | 0.73 [0.45, 0.91] | 1.00 [1.00, 1.00] | +0.27 [0.09, 0.55] |
  | Turns before useful help (question-prone) | 1.27 [0.45, 2.18] | 0.00 [0.00, 0.00] | −1.27 [−2.18, −0.45] |

  - Prompt-only reflection and state-only sit between: on the question-prone
    profile, 0.86 unnecessary questions each, compliance 0.33. Full MR
    without IFR: 0.93 and 0.67.
  - Shadow is identical to baseline in every scenario.
  - The ledger wrote 581 rows; none held anything that looks like text.
  - "Turns before useful help" counts the turns played when no reply was
    useful, so it is a lower bound (5 such baseline runs, none in full).
  - The question-prone simulator's mid-reply slip is a check-in ("Does that
    make sense?"). The full arm's 0.00 shows that the check-in filter
    (`gate.dropCheckIns`) catches that form; an earlier build, which counted
    only Core 4's question load, reported 0.29 → 0.00 while those check-ins
    still reached the person.

  These numbers are about the control plane and a simulator, not about
  people or a real model.

---

## 9. Tests

- **Pure modules:** `mr-core`, `mr-ifr`, `mr-outcome`, `mr-integrity`,
  `mr-experiment`, `mr-adaptation`, `mr-research`, `mr-words`.
- **The adversarial review's findings, held down:** `mr-review` (the control
  loop, precedence, the deliberative loop, the reply gate, the arms), plus
  the route findings in `mr-route` and the persistence ones in `mr-store`,
  `mr-api` and `mr-settings-ui`.
- **Persistence and API:** `mr-store` (through the fake database), `mr-api`.
- **The real route:** `mr-route`.
- **The settings UI:** `mr-settings-ui` (jsdom).
- **The benchmark:** `mr-eval`.

The existing privacy suites (`rls-covers-schema`, `account-data-complete`,
`core4-data-inventory`) cover the new table, and the whole suite runs green
with MR in place.

The proposal's 18 required cases map as follows:

| Case | Covered by |
|---|---|
| 1. Direct answer | A |
| 2. Repeated Socratic questioning | unproductive questions |
| 3. Calculus tutoring | D |
| 4. Guided discovery | the hint scenario |
| 5. Independent practice | B |
| 6. Essay | E |
| 7. Routine | C, groceries |
| 8. Research | verify; a comparison is not routine |
| 9. Preference change | stop, then revoke; "that's enough for today" ends a quiz; an instruction older than the fold window still holds, and so does taking it back |
| 10. Ambiguous signals | "ok" / "k" |
| 11. Conflicting objectives | graded work vs "just tell me"; "quiz me — actually just tell me" in one message and across turns; "keep it short, but more detail" (deliberation) |
| 12. Expiry | momentary requests fade |
| 13. Rollback | outcome revert; integrity freeze; pin; reset |
| 14. MR off | byte-identical route |
| 15. Persistence and privacy | ledger gates, consent carry, deletion |
| 16. Failure recovery | MR fault, settings read failure, store absent |
| 17. Latency and cost | timings; one call per turn |
| 18. Unsupported improvement claims | the gate and `IMPROVEMENT_CLAIM`; never unlocked by one verified attempt; drafts and quotations left alone |

---

## 10. Status

**Implemented and tested:**
- the fast loop
- IFR and the rule table, including the end of a quiz, the newest-clause
  rule, conversation-bounded standing words and series-aware repeats, and the
  costly instructions read only where they are addressed to Socria
- precedence, on IFR-confirmed words
- typed controls with hard/tail/prompt enforcement as stated, the check-in
  filter and the reply gate on both paths (quotations, tables, code, listed
  questions and numbered lists left whole; line and paragraph breaks kept;
  tested at stream pieces of every size from 1 to 13 characters and whole)
- the state fold (their words from every turn), expiry, revocation, rollback,
  dwell, freeze and the reset boundary
- the outcome model's six dimensions with explicit unknowns, judged against
  the controls in force
- the integrity checks run in the product (§4) and their actions
- arms folding the same rules, shadow, the IFR factor (not-enforced
  decisions), policy pinning
- stable assignment
- the ledger with content-free sanitising, retention, gating and fail-closed
  reads
- deletion, export and forget coverage
- `/api/mr`
- the settings section
- the deliberative loop: its gating, composition, freeze, budget and menu
  validation, the deterministic path and the model path with a stubbed model
- the benchmark and its analysis
- every confirmed finding of the adversarial review, as regression tests
  (`mr-review`, `mr-route`, and the persistence suites)

**Implemented, not independently verified:**
- How a real model follows MR's prompt-level controls (strategy lines,
  simplify, verify): only `--live` runs would show it, and none has been run
  here.
- The deliberative loop's model-assisted path against a real model.
- The migration against a real Supabase instance.
- The settings section in a real browser session (it is tested with jsdom).
- `checkOutcomeUse` (proxy gaming): tested, and not run by the product, which
  makes no outcome claims; analysis code should run it before reporting one.

**Partially implemented:**
- Graded question budgets beyond 0/1. The budget is binary end to end; the
  `questionWindow` control approximates "fewer".
- Verification. Prompt and measurement only; the held path checks maths only.
- Detection. English-only regex readers with documented misses. What starts
  an adjustment is read only addressed (§5), so a request with a lead-in the
  reader does not know is missed and MR does nothing: "Why can't you stop
  asking me questions?", "Can you be more concise?", "Explain it simply and
  always give examples" (the "always" after another instruction). What ends
  one is read generously, and can end it on words that only sound like an
  ending (the turn is then as without MR). A message with two instructions and
  horizon words attached to one of them makes both standing.
- "Let me try it first" ends on a new question that shares no word with the
  problem it was said about; a question about the same problem in entirely
  new words ends it too.
- Going off the record keeps the turn (and the rest of the conversation,
  until "back on the record") unrecorded, and deletes nothing MR kept of the
  conversation before (content-free rows; a "from now on" said there keeps
  being carried until they take it back, reset, or delete the conversation).
  This is by design (§6): a reader of their words deleted data on everyday
  sentences in three review rounds.
- Where this conversation's rows cannot tell when a carried "from now on"
  was carried in — an unrecorded conversation (incognito, off the record), a
  ledger read that failed, a turn whose carried preferences could not be
  read — it holds from the newest turn: a quiz there lifts a carried stop for
  that turn only, and a take-back said on such a turn whose settings write
  failed twice is lost. Saying it again lifts or ends it.
- An account deleted while a turn streams, for someone with no profile row
  when the turn began: that turn's content-free rows are written, and stay
  until the 180-day purge.
- The reply filters read English sentence shapes. A question Socria answers
  itself stays only when the answer says so in so many words or its form fits
  the question; an FAQ answer that opens any other way ("About two weeks.")
  loses its question, and a question put to them answered "Only if…" or
  "No, …" keeps it ("Does that fit your shelf? Only if…"). An offer's
  continuation goes with it only when it opens as one ("I can…", "Then I
  will…", "If so, I can…"), is short and has no colon. A claim the stream
  gate split at an abbreviation ("by 7 a.m. today, which shows you've
  improved") loses only the part after it, leaving a fragment.
- Rooms. MR stays out of any turn whose messages carry an author and any turn
  whose sharing could not be confirmed; the client does not yet send an
  explicit room flag when only one person is present (that file is being
  changed separately).
- Drafts for somebody else are recognised by a named recipient ("to my
  boss", "for my son", "to Sam") or a short revision right after one; a draft
  asked for in other words gets the question filters of an ordinary turn
  (the claim filter stays off for any card, note, letter, speech or message
  they asked for).
- A list right after a line that introduces questions as content ("Ask
  these:") is kept whole, a question of Socria's own in it included.
- THE CORE STREAM GATE SPLITS A FENCED BLOCK THAT ARRIVES IN PIECES
  (`lib/core4/stream-gate.ts`, before MR and with MR off): in its in-code
  branch `indexOf('```')` finds the opening fence again, so the block goes
  out as "```", then the code as ordinary sentences, then "```". The text that
  reaches the person is the same unless something in between is changed: the
  code then goes through the citation rewrite, the tool-claim filter and the
  question hold, and a ```ui block that streams in pieces never reaches the
  inline gate. MR's filters follow the fences through the gate's block hook
  and keep the code; the gate itself is not changed here, because fixing it
  changes how every streamed code block is handled, the inline gate included.
- An outcome is judged against the composition in force at its turn, before
  precedence: a control a higher layer removed that turn is still tested.
- A conversation deleted while one of its turns is still streaming, when the
  deletion's mark cannot be saved twice running, can have that turn's rows
  written after it (the rows hold no text; a later reset or "forget" removes
  them).
- A reset also resets the per-conversation count of model deliberations
  (the rows it is counted from are gone).
- After a reset, a turn whose ledger read fails has no boundary to read: an
  adjustment MR made on its own before the reset can hold for that turn, and
  ends on the next turn whose read works.
- An edit asked for inside a quiz ("just fix the grammar: …") holds its few
  turns, so answering the quiz again within them is helped as an edit.
- A worked example in words only, with no working in it ("Ten nines is 90"),
  is judged partial, not delivered (it is never rolled back on that alone).
- A "from now on" said and taken back in the same conversation is said again
  (as taken back) on every later row there. A long conversation doing so can,
  once its earliest rows fall outside the revocation read, end a newer "from
  now on" said elsewhere (it fails toward not carrying).
- "Forget what Socria worked out" or a reset racing a turn still being
  written: if the re-read after the write also fails, that turn's rows stay
  (content-free; hidden from carry by the reset; shown in the export until
  the next reset or purge).
- A revocation is lost only when a recorded turn's settings cannot be read
  at all (then nothing of the turn is written).

**Requires infrastructure or data not available:**
- Retention, independent capability and autonomy outcomes (delayed
  independent tasks, a study instrument).
- Any learned or adaptive policy (outcome data at scale, randomized).
- A consent flow for research.
- Running `scripts/mr-research-export.mjs` against production (the script exists; it needs the study's credentials and approval).

**Future research hypotheses, not claims:**
- That MR reduces avoidable friction for real people without worsening task
  quality or capability.
- That full MR beats prompt-only reflection and simpler stateful variants
  (evidence level IV).
- That any of it improves independent performance.

---

## 11. Notes from building it

- **Epistemic Control stays above MR's words.** When MR asked the reply to
  "say what you checked", an "I checked the arithmetic…" sentence with no tool
  behind it was removed by the existing fabricated-claim filter. That is the
  intended precedence.
- **The runtime's work reading is too coarse to define "routine".** It reads
  "compare these two studies" as execution. MR uses ACS's conservative
  fact/computation reader instead.
- **Without MR, a stated "stop asking" held for one turn only.** The replayed
  state was discarded (audit). With MR on, it holds for the conversation, and
  until revoked.
- **What an adversarial review found, and what it changed.** Fifty-one
  confirmed defects in the first build, among them: a deliberated "none"
  lifted their own "stop asking"; ending a quiz did not end it; "quiz me —
  actually just tell me" became a conversation-long quiz; a complaint about
  content revoked their instruction; raw readSignals fields lifted a hard
  stop on "don't quiz me"; the fold forgot instructions older than 24 turns;
  the comparison arms did not fold the same rules; the claim filter cut the
  sentence a draft was asked for, and the question filter cut quoted
  questions in half; off the record was read from the model's history window
  only; a single verified echo unlocked "you've mastered it"; the
  deliberation budget never counted; the benchmark counted check-ins as no
  question. Each is fixed and has a regression test; the review and its
  reproductions are kept with the working notes, not in the repository.
- **Verifying the fixes found more, three times.** Each round of fixes was
  checked by reviewers trying to make MR act against somebody's words, cut
  what they asked for, or keep or delete data wrongly. Patching the phrase
  each one found produced the next one, a word over: "don't stop asking me
  questions", "my sister likes to quiz me", "I did not ask you to quiz me",
  "get back to normal after surgery", "no short answers please". So the
  third round changed the rule instead of the phrases: the costly
  instructions count only addressed to Socria (§5), and the reply gate keeps
  structure rather than guessing at it (§2). The same round found that the
  gate's filters glued headings to sentences and left "2." standing alone,
  that the second round's change to the share lookup made a shared Project
  private, with MR off, when one share read timed out,
  and that "don't keep this short" deleted what MR had kept. All of it has a
  regression test written from the reviewer's reproduction.
- **The seventh round.** Its reviewers found the same two classes again — a
  reader misreading a phrase it had not seen, and a structure carrying a
  local change everywhere — and one MR-off divergence that was not a phrase:
  the filter joined a held list number to the next sentence, so the stream
  gate read "7. Do you want them listed?" as one question and dropped the
  number with it. The structural fixes: a "from now on" is in force until
  their take-back, not while its own conversation still lists it (§5, §6); a
  carried one holds from the turn it was carried in; the filter hands the
  gate a held number as its own piece (the opt-in `rewriteAll`); the reply
  filters cut clauses and asides, not sentences. The MR-off identity held
  across about ten thousand fuzzed route runs (unset, off, shadow, and on for
  a person who switched it off).
- **Later rounds, and what changed structurally.** The next two rounds again
  found misses on both sides — an answer inside a quiz ("What about
  Nairobi?") read as the end of it, "In an interview, you should ask
  questions" read as taking a stop back, a bold question cut together with
  the answer after it — and three structural defects: a reading of their
  words deleted what MR had kept, a quiz or a learning goal in one
  conversation ended a carried "from now on" in every other, and an
  invitation said before a "from now on" existed ended it later. The last
  round removed those structures instead of patching the phrases: no reading
  of words deletes anything (§6); a carried preference ends by the newest
  words only, and everywhere only by their take-back (§5); the reply filters
  judge each sentence, also where the stream gate does not cut, and an
  answer must fit its question (§2). The readers remain English sentence
  shapes with documented misses (§10).
