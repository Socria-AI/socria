// components/MapPoster.tsx
//
// A map as a picture you can keep.
//
// The live map is a React surface: CSS variables, web fonts, cards that are
// HTML laid over an SVG of edges, a zoom transform. None of that survives a
// trip through <img>, which is how a page turns markup into pixels — an SVG
// loaded as an image is its own document, with no access to the page's
// stylesheet, its fonts or its custom properties. Every `var(--lg-…)` would
// render as nothing.
//
// So the poster is drawn from scratch, in plain SVG, with every colour and
// font stated in the file. It uses the Structure lens because that layout is
// a pure function of the map — the graph settles differently every time,
// and a saved picture should look like the map, not like one moment of it.
//
// One scene, two renderers. `posterScene` decides where everything goes;
// `posterSvgString` writes it as markup (no DOM, so tests and the server can
// call it) and <MapPoster> writes the same scene as JSX for anywhere a live
// preview is wanted. `exportMapPng` takes the string route: the string is
// already the whole picture, so there is nothing to serialise from the page.

import type { LogosNodeType, LogosRelation, ThinkingMap } from '@/lib/logos';
import { CONTEXT_LABEL } from '@/lib/logos';
import { layoutStructure } from '@/lib/logos-layout';

export const POSTER_W = 1200;
export const POSTER_H = 800;

// The Logos palette, as literal values. These are --lg-paper, --lg-primary,
// --lg-accent, --lg-secondary, --lg-tension and --lg-ink from globals.css;
// the two translucent inks are pre-blended onto paper because a PNG has no
// backdrop to be translucent against.
const PAPER = '#F5F3EB';
const INK = '#23241F';
const INK_60 = '#6F6F69';
const INK_40 = '#A1A099';
const INK_24 = '#C4C3BC';
const PRIMARY = '#354620';
const ACCENT = '#264653';
const SECONDARY = '#B8A26B';
const TENSION = '#9C5B3C';
const LINE = '#D9DBCE';

// The same warm/cool split MapThumb uses — intentions and evidence solid,
// open threads light, friction rust — so a saved map reads like the rail's
// thumbnail of it.
const TONE: Record<LogosNodeType, string> = {
  goal: PRIMARY,
  decision: PRIMARY,
  value: SECONDARY,
  belief: ACCENT,
  idea: ACCENT,
  assumption: SECONDARY,
  evidence: PRIMARY,
  question: INK_40,
  tension: TENSION,
  consequence: ACCENT,
  claim: SECONDARY,
  counterpoint: TENSION,
  source: ACCENT,
  concept: PRIMARY,
  misconception: TENSION,
  theme: '#6B5F7A',
  character: '#8A6B4A',
  constraint: INK_40,
  milestone: PRIMARY,
  given: ACCENT,
  unknown: SECONDARY,
  equation: PRIMARY,
  definition: ACCENT,
  transformation: INK_40,
  theorem: '#6B5F7A',
  step: PRIMARY,
  inference: ACCENT,
  verification: PRIMARY,
  result: PRIMARY,
  error: TENSION,
  axiom: PRIMARY,
  lemma: ACCENT,
  conjecture: SECONDARY,
  counterexample: TENSION,
};

// Edge colours from the .lg-conn-* rules, dashes where the live map dashes.
const EDGE: Record<LogosRelation, { colour: string; dash?: string }> = {
  supports: { colour: '#7C9463' },
  conflicts: { colour: TENSION, dash: '6 4' },
  depends: { colour: '#6E93A3' },
  relates: { colour: INK_24 },
  leads_to: { colour: '#A08E5E' },
  revises: { colour: '#8E8C7A' },
  precedes: { colour: '#8A9BA6', dash: '5 3' },
  part_of: { colour: '#B9BFB1' },
  transforms_to: { colour: PRIMARY },
  implies: { colour: ACCENT },
  justifies: { colour: '#6E93A3' },
  equivalent_to: { colour: '#6E7FA3', dash: '8 3 2 3' },
};

// Fonts the SVG can count on inside an <img>: whatever the machine has.
const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';

const LABEL_SIZE = 12.5;
const LABEL_LINE = 15;
const LABEL_CHAR_W = 6.5; // Helvetica at 12.5px, generous so lines do not spill
const CARD_PAD = 12;
const TYPE_ROW = 12;
const MAX_LINES = 3;

const TITLE_BAND = 104; // room for the eyebrow and the title above the map
const FOOT_BAND = 64; // room for the wordmark below it
const SIDE = 56;
const MAX_TITLE = 72;

export interface PosterCard {
  id: string;
  type: LogosNodeType;
  x: number;
  y: number;
  w: number;
  h: number;
  tone: string;
  lines: string[];
  /** a settled node draws hollow, as on the thumbnail */
  settled: boolean;
  faded: boolean;
}

export interface PosterEdge {
  key: string;
  path: string;
  colour: string;
  width: number;
  opacity: number;
  dash?: string;
}

export interface PosterScene {
  w: number;
  h: number;
  eyebrow: string;
  title: string;
  cards: PosterCard[];
  edges: PosterEdge[];
  /** applied to the map group so any map fits the frame */
  transform: string;
  wordmark: string;
}

/**
 * Break a label into at most `maxLines` lines that fit `width` pixels.
 *
 * A width estimate rather than a measurement, because there is no text to
 * measure on the server and the poster must draw the same everywhere. The
 * last line takes an ellipsis when the label ran on; a word wider than the
 * card is cut rather than allowed to run through the card's edge.
 */
export function wrapLabel(label: string, width: number, maxLines = MAX_LINES): string[] {
  const perLine = Math.max(4, Math.floor(width / LABEL_CHAR_W));
  const words = label.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const raw of words) {
    const word = raw.length > perLine ? raw.slice(0, perLine - 1) + '…' : raw;
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= perLine) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = word;
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  const overflow = lines.join(' ').length < words.join(' ').length;
  if (overflow && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] =
      last.length + 1 <= perLine ? `${last}…` : `${last.slice(0, Math.max(1, perLine - 1))}…`;
  }
  return lines.length ? lines : ['—'];
}

/** A file name from a title: socria-map-<slug>.png, never empty. */
export function posterFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return `socria-map-${slug || 'thinking'}.png`;
}

function cardHeight(lines: number): number {
  return CARD_PAD + TYPE_ROW + lines * LABEL_LINE + CARD_PAD - 2;
}

/** Where everything goes. Pure; the two renderers below only draw it. */
export function posterScene(map: ThinkingMap, title: string): PosterScene {
  const layout = layoutStructure(map, POSTER_W - SIDE * 2, POSTER_H - TITLE_BAND - FOOT_BAND);

  const cards: PosterCard[] = layout.placed.map((p) => {
    const lines = wrapLabel(p.node.label, p.w - CARD_PAD * 2);
    return {
      id: p.id,
      type: p.node.type,
      x: p.x,
      y: p.y,
      w: p.w,
      h: Math.max(p.h, cardHeight(lines.length)),
      tone: TONE[p.node.type] ?? ACCENT,
      lines,
      settled: p.node.status === 'resolved' || p.node.status === 'revised',
      faded: p.node.status === 'revised',
    };
  });

  const edges: PosterEdge[] = layout.connectors.map((c) => {
    const style = EDGE[c.relation] ?? EDGE.relates;
    const strength = c.strength ?? 'normal';
    return {
      key: c.key,
      path: c.path,
      colour: style.colour,
      width: strength === 'strong' ? 2.2 : strength === 'weak' ? 1.1 : 1.6,
      opacity: strength === 'weak' ? 0.45 : 0.9,
      ...(style.dash ? { dash: style.dash } : {}),
    };
  });

  // Fit the drawing to the frame. The layout already works inside the
  // frame's width, so this mostly enlarges a small map rather than shrinking
  // a big one; the ceiling keeps a three-node map from becoming three
  // billboards, and the floor keeps a crowded one legible over pretty.
  let transform = `translate(${SIDE} ${TITLE_BAND})`;
  if (cards.length) {
    const minX = Math.min(...cards.map((c) => c.x - c.w / 2));
    const maxX = Math.max(...cards.map((c) => c.x + c.w / 2));
    const minY = Math.min(...cards.map((c) => c.y - c.h / 2));
    const maxY = Math.max(...cards.map((c) => c.y + c.h / 2));
    const areaW = POSTER_W - SIDE * 2;
    const areaH = POSTER_H - TITLE_BAND - FOOT_BAND;
    const bw = Math.max(maxX - minX, 1);
    const bh = Math.max(maxY - minY, 1);
    const s = Math.max(0.55, Math.min(1.45, areaW / bw, areaH / bh));
    const tx = SIDE + (areaW - bw * s) / 2 - minX * s;
    const ty = TITLE_BAND + (areaH - bh * s) / 2 - minY * s;
    transform = `translate(${round(tx)} ${round(ty)}) scale(${round(s)})`;
  }

  const context = map.context ? CONTEXT_LABEL[map.context] : '';
  const clean = title.replace(/\s+/g, ' ').trim();
  const shown = clean.length > MAX_TITLE ? `${clean.slice(0, MAX_TITLE - 1).trimEnd()}…` : clean;

  return {
    w: POSTER_W,
    h: POSTER_H,
    eyebrow: context ? `Thinking Map · ${context}` : 'Thinking Map',
    title: shown || 'A line of thinking',
    cards,
    edges,
    transform,
    wordmark: 'socria.app',
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The poster as SVG markup. No DOM: this is what the PNG export rasterises
 * and what the suite inspects, and it must produce the same picture whether
 * it runs in a browser, in Node, or on the server.
 */
export function posterSvgString(map: ThinkingMap, title: string): string {
  const s = posterScene(map, title);
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}">`
  );
  out.push(`<rect x="0" y="0" width="${s.w}" height="${s.h}" fill="${PAPER}"/>`);
  out.push(
    `<text x="${SIDE}" y="44" font-family="${esc(SANS)}" font-size="11" font-weight="600" letter-spacing="2.2" fill="${INK_40}">${esc(s.eyebrow.toUpperCase())}</text>`
  );
  out.push(
    `<text x="${SIDE}" y="78" font-family="${esc(SERIF)}" font-size="26" fill="${INK}">${esc(s.title)}</text>`
  );
  out.push(`<g transform="${s.transform}">`);
  for (const e of s.edges) {
    out.push(
      `<path d="${esc(e.path)}" fill="none" stroke="${e.colour}" stroke-width="${e.width}" stroke-opacity="${e.opacity}" stroke-linecap="round" stroke-linejoin="round"${
        e.dash ? ` stroke-dasharray="${e.dash}"` : ''
      } data-edge="${esc(e.key)}"/>`
    );
  }
  for (const c of s.cards) {
    const x = round(c.x - c.w / 2);
    const y = round(c.y - c.h / 2);
    out.push(`<g data-node="${esc(c.id)}"${c.faded ? ' opacity="0.55"' : ''}>`);
    out.push(
      `<rect x="${x}" y="${y}" width="${c.w}" height="${c.h}" rx="9" fill="${c.settled ? PAPER : '#FFFFFF'}" stroke="${
        c.settled ? c.tone : LINE
      }" stroke-width="1"/>`
    );
    out.push(`<rect x="${x}" y="${y + 9}" width="3" height="${c.h - 18}" rx="1.5" fill="${c.tone}"/>`);
    out.push(
      `<text x="${x + CARD_PAD}" y="${y + CARD_PAD + 7}" font-family="${esc(SANS)}" font-size="8.5" font-weight="600" letter-spacing="1.2" fill="${c.tone}">${esc(
        c.type.toUpperCase()
      )}</text>`
    );
    c.lines.forEach((line, i) => {
      out.push(
        `<text x="${x + CARD_PAD}" y="${y + CARD_PAD + TYPE_ROW + 10 + i * LABEL_LINE}" font-family="${esc(SANS)}" font-size="${LABEL_SIZE}" fill="${INK}">${esc(line)}</text>`
      );
    });
    out.push('</g>');
  }
  out.push('</g>');
  if (!s.cards.length) {
    out.push(
      `<text x="${s.w / 2}" y="${s.h / 2}" text-anchor="middle" font-family="${esc(SERIF)}" font-style="italic" font-size="16" fill="${INK_40}">Nothing drawn yet.</text>`
    );
  }
  out.push(
    `<text x="${s.w - SIDE}" y="${s.h - 30}" text-anchor="end" font-family="${esc(SANS)}" font-size="12" font-weight="600" letter-spacing="2" fill="${INK_60}">${esc(
      s.wordmark.toUpperCase()
    )}</text>`
  );
  out.push('</svg>');
  return out.join('');
}

/** The same picture, as a React element, for a preview beside the button. */
export function MapPoster({ map, title }: { map: ThinkingMap; title: string }) {
  const s = posterScene(map, title);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${s.w} ${s.h}`}
      width="100%"
      role="img"
      aria-label={`${s.title} — a thinking map`}
    >
      <rect x={0} y={0} width={s.w} height={s.h} fill={PAPER} />
      <text x={SIDE} y={44} fontFamily={SANS} fontSize={11} fontWeight={600} letterSpacing={2.2} fill={INK_40}>
        {s.eyebrow.toUpperCase()}
      </text>
      <text x={SIDE} y={78} fontFamily={SERIF} fontSize={26} fill={INK}>
        {s.title}
      </text>
      <g transform={s.transform}>
        {s.edges.map((e) => (
          <path
            key={e.key}
            d={e.path}
            fill="none"
            stroke={e.colour}
            strokeWidth={e.width}
            strokeOpacity={e.opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={e.dash}
          />
        ))}
        {s.cards.map((c) => {
          const x = c.x - c.w / 2;
          const y = c.y - c.h / 2;
          return (
            <g key={c.id} opacity={c.faded ? 0.55 : undefined}>
              <rect
                x={x}
                y={y}
                width={c.w}
                height={c.h}
                rx={9}
                fill={c.settled ? PAPER : '#FFFFFF'}
                stroke={c.settled ? c.tone : LINE}
                strokeWidth={1}
              />
              <rect x={x} y={y + 9} width={3} height={c.h - 18} rx={1.5} fill={c.tone} />
              <text
                x={x + CARD_PAD}
                y={y + CARD_PAD + 7}
                fontFamily={SANS}
                fontSize={8.5}
                fontWeight={600}
                letterSpacing={1.2}
                fill={c.tone}
              >
                {c.type.toUpperCase()}
              </text>
              {c.lines.map((line, i) => (
                <text
                  key={i}
                  x={x + CARD_PAD}
                  y={y + CARD_PAD + TYPE_ROW + 10 + i * LABEL_LINE}
                  fontFamily={SANS}
                  fontSize={LABEL_SIZE}
                  fill={INK}
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </g>
      {!s.cards.length && (
        <text
          x={s.w / 2}
          y={s.h / 2}
          textAnchor="middle"
          fontFamily={SERIF}
          fontStyle="italic"
          fontSize={16}
          fill={INK_40}
        >
          Nothing drawn yet.
        </text>
      )}
      <text
        x={s.w - SIDE}
        y={s.h - 30}
        textAnchor="end"
        fontFamily={SANS}
        fontSize={12}
        fontWeight={600}
        letterSpacing={2}
        fill={INK_60}
      >
        {s.wordmark.toUpperCase()}
      </text>
    </svg>
  );
}

// Twice the poster's size in pixels: crisp on a retina screen and in a slide,
// still a small file. Fixed rather than read from the device, so the same
// map saved on two machines is the same picture.
const PNG_SCALE = 2;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('poster image failed to load'));
    img.src = src;
  });
}

/**
 * Save the map as a PNG. Resolves true when a download was handed to the
 * browser, false when there was nothing to draw or the browser could not
 * rasterise it. Never throws: the button that calls this sits in the map
 * header, and a failed save should leave the map exactly as it was.
 *
 * Every DOM reference is inside the guard so the module can be imported
 * wherever the map's types are — including on the server, where none of
 * `document`, `Image` or `URL.createObjectURL` exist.
 */
export async function exportMapPng(map: ThinkingMap, title: string): Promise<boolean> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return false;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  if (!map.nodes.length) return false;
  try {
    const svg = posterSvgString(map, title);
    // A data: URL rather than a blob one: a blob SVG loaded into an <img>
    // still taints the canvas in some browsers, and a tainted canvas cannot
    // be exported at all.
    const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    const canvas = document.createElement('canvas');
    canvas.width = POSTER_W * PNG_SCALE;
    canvas.height = POSTER_H * PNG_SCALE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return false;
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = posterFileName(title);
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Long enough for the browser to have read the blob; the object URL
    // would otherwise hold the whole image for the life of the tab.
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return true;
  } catch {
    return false;
  }
}
