'use client';
// components/new-logos/represent/useRepresentation.ts — A WORKSPACE'S COMPONENTS, in the page (a conversation's space,
// key c:<id>, or an objective's, key o:<id>).
//
// Read once; changed by the person through the one operation system, shown at once and saved after (the same pure
// applyRepOps runs here and on the server, so what is shown is what will be saved); changed by the assistant through
// a turn (POST /api/new-logos/represent); reversed through the log. The person's changes are saved one batch at a
// time, on the version held: a batch refused because the representation changed meanwhile (the assistant's turn
// landing) is made again on the newer state and sent again, so nothing the person did is lost or applied twice.

import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_REPRESENTATION, sanitizeRepresentation, type Changes, type Representation } from '@/lib/new-logos/representation';
import { applyRepOps, type RepOp } from '@/lib/new-logos/representation-ops';
import { coalesce, type ArtifactOp } from '@/lib/new-logos/artifact-ops';
import type { LogLine } from '@/lib/new-logos/representation-service';

export interface TurnAnswer {
  ok: true;
  record: string;
  entry: { id: string; summary: string; read: string } | null;
  changes: Changes;
  near: [string, string][];
  alternatives: { label: string; ask: string }[];
  /** workspace commands the assistant asked for, to be planned and run by the operation engine */
  commands: unknown[];
}
export type TurnFailure = { ok: false; status: number; error: string; setup?: false };

export interface RepApi {
  rep: Representation;
  version: number;
  log: LogLine[];
  /** null until known; false when the database has no table for it yet */
  setup: boolean | null;
  loaded: boolean;
  /** items changed by the latest batch, for a quiet mark that fades */
  fresh: { added: Set<string>; revised: Set<string>; at: number };
  load: () => Promise<void>;
  change: (ops: RepOp[], summary?: string) => Promise<{ ok: boolean; entry?: { id: string; summary: string } | null; error?: string }>;
  /** back to before a logged change; the undo is itself a change (its entry undoes it again: redo) */
  undo: (entryId: string) => Promise<{ ok: boolean; summary?: string; entry?: string; error?: string }>;
  turn: (body: Record<string, unknown>, signal?: AbortSignal) => Promise<TurnAnswer | TurnFailure>;
  /** the model moved or typed into (a slider, a cell): shown at once; saved as one change per burst of edits */
  modelEdit: (ops: ArtifactOp[], onSaved?: (entry: { id: string; summary: string }) => void) => void;
}

const empty = (): Representation => ({ ...EMPTY_REPRESENTATION, items: [], relations: [], variables: [], turns: [] });
const NO_FRESH = { added: new Set<string>(), revised: new Set<string>(), at: 0 };

export function useRepresentation(key: string, enabled: boolean): RepApi {
  const [rep, setRep] = useState<Representation>(empty);
  const [version, setVersion] = useState(0);
  const [log, setLog] = useState<LogLine[]>([]);
  const [setup, setSetup] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fresh, setFresh] = useState(NO_FRESH);
  const cur = useRef({ rep, version });
  cur.current = { rep, version };
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const url = '/api/new-logos/representations';

  const take = useCallback((j: { representation?: unknown; version?: unknown; log?: unknown }) => {
    const r = sanitizeRepresentation(j.representation);
    const v = typeof j.version === 'number' ? j.version : 0;
    setRep(r);
    setVersion(v);
    if (Array.isArray(j.log)) setLog(j.log as LogLine[]);
    cur.current = { rep: r, version: v };
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`${url}?key=${encodeURIComponent(key)}`, { cache: 'no-store' }).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    if (j?.setup === false) setSetup(false);
    else if (j?.ok) {
      take(j);
      setSetup(true);
    }
    setLoaded(true);
  }, [url, key, take]);

  useEffect(() => {
    if (!enabled) return;
    setLoaded(false);
    void load();
  }, [enabled, load]);

  const mark = useCallback((c: { added?: string[]; revised?: string[] } | null | undefined) => {
    if (!c) return;
    setFresh({ added: new Set(c.added ?? []), revised: new Set(c.revised ?? []), at: Date.now() });
  }, []);

  const change = useCallback<RepApi['change']>(
    (ops, summary) => {
      const at = Date.now();
      // shown at once
      const local = applyRepOps(cur.current.rep, ops, { by: 'person', at });
      setRep(local.rep);
      cur.current = { ...cur.current, rep: local.rep };
      mark({ added: local.changes.added, revised: local.changes.revised });
      const run = async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, ops, version: cur.current.version, ...(summary ? { summary } : {}) }) }).catch(() => null);
          const j = res ? await res.json().catch(() => null) : null;
          if (res?.ok && j?.ok) {
            take(j);
            return { ok: true, entry: j.entry ?? null };
          }
          if (res?.status === 409 && j?.representation) {
            // changed meanwhile: this change made again on the newer state, and sent again
            const fresher = sanitizeRepresentation(j.representation);
            const again = applyRepOps(fresher, ops, { by: 'person', at });
            setRep(again.rep);
            setVersion(j.version);
            if (Array.isArray(j.log)) setLog(j.log);
            cur.current = { rep: again.rep, version: j.version };
            continue;
          }
          if (j?.setup === false) setSetup(false);
          // refused or failed: back to what is saved
          await load();
          return { ok: false, error: typeof j?.error === 'string' ? j.error : 'Not saved. Try again.' };
        }
        await load();
        return { ok: false, error: 'Changed elsewhere meanwhile. Try again.' };
      };
      const p = queue.current.then(run, run);
      queue.current = p.catch(() => undefined);
      return p;
    },
    [url, key, take, load, mark]
  );

  const undo = useCallback<RepApi['undo']>(
    async (entryId) => {
      await queue.current;
      const res = await fetch(`${url}/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, entry: entryId }) }).catch(() => null);
      const j = res ? await res.json().catch(() => null) : null;
      if (res?.ok && j?.ok) {
        const before = cur.current.rep;
        take(j);
        const after = sanitizeRepresentation(j.representation);
        mark({ revised: after.items.filter((i) => before.items.some((b) => b.id === i.id && JSON.stringify(b) !== JSON.stringify(i))).map((i) => i.id), added: after.items.filter((i) => !before.items.some((b) => b.id === i.id)).map((i) => i.id) });
        return { ok: true, summary: j.entry?.summary, entry: j.entry?.id };
      }
      return { ok: false, error: typeof j?.error === 'string' ? j.error : 'Not undone. Try again.' };
    },
    [url, key, take, mark]
  );

  const turn = useCallback<RepApi['turn']>(
    async (body, signal) => {
      try {
        if (!key.startsWith('c:')) return { ok: false, status: 400, error: 'Questions to the assistant are asked in a conversation.' };
        const res = await fetch('/api/new-logos/represent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: key.slice(2), ...body }), signal });
        const j = await res.json().catch(() => null);
        if (res.ok && j?.ok) {
          take(j);
          mark(j.changes);
          return { ok: true, record: String(j.record ?? ''), entry: j.entry ?? null, changes: j.changes, near: Array.isArray(j.near) ? j.near : [], alternatives: Array.isArray(j.alternatives) ? j.alternatives : [], commands: Array.isArray(j.commands) ? j.commands : [] };
        }
        if (j?.setup === false) setSetup(false);
        return { ok: false, status: res.status, error: typeof j?.error === 'string' ? j.error : '', ...(j?.setup === false ? { setup: false as const } : {}) };
      } catch (e) {
        return { ok: false, status: (e as Error)?.name === 'AbortError' ? 499 : 0, error: '' };
      }
    },
    [key, take, mark]
  );

  // edits of the model come quickly (a slider dragged): each is shown at once, and a burst is saved as one change
  const buffer = useRef<{ ops: ArtifactOp[]; done: ((e: { id: string; summary: string }) => void)[]; timer: number | null }>({ ops: [], done: [], timer: null });
  const modelEdit = useCallback<RepApi['modelEdit']>(
    (ops, onSaved) => {
      const local = applyRepOps(cur.current.rep, [{ op: 'model', ops }], { by: 'person', at: Date.now() });
      setRep(local.rep);
      cur.current = { ...cur.current, rep: local.rep };
      const b = buffer.current;
      b.ops.push(...ops);
      if (onSaved) b.done.push(onSaved);
      if (b.timer) window.clearTimeout(b.timer);
      b.timer = window.setTimeout(() => {
        const batch = coalesce(b.ops);
        const done = b.done;
        b.ops = [];
        b.done = [];
        b.timer = null;
        if (!batch.length) return;
        // sent as the person's change, made again on a newer state if need be (the change path does that)
        const run = async () => {
          for (let attempt = 0; attempt < 3; attempt++) {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, ops: [{ op: 'model', ops: batch }], version: cur.current.version, summary: 'Changed the model' }) }).catch(() => null);
            const j = res ? await res.json().catch(() => null) : null;
            if (res?.ok && j?.ok) {
              const fresher = sanitizeRepresentation(j.representation);
              // keep edits made while this was on its way
              const pending = buffer.current.ops;
              const shown = pending.length ? applyRepOps(fresher, [{ op: 'model', ops: pending }], { by: 'person', at: Date.now() }).rep : fresher;
              setRep(shown);
              setVersion(j.version);
              if (Array.isArray(j.log)) setLog(j.log);
              cur.current = { rep: shown, version: j.version };
              if (j.entry) for (const f of done) f(j.entry);
              return;
            }
            if (res?.status === 409 && typeof j?.version === 'number') {
              cur.current = { ...cur.current, version: j.version };
              continue;
            }
            await load();
            return;
          }
        };
        queue.current = queue.current.then(run, run);
      }, 450);
    },
    [url, key, load]
  );

  return { rep, version, log, setup, loaded, fresh, load, change, undo, turn, modelEdit };
}
