// lib/ux-v0/design/history.ts — the earlier versions a request points at, and what differs between two versions.
//
// "Take the background from the first version and the typography from the third", "go back to the colours from
// before", "the approved one was better": the designer can only do these exactly if it is shown the versions named.
// versionsNamed reads which ones the words point at; earlierFor gathers them (the artboards in question, as they were)
// for the request. Versions are numbered as the History shows them: version 1 is the first.
//
// compareVersions says, artboard by artboard, what differs between two versions — for the person choosing between
// them, with no model involved.

import type { DesignArtboard, DesignState } from './doc';
import { parentOf } from './doc';

const ORDINALS: Record<string, number> = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4, sixth: 5, seventh: 6, eighth: 7, ninth: 8, tenth: 9 };

/** The versions (indexes) the words point at, never the one shown, at most three. */
export function versionsNamed(words: string, s: Pick<DesignState, 'versions' | 'at'>): number[] {
  const w = String(words ?? '').toLowerCase();
  const out: number[] = [];
  const add = (i: number) => {
    if (Number.isInteger(i) && i >= 0 && i < s.versions.length && i !== s.at && !out.includes(i)) out.push(i);
  };
  for (const m of w.matchAll(/\b(?:version|v)\s*#?\s*(\d{1,2})\b/g)) add(Number(m[1]) - 1);
  for (const m of w.matchAll(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:version|draft|iteration|pass|round|attempt)\b/g)) add(ORDINALS[m[1]]);
  if (/\b(original|initial|very first|at the start|to begin with|where we started)\b/.test(w)) add(s.versions.findIndex((v) => v.doc.artboards.length > 0));
  if (/\b(approved)\b/.test(w)) {
    for (let i = s.versions.length - 1; i >= 0; i--) {
      if (s.versions[i].kept) {
        add(i);
        break;
      }
    }
  }
  if (/\b(before|previous(?:ly)?|earlier|go(?:ing)? back|went back|back to|undo|revert|restore|bring back|used to|had before|last version|prior|as it was)\b/.test(w)) {
    const p = parentOf(s, s.at);
    add(p);
    if (p >= 0) add(parentOf(s, p));
  }
  return out.slice(0, 3);
}

export interface EarlierVersion {
  /** as the History numbers it (1 is the first) */
  n: number;
  said: string;
  by: 'model' | 'person';
  kept: string | null;
  /** the shared styles then, when they differ from now */
  tokens: string | null;
  artboards: { id: string; name: string; html: string }[];
}

/** The versions named, with the artboards in question as they were (those in focus, else the first two). */
export function earlierFor(s: Pick<DesignState, 'versions' | 'at' | 'doc'>, words: string, focus: readonly string[], budgetChars = 70_000): EarlierVersion[] {
  const out: EarlierVersion[] = [];
  let used = 0;
  for (const i of versionsNamed(words, s)) {
    const v = s.versions[i];
    const pick = (focus.length ? v.doc.artboards.filter((a) => focus.includes(a.id)) : v.doc.artboards).slice(0, 2);
    const artboards: EarlierVersion['artboards'] = [];
    for (const a of pick.length ? pick : v.doc.artboards.slice(0, 1)) {
      if (used + a.html.length > budgetChars && artboards.length + out.length > 0) continue;
      used += a.html.length;
      artboards.push({ id: a.id, name: a.name, html: a.html });
    }
    if (!artboards.length) continue;
    out.push({ n: i + 1, said: v.said, by: v.by, kept: v.kept ?? null, tokens: v.doc.tokens !== s.doc.tokens ? v.doc.tokens.slice(0, 20_000) : null, artboards });
  }
  return out;
}

export interface VersionDiff {
  artboard: string;
  name: string;
  change: 'added' | 'removed' | 'changed' | 'same';
  /** how many elements (by their ids) are only in one, or differ */
  elements?: { added: number; removed: number; changed: number; same: number };
}

const elementsOf = (html: string) => new Map([...html.matchAll(/<([a-z0-9]+)\b[^>]*\bdata-sx="(e\d+)"[^>]*>/gi)].map((m) => [m[2], m[0]]));

/** What differs between two versions, artboard by artboard (b against a). */
export function compareVersions(a: { artboards: DesignArtboard[]; tokens: string }, b: { artboards: DesignArtboard[]; tokens: string }): { artboards: VersionDiff[]; tokensChanged: boolean } {
  const out: VersionDiff[] = [];
  const inA = new Map(a.artboards.map((x) => [x.id, x]));
  for (const y of b.artboards) {
    const x = inA.get(y.id);
    if (!x) {
      out.push({ artboard: y.id, name: y.name, change: 'added' });
      continue;
    }
    if (x.html === y.html) {
      out.push({ artboard: y.id, name: y.name, change: 'same' });
      continue;
    }
    const ex = elementsOf(x.html);
    const ey = elementsOf(y.html);
    let added = 0;
    let changed = 0;
    let same = 0;
    for (const [k, v] of ey) {
      if (!ex.has(k)) added++;
      else if (ex.get(k) === v) same++;
      else changed++;
    }
    const removed = [...ex.keys()].filter((k) => !ey.has(k)).length;
    out.push({ artboard: y.id, name: y.name, change: 'changed', elements: { added, removed, changed, same } });
  }
  for (const x of a.artboards) if (!b.artboards.some((y) => y.id === x.id)) out.push({ artboard: x.id, name: x.name, change: 'removed' });
  return { artboards: out, tokensChanged: a.tokens !== b.tokens };
}
