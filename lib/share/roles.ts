// lib/share/roles.ts
//
// WHO MAY DO WHAT TO SOMETHING SHARED. The whole permission model, in one
// pure table, so every route asks the same question the same way and a test
// can hold the answer down.
//
//   owner      everything, including who else may see it
//   editor     read, comment, change it, and ask Socria inside it
//   commenter  read and comment
//   viewer     read
//
// Enforced on the SERVER (lib/share/server.ts); the client only uses this to
// decide what to draw, never what is allowed.
//
// PURE.

export const ROLES = ['owner', 'editor', 'commenter', 'viewer'] as const;
export type Role = (typeof ROLES)[number];
/** What an owner can hand out. Ownership is never granted. */
export const GRANTABLE = ['editor', 'commenter', 'viewer'] as const;
export type GrantRole = (typeof GRANTABLE)[number];

export const RESOURCE_TYPES = ['project', 'conversation'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type Action =
  | 'read'      // open it and see its content
  | 'comment'   // leave a comment, reply, resolve one's own
  | 'edit'      // change the content: maps, models, titles, files
  | 'ask'       // send a turn to Socria inside it
  | 'share'     // invite, change roles, links, codes
  | 'delete';   // delete or un-share the whole thing

const CAN: Record<Role, ReadonlySet<Action>> = {
  owner: new Set<Action>(['read', 'comment', 'edit', 'ask', 'share', 'delete']),
  editor: new Set<Action>(['read', 'comment', 'edit', 'ask']),
  commenter: new Set<Action>(['read', 'comment']),
  viewer: new Set<Action>(['read']),
};

export function can(role: Role | null | undefined, action: Action): boolean {
  return !!role && CAN[role]?.has(action) === true;
}

const RANK: Record<Role, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 };
export const rank = (r: Role) => RANK[r] ?? -1;
/** The stronger of two roles — someone invited by email AND by link keeps the better one. */
export const stronger = (a: Role | null, b: Role | null): Role | null =>
  !a ? b : !b ? a : rank(a) >= rank(b) ? a : b;

export function cleanRole(v: unknown): GrantRole | null {
  return typeof v === 'string' && (GRANTABLE as readonly string[]).includes(v) ? (v as GrantRole) : null;
}
export function cleanType(v: unknown): ResourceType | null {
  return typeof v === 'string' && (RESOURCE_TYPES as readonly string[]).includes(v) ? (v as ResourceType) : null;
}

export const ROLE_WORD: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Can edit',
  commenter: 'Can comment',
  viewer: 'Can view',
};

// ── plans ───────────────────────────────────────────────────────────

/** Hosting anything, any number of things — every chat, whole Projects — is Socria One. */
export function mayHost(plan: 'free' | 'one'): boolean {
  return plan === 'one';
}

/**
 * SHARING IS SOCRIA ONE (October 31, 2026). The free plan used to share one
 * chat at a time; it shares none now. Nothing already shared is closed — a
 * door a free owner opened before stays open, and closing a door is never
 * paywalled — but opening one (a link, a code, an invitation, a Project) to
 * someone new needs Socria One. Joining something somebody else shared is
 * free on every plan: the person who shares is the one who pays.
 */
export const FREE_SHARED_CHATS = 0;

/**
 * Why a free owner may not open a door here: sharing is Socria One ('plan'), or
 * a Project. ('one-chat' was the old one-at-a-time rule; it is kept so a
 * stored answer still reads, and is never given now.)
 */
export type HostRefusal = 'project' | 'one-chat' | 'plan';

/** May this owner open a door (a link, a code, an invitation) on this thing? Null when they may; otherwise the reason. */
export function hostRefusal(input: {
  plan: 'free' | 'one';
  type: ResourceType;
  /** this thing is already open to other people */
  open: boolean;
  /** how many OTHER conversations this owner has open to other people now */
  othersOpen: number;
}): HostRefusal | null {
  if (mayHost(input.plan)) return null;
  return input.type === 'project' ? 'project' : 'plan';
}

/** What a refused owner is told, in one place for the route and the sheet. */
export function hostRefusalNote(refusal: HostRefusal, sharing: string | null): string {
  void sharing;
  if (refusal === 'project') return 'Sharing a Project is part of Socria One — it shares every conversation in it.';
  return 'Sharing a conversation is part of Socria One. Anything you shared before stays shared, and you can still join what others share with you.';
}

// ── who may be invited, and how ────────────────────────────────────

/** An email, normalised — or null. Never stored or shown in any other form. */
export function cleanEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s.length > 254 || !/^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/.test(s)) return null;
  return s;
}

/** Invite codes use the rooms' alphabet: no 0/O, 1/I/L — readable aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 8;
export function normalizeCode(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== CODE_LEN) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}
/** A code from random bytes the caller supplies (crypto on the server, a seed in a test). */
export function codeFrom(bytes: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) out += CODE_ALPHABET[(bytes[i] ?? 0) % CODE_ALPHABET.length];
  return out;
}
/** As it is shown: two groups of four. */
export const showCode = (c: string) => (c.length === CODE_LEN ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

/** A link token is 32 url-safe characters; anything else is not one of ours. */
export function cleanToken(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(v) ? v : null;
}

/** Where joining something lands: a Project's home, a Logos session, a shared chat. */
export function landing(j: { type: ResourceType; id: string; kind: 'chat' | 'logos' | 'project' }): string {
  if (j.type === 'project') return `/chat?p=${encodeURIComponent(j.id)}`;
  if (j.kind === 'logos') return `/chat?model=logos-3&s=${encodeURIComponent(j.id)}&shared=1`;
  return `/chat?shared=${encodeURIComponent(j.id)}`;
}
