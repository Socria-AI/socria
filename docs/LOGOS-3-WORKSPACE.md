# Logos 3 — the composable workspace

*"My thinking environment reconfigures around what I am trying to understand."*

One canonical intellectual state, many representations, many arrangements, one human in control.

## 1. How the Logos workspace was structured

`components/LogosApp.tsx` (≈3,700 lines) rendered a fixed CSS grid: the rail, the conversation column, the Thinking Map column and an optional draft column. The map column was `ThinkingMap`, which itself switches between lenses (graph, structure, tensions, evidence, solve, plot, board, compare); the **plot lens** is where a built model is drawn, by `ModelView`, the one renderer for every model. On a phone a switcher shows one column at a time.

## 2. Where canonical state lives

All of it is in the **session** (`lib/logos-sessions.ts`) that `LogosApp` holds and persists:

- `messages` — the conversation;
- `map` — the Thinking Map (nodes, edges, context, removed), plus a picture (`viz`) when there is one;
- `map.models` — the **model workspace** (`lib/model/docs.ts`): model documents, each with revisions, a one-line change log, undo/redo, restore and branches. A model's **selected object** and **open view** are canonical — they live on the model, so every view of it agrees on what "this" is.

The engine re-derives everything drawn (`unpack`, `buildSpec`, `viewdata`) from the model on render; nothing drawn is stored.

## 3. Surfaces that became panels

| Panel | What it is | Reused |
|---|---|---|
| Conversation | the conversation column, unchanged | the same JSX |
| Thinking Map | the map, any lens | `ThinkingMap` |
| Model | one model, or one pinned representation of it | `ModelView`, `SceneSurface`, `MathViz` |
| Parameters | the model's controls and free inputs | new; writes through the same path as the model's own sliders |
| Inspector | what the selected thing is, how it was computed | new; `lib/model/inspect.ts` |
| Trace | the model's history of substance, undoable | new; `lib/model/docs.ts` undo / redo / restore |

## 4. What blocked composability

- The layout was hard-coded columns in one component.
- `ModelView` read the open view only from the model, so two panels could not show one model two ways.
- Map selection lived inside `ThinkingMap`; nothing outside it knew which idea was selected.
- The model-edit and "ask about this" handlers were inline props on `ThinkingMap`, so no other surface could share them.

## 5. What is reused

The document layer (revisions, coalesced adoption, undo), the representation registry (`lib/model/views.ts`), the inspector, the renderer, the map, the conversation and its send path, unchanged.

## 6. The workspace architecture

- **`lib/workspace/tiling.ts`** — a layout is a tree of splits and panels. Pure operations: split (at any share), close, replace, configure, resize, maximise/restore, move (edge or swap), add. `singleLayout` is where Logos 3 rests; `dominantPanel` is the panel with the most room. `sanitizeLayout` reads storage defensively.
- **`lib/workspace/surfaces.ts`** — `suggestViews` (representations worth opening) and `arrangementsFor` (arrangements worth making: compare, model with its controls, map beside the model, map beside its evidence, one view), each offered only when the state gives it meaning.
- **`components/workspace/Workspace.tsx`** — draws a layout and writes only the layout. A single panel has no chrome. Among several, hairline dividers (pointer and keyboard) and a corner chip — name, ⤢, × — that shows on hover; drag the name to move, double-click or ⤢ to maximise, Esc to restore. `+ View` in the header holds the views and the arrangements. Slots for the host's header, a dock beneath the stage and a contextual card over the panel in focus. Narrow screens show one surface; tabs appear only when there are several.
- **`LogosApp`** renders the same named pieces (`convoHead`, `convoBody`, `mapBody`) either in Logos 2's columns or as Logos 3's panels. A model with `workspace: true` (`lib/socria-prompt.ts`) gets the workspace.

## 7. The panel contract (`lib/workspace/surfaces.ts`)

Each surface declares what it represents, what selections it **emits** and **responds to**, whether it is **duplicable**, whether it **can be stale**, and whether it is **heavy**. `suggestViews` reads the state and offers only valid representations, each with a reason: a model offers its registry's views; an argument offers the map's lenses; nobody is offered a model panel for a question with no model.

## 8. Shared selection and context

- A model's **selected object** stays canonical (on the model).
- The workspace **focus** (`lib/workspace/focus.ts`) is per person and ephemeral: a parameter, a free input, a model object or a map idea. Selecting it anywhere makes it what the inspector describes and what the conversation means by "this".
- Each turn carries `describeFocus(focus, map)` — built from canonical state, never pixels — and the chat route adds it as a block (`focusBlock`).

## 9. Persistence, history, Think Together

- The **layout** persists per browser (`localStorage`, `socria.logos3.workspace.v2`), never in the session and never into a shared room. Two people thinking together share the model and keep their own layouts and focus.
- **Focus** is never persisted.
- **Layout changes never touch model history.** Model changes from any panel go through one write path — `adopt` into the document, coalesced per drag — so they appear in Trace and can be undone.

## 10. The vertical slice that shipped

Tiled workspace with resize, split, close, replace, move, maximise/restore, reset; six presets (Think, Model, Research, Compare, Deep work, Brainstorm); `+ View` ranked by state; Conversation, Thinking Map, Model (with pinned representations), Parameters, Inspector and Trace panels over one session; shared focus into the conversation; layout persistence; a suggestion line Socria may offer and the person accepts or dismisses.

### Acceptance (Chromium, real engine, scripted model calls)

A saddle built from the conversation; Model preset (model, conversation, parameters, inspector). Moving `a` to −1.2 in Parameters moved the model's own slider, the inspector, the conversation's context ("a parameter of A saddle, now −1.2 … what depends on it: z, ∂z/∂x") and the Trace ("a to −1.2"). Maximise, restore, split with a linked Level sets view, close and reopen the conversation: `a` stayed −1.2. Reload: the layout and the value returned. A conceptual decision: `+ View` offered the map's lenses, the inspector and the conversation — no model, parameters or trace.

## 11. Simple at rest, powerful on demand

The first slice exposed the architecture itself: six permanent modes, a header on every panel, a large conversation column, a menu in every corner. A new person did not know where to look. The architecture stayed; its expression changed.

**One thing in focus. Anything available when needed.**

| At rest | On demand |
|---|---|
| One surface: the Thinking Map, or the model once there is one | `+ View` opens a representation beside it, or an arrangement |
| The conversation is a composer beneath the stage, with Socria's latest reply as a few lines | "Conversation" opens the history above the composer; it can also be a panel |
| No panel chrome | Several panels: a corner chip on hover (name, maximise, close) |
| No inspector | Selecting a part, parameter or input brings a card describing it; "Keep open" makes it a panel |
| No modes | Arrangements — compare, model with its controls, map beside the model, map beside its evidence, one view — offered only when they mean something |
| The model's name and its view switcher | "Understand" opens how it was computed, what it can't show, and the structural views |

Rules that keep it that way:

- The one surface follows the work **only while it is one surface**: a map that builds its first model becomes the model; a line with no model shows its map. An arrangement of several panels is the person's and never moves.
- A surface that serves another (parameters, inspector, trace, conversation) opens at a third of the room, so the thing being thought about keeps it.
- Nothing is said twice in Logos 3: the map's lens bar and legend, the model's corner labels and transparency caption, and the model's own sliders while a Parameters panel is open, are hidden there. Logos 2 is unchanged.
- Socria's suggestion is one quiet line, only when the conversation asks for a different arrangement ("compare", "evidence"), applied only if accepted.

Verified in Chromium against the real engine with scripted model calls: fresh line (map + composer only), a decision drawn, the saddle built (the single surface switches to the model), Model with its controls, parameter `a` to −1.2 with the inspector card and the conversation focus, Keep open, close, One view, reload; a phone at 390px with no horizontal scroll; Logos 2 unchanged.

## Next

Sources and Evidence as their own surfaces; a Compare/Differences panel over `compareRevisions`; branch selection; per-panel cameras that survive remounts; suggestions from the conversation's own ask (`lib/model/ask.ts`) rather than keywords.
