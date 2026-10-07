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

- **Logos 3 → Mind** (map header).
  - *This chat* puts the chat in the middle, what is in it on the inner ring,
    and on the outer ring the other chats, the Project and the memories those
    lead to (`radialLayout`). Beside it is a list of every connected chat,
    what it shares with this one, and a way into it (`relatedChats`).
  - *Everything* shows the whole atlas in folders.
- **Memory page → Everything.** The same atlas, drawn by the Memory page's
  own folder graph. It is also shown on an empty Memory page, because chats
  and maps connect before any memory exists. Correcting a memory still
  happens in Graph and List; the atlas is read-only.
- **`/chat?c=<id>`** opens one particular Core chat, and `?s=<id>` one Logos
  session. The atlas uses these, and Project Home will too.

Tests: `test/mind-atlas.test.mjs` and `test/mind-logos.test.mjs`.
