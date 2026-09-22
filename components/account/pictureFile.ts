'use client';
// components/account/pictureFile.ts
//
// The picture as a FILE — the composer's promise that you can "take it with
// you", which until now had no button behind it.
//
// Two formats, as the design has them: PNGs at every size a picture is
// actually used at, and an SVG. The mark is line art, so the vector is the
// honest master and the PNGs are conveniences.
//
// Drawn from the same inputs the on-screen Avatar is (lib/pfp.ts), and for
// the marks that ARE live SVG on screen — Logos and the node glyphs — from
// that SVG itself, so the file cannot drift from what was composed.
//
// One departure from the design, which was a bug in it: its SVG export
// cloned the live mark's <svg>, but the brand marks (the mark, the seal) are
// images, not SVG — so their "vector master" came out with no mark in it at
// all. Here an image mark is embedded in the SVG, with the same inversion
// the Avatar applies on a dark ground.

import { groundOf, markOf, takesLightInk, type PfpConfig } from '@/lib/pfp';

/** Every size the picture is used at, largest first. */
export const EXPORT_SIZES = [512, 256, 128, 64, 32] as const;

const GRID_LIGHT = 'rgba(244,241,232,.22)';
const GRID_DARK = 'rgba(53,70,32,.2)';

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}

/** The mark the big preview is drawing, as SVG — Logos and node glyphs only. */
function liveMark(): SVGSVGElement | null {
  return document.querySelector('.av-big .mk svg');
}

function sizedClone(svg: SVGSVGElement, box: number, ink: string, x?: number, y?: number): SVGSVGElement {
  const s = svg.cloneNode(true) as SVGSVGElement;
  s.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  s.setAttribute('width', String(box));
  s.setAttribute('height', String(box));
  if (x !== undefined) s.setAttribute('x', String(x));
  if (y !== undefined) s.setAttribute('y', String(y));
  s.setAttribute('style', `color:${ink}`);
  return s;
}

async function asDataUrl(src: string): Promise<string> {
  const blob = await (await fetch(src)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/** The picture drawn once, at `size` pixels square. */
export async function toPng(cfg: PfpConfig, size = 512): Promise<string> {
  const g = groundOf(cfg.ground);
  const light = takesLightInk(g);
  const m = markOf(cfg.mark);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  const r = size / 2;

  x.save();
  x.beginPath();
  x.arc(r, r, r, 0, Math.PI * 2);
  x.clip();
  x.fillStyle = g.bg;
  x.fillRect(0, 0, size, size);

  if (cfg.texture === 'grid') {
    const pitch = size * 0.118;
    x.fillStyle = light ? GRID_LIGHT : GRID_DARK;
    for (let i = pitch / 2; i < size; i += pitch)
      for (let j = pitch / 2; j < size; j += pitch) {
        x.beginPath();
        x.arc(i, j, size / 256, 0, Math.PI * 2);
        x.fill();
      }
  }
  if (cfg.texture === 'grain') {
    const d = x.getImageData(0, 0, size, size);
    for (let i = 0; i < d.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 26;
      d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n;
    }
    x.putImageData(d, 0, 0);
  }
  if (cfg.ring === 'ring' || cfg.ring === 'seal') {
    x.strokeStyle = g.ink;
    x.globalAlpha = 0.55;
    x.lineWidth = Math.max(1, size / 256);
    x.beginPath(); x.arc(r, r, r - size * 0.055, 0, Math.PI * 2); x.stroke();
    if (cfg.ring === 'seal') { x.beginPath(); x.arc(r, r, r - size * 0.105, 0, Math.PI * 2); x.stroke(); }
    x.globalAlpha = 1;
  }

  const box = size * 0.52;
  const off = (size - box) / 2;
  if (m.kind === 'letter') {
    await document.fonts.ready;
    x.fillStyle = g.ink;
    x.font = `italic 400 ${Math.round(size * 0.42)}px "Instrument Serif", Georgia, serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText((cfg.letter || 'A').slice(0, 2), r, r + size * 0.02);
  } else if ((m.kind === 'img' || m.kind === 'one') && m.src) {
    const img = await load(m.src);
    if (light) x.filter = 'invert(1) brightness(1.7)';
    x.drawImage(img, off, off, box, box);
    x.filter = 'none';
  } else {
    const live = liveMark();
    if (live) {
      const svg = new XMLSerializer().serializeToString(sizedClone(live, box, g.ink));
      const img = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      x.drawImage(img, off, off, box, box);
    }
  }
  x.restore();
  return c.toDataURL('image/png');
}

/** The same composition as SVG — the vector master. */
export async function toSvg(cfg: PfpConfig, size = 512): Promise<string> {
  const g = groundOf(cfg.ground);
  const light = takesLightInk(g);
  const m = markOf(cfg.mark);
  const r = size / 2;
  const box = size * 0.52;
  const off = (size - box) / 2;
  const parts: string[] = [];
  const defs: string[] = ['<clipPath id="c"><circle cx="' + r + '" cy="' + r + '" r="' + r + '"/></clipPath>'];

  parts.push(`<circle cx="${r}" cy="${r}" r="${r}" fill="${g.bg}"/>`);
  if (cfg.texture === 'grid') {
    const pitch = size * 0.118;
    defs.push(
      `<pattern id="g" width="${pitch}" height="${pitch}" patternUnits="userSpaceOnUse">` +
        `<circle cx="${pitch / 2}" cy="${pitch / 2}" r="${size / 256}" fill="${light ? GRID_LIGHT : GRID_DARK}"/></pattern>`
    );
    parts.push(`<circle cx="${r}" cy="${r}" r="${r}" fill="url(#g)"/>`);
  }
  if (cfg.texture === 'grain') {
    defs.push(
      '<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>' +
        '<feColorMatrix type="saturate" values="0"/></filter>'
    );
    parts.push(`<rect width="${size}" height="${size}" filter="url(#n)" opacity="0.07"/>`);
  }
  if (cfg.ring === 'ring' || cfg.ring === 'seal') {
    const sw = Math.max(1, size / 256);
    parts.push(`<circle cx="${r}" cy="${r}" r="${r - size * 0.055}" fill="none" stroke="${g.ink}" stroke-opacity=".55" stroke-width="${sw}"/>`);
    if (cfg.ring === 'seal')
      parts.push(`<circle cx="${r}" cy="${r}" r="${r - size * 0.105}" fill="none" stroke="${g.ink}" stroke-opacity=".55" stroke-width="${sw}"/>`);
  }
  if (m.kind === 'letter') {
    const letter = (cfg.letter || 'A').slice(0, 2).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    parts.push(
      `<text x="${r}" y="${r + size * 0.145}" text-anchor="middle" fill="${g.ink}" ` +
        `font-family="Instrument Serif, Georgia, serif" font-style="italic" font-size="${Math.round(size * 0.42)}">${letter}</text>`
    );
  } else if ((m.kind === 'img' || m.kind === 'one') && m.src) {
    // Embedded, so the file stands alone; inverted on a light-ink ground the
    // way the Avatar does it (invert, then brighten by 1.7).
    const href = await asDataUrl(m.src);
    if (light) {
      defs.push(
        '<filter id="inv" color-interpolation-filters="sRGB"><feComponentTransfer>' +
          '<feFuncR type="linear" slope="-1.7" intercept="1.7"/>' +
          '<feFuncG type="linear" slope="-1.7" intercept="1.7"/>' +
          '<feFuncB type="linear" slope="-1.7" intercept="1.7"/>' +
          '</feComponentTransfer></filter>'
      );
    }
    parts.push(`<image href="${href}" x="${off}" y="${off}" width="${box}" height="${box}"${light ? ' filter="url(#inv)"' : ''}/>`);
  } else {
    const live = liveMark();
    if (live) parts.push(new XMLSerializer().serializeToString(sizedClone(live, box, g.ink, off, off)));
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<defs>${defs.join('')}</defs><g clip-path="url(#c)">${parts.join('')}</g></svg>`
  );
}

/** Hand a URL to the browser as a download. */
export function saveFile(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
