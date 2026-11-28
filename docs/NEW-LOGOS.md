# New Logos — foundational architecture

`/new-logos` is an experimental, objective-driven rebuild, developed on `dev` as the eventual foundation of the next
major version. The address is an internal development identifier. **It is not a product name, and nothing under it is
branded.**

The organising idea: people use an assistant to accomplish an objective, investigate a question or develop an
understanding. Conversation is how they get there, not why they came. So the work is organised as **nodes**:

- Objectives are the organising structure.
- Conversations are the medium.
- Artifacts externalise reasoning.
- Knowledge keeps what was understood.
- Questions drive further inquiry.
- Decisions keep human judgement.

## The presentation rule: completely unbranded

| Area | What it does |
|---|---|
| Page metadata | `app/new-logos/layout.tsx` replaces every branded field the site-wide layout sets: the title ("Workspace"), the application name, the preview cards (no images) and the icons (a neutral grey nine-square mark). It also adds `noindex`. |
| Favicon | The site's root `favicon.ico` is a root-only file convention, and Next.js emits it on every route. Under `/new-logos`, `components/new-logos/NeutralIcon.tsx` repoints every icon link to the neutral mark. It changes an attribute and never removes a node, so the head React manages stays intact. Until scripts run, a browser may briefly see the inherited link. |
| Not found and errors | `app/new-logos/not-found.tsx`, a catch-all `app/new-logos/[...rest]` and `app/new-logos/error.tsx` keep 404s and failures neutral. The error boundary keeps the site's stale-deployment reload (`lib/stale-deploy.ts`). |
| Styling | `app/new-logos/nl.css` defines everything itself: system typefaces, a monochrome palette with a dark variant, thin borders, one spacing scale. It covers the site-wide background and hides the environment badge. No class, token or component from the existing design system is used. |
| Sign-in and sign-up | `app/new-logos/sign-in`, `app/new-logos/sign-up`: the existing account system (Clerk), so the same accounts and sessions, presented neutrally by `components/new-logos/auth-appearance.ts`. The header that would name the application is hidden, no logo is shown, and the copy is just "Sign in" and "Use your existing account." Someone already signed in goes straight in. |
| Words | Workspace, Conversation, Objective, Question, Knowledge, Decision, Artifact, Assistant. Error text from the server is never shown, because it may name things; neutral text is used instead (`failureText`). |
| Tests | `test/new-logos.test.mjs` checks the neutral failure text. A search of `components/new-logos` and `app/new-logos` for brand and model names, outside comments and internal paths, finds none. |

What is not presentation, and is kept as it is: accounts and sessions, the conversations table and its API, the
assistant (`/api/logos/chat`, with its limits and reasoning), and the database. The address `/new-logos` and the
internal paths it calls (such as `/api/logos/chat`) are identifiers, not interface.

**Known limits of the rule.**

- The site-wide layout still wraps this route (it holds the account provider). So its hidden, unrendered pieces still
  travel in the page's data: the root 404 page that Next.js serialises with every page, and the theme script's storage key.
  None of it is shown. Every rendered state under `/new-logos` (pages, sign-in, not found, errors) is neutral.
- The account system's own emails, and the consent screens of social sign-in providers, are configured in their
  dashboards. They may still show the existing application name.
- The assistant's replies come from the existing reasoning, unchanged. A reply could, rarely, refer to itself by a
  name. Changing that means changing the assistant's instructions, which is outside this presentation-only change.

## Nodes: one shape for every type

`lib/new-logos/model.ts` defines six types sharing one row:

- identity, owner, type, title, description;
- **parent** (containment);
- type-specific **content**, a **state**, **provenance**;
- ordering, archive mark, **version**, timestamps.

| Type | Content | States |
|---|---|---|
| Objective | outcome | active, paused, achieved, abandoned |
| Conversation | none: it holds only the canonical `conversation_id` | active |
| Question | resolution | open, exploring, resolved, dropped |
| Knowledge | body, kind (finding, evidence, observation, research, understanding) | current, disputed, superseded |
| Decision | rationale, alternatives, uncertainties | proposed, **accepted**, rejected, superseded |
| Artifact | a composition: primitives and the shared variables they read | draft, ready |

**Provenance** records `origin` as human, AI or external. It can also record the source (label and address), the
conversation and message a node was taken from, and `approvedAt` for decisions.

**Artifacts** are compositions of visual primitives: text, equations, controls, plots, tables, relationship graphs,
diagrams and media, with shared variables connecting them. See [Primitives and artifacts](#primitives-and-artifacts).
An artifact is a node of its own. It exists apart from any conversation and other nodes can reference it.

### Containment and relations are separate

| | Containment | Relations |
|---|---|---|
| Shape | A tree of objectives (`parent_id`) | A graph of typed edges (`nl_relations`) |
| What it is for | The nested matrix | informs, supports, contradicts, answers, investigates, depends on, derived from, references, related to |
| Rules | Only an objective contains. One parent or none. No cycles. Nothing can be placed into an archived objective. No depth limit. | Between any two of a person's own nodes. No duplicates. No self-relations. |

A knowledge node or an artifact can inform several objectives through relations without being copied.

### The rules (`lib/new-logos/ops.ts`)

- **No accidental deletion.** Archiving is how things are taken away, and it can be undone. Deleting is permanent and
  only allowed for a node that is archived and contains nothing. It is never recursive, and the database refuses it
  too (the `parent_id` foreign key). Removing a conversation node is always allowed and never touches the
  conversation; it simply returns to the unplaced list.
- **A decision becomes the person's only when they accept it.** No create or edit can set `accepted`. Only the accept
  action does, and it records when. A decision the assistant proposed is labelled as such, and is listed to the
  assistant as "Undecided" until it is accepted.
- **Versioning.** Each change to a node's words, state or place keeps the previous state; the last 50 versions are
  kept. Any version's words can be brought back. Writes are compare-and-swap on the version, so an edit from a stale
  copy is refused, not applied.
- **Restoring.** A node restored after its container was archived or removed comes back at the top level, never into
  hiding.

## Conversations: one source of truth, both ways

Conversations are **not copied**. There is no second conversation store.

- New Logos reads and writes the existing `conversations` table through the existing `/api/conversations`: GET lists,
  PUT saves with version checks and merging, PATCH renames.
- A conversation node stores only the canonical id.
- Conversations started in New Logos are created in the same table, with the existing id format and
  `kind: 'logos'`. The existing interface lists and opens them like any other.
- Everything said in either interface appears in the other. New Logos re-reads when the tab comes back into view and
  every 25 seconds while it is visible.

**Why the whole row travels.** The existing PUT rewrites every column it is given. A save that left out the map, the
draft or the attached contexts would erase them for the other interface. So every New Logos save is rebuilt from the
freshest canonical row:

1. Re-read the conversation.
2. Put this page's new turns after what is stored.
3. Send the whole row back with the version it was read at. Memory is left out, so the stored memory is kept.

If another write landed in between, the server merges: both interfaces' turns are kept, and the map is kept
(`test/new-logos-e2e.test.mjs` checks this).

The order of a turn:

1. The person's message is saved first.
2. The reply streams.
3. The reply is saved.

A failed reply leaves the message saved and offers **Try again**.

**Placement.**

- A conversation may belong to no objective. Home lists those under "Conversations not in an objective", and
  **Conversations** lists every conversation with where it sits.
- Placing a conversation, moving it, or removing it from an objective changes only the node, never the conversation.
- One conversation has at most one placement: a database unique index enforces it, and placing it again moves the
  existing node.
- If a conversation is deleted in the existing interface, its node's pointer is set to null (no dangling reference).
  The tile then shows "No longer exists".

## Objective-aware reasoning: selective, explicit

`lib/new-logos/context.ts` builds the context for a conversation that sits in an objective, or is related to one.
`/api/new-logos/context` assembles it on the server from the person's own nodes. It includes:

- the objective's title and outcome, its description, and the path of objectives above it;
- what sits directly in the objective's matrix: sub-objectives, open and resolved questions, knowledge (with where it
  came from), accepted decisions (proposed ones as "Undecided"), and artifacts;
- whatever the person has explicitly related to the conversation or the objective (for example "investigates" a
  question).

It never includes other conversations' messages, anything archived, or the deeper tree. Findings from other
conversations reach a conversation only the way the person chose to keep them: as knowledge nodes, with provenance.

The context takes the shape the existing chat endpoint already accepts as `objective`
(`lib/logos6/objective.ts`, `sanitizeObjectiveTurn`). The assistant therefore needed no change, and re-sanitises it
like any other field. Objectives are never created, changed, resolved or accepted by the assistant: people create and
accept them.

## The interface

| Page | What it shows |
|---|---|
| `/new-logos` | Home. The top-level matrix, plus conversations not in an objective. |
| `/new-logos/n/:id` | One node's details. An objective opens as its matrix (how it is broken down), with **Open workspace** leading to its canvas. The other types open in their editors. Beside each: Related, Where it came from, History. |
| `/new-logos/w/:id` | An objective's workspace: its spatial canvas (below). |
| `/new-logos/c/:id`, `/new-logos/c/new` | A conversation's spatial canvas (below). |
| `/new-logos/conversations` | Every conversation, searchable, filterable to unplaced, with place or move actions. |
| `/new-logos/archive` | Archived nodes: restore, or delete for good when empty. |

**The nested matrix** replaces the chronological sidebar.

- An objective's tile is wider than the others and shows its own matrix in miniature, so the breakdown is visible
  before entering. Breadcrumbs lead back up.
- Tiles are told apart by glyph, label and content, not by colour.
- Members are created in place with **New**.
- Nodes move with **Move to…**, or by dragging a tile onto an objective or a breadcrumb. Conversations can be dragged
  from the unplaced list onto an objective.
- Nodes are archived from their menu.

The workspace and the matrix are separate interfaces. There is no persistent sidebar, and no matrix of resizable
panels. Every action is keyboard-reachable through links, buttons and menus; drag and drop is an extra, never the only
way. Layouts collapse to one column on narrow screens.

## The spatial canvas

The nested matrix is how work is **organised and reached**. The canvas is where it is **worked on**. They are two
layers. The canvas is never a grid of panels, and the matrix is never a canvas.

**No chatbot.** There are no stacked bubbles, no chat sidebar, no fixed composer and no feed with a panel beside it.
Talking to the assistant is a capability you use from anywhere on the canvas.

### What the canvas does

`components/new-logos/canvas/Canvas.tsx` is built from scratch. Its interaction principles come from the earlier
spatial canvas; none of its components or styling are reused.

- **Pan and zoom.**
  - Drag the empty plane to pan. The wheel or a two-finger scroll also pans.
  - Ctrl/⌘ and the wheel, or a pinch, zooms at the pointer.
  - Buttons give zoom out, zoom in and fit; the zoom level is shown.
  - Keys: arrows pan, `+` and `−` zoom, `0` fits.
- **Direct manipulation.** An object moves when you drag its top bar. A press that doesn't move is a click, which
  selects. With an object selected, the arrow keys move it.
- **Persistent positions.** Where each object sits, whether it is open, what it was asked from, and the camera are
  saved per workspace.
- **Open and closed.** Closed, an object is a compact summary. Open, it is the thing itself, worked on in place:
  - an exchange's whole reply, rendered;
  - a question's state and resolution;
  - a decision's rationale, with Accept, Reject or Reopen;
  - knowledge you can edit;
  - an artifact, live: its controls move, its tables take typing, its text is written in place;
  - for a conversation on an objective's canvas, its latest exchanges and a box to continue it.
- **Relationships.**
  - Drag an object's handle onto another object, then choose what the connection means.
  - It is saved as a relation, the same graph the rest of the app uses.
  - Lines are labelled in words and also differ by pattern, not only colour: solid for a relation, dashed for "asked
    about", dotted for "kept as".
- **Making things where you are.** Ask in the **omnibox** at the bottom centre, or double-click the empty plane to ask
  from there. The omnibox's **+**, or the same double-click, places a question, knowledge, a decision, an artifact
  (begun from a primitive or a small model) or, on an objective, a sub-objective.
- **Asking in context.** Any object can be asked about:
  - The question goes to the existing chat endpoint with the object as "this". It uses the existing Point & Ask
    contract: the `focus` brief for the current turn, and `about` kept on the message.
  - The answer appears beside the object, joined by an "asked about" line.

### Data versus presentation

**A conversation stays one ordered list of messages.** It lives in the canonical table, the existing interface still
reads it as a thread, and the assistant always reads it in order.

**On a canvas, the same messages are exchanges.** An exchange is a person's turn plus the replies to it
(`exchangesOf`, `lib/new-logos/canvas.ts`). Its key is its first message's id, or its position when a message has no
id. Appending a message never changes an earlier exchange's key.

**Where things sit is a layout, kept apart.** That means each object's position, its open state, what it was asked
from, and the camera. It is stored per workspace in `nl_canvases`, with key `o:<objective>` or `c:<conversation>`.
It is never written into a message or a node.

- Saves are compare-and-swap on a version; a save that loses the race merges its own changes into the newer layout.
- Before the migration has run, the layout is kept in the browser, so the canvas works and remembers either way.

**Objects without a saved place get one.** Something kept from an exchange goes beside that exchange; a history opened
for the first time is laid out in reading order. Nothing is placed on top of another object, and nothing already
placed is moved (`placeMissing`).

**The order stays available.** A conversation's **History** opens an index of its exchanges, in order, on request.
Choosing one brings it into view.

### The two workspaces

**A conversation's canvas** (`ConversationCanvas.tsx`).

- Each exchange is an object.
- Asking from an exchange or a node puts the new exchange beside it.
- Asking from the empty plane puts it where you clicked.
- What you keep from an exchange (knowledge, a question, a decision, an artifact) appears beside it, with provenance.
  A reply kept as an artifact becomes a text primitive in a new composition.
- A new conversation opens as an empty canvas, ready to ask.

**An objective's canvas** (`ObjectiveCanvas.tsx`, `/new-logos/w/:id`).

- Everything the objective contains is an object; whatever is related to it from elsewhere appears too, marked as
  linked.
- Asking from the plane starts a conversation there, inside the objective and told about it.
- Asking from an object starts a conversation about that object, beside it.
- A conversation's own card continues that conversation.

## Primitives and artifacts

An artifact is not a document of generated HTML. It is a **composition**: native, structured primitives that a person
works on directly, and the **shared variables** that connect them. In an economic model, for example, the equations,
the plot, the table and the sliders all read the same price and quantity. Moving the price slider updates every one
of them, with no message to the assistant.

### The primitives (`lib/new-logos/primitives.ts`)

| Primitive | What it holds | Worked on in place |
|---|---|---|
| Text | Markdown with maths; plain, note, callout or annotation (an annotation points at another primitive); `{{expression}}` is a live value | double-click or Edit to write |
| Equation | a definition (`revenue = price * quantity`), a function (`f(x) = a x^2 + b`) or a bare expression | click to edit the line; a name nobody defines can be made a variable, with a control, in one step |
| Control | a slider, number field, toggle or choice, bound to a shared variable | move it |
| Plot | x and y ranges (y fitted or fixed), functions of x, data series read from a table, points worked out from the variables | functions and points written in the legend; hover reads every function's value |
| Table | text, number and formula columns; rows | type in cells (Enter moves down); add and remove rows and columns |
| Relationship graph | labelled concepts, and typed relationships that may be directed | double-click to add, drag to move, drag from a concept's circle to connect, label and direct relationships; Arrange lays it out |
| Diagram | boxes, rounded steps, ellipses, decisions and free labels; connectors with arrows and dash patterns | as the graph, plus resizing shapes and changing their kind |
| Media | an uploaded image (kept privately under the account) or one by address, with description, caption and source | choose, drop or paste an image, or give its address |

Every primitive has:

- a **persistent identity**, an id unique in its artifact;
- **structured, serialisable content**: plain JSON, checked by its type's sanitiser (unknown fields dropped, limits
  held, script and data addresses refused);
- a **place and size** on the artifact's plane, and an optional label;
- **references** to other primitives (a plot's table, an annotation's subject), dropped if the target is removed.

The data is never the drawing. Renderers in `components/new-logos/primitives/` draw each primitive from its data, and
the same renderer serves every place it appears. Equations are drawn by KaTeX from LaTeX written from the expression's
parsed structure. No markup is ever stored.

### Shared state and reactivity (`lib/new-logos/expr.ts`, `compose.ts`)

**One small expression language** serves equations, plotted functions, table formulas and live values in text. It
has:

- numbers, names and the operators `+ − × ÷ ^ %`;
- comparisons, where true is 1;
- brackets, and implicit multiplication (`2x`, `3(x+1)`);
- a fixed set of functions, and the constants π, e and τ.

Expressions are **parsed into a tree and evaluated by walking it**. There is no `eval`, no `Function`, and no property
access. Lookup tables have no prototype, and names that JavaScript objects already have (`constructor`, `__proto__`)
cannot be given to anything. A name reaches a number or nothing.

Every evaluation has a step budget, so functions calling functions stop at once with "Too much work to work out"
rather than freezing the page.

Implicit multiplication works at the level of ×. So `2x^2` is 2·x², `x^2y` is x²·y, and `1/2x` is (1/2)·x.

**The scope** is the variables plus every equation's definition, worked out in dependency order. If a definition
depends on itself, uses a name nobody defines, or takes a variable's name, that equation shows the error in words and
everything else still works.

Plots, formulas and live text are evaluated against the scope when drawn. Changing a variable therefore changes
every dependent primitive at once. There are no subscriptions to keep: the dependency is in the data, in the names
each expression reads.

The same reading of names gives the **references between primitives** (`linksOf`):

- a control *moves* what reads its variable;
- an equation *gives* its definition to what uses it;
- a table supplies a plot's data;
- an annotation points at its subject.

### One operation system (`lib/new-logos/artifact-ops.ts`)

Every change to a composition is a batch of operations from one vocabulary:

- for primitives: `add`, `update`, `move`, `resize`, `remove`, `duplicate`, `order`;
- for variables: `var.add`, `var.set`, `var.update`, `var.rename`, `var.remove`.

The same pure `applyOps` runs in two places: in the browser for an immediate result, and on the server
(`POST /api/new-logos/nodes/:id/ops`, `applyArtifactOps`) against the stored composition, which is the truth.

- **Validated.** A malformed batch is refused whole. A batch that would make the artifact too large changes nothing.
  Variable names are checked.
- **Concurrent edits both land.** An operation names what it changes, so a batch is applied to whatever is stored
  when it arrives, and needs no version from the browser. On a lost compare-and-swap it is re-read and re-applied.
- **Safe to retry.** An operation whose target is already gone is skipped and reported. Adding something that already
  exists is skipped, so a batch sent twice changes nothing the second time.
- **Renaming rewrites.** `var.rename` rewrites every use in equations, plots, table formulas, live text and controls.
  It leaves alone a function parameter or table column of the same name, which are different things there.
  A rename is refused if the new name would change what something says: a plot's `x`, a function's parameter, or a
  table column of that name.
- **A value is only a value.** `var.set` changes the value. A range changes only by `var.update`: a number typed past
  the range is sent as one `var.update` that widens it. So coalescing a run of values is exact.
- **Clearing is `null`.** A field is cleared by sending `null`, which survives being sent as JSON; `undefined` would
  be dropped.
- **Undoable.** Every operation has an exact inverse (`inverseBatch`). Undo and redo (⌘/Ctrl+Z) send the inverse as an
  ordinary batch. A held slider or a drag is one step.
- **Few requests.** The browser coalesces rapid changes before sending (`coalesce`). A slider moved through forty
  values is one operation.
- **Optimistic but honest.** Until the server answers, what is shown is the stored composition with the unanswered
  operations on top. A refused operation stops being shown.
  - A background refresh never takes back an edit that is still on its way.
  - An answer older than a version this page has already seen is never shown over a newer one.
- **Reliable delivery.** Batches are split to fit the server's limits, so edits gathered while offline are never
  refused for their number.
  - Only transient failures are retried: no answer, a server error, a write that kept losing a race.
  - On leaving the page, what is waiting is sent at once and also stays waiting, so a page restored from the browser's
    back-forward cache sends it again. Every operation is idempotent, so the second delivery changes nothing.
- **Versioned per burst.** The first operation after a minute of quiet keeps a version (the state before the burst),
  so history holds editing sessions rather than every slider position.

People edit primitives directly, without the assistant. The assistant is meant to use **the same vocabulary**: it
will propose operations, checked the same way. Generating artifacts with the assistant is deliberately not built yet.

### Where an artifact appears

- **Its own canvas** (`ArtifactCanvas.tsx`, `/new-logos/a/:id`). The primitives are objects on the spatial canvas:
  - select by clicking; move by the head; resize by the corner;
  - duplicate with ⌘/Ctrl+D; remove with Delete, with Undo offered;
  - a floating panel holds the selected primitive's properties, and another holds the shared variables;
  - references are drawn as faint lines, named when one end is selected;
  - double-click or **Add** to put a primitive down; drop or paste an image to add media.

  Where primitives sit is part of the artifact. Only the camera is a layout (`a:<id>` in `nl_canvases`).
- **The matrix.** An artifact is an artifact node, described by what it holds. Its tile opens its canvas, and its
  details page shows it live, with relations, provenance and history.
- **Other canvases.** On a conversation's or an objective's canvas, an open artifact card shows the composition live,
  scaled to fit (`Surface.tsx`). Its controls, tables and text work there, through the same operations. Arranging
  is done on its own canvas.
- **Starting points.** An artifact can begin as text, a single primitive, an empty plane, or a small model: two
  sliders, a function, its plot with a moving point, and a note with a live value.

### What the assistant is told

The assistant is told the artifact's structured state, never a screenshot.

- **Asking about an artifact** (Point & Ask) sends its state as the focus brief (`artifactFacts`):
  - what it is made of;
  - the shared variables and their values;
  - each primitive's state in reading order: an equation and its value, a slider and its range, a plot's functions
    and computed points, a table's columns and first rows, a graph's relationships, an image's caption and source.
- **The objective context** lists each artifact in the objective by what it holds and its values now (`artifactLine`).

Both stay inside the existing chat contracts: twelve lines of at most 220 characters for the focus, and ninety
characters per artifact for the objective.

### Storage

**No new tables.** A composition is the artifact node's `content` in `nl_nodes`, versioned like every node.

**Uploaded images** go to the account's existing private picture storage, through neutral routes
(`/api/new-logos/media`). That storage keys each folder by a digest of the account, never its id. It is already
emptied by account deletion and listed by the export. An image is checked from its bytes (PNG, JPEG, GIF or WebP, 4 MB
at most) and served only to its owner.

When an artifact is deleted for good, the pictures only it showed, in its content or its kept versions, are removed.
If any doubt remains, the picture is kept.

Content written before compositions existed (a Markdown document) is read as one text primitive, so nothing is lost
or needs migrating. It keeps up to 100,000 characters, as before, and its `{{…}}` stay as written rather than becoming
live values.

## Sources

The fundamental rule: **sources belong to the workspace, references belong to components, and the canvas belongs to the
person.** There is no Content tab, no content page and no source sidebar. A file stays in the library, out of the way,
until the person places it on a canvas or mentions it in a question.

### The record and its references (`lib/new-logos/sources.ts`, `source-ops.ts`)

A **source** is one canonical record per file a person brought in. It holds the name (renameable), the kind, how well
the file was read, and pointers into storage that already exists:

- **The original.** It is kept privately under the account by its content hash, through the existing file storage
  (`lib/preview/originals.ts` `keepOriginal`, bucket `socria-files`). Account deletion already empties that storage
  and export already lists it.
- **The reading.** This is the structured text the existing reader makes of a file (`lib/docs`: pages; blocks with ids
  like `p3.12`; tables; checks), made by `readFileAsDoc` through `/api/files/read`. It is kept on the record, so it is
  the same on every device. A reading too large to keep is trimmed visibly: the rest is marked unread.

The rules:

- **One record per file.** The same file brought in twice, matched by its reading or its original, is the same
  source. If brought in from a new conversation, it also joins that conversation.
- **References tie components to sources.** A reference connects a question, finding, decision, artifact or
  objective to a source. It can point at one passage, quote its words, and record how the component stands on the
  source: quoted (verbatim), derived, or an interpretation. It also records who made the tie: the person, or the
  assistant citing the source. Many components can reference the same source; nothing is copied, and the same tie
  twice is one reference.
- **Removing a reference** never touches the source.
- **Deleting a source** is its own confirmed act. It removes the record and its references. The original file is
  released only if no conversation still shows it. Deleting a conversation, in turn, no longer releases an original
  the library still holds (`releaseOriginals`).
- **Reading status** comes from what the reader recorded: read, partly read (with the pages not read), scanned pages
  not read yet, nothing could be read, or kept as an image.
- **Existing uploads stay in view.** Documents already attached in conversations appear in the library under "In
  your conversations" and can be added with their conversations kept.

### The library (`components/new-logos/sources/Library.tsx`)

The library is a compact button in the bottom-left corner. Pressing it opens a popover above the button. Opening it
moves nothing: the canvas keeps its size, place and camera. It takes no part in panning or zooming, and closes on a
click elsewhere or on Escape.

In the library you can:

- upload files, or drop them on it;
- search by name, and filter to all, documents, images, in use or not in use;
- see each file's reading status;
- open a source in **focus**;
- rename a source;
- see what uses it: components, conversations and canvases, each a link;
- drag it onto a canvas, or use **Place on canvas** where dragging is not available;
- delete it, after a dialog that says exactly what is removed and what is kept.

### On a canvas

A source placed on a canvas is a **source reference component**: a layout item `s:<source id>` on that canvas, never
a copy. Uploading never puts anything on a canvas by itself.

- **Closed**, it shows the name, how well it was read and its opening words.
- **Open**, it shows its outline. Each heading opens the source in focus at that heading.
- **Connecting.** Drag its circle onto a component, or drop a source from the library straight onto a component, and
  that component references the source. The line between them says "draws on".
- **Take off this canvas** removes the placement only. The source stays in the library, and so does every reference
  to it.

### Indicators and focus

**The indicator.** A component with sources shows a small page-and-number indicator in its head; one without sources
shows nothing. Pressing it shows, for each reference:

- the source, and the passage in the source's own words, with its page;
- how the component stands on it, and who made the tie;
- **Open at passage**;
- a way to remove the reference, and to add another source ("Add a source…" in the component's menu too).

An exchange shows the documents attached to its question and the passages its replies cite (`[A3.12]`), letter by
letter as the chat endpoint counts them.

**Provenance stays visible.** A finding kept from a reply keeps the passages that reply cited, as references marked
as the assistant's interpretation. Its kicker says so: "AI interpretation of 1 source". That reads differently from
"Quoted from a source", "Backed by a source", or "AI-generated, no source cited".

**Focus** (`Viewer.tsx`) opens one source over everything, in two views:

- **Original:** a PDF's pages through the existing page viewer (`components/preview/PdfView`), with the passage
  marked where the reading boxed it; an image as itself.
- **Reading:** the blocks that were read, with the passage highlighted and brought into view.

The original is fetched from this device or the account's file storage. The existing preview window is not used,
because its words name the product; its page viewer is reused with neutral styles.

### The omnibox (`Omnibox.tsx`, `mentions.ts`, `ask.ts`)

The omnibox floats at the bottom centre of conversation and objective canvases, and replaces the corner Add button.

- **@ mentions.** Typing `@` searches the workspace: sources, artifacts, findings, questions, decisions, objectives
  and conversations. Choosing one attaches it, shown as a removable mark ("@Business Plan ×").
- **A mentioned source** becomes a document attachment on the person's message, exactly as the existing interface
  attaches a document, so the other interface shows it too. For every turn, the passages of the conversation's
  library documents that bear on the question are fetched (`passagesFor`: the outline and the main app's own BM25
  retrieval, within a budget) and sent as the chat endpoint's existing `docs`. The endpoint letters, shows and cites
  them. Whole documents are never injected.
- **A mentioned component** brings a few lines of what it says in the existing focus brief. For an artifact, that is
  its structured state.
- **Files brought in through the omnibox** go to the library and are attached to the question. Nothing is put on the
  canvas.
- **The + button** opens the maker for questions, findings, decisions, artifacts and sub-objectives.

### Storage and permissions

Sources use two additive tables, in `supabase/schema.sql` and walled in `supabase/rls.sql`, both included in account
deletion and export:

- `nl_sources`: one row per file, unique per person by reading;
- `nl_source_refs`: references, cascading from both sources and nodes.

Every query is scoped to the owner. The routes:

- `GET` and `POST /api/new-logos/sources`;
- `GET`, `PATCH` and `DELETE /api/new-logos/sources/:id`;
- `POST /api/new-logos/sources/passages`;
- `POST /api/new-logos/sources/refs` and `DELETE /api/new-logos/sources/refs/:id`.

Before the migration they answer `{ setup: false }`, and the library says sources are not set up yet.

Scanned pages that still need reading are shown as such. Reading them with vision from the library, as the main app
can, is not wired in yet.

## Server and storage

The API routes:

| Route | Methods |
|---|---|
| `/api/new-logos/nodes` | GET, POST |
| `/api/new-logos/nodes/:id` | GET (with versions), PATCH (update, move, reorder, archive, restore, accept, reject, reopen, restore-version), DELETE |
| `/api/new-logos/nodes/:id/ops` | POST (a batch of artifact operations, applied to what is stored) |
| `/api/new-logos/media`, `/api/new-logos/media/:id` | POST (an image for a media primitive), GET (the owner's own image) |
| `/api/new-logos/sources`, `/api/new-logos/sources/:id` | GET, POST (the library; a file's record); GET (with its reading), PATCH (rename), DELETE (for good: references too; the original only when nothing else shows it) |
| `/api/new-logos/sources/passages` | POST (what a question draws from sources: outlines and passages, never whole documents) |
| `/api/new-logos/sources/refs`, `/api/new-logos/sources/refs/:id` | POST (a component refers to a source), DELETE (one reference; the source stays) |
| `/api/new-logos/relations` | POST |
| `/api/new-logos/relations/:id` | DELETE |
| `/api/new-logos/context` | GET |
| `/api/new-logos/canvas` | GET, PUT (one canvas's layout, or an artifact's camera: compare-and-swap on its version) |

Every query is scoped with `.eq('user_id', userId)`, and the tables are walled by RLS like every other table.

The tables are `nl_nodes`, `nl_relations`, `nl_node_versions` and `nl_canvases`, in `supabase/schema.sql` (additive
only: four new tables, nothing altered) and walled in `supabase/rls.sql`.

**To enable organisation on a database, run `supabase/schema.sql`, then `supabase/rls.sql`.** Both are idempotent.
Until then, New Logos lists and continues every conversation, and shows a neutral notice that objectives and the other
node types are not set up yet. The routes answer `{ setup: false }` and write nothing.

The relaunch gate (`lib/takeover.ts`) treats `/new-logos` as part of the app. The gate is off unless switched on.

## Tests

- `test/new-logos.test.mjs` (87 checks), against the in-memory store with the database's rules:
  - the six types share one shape;
  - containment at any depth, with no cycles and no orphans;
  - account isolation;
  - placement without copying, and removal that never touches a conversation;
  - archive-first, never-recursive deletion;
  - decisions accepted only by the accept action;
  - versions and stale-edit refusal;
  - relations;
  - the context package against the existing objective contract;
  - conversation helpers that never drop a column from a save;
  - the relaunch gate.
- `test/new-logos-canvas.test.mjs` (37 checks), the spatial layer:
  - exchanges from messages, with the messages left unchanged;
  - layouts cleaned, placement that never overlaps or moves what is placed;
  - fitting and connectors;
  - an ask from an object meeting the existing Point & Ask contracts.
- `test/new-logos-e2e.test.mjs` (92 checks), through the real routes (the new ones and the existing conversations
  route) with the fake database and fake accounts:
  - before the migration;
  - signed out;
  - one set of conversations in both directions, including concurrent writes that merge and keep the map and draft;
  - placement and context;
  - removal never deleting;
  - another account seeing nothing;
  - canvas layouts: versioned, cleaned, owner-scoped, never touching a conversation;
  - artifact operations: applied to what is stored, concurrent batches both landing, retries skipped, malformed and
    oversized batches refused whole, owner-scoped, archived artifacts unchanged;
  - the picture routes refusing the signed-out, bad ids, and anything that is not an image whatever it claims;
  - sources: one record per file, references that never copy it, passages rather than documents for a question,
    deletion that takes references and nothing else, owner-scoped, and `{ setup: false }` before the migration.
- `test/new-logos-sources.test.mjs` (35 checks), sources:
  - the record, reading status and visible trimming of large readings;
  - one record per file and conversation joins;
  - references and their isolation;
  - what a question draws: outline and relevant passages, as a reading the chat endpoint accepts;
  - deletion;
  - documents already in conversations, uses, citations, mentions, and a component's standing.
- `test/new-logos-primitives.test.mjs` (110 checks), primitives and artifacts:
  - the expression language: precedence, implicit multiplication, errors in words, no way to reach anything but
    numbers;
  - every primitive's checks and limits;
  - shared state in dependency order, with cycles and unknown names said on their equation;
  - tables, plots and live text reading one scope, so a variable change reaches all of them;
  - references;
  - the operation vocabulary, including rename (and refusing a rename that would be captured), clearing by `null`,
    the size limit, exact coalescing, and exact undo of every kind of batch;
  - server application with per-burst versions and a lost race re-applied;
  - what the assistant is told, inside the existing objective and focus contracts.

## What comes next (deliberately not built)

- autonomous agents and reasoning orchestration;
- automatic objective breakdown;
- the assistant creating and changing primitives (the operation system it will use is built and validated);
- arbitrary code execution inside artifacts (deliberately absent: the expression language is evaluated, never run);
- fine-grained table operations (a table edit replaces its rows or columns as one change, so two people typing in
  different cells of the same table at the same moment keep the later edit);
- semantic retrieval;
- collaboration on nodes.

The node model, relation graph, provenance, versions and context package are built so these can follow without
changing the foundation.
