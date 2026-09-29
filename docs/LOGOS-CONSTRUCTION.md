# Talking about a model, and asking for one

> Logos 2 must tell "talk with me about a model" apart from "build the model",
> and when it is the second and the capability exists, the object gets made.

## The failure

The request was:

> Create a simple economic model showing the relationship between years of
> education and wages. Use education as the independent variable and wages as
> the dependent variable. Represent the model visually and make its variables
> manipulable.

What came back was a paragraph explaining what such a model would be, and one
node on the Thinking Map: **"relationship between education and wages"**.
Nothing was built. Nothing anywhere recorded that anything had failed to be
built.

The important part is the last sentence. A quiet failure is worse than a loud
one, and this one was silent by construction: the map extractor always produces
something plausible, so a request for an artifact that never became an artifact
looks, from the outside, exactly like a request to think out loud.

## Why it happened — three causes, all real

### 1. Nothing read the action

A turn carried a `context` — deciding, writing, learning, math, simulating —
which answers *what kind of work is going on*. Nothing anywhere answered *what
they asked to be done*. Those are different questions:

| | |
|---|---|
| DOMAIN | economics |
| TOPIC | education and wages |
| ACTION | **construct a model** ← nothing recorded this |

So `"Why might education relate to wages?"` and `"Create a model with wage as
the dependent variable"` were indistinguishable downstream. Both got the same
treatment, and the treatment was the one that fits the first.

### 2. The on-ramp required computability

`buildProposal` (lib/model/propose.ts) admitted a proposal only if at least one
object a solver would **run today**:

```ts
if (!solvers.length) return { ok: false, refusal: … }
```

That quietly made *computability* the definition of a model, and it is not one.
`Wage = β₀ + β₁·Education + u` with no data has nothing to run — the estimator
correctly reports the observations as missing — so a fully specified model was
**literally unbuildable**. The same refusal met a spring–mass system with a
stiffness still to be chosen, a gravitating pair with no initial velocities, and
every causal structure.

`capabilityOf` had said so all along: `structural` and `mathematical` are two of
its five levels, and the on-ramp was only letting models on at the third.

### 3. A specification could not exist without data

`EstimationDecl.data` was a required field. There was no way to *express* an
unfitted specification, so even a correct extractor had nowhere to put one.

And the map prompt made it worse by gating the whole idea on subject matter:

> a fitted specification — a regression, **where the person has named the
> method**

No method was named, so the extractor was explicitly told not to propose.

## What changed

### The action is a first-class part of the turn — `lib/model/ask.ts`

`TurnAsk` carries `action`, `artifact`, `topic`, `domain`, the `formal`
structure the person named, and the `operations` they want. It rides in
`ThinkingMap.ask`, produced by the same extractor call that produces the map,
sanitised like everything else.

It is a **proposal, and it cannot make anything true.** Writing
`action: "construct"` does not build a model; it says what to attempt.
`settle(ask, result)` reports what actually came of it, and the result always
wins.

`sanitizeAsk` returns `null` rather than a default for an unreadable ask — a
default of `discuss` would silently turn every unparsed construction request
back into conversation, which is the original bug wearing a new hat.

### A model may be built below `computational`

The bar is now *something computes* **or** *something is stated formally*:

```ts
if (!solvers.length && !formal.length) return { ok: false, refusal: … }
```

`statedFormally` (lib/model/solve.ts) is the one list — an object carrying a
`definition`, `defs`, `system`, `mechanism`, `estimation` or `gravity`. It was
written out twice for an hour and the two copies immediately disagreed: the
on-ramp counted specifications and the capability ladder did not, so a wage
equation built and then graded itself `structural`. One list, exported, used by
both.

Prose is still refused. A bag of labelled annotations states nothing formally
and computes nothing, which is what keeps `built` meaning something.

### A specification exists before it is fitted

`EstimationDecl.data` is optional. Absent means **specified, not estimated** —
the estimator reports the observations as the missing structure, and nothing is
allowed to invent them.

`expandEstimation` unpacks the declaration into first-class objects — the
outcome, each regressor, each coefficient, the intercept, the error term — the
same way `expand` does for a mechanism and `expandGravity` for gravitating
bodies. That pattern is now the rule rather than three special cases, and
`unpack` (lib/model/unpack.ts) is the one entry point every caller uses; before
it, which declarations were unpacked depended on which function had touched the
model last.

With no data, a coefficient has **no value** and its provenance says it is a
symbol. It never says `inference`: nobody guessed it, so nobody should be
invited to confirm it.

### A specification relates; it does not cause

The relation from a regressor to the outcome is `correlates-with`, with the
reason written on the edge. `causes` and `influences` are in
`CAUSAL_RELATIONS`, which exists precisely because they are claims about the
world that no amount of algebra establishes. Both prompts say so.

### Failure is classified, not swallowed

`settle` names which kind:

| | what it means | whose move |
|---|---|---|
| `intent-routing` | asked to build, nothing was even proposed | **ours** — a routing fault |
| `missing-primitive` | nothing here models that kind of thing | ours |
| `missing-backend` | understood, nothing computes it yet | ours |
| `missing-structure` | a part has not been named | theirs |
| `missing-data` | the structure is complete; the numbers are not | theirs |
| `invalid-model` | what came back was not a model | ours |
| `unsupported-representation` | built, but nothing draws it | ours |

The map route settles the ask against the build and returns the verdict, so a
turn that asked for a model and got none now says which of those it was.

### Built is not the same as built what was asked for

`unanswered(ask, model)` compares the names the person used against the names
the model carries, and reports what is missing. It does not block the build — a
model missing one named variable is still a model — it is what the surface says.

## The path for the original request

```
"Create a simple economic model … education as the independent variable …"
  │
  ├─ /api/logos/chat ─── streams prose under a standing rule:
  │                      when they ask you to MAKE something, something gets
  │                      made — do not describe the artifact, and do not claim
  │                      it exists either (LOGOS_CHAT_PROMPT)
  │
  └─ /api/logos/map ──── buildMapPrompt: "WHAT ARE THEY ASKING YOU TO DO?"
        │
        ├─ ask { action: construct, artifact: model,
        │        formal: { outcome: wage, inputs: [education] } }
        │        → sanitizeAsk (lib/model/ask.ts)
        │
        └─ viz.propose { objects: [{ kind: specification,
                                     estimation: { y: wage, x: [education] } }] }
             │
             └─ openFromProposal (docs.ts) → buildProposal (propose.ts)
                  ├─ sanitizeModel        schema.ts
                  ├─ unpack               unpack.ts → expandEstimation
                  │                       → wage, education, β₀, β₁, u as objects
                  ├─ runnable()           [] — nothing computes
                  ├─ stated()             [the specification] — so it builds
                  ├─ missingStructure()   "observations — wage, education …"
                  ├─ capabilityOf()       mathematical
                  └─ route()              ols, status: incomplete
             │
             └─ settle(ask, result) → built, no failure
                  unanswered(ask, model) → []
```

The model lands in `map.models` as a document with a stable id, revisions, undo
and redo, and `modelStateFrom` hands the conversation a status block that says
in so many words: *specified but not estimated; its coefficients are symbols;
there is no fitted line, no R², no standard error and no p-value.*

## Follow-ups

| turn | what happens |
|---|---|
| "Add years of work experience." | `add variable experience` → the specification gains a term, **same model id** |
| "Remove education." | the regressor leaves the specification; the equation is one term shorter |
| "Undo that." | the document steps back a revision |
| "What do you need to estimate this?" | observations — named, never invented |
| "Now estimate β₁." | with no data: missing-data, named. With data and a method: real OLS |
| "Delete the model." | the document goes |

Protected, because they are not parts: the outcome, the error term, a
coefficient on its own, and the last remaining regressor. Each refusal says what
to do instead.

## What this is not

- **A Thinking Map node is not a formal model.** The map represents the
  person's thinking; a model represents the system they are constructing. Both
  still update, and they are not interchangeable.
- **A chat explanation is not a requested artifact.**
- **A drawn line is not an estimated regression.** Without data there is no
  fitted line, and the representation shows the specification rather than a
  scatterplot of numbers nobody supplied.

## Outside economics

None of this knows what a wage is. The same path builds a spring–mass system
with an unchosen stiffness (`mechanism`), two bodies under gravity (`gravity`),
`z = x² − y²` (an expression), and a system of differential equations
(`system`) — and grades each one honestly, which is why a stated model and a
computable one do not come back carrying the same claim.

## Where it is covered

`test/model-construction.test.mjs` — 123 assertions in twelve sections: the
action read apart from the subject, a specification existing unfitted, the
on-ramp building it, prose still refused, the same architecture in mechanics and
gravity, failure classification, `unanswered`, the full edit sequence, real OLS
once data exists, the map carrying the ask, both prompts, and the status the
conversation is given.
