// lib/logos6/focus-context.ts — WHAT THEY ARE LOOKING AT ON THE CANVAS, FOR CORE (Logos 6; docs/OMNIBOX.md).
//
// "Why are these connected?", "What does this node mean?", "What's missing from my reasoning?" are about the card or
// the line they have selected, and the answer has to come from what that card or line actually holds — its meaning,
// their notes, its lines and why each holds, whether they confirmed it — never from a guess. The browser reads the
// selection from the canonical map (focusOf) and sends it with the turn; the server cleans it (sanitizeCanvasFocus)
// and Core reads it as context, never as their words (canvasFocusBlock). And "show me what changed" is answered from
// the map's own record of changes (recentChanges), not from memory.
//
// Pure: no React, no DOM, no clock.

import type { ThinkingMap } from '../logos';
import { connectionsOf, edgeIdOf, lineStatus, RELATION_SAID, structureRows, type LineStatus } from './graph';
import { edgeVid, nodeVid } from './canvas-visual';
import { workLabelFor, type WorkItem } from './work';

export interface FocusCard {
  kind: 'card';
  label: string;
  type: string;
  /** whose it is */
  by: 'you' | 'socria' | 'conversation' | 'source';
  meaning?: string;
  why?: string;
  /** what Socria read of the conversation for it (labelled as such) */
  detail?: string;
  notes?: string;
  tags?: string[];
  assumptions?: string[];
  sources?: string[];
  /** where it sits in the structure */
  inside?: string;
  /** the artifact, quiz or source it stands for: "Quiz · 7/10" */
  work?: string;
  lines: { said: string; other: string; why?: string; status: LineStatus }[];
}

export interface FocusLine {
  kind: 'line';
  from: string;
  to: string;
  said: string;
  why?: string;
  evidence?: string[];
  status: LineStatus;
  structure?: boolean;
}

export type CanvasFocus = FocusCard | FocusLine;

const clean = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const list = (v: unknown, k: number, n: number) => (Array.isArray(v) ? v.map((x) => clean(x, n)).filter(Boolean).slice(0, k) : []);
const STATUSES: readonly LineStatus[] = ['confirmed', 'suggested', 'read'];

/** The selected card or line (a bus id: node:… or edge:…), read from the map as it stands; null when nothing fits. */
export function focusOf(map: Pick<ThinkingMap, 'nodes' | 'edges'>, selected: string | null | undefined, work: readonly WorkItem[] = []): CanvasFocus | null {
  if (!selected) return null;
  const n = map.nodes.find((x) => nodeVid(x.id) === selected);
  if (n) {
    const m = n.mind ?? {};
    const row = structureRows(map).find((r) => r.id === n.id);
    const parent = row?.parent ? map.nodes.find((x) => x.id === row.parent) : null;
    const w = workLabelFor(n.obj, work);
    return {
      kind: 'card',
      label: n.label,
      type: n.type,
      by: n.origin === 'socria' ? 'socria' : n.origin === 'source' ? 'source' : n.hand ? 'you' : 'conversation',
      ...(m.meaning ? { meaning: m.meaning } : {}),
      ...(m.why ? { why: m.why } : {}),
      ...(n.detail && !m.detailYours ? { detail: n.detail } : n.detail ? { meaning: m.meaning ?? n.detail } : {}),
      ...(m.notes ? { notes: m.notes } : {}),
      ...(m.tags?.length ? { tags: m.tags } : {}),
      ...(m.assumptions?.length ? { assumptions: m.assumptions } : {}),
      ...(m.sources?.length || n.evidence?.length ? { sources: [...(m.sources ?? []).map((s) => s.title), ...(n.evidence ?? []).map((e) => (e as { quote?: string }).quote ?? '').filter(Boolean)] } : {}),
      ...(parent ? { inside: `${parent.label}${row?.inferred ? ' (read from its lines, not placed by them)' : ''}` } : {}),
      ...(w ? { work: `${w.said}: ${w.item.title}` } : {}),
      lines: connectionsOf(map, n.id)
        .slice(0, 8)
        .map((c) => ({ said: c.said, other: c.other.label, ...(c.edge.why ? { why: c.edge.why } : {}), status: c.status })),
    };
  }
  const e = map.edges.find((x) => edgeVid(x) === selected || `edge:${edgeIdOf(x)}` === selected);
  if (e) {
    const a = map.nodes.find((x) => x.id === e.from), b = map.nodes.find((x) => x.id === e.to);
    if (!a || !b) return null;
    return {
      kind: 'line',
      from: a.label,
      to: b.label,
      said: e.kind === 'structure' ? 'sits inside' : e.label || RELATION_SAID[e.relation],
      ...(e.why ? { why: e.why } : {}),
      ...(e.evidence?.length ? { evidence: e.evidence } : {}),
      status: lineStatus(e),
      ...(e.kind === 'structure' ? { structure: true } : {}),
    };
  }
  return null;
}

/** A focus that arrived from a browser: shaped, clipped, bounded; null when it is not one. */
export function sanitizeCanvasFocus(raw: unknown): CanvasFocus | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const status = STATUSES.includes(r.status as LineStatus) ? (r.status as LineStatus) : 'read';
  if (r.kind === 'line') {
    const from = clean(r.from, 140), to = clean(r.to, 140), said = clean(r.said, 60);
    if (!from || !to || !said) return null;
    const why = clean(r.why, 400);
    const evidence = list(r.evidence, 4, 240);
    return { kind: 'line', from, to, said, ...(why ? { why } : {}), ...(evidence.length ? { evidence } : {}), status, ...(r.structure === true ? { structure: true } : {}) };
  }
  if (r.kind !== 'card') return null;
  const label = clean(r.label, 140);
  if (!label) return null;
  const by = r.by === 'you' || r.by === 'socria' || r.by === 'source' ? r.by : 'conversation';
  const opt = (k: string, n: number) => {
    const v = clean(r[k], n);
    return v ? { [k]: v } : {};
  };
  const lines = (Array.isArray(r.lines) ? r.lines : [])
    .slice(0, 8)
    .map((l) => {
      const o = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
      const said = clean(o.said, 40), other = clean(o.other, 140), why = clean(o.why, 300);
      return said && other ? { said, other, ...(why ? { why } : {}), status: STATUSES.includes(o.status as LineStatus) ? (o.status as LineStatus) : ('read' as LineStatus) } : null;
    })
    .filter((l): l is FocusCard['lines'][number] => !!l);
  const tags = list(r.tags, 8, 40), assumptions = list(r.assumptions, 6, 200), sources = list(r.sources, 6, 200);
  return {
    kind: 'card',
    label,
    type: clean(r.type, 24) || 'idea',
    by,
    ...opt('meaning', 400),
    ...opt('why', 400),
    ...opt('detail', 600),
    ...opt('notes', 1200),
    ...(tags.length ? { tags } : {}),
    ...(assumptions.length ? { assumptions } : {}),
    ...(sources.length ? { sources } : {}),
    ...opt('inside', 200),
    ...opt('work', 140),
    lines,
  } as FocusCard;
}

const q = (s: string) => `“${s}”`;
const STATUS_SAID: Record<LineStatus, string> = { confirmed: 'confirmed by them', suggested: 'suggested, not yet confirmed', read: 'read from the conversation, not confirmed' };
const BY_SAID: Record<FocusCard['by'], string> = { you: 'theirs (added by them)', socria: 'a suggestion of yours they kept', conversation: 'read from the conversation', source: 'from a source they brought' };

/** The selection as Core reads it: what the card or line actually holds, and how to answer about it. '' for none. */
export function canvasFocusBlock(f: CanvasFocus | null): string {
  if (!f) return '';
  if (f.kind === 'line') {
    return (
      `\n\nSELECTED ON THEIR MIND MAP — a line: ${q(f.from)} ${f.said} ${q(f.to)}, ${STATUS_SAID[f.status]}.` +
      (f.why ? ` Why it holds, as stored: ${q(f.why)}.` : ' No reason is stored for it.') +
      (f.evidence?.length ? ` What bears it out, as stored: ${f.evidence.map(q).join('; ')}.` : '') +
      ` When they ask why these are connected, answer from what is stored; where nothing is stored, say so, offer your reading as yours, and never present it as theirs or as established.\n`
    );
  }
  const parts = [
    f.meaning ? `means (their words): ${q(f.meaning)}` : '',
    f.why ? `matters because (their words): ${q(f.why)}` : '',
    f.detail ? `your earlier reading of the conversation: ${q(f.detail)}` : '',
    f.notes ? `their notes: ${q(f.notes)}` : '',
    f.tags?.length ? `tags: ${f.tags.join(', ')}` : '',
    f.assumptions?.length ? `assumptions: ${f.assumptions.map(q).join('; ')}` : '',
    f.sources?.length ? `sources: ${f.sources.map(q).join('; ')}` : '',
    f.inside ? `sits inside ${q(f.inside)}` : '',
    f.work ? `stands for ${f.work}` : '',
  ].filter(Boolean);
  const lines = f.lines.map((l) => `${l.said} ${q(l.other)} (${STATUS_SAID[l.status]}${l.why ? `; why: ${q(l.why)}` : ''})`);
  return (
    `\n\nSELECTED ON THEIR MIND MAP — the card ${q(f.label)} (${f.type}), ${BY_SAID[f.by]}.` +
    (parts.length ? ` It holds: ${parts.join('. ')}.` : ' It holds nothing beyond its title.') +
    (lines.length ? ` Its lines: ${lines.join('; ')}.` : ' It has no lines yet.') +
    ` "This", "this node" and "it" mean this card. Answer from what it holds; anything you add is your reading, said as yours. Never call a suggested or read line confirmed.\n`
  );
}

export { recentChanges } from './objective';
