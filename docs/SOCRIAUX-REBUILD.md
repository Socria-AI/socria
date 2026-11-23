# SocriaUX rebuild: the design is the code

SocriaUX's graphics, logos and boards used to be made by template and generation engines that assembled typed node
trees, with a model choosing among their options (and later writing a "design sheet" the engines carried out). The
result was capped by what the engines could express. The rebuild replaces that with the approach a person would take in
a modern design tool driven by a model: **the model writes the design itself, as HTML and CSS, one fixed-size artboard
at a time; the browser draws it exactly, the person sees it stream in, the model looks at the render once, and every
element can then be changed by hand or in words.**

Everything below is in `lib/ux-v0/design` (pure, tested in Node), `components/ux-v0/design` (the workspace) and
`app/api/ux-v0/design` (one streaming route).

## What a design is

| Piece | Where | What it holds |
|---|---|---|
| Artboard | `design/doc.ts` | id, name, format, exact CSS-pixel size, medium (screen, print, web), position on the canvas, and its **HTML fragment**: one `<style>` block and the markup |
| Shared styles | `doc.tokens` | CSS every artboard links (custom properties, shared classes): a design system's tokens, or the designer's own |
| Versions | `doc.ts` `commit/amend/moveTo` | every request and every run of hand edits is a version; undo, redo and history move between them |
| Conversation and memory | `turns`, `memory` | what was asked and said, the brief, lasting decisions ("never use gradients"), things turned down |
| Notes and pictures | `comments`, `assets` | notes pinned to an artboard or element; the person's own pictures (uploads, referenced as `asset:<id>`) |

Formats (`design/formats.ts`) cover screen (social, story, banner, slides, mobile), print (A-series, letter, tabloid,
business card, at 96 px to the inch, with bleed and safe margins) and web (a full page whose height may grow), plus a
logo sheet. Print exports at its DPI; PDF pages are sized in points.

## How a request runs

```
words (+ selection, + a picture of the selected artboard for a change of look)
  └─► /api/ux-v0/design (write) ── the answer streams back as it is written ──► the open artboard is drawn live
        └─► the whole answer carried out: new artboards, rewrites, exact find/replace edits, shared styles, removals
              └─► one look: pictures of what was made or rewritten (or edited, for a change of feel) ──► precise
                  edits to those artboards only, or "ok"
                    └─► one version committed; the turn says what changed and, truthfully, what did not
```

- **The answer** (`design/protocol.ts`) is plain tags, not JSON: `<say>`, `<artboard>`, `<edit><find><replace>`,
  `<tokens>`, `<remove>`, `<remember>`, `<question>` with `<option>`s, `<ok/>`. It parses while half-written, so the
  artboard being written is drawn as it streams.
- **Carrying it out** (`design/apply.ts`): every artboard is cleaned (no scripts, handlers, `javascript:`, frames,
  external URLs, `@import`) and every element gets a stable id (`data-sx`). An edit whose `find` does not match is
  never guessed at; it is listed and said. An answer that changed nothing says so and makes no version.
- **Understanding what is asked** (`design/prompts.ts`): the designer is told to decide whether a request is about one
  element, a group, the composition, the feel, or the whole, and to change exactly that. A change of feel must be
  visible at a glance beside the version before (added after the benchmark found a too-timid answer, see below).
- **Tiers** (`design/request.ts`): an exact change to something named ("make the headline slightly smaller") goes to
  the economy tier; a new design, a change of feel, composition or the whole goes to the premium tier; a look is its
  own small stage. The same reader serves the route and the benchmark, so the benchmark asks exactly what the product
  asks.
- **The look** runs once per request, never in a loop, at most three artboards, and may only correct what that request
  did. Edits it makes to artboards it was not shown are held back and counted.
- **Context**: everything the designer is sent is held to a budget (`focusFor`): the artboards in question in full,
  the others by their words only.

## The workspace

- **Canvas** (`Canvas.tsx`): every artboard in a sandboxed frame (`sandbox="allow-scripts"` without same-origin, a
  content-security policy with no network beyond fonts, a nonce for the one script that reports selection). Pan,
  zoom, fit; labels with Variations, Duplicate, Export and Delete; rename in place.
- **By hand** (`Inspector.tsx`, `elements.ts`): click any element to select it; change its words on the canvas or in
  the inspector, its face, size, weight, leading, tracking, alignment, case, colours, opacity, size, radius, rotation,
  layer order; drag to move; duplicate, delete. Runs of hand edits coalesce into one version.
- **In words** (`Chat.tsx`): with an element selected, "this" means it. Quick actions: three directions, other
  formats, push it further. Questions come back with their options as buttons.
- **Pictures**: add your own; the designer places them by `asset:<id>`; they are drawn from this browser's store.
- **Design systems**: a project built in a registry system takes the system's tokens as its shared styles and its
  rules (identity, hard and soft guidance, locked tokens, logo use) in what the designer is told. The system badge in
  the header shows it and links, updates or unlinks one. A new published version reaches the design's shared styles
  when they are still the system's (kept and said when the person changed them), and can be put back. The first
  request waits for the system to load, so the first design is made in it.
- **Exports** (`export.ts`): PNG and JPEG (print at its DPI), PDF (one page per artboard, JPEG pages sized in
  points), SVG and standalone HTML, with fonts embedded. Present mode shows artboards full screen.
- **History, notes**: versions listed and restorable; notes pinned to artboards and elements.

## Old projects

Graphics and boards made with the earlier editor open in the design workspace (`design/legacy.ts`,
`components/ux-v0/design/legacy-open.ts`). Each old artboard is drawn once by the renderer it was made with, after its
faces load, as the SVG that editor always exported; that SVG becomes the artboard's markup. It looks exactly as it did
and is edited like any other artboard from then on (its words are selectable elements). A board brings its graphic
materials, one group per material; mockups and website schematics are named in the first turn, not redrawn. A picture
that was linked from the web is named too (the sandboxed canvas has no network). The old record is kept, untouched, on
the project (`DesignProject.legacy`).

## What was removed, and what is left of the old engines

Removed (a commit of its own, so it can be reverted alone): the Graphics and Boards workspaces and editor
(`components/ux-v0/graphics`, `components/ux-v0/boards`), the creative director and its routes
(`/api/ux-v0/graphic-design`, `/api/ux-v0/graphic-edit`), and every generation module nothing reaches any more: creative
edits and concepts, synthesis, alternatives, identities, improvement, scoped edits, AI controls, visual review, edits in
words, vocabulary edits, style editing, references and custom styles, generative validation, edits and memory, logo
sessions, identities and contexts, board edits, evaluation and style. 96 files, about 28,300 lines, with the tests and
browser checks that exercised them.

Left, because live features still call it: the old document format and its renderer (used to carry old projects over
and to draw the studio's mood cards), and the composition core that the **website flow's design-system proposals**
(`boards/pipeline`, `boards/plan`, `graphics/compose`, styles) and the **design-system import's adapters and fidelity
checks** (`dsi/adapters`, `dsi/fidelity`, `dsi/generate`) depend on. About 40,000 lines. Removing it means rebuilding
those two features on the new core: proposals as a few HTML artboards written by the designer, fidelity measured on
rendered artboards. That is the next step, not done here.

## The benchmark

`test/browser/ux-v0/design-bench.mjs` runs the real workspace in Chromium (deterministic: a seeded random, a clock
that only moves on), sends every request through the product's own flow, and writes each request the designer would
receive, exactly as the route would build it (instructions, message, pictures), to an exchange folder. Each was
answered by a Claude agent standing in for the route's model, reading only those files, so the answers are what a
model makes of the product's real prompts. **Latency and cost of the real API path were not measured** (no API key in
this environment); the route itself is covered by tests with fakes.

37 model calls across 18 scenarios (21 designs or changes, 16 looks at the render: 8 said it was right, 8 corrected something), all carried out by the product code; renders in `docs/rebuild/`:

- **New designs from one brief each** (`new-designs.jpg`): a lecture poster (a floor plan with one lit room), a
  magazine cover, and five subjects — fashion, tech, architecture, music, art — each with its own structure, faces and
  palette; a logo sheet with its variants. `web-page.jpg`: a full landing page.
- **Edits on one design** (`edits.jpg`): cloud themed, sophisticated and atmospheric, premium architecture studio, keep
  the logo and type and redo the rest, headline slightly smaller (economy tier, one property), cinematic, make it
  better. Element ids were kept through every change (55 of 55 elements kept for every edit except the requested
  redesign, which kept 12 and rebuilt the rest).
- **A four-turn session and adaptations** (`session-and-formats.jpg`): warm and earthy, a type change, the light moved
  to another room, then "go back to the original colours" — which restored the palette and kept the other two
  decisions. The A3 adapted to story, LinkedIn and landscape, each recomposed, not scaled.

What it found, and what changed because of it:

1. "Make this look like a premium architecture studio" first came back almost unchanged (one rule added). The designer
   is now told that a change of feel must be visible at a glance, and a change of feel carried out as edits is now
   looked at once. Re-asked, it came back as an architect's drawing sheet (dimension chain, scale note, ruled title
   block), and the look then caught the light wedge running into a room label and fixed it.
2. "Make it better" was looked at under the new rule; the look moved a door swing that sat off its wall opening.
3. Looks on new designs fixed real faults: door swings over room labels on the floor plan, a rule running through "& Co." in the logo lockup, form placeholders fading into the ground on the web page.

Compared with the earlier director engine's renders for the same briefs (`docs/creative-engine/`), the designs are of
similar ambition — that engine already used a model to direct — but the new one has none of its ceilings: anything CSS
and SVG can draw, any number of artboards and formats, live streaming, exact hand edits, real exports.

## Verification

- `npm test`: every suite passes, including `design.test.mjs` (the protocol, carrying out, cleaning, ids, hand
  edits, versions, prompts, the flow start to finish with fakes, the legacy converter, the look rule), the route
  tests (tiers, streaming, refusals), and the design-system suite (a design following a system's versions, put back,
  styles changed in the design kept).
- `test/browser/ux-v0/design-qa.mjs`: the workspace in Chromium with a scripted designer — streaming, select, inspect,
  retype, drag, undo and redo, words with a selection, a failed edit said, questions, variations, a picture uploaded,
  notes, other formats, PNG at 300 dpi, PDF in points, HTML, present.
- `test/browser/ux-v0/legacy-qa.mjs`: an old graphic and board opened in the real app, compared with the old renderer.
- `test/browser/ux-v0/studio-qa.mjs` and `dsi-qa.mjs`: updated to the design workspace.
- `tsc`, `next build`.

## To run it live

`ANTHROPIC_API_KEY` must be set for the deployment (Preview first). The design route uses the premium tier for
designs and changes of feel (`SOCRIAUX_DESIGN_BUDGET_MS`, default 280 s, within a 300 s function limit) and the
economy tier for exact edits and looks.

## Limits

- Scripts never run in a design: no interactive prototypes yet.
- Pictures are the person's own; nothing generates or fetches images.
- One look per request, by design; a deeper critique is a request in words.
- Real-API latency and cost are unmeasured.
