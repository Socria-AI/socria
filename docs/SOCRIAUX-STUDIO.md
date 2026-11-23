# SocriaUX — talking to a creative director: describe, decide, make, refine

> What do you want to make? — SocriaUX understands what you are after, asks only what it needs to (one meaningful
> question at a time, or none), and then makes the work itself, original and editable, without leaving the
> conversation.

This document records how the experience is built: the audit behind the creative discovery rework, what was removed,
what replaced it, the data it keeps, how it is verified, and what it does not do. The first studio and its redesign
are kept at the end as their own audits.

> **Superseded in part by the dynamic creative discovery redesign — docs/SOCRIAUX-DYNAMIC-DISCOVERY.md.** The fixed
> "How should it feel?" question, a website's three looks, a graphic's three directions, the logo concepts stage and a
> board's three systems are gone: after what the work cannot be made without, SocriaUX asks at most three creative
> questions generated for the brief (moods drawn by the engine, palettes, lettering in real faces, or a written
> question), the model writing them when it can be reached, then makes the work at once. What follows describes the
> rework before that one.

## The creative discovery rework — audit and decisions

The redesign before this one began every work in a conversation, but the conversation was still a questionnaire: a
fixed sequence of stages, each a large question with cards or chips to pick, a wall of stock pictures from Openverse
to like or turn down, colour and type asked about as such. Audited against "less questioning, better questioning,
more creative freedom":

| Where | What was there | What it did | Now |
| --- | --- | --- | --- |
| Questioning | A predetermined path per kind of work (`discovery.ts`: `pathOf`, `currentStage`, depth 1–3, *Keep refining*) | Every work walked the same stages, a detailed brief as much as a vague one | A director (`lib/ux-v0/studio/director.ts`) that decides each turn from what is understood: what the work cannot be made without, then at most one optional question, then the work |
| Questioning | Each stage a control: cards, chips, palettes, type specimens, sliders, steppers, a references wall (`controls.tsx`) | A selection exercise; typing was secondary | One line of Socria's, in the serif, and the person's own words. At most three suggestions under a question, a tap away — never instead of writing |
| Questioning | Colour, type, composition, density asked as questions | The person interrogated about the engines' decisions | Never asked. They are the engines' to propose and the person's to change in words, or to point to (a website, a picture) |
| Questioning | A question already answered by the words could still be shown for confirmation | Repetition | What the words say is recorded as said and never asked; a question is asked once and never again |
| Questioning | Skip, back, reopen, *you decide*, *surprise me* as buttons on every stage | Machinery to operate | *Skip this* on an optional question; *Make it now* (whatever is open is left to SocriaUX, a missing headline or name left as a bracketed gap); replies read as commands in the person's words ("go ahead", "surprise me", "something different", "the second one") |
| References | Openverse searched automatically as every conversation opened; a wall of stock pictures to like, "not this", "more like this", search again (`research.ts`, `Vision.tsx`) | A mediocre stock-image carousel in front of every work | Removed, with its UI. Reference discovery happens when asked: a website the person names or links ("like stripe.com") is read on the server and shown as a reference — the page drawn inert, its colours, its type, a designer's notes, and what to take from it |
| References | The website workspace's moodboard searched Openverse from the browser and keyed stock libraries on the server (`image-search.ts`, `/api/ux-v0/images`) | The same carousel, in the older workspace | Removed. The moodboard learns from a website instead: its colours join the board as a palette, its faces as a type pairing. Pictures the person brings stay |
| Choices | A website's look chosen from three on a stage card | A forced step | Offered in the conversation once the brief is enough, as working pages: one at a tap or in words, **two combined** (one's colours, the other's type and structure), **something different** (three others), or **you choose** |
| Choices | A graphic's three directions: choose one, or three others | No way to combine, refuse, or leave it to SocriaUX | Combine two (both ways round), *Something different*, *You choose* — at a tap or in words in the conversation beside the work ("the first's colours with the third") |
| Creation | Even a detailed brief opened the conversation page first | A step before the work | A brief that says enough is made at once from the home: the work opens with its directions waiting and the conversation docked beside it |

## What was built

### The home (`components/ux-v0/studio/StudioHome.tsx`)

- One composer: describe it, paste a whole brief, paste a screenshot, attach files, add a link. The words are read
  live ("Reads as poster"). When they settle nothing ("something for my bakery") the line says *I'll ask what it is*
  — no menu of kinds, no cards: the conversation's first question is what it is.
- A detailed brief goes straight to the work; anything else opens the conversation with Socria's first turn already
  said: what it understood, and its one question.

### The director (`lib/ux-v0/studio/director.ts`)

- **Understanding.** Everything said is read by the engines' own readers (`facts.ts`): the kind of work, quoted
  words, dates and places, a name, the subject, temperament, named styles and colours, pieces of a campaign, what a
  site must do, pictures brought. What the words settle is recorded as *from your words* (`seedFromWords`).
- **How much to ask.** Required first — only what the work cannot be made without and nothing gives: a poster's words,
  a logo's name, a campaign's pieces, a site's name, a critique's design, an import's source. Then, only when the brief
  is thin (no feel, look, details or pictures), *one* optional question chosen for this work: what a logo stands for,
  what people should do on a site, whether a picture is to be placed or only learnt from, how it should feel — with
  suggestions for its subject (a bakery: *warm and handmade*, not *futuristic*). Asked once, skippable, never repeated.
  A detailed brief needs none; the vaguest needs two or three.
- **Replies in the person's words.** Each message is read for what it means before what it says (`hear`): make it,
  surprise me, skip, something different, a change of kind ("actually, a website instead"), a link to learn from — or
  words, which answer the question waiting (a headline and its supporting lines from a sentence, a name from "it's
  called Halden", a purpose from "people should book a session and get in touch") and change anything else they name
  (a feel, a style, three colours, what to avoid), each change said back. A reply that answers nothing is asked again,
  another way.
- **Gaps, honestly.** *Make it now* leaves what can be left as a bracketed placeholder (`[Open Day]`) shown in the
  brief as *yours to fill in*; a logo's name, a critique's design and an import's source are never gaps.
- **The brief, as understood.** A drawer lists each line with where it came from: *from your words*, *you said*,
  *SocriaUX decides*, *yours to fill in* (`briefLines`, `studio/Brief.tsx`).

### References — websites, read when asked (`lib/ux-v0/studio/references.ts`, `reference-server.ts`, `/api/ux-v0/reference`)

- **When.** Only when the person points to one: a link, or a site named after "like", "look at", "similar to",
  "inspired by"… (two at most per message). "Find me some references" without one is answered with how it works —
  nothing is searched or invented.
- **How.** On the server, through the same guarded reader as the design-system import (`dsi/site-server.ts`): http or
  https only, public addresses only (checked before the request, at connect time, and on every redirect), the page
  and the stylesheets it names, each size- and time-capped; nothing run, nothing kept. Rate-limited per account or
  address (`uxref`). The browser never fetches the site.
- **What comes back.** A designer's reading (`siteReadOf`): its colours (ground, ink, accent when the site says
  them), its typefaces, and notes (a light or dark ground, the accent's hue, how much colour, serif or sans headings,
  capitals, corners). The page is drawn inert for a sealed frame (`previewDoc`): scripts, handlers, frames, forms'
  targets, refreshes and imports removed, a policy that lets nothing run, connect or submit, its own pictures and
  fonts only.
- **In the conversation.** A reference card: the page, its address (opening apart), its colours, its notes, and what
  to take — colours, type, layout, mood, or all of it; *Not this one* sets it aside and *Use it after all* brings it
  back. A site that cannot be read is said so, with what to do instead ("tell me what you like about it, or drop in a
  screenshot").
- **Reference, never asset.** Nothing of a site is placed in the work. What reaches the engines is what it was taken
  for: its colours as the palette when the person named none, its faces when the font library knows them, its notes
  as words for the look (`prefsOf`). The person's own colours always outrank a reference's.
- **Pictures the person brings** are asked about only when it matters — placed in the design, or used for their look
  (their colours become the palette).

### Directions — optional, combinable, skippable (`options.ts`, `studio/Conversation.tsx`, `graphics/GraphicBrief.tsx`)

- **A website** is offered three looks in the conversation once the brief is enough, each a working page with the
  person's words (the board engine's systems for those words, held to their colours): *Make it in this one*, tick two
  and combine them either way round, *Something different* (three others, kept apart from those seen), *You choose* —
  or say it ("the second one", "combine the first and third", "the first, with the third's colours").
- **A graphic** opens on its three directions: choose one, tick two to combine (one's colours, the other's type,
  structure and composition: `combineDirections`), *Something different*, *You choose* — at a tap, or in words in the
  conversation beside it. A logo's concepts and a board's systems keep their own choosers.
- None of it is required: *Make it now* or *you choose* skips every choice.

### One surface (`studio/Conversation.tsx`, `studio/ProjectConversation.tsx`, `studio/StudioRail.tsx`)

- **While talking:** one column, Socria's words unboxed in the serif, the person's in moss-50 bubbles, the reply at
  the foot (white, 16 px corners with one drawn in), files attached or pasted at any point. *Make it now* and *Skip
  this* sit above the reply when they apply. The brief is a drawer.
- **Once making:** the project becomes the work in its engine's workspace and the conversation docks beside it as the
  one place to type, as before; the transcript runs from the first sentence to the latest change.
- **Generation stays the engines':** a graphic's directions (`composeGraphic`, `proposeDirections`), a logo's concepts
  (`explore`), a board's systems (`proposeSystems`), a whole working website (`startWebsite`). Nothing calls a model.

## Data

`DesignProject.studio` (`lib/ux-v0/studio/schema.ts`), optional and normalised on read, so no migration:

- `modeBy` — chosen by the person, recognised, or `unsure` (the first question is what it is);
- `pending` — the topic of the question waiting; `asked` — every topic asked once (never asked again); `round` — how
  many times other looks were asked for;
- `answers` — as before, the keys the engines read (`apply.ts`), plus `what` and `go` (*make it now*);
- `references` (at most 12) — websites read: address (http or https, no credentials), host, title, colours, ground,
  ink, accent, faces, notes, what is taken, *liked* or *rejected*. References of the old image search, and its log,
  are dropped on read.

## Verification

Nothing in the conversation calls a model. The one thing that leaves the browser is a website the person points to,
and it is read by the server's guarded reader.

| Check | Result |
| --- | --- |
| `test/studio.test.mjs` — intent and facts; the record (what is waiting, asked, other rounds; the old image search dropped on read); a detailed brief made with nothing asked, the home going straight to the work only when the opening said so; a vague request asked what it is, then only what the work needs, one question per turn; an optional question asked once, skippable, never repeated, its suggestions belonging to the subject; a required one never skipped; *make it now* with gaps marked in brackets (never a logo's name, a critique's design, an import's source); answers in the person's own words (headlines and supporting lines, names from sentences, purposes and parts of a site); commands in words; a change of kind keeping what was said; a website's looks chosen, combined either way round, refused for others (kept apart across rounds), left to SocriaUX, chosen at a tap, still on offer after a site is read; boards, critiques, imports, logos and pictures; websites read through the guarded reader with a scripted fetcher (only the page and its stylesheet, a private address refused, no address refused), the reading (colours, ground, ink, accent, faces, notes), the inert preview (scripts, handlers, frames, refreshes, imports and form targets removed, a policy that lets nothing run, held to a size), references held to their shape, said in the conversation, read again in place, what they give the work (colours only when the person named none, faces, never placed in it), set aside; graphic directions combined; every engine reached as before; no emoji | 160 passed, 0 failed |
| `test/browser/ux-v0/studio-qa.mjs` against the production build — the home as one composer, with no image library named; words that settle nothing answered with a question, not a menu; a detailed brief made at once (no conversation page, three directions waiting, nothing asked) and two of its directions combined (the first's colours, the third's type and structure); a vague request asked what it is, then a poster's words (a tap, then the person's own sentence), two questions in all; a thin brief's one optional question kept through a reload, then skipped; a logo's name asked and never skippable, read from "It's called Halden", then one feel question; a website made with *Make it now*, its name a marked gap; a website's three looks offered as working pages (nothing asked), *Something different* giving others, two sites named in a sentence read through the server's reader (recorded here), one shown inert with its colours, notes and what to take, one that could not be read said so, set aside and brought back, two looks combined and the website made; a phone | 40 passed, 0 failed; 0 model routes called; no image library and no outside host reached from the browser (only the sign-in script and the engines' typefaces); 0 page errors |
| `test/browser/ux-v0/acceptance.mjs` — the older checks, the moodboard now learning from a website (its colours and type joining the board) and saying when one cannot be read | 34 passed, 0 failed |
| `test/browser/ux-v0/graphics-qa.mjs` — the graphics workspace (its directions now with Combine, *Something different*, *You choose*) | 56–58 of 58 across six runs on this build and three on the previous commit. Two checks depend on the composition drawn for a random project: 6 (a carousel's slide count) and 22 (the exported SVG holding each headline word whole — at 96 pt a narrow headline box breaks "LETTERS" across lines). With the project id fixed, the previous commit and this one draw the same composition and both fail 22 alike |
| `test/ux-v0-route.test.mjs` — the reference route refusing before any request: no address, a private address, a cloud metadata address signed out, an address with credentials; nothing asks a model | 197 passed, 0 failed |
| `test/ux-v0.test.mjs`, `test/takeover.test.mjs` — the image search's checks removed with it; Unsplash still told when a photo kept before is used (only Unsplash, only at its own address, only with its key); the reference route gated like the other SocriaUX routes during the relaunch | pass |
| `npx tsc --noEmit` | clean |
| `npx next build` | passes |
| `node test/run.mjs` (the whole repository) | all 394 suites passed |

How the browser run was made: `next start -p 3100` on the production build, with placeholder sign-in keys (a
production-style key, so no development handshake redirect) and `VERCEL_ENV=preview` so the page is open;
`UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/studio-qa.mjs`. The website reader is recorded
in the browser (this machine reaches no outside host): the server's own reader is checked with a scripted fetcher in
the unit tests.

## Limits — said plainly

- **No model in the conversation.** Understanding, the questions, the replies, the references' reading and every start
  are deterministic code. A reply that fits none of the readers is kept with everything said (the engines read it) or
  asked again, never guessed at.
- **Websites only, and only when asked.** There is no search for references: a person points to a site, or brings a
  picture. A site that renders its page with scripts reads thinly (the reader takes the HTML and stylesheets it is
  served, never running anything), and SocriaUX says what it could read.
- **Inert previews.** A site's page is drawn without its scripts and with its pictures and fonts only; pages built in
  the browser show little.
- **Revising after the work has begun** is done in the workspace (by hand, or in words through the rail).
- **Files other than pictures are held in memory** until the import or critique begins; after a reload the
  conversation asks for them again.
- **The model-led website process** (its own questions, a brief, directions, generation) remains in the website
  workspace for sites begun there before the studio; it needs sign-in, and its moodboard now learns from websites and
  the person's own pictures instead of searching image libraries.

## Appendix — the redesign before this one

*Kept as it was recorded; its references (Openverse) and its staged questions were replaced by the rework above.*

The first studio already began every work in a conversation. Audited against "one conversation, immersive creative
discovery, real internet inspiration, original generative execution", this is what still stood in the way:

| Where | What was there | What it did to the experience | Now |
| --- | --- | --- | --- |
| Home | Seven kind-of-work pills (Any + six), a card per kind with examples, a "pick up where you left off" grid, the whole collection below | A dashboard to read past before saying anything; the kind of work chosen from a menu | One composer. The words are read; the collection has its own view (`?work=1`); three quiet text links lead back to what was in progress |
| Home | A critique "door" that replaced the composer | A second way of starting | A design attached with words that say so opens its critique at once |
| Questioning | "The look": style cards from the 75-profile style library (`selectStyles`), plus one generated | A preset style selector, forced first | Gone. The look comes from references the person likes, and from their words |
| Questioning | Palettes: the chosen style's palette and four classic pairs | Predefined colour palettes | Proposed from the colours read out of the references liked (together, then each), then from the words' temperament |
| Questioning | Type: the chosen style's faces and classic pairings | Preset type | Faces the liked references' influences carry, then voices the generative language finds for the words |
| Questioning | A board's "direction" cards | A preset look for a campaign | Gone; references, then the systems the board engine proposes from the brief |
| Questioning | No inspiration from outside the engines | Nothing real to react to | Real references found on Openverse as the conversation opens (below) |
| Conversation | "Write the brief yourself" / "Plan it in the workspace" | Disconnected tools one click from the conversation | Removed: the conversation is the way in |
| Conversation | One column: transcript, then the question card, decisions in a side panel | The question competing with the transcript | The conversation on the left, the question large on the right, what is taking shape under it; decisions in a drawer |
| Workspaces | The conversation rail on the right, docked only from 1600 px | The conversation a guest in the workspace | On the left, where it began; docked from 1280 px, open by default for work begun in conversation |
| Workspaces | A second place to type beside the rail (the graphic ask bar, the board ask bar, the page composer) | Two conversations | While the rail is open it is the one place to type; the workspace's own bar returns when it is put away |
| Workspaces | The graphic editor's layers and inspector always out | The generated work not the focus | The work alone in front; the properties come out while something is selected; "Edit by hand" brings every panel out |
| Workspaces | The steps of the old forms (Brief; Discovery · Brief · DNA · Direction for a site) | Workflows already done in conversation, offered again | Hidden for work begun in conversation (kept for work begun by hand) |

Nothing was reskinned in place of a change: each row above is a different interaction, and the code behind the
removed parts (style cards, classic pairs, the brief escape hatches, the mode pills, the home's collection, the
critique door) is deleted, not hidden.

## Appendix — the first studio

The first studio put one conversation in front of six capabilities (graphic, website, logo, design system, board,
critique) with intent recognition, adaptive questions, engine-drawn previews and the conversation carried into each
workspace. Its audit, which this redesign builds on:

### Phase A — audit (before the first studio)

| Area | What exists | Evidence |
| --- | --- | --- |
| Shell | `V0App` keeps the open project in the address (`?p=`), the Design System Manager (`?ds=`), and swaps home and workspaces with a view-transition `passage()` | `components/ux-v0/V0App.tsx:45-73` |
| Home | A museum-style page: the question (`textarea` "What do you want to make?" + **Begin**), four doors (critique a file, **Make a graphic**, **Make a board**, design systems), steps, and the collection (exhibits and index views, search, kind filter, order, delete asked in place, works from other devices) | `components/ux-v0/Home.tsx` |
| Website workspace | Its own questioning (`Discovery.tsx`, one question at a time, options + "+" to combine, skip, delegate, design now), then brief, DNA, direction, design. Questions, brief and generation call model routes (`/api/ux-v0/discover`, brief, generate) and need sign-in; art directions are proposed by the deterministic engine | `components/ux-v0/Workspace.tsx:497-540, 860-905` |
| Deterministic website | `websiteConcept(brief, system)` builds a whole website project (brief, art direction, rendered spec) from words and a Master Design System, with no model; `websiteAnswer` gives nav, opening, points, text, call to action, footer; the renderer also has booking, form, gallery, FAQ, pricing and more | `lib/ux-v0/boards/website.ts:18-55`, `lib/ux-v0/boards/plan.ts:382-396`, `lib/ux-v0/spec.ts:60-122` |
| Graphics | Brief fields (kind, formats, headline, subhead, details, CTA, brand, items, data, mood) read from words by `readGraphicBrief`; three directions from `proposeDirections` + `styledOptions` (a style named in the words leads) + a generated language; `accentFor` reads colour words; logos explored by `exploreLogo` | `components/ux-v0/graphics/GraphicBrief.tsx:48-125`, `GraphicsWorkspace.tsx:126-215` |
| Logo engine | `readLogoBrief` reads name, industry, personality, a category asked for (wordmark, monogram, abstract…), what to avoid ("avoid X", clichés by default); `explore()` builds concepts per category; `logoDoc()` draws one | `lib/ux-v0/graphics/logo/brief.ts:254-365`, `logo/compose.ts:19-35`, `logo/build.ts:373` |
| Style Intelligence | 75 style profiles with palettes, faces and constructions; `selectStyles`, `interpretStyle`, `styledDirection`, `paletteFor`, `facesFor` | `lib/ux-v0/graphics/styles/*` |
| Composition | Generative engine steered by `ConceptConstraints` (`org`: centre, axis, grid, edge, layers, orbit, field, flow…; focal; negative space) through `PlanOverride.generative` | `lib/ux-v0/graphics/generative/concept.ts:28-45`, `compose.ts:322-335` |
| Creative DNA | Nine dimensions with words for each fifth (Minimal ↔ Expressive, Structured ↔ Experimental, Airy ↔ Dense, Quiet ↔ Vivid…); `setDim` records a designer's value; the website direction engine is steered by it | `lib/ux-v0/dna.ts:40-120, 411` |
| Boards | Request read by `readBoardRequest` (materials and counts, quoted words); systems proposed by `proposeSystems`, or three expressions of a linked design system; auto-composition | `lib/ux-v0/boards/plan.ts:60`, `boards/pipeline.ts:27`, `BoardWorkspace.tsx:306-345` |
| Design systems | Registry store (`listSystems`), manager, seven-step import wizard (`kind`, files, URL, token, project), apply/link to projects (`applySystem`), default system for new projects | `lib/ux-v0/dsi/store.ts`, `components/ux-v0/systems/*`, `V0App.tsx:35-43` |
| Critique | `start('critique', { file })` makes a project and the website workspace imports and critiques the file | `V0App.tsx:144-156` |
| Uploads | `addUpload(file)` keeps a picture in this browser as a moodboard reference; `sampleSwatches` reads its colours | `components/ux-v0/uploads.ts:92, 178` |
| Project data | `DesignProject` (IndexedDB first, account copy when signed in), normalised on read, so a new optional field needs no migration | `lib/ux-v0/types.ts:506-543`, `lib/ux-v0/store.ts` |
| Workspace frame | All three workspaces share the `.v0` root (fixed to the viewport, header + body grid) and hold their project in `useV0Project` (one writer, debounced saves) | `components/ux-v0/ux-v0.css:13-20`, `useV0Project.ts` |
| Brand | The SocriaUX brand layer (`.sb`, "Brandbook Version 2": Cormorant Garamond, Geist, apricot, lake, cobalt, burgundy). The design system selected for this work is Socria's own (Instrument Serif 400, Inter, moss on paper, ink at four strengths, no other colour); both faces are already loaded app-wide (`--font-serif`, `--font-sans`) | `components/brand/socria-brand.css:1-80`, `app/layout.tsx:25-66` |
| Tests that drive the home | graphics-qa, boards-qa, logo-qa, style-qa, ceiling-qa type into the textarea and press **Make a graphic** / **Make a board**; acceptance, checklist and moodboard-live press **Begin** | `test/browser/ux-v0/*.mjs` |

**What that audit decided**

1. No new generation path. The studio reads words into the engines' own inputs (graphic brief, logo words, board
   brief, website brief and system, import wizard source, critique file) and steers them only through parameters they
   already take (style, palette, faces, composition constraint, DNA, logo category and avoid list).
2. Discovery runs without a model: intent recognition, question choice, "enough to begin" and every preview are
   deterministic code over the existing engines, so nothing is spent and it works signed out.
3. The website gets a path that works everywhere (`websiteConcept` from the answers); the website workspace's own
   model-backed brief process stays one step away ("write the brief yourself").
4. The conversation is kept on the project (a new optional `studio` record), so it survives reloads and devices and
   is read by the workspaces; the workspaces keep their single writer (the conversation panel is rendered inside each).
5. The brand layer moves to the selected Socria design system at the token level, so home, conversation and every
   workspace stay one product.
