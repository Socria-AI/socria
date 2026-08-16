// lib/logos-sessions.ts
//
// Logos keeps more than one line of thinking. A session is a conversation and
// the map it produced, held together — reopening one has to restore both, or
// the map stops being a record of that particular piece of reasoning.
//
// Signed-in sessions sync through /api/conversations (same table as ordinary
// chats, tagged kind='logos'). Key-unlocked visitors have no account to sync
// to, so they get the same thing in localStorage.

import { EMPTY_MAP, type ThinkingMap } from './logos';
import type { Attachment } from './logos-attachments';

export interface LogosMsg {
  role: 'user' | 'assistant';
  content: string;
  /** notes and images brought into the conversation with this turn */
  attachments?: Attachment[];
}

export interface LogosSession {
  id: string;
  title: string;
  messages: LogosMsg[];
  map: ThinkingMap;
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
    updatedAt: Date.now(),
  };
}

/** A session is named by the thought that started it, not by a summary. */
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
        : 'A note'
      : '');
  if (!first) return UNTITLED;
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
