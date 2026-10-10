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
//
// MODELS AND OBJECTS GO THROUGH IT TOO. Every flush puts the room's session on
// screen, so a model edit or a scene step made here that the room never heard
// of was painted away by the next event from the other person — and never
// reached them. In a room, the caller hands every such change to
// onLocalModel / onLocalModels and onLocalObjectStep / onLocalObjects (see
// CollabHandle). A slider drag is sent at most every SEND_EVERY_MS (the last
// position wins), applied here at once so nothing jumps back meanwhile.
//
// AND A SEND THAT FAILS IS SAID. The transport reports anything it could not
// deliver — too large (413), refused, out of retries — and the hook keeps the
// last such sentence in `sendError` and hands it to `onError`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyEvent, byOf, cleanName, eventId, initialState, joinUrl, nextStamp, partOf,
  seatFor, type CollabEvent, type CollabState, type Participant, type Seat,
} from '@/lib/collab';
import { openTransport, type SendFailure, type Transport } from '@/lib/collab-transport';
import { docKey, type ModelDoc, type ModelWorkspace } from '@/lib/model/docs';
import { objectKey } from '@/lib/share/sync';
import type { ObjectSpace, ThoughtObject } from '@/lib/objects';
import type { LogosMsg, LogosSession } from '@/lib/logos-sessions';
import type { LogosNode, ThinkingMap } from '@/lib/logos';

/** A model or object edit made here goes to the room at most this often; the last one wins. */
export const SEND_EVERY_MS = 300;

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
  /** call when Socria answers here — applies and broadcasts it, so it is in the
      room's record on both screens and no later event can paint it away */
  onLocalReply: (m: LogosMsg) => LogosMsg;
  /** call when the host's extractor produces a new map; returns it with each
      node attributed to whoever it was drawn from, so the local view and the
      broadcast agree. Returns the map unchanged when not in a room.
      A model or object the map brings that the room does not have yet (a
      model built this turn) is sent as its own revision first; what the room
      already holds is not resent, and nothing the map leaves out is removed. */
  onLocalMap: (map: ThinkingMap) => ThinkingMap;
  /** hand a node onto the shared map */
  onLocalNode: (node: LogosNode) => void;
  /**
   * Call after ANY change made here to one model document — a slider or
   * cursor through docs.adopt, an undo / redo / restore / reset, a verb from
   * the conversation — with the document as it now stands, or `null` once it
   * is deleted. `active: true` when this is now the document being shown.
   * Applied to the room at once; sent at most every SEND_EVERY_MS. A no-op
   * outside a room.
   */
  onLocalModel: (docId: string, doc: ModelDoc | null, opts?: { active?: boolean }) => void;
  /**
   * The same for a whole workspace, after something that may have touched
   * several documents (applyModelOps): each document that differs from the
   * room's copy is sent, each one the room shows that is gone is sent as
   * deleted, and a changed `active` is sent. A no-op outside a room.
   */
  onLocalModels: (models: ModelWorkspace | null | undefined) => void;
  /**
   * Call after ANY change made here to one object of thought — a step
   * applied (core.apply), a look back along its history (seek), one created —
   * with the object as it now stands, or `null` once it is removed. A no-op
   * outside a room.
   */
  onLocalObjectStep: (objId: string, obj: ThoughtObject | null) => void;
  /** The same for a whole object space (after commitObjects, say): each object that differs from the room's is sent. */
  onLocalObjects: (space: ObjectSpace | null | undefined) => void;
  /**
   * The last thing sent to the room that did not arrive, in words — too
   * large, refused, or out of retries — or null. Show it; it clears when the
   * next send arrives, or with clearSendError.
   */
  sendError: string | null;
  clearSendError: () => void;
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
  /**
   * Told whenever something sent to the room did not arrive, after any
   * retries: why (`error`, a sentence), what (`kinds`, `ids`), and whether
   * sending it again could help (`tooLarge`). Optional; `sendError` carries
   * the same sentence.
   */
  onError?: (failure: SendFailure) => void;
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
  const [sendError, setSendError] = useState<string | null>(null);
  const onErrorRef = useRef(opts.onError);
  onErrorRef.current = opts.onError;
  /** model and object edits applied here and not yet sent: the latest per document or object */
  const pendingRef = useRef<Map<string, CollabEvent>>(new Map());
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /** Send one event; a send that arrives clears the last failure (a failure is reported by the transport). */
  const deliver = useCallback((t: Transport, ev: CollabEvent) => {
    void t.send(ev).then((r) => {
      if (r.ok) setSendError(null);
    });
  }, []);

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
    deliver(t, ev);
  }, [flush, deliver]);

  /** Send every model and object edit still waiting — the latest of each. */
  const sendPending = useCallback(() => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
    const t = transportRef.current;
    const evs = [...pendingRef.current.values()];
    pendingRef.current.clear();
    if (!t) return;
    for (const ev of evs) deliver(t, ev);
  }, [deliver]);

  // A model or object edit: stamped past everything seen, applied here AT ONCE
  // (so the next flush cannot paint it away), and sent soon — only the latest
  // for each document or object, so a drag is not a hundred requests.
  const emitPart = useCallback(
    (key: string, partial: { kind: 'model.revision'; docId: string; doc?: ModelDoc | null; active?: boolean } | { kind: 'object.step'; objId: string; obj: ThoughtObject | null }, now = false) => {
      const st = stateRef.current;
      if (!st || !transportRef.current) return;
      const at = Date.now();
      const ev = { id: eventId(at), at, by: byOf(st.me), stamp: nextStamp(st, at), ...partial } as CollabEvent;
      stateRef.current = applyEvent(st, ev);
      flush();
      pendingRef.current.set(key, ev);
      if (now) sendPending();
      else if (!pendingTimer.current) pendingTimer.current = setTimeout(sendPending, SEND_EVERY_MS);
    },
    [flush, sendPending]
  );

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
      const next = applyEvent(st, ev);
      // Our own event coming back, or one already here: nothing changed, and
      // nothing is repainted — a repaint from the record used to be how an
      // answer not yet in it was wiped off the screen.
      if (next === st) return;
      stateRef.current = next;
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
      setSendError(null);
      t.onEvent(applyRemote);
      // Whatever could not be delivered is said — never ignored.
      t.onError?.((f) => {
        setSendError(f.error);
        onErrorRef.current?.(f);
      });
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
    // an edit still waiting goes before the goodbye
    sendPending();
    const t = transportRef.current;
    const st = stateRef.current;
    const serverId = roomServerIdRef.current;
    if (t && st) {
      const at = Date.now();
      void t.send({ id: eventId(at), at, by: byOf(st.me), kind: 'bye' } as CollabEvent);
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
    setSendError(null);
  }, [sendPending]);

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

  useEffect(
    () => () => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
      transportRef.current?.close();
    },
    []
  );

  // ── the local hooks LogosApp calls ──────────────────────────────────

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

  const onLocalReply = useCallback(
    (m: LogosMsg): LogosMsg => {
      if (!stateRef.current) return m;
      const { by: _signed, ...words } = m;
      const reply: LogosMsg = { ...words, role: 'assistant' };
      emit({ kind: 'message', message: reply } as never);
      return reply;
    },
    [emit]
  );

  const onLocalMap = useCallback(
    (map: ThinkingMap): ThinkingMap => {
      if (!stateRef.current) return map;
      // A MODEL OR OBJECT THE ROOM DOES NOT HAVE — built this turn, or rebuilt
      // under an id the room holds as deleted — goes as its own revision, now,
      // ahead of the map: an edit-ranked copy that no stale extraction can
      // roll back. One a person's edit already holds cannot be beaten by the
      // map's copy, so it is not sent again; one only a seed or another map
      // holds rides along, as a map's copy.
      const keepDocs: ModelDoc[] = [];
      for (const d of map.models?.docs ?? []) {
        const cell = partOf(stateRef.current, 'doc', d.id);
        if (!cell || cell.value === null) {
          emitPart(`doc:${d.id}`, { kind: 'model.revision', docId: d.id, doc: d, ...(map.models?.active === d.id ? { active: true } : {}) }, true);
        } else if (cell.stamp < 1) keepDocs.push(d);
      }
      const keepObjs: ThoughtObject[] = [];
      for (const o of map.objects?.objs ?? []) {
        const cell = partOf(stateRef.current, 'obj', o.id);
        if (!cell || cell.value === null) emitPart(`obj:${o.id}`, { kind: 'object.step', objId: o.id, obj: o }, true);
        else if (cell.stamp < 1) keepObjs.push(o);
      }
      const slim: ThinkingMap = { ...map };
      if (keepDocs.length && map.models) slim.models = { ...map.models, docs: keepDocs };
      else delete slim.models;
      if (keepObjs.length) slim.objects = { objs: keepObjs };
      else delete slim.objects;
      emit({ kind: 'map', map: slim } as never);
      // emit applied it through the reducer, which credited each node — hand
      // nodes keep their author, new ones go to the last speaker. Hand that
      // attributed map back so the caller's own view matches the broadcast.
      return stateRef.current?.session?.map ?? map;
    },
    [emit, emitPart]
  );

  const onLocalModel = useCallback(
    (docId: string, doc: ModelDoc | null, o?: { active?: boolean }) => {
      const st = stateRef.current;
      if (!st) return;
      const cell = partOf(st, 'doc', docId);
      const unchanged = cell
        ? cell.value === doc || (cell.value === null && doc === null) || (!!cell.value && !!doc && docKey(cell.value) === docKey(doc))
        : doc === null; // deleting what the room never had is nothing to say
      if (!unchanged) emitPart(`doc:${docId}`, { kind: 'model.revision', docId, doc });
      if (o?.active && doc) {
        const shown = stateRef.current?.session?.map.models?.active ?? null;
        if (shown !== docId) emitPart('active', { kind: 'model.revision', docId, active: true });
      }
    },
    [emitPart]
  );

  const onLocalModels = useCallback(
    (models: ModelWorkspace | null | undefined) => {
      const st = stateRef.current;
      if (!st) return;
      const docs = models?.docs ?? [];
      for (const d of docs) onLocalModel(d.id, d);
      // a document the room shows that this workspace no longer has was deleted here
      for (const d of st.session?.map.models?.docs ?? []) if (!docs.some((x) => x.id === d.id)) onLocalModel(d.id, null);
      const want = models?.active ?? null;
      const doc = want ? docs.find((d) => d.id === want) : undefined;
      if (doc) onLocalModel(doc.id, doc, { active: true });
    },
    [onLocalModel]
  );

  const onLocalObjectStep = useCallback(
    (objId: string, obj: ThoughtObject | null) => {
      const st = stateRef.current;
      if (!st) return;
      const cell = partOf(st, 'obj', objId);
      const unchanged = cell
        ? cell.value === obj || (cell.value === null && obj === null) || (!!cell.value && !!obj && objectKey(cell.value) === objectKey(obj))
        : obj === null;
      if (!unchanged) emitPart(`obj:${objId}`, { kind: 'object.step', objId, obj });
    },
    [emitPart]
  );

  const onLocalObjects = useCallback(
    (space: ObjectSpace | null | undefined) => {
      const st = stateRef.current;
      if (!st) return;
      const objs = space?.objs ?? [];
      for (const o of objs) onLocalObjectStep(o.id, o);
      for (const o of st.session?.map.objects?.objs ?? []) if (!objs.some((x) => x.id === o.id)) onLocalObjectStep(o.id, null);
    },
    [onLocalObjectStep]
  );

  const clearSendError = useCallback(() => setSendError(null), []);

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
    onLocalReply,
    onLocalMap,
    onLocalNode,
    onLocalModel,
    onLocalModels,
    onLocalObjectStep,
    onLocalObjects,
    sendError,
    clearSendError,
    people,
  };
}

export { seatFor };
