'use client';

// components/ux/image.ts — a screenshot, made small enough to keep.
//
// An uploaded or pasted design is drawn onto a canvas and re-encoded: at most
// 1600px on its long side, JPEG, stepping the quality down until it fits the
// project's limit for one image (lib/ux/model.ts LIMITS.image). The project
// lives in localStorage, and a phone screenshot at full size would fill it.

import { LIMITS } from '@/lib/ux/model';

export interface Shot {
  src: string;
  w: number;
  h: number;
}

export async function readScreenshot(file: File): Promise<Shot> {
  if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) throw new Error('That file is not a PNG, JPG, WebP or GIF image.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('The image could not be read.'));
      i.src = url;
    });
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    let scale = Math.min(1, 1600 / long);
    for (let attempt = 0; attempt < 6; attempt++) {
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('This browser cannot process images.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      for (const q of [0.82, 0.7, 0.58]) {
        const src = c.toDataURL('image/jpeg', q);
        if (src.length <= LIMITS.image) return { src, w, h };
      }
      scale *= 0.75;
    }
    throw new Error('The image is too large to keep, even reduced.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The artboard size for a screenshot: phone-shaped images become 390 wide
 * (the size their elements will be designed at), anything else at most 1440.
 */
export function boardSizeFor(shot: Shot): { w: number; h: number } {
  const ratio = shot.h / shot.w;
  const w = ratio > 1.4 ? 390 : Math.min(1440, Math.max(360, shot.w));
  return { w, h: Math.round(w * ratio) };
}
