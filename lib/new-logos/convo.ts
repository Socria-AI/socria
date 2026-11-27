// lib/new-logos/convo.ts — CONVERSATIONS AS NEW LOGOS SEES THEM, without copying them.
//
// A conversation lives once, in the conversations table, read and written through the existing /api/conversations
// (GET lists, PUT saves with version checks and merging, PATCH renames). New Logos holds the row it read — the whole
// row: the save rewrites every column it is given, so a save that left out the map, the draft or the attached
// contexts would erase them for the other interface. These helpers keep that rule in one place, and hold the
// neutral wording for everything a conversation shows.
//
// Pure: no I/O.

import { stripVizOps } from '@/lib/viz-model';
import { newMsgId } from '@/lib/chat-thread';
import type { NodeRow } from './model';

/** A message as stored. Fields this interface does not know are kept as they are and sent back untouched. */
export interface StoredMessage {
  id?: string;
  at?: number;
  role: 'user' | 'assistant';
  content: string;
  [k: string]: unknown;
}

/** A conversation row as GET /api/conversations returns it. */
export interface Conversation {
  id: string;
  title: string;
  messages: StoredMessage[];
  kind?: string;
  map?: unknown;
  draft?: unknown;
  contexts?: unknown;
  projectId?: string | null;
  updatedAt: number;
  [k: string]: unknown;
}

/** Titles other interfaces give a conversation that has not been named (recognised, never shown): shown here as untitled. */
const PLACEHOLDER_TITLE = /^(?:|untitled|new (?:line of thinking|chat|thought session))$/i;
export const UNTITLED = 'Untitled conversation';

export function displayTitle(title: unknown): string {
  const t = typeof title === 'string' ? title.trim() : '';
  return PLACEHOLDER_TITLE.test(t) ? UNTITLED : t;
}

/** A title from the first thing said: its first line, cut at a word, at most 60 characters. */
export function titleFromMessage(text: string): string {
  const line = (text || '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  if (line.length <= 60) return line || UNTITLED;
  const cut = line.slice(0, 60);
  const at = cut.lastIndexOf(' ');
  return `${(at > 30 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/** The line a reply may end with to update standing instructions; not prose, never shown. */
export const REMEMBER_MARK = '[[REMEMBER]]';

/** What a person should see of a reply, streaming or finished: no instruction line, no picture-change block. */
export function visibleReply(acc: string): string {
  const at = acc.indexOf(REMEMBER_MARK);
  return stripVizOps(at === -1 ? acc : acc.slice(0, at).trimEnd());
}

/** Neutral words for a reply that did not come. Server text is never shown: it may name things this interface does not. */
export function failureText(status: number): string {
  if (status === 402) return 'The assistant is not available on this account right now: a usage limit has been reached. Your message is kept.';
  if (status === 429) return 'Too many requests at once. Wait a moment, then send again. Your message is kept.';
  if (status === 401 || status === 403) return 'You are signed out. Sign in again to continue. Your message is kept.';
  if (status === 413) return 'This conversation is too long to send in one piece.';
  return 'The assistant could not reply just now. Your message is kept; try sending again.';
}

export function newMessage(role: 'user' | 'assistant', content: string, now: number): StoredMessage {
  return { id: newMsgId(), at: now, role, content };
}

/** A new conversation id, in the format the existing application uses. */
export function newConversationId(): string {
  return 'lg_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * The body of a save: the whole row as read, with this interface's changes, plus the version it was read at (`base`)
 * and whether it has been read from the server before (`known`). `memory` is left out on purpose: the server keeps the
 * stored memory when a save does not carry one.
 */
export function saveBody(c: Conversation, base: number | null, known: boolean, now: number) {
  const { memory: _memory, ...rest } = c as Conversation & { memory?: unknown };
  void _memory;
  return { conversation: { ...rest, kind: c.kind ?? 'logos', updatedAt: now, base, known } };
}

/** Conversations not placed in any matrix: the ones with no active node. */
export function unplaced(conversations: Conversation[], nodes: NodeRow[]): Conversation[] {
  const placed = new Set(nodes.filter((n) => n.type === 'conversation' && n.archived_at === null && n.conversation_id).map((n) => n.conversation_id as string));
  return conversations.filter((c) => !placed.has(c.id));
}

/** The node that places a conversation, if any. */
export const placementOf = (nodes: NodeRow[], conversationId: string): NodeRow | undefined =>
  nodes.find((n) => n.type === 'conversation' && n.conversation_id === conversationId);

/** The messages to send to the assistant: role and words, with the stored fields it reads. */
export function forAssistant(messages: StoredMessage[]): StoredMessage[] {
  return messages.filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
}

/** Merge a freshly read list into what is held, keeping local copies that are mid-save (`busy`). */
export function mergeConversations(held: Map<string, Conversation>, fresh: Conversation[], busy: Set<string>): Map<string, Conversation> {
  const out = new Map<string, Conversation>();
  for (const c of fresh) out.set(c.id, busy.has(c.id) && held.has(c.id) ? (held.get(c.id) as Conversation) : c);
  // a conversation being created here is not on the server yet
  for (const id of busy) if (!out.has(id) && held.has(id)) out.set(id, held.get(id) as Conversation);
  return out;
}
