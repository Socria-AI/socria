# SocriaUX: the creative intelligence and design engine overhaul

November 2026. This covers what changed, why, how to configure and run it, what was measured, and what is still open. No paid model call was made for any of it. Every result below comes from SocriaUX's own code in a real browser. Cost figures are **estimates**, built from calls measured in an earlier live evaluation ([SOCRIAUX-SOL.md](SOCRIAUX-SOL.md)), and each one is labelled as such.

## Why: the yoga booking screen

The designer asked for a booking screen for a yoga class. SocriaUX made a landing page about the studio: an oversized brand name, "Begin", "Read more", a "why us" grid and a footer. The causes were in the code, not only in the model:

1. **Direction studies were hardcoded.** Every study on the Direction board was the same landing page whatever the brief said, including the "Begin" and "Read more" buttons.
2. **The page type was binary and defaulted to website.** A booking screen became a website unless the words said "app".
3. **Generation was told one universal structure.** The prompt said "a nav first, a footer last; 5–9 sections" for everything.
4. **There was no booking component**, so nothing could be booked even when the model tried.
5. **Directions differed only in tokens.** The three studies of a brief were one structure recoloured; their structural distance was 0.

## What changed

### 1 · What is being made (lib/ux-v0/intent.ts)

The designer's words are read as an **experience**: booking, checkout, dashboard, form, flow, app, data, site, editorial, portfolio or interactive. Each reading records:

- the **task**;
- **requirements** with stable ids (`req-book`, `req-overview`, `req-detail`, `req-donate`…), each tied to the component it needs;
- **prohibitions**;
- the **phrases the reading rests on**.

Some examples of how phrasing changes the reading:

| The designer's words | Read as |
|---|---|
| "a booking screen" | a booking screen |
| "a website promoting a booking app" | a site, with nothing to book |
| "a website … with class booking" | a site that must let people book |

The Living Brief opens with a **What it is** block that shows the reading and the words it came from. The designer can change the kind, the task and the requirements. A correction is final: it survives every rewrite of the brief, including requirements the designer removed.

### 2 · Components that work (render.ts, behaviors.ts)

- **The booking component.** A new section kind built from real radio days and times; full times are disabled. It comes in five compositions: strip, calendar, list, split and immersive. Sample times are labelled as samples ("not live availability").
- **The behaviour runtime** (`BEHAVIOR_SOURCE`). This is SocriaUX's own trusted script, never model code. It is added by nonce inside the sandboxed frame and inlined in exports. It gives:
  - **bookings:** choose, a confirm that is disabled until a time is chosen, a loading state, a confirmation that names the time and says "no booking was made", and "change the time";
  - **forms:** each field validated in place;
  - **tables:** sortable headers, 44 px on a phone.
- **A self-test.** The runtime tests each booking and each form where it stands (a form: empty, every required field is said; complete, it is accepted; then left as it was), and the rendered-page audit runs that test, so a part that doesn't work becomes a finding.
- **Nothing is faked.** No payment, reservation, authentication or database is simulated. A donation form asks for an amount the designer sets and says that no payment is taken.

### 3 · Designs fitted to what they must do (lib/ux-v0/fit.ts)

Whatever a model writes, code makes sure the design has its required components, placed where the task needs them:

- **Task-first screens.** On a booking, checkout, form, flow or dashboard screen, the task leads. Web-only chrome (nav, hero, footer) is dropped, and a "why us" grid is left out as filler.
- **Dashboards** also get their own header if they have none.
- **Every change is written into the design's notes.**

The generation prompt now says what is being made and what it must do (by requirement id), lists what the designer ruled out, and applies a structure rule for the kind of work instead of the universal landing page.

### 4 · Directions that differ in structure (direction.ts PLANS, structure.ts)

Each direction follows a **composition plan** for the kind of work: what leads, the order of the parts, and how each part is laid out.

| Work | Plans |
|---|---|
| Sites | words lead; pictures lead; an index; a poster; side by side; centred |
| Portfolios | the work first; an index of work; one piece at a time; a poster |
| Editorial | a long read; a magazine spread; the text first |
| Dashboards | figures first; the detail first; the trend first (each with its chart and navigation) |
| Forms | one column; split |
| Bookings | strip; calendar; list; split; immersive |

How a plan is chosen and applied:

- **Choice.** Each direction takes its language's best plan that isn't already taken. No two directions lay out the same part the same way, where the kind has another layout to give.
- **In code.** The plan is applied by code, sent to the generator, and kept when the direction is stored.
- **In the studies.** The Direction studies draw it. Studies now show the thing being made, using the brief's own words and actions.

`structuralDistance` measures how far apart two designs are in structure. It is half the edit distance between their sequences of parts, plus half the share of shared parts laid out differently, and it is reported separately from the token distance.

**Since then:** layouts follow what the designer decides (what comes first, the arrangement, the alignment, the pictures), and what is left open is set per project within each language. See [SOCRIAUX-LAYOUT.md](SOCRIAUX-LAYOUT.md).

**Creative DNA and originality:** the design language a project is drawn from (restraint, composition, typography, motion, density and more), read from the brief and from references' pixels, set and locked by the designer. It steers the languages, plans and look of every direction and holds through generation and refinement, and an Originality Audit with justified exceptions and targeted fixes runs in code. See [SOCRIAUX-CREATIVE-DNA.md](SOCRIAUX-CREATIVE-DNA.md).

**Speed, cost and reliability:** every model stage now runs once, on a deadline inside its route's limit, streamed, cancellable and recorded; small edits are done in code; the generator's prompt is cache-friendly. See [SOCRIAUX-PERFORMANCE.md](SOCRIAUX-PERFORMANCE.md).

**And then:** four methods against the generated look: the looks generated pages share, detected and kept out unless asked for; a plan for every direction, critiqued before anyone sees it; building within the designer's own design system; and sections composed from layout pieces. See [SOCRIAUX-CRAFT.md](SOCRIAUX-CRAFT.md).

**The production engine:**
- motion that tells a story (a scrubbed opening, a pinned sequence, pictures arriving, magnetic and tilting responses, lines drawing), inert under reduced motion;
- pictures made in code for the parts that ask for one, with provenance and a reason, and a separate image-model pathway that is off unless configured;
- galleries, filters, chart keys, table filters and a configurator that work, and a 3D object drawn with WebGL;
- rules for tablets and phones, a Type panel, and combining two directions;
- the complexity of a generation read in code to choose its model, and the cost of each accepted design split into text, pictures, attempts and time;
- checks at three widths that try every interactive part.

See [SOCRIAUX-PRODUCTION-ENGINE.md](SOCRIAUX-PRODUCTION-ENGINE.md).

**The creative ceiling:**
- the designer's words read as qualities, refusals, tensions, influences and restrictions, applied in code and held;
- composition primitives: layers, a hand-placed twelve-column field, display type, edge-to-edge and whole-screen parts;
- five more languages and 74 typefaces;
- a working menu on phones, focal points and crops, the story as a choice.

See [SOCRIAUX-CREATIVE-CEILING.md](SOCRIAUX-CREATIVE-CEILING.md).

**Visual originality:**
- shapes constructed from parameters, not picked from a set: nine constructions, custom paths, masks, fragments, wraps
  and edges;
- each direction's shape system derived from its words, look, DNA and moodboard;
- a compositional strategy decided before generation and held after it (the parts it composes rebuilt from their own
  content by five placement logics);
- the habits generated pages fall into, read and answered without swapping one habit for another;
- compositions explored, combined, set aside and held on the canvas.

See [SOCRIAUX-VISUAL-ORIGINALITY.md](SOCRIAUX-VISUAL-ORIGINALITY.md).

### 5 · Model routing (lib/ux-v0/model.ts)

| Stage | Tier | Default model |
|---|---|---|
| Questions, moodboard direction, brief, brief revision | economy | GPT-6 Luna |
| Art direction, generation, critique | premium | GPT-6.1 Sol at medium effort |
| Refinement | economy, or premium when complex | as above |

**How refinement is classified.** Complexity is judged in code (`refineTier`):

- a short change to a selected part is economy work;
- a change with no selection, or one to the structure or the feel, is premium work;
- a change to one decision of the look never reaches a model at all (`refine-local.ts`).

**Slow premium calls.** A premium call gets a time limit (45 s by default). If Sol is slow, the economy model answers within the same 60 s function, and the designer is told.

### 6 · Budgets, the call log and cost by stage (lib/ux-v0/budget.ts, usage-server.ts)

**Before each call** the route checks two things:

- the daily counts;
- what this person has spent today and this month, and what this project has spent overall, against the budgets.

**How the budgets act.**

- **The estimate.** The call's worst case is estimated from its prompt, its answer cap and its reasoning room, and labelled as an estimate.
- **Moved to economy.** A premium call that the budget could not hold, or that could cost more than one operation may, is made on the economy model, and the designer is told.
- **Stopped.** A spent budget stops the call with a plain message.
- **Warned.** A warning appears at 80%.

**The call log.** Every call is written to `ux_v0_calls`: stage, tier, model, API, effort, and the tokens and cost as the provider measured them. The table is deleted with the account and included in the data export.

**In the header.** The cost now opens a panel showing cost by stage, premium calls, and cost per accepted (downloaded) design.

### 7 · Changing a section directly, and locks (lib/ux-v0/edit.ts, SectionEditor.tsx)

**Direct changes.** With part of a generated design selected, the designer can change:

- the words of the exact field the element was drawn from;
- the layout;
- the ground (shown in the design's own colours);
- the spacing;
- its place on the page, or remove it.

Each control applies a real patch, creating a version that Undo takes back. The panel stays on the section through each change, so a layout change can be followed by a lock or new words without selecting it again.

**Locks.** A **locked section** is kept exactly as it is:

- a model's change to it comes back as a question;
- a new generation carries it over unchanged;
- automatic repairs leave it alone and say so.

Only the designer can set or clear a lock: a model can't write one.

### 8 · Checks that catch the original failure (evaluate.ts)

- **Generic actions.** A label that names nothing ("Begin", "Read more", "Learn more"…) is a finding. On the primary action, the brief's own action replaces it automatically ("Give a donation", "See the projects"); a secondary one is dropped.
- **Stock phrases.** "Why us" and "Discover something new" are flagged for the designer to rewrite. Code doesn't invent copy.
- **App screens.** Their headline hierarchy is judged as a screen's, not a page's.

## Configuration

All settings are server-side. No request can name a model, an API, a tier, an effort or a budget.

| Variable | Default | Meaning |
|---|---|---|
| `SOCRIAUX_ROUTING` | `tiered` | `single` runs every stage on the economy model |
| `SOCRIAUX_QUESTION_MODEL` | `gpt-6-luna` | the questions (`DISCOVER`, `STUDIO_QUESTIONS`), whatever the tiers |
| `SOCRIAUX_ECONOMY_MODEL` | `claude-sonnet-5-5` | the economy tier (was `gpt-6-luna`) |
| `SOCRIAUX_PREMIUM_MODEL` | `claude-sonnet-5-5` | the premium tier (was `gpt-6.1-sol`; set it back to run the premium tier on Sol) |
| `SOCRIAUX_ECONOMY_EFFORT`, `SOCRIAUX_PREMIUM_EFFORT` | `low` / `medium` for Claude; `medium` for Sol; the model's own otherwise | reasoning effort per tier |
| `ANTHROPIC_API_KEY` | — | the key for every Claude stage; a Claude stage without it answers "not configured" |
| `SOCRIAUX_TIER_<STAGE>` | — | `economy` or `premium` for one stage (`DISCOVER`, `DIRECTION`, `BRIEF`, `REFINE_BRIEF`, `ART_DIRECTION`, `GENERATE`, `REFINE`, `CRITIQUE`) |
| `SOCRIAUX_MODEL_<STAGE>` | — | one model for one stage |
| `SOCRIAUX_MODEL` | — | **legacy**: every stage on one model, exactly as before routing |
| `SOCRIAUX_PREMIUM_TIMEOUT_MS` | `45000` | when a premium call gives way to the economy model |
| `SOCRIAUX_DAILY_USD` / `_MONTHLY_USD` / `_PROJECT_USD` | 2 / 20 / 5 | budgets per person per day, per person per month, per project |
| `SOCRIAUX_OPERATION_USD` | 0.40 | the most one call may cost, at worst |
| `SOCRIAUX_WARN_AT` | 0.8 | share of a budget at which the designer is warned |
| `SOCRIAUX_MAX_RETRIES` | 1 | asking again when a structured answer is cut at its cap (0–2) |
| `SOCRIAUX_DAILY_CALLS` / `_GENERATIONS` | 300 / 40 | as before |

**Run `supabase/schema.sql` and `supabase/rls.sql` again** to create `ux_v0_calls`. Without it, everything still works and the per-day totals are kept as before, but the call-by-call log is not.

## How it was verified

| What | Result |
|---|---|
| `node test/ux-v0.test.mjs` | 445 passed (94 new: intent, corrections, fit, booking, the runtime in a DOM, the form self-test, compositions, studies, function checks, routing, budgets, direct edits, locks, plans, diversity) |
| `node test/ux-v0-route.test.mjs` | 109 passed (22 new: each stage's model and API, the call log, configuration, the timeout fallback, budgets, a locked section asked about) |
| `node test/run.mjs` (whole repository) | all 382 suites passed |
| `next build` | passed |
| `test/browser/ux-v0/booking.mjs` | 62 passed: five compositions by mouse, by keyboard, inside the sandbox's CSP, on a phone |
| `test/browser/ux-v0/overhaul-bench.mjs` | 52 passed (below) |
| `test/browser/ux-v0/ui-qa.mjs`, against `next start` | 38 passed: a booking project through questions, the brief, three directions, the canvas, the section editor, a lock and the cost panel, at 1440, 1280, 1024, 768 and 390 px; nothing scrolls sideways; the design stays fitted and in view on the canvas at every width; no page errors |
| `workflow-a-create.mjs`, `checklist.mjs`, `acceptance.mjs`, against the same build | workflow A end to end with no errors; checklist 52 passed; acceptance 33 passed |

### The benchmark (offline, `overhaul-bench.mjs`)

Generation used a deliberately bad stand-in answer: the generic landing page that caused the original failure, written for each brief.

| Brief | Read as | Must have | Three directions (plan) | Closest pair: structure / tokens (without plans) | What the bad answer became |
|---|---|---|---|---|---|
| A Yoga booking | booking screen | a booking | craft: split · swiss: calendar · organic: immersive | 0.5 / 0.85 (0) | the booking itself, working |
| B Architecture studio | site | — | gallery: image-led · swiss: index · geometric: poster | 0.5 / 0.7 (0) | nav, hero, features, footer; "Begin" → "See the projects" |
| C Scientific dashboard | dashboard screen | figures, a table | utility: figures first · civic: detail first · organic: trend first | 0.5 / 0.85 (0) | header, figures, table; no "why us" |
| D Fashion editorial | editorial | — | quiet-luxury: long read · broadsheet: magazine · night: text first | 0.5 / 0.7 (0) | "Begin" → "Start reading" |
| E Children's nonprofit | site | a donation form | civic: statement · craft: side by side · poster: poster | 0.333 / 0.85 (0) | the donation form added; "Begin" → "Give a donation" |
| F Motion portfolio | portfolio | — | swiss: work index · gallery: work first · poster: poster | 0.5 / 0.4 (0) | "Begin" → "See the work" |

**Refinement test (A).** All seven checks passed:

1. With type and colour locked, a colour change is caught.
2. A layout change leaves the locked tokens exactly as they were.
3. An interaction change, from day-then-time to one list of every time, works in the browser.
4. The booking stays locked through a regeneration.
5. The export, opened as a file, can be used end to end with no errors.
6. The export keeps the locked colour.

**Cost per project, seven stages (ESTIMATE).** These are medians of the 124 calls measured in November, one call per stage, composed for each routing. The tiered routing itself was not run live.

| Routing | US$ | Model seconds |
|---|---|---|
| GPT-6 Luna everywhere (before routing) | 0.0026 | 35 |
| GPT-6.1 Sol at high everywhere (legacy) | 0.1081 | 270 |
| GPT-6.1 Sol at medium everywhere | 0.0668 | 139 |
| **Tiered routing (new default)** | **0.0437** | **97** |

**Worst case for one call.** Under the tiered routing, the worst case of each premium call is under the US$0.40 per-call budget:

| Premium stage | Worst case |
|---|---|
| Generation | US$0.140 |
| Art direction | US$0.104 |
| Critique | US$0.100 |

## Limits

- **No live model call was made.** How Sol performs inside the new routing, and whether its answers follow the plans, is untested. The routing has been tested against a strict fake of the API.
- **Code doesn't write copy.** Generic headlines ("Welcome to…") are flagged, not rewritten. Only generic action labels are replaced, using the brief's own action.
- **Plans shape layouts, not concepts.** They choose among the renderer's own variants and orders. New layouts need new variants.
- **Some kinds still have few layouts.** A kind with only two layouts (a form) can't be different in all three directions; E's closest pair is 0.333 for that reason.
- **The self-test covers bookings and forms.** Table sorting has behaviour, but the audit doesn't exercise it yet.
- **Narrow screens.** On a phone the work in view takes the whole height and the rail follows below it, and the canvas refits when its width changes. The canvas still shows the chosen viewport (a desktop page fitted to a phone is small); switching to Mobile is the designer's choice.
- **The worst-case estimate is coarse.** It assumes four characters per token and the whole answer cap. It is deliberately pessimistic, and is never shown as a measurement.
- **Per-call timeouts need room.** A slow premium call costs up to 45 s before the economy model answers. On a plan whose function limit is above 60 s, raise `SOCRIAUX_PREMIUM_TIMEOUT_MS` instead.

## Running it

**Unit and route tests:**

```bash
node test/ux-v0.test.mjs
```

```bash
node test/ux-v0-route.test.mjs
```

**The offline benchmark** (no app server, no spend):

```bash
node -e "import('./test/helpers/build.mjs').then((m) => m.buildAll())"
```

```bash
UXV0_OUT=/tmp/bench node test/browser/ux-v0/overhaul-bench.mjs
```

**The booking regression:**

```bash
UXV0_OUT=/tmp/booking node test/browser/ux-v0/booking.mjs
```

**The interface pass** against a production build. Where the browser cannot reach loopback, add `UXV0_FORWARD=1`:

```bash
npx next build && npx next start -p 3100
```

```bash
UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 UXV0_OUT=/tmp/ui node test/browser/ux-v0/ui-qa.mjs
```
