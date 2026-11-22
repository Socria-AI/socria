# SocriaUX — the creative ceiling

What changed so that a designer's words become the design, not a description the generator reads and ignores. A
simple page stays simple.

```
Words (brief · references · notes) → creative reading (interpret.ts) → directions (direction.ts: the reading applied
in code, hybrids from named influences) → generation (told the reading) → held in code (arrange.ts: the opening's
arrangement) → checked (evaluate.ts: reading breaches, arrangement) → canvas (focal points, crops, the story, motion
in words, a working menu)
```

## Why it produced what it did (the audit)

- **Composition was flow only.** Sections were stacks, grids and boxes, with no overlap, no bleed, no hand-placed
  arrangement and no display scale.
- **The words were matched, not read.** A designer's qualities ("monumental, restrained, nothing cinematic") were
  matched as language keywords and DNA nudges. Their relations (tensions, refusals, influences named together,
  restrictions) were not read.
- **The model's conventional sections were accepted as written.** Only tokens and the look were enforced.
- **The range was narrow.** Twelve visual languages, without a brutalist, cinematic, futurist, industrial or
  maximalist one, and 41 typefaces.
- **On phones the navigation's links were hidden,** with no menu to reach them.
- **Pictures could not keep their subject in view,** and the pinned story could not be chosen.

## What was built

- **Composition primitives v2** (`compose.ts`, `render.ts`):
  - `layer`: words over a picture, anchored to a corner, an edge or the centre;
  - `field`: twelve columns where each piece has a cell, may overlap, and collapses to one column in reading order
    below 900 px;
  - display sizes (l, xl, giant) and a title set line by line on strips of the ground where it crosses a picture;
  - wide and edge-to-edge spans, whole-screen parts and pinned columns.
  - The page audit gained a **collision check**: words running into words on a field.
- **The creative reading** (`interpret.ts`) reads, from the designer's words, qualities, refusals, tensions,
  influences named together and restrictions. The result is an `Execution`: DNA nudges, look, tokens, motion,
  warmth, the opening's arrangement, frames, motifs and what is forbidden.
  - It is applied to the directions in code and told to the generator.
  - The opening's arrangement is held after generation (`arrange.ts holdArrangement`), and breaches are findings
    with fixes.
  - Rules: restraint wins over ornament; refusals are applied last; square-corner qualities block softening; the
    last-said quality wins.
  - Since `SOCRIAUX-VISUAL-ORIGINALITY.md`, the first (faithful) direction takes the whole reading. The other two
    keep what the words ask outright (space, the scale, the ground's warmth, everything refused) and move their
    motion a step toward the words rather than copying it, so the three stay distinct.
- **Range.**
  - Five new languages: raw structure (brutal), widescreen (cinema), signal (future), workshop (industrial), more is
    more (maximal).
  - Hybrid directions from named influences.
  - 74 typefaces: 33 added, each request checked against Google Fonts' CSS2 API.
- **Canvas.**
  - A full-screen menu that works on every navigation on a phone: open, close, focus trap, Escape, focus returned.
  - Focal points for pictures, and crops per width.
  - The pinned story as the designer's choice.
  - Motion edited in words ("slow down the transitions", "remove the parallax"), in code.

## The benchmark (`test/browser/ux-v0/ceiling-bench.mjs`)

Seven ambitious briefs, run through this engine and the commit before the work (4ecef26): experimental architecture,
luxury fashion, creative agency, editorial experience, motion-intensive portfolio, interactive product, immersive 3D.
Both engines get the same brief and the same conventional answer. No model is called.

Latest run: 71/71 checks.

- Words kept: an average of 27% before, 100% now (immersive 3D 14% → 100%). "Words kept" is the share of what the
  words asked for that can be found in the design, with the same instrument on both engines.
- Openings recomposed where the reading asks: hero → composed field or layer.
- Quality 100 → 98–100; originality unchanged (96–100).
- Every page: nothing past the edge at 1440, 834 or 390 px; no words colliding; every interactive part works when
  tried; the menu works; the 3D object is drawn (pixels read back).
- Five targeted changes per project each change only what they name.
- The generator's prompt grew from about 14.9k to 20.0k characters across this round and the next
  (`SOCRIAUX-VISUAL-ORIGINALITY.md`).

## Limits

- **Custom typography is closest-face matching.** It comes through a design-system import; there are no
  user-supplied font files.
- **Pinned and scrubbed motion are desktop-only, by design.** There are no per-width motion rules and no timeline
  editor.
- **No model or image model was run.** The quality of model output for these briefs is unmeasured.
- **Fields are edited through patches or the model.** There is no free dragging on the canvas.
