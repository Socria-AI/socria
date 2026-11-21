# SocriaUX — Design System Intelligence 1.0

> The design system defines identity. The generative engine determines expression.

This document records the repository audit (Phase A), the architecture that followed from it, what was built, how it
is verified, and what is not done. Every capability is classified, with its evidence, under "Status of each capability".

## Phase A — repository audit (with evidence)

| Area | What exists | Evidence |
| --- | --- | --- |
| Application | Next.js app router; SocriaUX v0 at `/ux-v0`, mostly client-side (device-first) | `components/ux-v0/V0App.tsx` |
| Persistence | IndexedDB `socria-ux-v0` v1, stores `projects` + `artifacts` (Blobs); memory fallback | `lib/ux-v0/store.ts:14-48` |
| Account copy | `/api/ux-v0/projects` → Supabase `ux_v0_projects` (user_id, id, name, doc, timestamps), newer copy wins, every query filtered on `user_id` | `app/api/ux-v0/projects/route.ts`, `supabase/rls.sql:180-192` |
| Auth / permission model | Clerk `auth()` → `userId`; **single owner per record**; no organisations, roles or sharing in SocriaUX | `route.ts` files; no `orgId`/`useOrganization` in `lib/ux-v0` routes |
| Rate limits | `enforceRateLimit(req, userId, bucket)` (Upstash or in-memory) | `lib/rate-limit.ts` |
| Route helpers | `readBody`, `bad`, `signInFirst` | `lib/ux-v0/route-kit.ts` |
| Website design system (task 57) | `DesignSystem` (flat: colours, roles, fonts with stand-ins, sizes, spacing, radii, components, rules, notes) read from DTCG / Style Dictionary / Tokens Studio JSON, CSS variables, Markdown; **aliases resolved eagerly and lost**; attached to `brief.system`; `briefWithSystem` locks colour/type/layout; `conformance` + `offSystem` check designs and edits | `lib/ux-v0/design-system.ts:48-66,128-195,362-402,478-567` |
| GitHub reader | two fixed hosts, checked owner/repo/ref/dir, ≤8 files, capped, no redirects, `GITHUB_TOKEN` server-only | `lib/ux-v0/design-system-server.ts`, `app/api/ux-v0/design-system/route.ts` |
| Boards identity | `MasterDesignSystem` (tokens, weights, type habits, composition, shape, motifs, imagery, logo incl. approved concept, constraints, vocabulary, style); **bindings** (node prop → TokenKey) recorded at composition; `propagate` / `syncSystem` keep local overrides, respect locks, repair within bounds, relink logos | `lib/ux-v0/boards/system.ts:20-80,281-313`, `lib/ux-v0/boards/sync.ts` |
| Graphics tokens | `GraphicDoc.tokens` = 7 colours + 2 faces (+ accent2); nodes hold literal values (no token references) | `lib/ux-v0/graphics/doc.ts:315-327,366` |
| Website tokens | `DesignTokens` { colors, fonts, scale, radius } in the spec; the renderer emits CSS variables from them, so a token slot is a real reference | `lib/ux-v0/spec.ts` |
| Logos | approved `ConceptRecord`, linked logo instances (`link: 'logo:<id>'`, `linkHash` → local override detection) | `lib/ux-v0/graphics/logo/link.ts` |
| SVG | own tokenizer: entity DOCTYPE refused, scripts/handlers/foreignObject/external refs dropped | `lib/ux-v0/graphics/svgimport.ts:1-40` |
| PDF | `unpdf` already a dependency (pdf.js serverless build) | `package.json` |
| HTTP | `undici` already a dependency | `package.json` |
| Tests | 388 suites via `node test/run.mjs`; route tests run real handlers with fake Clerk/Supabase/OpenAI | `test/run.mjs`, `test/ux-v0-route.test.mjs` |
| Network here | Figma API (`api.figma.com`) and arbitrary public sites are denied by this environment's proxy; no Figma credential exists | `curl` → `CONNECT tunnel failed, response 403` |

**Findings that shaped the design**

1. Two partial design-system models already exist (website `DesignSystem`, Boards `MasterDesignSystem`) plus the
   graphics `Tokens`. A third, disconnected model would violate the brief. The canonical system is therefore the
   *source* both existing models are derived from through adapters; the existing pipelines (brief locking,
   conformance, bindings, propagation, logo relinking) keep working unchanged.
2. The existing JSON/CSS readers resolve aliases eagerly and drop unknown properties. The canonical importers keep
   aliases, modes, provenance and unknown metadata; the old readers stay for the brief's quick attach.
3. The permission model is single-owner (`user_id`). No roles or organisations were invented: "workspace" is the
   owner's account, and approvals are an explicit owner review before publishing.
4. Persistence is device-first with an optional account copy. Design systems follow the same pattern: an IndexedDB
   store, and an account copy in a new owner-scoped table.

## Architecture

```
 sources ──► adapters ──► canonical system (lib/ux-v0/dsi) ──► registry (draft · versions · audit · sync)
 JSON/DTCG/Tokens Studio/Style Dictionary/Figma JSON        tokens with aliases, modes, provenance
 CSS variables · PDF guidelines · website · Figma REST      identity · colour · type · layout · effects
 SVG/PNG/JPEG/WebP/fonts · SocriaUX projects · GitHub       components · assets · visual language
                                                            brand intelligence · governance · unknown
                                    │
                    product adapters (references, not copies)
           ┌──────────────┬───────────────┬────────────────┬──────────────┐
        Websites        Graphics         Boards            Logos
     DesignSystem →   Tokens + recorded  MasterDesignSystem approved imported
     briefWithSystem  bindings           → syncSystem      logo = protected asset
```


## What was built

All of it is deterministic code: no model is asked for any import, reference, validation, mapping, propagation, sync or
export, so nothing is spent.

| Module | What it does |
| --- | --- |
| `lib/ux-v0/dsi/schema.ts` | The canonical system: identity, modes, tokens (value or reference per mode, provenance, extensions), groups, product roles, components, assets, brand intelligence, governance, unknown metadata; limits; normalization (prototype keys refused) |
| `lib/ux-v0/dsi/colour.ts` | Every CSS / DTCG colour form (hex, named, rgb, hsl, hwb, lab, lch, oklab, oklch, `color()`, DTCG colour objects), kept as written, read as sRGB |
| `lib/ux-v0/dsi/tokens.ts` | The token engine: references (whole, embedded, inside composites), safe token maths, modes with fallback, override layers (object > material > project > system), cycle / missing-reference / type / value validation with fixes, dependents, roles reached, governance-checked overrides, diff, edits (set, add, remove-if-unused, rename-with-references) |
| `lib/ux-v0/dsi/classify.ts` | Type inference, colour categories (primitive, semantic, brand, text, background, border, status, gradient), dimension kinds, role inference with confidence and reason (never inventing a colour), census |
| `lib/ux-v0/dsi/import-json.ts` | One pipeline for W3C DTCG, Tokens Studio (sets and themes), Style Dictionary, Figma variables JSON, plain maps and SocriaUX's own export; modes from files, `$extensions` or light/dark groups; errors with line and column |
| `lib/ux-v0/dsi/css-parse.ts`, `import-css.ts` | A data-only CSS parser (nesting, at-rules, `@property`, `@font-face`, `@import` listed never fetched) and custom properties as tokens: themes and media queries as modes, `var()` as references, `calc()` as token maths, scoped variables kept unread |
| `lib/ux-v0/dsi/guidelines.ts`, `import-pdf.ts` | Brand guidelines (PDF through pdf.js with scripts off, or Markdown) read as evidence: colours (explicit / extracted from drawn swatches / inferred from CMYK, each labelled), typefaces with use and weight, type scale, rules with machine checks, personality / tone / imagery / layout / motif statements, unknowns said |
| `lib/ux-v0/dsi/site.ts`, `site-server.ts` | A website reconstructed (every token inferred) behind an address guard: scheme, credentials, port, hostname and IP checks (IPv4, IPv6, mapped and embedded addresses), DNS checked, connect-time lookup against rebinding, redirects checked hop by hop, streamed size caps, time limits, content types, no crawling |
| `lib/ux-v0/dsi/figma.ts`, `figma-server.ts` | Figma through the official REST API: variables (collections, modes, aliases, scopes), styles (fills, gradients, text with families, effects, grids), components and variants as definitions, logo exports as sanitized SVG; source mappings on every token; the Enterprise-only variables endpoint handled |
| `lib/ux-v0/dsi/assets.ts` | Files identified by their bytes (PNG, JPEG, WebP, TTF, OTF, WOFF, WOFF2, SVG), pixel sizes from headers, font names and licences from the name table, an allowlist SVG rebuild (scripts, handlers, foreign objects, external references, entities and unsafe styles removed and said), SHA-256, low-resolution logos refused as masters, approval → protection |
| `lib/ux-v0/dsi/project-extract.ts` | A system drawn from a SocriaUX website, graphic or board (approved logos become approved assets) |
| `lib/ux-v0/dsi/intelligence.ts` | Brand readings (contrast, harmony, saturation, temperature, type pairing and scale, corners, spacing rhythm, logo geometry, a suggested personality), each inferred and never enforced; approve / reject / enforce / reword / add rule; binding rules; the visual language |
| `lib/ux-v0/dsi/registry.ts` | The record: draft, published versions, sources, sync state, audit; publish (validation blocks, review needs confirmation), rollback (as a new version), discard, rename, archive, duplicate, default, prune (never a pinned version), compare, single-owner permission |
| `lib/ux-v0/dsi/merge.ts` | Import conflicts (keep, replace, rename with references rewritten, merge, skip), suggestions with reasons; an approved logo is never replaced by default |
| `lib/ux-v0/dsi/adapters.ts` | The canonical system as the website `DesignSystem`, graphic `Tokens`, Boards `MasterDesignSystem` (identity over the board's expression), linked approved logos, product slots, the brand guard, and `guardedForBrand`: the one order a composition made in a system goes through before it is shown (the approved logo placed, the hard rules resolved, then the document's own checks and repairs on the colours it really has, in the system's palette only) |
| `lib/ux-v0/dsi/link.ts`, `link-schema.ts` | Projects linked (follow the latest, or pinned), applied, impact previewed, propagated through linked references only (website token slots, a graphic's recorded bindings, a board's bindings), overrides kept, versions saved before, undo, unlink |
| `lib/ux-v0/dsi/sync.ts` | Three-way sync (base, local, upstream): incoming, conflicts with accept upstream / keep local / merge / create override / defer; managed checks with optional auto-accept of changes nobody made locally |
| `lib/ux-v0/dsi/exporters.ts` | SocriaUX JSON (lossless), DTCG (modes in `$extensions`, plus one file per mode), Style Dictionary, CSS (themes, `prefers-color-scheme`, a path map for exact round trips), SCSS, guideline summary (Markdown and a printable page), SVG assets |
| `lib/ux-v0/dsi/fidelity.ts`, `lib/ux-v0/graphics/brandguard.ts` | Fidelity of a design to a system (palette, faces, headline case, gradients, accents, contrast on the real backdrop — coloured runs of words included — the approved logo's proportions, cropping, filters, minimum size and clear space); the guard that resolves the hard rules while composing: colours moved to the system's, then every text colour and coloured run re-checked on what is really under it (an emphasis keeps a colour of the system's own), the logo's clear space made |
| `lib/ux-v0/dsi/generate.ts` | Generation within a system: the engine's directions in the system's identity, three board expressions of one identity, a composition placed, bound, guarded and checked |
| `lib/ux-v0/dsi/store.ts`, `app/api/ux-v0/systems/route.ts` | This browser's store (its own IndexedDB database) and the account copy (owner-scoped table `ux_v0_systems`, newer copy wins, every query on `user_id`) |
| `app/api/ux-v0/design-system/site/route.ts`, `…/figma/route.ts`, `…/design-system/route.ts` (`raw`) | The website, Figma and GitHub sources, signed in and rate-limited |
| `components/ux-v0/systems/*` | The Design System Manager (Overview, Tokens, Brand, Assets, Components, Governance, Usage, Versions, Sync, Export), the seven-step Import Wizard, the workspace badge, the linked-system hook |

Integration with existing code (no second architecture): `DesignSystem.link`, `MasterDesignSystem.brand` (with its
palette and logo rules), `DesignProject.systemLink`, `GraphicState.bindings`, `brand:` linked logo images in graphic
documents, `placeLogoAsset` in Boards composition, the brand guard in Boards composition (before the checks), an opt-in
palette mode for the graphics readability repair (`CheckOpts.palette`: inks and grounds from the system's palette only;
unchanged when not asked), and the badge in the Website, Graphics and Boards workspaces. The website pipeline's own `briefWithSystem`, `conformance` and `offSystem`, and Boards'
own `syncSystem` and bindings, do the product-side work.

## Configuration

* **Account copy of design systems** — run the `ux_v0_systems` table and its RLS lines from `supabase/schema.sql` and
  `supabase/rls.sql`. Without the table the route answers `storage: { ok: false }` and systems stay in the browser.
* **Figma** — a designer pastes a personal access token in the import (Figma → Settings → Security → Personal access
  tokens; scope `file_content:read`, and `file_variables:read` on an Enterprise plan for variables). It is sent with that
  one request and never stored or logged. A single-tenant deployment may set `FIGMA_TOKEN` on the server instead.
  OAuth is not implemented (it needs a registered Figma app).
* **Website extraction** — needs outbound HTTPS from the server to public hosts. Nothing to configure; the guard is
  always on.
* **GitHub** — the existing `GITHUB_TOKEN` (optional, server-only) raises GitHub's rate limit.
* **Account data** — a person's design systems are part of their account: `ux_v0_systems` is in the account deletion
  list (`app/api/account/delete/route.ts`) and in the data export (`designSystemsV0`). The copy kept in the browser
  follows the projects store: it stays on the device.

## Verification

* `node test/run.mjs design-system-intelligence` — 175 checks across the 30 test categories.
* `node test/run.mjs dsi-route` — 25 checks through the real route handlers (fake Clerk, Supabase and network):
  ownership, cross-account isolation, newer-copy-wins, size limits, the address guard, Figma token handling.
* `node test/browser/ux-v0/dsi-qa.mjs` — all fifteen acceptance actions in the built app (46 checks), read back from the
  browser's own stores: import, review, conflicts settled, save and publish, a graphic, an existing website and a board
  in the system, the approved logo, original compositions with their fidelity, token edits, impact preview, update,
  rollback, sync (with a conflict), export, the PDF path, and edits in place (rename, reword, a protected removal).
* `node test/browser/ux-v0/dsi-bench.mjs` — benchmarks A–I with their evidence (`dsi-bench.md`, `dsi-bench-F.png`).
* The whole repository suite (`node test/run.mjs`, 391 suites) and the Graphics, Boards, Logo and Style browser checks,
  for regressions.

## Status of each capability

Classified as *Implemented and verified* (working code with a test or benchmark that exercises it), *Implemented but
unverified*, *Partially implemented*, *Blocked* or *Not implemented*. "QA" is `dsi-qa.mjs` in the built app, "unit" is
`design-system-intelligence.test.mjs`, "route" is `dsi-route.test.mjs`, A–I are the benchmarks.

| # | Capability | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Repository audit | Implemented and verified | Phase A table above, each finding with its file |
| 2 | Existing systems reused | Implemented and verified | Website `DesignSystem` + `briefWithSystem`/`conformance`, Boards `MasterDesignSystem` + `syncSystem`/bindings, graphic `Tokens`, logo linking, the GitHub reader, the projects-store and route patterns, `unpdf`, `undici`, `jszip`; QA website, board and graphic steps run through them |
| 3 | Architecture changes | Implemented and verified | Canonical system as the source, adapters out to each product, links on projects (`systemLink`), `brand:` linked images, recorded bindings, the brand guard; no second model |
| 4 | Design System Registry | Implemented and verified | Draft / versions / audit / sources / sync, default, archive, duplicate, rename, prune; QA publishes v1–v4 and rolls back. The organisation level is the owner's account: the application has no organisations |
| 5 | Canonical schema | Implemented and verified | `schema.ts`; unit (normalisation, limits, prototype keys refused) |
| 6 | Token engine | Implemented and verified | Unit; A: 67/67 resolved across 3 modes, cycles and missing references found with fixes; B: `var()` chains and `calc()` resolve per mode; 5,000 tokens imported in under half a second |
| 7 | JSON import | Implemented and verified | DTCG, Tokens Studio, Style Dictionary, Figma variables JSON, plain, SocriaUX; unit; A; I; QA import |
| 8 | CSS import | Implemented and verified | Unit; B (themes and `prefers-color-scheme` as modes, references, token maths, `@property`, scoped variables kept, `@import` not fetched) |
| 9 | Figma integration | Implemented but unverified live — **Blocked** here | REST adapter and route tested over recorded API responses (E, route: token sent only to api.figma.com, never echoed). Live calls blocked: this environment denies `api.figma.com` and has no Figma token. OAuth, webhooks and writing back to Figma: **Not implemented** |
| 10 | PDF extraction | Implemented and verified | C (Ferrowmoor: 5 colours incl. one from its drawn swatch, faces with weights, type scale, 21 statements with pages); QA PDF import. No OCR; logos inside PDFs not extracted |
| 11 | Website extraction | Implemented and verified offline; live fetch unverified | D (authored site through the real guard; private addresses, DNS rebinding, redirects to loopback refused); route. A live public fetch was not possible here |
| 12 | Brand asset import | Implemented and verified | Unit (byte sniffing, sizes, font names and licences, SVG allowlist rebuild); QA approved logo protected. WOFF2 names not read: partial for WOFF2 |
| 13 | Brand Intelligence | Implemented and verified | Unit; QA: statements with pages, confirmed vs inferred told apart, an inference reworded becomes the owner's preference (never silently a rule) |
| 14 | Import Wizard | Implemented and verified | QA: source, categories, real analysis stages, preview, confirm, apply (JSON and PDF). The conflicts step appears only when there are conflicts; the merge plan behind it is unit-tested |
| 15 | Design System Manager | Implemented and verified | QA: Overview, Tokens, Brand, Assets, Usage, Versions, Sync, Export used; Governance (locks, allowed overrides, review before publishing, restricted assets) and Components unit-tested through their functions |
| 16 | Graphics integration | Implemented and verified | QA: three directions in the identity, composed with the system's tokens and approved logo, fidelity ≥ 86, update follows; F; unit: across 18 compositions no repair leaves a colour off the palette, and every word the readability check flags is a fidelity finding |
| 17 | Logos integration | Implemented and verified | Approved logo placed as a linked image, never recoloured or distorted, clear space and minimum size held (QA, F); approved SocriaUX logo concepts become approved assets (unit) |
| 18 | Websites integration | Implemented and verified for an existing website; new website path implemented but unverified in the browser | QA: applied from the manager (new version, old kept), badge with fidelity 100; F, G. A new website takes the system once its brief exists, which needs the questioning routes (a model), not exercised here |
| 19 | Boards integration | Implemented and verified | QA: a board in the system, three expressions of one identity, every material in the palette with the approved logo, fidelity ≥ 86, each composed its own way; F |
| 20 | Global token propagation | Implemented and verified | QA: impact preview, nothing changes until applied, update follows bound properties, a version saved before; G: pinned and unlinked projects unchanged, undo restores |
| 21 | Synchronisation | Implemented and verified for file sources; managed sync partial | QA: manual check, change waits for review, a conflict settled by the owner; H: every choice. Managed checks run while SocriaUX is open (client-side); no server scheduler or webhooks |
| 22 | Versioning and rollback | Implemented and verified | QA: v1–v3 published with review, rollback publishes v2's content as v4; unit (pinned versions never pruned) |
| 23 | Export | Implemented and verified | QA downloads (DTCG with references and modes, CSS with `var()` and the dark theme); I: DTCG, Style Dictionary and CSS round trips with 0 differences, SocriaUX JSON identical. Composite tokens do not come back from CSS; no Figma write-back |
| 24 | Tests | Implemented and verified | 175 unit, 25 route, 46 browser checks pass; repository suite and other browser checks for regressions (see Verification) |
| 25 | Benchmarks | Implemented and verified | A–I pass (E mocked, said so); `dsi-bench.md` |
| 26 | Security | Implemented and verified | SVG allowlist rebuild, PDF with scripts off, data-only CSS, no fetch of `@import`, the address guard, Figma token handling, owner-scoped table with RLS (service role only), size and count caps, rate limits, prototype keys refused; unit, route, D |
| 27 | Performance | Implemented and verified | A–D timings in `dsi-bench.md`; simple references never call a model |
| 28 | Files modified | — | Listed in the final report |
| 29 | Dependencies added | — | None (`unpdf`, `undici`, `jszip` were already dependencies) |
| 30 | Known limitations | — | Below |
| 31 | Remaining technical debt | — | Below |

**Acceptance actions (§28), each driven in the built app by `dsi-qa.mjs`:** import (JSON and PDF), review (colours,
type, roles, assets, statements), resolve conflicts (sync conflict settled; wizard conflicts unit-tested), save and
publish, apply to Graphics, apply to Websites (an existing website), use approved logos, apply across Boards, generate
original brand-consistent compositions, modify shared tokens, preview affected materials, publish updates, synchronise a
supported source (a file), roll back, export.

## Known limits

* Live Figma and live public-website fetches were not exercised in the development environment (its network policy
  denies those hosts and no Figma token exists); both are tested through their real code with recorded responses.
* Figma OAuth, Figma webhooks and writing back to Figma (library round trip) are not implemented.
* Managed sync runs while SocriaUX is open in a browser (it is client-side, like the rest of the workspace); there is
  no server-side scheduler or webhook receiver.
* Imported font files are kept with their licence details; designs are drawn with the closest face SocriaUX can serve.
* Composite tokens (typography, shadow, border, gradient) export to CSS as values and do not read back as composites.
* WOFF2 font names are not read (Brotli); PDF text from scanned pages is not read (no OCR); logos inside PDFs are not
  extracted.
* The permission model is the application's: one owner per system; there are no shared systems, roles or multi-person
  approvals.
* Readability is resolved in the system's colours where it can be: in a sweep of 120 compositions across two systems
  (graphics and board materials), one headline set along a curve over rings of its own colour stayed unreadable — no
  single colour reads on everything beneath it and a curved line cannot be given a ground. The app's Checks and the
  fidelity score both say so; the same composition does it without any design system.

## Remaining technical debt

* A server-side scheduler (or Figma webhooks) for managed sync, so a source is checked when nobody has SocriaUX open.
* Figma OAuth for multi-tenant deployments, and live verification of the Figma path once a token and network access
  exist.
* The wizard's conflict step is driven through its functions in unit tests; the browser check settles a sync conflict.
* Imported font files are kept but not yet served to the renderers (designs use the closest available face).
* WOFF2 name reading (needs a Brotli decoder) and OCR for scanned guideline PDFs.
* The Graphics browser check (`graphics-qa.mjs`) has two seed-dependent checks that fail on some runs regardless of
  design systems: a headline the check itself sets to 96 pt can break mid-word in a narrow box, and a carousel slide can
  echo its point as a decorative word. The unlinked graphics path is unchanged by this work.
