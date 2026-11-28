// components/ux-v0/studio/begin.ts — a request from the home becoming a conversation, and a conversation becoming
// the work it was about. Every work begins as a project in conversation (DesignProject.studio, status 'discovering'),
// so it is kept, listed and reopened like any other; when it starts, the same project becomes the graphic, the logo,
// the board, the website or the critique, with its conversation kept on it. A design system is the one exception: its
// conversation hands over to the import, which makes a system, not a project.

import { addUpload } from '../uploads';
import { currentCompanyId } from '@/lib/ux-v0/company/store';
import { checkFile } from '../files';
import { holdFile, heldFile } from './held';
import { makeProject, normalizeRef, type DesignProject, type MoodboardRef } from '@/lib/ux-v0/types';
import { emptyStudio, said, studioId, type StudioAttachment, type StudioMode, type StudioState } from '@/lib/ux-v0/studio/schema';
import { makeItNow, opening, seedFromWords, switchKind } from '@/lib/ux-v0/studio/director';
import { isCreative, personWordsOf, startMaking, wantsMake } from '@/lib/ux-v0/studio/discover';
import { emptySpace } from '@/lib/ux-v0/studio/brief';
import { systemChosen, websiteSystems } from '@/lib/ux-v0/studio/options';
import { attachmentKindOf } from '@/lib/ux-v0/studio/intent';
import { readFacts } from '@/lib/ux-v0/studio/facts';
import { modeInfo } from '@/lib/ux-v0/studio/modes';
import { startWebsite } from '@/lib/ux-v0/studio/start';
import { designFromStudio } from '@/lib/ux-v0/design/start';
import { importAskOf, websiteAskOf } from '@/lib/ux-v0/studio/apply';
import { newId, type Asset } from '@/lib/ux-v0/graphics/doc';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import { applySystem } from '@/lib/ux-v0/dsi/link';
import { publishedContent, type SystemRecord } from '@/lib/ux-v0/dsi/registry';
import { brandBoardOptions } from '@/lib/ux-v0/dsi/generate';

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

/** A first name for a work: its quoted words or its name, else the start of what was said. */
export function nameFor(mode: StudioMode, prompt: string): string {
  const f = readFacts(prompt);
  const words = f.headline || f.brand || prompt.replace(/^\s*(an?|the|make|create|design|i want|i need)\s+/i, '').split(/[.,;:—]/)[0]?.trim() || '';
  return (words || `New ${modeInfo(mode).label.toLowerCase()}`).slice(0, 80);
}

/** The project a conversation is kept in, its record begun from the opening words. */
export function conversationProject(mode: StudioMode, prompt: string, opts: { modeBy: StudioState['modeBy']; attachments: StudioAttachment[]; systemId?: string | null; systemName?: string; now?: number }): DesignProject {
  const now = opts.now ?? Date.now();
  let st = emptyStudio(mode, prompt, { modeBy: opts.modeBy, attachments: opts.attachments, now, ...(opts.systemId && mode !== 'critique' && mode !== 'system' ? { systemId: opts.systemId } : {}) });
  st = said(st, { from: 'person', kind: 'prompt', text: prompt || (opts.attachments.length ? `These: ${opts.attachments.map((a) => a.name).join(', ')}` : `A ${modeInfo(mode).label.toLowerCase()}`), attachments: opts.attachments.map((a) => a.id), at: now });
  if (isCreative(mode)) {
    // a graphic, a logo, a campaign, a website: a spatial brief opens on the idea (the model fills it in as soon as it
    // opens); words that hand it over ("surprise me, just make something") are made at once
    st = { ...st, space: emptySpace() };
    if (wantsMake(prompt)) st = startMaking(st, now);
  } else {
    // a critique or an import: what it needs (the file), then straight to it
    st = opening(st, { hasSystem: !!st.systemId, ...(opts.systemName ? { systemName: opts.systemName } : {}) }, now);
  }
  // work begun while a company is chosen in this browser is made for it (lib/ux-v0/company)
  const companyId = currentCompanyId();
  return { ...makeProject(mode === 'critique' ? 'critique' : 'create', nameFor(mode, prompt), now), intent: prompt.slice(0, 600), studio: st, ...(companyId && mode !== 'critique' ? { companyId } : {}) };
}

/** The same conversation, about another kind of work (lib/ux-v0/studio/director.ts switchKind). */
export const switchMode = (st: StudioState, mode: StudioMode, now = Date.now()) => switchKind(st, mode, { hasSystem: !!st.systemId }, now);

/** Pictures in a conversation as a graphic's assets (kept in this browser, referenced by upload). */
export function picturesOf(st: StudioState): Asset[] {
  // pictures brought only for their look are learnt from, never placed
  const p = st.mode === 'board' ? 'b' : 'g';
  if (st.answers[`${p}.pictures`]?.values?.[0] === 'look') return [];
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

/** A website's three looks for these words: within its design system when it has one. */
function looksFor(st: StudioState, rec: SystemRecord | null): MasterDesignSystem[] {
  try {
    const ask = websiteAskOf(st);
    if (!ask) return [];
    const content = rec ? publishedContent(rec, 'latest') : null;
    return content ? brandBoardOptions(content, ask.board, `${st.createdAt}|${st.round ?? 0}`, { round: st.round ?? 0 }).slice(0, 3) : websiteSystems(st);
  } catch {
    return [];
  }
}

/** The work a conversation was about, made from it (nothing is stored here: the caller keeps it). */
export function startFrom(p: DesignProject, st0: StudioState, opts: { systems: readonly SystemRecord[]; websiteSystems: readonly MasterDesignSystem[]; now?: number }): Started {
  const now = opts.now ?? Date.now();
  let st = st0;
  // the design system: chosen for the work, or (a board) the identity it was asked to share
  const identity = st.answers['b.identity']?.values?.[0] ?? '';
  const sysId = st.systemId ?? (st.mode === 'board' && identity.startsWith('system:') ? identity.slice('system:'.length) : undefined);
  const rec = sysId ? opts.systems.find((r) => r.id === sysId && r.status === 'active' && r.published > 0) ?? null : null;
  const linked = (x: DesignProject) => (rec ? applySystem(x, rec, { now }).project : x);
  // graphics, logos and boards are designed as HTML artboards (lib/ux-v0/design): the brief written down, the first
  // design asked for the moment the workspace opens
  if (st.mode === 'graphic' || st.mode === 'logo' || st.mode === 'board') {
    const assets = st.mode === 'logo' ? [] : picturesOf(st);
    const r = designFromStudio(p, st, { assets: assets.map((a) => ({ id: a.id, src: a.src, name: a.name, width: a.width, height: a.height })), now });
    if (!r.ok) return r;
    return { ok: true, kind: 'project', project: linked(r.project) };
  }
  if (st.mode === 'website') {
    // the website engine reads its decisions from words: everything the person said in discovery, with what is still
    // open left as marked gaps it fills in
    if (st.brief) {
      const words = personWordsOf(st).join(' — ');
      st = makeItNow(seedFromWords({ ...st, prompt: words.slice(0, 2000) }, now), now);
    }
    // the looks shown in the conversation; when none were drawn (made at once), drawn here the same way
    const drawn = opts.websiteSystems.length ? opts.websiteSystems : looksFor(st, rec);
    const sys = systemChosen(drawn, st.answers['w.aesthetic']?.values?.[0]);
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
