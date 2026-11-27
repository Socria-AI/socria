# SocriaUX — creative discovery

How SocriaUX talks with someone before it makes their work: a creative director's conversation, not a questionnaire. The
design engine (docs/SOCRIAUX-REBUILD.md: HTML artboards, the designer prompt, the workspace) is unchanged; discovery
only decides what to ask, when to stop, and what the designer is handed.

## What was wrong

Traced end to end before the change (the old reader's own transcripts, kept in the session's audit):

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

One decision per turn, made by a model when it can be reached:

```
person says something
  ├─ "make it" / "you decide" / "surprise me" / "Make it now"  → made at once (no model call)
  ├─ a website named ("like larkfield.studio")                  → read by the server's guarded reader first
  └─ the turn: POST /api/ux-v0/studio-questions { context, images? }
        → { decision: ask | make, say, question{text, aid?, suggestions}, brief }
        ├─ ask  → one question in the chat (with a visual aid only when seeing helps)
        └─ make → the design project is created from the brief and the workspace opens and designs — no approval,
                  no directions to choose
```

| Piece | File |
|---|---|
| The brief and the aids: types, normalizers, contrast and font checks | `lib/ux-v0/studio/brief.ts` |
| The model's side (server-safe): instructions, what it reads, its JSON schema, `normalizeDecision`, `reviveDecision` | `lib/ux-v0/studio/discover-model.ts` |
| The conversation's side: `applyDecision`, `chooseAid`, `wantsMake`, the reader fallback, `designBriefOf` | `lib/ux-v0/studio/discover.ts` |
| The route (existing `studio-questions` stage, economy tier, structured output) | `app/api/ux-v0/studio-questions/route.ts` |
| Who decides the turn (model, or the reader when it cannot be reached) | `components/ux-v0/studio/discoverClient.ts` |
| The turn in the page; one question at a time; the aid; thinking dots | `components/ux-v0/studio/ProjectConversation.tsx`, `Conversation.tsx`, `AidPicker.tsx` |
| The handoff: brief → project memory, format, first request | `lib/ux-v0/design/start.ts` |

### The brief (context management)

Held in the conversation's state (`StudioState.brief`) and returned whole by the model every turn, in the person's own
words: `kind, purpose, audience, content` (only words they said should appear, copied exactly), `feel`, `explicit`
(asked for outright), `implied` (strong implications), `tentative` (SocriaUX's own reading, never promoted to explicit),
`avoid` (turned down; a reversed preference moves here — the latest instruction wins), `references`, `open`, and
`chosen` (what was picked from an aid). Picks are kept by the conversation, not the model's memory: a pick is let go only
when the model lists it in `clear` because the person took it back, and never on the turn the pick was made.

### What the designer is given

`designBriefOf` writes the opening words in quotes, the conversation since (each question with the answer it drew),
then the brief's fields with their standing made explicit — "They asked for", "Implied by the context", "SocriaUX's own
reading, not confirmed by them (keep it or change it freely)", "Picked from what SocriaUX showed them — a picture of
their taste, not a layout to copy", "Avoid". When no words were given: "write short stand-in words that fit, keep facts
as obvious placeholders, and say which words are stand-ins" — no headline is ever asked for like a form. The designer
prompt (`lib/ux-v0/design/prompts.ts`) has matching rules for stand-in words and for tentative/picked lines.

### Visual aids

Only when seeing would help more than reading, at most one per question, each kind once per conversation:

- **palettes** — 3–4 palettes designed for this brief; every one must have an ink that reads on its ground at 4.5:1 or
  better (checked in code, unreadable ones dropped); shown with "Aa" in its ink on its ground and its hex codes.
- **type** — 2–3 pairings, faces only from the font library (`lib/ux-v0/fonts.ts`; an invented face is dropped; a
  display-only face never sets text); set in the faces themselves with the work's own name, loaded before shown.
- **moods** — 3–4 genuinely different readings of this brief, each its colours, a library face and a line on how it
  would feel.

Never for something already said or chosen, never inside a design system for palettes or type (the system decides),
never a generic preset, never an image. Every aid can be picked, or ignored: the person writes instead — mix two, change
one, name hex codes, take one pairing's headline face with another's text. Palettes also offer **your own colour**: the
system's colour picker, whose colour is written into the reply (not sent) so it can go with anything else they say.

### Never required

Under every waiting question: **Skip** and **Surprise me**. A skip is said as the person's reply ("Skip"); the model is
told to settle that point itself, never ask it again, and either ask the next thing that matters or make it; the reader
does the same, and never reads "Skip" as what the work is about, its words or its name. **Surprise me** makes the work at
once with no model call. While these show, the composer's **Make it now** steps aside (it is there whenever no question
is waiting).

### Stopping

The model makes the work when the purpose is understood and what is open can be settled by judgement, when another
question adds little, when the opening request is detailed, or when the person hands it over. Code enforces: after five
questions the next turn makes it; "make it"/"you decide"/"surprise me"/"Make it now" make it at once with no call.

### When the model cannot be reached

Signed out, not configured, over a limit, or a broken answer: the reader in `discover.ts` decides, and the model is left
alone for a while (30 minutes on sign-in/limit/server errors, else 2). The reader asks only what the work cannot be made
without — what it is (when nothing says), a logo's name, what a poster is for — at most two questions, and never parses
an answer into a headline. Then it makes the work.

### What stayed

The design engine, the workspace and its edits are untouched: an existing project is edited in its workspace, never
re-discovered. Critiques and design-system imports keep their own director flow.

### What was removed

- The old fixed question machinery — `lib/ux-v0/studio/discovery.ts` (engine-drawn moods from a fixed vocabulary of
  themes and qualities, palettes derived by rule, type pairings from a fixed table of characters), `vibe-preview.ts`,
  `realise.ts`, and the director's creative questioning (`creativeNeeds`, `discoveryQuestion`, "show me others",
  discovery taps). It had been unreachable since discovery moved to the model; now it is gone, with its tests. The only
  questions written in code are the signed-out reader's three factual ones (what it is, a logo's name, what it is for).
- Choosing a direction for a website made in conversation: the website workspace no longer offers "Choose a different
  direction" for it, nor "Explore directions" from its Creative DNA — it is changed in words. (Older website projects
  made in the pre-studio flow keep their own steps.) No new provider, model or image
service: the turn uses the existing `studio-questions` stage (economy tier, one call per turn, 2400 max tokens).

## Conversations (real model turns)

Benchmark: `test/browser/ux-v0/discover-bench.mjs` runs twelve people through the product's own discovery code; every
SocriaUX turn is written to an exchange folder exactly as the route would send it (instructions plus JSON schema, and
the conversation), answered by a model, and read back through `normalizeDecision`. The answering model here was a
Claude model standing in for the route's configured model (no paid API call was made from this environment), so the
conversations show what the prompt and code produce, not the production model's exact words.

Final run (after two rounds of fixes, all answers regenerated):

| Scenario | Opening words | What happened | Questions | Aid |
|---|---|---|---|---|
| A vague | Make me a poster. | "What's the poster for?" → "An underground night, so atmosphere is most of it. Which of these is closest to the night you're picturing?" (moods) → typed "chaotic, but still sophisticated" → made | 2 | moods |
| B detailed | A brutalist editorial poster… black and cream… | made at once | 0 | — |
| C uncertain premium (logo) | I want to make a premium-looking brand, but I'm not really sure… | "What does the brand do?" → analogy "old luxury magazine, but futuristic" taken whole → lettering pairings for that masthead → name given → made | 2 | type |
| D colour unknown | A poster for the spring plant sale… no idea what colours | palettes for a nursery → picked → made | 1 | palettes |
| E type-led | A type-led poster for "Kerning Club"… don't know fonts | pairings set as "Kerning Club" → picked → made, the pick in the brief | 1 | type |
| F dreamy | I want something dreamy. | what it's for → "a poster for my sister's art show — soft watercolour landscapes" → made, dreamy read as hazy watercolour | 1 | — |
| G long story | A poster for our community garden | → the grandmother's-tomatoes story taken for its meaning ("warmth with a bit of rebellion") → made | 1 | — |
| H "You decide." | A logo for a coffee roaster called Ember & Oak | one question → "You decide." → made at once, no call | 1 | — |
| I change of mind | A playful poster for a children's book fair | → "Actually, make it sophisticated and editorial" → made; playful moved to avoid | 1 | — |
| L low-information | something cool | what it is → "not sure" → one more → "idk" → made from SocriaUX's own judgement | 2 | — |
| M campaign | A launch campaign for our oat milk brand | personality question → pieces and name volunteered → made as a campaign | 1 | — |
| N website | A website for my pottery studio | what people should do → "book wheel-throwing classes" → made | 1 | — |

12/12 made; 0–2 questions each (mean 1.2); no conversation ran past the person's own replies; aids in 4/12, each where
colour, lettering or atmosphere was the open question. Transcripts and the brief each conversation handed over are
written to `transcripts.md` and `brief-*.txt` in the bench's output folder.

What the rounds fixed (each verified in the next round):

- Round 1: turns narrated the process and quoted the instructions ("A logo is mostly its name…"); two questions per
  turn; suggestions answering a different question; the unsure-premium case asked the name before the taste. → one
  question, short, never narrate; taste before facts when the person is unsure; suggestions must answer the question.
- Round 2: **a real bug** — the model returned `clear: ["type"]` right after the person picked a pairing (reading
  "clear" as "settled") and the code wiped the pick, so the designer never saw it. → the context now says what the
  latest reply picked (`justPicked`) and such a pick can never be cleared on that turn; the field's wording was made
  unambiguous. Also: compound first questions ("What is it for, and who will see it?"), the model copying the prompt's
  own examples word for word, and every acknowledgement ending "…, then." → an explicit counter-example, examples that
  are not test scenarios, varied acknowledgements.

Still seen in the final run: one turn with two question marks (I: "Playful how? Picture a kid…: what makes them run
toward the books?"), and a few acknowledgements longer than they need to be. These are the model's wording; the code
does not rewrite questions.

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

- `test/discover.test.mjs` — the turn, the brief, the aids (contrast, library faces, one per kind), picks kept and the
  fresh-pick guard, the reader, the handoff text, stand-in words.
- `test/ux-v0-route.test.mjs` — the `studio-questions` route against a strict fake of the model API: structured output
  schema, pictures, limits, unreadable answers (422), signed out (401).
- `test/studio.test.mjs`, `test/design.test.mjs` — the rest of the studio and the design engine, unchanged in behaviour.
- `test/browser/ux-v0/studio-qa.mjs` — the built app: scripted model decisions (question, moods with loaded faces,
  reload keeps the waiting question, pick → make with the pick in the brief), palettes with readable ink answered in
  words, type pairings in real faces then a tap-reply then "You decide." (no call), the kind changed by a reply,
  websites read before the turn and handed to the model, signed-out reader paths (what it is → a logo's name → made;
  what a poster is for → "Make it now"; a website made at once), a phone's width, no generation route, no outside
  host, no page errors.
- `test/browser/ux-v0/discover-bench.mjs` — the real-conversation benchmark above.

Results against a fresh production build (`next build`, `next start`, placeholder sign-in keys — signed out, as this
environment is): studio-qa 41/41 (including each aid sample fitting its card in its own face, never broken inside a
word); design-qa 39/39 (the workspace and its edits, unchanged); legacy-qa 8/8 (older graphics and boards still open);
dsi-qa 40/40 (one step adjusted: a board in a design system is now made as soon as its pieces are known, without asking
for its words). Typecheck clean.

## Limits

- The conversations were answered by a stand-in model, not the production model; the prompt is the same, the words
  will differ. No paid model call was made from this environment.
- Pictures the person attaches go to the model (two, made small) and the instructions say to use only what is actually
  seen; this path is covered by route tests with a fake, not by a real vision call.
- The model can still occasionally ask a compound question or a lower-value one; code limits the count and the aids,
  not the wording.
