# SocriaUX v0 — browser checks

Playwright checks for `/ux-v0`. They drive the real app in Chromium, with the model and the image libraries **scripted** (their routes are stubbed in the browser), so they verify how the product behaves, not how well the real model reasons. The exception is `moodboard-live.mjs`, which searches the real Openverse. The real-model run is decision D9 in `docs/SOCRIAUX-V0.md`.

They are not part of `npm test`, because they need a running app and a browser. The runner only collects `test/*.test.mjs`.

## Running them

1. Start the app with the v0 switch on. It is on in development by default:

   ```bash
   npx next dev -p 3100
   ```

2. `sections.mjs`, `gallery.mjs` and `benchmark.mjs` render through the modules under test, so build those first. `npm test` builds them too:

   ```bash
   node -e "import('./test/helpers/build.mjs').then((m) => m.buildAll())"
   ```

3. Run a check. Each prints `PASS` and `FAIL` lines and a summary:

   ```bash
   node test/browser/ux-v0/checklist.mjs
   ```

| Variable | Meaning | Default |
|---|---|---|
| `UXV0_BASE` | the running app | `http://localhost:3100` |
| `UXV0_OUT` | where screenshots and captures go | a folder in the system temp directory |
| `PLAYWRIGHT_MODULE` | a Playwright to load instead of the one `require('playwright')` finds | — |

## What each one covers

| Script | Covers |
|---|---|
| `workflow-a-create.mjs` | Workflow A end to end: intent, question, moodboard (keep, remove, replace), answer, brief, art direction (three drawn as specimens, asked again with the designer's own words, one changed and so kept, then taken), generate in that direction, the checks at desktop and phone widths, change, undo, critique, versions, cost. |
| `workflow-b-critique.mjs` | Workflow B end to end. An HTML import in its sandbox: its script, `parent`, storage and the network are all unreachable. Element and area selection, a card and its follow-up, a PNG crop with its one-time thumbnail, reload persistence. |
| `checklist.mjs` | Refused files, SVG and JPG imports, zoom keys, stepping through the page with what is announced, the missing-files line, workspace widths, the home list and its inline delete, answer and brief editing, refinement moving the board, versions, drops, storage full, a failed call kept with *Try again*. |
| `acceptance.mjs` | Every kind of element selectable. The highlight through zoom and panning. A card's area returning its heading, text and button. Viewport switches keeping the selection. Forged and malformed messages ignored. axe on the workspace shell. A 4000 px screenshot and a 16 px icon. Zoom about the pointer. Areas in image pixels at any zoom. Crops on 1× and 2× screens. Sign-in at the first model call. Discovery at 390 px. A provider failure on the board. Brief edits through a reload. An area on a generated design. An exact undo. |
| `moodboard-live.mjs` | The moodboard against the **real** Openverse; it needs network access to `api.openverse.org`, and uses `HTTPS_PROXY` when one is set. Long model queries must still fill every group with relevant, loaded, credited images. Also covered: *More images*, *More like these*, the board's own search, *Replace*, and no image shown twice. |
| `sections.mjs` | Every section kind and variant, across the five classic styles and all twelve visual languages, three palettes (a light accent and a dark ground among them), with each section on a different ground (base, alternate, accent, second ink, inverted). Each must render cleanly, keep text at 4.5:1 (over images, at the worst case), give 44 px targets at 390 px, and never scroll sideways. |
| `gallery.mjs` | Every gallery count from 1 to 8, grid and mosaic, at three widths: no image-sized hole and no overflow. |
| `benchmark.mjs` | The art-direction benchmark (`docs/SOCRIAUX-ART-DIRECTION.md`). Nine briefs (`benchmark-briefs.mjs`, Socria's own landing page and launch among them) drawn by the previous renderer and in the engine's three directions; each measured at 1280 and 390 px, evaluated and revised in at most two rounds. Reports quality, distinctiveness, diversity, fidelity, latency and cost, and writes screenshots, `results.json` and `contact-sheet.png`. Real photographs come from Openverse when the network allows (`BENCH=socria,lumen` runs a subset). |

The photographs in `fx/` are small stand-ins. `kinds.html` and `existing-design.html` are the pages the critique checks import.
