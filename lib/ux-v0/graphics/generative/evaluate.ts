// lib/ux-v0/graphics/generative/evaluate.ts — judging what was built. A structural signature (where the words sit and
// how large, where the figures weigh, how much is left empty, how symmetric it is, what bleeds) that diversity and
// memory compare, never colour; a similarity between two signatures; and an aesthetic cost the engine uses to choose
// among variants of one concept (the hard rules first, then hierarchy, crowding, empty space against the concept's own
// target, balance against its own symmetry). Deterministic: measured from the objects, not guessed.

import { contrastRatio } from '../../../ux/audit';
import type { Artboard, Node, TextNode } from '../doc';
import type { CreativeConcept } from './concept';
import { clamp, overlaps, type Box } from './util';

const GX = 6;
const GY = 8;

export interface Signature {
  /** text coverage per cell (0, 1, 2), GX × GY */
  text: number[];
  /** figure coverage per cell (0, 1, 2) */
  fig: number[];
  /** the headline: centre x, centre y (0–1), size (share of the short side), turned (0/1), on a path (0/1) */
  head: [number, number, number, number, number];
  /** the visual weight's centre (0–1) */
  balance: [number, number];
  /** mirror symmetry of the occupancy, 0–1 */
  symmetry: number;
  /** share of the frame left empty, 0–1 */
  empty: number;
  /** share of figures running off the frame, 0–1 */
  bleed: number;
}

const isBackground = (n: Node, W: number, H: number) => n.role === 'background' || (n.x <= 1 && n.y <= 1 && n.w >= W * 0.98 && n.h >= H * 0.98);

/** A node's footprint, turned when it is turned (its axis-aligned bounding box). */
function foot(n: Node): Box {
  if (!n.rotation) return { x: n.x, y: n.y, w: n.w, h: n.h };
  const a = (Math.abs(n.rotation) % 180) * (Math.PI / 180);
  const w = Math.abs(n.w * Math.cos(a)) + Math.abs(n.h * Math.sin(a));
  const h = Math.abs(n.w * Math.sin(a)) + Math.abs(n.h * Math.cos(a));
  return { x: n.x + n.w / 2 - w / 2, y: n.y + n.h / 2 - h / 2, w, h };
}

/** The signature of a set of objects in a frame (see the head of this file). */
export function signatureOf(nodes: readonly Node[], W: number, H: number, ground = '#ffffff'): Signature {
  const text = new Array(GX * GY).fill(0);
  const fig = new Array(GX * GY).fill(0);
  const add = (arr: number[], b: Box, k = 1) => {
    for (let i = 0; i < GX; i++)
      for (let j = 0; j < GY; j++) {
        const cx = (i * W) / GX;
        const cy = (j * H) / GY;
        const ox = Math.max(0, Math.min(b.x + b.w, cx + W / GX) - Math.max(b.x, cx));
        const oy = Math.max(0, Math.min(b.y + b.h, cy + H / GY) - Math.max(b.y, cy));
        arr[j * GX + i] += ((ox * oy) / ((W / GX) * (H / GY))) * k;
      }
  };
  let wx = 0;
  let wy = 0;
  let wsum = 0;
  let bleedArea = 0;
  let figArea = 0;
  let head: Signature['head'] = [0.5, 0.5, 0, 0, 0];
  for (const n of nodes) {
    if (n.hidden || isBackground(n, W, H)) continue;
    const b = foot(n);
    if (n.type === 'text' && !n.decorative) {
      add(text, b);
      if (n.role === 'headline') head = [clamp((b.x + b.w / 2) / W, 0, 1), clamp((b.y + b.h / 2) / H, 0, 1), clamp((n as TextNode).size / Math.min(W, H), 0, 1), n.rotation ? 1 : 0, (n as TextNode).path ? 1 : 0];
    } else {
      add(fig, b, (n.opacity ?? 1) >= 0.5 ? 1 : 0.5);
      const a = Math.max(0, b.w) * Math.max(0, b.h);
      const vis = Math.max(0, Math.min(b.x + b.w, W) - Math.max(b.x, 0)) * Math.max(0, Math.min(b.y + b.h, H) - Math.max(b.y, 0));
      figArea += a;
      bleedArea += Math.max(0, a - vis);
    }
    // visual weight: area times how far its colour stands from the ground
    const fill = n.type === 'shape' && typeof n.fill === 'string' ? n.fill : n.type === 'text' ? (n as TextNode).color : n.type === 'image' ? '#777777' : null;
    const k = fill ? Math.min(4, contrastRatio(fill.slice(0, 7), ground) - 1) : 0.6;
    const vis = Math.max(0, Math.min(b.x + b.w, W) - Math.max(b.x, 0)) * Math.max(0, Math.min(b.y + b.h, H) - Math.max(b.y, 0));
    const w = vis * k * (n.type === 'text' ? 0.6 : 1);
    wx += ((Math.max(0, b.x) + Math.min(W, b.x + b.w)) / 2) * w;
    wy += ((Math.max(0, b.y) + Math.min(H, b.y + b.h)) / 2) * w;
    wsum += w;
  }
  const q = (v: number) => (v < 0.15 ? 0 : v < 0.6 ? 1 : 2);
  const tq = text.map(q);
  const fq = fig.map(q);
  let same = 0;
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) same += (tq[j * GX + i] + fq[j * GX + i] > 0 ? 1 : 0) === (tq[j * GX + GX - 1 - i] + fq[j * GX + GX - 1 - i] > 0 ? 1 : 0) ? 1 : 0;
  const empty = tq.filter((v, i) => v === 0 && fq[i] === 0).length / (GX * GY);
  return { text: tq, fig: fq, head, balance: wsum ? [clamp(wx / wsum / W, 0, 1), clamp(wy / wsum / H, 0, 1)] : [0.5, 0.5], symmetry: same / (GX * GY), empty, bleed: figArea ? clamp(bleedArea / figArea, 0, 1) : 0 };
}

export const signatureOfBoard = (b: Artboard) => signatureOf(b.children, b.width, b.height, b.background ?? '#ffffff');

/** How alike two designs are in structure, 0 (nothing alike) … 1 (the same arrangement). Colour plays no part. */
export function similarity(a: Signature, b: Signature): number {
  const occ = (x: number[], y: number[]) => 1 - x.reduce((s, v, i) => s + Math.abs(v - y[i]), 0) / (2 * x.length);
  const o = occ(a.text, b.text) * 0.45 + occ(a.fig, b.fig) * 0.55;
  const hd = Math.hypot(a.head[0] - b.head[0], a.head[1] - b.head[1]);
  const head = clamp(1 - hd / 0.6, 0, 1) * 0.6 + clamp(1 - Math.abs(a.head[2] - b.head[2]) / 0.15, 0, 1) * 0.25 + (a.head[3] === b.head[3] && a.head[4] === b.head[4] ? 0.15 : 0);
  const bal = clamp(1 - Math.hypot(a.balance[0] - b.balance[0], a.balance[1] - b.balance[1]) / 0.5, 0, 1);
  const misc = clamp(1 - Math.abs(a.empty - b.empty) / 0.4, 0, 1) * 0.5 + clamp(1 - Math.abs(a.symmetry - b.symmetry) / 0.4, 0, 1) * 0.3 + clamp(1 - Math.abs(a.bleed - b.bleed) / 0.5, 0, 1) * 0.2;
  return Math.round((o * 0.45 + head * 0.3 + bal * 0.1 + misc * 0.15) * 1000) / 1000;
}

/** Two designs this alike are the same structure, whatever their colours (a threshold the tests calibrate). */
export const TOO_SIMILAR = 0.86;

/** A signature written compactly for memory (digits and a few numbers). */
export function encodeSignature(s: Signature): string {
  const n2 = (v: number) => Math.round(v * 100);
  return `t${s.text.join('')}.f${s.fig.join('')}.h${s.head.map(n2).join(',')}.b${s.balance.map(n2).join(',')}.s${n2(s.symmetry)}.e${n2(s.empty)}.l${n2(s.bleed)}`;
}
export function decodeSignature(str: string): Signature | null {
  const m = /^t([0-2]{48})\.f([0-2]{48})\.h(-?\d+),(-?\d+),(-?\d+),(-?\d+),(-?\d+)\.b(-?\d+),(-?\d+)\.s(-?\d+)\.e(-?\d+)\.l(-?\d+)$/.exec(str);
  if (!m) return null;
  const d = (v: string) => Number(v) / 100;
  return { text: [...m[1]].map(Number), fig: [...m[2]].map(Number), head: [d(m[3]), d(m[4]), d(m[5]), d(m[6]), d(m[7])], balance: [d(m[8]), d(m[9])], symmetry: d(m[10]), empty: d(m[11]), bleed: d(m[12]) };
}

/** The cost of one built variant (lower is better): the rules, then hierarchy, crowding, room and balance. */
export function aestheticCost(nodes: readonly Node[], W: number, H: number, c: CreativeConcept, unresolved: readonly string[], ground: string): { cost: number; notes: string[] } {
  const u = Math.min(W, H) / 100;
  const notes: string[] = [];
  let cost = unresolved.length * 12;
  if (unresolved.length) notes.push(`${unresolved.length} rule${unresolved.length === 1 ? '' : 's'} unsettled`);
  const texts = nodes.filter((n): n is TextNode => n.type === 'text' && !n.decorative && !n.hidden);
  const head = texts.find((t) => t.role === 'headline');
  if (!head) return { cost: cost + 100, notes: [...notes, 'no headline'] };
  // hierarchy: the title leads (unless the concept keeps it quiet), and outranks every other text
  if (c.type !== 'quiet' && head.size < u * 5.5) ((cost += (u * 5.5 - head.size) / u), notes.push('the title is small for its role'));
  if (c.type === 'quiet' && head.size > u * 9) cost += (head.size - u * 9) / u;
  const second = Math.max(0, ...texts.filter((t) => t !== head).map((t) => t.size));
  if (second && head.size < second * 1.75 && c.type !== 'quiet') ((cost += 4 + (second * 1.75 - head.size) / u), notes.push('the title barely outranks the details'));
  // crowding: words too close to other words
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = foot(texts[i]);
      const b = foot(texts[j]);
      if (overlaps(a, b, u * 0.8) && !overlaps(a, b, 0)) cost += 1.2;
    }
  // the title over busy ground: how many figures it crosses
  const hb = foot(head);
  const busy = nodes.filter((n) => n.type !== 'text' && n.role !== 'background' && !(n.w >= W * 0.9 && n.h >= H * 0.9) && overlaps(foot(n), hb, 0)).length;
  if (busy > 2) ((cost += (busy - 2) * 0.8), notes.push('the title crosses many figures'));
  // room: the empty share against the concept's own target
  const sig = signatureOf(nodes, W, H, ground);
  cost += Math.abs(sig.empty * 100 - c.negativeSpace) / 12;
  // balance against the concept's own symmetry
  const off = Math.abs(sig.balance[0] - 0.5);
  if (c.symmetry >= 60) cost += off * 10;
  else if (off < 0.04 && Math.abs(sig.balance[1] - 0.5) < 0.04) cost += 1;
  if (sig.balance[0] < 0.12 || sig.balance[0] > 0.88 || sig.balance[1] < 0.1 || sig.balance[1] > 0.9) cost += c.org === 'edge' ? 0 : 1.5;
  return { cost: Math.round(cost * 100) / 100, notes };
}
