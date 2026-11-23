// lib/ux-v0/graphics/director/schema.ts — what the creative director may answer, held to its shape.
//
// The director's answer is JSON from a model: untrusted. Each of the three answers (a design, an edit, a review) is
// read here into a typed value with every field checked: text bounded and stripped of control characters, levels and
// verbs from fixed lists, ids only of objects that exist, numbers finite and inside sane bounds, colours a palette
// role or a hex, faces only from the library (as its list spells them), effects and blend modes only from the
// registries, new wording only when the person wrote it. What does not pass is dropped and SAID (`dropped`), so the
// person is never told a change was made that was not, and nothing is silently discarded. The program inside a design
// and the instruction inside an "add" stay as written here: they pass their own gate when compiled
// (generative/program.ts normalizeProgram, through compose.ts composeProgram / compileOnBoard).

import { graphicFont } from '../../fonts';
import { BLENDS } from '../doc';
import { EFFECTS } from '../effects';
import { normalizeQuestion, type PlanQuestion } from '../creative/plan';

export const LEVELS = ['object', 'element', 'composition', 'aesthetic', 'conceptual', 'global'] as const;
export type Level = (typeof LEVELS)[number];
export const PALETTE_ROLES = ['ground', 'ink', 'accent', 'accent2', 'muted'] as const;
export type PaletteRole = (typeof PALETTE_ROLES)[number];
export const COLOUR_NAMES = ['ground', 'ink', 'accent', 'accent2', 'accent3', 'muted', 'paper', 'line'] as const;
export const RESTORE_SCOPES = ['colours', 'type', 'layout', 'everything'] as const;
export type RestoreScope = (typeof RESTORE_SCOPES)[number];

export interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** A colour as the director writes it: a palette role or a hex. */
export type ColourWord = string;
export type PaintWord = ColourWord | { linear: { angle: number; stops: ColourWord[] } } | { radial: { stops: ColourWord[] } } | null;

export interface SetProps {
  size?: number;
  font?: string;
  weight?: number;
  color?: ColourWord;
  case?: 'upper' | 'lower' | 'none';
  tracking?: number;
  lineHeight?: number;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  italic?: boolean;
  outline?: boolean;
  accentWord?: number | null;
  fill?: PaintWord;
  stroke?: { color: ColourWord; width: number; dash?: number[]; cap?: 'butt' | 'round' | 'square' } | null;
  radius?: number;
  opacity?: number;
  rotation?: number;
  blend?: string;
  fx?: { kind: string; params?: Record<string, number> }[];
  hidden?: boolean;
}

export type EditOp =
  | { do: 'set'; id: string; props: SetProps }
  | { do: 'place'; id: string; box: FrameBox }
  | { do: 'remove'; id: string }
  | { do: 'order'; id: string; to: 'front' | 'back' }
  | { do: 'add'; element: Record<string, unknown>; under?: string }
  | { do: 'ground'; paint: Exclude<PaintWord, null> }
  | { do: 'words'; id: string; text: string }
  | { do: 'restore'; turn: number; scope: RestoreScope };

export interface Understanding {
  level: Level;
  /** what the person wants to see, in a sentence */
  goal: string;
  affects: string[];
  preserves: string[];
}

export interface DirectedEdit {
  understanding: Understanding;
  question?: PlanQuestion;
  /** one sentence to the person */
  summary: string;
  palette?: Partial<Record<PaletteRole, string>>;
  fonts?: { display?: string; body?: string };
  edits: EditOp[];
  /** what was dropped here, said */
  dropped: string[];
}

export interface DirectedDesign {
  reading: { objective: string; audience: string; feeling: string };
  concept: { idea: string; decisions: string[] };
  direction: { name: string; palette: { ground: string; ink: string; accent: string; accent2?: string; muted?: string }; display: string | null; body: string | null };
  /** as written, in frame units: scaled and gated when composed */
  program: { ground: unknown; elements: unknown[] };
  dropped: string[];
}

export interface DirectedReview {
  verdict: 'ship' | 'revise';
  seen: string[];
  edits: EditOp[];
  dropped: string[];
}

const o = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined);
const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).map((x) => str(x, len)).filter(Boolean).slice(0, n);
const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const hex6 = (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : undefined);
const EFFECT_KINDS = new Set(EFFECTS.map((e) => e.kind));

/** A colour word: a palette role, or a hex (lower case). */
export function colourWord(v: unknown): ColourWord | undefined {
  if (typeof v !== 'string') return undefined;
  const w = v.trim();
  if ((COLOUR_NAMES as readonly string[]).includes(w)) return w;
  return HEX.test(w) ? w.toLowerCase() : undefined;
}
export function paintWord(v: unknown): PaintWord | undefined {
  if (v === null) return null;
  const c = colourWord(v);
  if (c) return c;
  const r = o(v);
  const stops = (x: unknown) => (Array.isArray(x) ? x.map(colourWord).filter((y): y is string => !!y).slice(0, 6) : []);
  if (Array.isArray(o(r.linear).stops)) {
    const st = stops(o(r.linear).stops);
    return st.length >= 2 ? { linear: { angle: fin(o(r.linear).angle) ? clamp(o(r.linear).angle as number, -360, 360) : 90, stops: st } } : undefined;
  }
  if (Array.isArray(o(r.radial).stops)) {
    const st = stops(o(r.radial).stops);
    return st.length >= 2 ? { radial: { stops: st } } : undefined;
  }
  return undefined;
}

/** A face as the director names it: "display" or "body" (a role), or a face of the library by its exact name. */
const faceWord = (v: unknown): string | undefined => (v === 'display' || v === 'body' ? v : graphicFont(v)?.name);

const SET_KEYS = ['size', 'font', 'weight', 'color', 'case', 'tracking', 'lineHeight', 'align', 'valign', 'italic', 'outline', 'accentWord', 'fill', 'stroke', 'radius', 'opacity', 'rotation', 'blend', 'fx', 'hidden'] as const;

function setProps(r: Record<string, unknown>, where: string, dropped: string[]): SetProps {
  const p: SetProps = {};
  const bad = (k: string) => dropped.push(`${where}: “${k}” was not a value SocriaUX can set`);
  if ('size' in r) fin(r.size) && r.size > 0 ? (p.size = clamp(r.size, 1, 4000)) : bad('size');
  if ('font' in r) {
    const f = faceWord(r.font);
    f ? (p.font = f) : dropped.push(`${where}: “${str(r.font, 40)}” is not a face in the library`);
  }
  if ('weight' in r) fin(r.weight) ? (p.weight = clamp(Math.round(r.weight / 50) * 50, 100, 900)) : bad('weight');
  if ('color' in r) colourWord(r.color) ? (p.color = colourWord(r.color)) : bad('color');
  if ('case' in r) oneOf(r.case, ['upper', 'lower', 'none'] as const) ? (p.case = r.case as SetProps['case']) : bad('case');
  if ('tracking' in r) fin(r.tracking) ? (p.tracking = clamp(r.tracking, -200, 600)) : bad('tracking');
  if ('lineHeight' in r) fin(r.lineHeight) ? (p.lineHeight = clamp(r.lineHeight, 0.6, 3)) : bad('lineHeight');
  if ('align' in r) oneOf(r.align, ['left', 'center', 'right'] as const) ? (p.align = r.align as SetProps['align']) : bad('align');
  if ('valign' in r) oneOf(r.valign, ['top', 'middle', 'bottom'] as const) ? (p.valign = r.valign as SetProps['valign']) : bad('valign');
  if (typeof r.italic === 'boolean') p.italic = r.italic;
  if (typeof r.outline === 'boolean') p.outline = r.outline;
  if ('accentWord' in r) r.accentWord === null ? (p.accentWord = null) : fin(r.accentWord) ? (p.accentWord = clamp(Math.round(r.accentWord), 0, 40)) : bad('accentWord');
  if ('fill' in r) {
    const f = paintWord(r.fill);
    f !== undefined ? (p.fill = f) : bad('fill');
  }
  if ('stroke' in r) {
    if (r.stroke === null) p.stroke = null;
    else {
      const s = o(r.stroke);
      const c = colourWord(s.color);
      if (c && fin(s.width)) p.stroke = { color: c, width: clamp(s.width, 0, 400), ...(Array.isArray(s.dash) ? { dash: s.dash.filter(fin).slice(0, 8).map((d) => clamp(d, 0, 2000)) } : {}), ...(oneOf(s.cap, ['butt', 'round', 'square'] as const) ? { cap: s.cap as 'butt' | 'round' | 'square' } : {}) };
      else bad('stroke');
    }
  }
  if ('radius' in r) fin(r.radius) ? (p.radius = clamp(r.radius, 0, 2000)) : bad('radius');
  if ('opacity' in r) fin(r.opacity) ? (p.opacity = clamp(r.opacity, 0, 1)) : bad('opacity');
  if ('rotation' in r) fin(r.rotation) ? (p.rotation = clamp(r.rotation, -360, 360)) : bad('rotation');
  if ('blend' in r) oneOf(r.blend, BLENDS) ? (p.blend = r.blend as string) : bad('blend');
  if ('fx' in r) {
    const fx = (Array.isArray(r.fx) ? r.fx : [])
      .map((e) => o(e))
      .filter((e) => typeof e.kind === 'string' && EFFECT_KINDS.has(e.kind))
      .slice(0, 4)
      .map((e) => ({ kind: e.kind as string, ...(Object.keys(o(e.params)).length ? { params: Object.fromEntries(Object.entries(o(e.params)).filter(([, n]) => fin(n)).slice(0, 12).map(([k, n]) => [k.slice(0, 24), clamp(n as number, -1000, 1000)])) } : {}) }));
    if (Array.isArray(r.fx) && fx.length !== r.fx.length) dropped.push(`${where}: an effect SocriaUX does not have was left out`);
    p.fx = fx;
  }
  if (typeof r.hidden === 'boolean') p.hidden = r.hidden;
  return p;
}

const box = (v: unknown): FrameBox | null => {
  // (the sheet writes every object's box as [x, y, w, h]: an answer in the same notation is read as one)
  const b = o(Array.isArray(v) && v.length === 4 ? { x: v[0], y: v[1], w: v[2], h: v[3] } : v);
  if (![b.x, b.y, b.w, b.h].every(fin)) return null;
  return { x: clamp(b.x as number, -4000, 8000), y: clamp(b.y as number, -4000, 12000), w: clamp(b.w as number, 1, 12000), h: clamp(b.h as number, 1, 16000) };
};

export const MAX_EDITS = 80;

/** The edits of an answer, each checked (an id that is not on the design, a value that is not one, is dropped and said). */
export function normalizeEdits(raw: unknown, ctx: { ids: ReadonlySet<string>; given: string }, dropped: string[]): EditOp[] {
  const out: EditOp[] = [];
  const said = ctx.given.toLowerCase().replace(/\s+/g, ' ');
  for (const [i, e0] of (Array.isArray(raw) ? raw : []).slice(0, MAX_EDITS).entries()) {
    const e = o(e0);
    const where = `edit ${i + 1}`;
    const id = typeof e.id === 'string' ? e.id : '';
    const known = () => {
      if (ctx.ids.has(id)) return true;
      dropped.push(`${where}: there is no object “${id.slice(0, 40)}” on this design`);
      return false;
    };
    switch (e.do) {
      case 'set': {
        if (!known()) break;
        // properties given beside "id", or inside "props"/"set"
        const source = Object.keys(o(e.props)).length ? o(e.props) : Object.keys(o(e.set)).length ? o(e.set) : e;
        const props = setProps(Object.fromEntries(Object.entries(source).filter(([k]) => (SET_KEYS as readonly string[]).includes(k))), where, dropped);
        if (Object.keys(props).length) out.push({ do: 'set', id, props });
        else dropped.push(`${where}: nothing to set`);
        break;
      }
      case 'place': {
        const b = box(e.box);
        if (!known()) break;
        if (b) out.push({ do: 'place', id, box: b });
        else dropped.push(`${where}: a place without a valid box`);
        break;
      }
      case 'remove':
        if (known()) out.push({ do: 'remove', id });
        break;
      case 'order': {
        const to = oneOf(e.to, ['front', 'back'] as const);
        if (!known()) break;
        if (to) out.push({ do: 'order', id, to });
        else dropped.push(`${where}: an order must be to the front or the back`);
        break;
      }
      case 'add': {
        const el = o(e.element);
        if (typeof el.op !== 'string') {
          dropped.push(`${where}: an add without an instruction`);
          break;
        }
        const under = typeof e.under === 'string' ? e.under : undefined;
        out.push({ do: 'add', element: el, ...(under === 'bottom' || (under && ctx.ids.has(under)) ? { under } : {}) });
        break;
      }
      case 'ground': {
        const p = paintWord(e.paint);
        if (p) out.push({ do: 'ground', paint: p });
        else dropped.push(`${where}: a ground without a valid paint`);
        break;
      }
      case 'words': {
        const text = typeof e.text === 'string' ? e.text.replace(/[\u0000-\u0009\u000b-\u001f]+/g, ' ').trim().slice(0, 400) : '';
        if (!known()) break;
        // the words are the person's: only wording they wrote themselves, in this message, is set
        if (text && said.includes(text.toLowerCase().replace(/\s+/g, ' '))) out.push({ do: 'words', id, text });
        else dropped.push(`${where}: new wording is only set when you wrote it yourself (SocriaUX does not write the design’s words)`);
        break;
      }
      case 'restore': {
        const scope = oneOf(e.scope, RESTORE_SCOPES) ?? 'everything';
        if (fin(e.turn) && e.turn >= 1) out.push({ do: 'restore', turn: Math.round(e.turn), scope });
        else dropped.push(`${where}: a restore must name the turn to go back to`);
        break;
      }
      default:
        dropped.push(`${where}: “${str(e.do, 20) || 'nothing'}” is not something SocriaUX can do to a design`);
    }
  }
  return out;
}

function palette(v: unknown): Partial<Record<PaletteRole, string>> | undefined {
  const r = o(v);
  const out: Partial<Record<PaletteRole, string>> = {};
  for (const k of PALETTE_ROLES) if (hex6(r[k])) out[k] = hex6(r[k]);
  return Object.keys(out).length ? out : undefined;
}
function fonts(v: unknown, dropped: string[]): { display?: string; body?: string } | undefined {
  const r = o(v);
  const out: { display?: string; body?: string } = {};
  for (const k of ['display', 'body'] as const) {
    if (typeof r[k] !== 'string' || !r[k]) continue;
    const f = graphicFont(r[k]);
    if (f) out[k] = f.name;
    else dropped.push(`“${str(r[k], 40)}” is not a face in the library`);
  }
  return Object.keys(out).length ? out : undefined;
}

/** An edit held to its shape; null when it carries nothing (no edit, no palette or face change, no question, no summary). */
export function normalizeEdit(raw: unknown, ctx: { ids: ReadonlySet<string>; given: string }): DirectedEdit | null {
  const r = o(raw);
  const u = o(r.understanding);
  const dropped: string[] = [];
  const question = normalizeQuestion(r.question) ?? undefined;
  const edits = question ? [] : normalizeEdits(r.edits, ctx, dropped);
  const pal = question ? undefined : palette(r.palette);
  const fnt = question ? undefined : fonts(r.fonts, dropped);
  const summary = str(r.summary, 400);
  if (!edits.length && !pal && !fnt && !question && !summary) return null;
  return {
    understanding: { level: oneOf(u.level, LEVELS) ?? 'aesthetic', goal: str(u.goal, 300), affects: list(u.affects, 8, 80), preserves: list(u.preserves, 8, 80) },
    ...(question ? { question } : {}),
    summary: summary || (question ? '' : 'the change you asked for'),
    ...(pal ? { palette: pal } : {}),
    ...(fnt ? { fonts: fnt } : {}),
    edits,
    dropped,
  };
}

/** A design held to its shape; null when it has no program or no palette. */
export function normalizeDesign(raw: unknown): DirectedDesign | null {
  const r = o(raw);
  const d = o(r.direction);
  const p = o(d.palette);
  const prog = o(r.program);
  const dropped: string[] = [];
  const ground = hex6(p.ground);
  const ink = hex6(p.ink);
  if (!ground || !ink || !Array.isArray(prog.elements) || !prog.elements.length) return null;
  const face = (v: unknown, which: string): string | null => {
    const f = graphicFont(v);
    if (!f) dropped.push(`the ${which} face “${str(v, 40) || 'none'}” is not in the library, so the brief’s own was used`);
    return f?.name ?? null;
  };
  const c = o(r.concept);
  const rd = o(r.reading);
  return {
    reading: { objective: str(rd.objective, 300), audience: str(rd.audience, 200), feeling: str(rd.feeling, 200) },
    concept: { idea: str(c.idea, 300), decisions: list(c.decisions, 8, 240) },
    direction: { name: str(d.name, 60) || 'Directed', palette: { ground, ink, accent: hex6(p.accent) ?? ink, ...(hex6(p.accent2) ? { accent2: hex6(p.accent2) } : {}), ...(hex6(p.muted) ? { muted: hex6(p.muted) } : {}) }, display: face(d.display, 'display'), body: face(d.body, 'text') },
    program: { ground: prog.ground ?? 'ground', elements: prog.elements.slice(0, 400) },
    dropped,
  };
}

/** A review held to its shape; null when it says nothing. */
export function normalizeReview(raw: unknown, ctx: { ids: ReadonlySet<string> }): DirectedReview | null {
  const r = o(raw);
  const dropped: string[] = [];
  const edits = normalizeEdits(r.edits, { ids: ctx.ids, given: '' }, dropped).filter((e) => e.do !== 'words' && e.do !== 'restore');
  const seen = list(r.seen, 8, 240);
  if (!edits.length && !seen.length && r.verdict !== 'ship') return null;
  return { verdict: r.verdict === 'revise' && edits.length ? 'revise' : 'ship', seen, edits: edits.slice(0, 24), dropped };
}
