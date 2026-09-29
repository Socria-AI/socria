# Models in the live product

Before this pass, a model was something Logos produced and then froze. The
general substrate existed and a conversation could not reach it: an LLM authored a
picture, the renderer drew it, and "delete the second spring" could only hide
pixels. Two changes fix that — an **on-ramp with a trust boundary**, and **models
as documents with identity**.

## The trust boundary

`VizScene.built` means *the engine produced and verified this state*. Everything
downstream trusts it: the router runs solvers on it, `ModelView` draws it as
computed, `modelStateFrom` tells the conversation its numbers are results.

So `sanitizeViz` now takes a trust mode:

| mode | what it does with `built` |
| --- | --- |
| `proposal` (the default) | **strips it.** A model's own output may carry `propose` instead |
| `stored` | **re-validates it** — `sanitizeModel` + the router — and drops it if it no longer computes |

The default is the suspicious one, because that is the call site that existed
first. The only thing that can produce a built model is `buildProposal`, and it
runs **on the server, in `/api/logos/map`**.

That is also why the stamp needs no cryptography: a model claiming to be built has
to still *be* computable, which is exactly what the claim says.

## The on-ramp

```
extractor proposes  →  sanitizeMap (proposal mode keeps `propose`, strips `built`)
                    →  buildProposal:  sanitizeModel
                                       expand (mechanisms become objects)
                                       route      — does a real solver run it?
                                       missingStructure — what is absent, by name
                                       capabilityOf     — what may honestly be claimed
                    →  a document, or a refusal that says what is missing
```

`buildProposal` refuses in three cases, and each refusal is the useful outcome:

- **nothing computable** — "I can hold the structure, but nothing computes yet:
  the mechanism needs a mass for the second body."
- **a value the model cannot evaluate** — `mass: "nope"` assembles perfectly and
  compiles to nothing. The router now checks the **assembled system**, not just the
  assembly, so this is caught and named as *a mass*, not as "a readable expression
  for dv_m1/dt".
- **a specification with no method** — the candidates and their assumptions come
  back and the person chooses. The specification is the research.

Everything proposed is stamped `origin: 'inference'` — "proposed from the
conversation and validated by the engine, not chosen by you" — because a parameter
Socria chose and one the person chose must never read the same.

## Models as documents

```ts
ModelDoc { id, title, revisions: Model[], at, branchedFrom?, report?, log[] }
ModelWorkspace { docs, active }        // lives in map.models
```

`spring_system` stays `spring_system` at revision 3. Not `generated-picture-3`.

| verb | what happens |
| --- | --- |
| create | `openFromProposal` — only from a built model |
| set | a revision, with `lastChange.affected` driving recomputation |
| remove | the **declaration** loses the part; the governing system is reassembled |
| replace | a damper becomes a spring — a dissipative term becomes a restoring one |
| add | a body, a spring or a damper, between things that exist |
| undo / redo | the cursor moves; an edit after an undo discards the future that didn't happen |
| reset / restore | back to built, or to a named revision — **as a new revision**, so the way back is kept |
| duplicate / branch | a copy under its own id, lineage recorded, original untouched |
| delete | the model goes |
| use | show another document in this workspace |

Removing the damper from a one-mass oscillator changes `rhs.v_m1` so the `c` term
is gone, makes the model declare energy an invariant, and the energy then stops
decaying. That is a physics change, and it could not follow from hiding a shape.

**Why `map.models`.** The map is already the session's canonical structured state:
persisted to `conversations.map`, restored with the session, synchronised to a
collaborator as one event. A second store would need its own column, sync, restore
path and conflict rules — four places for the two halves of one workspace to drift.

**Ids are resolved against the expanded model.** The document stores the
declaration; the person clicked `mech__c1`, which exists only after expansion. The
target is looked up in the expanded model and the edit lands on the declaration.

## The edit grammar

The existing ops fence, extended. `MODEL_OPS` (`remove`, `add`, `replace`,
`duplicate`, `branch`, `undo`, `redo`, `delete`, `use`) are told apart from view
ops by `isModelOp`, and `LogosApp` sends them to the document while view ops go to
the surface.

They are **gated on `state.edits`** — present only when the surface is showing a
document. A working surface silently ignoring "delete the damper" would leave the
reply describing a change that never happened.

The prompt block says it plainly: *"THIS IS A MODEL, NOT A PICTURE. It is
spring_system at revision 2 of 3… Editing it keeps that id."*

## Loop, as built

```
intent → proposal → sanitize → validate → missing → capability → route → build
       → document (id, revision)
       → represent (mechanism + panels from one run)
       → chat reads state, capability, missing, revision
       → edit verb → new revision → reassemble → recompute → every view follows
       → undo / branch / compare
```

## What is still not true

- **The extractor has to choose to propose.** Prompt instruction, not enforcement:
  a mechanism request can still come back as a hand-authored `diagram`. Nothing
  measures how often it does.
- **`add` only reaches mechanisms.** Adding a state to a system, a column to a
  dataset or a term to a specification is not in the grammar.
- **Editing a specification is not there.** You cannot say "add x2 as a control"
  and have the fit re-run; only mechanisms and parameters are editable.
- **Revisions are whole models, capped at 8.** A document with large data blocks
  will feel that; proposals cap columns at 2,000 rows for the same reason.
- **Undo is per document, not per session.** Undoing a *map* change is still not a
  thing.
- **No comparison UI.** `compareRevisions` and `sinceBuilt` are computed and
  nothing renders them side by side yet.

## Tests

`test/logos-models.test.mjs` — 152 assertions: the trust boundary from four
directions (a model writing `built`, through the map, through storage, and a
forged document whose revisions do not compute), the on-ramp's builds and all
three refusals, identity surviving an edit, the motion genuinely differing after
one, removal changing the equations and the invariant, the swap changing the kind
of term, undo/redo/reset/branch/delete, round-tripping through storage, the verbs
parsed from a reply and gated on a document, and the live wiring read from source.
