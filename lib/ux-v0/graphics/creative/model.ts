// lib/ux-v0/graphics/creative/model.ts — what the model is told when it reads a creative change.
//
// The model does not draw. It reads the person's words against the design as it is and writes a creative plan
// (plan.ts): what kind of change it is, what is kept, each decision to change — in the engine's own vocabulary (its
// themes, qualities, forms, palette moves, type characters and composition moves), so every decision it makes is one
// the engine can carry out and check. What it writes is held to the plan's shape twice: by the strict schema here
// (the provider cannot return a field or a value outside it) and by normalizePlan (a colour that is not a colour, a
// font off the list, words the person did not write are dropped).
//
// The design goes to it as a reading, not as the document: the artboard, each object's role, kind, words (cut
// short), face and colour and where it sits, the palette and type, each creative decision in words with where it came
// from, what is locked, and the concepts kept. No pictures, no paths, nothing it does not need.

import { FONTS } from '../../fonts';
import { ROLES, walk, type GraphicDoc } from '../doc';
import type { GraphicDirection } from '../compose';
import { FORM_KINDS } from './forms';
import { PALETTE_SHIFTS, QUALITIES, THEMES, TYPE_CHARACTERS } from './lexicon';
import { boardOf, DECISION_KEYS, decisionViews } from './decisions';
import { COMPOSITION_ACTIONS, CONCEPT_ACTIONS, INTENTS, KEEPABLE, type PlanQuestion } from './plan';

export interface DesignReading {
  artboard: { name: string; format: string | null; width: number; height: number };
  objects: { role: string; kind: string; name: string; words?: string; face?: string; colour?: string; at: string }[];
  palette: Record<string, string>;
  type: { display: string; body: string };
  decisions: { decision: string; now: string; by: string }[];
  locked: string[];
  concepts: string[];
  /** what the work is for, in the person's words (the brief) */
  brief?: string;
  /** the artboards in order ("the first", "the second"…), the one being changed marked */
  boards?: string[];
  /** comments still open on this artboard: what the person wants of which object */
  comments?: string[];
  /** references the person chose, and what they took from each */
  references?: string[];
}

const pct = (v: number, of: number) => `${Math.round((v / of) * 100)}%`;

/** The design as the model reads it: compact, without pictures or geometry it does not need. */
export function readingOf(doc0: GraphicDoc, boardId?: string, dir?: GraphicDirection | null, memory: { brief?: string; references?: readonly string[] } = {}): DesignReading {
  const b0 = boardOf(doc0, boardId);
  // an artboard with a visual language of its own is read in it
  const doc = b0?.tokens ? { ...doc0, tokens: b0.tokens } : doc0;
  const b = b0;
  const objects = walk(b)
    .filter((l) => !l.node.hidden && l.node.type !== 'group')
    .slice(0, 40)
    .map(({ node: n }) => ({
      role: n.role ?? 'none',
      kind: n.type === 'shape' ? `shape (${n.shape})` : n.type,
      name: (n.name ?? '').slice(0, 40),
      ...(n.type === 'text' ? { words: n.text.replace(/\s+/g, ' ').slice(0, 80), face: `${n.font} ${n.weight}`, colour: n.color.slice(0, 7) } : {}),
      ...(n.type === 'shape' && typeof n.fill === 'string' ? { colour: n.fill.slice(0, 7) } : {}),
      at: `${pct(n.x, b.width)} ${pct(n.y, b.height)}, ${pct(n.w, b.width)} × ${pct(n.h, b.height)}`,
    }));
  return {
    artboard: { name: b.name.slice(0, 60), format: b.format ?? null, width: Math.round(b.width), height: Math.round(b.height) },
    objects,
    palette: { ...doc.tokens.colors, ...(doc.tokens.accent2 ? { accent2: doc.tokens.accent2 } : {}) },
    type: { display: doc.tokens.fonts.display, body: doc.tokens.fonts.body },
    decisions: decisionViews(doc, b.id, dir).map((v) => ({ decision: v.key, now: v.value, by: v.source === 'engine' ? 'as the concept was made' : v.source === 'concept' ? 'taken from another concept' : `you said: ${v.said ?? ''}`.slice(0, 120) })),
    locked: [...(doc.locks?.colors ? ['colours'] : []), ...(doc.locks?.fonts ? ['typefaces'] : []), ...walk(b).filter((l) => l.node.locked).slice(0, 8).map((l) => l.node.name ?? l.node.role ?? l.node.type)],
    concepts: (doc.concepts ?? []).map((c, i) => `${i + 1}. ${c.name}`),
    ...(memory.brief ? { brief: memory.brief.replace(/\s+/g, ' ').slice(0, 300) } : {}),
    ...(doc0.artboards.length > 1 ? { boards: doc0.artboards.map((x, i) => `${i + 1}. ${x.name}${x.id === b.id ? ' (this one)' : ''}`.slice(0, 80)) } : {}),
    ...((cm) => (cm.length ? { comments: cm } : {}))(
      (doc0.comments ?? [])
        .filter((c) => c.board === b.id && c.status === 'open')
        .slice(-6)
        .map((c) => {
          const on = c.nodes.map((id) => walk(b).find((l) => l.node.id === id)?.node).filter(Boolean).map((n) => n!.name ?? n!.role ?? n!.type);
          return `on the ${on.join(', ') || 'design'}: ${c.text}`.slice(0, 200);
        }),
    ),
    ...(memory.references?.length ? { references: memory.references.slice(0, 6).map((r) => r.slice(0, 120)) } : {}),
  };
}

/** A reading sent by the browser, held to its shape and size before it reaches a prompt. */
export function normalizeReading(v: unknown): DesignReading | null {
  const r = v && typeof v === 'object' ? (v as Record<string, any>) : null;
  if (!r || !r.artboard || typeof r.artboard !== 'object') return null;
  const s = (x: unknown, n: number) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f]/g, ' ').slice(0, n) : '');
  const arr = (x: unknown, n: number) => (Array.isArray(x) ? x.slice(0, n) : []);
  const hexes = Object.fromEntries(Object.entries(r.palette && typeof r.palette === 'object' ? r.palette : {}).filter(([k, c]) => /^[a-zA-Z0-9]{1,16}$/.test(k) && typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 10)) as Record<string, string>;
  return {
    artboard: { name: s(r.artboard.name, 60), format: r.artboard.format ? s(r.artboard.format, 40) : null, width: Math.max(1, Math.min(20000, Number(r.artboard.width) || 1)), height: Math.max(1, Math.min(20000, Number(r.artboard.height) || 1)) },
    objects: arr(r.objects, 40).map((x: Record<string, unknown>) => ({ role: s(x?.role, 20), kind: s(x?.kind, 30), name: s(x?.name, 40), ...(x?.words ? { words: s(x.words, 80) } : {}), ...(x?.face ? { face: s(x.face, 60) } : {}), ...(x?.colour ? { colour: s(x.colour, 7) } : {}), at: s(x?.at, 40) })),
    palette: hexes,
    type: { display: s(r.type?.display, 60), body: s(r.type?.body, 60) },
    decisions: arr(r.decisions, 10).map((x: Record<string, unknown>) => ({ decision: s(x?.decision, 20), now: s(x?.now, 160), by: s(x?.by, 140) })),
    locked: arr(r.locked, 10).map((x: unknown) => s(x, 40)),
    concepts: arr(r.concepts, 8).map((x: unknown) => s(x, 70)),
    ...(s(r.brief, 300) ? { brief: s(r.brief, 300) } : {}),
    ...(arr(r.boards, 12).length ? { boards: arr(r.boards, 12).map((x: unknown) => s(x, 80)) } : {}),
    ...(arr(r.comments, 6).length ? { comments: arr(r.comments, 6).map((x: unknown) => s(x, 200)) } : {}),
    ...(arr(r.references, 6).length ? { references: arr(r.references, 6).map((x: unknown) => s(x, 120)) } : {}),
  };
}

/** The instructions: the same for every design (cacheable), the vocabulary the plan must use, and how to decide. */
export function creativeSystem(): string {
  return [
    'You are the creative director inside SocriaUX, a graphic design editor. A designer tells you, in their own words, how they want the design in front of them to change. You read those words against the design as it is and write a creative plan of design decisions. You do not draw: SocriaUX’s engine carries the plan out, decision by decision, and checks the result.',
    '',
    'HOW TO READ',
    '1. Understand the design first (the reading below the words). Change only what the words ask for. Everything else stays exactly as it is: its words, its logo, its pictures, its composition, its type and its colours, unless the words reach them.',
    '2. Tell apart what is asked: one named object (the headline, the logo, a picture: put the words for it in an "object" change), a global visual change (palette, background, depth), a composition change, a typography change, a style transformation (qualities, as "mood"), a brand identity change (a theme, with type), a content change, or a complete redesign (composition "rethink" or "unexpected" with the qualities or theme asked for).',
    '3. A world or subject named for the look ("cloud themed", "like the ocean", "a forest feel") is a "theme": its palette, forms, ground and depth come with it. Use its type only when the identity or brand is asked to change.',
    '4. A quality of the whole ("more sophisticated", "more alive", "too generic") is "mood" with quality ids. Say exact decisions too when the words are exact: "warmer colours" is a palette shift, "editorial typography" a type character, "abstract organic forms instead of the clouds" forms of kind organic with abstraction about 80.',
    '5. "Keep X" puts X in keep, and nothing kept is changed. "I like the direction" keeps the composition and the forms.',
    '6. A decision turned down ("I don’t like the new typography", "bring back the old colours") is a "revert" of that decision.',
    '7. Concepts: keep (save), duplicate, compare, go back to (revisit), new concepts, another interpretation (alternative). Taking a decision from another concept ("the typography of concept 2") is that decision with "from" naming the concept.',
    '8. Never write new words for the design. A content change only carries text the designer wrote, word for word.',
    '9. Ask one question only when the words could mean clearly different results and nothing in the design or the conversation settles which — "change the overall aesthetic" with no direction, say. Give two to four answers, each with the words that would be said. Otherwise decide as a good designer would and act: never ask what you can reasonably decide.',
    '10. Several instructions in one breath are separate changes: read each.',
    '11. summary: one plain sentence to the designer, in the second person, saying what will change.',
    '12. Memory: the reading may carry the brief (what the work is for), the artboards in order (so "the first" and "the second" can be told apart), comments still open on objects, and references the designer chose. Use them to settle what words refer to and to keep the work true to the brief; never act on a comment that was not asked for now.',
    '',
    'VOCABULARY (use these exact ids)',
    `themes: ${THEMES.map((t) => `${t.id} (${t.label})`).join(', ')}`,
    `qualities: ${QUALITIES.map((q) => q.id).join(', ')}`,
    `forms: ${FORM_KINDS.join(', ')}  (abstraction 0 literal … 100 abstract)`,
    `palette shifts: ${PALETTE_SHIFTS.join(', ')}`,
    `type characters: ${TYPE_CHARACTERS.join(', ')}`,
    `composition actions: ${COMPOSITION_ACTIONS.join(', ')}`,
    `concept actions: ${CONCEPT_ACTIONS.join(', ')}`,
    `keepable: ${KEEPABLE.join(', ')}`,
    `decisions that can be reverted: ${DECISION_KEYS.join(', ')}`,
    `intents: ${INTENTS.join(', ')}`,
    'forms: count and scale are changes relative to now (count -1…3, scale -0.8…1.5), delta moves the abstraction. depth: delta -3…3 or level 0…3. background: kind flat, gradient or texture; tone darker, lighter, theme or contrast; colours as #rrggbb.',
    'Every field in the schema is present; a field with nothing to say is null.',
  ].join('\n');
}

/** The words, the design, the question asked last and the turns before. */
export function creativeUser(words: string, reading: DesignReading, asked?: PlanQuestion | null, recent: readonly { said: string; did: string }[] = []): string {
  return [
    `THE DESIGNER SAYS: ${words.slice(0, 600)}`,
    ...(asked ? [`(You asked them: ${asked.text} — answers offered: ${asked.options.map((o) => o.label).join(' / ')}.)`] : []),
    ...(recent.length ? ['', 'EARLIER IN THIS CONVERSATION', ...recent.slice(-4).map((t) => `- they said “${t.said.slice(0, 160)}”; SocriaUX did: ${t.did.slice(0, 200)}`)] : []),
    '',
    'THE DESIGN AS IT IS',
    JSON.stringify(reading),
  ].join('\n');
}

// ── the strict shape of a plan, for the provider's structured output ──

type Schema = Record<string, unknown>;
const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const nullable = (s: Schema): Schema => ({ anyOf: [s, { type: 'null' }] });
const enumOf = (values: readonly string[]): Schema => ({ type: 'string', enum: [...values] });
const num: Schema = { type: 'number' };
const hex: Schema = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
const ref = nullable({ type: 'string', maxLength: 60 });
const FACE = enumOf(FONTS.map((f) => f.name));

const CHANGE_SCHEMAS: Schema[] = [
  object({ decision: enumOf(['theme']), theme: enumOf(THEMES.map((t) => t.id)), forms: nullable(enumOf(FORM_KINDS)), abstraction: nullable(num), mode: nullable(enumOf(['light', 'dark'])) }),
  object({ decision: enumOf(['palette']), shifts: nullable({ type: 'array', items: enumOf(PALETTE_SHIFTS), maxItems: 4 }), colours: nullable(object({ ground: nullable(hex), ink: nullable(hex), accent: nullable(hex), support: nullable({ type: 'array', items: hex, maxItems: 3 }) })), from: ref }),
  object({ decision: enumOf(['type']), character: nullable(enumOf(TYPE_CHARACTERS)), display: nullable(FACE), body: nullable(FACE), weight: nullable(enumOf(['lighter', 'heavier'])), case: nullable(enumOf(['upper', 'none'])), from: ref }),
  object({ decision: enumOf(['composition']), action: enumOf(COMPOSITION_ACTIONS), from: ref }),
  object({ decision: enumOf(['forms']), kind: nullable(enumOf(FORM_KINDS)), abstraction: nullable(num), delta: nullable(num), count: nullable(num), scale: nullable(num), remove: nullable({ type: 'boolean' }), from: ref }),
  object({ decision: enumOf(['background']), kind: nullable(enumOf(['flat', 'gradient', 'texture'])), colours: nullable({ type: 'array', items: hex, maxItems: 3 }), tone: nullable(enumOf(['darker', 'lighter', 'theme', 'contrast'])), from: ref }),
  object({ decision: enumOf(['depth']), delta: nullable(num), level: nullable(num) }),
  object({ decision: enumOf(['mood']), qualities: { type: 'array', items: enumOf(QUALITIES.map((q) => q.id)), maxItems: 4 } }),
  object({ decision: enumOf(['content']), role: enumOf(ROLES), text: { type: 'string', maxLength: 300 } }),
  object({ decision: enumOf(['object']), words: { type: 'string', maxLength: 300 } }),
  object({ decision: enumOf(['revert']), target: enumOf(DECISION_KEYS) }),
  object({ decision: enumOf(['concept']), action: enumOf(CONCEPT_ACTIONS), ref, name: nullable({ type: 'string', maxLength: 60 }) }),
];

/** The plan as a strict JSON schema (every field present, null when there is nothing to say; lists bounded). */
export const CREATIVE_PLAN_SCHEMA: Schema = object({
  intent: enumOf(INTENTS),
  summary: { type: 'string', maxLength: 300 },
  keep: { type: 'array', items: enumOf(KEEPABLE), maxItems: 9 },
  changes: { type: 'array', items: { anyOf: CHANGE_SCHEMAS }, maxItems: 12 },
  question: nullable(object({ text: { type: 'string', maxLength: 300 }, options: { type: 'array', items: object({ label: { type: 'string', maxLength: 80 }, words: { type: 'string', maxLength: 200 } }), maxItems: 4 } })),
});
