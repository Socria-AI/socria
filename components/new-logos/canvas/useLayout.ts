'use client';
// components/new-logos/canvas/useLayout.ts — a canvas's layout: loaded once, changed locally at once, saved shortly
// after (compare-and-swap on its version; a save that lost the race merges this page's own changes into the newer
// layout and tries again). Before the database has the canvases table, the layout is kept in this browser instead,
// so the canvas works — and remembers — either way.

import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_LAYOUT, mergeLayouts, sanitizeLayout, withItem, type CanvasLayout, type ItemLayout, type View } from '@/lib/new-logos/canvas';
import { applyPatch, type LayoutPatch } from '@/lib/new-logos/groups';

const LOCAL = (key: string) => `workspace.canvas.v1.${key}`;

function readLocal(key: string): CanvasLayout {
  try {
    const raw = window.localStorage.getItem(LOCAL(key));
    return raw ? sanitizeLayout(JSON.parse(raw)) : EMPTY_LAYOUT;
  } catch {
    return EMPTY_LAYOUT;
  }
}
function writeLocal(key: string, layout: CanvasLayout) {
  try {
    window.localStorage.setItem(LOCAL(key), JSON.stringify(layout));
  } catch {
    /* storage unavailable: the layout lives for this visit */
  }
}

export interface LayoutApi {
  layout: CanvasLayout;
  loaded: boolean;
  setItem: (ref: string, patch: Partial<ItemLayout> | null) => void;
  setItems: (patches: Record<string, Partial<ItemLayout> | null>) => void;
  setView: (view: View) => void;
  /** items and groups changed together (the operation engine's layout patches) */
  apply: (patch: LayoutPatch) => void;
  /** the layout as it is this moment (for working out a change's exact inverse) */
  current: () => CanvasLayout;
}

export function useCanvasLayout(key: string | null): LayoutApi {
  const [layout, setLayout] = useState<CanvasLayout>(EMPTY_LAYOUT);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef<CanvasLayout>(EMPTY_LAYOUT);
  const version = useRef(0);
  const local = useRef(false);
  const changed = useRef<Set<string>>(new Set());
  const timer = useRef<number | null>(null);
  const saving = useRef(false);
  const scheduleRef = useRef<() => void>(() => {});
  const failures = useRef(0);

  useEffect(() => {
    if (!key) return;
    let gone = false;
    setLoaded(false);
    (async () => {
      let l = EMPTY_LAYOUT;
      try {
        const res = await fetch(`/api/new-logos/canvas?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (j.setup === false || !res.ok) {
          local.current = true;
          l = readLocal(key);
        } else {
          local.current = false;
          version.current = Number(j.version) || 0;
          l = sanitizeLayout(j.layout);
        }
      } catch {
        local.current = true;
        l = readLocal(key);
      }
      if (gone) return;
      latest.current = l;
      setLayout(l);
      setLoaded(true);
    })();
    return () => {
      gone = true;
    };
  }, [key]);

  const save = useCallback(async () => {
    if (!key) return;
    // a save already on its way: what changed meanwhile is saved when it has landed (below)
    if (saving.current) return;
    if (local.current) {
      writeLocal(key, latest.current);
      changed.current.clear();
      return;
    }
    saving.current = true;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const sent = latest.current;
        const mine = new Set(changed.current);
        changed.current.clear();
        const res = await fetch('/api/new-logos/canvas', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, layout: sent, version: version.current }),
        }).catch(() => null);
        if (!res) {
          // unreachable: kept, and tried again later (backing off)
          mine.forEach((r) => changed.current.add(r));
          failures.current = Math.min(failures.current + 1, 6);
          return;
        }
        failures.current = 0;
        const j = await res.json().catch(() => ({}));
        if (res.ok) {
          version.current = Number(j.version) || version.current + 1;
          return;
        }
        if (res.status === 409) {
          // saved elsewhere first: keep what it holds, and put this page's own changes on top
          version.current = Number(j.version) || 0;
          const merged = mergeLayouts(sanitizeLayout(j.layout), latest.current, new Set([...mine, ...changed.current]));
          latest.current = merged;
          setLayout(merged);
          mine.forEach((r) => changed.current.add(r));
          continue;
        }
        if (j.setup === false) {
          local.current = true;
          writeLocal(key, latest.current);
        }
        return;
      }
    } finally {
      saving.current = false;
      // changes made while this save was on its way are saved next, never dropped
      if (changed.current.size) scheduleRef.current();
    }
  }, [key]);

  const schedule = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void save();
    }, 600 * 2 ** failures.current);
  }, [save]);
  /** the camera's moves join a save already waiting, and never postpone it */
  const scheduleSoon = useCallback(() => {
    if (!timer.current) schedule();
  }, [schedule]);
  scheduleRef.current = schedule;

  // what is not yet saved is saved when the page goes
  useEffect(() => {
    const flush = () => {
      if (!key || !changed.current.size) return;
      if (local.current) return writeLocal(key, latest.current);
      try {
        void fetch('/api/new-logos/canvas', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, layout: latest.current, version: version.current }),
          keepalive: true,
        });
      } catch {
        /* best effort */
      }
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      if (timer.current) window.clearTimeout(timer.current);
      flush();
    };
  }, [key]);

  const setItems = useCallback(
    (patches: Record<string, Partial<ItemLayout> | null>) => {
      let next = latest.current;
      for (const [ref, p] of Object.entries(patches)) {
        next = withItem(next, ref, p);
        changed.current.add(ref);
      }
      latest.current = next;
      setLayout(next);
      schedule();
    },
    [schedule]
  );
  const setItem = useCallback((ref: string, patch: Partial<ItemLayout> | null) => setItems({ [ref]: patch }), [setItems]);
  const setView = useCallback(
    (view: View) => {
      latest.current = { ...latest.current, view };
      setLayout(latest.current);
      changed.current.add('__view');
      scheduleSoon();
    },
    [scheduleSoon]
  );

  const apply = useCallback(
    (patch: LayoutPatch) => {
      latest.current = applyPatch(latest.current, patch);
      for (const ref of Object.keys(patch.items ?? {})) changed.current.add(ref);
      for (const gid of Object.keys(patch.groups ?? {})) changed.current.add(`g:${gid}`);
      setLayout(latest.current);
      schedule();
    },
    [schedule]
  );
  const current = useCallback(() => latest.current, []);

  return { layout, loaded, setItem, setItems, setView, apply, current };
}
