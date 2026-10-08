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
//            outgoing) — new turns appended, the map sent against the version
//            it was drawn on; a stale map comes back with the current one,
//            which is adopted
//   receive  a cheap poll; a newer version replaces what is on screen only
//            when nothing of this client's is still unsent
//   presence who is here, their role, and where their pointer is on the map
//
// Inactive for a session nobody else can reach: an unshared line of thinking
// is saved exactly as before.

import { useCallback, useEffect, useRef, useState } from 'react';
import { mayAdopt, outgoing, seenOf, type Seen, type SyncTurn } from '@/lib/share/sync';
import type { Role } from '@/lib/share/roles';

export interface Present {
  id: string;
  name: string;
  you: boolean;
  role: Role;
  cursor: { x: number; y: number; on?: string } | null;
  at: number;
}

interface Remote {
  messages: SyncTurn[];
  map: unknown;
  title: string;
  updatedAt: number;
}

const POLL_MS = 2500;
const BEAT_MS = 4000;

export function useSharedSession(opts: {
  enabled: boolean;
  sessionId: string | null;
  /** the session as this client holds it now */
  getLocal: () => { messages: SyncTurn[]; map: unknown } | null;
  /** a reply is streaming: a poll must not replace the screen under it */
  busy: boolean;
  /** a newer version from someone else: put it on screen */
  onRemote: (r: Remote) => void;
}) {
  const [shared, setShared] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [owner, setOwner] = useState('');
  const [people, setPeople] = useState<Present[]>([]);
  const seen = useRef<Seen | null>(null);
  const sid = useRef<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const cursor = useRef<{ x: number; y: number; on?: string } | null>(null);
  /** the server refused this client's writes (its role does not allow them) */
  const blocked = useRef(false);
  const beatRef = useRef<(() => void) | null>(null);
  const lastBeat = useRef(0);
  const ownKey = useRef('');
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const read = useCallback(async (quiet: boolean) => {
    const id = sid.current;
    if (!id) return;
    const q = quiet && seen.current ? `?since=${seen.current.version}` : '';
    const res = await fetch(`/api/shared/conversation/${encodeURIComponent(id)}${q}`, { cache: 'no-store' }).catch(() => null);
    if (!res || !res.ok || sid.current !== id) {
      if (!quiet) {
        setShared(false);
        setRole(null);
      }
      return;
    }
    const j = await res.json().catch(() => null);
    if (!j || j.unchanged) return;
    if (!quiet) {
      setShared(!!j.shared);
      setRole(j.role);
      setOwner(j.owner ?? '');
    }
    if (!j.shared) return;
    const remote: Remote = { messages: j.conversation.messages ?? [], map: j.conversation.map ?? null, title: j.conversation.title ?? '', updatedAt: j.conversation.updatedAt };
    const local = optsRef.current.getLocal();
    if (!seen.current) {
      seen.current = seenOf(remote);
      optsRef.current.onRemote(remote);
      return;
    }
    if (local && mayAdopt(seen.current, remote.updatedAt, local, optsRef.current.busy)) {
      seen.current = seenOf(remote);
      optsRef.current.onRemote(remote);
    }
  }, []);

  // on opening a session: is it shared, and as what?
  useEffect(() => {
    sid.current = opts.enabled ? opts.sessionId : null;
    seen.current = null;
    blocked.current = false;
    ownKey.current = '';
    setShared(false);
    setRole(null);
    setPeople([]);
    if (!opts.enabled || !opts.sessionId) return;
    void read(false);
  }, [opts.enabled, opts.sessionId, read]);

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
      const res = await fetch('/api/shared/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'conversation', id, cursor: cursor.current }),
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

  /**
   * Send what is new. Serialised, so this client never races itself; returns
   * true when the server took it all.
   */
  const push = useCallback((local: { messages: SyncTurn[]; map: unknown }): Promise<boolean> => {
    const run = async (): Promise<boolean> => {
      const id = sid.current;
      if (!id || !seen.current || blocked.current) return false;
      const o = outgoing(seen.current, local);
      if (!o.append.length && o.map === undefined) return true;
      const body: Record<string, unknown> = { base: seen.current.version };
      if (o.append.length) body.append = o.append;
      if (o.map !== undefined) body.map = o.map;
      const res = await fetch(`/api/shared/conversation/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => null);
      if (!res) return false;
      const j = await res.json().catch(() => null);
      if (res.status === 409 && j?.conflict) {
        // someone changed the map first: theirs is on screen now, and the
        // turns this client added are still appended on the next push
        const remote: Remote = { messages: j.messages ?? [], map: j.map ?? null, title: '', updatedAt: j.updatedAt };
        seen.current = seenOf(remote);
        optsRef.current.onRemote(remote);
        return false;
      }
      if (res.status === 403) {
        // a viewer or commenter: their screen may change, the shared one may not
        blocked.current = true;
        return false;
      }
      if (!res.ok) return false;
      seen.current = { count: Array.isArray(j?.messages) ? j.messages.length : seen.current.count + o.append.length, map: o.map !== undefined ? JSON.stringify(o.map) : seen.current.map, version: Number(j?.updatedAt) || seen.current.version };
      return true;
    };
    const next = queue.current.then(run, run);
    queue.current = next.catch(() => false);
    return next;
  }, []);

  /** Where this person's pointer is on the map, in map coordinates — sent at most every 700ms. */
  const point = useCallback((p: { x: number; y: number } | null) => {
    cursor.current = p ? { x: Math.round(p.x), y: Math.round(p.y), on: 'map' } : null;
    if (Date.now() - lastBeat.current > 700) beatRef.current?.();
  }, []);

  /** The owner's own Draft Space and node material, kept with a shared session. */
  const keepOwn = useCallback((draft: unknown, contexts: unknown) => {
    const id = sid.current;
    if (!id || role !== 'owner') return;
    let key = '';
    try { key = JSON.stringify([draft, contexts]); } catch { return; }
    if (key === ownKey.current) return;
    ownKey.current = key;
    // through the same queue as turns and the map, and the version it makes
    // is recorded — or this client's next map would look stale to itself
    const run = async () => {
      const res = await fetch(`/api/shared/conversation/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, contexts }),
      }).catch(() => null);
      const j = res && res.ok ? await res.json().catch(() => null) : null;
      if (j?.updatedAt && seen.current && sid.current === id) seen.current = { ...seen.current, version: Number(j.updatedAt) };
    };
    const next = queue.current.then(run, run);
    queue.current = next.catch(() => undefined);
  }, [role]);

  /** read again whether it is shared — after the Share sheet closes, say */
  const recheck = useCallback(() => {
    seen.current = null;
    void read(false);
  }, [read]);

  return { shared, role, owner, people, push, point, keepOwn, recheck, active: shared && !!sid.current };
}
