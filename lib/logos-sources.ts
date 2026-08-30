// lib/logos-sources.ts
//
// Grounded context: real material attached to ONE node of the Thinking Map.
//
// The interaction matters more than the connector. A connected Drive is not a
// feature; choosing YOUR planning document while looking at YOUR "should we
// launch in September?" node is. So context is never dumped into the
// conversation wholesale — it is attached to the specific piece of reasoning
// it grounds, and every surface that reads that node (explore, challenge,
// research, trace, the focused thread, the map extractor) sees it there.
//
// The philosophy, pinned: INTEGRATIONS GIVE LOGOS CONTEXT, NOT AUTHORITY.
// A document can inform the frame. It cannot settle the question, and its
// author's positions never silently become the user's.
//
// This module is shared by client and server — nothing server-only in here.

import {
  ORIGINS,
  type AttachmentOrigin,
} from './logos-attachments';

export const SOURCE_KINDS = [
  'drive',
  'sheets',
  'calendar',
  'gmail',
  'notion',
  'web',
  'paste',
  'upload',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_META: Record<
  SourceKind,
  { label: string; blurb: string; searches: boolean }
> = {
  drive: { label: 'Google Drive', blurb: 'Docs, notes, drafts', searches: true },
  sheets: { label: 'Sheets', blurb: 'Data and numbers', searches: true },
  calendar: { label: 'Calendar', blurb: 'Actual commitments', searches: true },
  gmail: { label: 'Gmail', blurb: 'What was actually said', searches: true },
  notion: { label: 'Notion', blurb: 'Projects and knowledge', searches: true },
  web: { label: 'Web', blurb: 'A page you’re reading', searches: false },
  paste: { label: 'Paste', blurb: 'Straight from the clipboard', searches: false },
  upload: { label: 'Upload', blurb: 'A file or an image', searches: false },
};

// Whose words a source's material probably is, before the person corrects it.
// 'guess' runs the same first-person heuristic used for pasted notes — a
// Drive doc might be your own thinking or a colleague's memo.
export const DEFAULT_ORIGIN: Record<SourceKind, AttachmentOrigin | 'guess'> = {
  drive: 'guess',
  sheets: 'context',
  calendar: 'context',
  gmail: 'source',
  notion: 'guess',
  web: 'source',
  paste: 'guess',
  upload: 'guess',
};

export interface NodeContext {
  id: string;
  source: SourceKind;
  /** what the person would call it — doc name, event title, page title */
  title: string;
  /** where it came from, for display and for opening it again (never fetched) */
  ref?: string;
  /** the normalized text extract everything downstream reads */
  text: string;
  /** whose thinking this is — decides what the extractor may do with it */
  origin: AttachmentOrigin;
  addedAt: number;
}

/** contexts, keyed by the node id they ground */
export type NodeContexts = Record<string, NodeContext[]>;

export const MAX_CONTEXTS_PER_NODE = 4;
export const MAX_GROUNDED_NODES = 24;
export const MAX_CONTEXT_TEXT = 16_000;
export const MAX_CONTEXT_TITLE = 160;
const MAX_REF = 600;

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');

/** Trust nothing that crossed the wire — shape, size and count enforced here. */
export function sanitizeNodeContextList(raw: unknown): NodeContext[] {
  if (!Array.isArray(raw)) return [];
  const out: NodeContext[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const text = clip(c.text, MAX_CONTEXT_TEXT).trim();
    if (!text) continue;
    if (!SOURCE_KINDS.includes(c.source)) continue;
    out.push({
      id: clip(c.id, 60) || `ctx_${out.length}`,
      source: c.source as SourceKind,
      title: clip(c.title, MAX_CONTEXT_TITLE).trim() || 'Untitled',
      ref: clip(c.ref, MAX_REF) || undefined,
      text,
      origin: ORIGINS.includes(c.origin) ? (c.origin as AttachmentOrigin) : 'source',
      addedAt: Number(c.addedAt) || 0,
    });
    if (out.length >= MAX_CONTEXTS_PER_NODE) break;
  }
  return out;
}

export function sanitizeContexts(raw: unknown): NodeContexts {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: NodeContexts = {};
  let nodes = 0;
  for (const [nodeId, list] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(nodeId).trim().slice(0, 40);
    if (!id) continue;
    const clean = sanitizeNodeContextList(list);
    if (!clean.length) continue;
    out[id] = clean;
    if (++nodes >= MAX_GROUNDED_NODES) break;
  }
  return out;
}

const originTag = (o: AttachmentOrigin) =>
  o === 'mine' ? 'my thinking' : o === 'context' ? 'context' : 'source material';

/**
 * The map extractor's view: one line per grounded item, tight excerpts. The
 * extractor sees WHAT is attached and to WHICH node — enough to sharpen that
 * node — without a pasted report eating the whole prompt.
 */
export function renderContextsForMap(all: NodeContexts): string {
  const lines: string[] = [];
  for (const [nodeId, list] of Object.entries(all)) {
    for (const c of list) {
      const excerpt = c.text.replace(/\s+/g, ' ').slice(0, 320);
      lines.push(
        `  ${nodeId} ← “${c.title}” [${c.source}, ${originTag(c.origin)}]: ${excerpt}${
          c.text.length > 320 ? '…' : ''
        }`
      );
    }
  }
  return lines.join('\n');
}

/**
 * The per-node view used when acting on a node (explore/challenge/research/
 * trace, and its focused thread) — fuller text, numbered so it can be
 * referred to honestly.
 */
export function renderContextsForNode(list: NodeContext[], perItem = 3_500): string {
  return list
    .map(
      (c, i) =>
        `[${i + 1}] “${c.title}” (${SOURCE_META[c.source].label}, ${originTag(c.origin)})\n${c.text.slice(0, perItem)}${c.text.length > perItem ? '…' : ''}`
    )
    .join('\n\n');
}

/** The rule every prompt that receives grounded material must carry. */
export const CONTEXT_NOT_AUTHORITY = `This material gives you CONTEXT, not AUTHORITY. It can sharpen the frame, supply facts, dates, numbers and commitments, and show what the person is drawing on. It cannot settle their question, it never outranks what they actually said, and its authors' positions are not theirs unless they have adopted them out loud.`;
