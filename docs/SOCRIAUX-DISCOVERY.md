# SocriaUX — the spatial creative brief

What SocriaUX understands before it makes someone's work, and how they shape it: a brief laid out in space that the
person reads, edits and generates from — not a chat, not a form. The design engine (docs/SOCRIAUX-REBUILD.md: HTML
artboards, the designer prompt, the workspace and its conversational editing after generation) is unchanged; the brief
only decides what to raise, what is understood, and what the designer is handed.

`Describe the idea → the brief materializes → explore and refine it in place → Generate (any time).`

## What was wrong

**Then: a chat.** The previous version (below) fixed the questionnaire but kept the briefing as a chat: one question
per turn in bubbles, the brief hidden in the model's memory, the person's original words scrolled away, and a choice
could only be changed by saying so in another message. Nothing they had settled was visible or editable in place.

**Before that: a questionnaire.** Traced end to end (the old reader's own transcripts, kept in the session's audit):

- **A fixed sequence.** Every poster was asked "What should the poster say? The headline, and the date or place…", then
  moods, then palettes, whatever the person had already said. "Make me a poster." → "An underground electronic music
  event." was taken as the headline and composed as "An underground electronic music event".
- **Answers parsed into slots.** A long story ("my grandmother planted tomatoes in the vacant lot…") was cut into a
  headline; "It is called Velour" became the poster's words; "premium-looking but I'm not sure" was read as a subject
  ("a luxurious graphic for premium-looking but i'm").
- **Detailed requests still interrogated.** A full brutalist editorial brief was asked for its headline and never made.
- **Delegation ignored.** "Surprise me" and "dreamy" became subjects ("a graphic for surprise").
- **Options always shown.** Moods and palettes appeared on every poster as a step, not when they helped.
- **The designer got slots, not intent.** What reached the engine was a headline field and a mood name; the nuance of
  what was said was gone.

## How it works now

```
the home: one composer → Begin
  └─ the spatial brief (components/ux-v0/studio/SpatialBrief.tsx)
       header: what is being made (switchable) · design system · saved · Generate (always)
       ├─ their idea, at the top, as they wrote it — editable in place
       ├─ SocriaUX's one line on what it took ("An underground night — how it feels is most of it.")
       ├─ the considerations open now: 0–3, one lead, placed in the work area (words, a choice, palettes, type, moods)
       ├─ What's understood: the brief's lines (editable; "yours" once edited), picks with their own colours and faces,
       │   settled answers (Change), SocriaUX's reading (Keep / Not this), Keep out, their notes, references
       └─ "Add anything, or change something": a note, a site to read, pictures
every change → the brief updates at once → one plan request (debounced 450 ms, stale answers discarded)
  POST /api/ux-v0/studio-questions { context, images? } → { plan: note, ready, modules ≤3, answers, retire, brief, mode }
Generate → designBriefOf → the design workspace designs at once (no approval, no directions to choose)
```

| Piece | File |
|---|---|
| The brief, the aids, the spatial model (`SpatialBrief`, `BriefModule`, `MAX_OPEN` 3, `MAX_ASKED` 6) | `lib/ux-v0/studio/brief.ts` |
| The model's side (server-safe): instructions, what it reads, its JSON schema, `normalizePlan`, `revivePlan` | `lib/ux-v0/studio/discover-model.ts` |
| The person's operations and the plan carried out: `answerModule`, `pickOption`, `skipModule`, `reopenModule`, `editPrompt`, `editField`, `addNote`, `removeNote`, `removeChosen`, `setPaletteColour`, `keepTentative`, `dropTentative`, `applyPlan`, `startMaking`, the reader, `designBriefOf` | `lib/ux-v0/studio/discover.ts` |
| The route (existing `studio-questions` stage, economy tier, structured output, 3600 max tokens) | `app/api/ux-v0/studio-questions/route.ts` |
| Who plans (model, or the reader when it cannot be reached) | `components/ux-v0/studio/discoverClient.ts` |
| The page; its styles (hairline rules, serif questions, no cards or bubbles) | `components/ux-v0/studio/SpatialBrief.tsx`, `spatial-brief.css` |
| Wiring: plans, debounce, notes, sites, pictures, Generate | `components/ux-v0/studio/ProjectConversation.tsx` |
| The handoff: brief → project memory, format, first request | `lib/ux-v0/design/start.ts` |

### What the model returns

One plan per change, as validated JSON (never code or markup — the page renders only the five module kinds it knows):
`note` (one line on what it took), `ready` (Generate would make a good first draft now), `modules` (the open
considerations: id, topic, question, kind, options/placeholder, aid, one `lead`), `answers` (rewrites of answers a
later change superseded), `retire` (open considerations that no longer matter), `brief`, `mode` (when the work turned
out to be another kind). Code holds it to the rules whatever it says (`normalizePlan`): at most three open, at most six
raised in all, never an answered or skipped consideration again (by id or by subject under another id), aids only when
real (palettes with readable ink, faces from the library, moods with both), each aid kind once, no palettes or type in a
design system, nothing visual for what is already chosen, answers rewritten only for answered considerations, retire
only what is open, a line the person wrote themselves kept over the model's, and a pick kept unless the person took it
back (never on the change that made it — `justPicked`). An answer that is not a plan is no plan: the reader plans.

### Living brief

- **The person's words win.** Their idea stays at the top, editable; a line of the brief they edit is marked "yours"
  and the model's later readings never overwrite it.
- **Latest holds.** A change of mind in a note rewrites the superseded answer and lets its pick go; the old preference
  moves to Keep out; unrelated decisions stay.
- **Explicit, tentative, default — told apart.** "From your words" (what they asked for), "SocriaUX's reading — not
  settled" (Keep it, or Not this → Keep out), and at Generate whatever is not said is "left to SocriaUX's judgement".
  SocriaUX's suggestions never become requirements silently.
- **Direct manipulation.** Answer in place, pick an option, change any colour of a picked palette (it stays theirs, in
  role order), take a pick back (its consideration reopens), Change a settled answer, remove a note, skip
  ("Skip — SocriaUX decides"; a bare "not sure" / "idk" counts as a skip).
- **Generate is always there** — in the header and, when nothing is open, beside "Nothing is waiting on you." It works
  while SocriaUX is still reading and with nothing answered (stand-in words, all else left to SocriaUX).

### What the designer is given

`designBriefOf`: their idea in quotes; what they settled (each consideration's topic, question and answer, or "left to
SocriaUX"); their notes (the later one holds); the brief's lines; words to set exactly as given (or the stand-in rule);
"They asked for" / "Implied" / "SocriaUX's own reading, not confirmed by them" / picks as taste ("colours adjusted by
them" when edited) / "Avoid" / references. At most 4000 characters (the designer's memory).

### Visual considerations

Only when seeing helps more than reading: **palettes** (3–4, ink checked at 4.5:1, a colour of their own beside them),
**type** (2–3 pairings set in the real faces with the work's name, loaded and fitted before shown; drawn from all 144 graphics faces, a website's from the 78 it can load — see docs/SOCRIAUX-CONVERGENCE.md), **moods** (3–4
readings of this brief, each its colours and a library face). No library of presets: every option is written for this
brief and validated. The Visual considerations in the screenshots are the model's (scripted in the browser test).

### When the model cannot be reached

Signed out, not configured, over a limit, or a broken answer: the reader plans — only what the work cannot do without
(what it is when nothing says, a logo's name, what an idea that says nothing about its subject is for), each once — and
the brief is otherwise ready. Generate always works.

### What stayed, what went

The design engine, the workspace and its conversational editing are untouched; critiques and design-system imports keep
their director conversation. The briefing chat for creative work is gone: no bubbles, no transcript, no reply chips
during the brief. No new provider, model, paid service or dependency: one call of the existing economy stage per change.

Pictures: `docs/discovery/spatial-02-vague-opening.jpg` (the opening consideration), `spatial-03-vague-atmosphere.jpg`
(moods for this night, SocriaUX's reading beside), `spatial-04-vague-ready.jpg` (nothing open: the brief across the
page), `spatial-06-colour.jpg` (palettes and a colour of their own), `spatial-08-type.jpg` (real faces),
`spatial-11-in-place.jpg` (a line marked yours, Keep out), `spatial-14-phone.jpg` (one column, Generate docked).

## Briefs played through (real model plans)

`test/browser/ux-v0/discover-bench.mjs` plays twelve people through the product's own code. Every plan request is
written to an exchange folder exactly as the route sends it (instructions plus JSON schema, and the brief as it
stands) and answered by a model; the answer goes through `normalizePlan` and `applyPlan`. The person answers the lead
consideration in words, picks from its aid, adds a note, or hands it over; when nothing is open or their script is
spent they press Generate. The answering model was a Claude model standing in for the route's configured model (no
paid API call from this environment).

Final run (round 2, every answer regenerated after the fixes below):

| Scenario | Idea | What the brief raised, and what happened | Raised | Aid |
|---|---|---|---|---|
| A vague | Make me a poster. | what it's for → "an underground electronic music event" → ready → Generate | 1 | — |
| B detailed | A brutalist editorial poster… black and cream… | nothing — ready at once | 0 | — |
| C premium (logo) | premium-looking, not sure of the style | which premium (moods) → "old luxury magazine, but futuristic" taken whole → the name → Generate | 2 | moods |
| D colour | spring plant sale, no idea about colours | palettes for a nursery → one picked → Generate | 1 | palettes |
| E type-led | "Kerning Club", don't know fonts | pairings set as Kerning Club → one picked → Generate | 1 | type |
| F dreamy | I want something dreamy. | what it's for → "my sister's art show, soft watercolour landscapes" → dreamy read from her paintings → Generate | 1 | — |
| G long story | A poster for our community garden | what it asks of people (choice) → the grandmother's-tomatoes story, taken for its meaning ("warmth with a bit of rebellion") → Generate | 1 | — |
| H named logo | A logo for a coffee roaster called Ember & Oak | nothing — the name is given, ready at once | 0 | — |
| I change of mind | A playful poster for a children's book fair | ready at once; a note "Actually, make it sophisticated and editorial instead." → feel rewritten, "playful, childish look" moved to Avoid → Generate | 0 | — |
| L low-information | something cool | what it is → "not sure" (a skip) → ready on SocriaUX's judgement → Generate | 1 | — |
| M campaign | launch campaign for our oat milk brand | its voice (choice) + where it runs → the pieces and the name given instead → voice left to SocriaUX, "where it runs" retired as answered → Generate | 2 | — |
| N website | A website for my pottery studio | what visitors should do (choice) → booking classes → Generate | 1 | — |

12/12 generated; 0–2 considerations each (11 in all, mean 0.9); no subject raised twice; nothing open at Generate;
visual considerations in 3/12, each where the open question was taste (premium, colour, lettering). Round 1 (the
instructions before the fixes) raised 16 (mean 1.3) with moods in 5/12, and showed two gaps the stand-in also named:
an off-topic answer left its consideration's wrong answer on display, and a shrug was stored as an answer. Fixed: an
answer that says something other than what was asked still settles that consideration (its content goes where it
belongs; the answer is rewritten only if it would mislead), and a bare "not sure" / "idk" / "whatever" is a skip — in
the instructions and in code (`skips`). The bench now also applies a note when nothing is open (scenario I had been
generated before its note in round 1). Still ambiguous to the stand-in and left as judgement: whether a logo with no
name can be "ready", and how far an off-topic answer must be rewritten.

## Quality: does discovery make better work?

The same designer (the real designer prompt, through the workspace harness in `test/browser/ux-v0/design-bench.mjs`
with `DESIGN_EXTRA`), given what the product hands over when the person makes it at once (the bare request, through
`designBriefOf`), and given what discovery wrote for the same person (the final run's `brief-A-vague.txt` and
`brief-C-premium.txt`). The designer was again a stand-in model; first designs, before the self-review pass.

| | Bare request | After discovery |
|---|---|---|
| A — "Make me a poster." | A competent but unrelated exhibition poster: "The Long Light", a striped sunset disc, a serif title. Nothing of the person's event. | "SUBSTRATE": an underground warehouse night — oversized layered capitals in bone and acid green on black, a tilted "no photos // no phones" band, a line-up held on a strict grid. Chaotic, but sophisticated, as they said; every fact a marked stand-in (ARTIST 01, DD.MM.YY, VENUE TBA). |
| C — "a premium-looking brand, not sure what style" (logo) | A generic quiet-luxury mark: a gold arch over "AURELLE — stand-in name, replace", Haute Maison. | "Velour, fragrance house": a Didone wordmark like a magazine masthead, a V monogram with an orbiting dot, ice blue on near-black — the old luxury magazine pushed toward the future, with their name. |

Pictures: `docs/discovery/poster-bare.png`, `poster-discovered.jpg`, `logo-bare.png`, `logo-discovered.png`.

The questions changed what was made, not just how it was labelled: the bare request leaves the designer to guess a
subject and a register; two questions gave it the event, the feeling in the person's words, the name and the analogy.

## Refinement after discovery

The discovered poster above, refined in words through the same designer (stand-in model, `design-bench.mjs`
`Q-A-refine`, starting from `Q-A-discovered`):

1. "Make the acid green a warm orange instead." — every green element recoloured (registration marks, STRATE, the SUB
   outline, 07, the headline act, the highlights); layout, type and words untouched.
2. "Make the line-up bigger and easier to read from across the room." — artist names 44→52 px, times and rooms
   14→18 px, rows taller; nothing else moved.

Across both: 58 of 58 elements kept, 54 unchanged (the four line-up rows changed), none added or removed; two versions
recorded. Picture: `docs/discovery/poster-refined.jpg`.

## Tests

- `test/discover.test.mjs` (56) — what hands it over and what skips; the reader; plans held to shape (≤3 open, one lead,
  aids validated, never an answered subject again, answers/retire only where allowed, picks and their own lines kept,
  `justPicked`); a plan carried out (answered kept, retired gone, the cap); every in-place operation; the designer's
  brief and the handoff (named, formatted, a logo with no name on a logo sheet); what the model reads.
- `test/ux-v0-route.test.mjs` (230) — the `studio-questions` route against a strict fake of the model API: structured
  output schema, plans held to shape, pictures, prose refused, failures calm, the call log.
- `test/browser/ux-v0/studio-qa.mjs` (48) — the built app with scripted plans: tests 1–10 of the brief (vague, detailed,
  colour with swatch edits, type in real faces, clouds as moods, an unusual answer, a change of mind as a note, in-place
  edits, Generate while thinking, logo/website/campaign shapes), signed-out reader paths, references read into the
  brief, a reload keeping everything, a phone, no generation route, no outside host, no page errors.
- `test/browser/ux-v0/discover-bench.mjs` — the briefs played through above.

Against a fresh production build (signed out, as this environment is): studio-qa 48/48, design-qa 39/39 (the workspace
and its edits, unchanged), legacy-qa 8/8, dsi-qa 40/40 (a graphic and a board made in a design system through the
spatial brief, with no visual consideration shown). Full unit suite: 401 suites pass. Typecheck clean.

## Limits

- The plans were written by a stand-in model, not the production model; the prompt and the code are the same, the
  words will differ. No paid model call was made from this environment.
- The "Quality" and "Refinement" sections above were measured with the previous conversational briefing; the handoff
  text has the same structure, so they still describe what the designer receives, but they were not re-run.
- Pictures the person attaches reach the model (two, made small); covered by route tests with a fake, not a real vision
  call.
- Plans are debounced: several quick changes become one request. A slow answer to an older change is discarded.
