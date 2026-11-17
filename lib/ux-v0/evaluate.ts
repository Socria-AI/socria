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

import { lockedChanges, type LockGroup } from './direction';
import { kindDef, lookFromTokens, type DesignSpec, type Patch, type Section } from './spec';

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
];

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
  kind: 'overflow' | 'contrast' | 'target' | 'image' | 'hierarchy' | 'headline' | 'measure' | 'rhythm' | 'cliche' | 'length' | 'placeholder' | 'generic';
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
}

export interface Evaluation {
  quality: number;
  distinctiveness: number;
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
export function evaluateDesign(spec: DesignSpec, audits: { desktop?: PageAudit | null; phone?: PageAudit | null }, locks: readonly LockGroup[] = []): Evaluation {
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, 'id'>) => {
    const id = `${f.kind}:${f.viewport}:${f.section}:${findings.length}`;
    // a fix that would change a locked decision is held back and said
    if (f.fix) {
      const hit = lockedChanges(spec, f.fix, locks);
      if (hit.length) {
        findings.push({ ...f, id, fix: undefined, blocked: `It would change ${hit.join(' and ')}, which you locked.` });
        return;
      }
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
      if (vp === 'desktop' && h1.size / a.bodySize < 2.3)
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

  const signals = genericSignals(spec, audits.desktop ?? audits.phone ?? null);
  const quality = Math.max(0, 100 - findings.reduce((t, f) => t + (f.kind === 'cliche' || f.kind === 'placeholder' ? 0 : PENALTY[f.severity]), 0));
  const distinctiveness = Math.max(0, 100 - signals.reduce((t, x) => t + x.weight, 0));
  const high = findings.filter((f) => f.severity === 'high').length;
  const summary = !findings.length
    ? 'Checked at desktop and phone widths: nothing to fix.'
    : `${findings.length} finding${findings.length > 1 ? 's' : ''}${high ? `, ${high} serious` : ''}; ${findings.filter((f) => f.fix).length} can be fixed without asking.`;
  return { quality, distinctiveness, findings, signals, summary };
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
