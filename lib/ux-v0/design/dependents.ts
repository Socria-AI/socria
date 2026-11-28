// lib/ux-v0/design/dependents.ts — when words change in one place, where else the same words are.
//
// A campaign says one thing in many formats: the line on the poster is the line on the story and the banner. When
// the person changes it on one, the others now disagree — but they are not changed for them. The other artboards
// that carry exactly those words are found and named; the person chooses whether they follow. An artboard that is
// locked (an approved one) is never among those changed: it is named as staying as it is.
//
// Only words are matched, and only whole runs of them (one element's text): a colour or a layout is not "the same"
// across formats in any way code could know. What the shared styles hold already reaches every artboard that uses
// them, and is guarded where artboards are protected (locks.ts).

import type { DesignArtboard, DesignDoc } from './doc';
import { applyHandEdit, type Parse } from './elements';

export interface Dependent {
  artboard: string;
  name: string;
  /** the elements on it whose words are these */
  elements: string[];
  /** it is protected: it will not be changed */
  locked: boolean;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The deepest elements of an artboard whose whole text is these words. */
export function elementsSaying(a: Pick<DesignArtboard, 'html'>, words: string, parse: Parse): string[] {
  const want = norm(words);
  if (want.length < 2) return [];
  const d = parse(`<!doctype html><html><body><div>${a.html}</div></body></html>`);
  const out: string[] = [];
  for (const el of Array.from(d.body.querySelectorAll('[data-sx]'))) {
    if (el.closest('style, svg defs')) continue;
    if (norm(el.textContent ?? '') !== want) continue;
    // (the innermost element that says it: not the block around it)
    if (Array.from(el.querySelectorAll('[data-sx]')).some((c) => norm(c.textContent ?? '') === want)) continue;
    const id = el.getAttribute('data-sx');
    if (id) out.push(id);
  }
  return out;
}

/** The other artboards that carry exactly these words. */
export function carrying(doc: DesignDoc, words: string, except: string, parse: Parse): Dependent[] {
  const out: Dependent[] = [];
  for (const a of doc.artboards) {
    if (a.id === except) continue;
    const elements = elementsSaying(a, words, parse);
    if (!elements.length) continue;
    out.push({ artboard: a.id, name: a.name, elements, locked: !!a.locked || elements.some((id) => (a.locks ?? []).some((l) => l.id === id)) });
  }
  return out;
}

/** The same words changed on those artboards. Protected ones are left, and named. */
export function changeWords(doc: DesignDoc, deps: readonly Dependent[], to: string, parse: Parse): { doc: DesignDoc; changed: string[]; left: string[] } {
  const changed: string[] = [];
  const left: string[] = [];
  const artboards = doc.artboards.map((a) => {
    const d = deps.find((x) => x.artboard === a.id);
    if (!d) return a;
    if (d.locked || a.locked) {
      left.push(a.name);
      return a;
    }
    let html = a.html;
    for (const id of d.elements) html = applyHandEdit(html, { op: 'text', id, text: to }, parse) ?? html;
    if (html === a.html) return a;
    changed.push(a.name);
    return { ...a, html };
  });
  return { doc: { ...doc, artboards }, changed, left };
}
