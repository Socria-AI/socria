// lib/ux-v0/graphics/styles/custom.ts — the person's own styles: made, kept, organised, carried elsewhere.
//
// A custom style is a profile in the library's own schema (schema.ts StyleDNA, category 'custom'), so everything that
// reads a style reads it the same way: the composer builds in it, blends take it as an influence or a dimension, the
// Explorer previews it. It can be made from words ("warm risograph with Swiss type"), from a selection (a blend, its
// sliders), from a design (the style it speaks, with its own colours and faces), from manual controls (a few plain
// choices, no schema), from brand guidelines (colours and faces kept exactly), or from a reference (reference.ts).
// The library is held to its shape on the way in (normalizeLibrary): profiles validated, ids unique, bounded, folders
// named. Exported and imported as JSON, which is data, never code. Nothing here calls a model.

import { GRAPHIC_FONTS, graphicFont } from '../../fonts';
import type { GraphicDoc } from '../doc';
import { effectiveDNA, type StyleSelection } from './blend';
import { interpretStyle, selectionOf } from './interpret';
import { builtInStyles, styleById } from './registry';
import { normalizeStyleDNA, slugOf, STYLE_SCHEMA, type StyleDNA } from './schema';

export const MAX_CUSTOM_STYLES = 40;
export const LIBRARY_VERSION = 1;

export interface CustomLibrary {
  version: number;
  styles: StyleDNA[];
  /** folders by style id (organising: a style is in at most one) */
  folders: Record<string, string>;
}

export const emptyLibrary = (): CustomLibrary => ({
  version: LIBRARY_VERSION,
  styles: [],
  folders: {},
});

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** An id no built-in or custom style has: the name's slug, numbered when taken. */
export function uniqueId(name: string, taken: readonly StyleDNA[]): string {
  const ids = new Set([...builtInStyles().map((s) => s.id), ...taken.map((s) => s.id)]);
  const base = `my-${slugOf(name) || 'style'}`.slice(0, 44);
  let id = base;
  for (let i = 2; ids.has(id); i++) id = `${base}-${i}`;
  return id;
}

/** A profile made a custom one: named, given its own id, held to the schema. */
function asCustom(dna: StyleDNA, name: string, taken: readonly StyleDNA[], description?: string): StyleDNA {
  const raw = {
    ...clone(dna),
    id: uniqueId(name, taken),
    name: name.slice(0, 60),
    category: 'custom',
    words: [name.toLowerCase()],
    ...(description ? { description: description.slice(0, 400) } : {}),
  };
  return (
    normalizeStyleDNA(raw) ?? {
      ...clone(dna),
      id: uniqueId(name, taken),
      name,
      category: 'custom',
    }
  );
}

/** From words: the style they describe, as one profile ("warm risograph with Swiss typography"). Null when the words
 * name or suggest no style. */
export function customFromWords(words: string, name: string, taken: readonly StyleDNA[] = []): StyleDNA | null {
  const r = interpretStyle(words, { customs: taken });
  const sel = selectionOf(r, taken);
  if (!sel) return null;
  const eff = effectiveDNA(sel, taken);
  return asCustom(eff.dna, name, taken, `Made from the words “${words.slice(0, 160)}”: ${eff.dna.description}`);
}

/** From a selection: the blend as it is set (its influences, borrowed dimensions and sliders), kept as one profile. */
export function customFromSelection(sel: StyleSelection, name: string, taken: readonly StyleDNA[] = []): StyleDNA {
  const eff = effectiveDNA(sel, [...(sel.customs ?? []), ...taken]);
  const dna = clone(eff.dna);
  dna.composition.density = eff.density;
  dna.ornament.density = eff.ornament;
  return asCustom(dna, name, taken, `${eff.dna.name}${eff.says.length ? `: ${eff.says.slice(0, 2).join(' ')}` : ''}`);
}

/** From a design: the style it speaks, with the design's own colours and faces (what the designer settled on). */
export function customFromDoc(doc: GraphicDoc, name: string, taken: readonly StyleDNA[] = []): StyleDNA {
  const base = doc.style ? effectiveDNA(doc.style, [...(doc.style.customs ?? []), ...taken]).dna : (builtInStyles().find((s) => s.id === 'swiss-international') ?? builtInStyles()[0]);
  const dna = clone(base);
  const c = doc.tokens.colors;
  dna.colour = {
    ...dna.colour,
    ground: c.background,
    ink: c.text,
    accent: c.accent,
    accent2: doc.tokens.accent2 ?? dna.colour.accent2,
    variation: 0,
    brand: 'adopt',
  };
  const display = graphicFont(doc.tokens.fonts.display);
  const body = graphicFont(doc.tokens.fonts.body);
  if (display) dna.typography.display.faces = [display.name, ...dna.typography.display.faces.filter((f) => f !== display.name)].slice(0, 6);
  if (body && !body.displayOnly) dna.typography.body.faces = [body.name, ...dna.typography.body.faces.filter((f) => f !== body.name)].slice(0, 6);
  return asCustom(dna, name, taken, `Kept from the design “${doc.name}”, in ${base.name}, with its own colours and faces.`);
}

export interface Controls {
  /** the style it starts from */
  base: string;
  ground?: string;
  ink?: string;
  accent?: string;
  accent2?: string;
  display?: string;
  body?: string;
  case?: 'upper' | 'lower' | 'sentence';
  /** 0–100 */
  density?: number;
  ornament?: number;
  texture?: number;
  /** a construction of the base style's, by hand */
  construction?: string;
}

/** From manual controls: a few plain choices on a starting style, no schema to know. */
export function customFromControls(c: Controls, name: string, taken: readonly StyleDNA[] = []): StyleDNA | null {
  const from = styleById(c.base, taken);
  if (!from) return null;
  const dna = clone(from);
  const hex = (v: string | undefined) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined);
  dna.colour = {
    ...dna.colour,
    ...(hex(c.ground) ? { ground: hex(c.ground)! } : {}),
    ...(hex(c.ink) ? { ink: hex(c.ink)! } : {}),
    ...(hex(c.accent) ? { accent: hex(c.accent)! } : {}),
    ...(hex(c.accent2) ? { accent2: hex(c.accent2)! } : {}),
  };
  if (hex(c.ground) || hex(c.accent)) dna.colour.variation = Math.min(dna.colour.variation, 10);
  const d = c.display ? graphicFont(c.display) : null;
  const b = c.body ? graphicFont(c.body) : null;
  if (d) dna.typography.display.faces = [d.name, ...dna.typography.display.faces.filter((f) => f !== d.name)].slice(0, 6);
  if (b && !b.displayOnly) dna.typography.body.faces = [b.name, ...dna.typography.body.faces.filter((f) => f !== b.name)].slice(0, 6);
  if (c.case) dna.typography.display.case = c.case;
  if (typeof c.density === 'number') ((dna.composition.density = c.density), (dna.composition.negativeSpace = Math.max(5, Math.min(95, 100 - c.density))));
  if (typeof c.ornament === 'number') dna.ornament.density = c.ornament;
  if (typeof c.texture === 'number') {
    const k = c.texture / Math.max(1, Math.max(...Object.values(dna.texture)));
    for (const key of Object.keys(dna.texture) as (keyof typeof dna.texture)[]) dna.texture[key] = Math.round(Math.min(100, dna.texture[key] * k));
    if (c.texture > 0 && Object.values(dna.texture).every((v) => v === 0)) dna.texture.grain = c.texture;
  }
  if (c.construction && dna.composition.constructions.includes(c.construction as never)) dna.composition.constructions = [c.construction as never, ...dna.composition.constructions.filter((x) => x !== c.construction)];
  return asCustom(dna, name, taken, `${from.name}, adjusted by hand.`);
}

/** From brand guidelines: the brand's colours adopted exactly and its faces kept, on the style closest to its words. */
export function customFromBrand(
  brand: {
    name: string;
    colours: readonly string[];
    display?: string;
    body?: string;
    words?: string;
  },
  taken: readonly StyleDNA[] = [],
): StyleDNA | null {
  const colours = brand.colours.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).map((c) => c.toLowerCase());
  if (!colours.length && !brand.display) return null;
  const r = brand.words ? interpretStyle(brand.words, { customs: taken }) : null;
  const base = (r?.primary && styleById(r.primary, taken)) || builtInStyles().find((s) => s.id === 'corporate-modernism') || builtInStyles()[0];
  const made = customFromControls(
    {
      base: base.id,
      ground: colours[0],
      ink: colours[1],
      accent: colours[2] ?? colours[0],
      accent2: colours[3],
      display: brand.display,
      body: brand.body,
    },
    brand.name,
    taken,
  );
  if (!made) return null;
  made.colour.brand = 'adopt';
  made.colour.variation = 0;
  made.description = `${brand.name}’s guidelines (its colours adopted exactly${brand.display ? `, ${brand.display} for headlines` : ''}), built as ${base.name}.`;
  return normalizeStyleDNA(made) ?? made;
}

/** A copy to change without touching the original. */
export function duplicateStyle(dna: StyleDNA, taken: readonly StyleDNA[]): StyleDNA {
  return asCustom(dna, `${dna.name.replace(/^Copy of /, '')} copy`.slice(0, 60), taken, dna.description);
}

/** Renamed: its id stays (designs that use it keep finding it). */
export function renameStyle(dna: StyleDNA, name: string): StyleDNA {
  const n = name
    .replace(/[\u0000-\u001f<>]/g, ' ')
    .trim()
    .slice(0, 60);
  return n ? { ...dna, name: n, words: [n.toLowerCase()] } : dna;
}

/** A library from storage or a file, held to its shape (see the head of this file). */
export function normalizeLibrary(raw: unknown, notes: string[] = []): CustomLibrary {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(r.styles) ? r.styles : Array.isArray(raw) ? (raw as unknown[]) : [];
  const out: StyleDNA[] = [];
  const builtIn = new Set(builtInStyles().map((s) => s.id));
  for (const x of list.slice(0, MAX_CUSTOM_STYLES * 2)) {
    const d = normalizeStyleDNA(x, notes);
    if (!d) continue;
    let dna: StyleDNA = { ...d, category: 'custom' };
    // a custom style never shadows a built-in one, nor another custom one
    if (builtIn.has(dna.id) || out.some((o) => o.id === dna.id)) dna = { ...dna, id: uniqueId(dna.name, out) };
    out.push(dna);
    if (out.length >= MAX_CUSTOM_STYLES) {
      if (list.length > MAX_CUSTOM_STYLES) notes.push(`Only the first ${MAX_CUSTOM_STYLES} styles were kept.`);
      break;
    }
  }
  const folders: Record<string, string> = {};
  const f = r.folders && typeof r.folders === 'object' ? (r.folders as Record<string, unknown>) : {};
  for (const [id, name] of Object.entries(f))
    if (out.some((s) => s.id === id) && typeof name === 'string' && name.trim())
      folders[id] = name
        .replace(/[\u0000-\u001f<>]/g, ' ')
        .trim()
        .slice(0, 40);
  return { version: LIBRARY_VERSION, styles: out, folders };
}

/** The library as a file (JSON: data only). */
export const exportLibrary = (lib: CustomLibrary): string =>
  JSON.stringify(
    {
      kind: 'socriaux-styles',
      schema: STYLE_SCHEMA,
      version: LIBRARY_VERSION,
      styles: lib.styles,
      folders: lib.folders,
    },
    null,
    2,
  );

/** Styles read from a file and added to a library: validated, never replacing what is there (a clash is renamed). */
export function importLibrary(lib: CustomLibrary, text: string): { library: CustomLibrary; added: number; notes: string[] } {
  const notes: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(0, 2_000_000));
  } catch {
    return {
      library: lib,
      added: 0,
      notes: ['That file is not a styles file SocriaUX can read.'],
    };
  }
  const incoming = normalizeLibrary(parsed, notes);
  const styles = [...lib.styles];
  const folders = { ...lib.folders };
  let added = 0;
  for (const s of incoming.styles) {
    if (styles.length >= MAX_CUSTOM_STYLES) {
      notes.push(`The library holds at most ${MAX_CUSTOM_STYLES} styles; the rest were not added.`);
      break;
    }
    const clash = styles.some((x) => x.id === s.id);
    const dna = clash ? { ...s, id: uniqueId(s.name, styles) } : s;
    styles.push(dna);
    if (incoming.folders[s.id]) folders[dna.id] = incoming.folders[s.id];
    added++;
  }
  return {
    library: { version: LIBRARY_VERSION, styles, folders },
    added,
    notes,
  };
}

/** Faces a control may offer (the graphics faces, by name). */
export const CONTROL_FACES = (): string[] => GRAPHIC_FONTS.map((f) => f.name);
