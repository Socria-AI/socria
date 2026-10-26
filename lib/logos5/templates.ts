// lib/logos5/templates.ts — THE PERSON'S OWN TEMPLATES.
//
// "The user can make their own artifact and save the template." A custom
// artifact (lib/objects/display-custom.ts) — a habit tracker, a recipe scaler,
// whatever they asked for — can be kept as a template: its blocks, their kinds,
// labels and formulas, under a name. It is then a choice in Make beside the
// built-in ones; picked, the request says so in words ("Make a custom artifact
// from my template “Habit tracker”: …") and the template travels with the
// message, so the proposal pass builds the same shape again for what is asked
// now (app/api/logos/map, THEIR TEMPLATE).
//
// Kept on this device (there is no per-person settings store to keep them in
// yet), for the most recent 24, and read back through the custom kind's own
// sanitizer — a template that would not make a custom artifact is not kept.
//
// PURE (storage is passed in).

import { sanitizeCustom, type Block } from '../objects/display-custom';
import { cleanText } from '../objects/display-base';
import type { MakeChoice } from './make';

export interface ArtifactTemplate {
  id: string;
  name: string;
  about: string;
  blocks: Block[];
  savedAt: number;
}

const KEY = 'socria.logos5.templates.v1';
export const MAX_TEMPLATES = 24;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** One template as stored, or null: a name, and blocks the custom kind keeps. */
function readOne(raw: unknown): ArtifactTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && /^t[\w-]{1,40}$/.test(r.id) ? r.id : null;
  const name = cleanText(r.name, 60);
  if (!id || !name) return null;
  const made = sanitizeCustom({ title: name, blocks: r.blocks });
  if (!made) return null;
  const at = Number(r.savedAt);
  return { id, name, about: cleanText(r.about, 200), blocks: made.blocks, savedAt: Number.isFinite(at) ? at : 0 };
}

/** The templates kept on this device, the newest first. */
export function readTemplates(storage: StorageLike | null | undefined): ArtifactTemplate[] {
  try {
    const all = JSON.parse(storage?.getItem(KEY) ?? '[]');
    return (Array.isArray(all) ? all : [])
      .map(readOne)
      .filter((t): t is ArtifactTemplate => !!t)
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, MAX_TEMPLATES);
  } catch {
    return [];
  }
}

function write(storage: StorageLike | null | undefined, list: ArtifactTemplate[]): ArtifactTemplate[] {
  const kept = list.slice(0, MAX_TEMPLATES);
  try {
    storage?.setItem(KEY, JSON.stringify(kept));
  } catch {
    /* kept for this visit only */
  }
  for (const f of listeners) f();
  return kept;
}

/** A name to file a template under: its own, made short and plain. */
const keyOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * An artifact kept as a template, under its name — one already kept under the
 * same name is replaced (saved again, it is the newer). What it holds now is
 * kept with it as the example to fill again.
 */
export function saveTemplate(
  storage: StorageLike | null | undefined,
  artifact: { title: string; about?: string; blocks: readonly Block[] },
  now: number,
  name?: string,
): { saved: ArtifactTemplate; all: ArtifactTemplate[] } | null {
  const n = cleanText(name ?? artifact.title, 60);
  const made = n ? sanitizeCustom({ title: n, blocks: artifact.blocks }) : null;
  if (!n || !made) return null;
  const was = readTemplates(storage);
  const same = was.find((t) => keyOf(t.name) === keyOf(n));
  const saved: ArtifactTemplate = { id: same?.id ?? `t${now.toString(36)}`, name: n, about: cleanText(artifact.about, 200), blocks: made.blocks, savedAt: now };
  return { saved, all: write(storage, [saved, ...was.filter((t) => t.id !== saved.id)]) };
}

export function removeTemplate(storage: StorageLike | null | undefined, id: string): ArtifactTemplate[] {
  return write(storage, readTemplates(storage).filter((t) => t.id !== id));
}

/** The template a Make choice names, by its id ("tpl:<id>"). */
export function templateOf(id: string | null | undefined, templates: readonly ArtifactTemplate[]): ArtifactTemplate | null {
  if (!id || !id.startsWith('tpl:')) return null;
  return templates.find((t) => t.id === id.slice(4)) ?? null;
}

/**
 * A template as a Make choice: said in words like the others — the name in
 * them, so the conversation shows what was asked — and filled from what is
 * typed, or from the conversation when nothing is.
 */
export function templateChoice(t: ArtifactTemplate): MakeChoice {
  const from = `Make a custom artifact from my template “${t.name}”`;
  return {
    id: `tpl:${t.id}`,
    label: t.name,
    about: t.about || 'Your template, made again for what you say.',
    template: { kind: 'custom', view: 'board' },
    placeholder: `What is it for this time? It will be made like “${t.name}”`,
    ask: (about) => `${from}: ${about}`,
    fromHere: `${from} from this conversation`,
  };
}

/** What travels with the message that asks for one: the template's name and blocks. */
export function templatePayload(t: ArtifactTemplate): { name: string; blocks: Block[] } {
  return { name: t.name, blocks: t.blocks };
}

// ── a change anywhere is seen everywhere on the page ─────────────────

const listeners = new Set<() => void>();
/** Told when templates are saved or removed in this page. */
export function onTemplates(f: () => void): () => void {
  listeners.add(f);
  return () => void listeners.delete(f);
}
