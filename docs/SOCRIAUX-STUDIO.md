# SocriaUX — one conversation: describe, explore, make, refine

> What do you want to make? — SocriaUX understands what you want, explores it with you through real inspiration,
> and makes the work itself, original and editable, without ever leaving the conversation.

This document records how the experience is built: the audit behind the redesign, what was stripped away, what
replaced it, the data it keeps, how it is verified, and what it does not do. The first studio (one conversation in
front of six capabilities) is kept at the end as its own audit.

## The redesign — audit and decisions

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

## What was built

### The home — one composer (`components/ux-v0/studio/StudioHome.tsx`)

- "What do you want to *make*?", one line saying how it goes, and one white composer (16 px corners, one at 6 px):
  describe it, paste a brief (it grows to fit), paste a screenshot (brought in as a picture, the words left as words),
  attach files or pictures, drop them, add a link. The design system it is made in appears only when one is kept
  here. Nothing else: no kinds of work, no palettes, styles, templates or examples, no feature cards.
- The words are read live ("Reads as poster"); a close call or no signal is asked about — the six kinds offered, the
  likeliest first — and no project is made before it is known.
- A quiet line under the composer leads back to up to three works, those still in conversation first; everything
  made lives in **Your work** (`studio/YourWork.tsx`, `?work=1`): the collection, searchable, delete asked in place.

### Research — real references from the internet (`lib/ux-v0/studio/research.ts`)

- **When.** As soon as a conversation about a graphic, logo, website or board opens, SocriaUX searches; again when the
  kind of work changes (what was liked stays liked; what was only found for the other kind goes); again whenever the
  person searches for other words, or asks for "more like this" on a reference they like.
- **Where.** Openverse (openly licensed works gathered from Flickr, Wikimedia Commons, museums and more), asked from
  the person's browser as openverse.org itself does: no key, the person's own allowance, nothing through SocriaUX's
  servers, nothing paid.
- **What.** Two to four short searches per brief (`researchPlan`): its subject and kind ("coffee roastery logo"), its
  temperament ("bold poster"), a style it names, and the craft ("typography poster", "web design"). Each is asked as
  written and then in shorter forms while it finds nothing, one after another; results are ranked for a designer
  (posters, type, print, layout before snapshots), repeats removed.
- **Honest.** The conversation says exactly what happened — where it looked, for what, how many it found — or that
  the library was busy or unreachable, or found nothing. Nothing is ever put in place of a result, and a search that
  did not happen is never claimed (`researchSaid`, `researchStatus`; checked against the record in the tests).
- **Cited.** Every reference shows its title, creator, licence and where it was found, with a link to the page it
  came from; the decisions drawer and the conversation beside the work credit the references that guide it.
- **Inspiration, not assets.** A reference is never placed in a work. What reaches the engines is what the person
  liked about it: the colours read from its picture (`sampleSwatches`, only for references liked for their colour or
  as a whole), the influences its own words name (`interpretStyle`), its temperament (`readFacts`).

### Questioning — a creative director, not a survey (`lib/ux-v0/studio/discovery.ts`, `options.ts`, `controls.tsx`)

- **What the words say is not asked.** It is said back, recorded as "from your words", and changeable.
- **References as a question.** "Which of these feel right?": a wall of real work, each with **Like**, **Not this**,
  and — once liked — what it is liked *for* (colour, type, composition, mood, imagery). Several can be liked, and
  their influences combine; those turned down can be seen and brought back; other words can be searched for; the
  person can describe what they are after instead, skip, or leave it to SocriaUX. It comes after the questions that
  give the search its meaning (a graphic's feel, a logo's form, what a site must do), so the search has usually
  returned by the time it is asked; while it has not, the wall says it is searching.
- **Nothing preset.** Colour is proposed from the references liked (together, then each by name) and from the
  person's words; type from the faces the references' influences carry and voices found for the words; a website's
  three looks are proposed by the board engine for the words and held to those colours. The person can always pick
  their own colours, take them from their own picture, or name a typeface.
- **Adaptive, never overwhelming.** The accessible questions first, then "I have enough to begin" with what starting
  will do; *Keep refining* opens the finer ones. A typographic logo is asked about its lettering, a symbol what it
  should call to mind; a board with a website what the site must do; inside a design system, colour and type are not
  asked at all.
- **Skip, back, revise, surprise.** Every optional question can be skipped or left to SocriaUX; *Surprise me* leaves
  every remaining choice to SocriaUX and begins (only the person's own words are never invented); *Back* offers the
  last answer again; any decision can be opened again from the path, the transcript or the decisions; words typed
  answer the question, run a command, change the kind of work, or change earlier decisions.
- **What is taking shape.** Under the question: the references liked, the colour they (or the person) give, the type,
  the feel and the influences — read from the very preferences the engines will be given (`studio/Vision.tsx`).

### One surface (`studio/Conversation.tsx`, `studio/StudioRail.tsx`, the workspaces)

- **While exploring:** the conversation on the left, with its own reply composer; the question large on the right,
  what is taking shape under it; the decisions in a drawer. On a phone it is one column, the question brought into
  view, the reply kept at hand.
- **Once making:** the same project becomes the work in its engine's workspace, and the conversation moves to a rail
  on the left — docked from 1280 px (the work moves aside), over the left side below that; open by default for work
  begun in conversation (a critique keeps its own cards as its conversation). While it is open it is the one place to
  type: words go to the workspace's own way of taking them (a graphic's change in words, previewed on the work; a
  board's; a page's refinement; a critique's question), and "apply" or "discard" settles a preview. The answers are
  kept in the same transcript, from the first sentence to the latest change.
- **The work first:** a graphic opens on the work alone (no layers, no inspector until something is selected); "Edit by
  hand" brings every panel out, "Focus on the work" puts them away.
- **Generation stays the engines':** a graphic's three directions are composed from scratch by the generative engine
  (`composeGraphic`, `proposeDirections`) in the colours and faces arrived at; a logo's concepts are constructed
  (`explore`); a board's systems proposed (`proposeSystems`); a website made whole and working (`startWebsite`). No
  template is selected anywhere; everything stays editable by hand and in words.

### Critique and design systems

- A design attached with words that say so ("critique this") is the whole request: the critique opens at once, the
  words kept with it; a file that cannot be critiqued is refused on the home, said why, and let go. Said in words
  alone, the conversation asks for the design first.
- Files that read as a design system (tokens, guidelines, a Figma link) open the import with the source and files
  already given; the conversation, having handed over, is not kept as a project.

## Data

`DesignProject.studio` (`lib/ux-v0/studio/schema.ts`), optional and normalised on read, so no migration. Besides the
kind of work, the opening words, every answer (values, the person's own text, numbers, fields, skipped or left to
SocriaUX, and where it came from), the transcript, what was brought in, the design system, the depth and the status:

- `references` (at most 60): each with its provider, id, title, creator, the page it came from, where Openverse found
  it, the picture's address (https only, no credentials), size, licence and its address, tags, the search that found
  it, the person's verdict (*proposed*, *liked*, *rejected*), what it is liked for, and the colours read from it.
  Liked and turned-down references are always kept when more are found (`mergeReferences`).
- `research`: the log of every search (at most 20 kept): the words, the library, how many were found, the error when
  there was one, and when.

## Verification

Nothing in the conversation calls a model. The research is the only thing that leaves the browser, and only to
Openverse.

| Check | Result |
| --- | --- |
| `test/studio.test.mjs` — intent, facts, the record; research planning (subjects, kinds, temperament, short searches), ranking and repeats, the honest log on success, on nothing found, on a busy library (429), on an unreachable one, and in shorter forms after a failure (recorded Openverse response shapes, no network), the status line, merging and capping, credits, references held to their shape (https only, no credentials, bounded); every kind's questions with references in place of presets; colour and type proposed from the references liked (and only for what they were liked for) and from the words; the person's own palette outranking them; website looks in the references' colours; adaptivity, depth, skip, back, you decide, surprise me, reopen, free text, revising in words, picture treatments, every engine reached | 148 passed, 0 failed |
| `test/browser/ux-v0/studio-qa.mjs` against the production build — the home as one composer (and nothing else on it), a pasted screenshot, a question instead of a guess, the design system offered only when there is one; **live research on Openverse** (24 references found on the final run, and the conversation's line said 24, matching what was kept; each the library's own picture, credited, its source opening apart); then a recorded library for the references question (like, not this, brought back, what each is liked for, colours read from the pictures, search again, more like this), colour and type proposed from the references, the two panes and what is taking shape, reopening from the decisions, a change in words, a reload with nothing searched twice; the start into graphic, logo, website and board with the conversation docked on the left as the one place to type, the work alone in front, a change previewed and applied in words, *Edit by hand*, credits beside the work; critique (an attached design opening at once, a file refused and let go, a critique asked in words); a design system; a work in a design system; a change of kind midway (searched afresh, what was liked kept); your work in its own view; a narrower screen; a phone | 126 passed, 0 failed; 0 model routes called; 0 page errors; no host reached but Openverse |
| Earlier browser checks, their entry steps moved to the workspaces' own ways in (`env.mjs`: `websiteWorkspace`, `handBrief`, `beginWith`) | checklist 52/52 · acceptance 33/33 · ui-qa 85/85 · boards-qa 62/62 · dsi-qa 46/46 · logo-qa 23/23 · style-qa 35/35 · ceiling-qa 47/47 · workflow A and B run clean (workflow B's console lines are the critique sandbox refusing the fixture page's own stylesheet and request, as it should) |
| graphics-qa | 58/58 on one run, 57/58 on the final one: check 6 (a carousel's slide count), one of the two checks recorded before this work as depending on the composition drawn for a random project |
| `npx tsc --noEmit` | clean |
| `npx next build` | passes |
| `node test/run.mjs` (the whole repository) | all 392 suites passed |

How the browser runs were made: `next start -p 3100` on the production build, with placeholder sign-in keys (a
production-style key, so no development handshake redirect) and `VERCEL_ENV=preview` so the page is open;
`UXV0_FORWARD=1 UXV0_BASE=http://127.0.0.1:3100 node test/browser/ux-v0/<check>.mjs`, with `NODE_USE_ENV_PROXY=1` and
the machine's `HTTPS_PROXY` for the studio check's live Openverse run. `moodboard-live.mjs` (the website workspace's
own model-led moodboard) was not run; its entry step was moved like the others.

## Limits — said plainly

- **No model in the conversation.** Intent, questions, research planning and ranking, previews and every start are
  deterministic code; words that fit none of the readers are kept with the brief, and the person is told so.
- **One library.** References come from Openverse only: openly licensed photographs, prints, posters and museum
  pieces. It holds few live websites or brand identities, so a website's or a logo's references are often adjacent
  work (signage, print, interiors) rather than screenshots of sites or marks. SocriaUX says what it found and never
  pads the wall.
- **Colours need the picture.** A reference's colours are read from its thumbnail in the browser; a picture the
  library cannot serve gives none, and is left out rather than guessed.
- **Influences are read from words.** A liked reference's influences come from its own title and tags; a reference
  with no telling words still gives its colours and its temperament, not a named style.
- **Revising after the work has begun** is done in the workspace (by hand, or in words through the rail); decisions
  recorded in the conversation are not re-run into a work that exists.
- **Files other than pictures are held in memory** until the import or critique begins; after a reload the
  conversation asks for them again (it says why).
- **The model-led website process** (its own questions, licensed references, a brief, directions, generation) is still
  in the website workspace for a site begun there by hand, and still needs sign-in; the conversation's website path
  is the deterministic website engine.

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
