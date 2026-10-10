# Think Together as a group chat

Several people in one line of thinking, with Socria among them. Socria answers
when it is asked. Nothing anyone says, Socria included, disappears.

This covers both ways people think together: a **shared line of thinking**
(Share, `docs/SHARING.md`), on Logos and in a Core conversation, and the
older two-seat **room** (`docs/LOGOS-ROOMS-PARKED.md`). The same rules apply in
each.

## What was wrong

"Socria sometimes disappears in the chat" had two independent causes. Both were
reproduced in simulation before anything was changed, and both are covered by
tests now.

1. **In a room, Socria's answer was never part of the room.** Only people's
   turns became room events. The answer was written into the asker's screen
   alone. A poll every two seconds repainted that screen from the room's
   record, which held no answer. So the answer vanished from the asker's
   screen, sometimes after flickering back once, and the other person never
   saw it.
2. **In a shared line of thinking, unsent turns were found by position.** One
   counter ("the turns after the ones I saw") indexed two different lists: the
   server's row and this screen. When the other person wrote in between, the
   two came apart. This screen's next turn and Socria's answer to it were then
   never sent. The next time the screen took in the server's copy, they were
   wiped from it. Three other paths led to the same loss:
   - a map refused as stale (409) took the turns sent with it down too;
   - Socria's answer landed as the copy of the conversation taken when the
     question went, erasing whatever had arrived meanwhile;
   - a first read after reopening a session replaced it outright.

   The Core shared thread had its own version of this: the poll replaced the
   thread mid-send, the answer vanished between the end of the stream and the
   reload, and it was dropped if the save failed.

## How it works now

**Every message has a name.** It is given an id where it is made
(`lib/chat-thread.ts newMsgId`), and every sanitizer keeps it: the
conversations route, the shared route, the room's transport and seed. Messages
from before ids existed carry none. They are the server's, in the server's
order, and are never re-sent.

**A shared line of thinking syncs by id** (`lib/share/sync.ts`):

- **What goes out** is this screen's turns whose ids the server has never held,
  and its map if it changed. The server skips an id it already has, so a retried
  write lands once.
- **What comes in**, whether a poll, a write's answer or a refused map, is joined
  with the screen and never laid over it. The server's turns come in its order,
  then this screen's turns the server has not had yet.
- **The map** goes whole, against the version it was drawn on. A stale map is
  refused (409), but **the turns sent with it are appended anyway**. This
  client's version only moves once it also holds the server's map. So a map
  drawn here is never sent against a version whose map it has not seen, and it
  cannot overwrite someone else's map.
- **Failed writes are retried** with backoff (2, 4, 8, 16 and 30 seconds,
  honouring `Retry-After` on 429). The poll also re-sends anything still unsent.

**In a room, Socria's answer is a room event** (`onLocalReply`). It is in the
record on both screens, signed by nobody: a person's turn is signed, and
Socria's answer instead points at the turn it answers. An event that changes
nothing, such as your own echoed back, no longer repaints the screen.

**An answer lands in the conversation as it is now** (`landReply`), after
whatever arrived while it was being written. A failed turn is removed by its own
id (`withoutTurn`), not by position or snapshot.

## Who Socria answers

**Alone**, everything is said to Socria, as always. This includes a shared line
of thinking that nobody else has open right now.

**In a group** (anyone else here now, by presence), a message goes to everyone,
and Socria answers when it is asked:

- **`@socria`** anywhere in the message, at the start or after a space or
  punctuation (not inside `me@socria.app`). Typing `@so` offers to finish it;
  Tab or Enter accepts.
- **Reply** to one of Socria's messages.

Anything else is just posted. There is no model call, no map pass and nothing
spent, so people can talk to each other freely. Asking Socria is a message
like any other: on the free plan it counts toward the day of whoever asked —
a guest's never lands on the host (`docs/SHARING.md`). You can keep talking to the
others while Socria answers someone. Asking Socria a second time from the same
screen waits until its current answer is in.

Socria is told everyone's names, who asked it, and how (`addressedBlock` in
`lib/collab.ts`). It answers that person plainly and first, and still never
takes a side between them. Its answer says whom it answers ("Socria → Ben", or
"→ You" on your own screen). Everyone else sees "Socria is answering Ben…"
while it writes; this appears at the next heartbeat, so up to about four
seconds late.

The map is redrawn when Socria answers, from everything said so far, everyone's
words included. Messages that don't ask Socria don't trigger a map pass by
themselves.

## The layout

A conversation more than one person is in reads like a group chat
(`components/LogosMessage.tsx`, `components/logos-thread.css`):

- **your words on the right**;
- **everyone else on the left**, with their initial and their name in their own
  colour (`lib/share/hue.ts`, chosen to read on every theme);
- **Socria on the left** with its mark, in a light card.

A run of messages from one person shows the name and face once. A shared
conversation keeps this layout even while you are alone in it. A conversation
nobody else has been in looks exactly as it did.

## Reply and Copy, everywhere

Every one of Socria's messages can be **replied to** and **copied**: in Logos
(2 and 3), in a Core conversation, and in a shared Core conversation. This
works alone as well as in a group. In a group, other people's messages can be
replied to as well.

- **Reply** puts a quote of the message above the box ("Replying to Socria"),
  with × or Esc to let it go. The sent message shows the quote; pressing the
  quote goes to the message it answers.
- **The quote travels with the message** as its own small snapshot (who said it,
  and a line of it), so it still reads after the original has scrolled out of
  the 200 kept.
- **The model sees the quote** as one fixed-format line before the person's
  words: `[Replying to your earlier message: “…”]`. It is clipped, one line, and
  built on the server, so it can only ever read as a quote.
- **Copy** copies the whole message as it was said, and says "Copied" only
  when the copy actually worked.

On a screen with a pointer, Reply and Copy appear on hover and keyboard focus,
in the gap under the message, so they add no height. On a touch screen they are
always shown.

## Privacy

What Socria knows about one person never reaches an answer that others will
read.

- **The person's memory** is never sent from the client in a room, a shared
  line of thinking, or someone else's session. The server also refuses it
  whenever two or more people are named.
- **The Mind graph is never touched** in any of those.
- **The understanding pass**, which reads a conversation into one person's
  private profile, never runs on a conversation anyone else is in. Before this
  change it was guarded for rooms only.

## Tests

- `test/share-sync.test.mjs` (46): every loss mechanism above is replayed
  against a small server with the route's rules and two clients running the
  hook's decisions. No turn and no answer is lost, and both screens end up
  holding exactly the server's conversation.
- `test/share-e2e.test.mjs`: the real route. Turns beside a stale map are
  appended, a retried write lands once, each person is told the alias they are
  signed with, and a bad id or multi-line quote is cleaned.
- `test/chat-thread.test.mjs` (44): ids, reply snapshots, the @socria rule,
  landing an answer, and the room's reducer (Socria's answer is in the record
  and signed by nobody; an echoed event changes nothing).
- `test/logos3.test.mjs`: the real chat route. Three people are named, "asked
  directly" is honoured only in a group, a reply's quote reaches the model, and
  private memory stays out of a group answer, checked against a control in
  which it does reach a solo answer.
- `test/think-together-chat.test.mjs` (38): the wiring between these.

The browser checks below used two Chromium contexts on an in-memory copy of
the shared route, with Socria's answers delayed so people's messages
interleave:

- **Logos (28 checks).** The gate and the layout on both screens. Socria's
  answer stays on both screens through later writes and polls. Both screens
  match the server, each message stored once. Reply, Copy and @socria work.
- **Core shared thread (18 checks).** The same, in a Core conversation.
- **Alone (21 checks).** Reply, Copy, Esc, and jumping from a quote to its
  message, in Logos 2, Logos 3 and Core chat.

## Not done, or not yet proven

- **Real backends.** Nothing here has run against a real Supabase or Clerk. The
  routes are tested with the in-memory database and fake Clerk, and the browser
  checks fake the network.
- **The room path in a browser.** Its fix is covered by the reducer tests and
  the wiring tests, but not by a two-browser run. On `dev`, a room is reachable
  only through an old `?join=` link.
- **Socria's answer still travels through the asker's browser.** If that tab
  closes while Socria is writing, the question stays and the answer is lost.
  Writing the answer from the server would close this, and would also close the
  next gap. It is a larger change, because the client edits the answer (picture
  ops, memory markers) before saving it.
- **Socria's messages can be posted by any editor.** This was already true:
  the shared route accepts assistant messages from anyone allowed to ask,
  because the client carries Socria's answer.
- **Others see Socria's answer when it is finished**, not as it streams. They see
  "answering…" until then.
- **Notes and images attached to a turn** stay on the screen that attached them;
  other people see the words. This was already true.
- **Comments on a turn are anchored by position.** After the 200 cap, or with
  turns arriving in between, a comment can drift to the wrong turn. This was
  already true. Anchoring comments to the new message ids would fix it.
