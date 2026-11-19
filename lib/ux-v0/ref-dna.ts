// lib/ux-v0/ref-dna.ts — a reference's design DNA, measured from its pixels.
//
// A kept reference is read here for what it can honestly say about a design language: how much of the frame is
// quiet (negative space), how dense its detail is, its contrast and key, how colourful it is and how many hue
// families it holds, whether its weight sits centred or off to one side, whether it is symmetric, whether its lines
// run square or diagonal, whether its elements repeat in a regular rhythm, its warmth, its grain — and, for a moving
// reference, how much changes from moment to moment. Each measure becomes a vote on the Creative DNA's dimensions
// (lib/ux-v0/dna.ts RefDna), with the phrases that explain it.
//
// What pixels cannot say, this does not claim: typography and interaction get no vote from a picture. Nothing is
// copied from a reference — no layout, no positions, no colours beyond what the moodboard already samples — only
// where it sits on each dimension. The browser draws the picture small on a canvas (components/ux-v0/ref-dna-loader.ts)
// and passes its pixels here; the result is kept on the reference, so it is measured once.

import type { DnaVector, RefDna } from './dna';

/** RGBA pixels, row by row (an ImageData's shape). */
export interface Pixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/** What was measured, each on its own scale (see the fields). */
export interface RefMeasures {
  /** mean luminance, 0 (black) – 1 (white) */
  luminance: number;
  /** RMS contrast of luminance, 0 – ~0.5 */
  contrast: number;
  /** mean chroma, 0 – 1 */
  chroma: number;
  /** Hasler–Süsstrunk colourfulness, 0 (grey) – ~110 (extremely colourful) */
  colourfulness: number;
  /** share of pixels on an edge, 0 – 1 */
  edges: number;
  /** share of the frame that is quiet (flat, without detail): negative space, 0 – 1 */
  quiet: number;
  /** how far the visual weight sits from the centre, 0 (centred) – 1 */
  offCentre: number;
  /** left–right mirror difference, 0 (symmetric) – 1 */
  asymmetry: number;
  /** how strongly the lines run diagonally rather than square, 0 – 1 (directionless detail, like noise, is 0) */
  diagonal: number;
  /** how strongly the lines run square (horizontal and vertical), 0 – 1 */
  square: number;
  /** how regularly elements repeat across the frame, 0 – 1 */
  regularity: number;
  /** distinct hue families among the coloured pixels (0 when it is all but neutral) */
  hues: number;
  /** −1 cool – 1 warm */
  warmth: number;
  /** fine texture in the flat areas, 0 – 1 */
  grain: number;
  /** for a moving reference: how much changes between moments, 0 – 1 */
  motion?: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
/** A Sobel response this strong is an edge: a step of about an eighth of the range of light. */
const EDGE = 0.45;
const r0 = (n: number) => Math.round(Math.max(0, Math.min(100, n)));

/** Luminance of every pixel, 0–1 (Rec. 709 weights on the stored values). */
function lumaOf(px: Pixels): Float32Array {
  const { width: W, height: H, data } = px;
  const out = new Float32Array(W * H);
  for (let i = 0, j = 0; j < W * H; i += 4, j++) out[j] = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  return out;
}

/** Every measure of one frame. Expects a small picture (the loader draws it at most 96 px on its long side). */
export function measurePixels(px: Pixels): RefMeasures {
  const { width: W, height: H, data } = px;
  const N = W * H;
  if (W < 8 || H < 8 || data.length < N * 4) throw new Error('too small to measure');
  const L = lumaOf(px);

  // key and contrast
  let sum = 0;
  for (let j = 0; j < N; j++) sum += L[j];
  const luminance = sum / N;
  let varL = 0;
  for (let j = 0; j < N; j++) varL += (L[j] - luminance) ** 2;
  const contrast = Math.sqrt(varL / N);

  // colour: chroma, colourfulness, hue families, warmth
  let chromaSum = 0;
  let rgS = 0;
  let ybS = 0;
  let rgQ = 0;
  let ybQ = 0;
  let warm = 0;
  let warmW = 0;
  const hueBins = new Array(12).fill(0);
  let coloured = 0;
  for (let i = 0; i < N * 4; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const c = (mx - mn) / 255;
    chromaSum += c;
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    rgS += rg;
    ybS += yb;
    rgQ += rg * rg;
    ybQ += yb * yb;
    warm += ((r - b) / 255) * c;
    warmW += c;
    if (c > 0.2) {
      coloured++;
      let h: number;
      if (mx === r) h = ((g - b) / (mx - mn)) % 6;
      else if (mx === g) h = (b - r) / (mx - mn) + 2;
      else h = (r - g) / (mx - mn) + 4;
      const deg = (h * 60 + 360) % 360;
      hueBins[Math.floor(deg / 30) % 12]++;
    }
  }
  const chroma = chromaSum / N;
  const muRg = rgS / N;
  const muYb = ybS / N;
  const sdRg = Math.sqrt(Math.max(0, rgQ / N - muRg * muRg));
  const sdYb = Math.sqrt(Math.max(0, ybQ / N - muYb * muYb));
  const colourfulness = Math.sqrt(sdRg * sdRg + sdYb * sdYb) + 0.3 * Math.sqrt(muRg * muRg + muYb * muYb);
  // hue families: bins holding a real share of the coloured pixels, neighbours counted once
  let hues = 0;
  if (coloured >= N * 0.04) {
    const on = hueBins.map((n) => n >= coloured * 0.08);
    for (let k = 0; k < 12; k++) if (on[k] && !on[(k + 11) % 12]) hues++;
    if (hues === 0 && on.some(Boolean)) hues = 1;
  }
  const warmth = warmW > 0 ? Math.max(-1, Math.min(1, (warm / warmW) * 1.6)) : 0;

  // edges (Sobel on luminance): how much detail, which way it runs, where the weight sits
  const mag = new Float32Array(N);
  let edgeN = 0;
  let axisE = 0;
  let diagE = 0;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const p = (yy: number, xx: number) => L[yy * W + xx];
      const gx = -p(y - 1, x - 1) - 2 * p(y, x - 1) - p(y + 1, x - 1) + p(y - 1, x + 1) + 2 * p(y, x + 1) + p(y + 1, x + 1);
      const gy = -p(y - 1, x - 1) - 2 * p(y - 1, x) - p(y - 1, x + 1) + p(y + 1, x - 1) + 2 * p(y + 1, x) + p(y + 1, x + 1);
      const m = Math.hypot(gx, gy);
      mag[y * W + x] = m;
      if (m > EDGE) {
        edgeN++;
        const a = ((Math.atan2(gy, gx) * 180) / Math.PI + 180) % 180;
        const fromAxis = Math.min(a % 90, 90 - (a % 90));
        if (fromAxis <= 15) axisE += m;
        else if (fromAxis >= 30) diagE += m;
      }
    }
  const inner = Math.max(1, (W - 2) * (H - 2));
  const edges = edgeN / inner;
  // directionless detail splits evenly between the two bands; a coherent direction leans one way
  const diagShare = axisE + diagE > 0 ? diagE / (axisE + diagE) : 0.5;
  const diagonal = axisE + diagE > 0 ? clamp01((diagShare - 0.5) * 2) : 0;
  const square = axisE + diagE > 0 ? clamp01((0.5 - diagShare) * 2) : 0;

  // negative space: an 8 × 8 grid of blocks, a block quiet when flat and without edges; grain in the flat ones
  const BX = 8;
  const BY = 8;
  let quietBlocks = 0;
  let grainSum = 0;
  let grainN = 0;
  for (let by = 0; by < BY; by++)
    for (let bx = 0; bx < BX; bx++) {
      const x0 = Math.floor((bx * W) / BX);
      const x1 = Math.floor(((bx + 1) * W) / BX);
      const y0 = Math.floor((by * H) / BY);
      const y1 = Math.floor(((by + 1) * H) / BY);
      let n = 0;
      let s = 0;
      let q = 0;
      let e = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const v = L[y * W + x];
          n++;
          s += v;
          q += v * v;
          if (mag[y * W + x] > EDGE) e++;
        }
      if (!n) continue;
      const mean = s / n;
      const sd = Math.sqrt(Math.max(0, q / n - mean * mean));
      if (sd < 0.06 && e / n < 0.05) quietBlocks++;
      if (sd < 0.06) {
        // fine texture: each pixel against its neighbours' mean
        for (let y = Math.max(1, y0); y < Math.min(H - 1, y1); y++)
          for (let x = Math.max(1, x0); x < Math.min(W - 1, x1); x++) {
            const nb = (L[(y - 1) * W + x] + L[(y + 1) * W + x] + L[y * W + x - 1] + L[y * W + x + 1]) / 4;
            grainSum += Math.abs(L[y * W + x] - nb);
            grainN++;
          }
      }
    }
  const quiet = quietBlocks / (BX * BY);
  const grain = grainN ? clamp01(grainSum / grainN / 0.035) : 0;

  // the weight's centre: detail and contrast against the mean
  let wSum = 0;
  let cx = 0;
  let cy = 0;
  let wl = 0;
  let wr = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const w = mag[y * W + x] + Math.abs(L[y * W + x] - luminance) * 0.6;
      wSum += w;
      cx += w * (x / (W - 1) - 0.5);
      cy += w * (y / (H - 1) - 0.5);
      if (x < W / 2) wl += w;
      else wr += w;
    }
  const offCentre = wSum > 0 ? clamp01((Math.hypot(cx / wSum, cy / wSum) / 0.5) * 2.2) : 0;

  // symmetry: the frame against its mirror (in colour, not only light), and the weight on each side
  let mirror = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < Math.floor(W / 2); x++) {
      const a = (y * W + x) * 4;
      const b = (y * W + (W - 1 - x)) * 4;
      mirror += Math.hypot(data[a] - data[b], data[a + 1] - data[b + 1], data[a + 2] - data[b + 2]) / 441.7;
    }
  const mirrorD = mirror / (H * Math.floor(W / 2));
  const sideD = wl + wr > 0 ? Math.abs(wl - wr) / (wl + wr) : 0;
  const asymmetry = clamp01(mirrorD * 2.2 * 0.6 + sideD * 1.6 * 0.4);

  // rhythm: how regularly detail repeats across and down (the autocorrelation of each profile's best repeat)
  const profile = (along: 'x' | 'y') => {
    const n = along === 'x' ? W : H;
    const out = new Float32Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[along === 'x' ? x : y] += mag[y * W + x];
    return out;
  };
  const repeatOf = (p: Float32Array) => {
    const n = p.length;
    // slow changes of light are not a repeat: each value against its neighbourhood's mean
    const win = Math.max(3, Math.round(n / 6));
    const q = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      let c = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) (s += p[j]), c++;
      q[i] = p[i] - s / c;
    }
    let den = 0;
    for (const v of q) den += v * v;
    if (den <= 1e-6) return 0;
    const acf = (lag: number) => {
      let num = 0;
      for (let i = 0; i + lag < n; i++) num += q[i] * q[i + lag];
      return num / den;
    };
    // a repeat: the correlation falls below zero, then rises again to a peak — and again at twice the distance
    // (three or more like elements in a row, not merely two)
    let lag = 1;
    while (lag < n / 3 && acf(lag) > 0) lag++;
    let best = 0;
    for (; lag <= Math.floor(n / 3); lag++) best = Math.max(best, Math.min(acf(lag), 2 * lag < n - 3 ? acf(2 * lag) : 0));
    return clamp01(best * 1.4);
  };
  const regularity = edges < 0.02 ? 0 : Math.max(repeatOf(profile('x')), repeatOf(profile('y')));

  return { luminance, contrast, chroma, colourfulness, edges, quiet, offCentre, asymmetry, diagonal, square, regularity, hues, warmth, grain };
}

/** How much changes between frames of a moving reference, 0–1: the mean difference of their luminance. */
export function motionBetween(frames: Pixels[]): number {
  if (frames.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let k = 1; k < frames.length; k++) {
    const a = lumaOf(frames[k - 1]);
    const b = lumaOf(frames[k]);
    if (a.length !== b.length) continue;
    let d = 0;
    for (let j = 0; j < a.length; j++) d += Math.abs(a[j] - b[j]);
    total += d / a.length;
    pairs++;
  }
  return pairs ? clamp01(total / pairs / 0.18) : 0;
}

/** Where the measures put the reference on each dimension the pixels can speak to. */
export function votesOf(m: RefMeasures): DnaVector {
  const detail = clamp01(m.edges / 0.25);
  const out: DnaVector = {
    // airy ↔ dense: how much of the frame is quiet, and how much detail the rest holds
    density: r0(100 * (0.55 * (1 - m.quiet) + 0.45 * detail)),
    // minimal ↔ expressive: colour, contrast, detail, many hues, little rest
    restraint: r0(100 * (0.34 * clamp01(m.colourfulness / 80) + 0.2 * clamp01(m.contrast / 0.3) + 0.2 * detail + 0.14 * clamp01(Math.max(0, m.hues - 1) / 3) + 0.12 * (1 - m.quiet))),
    // structured ↔ experimental: asymmetry, weight off-centre, diagonals; square lines and a regular repeat pull back to the grid
    composition: r0(100 * (0.3 * clamp01(m.asymmetry / 0.45) + 0.32 * m.offCentre + 0.4 * m.diagonal + 0.08) - 18 * m.square - 30 * m.regularity),
    // quiet ↔ vivid colour
    colour: r0(100 * (0.6 * clamp01(m.colourfulness / 90) + 0.4 * clamp01(m.chroma / 0.45))),
    // documentary ↔ stylised pictures: hard contrast, a duotone or graphic palette, flat clean surfaces
    imagery: r0(100 * (0.4 * clamp01((m.contrast - 0.12) / 0.2) + 0.3 * (m.hues > 0 && m.hues <= 2 && m.chroma > 0.25 ? 1 : m.chroma < 0.06 && m.contrast > 0.22 ? 0.8 : 0) + 0.3 * m.quiet * (1 - m.grain)) + 10),
  };
  if (typeof m.motion === 'number') out.motion = r0(15 + 80 * m.motion);
  return out;
}

/** The measures in plain phrases, the most telling first. */
export function phrasesOf(m: RefMeasures): string[] {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const out: [number, string][] = [];
  if (m.quiet >= 0.45) out.push([m.quiet, `generous negative space (${pct(m.quiet)} of the frame quiet)`]);
  else if (m.quiet <= 0.1 && m.edges >= 0.14) out.push([0.8, 'a dense, detailed surface']);
  if (m.colourfulness < 14) out.push([0.9, 'near-monochrome']);
  else if (m.colourfulness >= 58) out.push([0.85, 'saturated, colourful']);
  if (m.contrast >= 0.3) out.push([0.75, 'hard contrast']);
  else if (m.contrast <= 0.09) out.push([0.6, 'soft, low contrast']);
  if (m.luminance >= 0.72) out.push([0.5, 'high key']);
  else if (m.luminance <= 0.28) out.push([0.55, 'low key']);
  if (m.asymmetry <= 0.12 && m.offCentre <= 0.15) out.push([0.7, 'centred and symmetric']);
  else if (m.offCentre >= 0.35) out.push([0.7, 'weight set well off-centre']);
  if (m.diagonal >= 0.35 && m.edges >= 0.04) out.push([0.65, 'strong diagonals']);
  else if (m.square >= 0.45 && m.edges >= 0.04) out.push([0.45, 'square, horizontal and vertical lines']);
  if (m.regularity >= 0.5) out.push([0.6, 'a regular rhythm of repeated elements']);
  if (m.hues >= 4) out.push([0.5, 'many hues']);
  else if (m.hues === 1 && m.chroma >= 0.15) out.push([0.5, 'one hue family']);
  if (m.warmth >= 0.35) out.push([0.35, 'a warm cast']);
  else if (m.warmth <= -0.35) out.push([0.35, 'a cool cast']);
  if (m.grain >= 0.55) out.push([0.4, 'visible grain']);
  if (typeof m.motion === 'number') out.push([0.9, m.motion >= 0.45 ? 'fast, constant movement' : m.motion <= 0.12 ? 'slow, almost still movement' : 'steady movement']);
  return out.sort((a, b) => b[0] - a[0]).map((x) => x[1]).slice(0, 6);
}

/**
 * A reference's DNA from its pixels: one frame, or for a moving reference several (the first is read as the
 * picture, all of them for movement). `of` names what was measured, so it is not measured again.
 */
export function refDnaOf(frames: Pixels | Pixels[], of: string): RefDna {
  const list = Array.isArray(frames) ? frames : [frames];
  const m = measurePixels(list[Math.min(1, list.length - 1)]);
  const moving = list.length > 1;
  if (moving) m.motion = motionBetween(list);
  return { votes: votesOf(m), said: phrasesOf(m), via: moving ? ['pixels', 'motion'] : ['pixels'], of: of.slice(0, 120) };
}
