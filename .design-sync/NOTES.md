# design-sync notes — Socria

## What this repo is, and why the config looks odd

Socria is a private Next.js **application**, not a published component library:
`package.json` is `private: true` with no `main`, `module` or `exports`, and
there is no `dist/`. Three consequences shape the whole config.

- **`.design-sync/entry.ts` is the package entry.** The converter resolves the
  DS through `node_modules/<pkg>`, which cannot exist for a repo that does not
  self-install, so the build is run with `--entry ./.design-sync/entry.ts`. The
  barrel lives under `.design-sync/` rather than in `components/` on purpose —
  adding an export surface the product does not use would drift the first time
  anyone tidied it.
- **`componentSrcMap` enumerates, and that is correct here.** With no shipped
  `.d.ts` tree there is nothing to scan, and passing `--entry` disables the
  synth-entry fallback that would otherwise derive components from `src/`. So
  every component is pinned explicitly. This is the one place the sparse-map
  guidance does not apply; a new component in `components/` needs a line here
  and a line in `entry.ts` or it will not sync.
- **16 components are excluded** (`null` in the map) because they need the app
  around them: `LogosApp` (router + Clerk + network), the six account panels
  and `kit` (Clerk primitives), `AuthShell`, `Logo`, `BlogShell`,
  `ProfilePanel`, `OneMark`, `ConnectionsModal`, `ContextPanel`,
  `DataPrivacyPanel`. They are app plumbing and mean nothing in a design tool.

## `.design-sync/postbuild.sh` — required, run it after every build

Two things cannot travel through config. Run
`sh .design-sync/postbuild.sh ./ds-bundle` between `package-build.mjs` and
`package-validate.mjs`, always.

- **KaTeX.** `app/globals.css` opens with `@import 'katex/dist/katex.min.css';`
  — a bare node_modules specifier Next resolves through PostCSS. The converter
  copies stylesheets rather than resolving them, so that line lands in
  `_ds_bundle.css` pointing nowhere and validate stops on
  `[CSS_IMPORT_MISSING]`. The script copies `katex.min.css` plus its 60 font
  files to the exact path the import names. Rewriting `globals.css` to a URL
  import was the alternative and is worse: changing what the real app ships to
  satisfy a tool.
- **Fonts.** See below.

## Fonts — the one that would have gone unnoticed

Socria loads Instrument Serif, Inter, Kalam and STIX Two Text through
`next/font/google`, which self-hosts at **build** time and injects
`--font-serif` / `--font-sans` / `--font-hand` / `--font-stix`. Neither half
exists outside a Next build: no `.woff2` anywhere in the repo, and nothing
defines the variables. Left alone, every design the agent builds renders in
Georgia and system-ui — and it looks deliberate, so nothing downstream catches
it. Instrument Serif **is** the brand: the italic emphasis in every reply, the
journal headings, the numerals in an ordered list.

`.design-sync/fonts.css` fetches the same four families from Google (what
`next/font` does, minus the build-time self-hosting) and defines the variables.
Neither config route reaches it: `extraFonts` parses `@font-face` rules and
copies local files (there are none), and `tokensGlob` only globs **inside a
node_modules package** — it returns early without `tokensPkg`. So `postbuild.sh`
copies it into the bundle and `@import`s it first from `styles.css`, which is
the actual contract (designs receive only that closure).

`runtimeFontPrefixes` then declares the four families — plus `Comic Sans` and
`Cambria`, which appear only as OS fallbacks inside stacks — as runtime-served,
which is true and silences `[FONT_MISSING]` honestly rather than by assertion.

## Known render warns

Triaged as legitimate; re-syncs should not read these as new.

- `[RENDER_THIN]` on **CoverArt**, **LogosMark**, **ModelGlyph**, **NodeGlyph**,
  **StatusMark** — all small SVG marks. A floor card for a 16px glyph really
  does paint almost nothing. Not broken.
- `[RENDER_BLANK]` / `bad` on **OneLock** (4782 B, threshold 5 KB) — a 9×9px
  padlock. No render error, root not empty; it is simply the smallest component
  in the system. The only fix is an authored preview, which this sync was
  scoped not to do.

## Scope of this sync

Floor cards everywhere — **0 authored previews**, by choice, for speed. All 44
components import and render fully functionally; 34 show the honest "preview
not yet authored" card. `SetupNotice`, `SubscribeForm`, `DraftSpace` and a few
others render real content because they need no props.

Authoring previews is incremental: drop `.design-sync/previews/<Name>.tsx` and
re-sync. Authored files and grades carry forward, so this is not a decision
that has to be revisited all at once.

## Re-sync risks

- **`entry.ts` and `componentSrcMap` are hand-maintained.** A component added
  to `components/` appears in neither automatically and will be silently
  missing from the next sync. Check both when the component list looks short.
- **The exclusion list is a judgement about dependencies, not a permanent
  fact.** If `OneMark` or `ContextPanel` ever stop calling `fetch`, they become
  syncable. The survey that produced the list keyed on imports of
  `@clerk/nextjs`, `next/link|navigation|image`, and `fetch(`.
- **The Google Fonts `@import` is a network dependency at render time.** If
  Google is unreachable, designs fall back to Georgia. Self-hosting the four
  families under `.design-sync/fonts/` and rewriting `fonts.css` to real
  `@font-face` rules would remove it — worth doing if the bundle ever needs to
  work offline.
- **Playwright and chromium must agree.** This machine caches chromium build
  **1194**, which is pinned by **playwright 1.56.1**; the current npm default
  (1.63.0) pins 1243 and fails with `Executable doesn't exist`. The version is
  pinned in `.ds-sync/package.json`, which is gitignored — a fresh clone must
  re-pin it.
- **Never uploaded.** This build has no `projectId`: the design MCP could not
  authorize in the session that produced it, so `_ds_sync.json` describes a
  bundle no project has. The first successful upload is what makes the anchor
  mean anything; until then every re-sync re-verifies from scratch, which is
  correct.
