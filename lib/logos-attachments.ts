// lib/logos-attachments.ts
//
// Thinking doesn't always arrive as a chat message. Sometimes it's three pages
// of notes you already wrote, or a photo of a whiteboard. Logos takes both.
//
// Two kinds:
//   note   long pasted text or a .txt/.md file, kept whole
//   image  read ONCE into a text "reading" at attach time
//
// The reading matters more than it looks. Everything downstream — the reply,
// the map extraction, exploring a node — reads text, so turning an image into
// text once means the map sees exactly what the conversation saw, at one
// vision call rather than one per turn per surface.

export type AttachmentKind = 'note' | 'image';

// Whose thinking this is. The distinction is load-bearing: a map that turns a
// quoted author's position into the user's own belief is worse than a map that
// missed it, because they'd be looking at a picture of someone else's mind and
// believing it was theirs.
export const ORIGINS = ['mine', 'source', 'context'] as const;
export type AttachmentOrigin = (typeof ORIGINS)[number];

export const ORIGIN_LABEL: Record<AttachmentOrigin, string> = {
  mine: 'My thinking',
  source: 'Source material',
  context: 'Context',
};

export interface Attachment {
  kind: AttachmentKind;
  /** original file name, when it came from one */
  name?: string;
  /** whose thinking this is — defaults to a guess, always correctable */
  origin?: AttachmentOrigin;
  /** note: the full text */
  text?: string;
  /** note: word count, shown on the chip */
  words?: number;
  /** image: what Logos read in it */
  reading?: string;
  /** image: a small preview, the only part of an image that is persisted */
  thumb?: string;
}

export const MAX_ATTACHMENTS = 6;
export const MAX_NOTE_CHARS = 24_000;
export const MAX_READING_CHARS = 1_600;
// ~45KB of base64 — enough for a 220px preview, small enough to sit in a row.
export const MAX_THUMB_CHARS = 62_000;
export const MAX_NAME = 80;

/** Paste anything longer than this and it becomes a note instead of filling the box. */
export const NOTE_THRESHOLD = 900;

/** Earlier turns keep only the head of a long note — the whole thing every
 *  turn would blow the context window on a single pasted essay. */
const HISTORY_NOTE_CHARS = 700;

export function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

function clip(v: unknown, n: number): string {
  return typeof v === 'string' ? v.slice(0, n) : '';
}

/**
 * A first guess at whose words these are, so the common case needs no
 * decision. Deliberately crude and deliberately biased toward "source": being
 * wrongly asked to confirm is cheap, and quietly adopting someone else's
 * convictions as the user's is not.
 */
export function guessOrigin(text: string): AttachmentOrigin {
  const sample = text.slice(0, 4000);
  const words = Math.max(wordCount(sample), 1);
  const first = (sample.match(/\b(I|I'm|I’m|I've|I’ve|my|me|myself)\b/gi) || []).length;
  // Roughly one first-person marker every forty words reads as someone
  // writing about their own thinking.
  return first / words > 0.025 ? 'mine' : 'source';
}

/** Trust nothing from the client: shape, size and count are all enforced here. */
export function sanitizeAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  const out: Attachment[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    if (a.kind === 'note') {
      const text = clip(a.text, MAX_NOTE_CHARS).trim();
      if (!text) continue;
      out.push({
        kind: 'note',
        name: clip(a.name, MAX_NAME) || undefined,
        origin: ORIGINS.includes(a.origin) ? (a.origin as AttachmentOrigin) : guessOrigin(text),
        text,
        words: wordCount(text),
      });
    } else if (a.kind === 'image') {
      const thumb = clip(a.thumb, MAX_THUMB_CHARS);
      const reading = clip(a.reading, MAX_READING_CHARS).trim();
      if (!reading && !thumb) continue;
      out.push({
        kind: 'image',
        name: clip(a.name, MAX_NAME) || undefined,
        reading: reading || undefined,
        // Only ever a data: image — never a remote URL we'd then fetch.
        thumb: /^data:image\/(png|jpeg|webp);base64,/.test(thumb) ? thumb : undefined,
      });
    }
    if (out.length >= MAX_ATTACHMENTS) break;
  }
  return out;
}

export interface RenderableMsg {
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
}

/**
 * Flatten a message plus its attachments into the single string every Logos
 * prompt consumes. `full` is reserved for the turn being answered right now.
 */
export function renderMessageForModel(m: RenderableMsg, full = false): string {
  const parts: string[] = [];
  const body = (m.content ?? '').trim();
  if (body) parts.push(body);

  for (const a of m.attachments ?? []) {
    if (a.kind === 'note') {
      const named = a.name ? `Attached note “${a.name}”` : 'Attached note';
      // The tag is the whole point of the block — it tells everything
      // downstream whether these convictions may be attributed to the user.
      const whose =
        a.origin === 'source'
          ? 'source material — NOT the user’s own position'
          : a.origin === 'context'
            ? 'context they supplied but do not necessarily endorse'
            : 'my thinking — the user’s own words';
      const text = a.text ?? '';
      const count = a.words ?? wordCount(text);
      if (full || text.length <= HISTORY_NOTE_CHARS) {
        parts.push(`[${named} — ${whose} — ${count} words]\n${text}`);
      } else {
        parts.push(
          `[${named} — ${whose} — ${count} words, opening only]\n${text.slice(
            0,
            HISTORY_NOTE_CHARS
          )}…`
        );
      }
    } else {
      const label = a.name ? `Attached image “${a.name}”` : 'Attached image';
      parts.push(
        a.reading
          ? `[${label}, as read]\n${a.reading}`
          : `[${label} — could not be read]`
      );
    }
  }

  return parts.join('\n\n');
}

/** True when there's nothing for the model to work with. */
export function isEmptyMessage(m: RenderableMsg): boolean {
  return !renderMessageForModel(m, true).trim();
}

// ===== reading an image =====

export const IMAGE_READ_PROMPT = `You are reading an image someone attached while thinking out loud. Your only job is to say what is actually in it, so the rest of the system can work from text.

Rules:
- Transcribe any text, labels, headings or handwriting verbatim, preserving how it is grouped.
- Describe structure plainly: boxes, arrows and what points at what; columns and rows; the shape of a chart and its axes and rough values.
- If it is a photo or scene rather than a document, describe what it shows in two or three sentences.
- Be complete but compact. Under 200 words.
- Report ONLY what is visible. Never interpret what it means, never give advice, never draw a conclusion, and never guess at anything you cannot actually see. If part of it is illegible, say so.
- Plain prose and simple lines. No markdown headings, no commentary about the image quality.`;
