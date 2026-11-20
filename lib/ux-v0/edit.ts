// lib/ux-v0/edit.ts — changing one section directly, in code, and keeping what the designer locked.
//
// DIRECT EDITS. With a part of a generated design selected, the designer can
// change it themselves, without a model: its words (the exact field the
// selected element was drawn from, held to that field's limit), its layout
// (the kind's own variants), its ground, its spacing, its place on the page,
// or remove it. Each is an ordinary patch (lib/ux-v0/spec.ts applyPatch): a
// new version, which Undo takes back, checked again at desktop and phone.
//
// LOCKS. A section the designer locks is kept exactly as it is:
//   - a model's change to it is asked about first (lockedTouched; the refine
//     route turns it into a question, as it does for the art direction's locks);
//   - a new generation carries it over unchanged (holdLocked);
//   - the automatic repairs after a generation leave it alone (fixesFor);
//   - the designer's own controls for it are off until they unlock it.
// Only the designer sets or clears a lock (setLocked): it is not a patch a
// model can write, so no answer from a model can unlock anything.
//
// HELD COMPOSITIONS. A composed part whose composition the designer approved
// (setHeld; lib/ux-v0/composer.ts) keeps where things stand: its words, its
// pictures, its ground and its per-width rules can change, but a change to its
// arrangement is asked about first (heldTouched), a new generation carries it
// over (holdLocked) and the strategy and the repairs leave it alone.

import { kindDef, type DesignSpec, type Patch, type Section } from './spec';
import { composeSignature, normalizeCompose, treeTextAt, type Piece } from './compose';

const isIndex = (x: string) => /^\d{1,3}$/.test(x);

/** The text at a path in a section's content ("title", "items.1.title", "details.0"), with its limit; null when it is not editable text. */
export function textAt(sec: Section, path: string): { value: string; max: number } | null {
  const def = kindDef(sec.kind);
  if (!def) return null;
  const parts = String(path ?? '').split('.').filter(Boolean);
  let fields: Record<string, any> = def.fields;
  let value: any = sec.content;
  for (let i = 0; i < parts.length; i++) {
    const f = fields[parts[i]];
    if (!f || value == null || typeof value !== 'object') return null;
    value = value[parts[i]];
    if (f.t === 'text') return i === parts.length - 1 && typeof value === 'string' ? { value, max: f.max } : null;
    if (f.t === 'texts') {
      const j = parts[i + 1];
      return i + 2 === parts.length && isIndex(j) && Array.isArray(value) && typeof value[+j] === 'string' ? { value: value[+j], max: f.max } : null;
    }
    if (f.t === 'list') {
      const j = parts[i + 1];
      if (!isIndex(j) || !Array.isArray(value) || !value[+j] || typeof value[+j] !== 'object') return null;
      value = value[+j];
      fields = f.item;
      i++;
      continue;
    }
    // a composed section's words, wherever they sit in its tree of pieces (lib/ux-v0/compose.ts)
    if (f.t === 'tree') return treeTextAt(value, parts.slice(i + 1));
    return null;
  }
  return null;
}

/** What a field is called, for a person: "title", "item 2 title", "detail 1". */
export function fieldLabel(path: string): string {
  return String(path ?? '')
    .split('.')
    .map((p) => (isIndex(p) ? String(+p + 1) : p.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()))
    .join(' ');
}

/** A patch that puts these words in that field, and nothing else; null when nothing would change or it is not text. */
export function textPatch(sec: Section, path: string, text: string): Patch | null {
  const at = textAt(sec, path);
  if (!at) return null;
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, at.max);
  if (clean === at.value) return null;
  const parts = path.split('.').filter(Boolean);
  const top = parts[0];
  const summary = `New words for the ${fieldLabel(path)}`;
  if (parts.length === 1) return { op: 'content', sectionId: sec.id, content: { [top]: clean }, summary };
  const copy = JSON.parse(JSON.stringify(sec.content[top]));
  let node: any = copy;
  for (let i = 1; i < parts.length - 1; i++) node = node[isIndex(parts[i]) ? +parts[i] : parts[i]];
  const last = parts[parts.length - 1];
  node[isIndex(last) ? +last : last] = clean;
  return { op: 'content', sectionId: sec.id, content: { [top]: copy }, summary };
}

/** The spec with one section locked or unlocked. A locked section is also fixed: the layout planner leaves it alone. */
export function setLocked(spec: DesignSpec, sectionId: string, locked: boolean): DesignSpec | null {
  if (!spec.sections.some((s) => s.id === sectionId)) return null;
  return {
    ...spec,
    sections: spec.sections.map((s) => {
      if (s.id !== sectionId) return s;
      if (locked) return { ...s, locked: true, fixed: true };
      const { locked: _gone, ...rest } = s;
      return rest;
    }),
  };
}

/** Hold, or release, the composition of a composed part. */
export function setHeld(spec: DesignSpec, sectionId: string, held: boolean): DesignSpec | null {
  const sec = spec.sections.find((s) => s.id === sectionId);
  if (!sec || (held && sec.kind !== 'compose')) return null;
  return {
    ...spec,
    sections: spec.sections.map((s) => {
      if (s.id !== sectionId) return s;
      if (held) return { ...s, held: true, fixed: true };
      const { held: _gone, ...rest } = s;
      return rest;
    }),
  };
}

/**
 * The held compositions a patch would change: replacing or removing the part, another variant, or a tree that places
 * things otherwise (words changed in place keep the arrangement, and pass).
 */
export function heldTouched(spec: DesignSpec, patch: Patch): string[] {
  if (!patch.sectionId) return [];
  const sec = spec.sections.find((s) => s.id === patch.sectionId);
  if (!sec?.held) return [];
  if (['variant', 'shape', 'story', 'replace', 'remove'].includes(patch.op)) return [sec.id];
  if (patch.op === 'content' && patch.content && 'root' in patch.content) {
    const next = normalizeCompose(patch.content.root);
    if (!next || composeSignature(next) !== composeSignature(sec.content.root as Piece)) return [sec.id];
  }
  return [];
}

/** The locked sections a patch would change: asked about before it is applied. */
export function lockedTouched(spec: DesignSpec, patch: Patch): string[] {
  if (!patch.sectionId || !['content', 'variant', 'tone', 'shape', 'responsive', 'story', 'images', 'replace', 'remove', 'move'].includes(patch.op)) return [];
  const sec = spec.sections.find((s) => s.id === patch.sectionId);
  return sec?.locked ? [sec.id] : [];
}

/**
 * A newly generated design with the previous version's locked sections carried over unchanged: in place of a
 * section of the same id (or, failing that, the same kind), else where it stood. Each is said in the notes.
 */
export function holdLocked(nextIn: DesignSpec, previous: DesignSpec | null | undefined): { spec: DesignSpec; kept: string[] } {
  // the site's settings are the designer's (its address, where its forms send, where its buttons go): a new
  // generation never loses them
  const next: DesignSpec = previous?.site && !nextIn.site ? { ...nextIn, site: previous.site } : nextIn;
  const locked = (previous?.sections ?? []).filter((s) => s.locked || s.held);
  if (!locked.length) return { spec: next, kept: [] };
  let sections = [...next.sections];
  const used = new Set<string>();
  const kept: string[] = [];
  for (const L of locked) {
    const def = kindDef(L.kind);
    if (!def || !def.pages.includes(next.pageType)) continue;
    let at = sections.findIndex((s) => s.id === L.id && s.kind === L.kind && !used.has(s.id));
    if (at < 0) at = sections.findIndex((s) => s.kind === L.kind && !used.has(s.id));
    // its own id, unless another section of the new design already has it
    const clash = sections.some((s, i) => i !== at && s.id === L.id);
    const keep: Section = clash ? { ...L, id: `${L.id}-kept` } : L;
    if (at >= 0) sections[at] = keep;
    else {
      const was = previous!.sections.findIndex((s) => s.id === L.id);
      sections.splice(Math.min(Math.max(0, was), sections.length), 0, keep);
    }
    used.add(keep.id);
    kept.push(L.locked ? `Kept the locked ${def.label.toLowerCase()} exactly as it was.` : 'Kept the composition you approved exactly as it was.');
  }
  // nothing else may share a kept section's id
  const seen = new Set<string>();
  sections = sections.map((s) => {
    if (!seen.has(s.id)) return seen.add(s.id), s;
    let n = 2;
    while (seen.has(`${s.id}-${n}`)) n++;
    const id = `${s.id}-${n}`;
    seen.add(id);
    return { ...s, id };
  });
  return { spec: { ...next, sections, notes: [...next.notes, ...kept].slice(-8) }, kept };
}
