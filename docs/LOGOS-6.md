# Logos 6: what was built

This is the system document for Logos 6.

- **The plan** is `docs/LOGOS-6-PLAN.md`: why, what to measure, and the decisions it rests on.
- **This document** covers what is in the code now, where it lives, how to switch it, and what was deliberately left for later.

Approved on 13 November 2026 as "all phases, to the dev branch". The plan's §10 recommendations were taken as the defaults:

- **Packaging.** The trial gets the challenge on its light model. One gets the standard and deep models.
- **Feature arms.** Treated as product testing: counts only, and no arm is running by default.
- **The proactive flag.** Off.
- **The home screen.** The Universal Map stays the home.

---

## 1. The switches

Every part of Logos 6 is switched in `lib/logos6/switches.ts`.

**Defaults:**

- **Dev, previews and a local server:** every part is on.
- **Production:** every part is off until someone switches it on there.
- **The proactive flag:** off everywhere until it is named. It waits for the benchmark (H1, H3).

| Part | Variable | Default |
|---|---|---|
| All of them at once | `NEXT_PUBLIC_LOGOS6=on\|off` | — |
| Challenge (words, card, selection, document) | `NEXT_PUBLIC_LOGOS6_CHALLENGE` | on off production |
| The "What am I missing?" chip | `NEXT_PUBLIC_LOGOS6_CHIP` | needs challenge |
| The proactive flag | `NEXT_PUBLIC_LOGOS6_PROACTIVE` | off; not yet built (§7) |
| Focus | `NEXT_PUBLIC_LOGOS6_FOCUS` | on off production |
| Links to an idea, idea chips, Project home | `NEXT_PUBLIC_LOGOS6_LINKS` | on off production |
| Add as idea | `NEXT_PUBLIC_LOGOS6_ADD_IDEA` | on off production |
| What a Project rests on | `NEXT_PUBLIC_LOGOS6_PROJECT_RESTS` | on off production |
| Evidence links and "Check against my sources" | `NEXT_PUBLIC_LOGOS6_SOURCES` | on off production |
| "Where do these disagree?" | `NEXT_PUBLIC_LOGOS6_COMPARE` | needs sources |
| Simpler / Deeper | `NEXT_PUBLIC_LOGOS6_SIMPLER` | on off production |
| Explain it back | `NEXT_PUBLIC_LOGOS6_EXPLAIN_BACK` | on off production |
| Guess first | `NEXT_PUBLIC_LOGOS6_GUESS_FIRST` | needs challenge |

Some changes are not behind a switch, because they are fixes or protections that hold everywhere:

- The card's "Challenge it" no longer gets an ordinary explanation. With Logos 6 off it opens Explore's Challenge panel.
- Cards placed by hand, and findings someone kept, survive the map pass.
- Each checkout records the moment that opened the One sheet.

---

## 2. Challenge (Phase 1): `lib/challenge/`

**One engine.** Every way in reaches it, and every result is the same card in the conversation:

- words such as "what am I missing?", "poke holes", "devil's advocate", "what am I assuming?", "what could go wrong?" and "stress-test my argument";
- the chip;
- a card's "Challenge it";
- Explore's Challenge;
- a selection's "Challenge these";
- Focus.

| File | What it does |
|---|---|
| `challenge.ts` | The shapes; reading a challenge back (`sanitizeChallenge`); the words it leaves in the conversation; a finding as a map card (`findingCard`); the considered set (`consideredIn`); when the chip is offered (`challengeReady`). |
| `challenge-intent.ts` | Which words ask. It errs towards not firing: "I'm missing my notes" and "what am I missing about how photosynthesis works?" are not challenges. |
| `challenge-targets.ts` | What the structure shows, found in code: a load-bearing assumption with nothing under it, a claim with no evidence that something rests on, two settled claims in conflict, a constraint against a goal, one option, or no criteria. Each quotes its card, ordered by how much rests on it. |
| `challenge-gate.ts` | The checks, in code. A finding must quote words really in the conversation, the map, a passage or an earlier position. It must be specific (no stock phrases) and new to this line (`lib/core4/considered.ts`). It is calibrated (unsure findings become questions) and capped at five, with three shown. If nothing passes, the answer is that it holds up. |
| `challenge-prompt.ts` | What the model is asked. The material is numbered and keyed, and the model is told that quotes are checked. |

**The route.** `app/api/logos/challenge` mirrors Synthesize:

- auth, rate limit, `withMeter`;
- the trial's day and Sleep Mode, as on every route that asks a model;
- the tier's model, then the gate.

With no key, or no model answering anywhere on the ladder, the structure answers alone and says so.

When signed in, memory's recorded conflicts that this line touches are offered as earlier positions. They stand only if quoted.

**The card.** `components/logos6/ChallengeCard.tsx` is drawn as the conversation's other elements are: hairline rows, the house label, actions as words (*Keep on map*, *Dismiss*, *Discuss*, *More*), and no filled control (Send is the surface's one). A kept finding becomes Socria's card (`origin: 'socria'`, `finding`), joined to the card it is about.

**In the house system.** Every Logos 6 surface uses the shared controls and tokens of `components/logos5/l5-controls.css`:
- **Focus** is the app's sheet (`components/one/one-sheet.css`): the page dimmed, the bare ×, the label over the serif title, hairline rows, *Challenge it* as its one filled control and words for the rest.
- **The offers over the box** ("What am I missing?", "Where do these documents disagree?") are words with *Not now*.
- **Simpler and Deeper** sit in the latest reply's own row of actions.

**The map pass.** `lib/logos6/protect.ts` puts back what the pass dropped, if it was placed by hand (`hand`) or kept from a challenge (`finding`). It also carries over the marks the pass cannot know about.

**The move chooser.** `lib/cognition/assist.ts` treats an explicit request as a challenge (step 8b), so a turn that reaches the reply anyway is still a challenge.

---

## 3. Macro to micro (Phase 2)

- **Focus** (`components/logos6/Focus.tsx`): one idea, with what it rests on, what rests on it, what pulls against it, its passages, the findings about it and the turn it came from.
  - Breadcrumbs: Project › Line › Idea. Escape closes it.
  - It reads the map through `lib/logos6/support.ts`. It is not a seventh renderer.
- **Ways into Focus:**
  - the card's popover;
  - the space's toolbar;
  - ⌘K;
  - a link;
  - an idea chip on the Universal Map;
  - What this Project rests on.
- **Links to one idea.** `/chat?s=<line>&n=<idea>` opens the line, then the idea in Focus. Focus has *Copy link*.
- **The Universal Map:**
  - Idea chips are buttons that open their idea.
  - A touch pinch into a conversation goes down into it, as a trackpad's does.
  - `/` brings back the search box. Dragging files onto the map brings it back too.
- **The space** has *Logic Map* and *Focus* in its toolbar.
- **Add as idea.** Alt+Enter, or the word under the box: a card of the person's own, with no reply and no tokens.
- **Project home** is in the More menu of a filed line, and is the first breadcrumb in Focus.
- **What this Project rests on** (`lib/logos6/project-rests.ts`): the foundations across a Project's conversations, the ones in more than one conversation first, flagged when nothing holds them up. The Project's last reading is kept on the device.

---

## 4. Documents (Phase 3)

| Module | What it does |
|---|---|
| `lib/logos6/evidence.ts` | **Linking:** a card's words found in a passage, deterministically in the browser where the documents live, with no model. **Checking:** supported, partly supported, contradicted or not found. "Contradicted" includes a different figure for the same thing, caught in code. A model's verdict stands only with a quote that is really in the passage it names. |
| `lib/logos6/disagree.ts` | **Where documents disagree:** the figures compared in code first (`lib/runtime/epistemic.ts conflicts`), then a model's pairs held to their quotes, from two documents. The kinds: different definitions, populations, periods, data or methods; direct; or tension. It never picks a winner. |

- **The route.** `app/api/logos/evidence` handles both `check` and `compare`.
- **The cards.** `components/logos6/SourcesCard.tsx`.
- **On the map.** A card keeps pointers (`evidence`: document, block, quote, verdict), never the passage text.

**Brief points.** The plan asked for brief points that open their passage. The brief's own points already do (`components/preview/AnalysisPane.tsx`: each point's page button opens the file with the passage marked). What Logos 6 adds is the other direction: from an idea on the map to the passage behind it.

**A decision against the plan's wording.** The plan proposed teaching the map extractor to emit block keys. Instead, links are computed in the browser from the documents themselves. That needs no change to the map pass's prompt and no tokens, and the text never leaves the device.

---

## 5. Learning, opt-in (Phase 4)

- **Simpler / Deeper:**
  - under the latest reply;
  - on a card's popover (*Simpler*);
  - in Focus (both).
- **Explain it back** (in Focus, on a line of study). The box opens with "So basically, …". That is how the explain planner recognises a teach-back (`lib/runtime/explain.ts`): it is confirmed or sharpened, never explained again.
- **Guess first** (on a line of study). Before a challenge opens, the person can guess which of their own ideas is weakest. One press skips it. The card then says whether the guess was among the findings.

---

## 6. Measurement (Phase 0)

- **Events.** These are in `lib/analytics.ts` and listed in `lib/logos6/vocab.ts`, sent through `lib/logos6/track6.ts`. They are counted first-party within fixed vocabularies (`lib/product-event-kinds.ts`), with each arm beside the total while a feature test runs.
  - The events carry `door`, `level`, `scope`, `count` and `arm`.
  - `from` and `to` are never keys, so an email address can never ride along.
- **Feature tests** (`lib/logos6/arms-server.ts`):
  - an arm is a pure function of the experiment and the user id;
  - nothing runs until `LOGOS6_EXPERIMENTS=l6-challenge`;
  - only trial accounts are assigned;
  - the control arm sees Logos 5.5 for the challenge parts.
- **Attribution.**
  - Every way into the One sheet carries its own trigger: `trial-end`, `sleep`, `maps-limit`, `voice-locked`, `menu` and so on. Before, every one recorded `asked`.
  - A checkout is counted against the last Logos 6 capability used in the seven days before it.
- **`/dev/logos6`** (dev only, owner only):
  - use, by event and arm;
  - voluntary return, by the week a trial began and by arm.

  **Voluntary return** means two or more days back in days 2 to 7 of the trial, counting only days on which no lifecycle email went out that day or the day before. The trial is seven days, so the plan's "days 2 to 14" is measured here as days 2 to 7. It is read from the trial's existing day rows and the email log, with no new table.

**The benchmark** (`evals/challenge/`):
- 80 cases, checked by `validate.mjs`;
- three systems on the same model: Logos 6, a plain "what am I missing?" prompt, and Logos 5.5's panel;
- deterministic grading, blind judge packets, and the plan's gates.

The live run needs `OPENAI_API_KEY` and hasn't been done: this environment can't reach the model.

---

## 7. Not built, and why

| Not built | Why |
|---|---|
| The proactive flag | The plan holds it until the benchmark shows precision and few false alarms (H1, H3). The switch exists and is off. Building it before then would be the contrarian challenge the plan is meant to prevent. |
| Shared rooms on the space | Rooms keep the older view switch. Their shared record, presence and authorship are built around it, and moving them needs a two-person test of its own. In a room, a challenge, check or comparison goes through the room's record, as a synthesis does (the other screen sees its words). Words that ask for a challenge in a room still reach the reply's challenge move. |
| Semantic zoom on the Universal Map | Waits for H8. The doors are now measured (`conversation_opened`), so the map can be compared with the list. |
| Project reading on the server | Kept on the device. Keeping it on the server needs a column on the Project record (a migration), which the plan said to bring back first. |
| Fewer renderers | Nothing was removed. Focus added none; it is a reading of the map, not a drawing of it. |

---

## 8. Tests

| Suite | What it holds |
|---|---|
| `test/logos6-measure.test.mjs` | Switches, arms, events and vocabularies, the use and return measures, attribution. |
| `test/logos6-challenge.test.mjs` | Intent, structure, every rule of the gate, the prompt, read-back, kept cards, the considered set, protection from the map pass, the defect fixed. |
| `test/logos6-sources.test.mjs` | Linking, checking, comparing, read-back, intent, the route. |
| `test/logos6-ui.test.mjs` | The cards and Focus rendered, Project foundations, the evidence edit, and every piece of wiring. |
