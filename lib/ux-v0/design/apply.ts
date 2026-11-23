// lib/ux-v0/design/apply.ts — the model's answer carried out on the design, and what really changed.
//
// Each block of the answer (protocol.ts) is checked against the design as it is: an edit names an artboard that
// exists and finds its text exactly once; a new artboard gets a real id, a known format or a sane size, and a place
// on the canvas; a rewrite replaces only the artboard it names. Every artboard touched is cleaned and given element
// ids (elements.ts). What could not be done is listed, never dropped in silence; what is said to the person is built
// from what changed, so a turn that changed nothing says so.
//
// The same function draws an answer that is still being written (`partial`): finished edits apply, the artboard
// being written shows what it has so far, and nothing is cleaned or committed — the canvas just shows it growing.

import { artboardOf, newId, placeNew, MAX_ARTBOARDS, MAX_HTML, MAX_TOKENS_CSS, type DesignArtboard, type DesignDoc } from './doc';
import { prepareFragment, type Parse } from './elements';
import { formatOf, type Format } from './formats';
import type { Answer, ArtboardBlock } from './protocol';

export interface Applied {
  doc: DesignDoc;
  /** artboards whose HTML changed, or that were made */
  touched: string[];
  made: string[];
  removed: string[];
  tokensChanged: boolean;
  /** what could not be done, said */
  failed: string[];
  /** decisions to keep (<remember>) */
  remember: string[];
  question: { text: string; options: string[] } | null;
  /** the model's own temporary names (new-1) for the ids they became */
  ids: Record<string, string>;
}

export interface ApplyOptions {
  parse: Parse;
  /** the format a new artboard takes when the answer names none */
  format: string;
  /** an answer still being written: draw it, do not clean or commit it */
  partial?: boolean;
  /** the ids given to the model's own names (new-1, a group's name), kept across the drafts and the final answer so
   * an artboard keeps one id from its first line to its last */
  names?: Record<string, string>;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where `find` is in `html`: exactly, or with any run of whitespace standing for any other. */
export function locate(html: string, find: string): { start: number; end: number; count: number } | null {
  if (!find) return null;
  let count = 0;
  let first = -1;
  for (let i = html.indexOf(find); i >= 0; i = html.indexOf(find, i + 1)) {
    if (first < 0) first = i;
    if (++count > 1) break;
  }
  if (count) return { start: first, end: first + find.length, count };
  const trimmed = find.trim();
  if (!trimmed) return null;
  const re = new RegExp(trimmed.split(/\s+/).map(esc).join('\\s+'), 'g');
  const ms = [...html.matchAll(re)];
  if (!ms.length) return null;
  return { start: ms[0].index!, end: ms[0].index! + ms[0][0].length, count: ms.length };
}

function sizeFor(b: ArtboardBlock, fallback: Format): { format: string; width: number; height: number; medium: DesignArtboard['medium'] } {
  const f = formatOf(b.format);
  // a web page keeps its width and may be as tall as it is set
  if (f) return { format: f.id, width: f.width, height: f.medium === 'web' && b.height ? Math.min(20000, Math.max(200, b.height)) : f.height, medium: f.medium };
  if (b.width && b.height) return { format: 'custom', width: Math.min(8000, Math.max(16, b.width)), height: Math.min(20000, Math.max(16, b.height)), medium: 'screen' };
  return { format: fallback.id, width: fallback.width, height: fallback.height, medium: fallback.medium };
}

const short = (s: string) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 60)}…` : t;
};

/** The answer carried out (see the head of this file). */
export function applyAnswer(doc0: DesignDoc, answer: Answer, o: ApplyOptions): Applied {
  const fallback = formatOf(o.format) ?? formatOf('instagram-portrait')!;
  let artboards = doc0.artboards.map((a) => ({ ...a }));
  let tokens = doc0.tokens;
  const failed: string[] = [];
  const remember: string[] = [];
  const ids: Record<string, string> = {};
  const names = o.names ?? {};
  const made: string[] = [];
  const removed: string[] = [];
  let question: Applied['question'] = null;
  const real = (id: string) => ids[id] ?? id;
  const byId = (id: string) => artboards.find((a) => a.id === real(id)) ?? null;
  const groups: Record<string, string> = {};

  for (const b of answer.blocks) {
    switch (b.kind) {
      case 'artboard': {
        const html = b.html.slice(0, MAX_HTML);
        const existing = byId(b.id);
        if (existing) {
          existing.html = html;
          if (b.name) existing.name = b.name.slice(0, 80);
          const f = formatOf(b.format);
          if (f && f.id !== existing.format) Object.assign(existing, { format: f.id, width: f.width, height: f.height, medium: f.medium });
          else if (existing.medium === 'web' && b.height) existing.height = Math.min(20000, Math.max(200, b.height));
          break;
        }
        if (artboards.length >= MAX_ARTBOARDS) {
          failed.push(`No more artboards could be made (the limit is ${MAX_ARTBOARDS}).`);
          break;
        }
        const size = sizeFor(b, fallback);
        const beside = b.beside ? byId(b.beside) : null;
        const group = b.group ? (groups[b.group] ??= names[`group:${b.group}`] ??= `g${newId('').slice(-6)}`) : beside?.group ?? undefined;
        // the first of a group sits after everything; the rest beside the one before them
        const prevInGroup = group ? [...artboards].reverse().find((a) => a.group === group) ?? null : null;
        const at = placeNew({ artboards, tokens }, size.width, size.height, prevInGroup ?? beside);
        const id = (names[`ab:${b.id}`] ??= newId('ab'));
        ids[b.id] = id;
        artboards.push({ id, name: (b.name || formatOf(size.format)?.label || 'Artboard').slice(0, 80), ...size, html, ...(group ? { group } : {}), x: at.x, y: at.y });
        made.push(id);
        break;
      }
      case 'edit': {
        // (of an edit still being written, the finished pairs apply; the one being written waits)
        const a = byId(b.artboard);
        if (!a) {
          if (!o.partial) failed.push(`An edit named an artboard that is not there (${b.artboard}).`);
          break;
        }
        for (const p of b.pairs) {
          const at = locate(a.html, p.find);
          if (!at) {
            if (!o.partial) failed.push(`On “${a.name}”, this could not be found to change: “${short(p.find)}”.`);
            continue;
          }
          if (at.count > 1) {
            if (!o.partial) failed.push(`On “${a.name}”, “${short(p.find)}” is there more than once, so it was not changed.`);
            continue;
          }
          a.html = (a.html.slice(0, at.start) + p.replace + a.html.slice(at.end)).slice(0, MAX_HTML);
        }
        if (!b.pairs.length && !b.open && !o.partial) failed.push(`An edit to “${a.name}” said nothing to change.`);
        break;
      }
      case 'remove': {
        const a = byId(b.artboard);
        if (!a) {
          if (!o.partial) failed.push(`An artboard to remove is not there (${b.artboard}).`);
          break;
        }
        artboards = artboards.filter((x) => x !== a);
        removed.push(a.id);
        break;
      }
      case 'tokens':
        tokens = b.css.slice(0, MAX_TOKENS_CSS);
        break;
      case 'remember':
        remember.push(b.text);
        break;
      case 'question':
        question = { text: b.text, options: b.options };
        break;
    }
  }

  // cleaned and given ids, only when the answer is complete
  const before = new Map(doc0.artboards.map((a) => [a.id, a.html]));
  if (!o.partial) {
    for (const a of artboards) {
      if (before.get(a.id) === a.html) continue;
      a.html = prepareFragment(a.html, o.parse);
    }
    if (tokens !== doc0.tokens) tokens = tokens.replace(/@import[^;]*;?/gi, '').replace(/javascript:/gi, '').replace(/<\/?style[^>]*>/gi, '');
  }
  const touched = artboards.filter((a) => before.get(a.id) !== a.html).map((a) => a.id);
  return { doc: { artboards, tokens }, touched, made, removed, tokensChanged: tokens !== doc0.tokens, failed, remember, question, ids };
}

/** What changed, in a sentence, from what really changed (never from what was meant to). */
export function changedSentence(a: Applied, doc: DesignDoc): string {
  const name = (id: string) => artboardOf(doc, id)?.name ?? 'an artboard';
  const parts: string[] = [];
  if (a.made.length) parts.push(a.made.length === 1 ? `made “${name(a.made[0])}”` : `made ${a.made.length} artboards`);
  const changed = a.touched.filter((id) => !a.made.includes(id));
  if (changed.length) parts.push(changed.length === 1 ? `changed “${name(changed[0])}”` : `changed ${changed.length} artboards`);
  if (a.removed.length) parts.push(`removed ${a.removed.length === 1 ? 'an artboard' : `${a.removed.length} artboards`}`);
  if (a.tokensChanged) parts.push('changed the shared styles');
  if (!parts.length) return 'Nothing on the design changed.';
  const s = parts.join(', ');
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}
