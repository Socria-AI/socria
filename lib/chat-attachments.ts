// lib/chat-attachments.ts
//
// What Core 4 sees of the files and images attached in a conversation.
//
// Logos keeps the whole of a note only on the turn it arrives and shows the
// model a 700-character opening after that. That is right for a pasted page
// of thinking and wrong for a document: people attach a paper and then ask
// about it for ten turns, and by turn two the model would be answering from
// its first paragraph. So Core 4 spends a BUDGET instead — the newest files
// go in whole, and only once the budget is spent do older ones shrink to
// their opening, each saying that it has.
//
// Whose words they are is carried on every block, as it is in Logos: a
// document someone attached is source material, not their position, and the
// Mind Graph must not learn otherwise.
//
// Pure. Used by the chat route; the composer only builds the attachments.

import { sanitizeAttachments, wordCount, type Attachment } from './logos-attachments';
import { MAX_FILE_TEXT } from './file-kinds';

/** Characters of attached text across the whole history — about 30k tokens. */
export const ATTACHMENT_BUDGET = 120_000;
/**
 * The most the turn being answered may spend on its own files — about 50k
 * tokens.
 *
 * The rule below is that what they just handed over goes in whole, and it was
 * unconditional: the server takes six attachments of up to 60k characters each,
 * so one turn could carry 360k characters of files and the "budget" bounded
 * none of it. Measured at 488k characters (~122k tokens) across a history,
 * which overflows the fallback model's window once the system prompt is added —
 * and an overflow was then misread as a rejected model id and retried whole.
 * Within this ceiling nothing changes: a long paper is ~60k characters.
 */
export const TURN_ATTACHMENT_MAX = 200_000;
/** What an older file is reduced to once the budget is spent. */
export const OPENING_CHARS = 1_200;
/** What the Mind Graph reads of each file on the turn it arrives. */
export const REMEMBER_CHARS = 3_000;

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
}

/** Every message's attachments, made safe. The one entry point from a request. */
export function sanitizeChatMessages(raw: unknown[]): ChatMsg[] {
  return raw
    .filter(
      (m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    )
    .map((m: any) => {
      const attachments = m.role === 'user' ? sanitizeAttachments(m.attachments, MAX_FILE_TEXT) : [];
      return {
        role: m.role,
        content: m.content,
        ...(attachments.length ? { attachments } : {}),
      };
    });
}

function whose(a: Attachment): string {
  return a.origin === 'mine'
    ? 'their own writing'
    : a.origin === 'context'
      ? 'context they supplied, not necessarily their view'
      : 'source material, NOT their own position';
}

function noteBlock(a: Attachment, keep: 'full' | 'opening' | 'name'): string {
  const text = a.text ?? '';
  const words = (a.words ?? wordCount(text)).toLocaleString('en-US');
  const name = a.name ? `“${a.name}”` : 'pasted text';
  const cut = a.truncated ? ' The file was longer; this is as much of it as Socria keeps.' : '';
  if (keep === 'name') {
    return (
      `[Attached file ${name} — ${whose(a)} — ${words} words. Attached earlier and not shown here: ` +
      `this conversation is carrying more attached text than fits. If they ask about it, say so and ask ` +
      `them to attach it again.]`
    );
  }
  if (keep === 'full' || text.length <= OPENING_CHARS) {
    return `[Attached file ${name} — ${whose(a)} — ${words} words.${cut}]\n${text}`;
  }
  return (
    `[Attached file ${name} — ${whose(a)} — ${words} words. Attached earlier; only its opening is shown ` +
    `here. If they ask about a part not shown, say you can see only the opening now and ask them to attach it again.]\n` +
    `${text.slice(0, OPENING_CHARS)}…`
  );
}

function imageBlock(a: Attachment): string {
  const name = a.name ? `“${a.name}”` : '';
  return a.reading
    ? `[Attached image ${name}, as read — a description of what is visible in it]\n${a.reading}`
    : `[Attached image ${name} — it could not be read]`;
}

/**
 * The conversation as the model receives it: each user turn's words, then
 * its attachments, with the newest files kept whole until the budget runs out.
 */
export function renderForModel(
  messages: readonly ChatMsg[],
  budget = ATTACHMENT_BUDGET
): { role: 'user' | 'assistant'; content: string }[] {
  let left = budget;
  // What the turn being answered has spent on its own files, which is bounded
  // separately: its allowance is its own, so a long attachment does not push
  // the rest of the conversation out, and a pathological one cannot push the
  // whole request past the model's window.
  let spentHere = 0;
  const rendered: { role: 'user' | 'assistant'; content: string }[] = new Array(messages.length);
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const here = i === messages.length - 1;
    const parts: string[] = [];
    if (m.content.trim()) parts.push(m.content);
    for (const a of m.attachments ?? []) {
      if (a.kind === 'image') {
        parts.push(imageBlock(a));
        continue;
      }
      const len = (a.text ?? '').length;
      // The turn being answered gets its files whole — it is what they just
      // handed over — up to its own ceiling, and it counts against what is left
      // for the rest. A note the browser already cut to its opening stays one.
      const full = !a.opening && (here ? spentHere + len <= TURN_ATTACHMENT_MAX : len <= left);
      // Once there is nothing left, an older file is named rather than opened:
      // an opening was appended however deep into deficit `left` already was,
      // so the stated budget bounded neither end of the history.
      parts.push(noteBlock(a, full ? 'full' : left > 0 || here ? 'opening' : 'name'));
      const spent = full ? len : left > 0 || here ? Math.min(len, OPENING_CHARS) : 0;
      left -= spent;
      if (here) spentHere += spent;
    }
    rendered[i] = { role: m.role, content: parts.join('\n\n') };
  }
  return rendered;
}

/** One line per attachment: for the state reader and memory seeds, where the body would drown the words. */
export function attachmentLine(m: ChatMsg): string {
  const names = (m.attachments ?? []).map((a) =>
    a.kind === 'image' ? `image ${a.name ?? ''}`.trim() : `${a.name ?? 'text'} (${(a.words ?? 0).toLocaleString('en-US')} words)`
  );
  return names.length ? `[attached: ${names.join(', ')}]` : '';
}

/** A message with its attachments NAMED, not included. */
export function briefly(m: ChatMsg): string {
  return [m.content, attachmentLine(m)].filter((s) => s.trim()).join(' ');
}

/**
 * What the Mind Graph reads of the turn: the words, and the opening of each
 * file, labelled with whose it is so the extractor's register rules can hold.
 */
export function forMemory(m: ChatMsg): string {
  const parts = [m.content];
  for (const a of m.attachments ?? []) {
    if (a.kind === 'image') {
      if (a.reading) parts.push(`[Image they attached, as read]\n${a.reading}`);
    } else if (a.text) {
      parts.push(
        `[File they attached${a.name ? ` “${a.name}”` : ''} — ${whose(a)}]\n${a.text.slice(0, REMEMBER_CHARS)}${
          a.text.length > REMEMBER_CHARS ? '…' : ''
        }`
      );
    }
  }
  return parts.filter((s) => s.trim()).join('\n\n');
}

/** True when a user turn carries something to answer: words, or a readable attachment. */
export function hasSubstance(m: ChatMsg): boolean {
  return !!m.content.trim() || (m.attachments ?? []).some((a) => (a.kind === 'note' ? !!a.text : !!a.reading));
}

/**
 * The conversation as the BROWSER sends it: the same budget applied before
 * the request leaves, so a long conversation full of files does not post
 * megabytes the server would only cut. Older notes travel as their opening,
 * marked so the server labels them that way; image previews stay home — the
 * model reads the reading, never the picture.
 *
 * Other Cores take no attachments, so for them the files are left out
 * entirely and only the words go.
 */
export function forRequest(messages: readonly ChatMsg[], takesFiles: boolean, budget = ATTACHMENT_BUDGET): ChatMsg[] {
  if (!takesFiles) return messages.map((m) => ({ role: m.role, content: m.content }));
  let left = budget;
  const out: ChatMsg[] = new Array(messages.length);
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m.attachments?.length) {
      out[i] = { role: m.role, content: m.content };
      continue;
    }
    const attachments = m.attachments.map((a) => {
      if (a.kind === 'image') {
        const { thumb: _t, preview: _p, ...rest } = a;
        return rest;
      }
      const len = (a.text ?? '').length;
      if (!a.opening && (i === messages.length - 1 || len <= left)) {
        left -= len;
        return a;
      }
      left -= Math.min(len, OPENING_CHARS);
      return { ...a, text: (a.text ?? '').slice(0, OPENING_CHARS), opening: true };
    });
    out[i] = { role: m.role, content: m.content, attachments };
  }
  return out;
}

/** Words only, with attachments named — for the background passes (thread memory, journey). */
export function wordsOnly(messages: readonly ChatMsg[]): { role: 'user' | 'assistant'; content: string }[] {
  return messages.map((m) => ({ role: m.role, content: briefly(m) }));
}
