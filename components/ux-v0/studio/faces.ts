'use client';

// components/ux-v0/studio/faces.ts — faces loaded into the page before words are measured, for the studio's visual
// question cards (DiscoveryOptions), whose previews are drawn by lib/ux-v0/graphics/render.ts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { graphicFontStylesheet } from '@/lib/ux-v0/fonts';
import { canvasMeasure } from '@/lib/ux-v0/graphics/raster';
import type { Measure } from '@/lib/ux-v0/graphics/text';

export type Face = { face: string; weight: number; italic: boolean };

const injected = new Set<string>();
const loadedFaces = new Set<string>();
export const faceKey = (f: Face) => `${f.face}|${f.weight}|${f.italic ? 1 : 0}`;

/** Loads the faces (a Google Fonts stylesheet, then each face at its weight); true when something new arrived. */
export async function loadFaces(faces: readonly Face[]): Promise<boolean> {
  if (typeof document === 'undefined' || !faces.length) return false;
  const url = graphicFontStylesheet(faces.map((f) => f.face));
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
