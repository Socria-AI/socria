# SocriaUX — the studio: one conversation, every capability

> What do you want to make? — SocriaUX asks first, shows you the choices, and starts when it has enough.

This document records the audit made before the studio was built, the architecture that followed from it, what was
built, how it is verified, and what is not done.

## Phase A — audit (before anything was changed)

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

**What the audit decided**

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

## What was built

### The home — one question (`components/ux-v0/studio/StudioHome.tsx`)

- **The question first.** "What do you want to *make*?" in Instrument Serif, a one-line standfirst, and one white
  composer (16 px corners, one drawn in to 6 px): the field (still named "What do you want to make?"), files and
  pictures (attach or drop), a link (a website or a Figma file), the **design system** it is made in, a live reading
  of the words, and **Begin**.
- **Six kinds of work, or Any.** Graphic, Website, Logo, Design system, Board, Critique — a radio group of pills
  (arrow keys move between them). Each, chosen, says what it is, how it goes, and offers three ways to begin in the
  person's voice (they fill the composer). Any leaves the routing to the words.
- **Intent recognition, said live.** As the person types, `recognizeIntent` (lib/ux-v0/studio/intent.ts) reads the
  words and files: "Reads as logo — names a logo", "Could be a logo or a website: you will be asked". On Begin, a
  clear reading routes at once; a close call or no signal is never guessed — the six kinds are offered, the likeliest
  first, and no project is made until the kind is known.
- **Critique is a door.** Chosen, the composer becomes a place to drop or choose a design (HTML, PNG, JPG, SVG); the
  file is the whole request, so the critique opens at once, with whatever was typed kept as what to look at.
- **Pick up where you left off.** Up to four works, those still in conversation first, each with its miniature.
- **Everything you have made.** The collection, moved unchanged in what it does to `studio/Collection.tsx`: live
  miniatures in sealed frames, exhibits or index, search, kind (with *In conversation*), order, delete asked in
  place with *Keep it* focused, works from other devices.

### The conversation — one focused question at a time (`studio/Conversation.tsx`, `studio/ProjectConversation.tsx`)

Every work begins as a project in conversation (`DesignProject.studio`, status `discovering`), at its own address.
The questions are lib/ux-v0/studio/discovery.ts's: only those that matter for this work, the accessible ones first.

- **What the words already say is not asked.** It is said — "From your words: Poster · “Field Lines” · Bold,
  Playful" — and recorded as such, changeable like anything else.
- **Every control the brief asked for.** Visual cards drawn by the engines (style, composition, logo form, picture treatment, website
  look, format, purpose), multi-select chips with a limit (at the limit the earliest gives way), a ranking (up and
  down, in order), palettes as real swatches plus three colour pickers and colours taken from the person's own
  picture, type pairings set in their own faces, sliders (only those moved are said; "Leave it" hands one back),
  fields for the person's exact words, counts for a board's materials, and file drops.
- **Always the person's own way.** Every question with options has "Something else? Describe your own"; every
  optional one can be skipped or left to SocriaUX ("You decide"); "Surprise me" leaves every remaining choice to
  SocriaUX and begins — except the person's own words, which SocriaUX never invents.
- **Adaptive.** A typographic logo is asked about its lettering, a symbol what it should call to mind; a board with a
  website is asked what the website must do; a design system's files are asked for by the source chosen; colours
  and type are not asked inside a design system.
- **Progressive.** When the accessible questions are done SocriaUX says it has enough, and what starting will do;
  *Keep refining · N more* opens the deeper ones (colour, type, composition; then balance, what to avoid, pictures),
  never imposed. *Start with this* is on every question once the required ones are answered.
- **Back and change.** *Back* takes the last answer back and offers it again as the starting point; every answered
  topic on the path, every decision on the side and every answer in the transcript can be opened again. Words typed
  into the conversation answer the question being asked, run a command (start, back, skip, more, surprise me), change
  the kind of work ("actually, a website instead"), or change earlier decisions (`reviseFromWords`: a quoted headline,
  temperament words, a style named, three colours, something to avoid), which the conversation then says.
- **Design context.** The side keeps every decision with where it came from — *From your words*, *Yours*,
  *SocriaUX decides* — what was brought in, and the design system; on a phone it is a sheet.
- **Persistent.** The record is saved like the rest of the project (this browser first, then the account), so a reload
  or another device lands in the same conversation, everything said kept.

### Previews — inspiration drawn by the engines (`studio/previews.tsx`)

Not templates: each card is made from the person's own words by the engine that will make the work, and the choice
reaches that engine as a parameter. A style card is the headline composed in that style (`styledDirection` over the
words' own language, `composeGraphic`); a composition card is the person's design (in what they chose so far)
organised under one generative constraint (`org`); a logo card is a concept `explore` constructs for the name in that
form; a website card is a working page `startWebsite` makes from the conversation in that proposed system, shown in a
sealed frame with no scripts; a treatment card is the person's own picture under the graphics engine's own effect
stack (mono, duotone in their colours, halftone, risograph, posterize, grain), drawn by the same renderer. Each is
made only when its card nears the screen, one at a time in idle moments, and kept for the visit.

### Starting — the same project becomes the work (`studio/begin.ts`)

| Kind | What Start does | Where it continues |
| --- | --- | --- |
| Graphic | The brief from the conversation (`graphicBriefOf`), pictures as assets; the workspace proposes three directions at once, held to the palette, faces and composition chosen (`directionsWithPrefs`), with the Creative DNA, the avoid list and the person's words for the look given to the direction engine; the person's pictures are composed treated as they chose (`withTreatment`: the engine's effects on their own images only, changeable in the editor) | Graphics workspace |
| Logo | The logo brief (`logoBriefOf`); concepts constructed at once | Graphics workspace, logo concepts |
| Board | The board brief and materials (`boardBriefOf`), pictures as board assets, a website's identity if one was chosen; three systems proposed at once (`systemsWithPrefs`) | Board |
| Website | A whole, working page made from the answers in the direction chosen (`startWebsite` → `websiteConcept`), with its working parts (a booking that books, forms that send), same project id | Website workspace |
| Design system | The import, opened with the source, the files or address and the parts already chosen (it reads at once when the parts are known); the conversation, having handed over, is not kept as a project | Design System Manager |
| Critique | The design imported into the same project, the conversation kept on it | Critique workspace |

A design system chosen for the work is linked when it starts (`applySystem`). *Write the brief yourself* (graphic,
logo, board) and *Plan it in the workspace* (website: the model-led questions, references, brief and directions)
open each workspace's own way in, with the words — so every earlier flow stays reachable.

### The conversation in the workspace (`studio/StudioRail.tsx`)

A work begun in the studio keeps its conversation beside it, docked on wide screens (the workspace moves aside) and
a sheet on narrow ones; it can be put away and brought back (the choice is kept). What is said there goes to the
workspace's own way of taking words — a graphic's changes in words (`GraphicEditor` reads it as if typed in its bar,
previewed before it is applied), a board's, a page's refinement, a critique's question — and what the workspace
answers is kept in the same transcript. Before a direction is chosen it understands "the second one" and "more". It
starts put away where the person chose to work directly (the brief written by hand, or a critique, whose own cards
are its conversation).

### The design system, everywhere (`studio/SystemPicker.tsx`)

One picker on the home's composer, in the conversation's header (and its phone sheet) — none (SocriaUX proposes an
identity), or any published system kept here or with the account; the workspace's default is chosen to begin with.
Inside a system, its colours and type are not asked about, website looks are three expressions of it
(`brandBoardOptions`), and the work is linked to it when it starts.

### The look

The studio is in the selected Socria design system: Instrument Serif 400 for what is said (emphasis italic and moss),
Inter for what is operated, moss on paper, ink at its strengths, borders `#e7e2d3`/`#ded8c6`; every action a 999 px
pill; cards 18 px; the person's words in moss-50 bubbles, Socria's unboxed; hand-drawn 24-unit glyphs in
`currentColor` with round ends (`studio/glyphs.tsx`, no icon library, no emoji). Motion eases out
(`cubic-bezier(.16,1,.3,1)`), lifts by two pixels, fades up; nothing bounces or spins; all of it stops under
`prefers-reduced-motion`. The home's composer becomes the conversation's reply bar through a view transition. The
earlier brand layer was moved to the system at the token level (`components/brand/socria-brand.css`), so every
workspace speaks the same.

## Data

`DesignProject.studio` (`lib/ux-v0/studio/schema.ts`), optional and normalised on read like the rest of the project,
so no migration: the kind of work and whether it was chosen or recognised; the opening words exactly; every answer
with its values, the person's own text, numbers (sliders, counts) and fields, whether it was skipped or left to
SocriaUX, and where it came from (*words*, *person*, *socria*); the transcript (bounded at 200 messages); what was
brought in (pictures as references kept in this browser; other files held in memory only until the import or the
critique begins); the design system; the depth reached; *discovering* or *started*; and whether the work began from
the conversation or by hand. It is saved and synced with the project (this browser first, then the account), and
goes with it in the account's export and deletion. A conversation is listed with the rest of the work, as one.

## Verification

All without a model and without the network (every preview and every start is the engines' own code in the browser).

| Check | Result |
| --- | --- |
| `test/studio.test.mjs` (intent, facts, the record, every kind's questions, adaptivity, depth, skip, back, you decide, surprise me, reopen, free text, revising decisions in words, picture treatments, every engine reached) | 113 passed, 0 failed |
| `test/browser/ux-v0/studio-qa.mjs` against the production build (home, intent routing and the question instead of a guess, examples, the design system selector, the six conversations end to end with every control, previews drawn by the engines, back, skip, reopen from the side, a change in words, a reload, start into each workspace, the rail and words sent from it, recents and history with delete, a docked rail on a wide screen, a phone) | 105 passed, 0 failed; 0 model routes called; 0 page errors |
| Earlier browser checks, their home steps moved to the studio (the kind chosen, then *Write the brief yourself* / *Plan it in the workspace*, or the Critique door) | checklist 52/52 · acceptance 33/33 · ui-qa 85/85 · boards-qa 62/62 · dsi-qa 46/46 · logo-qa 23/23 · style-qa 35/35 · workflow A and B run clean (no failed check; workflow B's console lines are the critique sandbox refusing the fixture page's own stylesheet and request, as it should) |
| graphics-qa | 57/58 and 56/58 on two runs: check 22 (and once check 6), the two recorded in the previous phase as failing on the earlier build too (they depend on the composition drawn for a random project) |
| ceiling-qa | 47/47 on one run; 46/47 and 45/47 on others — the "mixed styles" and "dense pattern" checks depend on the composition drawn for a random project id and pass or fail with it, on the same build |
| `npx tsc --noEmit` | clean |
| `npx next build` | passes |
| `node test/run.mjs` (the whole repository) | all 392 suites passed |

`moodboard-live.mjs` (real Openverse searches) was not run: it needs the live network. Its home step was moved like
the others.

How the browser runs were made: `next start -p 3100` on the production build, with placeholder sign-in keys present
at runtime (a production-style key, so no development handshake redirect) and `VERCEL_ENV=preview` so the page is
open; `UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/<check>.mjs`.

## Limits — said plainly

- **No model in the studio.** Intent recognition, the questions, the previews and every start are deterministic code.
  Words that fit none of the readers are kept with the brief rather than understood; the person is told so.
- **Files other than pictures are held in memory** until the import or critique begins; after a reload the
  conversation asks for them again (it says why). Pictures are kept like any reference.
- **Revising after the work has begun** is done in the workspace (by hand, or in words through the rail, which the
  workspace's own engines read); the decisions recorded in the conversation are not re-run into an existing work.
- **The rail docks** (the workspace moves aside) only from 1600 px wide; below, it opens over the right side when
  asked, so the workspaces keep their full layout.
- **The website path from the studio** is the deterministic website engine (`websiteConcept`): a designed, working
  first page with its functional parts, sample times and labels marked as the person's to change. The model-led
  website process (questions, licensed references, a brief, directions, generation) is still one step away and still
  needs sign-in.
- **Design systems** must be published to be chosen; a system whose identity cannot load leaves its work waiting at
  the workspace rather than proposing without it.
