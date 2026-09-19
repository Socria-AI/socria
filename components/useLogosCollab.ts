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
  applyEvent, byOf, cleanName, eventId, initialState, joinUrl, makeShareCode,
  seatFor, type CollabEvent, type CollabState, type Participant, type Seat,
} from '@/lib/collab';
import { openTransport, realtimeAvailable, type Transport } from '@/lib/collab-transport';
import type { LogosMsg, LogosSession } from '@/lib/logos-sessions';
import type { LogosNode, ThinkingMap } from '@/lib/logos';

export interface CollabHandle {
  /** in a shared room right now */
  active: boolean;
  /** the room code, once shared or joined */
  code: string | null;
  me: Participant;
  present: Participant[];
  /** 'realtime' reaches other devices; 'local' is same-browser only */
  reach: 'realtime' | 'local' | null;
  /** a link that opens this room for the other person */
  link: string | null;
  /** open a room around the current session (become host) */
  share: () => void;
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
  const [reach, setReach] = useState<'realtime' | 'local' | null>(null);

  const stateRef = useRef<CollabState | null>(null);
  const transportRef = useRef<Transport | null>(null);
  const meRef = useRef<Participant | null>(null);

  const me: Participant = useMemo(
    () => ({ id: identity.id || tabId(), name: cleanName(identity.name, 'You'), seat: 'host' }),
    [identity.id, identity.name]
  );

  // Push whatever the reducer now holds back to the UI.
  const flush = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    setPresent(st.present);
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
    const session = st.me.seat === 'host' ? getSession() : null;
    emit({ kind: 'hello', participant: st.me, ...(session ? { session } : {}) } as never);
  }, [emit, getSession]);

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
      const known = st.present.some((p) => p.id === ev.by.id) || ev.by.id === st.me.id;
      stateRef.current = applyEvent(st, ev);
      flush();
      if (ev.kind === 'hello' && !known && ev.by.id !== st.me.id) sendHello();
    },
    [flush, sendHello]
  );

  // ── opening a room ──────────────────────────────────────────────────

  const openRoom = useCallback(
    (roomCode: string, seat: Seat) => {
      const meHere: Participant = { ...me, seat };
      meRef.current = meHere;
      const session = seat === 'host' ? getSession() : null;
      stateRef.current = initialState(roomCode, meHere, session);
      const t = openTransport(roomCode);
      transportRef.current = t;
      setReach(t.kind === 'realtime' ? 'realtime' : 'local');
      setCode(roomCode);
      t.onEvent(applyRemote);
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
    openRoom(makeShareCode(), 'host');
  }, [openRoom]);

  const leave = useCallback(() => {
    const t = transportRef.current;
    const st = stateRef.current;
    if (t && st) {
      const at = Date.now();
      t.send({ id: eventId(at), at, by: byOf(st.me), kind: 'bye' } as CollabEvent);
      t.close();
    }
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
    // The seat is decided by who is already there; a fresh join is a guest.
    openRoom(joinCode, 'guest');
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
    leave,
    onLocalMessage,
    onLocalMap,
    onLocalNode,
    people,
  };
}

export { realtimeAvailable, seatFor };
