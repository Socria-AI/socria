// lib/ux-v0/evaluate.ts — reading a rendered design, and fixing what can be fixed.
//
// After a design is generated, SocriaUX draws it at a desktop and a phone
// width, measures what the browser actually laid out (audit-source.ts), and
// reads the measurements here. Each finding says what is wrong, where, and how
// sure it is; when a deterministic change fixes it — a section moved off a
// ground where its text failed, a variant that broke the phone layout swapped
// for one that holds, a type scale with too little hierarchy stepped up — the
// fix is a patch (spec.ts), applied in at most two bounded rounds and kept as
// a version the designer can undo. Nothing the designer locked is changed:
// those findings are reported, with what to do, instead.
//
// Two scores, both explainable line by line:
//   quality          — the page works: it fits the phone, reads, can be
//                      tapped, loads its pictures, keeps a hierarchy.
//   distinctiveness  — how far it is from the generic generated page: the
//                      default type pair, the centred hero over a gradient,
//                      icon-card grids, letter-spaced capitals everywhere,
//                      rounded boxes with soft shadows, stock section order,
//                      stock phrases. A heuristic, not taste; the reasons are
//                      listed so a designer can disagree with them.

import { lockedTouched } from './edit';
import { sampleFor } from './fit';
import { primaryAction } from './study';
import { intentOf, requiredComponents } from './intent';
import { contrastRatio } from '../ux/audit';
import { isDark } from './color';
import { LOCK_LABEL, briefColors, lockedChanges, type ArtDirection, type LockGroup } from './direction';
import { knownFont } from './fonts';
import { whyFor } from './knowledge';
import { stepMotion } from './motion';
import { STILL_MOTION, ensureContrast, kindDef, lookFromTokens, normalizeTokens, usableImages, type DesignSpec, type Patch, type Section } from './spec';
import type { DesignBrief, Moodboard } from './types';

// ── what the audit reports (from inside the sandbox: never trusted as is) ──

export interface PageAudit {
  width: number;
  viewport: number;
  height: number;
  overflowX: number;
  bodySize: number;
  sections: { id: string; kind: string; variant: string; tone: string; top: number; height: number; ground: string; words: number }[];
  headings: { level: number; size: number; lines: number; width: number; section: string; path: string; text: string; align: string; transform: string; family: string }[];
  contrast: { section: string; path: string; ratio: number; need: number; size: number; text: string }[];
  targets: { section: string; path: string; w: number; h: number; text: string }[];
  images: { section: string; path: string; ok: boolean; w: number; h: number }[];
  overflow: { section: string; path: string; by: number; tag: string }[];
  measure: { section: string; path: string; cpl: number }[];
  style: { gradients: number; shadows: number; roundedBoxes: number; trackedCaps: number; centred: number; blocks: number; emoji: number; icons: number; families: Record<string, number> };
  /** each booking, tried in place by the behaviour runtime: what did not work */
  behaviors: { index: number; slots: number; problems: string[] }[];
}

const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const n = (v: unknown, lo = -1e6, hi = 1e7) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);
const s = (v: unknown, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '');
const list = <T,>(v: unknown, max: number, f: (x: Record<string, any>) => T): T[] => (Array.isArray(v) ? v.slice(0, max).map((x) => f(o(x))) : []);

/** The audit as the frame sent it, held to its shape and sizes: a page can lie about itself, never about anything else. */
export function normalizeAudit(v: unknown): PageAudit | null {
  const r = o(v);
  if (!(n(r.width) > 0)) return null;
  const st = o(r.style);
  const fam: Record<string, number> = {};
  for (const [k, x] of Object.entries(o(st.families)).slice(0, 12)) fam[k.slice(0, 60)] = n(x, 0, 1e5);
  return {
    width: n(r.width, 0, 10000),
    viewport: n(r.viewport, 0, 10000),
    height: n(r.height, 0, 200000),
    overflowX: n(r.overflowX, -10000, 10000),
    bodySize: n(r.bodySize, 0, 100) || 16,
    sections: list(r.sections, 40, (x) => ({ id: s(x.id, 48), kind: s(x.kind, 24), variant: s(x.variant, 24), tone: s(x.tone, 12), top: n(x.top), height: n(x.height, 0, 100000), ground: s(x.ground, 40), words: n(x.words, 0, 1e5) })),
    headings: list(r.headings, 60, (x) => ({ level: n(x.level, 1, 6), size: n(x.size, 0, 500), lines: n(x.lines, 0, 200), width: n(x.width, 0, 10000), section: s(x.section, 48), path: s(x.path, 60), text: s(x.text, 80), align: s(x.align, 12), transform: s(x.transform, 12), family: s(x.family, 60) })),
    contrast: list(r.contrast, 40, (x) => ({ section: s(x.section, 48), path: s(x.path, 60), ratio: n(x.ratio, 0, 21), need: n(x.need, 0, 21), size: n(x.size, 0, 500), text: s(x.text, 50) })),
    targets: list(r.targets, 30, (x) => ({ section: s(x.section, 48), path: s(x.path, 60), w: n(x.w, 0, 10000), h: n(x.h, 0, 10000), text: s(x.text, 40) })),
    images: list(r.images, 40, (x) => ({ section: s(x.section, 48), path: s(x.path, 60), ok: x.ok === true, w: n(x.w, 0, 10000), h: n(x.h, 0, 10000) })),
    overflow: list(r.overflow, 20, (x) => ({ section: s(x.section, 48), path: s(x.path, 60), by: n(x.by, 0, 10000), tag: s(x.tag, 16) })),
    measure: list(r.measure, 20, (x) => ({ section: s(x.section, 48), path: s(x.path, 60), cpl: n(x.cpl, 0, 1000) })),
    style: {
      gradients: n(st.gradients, 0, 1e5), shadows: n(st.shadows, 0, 1e5), roundedBoxes: n(st.roundedBoxes, 0, 1e5), trackedCaps: n(st.trackedCaps, 0, 1e5),
      centred: n(st.centred, 0, 1e5), blocks: n(st.blocks, 0, 1e5), emoji: n(st.emoji, 0, 1e5), icons: n(st.icons, 0, 1e5), families: fam,
    },
    behaviors: list(r.behaviors, 10, (x) => ({ index: n(x.index, 0, 100), slots: n(x.slots, 0, 1000), problems: (Array.isArray(x.problems) ? x.problems : []).map((p: unknown) => s(p, 120)).filter(Boolean).slice(0, 6) })),
  };
}

// ── the generic page's habits, in words ───────────────────────────────

/** Stock phrases of generated copy. Each is a finding, with the place it was found. */
export const CLICHES: readonly [RegExp, string][] = [
  [/\bunlock(s|ing)?\b/i, 'unlock'],
  [/\belevate(s|d)?\b/i, 'elevate'],
  [/\bempower(s|ing)?\b/i, 'empower'],
  [/\bseamless(ly)?\b/i, 'seamless'],
  [/\brevolutioni[sz]e/i, 'revolutionise'],
  [/\bgame[- ]chang/i, 'game-changer'],
  [/\bcutting[- ]edge\b/i, 'cutting-edge'],
  [/\bnext[- ]level\b/i, 'next level'],
  [/\bnext[- ]gen(eration)?\b/i, 'next-generation'],
  [/\bstate[- ]of[- ]the[- ]art\b/i, 'state of the art'],
  [/\bin today'?s fast[- ]paced\b/i, 'in today’s fast-paced world'],
  [/\blook no further\b/i, 'look no further'],
  [/\bwelcome to\b/i, 'welcome to'],
  [/\b(your|the) journey\b/i, 'your journey'],
  [/\btransform (your|the way)\b/i, 'transform your'],
  [/\bdiscover the (power|magic|future)\b/i, 'discover the power'],
  [/\bsupercharge\b/i, 'supercharge'],
  [/\bharness the power\b/i, 'harness the power'],
  [/\bone[- ]stop[- ]shop\b/i, 'one-stop shop'],
  [/\bworld[- ]class\b/i, 'world-class'],
  [/\bbest[- ]in[- ]class\b/i, 'best-in-class'],
  [/\bleverag(e|ing)\b/i, 'leverage'],
  [/\brobust\b/i, 'robust'],
  [/\bsynerg/i, 'synergy'],
  [/\bunparalleled\b/i, 'unparalleled'],
  [/\bimagine a world\b/i, 'imagine a world'],
  [/\btake (it|your \w+) to the next level\b/i, 'to the next level'],
  [/\bget started today\b/i, 'get started today'],
  [/^\s*why (us|choose us)\??\s*$/i, 'why us'],
  [/\bdiscover something new\b/i, 'discover something new'],
];

/** An action label that names nothing: what a button says when nobody decided what it does. */
export const GENERIC_ACTION = /^(begin|start|start now|get started|learn more|read more|click here|submit|go|explore|discover|discover more|find out more|see more|more|continue)$/i;

export interface Cliche {
  section: string;
  path: string;
  phrase: string;
  text: string;
}

/** Where the copy uses a stock phrase. */
export function clichesIn(spec: DesignSpec): Cliche[] {
  const out: Cliche[] = [];
  const walk = (sec: Section, v: unknown, path: string) => {
    if (typeof v === 'string') {
      for (const [re, phrase] of CLICHES) if (re.test(v) && out.length < 20) out.push({ section: sec.id, path, phrase, text: v.slice(0, 90) });
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(sec, x, path ? `${path}.${i}` : String(i)));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(sec, x, path ? `${path}.${k}` : k);
  };
  for (const sec of spec.sections) walk(sec, sec.content, '');
  return out;
}

export interface Signal {
  /** what was seen */
  reason: string;
  /** how much it pulls the page toward the generic one */
  weight: number;
}

const STOCK_ORDER = ['hero', 'features', 'pricing', 'faq', 'cta'];
/** habits some languages use deliberately */
const ON_PURPOSE: Record<string, readonly string[]> = { 'quiet-luxury': ['centred'], organic: ['rounded', 'centred'], craft: ['rounded'] };

/** What makes this page look like every generated page, from its spec and (when measured) its rendering. */
export function genericSignals(spec: DesignSpec, audit?: PageAudit | null): Signal[] {
  const look = spec.look ?? lookFromTokens(spec.tokens);
  const out: Signal[] = [];
  const add = (weight: number, reason: string) => out.push({ weight, reason });
  if (look.language === 'classic') add(10, 'No art direction: drawn with the one stylesheet every brief used to get.');
  const { display, body } = spec.tokens.fonts;
  if ((display === 'Inter' || display === 'Fraunces' || display === 'Playfair Display') && body === 'Inter') add(8, `The default type pair (${display} with Inter).`);
  // a habit the direction's language uses on purpose is its choice, not a default
  const chose = (habit: string) => (ON_PURPOSE[look.language] ?? []).includes(habit);
  if (spec.sections.some((x) => x.kind === 'hero' && x.variant === 'centered') && !chose('centred')) add(7, 'A centred hero, the most common opening there is.');
  if (spec.sections.some((x) => x.kind === 'features' && x.variant === 'grid' && (x.content.items as any[])?.some((i: any) => i.icon)) && look.motifs.includes('icons')) add(9, 'A grid of icon cards.');
  if (look.label === 'caps' && look.language !== 'quiet-luxury') add(5, 'Small letter-spaced capitals above every heading.');
  if (look.containers === 'cards' && spec.tokens.radius === 'round' && !chose('rounded')) add(6, 'Rounded cards for everything.');
  if (spec.sections.some((x) => x.kind === 'cta' && (x.variant === 'centered' || x.variant === 'band') && x.tone !== 'accent')) add(4, 'A boxed call to action at the end.');
  const content = spec.sections.filter((x) => !['nav', 'footer'].includes(x.kind));
  if (content.length >= 4 && content.every((x) => !x.tone || x.tone === 'base') && look.containers === 'open' && look.rules === 'none') add(7, 'Every section on the same ground, with nothing between them.');
  const kinds = content.map((x) => x.kind);
  let at = 0;
  for (const k of kinds) if (k === STOCK_ORDER[at]) at++;
  if (at >= 4) add(8, 'The stock order: hero, features, pricing, questions, call to action.');
  const cl = clichesIn(spec);
  if (cl.length) add(Math.min(16, cl.length * 4), `Stock phrases: ${[...new Set(cl.map((c) => `“${c.phrase}”`))].slice(0, 4).join(', ')}.`);
  if (audit) {
    if (audit.style.gradients > 0) add(Math.min(12, 6 + audit.style.gradients * 2), `${audit.style.gradients} decorative gradient${audit.style.gradients > 1 ? 's' : ''}.`);
    if (audit.style.shadows > 3) add(5, 'Soft drop shadows on many boxes.');
    if (audit.style.emoji > 0) add(6, 'Emoji in the copy.');
    if (audit.style.blocks > 8 && audit.style.centred / audit.style.blocks > 0.6 && look.align !== 'center') add(6, 'Most text centred.');
    if (audit.style.trackedCaps > 6 && look.language !== 'quiet-luxury') add(4, `${audit.style.trackedCaps} runs of letter-spaced capitals.`);
  }
  return out.sort((a, b) => b.weight - a.weight);
}

// ── findings ─────────────────────────────────────────────────────────

export type Severity = 'high' | 'medium' | 'low';

export interface Finding {
  id: string;
  kind: 'overflow' | 'contrast' | 'target' | 'image' | 'hierarchy' | 'headline' | 'measure' | 'rhythm' | 'cliche' | 'length' | 'placeholder' | 'generic' | 'fidelity' | 'motion' | 'function';
  severity: Severity;
  viewport: 'desktop' | 'phone' | 'page';
  section: string;
  message: string;
  /** a deterministic change that fixes it, when there is one and nothing locked stands in the way */
  fix?: Patch;
  /** the fix is offered, never applied without the designer (it takes something away) */
  manual?: boolean;
  /** what to ask SocriaUX, when it needs words rather than a rule */
  ask?: string;
  /** a fix exists but touches something the designer locked */
  blocked?: string;
  /** the fix puts back something the designer decided: it is not held back by their locks */
  restore?: boolean;
  /** why it matters (lib/ux-v0/knowledge.ts) */
  why?: string;
}

export interface Evaluation {
  quality: number;
  distinctiveness: number;
  /** how faithfully the page keeps the approved direction, the brief's decisions and its rules (0–100) */
  fidelity: number;
  /** what it keeps, said plainly: the direction, rules, contrast, the reduced-motion alternative */
  kept: string[];
  findings: Finding[];
  signals: Signal[];
  /** one line, for the rail */
  summary: string;
}

const PENALTY: Record<Severity, number> = { high: 16, medium: 7, low: 2 };

const label = (spec: DesignSpec, id: string) => {
  const sec = spec.sections.find((x) => x.id === id);
  return sec ? `${kindDef(sec.kind)?.label ?? sec.kind} (${id})` : id || 'the page';
};

/** A simpler variant that holds on a phone, for a section that overflowed. */
const SAFER: Record<string, string> = { hero: 'centered', features: 'list', stats: 'row', gallery: 'grid', split: 'image-left', quote: 'large', cta: 'band', faq: 'accordion', list: 'simple', text: 'narrow', pricing: 'cards', form: 'stacked' };

/**
 * Read a design from its measurements at a desktop and a phone width.
 * `locks`: the groups the designer locked — fixes that would touch them are
 * reported, never applied.
 */
export interface FidelityContext {
  direction?: ArtDirection | null;
  brief?: DesignBrief | null;
  board?: Moodboard | null;
}

export function evaluateDesign(spec: DesignSpec, audits: { desktop?: PageAudit | null; phone?: PageAudit | null }, locks: readonly LockGroup[] = [], ctx: FidelityContext = {}): Evaluation {
  const findings: Finding[] = [];
  const add = (f0: Omit<Finding, 'id'>) => {
    const f = { ...f0, why: f0.why ?? whyFor(f0.kind) };
    const id = `${f.kind}:${f.viewport}:${f.section}:${findings.length}`;
    // a fix that would change a locked decision is held back and said (unless it puts that decision back)
    if (f.fix && !f.restore) {
      const hit = lockedChanges(spec, f.fix, locks);
      if (hit.length) {
        findings.push({ ...f, id, fix: undefined, blocked: `It would change ${hit.join(' and ')}, which you locked.` });
        return;
      }
    }
    // a section the designer locked is never repaired automatically: the finding is said, the fix left to them
    const inLocked = !!f.section && !!spec.sections.find((x) => x.id === f.section)?.locked;
    if ((f.fix && lockedTouched(spec, f.fix).length) || (inLocked && !f.fix && !f.manual)) {
      findings.push({ ...f, id, fix: undefined, blocked: 'That section is locked, so SocriaUX leaves it to you.' });
      return;
    }
    findings.push({ ...f, id });
  };
  const byId = new Map(spec.sections.map((x) => [x.id, x]));
  const look = spec.look ?? lookFromTokens(spec.tokens);

  const seenImages = new Set<string>();
  for (const [vp, a] of [['desktop', audits.desktop], ['phone', audits.phone]] as const) {
    if (!a) continue;
    // 1 · nothing wider than the screen
    for (const ov of a.overflow) {
      const sec = byId.get(ov.section);
      const safe = sec ? SAFER[sec.kind] : undefined;
      const big = sec?.kind === 'hero' || /^h[12]$/.test(ov.tag);
      add({
        kind: 'overflow', severity: 'high', viewport: vp, section: ov.section,
        message: `${label(spec, ov.section)} runs ${ov.by}px past the edge of the ${vp === 'phone' ? 'phone' : 'screen'}${ov.tag ? ` (a ${ov.tag})` : ''}.`,
        fix: big && look.ratio > 1.26 ? { op: 'look', look: { ratio: Math.round((look.ratio - 0.08) * 1000) / 1000 }, summary: 'Type scale stepped down so the headline fits the phone' } : sec && !sec.fixed && safe && sec.variant !== safe ? { op: 'variant', sectionId: sec.id, variant: safe, summary: `${kindDef(sec.kind)?.label} set as ${safe} so it fits the phone` } : undefined,
      });
    }
    if (!a.overflow.length && a.overflowX > 2) add({ kind: 'overflow', severity: 'high', viewport: vp, section: '', message: `The page scrolls sideways by ${a.overflowX}px on the ${vp}.` });
    // 2 · text that does not read on its ground
    const seen = new Set<string>();
    for (const c of a.contrast) {
      const key = `${c.section}|${c.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sec = byId.get(c.section);
      add({
        kind: 'contrast', severity: c.ratio < 3 ? 'high' : 'medium', viewport: vp, section: c.section,
        message: `“${c.text}” reads at ${c.ratio}:1 (it needs ${c.need}:1) in ${label(spec, c.section)}.`,
        fix: sec && sec.tone && sec.tone !== 'base' && !sec.fixed ? { op: 'tone', sectionId: sec.id, tone: 'base', summary: `${kindDef(sec.kind)?.label} moved to the page’s own ground so its text reads` } : undefined,
      });
    }
    // 3 · targets a thumb can hit (phone only: a mouse is precise)
    if (vp === 'phone') for (const tg of a.targets.slice(0, 6)) add({ kind: 'target', severity: 'medium', viewport: vp, section: tg.section, message: `“${tg.text || 'A control'}” is ${tg.w}×${tg.h}px; a thumb needs 44×44.` });
    // 4 · pictures that did not arrive
    for (const im of a.images.filter((x) => !x.ok && !seenImages.has(`${x.section}|${x.path}`))) {
      seenImages.add(`${im.section}|${im.path}`);
      const sec = byId.get(im.section);
      const idx = Number(im.path.split('.')[1]);
      add({
        kind: 'image', severity: 'medium', viewport: vp, section: im.section, message: `An image in ${label(spec, im.section)} did not load.`, manual: true,
        fix: sec && Number.isInteger(idx) ? { op: 'images', sectionId: sec.id, images: sec.images.filter((_, i) => i !== idx), summary: 'A missing image taken out' } : undefined,
      });
    }
    // 5 · a headline that has become a paragraph
    const h1 = a.headings.find((h) => h.level === 1);
    if (h1) {
      const limit = vp === 'phone' ? 7 : 4;
      if (h1.lines > limit) add({ kind: 'headline', severity: 'medium', viewport: vp, section: h1.section, message: `The main headline breaks into ${h1.lines} lines on the ${vp}.`, ask: `Shorten the main headline (“${h1.text}”) to fewer than ${Math.max(5, Math.round(h1.text.split(' ').length * 0.6))} words, keeping its meaning.` });
      // 6 · a hierarchy you can see
      // a screen's heading names the screen; a page's leads it: an app screen needs less of a step
      if (vp === 'desktop' && h1.size / a.bodySize < (spec.pageType === 'app-screen' ? 1.6 : 2.3))
        add({ kind: 'hierarchy', severity: 'medium', viewport: vp, section: h1.section, message: `The main headline is only ${(h1.size / a.bodySize).toFixed(1)}× the body text; the page has little hierarchy.`, fix: { op: 'look', look: { ratio: Math.round(Math.min(1.7, look.ratio + 0.08) * 1000) / 1000 }, summary: 'Type scale stepped up for a clearer hierarchy' } });
    }
    // 7 · lines too long to read
    for (const m of a.measure.slice(0, 3)) add({ kind: 'measure', severity: 'low', viewport: vp, section: m.section, message: `Lines in ${label(spec, m.section)} run to about ${m.cpl} characters; 45–80 reads best.` });
    // 8 · a phone page that never ends
    if (vp === 'phone' && a.viewport > 0 && a.height / a.viewport > 16) add({ kind: 'length', severity: 'low', viewport: vp, section: '', message: `On a phone the page is ${Math.round(a.height / a.viewport)} screens long.`, ask: 'Make the page shorter on a phone: merge or remove the section that adds least.' });
  }

  // 9 · rhythm: two neighbours built the same way, or every section alike
  const content = spec.sections.filter((x) => !['nav', 'footer'].includes(x.kind));
  for (let i = 1; i < content.length; i++) {
    const a = content[i - 1];
    const b = content[i];
    if (a.kind === b.kind && a.variant === b.variant && !b.fixed) {
      const alt = kindDef(b.kind)?.variants.find((v) => v !== b.variant && !(['split', 'full-bleed'].includes(v) && b.kind === 'hero'));
      add({ kind: 'rhythm', severity: 'low', viewport: 'page', section: b.id, message: `${label(spec, a.id)} and ${label(spec, b.id)} are built the same way, one after the other.`, fix: alt ? { op: 'variant', sectionId: b.id, variant: alt, summary: `${kindDef(b.kind)?.label} varied so neighbours differ` } : undefined });
    }
  }
  // 10 · stock phrases
  for (const c of clichesIn(spec).slice(0, 5)) add({ kind: 'cliche', severity: 'low', viewport: 'page', section: c.section, message: `“${c.phrase}” is a stock phrase (${label(spec, c.section)}: “${c.text}”).`, ask: `Rewrite “${c.text}” without “${c.phrase}”, saying something only this brand could say.` });
  // 11 · facts still to fill
  const ph = new Set<string>();
  JSON.stringify(spec.sections.map((x) => x.content)).replace(/\[[^\]\n]{2,40}\]/g, (m) => (ph.add(m), m));
  if (ph.size >= 6) add({ kind: 'placeholder', severity: 'low', viewport: 'page', section: '', message: `${ph.size} facts are still placeholders (${[...ph].slice(0, 3).join(', ')}…).` });

  // 11b · an action that names nothing ("Begin", "Read more"): the brief's own action instead, or none
  const action = ctx.brief ? primaryAction(ctx.brief) : '';
  for (const sec of spec.sections) {
    for (const key of ['primary', 'secondary', 'cta'] as const) {
      const v = sec.content?.[key];
      if (typeof v !== 'string' || !GENERIC_ACTION.test(v.trim())) continue;
      const replace = key !== 'secondary' && action && !action.startsWith('[') && action.toLowerCase() !== v.trim().toLowerCase();
      add({
        kind: 'fidelity',
        severity: 'medium',
        viewport: 'page',
        section: sec.id,
        message: `“${v}” does not say what happens (${label(spec, sec.id)}).${replace ? ` The brief’s own action is “${action}”.` : ''}`,
        fix: replace
          ? ({ op: 'content', sectionId: sec.id, content: { [key]: action }, summary: `The action says “${action}”, from the brief, not “${v}”` } as Patch)
          : key === 'secondary'
            ? ({ op: 'content', sectionId: sec.id, content: { [key]: '' }, summary: `Took out the second action “${v}”, which named nothing` } as Patch)
            : undefined,
        ask: replace ? undefined : `Rewrite the action “${v}” so it names what happens.`,
      });
    }
  }

  // 12 · fidelity: the approved direction, the brief's decisions and rules, the pictures it may place; and its motion
  functionChecks(spec, audits, ctx, add);
  const held = fidelityChecks(spec, ctx, add);

  const signals = genericSignals(spec, audits.desktop ?? audits.phone ?? null);
  const quality = Math.max(0, 100 - findings.reduce((t, f) => t + (f.kind === 'cliche' || f.kind === 'placeholder' || f.kind === 'fidelity' ? 0 : PENALTY[f.severity]), 0));
  const fidelity = Math.max(0, 100 - findings.filter((f) => f.kind === 'fidelity').reduce((t, f) => t + (f.severity === 'high' ? 20 : f.severity === 'medium' ? 8 : 2), 0));
  const distinctiveness = Math.max(0, 100 - signals.reduce((t, x) => t + x.weight, 0));
  const high = findings.filter((f) => f.severity === 'high').length;
  const summary = !findings.length
    ? 'Checked at desktop and phone widths: nothing to fix.'
    : `${findings.length} finding${findings.length > 1 ? 's' : ''}${high ? `, ${high} serious` : ''}; ${findings.filter((f) => f.fix).length} can be fixed without asking.`;
  return { quality, distinctiveness, fidelity, kept: held, findings, signals, summary };
}

/** A patch that puts a locked group back as the direction has it. */
function restore(g: LockGroup, dir: ArtDirection): Patch | undefined {
  switch (g) {
    case 'palette':
      return { op: 'tokens', tokens: { colors: { ...dir.tokens.colors } }, summary: 'Colours put back as the direction has them' };
    case 'type':
      return { op: 'tokens', tokens: { fonts: { ...dir.tokens.fonts } }, summary: 'Typefaces put back as the direction has them' };
    case 'layout':
      return { op: 'look', look: { grid: dir.look.grid, width: dir.look.width }, summary: 'Grid put back as the direction has it' };
    case 'surface':
      return { op: 'look', look: { containers: dir.look.containers, buttons: dir.look.buttons }, summary: 'Surfaces put back as the direction has them' };
    case 'imagery':
      return { op: 'tokens', tokens: { imageTreatment: dir.tokens.imageTreatment }, summary: 'Picture treatment put back as the direction has it' };
    case 'motion':
      return { op: 'look', look: { motion: { ...(dir.look.motion ?? STILL_MOTION) } }, summary: 'Motion put back as the direction has it' };
    default:
      return undefined;
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Does the page keep what was decided? The approved direction's locked groups,
 * the brief's locked parts and its rules (those a page can be checked
 * against), its contrast target, and the line between pictures for the page
 * and references that only inspire. Then how it moves. Returns what holds.
 */
/**
 * WHETHER IT DOES ITS JOB. A design for a task must contain what the task needs (a booking screen, a
 * booking), and what it contains must work: each booking is tried in the page by the behaviour runtime
 * (choose a time, confirm, see the confirmation, go back). A missing component is added by its fix,
 * with sample content; one that does not work is reported plainly.
 */
function functionChecks(spec: DesignSpec, audits: { desktop?: PageAudit | null; phone?: PageAudit | null }, ctx: FidelityContext, add: (f: Omit<Finding, 'id'>) => void): void {
  if (ctx.brief) {
    const intent = intentOf(ctx.brief);
    for (const component of requiredComponents(intent)) {
      if (!component || spec.sections.some((x) => x.kind === component)) continue;
      const def = kindDef(component);
      const content = sampleFor(component, intent, ctx.brief);
      if (!def || !content || !def.pages.includes(spec.pageType)) continue;
      const req = intent.requirements.find((r) => r.component === component);
      const lead = spec.sections.filter((x) => ['nav', 'app-nav', 'app-header'].includes(x.kind) || (!intent.screen && x.kind === 'hero')).pop();
      add({
        kind: 'function',
        severity: 'high',
        viewport: 'page',
        section: '',
        message: `It has no ${def.label.toLowerCase()}, and the brief needs one${req ? `: ${req.text.toLowerCase()}` : ''}.`,
        fix: { op: 'add', after: lead?.id ?? null, section: { id: component, kind: component, variant: ctx.direction?.compose?.[component] ?? def.variants[0], content, images: [] }, summary: `Add the ${def.label.toLowerCase()} the brief needs` } as Patch,
        restore: true,
      });
    }
  }
  for (const b of audits.desktop?.behaviors ?? []) {
    if (!b.problems.length) continue;
    const sec = spec.sections.filter((x) => x.kind === 'booking')[b.index];
    add({ kind: 'function', severity: 'high', viewport: 'page', section: sec?.id ?? '', message: `The booking does not work as it should: ${b.problems.join('; ')}.`, manual: true });
  }
}

function fidelityChecks(spec: DesignSpec, ctx: FidelityContext, add: (f: Omit<Finding, 'id'>) => void): string[] {
  const kept: string[] = [];
  const look = spec.look ?? lookFromTokens(spec.tokens);
  const tk = spec.tokens;
  const dir = ctx.direction;
  if (dir) {
    // the direction's colours as a page would normalise them, so contrast fixes are not mistaken for drift
    const dirColors = normalizeTokens(dir.tokens, []).colors;
    const drift: [LockGroup, boolean][] = [
      ['palette', !same(tk.colors, dirColors)],
      ['type', tk.fonts.display !== dir.tokens.fonts.display || tk.fonts.body !== dir.tokens.fonts.body],
      ['layout', look.grid !== dir.look.grid || look.width !== dir.look.width],
      ['surface', look.containers !== dir.look.containers || look.buttons !== dir.look.buttons],
      ['imagery', tk.imageTreatment !== dir.tokens.imageTreatment],
      ['motion', !same(look.motion, dir.look.motion ?? STILL_MOTION)],
    ];
    const broken = drift.filter(([g, d]) => d && dir.locks.includes(g)).map(([g]) => g);
    for (const g of broken)
      add({ kind: 'fidelity', severity: 'high', viewport: 'page', section: '', message: `The page has drifted from the direction’s ${LOCK_LABEL[g].toLowerCase()}, which you locked.`, fix: restore(g, dir), restore: true, why: 'A locked decision is a promise: it holds through regenerating and refining.' });
    if (!broken.length) kept.push(`Follows the approved direction, “${dir.name}”${dir.locks.length ? `, with its locked ${dir.locks.map((g) => LOCK_LABEL[g].toLowerCase()).join(', ')}` : ''}.`);
  }
  const b = ctx.brief;
  if (b) {
    const dec = b.decisions ?? {};
    if (dec.colour === 'locked' && b.palette.length) {
      const want = briefColors(b);
      const off = (['background', 'text', 'accent'] as const).filter((k) => (tk.colors[k] ?? '').toLowerCase() !== (want[k] ?? '').toLowerCase());
      if (off.length) add({ kind: 'fidelity', severity: 'high', viewport: 'page', section: '', message: `Not the palette you locked in the brief (${off.join(', ')}).`, fix: { op: 'tokens', tokens: { colors: { ...tk.colors, ...want } }, summary: 'The brief’s locked palette put back' }, restore: true });
      else kept.push('Keeps the palette you locked in the brief.');
    }
    if (dec.typography === 'locked') {
      if (tk.fonts.display !== b.typography.display || tk.fonts.body !== b.typography.body)
        add({ kind: 'fidelity', severity: 'high', viewport: 'page', section: '', message: `Not the type you locked in the brief (${b.typography.display} with ${b.typography.body}).`, fix: { op: 'tokens', tokens: { fonts: { display: b.typography.display, body: b.typography.body } }, summary: 'The brief’s locked type put back' }, restore: true });
      else kept.push('Keeps the type you locked in the brief.');
    }
    if (dec.motion === 'locked' && b.spec?.motion) {
      if (!same(look.motion, b.spec.motion)) add({ kind: 'fidelity', severity: 'high', viewport: 'page', section: '', message: 'Not the motion you locked in the brief.', fix: { op: 'look', look: { motion: { ...b.spec.motion } }, summary: 'The brief’s locked motion put back' }, restore: true });
      else kept.push('Moves as you locked it in the brief.');
    }
    if (b.spec?.contrast === 'AAA') {
      const r = Math.min(contrastRatio(tk.colors.text, tk.colors.background), contrastRatio(tk.colors.muted, tk.colors.background));
      if (r < 7) add({ kind: 'fidelity', severity: 'high', viewport: 'page', section: '', message: `Some text reads at ${r.toFixed(1)}:1; the brief asks for AAA (7:1) for all of it.`, fix: { op: 'tokens', tokens: { colors: { ...tk.colors, text: ensureContrast(tk.colors.text, tk.colors.background, 7), muted: ensureContrast(tk.colors.muted, tk.colors.background, 7) } }, summary: 'Text darkened to AAA contrast' }, restore: true, why: whyFor('contrast') });
      else kept.push('Text reaches AAA contrast (7:1), as the brief asks.');
    }
    // rules a page can be checked against
    for (const rule of b.rules ?? []) {
      const r = ` ${rule.toLowerCase()} `;
      const broke = (msg: string, fix?: Patch, manual = false) => add({ kind: 'fidelity', severity: 'high', viewport: 'page', section: '', message: `Breaks the rule “${rule}”: ${msg}`, fix, manual, restore: true, why: 'A rule in the brief is non-negotiable; everything else is a preference.' });
      let checked = false;
      if (/\b(no|without) (motion|animation|animations|movement)\b|\bnothing (should )?moves?\b|\bstatic\b/.test(r)) {
        checked = true;
        if ((look.motion?.feel ?? 'still') !== 'still') broke('the page moves.', { op: 'look', look: { motion: { ...STILL_MOTION } }, summary: 'Motion stilled, as the rule asks' });
        else kept.push(`Keeps the rule “${rule}”.`);
      } else if (/\bno parallax\b/.test(r)) {
        checked = true;
        if ((look.motion?.parallax ?? 0) > 0) broke('pictures move in parallax.', { op: 'look', look: { motion: { ...(look.motion ?? STILL_MOTION), parallax: 0 } }, summary: 'Parallax removed, as the rule asks' });
        else kept.push(`Keeps the rule “${rule}”.`);
      } else if (/\b(no|without) (photos|photographs|photography|images|pictures)\b/.test(r)) {
        checked = true;
        const withPics = spec.sections.filter((x) => x.images.length).map((x) => x.id);
        if (withPics.length) broke(`${withPics.length} section${withPics.length === 1 ? ' shows' : 's show'} pictures (${withPics.slice(0, 3).join(', ')}).`, undefined, true);
        else kept.push(`Keeps the rule “${rule}”.`);
      } else if (/\bno serifs?\b|\bsans[- ]serif only\b/.test(r)) {
        checked = true;
        if (knownFont(tk.fonts.display)?.kind === 'serif') broke(`the headlines are set in ${tk.fonts.display}, a serif.`);
        else kept.push(`Keeps the rule “${rule}”.`);
      } else if (/\bno (rounded|round corners|pills?)\b|\bsquare corners\b/.test(r)) {
        checked = true;
        if (tk.radius !== 'none' || look.buttons === 'pill') broke('corners are rounded.', { op: 'tokens', tokens: { radius: 'none' }, summary: 'Corners squared, as the rule asks' });
        else kept.push(`Keeps the rule “${rule}”.`);
      } else if (/\bno (capitals|uppercase|all caps)\b/.test(r)) {
        checked = true;
        if (look.case === 'upper') broke('headlines are set in capitals.', { op: 'look', look: { case: 'sentence' }, summary: 'Headlines in sentence case, as the rule asks' });
        else kept.push(`Keeps the rule “${rule}”.`);
      } else if (/\bno icons\b/.test(r)) {
        checked = true;
        if (look.motifs.includes('icons')) broke('the page uses icons.', { op: 'look', look: { motifs: look.motifs.filter((m) => m !== 'icons') }, summary: 'Icons left out, as the rule asks' });
        else kept.push(`Keeps the rule “${rule}”.`);
      } else if (/\bno dark\b|\blight (ground|background)\b/.test(r)) {
        checked = true;
        if (isDark(tk.colors.background)) broke('the ground is dark.');
        else kept.push(`Keeps the rule “${rule}”.`);
      }
      if (!checked) kept.push(`The rule “${rule}” was given to SocriaUX; it cannot be measured on the page.`);
    }
  }
  // a reference kept only to inspire must not be pasted in
  if (ctx.board) {
    const ok = usableImages(ctx.board);
    for (const s of spec.sections) {
      const stray = s.images.filter((id) => ok && !ok.has(id));
      if (stray.length) add({ kind: 'fidelity', severity: 'high', viewport: 'page', section: s.id, message: `Shows ${stray.length === 1 ? 'a reference' : `${stray.length} references`} kept only to inspire.`, manual: true, why: whyFor('', 'ref.aspect') });
    }
  }
  // motion: purposeful, timed, and calm where calm was asked for
  const m = look.motion ?? STILL_MOTION;
  if (m.feel !== 'still') {
    kept.push('Every movement has a reduced-motion alternative: a short fade, nothing travelling.');
    const hero = spec.sections.find((x) => x.kind === 'hero');
    const title = String(hero?.content?.title ?? '').replace(/\*/g, '');
    if (m.headline === 'letters' && title.length > 42) add({ kind: 'motion', severity: 'low', viewport: 'page', section: hero?.id ?? '', message: `The headline (${title.length} characters) is long for letter-by-letter arrival; it arrives word by word instead.`, why: whyFor('', 'type.kinetic') });
    const calmAsked = (b?.accessibility ?? []).some((x) => /\b(motion|vestibular|calm|older|anxious|anxiety|dizz)/i.test(x)) || look.language === 'civic';
    if (calmAsked && (m.feel === 'kinetic' || m.feel === 'lively'))
      add({ kind: 'motion', severity: 'medium', viewport: 'page', section: '', message: `${m.feel === 'kinetic' ? 'Kinetic' : 'Lively'} motion for an audience that asked for calm.`, fix: { op: 'look', look: { motion: stepMotion(m, -1) }, summary: 'Motion made calmer' }, why: whyFor('', 'motion.reduced') });
    if (m.scroll && m.duration > 1200) add({ kind: 'motion', severity: 'low', viewport: 'page', section: '', message: `Arrivals take ${m.duration} ms; tied to scrolling, that can feel slow.`, fix: { op: 'look', look: { motion: { ...m, duration: 900 } }, summary: 'Arrivals shortened to 900 ms' }, why: whyFor('', 'motion.timing') });
  }
  return kept;
}

/** The fixes worth applying in one round: at most one per section, the serious first. */
export function fixesFor(ev: Evaluation): { finding: Finding; patch: Patch }[] {
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  const out: { finding: Finding; patch: Patch }[] = [];
  const touched = new Set<string>();
  let lookTouched = false;
  for (const f of [...ev.findings].sort((a, b) => order[a.severity] - order[b.severity])) {
    if (!f.fix || f.manual) continue;
    if (f.fix.op === 'look') {
      if (lookTouched) continue;
      lookTouched = true;
    } else {
      const key = f.fix.sectionId ?? '';
      if (touched.has(key)) continue;
      touched.add(key);
    }
    out.push({ finding: f, patch: f.fix });
  }
  return out.slice(0, 6);
}

/** The most rounds of automatic fixing after one generation. */
export const MAX_REVISION_ROUNDS = 2;
