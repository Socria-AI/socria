# Sharing and Think Together

Projects, Core conversations and Logos lines of thinking can be shared the way
a document is shared: by inviting people, by link, or by an invite code, with
four roles. Every permission is enforced on the server.

## The model

The shared thing **keeps its owner.** A conversation or Project stays keyed to
the person who made it, and the owner-scoped reads underneath (`.eq('user_id')`
everywhere) are never loosened. A **share** is a row beside it that says who
else may reach it, and as what (`supabase/schema.sql`, "Sharing"). The tables
are:

| Table | Holds |
|---|---|
| `shares` | one per resource: the link (its role, a random nonce, the hash of its token) and the invite code |
| `share_members` | people, by account or (until they sign in) by email; role; how they joined |
| `share_comments` | comments anchored to a turn, a map node, or the whole thing |
| `share_activity` | the history: who joined, added, changed, commented |
| `share_presence` | who is here right now, and where their pointer is (one row per person, overwritten on each heartbeat) |

All of these are covered by row-level security (`rls.sql`), account deletion
(`purgeSharing`, which fails closed) and the account export.

**The gate** is `shareAccess(user, type, id)` in `lib/share/server.ts`.

- The owner is the owner.
- Anyone else needs an active membership. For a conversation, a membership on
  the Project it is filed in also counts; the stronger of the two roles wins.
- A stranger gets the same 404 as a wrong id.

Project Home goes through the same gate (`lib/project-access.ts`).

## Roles (`lib/share/roles.ts`)

| | read | comment | ask Socria | edit | share | delete |
|---|---|---|---|---|---|---|
| Owner | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Editor | ✓ | ✓ | ✓ | ✓ | | |
| Commenter | ✓ | ✓ | | | | |
| Viewer | ✓ | | | | | |

Ownership is never granted. The owner can change any role, remove anyone,
reset the link (every copy of the old one stops working), turn the code off,
or stop sharing entirely. Members can leave.

## Ways in

- **Invite by email.** If the address belongs to an account, that person is
  in at once. If not, the invitation is pending:
  - it is sent by email when `INVITE_EMAILS=on` (Resend);
  - otherwise the dialog hands the owner the invitation link to send themselves.
  An emailed invitation can only be accepted by the account holding that
  verified address (`acceptInvite`). Pending invitations are also claimed the
  first time that person opens Socria (`claimInvites`).
- **Anyone with the link.** The token is an HMAC of the share and a random
  nonce, made with `SHARE_SECRET`. It is never stored; only its hash is kept,
  for lookup. Resetting the link changes the nonce.
- **Invite code.** Eight characters, readable aloud (no 0/O or 1/I/L), entered
  under **Join with a code** in the sidebar.

Joining requires an account. Opening `/s/<token>` while signed out goes to
sign-in and comes straight back.

## Socria One

- **Hosting is Socria One.** Inviting anyone, or turning on a link or a code,
  answers 402 for a free owner. Closing a door is never paywalled, so an owner
  whose plan has lapsed can still remove everyone.
- **Joining is free.** A free guest has their full role inside someone else's
  space. Their turns to Socria there are counted against
  `FREE_GUEST_TURNS_PER_DAY`, never against the host's plan or their own
  monthly chats.

## Privacy (`lib/share/turn.ts`)

In a conversation more than one person can read:

- **No one's personal memory** is recalled into the reply, and nothing is
  remembered from it. This applies to the owner too: their own shared chat
  does not surface their memories to their guests.
- **The Project's own context stays**: its name, description, goals and file
  names. A guest never gets the owner's instructions to Socria.
- **Collaborators on a Project see its content**: its conversations, maps,
  models and goals. They never see a conversation outside it, anything Socria
  learned about the owner, or any email address. People are named by display
  name and a per-share alias, never an account id.
- **An incognito conversation cannot be shared** (409).

## Working at the same time

- **Turns** (`POST /api/shared/conversation/[id]`) are appended to the row as
  it stands, and written only if it has not changed since it was read
  (`updated_at` acts as the version). A request that loses a race re-reads and
  re-applies, so two people sending at once both land.
- **A map** is a whole structure. A map written against an older version is
  refused with the current one (409), for the client to merge. Silently
  overwriting someone's map must not happen.
- **The owner's ordinary save** of a shared conversation merges on the server
  (`mergeTurns` in `/api/conversations`). A stale tab cannot erase a
  collaborator's turns.

## Think Together in a Core conversation

`/chat?shared=<id>` opens `components/share/SharedThread.tsx`. It has:

- every turn named;
- who is here, and who is typing (presence heartbeat);
- comments on any turn, in threads (see **Comments** below), and a
  **Comments** panel listing every thread with a link back to its turn;
- the history;
- live updates, through a cheap poll that answers `unchanged` when nothing
  moved;
- a composer only for editors and the owner. Viewers and commenters are told
  what they can do.

## Think Together in Logos

A shared line of thinking stays in step on every screen that has it open
(`components/share/useSharedSession.ts`, `lib/share/sync.ts`). That covers its
turns and its map, which holds the nodes, the models, the objects of thought
and the plots. Everyone works on the same canonical state: the owner's row,
written only through the share routes.

- **Out.** `persist()` sends what this client has that the server does not:
  new turns are appended, and the map is sent against the version it was drawn
  on. Everything goes through one queue, so a client never races itself. A
  shared session is never saved as a whole row, and someone else's session is
  never saved as your own.
- **In.** A cheap poll. A newer version replaces the screen only when nothing
  of this client's is still unsent and no reply is streaming. A stale map comes
  back with the current one, which is adopted.
- **Presence and pointers.**
  - Faces beside **Share** show who is here.
  - Each person's pointer is sent in map coordinates
    (`toWorld` / `toScreen`, using each screen's own camera). It lands on the
    same card for everyone, whatever each person has panned or zoomed to.
- **Roles.** A viewer or commenter reads and is told so; sending is refused in
  the interface and on the server.
- **The owner's Draft Space** is kept through the same route. Only the owner
  can write it.
- **Opening a shared session.** `/chat?model=logos-3&s=<id>&shared=1` opens
  someone else's line of thinking through the share gate.
- **Which surfaces sync.** Any Logos surface: a session in a shared Project may
  be opened on Logos 2 too. A room joined by its old code keeps its own bar;
  otherwise **Share** is the way in. Once a session is shared, the faces,
  **Comments** and **Share** sit in the header on whichever Logos surface has
  it open.
- **Comments on the map.** A card with open threads carries a small pin with
  their number. It follows the card through a pan or a zoom. Pressing it opens
  that card's threads. With a card selected, the composer in the **Comments**
  panel comments on that card; with nothing selected it comments on the whole
  line of thinking.

## A shared Project

- The same Project Home, plus **People and activity**: who has access, who is
  on the home now, and what changed (its conversations' changes included).
- **Discussion**: comments on the Project itself, in threads.
- A personal Project shows none of this.

## Comments

One set of parts (`components/share/comments/`) serves every shared thing. The
arranging is pure (`lib/share/comments.ts`); every permission is decided on the
server (`lib/share/collab.ts`). The interface only shows the buttons the role
the server returned allows.

- **Anchors.** A card (`node:<id>`), a turn (`message:<n>`), the Project
  (`project`), or the whole conversation (`''`).
- **Threads.** A top-level comment starts a thread. Replies are one level deep
  and sit where their thread sits, whatever anchor they were sent with. A reply
  to a resolved thread reopens it. Only the thread is resolved, never a reply
  on its own.
- **Who may do what.** Commenters and up write and reply. The author, an editor
  or the owner resolves. Only the author edits. The author or the owner
  deletes. A deleted comment that has replies stays, emptied, for them to hang
  from.
- **The panel** has Open, Resolved and All tabs. Open threads come first, then
  the most recently active. Each thread names what it is about and links to
  it.
- **What is new.** The **Comments** button shows how many threads are open, and
  a dot when someone else has commented since you last looked. When you last
  looked is kept in this browser only.
- **Live** by a five-second poll while the thing is open.

## The Mind graph's Share

On the Memory page, **Share** says plainly that what Socria remembers about you
is never shared. It offers your Projects instead: sharing a Project shares its
conversations, maps, models and goals, which is the part of the graph that is
about the work. A collaborator's view of a Project's graph holds only the
Project's own content (`projectGraph(…, personal = false)`).

## API

| Route | |
|---|---|
| `GET/POST /api/share` | read who has access; link / reset-link / code / invite / role / remove / stop |
| `POST /api/share/accept` | join by `{token}`, `{code}` or `{invite}` |
| `GET /api/shared` | everything shared with me (claims emailed invitations first) |
| `GET/POST /api/shared/conversation/[id]` | read a shared conversation; append turns, change its map or title |
| `GET/POST/PATCH /api/shared/comments` | comments and replies; each answer carries the reader's `role` |
| `GET /api/shared/activity` | history (a Project's includes its conversations') |
| `POST /api/shared/presence` | heartbeat and pointer; who else is here |

Tests:

- `test/share-sync.test.mjs`: the sync decisions, two clients converging, and
  pointers landing on the same card.
- `test/think-together.test.mjs`: the wiring in Logos, Project Home and the
  Memory page.
- `test/share-e2e.test.mjs`: five people through the real routes. It covers
  permissions, revocation, simultaneous writes, the stale-tab merge, map
  conflicts, privacy of memories and emails, presence, history and incognito.
- `test/share-roles.test.mjs`: the role table.
