'use client';
// components/share/useSharedSession.ts
//
// THINK TOGETHER IN LOGOS: one shared line of thinking, kept in step on
// every screen that has it open.
//
// The server's row is the canonical state (/api/shared/conversation). This
// hook keeps a client in step with it:
//
//   send     what this client has that the server does not (lib/share/sync.ts
//            outgoing): turns the server has never held, by id, and the map
//            sent against the version it was drawn on. Serialised, retried
//            with backoff when the network or the rate limit says no — a
//            person's turn, and Socria's answer to it, are not dropped because
//            one request failed.
//   receive  a cheap poll; a newer row is JOINED with what is on screen
//            (lib/share/sync.ts absorb), never laid over it, so someone else's
//            write landing first cannot wipe what was said here
//   presence who is here, their role, where their pointer is on the map, and
//            who is waiting on an answer from Socria
//
// Every answer the server gives — to a poll, to a write, to a refused map —
// goes through the same absorb, for the session it was asked about. A session
// switched away from mid-request is left alone.
//
//   a refused map (409) is MERGED with this screen's, part by part, and the
//            merge is what goes next (lib/share/sync.ts mergeMaps) — the old
//            wholesale take cost a collaborator their slider moves, scene
//            steps and the model they had just built
//   a map that went in moves the version to the one the server's answer
//            names, never to "whichever version stored the same bytes" — so
//            a client cannot be refused against its own write
//   a viewer or commenter never writes the map, so the server's is always
//            the one shown and a stray local change cannot freeze the screen
//
// Inactive for a session nobody else can reach: an unshared line of thinking
// is saved exactly as before.

import { useCallback, useEffect, useRef, useState } from 'react';
import { absorb, outgoing, settled, unseen, type Seen, type SyncTurn } from '@/lib/share/sync';
import { can, type Role } from '@/lib/share/roles';

export interface Present {
  id: string;
  name: string;
  you: boolean;
  role: Role;
  cursor: { x: number; y: number; on?: string } | null;
  /** waiting on an answer from Socria — so everyone else can see one is coming */
  doing?: 'asking' | null;
  at: number;
}

/** What a newer row changes on screen. */
export interface RemoteUpdate {
  messages: SyncTurn[];
  /**
   * The map the screen should now show, when it should change: the server's,
   * or — after this client's map was refused — the server's merged with this
   * screen's (it already holds everything of this screen's that could be
   * kept). Put it on screen as it is; the hook sends it next.
   */
  map?: unknown;
  /**
   * What of this screen's a merge could not keep — a step that no longer
   * applies, a model someone else closed — in words. Worth showing the person
   * (a note under the reply, say); absent when nothing was lost.
   */
  lost?: string[];
  title?: string;
}

interface Remote {
  messages: SyncTurn[];
  map: unknown;
  title: string;
  updatedAt: number;
}

const POLL_MS = 2500;
const BEAT_MS = 4000;
/** a pointer moving over the map is reported at most this often */
const POINT_MS = 1500;
/** waits before trying a failed write again */
const RETRY_MS = [2000, 4000, 8000, 16000, 30000];

export function useSharedSession(opts: {
  enabled: boolean;
  sessionId: string | null;
  /** that session as this client holds it now */
  getLocal: (id: string) => { messages: SyncTurn[]; map: unknown; title?: string } | null;
  /** a reply is streaming: the map on screen is about to be redrawn from it */
  busy: boolean;
  /** what the server holds, joined with this screen: put it on screen, for that session */
  onRemote: (id: string, r: RemoteUpdate) => void;
}) {
  const [shared, setShared] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [owner, setOwner] = useState('');
  const [me, setMe] = useState('');
  const [people, setPeople] = useState<Present[]>([]);
  const seen = useRef<Seen | null>(null);
  const sid = useRef<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const cursor = useRef<{ x: number; y: number; on?: string } | null>(null);
  const doing = useRef<'asking' | null>(null);
  /** the server refused this client's writes (its role does not allow them) */
  const blocked = useRef(false);
  /** this client may not write the map: its role says so, or the server did (403) */
  const readOnly = useRef(false);
  const beatRef = useRef<(() => void) | null>(null);
  const lastBeat = useRef(0);
  const ownKey = useRef('');
  const retry = useRef<{ n: number; t: ReturnType<typeof setTimeout> | null }>({ n: 0, t: null });
  const pushRef = useRef<(() => Promise<boolean>) | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  /**
   * A row from the server, taken in for session `id` and put on screen if
   * anything changed. `conflict`: it answers a refused map, which is merged
   * with this screen's. `sent`: it acknowledges this map, which went in.
   */
  const take = useCallback((id: string, remote: Remote, how: { conflict?: boolean; sent?: unknown } = {}) => {
    const local = optsRef.current.getLocal(id);
    const base = seen.current ?? unseen(local);
    const r = absorb(base, remote, local ?? { messages: [], map: null }, { busy: optsRef.current.busy, conflict: how.conflict, sent: how.sent, readOnly: readOnly.current });
    seen.current = r.seen;
    const retitled = !!remote.title && remote.title !== local?.title;
    if (r.changed || retitled || !local) {
      optsRef.current.onRemote(id, {
        messages: r.messages,
        ...(r.takeMap ? { map: r.map } : {}),
        ...(r.lost?.length ? { lost: r.lost } : {}),
        ...(remote.title ? { title: remote.title } : {}),
      });
    }
  }, []);

  /** Try the write again later — sooner for a blip, never faster than the server asks. */
  const later = useCallback((afterSeconds = 0) => {
    const r = retry.current;
    if (r.t) return;
    const wait = Math.max(afterSeconds * 1000, RETRY_MS[Math.min(r.n, RETRY_MS.length - 1)]);
    r.n += 1;
    r.t = setTimeout(() => {
      r.t = null;
      void pushRef.current?.();
    }, wait);
  }, []);

  /**
   * Send what is new — read from the session as it is when the write goes, not
   * as it was when it was asked for. Serialised, so this client never races
   * itself; returns true when the server holds everything this screen has.
   */
  const push = useCallback((): Promise<boolean> => {
    const run = async (): Promise<boolean> => {
      // more than one round when more is waiting than one write carries
      for (let round = 0; round < 3; round++) {
        const id = sid.current;
        // a role that may not change it never writes — nothing here could go in
        if (!id || !seen.current || blocked.current || readOnly.current) return false;
        const local = optsRef.current.getLocal(id);
        if (!local) return false;
        const o = outgoing(seen.current, local);
        if (!o.append.length && o.map === undefined) {
          retry.current.n = 0;
          return true;
        }
        const body: Record<string, unknown> = { base: seen.current.version };
        if (o.append.length) body.append = o.append;
        if (o.map !== undefined) body.map = o.map;
        const res = await fetch(`/api/shared/conversation/${encodeURIComponent(id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).catch(() => null);
        if (sid.current !== id) return false;
        if (!res) {
          later();
          return false;
        }
        if (res.status === 403) {
          // a viewer or commenter: their screen may change, the shared one may
          // not — and from now on it follows the shared one, whatever it holds
          blocked.current = true;
          readOnly.current = true;
          return false;
        }
        const j = await res.json().catch(() => null);
        if (sid.current !== id || !seen.current) return false;
        // someone changed the map first: theirs and this screen's are merged,
        // part by part, and the merge goes in the next round — the turns sent
        // with the refused map went in regardless, the server appends them
        const conflict = res.status === 409 && !!j?.conflict;
        if ((!res.ok && !conflict) || !Array.isArray(j?.messages)) {
          later(res.status === 429 ? Number(res.headers.get('Retry-After')) || 0 : 0);
          return false;
        }
        // a map that went in is the server's map now, AT THE VERSION ITS ANSWER
        // NAMES — whatever bytes the server stored it in
        const sent = o.map !== undefined && !conflict && j?.accepted?.map !== false ? o.map : undefined;
        take(id, { messages: j.messages, map: j.map ?? null, title: '', updatedAt: Number(j.updatedAt) || 0 }, { conflict, sent });
        retry.current.n = 0;
      }
      return true;
    };
    const next = queue.current.then(run, run);
    queue.current = next.catch(() => false);
    return next;
  }, [take, later]);
  pushRef.current = push;

  const read = useCallback(async (quiet: boolean) => {
    const id = sid.current;
    if (!id) return;
    const q = quiet && seen.current ? `?since=${seen.current.version}` : '';
    const res = await fetch(`/api/shared/conversation/${encodeURIComponent(id)}${q}`, { cache: 'no-store' }).catch(() => null);
    if (sid.current !== id) return;
    if (!res || !res.ok) {
      if (!quiet) {
        setShared(false);
        setRole(null);
      }
      return;
    }
    const j = await res.json().catch(() => null);
    if (!j || sid.current !== id) return;
    if (!quiet) {
      setShared(!!j.shared);
      setRole(j.role);
      setOwner(j.owner ?? '');
      setMe(typeof j.me === 'string' ? j.me : '');
      // a role that may not change the map never sends one, and always shows the server's
      readOnly.current = blocked.current || (typeof j.role === 'string' && !can(j.role as Role, 'edit'));
    }
    if (!j.unchanged) {
      if (!j.shared || !j.conversation) return;
      take(id, {
        messages: j.conversation.messages ?? [],
        map: j.conversation.map ?? null,
        title: j.conversation.title ?? '',
        updatedAt: Number(j.conversation.updatedAt) || 0,
      });
    }
    // anything of this screen's the server still lacks goes now — a write that
    // failed, or a reply that landed while this session was not the open one
    const local = optsRef.current.getLocal(id);
    if (local && seen.current && !blocked.current && !readOnly.current && !settled(seen.current, local)) void push();
  }, [take, push]);

  // on opening a session: is it shared, and as what?
  useEffect(() => {
    sid.current = opts.enabled ? opts.sessionId : null;
    seen.current = null;
    blocked.current = false;
    readOnly.current = false;
    ownKey.current = '';
    doing.current = null;
    if (retry.current.t) clearTimeout(retry.current.t);
    retry.current = { n: 0, t: null };
    setShared(false);
    setRole(null);
    setMe('');
    setPeople([]);
    if (!opts.enabled || !opts.sessionId) return;
    void read(false);
  }, [opts.enabled, opts.sessionId, read]);

  useEffect(
    () => () => {
      if (retry.current.t) clearTimeout(retry.current.t);
    },
    []
  );

  // the poll, while shared
  useEffect(() => {
    if (!shared) return;
    const t = setInterval(() => {
      if (!document.hidden) void read(true);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [shared, read]);

  // presence, while shared
  useEffect(() => {
    if (!shared || !opts.sessionId) return;
    const id = opts.sessionId;
    let live = true;
    const beat = async () => {
      if (document.hidden) return;
      lastBeat.current = Date.now();
      const state = doing.current ? { doing: doing.current } : {};
      const res = await fetch('/api/shared/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'conversation', id, cursor: cursor.current || doing.current ? { ...(cursor.current ?? {}), ...state } : null }),
      }).catch(() => null);
      const j = res && res.ok ? await res.json().catch(() => null) : null;
      if (live && j?.present) setPeople(j.present);
    };
    beatRef.current = () => void beat();
    void beat();
    const t = setInterval(beat, BEAT_MS);
    return () => {
      live = false;
      beatRef.current = null;
      clearInterval(t);
      void fetch('/api/shared/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'conversation', id, leave: true }) }).catch(() => null);
    };
  }, [shared, opts.sessionId]);

  /** Where this person's pointer is on the map, in map coordinates — reported at most every 1.5s. */
  const point = useCallback((p: { x: number; y: number } | null) => {
    cursor.current = p ? { x: Math.round(p.x), y: Math.round(p.y), on: 'map' } : null;
    if (Date.now() - lastBeat.current > POINT_MS) beatRef.current?.();
  }, []);

  /** This person has asked Socria and is waiting on its answer (or no longer is) — told at once. */
  const asking = useCallback((on: boolean) => {
    const next = on ? 'asking' : null;
    if (doing.current === next) return;
    doing.current = next;
    beatRef.current?.();
  }, []);

  /** The owner's own Draft Space and node material, kept with a shared session. */
  const keepOwn = useCallback((draft: unknown, contexts: unknown) => {
    const id = sid.current;
    if (!id || role !== 'owner') return;
    let key = '';
    try { key = JSON.stringify([draft, contexts]); } catch { return; }
    if (key === ownKey.current) return;
    ownKey.current = key;
    // through the same queue as turns and the map, and the row it answers with
    // is taken in like any other — so the version this write made is recorded
    // only together with whatever anyone else wrote before it
    const run = async () => {
      const res = await fetch(`/api/shared/conversation/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, contexts }),
      }).catch(() => null);
      const j = res && res.ok ? await res.json().catch(() => null) : null;
      if (!j?.updatedAt || !seen.current || sid.current !== id || !Array.isArray(j.messages)) return;
      take(id, { messages: j.messages, map: j.map ?? null, title: '', updatedAt: Number(j.updatedAt) || 0 });
    };
    const next = queue.current.then(run, run);
    queue.current = next.catch(() => undefined);
  }, [role, take]);

  /** read again whether it is shared — after the Share sheet closes, say */
  const recheck = useCallback(() => {
    seen.current = null;
    void read(false);
  }, [read]);

  return { shared, role, owner, me, people, push, point, asking, keepOwn, recheck, active: shared && !!sid.current };
}
