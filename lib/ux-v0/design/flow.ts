// lib/ux-v0/design/flow.ts — one request, start to finish: written, drawn as it streams, carried out, looked at once.
//
//   the person's words ──► the designer writes (streamed) ──► drawn as it grows (applyAnswer, partial)
//                                   │ complete
//                                   ▼
//                       carried out (applyAnswer): cleaned, ids given, what failed listed
//                                   │ an artboard made or rewritten?
//                                   ▼
//                       one look at the rendered pictures ──► precise edits to those artboards only, or "ok"
//                                   ▼
//                       a version, and a turn that says what really changed
//
// The transport is the browser's route call (components/ux-v0/design/useDesigner.ts) or the benchmark's; the bench
// is whatever can draw an artboard as a picture and say what it measured. No loop: at most one look per request.

import { applyAnswer, changedSentence, type Applied } from './apply';
import { artboardOf, commit, newId, type DesignDoc, type DesignState, type DesignTurn } from './doc';
import type { Parse } from './elements';
import { parseAnswer, type Answer } from './protocol';

export interface WriteBody {
  mode: 'write' | 'look';
  words: string;
  doc: DesignDoc;
  kind: string;
  format: string;
  memory: DesignState['memory'];
  turns: DesignTurn[];
  comments: DesignState['comments'];
  assets: { id: string; name: string; width: number; height: number }[];
  selection?: DesignTurn['selection'];
  answering?: { text: string; options: string[] } | null;
  system?: { name: string; rules: string[] } | null;
  measured?: Record<string, string[]>;
  /** look: the artboards looked at, their pictures in the same order, and what was done */
  artboards?: string[];
  pictures?: string[];
  made?: string;
  picture?: string | null;
}

export type Sent = { ok: true; text: string; model: string | null; usage: Record<string, unknown> | null } | { ok: false; error: string; cancelled?: boolean; signIn?: boolean; limit?: boolean };

export interface Transport {
  send(body: WriteBody, onText: (delta: string, reset?: boolean) => void, signal?: AbortSignal): Promise<Sent>;
}

export interface Bench {
  /** the artboard as a picture (a data URL), or null */
  picture(a: DesignDoc['artboards'][number], tokens: string): Promise<string | null>;
  /** what was measured on these artboards as drawn (cut text, things outside), said */
  measure(doc: DesignDoc, ids: string[]): Promise<Record<string, string[]>>;
}

export interface Request {
  words: string;
  selection?: DesignTurn['selection'];
  answering?: { text: string; options: string[] } | null;
  system?: { name: string; rules: string[] } | null;
  /** send a picture of the selected artboard with the request (a change of look) */
  withPicture?: boolean;
  /** no look after (variations made in bulk, the benchmark's control) */
  noLook?: boolean;
}

export type Outcome =
  | { kind: 'done'; state: DesignState; turn: DesignTurn; applied: Applied; looked: Looked | null; usage: Record<string, unknown>[] }
  | { kind: 'question'; state: DesignState; turn: DesignTurn; question: { text: string; options: string[] }; usage: Record<string, unknown>[] }
  | { kind: 'failed'; error: string; cancelled?: boolean; signIn?: boolean; limit?: boolean };

export interface Looked {
  ok: boolean;
  said: string;
  /** edits the look made, carried out */
  fixed: number;
  /** edits it made to artboards it was not shown, set aside */
  held: number;
  failed: string[];
}

const now = () => Date.now();

function bodyOf(s: DesignState, r: Request, extra: Partial<WriteBody> = {}): WriteBody {
  return {
    mode: 'write',
    words: r.words,
    doc: s.doc,
    kind: s.kind,
    format: s.format,
    memory: s.memory,
    turns: s.turns.slice(-12),
    comments: s.comments.filter((c) => !c.resolved).slice(-20),
    assets: s.assets.map((a) => ({ id: a.id, name: a.name, width: a.width, height: a.height })),
    selection: r.selection ?? null,
    answering: r.answering ?? null,
    system: r.system ?? null,
    ...extra,
  };
}

/** A request in words, carried out (see the head of this file). */
export async function runRequest(
  s0: DesignState,
  r: Request,
  t: Transport,
  b: Bench,
  o: { parse: Parse; onDraft?: (doc: DesignDoc, answer: Answer) => void; onPhase?: (p: 'writing' | 'looking' | 'fixing') => void; signal?: AbortSignal; now?: number }
): Promise<Outcome> {
  const at = o.now ?? now();
  const person: DesignTurn = { id: newId('t'), role: 'person', text: r.words, at, ...(r.selection ? { selection: r.selection } : {}) };
  // measured facts and a picture of the selected artboard travel with a request about it
  const sel = artboardOf(s0.doc, r.selection?.artboard);
  const measured = sel ? await b.measure(s0.doc, [sel.id]).catch(() => ({})) : {};
  const picture = sel && r.withPicture ? await b.picture(sel, s0.doc.tokens).catch(() => null) : null;
  let raw = '';
  let lastDraw = 0;
  // one id for each new artboard, from its first drawn line to the answer's end
  const names: Record<string, string> = {};
  const draw = () => {
    if (!o.onDraft) return;
    const ans = parseAnswer(raw);
    o.onDraft(applyAnswer(s0.doc, ans, { parse: o.parse, format: s0.format, partial: true, names }).doc, ans);
  };
  o.onPhase?.('writing');
  const sent = await t.send(
    bodyOf(s0, r, { measured, ...(picture ? { picture } : {}) }),
    (d, reset) => {
      raw = reset ? '' : raw + d;
      if (Date.now() - lastDraw > 350) {
        lastDraw = Date.now();
        draw();
      }
    },
    o.signal
  );
  if (!sent.ok) return { kind: 'failed', error: sent.error, cancelled: sent.cancelled, signIn: sent.signIn, limit: sent.limit };
  const usage: Record<string, unknown>[] = sent.usage ? [sent.usage] : [];
  const answer = parseAnswer(sent.text);
  const applied = applyAnswer(s0.doc, answer, { parse: o.parse, format: s0.format, names });
  const memory = applied.remember.length ? { ...s0.memory, decisions: [...new Set([...s0.memory.decisions, ...applied.remember])].slice(-30) } : s0.memory;

  // a question, and nothing made: asked as a question
  if (applied.question && !applied.touched.length && !applied.removed.length && !applied.tokensChanged) {
    const turn: DesignTurn = { id: newId('t'), role: 'designer', text: [answer.say, applied.question.text].filter(Boolean).join('\n\n'), at: at + 1, options: applied.question.options };
    return { kind: 'question', state: { ...s0, memory, turns: [...s0.turns, person, turn] }, turn, question: applied.question, usage };
  }

  let doc = applied.doc;
  let looked: Looked | null = null;
  // one look, at the artboards made or rewritten whole (an edit is small: it is not looked at)
  const rewritten = answer.blocks.filter((x) => x.kind === 'artboard').map((x) => applied.ids[(x as { id: string }).id] ?? (x as { id: string }).id);
  const lookAt = [...new Set(rewritten)].filter((id) => doc.artboards.some((a) => a.id === id)).slice(0, 3);
  if (lookAt.length && !r.noLook && !o.signal?.aborted) {
    o.onPhase?.('looking');
    const l = await lookOnce(doc, lookAt, r.words, changedSentence(applied, doc), { ...s0, memory }, t, b, o);
    if (l) {
      looked = l.looked;
      doc = l.doc;
      if (l.usage) usage.push(l.usage);
    }
  }

  const changed = changedSentence(applied, doc);
  const failed = [...applied.failed, ...(looked?.failed ?? [])];
  const said = applied.touched.length || applied.removed.length || applied.tokensChanged ? answer.say || changed : `${answer.say ? `${answer.say}\n\n` : ''}Nothing on the design changed.`;
  const s1 = applied.touched.length || applied.removed.length || applied.tokensChanged ? commit({ ...s0, memory }, doc, r.words, 'model', at + 2) : { ...s0, memory };
  const turn: DesignTurn = {
    id: newId('t'),
    role: 'designer',
    text: said,
    at: at + 2,
    ...(s1.at !== s0.at ? { version: s1.at } : {}),
    touched: [...new Set([...applied.touched, ...applied.made])],
    ...(failed.length ? { failed } : {}),
  };
  return { kind: 'done', state: { ...s1, turns: [...s1.turns, person, turn] }, turn, applied, looked, usage };
}

async function lookOnce(
  doc: DesignDoc,
  ids: string[],
  words: string,
  made: string,
  s: DesignState,
  t: Transport,
  b: Bench,
  o: { parse: Parse; signal?: AbortSignal; onPhase?: (p: 'writing' | 'looking' | 'fixing') => void }
): Promise<{ looked: Looked; doc: DesignDoc; usage: Record<string, unknown> | null } | null> {
  const boards = ids.map((id) => doc.artboards.find((a) => a.id === id)!).filter(Boolean);
  const pictures: string[] = [];
  for (const a of boards) {
    const p = await b.picture(a, doc.tokens).catch(() => null);
    if (!p) return null;
    pictures.push(p);
  }
  const measured = await b.measure(doc, ids).catch(() => ({}));
  const sent = await t.send(bodyOf({ ...s, doc }, { words }, { mode: 'look', artboards: ids, pictures, made, measured }), () => {}, o.signal);
  if (!sent.ok) return null;
  const ans = parseAnswer(sent.text);
  // a look corrects what was just made: edits to the artboards it was shown, nothing else
  const kept = ans.blocks.filter((x) => x.kind === 'edit' && ids.includes(x.artboard));
  const held = ans.blocks.length - kept.length - ans.blocks.filter((x) => x.kind === 'remember').length;
  if (!kept.length) return { looked: { ok: ans.ok || !ans.blocks.length, said: ans.say, fixed: 0, held: Math.max(0, held), failed: [] }, doc, usage: sent.usage };
  o.onPhase?.('fixing');
  const fixed = applyAnswer(doc, { ...ans, blocks: kept }, { parse: o.parse, format: s.format });
  return { looked: { ok: false, said: ans.say, fixed: fixed.touched.length, held: Math.max(0, held), failed: fixed.failed }, doc: fixed.doc, usage: sent.usage };
}
