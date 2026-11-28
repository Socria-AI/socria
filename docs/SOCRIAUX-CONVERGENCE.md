# SocriaUX — aesthetic convergence and typographic bias

Why unrelated briefs came out looking like siblings — the same few faces, a cream ground, small letter-spaced labels,
hairline rules, a strip of details at the foot — what actually caused it, what was changed, and what the change did on
ten deliberately different briefs. This is a targeted change to the designer's instructions, its font menu and its
font loading, not a rebuild: the engine, the UI, the creation modes and design-system behaviour are unchanged.

## What caused the repetition

Found by reading the pipeline end to end (prompts, the font registry, font loading, CSS defaults, the look pass, the
discovery aids, the benchmarks) and by measuring what the designer produced. In order of effect:

1. **The designer's instructions carried a house recipe.** `lib/ux-v0/design/prompts.ts` told every design that
   "display type can be enormous… tight tracking on large sizes, open tracking on small capitals" and that colour is
   "usually a ground, an ink and one accent". That is one look, written as general advice. Measured: small
   letter-spaced labels in 16 of 20 baseline designs, across ten unrelated briefs.
2. **The font menu gave names and nothing to choose by, familiar names first.** The registry has a note on every
   face's character (`lib/ux-v0/fonts.ts`), but the designer's menu stripped it to `Name (kind)`, in registry order —
   Instrument Serif the first serif, Inter the first sans, IBM Plex Mono the first mono. With 144 bare names, the model
   picked the ones it already knew: 16 distinct faces in 20 designs, Cormorant Garamond in 7, Jost in 5, Instrument
   Serif and IBM Plex Mono in 4 each.
3. **The avoid list named only one generic look.** It warned against the SaaS look (purple gradients, rounded cards,
   glows) and said nothing of the other one generated design falls into — cream or bone ground, refined serif display,
   spaced capitals, hairline rules, a details strip — so avoiding the first led straight into the second.
4. **SocriaUX's own interface leaked into the library.** Two registry notes described SocriaUX's own faces as its
   voice ("Cormorant Garamond… at 500, Socria's own voice"; "Geist… Socria's interface face"). The website pipeline's
   font menu (`fontMenu()`) shows those notes to its model.
5. **The brief's lettering and moods could only offer 78 of the 144 faces.** Discovery's aids (the type and mood
   options a person picks from) were drawn from the website list only, so wood type, blackletter, stencils, pixel faces,
   rounded and hand-drawn faces could never be offered.
6. **Fonts that silently did not load.** The frame loaded only faces named directly in `font-family`: a face set
   through a custom property (`--font-display: "Anton"` — how shared styles and every brand system's tokens name it)
   was never loaded; `font-family:"Anton"` written without a space after the colon was never matched; and fallback
   names counted against the twelve-face limit before library faces. Measured: none of the 20 baseline designs was hit
   (each named its faces directly), so this did not cause the convergence measured here — but any design using shared
   tokens or a design system was drawn in a fallback face without anyone being told.
7. **Not a cause, checked:** no hard-coded CSS defaults (no default ground, face or label style is injected by the
   frame or the document), no example designs in the prompt, and sampling temperature is not sent on the Claude path
   (adaptive thinking), so diversity cannot come from temperature and was never meant to.

## What changed

| Cause | Change | File |
|---|---|---|
| A type recipe and a colour formula | Typography and colour are decisions drawn from the subject, with the range named (one heavy face filling the sheet, a quiet book serif, a mono doing the talking, wood type, script, pixel; a saturated field, many colours, tonal, a material's colours, ground-ink-accent) and no default; "a warm off-white ground is one choice among many, never a starting point" | `lib/ux-v0/design/prompts.ts` |
| Faces before ideas | "Begin from the subject's world, not from a look": the visual culture the work belongs to, the one idea, what it asks of structure, type, colour, form — faces chosen last, for what they say; "if the faces you first think of are ones you would reach for on most briefs, read the list again". The `<say>` names the idea | `prompts.ts` |
| Bare names, familiar first | Every face listed with its character, by kind and alphabetically (no face first by habit), marked when it is for headlines only | `prompts.ts`, `lib/ux-v0/fonts.ts` |
| The editorial default unnamed | Named as what generated design drifts to when nothing is decided — cream ground, refined serif, spaced capitals, hairlines, a details strip; and (round 2) its reverse for anything "premium": a dark slate, green or navy ground, an elegant serif, a warm metallic accent — "do not start from them; use any part of them only when this brief asks for that part". Not banned | `prompts.ts` |
| The first image as a reflex (round 2) | "The image is a decision too": the first picture a word suggests is the one every designer draws first — use it only when it can be made yours, otherwise find the image that belongs to this brief (its place, material, process, history, numbers) | `prompts.ts` |
| Forcing novelty | "Restraint is right when the brief asks for it… and restraint is specific too"; "never force novelty into a brief that needs calm, and never sand a brief that needs noise down into good taste" | `prompts.ts` |
| An evaluator that could sanitize | The look pass "never tames a deliberate choice — clashing colour, distortion, extreme scale, an unusual face, density, illegibility that is part of the idea — into something safer: correct what is broken, not what is bold" | `prompts.ts` |
| House faces in the library | The two notes rewritten to describe the faces, not SocriaUX | `fonts.ts` |
| Aids limited to 78 faces | The brief's type and mood options use all 144 graphics faces (alphabetical with notes); a website's options are held to the faces a website can load | `lib/ux-v0/studio/discover-model.ts`, `brief.ts` |
| Faces that did not load | Faces in custom properties are loaded; `font-family:"X"` with no space is read; fallbacks no longer crowd the limit (library faces first, up to sixteen) | `lib/ux-v0/design/elements.ts`, `frame.ts` |
| Fallbacks nobody saw | A face the library cannot serve is reported to the look pass with what was measured ("drawn in a fallback face… use a library face") | `frame.ts` `unservedFaces`, `flow.ts` |

No random font picker, no expanded preferred-font list, no aesthetic taxonomy, no new mode, no UI change. Design-system
work is untouched except that its token faces now actually load.

## The benchmark

### Method

Ten briefs chosen to pull apart (`test/browser/ux-v0/convergence/briefs.json`): a luxury fashion editorial (magazine),
an experimental electronic music poster (A3), a contemporary architecture studio (LinkedIn post), an independent
literary journal (book cover), a children's educational brand (square post), a fintech landing page (web page), a
brutalist sculpture exhibition (18 × 24 in poster), a traditional law firm (brochure cover), an experimental science
publication (A4 cover) and a premium hotel's identity (logo sheet).

Each brief was designed **twice, independently**, under each set of instructions, through the real workspace
(`test/browser/ux-v0/design-bench.mjs`: the exact request the route builds, the answer parsed and applied by the
product's code, drawn in Chromium, then the look pass on the rendered picture, then drawn again). The baseline ran
from a frozen checkout of the commit before this change, so its instructions and its font loader are the real ones.
The answering model was a Claude model standing in for the route's configured one — no paid API call was made — with
the same model, the same assignment of briefs to stand-ins and the same wording in every condition. Three conditions:

- **before** — the instructions as they were.
- **round 1** — the changes in the table above, except the last two lines of the next paragraph.
- **round 2** — round 1 plus what round 1's pictures showed was still missing: the image named as a decision ("the
  first picture a word suggests… is the one every designer draws first; use it only when you can make it yours"),
  and the dark-premium drift named beside the cream one. Examples in every instruction are deliberately outside the
  ten briefs (a seed packet, a jazz label, a hospital's signage), so the prompt does not teach to the test.

Measured from each design's own code (`convergence/analyse.mjs`) and picture (`convergence/pictures.py`), and judged
blind (`convergence/blind.py`, `JUDGE.md`, `tally.py`): the 60 final pictures shuffled and renamed, three judges each
seeing every version of their briefs with no condition attached, rating adherence, craft, distinctiveness and how
generic it looks, and tagging motifs from a fixed list.

### Results (20 designs per condition)

| | before | round 1 | round 2 |
|---|---|---|---|
| Distinct faces used | 16 | 21 | 16 |
| Most-used face, share of designs | Cormorant Garamond 35% | IBM Plex Mono 20% | four faces at 20% |
| Faces used across ≥ 3 different briefs | Jost (4), Cormorant Garamond (4), Instrument Serif (3), IBM Plex Mono (3) | IBM Plex Mono (3) | Space Mono, IBM Plex Mono, Anton (3 each) |
| Display face is a serif | 11 | 6 | 7 |
| Small tracked labels (≥ 0.08em at ≤ 22px) | 16 | 10 | 14 |
| Hairline rules | 10 | 4 | 5 |
| Ground: light warm neutral (cream, bone) | 7 | 1 | 4 |
| Ground: dark | 8 | 11 | 3 |
| Ground: coloured (a saturated field) | 2 | 5 | 8 |
| Mean colourfulness (Hasler–Süsstrunk) | 46.6 | 66.1 | 71.1 |
| Layout similarity between different briefs (lower is more distinct) | 0.029 | 0.025 | 0.008 |
| Faces asked for but not loaded (old loader / now) | 0 / 0 | 0 / 0 | 0 / 0 |
| **Blind:** generic look (1 none – 5 entirely) | 2.95 | 2.70 | **2.45** |
| **Blind:** distinctiveness (1–5) | 3.05 | 3.25 | **3.45** |
| **Blind:** craft (1–5) | 3.95 | 3.80 | 3.80 |
| **Blind:** brief adherence (1–5) | 4.65 | 4.55 | 4.55 |
| Judges' tags: cream ground / refined serif display | 10 / 13 | 1 / 7 | 2 / 8 |
| Judges' tags: dark premium ground | 9 | 11 | 4 |
| Judges' tags: tracked small caps / hairline rules | 15 / 14 | 8 / 10 | 11 / 11 |
| Judges' tags: literal subject icon / arch / concentric rings | 6 / 6 / 3 | 10 / 3 / 4 | 8 / 4 / 4 |

Pictures, every condition side by side: `docs/convergence/compare-1.jpg` (architecture, brutalist, children,
electronic, fashion) and `compare-2.jpg` (fintech, hospitality, law, literary, science). The numbers above are in
`docs/convergence/results.json`.

### What changed, looking at the pictures

- **The house look is gone as a default.** Before, the fashion house, the law firm, the literary journal and the hotel
  were one family: Cormorant Garamond or Instrument Serif on cream or navy, Jost labels, hairlines. After, the
  fashion cover is Bodoni Moda on a rose or cold-dawn ground, the law firm is Old Standard TT on legal blue-grey or
  stone with a strip of red tape and a seal, the science cover is Anybody or Anton on acid yellow or vermilion, the
  architecture post a grotesk (Familjen, Instrument Sans, Schibsted) on oxide red or salt-white. Faces now follow the brief: the same brief gets
  related faces in both runs (Bodoni for the fashion house, Old Standard for the solicitors, Fraunces for the journal),
  different briefs get different ones.
- **Round 1 moved the problem instead of removing it.** Cream grounds fell from 7 to 1, but "premium" briefs went to a
  dark slate, green or navy ground with an elegant serif — the same look reversed (dark grounds 8 → 11). Naming that
  drift in round 2 brought it to 3, with grounds spread across coloured (8), light (8) and dark (3).
- **Some ideas changed, not just their dress.** Round 2's fashion cover became a clock face (the "hour"), the law
  firm's family tree became red tape and a wax seal, the architecture post drew the library's shelves in section
  inside the warehouse. The judge for those briefs singled out the clock face, a ledger-table fintech hero and an
  olive-leaf hotel mark as the most distinctive of its set — all three from round 2.
- **Bold work was not sanded down.** The look pass corrected 1, 1 and 4 things in the three conditions — words
  colliding, a chimney through a roof, a slash reading as a cedilla — and left every deliberate choice alone, including
  a title squeezed almost to illegibility on the science cover (which one judge marked down for legibility).

## What did not change, and limits

- **Concepts still converge within a brief.** Both runs of a brief usually reach for the same first image: concentric
  rings for "Resonant Bodies" in all six versions, an arch or doorway for "Thresholds" in all six, owls for
  "Counting Owls" (the brand's name, so expected), a gabled building for the architecture post. The judges' "literal
  subject icon" tag rose from 6 to 8 even after round 2 named it. Instructions moved type, colour and some ideas; they
  did not move the model's first association for a word reliably. Asking for several ideas before choosing would
  address this more directly, but risks forcing novelty; it was not done here.
- **New small repetitions.** Anton with Space Mono on a vermilion ground appears three times in round 2 (twice for the
  electronic night, once for the science cover); a mono face for small print stays common (IBM Plex Mono, Space Mono).
  Tracked small labels and hairlines fell in round 1 and partly returned in round 2 — they are ordinary typographic
  conventions, named in the drift paragraph rather than banned, and still used where the model thinks they belong.
- **Craft and adherence dipped slightly** (3.95 → 3.80 and 4.65 → 4.55 on a 5-point scale). With 20 designs per
  condition and one judge per brief group that is three points of 100, within what this sample can resolve, but it is
  reported rather than rounded away. Two round-2 designs changed the person's words slightly (a capital, a full stop).
- **The sample is small and the model was a stand-in.** Two runs of ten briefs per condition, written by a Claude
  model standing in for the production model through the exact prompts; the judges are models too. The production
  model will produce different designs; the direction of the change, not its size, is the finding.
- **Font loading:** none of the 60 designs asked for a face the library cannot serve, and none was hit by the old
  loader's bugs (they all name faces directly), so the loading fix shows its value in the unit tests (faces through
  custom properties, unspaced names, a long fallback list) and in design systems, not in this benchmark. The look pass
  now hears about a face drawn in a fallback; this run never needed it. One measurement note: the canvas measure
  reported text "outside the artboard" for SVG text fitted with `textLength`, which the look pass rightly ignored.

## Reproducing it

```
# a frozen checkout of the commit before the change, for the baseline
git worktree add --detach <before-tree> <commit>
UXV0_OUT=<dir> DESIGN_EXTRA=test/browser/ux-v0/convergence/briefs.json node test/browser/ux-v0/design-bench.mjs V-
#   (write each exchange/ans-<key>.txt as the model, run again for the look pass, run again to draw)
BEFORE_TREE=<before-tree> node test/browser/ux-v0/convergence/analyse.mjs <out> before-s1=<dir>/design-bench …
python3 test/browser/ux-v0/convergence/pictures.py <out> before-s1=<dir>/design-bench …
python3 test/browser/ux-v0/convergence/blind.py <blind> <key.json> before-s1=<dir>/design-bench …
python3 test/browser/ux-v0/convergence/tally.py <blind> <key.json>
```
