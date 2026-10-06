# Synthesis — structure → understanding

*The synthesis is not Socria's answer. It is Socria holding up a mirror to the person's thinking.*

Logos already turned conversation into structure. Synthesis is the payoff: after externalising their thinking, the person presses **Synthesize** and sees what it has become, what is weak in it, and what it does not yet hold.

THINK → EXTERNALIZE → STRUCTURE → MANIPULATE → **SYNTHESIZE** → REFLECT → CONTINUE

## Audit, before building

| Question | Answer |
|---|---|
| Where is canonical state? | The session's `map`: nodes (semantic `type`, structural `role`, `status`, `origin`), edges (relations, `when`), `building`, `models`. |
| The chat pipeline | `/api/logos/chat` streams the reply; `/api/logos/map` extracts the map from the transcript in parallel. |
| Types and roles | `lib/logos.ts` NODE_TYPES; `lib/representation.ts` roles, spine, attachments, order. |
| How synthesis gets structured state | `digest()` reads the map in code. The model is given the digest; the conversation is only an excerpt of evidence. |
| Where the artifact lives | As a message in the conversation, with a structured `synthesis` payload — persisted through `/api/conversations`, rendered as itself, readable by the reply model as history. |
| What to reuse | The representation module (shape, spine, attachments), the model document (computational state), map edits (`applyMapEdits`), the session's write path. |

## Pieces

- **`lib/logos-synthesis.ts`** (pure)
  - `digest(map, scope)`: canonical state, compacted.
    - What it reads: counts by role, then type; the shape and spine in order; what is established (supported or resolved only); candidates; open questions; tensions; values and constraints; the model the session built.
    - **Findings** the structure proves on its own: settled claims that contradict each other, assumptions with nothing under them, claims without evidence, a constraint working against a goal, branches with no condition, dead ends, disconnected objects, a decision with one option or no criteria.
  - `synthesisPrompt(digest, excerpt)`: the editorial layer is asked for over the structure.
    - It carries the meaning of each type and role.
    - It sets epistemic rules: never turn an idea into a decision; disagree where there is reason; don't flatter; don't invent criticism.
    - It defines three critique levels, with per-domain prompts.
    - It allows at most three possibilities.
  - `enforce(draft, digest)`: the model is never trusted on epistemics.
    - "Established" may only rest on settled objects; anything else is moved to "taking shape" or dropped.
    - A "problem" that matches no computed finding becomes a "risk".
    - References to objects that don't exist are dropped.
    - A possibility the map already holds is dropped.
    - Next moves are limited to ones the structure supports.
    - Lengths are capped whatever the map's size.
  - `fromStructure(digest)`: the whole synthesis from the structure alone, used when no model answers. Plainer, never less honest.
  - `changeBetween(snapshot, map)`: what moved since the last synthesis — added, resolved, strengthened, weakened, revised, new tensions, set aside, a change of shape. Each synthesis carries a snapshot, so the next one can say what changed.
  - `chooseNext`: 2–3 moves that follow from the structure — work through a tension, resolve open questions, find support, compare alternatives, lay it out as a flow, challenge it — plus *keep thinking*.
- **`/api/logos/synthesize`**: digest → model → enforce, falling back to the structure. Scopes: workspace, or a selection.
- **`components/LogosSynthesis.tsx`**: the artifact.
  - Layout: an eyebrow, an Instrument Serif heading, a short paragraph, then only the sections the structure earned — current shape, established, taking shape, tensions, still open, Socria's reading, what I'd question, possibilities.
  - No boxes: hairlines, small caps and whitespace.
  - Socria's voice (its reading, critique and possibilities) carries its blue and says it is Socria's.
  - Three lines per section, with the rest a click away.
- **In Logos**
  - **Synthesize** sits beside the composer, quiet until there are two objects.
  - In Logos 2 the synthesis appears inline in the conversation. In Logos 3 it opens above the composer, and the map keeps a third of the screen.
  - **Selection:** shift- or ⌘-click cards, then *Synthesize these*.

## The human owns the model

- A synthesis never writes to the map.
- A possibility enters the map only on **Add to map**, and a reading only on **Add as a principle**. Either one carries `origin: 'socria'` for good. The map shows it dashed, and the extractor keeps the mark through every rebuild.
- **Explore** seeds the composer; **Dismiss** is remembered on the synthesis.
- The map extractor never sees a synthesis, so Socria's interpretation is never mapped as the person's thinking.
- The reply model is told how to answer a reply to a synthesis. A correction of Socria's *reading* changes nothing in the map. A change of the person's *thinking* ("ease of access matters more than personalization") is theirs, and is mapped like anything else they say.

## Verified

- `test/logos-synthesis.test.mjs` (77), across ten workspaces: onboarding, a launch plan, a decision, an argument, research, a model with a built document, a sparse pair, 72 objects, a contradiction, mostly unresolved. They checked that:
  - each reads differently;
  - types and roles are weighed, not listed;
  - ideas are never established;
  - the structure's own problems are found, and none are invented for a sparse map;
  - output is compressed at any size;
  - a model draft is held to the structure;
  - a selection is read as itself;
  - "what changed" is told as change;
  - an accepted suggestion keeps its provenance;
  - nothing mutates.
- `test/logos-synthesis-e2e.test.mjs` (19), through the real routes:
  - the model is given the structure and only the last few turns, never an earlier synthesis;
  - the draft is held to the structure;
  - the structure takes over when the model fails;
  - the extractor never sees a synthesis, and provenance survives a rebuild;
  - the reply is told how to handle a correction.
- Chromium:
  - Logos 3 and Logos 2 with a model-written synthesis, and the structure-only fallback.
  - Add to map, marked as Socria's.
  - Dismiss.
  - Picking cards for a selection synthesis.
  - A 390px phone.

**Not verified here:** the quality of what the live model writes. This sandbox cannot reach it, so every model reply in the suites is scripted. What a draft is allowed to claim is enforced in code whatever it writes.

## Next

- *What changed in my thinking* as its own view over a session's history, not only since the last synthesis.
- Branch and comparison scopes over model revisions (`compareRevisions`).
- Per-section expansion that asks for more detail rather than revealing what was trimmed.
