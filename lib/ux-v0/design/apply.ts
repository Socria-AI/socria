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
//
// What the person has protected is enforced here, not hoped for (locks.ts): an edit that would change a locked element
// — its markup or any style that reaches it — is refused pair by pair; a locked artboard is not rewritten, changed or
// removed; shared tokens that would change something locked are kept as they were. Every refusal is said.

import { artboardOf, newId, placeNew, MAX_ARTBOARDS, MAX_HTML, MAX_TOKENS_CSS, type DesignArtboard, type DesignDoc } from './doc';
import { prepareFragment, type Parse } from './elements';
import { formatOf, type Format } from './formats';
import { checkLocks, sharedPrint } from './locks';
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
  /** elements the designer locked because the person said to keep them (already on the artboards) */
  locked: { artboard: string; element: string; what: string }[];
  /** typography or colour to keep from an artboard (<keep>): the project's pins are set from them by the caller */
  keep: { what: 'faces' | 'colours'; artboard: string }[];
  /** what the person authorized beyond the brand, for this project (<allow>) */
  allow: { what: 'faces' | 'colours'; value: string }[];
  /** what a review found (<finding>), on artboards that exist */
  findings: { type: string; artboard: string; element: string | null; text: string; fix: string }[];
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

const listed = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

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
  const lockAsked: { artboard: string; element: string; what: string }[] = [];
  const keep: Applied['keep'] = [];
  const allow: Applied['allow'] = [];
  const findings: Applied['findings'] = [];
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
          const was0 = doc0.artboards.find((x) => x.id === existing.id);
          if (!o.partial && was0?.locked) {
            failed.push(`“${existing.name}” is locked${was0.state === 'approved' ? ' (approved)' : ''}, so it was not rewritten — unlock it first, or ask for a new artboard.`);
            break;
          }
          if (!o.partial && was0?.locks?.length) {
            const c = checkLocks(was0, prepareFragment(html, o.parse), doc0.tokens, doc0.tokens, o.parse);
            if (!c.ok) {
              failed.push(`“${existing.name}” was not rewritten: the new version changed ${listed(c.broken)}, which ${c.broken.length > 1 ? 'are' : 'is'} locked.`);
              break;
            }
          }
          existing.html = html;
          if (b.name) existing.name = b.name.slice(0, 80);
          if (b.seconds) existing.seconds = b.seconds;
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
        artboards.push({ id, name: (b.name || formatOf(size.format)?.label || 'Artboard').slice(0, 80), ...size, html, ...(group ? { group } : {}), x: at.x, y: at.y, ...(b.seconds ? { seconds: b.seconds } : {}) });
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
        const was0 = doc0.artboards.find((x) => x.id === a.id);
        if (!o.partial && was0?.locked) {
          failed.push(`“${a.name}” is locked${was0.state === 'approved' ? ' (approved)' : ''}, so nothing on it was changed — unlock it first, or ask for a new artboard.`);
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
          const next = (a.html.slice(0, at.start) + p.replace + a.html.slice(at.end)).slice(0, MAX_HTML);
          if (!o.partial && was0?.locks?.length) {
            const c = checkLocks(was0, prepareFragment(next, o.parse), doc0.tokens, doc0.tokens, o.parse);
            if (!c.ok) {
              failed.push(`On “${a.name}”, a change would have altered ${listed(c.broken)}, which ${c.broken.length > 1 ? 'are' : 'is'} locked, so it was not made.`);
              continue;
            }
          }
          a.html = next;
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
        const was0 = doc0.artboards.find((x) => x.id === a.id);
        if (was0?.locked || was0?.locks?.length) {
          if (!o.partial) failed.push(`“${a.name}” ${was0.locked ? 'is locked' : 'holds locked elements'}, so it was not removed.`);
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
      case 'lock':
        lockAsked.push({ artboard: b.artboard, element: b.element, what: b.what });
        break;
      case 'allow':
        if (allow.length < 8) allow.push({ what: b.what, value: b.value });
        break;
      case 'keep':
        keep.push({ what: b.what, artboard: b.artboard });
        break;
      case 'finding': {
        const a = byId(b.artboard) ?? (artboards.length === 1 ? artboards[0] : null);
        if (a) findings.push({ type: b.type, artboard: a.id, element: b.element && a.html.includes(`data-sx="${b.element}"`) ? b.element : null, text: b.text, fix: b.fix });
        break;
      }
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
    // shared styles that would change something locked are kept as they were
    if (tokens !== doc0.tokens) {
      const hit: string[] = [];
      for (const was of doc0.artboards) {
        const nowA = artboards.find((x) => x.id === was.id);
        if (!nowA) continue;
        if (was.locked) {
          if (sharedPrint(nowA.html, doc0.tokens, o.parse) !== sharedPrint(nowA.html, tokens, o.parse)) hit.push(`“${was.name}”`);
        } else if (was.locks?.length) {
          const c = checkLocks({ html: nowA.html, locks: was.locks }, nowA.html, doc0.tokens, tokens, o.parse);
          if (!c.ok) hit.push(...c.broken);
        }
      }
      if (hit.length) {
        const names = [...new Set(hit)];
        tokens = doc0.tokens;
        failed.push(`The shared styles were not changed: the new ones would have changed ${listed(names)}, which ${names.length > 1 ? 'are' : 'is'} locked. Change those values on the other artboards instead, or unlock ${names.length > 1 ? 'them' : 'it'}.`);
      }
    }
  }
  const touched = artboards.filter((a) => before.get(a.id) !== a.html).map((a) => a.id);
  // locks the designer recorded for the person: on elements that are really there, once each (a lock is never
  // taken off here — only the person unlocks)
  const locked: Applied['locked'] = [];
  if (!o.partial) {
    for (const l of lockAsked) {
      const a = byId(l.artboard);
      if (!a || !a.html.includes(`data-sx="${l.element}"`)) {
        failed.push(`A lock named something that is not there (${l.what}).`);
        continue;
      }
      if ((a.locks ?? []).some((x) => x.id === l.element)) continue;
      a.locks = [...(a.locks ?? []), { id: l.element, what: l.what, at: Date.now() }];
      locked.push({ artboard: a.id, element: l.element, what: l.what });
    }
  }
  return { doc: { artboards, tokens }, touched, made, removed, tokensChanged: tokens !== doc0.tokens, failed, remember, question, ids, locked, keep: keep.map((k) => ({ ...k, artboard: real(k.artboard) })), allow, findings };
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
  if (a.locked.length) parts.push(`locked ${listed(a.locked.map((l) => l.what))}`);
  if (!parts.length) return 'Nothing on the design changed.';
  const s = parts.join(', ');
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}
