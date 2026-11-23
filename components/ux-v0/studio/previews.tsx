'use client';
// components/ux-v0/studio/previews.tsx — what a choice looks like, drawn by the engines themselves; and what a website
// the person pointed to looks like, drawn as it is.
//
// A website's look is a working page the website engine makes from the conversation in that proposed system: not a
// template, the choice reaches the engine and the engine makes the real work afresh. Each is made only when it comes
// near the screen, one at a time in the browser's idle moments, and kept for the visit, so the conversation never
// waits on a preview. A referenced page is the page itself, fetched and stripped of its scripts on the server
// (lib/ux-v0/studio/references.ts previewDoc). Both are shown in sealed frames: an empty sandbox, no scripts, no forms,
// no navigation, an opaque origin.

import { useEffect, useRef, useState } from 'react';
import { renderDesign } from '@/lib/ux-v0/render';
import { buildSandboxDoc } from '@/lib/ux-v0/sandbox';
import { currentSpec } from '@/lib/ux-v0/types';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import type { StudioState } from '@/lib/ux-v0/studio/schema';
import { startWebsite } from '@/lib/ux-v0/studio/start';

// ── the queue: one preview at a time, in idle moments, kept for the visit ──

const made = new Map<string, string>();
const waiting = new Map<string, Set<(v: string) => void>>();
const queue: { key: string; make: () => string }[] = [];
let working = false;
const MAX_KEPT = 160;

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
const whenIdle = (cb: () => void) => {
  const w = window as IdleWindow;
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(cb, { timeout: 500 });
  else window.setTimeout(cb, 24);
};

function pump() {
  if (working || typeof window === 'undefined') return;
  const job = queue.shift();
  if (!job) return;
  working = true;
  whenIdle(() => {
    let out = '';
    try {
      out = job.make();
    } catch {
      out = '';
    }
    made.set(job.key, out);
    if (made.size > MAX_KEPT) made.delete(made.keys().next().value as string);
    for (const cb of waiting.get(job.key) ?? []) cb(out);
    waiting.delete(job.key);
    working = false;
    pump();
  });
}

/** True once the element has come near the screen (and stays true). */
function useNear<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') return setNear(true);
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (setNear(true), io.disconnect()), { rootMargin: '400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return [ref, near];
}

/** A preview made once for its key, when wanted: null while it is being made, '' when it could not be. */
function usePreview(key: string, make: () => string, wanted: boolean): string | null {
  const [v, setV] = useState<string | null>(() => made.get(key) ?? null);
  const latest = useRef(make);
  latest.current = make;
  useEffect(() => {
    const have = made.get(key);
    if (have !== undefined) return setV(have);
    setV(null);
    if (!wanted) return;
    let live = true;
    const cb = (out: string) => {
      if (live) setV(out);
    };
    let set = waiting.get(key);
    if (!set) {
      set = new Set();
      waiting.set(key, set);
      queue.push({ key, make: () => latest.current() });
      pump();
    }
    set.add(cb);
    return () => {
      live = false;
      set?.delete(cb);
    };
  }, [key, wanted]);
  return v;
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381).toString(36);

/** The width a box is drawn at (a page is scaled down from 1280px into it). */
function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const box = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [box, w];
}

/** A working page made from the conversation in one proposed system, in a sealed frame. */
export function WebsiteShot({ st, system, nonce }: { st: StudioState; system: MasterDesignSystem | undefined; nonce: string }) {
  const [ref, near] = useNear<HTMLSpanElement>();
  const box = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const key = `site|${hash(`${st.createdAt}|${st.round ?? 0}|${system?.direction.name ?? ''}|${system?.tokens.colors.accent ?? ''}|${system?.tokens.fonts.display ?? ''}|${JSON.stringify(st.answers['w.words']?.fields ?? {})}|${(st.answers['w.functions']?.values ?? []).join(',')}|${(st.answers['w.purpose']?.values ?? []).join(',')}`)}`;
  const html = usePreview(
    key,
    () => {
      if (!system) return '';
      const r = startWebsite(st, system, { now: st.createdAt });
      if (!r.ok) return '';
      const spec = currentSpec(r.project);
      if (!spec) return '';
      const page = renderDesign(spec, []).html;
      return buildSandboxDoc(page, { parse: (h) => new DOMParser().parseFromString(h, 'text/html'), runScripts: false, nonce, inspector: '' }).doc;
    },
    near,
  );
  const scale = w / 1280;
  return (
    <span ref={ref} className="sd-shot-wrap">
      <span ref={box} className={`sd-shot is-page${html === null ? ' is-making' : ''}`} style={{ aspectRatio: '16 / 11' }} aria-hidden="true">
        {html && w > 0 ? <iframe className="sd-shot-frame" title="" sandbox="" srcDoc={html} tabIndex={-1} style={{ width: 1280, height: Math.ceil((w / (16 / 11)) / scale), transform: `scale(${scale})` }} /> : html === '' ? <span className="sd-shot-none">No preview</span> : <span className="sd-shot-wait" />}
      </span>
    </span>
  );
}

/** A website the person pointed to, drawn as it is (its scripts taken out on the server), scaled into its card. */
export function SitePreview({ html, label }: { html: string; label: string }) {
  const [box, w] = useWidth<HTMLSpanElement>();
  const scale = w / 1280;
  return (
    <span ref={box} className="sd-site-shot" style={{ aspectRatio: '16 / 10' }}>
      {w > 0 && <iframe className="sd-shot-frame" title={label} sandbox="" srcDoc={html} tabIndex={-1} style={{ width: 1280, height: Math.ceil(w / (16 / 10) / scale), transform: `scale(${scale})` }} />}
    </span>
  );
}
