# Logos 6: challenge, macro to micro, and documents

*Approved on 13 November 2026 ("all phases, to the dev branch") and built on dev the same day. What is in the code, how it is switched, and what was deliberately left for later are in [LOGOS-6.md](LOGOS-6.md). The plan below is kept as written, apart from one correction: the trial is seven days, so voluntary return (H4, §7.D) is measured over days 2 to 7.*

*It was written against dev at 87b2351, after a read-only audit of the code.*

Sources:

- Alex's "Socria: Cognitive UX & Product Blueprint", written after Alex's conversation with a communications and UX professor at UTA.
- The Logos 6 brief, which sets three priorities in order: **P1** cognitive challenge intelligence; **P2** macro-to-micro reasoning; **P3** document-grounded thinking.

The goal is to make Socria One ($15 a month) worth paying for. The value has to show up in results, not promises.

---

## 0. The short version

- **Most of what the blueprint asks for already exists in Logos 5.5, in pieces.** These include:
  - the Universal Map;
  - a canvas of ideas (the space);
  - a Logic Map with eleven lenses;
  - a challenge action on cards;
  - structural findings in Synthesize;
  - document grounding with checked citation chips;
  - a teach-back move;
  - a typed "add an idea" command that calls no model.

  The pieces don't add up yet: some are hidden, some are unchecked, and they don't connect to each other.
- **The biggest gap is challenge that can be trusted.**
  - Everyday challenge is prompt text only.
  - Nothing checks that a weakness Socria names is real, specific, or new to the person.
  - The card's "Challenge it" button is answered as an ordinary explanation. This is a defect.
  - Nothing measures any of it.
- **So Logos 6 consolidates rather than rewrites.** In order:
  1. **One challenge engine.** Its findings must quote what they are about. They are checked in code before anyone sees them, kept on the map, and never raised twice.
  2. **A way to move from the overview to one idea and back:** deep links and a Focus view.
  3. **Ideas linked to the passages that support them.**
- **The professor's principles are treated as hypotheses.** Several have strong research behind them. Some of the blueprint's interfaces do the opposite of what that research says works. Pressing a button that reveals your assumptions is not the same as predicting them. §1 says where.
- **Nothing in Logos 6 withholds an answer.** The blueprint's canvas where "the AI does nothing automatically" becomes an option, not the default. The option lets you drop an idea without getting a reply.
- **Measure first.** Today Socria can't tell:
  - which features people use;
  - whether they come back on their own;
  - what led to a subscription.

  Phase 0 fixes that, so the Logos 6 decisions rest on evidence.
- **Proposed first build, once approved:**
  - Phase 0 (measurement) and Phase 1 (the challenge engine), on dev, behind a switch.
  - An offline benchmark that must pass before any user sees it.

The decisions needed from you are in §10.

---

## 1. Reading the blueprint

### A. Who said what

The blueprint mixes three kinds of content. They deserve different levels of trust, so this plan keeps them apart.

1. **The professor's nine notes.** These are the bold headings in the blueprint's §3, such as "Force users to output rather than always input" and "Predicting = learning". They are the principles attributed to the professor. Most name ideas that have research behind them.
2. **Alex's reading of each note.** This is the sentence after each heading, plus the alignment matrix in §4, which maps each note to an interface. These are Alex's interpretations.
3. **Alex's interface proposals.** These are in §1 and §2:
   - the Universal Session Map;
   - foundational intake;
   - intent setting;
   - the non-linear canvas;
   - the omnibox and passive nodes;
   - the Components View;
   - a node menu with Identify Assumptions, Find Weaknesses and Simplify.

The blueprint says the nine notes "provide the exact cognitive rules that justify Socria's interface design". This plan reads them as strong hypotheses instead. They tell us which kinds of design are likely to help. The tests in §7 decide whether these particular designs do.

### B. The nine notes, the research behind them, and what follows for Socria

The research named below is mostly from lab studies of learning. How well it carries over to a thinking tool used on real work is exactly what §7 tests. Researchers are named so the ideas can be looked up. No effect sizes are claimed.

| # | The professor's note | Related research | Alex's reading | What the research actually implies | Logos 6 |
|---|---|---|---|---|---|
| 1 | Force output rather than input | The generation effect (Slamecka and Graf); retrieval practice and the testing effect (Roediger and Karpicke); ICAP, where constructive and interactive work beats passive reading (Chi) | Type your own thoughts into an omnibox first, as passive nodes | Producing something yourself helps you understand and remember it. Nothing in this research says the tool must stay silent. "Force" is the part to drop: making someone produce something before you help them is withholding. | Invite, never force. Offer "Add as idea" with no reply. Findings ask for the person's own resolution. Offer "Explain it back" as an opt-in. |
| 2 | Predicting = learning | The pretesting effect and errorful generation: trying to answer before being told helps later learning, even when the guess is wrong (Kornell, Hays and Bjork; Richland, Kornell and Kao) | Pressing a node to reveal its hidden assumptions makes you predict and reconcile | The benefit comes from guessing *before* the reveal. A button that reveals the assumptions does the reverse, because Socria does the generating. | "Guess first": an optional line before a challenge card opens ("Which part do you think is weakest?"). One press skips it. Off by default outside study. |
| 3 | Present an attainable challenge | Desirable difficulties (Bjork); the zone of proximal development (Vygotsky); cognitive load theory (Sweller) | Bite-sized nodes and component cards | Difficulty helps when it is within reach. Too many problems at once overwhelms. | At most three findings by default, each with one concrete way to settle it. More are one press away. |
| 4 | Opt-in reflection | Autonomy support in self-determination theory (Deci and Ryan); the expertise reversal effect, where guidance that helps novices gets in experts' way (Kalyuga) | Socria never lectures unprompted | Unasked-for help should be rare and earn its place. | Challenge happens on request. The single proactive flag (later) is gated by stakes, confidence and novelty. It appears at most once per line per day, and it can be switched off. MR already enforces "Human-First is not Question-First". |
| 5 | N levels of difficulty (Wired-style videos) | Scaffolding and fading; the expertise reversal effect | Zoom out for macro connections; zoom in for mechanics | The Wired "5 Levels" format explains one idea at several levels of expertise, so it is about *depth of explanation*. Alex's reading is about *scope*. Both are useful, and they are different. | Macro-to-micro navigation (§4) handles scope. "Simpler" and "Deeper" on any idea or reply handle depth. |
| 6 | Feynman's technique | Self-explanation (Chi); the illusion of explanatory depth: people think they understand until they try to explain (Rozenblit and Keil) | Press a node to have your idea explained back simply | In the Feynman technique, *you* explain simply, and the gaps in your explanation show what you don't understand. When Socria explains simply, that helps comprehension, but it is not the technique. | Build both and label them honestly. "Simpler" (Socria explains) is a small action. "Explain it back" (you explain, and Socria marks the step you skipped, checked against your sources and map) is the Feynman technique. It is opt-in and builds on the existing teach-back move. |
| 7 | Memorize, recognize, recall, synthesize | Bloom's taxonomy, revised by Anderson and Krathwohl; recall gives more durable learning than recognition | Moving from source components to clustered nodes | This describes a ladder from recognising, to producing, to combining. | Mostly exists for study already: StudyDesk practice, a recall question on return after a gap, and Synthesize. Nothing new to build here; it gets measured. |
| 8 | Where the moment clicks | Research on insight; the generation effect again: what you resolve yourself sticks | The "aha" comes when you spot a contradiction and resolve it on the canvas | Plausible, and measurable. | When the person resolves a finding themselves, it is recorded as resolved by them. "Self-resolved findings" becomes a metric (§7). |
| 9 | Power is to simplify | Cognitive load; the value of a good representation | A clean spatial layout, with simplification on demand | Consistent with how Logos already works. | No new build. "Simpler" (note 5) and Focus (§4) serve it. |

### C. Alex's interface proposals, set against Logos 5.5

| Proposal | In Logos 5.5 today | Gap found by the audit | Logos 6 decision |
|---|---|---|---|
| **Universal Session Map**: a spatial overview instead of a sidebar | Exists, and is already the home screen. It has Today, This week, This month and All time views, with subject circles, conversation discs and a card for each conversation. | Its idea chips do nothing when pressed. Its search box isn't mounted in the normal state, so `/` and dropping files onto the map do nothing. It shows at most 150 conversations. Zoom is purely geometric: detail levels exist in `lib/logos5/universe.ts` but are unused. Nothing measures whether people find things faster with it than with the Sessions list or ⌘K. | Keep it, and fix what's broken (small). Test it against a plain list before spending on semantic zoom (H8). |
| **Foundational intake**: drop in guidelines, documents and files | Exists. Files up to 4 MB (30 MB on One). Each document gets a brief. Grounding comes with checked citation chips. Project instructions and goals reach the prompt. | No idea on the map points to the passage behind it. Readings are stored only in the browser. | Phase 3 adds evidence links. |
| **Intent setting**: broad goals | Project goals exist, but you can only edit them in ProjectSheet. That is reachable only from Project Home, which is reachable only by link. Within a line, goals can sit on the map as cards. | Goals are hard to reach and aren't used to test anything. | Make Project Home reachable (small). Use goals as challenge targets; Synthesize already detects "constraint against goal". |
| **Non-linear canvas** | Exists. The space lays out ideas by what they rest on, along with files, things made and words. The Logic Map sits beside it. | You can't go deeper than a card's menu. | Keep it, and add Focus (Phase 2). |
| **Omnibox and passive nodes**: "the AI does nothing automatically" | Partly exists. "Add an idea called X" is parsed in the browser and calls no model. But no control offers it, and Quick capture is off by default. | The map pass may reorganise a person's own cards. | Add "Add as idea" to the composer: no reply, no tokens. Protect the person's own cards. It is not the default; conversation stays first. |
| **Components View**: sources in a side panel | Exists as the Files board beside the conversation. | Brief points can't be pressed to open the passage, and they don't link to ideas. | Keep one panel at a time. Make brief points pressable cards that open the passage (Phase 3). |
| **Identify Assumptions** | Scattered across three places: Explore's Challenge panel (under "More about this card"), the unsupported-assumption findings in Synthesize, and the Tensions lens. | Split up, hidden and unchecked. | One challenge engine (Phase 1), whose kinds include "hidden assumption". |
| **Find Weaknesses / Limitations** | As above, plus the Skeptic and disagreement rules in the prompt and the claim and balance elements. | Prompt text only, so nothing is checked. | The same engine. Its kinds: weaknesses, unsupported conclusions, contradictions, missing evidence, decision risks, alternatives and second-order consequences. |
| **Simplify (Feynman style)** | Words only. The explain planner recognises "simpler", "explain it another way" and "ELI5" (`lib/runtime/explain.ts`). Teach-back is move 18 there. | There is no button. | Add a "Simpler / Deeper" action (Phase 4, small). Add "Explain it back" for the Feynman technique itself (Phase 4, test first). |
| **Opt-in reflection** | Exists in principle, through the question budget and MR. | — | Keep it. Challenge happens on request. |

### D. Where the blueprint and Human-First pull apart

As the brief defines it, Human-First never means withholding answers. Taken literally, three of the blueprint's readings would withhold:

- **"The AI does nothing automatically", as the default.** Someone who asks a question would wait for a cue they don't know how to give. Logos 6 stays conversation-first: Socria answers. Passive dropping is an option for when someone wants to think out loud without a reply.
- **"Force output", as a gate** (type before you're helped). Logos 6 invites output and never requires it.
- **"Predicting = learning", as a precondition** (guess before you're shown). "Guess first" is opt-in and can be skipped.

Where the blueprint and Human-First agree, they agree strongly:

- help people do the thinking that matters to them;
- don't lecture;
- let people decide when Socria pushes.

---

## 2. What exists today: the audit

There were three read-only audits against dev at 87b2351. File references are to that commit. The claims this plan depends on were checked again in the code: the defect, the move order, the URL parameters, the hidden Project Home, the unmounted map search, the plain-text map chips and the capture flag.

### A. Challenge

| Piece | Where | Status |
|---|---|---|
| Skeptic persona and disagreement rules | `lib/runtime/behavior.ts`, `lib/accuracy/rules.ts` | Applies on every turn. Prompt text only. |
| The CHALLENGE move | `lib/cognition/assist.ts` (step 14), `lib/cognition/digest.ts` | Fires only when the person's own words touch an assumption or conflict already on their map. Not again if it was raised in the last three replies. |
| "Strongest case against", in Cognitive Allocation | `lib/runtime/allocation.ts` | Used on decisions. |
| Pushback handling | `lib/accuracy/pushback.ts` | Re-checks, then holds its ground or concedes. Maths is re-checked by the engine. |
| Card actions: Challenge, Explore, Research, Trace | `lib/logos-explore.ts`, `app/api/logos/explore` | Under "More about this card". Sees the card, the last 12 turns and attachments, but not the map. Its rules against being contrarian are good, but they are prompt text only. |
| Structural findings | `lib/logos-synthesis.ts` `digest()` | Computed in code: contradictions, unsupported assumptions, claims without evidence, a constraint against a goal, a single option, no criteria. Shown only when someone presses Synthesize. |
| Gaps and tensions | `lib/workspace/trace.ts` `gaps()`, `tensions()` | Gaps are ordered by how much rests on them. Tensions are classified by cause: different definitions, populations, periods or data. Explore's Trace uses them. |
| Contradictions across conversations | `lib/mind/evolve.ts`, `lib/mind/pipeline.ts` | Held in memory and passed to the prompt as "possible contradictions". |
| Considered-set novelty gate | `lib/core4/considered.ts` | Built for Core 4, whose route is withdrawn. Its lexical matcher (`classify`) can be reused. |
| Core 4's contribution and counterfactual detectors | `lib/core4/contribution.ts`, `counterfactual.ts` | Run on the Core route only, not in Logos. |

**The defect.**

1. The card's "Challenge it" (`components/LogosApp.tsx:8531-8535`) sends *"Challenge this — is "…" really so?"* with the card as the focus.
2. The move chooser handles a claim check (step 9) and a focused card (step 10) before it reaches challenge (step 14). See `lib/cognition/assist.ts:411-441`.
3. So the reply is an ordinary explanation of the card. The real challenge panel is two presses deeper.

A related gap: the chooser has no step for someone who asks in words ("what am I missing?"). That falls through to the open move and relies on prompt rules.

**What nobody checks.** No code checks whether a weakness Socria names is real, specific, or something the person already said.

- Only document citations are checked: their keys must exist, and a verdict chip shows the match.
- The claim element's verdict is not checked.
- No evaluation grades challenge output. `docs/LOGOS-SYNTHESIS.md` says the same of Synthesize.
- The Core 4 evaluation (a blind A/B judge) ran on the withdrawn route.

### B. Macro to micro

The levels today are:

- the Universal Map;
- a conversation (the space, or the page);
- ideas (columns in the space, and the Logic Map);
- a card's menu and Explore's side conversation.

Project Home sits apart from all of them.

1. **Nothing above a conversation can take you to a specific idea.**
   - The only URL parameters are `s`, `shared` and `in` (`LogosApp.tsx:2412-2421`).
   - The map's idea chips are plain text (`UniverseParts.tsx:335-347`).
   - Only ⌘K lands on an idea.
2. **Moving between levels swaps the whole screen.**
   - The space has no Logic Map control.
   - Pinching into a conversation works with a trackpad or wheel, but not touch.
3. **Projects sit outside Logos 5.**
   - Project Home and its goals are reachable only by link. The rail that opened them never appears: `l5Manage` is never set to true.
   - Project synthesis is never saved, and it links conversations, not ideas.
4. **A person's own cards are fragile.**
   - They can only be added by typed command, and capture is off by default.
   - The map pass is told to reorganise the map, and it protects only removals.
   - A map holds 16 to 26 cards.
5. **Detailed work is lost on reload.** Explore results and side conversations about a card are not saved. There are six separate graph renderers, and only two share `lib/canvas.ts`.
6. **The map's search box isn't mounted in its normal state.** `/`, dimming non-matches and dropping files onto the map do nothing (`Universe.tsx:1183`).

### C. Documents

The pipeline is strong:

- blocks are keyed by page (`p3.12`);
- each document gets a brief whose points are checked against the text;
- citation keys are enforced while the reply streams;
- chips open the passage.

The gaps:

1. No idea on the map stores a document and block. The map extractor sees unkeyed text, and cards made from a brief keep only page numbers.
2. Grounding verdicts are lexical and never stored.
3. Comparing documents is prompt-only, apart from a numeric conflict check.
4. Readings live only in the browser (IndexedDB). That is by design, and this plan keeps it.
5. No document feature is One-only.

### D. Measurement

1. **Events.** There are anonymous Vercel events, which can't be read back, and first-party daily counts for 13 onboarding events. Nothing records the map, documents, citations or challenge. No file in `components/logos5`, `ThinkingMap.tsx`, `components/projects` or `components/mind` imports analytics.
2. **Return.** Nothing measures whether people come back without being prompted (voluntary return).
3. **Conversion.**
   - Conversion is recorded only in aggregate.
   - The trial-end and Sleep checkouts record "asked", because their caller sends no trigger.
   - `socria_subscriptions.attributed_*` is never read.
4. **Experiments.** MR has consent-gated experiment arms with SHA-256 bucketing (`lib/mr/experiment.ts`). They are inactive. There is no general feature randomiser.

### E. What this means

Logos 6 is about consolidating, checking and surfacing what exists. Every capability in the brief can be built from existing parts:

- the move chooser and Cognitive Allocation;
- `digest()`, `gaps()` and `tensions()`;
- the considered-set matcher;
- the Synthesize route and its message pattern;
- the citation machinery;
- ThinkingMap.

The new parts are small: a gate, a finding record, deep links, Focus, evidence pointers and measurement.

---

## 3. Part 1: feature-value assessment

These are judgements made before any test. §7 exists to replace them with data.

- **Value columns** are scored 1 to 5, where 5 is the most valuable.
- **Effort, inference cost and UX complexity** are rated Low, Medium or High (S, M or L for effort).

**Inference cost per use** comes from the router's tiers and prices (`lib/model-router.ts`). A challenge pass with compact context uses about 4,000 tokens in and 600 out:

| Tier | Who gets it | Cost per pass |
|---|---|---|
| Light | the trial | about $0.0007 |
| Standard | One | about $0.007 |
| Deep | One | about $0.014 |

A One subscriber challenging five times a day on the standard tier costs about $1 a month.

The tighter limit is the trial's 20,000-token day: one pass uses close to a quarter of it. So on the trial, the structural findings (which need no model call) come first, and the context is kept compact.

| # | Capability | Severity | Frequency | Differentiation | Time saved | WTP | Effort | Inference cost | UX complexity | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Challenge on request, with checked quotes (words, chip, card, selection) | 5 | 4 | 4* | 4 | 4 | M | Low | Low | **Build first** |
| 2 | Findings kept on the map, with what the person did about each | 3 | 3 | 5 | 3 | 3 | M | None | Medium | **Build with 1** |
| 3 | Decision check: risks, second-order consequences, alternatives (kinds within 1, named for founders) | 5 | 2 | 4 | 4 | 4 | S on top of 1 | Low | Low | **Build with 1** |
| 4 | Contradictions with earlier conversations, in challenge results ("on 2 October you wrote the opposite") | 4 | 2 | 5 | 3 | 4 | M | Low | Low | Build after 1, on request only |
| 5 | One proactive flag, gated | 5 when right | 2 | 4 | 4 | 3 | M | Low to medium | Low | **Test** after H1 and H3 pass |
| 6 | Fix "Challenge it" | 3 | 3 | 1 | 2 | 1 | S | None | Low | **Fix** in Phase 1 (it's a defect) |
| 7 | Deep links to ideas | 3 | 3 | 2 | 3 | 1 | S | None | Low | **Build** (it enables 8, 9 and 10) |
| 8 | Focus: one idea, what it rests on, what rests on it, and its evidence | 3 | 3 | 4 | 3 | 3 | M | None | Medium | Phase 2 |
| 9 | Project "what this rests on", saved | 4 | 2 | 5 | 4 | 4 | L | Medium (deep tier, on request) | Medium | Phase 2, after 8 |
| 10 | Universal Map fixes: search, chips, the way into Project Home | 2 | 4 | 2 | 2 | 1 | S | None | Low | **Fix** |
| 11 | Universal Map semantic zoom | 2 | 3 | 3 | Unknown | 2 | L | None | High | **Don't build** until H8 |
| 12 | Add as idea (no reply) | 2 | 3 | 2 | 2 | 1 | S | None | Low | Build small |
| 13 | Evidence links from ideas to passages; "Check against my sources" | 5 | 3 | 4 | 4 | 4 | M | Low | Medium | Phase 3 |
| 14 | "Where do these disagree?" across documents | 4 | 2 | 4 | 5 | 4 | L | Medium | Medium | Phase 3; test with researchers |
| 15 | Simpler / Deeper | 3 | 4 | 1 | 2 | 1 | S | Low | Low | Build small; don't sell it |
| 16 | Explain it back (the Feynman technique proper) | 4 | 2 | 4 | n/a (time well spent) | 3 | M | Low | Medium | **Test** with students first |
| 17 | Guess first | 3 | 2 | 3 | n/a | 1 | S | None | Medium | **Test** only; opt-in |
| 18 | Measurement: events, return, attribution, arms | — | — | — | — | — | M | None | None | **Prerequisite** |

\* A plain chat prompt can find weaknesses, which on its own scores about 3. Grounding them in the person's map and sources, and leaving out what they have already considered, is what lifts it to 4. H1 tests exactly this.

**What would make someone pay $15 a month.** The capabilities with the highest WTP scores share one property. They:

- find something in the person's own work that they would otherwise have missed;
- show the receipts;
- remember what has already been dealt with.

A frontier chat assistant can list possible weaknesses on request. Without effort from the person, it can't:

- tie them to that person's sources and map;
- leave out what they've already considered;
- keep the record.

That combination is the product thesis to test (H1, H5). It is why Phase 1 builds the gate and the record rather than a better prompt. `docs/CORE-4-STRATEGY.md` (M12) reaches the same conclusion: counterarguments are not a moat on their own, only when grounded and remembered.

**Where One fits** (a proposal; decision 2 in §10):

- **The trial gets the full challenge on the light tier,** because it has to show the value.
- **One adds:**
  - the standard and deep tiers;
  - checks at the level of a Project and across documents;
  - longer memory.

Gating the core experience behind payment would leave the trial unable to show it.

---

## 4. Part 2: interaction architecture

### A. Rules

1. **Conversation first.** The conversation is the spine. Everything else is reached from it and comes back to it, and nothing replaces it.
2. **Answers are never withheld.**
3. **One thing beside the conversation at a time.** This is the Logos 5 rule, kept. Findings and Focus open in place, not as new panels.
4. **Progressive disclosure.** Someone who never asks for a challenge sees Logos 5.5 plus one quiet chip. A capability appears when there is something for it to act on.
5. **Everything Socria says about the person's work points to the words it is about.**
6. **Pushing happens on request.** The one proactive exception is rare, gated and can be switched off.

### B. Levels, and how to move between them

```
Everything (Universal Map)            every line, Project and memory
   │  press a disc, an idea chip or a search hit
   ▼
Project (Project Home)                goals, instructions, what the Project rests on
   │
   ▼
Line of thinking (space or page)      the conversation, its ideas, files and things made
   │  press an idea, a finding or a citation
   ▼
Idea (Focus)                          what it rests on, what rests on it, what pulls against it, its evidence
   │  press an evidence link
   ▼
Passage (preview)                     the page and block in the document
```

- **Down one level:** press.
- **Up one level:** Escape, the breadcrumb, or pinching out.
- **Every level can be linked to:**
  - `?s=` for a line;
  - `&n=` for an idea (new);
  - documents' existing citation keys for a passage.
- **Breadcrumbs** appear on Focus, and on any line that belongs to a Project: Project › Line › Idea.
- **Each level remembers where you were,** as `lib/logos4/resume.ts` does for lines today.

### C. Challenge

**Ways in.** All six lead to the same engine and the same card.

1. **Words.** For example: "what am I missing?", "poke holes in this", "where is this weak?", "devil's advocate", "what am I assuming?", "what could go wrong?", "what else could explain this?", "second-order effects".
2. **A chip** above the composer, "What am I missing?".
   - It appears once the line has something to test: two or more claims, a decision with options, or a draft.
   - Once per line until it's used.
3. **A card's menu:** "Challenge it" (fixed). Decisions also get "What could go wrong?".
4. **A selection of cards:** "Challenge these", next to "Synthesize these".
5. **A document or draft:** "Where is this weak?".
6. **The one proactive flag** (later, gated): a single line under a reply, "One thing worth checking: …", with *Show me* and *Not now*.

**The result** is a reply in the conversation carrying a structured challenge payload. This is the same pattern Synthesize uses: a message with a `synthesis` payload, saved with the conversation, with the person's choices recorded on it.

```
Worth checking                       Checked: this conversation · 14 ideas · 2 files

1  Hidden assumption
   Your plan needs schools to pay before the pilot ends.
   You said: "we'll charge from week two"
   If it's wrong: the cash-flow line and the hiring date both move.
   To settle it: ask three pilot schools what they would pay today.
   Keep on map    I've thought about this    Not relevant    Talk it through

2  …
```

**How many.** Up to three findings by default, and up to five with *Show more*.

**When nothing passes the checks,** the card says so: *"This holds up on what's here."* It may add the weakest point, marked as minor. It never invents a flaw to fill the card.

**Kinds of finding:**

- hidden assumption;
- logical gap;
- unsupported conclusion;
- contradiction: within the line, with a source, or with an earlier conversation;
- missing evidence;
- decision risk;
- alternative explanation;
- second-order consequence.

**What the four actions do.** Each sets the finding's state.

- *Keep on map* adds the finding as a card, which the Tensions lens shows.
- *I've thought about this* and *Not relevant* both add it to the line's considered set, so it is never raised again in that line.
- *Talk it through* starts a turn about it.

**Guess first** (study, opt-in). Before the card opens, one line asks *"Which part do you think is weakest?"* One press skips it. Afterwards, the card marks whether the person's guess was among the findings.

### D. Focus

- **Opened from:**
  - an idea on the space or the Logic Map;
  - a finding;
  - a ⌘K result;
  - a deep link;
  - an idea chip on the Universal Map.
- **What it shows:** the idea, large, with:
  - what it rests on, to the left (from `trace`);
  - what rests on it, to the right;
  - what pulls against it (from `tensions`);
  - its evidence (passages);
  - the findings about it and their state;
  - the turn it came from.
- **Actions:** Challenge it, Simpler / Deeper, Explain it back (study), Edit, Resolve.
- **How it's drawn:** as a mode of ThinkingMap. No seventh renderer.

### E. Dropping an idea without a reply

- The composer gets **Add as idea**: a small control, plus a key chosen to fit the existing shortcuts.
- It lands the text on the map as the person's own card, with no reply and no tokens.
- It reuses the existing `lib/map-edit.ts` add path.
- The card is marked "Yours", and the map pass's reorganisation must leave it alone.

### F. Documents

- An idea can carry evidence: `{ document, block, quote }`. Focus lists it, and pressing it opens the passage.
- **"Check against my sources"** works on a draft or a set of claims. Each claim gets a verdict, shown with the passage:
  - supported;
  - partly supported;
  - not found;
  - contradicted.

  Nothing is marked "supported" without a matched passage.
- **"Where do these disagree?"** works across two or more documents.
  - It finds pairs of passages that disagree.
  - Where the cause can be told, it names it, using the kinds `tensions()` already distinguishes: different definitions, populations, periods or data.
  - It never picks a winner.

### G. How it fits the existing systems

- **Cognitive Allocation.** Challenge is already one of its moves. Logos 6 adds the explicit-request route and keeps allocation's rules:
  - on a decision, the choice stays with the person, and findings never decide;
  - on writing that will be theirs, findings point at problems and don't rewrite.
- **MR.**
  - Dismissals are evidence for MR. Two *Not relevant* answers in a row in one line lead MR to issue one of its usual typed, expiring decisions: no proactive flags in that line.
  - MR's "Human-First is not Question-First" still holds. The card's *To settle it* is a statement, not a question.
- **The map, Socria's record of the reasoning.**
  - Findings are cards with `origin: 'socria'` and a finding record.
  - The map pass must keep them, as it already keeps removals.
  - Their states are the line's considered set.
- **Pushback.**
  - Arguing with a finding goes through the existing pushback path.
  - A reason that holds up resolves the finding, as resolved by the person, and counts as a self-resolved finding.
  - A reason that doesn't hold up leaves the finding open. It does not vanish just because someone objected.
- **Memory.**
  - Contradictions with earlier conversations come from Mind's existing contradiction candidates.
  - They appear only in a challenge result, quoting both conversations.
  - They are framed as the record ("In *Pricing*, on 2 October, you wrote …"), never as a gotcha.

---

## 5. Part 3: UX changes and workflows

### A. Changes, by surface

| Surface | Change | Phase |
|---|---|---|
| Conversation | The challenge card and the "What am I missing?" chip. The proactive line comes later. | 1 (the line after H1 and H3) |
| A card's menu | "Challenge it" fixed. "What could go wrong?" on decisions. Focus. Simpler / Deeper. | 1, 2, 4 |
| Logic Map | Findings in the Tensions lens, with their state. "Challenge these" for a selection. | 1 |
| Space | A Logic Map control. Focus. | 2 |
| Composer | Add as idea | 2 |
| Universal Map | Idea chips open the idea. Search restored. A way into Project Home. Pinching into a disc works on touch. | 2 |
| Project Home | What the Project rests on, saved and linked to ideas | 2 |
| Files and preview | Brief points as cards that open the passage. "Check against my sources". "Where do these disagree?" | 3 |
| Study | Explain it back. Guess first. | 4 |

### B. The quality bar

- **Type and shape.**
  - Only the type scale (10.5, 12.5, 13.5, 15.5, 18 and 32 px) and the radii (6, 10, 16 and 999).
  - Only the existing colour tokens, checked in both light and dark.
  - The popups brand pass (`docs/LOGOS-5-SYSTEM.md` §8.15) is the reference.
- **Voice.**
  - Plain, and about the reasoning, never the person.
  - "Worth checking", not "Flaws".
  - No red alarms, and no scores out of 100.
  - "This holds up" is a first-class answer.
- **Speed.**
  - A line naming what is being checked appears straight away.
  - The card arrives in one response.
  - The target is set in Phase 0, measured against the Synthesize route, the nearest comparable call. The card must be no slower than that.
- **Honesty in the card.**
  - It says what was checked: "this conversation · 14 ideas · 2 files".
  - When no model answered, it says so and shows only what the structure proves.
- **Accessibility.**
  - Every action can be reached by keyboard.
  - Screen readers hear each finding's kind first.
  - Reduced motion is respected.
- **Failure.** None of these produce an error screen. Socria shows the structural findings, labelled as such, when:
  - the rate limit is hit;
  - the trial day's tokens are spent;
  - no model answers.

### C. Workflows

**1. A student, a history essay.**

1. The student has a thesis about why Reconstruction ended. They have attached the essay prompt and the assigned chapter, and typed "what am I missing?".
2. The card shows three findings:
   - **Unsupported conclusion:** the thesis says "failed" but never says by what measure. It quotes the passage where the chapter describes outcomes that lasted.
   - **Alternative explanation:** a cause the chapter gives weight to doesn't appear in the argument.
   - **Missing evidence:** a key step has nothing under it.
3. They keep the first and third on the map and talk the second through.
4. That evening they open Focus on the thesis. They see what it rests on, the two open findings and the passages.
5. They resolve one by adding evidence. That is recorded as a self-resolved finding.
6. Before the exam, they use *Explain it back* on one concept. Socria marks the step they skipped, against the chapter.

**2. A founder, a launch decision.**

1. The map holds a goal, a decision with two options, and a constraint (runway).
2. On the decision's menu, they press *What could go wrong?*. The card shows:
   - **Decision risk:** both options assume the pilot converts within six weeks, but the runway is four months. It quotes both statements.
   - **Second-order consequence:** pilot users who start free may anchor on free. Its confidence is medium, so it is phrased as a question.
   - **Contradiction with an earlier conversation:** in the *Pricing* line, they wrote that schools buy once a year.
3. They keep the first finding and mark the second as considered.
4. Later, in Project Home, *What this rests on* shows three assumptions shared across four conversations, one of which has nothing under it.

**3. A researcher, a literature review.**

1. The researcher has three papers and a hypothesis.
2. *Where do these disagree?* returns two pairs:
   - a direct contradiction on the direction of an effect, with both passages quoted;
   - an apparent tension that turns out to concern different populations, so it is not a contradiction.
3. *Check against my sources* on their related-work paragraph finds one claim in no source and one only partly supported.
4. Focus on the hypothesis shows the evidence for and against it.

**4. A UX designer, research synthesis.**

1. The designer has eight sets of interview notes and an insight: "users churn because onboarding is long". They ask "what else could explain this?".
2. The card shows:
   - **Alternative explanation:** in two interviews, churn followed a price change. Both are quoted.
   - **Missing evidence:** there is no usage data.
   - **Hidden assumption:** that long means bad, when one participant said the setup is what made them trust the product.
3. They keep all three, then use Focus to present the insight and its evidence to their team.

**5. Coming back after a week.**

1. They open Socria to the Universal Map and press an idea chip on a conversation's card.
2. Focus opens on that idea, with its two open findings still there.
3. Escape goes to the line, and the breadcrumb goes to the Project.

### D. What the person never sees

- A finding without a quote.
- The same finding twice in a line after they've dealt with it.
- More than three findings at once, unless they ask.
- A proactive flag after small talk, after something personal, or in a shared room.
- A decision made for them.

---

## 6. Part 4: technical plan

### A. Modules

**New: `lib/challenge/`** (pure, apart from the route).

- **`types.ts`**
  - `Finding { id, kind, text, anchors, matters, settle, confidence, target?, state, by?, at }`
  - `state` is one of open, kept, considered, dismissed or resolved.
  - An `Anchor` is one of:
    - `{ said: messageId, quote }`
    - `{ idea: nodeId, quote }`
    - `{ source: { doc, block }, quote }`
    - `{ earlier: conversationId, quote }`
- **`intent.ts`**
  - Recognises an explicit request for challenge in words.
  - Must not fire on near misses such as "I'm missing my notes" or "what am I missing at the party".
- **`targets.ts`** works out candidate targets in code:
  - `digest()` findings;
  - `gaps()`, by weight;
  - `tensions()`;
  - the map's open assumptions and conflicts;
  - Mind's contradiction candidates;
  - numeric conflicts across documents (`lib/runtime/epistemic.ts`).

  Candidates are ranked by how much rests on them.
- **`prompt.ts`** asks the model to do two things, each item with a quote:
  - confirm and phrase the candidates found in code;
  - add at most a few of its own: hidden assumptions, alternatives, second-order consequences and decision risks.

  It carries over the Explore challenge prompt's rules: show the load and not a verdict; steelman; don't invent; don't be contrarian.
- **`gate.ts`**, the core. It runs every check in code:
  1. **Quotes.** Every quote must be found in what it points to, after normalising whitespace and quotation marks. A finding with no valid quote is dropped.
  2. **Specific.** The finding must share content words with its quote. It must not match a list of generic phrasings, such as "more research is needed", "consider other perspectives" or "it depends on context".
  3. **New.** `classify()` from `lib/core4/considered.ts` compares the finding against:
     - the person's own words in the line;
     - their own cards;
     - earlier findings, in any state;
     - Socria's recent replies.

     A redundant finding is dropped. A partly redundant one is kept only if it brings a new quote.
  4. **Calibrated.** A low-confidence finding becomes a question, not a claim.
  5. **Capped and ordered.** Three by default, ordered by weight times confidence.
  6. **Holds up.** If nothing survives, the result says so.
- **`sanitize.ts`.** `sanitizeChallenge`, used for storing and reading back, like `sanitizeSynthesis`.
- **`fromStructure`.** The code-only result, used when no model answers or the trial day is spent.

**New route: `app/api/logos/challenge/route.ts`.** It mirrors `app/api/logos/synthesize`:

- `auth()` or `mayUse`, plus `enforceRateLimit(…, 'aux')`;
- `withMeter` and `sleepGate`;
- `chooseAuxModel` by plan;
- structured JSON, then the gate, falling back to `fromStructure`.

| | |
|---|---|
| **Scopes** | line, card, selection, document |
| **Input** | the map; a short excerpt of recent turns; the focused ids; passages from the readings (the client sends these, because readings live in the browser); the considered set |

**Changed:**

- **`components/LogosApp.tsx`**
  - The card's "Challenge it" and the chip call the challenge path.
  - Words recognised by `intent.ts` do too, in the same way map edits are parsed before any model call.
  - The reply card.
  - The person's actions are recorded on the message, as Synthesize records `taken`.
  - Kept findings go onto the map.
- **`lib/cognition/assist.ts`.** The chooser learns the same request words, before steps 9 and 10. A challenge that reaches the chat route (typed with a card selected, say) is then still a challenge.
- **`lib/logos.ts`**
  - `LogosNode` gains `finding?` (Phase 1) and `evidence?: { doc, block, quote }[]` (Phase 3).
  - `sanitizeMap` keeps both.
  - The map pass's prompt and merge keep finding cards and the person's own cards.
- **`lib/runtime/orchestrate.ts`.** "Stress-test my argument" goes to the challenge card, with the findings on the Tensions lens. Asking to *see* structure still opens the Logic Map.
- **`components/ThinkingMap.tsx`.** Finding state on cards. Focus as a mode (Phase 2).
- **`lib/analytics.ts`, `lib/product-events.ts`.** The events in §6.C.
- **The Universal Map.**
  - Chips become buttons with deep links.
  - The search box is mounted again.
  - Pinching works on touch.
- **The URL.** `n=` is validated the way `in=` is.

### B. Data

- **No new tables.**
  - Findings live in the conversation (the message payload and the map cards). They are saved through `/api/conversations`, as now.
  - Phase 0 adds one counter name, `active`, to `logos_usage`. It is daily and uses the existing RPC: one row per person per day. The `counter` column is text, so this needs no schema change.
- **Saving Project synthesis (Phase 2)** needs a place on the Project record. Its shape will be settled at the start of Phase 2 and brought back to you if it needs a migration.
- **Evidence pointers (Phase 3)** are references within the map. No document text leaves the browser beyond what grounding already sends.
- **Nothing destructive.** No production database change in this plan deletes or rewrites data.

### C. Measurement (Phase 0)

**Events.** Like every Socria event, these record only shape: kinds, counts and surfaces. They never record content, text, labels, names or user ids, as `lib/analytics.ts` requires.

| Event | Properties |
|---|---|
| `challenge_requested` | from (words, chip, card, selection, document or flag); scope |
| `challenge_shown` | count; kinds; held (whether it held up); structural_only |
| `finding_action` | kind; action (kept, considered, dismissed, talked or resolved); by |
| `focus_opened` | from |
| `idea_opened` | from (chip, search, finding, link or map) |
| `conversation_opened` | from (disc, double-press, pinch, Enter, pick-up, waiting, Sessions, search, Memory, Project or link) |
| `level_changed` | from; to; how |
| `idea_added` | — (Add as idea) |
| `evidence_opened`, `source_check`, `compare_run` | from; verdict counts; number of documents |
| `simpler_deeper`, `explain_back`, `guess_first` | which; outcome; taken or skipped |

**Return.**

- A **voluntary return** is a day with a turn (the `active` counter) when no lifecycle email was sent in the previous 24 hours (`lifecycle_emails.sent_at`).
- It is reported as cohorts on the developer dashboard, never per person.

**Attribution.**

- Every One checkout sends its trigger. The trial-end and Sleep paths currently record "asked".
- The dashboard reads `attributed_*`: which surface led to the checkout, and the last Logos 6 capability used in the seven days before it.

**Feature arms.**

- MR's bucketing (`lib/mr/experiment.ts`) is generalised for feature exposure.
- A person's arm is the SHA-256 of the experiment and the user, modulo n. It is computed on the server and stays stable.
- Reporting is by count per arm only.
- Whether arms need consent is decision 3.

### D. Tests and evaluation

**Unit tests**, in `node test/run.mjs`:

- **The gate**, every rule, with adversarial cases:
  - paraphrased quotes;
  - quotes from the wrong message;
  - generic findings;
  - a finding the person already said;
  - an empty map;
  - every finding dropped, so the result holds up.
- **Targets and sanitising.**
- **Intent:** requests that should fire, and near misses that must not.
- **Deep link parsing.**
- **The map pass** keeping finding cards and the person's own cards.
- **The defect:** the card's action now reaches the challenge path.
- **Event scrubbing.**

**Evaluation: `evals/challenge`.**

- **Deterministic part.** This runs in CI and checks:
  - quotes are valid in 100% of shown findings;
  - the rate of generic findings;
  - the cap;
  - "holds up" on sound cases.
- **Judged part.** This runs on dev before any arm sees the feature. It reuses the blind A/B judge from `evals/core4`. Logos 6 is compared with:
  - the same model given a plain "what am I missing?" and the whole conversation (what a frontier chat assistant does);
  - Logos 5.5 as it is today.

  The scores and thresholds are in §7.B.

### E. Phases

Sizes are rough and will be revised after Phase 0: S is up to two days of focused engineering, M up to a week, and L up to three weeks.

| Phase | Contents | Size | Exit criterion |
|---|---|---|---|
| 0 | Events; active days; voluntary return; checkout attribution; feature arms | M | Two weeks of baseline on the dashboard |
| 1 | Defect fix; `lib/challenge`; the route; the card; findings on the map; the ways in; `evals/challenge` | L | The offline gates (§7.B) pass. Then the team uses it behind a switch, and then the treatment arm gets it. |
| 2 | Deep links; Focus; a Logic Map control in the space; a way into Project Home; map search; touch pinch; Add as idea; protection for the person's own cards; Project "what this rests on" | L | H6 |
| 3 | Evidence pointers; "Check against my sources"; "Where do these disagree?" | L | H7, with researchers and students |
| 4 | Simpler / Deeper; Explain it back; Guess first | M | A test with students |
| 5 | Fold Explore's challenge mode into the engine; retire the old view switch in shared rooms; reduce the number of renderers where it is cheap | M | No duplicate paths |

Every phase:

- ships with tests in the suite;
- updates the system documentation;
- stays behind a switch until its exit criterion is met;
- is pushed to dev only (main only when you say).

---

## 7. Part 5: validation and benchmarking

### A. Hypotheses

| | Hypothesis | Measured by | Holds if |
|---|---|---|---|
| H1 | Logos 6 finds at least as many real problems as a plain prompt to the same model, with fewer wrong ones | Offline benchmark (B) | Recall is no lower than the plain prompt's, and precision is at least 15 points higher |
| H2 | People who use the challenge card make better revisions than they do with their usual AI tool, in no more time | Moderated sessions (C): revisions rated blind by an expert | Better in at least 2 of the 4 segments; no slower |
| H3 | On sound work, Logos 6 says it holds up instead of manufacturing doubt | Benchmark sound cases; "wrong" ratings in sessions | It says it holds up on at least half the sound cases, with at most one finding per sound case on average. Under 10% of findings shown are rated wrong. |
| H4 | Challenge brings people back of their own accord | Field test (D): voluntary return days, days 2 to 14 | Treatment beats control |
| H5 | Challenge creates willingness to pay | Field test: checkouts attributed to a capability; in sessions, Van Westendorp and Sean Ellis questions | People who used challenge on two or more days start checkout at a higher rate. With enough volume, treatment also beats control. |
| H6 | Deep links and Focus make earlier ideas faster to find and understand | Sessions: time to find a specific earlier idea and say what it rests on, and backtracks | Faster, with fewer backtracks, than without them |
| H7 | With evidence links, people catch more unsupported claims in their own drafts | Sessions with researchers and students | More unsupported claims are caught than with citation chips alone |
| H8 | For people coming back, the Universal Map is at least as good a home as a recent list | Sessions plus the field test: time to resume, success at finding a specific earlier line, preference | The map is no slower and preferred by most. Otherwise the list becomes the home and the map stays one press away. |

### B. Offline benchmark (before any user sees Phase 1)

**The dataset: 80 cases.**

- 15 per segment for four segments: a student's essay or argument, a founder's plan or decision, a researcher's claim or method, and a UX designer's research synthesis.
- Each of those has one to three flaws planted, with an answer key.
- 20 sound cases, with nothing planted, to measure false alarms.
- 10 of the 80 come with documents, where the flaw shows only against the source.

We write the cases, and someone from each segment reviews them.

**Systems compared:**

- Logos 6;
- the same model given a plain "what am I missing?" and the full conversation;
- Logos 5.5 as it is today.

**Scores:**

- recall of the planted flaws;
- precision, rated real and new, real but already known, or wrong;
- false alarms on sound cases;
- valid quotes;
- generic findings;
- redundancy with what the case's author already said;
- length.

**Gates before any user sees Phase 1:**

- 100% of shown findings have valid quotes;
- precision of at least 0.8;
- under 10% of findings wrong;
- H1 and H3 hold.

### C. Moderated sessions

**Who.** 24 people, 6 in each segment: students, UX designers, researchers and founders.

**Design.**

- Each person does two comparable tasks: one with their usual AI tool and one with Socria. The order is counterbalanced.
- Tasks:
  1. a standard task in their field, with planted flaws;
  2. their own work in progress.
- 60 minutes, moderated and recorded with consent.

**Measures:**

- planted flaws found and fixed;
- revision quality, rated blind by an expert in the field;
- time;
- each finding rated "I didn't realise", "I knew" or "wrong";
- *"Which would you use for this next week?"*;
- for H6 and H8, a find-it task on a seeded account.

**Willingness to pay**, at the end of the session:

- **Van Westendorp's four price questions:** at what price is it too cheap, a bargain, getting expensive, too expensive?
- **The Sean Ellis question:** *"How would you feel if you could no longer use Socria?"* The commonly used benchmark is 40% "very disappointed".
- *"What would make $15 a month worth it?"*

**Analysis.**

- With six people a segment, this is directional, not statistical.
- Look for the same result across segments, and treat a split as a finding in itself.

### D. Field test

**Arms.** New trial accounts are randomised:

- **Control:** Logos 5.5 behaviour.
- **Treatment:** Logos 6 challenge, with findings on the map.

A third arm for the proactive flag comes only after H1 and H3 hold.

**Duration.** At least three weeks, so the novelty wears off.

**Metrics:**

- challenge uses per active day;
- repeat use on two or more days;
- what people do with findings, especially self-resolved findings;
- voluntary return days, days 2 to 14;
- trial-to-One checkout starts and completions, attributed;
- for those who subscribe, whether they still have One at day 30 (later).

**Power.**

- Detecting a rise in conversion from 4% to 6% (80% power, two-sided 5%) needs about 1,900 trial starts in each arm.
- The 4% is a placeholder; Phase 0 replaces it with the real rate.
- If volume is lower, conversion is read as directional. The decision then rests on return, repeat use and the sessions.

**Guardrails.** The arm stops and is fixed if any of these happens:

- more than 40% of findings are marked *Not relevant*;
- complaints rise;
- trial users run out of tokens more often;
- reply speed gets worse.

### E. Decision rules

| If | Then |
|---|---|
| H1 fails: Logos 6 is no more precise than a plain prompt | Don't sell challenge as the reason to pay. Keep it as a feature, and put the effort into the record (findings, considered set, evidence) and into documents. |
| H3 fails: too many false alarms on sound work | No proactive flag. Tighten the gate, and run the benchmark again. |
| H2 holds but H4 doesn't: outcomes improve but people don't come back | The value is real but occasional. Put the ways in at the moments that matter: before submitting, before deciding. |
| H2 holds but H5 doesn't | This is about packaging or price, not the product. Test packaging next. |
| H6 or H7 fails | Don't build further on Focus or documents. Fix discoverability first. |
| H8: the list is faster | Make the list the home for returning people, and keep the map one press away. |
| H8: the map is faster or preferred | Invest in semantic zoom. |

---

## 8. Part 6: risks, trade-offs and dependencies

### A. Risks

| Risk | Mitigation |
|---|---|
| Generic or contrarian findings | The gate's specificity and novelty checks. "Holds up" is a first-class answer. The sound cases in the benchmark. |
| Invented weaknesses | Every finding needs a quote that the code finds. "Not found in your sources" is never presented as "missing". |
| Feeling judged | Framing about the reasoning, not the person. Challenge happens on request. *I've thought about this* is one press. |
| Too many questions | MR's rules apply. Findings are statements. Three by default. |
| The map pass deletes findings or the person's own cards | Protection in the merge, with tests. |
| The trial's token day | Compact context. Structural findings first, with no model call. One pass is close to a quarter of a trial day. |
| Speed | One call. A line naming what's being checked appears straight away. Measured against Synthesize. |
| Privacy | No new content leaves the browser. Events record only shape. Reporting is in aggregate only. Documents stay in the browser. |
| Measurement validity | Planted flaws are easier to find than real ones, so sessions also use real work. Samples are small, so look for consistency. The field test runs at least three weeks because of novelty. |
| The moat is thin if a plain prompt does as well | H1 is designed to find that out early, before money is spent on surfaces. |
| Complexity creeps back | One engine, one card, one panel at a time. Phase 5 removes duplicates. |
| Contradictions with earlier conversations feel intrusive | On request only, quoting the record. They can be switched off along with memory. |

### B. Trade-offs

- **Precision over recall.** Better to miss a weakness than to invent one. The cost is that some real problems go unflagged. The proactive flag is held to a higher bar still.
- **A separate call versus riding along on the reply.** A separate call is cleaner and easier to test, and it costs one more call. On the trial, the structural findings need no call at all.
- **On request versus proactive.** On request comes first, because trust has to be earned.
- **Map versus list as the home.** Keep both, and let H8 decide.
- **Findings kept in the conversation versus a new table.** Keeping them in the conversation is simpler, private and needs no migration. The cost is that queries across conversations go through Mind. Project-level work in Phase 2 may need storage; that will be decided then.

### C. Dependencies

- Phase 0 comes before any field test.
- Phase 1's finding record comes before Focus can show findings.
- Phase 3's evidence pointers come before comparing documents.
- Recruiting for the sessions (decision 5).
- Model availability and prices. The prices in `lib/model-router.ts` carry their own note to check the pricing page before relying on them.

---

## 9. What is not being built, and why

| Not building | Why |
|---|---|
| A blank canvas where the AI does nothing, as the default | It conflicts with conversation-first, and with never withholding. It survives as Add as idea. |
| A separate Components View panel | The Files board already is one, and the rule is one panel beside the conversation. |
| A seventh graph renderer, or a new Universal Session Map | Six already exist. Extend ThinkingMap and the Universal Map. |
| Semantic zoom, for now | Wait for H8. |
| Forced prediction or forced output | That would be withholding. Guess first and Explain it back are opt-in. |
| A devil's advocate persona that disagrees by default | Contrarian challenge is the failure mode this plan is built to prevent. |
| Scores of anyone's thinking | Logos reports structural facts, and the person decides which matter (as `lib/workspace/trace.ts` already says). |

---

## 10. Decisions needed

1. **Approve Phase 0 and Phase 1 as the first build:** dev only, behind a switch, with the offline gates before any user sees it.
2. **Packaging.** The proposal: the trial gets challenge on the light tier, and One adds depth, Project-level checks and comparing documents. Or another split.
3. **Feature arms for trial accounts.** Two options:
   - treat them as product testing covered by the privacy policy, with counts only and no content (recommended);
   - put them behind MR's research consent.
4. **The proactive flag.** Recommended: off until H1 and H3 hold. After that, either on by default with a switch, or opt-in.
5. **Sessions.** Who recruits? Should UTA, through the professor, be the pool for students and researchers?
6. **The home screen.** Keep the Universal Map as the home while H8 is tested (recommended).
