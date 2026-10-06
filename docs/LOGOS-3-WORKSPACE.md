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

- **`lib/workspace/tiling.ts`** — a layout is a tree of splits and panels. Pure operations: split, close, replace, configure, resize, maximise/restore, move (edge or swap), add. Presets build a layout *for what the session holds*. `sanitizeLayout` reads storage defensively.
- **`components/workspace/Workspace.tsx`** — draws a layout and writes only the layout. Hairline dividers (pointer and keyboard), restrained headers whose controls appear on hover/focus, drag-to-move with edge zones, double-click or ⤢ to maximise, Esc to restore, `+ View`, presets, one suggestion line. Narrow screens become tabs.
- **`LogosApp`** renders the same named pieces (`convoHead`, `convoBody`, `mapBody`) either in Logos 2's columns or as Logos 3's panels. A model with `workspace: true` (`lib/socria-prompt.ts`) gets the workspace.

## 7. The panel contract (`lib/workspace/surfaces.ts`)

Each surface declares what it represents, what selections it **emits** and **responds to**, whether it is **duplicable**, whether it **can be stale**, and whether it is **heavy**. `suggestViews` reads the state and offers only valid representations, each with a reason: a model offers its registry's views; an argument offers the map's lenses; nobody is offered a model panel for a question with no model.

## 8. Shared selection and context

- A model's **selected object** stays canonical (on the model).
- The workspace **focus** (`lib/workspace/focus.ts`) is per person and ephemeral: a parameter, a free input, a model object or a map idea. Selecting it anywhere makes it what the inspector describes and what the conversation means by "this".
- Each turn carries `describeFocus(focus, map)` — built from canonical state, never pixels — and the chat route adds it as a block (`focusBlock`).

## 9. Persistence, history, Think Together

- The **layout** persists per browser (`localStorage`, `socria.logos3.workspace.v1`), never in the session and never into a shared room. Two people thinking together share the model and keep their own layouts and focus.
- **Focus** is never persisted.
- **Layout changes never touch model history.** Model changes from any panel go through one write path — `adopt` into the document, coalesced per drag — so they appear in Trace and can be undone.

## 10. The vertical slice that shipped

Tiled workspace with resize, split, close, replace, move, maximise/restore, reset; six presets (Think, Model, Research, Compare, Deep work, Brainstorm); `+ View` ranked by state; Conversation, Thinking Map, Model (with pinned representations), Parameters, Inspector and Trace panels over one session; shared focus into the conversation; layout persistence; a suggestion line Socria may offer and the person accepts or dismisses.

### Acceptance (Chromium, real engine, scripted model calls)

A saddle built from the conversation; Model preset (model, conversation, parameters, inspector). Moving `a` to −1.2 in Parameters moved the model's own slider, the inspector, the conversation's context ("a parameter of A saddle, now −1.2 … what depends on it: z, ∂z/∂x") and the Trace ("a to −1.2"). Maximise, restore, split with a linked Level sets view, close and reopen the conversation: `a` stayed −1.2. Reload: the layout and the value returned. A conceptual decision: `+ View` offered the map's lenses, the inspector and the conversation — no model, parameters or trace.

## Next

Sources and Evidence as their own surfaces; a Compare/Differences panel over `compareRevisions`; branch selection; per-panel cameras that survive remounts; suggestions from the conversation's own ask (`lib/model/ask.ts`) rather than keywords.
