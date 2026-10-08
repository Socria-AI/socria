import 'server-only';
// lib/share/collab.ts
//
// THINK TOGETHER on anything shared: comments, presence (who is here and
// where their pointer is) and history — each behind the same gate as the
// content (lib/share/server.ts shareAccess), each enforced on the server.
//
//   comment  commenter and up may write; anyone with access may read; the
//            author may edit or delete their own; the owner and editors may
//            resolve any, and the owner may delete any
//   presence anyone with access, including a viewer — being seen looking is
//            not editing
//
// Nothing here ever carries an email address or an account id to another
// person: authors and the present are named by display name and a per-share
// alias.

import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { can, type ResourceType, type Role } from './roles';
import { ShareError, displayNameOf, noteChange, shareAccess } from './server';

const alias = (salt: string, userId: string) => createHash('sha256').update(`${salt}:${userId}`).digest('hex').slice(0, 12);
const missing = (e: { code?: string; message?: string } | null) =>
  !!e && (['42p01', 'pgrst205'].includes(String(e.code).toLowerCase()) || /relation ".*" does not exist/i.test(e.message ?? ''));

export const ANCHOR = /^(message:\d{1,4}|node:[A-Za-z0-9_-]{1,40}|project|chat|)$/;
export const MAX_COMMENT = 2000;
/** a heartbeat older than this is someone who has left */
export const PRESENT_MS = 30_000;

export interface CommentView {
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
}

async function gate(userId: string, type: ResourceType, id: string): Promise<{ role: Role; salt: string }> {
  const a = await shareAccess(userId, type, id);
  if (!a) throw new ShareError(404, 'No such thing.');
  return { role: a.role, salt: a.shareId ?? id };
}

export async function listComments(userId: string, type: ResourceType, id: string): Promise<CommentView[]> {
  const { salt } = await gate(userId, type, id);
  const { data, error } = await supabaseAdmin().from('share_comments').select('*')
    .eq('resource_type', type).eq('resource_id', id).order('created_at', { ascending: true }).limit(500);
  if (error) {
    if (missing(error)) return [];
    throw error;
  }
  return ((data ?? []) as Record<string, unknown>[])
    .filter((r) => !r.deleted_at)
    .map((r) => ({
      id: String(r.id),
      anchor: String(r.anchor ?? ''),
      parentId: (r.parent_id as string) ?? null,
      author: String(r.display_name ?? 'Someone'),
      authorId: alias(salt, String(r.user_id)),
      mine: r.user_id === userId,
      body: String(r.body),
      at: Number(r.created_at),
      edited: !!r.edited_at,
      resolved: !!r.resolved_at,
    }));
}

export async function addComment(
  userId: string, type: ResourceType, id: string, anchor: string, body: string, parentId: string | null
): Promise<void> {
  const { role } = await gate(userId, type, id);
  if (!can(role, 'comment')) throw new ShareError(403, 'You can read this, but not comment on it.');
  const text = body.replace(/\r/g, '').trim().slice(0, MAX_COMMENT);
  if (!text) throw new ShareError(400, 'Say something first.');
  if (!ANCHOR.test(anchor)) throw new ShareError(400, 'Comment on something that is here.');
  const shareId = (await shareAccess(userId, type, id))?.shareId ?? '';
  const name = await displayNameOf(userId);
  const { error } = await supabaseAdmin().from('share_comments').insert({
    id: `cm_${randomBytes(9).toString('base64url')}`,
    share_id: shareId, resource_type: type, resource_id: id,
    anchor, parent_id: parentId, user_id: userId, display_name: name, body: text, created_at: Date.now(),
  });
  if (error) {
    if (missing(error)) throw new ShareError(503, 'Comments are not set up on this deployment yet.');
    throw error;
  }
  await noteChange(userId, type, id, 'comment', `${name} commented`);
}

export async function changeComment(
  userId: string, type: ResourceType, id: string, commentId: string, change: { resolve?: boolean; body?: string; remove?: boolean }
): Promise<void> {
  const { role } = await gate(userId, type, id);
  const { data } = await supabaseAdmin().from('share_comments').select('*')
    .eq('id', commentId).eq('resource_type', type).eq('resource_id', id).maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row || row.deleted_at) throw new ShareError(404, 'No such comment.');
  const mine = row.user_id === userId;
  const patch: Record<string, unknown> = {};
  if (change.remove) {
    if (!mine && role !== 'owner') throw new ShareError(403, 'Only its author or the owner can delete a comment.');
    patch.deleted_at = Date.now();
  }
  if (change.body !== undefined) {
    if (!mine) throw new ShareError(403, 'Only its author can edit a comment.');
    const text = change.body.trim().slice(0, MAX_COMMENT);
    if (!text) throw new ShareError(400, 'A comment cannot be empty.');
    patch.body = text;
    patch.edited_at = Date.now();
  }
  if (change.resolve !== undefined) {
    if (!mine && !can(role, 'edit')) throw new ShareError(403, 'Only its author, an editor or the owner can resolve it.');
    patch.resolved_at = change.resolve ? Date.now() : null;
    patch.resolved_by = change.resolve ? userId : null;
  }
  if (!Object.keys(patch).length) throw new ShareError(400, 'Nothing to change.');
  const { error } = await supabaseAdmin().from('share_comments').update(patch).eq('id', commentId);
  if (error) throw error;
}

export interface Present {
  id: string;
  name: string;
  you: boolean;
  role: Role;
  cursor: { x: number; y: number; on?: string } | null;
  at: number;
}

/** A heartbeat: I am here (and my pointer is here). Answers with who else is. */
export async function heartbeat(
  userId: string, type: ResourceType, id: string, cursor: unknown
): Promise<{ role: Role; present: Present[] }> {
  const access = await shareAccess(userId, type, id);
  if (!access) throw new ShareError(404, 'No such thing.');
  const salt = access.shareId ?? id;
  const c = cursor && typeof cursor === 'object' ? (cursor as Record<string, unknown>) : null;
  const clean = c && Number.isFinite(c.x) && Number.isFinite(c.y)
    ? { x: Math.max(-1e5, Math.min(1e5, Number(c.x))), y: Math.max(-1e5, Math.min(1e5, Number(c.y))), ...(typeof c.on === 'string' && /^[a-z]{1,16}$/.test(c.on) ? { on: c.on } : {}) }
    : null;
  const now = Date.now();
  const db = supabaseAdmin();
  const up = await db.from('share_presence').upsert({
    resource_type: type, resource_id: id, user_id: userId,
    display_name: await displayNameOf(userId), cursor: clean, seen_at: now,
  });
  if (up.error && !missing(up.error)) throw up.error;
  const { data } = await db.from('share_presence').select('user_id, display_name, cursor, seen_at')
    .eq('resource_type', type).eq('resource_id', id);
  const rows = ((data ?? []) as Record<string, unknown>[]).filter((r) => now - Number(r.seen_at) < PRESENT_MS);
  const roles = new Map<string, Role>();
  for (const r of rows) {
    const uid = String(r.user_id);
    if (!roles.has(uid)) roles.set(uid, (await shareAccess(uid, type, id))?.role ?? 'viewer');
  }
  return {
    role: access.role,
    present: rows
      .filter((r) => roles.has(String(r.user_id)))
      .map((r) => ({
        id: alias(salt, String(r.user_id)),
        name: String(r.display_name ?? 'Someone'),
        you: r.user_id === userId,
        role: roles.get(String(r.user_id))!,
        cursor: (r.cursor as Present['cursor']) ?? null,
        at: Number(r.seen_at),
      })),
  };
}

/** Leaving: the row goes, so nobody sees a ghost for half a minute. */
export async function leave(userId: string, type: ResourceType, id: string): Promise<void> {
  await supabaseAdmin().from('share_presence').delete().eq('resource_type', type).eq('resource_id', id).eq('user_id', userId);
}
