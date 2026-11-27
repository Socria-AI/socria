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
| Artifact | subtype, format, body | draft, ready |

**Provenance** records `origin` as human, AI or external. It can also record the source (label and address), the
conversation and message a node was taken from, and `approvedAt` for decisions.

**Artifacts** have a subtype registry: document, table, diagram, visualisation, mathematical model, simulation,
calculator, dataset, code, prototype, design, structural representation. The first release renders and edits
**documents** (Markdown with maths). The other subtypes are listed but cannot be created yet. An artifact is a node of
its own: it exists apart from the conversation it came from, and other nodes can reference it.

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
| `/new-logos/n/:id` | One node. An objective opens as its own matrix (outcome and description above, members below). The other types open in their editors. Beside each: Related, Where it came from, History. |
| `/new-logos/c/:id`, `/new-logos/c/new` | The conversation workspace (details below). |
| `/new-logos/conversations` | Every conversation, searchable, filterable to unplaced, with place or move actions. |
| `/new-logos/archive` | Archived nodes: restore, or delete for good when empty. |

**The conversation workspace** shows:

- the title (renamed on the canonical conversation) and the objective it sits in;
- breadcrumbs back to its matrix;
- the messages and a composer;
- linked nodes and nodes kept from it;
- "Create from this conversation": an objective (which then contains the conversation), a question, knowledge, a
  decision or an artifact;
- on every message, **Keep as** knowledge, a question, a decision or an artifact, with provenance (AI or human, the
  conversation and the message).

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

## Server and storage

The API routes:

| Route | Methods |
|---|---|
| `/api/new-logos/nodes` | GET, POST |
| `/api/new-logos/nodes/:id` | GET (with versions), PATCH (update, move, reorder, archive, restore, accept, reject, reopen, restore-version), DELETE |
| `/api/new-logos/relations` | POST |
| `/api/new-logos/relations/:id` | DELETE |
| `/api/new-logos/context` | GET |

Every query is scoped with `.eq('user_id', userId)`, and the tables are walled by RLS like every other table.

The tables are `nl_nodes`, `nl_relations` and `nl_node_versions`, in `supabase/schema.sql` (additive only: three new
tables, nothing altered) and walled in `supabase/rls.sql`.

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
- `test/new-logos-e2e.test.mjs` (48 checks), through the real routes (the new ones and the existing conversations
  route) with the fake database and fake accounts:
  - before the migration;
  - signed out;
  - one set of conversations in both directions, including concurrent writes that merge and keep the map and draft;
  - placement and context;
  - removal never deleting;
  - another account seeing nothing.

## What comes next (deliberately not built)

- autonomous agents and reasoning orchestration;
- automatic objective breakdown;
- generating advanced artifacts;
- artifact renderers beyond documents;
- semantic retrieval;
- collaboration on nodes.

The node model, relation graph, provenance, versions and context package are built so these can follow without
changing the foundation.
