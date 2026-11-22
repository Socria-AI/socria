// lib/ux-v0/graphics/styles/blend.ts — several design languages, one coherent design.
//
// A selection names a primary style (the dominant language), optionally a secondary and a tertiary influence, how
// strongly they colour the design, dimensions borrowed wholesale (“Swiss typography with Art Nouveau ornament”) and
// three intensities the person controls (experimentation, ornament, density). effectiveDNA() makes one profile from
// it. Coherence before quantity: the composition always comes from one style (constructions are never averaged), the
// faces from one style unless typography was asked for by name, and an influence only adds what the dominant style
// can carry — a treatment the primary names as incompatible is left out and said, unless the person asked for that
// dimension explicitly, in which case their words win.

import { builtInStyles, styleById } from './registry';
import { DIMENSIONS, normalizeStyleDNA, type Dimension, type StyleDNA, type TextureKey, TEXTURE_KEYS } from './schema';

export interface StyleSelection {
  primary: string;
  secondary?: string;
  tertiary?: string;
  /** 0–100: how far the secondary colours the design (the tertiary half as far) */
  strength: number;
  /** dimensions taken wholesale from another style */
  dims?: Partial<Record<Dimension, string>>;
  /** the person's own intensities (0–100); absent: the style's own */
  experimentation?: number;
  ornament?: number;
  density?: number;
  /** a construction chosen by hand (one of the effective profile's) */
  construction?: string;
  /** style lock: regenerating or editing keeps this style */
  locked?: boolean;
  /** flat colour only: the style's gradients set aside (as asked: "remove the gradient treatment") */
  flat?: boolean;
  /** the custom profiles the selection names, carried with it so a document stays whole */
  customs?: StyleDNA[];
  /** what varies the convention by project (a project id): the same style in another project is kin, not a twin */
  seedKey?: string;
}

const clamp = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : undefined);

/** A selection from storage or a model, held to what exists: unknown styles dropped, numbers clamped. Null when the
 * primary style is unknown. */
export function normalizeSelection(raw: unknown, notes: string[] = []): StyleSelection | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const customs = (Array.isArray(r.customs) ? r.customs : [])
    .slice(0, 6)
    .map((c) => normalizeStyleDNA(c, notes))
    .filter((c): c is StyleDNA => !!c)
    .map((c) => ({ ...c, category: 'custom' as const }));
  const known = (v: unknown): string | undefined => (typeof v === 'string' && styleById(v, customs) ? v : undefined);
  const primary = known(r.primary);
  if (!primary) {
    if (r.primary) notes.push(`A style SocriaUX does not have (“${String(r.primary).slice(0, 32)}”) was not used.`);
    return null;
  }
  const dims: Partial<Record<Dimension, string>> = {};
  for (const [k, v] of Object.entries((r.dims && typeof r.dims === 'object' ? r.dims : {}) as Record<string, unknown>)) if ((DIMENSIONS as readonly string[]).includes(k) && known(v)) dims[k as Dimension] = v as string;
  const out: StyleSelection = { primary, strength: clamp(r.strength, 0, 100) ?? 0 };
  const secondary = known(r.secondary);
  const tertiary = known(r.tertiary);
  if (secondary && secondary !== primary) out.secondary = secondary;
  if (tertiary && tertiary !== primary && tertiary !== secondary) out.tertiary = tertiary;
  if (Object.keys(dims).length) out.dims = dims;
  for (const k of ['experimentation', 'ornament', 'density'] as const) {
    const v = clamp(r[k], 0, 100);
    if (v !== undefined) out[k] = v;
  }
  if (typeof r.construction === 'string' && r.construction.length <= 40) out.construction = r.construction;
  if (r.locked === true) out.locked = true;
  if (r.flat === true) out.flat = true;
  if (typeof r.seedKey === 'string' && r.seedKey) out.seedKey = r.seedKey.slice(0, 80);
  if (customs.length) out.customs = customs;
  return out;
}

export interface Effective {
  dna: StyleDNA;
  /** the person's intensities as used (0–100) */
  experimentation: number;
  ornament: number;
  density: number;
  says: string[];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const SECTION: Record<Dimension, keyof StyleDNA> = { typography: 'typography', geometry: 'geometry', composition: 'composition', colour: 'colour', texture: 'texture', imagery: 'imagery', ornament: 'ornament' };
/** The texture keys an incompatibility tag rules out. */
const RULES_OUT: Record<string, TextureKey[]> = {
  glow: ['glow'],
  gloss: ['gloss'],
  distress: ['distress', 'inkbleed'],
  metallic: ['metallic'],
  texture: ['grain', 'paper', 'noise', 'distress', 'inkbleed', 'halftone', 'misregistration', 'scanlines'],
  neon: ['glow'],
};

/** How experimental a style is by its own nature (0–100): its layering, overlap, rhythm and treatments. */
export function ownExperimentation(d: StyleDNA): number {
  const rhythm = d.composition.rhythm === 'chaotic' ? 30 : d.composition.rhythm === 'syncopated' ? 15 : 0;
  const treat = d.typography.treatments.filter((t) => !['plain', 'oversized', 'spaced'].includes(t)).length * 8;
  return Math.max(0, Math.min(100, Math.round(d.composition.layering * 0.35 + d.composition.overlap * 0.35 + rhythm + treat)));
}

/** One coherent profile from a selection (see the head of this file). */
export function effectiveDNA(sel: StyleSelection, customs: readonly StyleDNA[] = []): Effective {
  const pool = [...(sel.customs ?? []), ...customs];
  const P = styleById(sel.primary, pool) ?? builtInStyles()[0];
  const S = sel.secondary ? styleById(sel.secondary, pool) : null;
  const T = sel.tertiary ? styleById(sel.tertiary, pool) : null;
  const out = clone(P);
  const says: string[] = [];
  const asked = new Set<Dimension>();
  // dimensions asked for by name: taken whole
  for (const [d, id] of Object.entries(sel.dims ?? {}) as [Dimension, string][]) {
    const from = styleById(id, pool);
    if (!from || from.id === P.id) continue;
    (out as unknown as Record<string, unknown>)[SECTION[d]] = clone(from[SECTION[d]]);
    asked.add(d);
    says.push(`${d.charAt(0).toUpperCase()}${d.slice(1)} from ${from.name}.`);
  }
  const incompatible = new Set(P.constraints.incompatible);
  const influence = (X: StyleDNA, s: number) => {
    if (s <= 0) return;
    const t = s / 100;
    const took: string[] = [];
    if (!asked.has('texture')) {
      for (const k of TEXTURE_KEYS) {
        const blocked = Object.entries(RULES_OUT).some(([tag, keys]) => incompatible.has(tag) && keys.includes(k));
        const want = Math.round(X.texture[k] * t);
        if (want > out.texture[k]) {
          if (blocked) {
            if (want >= 20) says.push(`${X.name}’s ${k} was left out: ${P.name} does not carry it.`);
            continue;
          }
          out.texture[k] = want;
          if (want >= 15) took.push(k);
        }
      }
    }
    if (!asked.has('ornament') && s >= 35) {
      if (incompatible.has('ornament') && X.ornament.density > 30) says.push(`${X.name}’s ornament was kept light: ${P.name} works without it.`);
      const add = X.ornament.motifs.slice(0, 2).filter((m) => !out.ornament.motifs.includes(m));
      out.ornament.motifs = [...out.ornament.motifs, ...add].slice(0, 6);
      out.ornament.density = incompatible.has('ornament') ? Math.min(25, lerp(out.ornament.density, X.ornament.density, t * 0.5)) : lerp(out.ornament.density, X.ornament.density, t);
      if (s >= 60 && out.ornament.border === 'none' && X.ornament.border !== 'none' && !incompatible.has('ornament')) out.ornament.border = X.ornament.border;
      if (add.length) took.push('ornament');
    }
    if (!asked.has('colour') && s >= 50 && !['mono', 'duotone'].includes(out.colour.scheme)) {
      out.colour.accent2 = X.colour.accent;
      took.push('a second accent');
      if (s >= 75 && out.colour.gradient === 'none' && X.colour.gradient !== 'none' && !incompatible.has('gradient')) out.colour.gradient = X.colour.gradient;
    }
    if (!asked.has('geometry') && s >= 40) {
      const add = X.geometry.motifs.slice(0, 2).filter((m) => !out.geometry.motifs.includes(m));
      out.geometry.motifs = [...out.geometry.motifs, ...add].slice(0, 8);
      out.geometry.curvature = lerp(out.geometry.curvature, X.geometry.curvature, t * 0.5);
      out.geometry.angularity = lerp(out.geometry.angularity, X.geometry.angularity, t * 0.5);
      if (add.length) took.push('shapes');
    }
    if (!asked.has('typography') && s >= 70) {
      const tr = X.typography.treatments.find((x) => !out.typography.treatments.includes(x) && x !== 'plain');
      if (tr) ((out.typography.treatments = [tr, ...out.typography.treatments].slice(0, 6)), took.push(`a ${tr} treatment`));
    }
    if (!asked.has('imagery') && s >= 50) {
      const tr = X.imagery.treatments.find((x) => !out.imagery.treatments.includes(x));
      if (tr) ((out.imagery.treatments = [tr, ...out.imagery.treatments].slice(0, 4)), took.push('a picture treatment'));
    }
    if (!asked.has('composition')) {
      out.composition.density = lerp(out.composition.density, X.composition.density, t * 0.3);
      out.composition.negativeSpace = lerp(out.composition.negativeSpace, X.composition.negativeSpace, t * 0.3);
    }
    if (took.length) says.push(`${X.name} at ${s}%: ${took.join(', ')}.`);
  };
  if (S) influence(S, sel.strength);
  if (T) influence(T, Math.round(sel.strength / 2));
  // the person's intensities
  const experimentation = sel.experimentation ?? ownExperimentation(out);
  const ornament = sel.ornament ?? out.ornament.density;
  const density = sel.density ?? out.composition.density;
  if (sel.ornament !== undefined) {
    out.ornament.density = sel.ornament;
    out.ornament.flourish = Math.round(out.ornament.flourish * (0.4 + sel.ornament / 100));
    if (sel.ornament < 15) out.ornament.border = out.ornament.border === 'none' ? 'none' : out.composition.constructions[0] === 'ornate-border' ? out.ornament.border : 'rule';
  }
  if (sel.density !== undefined) {
    out.composition.density = sel.density;
    out.composition.negativeSpace = Math.max(5, Math.min(95, 100 - sel.density));
  }
  if (sel.flat && out.colour.gradient !== 'none') {
    out.colour.gradient = 'none';
    out.typography.treatments = out.typography.treatments.filter((t) => t !== 'gradient');
    says.push('Flat colour, as asked: no gradients.');
  }
  const names = [P, S, T].filter((x): x is StyleDNA => !!x);
  out.id = names.length > 1 || Object.keys(sel.dims ?? {}).length ? `blend-${P.id}` : P.id;
  out.name =
    names.length > 1
      ? `${P.name} × ${names
          .slice(1)
          .map((n) => n.name)
          .join(' × ')}`
      : P.name;
  return { dna: out, experimentation, ornament, density, says };
}
