# SocriaUX — the Advanced Creative Production Engine

SocriaUX still makes a simple site the way it did. This work adds what a professional page needs beyond that:
- motion that tells a story;
- pictures made for the design;
- interactive parts that work;
- a 3D object and the configurator that recolours it;
- precise control of the canvas at each width;
- routing that explains which model made a page and what it cost;
- a quality check at three widths that tries what it checks.

Everything is SocriaUX's own code, drawn by its renderer in the sandboxed frame, and checked. A model is never
asked to write HTML, CSS or JavaScript. The spec says what the page is; the renderer and SocriaUX's own runtimes
make it work.

```
Brief → Creative DNA → Directions (compare · combine · approve) → Generation (complexity read in code) → Canvas
(made pictures · interactive parts · 3D · motion · type · width rules) → QA at 1440 / 834 / 390 (bounded repair) → Preview / export
```

| Module | What it holds |
| --- | --- |
| `lib/ux-v0/motion-runtime.ts` | The scripted layer of motion: the scrubbed opening, the pinned story, pictures arriving, magnetic buttons, tilt, line drawing; inert under reduced motion; `selfTest()` |
| `lib/ux-v0/motion.ts` | The presets (each feel's scripted fields), the CSS of the scripted layer gated by `body.mo-ready`, `scriptedMarks` |
| `lib/ux-v0/assets.ts` | Pictures made in code: six kinds of procedural drawing, deterministic, in the design's colours, stored as a recipe with provenance and a reason |
| `lib/ux-v0/image-gen-server.ts`, `app/api/ux-v0/assets/route.ts` | The separate image-model pathway: off by default, priced first, capped per day, recorded apart, checked to be a real picture |
| `lib/ux-v0/behaviors.ts` | Galleries that open large, filters, chart keys, table filters (and the existing sorting), the configurator; `selfTestInteractive()` |
| `lib/ux-v0/scene-runtime.ts` | The 3D object: WebGL1, procedural geometry, four materials, hand, keys and scroll; recoloured by a configurator; a drawn silhouette without WebGL; `selfTest()` reads pixels back |
| `lib/ux-v0/spec.ts` | The `scene` and `configurator` kinds, gallery `tags`, the `responsive` field and patch op, `stacksPicture` |
| `lib/ux-v0/render.ts` | The new parts drawn; width rules as classes and media queries; made pictures drawn from their recipes |
| `lib/ux-v0/direction.ts` | `combineDirections`: one direction kept, whole groups taken from another |
| `lib/ux-v0/model.ts` | `generationComplexity`: low, medium or high, read in code, choosing the tier |
| `lib/ux-v0/types.ts` | Time per call and per stage; `acceptedEconomics` (text and pictures apart, attempts, time) |
| `lib/ux-v0/audit-source.ts`, `lib/ux-v0/evaluate.ts` | The audit at three widths: the interactive and 3D self-tests, script errors, page weight; the tablet's own findings |
| `lib/ux-v0/intent.ts` | Research interfaces read as data; a product's "reserve one" no longer read as a booking |
| `lib/ux-v0/quick-edit.ts` | "Hide this on phones", "centre it on mobile"… done in code, no model |
| `components/ux-v0/MotionPanel.tsx`, `TypePanel.tsx` | The motion and the type, edited on the canvas |
| `components/ux-v0/SectionEditor.tsx` | Made pictures for a part, a photograph (when offered), the part's rules at other widths |
| `components/ux-v0/DirectionBoard.tsx` | *Combine two* |
| `test/browser/ux-v0/production-bench.mjs` | The six-project benchmark |

## 1 · Motion

Motion is in two layers.

**The CSS layer** (`motion.ts`) has always been there:
- arrivals tied to the scroll (`animation-timeline: view()`);
- kinetic headlines;
- parallax;
- hovers.

**The scripted layer** (`motion-runtime.ts`) is SocriaUX's own script. It is the same for every design, added to
the frame by nonce and inlined in an exported page. The page's content never carries a script. It does what CSS
cannot do alone:

| Effect | What it does |
| --- | --- |
| scrub | The opening's words lift away and its picture settles in scale as the page leaves it (`--hp`, 0 → 1). |
| story | One sequence of points is pinned: the section holds the screen, each point takes the stage in turn (`.is-on`), and a rule shows progress (`--sp`). The story is the first `features` section of 3–6 points after the opening. |
| media | Pictures arrive through a mask, or settle from a larger scale, as they come into view. |
| magnetic, tilt | Buttons drift toward a fine pointer, and pictures tilt toward it. Neither happens under a coarse pointer. |
| draw | A chart's lines draw themselves as they arrive. |

**Performance rules:**
- Every effect moves only `transform`, `opacity`, `clip-path` or a stroke offset; nothing reflows.
- Scroll work runs once a frame, and listeners are passive.
- Each effect's CSS applies only once the script has run (`body.mo-ready`), so a page without the script is an ordinary, complete page.
- Under `prefers-reduced-motion` the script does nothing at all.

**Presets:**
- *kinetic*: scrub, story, pictures scaling in, tilt, magnetic buttons, line drawing.
- *lively*: a gentle scrub, masks, magnetic buttons, line drawing.
- *measured*: masks and line drawing.

The designer can set each one in the **Motion** panel. The panel is a real `look` patch, checked against locks
and the DNA.

`__uxMotion.selfTest()` plays the story through its steps and reports what moved. The benchmark uses it to check
that the motion works, not just that it was written.

## 2 · Pictures made for the design

**What a made picture is.** A part that needs a picture, and has none from the designer, can have one made in code:

| Kind | What it draws |
| --- | --- |
| field | Planes and arcs on a grid |
| contour | Topographic line work |
| lattice | Marks on a grid |
| orbit | A diagram of orbits |
| grain | Grain and a pool of light |
| render | An object shaded like a product shot |

Each is drawn in the design's own colours and is deterministic: the same recipe draws the same picture.

**How it is stored.**
- A project stores only the recipe: kind, seed, ratio and palette.
- The recipe is a moodboard reference of provider `socriaux`, kept and usable as content.
- Its licence is fixed: "Made by SocriaUX for this project (no third-party rights)". A stored reference cannot claim another licence or maker.
- Each one carries the reason it was made.
- It needs no credit line on the page.
- It is drawn at the ratio its layout shows (`ratioFor`).
- It is sent as a compact data URI, escaped only where a URI must be. That is about a quarter lighter than full percent-encoding.

**When SocriaUX makes one.** A picture is made only where a part asks for one. Where an opening is composed in type
and has no picture slot, none is made to fill the space; the benchmark says so for two projects.

**Photographs from an image model** are a separate, server-side pathway (`image-gen-server.ts`, `POST /api/ux-v0/assets`, OpenAI Images, `gpt-image-1`):
- It is **off** unless the server sets `SOCRIAUX_IMAGE_GEN=on` and has a key.
- The price is said before anything is made (list prices, overridable).
- It has its own daily cap (`SOCRIAUX_IMAGE_DAILY_USD`, default US$1), under the person's and the organisation's budgets and the trial gate, like every model route.
- The prompt is written from the brief and the direction, never from free text alone, and always asks for no text, logos or watermarks.
- The answer is checked to be a real PNG, JPEG or WebP within 8 MB.
- It is recorded as the `image` stage, apart from text.
- It is kept with its prompt and model as provenance.

The editor offers the photograph button only when the server says the pathway is on.

## 3 · Interactive parts

| Part | What it does |
| --- | --- |
| Gallery | Each picture opens large in a dialog. It has previous and next, Escape closes it, focus returns, and arrow keys work. Tags give filter chips. |
| Lists | Grouped lists filter the same way. |
| Charts | Every reading carries its value (`<title>`). With two or more series, the key shows or hides each one; the last one shown cannot be hidden. |
| Tables | Six rows or more get a filter field. Sorting by column was already there. |
| Configurator | A real form: one radio group per choice, the total from the base and the prices, and the choice said. Its action confirms that nothing was ordered. A swatch tells a 3D object on the page its colour (`ux-config`). |

State changes go through the View Transitions API where there is one and motion is allowed.

`__uxBehaviors.selfTestInteractive()` tries each part in place and puts it back as it was. The audit runs it.

Nothing here pretends to have a backend: a booking, a form and a configurator each say plainly that they are a prototype.

## 4 · 3D

A `scene` section names an object, a material and a colour:

| Field | Choices |
| --- | --- |
| object | vessel, bottle, sphere, torus, ring, knot, monolith |
| material | matte, satin, gloss, metal |

**How it is drawn.** `scene-runtime.ts` draws it with WebGL1:
- lathe geometry with Catmull-Rom smoothing;
- Blinn-Phong shading with a key, a fill and a rim;
- a pixel ratio capped at 2;
- paused while out of view.

The hand, the arrow keys and the scroll turn it. Under reduced motion it never turns on its own.

**Why not Three.js or React Three Fiber.** They are in `package.json` but were evaluated and not used in the frame:
- The frame is static HTML, so React cannot run there.
- Three's module build would have to be inlined into every canvas render, for the few designs that have a scene.

**Without WebGL**, or without scripts (as in the direction studies), the section's drawn silhouette stays. The page
is complete either way.

`__uxScene.selfTest()` draws each scene and reads its centre pixel back. The audit and the benchmark use that pixel
to say whether something was really drawn.

## 5 · The canvas

- **At other widths** (section editor). Tablets are 760–1099 px and phones up to 759 px. For each part the designer can set:
  - shown or hidden;
  - words left or centred;
  - spacing;
  - headings smaller or larger;
  - where its picture sits once its parts stack.

  Each setting is a `responsive` patch (one version, Undo takes it back). The renderer writes one class per rule
  and only the CSS the page uses. A locked part is asked about first. "Hide this on phones", "centre it on mobile",
  "picture first on phones" and "smaller headings on tablets" are read in code, with no model, for the selected
  part. The editor opens on the width the canvas shows.
- **Type** (toolbar). Every control is a `tokens` or `look` patch, asked about first when it touches a locked group, the Creative DNA or the design system. It sets:
  - the headline face and the text face, from SocriaUX's list (a face's weight is kept as near as it has);
  - the headline weight;
  - case;
  - tracking;
  - the scale;
  - emphasis;
  - labels.

  The check is shared with the everyday edits read in code (`applyChecked`).
- **Motion** (toolbar): see §1.
- **Combine two** (direction board). Keep one direction and take whole groups from another: colours, type, layout, surfaces, imagery, motifs, motion or voice.
  - Taking the layout takes the structure it gives the design (plan, composition, order, lead, shapes), not only its grid.
  - What was taken is locked as the designer's decision; the base keeps its own locks.
  - The DNA is read again; the stale plan is dropped.
  - The combination sits beside the others, to compare and approve. One combination at a time keeps the board at four.

**Unchanged:** precise edits of one field, a part's settings and variant, its ground and spacing, its place, locks
and the critique.

## 6 · Routing and cost

**How demanding a generation is** (`generationComplexity`) is read in code before the model is asked:

| Level | What makes it |
| --- | --- |
| low | A form, or a single-page notice or sign-up, with quiet motion |
| medium | A page of several parts, references to interpret, a design system, lively motion, or a richer kind of work (editorial, portfolio, dashboard, checkout, booking, flow) |
| high | A 3D object, a configurator, kinetic motion, a data or interactive experience, a Creative DNA set far toward the expressive, or words asking for an immersive, scroll-driven or experimental page |

- High and medium **always** go to the premium tier (GPT-6.1 Sol by default).
- Low goes to the economy tier only where the deployment opts in (`SOCRIAUX_SIMPLE_ECONOMY=on`). An operator's own `SOCRIAUX_TIER_GENERATE` still holds.
- The reading and its reasons come back with the design and are said to the designer, so the cost is explained.
- The provider abstraction is unchanged. Routing is per stage, configurable by tier or by model, and Sol is the premium default, not hard-wired.

**Cost per accepted design** (`acceptedEconomics`):
- the money, with text and pictures apart;
- generations and model-worked changes per accepted design;
- the server time the calls took (each call's usage now carries `ms`, and each stage sums it).

The cost panel lists pictures as their own stage. The text routing table no longer lists `image` as if it ran on a text model.

## 7 · Quality checks

**Before a design is shown**, the canvas draws it offscreen at **1280, 834 and 390 px**. It was two widths before.

**What the in-page audit now also returns:**
- every gallery, filter, chart key, table filter and configurator, tried in place;
- every 3D scene: drawn, or standing in;
- scripts that failed;
- what the page weighs: its markup, and pictures more than three times larger than shown (vector drawings excluded).

**What the evaluation turns that into:**
- An interactive part that does not work, a scene that ran WebGL but drew nothing, or a failed script is a must-fix.
- Heavy markup, or oversized pictures, is a performance note.
- Missing WebGL is not a fault.

**The tablet's role.** The tablet reports only what is new at its width; what the desktop or the phone already found
is not counted twice. A tablet is touched, so its targets are checked.

**Repair.** It is bounded, as before: at most two rounds, only fixes that need no words, and nothing locked.

The benchmark found that the new filter chips, chart keys and table filter were under 44 px on touch widths; they now meet it.

## 8 · References, and SocriaUX's own interface

**Reference intelligence** is the Creative DNA work (`docs/SOCRIAUX-CREATIVE-DNA.md`):
- a reference's DNA is measured from its pixels;
- likes and dislikes are kept per aspect;
- what is kept is numbers and phrases, never a copied design.

Nothing in this work fetches or scrapes design galleries (Awwwards, Godly, SiteInspire, Muzli). Their terms do not
offer an API for this, and the brief asks that terms and robots be respected. References enter as the designer's
own pictures or from the open-licence libraries the moodboard already searches.

**SocriaUX's own interface.** The new panels use SocriaUX's brand tokens (`--sb-*`), never a design's own. A design's
colours appear inside the frame and in swatches only.

## 9 · Verification

| What | Result |
| --- | --- |
| Unit tests (`test/ux-v0.test.mjs`) | 789 passed. New: made pictures, the image pathway, motion v2, interactions, 3D, width rules, combine, complexity, economics, QA v2, intent. |
| Route tests (`test/ux-v0-route.test.mjs`) | 185 passed. New: the image route (off, priced, capped, checked, recorded apart, errors), and the generate route's complexity reading, tier choice and timed usage. |
| Six-project benchmark | 102 of 102 checks. |
| Interface walkthrough (`ui-qa.mjs`, against `next start`) | 85 passed. It now also combines two directions, sets a rule for phones and sets headlines in capitals from the Type panel. |
| The repository's guards (token metering, trial gate, metering context) | Pass. The image route uses the tracked client, the trial gate, `withMeter` and `sleepAnswer`, like every other model route. |
| Creative DNA benchmark (`dna-bench.mjs`) | 58 passed: the intent changes kept its five briefs as they were. |
| Full repository suite (`node test/run.mjs`) | All 382 suites passed. |
| Production build (`next build`) | Passes. |

### The six-project benchmark

`production-bench.mjs` runs with no model call and no spend. The projects:
- luxury fashion editorial;
- experimental architecture studio;
- high-end creative agency;
- motion-rich digital artist portfolio;
- immersive 3D product experience;
- scientific research interface.

For each project:
1. The engine derives the DNA, proposes three directions and makes the first one's study.
2. The production tools take the study further, each one a patch checked to change nothing it does not name, in the spec and in the drawn page.
3. The page is measured at 1440, 834 and 390 px with the bounded repair.
4. The interactive, 3D and motion self-tests run in Chromium.
5. Reduced motion, script errors, weight, load time and frames while scrolling are checked.

The baseline is the same study, motion still, with no production tools.

| Project | Quality basic → production | Distinctiveness | Originality | KB | fps |
| --- | --- | --- | --- | --- | --- |
| Luxury fashion editorial | 100 → 93 | 100 → 100 | 100 → 99 | 86.6 | 60 |
| Experimental architecture studio | 100 → 100 | 100 → 100 | 94 → 94 | 216 | 61 |
| High-end creative agency | 100 → 100 | 90 → 90 | 92 → 94 | 162 | 61 |
| Motion-rich digital artist portfolio | 100 → 91 | 90 → 83 | 94 → 97 | 162 | 61 |
| Immersive 3D product experience | 100 → 100 | 100 → 100 | 95 → 99 | 101 | 61 |
| Scientific research interface | 100 → 100 | 100 → 100 | 96 → 96 | 86 | 61 |

**How to read this.**
- The scores are SocriaUX's own measures of faults and generic patterns, not of beauty.
- On those scores the production pages are not "better" than the basic ones. Where they lose points, it is SocriaUX's
  art-direction critique saying a page now has more than one loud move: a full-bleed picture and a kinetic headline
  together. That is reported to the designer, not repaired without asking.
- What the production pages add is capability, and every part of it was checked to work:
  - galleries that filter and open;
  - a story that pins and plays through its steps;
  - a 3D object really drawn and recoloured by its configurator;
  - a chart key and a filterable log;
  - width rules applied.

  All of it holds with nothing past the edge at three widths, no must-fix finding left, nothing moving under reduced
  motion, no script errors, pages under 220 KB loading in under 0.1 s locally, and about 60 fps while scrolling.
- None of this is a comparison with any other product.

**What it does not measure:**
- The model's own generation. No paid call was made, so model latency and cost for these six were not measured here.
  The earlier Sol evaluation (`docs/SOCRIAUX-SOL.md`) and performance benchmark (`docs/SOCRIAUX-PERFORMANCE.md`) hold
  the measured figures.
- Real typefaces (the browser's network is closed in the benchmark).
- Real photographs.

**Run it:**
```
node -e "import('./test/helpers/build.mjs').then(m=>m.buildAll())"
UXV0_OUT=/tmp/prod node test/browser/ux-v0/production-bench.mjs
```

It writes `production-bench.json`, `production-bench.md`, the screenshots, each project's spec, and `prod-contact-sheet.png`.

## 10 · Configuration

| Variable | Default | What it does |
| --- | --- | --- |
| `SOCRIAUX_IMAGE_GEN` | off | `on` offers photographs from an image model (with a key) |
| `SOCRIAUX_IMAGE_MODEL` | `gpt-image-1` | The image model |
| `SOCRIAUX_IMAGE_QUALITY` | `medium` | `low`, `medium` or `high` |
| `SOCRIAUX_IMAGE_DAILY_USD` | 1 | What a person may spend on pictures a day (0 turns pictures off) |
| `SOCRIAUX_IMAGE_PRICE_<LOW\|MEDIUM\|HIGH>` | list price | A deployment's own price for a square picture |
| `SOCRIAUX_SIMPLE_ECONOMY` | off | `on` lets simple generations run on the economy tier |

## 11 · Limits, and what is not done

**Not exercised live.** The image-model pathway is implemented and tested against a fake provider only. No paid call
was authorised, so its real output and latency are unmeasured.

**Motion:**
- The story is the first eligible sequence on the page; the designer cannot yet choose another.
- There are no page-to-page transitions: SocriaUX makes one page at a time.
- The Motion panel edits parameters, not a timeline.
- SVG choreography is limited to lines drawing themselves.

**3D:**
- The objects are procedural, from a fixed set of seven.
- There is no model upload (glTF), and no environment lighting or shadows.

**Pictures:**
- Made pictures are abstract stand-ins, not photographs.
- There is no focal-point control for placing a picture's subject.

**Width rules** are a fixed set (hidden, alignment, spacing, heading size, picture order). There are no free-form
per-breakpoint overrides of every property.

**Reference intelligence.** No gallery sites are crawled (see §8).

**The benchmark's pages** are the engine's studies taken further with the tools, not model generations.
