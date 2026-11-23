'use client';
// components/ux-v0/studio/previews.tsx — what a website the person pointed to looks like, drawn as it is: the page
// itself, fetched and stripped of its scripts on the server (lib/ux-v0/studio/references.ts previewDoc), shown in a
// sealed frame — an empty sandbox, no scripts, no forms, no navigation, an opaque origin. (A website's own look is no
// longer previewed for choosing: the page is made at once, in the first look the engine draws from the conversation.)

import { useEffect, useRef, useState } from 'react';

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
