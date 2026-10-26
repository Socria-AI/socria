// lib/logos-sessions.ts
//
// Logos keeps more than one line of thinking. A session is a conversation and
// the map it produced, held together — reopening one has to restore both, or
// the map stops being a record of that particular piece of reasoning.
//
// Signed-in sessions sync through /api/conversations (same table as ordinary
// chats, tagged kind='logos'). Key-unlocked visitors have no account to sync
// to, so they get the same thing in localStorage.

import { topicTitle } from './logos5/title';
import { EMPTY_MAP, type ThinkingMap } from './logos';
import type { Attachment } from './logos-attachments';
import { sanitizeContexts, type NodeContexts } from './logos-sources';
import type { ByRef } from './logos';
import type { Synthesis } from './logos-synthesis';
import type { InlineState } from './inline-ui';
import type { AboutRef, ReplyRef } from './chat-thread';
import type { WriteDoc } from './write/doc';
import { normalizeDraft } from './write/parse';

export interface LogosMsg {
  /**
   * Its name, given where it was made (lib/chat-thread.ts newMsgId) — how two
   * screens agree which message is which, and what a reply points at. Turns
   * written before ids existed have none, and are matched as they always were.
   */
  id?: string;
  /** when it was said */
  at?: number;
  role: 'user' | 'assistant';
  content: string;
  /** the message this one answers — its own snapshot, so the quote outlives the original */
  replyTo?: ReplyRef;
  /** Point & Ask: what was selected in the workspace when it was sent — a snapshot (lib/chat-thread.ts) */
  about?: AboutRef;
  /** notes and images brought into the conversation with this turn */
  attachments?: Attachment[];
  /** who wrote it, when two people are thinking together — see lib/collab.ts */
  by?: ByRef;
  /** Socria's synthesis of the map, when this message is one — lib/logos-synthesis.ts */
  synthesis?: Synthesis;
  /**
   * What was done with the inline elements in this reply — a slider moved, a
   * choice tapped, a draft edited — by the element's position in it
   * (lib/inline-ui.ts InlineState). The reply's words are never changed.
   */
  ui?: Record<string, InlineState>;
  /**
   * What was asked to be made with this turn beyond its words: a custom
   * artifact from one of the person's own templates carries the template
   * (lib/logos5/templates.ts), read by the map pass and nowhere else.
   */
  make?: { template?: { name: string; blocks: unknown[] } };
  /** said, not typed — Socria Voice (lib/voice/speech.ts): marked with a microphone, and read generously for a misheard word */
  via?: 'voice';
}

/**
 * What the person actually wrote. Theirs — Logos never writes into it. The
 * document of the Draft Space and the Writing Space (lib/write/doc.ts), with
 * its title and an HTML rendering kept beside it for anything older.
 */
export interface LogosDraft {
  title: string;
  html: string;
  doc?: WriteDoc;
}

export const EMPTY_DRAFT: LogosDraft = { title: '', html: '' };

export interface LogosSession {
  id: string;
  title: string;
  messages: LogosMsg[];
  map: ThinkingMap;
  draft?: LogosDraft;
  /** grounded material, keyed by the node it grounds */
  contexts?: NodeContexts;
  /**
   * The Project this line of thinking is filed under, if any. The same field
   * a Core chat carries (app/chat/page.tsx) — the two kinds share a table and
   * a rail, so they share the folder. Null and absent both mean unfiled.
   */
  projectId?: string | null;
  updatedAt: number;
}

export const LOCAL_KEY = 'socria.logos.sessions.v1';
export const LOCAL_ACTIVE_KEY = 'socria.logos.activeSession.v1';
const MAX_LOCAL = 40;

export const UNTITLED = 'New line of thinking';

export function newSessionId(): string {
  return 'lg_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptySession(): LogosSession {
  return {
    id: newSessionId(),
    title: UNTITLED,
    messages: [],
    map: { ...EMPTY_MAP },
    draft: { ...EMPTY_DRAFT },
    contexts: {},
    updatedAt: Date.now(),
  };
}

/**
 * A session is named for what it is about — never the request itself
 * (Alex Tran, Logos 5 Comments v2): "Help me study for this big bio test
 * tomorrow night please" is "Biology – Exam Review", at most seven words
 * (lib/logos5/title.ts). A small model may name it better once, after the
 * first reply; a name the person gave is never replaced.
 */
export function titleFor(messages: LogosMsg[]): string {
  const firstTurn = messages.find((m) => m.role === 'user');
  // A turn can be nothing but an attachment — name it after that rather than
  // leaving the session untitled forever.
  const first =
    firstTurn?.content?.trim() ||
    firstTurn?.attachments?.[0]?.name ||
    (firstTurn?.attachments?.length
      ? firstTurn.attachments[0].kind === 'image'
        ? 'An image'
        : firstTurn.attachments[0].kind === 'doc'
          ? 'A document'
          : 'A note'
      : '');
  if (!first) return UNTITLED;
  const topic = firstTurn?.content?.trim() ? topicTitle(first) : '';
  if (topic) return topic;
  const clean = first.replace(/\s+/g, ' ');
  return clean.length > 52 ? clean.slice(0, 52).trimEnd() + '…' : clean;
}

export function sortSessions(list: LogosSession[]): LogosSession[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadLocal(): LogosSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s: any) => s && typeof s.id === 'string' && Array.isArray(s.messages))
      .map((s: any) => ({
        id: s.id,
        title: typeof s.title === 'string' ? s.title : UNTITLED,
        messages: s.messages,
        map: s.map && Array.isArray(s.map.nodes) ? s.map : { ...EMPTY_MAP },
        // an old draft opens as a document, every word kept (lib/write/parse.ts)
        draft: normalizeDraft(s.draft),
        contexts: sanitizeContexts(s.contexts),
        projectId: typeof s.projectId === 'string' ? s.projectId : null,
        updatedAt: Number(s.updatedAt) || 0,
      }));
  } catch {
    return [];
  }
}

export function saveLocal(list: LogosSession[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(sortSessions(list).slice(0, MAX_LOCAL)));
  } catch {
    // Out of quota, private mode — losing local history is survivable.
  }
}

/** "3m", "2h", "Tue" — enough to place a session without a full timestamp. */
export function relTime(ts: number): string {
  if (!ts) return '';
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 60) return 'now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
