// lib/logos6/work.ts — THE CHAT'S WORK, ON THE CANVAS (Logos 6; docs/OMNIBOX.md).
//
// One chat, one objective, one workspace: the artifacts made in it, the quizzes taken in it and the sources brought
// into it belong on the Thinking Canvas beside the ideas, not in views of their own. This reads them from where they
// already live — the map's workspace (`map.objects`) and the conversation's attachments — with a stable key each, so
// the canvas lists them, opens one in focus (the expanded artifact, the quiz, the document, as they are) and, when the
// person places one, draws a card that STANDS FOR it (a node whose `obj` is that object): one thing, never a copy,
// connected and organised like any idea.
//
// Pure: no React, no DOM, no clock.

import { KIND_NOUN, quizOf } from './objective';

export type WorkKind = 'quiz' | 'artifact' | 'source';

export interface WorkItem {
  /** stable across renders and saves: o:<object id>, f:<document id>, a:<message>:<attachment> */
  key: string;
  kind: WorkKind;
  title: string;
  /** a line under it: "7/10 · missed chain rule", "Chart", "Document" */
  sub?: string;
  /** the workspace object it is (map.objects) — what a card on the canvas points at */
  obj?: string;
  /** the document it is (lib/docs), for a source */
  doc?: string;
  /** the card on the canvas that stands for it, when one does */
  placed?: string;
}

interface ObjLike {
  id: string;
  kind: string;
  name: string;
  states?: unknown[];
  at?: number;
}
interface MsgLike {
  role: string;
  attachments?: readonly { name?: string; kind?: string; doc?: string }[];
}
interface NodeLike {
  id: string;
  obj?: string;
}

const clean = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function stateOf(o: ObjLike): Record<string, unknown> | null {
  const s = o.states?.[Math.min(o.at ?? 0, (o.states?.length ?? 1) - 1)];
  return s && typeof s === 'object' ? (s as Record<string, unknown>) : null;
}

/**
 * Everything this chat holds that is not an idea: quizzes with their standing, the artifacts made, and the sources
 * brought in (a document once, however many times it was attached). Newest last, as they were made.
 */
export function workItemsOf(s: { messages: readonly MsgLike[]; map?: { nodes?: readonly NodeLike[]; objects?: { objs?: readonly ObjLike[] } | null } | null }): WorkItem[] {
  const objs = s.map?.objects?.objs ?? [];
  const placedBy = new Map<string, string>();
  for (const n of s.map?.nodes ?? []) if (n.obj && !placedBy.has(n.obj)) placedBy.set(n.obj, n.id);
  const out: WorkItem[] = [];
  const docObj = new Map<string, string>();
  for (const o of objs) {
    const st = stateOf(o);
    if (o.kind === 'document') {
      const doc = clean(st?.doc, 80);
      if (doc) docObj.set(doc, o.id);
      continue;
    }
    if (o.kind === 'quiz') {
      const z = quizOf(o);
      const sub = z ? (z.total ? `${z.right}/${z.total}${z.missed.length ? ` · missed ${z.missed.slice(0, 2).join(', ')}` : ''}${z.finished ? '' : ' · in progress'}` : 'Not started') : undefined;
      out.push({ key: `o:${o.id}`, kind: 'quiz', title: clean(st?.title, 80) || clean(o.name, 80) || 'Quiz', ...(sub ? { sub } : {}), obj: o.id, ...(placedBy.has(o.id) ? { placed: placedBy.get(o.id) } : {}) });
      continue;
    }
    const title = clean(st?.title, 80) || clean(o.name, 80) || cap(o.kind);
    out.push({ key: `o:${o.id}`, kind: 'artifact', title, sub: KIND_NOUN[o.kind] ?? cap(o.kind), obj: o.id, ...(placedBy.has(o.id) ? { placed: placedBy.get(o.id) } : {}) });
  }
  const seenDoc = new Set<string>();
  s.messages.forEach((m, i) => {
    (m.attachments ?? []).forEach((a, j) => {
      const name = clean(a?.name, 80);
      if (!name) return;
      const doc = clean(a.doc, 80);
      if (doc) {
        if (seenDoc.has(doc)) return;
        seenDoc.add(doc);
        const obj = docObj.get(doc);
        out.push({ key: `f:${doc}`, kind: 'source', title: name, sub: 'Document', doc, ...(obj ? { obj } : {}), ...(obj && placedBy.has(obj) ? { placed: placedBy.get(obj) } : {}) });
      } else {
        out.push({ key: `a:${i}:${j}`, kind: 'source', title: name, sub: a.kind === 'image' ? 'Image' : 'Note' });
      }
    });
  });
  return out;
}

/** The card a placed item becomes: its title, standing for the object, put down by them (the map pass keeps it). */
export function cardFor(w: WorkItem, obj: string, at?: [number, number]): { label: string; type: 'source' | 'concept'; hand: true; obj: string; origin?: 'source'; mind?: { pos: { i: [number, number] } } } {
  return {
    label: w.title,
    type: w.kind === 'source' ? 'source' : 'concept',
    hand: true,
    obj,
    ...(w.kind === 'source' ? { origin: 'source' as const } : {}),
    ...(at ? { mind: { pos: { i: at } } } : {}),
  };
}

/** What a card that stands for something is, said over it: "Quiz · 7/10", "Chart", "Document". */
export function workLabelFor(nodeObj: string | undefined, items: readonly WorkItem[]): { kind: WorkKind; said: string; item: WorkItem } | null {
  if (!nodeObj) return null;
  const w = items.find((x) => x.obj === nodeObj);
  if (!w) return null;
  return { kind: w.kind, said: w.kind === 'quiz' ? `Quiz${w.sub ? ` · ${w.sub}` : ''}` : w.sub ?? (w.kind === 'source' ? 'Source' : 'Artifact'), item: w };
}
