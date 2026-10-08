# The Mind atlas — everything Socria remembers, connected

Logos 3 remembers through the same Mind graph as Core 4. Both surfaces' chats,
maps, plots, models, objects of thought and Projects are drawn as one graph.

## Logos 3 reads and writes the Mind graph

`app/api/logos/chat` calls the same two functions Core 4 does
(`lib/mind/pipeline.ts`), with surface `'logos'`:

- **`recall()` before the reply.** What is recalled replaces the older flat
  memory list. If nothing is recalled, the flat list is still used. Private
  nodes never arrive: a Logos map can be exported as an image.
- **`remember()` after the reply.** It is registered with `waitUntil` before
  the stream closes. What a Logos turn teaches is something Core knows next
  time, and the reverse.

It only runs when all of these hold:

- the conversation is Logos 3;
- the user has an account;
- it is the main thread, not a node's side thread;
- the user is not in a shared room. The other person's words are not this
  user's to remember, and this user's memories are not theirs to read.

**Privacy.** The rule is Core 4's own (`lib/core4/signals.ts`). It is folded
over everything the person said in the conversation (`lib/mind/logos-turn.ts`):

- "Off the record" keeps nothing.
- A sensitive subject keeps the conversation to itself. It is written
  `private`, which also means it never returns to Logos.

## The atlas (`lib/mind/atlas.ts`)

The atlas is a **projection, never a store**. It joins things by what they
already record about each other:

| Connection | Read from |
|---|---|
| memory → chats it was learned in | `provenance.conversationId` |
| chat → its Project | `conversations.project_id`; the Project is its Mind anchor, so it is one node |
| map node → its chat | the chat's map |
| plot / model / object → its chat | the chat's map |
| two chats → each other | an idea, a plot or a memory they share |

**Joining across chats.**

- A map node's normalised label joins the same label on every other map.
- If the label (or an alias) matches a memory, the map node *is* that memory.
- Plots join by type, for example "Function plot".
- Models join by title.

**What is never joined.**

- Objects of thought: two matrices called A are two matrices.
- The mechanics of one worked problem: step, transformation, verification,
  error, result, inference, equation.

**Size limits.** Every limit is counted in `stats.dropped`, never dropped
silently.

- At most 200 recent chats.
- At most 24 nodes per map.
- At most 1500 nodes in total. Unshared ideas from the oldest chats are cut
  first. Memories, chats and Projects are never cut.

**The `logos` scope** (`GET /api/mind/atlas?scope=logos`) leaves out two
things, and the filter runs on the server:

- every private memory;
- every chat that produced one. Not even its title is sent.

**Reading.** The route reads each chat's title, kind, Project and map. It never
reads messages. Maps go through `atlasMapOf`, which keeps only what the atlas
draws.

## Where it is seen

**The Memory page opens on it.** "Everything" is the first view and the
default, drawn as one constellation (`components/mind/MindConstellation.tsx`,
laid out by `lib/mind/constellation.ts`):

- **The core:** what Socria remembers, written in the middle as a block of
  words, the most connected at its centre. Each memory's dot sits on the side
  facing the chats it was learned in, so its threads leave toward them.
- **The ring:** every chat, Core and Logos, on an ellipse around it. A Logos
  line of thinking is drawn as its own map in miniature. Chats are grouped
  into their Project's arc, newest first, with the Project's name along the
  arc.
- **Satellites:** a model, plot or object made in one chat sits just inside
  it, tethered to it. A Live 3D scene is one of these.
- **Bridges:** an idea, plot or model found in two or more chats sits
  between them, with a thread to each.
- **Folded:** an idea on one map only is part of that map's tile. It is
  listed when the chat is chosen, and counted, never dropped.

Hovering anything lights what it touches and dims the rest. Choosing a chat
opens a panel with what is on its map, what was made in it, what Socria
remembers from it and its Project, plus a way into it. The drawing measures
its container and lays out at that size, so its words are their real size
in a panel as on the page. What does not fit in a small core becomes a dot
at its edge, labelled on hover.

Graph and List are one press away. Correcting a memory still happens there;
the atlas is read-only. On an empty Memory page the atlas is shown too,
because chats and maps connect before any memory exists.

**Logos 3 → + View → Mind.** A workspace view, offered to an account
(`mind` in `lib/workspace/surfaces.ts`), read through the `logos` scope.

- *This chat* puts the chat in the middle, what is in it on the inner ring,
  and on the outer ring the other chats, the Project and the memories those
  lead to (`radialLayout`). Beside it is a list of every connected chat,
  what it shares with this one, and a way into it (`relatedChats`).
- *Everything* is the same constellation, at panel size.

**`/chat?c=<id>`** opens one particular Core chat, and `?s=<id>` one Logos
session. The atlas uses these, and Project Home will too.

Tests: `test/mind-atlas.test.mjs`, `test/mind-constellation.test.mjs` and
`test/mind-logos.test.mjs`.
