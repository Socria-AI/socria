// lib/workspace/focus.ts
//
// WHAT THE PERSON IS LOOKING AT, AS THE CONVERSATION SHOULD KNOW IT.
//
// The workspace has one notion of "this": a node on the map, an object in a
// model, a parameter, a free input. Selecting it in any surface makes it the
// focus, every surface that follows selections follows it, and the
// conversation is told what it is — from canonical state, never from pixels.
// "Why is this negative?" with β₂ selected reaches Socria as a question about
// β₂: its value, its range, what it means, what depends on it.
//
// TWO KINDS OF SELECTION, KEPT APART ON PURPOSE. A model's selected OBJECT is
// canonical already — it lives on the model (lib/model/docs.ts selectObject)
// so every view of that model agrees and "ask about this" carries an identity.
// The workspace FOCUS is per person and ephemeral: which of the things on
// screen this person is attending to right now. Two people thinking together
// share the model and keep their own focus, the way they keep their own
// layouts. Focus is never persisted and never written into a model.
//
// PURE.

import type { ThinkingMap } from '@/lib/logos';
import { docOf, modelFor } from '@/lib/model/docs';
import { inputsOf } from '@/lib/model/derive';
import { affectedBy } from '@/lib/model/deps';
import { inspectObject, inspectionLines } from '@/lib/model/inspect';
import { objOf, kindOf, currentOf } from '@/lib/objects';

export type Focus =
  | { kind: 'param' | 'input' | 'object'; doc: string; id: string }
  | { kind: 'node'; id: string }
  /** a part of an object of thought — a row of a matrix, a parameter of a function (lib/objects/) */
  | { kind: 'part'; obj: string; part: string }
  | null;

/** What the conversation is told about the focus. Small, plain, bounded. */
export interface FocusBrief {
  kind: 'param' | 'input' | 'object' | 'node' | 'part';
  /** what it is called, as the person sees it */
  label: string;
  /** the model or map it belongs to */
  of: string;
  /** facts from canonical state, one per line */
  lines: string[];
}

const MAX_LINES = 12;
const MAX_LINE = 220;

/** The focus, described from the state it points at — or null when that thing no longer exists. */
export function describeFocus(focus: Focus, map: ThinkingMap | null | undefined): FocusBrief | null {
  if (!focus || !map) return null;
  if (focus.kind === 'part') {
    const o = objOf(map.objects, focus.obj);
    const k = o ? kindOf(o.kind) : null;
    if (!o || !k) return null;
    const st = currentOf(o);
    const lines = k.partFacts(st, focus.part);
    const part = k.parts(st).find((p) => p.id === focus.part);
    if (!lines || !part) return null;
    const last = o.steps[o.at - 1];
    return clip({
      kind: 'part',
      label: `${part.label} of ${o.name}`,
      // "scene Scene" says nothing twice; a name that already says its kind is enough
      of: o.name.toLowerCase().startsWith(k.label.toLowerCase()) ? o.name : `${k.label.toLowerCase()} ${o.name}`,
      lines: [...lines, ...(last ? [`the last step on ${o.name}: ${last.said} (${last.by === 'person' ? 'their choice' : 'Socria’s'}; computed)`] : [])],
    });
  }
  if (focus.kind === 'node') {
    const n = map.nodes.find((x) => x.id === focus.id);
    if (!n) return null;
    const label = (id: string) => map.nodes.find((x) => x.id === id)?.label ?? id;
    const links = map.edges
      .filter((e) => e.from === n.id || e.to === n.id)
      .slice(0, 8)
      .map((e) => (e.from === n.id ? `${e.relation.replace(/_/g, ' ')} → ${label(e.to)}` : `${label(e.from)} → ${e.relation.replace(/_/g, ' ')} this`));
    return clip({
      kind: 'node',
      label: n.label,
      of: 'the Thinking Map',
      lines: [
        `a ${n.type} on the map${n.status && n.status !== 'open' ? `, marked ${n.status}` : ''}`,
        ...(links.length ? [`connected: ${links.join('; ')}`] : ['not connected to anything yet']),
      ],
    });
  }
  const ws = map.models;
  const doc = ws ? docOf(ws, focus.doc) : null;
  if (!doc) return null;
  const model = modelFor(doc);
  const name = (id: string) => model.objects.find((o) => o.id === id)?.label ?? model.params.find((p) => p.id === id)?.label ?? id;
  if (focus.kind === 'param') {
    const p = model.params.find((q) => q.id === focus.id);
    if (!p) return null;
    const moves = affectedBy(model, [p.id]).map(name).slice(0, 8);
    return clip({
      kind: 'param',
      label: p.label,
      of: model.title,
      lines: [
        `a parameter of ${model.title}, now ${p.value}${p.units ? ` ${p.units}` : ''}${p.assumed === 'value' ? ' — a placeholder nobody has chosen yet' : ''}`,
        `its range is ${p.min} to ${p.max}${p.units ? ` ${p.units}` : ''}`,
        ...(p.means ? [`what it means: ${p.means}`] : []),
        moves.length ? `what depends on it: ${moves.join(', ')}` : 'nothing in the model depends on it yet',
      ],
    });
  }
  if (focus.kind === 'input') {
    const q = inputsOf(model).find((x) => x.id === focus.id);
    if (!q) return null;
    return clip({
      kind: 'input',
      label: q.label,
      of: model.title,
      lines: [
        `a free input of ${model.title} — the relationship is read at ${q.at}${q.units ? ` ${q.units}` : ''}`,
        `its range is ${q.min} to ${q.max}${q.units ? ` ${q.units}` : ''}${q.from === 'assumed' ? ' (assumed — nobody gave one)' : ''}`,
      ],
    });
  }
  const i = inspectObject(model, focus.id);
  if (!i) return null;
  return clip({ kind: 'object', label: name(focus.id), of: model.title, lines: inspectionLines(i, MAX_LINES) });
}

function clip(b: FocusBrief): FocusBrief {
  return {
    kind: b.kind,
    label: b.label.slice(0, 80),
    of: b.of.slice(0, 90),
    lines: b.lines.filter(Boolean).slice(0, MAX_LINES).map((l) => l.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE)),
  };
}

/** A brief that arrived from a browser, cleaned like every other field that does. */
export function sanitizeFocus(raw: unknown): FocusBrief | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind;
  if (kind !== 'param' && kind !== 'input' && kind !== 'object' && kind !== 'node' && kind !== 'part') return null;
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const label = str(r.label, 80);
  if (!label) return null;
  const lines = (Array.isArray(r.lines) ? r.lines : []).map((l) => str(l, MAX_LINE)).filter(Boolean).slice(0, MAX_LINES);
  return { kind, label, of: str(r.of, 90), lines };
}

/**
 * The block the reply is given. It says what "this" means and that it came
 * from the workspace, so a reply can say "β₂" rather than guessing what a
 * person meant by "this one" — and is told to treat the facts as the state of
 * the model, which they are, rather than as something to argue with.
 */
export function focusBlock(b: FocusBrief | null): string {
  if (!b) return '';
  const what = b.kind === 'part' ? `part of ${b.of}, an object they are working on` : b.kind === 'node' ? 'an idea on their Thinking Map' : b.kind === 'object' ? `a part of the model "${b.of}"` : b.kind === 'param' ? `a parameter of the model "${b.of}"` : `a free input of the model "${b.of}"`;
  return `

WHAT THEY HAVE SELECTED IN THE WORKSPACE: "${b.label}" — ${what}. When they say "this", "it" or "here", they mean this, unless what they wrote says otherwise. What the workspace knows about it, from the model's own state:
${b.lines.map((l) => `- ${l}`).join('\n')}`;
}
