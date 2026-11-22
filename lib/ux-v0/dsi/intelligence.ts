// lib/ux-v0/dsi/intelligence.ts — what a brand is like, read from its system, and the owner's say over every reading.
//
// Three kinds of statement live side by side, never confused:
//
//   confirmed  stated by the source (guidelines, a design system file) or by the owner
//   approved   a reading the owner accepted (it becomes a preference)
//   inferred   SocriaUX's reading of the tokens and assets: colour relationships, type pairing and scale, geometry,
//              spacing rhythm, and a personality the visual traits suggest — each with the values it rests on
//
// An inference is never enforced. It becomes a preference only when the owner approves it, and a constraint only when
// the owner then makes it one: nothing is promoted silently. Re-reading a system replaces stale inferences but keeps
// every decision the owner made (an approved or rejected reading stays as they left it).

import { contrastRatio } from '../../ux/audit';
import { knownFont } from '../fonts';
import { hslOf } from '../color';
import { checkOf } from './guidelines';
import { dimensionKind } from './classify';
import { roleFamily, roleHex, resolveToken, px } from './tokens';
import { uid, type IntelItem, type IntelKind, type RuleCheck, type SourceRef, type SystemContent } from './schema';

const SRC: SourceRef = { kind: 'manual', ref: 'SocriaUX analysis' };

const inferred = (key: string, kind: IntelKind, statement: string, evidence: string, confidence: number, check?: RuleCheck): IntelItem => ({ id: `bi-${key}`, kind, statement, status: 'inferred', basis: 'inferred', evidence: [{ source: SRC, quote: evidence.slice(0, 300) }], confidence: Math.round(confidence * 100) / 100, enforce: 'none', ...(check ? { check } : {}) });

const grade = (r: number) => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA for large text only' : 'below AA');

function harmony(a: string, b: string): string | null {
  const [h1, s1] = hslOf(a);
  const [h2, s2] = hslOf(b);
  if (s1 < 0.12 || s2 < 0.12) return null;
  const d = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
  return d < 30 ? 'analogous' : d > 150 ? 'complementary' : d > 100 && d < 140 ? 'triadic' : 'contrasting';
}

const kindOf = (family: string | null) => {
  if (!family) return null;
  const k = knownFont(family)?.kind;
  if (k) return k;
  if (/mono|code|courier/i.test(family)) return 'mono';
  if (/serif|garamond|caslon|baskerville|bodoni|didot|times|georgia|tiempos|canela|fraunces|playfair|lyon|publico|domaine|recoleta|cooper/i.test(family) && !/sans/i.test(family)) return 'serif';
  return 'sans';
};

/** SocriaUX's readings of a system (see the head of this file): every one inferred, with what it rests on. */
export function readBrand(c: SystemContent): IntelItem[] {
  const out: IntelItem[] = [];
  const bg = roleHex(c, 'background');
  const text = roleHex(c, 'text');
  const accent = roleHex(c, 'accent');
  const accentText = roleHex(c, 'accentText');
  const accent2 = roleHex(c, 'accent2');
  if (bg && text) {
    const r = contrastRatio(text, bg);
    out.push(inferred('contrast-text', 'colour', `Text on the background reads at ${r.toFixed(1)}:1 (${grade(r)})`, `${text} on ${bg}`, 0.95, r >= 4.5 ? { kind: 'min-contrast', ratio: 4.5 } : undefined));
  }
  if (bg && accent) {
    const r = contrastRatio(accent, bg);
    out.push(inferred('contrast-accent', 'colour', `The accent stands out from the background at ${r.toFixed(1)}:1${r < 3 ? ': too faint for text or thin lines' : ''}`, `${accent} on ${bg}`, 0.9));
  }
  if (accent && accentText) out.push(inferred('contrast-on-accent', 'colour', `Text on the accent reads at ${contrastRatio(accentText, accent).toFixed(1)}:1 (${grade(contrastRatio(accentText, accent))})`, `${accentText} on ${accent}`, 0.9));
  if (accent && accent2) {
    const h = harmony(accent, accent2);
    if (h) out.push(inferred('harmony', 'colour', `The two accents are ${h}`, `${accent} and ${accent2}`, 0.6));
  }
  const brand = Object.values(c.tokens).filter((t) => t.type === 'color' && /brand|primary|accent|secondary/i.test(t.path));
  const hexes = [accent, accent2, ...brand.map((t) => roleHexOf(c, t.path))].filter((x): x is string => !!x);
  if (hexes.length) {
    const hs = hexes.map((h) => hslOf(h));
    const sat = hs.reduce((s, x) => s + x[1], 0) / hs.length;
    const warm = hs.filter((x) => x[1] > 0.15 && (x[0] < 70 || x[0] > 320)).length;
    const cool = hs.filter((x) => x[1] > 0.15 && x[0] > 160 && x[0] < 280).length;
    out.push(inferred('saturation', 'colour', sat > 0.55 ? 'The brand colours are vivid' : sat < 0.25 ? 'The brand colours are muted' : 'The brand colours are moderately saturated', hexes.slice(0, 5).join(' '), 0.6));
    if (warm !== cool) out.push(inferred('temperature', 'colour', warm > cool ? 'The palette leans warm' : 'The palette leans cool', hexes.slice(0, 5).join(' '), 0.55));
  }
  const display = roleFamily(c, 'display');
  const body = roleFamily(c, 'body');
  const dk = kindOf(display);
  const bk = kindOf(body);
  if (display && body) out.push(inferred('pairing', 'typography', display.toLowerCase() === body.toLowerCase() ? `One family, ${display}, for headlines and text` : `A ${dk} display face (${display}) with a ${bk} text face (${body})`, `${display} / ${body}`, 0.85));
  const sizes = Object.values(c.tokens)
    .filter((t) => t.type === 'dimension' && dimensionKind(t.path) === 'fontSize')
    .map((t) => {
      const r = resolveToken(c, t.path);
      return r.ok ? px(r.value) : null;
    })
    .filter((x): x is number => !!x && x >= 12)
    .sort((a, b) => a - b);
  const uniq = [...new Set(sizes)];
  if (uniq.length >= 3) {
    const steps = uniq.slice(1).map((x, i) => x / uniq[i]).filter((x) => x > 1.04 && x < 2).sort((a, b) => a - b);
    const mid = steps[Math.floor(steps.length / 2)];
    if (mid) out.push(inferred('scale', 'typography', `The type scale steps by about ${mid.toFixed(2)}${mid > 1.45 ? ': strong contrast between levels' : mid < 1.18 ? ': a quiet, close scale' : ''}`, uniq.map((x) => `${x}px`).join(' · '), 0.7));
  }
  const radii = Object.values(c.tokens)
    .filter((t) => t.type === 'dimension' && dimensionKind(t.path) === 'radius')
    .map((t) => {
      const r = resolveToken(c, t.path);
      return r.ok ? px(r.value) : null;
    })
    .filter((x): x is number => x !== null && x < 999)
    .sort((a, b) => a - b);
  if (radii.length) {
    const m = radii[Math.floor((radii.length - 1) / 2)];
    out.push(inferred('corners', 'geometry', m < 2 ? 'Corners are square' : m <= 10 ? 'Corners are softly rounded' : 'Corners are generously rounded', radii.map((x) => `${x}px`).join(' · '), 0.7));
  }
  const space = Object.values(c.tokens)
    .filter((t) => t.type === 'dimension' && dimensionKind(t.path) === 'spacing')
    .map((t) => {
      const r = resolveToken(c, t.path);
      return r.ok ? px(r.value) : null;
    })
    .filter((x): x is number => !!x && x > 0);
  if (space.length >= 3) {
    const base = [8, 4, 6, 5].find((b) => space.every((x) => Math.abs(x / b - Math.round(x / b)) < 0.01));
    if (base) out.push(inferred('rhythm', 'composition', `Spacing follows a ${base}px rhythm`, space.slice(0, 8).map((x) => `${x}px`).join(' · '), 0.75));
  }
  const logo = c.assets.find((a) => a.kind === 'logo' && a.svg && (a.approved || a.role === 'primary'));
  if (logo?.svg) {
    const d = (logo.svg.match(/\sd="([^"]*)"/g) ?? []).join(' ');
    const curves = (d.match(/[CcSsQqTtAa]/g) ?? []).length;
    const lines = (d.match(/[LlHhVv]/g) ?? []).length + (logo.svg.match(/<(rect|polygon|polyline|line)\b/g) ?? []).length * 3;
    if (curves + lines > 4) out.push(inferred('logo-geometry', 'geometry', curves > lines * 1.5 ? 'The logo is drawn in curves' : lines > curves * 1.5 ? 'The logo is built from straight lines and angles' : 'The logo mixes curves and straight lines', `${logo.name}: ${curves} curve and ${lines} line segments`, 0.55));
  }
  // a personality the visual traits suggest — a reading, said as one
  const traits: string[] = [];
  if (bg && text && contrastRatio(text, bg) >= 12) traits.push('high contrast');
  if (hexes.length && hexes.map((h) => hslOf(h)[1]).reduce((a, b) => a + b, 0) / hexes.length > 0.55) traits.push('vivid colour');
  if (dk === 'serif') traits.push('serif headlines');
  if (radii.length && radii[Math.floor((radii.length - 1) / 2)] > 10) traits.push('round corners');
  if (radii.length && radii[Math.floor((radii.length - 1) / 2)] < 2) traits.push('square corners');
  const words = new Set<string>();
  if (traits.includes('vivid colour') && traits.includes('high contrast')) ['energetic', 'direct'].forEach((w) => words.add(w));
  if (traits.includes('serif headlines')) ['considered', 'literate'].forEach((w) => words.add(w));
  if (traits.includes('round corners')) words.add('approachable');
  if (traits.includes('square corners')) words.add('precise');
  if (!traits.includes('vivid colour') && hexes.length) words.add('calm');
  if (words.size) out.push(inferred('personality', 'personality', `Its visual traits suggest a brand that feels ${[...words].slice(0, 4).join(', ')}`, traits.join(', ') || 'muted colour', 0.4));
  return out;
}

const roleHexOf = (c: SystemContent, path: string) => {
  const r = resolveToken(c, path);
  if (!r.ok || typeof r.value !== 'string') return null;
  return /^#[0-9a-f]{6}/i.test(r.value) ? r.value.slice(0, 7).toLowerCase() : null;
};

/** The system with its readings refreshed: stale inferences replaced, every owner decision kept as it was. */
export function analyzeBrand(c: SystemContent): SystemContent {
  const fresh = readBrand(c);
  const kept = c.intelligence.filter((i) => !i.id.startsWith('bi-') || i.status !== 'inferred');
  const keptIds = new Set(kept.map((i) => i.id));
  return { ...c, intelligence: [...kept, ...fresh.filter((i) => !keptIds.has(i.id))] };
}

export interface IntelEdit {
  content: SystemContent;
  error?: string;
}

const update = (c: SystemContent, id: string, f: (i: IntelItem) => IntelItem | string): IntelEdit => {
  const i = c.intelligence.find((x) => x.id === id);
  if (!i) return { content: c, error: 'That statement is not in the system any more.' };
  const next = f(i);
  if (typeof next === 'string') return { content: c, error: next };
  return { content: { ...c, intelligence: c.intelligence.map((x) => (x.id === id ? next : x)) } };
};

/** An inference accepted by the owner: an approved interpretation, held as a preference. */
export const approveIntel = (c: SystemContent, id: string) => update(c, id, (i) => (i.status === 'inferred' || i.status === 'rejected' ? { ...i, status: 'approved', enforce: 'soft' } : i));

/** A reading set aside: never enforced, never suggested again by re-reading. */
export const rejectIntel = (c: SystemContent, id: string) => update(c, id, (i) => ({ ...i, status: 'rejected', enforce: 'none' }));

/** How strictly a statement holds. An inference must be approved first: it is never made a constraint directly. */
export const enforceIntel = (c: SystemContent, id: string, level: IntelItem['enforce']) =>
  update(c, id, (i) => (i.status === 'inferred' || i.status === 'rejected' ? 'Approve this reading first: an inference is never made a rule directly.' : level === 'hard' && !i.check ? { ...i, enforce: 'hard' } : { ...i, enforce: level }));

/** A statement reworded by the owner: from then on it is theirs (approved if it was a reading). */
export const editIntel = (c: SystemContent, id: string, statement: string) =>
  update(c, id, (i) => {
    const s = statement.replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!s) return 'A statement cannot be empty.';
    const check = checkOf(s);
    return { ...i, statement: s, status: i.status === 'inferred' ? 'approved' : i.status, ...(check ? { check } : {}), enforce: i.status === 'inferred' ? 'soft' : i.enforce };
  });

/** A rule the owner states: confirmed, with a check when the words give one exactly. */
export function addRule(c: SystemContent, statement: string, kind: IntelKind = 'restriction', enforce: IntelItem['enforce'] = 'soft'): IntelEdit {
  const s = statement.replace(/\s+/g, ' ').trim().slice(0, 400);
  if (s.length < 4) return { content: c, error: 'Say the rule in a few words.' };
  const check = checkOf(s);
  const item: IntelItem = { id: uid('ow'), kind, statement: s, status: 'confirmed', basis: 'explicit', evidence: [{ source: { kind: 'manual', ref: 'owner' }, quote: s }], confidence: 1, enforce, ...(check ? { check } : {}) };
  return { content: { ...c, intelligence: [...c.intelligence, item] } };
}

/** The statements that bind designs: hard constraints and soft preferences (never an unapproved inference). */
export function bindingRules(c: SystemContent): { hard: IntelItem[]; soft: IntelItem[] } {
  const live = c.intelligence.filter((i) => (i.status === 'confirmed' || i.status === 'approved') && i.enforce !== 'none');
  return { hard: live.filter((i) => i.enforce === 'hard'), soft: live.filter((i) => i.enforce === 'soft') };
}

export interface VisualLanguage {
  corners: 'square' | 'soft' | 'round' | null;
  case: 'upper' | 'sentence' | 'lower' | null;
  density: 'compact' | 'comfortable' | 'spacious' | null;
  contrast: number | null;
  pairing: string | null;
  motifs: string[];
  imagery: string[];
  personality: string[];
  composition: string[];
}

/** The visual language the system holds, from its tokens and its confirmed or approved statements only. */
export function visualLanguageOf(c: SystemContent): VisualLanguage {
  const live = c.intelligence.filter((i) => i.status === 'confirmed' || i.status === 'approved');
  const caseRule = live.map((i) => i.check).find((k): k is Extract<RuleCheck, { kind: 'headline-case' }> => k?.kind === 'headline-case');
  const upper = live.some((i) => /capitals|uppercase|all caps/i.test(i.statement) && i.kind === 'typography');
  const radii = Object.values(c.tokens)
    .filter((t) => t.type === 'dimension' && dimensionKind(t.path) === 'radius')
    .map((t) => {
      const r = resolveToken(c, t.path);
      return r.ok ? px(r.value) : null;
    })
    .filter((x): x is number => x !== null && x < 999)
    .sort((a, b) => a - b);
  const m = radii.length ? radii[Math.floor((radii.length - 1) / 2)] : null;
  const space = Object.values(c.tokens)
    .filter((t) => t.type === 'dimension' && dimensionKind(t.path) === 'spacing')
    .map((t) => {
      const r = resolveToken(c, t.path);
      return r.ok ? px(r.value) : null;
    })
    .filter((x): x is number => !!x)
    .sort((a, b) => a - b);
  const base = space.length >= 3 ? space[Math.floor(space.length / 2)] : null;
  const bg = roleHex(c, 'background');
  const text = roleHex(c, 'text');
  const pick = (k: IntelKind) => live.filter((i) => i.kind === k).map((i) => i.statement.replace(/^(Motif|Imagery|Personality):\s*/i, ''));
  return {
    corners: m === null ? null : m < 2 ? 'square' : m <= 10 ? 'soft' : 'round',
    case: caseRule?.case ?? (upper ? 'upper' : null),
    density: base === null ? null : base <= 12 ? 'compact' : base >= 28 ? 'spacious' : 'comfortable',
    contrast: bg && text ? Math.round(contrastRatio(text, bg) * 10) / 10 : null,
    pairing: [roleFamily(c, 'display'), roleFamily(c, 'body')].filter(Boolean).join(' / ') || null,
    motifs: pick('motif'),
    imagery: pick('imagery'),
    personality: pick('personality'),
    composition: pick('composition'),
  };
}

export const intelId = () => uid('in');
