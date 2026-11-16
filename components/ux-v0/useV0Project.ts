'use client';
// components/ux-v0/useV0Project.ts — one open SocriaUX v0 project: its state and its saves.
//
// Every change goes to the browser first (lib/ux-v0/store.ts), a moment after
// it is made; a signed-in designer's project then goes to /api/ux-v0/projects
// a little later, without its crops. A failed sync never loses work — the
// browser copy is already written — it only changes what the header says.

import { useCallback, useEffect, useRef, useState } from 'react';
import { putProject } from '@/lib/ux-v0/store';
import { normalizeProject, type DesignProject } from '@/lib/ux-v0/types';

export type SaveState = 'saved' | 'saving' | 'device' | 'unkept' | 'quota' | 'synced' | 'sync-failed';

export const SAVE_WORDS: Record<SaveState, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  device: 'Saved in this browser',
  unkept: 'This browser will not keep it',
  quota: 'Browser storage is full',
  synced: 'Saved and synced',
  'sync-failed': 'Saved here · sync failed',
};

export function useV0Project(initial: DesignProject, signedIn: boolean) {
  const [project, setProject] = useState(initial);
  const [save, setSave] = useState<SaveState>('saved');
  const ref = useRef(project);
  ref.current = project;

  /** Change the project. `touch: false` for changes that are not edits (selection-free bookkeeping). */
  const update = useCallback((fn: (p: DesignProject) => DesignProject, touch = true) => {
    setProject((p) => {
      const next = fn(p);
      if (next === p) return p;
      const stamped = touch ? { ...next, updatedAt: Date.now() } : next;
      ref.current = stamped;
      return stamped;
    });
  }, []);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave('saving');
    const t = window.setTimeout(async () => {
      const r = await putProject(project);
      setSave(r.ok ? (signedIn ? 'saving' : 'device') : r.reason === 'quota' ? 'quota' : 'unkept');
    }, 300);
    return () => window.clearTimeout(t);
  }, [project, signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    const t = window.setTimeout(async () => {
      try {
        const doc = normalizeProject(ref.current, { forSync: true });
        const res = await fetch('/api/ux-v0/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: doc }) });
        if (res.ok) setSave('synced');
        else if (res.status === 409) {
          const r = await fetch(`/api/ux-v0/projects?id=${encodeURIComponent(ref.current.id)}`);
          const j = r.ok ? await r.json() : null;
          const theirs = normalizeProject(j?.project);
          if (theirs && theirs.updatedAt > ref.current.updatedAt) {
            ref.current = theirs;
            setProject(theirs);
            await putProject(theirs);
          }
          setSave('synced');
        } else setSave(res.status === 413 ? 'device' : 'sync-failed');
      } catch {
        setSave('sync-failed');
      }
    }, 2400);
    return () => window.clearTimeout(t);
  }, [project, signedIn]);

  return { project, update, save, current: ref };
}
