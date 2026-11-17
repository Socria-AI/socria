'use client';
// components/ux-v0/useV0Project.ts — one open SocriaUX v0 project: its state and its saves.
//
// Every change goes to the browser first (lib/ux-v0/store.ts), a moment after
// it is made (and at once when the page is left); a signed-in designer's project then goes to /api/ux-v0/projects
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

  // A save waits for a pause (300 ms), but never longer than 1.5 s after the first unsaved change:
  // a stream of small updates must not keep pushing the save back. Leaving or hiding the page
  // writes at once, so a reload straight after a change keeps it.
  const first = useRef(true);
  const dirtySince = useRef<number | null>(null);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave('saving');
    const now = Date.now();
    if (dirtySince.current === null) dirtySince.current = now;
    const wait = Math.max(0, Math.min(300, 1500 - (now - dirtySince.current)));
    const t = window.setTimeout(async () => {
      dirtySince.current = null;
      const r = await putProject(ref.current);
      setSave(r.ok ? (signedIn ? 'saving' : 'device') : r.reason === 'quota' ? 'quota' : 'unkept');
    }, wait);
    return () => window.clearTimeout(t);
  }, [project, signedIn]);

  useEffect(() => {
    const flush = () => {
      if (dirtySince.current === null) return;
      dirtySince.current = null;
      void putProject(ref.current);
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

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
