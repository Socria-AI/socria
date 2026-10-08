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
- comments on any turn, which can be resolved;
- the history;
- live updates, through a cheap poll that answers `unchanged` when nothing
  moved;
- a composer only for editors and the owner. Viewers and commenters are told
  what they can do.

## API

| Route | |
|---|---|
| `GET/POST /api/share` | read who has access; link / reset-link / code / invite / role / remove / stop |
| `POST /api/share/accept` | join by `{token}`, `{code}` or `{invite}` |
| `GET /api/shared` | everything shared with me (claims emailed invitations first) |
| `GET/POST /api/shared/conversation/[id]` | read a shared conversation; append turns, change its map or title |
| `GET/POST/PATCH /api/shared/comments` | comments |
| `GET /api/shared/activity` | history (a Project's includes its conversations') |
| `POST /api/shared/presence` | heartbeat and pointer; who else is here |

Tests:

- `test/share-e2e.test.mjs`: five people through the real routes. It covers
  permissions, revocation, simultaneous writes, the stale-tab merge, map
  conflicts, privacy of memories and emails, presence, history and incognito.
- `test/share-roles.test.mjs`: the role table.
