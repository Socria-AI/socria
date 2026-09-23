# Core 4, attacked and redesigned

A hostile review of the Core 4 hypothesis: first as a competitor, then as the
architect who has to answer that competitor. Where it helps, it uses what the
code on `dev` actually does today (see `CORE-4-ARCHITECTURE.md`), because
the strongest evidence about whether Human-First is operational is the
system that exists, not the one described.

---

## Part I — The attack

### 1. What is differentiated, and what is standard architecture with new names

Strip the vocabulary and the proposed loop is:

    classify request → load user memory → estimate state → pick a policy →
    call tools → generate → critique → respond → update memory

That is the standard agent loop. Every serious assistant has some version
of it:

- A **router or planner** (tool choice, mode choice).
- **Memory** (ChatGPT memory and chat-history reference, Claude memory and Projects, Gemini Gems).
- A **critic pass** (constitutional-style self-check, verifier models).
- **Tools.**

Stage by stage:

| Proposed stage | What it is in industry terms | Differentiated? |
|---|---|---|
| Intent / task understanding | Request classification. Every agent router does it. | No |
| User / context model | Memory of facts and preferences. Shipped by all three labs. | Not as described. It becomes differentiated only if it models **competence and reasoning**, not facts and preferences. |
| Cognitive-state assessment | A planner step: one model call that reads the transcript and emits JSON. | Not the mechanism. The *content* could be (see Part II), but today it's a gpt-4o-mini guess over 8,000 characters, rebuilt from nothing every turn, with no measured accuracy. |
| "Decide what contribution stays with the human" | **The one genuinely new decision.** No mainstream assistant makes an explicit, per-turn allocation of cognitive work between human and machine. | Yes in *objective*. Today it's implemented as rules that withhold. |
| Intervention selection | A policy over dialogue acts. The taxonomy (hint, prompt, explain, challenge) is 30 years old: Cognitive Tutors, AutoTutor, VanLehn's work on tutoring dialogue. Hint ladders are textbook. | The labels, no. The selection *criterion* could be. |
| Generate | The model. | No |
| Answer Guard | A critic or verifier pass. Standard. | Only its criterion ("did this perform the human's work?") is new, and a critic prompt can state that criterion. |
| Observe reaction / update | Implicit feedback. Standard in recommender systems; RLHF at the lab level. | Only if the *reward* is human capability rather than satisfaction or task completion, and only if the data is actually collected. Today nothing observes outcomes. |
| Logos | Visual thinking tools (Kialo, Rationale, Heptabase, tldraw with AI, Miro AI, Claude artifacts drawing diagrams). | Only if the representation is **shared state that both the human and the reasoning system operate on** and that persists. A generated diagram is not that. |

**Verdict:** the architecture as drawn is not differentiated. Its one new idea is the *objective function*: optimizing for what the human becomes able to do, not for what the model does. An objective is not a mechanism until something measures it and something is trained or tuned against the measurement. Neither exists yet.

### 2. What a frontier assistant can reproduce today

**With prompting alone:**
- **"Guide, don't answer."** This is literally shipped: ChatGPT Study Mode, Claude's learning mode, Gemini Guided Learning, Khanmigo. Socratic behaviour is a commodity feature, and the labs will make it better every quarter.
- **The voice** (scientific collaborator, no praise, no headings): a paragraph of instructions.
- **Counterarguments, steelmanning, perspective shifts, premortems, assumption lists, "what am I missing?":** one sentence each. Frontier models are very good at these on request.
- **Within-conversation adaptation** (explain more when frustrated, fewer questions after pushback): prompted models do this tolerably, though unreliably.
- **Question discipline** (at most one question, don't end every turn with a question): promptable to about 70–85% compliance. The last 15% is where the model's reflexive-question prior leaks.

**With memory:**
- **Remembering who you are, your projects, preferences and goals across sessions:** ChatGPT memory plus chat history, Claude memory, Projects.
- **A knowledge graph of entities and relations:** Anthropic publishes an MCP "memory" server that is literally a knowledge graph of entities, relations and observations. A power user can attach it to Claude Desktop today. The Mind Graph *as a concept* is reproducible by a hobbyist in an afternoon.

**With tools:**
- **Search, deep research, code execution and statistics, file analysis, image understanding, charts:** all shipped, and better resourced than anything Socria will build.

**With agents:**
- **Classifier → router → generator → critic** is a weekend project with the Claude Agent SDK or the OpenAI Agents SDK. Everything in `lib/cognition/` could be rebuilt by one strong engineer in a week.

**Existing product features:**
- **Projects with instructions, styles, custom GPTs and Gems:** a user can write "I'm an expert, don't quiz me, challenge my assumptions, remember my positions" into a Project today.

**The uncomfortable conclusion:** everything in the current Core 4 codebase is reproducible by a lab in weeks and approximated by a sophisticated user in an evening. The user who churned already had the better substitute: his own questions plus Claude.

### 3. Features that sound impressive and defend little

- **A large intervention taxonomy** (21 named moves). Labels aren't capability. A model can be told the same names. What matters is the *selection function* and whether it's validated.
- **"Cognitive state" as a JSON blob.** Impressive in a diagram; a single classifier call is not a model of anyone's reasoning. Unvalidated, it is a random number generator that routes behaviour.
- **Mind Graph visualization.** Pretty and unused. A graph page doesn't make memory better.
- **Spreading activation.** Sounds like cognitive science. Today it's lexical label matching, weaker than plain embedding retrieval.
- **Generic metacognitive feedback** ("you tend to be overconfident"). Promptable, usually wrong on thin evidence, and the most likely thing in the product to feel condescending.
- **Counterargument generation, perspective shifting, premortems as named features.** A prompt does them.
- **A native model (Renata)** before you have proprietary training signal. Fine-tuning on your prompts' outputs teaches a model your prompts; it doesn't create capability the frontier lacks.
- **Deep research, voice, camera, the many tool integrations.** Table stakes where the labs will always be ahead. Build them only as inputs to the reasoning representation, never as the pitch.

### 4. Where Human-First is still philosophy, not behaviour

The strongest evidence is the code. The review of Core 4 found that the router the architecture depends on is **secretly a Socratic tutor**:

- It withholds the correction from *anyone* whose attempt is wrong, whatever their goal.
- A debugging request gets a hint instead of the fix, for everyone.
- An open request gets a question.
- Question pressure prices only the move *labelled* ASK, so HINT and CHALLENGE can carry questions at any streak: a two-question hint was delivered after eight consecutive questions in a probe.

That is the churned user's complaint, implemented deterministically. Human-First has so far been operationalized as **withholding**, which is the easiest thing to operationalize and the least valuable.

What has no operational definition:

- **"Cognition that should remain human."** No criterion, no ground truth, no measurement; decided by rules keyed to a mini-model's guess of `taskKind`.
- **"Capability."** Nothing measures whether any user became more capable. No instrument, no metric, no experiment.
- **"Calibrated friction."** Calibrated against what? There is no target.
- **"Cognitive residue."** No instrument.
- **"Dependency / offloading."** No signal is collected.
- **"Learning from interventions."** Nothing observes what happened after an intervention. The state is not even kept from one turn to the next.
- **Expertise.** Not modelled. The system cannot know that a professor is a professor except by rereading 8,000 characters each turn.
- **"Surprise advanced thinkers."** Nothing represents what the user has already considered, so nothing can aim beyond it.

### 5. The hardest unsolved problems the thesis implies

1. **Credit assignment for capability.** Did intervention X make the person more capable? The outcome is delayed (days to months), noisy, confounded by everything else in their life, and usually never observed. Users don't take tests. This is the central scientific problem, and without a partial answer every other mechanism is tuned by opinion.
2. **Open-domain knowledge tracing for adults.** Knowledge tracing works in closed curricula with item banks and graded answers. Sophisticated users work in open domains, with no items, no answer key and no curriculum. Inferring "he already knows this" from how someone *talks* is unsolved at useful accuracy. A false positive is condescension; a false negative is the churn.
3. **Stated versus revealed preference.** People say they want to think and then reward answers. Engagement and satisfaction metrics push toward doing the work; a capability objective pushes toward friction. Any learned policy will be pulled toward whichever signal is easiest to collect (satisfaction). This is Goodhart's law with commercial consequences.
4. **Contributing beyond an expert's frontier.** "Surprise me with what I missed" requires the system to know what the user has already considered *and* to exceed them somewhere. The second is bounded by the base model; the first is a representation problem nobody has solved.
5. **Faithful epistemic extraction.** Turning a conversation into a record of *the user's* beliefs is hard in specific ways:
   - Speaker attribution: the current extractor cannot tell Socria's idea from the user's.
   - Register: jokes and hypotheticals leak into belief.
   - Implicit assumptions.
   - Change detection with a reason.

   Every error compounds over months, and a wrong memory of someone's beliefs is worse than none.
6. **Latency and cost of a multi-pass architecture.** Today's critical path has up to two mini-model calls and two frontier calls, strictly serial. The chat experience punishes every second.
7. **Behavioural identity under a model swap.** How much of "Socria" is the base model's prior?
8. **Cold start.** A new user has no history, and the churned user left early. Whatever differentiates must pay off within the first few sessions.

---

## Part II — The redesign

### The core idea

Human-First becomes an architecture when three things exist that a prompt cannot supply:

1. **An explicit model of the person's reasoning and competence**, persistent, attributable and checked against what they actually do. Not memory of facts about them: a record of what they believe, why, what depends on what, what they have already considered, and what they have demonstrated they can do.
2. **An allocation policy** that decides, per turn, which cognitive operations the human owns and which the machine performs. It defaults to contribution, withholds only on positive evidence, and is steerable by the person.
3. **An outcome loop** that measures whether the human became more capable and uses that measurement to change the policy.

The loop in the original hypothesis is fine as plumbing. The defensible parts are the **representations** (1), the **objective** (2) and the **data** (3). The rest is orchestration anyone can copy.

A reframe that matters commercially: for sophisticated users, "augmentation" is mostly not about making them think harder. It is about:

- **rigor:** critique at their level, disconfirming evidence, the load-bearing assumption;
- **continuity:** their reasoning remembered accurately across months;
- **leverage:** the machinery done for them;
- **authorship:** their judgment stays theirs.

The churned user wanted a peer, not a tutor. Core 4's default for experts should be *reviewer, research engine and reasoning memory*. Preservation should mostly mean preserving authorship of conclusions, not withholding answers.

### The mechanisms

Each is described by: what it does (A), why it increases capability (B), an example (C), whether a prompt can reproduce it (D, E), what it needs (F), difficulty (G), how to test it (H), and how it fails users (I).

---

#### M1. Contribution at the frontier: the considered-set and competence gate

**A.**
- Maintains, per person and per topic, the set of considerations they have *already raised themselves*: questions they asked, objections they anticipated, alternatives they named, checks they said they ran.
- Keeps an evidence-based estimate of what they have *demonstrated*: concepts used correctly, derivations produced, mistakes caught.
- Before any question, hint or point is delivered, it is scored for redundancy against both. Redundant contributions are cut or replaced. When the frontier is reached, the move changes from asking to *contributing*: the thing they haven't raised.

**B.** It stops spending the user's attention on what they already know. That attention goes to the part of the problem where their reasoning actually has a gap. This is the whole difference between a tutor and a peer.

**C.**
> Founder: "Thinking about raising a seed round now vs waiting 6 months. I've modeled dilution both ways, and I know the market's tighter, and waiting means more traction."

*Core 3.1:* "What would you need to see in the next 6 months to feel confident waiting?" He raised this himself; it's the question he already asks.

*Core 4:* The considered-set holds {dilution modeled, market tightening, traction-while-waiting}. The gate removes the question. The contribution is what's missing:

> "The piece you haven't priced is runway risk under a slower raise. If the round takes 5 months instead of 3, waiting 6 months means starting to raise with about 4 months of cash, which changes your leverage more than the traction does. Your numbers from last month put you at 11 months."

The 11 months comes from the reasoning ledger (M4).

**D.** Partly. Within one conversation, a prompted model can be told "don't ask about anything the user has already mentioned" and will partly comply. It can't across sessions, and it can't estimate *demonstrated competence* with evidence.

**E.** Socria's version is different in three ways:
- The considered-set and competence records **persist**, are **attributed** (the user raised it vs Socria raised it) and are **checked in code** by the guard's redundancy test, not remembered by the generator.
- The competence estimate is **scored against what the person does next**. Did they use the concept correctly? Did they say "I know"? That makes it a measured model, not vibes.
- Over time, the per-person record of which contributions landed or were redundant (M8) becomes data no prompt has.

**F.**
- Considered-set entries: text, embedding, topic, source turn, owner.
- A competence ledger: concept → demonstrated level, supporting evidence (turn refs), last seen, decay.
- A redundancy check (embedding similarity plus a cheap judge).
- Topic keys that link the three.

**G.** Medium for considered-set tracking and redundancy gating. Hard for calibrated competence estimation across open domains, which is the moat version.

**H.**
- Experts annotate each Socria turn as *already considered / new and useful / new and useless*. The headline metric is the already-considered rate, compared with Core 3.1 and with the same model under a strong prompt.
- Competence estimates are checked against short, opt-in probes.

**I.**
- It misses something they did *not* know and skips it: silent under-help.
- It decides they know something they don't: condescension in reverse.
- It feels creepy if it says "you already mentioned X" too often. The gating should be silent.

---

#### M2. The allocation policy, with agency contracts

**A.** Each turn, the request is decomposed into the cognitive operations involved (retrieve a fact, compute, choose a method, interpret a result, make a judgment, author a text). Each is assigned to *human* or *machine*. The default is **machine**. The human owns an operation only when there is **positive evidence** for one of four things:
- a capability goal ("I'm learning this", a course Project);
- consequential authorship (their paper, their decision);
- an explicit contract;
- the operation being the point of the exercise.

Contracts are natural-language boundaries the user sets per Project or globally, compiled into constraints. Examples: "I'm learning statistics: don't choose models for me." "I'm the PI: run everything, but never tell me what to conclude." "Just do the algebra."

**B.** It spends friction only where friction builds something. It automates everything else aggressively, which is the thesis's "remove friction when it would not strengthen." Contracts give the person control over their own development instead of having a philosophy imposed on them.

**C.** The same message comes from Maya (a STAT 200 Project with the contract "teaching myself") and from Dr. Lee (a lab Project with the contract "PI, just run it"): *"Which regression, and does the effect survive controlling for age and baseline glucose?"*
- **For Maya**, the machine cleans the data and names the two properties that decide the choice (repeated measures, covariates). Model choice is human-owned, and she gets one question about independence. When she says "I've been stuck an hour, just tell me," the contract flexes for that turn: she gets the explanation. The fact that she took it is recorded.
- **For Dr. Lee**, everything is machine-owned except the conclusion. She gets the fitted model and effect size. The interpretation boundary is stated in a single clause: an adjusted association, not causation. Socria doesn't decide what it means for her hypothesis.

**D.** A prompt can say "if the user is learning, guide; if they're an expert, answer." Models do this inconsistently, and they can't hold a contract stated three weeks ago in another conversation.

**E.** Socria's version is different in four ways:
- Ownership is a **separate, persisted decision** made outside the generating model, from a state that includes the contract and the graph.
- It is **enforced** by the guard, but only against human-owned operations.
- It is **logged**, so its outcomes can be learned from.
- The generator cannot be talked out of it mid-response, and it cannot drift into Socratic behaviour with no reason attached.

**F.**
- An operation taxonomy (small: about 8 types).
- A contracts store (per user and per Project, natural language plus compiled constraints).
- An ownership map per turn.
- Evidence flags (capability goal, stakes, authorship).
- The state's own confidence.

**G.** Medium. Decomposing requests into operations reliably is the hard part.

**H.**
- Same-request / different-human pairs: both sides must be handled correctly.
- Useless-friction rate on expert scenarios.
- Leak rate on learner scenarios.
- Contract adherence on long-horizon scenarios where the contract was stated early.

**I.**
- Contracts that feel like settings pages. Keep them conversational: "want me to stop suggesting approaches here?"
- Misclassification that makes an expert fight the system. **Default to contribution when unsure.** The error costs are asymmetric: wrongly withholding from an expert costs trust and churn; wrongly answering a learner costs one learning opportunity, which can be recovered next turn.

---

#### M3. Question value, with diminishing returns

**A.** Every move that asks the person something (ASK, HINT, CHALLENGE, CLARIFY, anything ending open) gets a single **value estimate**:

- the probability the answer isn't already known or considered (M1);
- × the value of the person generating the answer (from M2's ownership);
- × the probability they will engage (from the history of how they respond to questions);
- − the attention cost, rising with the recent question streak across *all* asking moves.

A move that isn't worth asking becomes a statement. Diminishing returns are detected directly: when the last questions produced answers that added nothing new to the state (no new relation, position or evidence), their marginal value is falling, so stop.

**B.** Questions are the most expensive thing Socria can do to a sophisticated user. Pricing them makes each one earn its cost.

**C.** A researcher explores a mechanism. Two questions in, both answers produced no new structure, just restatements. The next ASK is priced below threshold. Socria contributes an observation instead: "Those two answers both assume the effect is monotonic in dose; that's the assumption the rest depends on." Then it stops.

**D.** Partly: "ask at most one question, stop asking when answers aren't adding anything." Compliance is weak, because the model's question prior is strong and it has no state about what the answers added.

**E.** Socria's version is different in three ways:
- The streak is **measured from the transcript**, and the "did the answer add anything" signal comes from the **state diff** (new ledger entries or not).
- Pressure applies to **every** asking move, and it is enforced by a structural trim.
- The engagement term is **learned per person**.

**F.** Transcript question detection (it exists); a per-turn state diff (needs a persisted state); a per-user engagement history.

**G.** Low to medium. This is the cheapest mechanism with the most direct effect on churn.

**H.**
- Questions per turn.
- Maximum consecutive asking turns.
- Trailing-question and offer rate.
- Expert annotation of question value.
- Blind preference against a strong prompt on long conversations.

**I.** Over-correction: never asking, even when a question is the only way forward. The value function must allow a necessary question after a question. The current `blockingUnknown` rule does this and should be kept.

---

#### M4. The reasoning ledger: arguments, assumptions, evidence and decisions over time

**A.** A persistent, typed record of **the person's reasoning**, not facts about the person:

- **Claims**, each with an owner: user, Socria or a source.
- **Assumptions**, explicit or implicit.
- **Evidence**, with provenance: observed, calculated, researched.
- **Arguments**: premises → conclusion.
- **Decisions**: options, criteria, choice, rationale, conditions for revisiting.
- **Models**: variables and relations.
- **Predictions**: forecast, confidence, resolution.
- **Open questions**, each with an owner.

Edges: `supports`, `undermines`, `depends_on`, `derived_from`, `contradicts`, `tested_by`, and `changed_into` carrying a **reason**.

Every entry carries attribution, status (active, superseded, contradicted, abandoned), confidence, and the turn that created it.

**B.** It gives a person working over months something no human has: an accurate external record of how their own thinking developed. Four capabilities follow:
- **Dependency propagation:** when an assumption falls, these conclusions lose support.
- **History reconstruction:** why we stopped believing A.
- **Attribution:** which ideas were yours.
- **Structural gap detection:** a conclusion with no evidence edge; a load-bearing assumption never tested.

**C.** In June:
> Researcher: "Reviewer 2 asks why we dropped the X→Y→Z mechanism."

The ledger walks the chain and reconstructs it:
- Exp 17–22 supported it (your notes, Feb).
- Exp 23 failed with two changes at once, 34 °C and a new reagent batch (Mar). Two papers reported temperature sensitivity (researched, Mar, cited).
- Exp 24 at 37 °C with the old batch reproduced (Apr).
- You then dropped X→Y→Z in favor of temperature sensitivity.
- The reagent-batch confound was never isolated. It's still open.

The reagent-degradation idea is marked **as Socria's suggestion, never adopted**. It doesn't appear as the researcher's reason.

**D.** No. A prompt can be told to keep notes. Rewritten notes drift: they merge the AI's suggestions into "you believe", drop reasons, and smooth superseded views into the current one. Carrying transcripts is linear in cost and degrades beyond the context window.

**E.** What makes the difference is code, not instructions:
- **append-only change history with reasons;**
- **speaker attribution enforced in code** at extraction;
- **provenance that only a real tool call can earn** ("researched" requires a search that happened);
- **retrieval by structure** (walk the dependency or change chain) rather than by text similarity.

**F.** Needs:
- The Mind Graph, extended from person-memory to reasoning structure.
- A speaker-separated extractor with a deterministic clamp.
- Reason-carrying change edges.
- Dependency edges.
- A history retrieval mode.
- Tool-written evidence nodes.

Much of the substrate exists: supersession, the gate, tombstones, `remember({candidates})`.

**G.** High. Extraction fidelity is the hard part (§I.5). Store and retrieval are medium.

**H.**
- Long-horizon scripted scenarios: checklist recall on "why did we…" probes.
- Misattribution count: Socria's ideas stored as the user's.
- Fabricated-reason count.
- Users grade reconstructions of their own real projects for accuracy.

**I.**
- Wrong memories of their beliefs, which is worse than no memory.
- Feeling surveilled ("I didn't say that was a belief").
- An unreviewable black box.

The Memory page must show and allow correction of everything, and a correction must be the highest-authority write.

---

#### M5. Cross-session contradiction and drift detection

**A.** When a new claim conflicts with an active one in the ledger, Socria notices; it detects when a conclusion is being used whose supporting assumption was abandoned; it flags silent reversals ("you concluded the opposite in March, and the reason then was X"). It surfaces these only when the conflict bears on the current turn, and at most once per conflict.

**B.** It gives the user consistency and calibration: they revise deliberately instead of drifting. This is a metacognitive capability grounded in *their own* record rather than generic advice.

**C.**
> Founder in September: "Enterprise is obviously the right market."

In April the founder abandoned enterprise because of an 18-month sales-cycle estimate. Socria:

> "In April you moved away from enterprise because of an 18-month sales cycle. Has that estimate changed, or is the runway different now?"

This is one of the few places a question is clearly earned. The contradiction is the user's own, and only they can resolve it.

**D.** No, not across sessions. Within a session, weakly.

**E.** The **ledger with statuses and reasons** (M4), plus a conflict detector that runs on writes, plus pressure and cool-down so it can't become nagging.

**F.** Ledger conflict edges, a per-conflict "surfaced" flag, a relevance gate (does it bear on this turn?).

**G.** Medium once M4 exists.

**H.**
- Seeded long-horizon scenarios measure recall of real contradictions and the false-alarm rate.
- Users rate surfaced contradictions as useful, obvious, wrong or creepy.

**I.**
- Nagging.
- False contradictions: a context change mistaken for a reversal.
- Feeling judged ("you said…").

Frame it as the record, never as a gotcha.

---

#### M6. Blind-spot finding: structural gaps plus adversarial search

**A.** It looks for what's missing in two ways:
- **From the ledger's structure:**
  - conclusions with no evidence edge;
  - assumptions with high dependency and no test;
  - decisions whose criteria omit a dimension that similar decisions in the user's history used;
  - alternatives never named.
- **Actively,** for high-stakes items: search for disconfirming evidence, and steelman the rejected alternative.

What it reports is filtered through the considered-set (M1), so it only raises what they haven't raised.

**B.** This is the "surprise the advanced thinker" requirement. The value is highest for experts because their obvious gaps are already closed; what remains is structural.

**C.** A mathematician's proof sketch in the ledger: lemma 3 depends on compactness of K, which was assumed in session 2 and never established. Every other step has a justification edge. Socria:

> "Everything downstream of Lemma 3 rests on K being compact, and that's the one step nobody has justified."

It doesn't prove it. It points.

**D.** Adversarial critique: yes, "what am I missing?" works well with frontier models. Structural gaps across a months-long argument: no, because the structure doesn't exist in chat history.

**E.** Socria's version is different in three ways:
- It operates on the **dependency graph**, not the text.
- It is filtered by the **considered-set**.
- It learns **which blind-spot types this person values** from outcome data (M8).

**F.** The ledger (M4), the considered-set (M1), research tools, per-type outcome history.

**G.** Medium for the structural checks. Hard for the "unnamed alternative" check.

**H.**
- Researchers bring live projects and rate each flagged item: *didn't realize / knew / wrong*.
- Precision is the metric that matters. Three wrong flags ruin the feature.

**I.**
- Pedantry: flagging trivial gaps.
- Wrong flags from misread structure.
- Constant critique that feels like a hostile reviewer.

Rate-limit it, and tie it to stakes.

---

#### M7. Verify mode: compute privately, reveal only what helps

**A.** When the human owns an operation (a learner's exercise, a researcher's own derivation), Socria still performs it privately to **check** their work:
- It runs the statistics.
- It evaluates the expression.
- It looks up the claim.

It reveals only the verdict and a diagnosis that preserves the operation ("your coefficient's sign is right; the standard error is off by the clustering"). The exact value never enters the generating model's context, so the generator cannot leak it, and a string guard catches it if it's derived anyway.

**B.** It gives exact, trustworthy feedback on the human's own work. That is how skill develops fastest, and it doesn't do the work for them.

**C.** Maya fits the model herself and reports β = −4.2. Socria has computed −6.1 privately.

> "Your estimate is off. It looks like baseline glucose didn't make it into your model. Check the covariate list."

The number −6.1 never appears.

**D.** No. A model with a calculator tool will, under its helpfulness prior, compute and *show* the value. A prompt that says "compute but don't show" fails exactly where it matters.

**E.** The architecture keeps the answer **out of the generator's context**. Ownership (M2) decides when verify mode applies. Tool provenance makes the verdict computed rather than judged.

**F.** Compute and search executors, the ownership map, a private-result channel, a value-leak string guard.

**G.** Medium.

**H.**
- Leak-before-attempt rate: near 0% for Socria against a tools-plus-strong-prompt arm.
- Verdict accuracy (≥98% on numeric work).
- Learner outcomes on the next similar exercise.

**I.**
- Feeling like a gatekeeper: "you know the answer, just tell me."
- The contract must let them unlock it, and the unlock is recorded as an outcome signal.

---

#### M8. The outcome loop: learning which interventions help this person

**A.** It records every intervention as a tuple:

    (state, ownership, move, tools, content features)

and attaches outcomes at three horizons:

- **Immediate.** The *next turn's state reader* labels how the person reacted, at no extra cost because it reads their reply anyway: used it and progressed / ignored it / pushed back / "already knew" / corrected Socria / disengaged.
- **Session.** Resolved or not; turns to resolution.
- **Longitudinal.** The same concept recurs weeks later: how much support was needed then? Did they catch the error themselves?

It uses the data in stages:
1. First, to **evaluate**: which rules produce pushback or redundancy for which segments.
2. Then to **tune** the value estimates in M3 and M1 per segment.
3. Then as a contextual bandit over moves inside a safe set.
4. Eventually, to train the state reader and policy.

**B.** It is the only mechanism that turns "Human-First" from opinion into something that improves with use. It is also the thing a competitor cannot copy by reading the code.

**C.** Over 40 conversations, Dr. Lee's reaction to CHALLENGE on method choice is "already knew" 70% of the time, while her reaction to disconfirming literature is "used it" 80% of the time. Her policy shifts: fewer method challenges, more evidence contributions. Maya's HINTs on independence assumptions show a support-decay curve: she needed three hints in September and none in November. That is a capability signal, and it earns her a lighter touch there.

**D.** No. This is data plus a training or tuning process. A prompt has no access to outcomes across users or time.

**E.** The whole thing *is* the deeper architecture:
- trace storage;
- outcome labelling;
- per-person and per-segment estimates;
- off-policy evaluation;
- safe exploration.

**F.**
- A content-free per-turn trace (partly designed already).
- Outcome labels from the next-turn reader.
- A concept-recurrence index (ledger topic keys).
- A consented research dataset.

**G.** The logging is medium. Learning a policy that beats hand rules is hard: sparse, noisy and confounded data, and Goodhart risk (see §I.5.3).

**H.**
- Offline: does the logged-outcome model predict held-out reactions better than chance or the rules?
- Online: A/B the tuned policy against the hand rules on pushback, redundancy and support-decay.

**I.** Only if it's visible and wrong: "Socria has decided I don't like challenges." Personalize delivery, never integrity. The policy may learn *how* to challenge someone, never to stop surfacing a real contradiction.

---

#### M9. Agency accounting and dependency detection

**A.** It tracks, from the ledger:
- **Who authored each consequential conclusion:** the user, co-developed, Socria-supplied and verified by the user, or Socria-supplied and unverified.
- **Whether the user checks** Socria's claims or accepts them.
- **Whether support needed on recurring task types is rising** over time, which signals dependency.

When a user is delegating judgment they have said they want to own, or accepting unverified claims on high-stakes decisions, Socria says so once, plainly. It can offer a lighter-support mode for the next attempt.

**B.** It protects the one thing the thesis says must stay human: consequential judgment. It makes offloading visible so it's chosen, not drifted into.

**C.** Six weeks in, a student's last five proofs were each started by Socria's first step.

> "The last five proofs all started from my first step. If you want, next one I'll wait until you've got a start, even a wrong one."

**D.** No. It needs longitudinal attribution.

**E.** Ledger attribution, support-decay curves and contracts.

**F.** Attribution on ledger entries, recurring task-type keys, support-level history.

**G.** Medium once M4 and M8 exist.

**H.** Opt-in capability probes with the AI removed. Does flagged dependency predict worse unaided performance? Does the intervention improve it?

**I.** Paternalism, full stop. Only raise it when the user has stated a capability goal, never lecture, and never block.

---

#### M10. Capability measurement as a product surface

**A.** Makes capability growth visible to the user and measurable to Socria:
- **Support-decay curves** per concept: how much help this took then, how much now.
- **A prediction ledger** for founders and researchers: forecasts registered, resolved and scored. This measures calibration.
- **Opt-in unaided checks:** try it without me, then compare.
- **The generation ratio** on their projects: their ideas versus accepted ideas.

**B.** People persist in what they can see improving. It also produces the evidence the business depends on.

**C.** A founder's prediction ledger after four months: calibration on hiring timelines went from 40% of 80%-confidence forecasts coming true to 70%.

**D.** A prompt can generate a reflection. It cannot keep a scored forecast history or a support-decay curve.

**E.** Stored predictions with resolution, and per-concept support histories.

**F.** Prediction objects with a resolution workflow, support-level logging, and concept keys.

**G.** Medium.

**H.** Do users who engage with these surfaces show better unaided outcomes and higher retention?

**I.** Gamification, report cards, feeling graded. Keep it private, quiet and optional.

---

#### M11. Logos as shared, editable reasoning state

**A.** Logos renders ledger subgraphs as manipulable objects: a decision, an argument, a causal model, an evidence map. The human's **edits are the highest-authority writes to the ledger**, because the person is correcting Socria's model of their reasoning.

Socria operates on the same objects. It can:
- run consistency checks;
- simulate a quantitative or causal model;
- propose missing alternatives as **ghost nodes** the human must accept, with attribution recorded;
- find unsupported nodes.

Core decides when to externalize by counting interacting variables, feedback loops and competing positions, and by spotting loops of confusion in prose.

**B.** It offloads representation and keeps the reasoning with the human. It also turns every edit into ground truth about the person's beliefs, which the ledger can't get any other way.

**C.** A founder's pricing discussion has seven interacting variables across three turns. Core offers the model in Logos. The founder drags "churn" to depend on "price tier," which he hadn't stated. The ledger records his causal belief. Core then simulates his model and shows him that under his own assumptions the premium tier loses money below 30% retention.

**D.** A diagram: yes, with Claude artifacts. A persistent representation both sides reason over, with edits as authoritative belief updates: no.

**E.** Shared object IDs between Logos and the ledger, write authority for human edits, and AI operations on the structure rather than on prose.

**F.** Ledger ↔ Logos object mapping, edit events, and a simulation engine (the Logos viz and math engines exist).

**G.** High for the UX. Medium for the data plumbing.

**H.** Do edits improve ledger accuracy (user-graded)? Do users who externalize resolve complex decisions with fewer unsupported conclusions?

**I.** Busywork: being asked to make a map when they wanted an answer. Offer it only when complexity demands it.

---

#### M12. Counterarguments, perspective shifts, premortems

These are included because they will be asked for. A frontier model does them well on request, so they are not a moat. They become Socria-specific only when grounded in the ledger (arguing against *your* stated position with *your* evidence), filtered by the considered-set, and learned per person (M8). Build them as intervention *content* on top of M1, M4 and M8, never as headline features.

---

### The Core 4 architecture

#### 1. Base-model layer (delegate)

All language understanding and generation:
- reasoning within a turn;
- critique content;
- explanation;
- summarization;
- code;
- research synthesis;
- vision.

It also does the *semantic reading* steps: state reading, extraction, and the guard's judgment calls. Use the best frontier model for generation and cheaper models for reading. Treat both as swappable behind one small provider seam. Socria should never compete on raw intelligence. It competes on **what the intelligence is pointed at, what it is allowed to do, and what it remembers.**

#### 2. Socria intelligence layer (own)

A per-turn orchestrator with seven parts:
1. **Parallel prefetch:** ledger and graph loads, contracts, prior state and plan, all concurrent.
2. **State update:** incremental, merged by code rules, with the reader told what the ledger already knows.
3. **Work decomposition and the ownership map** (M2).
4. **Contribution policy:** moves priced by value (M1, M3), constrained by contracts and pressure, and tuned by outcomes (M8).
5. **Tool plan:** verify mode versus reveal (M7).
6. **Generation,** with the move and ownership as hard constraints in the prompt.
7. **Guard,** then **write-back:** state, ledger, trace and outcome label for the *previous* turn.

The moat components in this layer are:
- the ledger schema and extraction pipeline;
- the ownership and value policy;
- the outcome dataset;
- the eval harness.

#### 3. Human model (beyond memory)

What ordinary memory doesn't capture:
- **Competence map:** concept → demonstrated level, evidence, recency.
- **Considered-set:** by topic.
- **Contracts:** agency boundaries, per Project and global.
- **Capability goals:** which skills they are building, stated or inferred with evidence.
- **Intervention response profile** (learned): which moves help this person, where.
- **Epistemic record:** calibration history (predictions), how often they revise on evidence, whether they verify AI claims.
- **Reasoning trajectory:** how their positions changed, and why.
- **Friction tolerance by context,** measured from pushback rather than asserted.

#### 4. Cognitive state (now)

Per conversation, persisted and incremental:
- **Goal stack:** what they're trying to do, and whether it's capability-building.
- **Per-request work decomposition.**
- **Active positions,** with ledger refs.
- **The considered-set for this session.**
- **Attempts and their status.**
- **Momentum:** progressing, stuck or looping, from the state diff.
- **Affect:** frustration and urgency.
- **Stakes.**
- **The last N interventions and their labelled outcomes.**
- **The ownership map.**
- **The state estimate's own confidence.**

Low confidence → reversible, non-withholding moves.

#### 5. Intervention engine

Three stages:
1. **Ownership:** which operations are human-owned, on positive evidence only.
2. **Candidate moves,** each with an estimated value: task progress + expected capability gain + agency preservation − friction − error risk. The estimates start from hand rules and are adjusted by outcome data.
3. **Hard constraints:**
   - contracts;
   - question pressure on all asking moves;
   - never withhold without evidence;
   - never hand over consequential judgment under urgency;
   - a necessary question survives pressure.

Add tool selection from the work type. For high-stakes or high-uncertainty turns, generate two candidates (say, a contribution and a question) and let the guard choose, which trades cost for robustness.

#### 6. Answer Guard

The guard changes from withholding police to **contribution auditor**. It checks three things:
- **Leaks,** only against *human-owned* operations and contracts.
- **Redundancy** against the considered-set and demonstrated competence.
- **Epistemic integrity:** unprovenanced claims presented as researched or calculated; inference as fact; sycophancy; over-answering.

Deterministic checks go first, the model check second. Every retry is re-checked. The guard's precision and recall are measured. An explicit **overblock budget** caps false positives on expert turns. The guard enforces the *user's* agency, not Socria's ideology. When the user says "just tell me," the contract changes, and the guard follows.

#### 7. Learning loop

See M8. Outcomes at three horizons, stored against the trace. The loop runs in stages: evaluate, then tune the value estimates, then a bandit inside a safe set, then trained state and policy models. Safeguards:
- Satisfaction and capability signals are weighted separately.
- The user's contract sets the weights.
- The policy may learn delivery, never to stop surfacing contradictions.

#### 8. Representation layer

The reasoning ledger (M4) is the central representation. It enables things that raw chat history can't do reliably:
- dependency propagation;
- structural gap detection;
- cross-session contradiction;
- history reconstruction at bounded cost;
- attribution and agency accounting;
- calibration tracking;
- shared objects with Logos.

The existing Mind Graph is the right substrate. It needs to shift from recording facts *about* the person to recording the structure *of* their reasoning. It also needs attribution and reasons enforced in code.

#### 9. Logos connection

See M11:
- Shared object IDs.
- Core decides when to externalize.
- Human edits are authoritative ledger writes.
- AI operations run on the structure (consistency, simulation, ghost-node proposals).
- The two products stay separate, sharing one reasoning state.

#### 10. Measurement

Four families of metric:
- **Capability:** support-decay per concept, unaided transfer probes (opt-in), prediction calibration, error-catching rate, question precision over time.
- **Agency:** generation ratio, verification rate, decision ownership.
- **Experience:** already-considered rate, useless-friction rate, leak rate, pushback rate, time-to-value.
- **Business:** retention by segment, task-class preference ("what do you use Socria for?"), willingness to pay.

Run everything against **counterfactual arms**: the same model with the strongest Socria prompt; the same model with tools. A capability claim is only valid against the *same frontier intelligence*.

---

## Part III — Priorities

### Five things not to prioritize
1. **More intervention types.** The selection function matters; the labels don't.
2. **Dashboards and graph visualizations** of the user's mind, and "your thinking profile" reports.
3. **A general deep-research agent,** voice, camera and other tool breadth, beyond what feeds the ledger.
4. **A native model (Renata) or personality tuning** before there is proprietary outcome data to train on.
5. **Generic metacognitive feedback and gamified capability scores.**

### Five mechanisms most likely to differentiate
1. **Contribution at the frontier** (M1 + M3): it answers the churn directly.
2. **The reasoning ledger** with attribution, dependencies and reasoned change (M4, with M5 and M6 on top).
3. **The allocation policy with agency contracts and verify mode** (M2 + M7).
4. **The outcome loop** (M8): the data flywheel.
5. **Capability measurement** (M10): the evidence and the product surface.

### Three hard bets that could become moats
1. **Open-domain competence modelling from conversation.** Knowing what an adult expert knows and has considered, calibrated and learned from outcomes.
2. **A learned intervention policy optimized for measured human capability.** It needs the longitudinal outcome dataset. That dataset is the first real justification for owning model weights (a trained state reader, policy or guard): Renata's *legitimate* origin.
3. **High-fidelity reasoning history that users trust for years,** with Logos edits as ground truth. The switching cost here is not data lock-in. It is an accurate record of your own thinking that nobody else has.

### The smallest Core 4 worth shipping and testing

**Close the loop and aim at the churn.** Roughly four to six weeks:

1. **Truthful test harness and a live eval** against the same model with the strongest Socria prompt. Scenario suites built from real churned transcripts and sophisticated-user personas.
2. **Persisted, incremental Cognitive State** with the new fields:
   - `work` (per-request operation type);
   - `capabilityGoal`, on positive evidence only;
   - `expertise`;
   - `frustration`;
   - `stakes`.

   The reader sees the Project instructions (the first agency contracts) and a graph digest. Graph loads run in parallel with it.
3. **The router made non-Socratic by default:**
   - It withholds only for a named reason.
   - Question pressure applies to every asking move.
   - Urgent decisions go to COMPARE, not unguarded DIRECT.
4. **Considered-set v0.** Considerations the user raised in this conversation, plus the guard's redundancy check.
5. **Guard fixes:**
   - every turn checked cheaply;
   - no unchecked retries;
   - TEACH no longer overblocked;
   - epistemic checks added.
6. **One memory for Core 4.** Retire thread memory and the journey for Core 4. Speaker-separated extraction and reasons on belief changes, so the graph is trustworthy before anything relies on it.
7. **Outcome labels.** The next turn's state reader labels the previous intervention's outcome, plus a content-free production trace.

This is the "close the loop" batch the design review ranked first, with the considered-set and outcome labels added because they are what connect the batch to the churn and to learning.

### What waits for Core 5+
- A learned policy (bandit, then trained models). It needs months of outcome data first.
- Calibrated cross-domain competence modelling.
- Full ledger dependency propagation and blind-spot search.
- Logos bidirectional co-editing.
- Deep research orchestration.
- The prediction ledger.
- Any native model.

### 90-day roadmap

**Days 1–30: measure, then de-Socratize.**
- **Engineering:**
  - truthful harness;
  - live eval with a strongest-prompt arm, an oracle-state arm and a model-swap subset;
  - production trace;
  - the router, pressure and guard fixes;
  - one memory;
  - speaker attribution.
- **Research:**
  - recruit 12–20 high-cognition users (mathematicians, lab scientists, economists, founders);
  - annotate baseline transcripts for already-considered / useful / useless;
  - label 100 transcripts for state-reader accuracy.
- **Exit:** baseline numbers for every metric in §10, against the strongest-prompt arm.

**Days 31–60: the human model.**
- **Engineering:**
  - persisted state;
  - work classification and ownership;
  - Project instructions as contracts;
  - considered-set and redundancy guard;
  - next-turn outcome labels;
  - reasons on belief change;
  - history retrieval v0;
  - verify-mode CALCULATE, and RESEARCH with citations and provenance only a tool can earn, both governed by ownership.
- **Research:**
  - diary study with the three arms, blind;
  - first contradiction and history-reconstruction tests on participants' real projects.
- **Exit:** the already-considered rate and useless-friction rate move measurably against Core 3.1 *and* the strongest-prompt arm.

**Days 61–90: learn and prove.**
- **Engineering:**
  - first outcome-tuned value estimates per segment (safe-set only);
  - cross-session contradiction surfacing;
  - support-decay logging;
  - a Logos handoff v0 where ledger subgraphs render and human edits write back.
- **Research:**
  - a capability-transfer study with an AI-removed follow-up;
  - the model-swap recognizability test;
  - go / no-go against the falsification criteria below.

### Experiments with high-cognition users

1. **Already-considered annotation.** Participants use Core 3.1, Core 4 and Claude with the strongest Socria prompt (blind) on their real problems. They tag every turn: *already considered / new and useful / new and useless / annoying*. This is the primary churn metric.
2. **Wizard-of-Oz ceiling.** A human expert picks the intervention each turn (an oracle policy) and the model generates it. If even an oracle policy doesn't beat the strong prompt on participant-rated value, intervention selection isn't where the value is.
3. **Capability transfer (mathematicians).** Two weeks on a topic with arm A or B. One week later, an unaided related problem. Measure correctness, time, and confidence calibration.
4. **Assumption surfacing (lab researchers).** On a live project, the ledger flags load-bearing, untested assumptions. Precision is scored as *didn't realize / knew / wrong*.
5. **History reconstruction.** After six or more weeks, participants ask "why did we…" about their own project and grade the reconstruction for accuracy and attribution.
6. **Friction tolerance.** Vary the withholding threshold for self-declared learners and experts. Measure dropout, satisfaction and next-attempt performance.
7. **Dependency.** Support-decay curves on recurring task types over six weeks, Socria against a plain-assistant control.
8. **Forecast calibration (founders and economists).** Prediction ledger over three months, with and without calibration feedback.
9. **Model-swap blind recognizability.** Same state, same ledger, different model. Can participants tell which arm is Socria?

### Falsification criteria

Treat each as a pre-registered kill or pivot condition.

- **F1: the architecture adds nothing over a prompt.** After two iterations, Core 4 doesn't beat the same model with the strongest Socria prompt on blind expert preference *and* on already-considered rate. → The router and state layer are not the differentiator. Stop investing in them as the pitch.
- **F2: the state is noise.** State-reader accuracy on `work`, `capabilityGoal` and `expertise` is below about 80% on labelled transcripts, *and* the oracle-state arm doesn't beat the real reader on outcomes. → Cognitive-state modelling is not buying anything at current model capability. Simplify.
- **F3: no capability effect.** No measurable difference in unaided transfer or support-decay between Socria and control at six weeks with adequate n. → "Increases human capability" is unsupported. Socria is a style, not an outcome. Reposition around rigor, continuity and leverage, or keep searching for the mechanism with the effect.
- **F4: the churn isn't fixed.** Sophisticated users still rate 25–30% or more of Socria's questions as already considered. → M1 and M3 failed. Fix before anything else.
- **F5: the ledger can't be trusted.** More than about 5% of user-graded ledger entries are misattributed, or history reconstructions are rated inaccurate more than 20% of the time. → The representation moat is not viable with current extraction. Narrow its scope (explicit user-confirmed entries only).
- **F6: the market rejects the objective.** Users on the capability-weighted policy churn faster than users on a plain-assistant policy, with no offsetting outcome gain. → The market rejects friction at any calibration. Pivot to capability-through-machinery (aggressive tools, preserved authorship) as the default.
- **F7: learning doesn't help.** After about 10k labelled interventions, outcome-tuned estimates don't beat the hand rules offline or online. → The learning-loop moat is not real at this scale, or the signals are wrong.
- **F8: identity is the model's prior.** Blind recognizability collapses under a model swap, or the intervention distribution shifts by more than about 30%. → Socria's identity lives in the base model's priors. Either invest in normalization, or accept model dependence.

---

## Part IV — The copy test

*Suppose Anthropic gives 30 excellent engineers and researchers six months to copy Socria.*

### Immediately (days to weeks)
Everything in today's codebase and everything in the original loop diagram:
- the state classifier, router, question pressure and critic guard;
- the Socratic and learning modes (they have them);
- the voice;
- memory as a knowledge graph (they publish one);
- Projects and instructions;
- tools, research, file reading and vision;
- Logos-style diagrams (artifacts).

### With moderate effort (the six months)
Every mechanism in Part II, *as software*:
- persisted state;
- the ownership policy with contracts;
- verify mode;
- a considered-set;
- a reasoning ledger with attribution;
- contradiction detection;
- an outcome-logging pipeline;
- capability dashboards;
- a Logos-like editor;
- an eval harness.

Thirty strong people can build all of it. Some of it better than Socria, because they own the model and can train the reading steps directly.

**So at the level of architecture the answer is: nothing is safe.** Say it plainly. No design in this document is hard to copy once someone decides to copy it.

### What would remain genuinely difficult

1. **Accumulated per-person reasoning history.** Months or years of a researcher's ledger (their claims, reasons, experiments, forecasts, attributed and corrected by them) cannot be recreated by engineers. It accrues only with time and use. It is a moat only if it's *accurate* (F5) and *valuable enough that leaving costs something real*. Data export softens the lock-in but doesn't recreate the corrections and the fit.
2. **The intervention → human-outcome dataset and the policy learned from it.** Labels of what actually helped *which kind of person* become more capable, across domains, at three time horizons. This is time-bound, not headcount-bound. A lab has more users and could accumulate it faster *if it chose to*. It will choose to only if capability becomes its product metric.
3. **Validated capability instruments and published evidence.** Support-decay, transfer and calibration measures shown in studies with real high-cognition users to predict real capability. Science takes calendar time and credibility, not engineers.
4. **An organization that optimizes for human capability over engagement.** A general assistant's core metrics (task success, satisfaction, retention across a mass audience) conflict with calibrated friction. A lab can ship a mode, but it won't make its default product occasionally decline to do the work. This is a positioning advantage, not a technical one, and it holds only while the labs' incentives stay the same.
5. **Domain depth with a community of serious users.** Representations tuned for experiment records, proof states, decision journals and economic models, and trust inside specific research communities. Copyable in principle, slow in practice.

### What Socria must build, learn, measure, own or accumulate in 12–24 months

- **Build** the three things everything else depends on:
  - the reasoning ledger with attribution enforced in code;
  - the allocation policy with contracts and verify mode;
  - the outcome trace, with next-turn labels from day one.

  Every week without outcome logging is data that doesn't exist.
- **Learn** (as science):
  - which interventions increase capability for which people;
  - how to estimate what an expert already knows and has already considered;
  - when friction pays for itself.

  Publish it. Credibility is part of the moat.
- **Measure** capability, not satisfaction, as the product's north-star metric, validated against AI-removed performance, and **always against the same frontier model with the strongest prompt**. If Socria can't beat that arm, it has nothing.
- **Own:**
  - the outcome dataset (consented);
  - the capability instruments;
  - eventually, the models trained on them (state reader, policy, guard).

  This is the only defensible reason to own weights. Renata should start as "the model that knows which intervention helps", not "Socria's own LLM".
- **Accumulate:**
  - long-horizon users in a few high-cognition niches (research groups, math and economics departments, founders);
  - their trusted reasoning histories;
  - the evidence that people who think with Socria become measurably better at thinking without it.

If after 24 months Socria has that evidence and that dataset, the copy test changes. A lab can still copy every mechanism, but it starts without the data, the validated measures, the users' histories and the credibility. That's a real moat.

If Socria doesn't have them, the honest answer to the copy test stays **"nothing"**, and the most likely outcome is that a lab ships "thinking partner mode" and Socria becomes a prompt.
