'use client';

// components/ux-v0/studio/faces.ts — faces loaded into the page before words are shown in them: the lettering and
// moods a question offers (./AidPicker.tsx) are never shown in a fallback face.

import { graphicFontStylesheet } from '@/lib/ux-v0/fonts';

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
