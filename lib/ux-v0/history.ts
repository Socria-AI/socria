// lib/ux-v0/history.ts — the versions of a design: what changed between two, restoring one, keeping one.
//
// Every change is a version (spec.ts applyPatch); the project keeps the last thirty. This says what changed between
// any two in the designer's words (by part and kind, from scope.ts changesBetween), restores an earlier one as a NEW
// version (nothing after it is lost: Undo takes the restore back), and keeps the versions the designer chose to keep
// when older ones are let go. Versions are stored whole: they are small (a design is tens of kilobytes) and a whole
// version can be opened, compared and exported on its own, which a chain of differences cannot.

import { AREA_LABEL, changesBetween, type Change } from './scope';
import { kindDef, type DesignSpec } from './spec';

export const MAX_VERSIONS = 30;

/** The versions kept: every version the designer kept, and the newest of the rest, up to `max` in all. */
export function capVersions(specs: readonly DesignSpec[], kept: readonly number[] = [], max = MAX_VERSIONS): DesignSpec[] {
  if (specs.length <= max) return [...specs];
  const keep = new Set(kept);
  const pinned = specs.filter((s) => keep.has(s.version));
  const room = Math.max(1, max - pinned.length);
  const latest = specs.filter((s) => !keep.has(s.version)).slice(-room);
  const chosen = new Set([...pinned, ...latest]);
  return specs.filter((s) => chosen.has(s));
}

/** What changed from one version to another, said by part and kind ("the colours across the page", "the words in “Method”"). */
export function describeChanges(from: DesignSpec, to: DesignSpec): string[] {
  const changes = changesBetween(from, to);
  const name = (id?: string) => {
    const s = id ? to.sections.find((x) => x.id === id) ?? from.sections.find((x) => x.id === id) : null;
    if (!s) return '';
    const title = typeof s.content.title === 'string' ? (s.content.title as string).replace(/\*/g, '').slice(0, 32) : '';
    return title ? `“${title}”` : `the ${(kindDef(s.kind)?.label ?? s.kind).toLowerCase()}`;
  };
  const out: string[] = [];
  const seen = new Set<string>();
  const say = (c: Change): string => {
    if (c.key === 'added') return `added ${name(c.section)}`;
    if (c.key === 'removed') return `removed ${name(c.section)}`;
    if (c.key === 'order') return 'the order of the parts';
    return `${AREA_LABEL[c.area]}${c.section ? ` in ${name(c.section)}` : ' across the page'}`;
  };
  for (const c of changes) {
    const line = say(c);
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/** An earlier version restored as a new one: the same design, a new number, said where it came from. */
export function restoredVersion(from: DesignSpec, nextVersion: number): DesignSpec {
  return { ...from, version: nextVersion, reason: `Restored version ${from.version}`, createdAt: Date.now() };
}
