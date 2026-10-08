'use client';
// components/share/comments/useComments.ts
//
// The comments on one shared thing — read, kept fresh by a quiet poll, and
// written through /api/shared/comments, where every permission is decided.
// Also remembers, in this browser, when you last looked, so new comments by
// other people can be counted.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { threadsOf, unseenCount, type CommentItem } from '@/lib/share/comments';
import { can, type ResourceType, type Role } from '@/lib/share/roles';

const POLL_MS = 5000;

export function useComments(type: ResourceType, id: string | null, enabled: boolean) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seenAt, setSeenAt] = useState(0);
  const key = id ? `socria.comments.seen.v1:${type}:${id}` : null;
  const live = useRef(true);

  useEffect(() => {
    if (!key) return;
    try {
      setSeenAt(Number(localStorage.getItem(key)) || 0);
    } catch {
      setSeenAt(0);
    }
  }, [key]);

  const load = useCallback(async () => {
    if (!enabled || !id) return;
    const res = await fetch(`/api/shared/comments?type=${type}&id=${encodeURIComponent(id)}`, { cache: 'no-store' }).catch(() => null);
    const j = res && res.ok ? await res.json().catch(() => null) : null;
    if (!live.current || !j) return;
    setComments(Array.isArray(j.comments) ? j.comments : []);
    if (j.role) setRole(j.role);
  }, [type, id, enabled]);

  useEffect(() => {
    live.current = true;
    setComments([]);
    setRole(null);
    if (!enabled || !id) return;
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    return () => {
      live.current = false;
      clearInterval(t);
    };
  }, [enabled, id, load]);

  const send = useCallback(
    async (method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<boolean> => {
      if (!id) return false;
      setError(null);
      const res = await fetch('/api/shared/comments', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id, ...body }),
      }).catch(() => null);
      const j = res ? await res.json().catch(() => null) : null;
      if (!res || !res.ok) {
        setError(j?.error || 'That could not be saved just now.');
        return false;
      }
      setComments(Array.isArray(j?.comments) ? j.comments : []);
      if (j?.role) setRole(j.role);
      return true;
    },
    [type, id]
  );

  const add = useCallback((anchor: string, body: string, parentId?: string | null) => send('POST', { anchor, body, parentId: parentId ?? null }), [send]);
  const change = useCallback(
    (commentId: string, c: { resolve?: boolean; body?: string; remove?: boolean }) => send('PATCH', { commentId, ...c }),
    [send]
  );

  /** I have looked: everything up to now is seen. */
  const markSeen = useCallback(() => {
    const now = Date.now();
    setSeenAt(now);
    try {
      if (key) localStorage.setItem(key, String(now));
    } catch {}
  }, [key]);

  const threads = useMemo(() => threadsOf(comments), [comments]);
  return {
    comments,
    threads,
    role,
    error,
    /** may write a comment or a reply */
    mayComment: can(role, 'comment'),
    /** may resolve anyone's thread (authors may always resolve their own) */
    mayResolveAny: can(role, 'edit'),
    isOwner: role === 'owner',
    unseen: unseenCount(comments, seenAt),
    open: threads.filter((t) => t.open).length,
    add,
    change,
    markSeen,
    reload: load,
  };
}

export type CommentsState = ReturnType<typeof useComments>;
