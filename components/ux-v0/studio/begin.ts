// components/ux-v0/studio/begin.ts — a request from the home becoming a conversation, and a conversation becoming
// the work it was about. Every work begins as a project in conversation (DesignProject.studio, status 'discovering'),
// so it is kept, listed and reopened like any other; when it starts, the same project becomes the graphic, the logo,
// the board, the website or the critique, with its conversation kept on it. A design system is the one exception: its
// conversation hands over to the import, which makes a system, not a project.

import { addUpload } from '../uploads';
import { checkFile } from '../files';
import { holdFile, heldFile } from './held';
import { makeProject, normalizeRef, type DesignProject, type MoodboardRef } from '@/lib/ux-v0/types';
import { emptyStudio, said, studioId, type StudioAttachment, type StudioMode, type StudioState } from '@/lib/ux-v0/studio/schema';
import { seedFromWords } from '@/lib/ux-v0/studio/discovery';
import { attachmentKindOf } from '@/lib/ux-v0/studio/intent';
import { readFacts } from '@/lib/ux-v0/studio/facts';
import { modeInfo } from '@/lib/ux-v0/studio/modes';
import { startProject, startWebsite } from '@/lib/ux-v0/studio/start';
import { importAskOf } from '@/lib/ux-v0/studio/apply';
import { newId, type Asset } from '@/lib/ux-v0/graphics/doc';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import { applySystem } from '@/lib/ux-v0/dsi/link';
import type { SystemRecord } from '@/lib/ux-v0/dsi/registry';

const PICTURE = /^image\/(png|jpeg|webp|gif)$/;

/** Files brought into a conversation: pictures kept in this browser (with their colours), the rest held for the visit. */
export async function attachFiles(files: readonly File[], opts: { critique?: boolean; hold?: boolean } = {}): Promise<{ attachments: StudioAttachment[]; error?: string }> {
  const out: StudioAttachment[] = [];
  for (const f of files.slice(0, 12)) {
    const kind = attachmentKindOf(f);
    const id = studioId('at');
    // a design to critique is imported whole, as the critique's own file: held, never turned into a reference
    if (opts.critique) {
      const checked = await checkFile(f);
      if (!checked.ok) return { attachments: out, error: checked.error };
      holdFile(id, f);
      out.push({ id, name: f.name.slice(0, 120), kind: kind === 'page' ? 'page' : 'image' });
      continue;
    }
    // files a design system is read from are imported whole: held as they are
    if (kind === 'image' && PICTURE.test(f.type) && !opts.hold) {
      const r = await addUpload(f);
      if (!r.ok) return { attachments: out, error: r.error };
      out.push({ id, name: f.name.slice(0, 120), kind, upload: r.ref.providerId, width: r.ref.width, height: r.ref.height, ...(r.ref.swatches?.length ? { swatches: r.ref.swatches.slice(0, 6) } : {}) });
      continue;
    }
    holdFile(id, f);
    out.push({ id, name: f.name.slice(0, 120), kind });
  }
  return { attachments: out };
}

const OPENING: Record<StudioMode, string> = {
  graphic: 'a few questions about what it says and how it should feel, then three directions to choose from.',
  logo: 'tell me what the name stands for, and I’ll construct concepts from it — never from a library of marks.',
  website: 'first what it must do and for whom, then how it should look.',
  board: 'a whole campaign in one identity: what it holds first, then how it speaks.',
  system: 'where is it now? I’ll read it as it is, and ask before I guess.',
  critique: 'which design should we look at?',
};

/** Socria's first line: the kind of work it heard, and how it will go. */
export function openingLine(mode: StudioMode, by: StudioState['modeBy']): string {
  const label = modeInfo(mode).label.toLowerCase();
  const a = /^[aeiou]/.test(label) ? 'an' : 'a';
  return by === 'recognised' ? `That reads as ${a} ${label}: ${OPENING[mode]} If it is something else, change it at the top.` : `${a.charAt(0).toUpperCase()}${a.slice(1)} ${label}, then — ${OPENING[mode]}`;
}

/** A first name for a work: its quoted words or its name, else the start of what was said. */
export function nameFor(mode: StudioMode, prompt: string): string {
  const f = readFacts(prompt);
  const words = f.headline || f.brand || prompt.replace(/^\s*(an?|the|make|create|design|i want|i need)\s+/i, '').split(/[.,;:—]/)[0]?.trim() || '';
  return (words || `New ${modeInfo(mode).label.toLowerCase()}`).slice(0, 80);
}

/** The project a conversation is kept in, its record begun from the opening words. */
export function conversationProject(mode: StudioMode, prompt: string, opts: { modeBy: StudioState['modeBy']; attachments: StudioAttachment[]; systemId?: string | null; now?: number }): DesignProject {
  const now = opts.now ?? Date.now();
  let st = emptyStudio(mode, prompt, { modeBy: opts.modeBy, attachments: opts.attachments, now, ...(opts.systemId && mode !== 'critique' && mode !== 'system' ? { systemId: opts.systemId } : {}) });
  st = said(st, { from: 'person', kind: 'prompt', text: prompt || (opts.attachments.length ? `These: ${opts.attachments.map((a) => a.name).join(', ')}` : `A ${modeInfo(mode).label.toLowerCase()}`), attachments: opts.attachments.map((a) => a.id), at: now });
  st = said(st, { from: 'socria', kind: 'note', text: openingLine(mode, opts.modeBy), at: now });
  st = seedFromWords(st, now);
  return { ...makeProject(mode === 'critique' ? 'critique' : 'create', nameFor(mode, prompt), now), intent: prompt.slice(0, 600), studio: st };
}

/** The same conversation, about another kind of work: what carries across does, the rest is asked afresh. */
export function switchMode(st: StudioState, mode: StudioMode, now = Date.now()): StudioState {
  const from = ({ graphic: 'g', logo: 'l', website: 'w', board: 'b', system: 's', critique: 'c' } as const)[st.mode];
  const to = ({ graphic: 'g', logo: 'l', website: 'w', board: 'b', system: 's', critique: 'c' } as const)[mode];
  const answers: StudioState['answers'] = {};
  // temperament, colours and what to avoid mean the same in every kind of made work
  for (const k of ['personality', 'palette', 'avoid'])
    if (st.answers[`${from}.${k}`] && st.answers[`${from}.${k}`].source !== 'words') answers[`${to}.${k}`] = st.answers[`${from}.${k}`];
  // the person's own words: a headline stays a headline, a name a name
  const words = st.answers[st.mode === 'logo' ? 'l.name' : `${from}.words`];
  if (words?.fields && words.source !== 'words') {
    const headline = words.fields.headline || words.fields.name || words.fields.brand || '';
    if (headline) {
      if (mode === 'logo') answers['l.name'] = { ...words, fields: { name: words.fields.brand || headline } };
      else if (mode === 'graphic' || mode === 'board') answers[`${to}.words`] = { ...words, fields: { ...words.fields, headline } };
      else if (mode === 'website') answers['w.words'] = { ...words, fields: { ...words.fields, brand: words.fields.brand || words.fields.name || '', headline: words.fields.headline || '' } };
    }
  }
  if (mode === 'critique' || mode === 'system') delete answers[`${to}.personality`];
  let next: StudioState = { ...st, mode, modeBy: 'person', answers, depth: 1, ...(mode === 'critique' || mode === 'system' ? { systemId: undefined } : {}) };
  next = said(next, { from: 'socria', kind: 'change', text: openingLine(mode, 'person'), at: now });
  return seedFromWords(next, now);
}

/** Pictures in a conversation as a graphic's assets (kept in this browser, referenced by upload). */
export function picturesOf(st: StudioState): Asset[] {
  return st.attachments
    .filter((a) => a.kind === 'image' && a.upload)
    .map((a) => ({ id: newId('as'), kind: 'image' as const, src: `upload:${a.upload}`, width: a.width ?? 1200, height: a.height ?? 900, name: a.name.slice(0, 120), credit: 'Your own', source: 'upload' as const }));
}

/** Pictures in a conversation as a website's kept references. */
function referencesOf(st: StudioState): MoodboardRef[] {
  return st.attachments
    .filter((a) => a.kind === 'image' && a.upload)
    .map((a) =>
      normalizeRef({ provider: 'upload', providerId: a.upload, width: a.width ?? 1200, height: a.height ?? 900, color: a.swatches?.[0] ?? null, title: a.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 120), creator: 'You', license: 'Your own', attribution: 'Your own reference', category: 'imagery', state: 'kept', asContent: true, swatches: a.swatches ?? [], media: 'image' }),
    )
    .filter((r): r is MoodboardRef => !!r);
}

export type Started =
  | { ok: true; kind: 'project'; project: DesignProject; file?: File | null; intent?: string }
  | { ok: true; kind: 'import'; ask: { kind: string; url: string; projectId: string; parts: string[]; next: string; files: File[] } }
  | { ok: false; error: string };

/** The work a conversation was about, made from it (nothing is stored here: the caller keeps it). */
export function startFrom(p: DesignProject, st: StudioState, opts: { systems: readonly SystemRecord[]; websiteSystems: readonly MasterDesignSystem[]; now?: number }): Started {
  const now = opts.now ?? Date.now();
  // the design system: chosen for the work, or (a board) the identity it was asked to share
  const identity = st.answers['b.identity']?.values?.[0] ?? '';
  const sysId = st.systemId ?? (st.mode === 'board' && identity.startsWith('system:') ? identity.slice('system:'.length) : undefined);
  const rec = sysId ? opts.systems.find((r) => r.id === sysId && r.status === 'active' && r.published > 0) ?? null : null;
  const linked = (x: DesignProject) => (rec ? applySystem(x, rec, { now }).project : x);
  if (st.mode === 'graphic' || st.mode === 'logo') {
    const assets = st.mode === 'graphic' ? picturesOf(st) : [];
    const r = startProject(p, st, { images: assets.map((a) => a.id), assets, now });
    if (!r.ok) return r;
    return { ok: true, kind: 'project', project: linked(r.project) };
  }
  if (st.mode === 'board') {
    const assets = picturesOf(st);
    const r = startProject(p, st, { images: assets.map((a) => a.id), now });
    if (!r.ok) return r;
    const b = r.project.board!;
    return { ok: true, kind: 'project', project: linked({ ...r.project, board: { ...b, assets: [...b.assets, ...assets] } }) };
  }
  if (st.mode === 'website') {
    const chosen = st.answers['w.aesthetic']?.values?.[0];
    const i = chosen?.startsWith('sys-') ? Number(chosen.slice(4)) : 0;
    const sys = opts.websiteSystems[i] ?? opts.websiteSystems[0];
    if (!sys) return { ok: false, error: 'A website needs a name or a first line before a direction can be drawn.' };
    const r = startWebsite(st, sys, { now, name: p.name });
    if (!r.ok) return r;
    const refs = referencesOf(st);
    const made: DesignProject = { ...r.project, id: p.id, createdAt: p.createdAt, ...(refs.length ? { moodboard: { ...r.project.moodboard, refs: [...r.project.moodboard.refs, ...refs] } } : {}) };
    return { ok: true, kind: 'project', project: linked(made) };
  }
  if (st.mode === 'system') {
    const ask = importAskOf(st);
    const files = (st.answers['s.input']?.values ?? []).map((id) => heldFile(id)).filter((f): f is File => !!f);
    return { ok: true, kind: 'import', ask: { ...ask, files } };
  }
  // a critique: the design itself, imported into the same project, the conversation kept on it
  const id = st.answers['c.file']?.values?.[0] ?? st.attachments.find((a) => a.kind === 'page' || a.kind === 'image')?.id;
  const file = id ? heldFile(id) : null;
  if (!file) return { ok: false, error: 'The design is no longer in this browser’s memory (it is not kept until the critique begins). Add it again.' };
  const project: DesignProject = {
    ...makeProject('critique', file.name.replace(/\.[a-z0-9]+$/i, ''), now),
    id: p.id,
    createdAt: p.createdAt,
    intent: p.intent,
    studio: said({ ...st, status: 'started', startedAt: now }, { from: 'socria', kind: 'note', text: `Opening “${file.name}”. Select any part of it — an element or an area — and we reason it through.`, at: now }),
  };
  return { ok: true, kind: 'project', project, file };
}

/** A critique begun straight from the home (the design is the request). */
export async function critiqueProject(file: File, words: string): Promise<{ ok: true; project: DesignProject } | { ok: false; error: string }> {
  const checked = await checkFile(file);
  if (!checked.ok) return checked;
  const now = Date.now();
  const id = studioId('at');
  holdFile(id, file);
  const at: StudioAttachment = { id, name: file.name.slice(0, 120), kind: attachmentKindOf(file) === 'page' ? 'page' : 'image' };
  let st = emptyStudio('critique', words, { modeBy: 'person', attachments: [at], now });
  st = said(st, { from: 'person', kind: 'prompt', text: words || `A critique of “${file.name}”`, attachments: [id], at: now });
  st = seedFromWords(st, now);
  st = said({ ...st, status: 'started', startedAt: now }, { from: 'socria', kind: 'note', text: `Opening “${file.name}”. Select any part of it — an element or an area — and we reason it through.`, at: now });
  return { ok: true, project: { ...makeProject('critique', file.name.replace(/\.[a-z0-9]+$/i, ''), now), intent: words.slice(0, 600), studio: st } };
}
