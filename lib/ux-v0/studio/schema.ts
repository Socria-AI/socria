// lib/ux-v0/studio/schema.ts — the studio's record of a work: what was asked for, how, every decision since, and the
// conversation it happened in.
//
// It is kept on the project (DesignProject.studio), so the conversation survives a reload, follows a signed-in
// designer to another device and is read by the workspace the work continues in. Every answer says where it came from:
// the person's own words in the opening sentence, a choice they made, or something left to SocriaUX. Normalised on
// read like the rest of the project, so a stored record can never break the page.

export const STUDIO_MODES = ['graphic', 'website', 'logo', 'system', 'board', 'critique'] as const;
export type StudioMode = (typeof STUDIO_MODES)[number];

export const ATTACHMENT_KINDS = ['image', 'page', 'tokens', 'css', 'pdf', 'font', 'link', 'other'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** A file, picture or link brought into the conversation. Pictures are kept in this browser (an upload reference);
 * the rest is held only while the conversation needs it. */
export interface StudioAttachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  /** a picture kept in this browser: the upload's id in the artifact store (moodboard provider id) */
  upload?: string;
  url?: string;
  width?: number;
  height?: number;
  /** colours read from a picture */
  swatches?: string[];
}

export type AnswerSource = 'words' | 'person' | 'socria';

export interface StudioAnswer {
  /** chosen option ids: one for a single choice, several for a multiple one, all of them in order for a ranking */
  values: string[];
  /** the person's own words for this decision */
  text?: string;
  /** numbers: a slider's position (0–100) or a material's count */
  numbers?: Record<string, number>;
  /** typed fields: a headline, a name, a link */
  fields?: Record<string, string>;
  skipped?: boolean;
  /** left to SocriaUX: "you decide" */
  delegated?: boolean;
  /** read from the opening sentence, chosen by the person, or decided by SocriaUX */
  source: AnswerSource;
  at: number;
}

export type MessageKind = 'prompt' | 'question' | 'answer' | 'note' | 'change' | 'reply';

export interface StudioMessage {
  id: string;
  from: 'person' | 'socria';
  text: string;
  at: number;
  kind: MessageKind;
  /** the decision it asks or answers */
  stage?: string;
  /** attachments it carried (ids) */
  attachments?: string[];
}

export interface StudioState {
  v: 1;
  mode: StudioMode;
  /** chosen by the person, or recognised from their words */
  modeBy: 'person' | 'recognised';
  /** the opening sentence, exactly */
  prompt: string;
  answers: Record<string, StudioAnswer>;
  transcript: StudioMessage[];
  attachments: StudioAttachment[];
  /** the registry design system the work is made in */
  systemId?: string;
  /** how deep the questions have gone: 1 the accessible ones, 2 palette, type and composition, 3 the finer points */
  depth?: 1 | 2 | 3;
  /** discovering: still in conversation; started: the work has begun in its workspace */
  status: 'discovering' | 'started';
  startedAt?: number;
  /** how the work began: from the conversation (the default), or with the brief written by hand in the workspace */
  via?: 'hand';
  createdAt: number;
}

export const STUDIO_LIMITS = { prompt: 2000, text: 1200, field: 400, transcript: 200, attachments: 16, values: 24, answers: 60 } as const;

const o = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\u0000/g, '').slice(0, max) : '');
const n = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
const ID = /^[a-z][\w.-]{0,63}$/i;
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

let seq = 0;
/** A short id: unique within a conversation, readable in a record. */
export const studioId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++ % 1296).toString(36).padStart(2, '0')}${Math.floor(Math.random() * 1296).toString(36)}`;

export function isStudioMode(v: unknown): v is StudioMode {
  return typeof v === 'string' && (STUDIO_MODES as readonly string[]).includes(v);
}

/** A fresh record for a work about to be discussed. */
export function emptyStudio(mode: StudioMode, prompt: string, opts: { modeBy?: StudioState['modeBy']; systemId?: string; now?: number; attachments?: StudioAttachment[] } = {}): StudioState {
  const now = opts.now ?? Date.now();
  return {
    v: 1,
    mode,
    modeBy: opts.modeBy ?? 'person',
    prompt: prompt.trim().slice(0, STUDIO_LIMITS.prompt),
    answers: {},
    transcript: [],
    attachments: (opts.attachments ?? []).slice(0, STUDIO_LIMITS.attachments),
    ...(opts.systemId ? { systemId: opts.systemId } : {}),
    status: 'discovering',
    createdAt: now,
  };
}

function normalizeAnswer(v: unknown): StudioAnswer | null {
  const r = o(v);
  const values = a(r.values)
    .map((x) => s(x, 80))
    .filter(Boolean)
    .slice(0, STUDIO_LIMITS.values);
  const numbers: Record<string, number> = {};
  for (const [k, val] of Object.entries(o(r.numbers)).slice(0, 24)) {
    const x = n(val, 0, 100);
    if (ID.test(k) && !UNSAFE.has(k) && x !== null) numbers[k] = x;
  }
  const fields: Record<string, string> = {};
  for (const [k, val] of Object.entries(o(r.fields)).slice(0, 16)) {
    const x = s(val, STUDIO_LIMITS.field);
    if (ID.test(k) && !UNSAFE.has(k) && x) fields[k] = x;
  }
  const text = s(r.text, STUDIO_LIMITS.text);
  const source: AnswerSource = r.source === 'words' || r.source === 'socria' ? r.source : 'person';
  return {
    values,
    ...(text ? { text } : {}),
    ...(Object.keys(numbers).length ? { numbers } : {}),
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(r.skipped === true ? { skipped: true } : {}),
    ...(r.delegated === true ? { delegated: true } : {}),
    source,
    at: n(r.at, 0, 8.64e15) ?? 0,
  };
}

function normalizeAttachment(v: unknown): StudioAttachment | null {
  const r = o(v);
  const id = s(r.id, 64);
  const name = s(r.name, 160);
  const kind = (ATTACHMENT_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as AttachmentKind) : null;
  if (!id || !ID.test(id) || !kind) return null;
  const url = s(r.url, 600);
  const upload = s(r.upload, 96);
  const swatches = a(r.swatches)
    .map((x) => s(x, 9))
    .filter((x) => /^#[0-9a-f]{6}$/i.test(x))
    .slice(0, 8);
  return {
    id,
    name: name || 'Untitled',
    kind,
    ...(upload && /^[\w-]{1,96}$/.test(upload) ? { upload } : {}),
    ...(url && /^https?:\/\//i.test(url) ? { url } : {}),
    ...(n(r.width, 1, 100000) ? { width: n(r.width, 1, 100000)! } : {}),
    ...(n(r.height, 1, 100000) ? { height: n(r.height, 1, 100000)! } : {}),
    ...(swatches.length ? { swatches } : {}),
  };
}

const KINDS: readonly MessageKind[] = ['prompt', 'question', 'answer', 'note', 'change', 'reply'];

function normalizeMessage(v: unknown): StudioMessage | null {
  const r = o(v);
  const text = s(r.text, STUDIO_LIMITS.text * 2);
  const id = s(r.id, 64);
  if (!text || !id) return null;
  const stage = s(r.stage, 64);
  const atts = a(r.attachments)
    .map((x) => s(x, 64))
    .filter(Boolean)
    .slice(0, STUDIO_LIMITS.attachments);
  return {
    id,
    from: r.from === 'person' ? 'person' : 'socria',
    text,
    at: n(r.at, 0, 8.64e15) ?? 0,
    kind: KINDS.includes(r.kind as MessageKind) ? (r.kind as MessageKind) : 'note',
    ...(stage && ID.test(stage) ? { stage } : {}),
    ...(atts.length ? { attachments: atts } : {}),
  };
}

/** A stored record held to its shape; undefined when it is not one. */
export function normalizeStudio(v: unknown): StudioState | undefined {
  const r = o(v);
  if (!isStudioMode(r.mode)) return undefined;
  const answers: Record<string, StudioAnswer> = {};
  for (const [k, val] of Object.entries(o(r.answers)).slice(0, STUDIO_LIMITS.answers)) {
    if (!ID.test(k) || UNSAFE.has(k)) continue;
    const x = normalizeAnswer(val);
    if (x) answers[k] = x;
  }
  const systemId = s(r.systemId, 80);
  return {
    v: 1,
    mode: r.mode,
    modeBy: r.modeBy === 'recognised' ? 'recognised' : 'person',
    prompt: s(r.prompt, STUDIO_LIMITS.prompt),
    answers,
    transcript: a(r.transcript)
      .map(normalizeMessage)
      .filter((x): x is StudioMessage => !!x)
      .slice(-STUDIO_LIMITS.transcript),
    attachments: a(r.attachments)
      .map(normalizeAttachment)
      .filter((x): x is StudioAttachment => !!x)
      .slice(0, STUDIO_LIMITS.attachments),
    ...(systemId && /^dsys_[\w-]{4,64}$/.test(systemId) ? { systemId } : {}),
    ...(r.depth === 2 || r.depth === 3 ? { depth: r.depth } : {}),
    status: r.status === 'started' ? 'started' : 'discovering',
    ...(n(r.startedAt, 0, 8.64e15) ? { startedAt: n(r.startedAt, 0, 8.64e15)! } : {}),
    ...(r.via === 'hand' ? { via: 'hand' as const } : {}),
    createdAt: n(r.createdAt, 0, 8.64e15) ?? 0,
  };
}

/** A message added to the conversation (bounded: the oldest go first). */
export function said(st: StudioState, m: Omit<StudioMessage, 'id' | 'at'> & { at?: number }): StudioState {
  const msg: StudioMessage = { id: studioId('m'), at: m.at ?? Date.now(), from: m.from, text: m.text.slice(0, STUDIO_LIMITS.text * 2), kind: m.kind, ...(m.stage ? { stage: m.stage } : {}), ...(m.attachments?.length ? { attachments: m.attachments } : {}) };
  return { ...st, transcript: [...st.transcript, msg].slice(-STUDIO_LIMITS.transcript) };
}
