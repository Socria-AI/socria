import 'server-only';
// lib/share/server.ts
//
// SHARING, ENFORCED. Every read or write a collaborator makes goes through
// here, and every answer is a role from lib/share/roles.ts — checked on the
// server, against the database, on every request. The client is told what it
// may draw; it is never trusted with what it may do.
//
// THE MODEL. A resource (a Project, a conversation) keeps its owner: its rows
// stay keyed to them, and the owner-scoped reads underneath (`.eq('user_id')`
// everywhere) are never loosened. A share is a row beside it saying who else
// may reach it and as what:
//
//   members   people, by account or — until they sign in — by email
//   a link    anyone signed in who holds it joins with the link's role
//   a code    eight characters, readable aloud, the same
//
// A conversation filed in a shared Project is shared with the Project's
// people at their Project role; a direct share can only raise that, never
// lower it.
//
// TOKENS ARE NOT STORED. A link token is an HMAC of the share id and a random
// nonce under a server secret — so the owner can copy it again later, and
// "Reset link" (a new nonce) kills every copy of the old one. Only its hash is
// kept, for lookup. An emailed invite's token is stored hashed and nothing
// else; it is shown once, in the email.
//
// PRIVACY. Names shown to other people are first names or usernames, never
// email addresses (the one exception: an owner sees the address they typed
// for a pending invite). Nothing here ever reads a Mind graph.

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { clerkClient } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  CODE_LEN,
  codeFrom,
  stronger,
  type GrantRole,
  type ResourceType,
  type Role,
} from './roles';

// ── shapes ──────────────────────────────────────────────────────────

export interface ShareRow {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  ownerId: string;
  linkRole: GrantRole | null;
  linkNonce: string | null;
  code: string | null;
  codeRole: GrantRole | null;
  createdAt: number;
  updatedAt: number;
}

export interface MemberRow {
  id: string;
  shareId: string;
  userId: string | null;
  email: string | null;
  role: GrantRole;
  via: 'email' | 'link' | 'code';
  invitedBy: string;
  displayName: string | null;
  createdAt: number;
  acceptedAt: number | null;
  removedAt: number | null;
}

export interface Access {
  ownerId: string;
  role: Role;
  /** the share that grants it — null for the owner of an unshared resource */
  shareId: string | null;
  /** reached through the conversation's Project rather than the conversation */
  inherited?: boolean;
}

export class ShareError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ── small things ────────────────────────────────────────────────────

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const newId = (p: string) => `${p}_${randomBytes(9).toString('base64url')}`;
export const newCode = () => codeFrom(randomBytes(CODE_LEN));
const newNonce = () => randomBytes(12).toString('base64url');

function secret(): string {
  const s = process.env.SHARE_SECRET || process.env.CLERK_SECRET_KEY || process.env.EMAIL_SECRET;
  if (!s) throw new ShareError(503, 'Sharing is not configured on this deployment (no SHARE_SECRET).');
  return s;
}
/** The link token for a share's current nonce — derived, never stored. */
export function linkToken(shareId: string, nonce: string): string {
  return createHmac('sha256', secret()).update(`${shareId}:${nonce}`).digest('base64url').slice(0, 32);
}

/** A missing table is "sharing is not set up", not a crash and not "no access". */
function missing(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false;
  const c = (e.code ?? '').toLowerCase();
  return c === '42p01' || c === 'pgrst205' || /relation ".*" does not exist/i.test(e.message ?? '');
}

function rowToShare(r: Record<string, unknown>): ShareRow {
  return {
    id: String(r.id),
    resourceType: r.resource_type as ResourceType,
    resourceId: String(r.resource_id),
    ownerId: String(r.owner_id),
    linkRole: (r.link_role as GrantRole) ?? null,
    linkNonce: (r.link_nonce as string) ?? null,
    code: (r.code as string) ?? null,
    codeRole: (r.code_role as GrantRole) ?? null,
    createdAt: Number(r.created_at ?? 0),
    updatedAt: Number(r.updated_at ?? 0),
  };
}
function rowToMember(r: Record<string, unknown>): MemberRow {
  return {
    id: String(r.id),
    shareId: String(r.share_id),
    userId: (r.user_id as string) ?? null,
    email: (r.email as string) ?? null,
    role: r.role as GrantRole,
    via: (r.via as MemberRow['via']) ?? 'email',
    invitedBy: String(r.invited_by ?? ''),
    displayName: (r.display_name as string) ?? null,
    createdAt: Number(r.created_at ?? 0),
    acceptedAt: r.accepted_at == null ? null : Number(r.accepted_at),
    removedAt: r.removed_at == null ? null : Number(r.removed_at),
  };
}

/** A first name or username — never an email. */
export async function displayNameOf(userId: string): Promise<string> {
  try {
    const u = await clerkClient().users.getUser(userId);
    return (u.firstName || u.username || 'Someone').slice(0, 40);
  } catch {
    return 'Someone';
  }
}

/** The verified addresses on an account, lowercased. */
async function verifiedEmails(userId: string): Promise<string[]> {
  try {
    const u = await clerkClient().users.getUser(userId);
    return (u.emailAddresses ?? [])
      .filter((e) => e.verification?.status === 'verified')
      .map((e) => e.emailAddress.toLowerCase());
  } catch {
    return [];
  }
}

/** An account holding this verified address, if there is exactly one. */
async function userByEmail(email: string): Promise<string | null> {
  try {
    const { data } = await clerkClient().users.getUserList({ emailAddress: [email], limit: 2 });
    const hits = (data ?? []).filter((u) =>
      (u.emailAddresses ?? []).some((e) => e.emailAddress.toLowerCase() === email && e.verification?.status === 'verified')
    );
    return hits.length === 1 ? hits[0].id : null;
  } catch {
    return null;
  }
}

// ── the resource and its owner ──────────────────────────────────────

export interface ResourceInfo {
  ownerId: string;
  /** a conversation's Project, for inherited access */
  projectId: string | null;
  kind: 'chat' | 'logos' | 'project';
  title: string;
  /** a conversation kept off the record cannot be shared */
  incognito: boolean;
}

/**
 * Who owns a resource. Ids are random and global in practice; if two owners
 * somehow hold the same id, the answer is "nobody", not a guess.
 */
export async function resourceInfo(type: ResourceType, id: string): Promise<ResourceInfo | null> {
  const db = supabaseAdmin();
  if (type === 'project') {
    const { data, error } = await db.from('mind_projects').select('user_id, name').eq('id', id).limit(2);
    if (error || !data || data.length !== 1) return null;
    const r = data[0] as Record<string, unknown>;
    return { ownerId: String(r.user_id), projectId: null, kind: 'project', title: String(r.name ?? ''), incognito: false };
  }
  // Newest columns first, each dropped in turn on a database that predates it.
  let data: Record<string, unknown>[] | null = null;
  for (const cols of ['user_id, project_id, kind, title, incognito', 'user_id, project_id, kind, title', 'user_id, kind, title', 'user_id, title']) {
    const r = await db.from('conversations').select(cols).eq('id', id).limit(2);
    if (!r.error) {
      data = r.data as unknown as Record<string, unknown>[];
      break;
    }
    if (!/column|does not exist|PGRST204|42703/i.test(`${r.error.code} ${r.error.message}`)) return null;
  }
  if (!data || data.length !== 1) return null;
  const r = data[0] as Record<string, unknown>;
  return {
    ownerId: String(r.user_id),
    projectId: typeof r.project_id === 'string' ? r.project_id : null,
    kind: r.kind === 'logos' ? 'logos' : 'chat',
    title: String(r.title ?? ''),
    incognito: r.incognito === true,
  };
}

export async function shareFor(ownerId: string, type: ResourceType, id: string): Promise<ShareRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('shares').select('*').eq('owner_id', ownerId).eq('resource_type', type).eq('resource_id', id).maybeSingle();
  if (error) {
    if (missing(error)) return null;
    throw error;
  }
  return data ? rowToShare(data as Record<string, unknown>) : null;
}

async function ensureShare(ownerId: string, type: ResourceType, id: string): Promise<ShareRow> {
  const found = await shareFor(ownerId, type, id);
  if (found) return found;
  const now = Date.now();
  const row = { id: newId('sh'), resource_type: type, resource_id: id, owner_id: ownerId, created_at: now, updated_at: now };
  const { error } = await supabaseAdmin().from('shares').insert(row);
  if (error) {
    if (missing(error)) throw new ShareError(503, 'Sharing is not set up on this deployment yet.');
    // a concurrent first share: read the one that won
    const again = await shareFor(ownerId, type, id);
    if (again) return again;
    throw error;
  }
  return rowToShare(row);
}

async function activeMembers(shareId: string): Promise<MemberRow[]> {
  const { data, error } = await supabaseAdmin()
    .from('share_members').select('*').eq('share_id', shareId).is('removed_at', null);
  if (error) {
    if (missing(error)) return [];
    throw error;
  }
  return ((data ?? []) as Record<string, unknown>[]).map(rowToMember);
}

// ── THE GATE ────────────────────────────────────────────────────────

/**
 * What this person may do with this resource: a role, or null.
 *
 * The owner is the owner. Anybody else needs an active membership — on the
 * resource itself or, for a conversation, on the Project it is filed in, at
 * that Project's owner — and gets the stronger of the two.
 */
export async function shareAccess(userId: string, type: ResourceType, id: string): Promise<Access | null> {
  if (!userId || !id) return null;
  const info = await resourceInfo(type, id);
  if (!info) return null;
  if (info.ownerId === userId) {
    const s = await shareFor(userId, type, id).catch(() => null);
    return { ownerId: userId, role: 'owner', shareId: s?.id ?? null };
  }
  let best: Access | null = null;
  const s = await shareFor(info.ownerId, type, id);
  if (s) {
    const m = (await activeMembers(s.id)).find((x) => x.userId === userId);
    if (m) best = { ownerId: info.ownerId, role: m.role, shareId: s.id };
  }
  if (type === 'conversation' && info.projectId) {
    const ps = await shareFor(info.ownerId, 'project', info.projectId);
    if (ps) {
      const m = (await activeMembers(ps.id)).find((x) => x.userId === userId);
      if (m) {
        const role = stronger(best?.role ?? null, m.role)!;
        best = { ownerId: info.ownerId, role, shareId: best?.role === role ? best.shareId : ps.id, inherited: best?.role !== role };
      }
    }
  }
  return best;
}

/** Whether anybody besides the owner can reach it — memory goes quiet if so. */
export async function isShared(type: ResourceType, id: string): Promise<boolean> {
  const info = await resourceInfo(type, id).catch(() => null);
  if (!info) return false;
  const s = await shareFor(info.ownerId, type, id).catch(() => null);
  if (s && (s.linkRole || s.code || (await activeMembers(s.id)).length)) return true;
  if (type === 'conversation' && info.projectId) return isShared('project', info.projectId);
  return false;
}

// ── what the owner sees and changes ─────────────────────────────────

export interface ShareState {
  role: Role;
  link: { role: GrantRole; token: string } | null;
  code: { role: GrantRole; code: string } | null;
  members: {
    id: string;
    name: string;
    /** only for the owner, and only for an invite nobody has accepted */
    email: string | null;
    role: GrantRole;
    pending: boolean;
    via: MemberRow['via'];
    you: boolean;
  }[];
  owner: { name: string; you: boolean };
}

export async function shareState(viewerId: string, type: ResourceType, id: string): Promise<ShareState | null> {
  const access = await shareAccess(viewerId, type, id);
  if (!access) return null;
  const s = await shareFor(access.ownerId, type, id);
  const isOwner = access.role === 'owner';
  const members = s ? await activeMembers(s.id) : [];
  return {
    role: access.role,
    // the link and the code are the owner's to hand out; a member sees neither
    link: isOwner && s?.linkRole && s.linkNonce ? { role: s.linkRole, token: linkToken(s.id, s.linkNonce) } : null,
    code: isOwner && s?.code && s.codeRole ? { role: s.codeRole, code: s.code } : null,
    members: members.map((m) => ({
      id: m.id,
      name: m.displayName || (m.userId ? 'Someone' : 'Invited'),
      email: isOwner && !m.userId ? m.email : null,
      role: m.role,
      pending: !m.userId,
      via: m.via,
      you: m.userId === viewerId,
    })),
    owner: { name: await displayNameOf(access.ownerId), you: isOwner },
  };
}

async function ownerShare(ownerId: string, type: ResourceType, id: string): Promise<ShareRow> {
  const info = await resourceInfo(type, id);
  if (!info || info.ownerId !== ownerId) throw new ShareError(404, 'No such thing to share.');
  if (info.incognito) throw new ShareError(409, 'An incognito conversation cannot be shared.');
  return ensureShare(ownerId, type, id);
}

/** Turn the link on (with a role), change its role, or turn it off (null). */
export async function setLink(ownerId: string, type: ResourceType, id: string, role: GrantRole | null): Promise<void> {
  const s = await ownerShare(ownerId, type, id);
  const nonce = role ? s.linkNonce ?? newNonce() : null;
  const { error } = await supabaseAdmin().from('shares').update({
    link_role: role,
    link_nonce: nonce,
    link_hash: role && nonce ? sha(linkToken(s.id, nonce)) : null,
    updated_at: Date.now(),
  }).eq('id', s.id).eq('owner_id', ownerId);
  if (error) throw error;
}

/** A new link: every copy of the old one stops working. People already in stay in. */
export async function resetLink(ownerId: string, type: ResourceType, id: string): Promise<void> {
  const s = await ownerShare(ownerId, type, id);
  if (!s.linkRole) return;
  const nonce = newNonce();
  const { error } = await supabaseAdmin().from('shares').update({
    link_nonce: nonce, link_hash: sha(linkToken(s.id, nonce)), updated_at: Date.now(),
  }).eq('id', s.id).eq('owner_id', ownerId);
  if (error) throw error;
}

/** Turn an invite code on, change its role, give it a fresh code, or turn it off. */
export async function setCode(
  ownerId: string, type: ResourceType, id: string, role: GrantRole | null, fresh = false
): Promise<string | null> {
  const s = await ownerShare(ownerId, type, id);
  if (!role) {
    const { error } = await supabaseAdmin().from('shares').update({ code: null, code_role: null, updated_at: Date.now() }).eq('id', s.id);
    if (error) throw error;
    return null;
  }
  if (s.code && !fresh) {
    const { error } = await supabaseAdmin().from('shares').update({ code_role: role, updated_at: Date.now() }).eq('id', s.id);
    if (error) throw error;
    return s.code;
  }
  // a code collision is astronomically rare; the unique index catches it
  for (let i = 0; i < 4; i++) {
    const code = newCode();
    const { error } = await supabaseAdmin().from('shares').update({ code, code_role: role, updated_at: Date.now() }).eq('id', s.id);
    if (!error) return code;
  }
  throw new ShareError(500, 'Could not make a code just now.');
}

export interface InviteResult {
  memberId: string;
  /** an account already holds this address — they see it at once */
  known: boolean;
  /** a one-time token for the emailed link, when the address has no account yet */
  inviteToken: string | null;
}

export async function invite(
  ownerId: string, type: ResourceType, id: string, email: string, role: GrantRole
): Promise<InviteResult> {
  const s = await ownerShare(ownerId, type, id);
  const userId = await userByEmail(email);
  if (userId === ownerId) throw new ShareError(400, 'That is your own address.');
  const members = await activeMembers(s.id);
  const existing = members.find((m) => (userId && m.userId === userId) || (!m.userId && m.email === email));
  if (existing) {
    await setMemberRole(ownerId, type, id, existing.id, stronger(existing.role, role) as GrantRole);
    return { memberId: existing.id, known: !!existing.userId, inviteToken: null };
  }
  const now = Date.now();
  const token = userId ? null : randomBytes(24).toString('base64url');
  const row = {
    id: newId('sm'),
    share_id: s.id,
    user_id: userId,
    email,
    role,
    via: 'email',
    invited_by: ownerId,
    display_name: userId ? await displayNameOf(userId) : null,
    invite_hash: token ? sha(token) : null,
    created_at: now,
    accepted_at: userId ? now : null,
  };
  const { error } = await supabaseAdmin().from('share_members').insert(row);
  if (error) throw error;
  await logActivity(s, ownerId, 'invite', userId ? `invited ${row.display_name}` : 'sent an invitation');
  return { memberId: row.id, known: !!userId, inviteToken: token };
}

export async function setMemberRole(
  ownerId: string, type: ResourceType, id: string, memberId: string, role: GrantRole
): Promise<void> {
  const s = await ownerShare(ownerId, type, id);
  const { error, count } = await supabaseAdmin().from('share_members')
    .update({ role }, { count: 'exact' }).eq('id', memberId).eq('share_id', s.id).is('removed_at', null);
  if (error) throw error;
  if (!count) throw new ShareError(404, 'No such person here.');
}

/** Remove somebody — the owner removing a member, or a member leaving. */
export async function removeMember(actorId: string, type: ResourceType, id: string, memberId: string): Promise<void> {
  const info = await resourceInfo(type, id);
  if (!info) throw new ShareError(404, 'No such thing.');
  const s = await shareFor(info.ownerId, type, id);
  if (!s) throw new ShareError(404, 'No such person here.');
  const m = (await activeMembers(s.id)).find((x) => x.id === memberId);
  if (!m) throw new ShareError(404, 'No such person here.');
  if (actorId !== info.ownerId && m.userId !== actorId) throw new ShareError(403, 'Only the owner can remove someone.');
  const { error } = await supabaseAdmin().from('share_members').update({ removed_at: Date.now() }).eq('id', m.id);
  if (error) throw error;
  await logActivity(s, actorId, 'removed', actorId === m.userId ? 'left' : `removed ${m.displayName ?? 'an invitation'}`);
}

/** Stop sharing entirely: link off, code off, everyone out. The content is untouched. */
export async function stopSharing(ownerId: string, type: ResourceType, id: string): Promise<void> {
  const s = await shareFor(ownerId, type, id);
  if (!s) return;
  const now = Date.now();
  const db = supabaseAdmin();
  const a = await db.from('shares').update({ link_role: null, link_nonce: null, link_hash: null, code: null, code_role: null, updated_at: now }).eq('id', s.id).eq('owner_id', ownerId);
  if (a.error) throw a.error;
  const b = await db.from('share_members').update({ removed_at: now }).eq('share_id', s.id).is('removed_at', null);
  if (b.error) throw b.error;
}

// ── joining ─────────────────────────────────────────────────────────

export interface Joined {
  type: ResourceType;
  id: string;
  role: Role;
  kind: ResourceInfo['kind'];
}

async function join(userId: string, s: ShareRow, role: GrantRole, via: MemberRow['via']): Promise<Joined> {
  const info = await resourceInfo(s.resourceType, s.resourceId);
  if (!info || info.ownerId !== s.ownerId) throw new ShareError(404, 'That link no longer leads anywhere.');
  if (userId === s.ownerId) return { type: s.resourceType, id: s.resourceId, role: 'owner', kind: info.kind };
  const members = await activeMembers(s.id);
  const mine = members.find((m) => m.userId === userId);
  if (mine) {
    // joining again by a better door keeps the better role, never a worse one
    const better = stronger(mine.role, role) as GrantRole;
    if (better !== mine.role) await supabaseAdmin().from('share_members').update({ role: better }).eq('id', mine.id);
    return { type: s.resourceType, id: s.resourceId, role: better, kind: info.kind };
  }
  const now = Date.now();
  const name = await displayNameOf(userId);
  const { error } = await supabaseAdmin().from('share_members').insert({
    id: newId('sm'), share_id: s.id, user_id: userId, email: null, role, via,
    invited_by: s.ownerId, display_name: name, created_at: now, accepted_at: now,
  });
  if (error) {
    // a double click racing itself: the unique index kept one; read it back
    const again = (await activeMembers(s.id)).find((m) => m.userId === userId);
    if (!again) throw error;
    return { type: s.resourceType, id: s.resourceId, role: again.role, kind: info.kind };
  }
  await logActivity(s, userId, 'joined', `${name} joined`);
  return { type: s.resourceType, id: s.resourceId, role, kind: info.kind };
}

export async function acceptLink(userId: string, token: string): Promise<Joined> {
  const { data, error } = await supabaseAdmin().from('shares').select('*').eq('link_hash', sha(token)).maybeSingle();
  if (error && !missing(error)) throw error;
  const s = data ? rowToShare(data as Record<string, unknown>) : null;
  // the hash matched AND the token is still the one this nonce makes
  if (!s || !s.linkRole || !s.linkNonce || linkToken(s.id, s.linkNonce) !== token) {
    throw new ShareError(404, 'That link has been turned off or reset.');
  }
  return join(userId, s, s.linkRole, 'link');
}

export async function acceptCode(userId: string, code: string): Promise<Joined> {
  const { data, error } = await supabaseAdmin().from('shares').select('*').eq('code', code).maybeSingle();
  if (error && !missing(error)) throw error;
  const s = data ? rowToShare(data as Record<string, unknown>) : null;
  if (!s || !s.codeRole) throw new ShareError(404, 'No open invitation has that code.');
  return join(userId, s, s.codeRole, 'code');
}

/**
 * An emailed invitation, accepted. Only by the account that holds the
 * address it was sent to — a forwarded email does not let someone else in.
 */
export async function acceptInvite(userId: string, token: string): Promise<Joined> {
  const { data, error } = await supabaseAdmin().from('share_members').select('*')
    .eq('invite_hash', sha(token)).is('removed_at', null).maybeSingle();
  if (error && !missing(error)) throw error;
  const m = data ? rowToMember(data as Record<string, unknown>) : null;
  if (!m) throw new ShareError(404, 'That invitation has been withdrawn.');
  const { data: sd } = await supabaseAdmin().from('shares').select('*').eq('id', m.shareId).maybeSingle();
  if (!sd) throw new ShareError(404, 'That invitation has been withdrawn.');
  const s = rowToShare(sd as Record<string, unknown>);
  if (m.userId && m.userId !== userId) throw new ShareError(403, 'This invitation was for someone else.');
  if (!m.userId) {
    const mine = await verifiedEmails(userId);
    if (!m.email || !mine.includes(m.email)) {
      throw new ShareError(403, `This invitation was sent to a different address. Sign in with that one to accept it.`);
    }
    const already = (await activeMembers(s.id)).find((x) => x.userId === userId);
    if (already) {
      await supabaseAdmin().from('share_members').update({ removed_at: Date.now() }).eq('id', m.id);
      return join(userId, s, stronger(already.role, m.role) as GrantRole, already.via);
    }
    const { error: e2 } = await supabaseAdmin().from('share_members').update({
      user_id: userId, display_name: await displayNameOf(userId), accepted_at: Date.now(), invite_hash: null,
    }).eq('id', m.id);
    if (e2) throw e2;
  }
  const info = await resourceInfo(s.resourceType, s.resourceId);
  return { type: s.resourceType, id: s.resourceId, role: m.role, kind: info?.kind ?? 'chat' };
}

/**
 * WHO SENT THIS INVITATION — read only, for Socria Rewards.
 *
 * A signed-out person opening a share link, a share code or an emailed
 * invitation is somebody a member of Socria invited; if they go on to create
 * an account, that member brought them, exactly as a referral link would have
 * (lib/rewards/). This answers "whose invitation is it" and nothing else: it
 * joins nobody, changes nothing, and answers null for anything that would not
 * open — a reset link, a withdrawn invitation, a code turned off.
 */
export async function inviterOf(input: { token?: string | null; invite?: string | null; code?: string | null }): Promise<string | null> {
  try {
    if (input.token) {
      const { data } = await supabaseAdmin().from('shares').select('*').eq('link_hash', sha(input.token)).maybeSingle();
      const sh = data ? rowToShare(data as Record<string, unknown>) : null;
      if (sh && sh.linkRole && sh.linkNonce && linkToken(sh.id, sh.linkNonce) === input.token) return sh.ownerId;
      return null;
    }
    if (input.invite) {
      const { data } = await supabaseAdmin().from('share_members').select('*').eq('invite_hash', sha(input.invite)).is('removed_at', null).maybeSingle();
      const m = data ? rowToMember(data as Record<string, unknown>) : null;
      if (!m) return null;
      const { data: sd } = await supabaseAdmin().from('shares').select('*').eq('id', m.shareId).maybeSingle();
      return sd ? rowToShare(sd as Record<string, unknown>).ownerId : null;
    }
    if (input.code) {
      const { data } = await supabaseAdmin().from('shares').select('*').eq('code', input.code).maybeSingle();
      const sh = data ? rowToShare(data as Record<string, unknown>) : null;
      return sh && sh.codeRole ? sh.ownerId : null;
    }
  } catch {
    // no database, or a hiccup: an invitation still opens; it just carries no referral
  }
  return null;
}

/** Invitations sent to an address this account has verified, claimed when they sign in. */
export async function claimInvites(userId: string): Promise<number> {
  const emails = await verifiedEmails(userId);
  if (!emails.length) return 0;
  const { data, error } = await supabaseAdmin().from('share_members').select('*')
    .in('email', emails).is('user_id', null).is('removed_at', null);
  if (error) return 0;
  let n = 0;
  const name = await displayNameOf(userId);
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const m = rowToMember(r);
    const { error: e2 } = await supabaseAdmin().from('share_members').update({
      user_id: userId, display_name: name, accepted_at: Date.now(), invite_hash: null,
    }).eq('id', m.id).is('user_id', null);
    if (!e2) n++;
  }
  return n;
}

// ── what is shared with me ──────────────────────────────────────────

export interface SharedItem {
  type: ResourceType;
  id: string;
  kind: ResourceInfo['kind'];
  title: string;
  role: GrantRole;
  owner: string;
  updatedAt: number;
}

export async function sharedWithMe(userId: string): Promise<SharedItem[]> {
  const { data, error } = await supabaseAdmin().from('share_members').select('share_id, role')
    .eq('user_id', userId).is('removed_at', null).limit(200);
  if (error) {
    if (missing(error)) return [];
    throw error;
  }
  const out: SharedItem[] = [];
  const rows = (data ?? []) as { share_id: string; role: GrantRole }[];
  if (!rows.length) return out;
  const { data: sd } = await supabaseAdmin().from('shares').select('*').in('id', rows.map((r) => r.share_id));
  const names = new Map<string, string>();
  for (const raw of (sd ?? []) as Record<string, unknown>[]) {
    const s = rowToShare(raw);
    const info = await resourceInfo(s.resourceType, s.resourceId).catch(() => null);
    if (!info || info.ownerId !== s.ownerId) continue;
    if (!names.has(s.ownerId)) names.set(s.ownerId, await displayNameOf(s.ownerId));
    out.push({
      type: s.resourceType,
      id: s.resourceId,
      kind: info.kind,
      title: info.title,
      role: rows.find((r) => r.share_id === s.id)!.role,
      owner: names.get(s.ownerId)!,
      updatedAt: s.updatedAt,
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

// ── history ─────────────────────────────────────────────────────────

export async function logActivity(
  s: Pick<ShareRow, 'id' | 'resourceType' | 'resourceId'>, userId: string, kind: string, summary: string
): Promise<void> {
  try {
    await supabaseAdmin().from('share_activity').insert({
      id: newId('sa'), share_id: s.id, resource_type: s.resourceType, resource_id: s.resourceId,
      user_id: userId, display_name: await displayNameOf(userId), kind, summary: summary.slice(0, 200), created_at: Date.now(),
    });
  } catch {
    /* history is a record, not a gate — a failed line never fails the action */
  }
}

/** Record a change to a shared resource, if it is shared. Quiet otherwise. */
export async function noteChange(userId: string, type: ResourceType, id: string, kind: string, summary: string): Promise<void> {
  const info = await resourceInfo(type, id).catch(() => null);
  if (!info) return;
  // a conversation shared through its Project is recorded under the
  // Project's share — the history of the Project includes its conversations
  const s =
    (await shareFor(info.ownerId, type, id).catch(() => null)) ??
    (type === 'conversation' && info.projectId ? await shareFor(info.ownerId, 'project', info.projectId).catch(() => null) : null);
  if (s) await logActivity({ id: s.id, resourceType: type, resourceId: id }, userId, kind, summary);
}

export async function activity(
  viewerId: string, type: ResourceType, id: string, limit = 60
): Promise<{ who: string; kind: string; summary: string; at: number; you: boolean }[] | null> {
  const access = await shareAccess(viewerId, type, id);
  if (!access) return null;
  // A Project's history is everything under its share — its own changes and
  // its conversations'. A conversation's is its own.
  const projectShare = type === 'project' ? await shareFor(access.ownerId, 'project', id).catch(() => null) : null;
  const q = supabaseAdmin().from('share_activity').select('user_id, display_name, kind, summary, created_at');
  const { data, error } = await (projectShare ? q.eq('share_id', projectShare.id) : q.eq('resource_type', type).eq('resource_id', id))
    .order('created_at', { ascending: false }).limit(limit);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    who: String(r.display_name ?? 'Someone'),
    kind: String(r.kind),
    summary: String(r.summary),
    at: Number(r.created_at),
    you: r.user_id === viewerId,
  }));
}

// ── leaving the product ─────────────────────────────────────────────

/**
 * Everything sharing holds about a person, gone — for account deletion.
 * Fails closed: any error but "the table is not there yet" throws, so the
 * caller stops rather than reporting a deletion that did not happen.
 */
export async function purgeSharing(userId: string): Promise<void> {
  const db = supabaseAdmin();
  const check = (r: { error: { code?: string; message?: string } | null }) => {
    if (r.error && !missing(r.error)) throw new Error(`sharing purge: ${r.error.message}`);
  };
  const owned = await db.from('shares').select('id').eq('owner_id', userId);
  check(owned);
  const ids = ((owned.data ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length) {
    check(await db.from('share_members').delete().in('share_id', ids));
    check(await db.from('share_comments').delete().in('share_id', ids));
    check(await db.from('share_activity').delete().in('share_id', ids));
    check(await db.from('shares').delete().in('id', ids));
  }
  check(await db.from('share_members').delete().eq('user_id', userId));
  check(await db.from('share_comments').delete().eq('user_id', userId));
  check(await db.from('share_activity').delete().eq('user_id', userId));
  check(await db.from('share_presence').delete().eq('user_id', userId));
}
