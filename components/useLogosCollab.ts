'use client';
// components/useLogosCollab.ts
//
// Logos 2 wired into the Logos surface, in one hook, so the 2,700-line
// single-player machine keeps working untouched when collaboration is off.
//
// WHAT IT DOES. When the surface is in collab mode it owns a CollabState (the
// tested reducer from lib/collab.ts) and keeps the visible session in step
// with it through two thin callbacks the caller supplies — getSession /
// setSession. Local changes are handed to it at exactly two sites in
// LogosApp (a message sent, a map extracted); it stamps them with the local
// author, applies them, and broadcasts them. Inbound events from the other
// person are sanitised (in the transport), applied, and pushed back into the
// visible session.
//
// The reducer is the single source of convergence; this hook is only its
// plumbing to a React tree and a socket.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyEvent, byOf, cleanName, eventId, initialState, joinUrl,
  seatFor, type CollabEvent, type CollabState, type Participant, type Seat,
} from '@/lib/collab';
import { openTransport, type Transport } from '@/lib/collab-transport';
import type { LogosMsg, LogosSession } from '@/lib/logos-sessions';
import type { LogosNode, ThinkingMap } from '@/lib/logos';

export interface CollabHandle {
  /** in a shared room right now */
  active: boolean;
  /** the room code, once shared or joined */
  code: string | null;
  me: Participant;
  present: Participant[];
  /** how the room reaches the other person; one path now, through our server */
  reach: 'server' | null;
  /** a link that opens this room for the other person */
  link: string | null;
  /** open a room around the current session (become host) */
  share: () => void;
  /** ask the server for a seat in an existing room */
  join: (code: string) => void;
  /** why the last room action failed, if it did */
  error: string | null;
  /** leave the room; single-player resumes */
  leave: () => void;
  /** call when the local person sends a message — stamps, applies, broadcasts */
  onLocalMessage: (m: LogosMsg) => LogosMsg;
  /** call when the host's extractor produces a new map; returns it with each
      node attributed to whoever it was drawn from, so the local view and the
      broadcast agree. Returns the map unchanged when not in a room. */
  onLocalMap: (map: ThinkingMap) => ThinkingMap;
  /** hand a node onto the shared map */
  onLocalNode: (node: LogosNode) => void;
  /** the two names to send the API, so Socria knows who is in the room */
  people: { name: string; seat: Seat }[];
}

function tabId(): string {
  try {
    const k = 'socria.collab.tab.v1';
    let v = sessionStorage.getItem(k);
    if (!v) {
      v = 'tab_' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(k, v);
    }
    return v;
  } catch {
    return 'tab_' + Math.random().toString(36).slice(2, 10);
  }
}

export function useLogosCollab(opts: {
  /** the model is Logos 2 */
  enabled: boolean;
  /** the person's display name and stable id */
  identity: { id: string; name: string };
  /** read the session the surface is showing right now */
  getSession: () => LogosSession | null;
  /** replace the session the surface shows (a merged, shared one) */
  setSession: (s: LogosSession) => void;
  /** a join code read from the URL, if the person followed an invite */
  joinCode: string | null;
}): CollabHandle {
  const { enabled, identity, getSession, setSession, joinCode } = opts;

  const [code, setCode] = useState<string | null>(null);
  const [present, setPresent] = useState<Participant[]>([]);
  const [reach, setReach] = useState<'server' | null>(null);

  const stateRef = useRef<CollabState | null>(null);
  const transportRef = useRef<Transport | null>(null);
  const meRef = useRef<Participant | null>(null);
  /** the id the server issued for this room; null when not in one */
  const roomServerIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me: Participant = useMemo(
    () => ({ id: identity.id || tabId(), name: cleanName(identity.name, 'You'), seat: 'host' }),
    [identity.id, identity.name]
  );

  // Push whatever the reducer now holds back to the UI.
  /** Presence straight from the create/join response, so the room is never
   *  drawn empty — including empty of yourself — while the first poll runs. */
  const seatPresence = useCallback((who: unknown) => {
    if (!Array.isArray(who)) return;
    setPresent(
      who
        .filter((p): p is Participant => !!p && typeof (p as Participant).id === 'string')
        .map((p) => ({
          id: p.id,
          name: cleanName(p.name, 'Someone'),
          seat: p.seat === 'host' ? 'host' : 'guest',
        }))
    );
  }, []);

  const flush = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    // NOT st.present: that is the reducer's view, assembled from `hello`
    // events the other client wrote. Presence comes from the server (see
    // onPresence above) and nothing else may set it.
    if (st.session) setSession(st.session);
  }, [setSession]);

  // Stamp an event with id/at/author, apply it locally (the sender never
  // hears its own broadcast back), then send it.
  const emit = useCallback((partial: Omit<CollabEvent, 'id' | 'at' | 'by'> & Partial<Pick<CollabEvent, 'by'>>) => {
    const st = stateRef.current;
    const t = transportRef.current;
    if (!st || !t) return;
    const at = Date.now();
    const ev = { id: eventId(at), at, by: byOf(st.me), ...partial } as CollabEvent;
    stateRef.current = applyEvent(st, ev);
    flush();
    t.send(ev);
  }, [flush]);

  // Announce ourselves. The host carries the current session so a guest can
  // adopt it; a guest sends a bare hello.
  const sendHello = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    // No session rides along: the room holds its own seed (see
    // logos_rooms.seed_session). This is only "I am here".
    emit({ kind: 'hello', participant: st.me } as never);
  }, [emit]);

  const applyRemote = useCallback(
    (ev: CollabEvent) => {
      const st = stateRef.current;
      if (!st) return;
      // Was this person already known to us before we apply the event? A
      // BroadcastChannel (and a fresh Realtime subscription) does not replay
      // what was said before we joined, so the ONLY way a late arrival learns
      // who is already here is a reply: when we first see someone's hello, we
      // answer with our own. The "before" check is the loop guard — we reply
      // to a newcomer, not to their reply to us.
      stateRef.current = applyEvent(st, ev);
      flush();
      // No hello-reply any more. It existed because BroadcastChannel does not
      // replay, so a late joiner could only learn who was there by being
      // told. The server keeps the log and the membership list, so a joiner
      // is handed both on /join — and the reply, which compared a
      // server-authored id against a locally-invented one, looped forever
      // whenever those two disagreed.
    },
    [flush, sendHello]
  );

  // ── opening a room ──────────────────────────────────────────────────

  const openRoom = useCallback(
    (
      roomCode: string,
      seat: Seat,
      serverRoomId: string,
      since = 0,
      seed: LogosSession | null = null,
      serverUserId?: string
    ) => {
      // OUR id is the one the server knows us by, not a tab id we invented.
      // They used to differ whenever Clerk had not resolved yet, and since
      // the server stamps every event with the real id, our own echoed
      // events looked like a stranger's — which made the hello-reply guard
      // fire forever on any room opened from an invite link.
      const meHere: Participant = { ...me, id: serverUserId || me.id, seat };
      meRef.current = meHere;
      // The room's session is the seed the server holds, under the ROOM's id
      // so it never collides with the host's own conversation.
      const session: LogosSession | null = seed
        ? ({ ...seed, id: `room_${serverRoomId}` } as LogosSession)
        : null;
      stateRef.current = initialState(roomCode, meHere, session);
      roomServerIdRef.current = serverRoomId;
      // The transport is opened on the id the SERVER issued after seating us,
      // never on a code somebody typed. A code asks for a seat; an id is only
      // ever handed back to someone already seated.
      const t = openTransport(serverRoomId, since);
      transportRef.current = t;
      setReach('server');
      setCode(roomCode);
      t.onEvent(applyRemote);
    // Presence is whatever the SERVER says it is. It used to be derived from
    // `hello` events, which are composed by the other client — so a
    // participant could claim any name, any seat, and a room could appear to
    // hold any number of people. The events route returns the membership rows
    // it checked us against; that list is the only one shown.
    const withPresence = t as Transport & {
      onPresence?: (fn: (who: Participant[]) => void) => void;
    };
    withPresence.onPresence?.((who) => {
      setPresent(
        who
          .filter((p) => p && typeof p.id === 'string')
          .map((p) => ({
            id: p.id,
            name: cleanName(p.name, 'Someone'),
            seat: p.seat === 'host' ? 'host' : 'guest',
          }))
      );
    });
      // Announce ourselves. Anyone already here replies (see applyRemote), so
      // a guest that opened after the host still learns of it and adopts its
      // session. Realtime's subscribe is async, so the hello is sent a beat
      // later — a lost first hello only costs a slightly later reply, never a
      // missed room.
      const announce = () => sendHello();
      announce();
      setTimeout(announce, 400);
      flush();
    },
    [me, getSession, applyRemote, emit, flush]
  );

  const share = useCallback(() => {
    if (stateRef.current) return; // already in a room
    void (async () => {
      try {
        // The room opens around a COPY of what the host is working on, under
        // the room's own id. The host's original conversation stays theirs —
        // saveable, exportable, deletable — and the copy belongs to the room,
        // where both people's contributions are attributed individually.
        // Marking the host's existing session as shared instead would have
        // made it permanently unsaveable the moment they hosted.
        const current = getSession();
        const res = await fetch('/api/logos/room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session: current ?? null }),
        });
        if (!res.ok) {
          setError(res.status === 401 ? 'Sign in to think together.' : 'Could not open a room.');
          return;
        }
        const json = await res.json();
        if (!json?.room?.code || !json?.room?.id) return;
        seatPresence(json.present);
        openRoom(json.room.code, 'host', json.room.id, 0, json.room.seed, json?.me?.id);
      } catch {
        setError('Could not open a room.');
      }
    })();
  }, [openRoom]);

  /** Follow an invite: ask the server for a seat, and only then open. */
  const join = useCallback(
    (code: string) => {
      if (stateRef.current) return;
      void (async () => {
        try {
          const res = await fetch('/api/logos/room/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });
          if (!res.ok) {
            setError(
              res.status === 401
                ? 'Sign in to join.'
                : res.status === 409
                  ? 'That room already has two people in it.'
                  : 'No open room with that code.'
            );
            return;
          }
          const json = await res.json();
          if (!json?.room?.id) return;
          seatPresence(json.present);
          openRoom(
            json.room.code ?? code,
            json?.me?.seat === 'host' ? 'host' : 'guest',
            json.room.id,
            typeof json.room.since === 'number' ? json.room.since : 0,
            json.room.seed,
            json?.me?.id
          );
        } catch {
          setError('Could not join that room.');
        }
      })();
    },
    [openRoom]
  );

  const leave = useCallback(() => {
    const t = transportRef.current;
    const st = stateRef.current;
    const serverId = roomServerIdRef.current;
    if (t && st) {
      const at = Date.now();
      t.send({ id: eventId(at), at, by: byOf(st.me), kind: 'bye' } as CollabEvent);
      t.close();
    }
    // Give the seat back so the room can be re-entered and so it closes when
    // the last person goes.
    if (serverId) {
      void fetch('/api/logos/room/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: serverId }),
      }).catch(() => {});
    }
    roomServerIdRef.current = null;
    transportRef.current = null;
    stateRef.current = null;
    meRef.current = null;
    setCode(null);
    setPresent([]);
    setReach(null);
  }, []);

  // Follow an invite: as soon as the surface is ready, join as guest.
  useEffect(() => {
    if (!enabled || !joinCode || stateRef.current) return;
    // The seat is decided by the SERVER, not by which door we came through.
    join(joinCode);
    return () => leave();
    // openRoom/leave are stable enough for a mount-time join; re-running on
    // their identity would re-join the room, which is not what a changed
    // callback should do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, joinCode]);

  useEffect(() => () => { transportRef.current?.close(); }, []);

  // ── the two local hooks LogosApp calls ──────────────────────────────

  const onLocalMessage = useCallback(
    (m: LogosMsg): LogosMsg => {
      const st = stateRef.current;
      if (!st) return m;
      const stamped: LogosMsg = { ...m, by: byOf(st.me) };
      emit({ kind: 'message', message: stamped } as never);
      return stamped;
    },
    [emit]
  );

  const onLocalMap = useCallback(
    (map: ThinkingMap): ThinkingMap => {
      if (!stateRef.current) return map;
      emit({ kind: 'map', map } as never);
      // emit applied it through the reducer, which credited each node — hand
      // nodes keep their author, new ones go to the last speaker. Hand that
      // attributed map back so the caller's own view matches the broadcast.
      return stateRef.current.session?.map ?? map;
    },
    [emit]
  );

  const onLocalNode = useCallback(
    (node: LogosNode) => {
      if (!stateRef.current) return;
      emit({ kind: 'node.add', node } as never);
    },
    [emit]
  );

  const link = useMemo(() => {
    if (!code || typeof window === 'undefined') return null;
    return joinUrl(window.location.origin, code);
  }, [code]);

  const people = useMemo(
    () => present.map((p) => ({ name: p.name, seat: p.seat })),
    [present]
  );

  return {
    active: !!code,
    code,
    me: meRef.current ?? me,
    present,
    reach,
    link,
    share,
    join,
    leave,
    error,
    onLocalMessage,
    onLocalMap,
    onLocalNode,
    people,
  };
}

export { seatFor };
