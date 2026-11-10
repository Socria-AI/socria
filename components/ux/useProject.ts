'use client';

// components/ux/useProject.ts — one open SocriaUX project: its state, undo,
// the browser copy and the synced one.
//
// The reducer is lib/ux/model.ts `reduce`. Around it: an undo history that
// groups a drag into one step (a burst of edits within 600ms to the same
// thing is one entry), a save to localStorage shortly after every change, and
// — for a signed-in designer — a PUT to /api/ux/projects a little later. The
// browser copy is always written first; a failed sync never loses an edit and
// never blocks one, it only changes what the header says.

import { useCallback, useEffect, useRef, useState } from 'react';
import { reduce, type Action, type UXProject } from '@/lib/ux/model';
import { saveProject } from '@/lib/ux/storage';

export type SaveState = 'saved' | 'saving' | 'local-only' | 'quota' | 'synced' | 'sync-failed';

const HISTORY = 80;
const GROUP_MS = 600;
/** Actions that never enter the undo history: they are not edits to the design. */
const UNTRACKED = new Set<Action['type']>(['message/add', 'message/suggestion', 'mode/set', 'stage/set', 'project/replace']);

/** A key naming "the same thing being edited", so a drag is one undo step. */
function groupKey(a: Action): string {
  switch (a.type) {
    case 'element/update':
      return `${a.type}:${a.id}:${Object.keys(a.patch).sort().join(',')}`;
    case 'artboard/update':
    case 'node/update':
    case 'annotation/update':
    case 'research/update':
      return `${a.type}:${a.id}:${Object.keys(a.patch).sort().join(',')}`;
    case 'brief/set':
      return `${a.type}:${Object.keys(a.patch).join(',')}`;
    case 'project/rename':
      return a.type;
    default:
      return `${a.type}:${Math.random()}`;
  }
}

export function useProject(initial: UXProject, opts: { signedIn: boolean }) {
  const [project, setProject] = useState<UXProject>(initial);
  const [save, setSave] = useState<SaveState>('saved');
  const past = useRef<UXProject[]>([]);
  const future = useRef<UXProject[]>([]);
  const last = useRef<{ key: string; at: number } | null>(null);
  const current = useRef(project);
  current.current = project;
  const [, bump] = useState(0);

  const dispatch = useCallback((a: Action) => {
    const prev = current.current;
    const next = reduce(prev, a);
    if (next === prev) return;
    if (!UNTRACKED.has(a.type)) {
      const key = groupKey(a);
      const now = Date.now();
      const grouped = last.current && last.current.key === key && now - last.current.at < GROUP_MS;
      if (!grouped) {
        past.current = [...past.current, prev].slice(-HISTORY);
        future.current = [];
      }
      last.current = { key, at: now };
    }
    current.current = next;
    setProject(next);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current[past.current.length - 1];
    if (!prev) return;
    past.current = past.current.slice(0, -1);
    future.current = [current.current, ...future.current].slice(0, HISTORY);
    last.current = null;
    const restored = { ...prev, updatedAt: Date.now(), messages: current.current.messages };
    current.current = restored;
    setProject(restored);
    bump((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current[0];
    if (!next) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, current.current].slice(-HISTORY);
    last.current = null;
    const restored = { ...next, updatedAt: Date.now(), messages: current.current.messages };
    current.current = restored;
    setProject(restored);
    bump((n) => n + 1);
  }, []);

  // the browser copy, shortly after every change
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave('saving');
    const t = window.setTimeout(() => {
      const r = saveProject(project);
      setSave(r.ok ? (opts.signedIn ? 'saving' : 'local-only') : r.reason === 'quota' ? 'quota' : 'local-only');
    }, 350);
    return () => window.clearTimeout(t);
  }, [project, opts.signedIn]);

  // the synced copy, a little later, for a signed-in designer
  useEffect(() => {
    if (!opts.signedIn) return;
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/ux/projects', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: current.current }),
        });
        if (res.ok) setSave('synced');
        else if (res.status === 409) {
          // edited elsewhere more recently: fetch theirs, keep it, keep ours in undo
          const r = await fetch(`/api/ux/projects?id=${encodeURIComponent(current.current.id)}`);
          const j = r.ok ? await r.json() : null;
          if (j?.project) {
            past.current = [...past.current, current.current].slice(-HISTORY);
            current.current = j.project;
            setProject(j.project);
            saveProject(j.project);
            setSave('synced');
          } else setSave('sync-failed');
        } else setSave(res.status === 413 ? 'local-only' : 'sync-failed');
      } catch {
        setSave('sync-failed');
      }
    }, 2200);
    return () => window.clearTimeout(t);
  }, [project, opts.signedIn]);

  return {
    project,
    dispatch,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    save,
  };
}

export type Dispatch = (a: Action) => void;
