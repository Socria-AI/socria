// lib/model/solid-words.ts
//
// WHEN THEY ASKED FOR A BODY AND NOTHING WAS PROPOSED THAT BUILDS, READ THE
// BODY FROM THEIR OWN WORDS.
//
// "Model a 2 × 2 × 2 metre cube" was answered "A 3D model of a cube is being
// created…" over a refusal. The ask was read right — construct, a model — and
// the proposal wrote nothing down. A second pass is the first remedy (the map
// route asks once more); this is the last, and it asks nobody. The person
// stated a shape and its sizes, and Live 3D already has a reader for exactly
// that grammar (lib/objects/scene-intent.ts readScene) — so its reading is
// written out as a solid proposal and handed to the engine like any other.
//
// NOT A LIST OF TRIGGERS. Nothing here knows a cube from a cone: the reader's
// grammar decides what was said, the shapes are the engine's catalogue, and
// what to do with each dimension is the same for all of them. A shape the
// reader cannot read is nothing, and nothing here guesses.
//
// ONLY WHAT WAS SAID. A dimension the reader filled in with a default size is
// left out, so the engine builds the solid as the statement it is and names
// the dimension it waits on — "a cone with a height and no radius" — rather
// than drawing a radius nobody gave. Each stated dimension becomes a control
// at the stated value, in the unit they said it in, so the body moves when a
// slider does; nothing else is added.
//
// AND IT ONLY RUNS WHERE IT IS ASKED TO: the route calls it for a turn whose
// ask was a construction that nothing built. "Explain the volume of a cone"
// names a cone too, and is never read here.
//
// PURE.

import { readScene } from '@/lib/objects/scene-intent';
import { readPairs, type SceneShape } from '@/lib/objects/scene';
import { METRES_PER, SOLID_DIMS, lengthUnit } from './solid';
import type { SolidShape } from './schema';

/** Live 3D's shapes that are solids here, by the same name. */
const AS_SOLID: Partial<Record<SceneShape, SolidShape>> = {
  box: 'box', cylinder: 'cylinder', cone: 'cone', sphere: 'sphere', torus: 'torus', capsule: 'capsule', prism: 'prism', ring: 'ring',
};

const EMPTY = { nodes: [], next: 1, unit: 'm' as const };

/** The unit of length they spoke in: the first one attached to a number. */
export function spokenUnit(text: string): string | null {
  const m = text.match(/\d(?:[\d.,]*)\s*(millimet(?:er|re)s?|centimet(?:er|re)s?|kilomet(?:er|re)s?|met(?:er|re)s?|inch(?:es)?|feet|foot|yards?|mm|cm|km|m|in|ft|yd)\b/i);
  return m ? lengthUnit(m[1]) : null;
}

/** A number as a person would write it: a few significant figures, no float noise. */
const tidy = (v: number) => Number(v.toPrecision(6));

export interface SolidReading {
  /** a proposal, for buildProposal — never a built model */
  proposal: Record<string, unknown>;
  /** what was read, for the reply and the log */
  says: string;
}

/**
 * The solids in a sentence, as a proposal — or null when the sentence names no
 * solid the reader can read.
 */
export function solidFromWords(said: string | null | undefined): SolidReading | null {
  if (!said || typeof said !== 'string') return null;
  const reading = readScene(said.slice(0, 600), EMPTY);
  const adds = reading.ops.filter((op) => op.op === 'add' && AS_SOLID[op.args.shape as SceneShape]);
  if (!adds.length) return null;

  const unit = spokenUnit(said);
  const perUnit = METRES_PER[unit ?? 'm'] ?? 1;
  const materials = new Map<string, string>();
  for (const op of reading.ops) if (op.op === 'matter' && typeof op.args.id === 'string' && typeof op.args.name === 'string') materials.set(op.args.id, op.args.name);
  const many = adds.length > 1;
  const params: Record<string, unknown>[] = [];
  const objects: Record<string, unknown>[] = [];
  const seen = new Map<SolidShape, number>();

  adds.forEach((op, i) => {
    const shape = AS_SOLID[op.args.shape as SceneShape]!;
    const k = (seen.get(shape) ?? 0) + 1;
    seen.set(shape, k);
    // Live 3D numbers its parts the same way (box1, cone1, …), which is how a
    // material read for "cylinder1" finds its part here.
    const liveId = `${op.args.shape}${k}`;
    const stated = readPairs(typeof op.args.dims === 'string' ? op.args.dims : '');
    const value = (key: string) => {
      const v = Number(stated[key]);
      return Number.isFinite(v) ? (SOLID_DIMS[shape].find((d) => d.key === key)?.count ? v : tidy(v / perUnit)) : null;
    };
    const cube = shape === 'box' && ['w', 'd', 'h'].every((x) => value(x) !== null) && value('w') === value('d') && value('d') === value('h');
    const id = `${cube ? 'cube' : shape}${many ? `_${i + 1}` : ''}`;
    const word = cube ? 'Cube' : `${shape[0].toUpperCase()}${shape.slice(1)}`;
    const control = (key: string) => (many ? `${id}_${key}` : key);
    const defs: Record<string, string> = {};
    const dims = cube ? [{ key: 's', label: 'side' }] : SOLID_DIMS[shape];
    for (const d of dims) {
      const v = cube ? value('w') : value(d.key);
      if (v === null) continue;
      const count = 'count' in d && d.count;
      params.push({
        id: control(d.key),
        label: many ? `${word} ${i + 1} ${d.label}` : d.label,
        value: v,
        min: count ? 3 : tidy(v / 10),
        max: count ? Math.max(12, v * 2) : tidy(v * 3),
        ...(count ? { step: 1 } : unit ? { units: unit } : {}),
      });
      defs[d.key] = control(d.key);
    }
    const material = materials.get(liveId);
    objects.push({
      id,
      kind: 'solid',
      label: many ? `${word} ${i + 1}` : word,
      solid: { shape, ...(material ? { material } : {}) },
      defs,
      ...(unit ? { units: unit } : {}),
      provenance: { origin: 'inference', detail: 'read from your words by the shape reader, because no model was proposed that builds' },
    });
  });

  const names = objects.map((o) => String(o.label).toLowerCase());
  return {
    proposal: {
      id: objects.length === 1 ? String(objects[0].id) : 'solids',
      title: objects.length === 1 ? `A ${names[0]}` : `${objects.length} solids`,
      params,
      objects,
      assumptions: ['Read from your words by the shape reader: the shapes and the sizes you gave, each size a control.'],
    },
    says: `read from your words: ${reading.clauses.map((c) => c.understood).filter(Boolean).join('; ') || names.join(', ')}`,
  };
}
