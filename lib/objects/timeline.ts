// lib/objects/timeline.ts — how a line of thinking changed, read only from what was recorded.
//
// The Time Machine draws this. Every event on it is a record that exists: a
// step an object of thought took (what was done, who chose it, when, what the
// computation showed), or a change the map record kept (ideas that came,
// went, or were reworded, and the person's words on that turn). Nothing is
// reconstructed from memory or inferred about what someone "must have"
// thought. Where the record stops — history trimmed, steps from before times
// were kept, the map's record beginning — it says so.
//
// PURE.

import { currentOf, kindOf, type ObjectSpace, type Step, type ThoughtObject } from './core';
import { compareMap, type MapHistory } from '../map-history';

export interface TimelineEvent {
  /** stable across trims: the object (or "map") and the moment */
  key: string;
  /** 0 when the moment was not recorded */
  at: number;
  source: { kind: 'step'; obj: string; index: number } | { kind: 'map'; index: number };
  /** what it is about: the object's name and title, or "The map" */
  about: string;
  /** what happened, in the record's own words */
  said: string;
  /** who: the person, Socria, the person on Socria's suggestion; a turn of the conversation or an edit by hand */
  who: 'person' | 'socria' | 'suggested' | 'turn' | 'edit';
  /** what the computation showed about the step, when it said anything */
  note?: string;
  /** the person's own words on the turn that led to a map change */
  words?: string;
}

export interface Timeline {
  events: TimelineEvent[];
  /** where the record is incomplete, each in a sentence */
  gaps: string[];
}

const titleOf = (o: ThoughtObject): string => {
  const t = (currentOf(o) as { title?: unknown } | undefined)?.title;
  return typeof t === 'string' && t ? `${o.name} · ${t}` : `${o.name} · ${kindOf(o.kind)?.label ?? o.kind}`;
};

/**
 * A step's key: the object and the moment — and, where several steps share a
 * moment (Socria's suggestions arrive together), which of them it is. Stable
 * across a trimmed history: it never depends on where the history starts.
 */
export function keyOfStep(o: Pick<ThoughtObject, 'id' | 'steps'>, index: number): string {
  const s = o.steps[index];
  if (!s?.at) return `${o.id}#${index}`;
  let k = 0;
  for (let i = index - 1; i >= 0 && o.steps[i].at === s.at; i--) k++;
  return k ? `${o.id}@${s.at}+${k}` : `${o.id}@${s.at}`;
}

function mapSaid(c: MapHistory['changes'][number]): string {
  const parts: string[] = [];
  if (c.added.length) parts.push(`added ${c.added.map((n) => `“${n.label}”`).slice(0, 4).join(', ')}${c.added.length > 4 ? ` and ${c.added.length - 4} more` : ''}`);
  if (c.removed.length) parts.push(`took off ${c.removed.map((n) => `“${n.label}”`).slice(0, 4).join(', ')}${c.removed.length > 4 ? ` and ${c.removed.length - 4} more` : ''}`);
  if (c.renamed.length) parts.push(`reworded ${c.renamed.map((r) => `“${r.from}” to “${r.to}”`).slice(0, 3).join(', ')}`);
  return parts.join('; ');
}

/**
 * Every recorded change to the tracked objects (all of them, when none is
 * named — never `exclude`, the Time Machine itself) and, when asked, to the
 * map — in time order, oldest first.
 */
export function timelineOf(space: ObjectSpace | undefined, history: MapHistory | undefined, opts: { tracked: readonly string[]; map: boolean; exclude?: string }): Timeline {
  const events: TimelineEvent[] = [];
  const gaps: string[] = [];
  const objs = (space?.objs ?? []).filter((o) => o.id !== opts.exclude && (!opts.tracked.length || opts.tracked.includes(o.id)));
  for (const o of objs) {
    const about = titleOf(o);
    if (o.trimmed) gaps.push(`The earliest ${o.trimmed} step${o.trimmed === 1 ? '' : 's'} of ${about} ${o.trimmed === 1 ? 'is' : 'are'} no longer kept.`);
    let undated = 0;
    o.steps.forEach((s, i) => {
      if (!s.at) undated++;
      events.push({
        key: keyOfStep(o, i),
        at: s.at || 0,
        source: { kind: 'step', obj: o.id, index: i },
        about,
        said: s.said,
        who: s.by === 'socria' ? 'socria' : s.suggested ? 'suggested' : 'person',
        ...(s.note ? { note: s.note } : {}),
      });
    });
    if (undated) gaps.push(`${undated} step${undated === 1 ? '' : 's'} of ${about} ${undated === 1 ? 'has' : 'have'} no recorded time.`);
  }
  if (opts.tracked.length) {
    const missing = opts.tracked.filter((id) => id !== opts.exclude && !(space?.objs ?? []).some((o) => o.id === id));
    if (missing.length) gaps.push(`${missing.length} of the things followed here ${missing.length === 1 ? 'is' : 'are'} no longer in this workspace.`);
  }
  if (opts.map) {
    if (!history) gaps.push('The map’s changes are not recorded yet — the record begins with its next change.');
    else {
      gaps.push(`The map’s record begins ${new Date(history.since).toISOString().slice(0, 10)}; nothing before that is known.`);
      if (history.trimmed) gaps.push(`${history.trimmed} earlier change${history.trimmed === 1 ? ' to the map was' : 's to the map were'} forgotten.`);
      history.changes.forEach((c, i) =>
        events.push({ key: `map@${c.at}`, at: c.at, source: { kind: 'map', index: i }, about: 'The map', said: mapSaid(c), who: c.cause, ...(c.said ? { words: c.said } : {}) })
      );
    }
  }
  // time order; the undated keep their place within their own object, first
  events.sort((a, b) => a.at - b.at || (a.source.kind === 'step' && b.source.kind === 'step' && a.source.obj === b.source.obj ? a.source.index - b.source.index : 0));
  return { events, gaps };
}

export interface StateDiff {
  /** parts present now and not then */
  added: string[];
  removed: string[];
  renamed: { from: string; to: string }[];
  /** what the object's own facts said then and no longer say, and say now and did not then */
  then: string[];
  now: string[];
}

/** How an object differs between two of its kept states — from its parts and its facts, both computed by its kind. */
export function compareStates(o: ThoughtObject, i: number, j: number, guarded = false): StateDiff | null {
  const k = kindOf(o.kind);
  const a = o.states[i];
  const b = o.states[j];
  if (!k || a === undefined || b === undefined) return null;
  const pa = new Map(k.parts(a).map((p) => [p.id, p.label]));
  const pb = new Map(k.parts(b).map((p) => [p.id, p.label]));
  const fa = k.facts(a, { guarded });
  const fb = k.facts(b, { guarded });
  return {
    added: [...pb].filter(([id]) => !pa.has(id)).map(([, l]) => l),
    removed: [...pa].filter(([id]) => !pb.has(id)).map(([, l]) => l),
    renamed: [...pb].filter(([id, l]) => pa.has(id) && pa.get(id) !== l).map(([id, l]) => ({ from: pa.get(id)!, to: l })),
    then: fa.filter((f) => !fb.includes(f)),
    now: fb.filter((f) => !fa.includes(f)),
  };
}

export { compareMap };
