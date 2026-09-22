import 'server-only';
// lib/logos-rooms-shared.ts
//
// The one thing a client may hand the server about a room's starting point,
// and what survives the handing.
//
// A room's seed is the host's own session at the moment they opened the room.
// It arrives from a browser, so it gets the same treatment as any stored
// session: the map through the map sanitiser, the messages trimmed to shape
// and length, and nothing else carried across. In particular no `by` is kept
// — at creation the room is empty and every word in it is the host's, and the
// server stamps authorship itself rather than believing a field.

import { sanitizeMap } from './logos';

const MAX_MESSAGES = 200;
const MAX_CONTENT = 12_000;
const MAX_TITLE = 200;

export function sanitizeSeedSession(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const messages = Array.isArray(r.messages)
    ? (r.messages as unknown[])
        .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-MAX_MESSAGES)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: (m.content as string).slice(0, MAX_CONTENT),
        }))
    : [];
  return {
    id: r.id.slice(0, 64),
    title: typeof r.title === 'string' ? r.title.slice(0, MAX_TITLE) : 'A shared line of thinking',
    messages,
    map: sanitizeMap(r.map),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
  };
}
