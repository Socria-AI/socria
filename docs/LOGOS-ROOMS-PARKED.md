# The two-seat room: parked, not deleted

The multiplayer room — two people in one Logos line of thinking, Socria as
the layer between them — was removed for the production cut
(`2d3bafe`, "Core 4 for production: everything it needs, and Logos 2
removed") and the last orphan went in `7f3b7f9`. It is **back in the tree,
unchanged, and switched off**, so that shipping it is a wiring job.

## What is in the tree

| Piece | Path | State |
| --- | --- | --- |
| Pure core (events, reducer, seats, codes, prompt block) | `lib/collab.ts` | restored verbatim, tested (`test/collab.test.mjs`) |
| Transport (BroadcastChannel locally, polling across devices) | `lib/collab-transport.ts` | restored verbatim, tested (`test/collab-transport.test.mjs`, `test/room-event-roundtrip.test.mjs`) |
| Server: rooms, membership, event log | `lib/logos-rooms-server.ts`, `lib/logos-rooms-shared.ts` | restored verbatim |
| Routes | `app/api/logos/room/{,events/,join/,leave/}route.ts` | restored; **every handler answers 404 unless `LOGOS_ROOMS=on`** (`lib/rooms-flag.ts`) |
| Client hook and bar | `components/useLogosCollab.ts`, `components/CollabBar.tsx` | restored verbatim; **imported by nothing** |
| Tables, indexes, RLS | `supabase/rooms.sql` | the block the cut removed from `schema.sql`; **not applied anywhere** |

The rate limiter still carries the `room` pool (`lib/rate-limit.ts`), and
`lib/logos.ts` still carries `by`/`Seat` on nodes and messages, so nothing the
room depends on has moved.

## What shipping it takes

1. Apply `supabase/rooms.sql` to the database (it is idempotent:
   `create … if not exists`). Do not merge it back into `schema.sql` until the
   feature is on, or a fresh environment will carry tables nothing reads.
2. Set `LOGOS_ROOMS=on` on the server. The four routes come alive; nothing
   else changes.
3. Re-wire `components/LogosApp.tsx`. The exact lines the cut removed are in
   the appendix below. In outline:
   - accept a `collab?: boolean` prop (the `logos-2` model entry used to carry
     `collab: true` in `lib/socria-prompt.ts`);
   - call `useLogosCollab({ enabled, identity, joinCode, getSession, setSession })`
     and keep the handle in a ref;
   - stamp and broadcast each sent turn through `room.onLocalMessage(turn)`,
     and each extracted map through `room.onLocalMap(map)`, only when the
     active session is a shared one;
   - pass `{ collab: { people } }` to `/api/logos/chat` when two people are
     present, which is what makes Socria answer as the layer between them
     (`collabBlock` in `lib/collab.ts`, read by the chat route — also in the
     appendix);
   - never persist a shared session to `/api/conversations`, and never run the
     understanding pass over one (both reasons are in the removed comments);
   - mount `<CollabBar room={room} />` in the header.
4. Put the two-seat sections back on `/docs/logos-2` and the blurb in
   `app/docs/registry.ts` — both were taken out when the room was parked
   (`git log -S "Two people, one map" -- app/docs`).

## Appendix: the wiring the cut removed

Generated with `git show 2d3bafe -- components/LogosApp.tsx app/api/logos/chat/route.ts components/ThinkingMap.tsx components/ModelPicker.tsx lib/socria-prompt.ts`. Lines beginning with `-` are what to put back.

```diff
diff --git a/app/api/logos/chat/route.ts b/app/api/logos/chat/route.ts
@@ -21,7 +21,6 @@ import {
-import { collabBlock, type Seat } from '@/lib/collab';
@@ -85,22 +84,6 @@ export async function POST(req: NextRequest) {
-    // The two people in a shared room, if this is one. Names only — never who
-    // is signed in, never an id — and cleaned to shape like every other field
-    // that arrives from a browser.
-    const collabPeopleFrom = (raw: unknown): { name: string; seat: Seat }[] => {
-      if (!raw || typeof raw !== 'object') return [];
-      const people = (raw as { people?: unknown }).people;
-      if (!Array.isArray(people)) return [];
-      return people
-        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
-        .map((p) => ({
-          name: typeof p.name === 'string' ? p.name.replace(/\s+/g, ' ').trim().slice(0, 40) : '',
-          seat: (p.seat === 'host' || p.seat === 'guest' ? p.seat : 'guest') as Seat,
-        }))
-        .filter((p) => p.name)
-        .slice(0, 2);
-    };
@@ -154,13 +137,6 @@ export async function POST(req: NextRequest) {
-    // Two people, or one? A shared Logos 2 room passes `collab.people` — the
-    // two display names — and each human turn carries a `by`. When both are
-    // present, every human line is prefixed with its author's name so the
-    // model always knows who said what; alone, nothing changes.
-    const collabPeople = collabPeopleFrom(body?.collab);
-    const twoPeople = collabPeople.length >= 2;
-
@@ -169,10 +145,9 @@ export async function POST(req: NextRequest) {
-        const name = twoPeople && m.role === 'user' ? nameOf(m.by) : '';
-          content: name && rendered ? `${name}: ${rendered}` : rendered,
@@ -337,12 +312,7 @@ export async function POST(req: NextRequest) {
-      memoryBlock +
-      // Logos 2: when two people are in the room, Socria becomes the layer
-      // between them. See lib/collab.ts collabBlock — it names both, confines
-      // the model to surfacing connections/disagreements/assumptions/questions
-      // between what each said, and forbids taking a side or concluding.
-      (twoPeople ? collabBlock(collabPeople) : '');
diff --git a/components/LogosApp.tsx b/components/LogosApp.tsx
@@ -23,9 +23,6 @@ import { DraftSpace, type DraftHandle, type DraftSelection } from '@/components/
-import { CollabBar } from '@/components/CollabBar';
-import { useLogosCollab } from '@/components/useLogosCollab';
-import { cleanName, joinCodeFrom, SEAT_COLOR } from '@/lib/collab';
@@ -211,13 +208,9 @@ export function LogosApp({
-  // Logos 2: this surface is a two-seat room. Everything below is unchanged
-  // when it is absent — single-player Logos does not know collab exists.
-  collab,
-  collab?: boolean;
@@ -1194,25 +1187,6 @@ export function LogosApp({
-      // A shared room is NOT saved to anybody's conversation row.
-      //
-      // It used to be: the host's client held the merged session — both
-      // people's messages — and PUT the whole thing to /api/conversations as
-      // itself. So the guest's words were stored under the host's user_id,
-      // where the guest could neither export nor delete them, and the host's
-      // export contained a second person's thinking.
-      //
-      // The room's own event log is the shared record now
-      // (logos_room_events), and every row in it carries the id of whoever
-      // wrote it. Each person exports what they contributed and deletes what
-      // they wrote; neither ends up holding the other's words by accident.
-      if (roomRef.current?.active) return;
-      // And not after leaving, either: the session still in memory is the
-      // MERGED one, both people's words. Persisting it on the way out would
-      // put the other person's thinking in this account's row — exactly the
-      // thing suppressing it during the room was for. A room's record is the
-      // room's; see lib/logos-rooms-server.ts.
-      if (sharedIdsRef.current.has(s.id)) return;
@@ -1247,40 +1221,6 @@ export function LogosApp({
-  // ── Logos 2 — two people in one workspace ───────────────────────────
-  //
-  // The whole of collaboration lives in this hook and the bar it feeds; the
-  // rest of LogosApp calls it at three points (a message sent, a map
-  // extracted, a node handed onto the map) and is otherwise untouched. When
-  // `collab` is absent the hook is disabled and nothing here runs.
-  const joinCode = useMemo(
-    () => (typeof window === 'undefined' ? null : joinCodeFrom(window.location.search)),
-    []
-  );
-  const roomIdRef = useRef<string | null>(null);
-  /** every session id that has ever been a shared room in this tab */
-  const sharedIdsRef = useRef<Set<string>>(new Set());
-  const room = useLogosCollab({
-    enabled: !!collab,
-    identity: { id: user?.id || '', name: cleanName(user?.firstName || user?.username, 'You') },
-    joinCode,
-    getSession: () => sessionsRef.current.find((x) => x.id === activeIdRef.current) ?? null,
-    setSession: (shared) => {
-      sharedIdsRef.current.add(shared.id);
-      // A guest with no session of its own adopts the host's; both then keep
-      // the shared session as the active one, merged by the reducer.
-      roomIdRef.current = shared.id;
-      applySessions(
-        sessionsRef.current.some((x) => x.id === shared.id)
-          ? sessionsRef.current.map((x) => (x.id === shared.id ? shared : x))
-          : [shared, ...sessionsRef.current]
-      );
-      if (activeIdRef.current !== shared.id) setActiveId(shared.id);
-    },
-  });
-  const roomRef = useRef(room);
-  roomRef.current = room;
-
@@ -1598,15 +1538,7 @@ export function LogosApp({
-              // Share the extraction: the host draws, both see it. onLocalMap
-              // returns the map with each node attributed, so the local view
-              // shows the same author dots the other person sees; alone it
-              // returns the map unchanged.
-              const shown =
-                roomRef.current.active && sharedIdsRef.current.has(s.id)
-                  ? roomRef.current.onLocalMap(map)
-                  : map;
-              return { ...s, map: shown, contexts };
@@ -2011,14 +1943,7 @@ export function LogosApp({
-    // In a shared room the turn is stamped with who wrote it and broadcast to
-    // the other person before anything else happens. Alone, this returns the
-    // turn unchanged and sends nothing.
-    // In a room AND in the room's own session: switching to another line of
-    // thinking while a room is open must not broadcast it into that room.
-    const inShared =
-      roomRef.current.active && sharedIdsRef.current.has(activeIdRef.current ?? '');
-    const sent = inShared ? roomRef.current.onLocalMessage(turn) : turn;
@@ -2063,11 +1988,6 @@ export function LogosApp({
-          // Logos 2: the two people in the room, so Socria answers as the
-          // layer between them. Names only — never who is signed in.
-          ...(roomRef.current.active && roomRef.current.people.length >= 2
-            ? { collab: { people: roomRef.current.people } }
-            : {}),
@@ -2120,15 +2040,7 @@ export function LogosApp({
-        mapRef.current.context !== 'reflecting' &&
-        // NEVER from a shared room. The understanding pass reads the whole
-        // conversation and writes what it concludes into this account's
-        // permanent user_profiles row — so in a two-person room it would fold
-        // the other participant's words into a private profile they cannot
-        // see, export or delete. Suppressing the pass is the only version of
-        // this that is honest: there is no way to derive "what you seem to be
-        // working through" from a conversation without reading both halves.
-        !sharedIdsRef.current.has(sid)
@@ -2415,7 +2327,7 @@ export function LogosApp({
-          <header className={`lg-head${collab ? ' lg-head-collab' : ''}`}>
@@ -2462,9 +2374,6 @@ export function LogosApp({
-            {/* Logos 2: who is here, and how to bring someone in. Renders
-                nothing on plain Logos — the hook is disabled there. */}
-            {collab && <CollabBar room={room} />}
@@ -2592,7 +2501,6 @@ export function LogosApp({
-                style={m.by ? ({ '--by': SEAT_COLOR[m.by.seat] } as React.CSSProperties) : undefined}
diff --git a/components/ModelPicker.tsx b/components/ModelPicker.tsx
@@ -196,7 +196,7 @@ export function ModelPicker({
-            <span className="tag">{m.collab ? 'think together' : 'a different surface'}</span>
diff --git a/lib/socria-prompt.ts b/lib/socria-prompt.ts
@@ -1245,7 +1245,7 @@ It should feel like a conversation that develops naturally, accumulates insight,
-export type SocriaModel = 'core-2' | 'core-3' | 'logos' | 'logos-2' | 'core-4';
@@ -1281,13 +1281,8 @@ export interface ModelConfig {
-  /**
-   * This model opens the Logos surface (a Thinking Map beside the chat).
-   * Both Logos and Logos 2 set it; Logos 2 adds `collab` on top.
-   */
-  /** Logos 2: two people in one workspace. See lib/collab.ts. */
-  collab?: boolean;
@@ -1539,22 +1534,6 @@ export const SOCRIA_MODELS: Record<SocriaModel, ModelConfig> = {
-  // Logos 2 — two people in one Logos workspace, thinking together in real
-  // time. Socria sits between them as the shared reasoning layer. It is the
-  // same surface and the same model as Logos; `collab` is what turns the room
-  // into a two-seat one. See lib/collab.ts.
-  'logos-2': {
-    id: 'logos-2',
-    label: 'Socria Logos 2',
-    short: 'Logos 2',
-    description:
-      'Think together. Two people, one Thinking Map, Socria between you — naming the connections, the disagreements and the open questions.',
-    defaultOpenAIModel: 'gpt-5.6-sol',
-    supportsDepth: false,
-    requiresAuth: true,
-    logosSurface: true,
-    collab: true,
-  },
```
