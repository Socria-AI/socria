// lib/logos5/mapSearch.ts — FINDING A CONVERSATION ON THE UNIVERSAL MAP.
//
// One search over what the map already holds (no new index, no request): conversations by their titles, the
// ideas their maps grew and where each stands now; subjects by name; ideas by the words of the idea, with the
// conversations that hold it. Each result says what kind it is, when it was last active, which subject it is
// in, and the narrowest temporal scale that shows it — so a search made on Today still finds last spring's
// conversation, says it is outside Today, and offers to show it (lib/logos5/scales.ts).
//
// PURE. No clock: the time is passed in.

import { activityOf, covers, scaleOf, type Scale } from './scales';
import type { Tile } from './universe';

export type FoundKind = 'conversation' | 'subject' | 'idea';

export interface MapFound {
  kind: FoundKind;
  /** a conversation's id; a subject's key; an idea's words, lower-cased */
  id: string;
  title: string;
  /** what matched, when it was not the title: the idea, or a line of where it stands */
  excerpt: string | null;
  /** last active (a subject or an idea: its most recent conversation) */
  at: number;
  /** the subject it is in (a subject: how many it holds) */
  where: string | null;
  /** the conversations it stands for: one for a conversation; a subject's or an idea's, newest first */
  ids: string[];
  /** the narrowest scale that shows it */
  scale: Scale;
  /** shown at the scale the map is at now */
  inView: boolean;
  /** a Core chat rather than a line of thinking */
  chat?: boolean;
}

export interface SearchIn {
  tiles: readonly Tile[];
  /** each conversation's subject: its key and its name */
  subjectOf: (id: string) => { key: string; name: string } | null;
  now: number;
  scale: Scale;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** A short line around where the words were found in a longer text. */
export function excerptAround(text: string, q: string, room = 90): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0 || t.length <= room) return t.length > room ? `${t.slice(0, room - 1).trimEnd()}…` : t;
  const start = Math.max(0, Math.min(i - Math.floor((room - q.length) / 2), t.length - room));
  return `${start > 0 ? '…' : ''}${t.slice(start, start + room).trim()}${start + room < t.length ? '…' : ''}`;
}

/** How well the words fit a title: 3 the title begins with them, 2 a word in it does, 1 anywhere in it; 0 none. */
function titleFit(title: string, q: string): number {
  const t = norm(title);
  if (t.startsWith(q)) return 3;
  if (t.includes(` ${q}`)) return 2;
  return t.includes(q) ? 1 : 0;
}

/**
 * Everything on the map the words find, best first within each kind: conversations (at most `max.conversation`),
 * then subjects, then ideas. Empty words find nothing.
 */
export function searchMap(input: SearchIn, query: string, max: Partial<Record<FoundKind, number>> = {}): MapFound[] {
  const q = norm(query);
  if (!q) return [];
  const lim = { conversation: 8, subject: 4, idea: 4, ...max };
  const { tiles, subjectOf, now, scale } = input;
  const found = (scaleOfIt: Scale) => ({ scale: scaleOfIt, inView: covers(scale, scaleOfIt) });

  // ── conversations ──
  const convs: (MapFound & { fit: number })[] = [];
  for (const t of tiles) {
    let fit = titleFit(t.title, q) * 10;
    let excerpt: string | null = null;
    if (!fit) {
      const idea = t.ideas.find((n) => norm(n.label).includes(q));
      if (idea) (fit = 6), (excerpt = idea.label);
      else if (t.stands && norm(t.stands).includes(q)) (fit = 3), (excerpt = excerptAround(t.stands, q));
    }
    if (!fit) continue;
    const s = scaleOf(t, now);
    convs.push({ kind: 'conversation', id: t.id, title: t.title, excerpt, at: activityOf(t), where: subjectOf(t.id)?.name ?? null, ids: [t.id], ...found(s), ...(t.kind === 'core' ? { chat: true } : {}), fit });
  }
  convs.sort((a, b) => b.fit - a.fit || Number(b.inView) - Number(a.inView) || b.at - a.at || (a.id < b.id ? -1 : 1));

  // ── subjects ──
  const bySubject = new Map<string, { name: string; tiles: Tile[] }>();
  for (const t of tiles) {
    const s = subjectOf(t.id);
    if (!s) continue;
    const e = bySubject.get(s.key) ?? { name: s.name, tiles: [] };
    e.tiles.push(t);
    bySubject.set(s.key, e);
  }
  const subjects: (MapFound & { fit: number })[] = [];
  for (const [key, e] of bySubject) {
    const fit = titleFit(e.name, q);
    if (!fit) continue;
    const newest = [...e.tiles].sort((a, b) => activityOf(b) - activityOf(a));
    const s = newest.reduce<Scale>((acc, t) => (covers(acc, scaleOf(t, now)) ? scaleOf(t, now) : acc), 'all');
    subjects.push({ kind: 'subject', id: key, title: e.name, excerpt: null, at: activityOf(newest[0]), where: newest.length === 1 ? 'One conversation' : `${newest.length} conversations`, ids: newest.map((t) => t.id), ...found(s), fit });
  }
  subjects.sort((a, b) => b.fit - a.fit || b.ids.length - a.ids.length || (a.id < b.id ? -1 : 1));

  // ── ideas: the words of an idea, and the conversations that hold it (two or more, or one whose title did not already match) ──
  const byIdea = new Map<string, { label: string; tiles: Tile[] }>();
  for (const t of tiles)
    for (const n of t.ideas) {
      const k = norm(n.label);
      if (!k.includes(q)) continue;
      const e = byIdea.get(k) ?? { label: n.label, tiles: [] };
      if (!e.tiles.includes(t)) e.tiles.push(t);
      byIdea.set(k, e);
    }
  const shownConv = new Set(convs.slice(0, lim.conversation).map((c) => c.id));
  const ideas: (MapFound & { fit: number })[] = [];
  for (const [k, e] of byIdea) {
    if (e.tiles.length < 2 && shownConv.has(e.tiles[0].id)) continue;
    const newest = [...e.tiles].sort((a, b) => activityOf(b) - activityOf(a));
    const s = newest.reduce<Scale>((acc, t) => (covers(acc, scaleOf(t, now)) ? scaleOf(t, now) : acc), 'all');
    ideas.push({ kind: 'idea', id: k, title: e.label, excerpt: null, at: activityOf(newest[0]), where: newest.length === 1 ? `In “${newest[0].title}”` : `In ${newest.length} conversations`, ids: newest.map((t) => t.id), ...found(s), fit: titleFit(e.label, q) });
  }
  ideas.sort((a, b) => b.fit - a.fit || b.ids.length - a.ids.length || b.at - a.at || (a.id < b.id ? -1 : 1));

  const strip = ({ fit: _fit, ...r }: MapFound & { fit: number }): MapFound => r;
  return [...convs.slice(0, lim.conversation), ...subjects.slice(0, lim.subject), ...ideas.slice(0, lim.idea)].map(strip);
}

/** The conversations most recently active, newest first: the map's "Recent". */
export function recentOf(tiles: readonly Tile[], n = 8): Tile[] {
  return [...tiles].sort((a, b) => activityOf(b) - activityOf(a) || (a.id < b.id ? -1 : 1)).slice(0, n);
}

/** "Just now", "2h ago", "Yesterday", "Tue", "Oct 14", "Mar 2025": when, in a few characters. */
export function whenShort(at: number, now: number): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const d = new Date(at);
  const n = new Date(now);
  const mins = Math.round((now - at) / 60000);
  const dayDiff = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
  if (mins < 2 && mins > -2) return 'Just now';
  if (dayDiff === 0) return mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff > 1 && dayDiff < 7) return DAYS[d.getDay()];
  if (d.getFullYear() === n.getFullYear()) return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
