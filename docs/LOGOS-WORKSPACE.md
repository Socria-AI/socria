# The workspace

One vocabulary for every meaningful object in Socria, a walk over the
relationships between them, and — since this pass — a way for the person to
write into it, keep it across sessions, see what their changes reached, and take
the whole thing somewhere else.

`lib/workspace` is deliberately **not a fourth store**. Three stores already
hold intellectual objects and each stays authoritative for what it holds:

| store | what it is authoritative for |
| --- | --- |
| the Reasoning Ledger (`lib/core4`) | owner, stance, basis, revisions |
| the Thinking Map (`lib/logos`) | typed nodes and drawn edges, per session |
| the Mind Graph (`lib/mind`) | everything durable, across sessions |
| the model engine (`lib/model`) | definitions, params, fidelity earned by code path |

The workspace projects them into a shared vocabulary (`adapters.ts`), keeping
each store's ids and each store's distinctions. Nothing copies back; nothing
here becomes the truth.

## The files

| file | what it does |
| --- | --- |
| `object.ts` | the vocabulary: object types, relation types, origins, epistemic states, the `Stale` mark, `locked` fields, sanitizers, schema version |
| `store.ts` | event-sourced state: materialised objects plus the log that produced them. Undo, redo, checkpoints and time travel are all replay |
| `trace.ts` | bounded traversal: upstream, downstream, impact, tensions, gaps, and `elsewhere` (the same thing on another surface) |
| `adapters.ts` | projections from the ledger, the map, the engine and durable memory, plus `bridgeSurfaces` |
| `write.ts` | the write path: objects and connections made by hand, as operations on a `MindGraph` |
| `impact.ts` | what a change reached, split into what may be recomputed and what only the person may settle |
| `portable.ts` | the workspace as a document: export, import, and a structured query |

Everything in `lib/workspace` is pure: no clock, no network, no storage. The
glue that knows about both traversal and Postgres is `lib/mind/waiting.ts`, and
it is three functions long on purpose.

## Three separations that the whole design rests on

1. **Where it came from** (`provenance`, an array — grounds accumulate),
   **how well it is held** (`epistemic`), and **what kind of thing it is**
   (`type`) are three fields. Collapsing any two of them loses a distinction one
   of the stores exists to record.
2. **Locked fields are the person's answer.** An update from anybody but them
   leaves a locked field exactly as it is, silently. An object they made by hand
   arrives locked (`fromMindNode`, via provenance recorded on the `user`
   surface), so the next extraction cannot re-title or re-type their own words.
3. **Stale is not a judgement about truth.** A claim resting on an assumption
   they just corrected is not wrong; it is *unchecked*. `recompute` marks may be
   settled by a machine because re-running a computation is not an opinion;
   `review` marks may be cleared only by the person, and `settle()` refuses
   anything else.

## What a person can do with it now

**Write into it.** `POST /api/mind/node` adds an object; `POST /api/mind/edge`
connects two. Both go through `write.ts`, so:

- a tombstone outranks a create — something forgotten is not quietly recreated,
  and the re-assertion path is the only thing in the product that clears one;
- a duplicate is refused **with the id of what is already there**, so the
  interface can offer to connect to it instead;
- the same connection said twice reinforces one edge rather than making two;
- nothing made by hand is ever marked `private`, and everything made by hand is
  recorded as stated by them.

Refusals come back as `200` with a `refused` reason and a sentence for the
person. An HTTP error would throw away the only useful part.

**Keep it across sessions.** `projectMind` brings durable memory into the same
workspace as the session's map, and `bridgeSurfaces` links the two copies of one
thing by normalised label — the same key the store already uses for identity.
Nothing is merged: a merge would have to pick a winner, and the reason to keep
both is that the durable copy carries months of grounds while the session copy
carries where the person is right now. Trace reports the remembered copy under
`elsewhere`, with what *it* rests on attributed to it.

Privacy is not a preference here. Nodes marked `private` came from weighty Core
conversations and have never been allowed into Logos, whose map can be exported
as an image. `GET /api/mind?scope=logos` filters them server-side and drops the
edges that pointed at them; `projectMind({ excludePrivate: true })` is the second
wall; `exportWorkspace` refuses them outright and says how many it dropped.

**See what a change reached.** Correcting or challenging a node records marks on
what rested on it (`recordImpact`, persisted in `mind_stale`). The Memory page
lists them — "you changed something these rest on" — with one button, *Still
holds*. Trace shows the mark on a node when it has one. No standing moves, no
claim is re-decided, nothing is re-worded.

**Take it with them.** `GET /api/workspace` returns the whole thing as a
versioned document with provenance intact (`?download=1` for a file). Reading one
back namespaces every id, marks everything `imported`, keeps what the exporting
workspace said underneath that, refuses a file from a later schema version whole,
and counts anything it could not read rather than guessing. `query()` answers
structured questions — by type, standing, origin, surface, what is waiting, what
is attached to what — deterministically and without a relevance score.

## What is deliberately not built

- **No workspace event log in the database.** Undo, redo, checkpoints and time
  travel work over an in-memory log; they are not yet durable, so closing the tab
  ends the history. The durable stores keep their own histories (ledger
  revisions, Mind provenance), which is what a trace reads.
- **Keeping a map node does not carry its edges.** One object is kept at a time;
  connections are made on the Memory page. Bringing a subgraph across would have
  to decide what counts as its boundary, and guessing that badly is worse than
  asking.
- **No automatic recompute of Logos surfaces from a durable change.**
  `recompute()` takes the computation as an argument and nothing in the app
  passes the model engine to it yet. Engine-backed objects are marked
  `recompute`; re-deriving them is still a manual act.
- **No scores.** No confidence percentage, no reasoning grade, no streaks.
  `health()` returns counts and a list of what they are.

## Tests

| suite | what it covers |
| --- | --- |
| `test/workspace.test.mjs` | the vocabulary, the three separations, replay-based undo, the six trace questions, cycle termination, the ledger/map/engine adapters, bounded traversal at 4,000 objects |
| `test/workspace-live.test.mjs` | the write path and its refusals, durable projection and privacy, surface bridging, impact marks and who may clear them, export/import/query |
| `test/workspace-surface.test.mjs` | the wiring: auth on every route, Logos reading only the scoped feed, refusals surfaced rather than thrown, the export dropping private material, and no invented scores |
