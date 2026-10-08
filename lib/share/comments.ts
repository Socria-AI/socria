// lib/share/comments.ts
//
// COMMENTS, ARRANGED — the decisions behind the comments interface, pure.
//
// A comment is anchored to something: a card on a map (`node:<id>`), a turn
// in a conversation (`message:<n>`), the Project itself (`project`), or the
// whole conversation (''). A top-level comment starts a thread; replies are
// one level deep. A thread is open until resolved; a reply reopens it (the
// server does that — lib/share/collab.ts).
//
// What the interface needs from that:
//   threadsOf      the threads, open ones first, most recently active first
//   openByAnchor   how many open threads sit on each card or turn (the pins)
//   unseenCount    how many comments by other people arrived since you looked
//
// PURE.

export interface CommentItem {
  id: string;
  anchor: string;
  parentId: string | null;
  author: string;
  authorId: string;
  mine: boolean;
  body: string;
  at: number;
  edited: boolean;
  resolved: boolean;
  deleted?: boolean;
}

export interface Thread {
  root: CommentItem;
  replies: CommentItem[];
  /** the latest moment anything happened in it */
  last: number;
  open: boolean;
}

export type ThreadFilter = 'open' | 'resolved' | 'all';

export function threadsOf(comments: readonly CommentItem[]): Thread[] {
  const roots = comments.filter((c) => !c.parentId);
  const ids = new Set(roots.map((r) => r.id));
  const replies = new Map<string, CommentItem[]>();
  for (const c of comments) {
    if (!c.parentId || !ids.has(c.parentId)) continue; // an orphan reply has nothing to hang from
    (replies.get(c.parentId) ?? replies.set(c.parentId, []).get(c.parentId)!).push(c);
  }
  return roots
    .map((root) => {
      const rs = (replies.get(root.id) ?? []).sort((a, b) => a.at - b.at);
      return { root, replies: rs, last: Math.max(root.at, ...rs.map((r) => r.at)), open: !root.resolved };
    })
    .filter((t) => !t.root.deleted || t.replies.length > 0)
    .sort((a, b) => Number(b.open) - Number(a.open) || b.last - a.last);
}

export function filterThreads(threads: readonly Thread[], f: ThreadFilter): Thread[] {
  return threads.filter((t) => (f === 'all' ? true : f === 'open' ? t.open : !t.open));
}

/** Open threads per anchor — the number on a card's pin. */
export function openByAnchor(comments: readonly CommentItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of threadsOf(comments)) if (t.open) out[t.root.anchor] = (out[t.root.anchor] ?? 0) + 1;
  return out;
}

/** Comments by other people since you last looked. Your own never count. */
export function unseenCount(comments: readonly CommentItem[], seenAt: number): number {
  return comments.filter((c) => !c.mine && !c.deleted && c.at > seenAt).length;
}

/** What an anchor points at. */
export function readAnchor(anchor: string): { kind: 'node' | 'message' | 'project' | 'general'; ref: string } {
  if (anchor.startsWith('node:')) return { kind: 'node', ref: anchor.slice(5) };
  if (anchor.startsWith('message:')) return { kind: 'message', ref: anchor.slice(8) };
  if (anchor === 'project') return { kind: 'project', ref: '' };
  return { kind: 'general', ref: '' };
}

/** The first few words of a turn, to name it in a comment. */
export function excerpt(text: string, words = 8): string {
  const w = text.replace(/[#*_`>$\\]/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!w.length) return 'a turn';
  return w.length > words ? `${w.slice(0, words).join(' ')}…` : w.join(' ');
}

export const nodeAnchor = (id: string) => `node:${id}`;
export const messageAnchor = (i: number) => `message:${i}`;

/** "2 minutes ago", for a comment. */
export function whenSaid(t: number, now: number): string {
  const m = (now - t) / 60000;
  if (m < 1) return 'just now';
  if (m < 60) return `${Math.round(m)}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  if (m < 10080) return `${Math.round(m / 1440)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
