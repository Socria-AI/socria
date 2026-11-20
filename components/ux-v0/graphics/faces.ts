'use client';

// components/ux-v0/graphics/faces.ts — the faces a design uses, loaded into the page before its text is measured,
// and the pictures it holds, shown by object address. Shared by everything that draws or edits a graphic in the
// browser: the Graphics workspace, its editor, and the materials of a board.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getArtifact } from '@/lib/ux-v0/store';
import { fontStylesheet } from '@/lib/ux-v0/fonts';
import { walk, type Asset, type GraphicDoc } from '@/lib/ux-v0/graphics/doc';
import type { GraphicDirection } from '@/lib/ux-v0/graphics/compose';
import { canvasMeasure } from '@/lib/ux-v0/graphics/raster';
import type { Measure } from '@/lib/ux-v0/graphics/text';

export type Face = { face: string; weight: number; italic: boolean };

const injected = new Set<string>();
const loadedFaces = new Set<string>();
export const faceKey = (f: Face) => `${f.face}|${f.weight}|${f.italic ? 1 : 0}`;

/** Every face (at its weight) the text and charts of a document are set in. */
export function facesUsed(doc: GraphicDoc): Face[] {
  const out = new Map<string, Face>();
  for (const b of doc.artboards)
    for (const l of walk(b)) {
      const n = l.node;
      if (n.type === 'text') out.set(faceKey({ face: n.font, weight: n.weight, italic: !!n.italic }), { face: n.font, weight: n.weight, italic: !!n.italic });
      if (n.type === 'chart') for (const w of [400, 600]) out.set(faceKey({ face: n.font, weight: w, italic: false }), { face: n.font, weight: w, italic: false });
    }
  return [...out.values()];
}

/** The faces a direction composes with. */
export const directionFaces = (d: GraphicDirection): Face[] => [
  { face: d.tokens.fonts.display, weight: d.look.weight, italic: false },
  { face: d.tokens.fonts.display, weight: 400, italic: false },
  { face: d.tokens.fonts.body, weight: 400, italic: false },
  { face: d.tokens.fonts.body, weight: 600, italic: false },
];

/** Loads the faces (a Google Fonts stylesheet, then each face at its weight); true when something new arrived. */
export async function loadFaces(faces: readonly Face[]): Promise<boolean> {
  if (typeof document === 'undefined' || !faces.length) return false;
  const url = fontStylesheet(faces.map((f) => f.face));
  if (url && !injected.has(url)) {
    injected.add(url);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.dataset.gxFonts = '1';
    document.head.appendChild(link);
    await new Promise<void>((res) => {
      link.onload = () => res();
      link.onerror = () => res();
      window.setTimeout(res, 4000);
    });
  }
  const wanted = faces.filter((f) => !loadedFaces.has(faceKey(f)));
  if (!wanted.length) return false;
  await Promise.race([
    Promise.all(wanted.map((f) => document.fonts.load(`${f.italic ? 'italic ' : ''}${f.weight} 40px "${f.face}"`).then(() => loadedFaces.add(faceKey(f)), () => undefined))),
    new Promise((res) => window.setTimeout(res, 3500)),
  ]);
  return true;
}

/**
 * The measure text is laid out with, made again once the faces given have loaded (so a line measured before its face
 * arrived is measured again with it). `refresh` remakes it after faces were loaded by hand.
 */
export function useFaceMeasure(faces: readonly Face[]): { measure: Measure; refresh: () => void } {
  const [tick, setTick] = useState(0);
  const key = useMemo(() => [...new Set(faces.map(faceKey))].sort().join(';'), [faces]);
  useEffect(() => {
    if (!key) return;
    let live = true;
    const list = key.split(';').map((k) => {
      const [face, weight, italic] = k.split('|');
      return { face, weight: Number(weight), italic: italic === '1' };
    });
    loadFaces(list).then((changed) => live && changed && setTick((t) => t + 1));
    return () => {
      live = false;
    };
  }, [key]);
  const measure = useMemo(() => canvasMeasure(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { measure, refresh };
}

/**
 * The pictures of some assets as addresses this page can draw: an upload kept in this browser by object address; a
 * picture from elsewhere by its own address. Uploads this browser does not have (a project synced from another
 * device) are said, never drawn as a blank.
 */
export function useAssetUrls(assets: readonly Asset[]): { href: (id: string, src: string) => string; resolve: (src: string) => Promise<Blob | null>; missing: string[] } {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  const uploadKey = [...new Set(assets.map((a) => a.src).filter((s) => s.startsWith('upload:')))].sort().join(',');
  useEffect(() => {
    const srcs = uploadKey.split(',').filter((s) => s && !urlsRef.current[s]);
    if (!srcs.length) return;
    let live = true;
    (async () => {
      const add: Record<string, string> = {};
      const gone: string[] = [];
      for (const s of srcs) {
        const rec = await getArtifact(s.slice('upload:'.length));
        if (rec) add[s] = URL.createObjectURL(rec.data);
        else gone.push(s);
      }
      if (live) {
        setUrls((u) => ({ ...u, ...add }));
        if (gone.length) setMissing((m) => [...new Set([...m, ...gone])]);
      } else Object.values(add).forEach((u) => URL.revokeObjectURL(u));
    })();
    return () => {
      live = false;
    };
  }, [uploadKey]);
  useEffect(() => () => Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u)), []);
  const href = useCallback((_id: string, src: string) => (src.startsWith('upload:') ? urls[src] ?? '' : src), [urls]);
  const resolve = useCallback(async (src: string) => (src.startsWith('upload:') ? (await getArtifact(src.slice('upload:'.length)))?.data ?? null : null), []);
  return { href, resolve, missing };
}

/** A file handed to the browser to save. */
export function download(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(u), 5000);
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'graphic';
