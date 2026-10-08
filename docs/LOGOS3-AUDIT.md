# Logos 3 audit: choosing an interface, building models, sharing state

**Status.** Read-only audit. Nothing described as a fix below has been
implemented yet. The plan at the end is waiting for approval.

**How it was done.** Six subsystem audits ran over the code: turn routing,
the model engine, Live 3D, the Thinking Map, state and persistence, and the
workspace. A seventh pass cross-checked them against each other. Most claims
were checked by running the pure modules in throwaway scripts, not by reading
alone. The reported incident was the rocket nose-cone request ("Create an
interactive 3D model of a rocket nose cone with a base diameter of 20 cm and
a height of 40 cm…, sliders…, labelled dimensions…, base area, surface area
and volume").

Line numbers are as of commit 59a236d. The Conversation Style commit after it
moved a few lines in `components/LogosApp.tsx` and
`app/api/logos/chat/route.ts`.

## 1. What happened to the nose cone

A Logos 3 turn runs two requests side by side. The reply streams from
`/api/logos/chat`. The map pass, `/api/logos/map`, starts as soon as the
reply's headers arrive (`components/LogosApp.tsx:3338-3339`). The map pass
makes one LLM call. That call extracts map nodes, reads what the turn asked
for (`ask`) and may propose a model (`propose`). The engine then judges the
proposal in `buildProposal`.

1. **The proposal held no geometry.** The note the person saw comes from one
   branch only (`lib/model/propose.ts:258-273`). That branch is a proposal
   where no object is stated formally and none is "incomplete". So the
   extractor proposed scalars without a `definition`, or a kind the engine
   does not know, such as `cone` or `solid`. It proposed no surface at all.
   A surface written with the wrong key gets a different refusal. The exact
   JSON was not logged, so this is inferred from the note.
2. **Why the extractor wrote that.** The proposal rules give geometry one
   line: "a shape or a function → objects with expressions"
   (`lib/logos.ts:955`). They show no parametric example and never name the
   keys that carry an expression (`definition`, `defs.px/py/pz`, `over`).
   The engine silently drops keys it does not know, such as `expr` or
   `formula` (`lib/model/schema.ts:1065-1087`). And one rule says "a DERIVED
   quantity … never write one down" (`lib/logos.ts:1099`), which forbids
   the base area, surface area and volume the person asked for.
3. **A correct proposal would still have half-failed.** A cone written as a
   parametric surface builds, rotates and has sliders. That was tested: base
   (10,0,0), apex (0,0,40). But nothing in the engine evaluates a scalar
   formula (`lib/model/solve.ts:685-691`, `lib/model/compile.ts:1167-1184`,
   `lib/model/symbols.ts:398-422`). The readouts would compute nothing. The
   build report would still say "Built as a computational model"
   (`solve.ts:994-1004`).
4. **Live 3D was never reachable.** Its reader runs only when a Live 3D panel
   is already open (`LogosApp.tsx:2896, 2949-2960`), and the default layout
   has none. It also refuses any sentence with more than three words it
   does not know (`lib/objects/scene-chat.ts:38, 53`). The incident sentence
   had 23. "A cone with base diameter 20 cm…" is refused for the word
   "base". No LLM path can create a scene.
5. **The reply promised a model anyway.** The chat prompt says, without
   condition, that "A MODEL IS BEING BUILT beside this conversation, right
   now" (`lib/logos.ts:655, 665-672`). The reply runs in parallel with the
   build and is never told the result. `askBlock` in `lib/model/ask.ts:368`
   has no callers.
6. **The map kept what it had.** Nodes are returned whether or not the
   build worked (`app/api/logos/map/route.ts:271, 559, 573`). The
   quantities were typed as `value` nodes, which in Logos means "a personal
   value or criterion". The Mind atlas files them under Preference.

Earlier in this project the incident was marked as fixed (M3D-1). That was
a diagnosis only. No commit changes the incident's path. The fix is Phase A
below.

## 2. The six questions

**Conceptual nodes instead of the requested interface.** See section 1.
Three further causes:

- `sanitizeAsk` knows 16 verbs, and "create", "build", "make" and "generate"
  are not among them. Such a turn produces no ask, so there is no second
  pass and no failure note (`lib/model/ask.ts:186-187`).
- `simulate` and `represent` never count as wanting a build (`ask.ts:297`).
- There is no 3D or scene artifact. An unknown artifact is coerced to
  `model` (`ask.ts:112-124, 189-195`).

**Opening an interface from natural language.** Only Thinking Map lenses can
be asked for in chat (`lib/view-request.ts:20-30`). These phrases do
nothing: they go to the reply, which is told never to mention a
visualization.

- "open the model"
- "show it in 3D"
- "open Live 3D"
- "show the map and the model side by side"
- "show both"

Worse, "close the map" and "remove the 3D model" are read as map-node edits
(`lib/map-edit.ts:217, 225, 244`). They can delete a node labelled
"Interactive 3D model".

A built model opens on its own only when the layout is a single map panel,
and then it replaces the map (`LogosApp.tsx:3552-3569`). The trigger is a
document count, not the server's verdict. So the 7th model, at
`DOC_CAP` 6, opens nothing. There is also no loading state: the only
indicator is hidden in the workspace (`components/workspace/workspace.css:200`).

**Combined views.** The only map-plus-model arrangement pins the `graph`
lens. A map holding a model never offers that lens, so the map panel falls
back to `plot` and shows the model twice (`lib/workspace/surfaces.ts:243-245`,
`lib/logos-layout.ts:238-242`). No arrangement includes Live 3D. "Side by
side" always raises the compare chip, which pairs the model with its own
level-set view.

**Shared state.** Three stores sit inside one session object and persist
together as `conversations.map`:

- the map: `nodes` and `edges`
- the model documents: `models`, where parameters already have one
  canonical copy and sliders propagate end to end
- Live 3D scenes: `objects`

Nothing links them. Map nodes can hold numbers only as frozen label text.
Scene dimensions are plain numbers with no parameters, and there are no
imports between `lib/objects/scene*` and `lib/model`. So "the cone" in a
model and "the cone" in Live 3D would be two unrelated copies.

**They can share state without duplication**, by reference rather than by
copy:

- A Live 3D part binds its dimensions to model parameters. A resolver
  evaluates the bindings each time the scene is read, so the model stays the
  only source of truth.
- A map node holds a validated reference to a model quantity (document and
  id) and shows its live value.
- Formula readouts become engine-computed values, so both of the above can
  point at them.

All three reuse channels that already exist:

- `meta.value` bindings in the symbol table
- the focus identity scheme `{kind, doc, id}`
- the objects substrate's re-check on load

**Preserving what exists.** The plan below adds no parallel structure. Every
change goes through an existing seam: the tiling primitives, the
arrangements registry, `unpack()` expanders, the solver registry, the object
ops and the sanitizers.

## 3. Other defects found on the way

- **Focus is broken in Logos 3.** The workspace selection and a node side
  thread share the key `focus` (`LogosApp.tsx:3299-3302`,
  `app/api/logos/chat/route.ts:221, 323-335`). Any selection turns the next
  main turn into a one-node side-thread prompt: a map card, or a touched
  slider. That skips memory and Mind recall, the building brief and the
  value of what was selected. `focusBlock` has never run since it was added
  in f54c752.
- **Proposals can forge computed values.** A proposed scalar can carry
  `meta {role:'solution', value:99999}` and provenance `computation`. It
  then prints as "volume = 99999 cm³ — solved" (`schema.ts:1698-1723`,
  `propose.ts:147-162`). This must be closed before the engine writes its
  own readouts.
- **Shared sessions lose edits.** On a 409 the client adopts the server map
  wholesale, so a collaborator's slider moves and scene steps vanish
  (`components/share/useSharedSession.ts:164-171`). A client can even 409
  against its own write and revert its own drag (`lib/share/sync.ts:198-205`).
- **Rooms lose edits.** Rooms replace models and scenes with each
  extraction's map, and have no event kinds for model or scene edits
  (`lib/collab.ts:348-371`).
- **History.**
  - Drags on different controls merge into one revision
    (`lib/model/docs.ts:968`).
  - Trace's restore buttons point at the wrong revision after the cap of 8
    (`docs.ts:119-123`).
  - A 7th model silently evicts the oldest (`DOC_CAP`).
  - The 8-object cap has no delete path in the UI.
  - Scene steps with arguments over 400 characters are cut on reload.
- **Viewers can drag sliders.** They get a 403, and their screen stops
  following the owner's (`LogosApp.tsx:3762-3780`).
- **Live 3D bugs.**
  - A revolved nose profile that reaches zero radius builds invisibly and
    reports "surface area NaN" (`lib/objects/scene-geometry.ts:250, 491-498`).
  - In learning mode, the Live 3D panel shows the volumes and areas the
    conversation withholds.
- **Lost or erased results.**
  - A model built for one turn is dropped if the next turn is sent before it
    lands (`LogosApp.tsx:2179-2208`).
  - A refusal note set at the end of the stream is erased when the map lands
    without a build.
- **The product promises what the default setup cannot do.**
  - The Logos 3 intro and the tour promise "a shape in Live 3D" built beside
    you (`LogosApp.tsx:4157-4161`, `lib/tour.ts:53`).
  - The homepage stage's wing line is drawn by the reader's preview, which
    ignores unread words. Typed into the product, it builds nothing ("not
    read — wing").

## 4. The plan

Each phase ships and is tested on its own. A comes first: it is the incident.

### Phase A: an honest construction

1. **Formula readouts in the engine.**
   - One expander in `unpack()` evaluates scalar `definition`s over the
     parameters, in dependency order. It writes into the channels fits and
     solves already use: `meta.value`, provenance `computation` and fidelity
     `model-derived`.
   - A small FORMULA solver lets the router and the build report count them.
   - Objects that compute nothing are named in the report.
   - The forged-value hole is closed by stripping proposal-written
     `meta.role`, `meta.value` and claimed computation provenance.
2. **Proposal rules.**
   - A worked parametric example: a surface with `px/py/pz` over `u,v`, plus
     scalar readouts with definitions.
   - The derived-quantity rule gets a carve-out for formulas.
   - A warning that kind `volume` is a z = f(x, y) sheet.
   - The accepted keys are listed.
   - Dropped keys go back to the second pass so it can correct them.
   - "create", "build", "make" and "generate" are read as construct.
3. **A reply that does not overclaim.**
   - Conditional wording replaces "is being built".
   - When the build settles, its outcome is attached to that turn and saved
     with it: built and opened, or failed with a plain reason and Try again.
   - "Building the model…" shows while the build runs.
4. **Smaller engine fixes.**
   - A parametric surface no longer flattens to 2D beside an equations block.
   - Level sets, cross-section and table are offered only where they mean
     something.
   - Dimension lines are labelled: a curve plus a definition gives a 3D
     label that moves with the sliders.
   - Axis units come from `model.units`.

### Phase B: interfaces from what the person says

1. **A deterministic interface reader** sits beside `view-request.ts` and
   runs before map commands. It handles:
   - open, show or close the model, Live 3D or 3D, the map, or parameters
   - "both", "side by side", "X beside Y"

   It drives the existing tiling primitives (`addPanel`, `pairLayout`,
   `maximize`). View verbs never reach node edits.
2. **The ask learns a `scene` artifact** instead of coercing to `model`. The
   surface decided for a turn travels with the request.
3. **Open on the server's verdict** (`build.ok` and `id`), not on a document
   count.
   - A lone map gets the model beside it.
   - A layout with several panels gets a one-click "Open the model" chip.
   - The simulation fallback is fixed.
4. **Live 3D becomes reachable.**
   - A 3D request opens a Live 3D panel.
   - The reader treats framing words (interactive, 3D, model, view, sliders,
     labelled) as notes rather than blockers.
   - Unknown words before a shape noun become the part's name: "rocket nose
     cone" gives a cone named that.
   - The NaN profile bug is fixed.

### Phase C: combined views and shared state, without copies

1. **Arrangements.**
   - Map plus model, with the graph lens available beside a model.
   - Map plus Live 3D, and model plus Live 3D.
   - "Show both" applies them.
2. **Model to Live 3D.**
   - A part's dimensions can be bound to parameters (`r = d/2`, `h = h`).
     A pure resolver reads them from the model each time the scene is read.
   - A slider then moves the 3D part.
   - Editing a bound dimension edits the parameter. The model stays the only
     writer.
3. **Map to model.**
   - Nodes get a validated `{doc, id}` reference and show the live value.
   - The extractor is shown the models and told to reference quantities, not
     restate them.
   - References are carried forward across re-extraction.
   - Selecting a bound node focuses the parameter.
4. **The focus fix.** The selection is sent under its own key, so it reaches
   the reply as "what they have selected".

### Phase D: integrity (recommended, separable)

- Collaboration:
  - a per-part merge instead of taking the server map wholesale
  - advance the version on the server's acknowledgement
  - room events for model and scene edits
- History:
  - coalesce drags per control
  - re-index the log after the cap
  - say when a model is evicted
  - a way to delete an object
- Read-only model panels for viewers.
- Learning mode respected in the Live 3D panel.
- The homepage wing line made to build in the product.

### Testing

Each phase gets regression tests on the pure pipeline. Phase A includes the
incident sentence end to end, with a recorded extractor response. Then a
browser check of the map, the model and Live 3D side by side, on desktop and
phone. Nothing is called done until it has run.

## 5. Decisions needed

1. **Who owns a parametric solid like the nose cone.**
   - **Recommended:** the model engine. It already has sliders, live
     propagation, readouts (after A1) and 3D rotation. Live 3D is an optional
     view bound to the model's parameters.
   - The alternative is to add parameters to Live 3D, which would build a
     second parameter system.
2. **A build from a lone map.** Replace the map with the model, as it does
   today, or open it beside the map, as the tour promises. **Recommended:**
   beside.
3. **Can the language model propose Live 3D operations?** Today a scene
   description is never read by a language model (`docs/LOGOS3-LIVE-3D.md`).
   **Recommended:** keep the deterministic reader first. When it cannot
   read a request, let the build pass propose scene operations, checked by
   `SCENE_OPS` the way the model engine checks proposals ("the LLM proposes,
   the engine seals").
4. **When to do Phase D:** now, or after A to C.
