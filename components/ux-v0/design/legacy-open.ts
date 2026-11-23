'use client';

// components/ux-v0/design/legacy-open.ts — an old graphic or board, opened: its faces loaded into the page so its words
// are measured as they were set, then carried into the design workspace (lib/ux-v0/design/legacy.ts).

import type { DesignProject } from '@/lib/ux-v0/types';
import { graphicFontStylesheet } from '@/lib/ux-v0/fonts';
import { canvasMeasure } from '@/lib/ux-v0/graphics/raster';
import { designFromLegacy, legacyFaces, type LegacyOutcome } from '@/lib/ux-v0/design/legacy';

async function loadFaces(faces: string[]): Promise<void> {
  const href = graphicFontStylesheet(faces);
  if (href && !document.querySelector(`link[data-sx-legacy="${CSS.escape(href)}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.sxLegacy = href;
    document.head.appendChild(link);
    await new Promise<void>((res) => {
      link.onload = () => res();
      link.onerror = () => res();
      window.setTimeout(res, 4000);
    });
  }
  const wanted = faces.flatMap((f) => [`400 20px "${f}"`, `700 20px "${f}"`, `italic 400 20px "${f}"`]);
  await Promise.race([Promise.all(wanted.map((w) => document.fonts.load(w).catch(() => []))), new Promise((res) => window.setTimeout(res, 4000))]);
}

export async function openLegacy(p: DesignProject): Promise<LegacyOutcome | null> {
  const faces = legacyFaces(p);
  if (faces.length) await loadFaces(faces).catch(() => undefined);
  return designFromLegacy(p, { measure: canvasMeasure(), parse: (h) => new DOMParser().parseFromString(h, 'text/html'), now: Date.now() });
}
