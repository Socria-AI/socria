import 'server-only';
// lib/logos-rooms-server.ts
//
// Who is in a room, and what they are allowed to do — decided here, on the
// server, and nowhere else.
//
// The first version of Logos 2 had no equivalent of this file. Two browsers
// joined a Supabase Realtime channel named after a six-character code and
// talked directly; the "two people maximum" rule was a number in React state.
// Anyone with the public anon key and the code could subscribe silently and
// read everything, and nothing the client believed about membership was worth
// anything, because the client was not in a position to enforce it.
//
// Every function here takes a `userId` that its caller read from a Clerk
// session, and every one of them re-checks membership against the database
// before doing anything. There is no path that trusts a room code alone: the
// code is how you ASK to join, not proof that you belong.

import { randomInt } from 'node:crypto';
import { clerkClient } from '@clerk/nextjs/server';
import { supabaseAdmin } from './supabase';
import { CODE_ALPHABET, MAX_PEOPLE, type Seat } from './collab';

/**
 * Eight characters from a thirty-character alphabet, drawn from the system
 * CSPRNG rather than Math.random(). The old six-character Math.random() code
 * was both guessable in bulk and predictable from a few samples, and it was
 * the only thing standing between a stranger and a private conversation.
 * It is no longer the only thing — joining is authenticated and rate limited
 * — but a share code should still be a random number, not a plausible one.
 */
export const ROOM_CODE_LEN = 8;

export function makeRoomCode(): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LEN; i++) {
    out += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return out;
}

export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.toUpperCase().replace(/[\s-]/g, '');
  if (v.length !== ROOM_CODE_LEN) return null;
  for (const ch of v) if (!CODE_ALPHABET.includes(ch)) return null;
  return v;
}

export interface Room {
  id: string;
  code: string;
  hostUserId: string | null;
  createdAt: number;
  closedAt: number | null;
  /** the host's line of thinking at the moment the room opened */
  seedSession: unknown | null;
}

export interface Member {
  roomId: string;
  userId: string;
  seat: Seat;
  displayName: string;
  joinedAt: number;
  /** where the room was when they sat down; they may not read before it */
  joinedSeq: number;
  leftAt: number | null;
}

function roomId(code: string, at: number): string {
  return `rm_${code.toLowerCase()}_${at.toString(36)}`;
}

/**
 * The name the other person sees.
 *
 * Read from Clerk against the authenticated id — never from the request body.
 * A display name is the only thing about you the other participant is shown,
 * so it should not be a field the sender gets to set.
 */
export async function nameFor(userId: string): Promise<string> {
  try {
    const u = await clerkClient.users.getUser(userId);
    return cleanDisplayName(u.firstName || u.username, 'Someone');
  } catch {
    return 'Someone';
  }
}

export function cleanDisplayName(raw: unknown, fallback: string): string {
  const v = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  return v || fallback;
}

/** The open room with this code, or null. Closed rooms are not joinable. */
export async function openRoomByCode(code: string): Promise<Room | null> {
  const { data, error } = await supabaseAdmin()
    .from('logos_rooms')
    .select('id, code, host_user_id, seed_session, created_at, closed_at')
    .eq('code', code)
    .is('closed_at', null)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id as string,
    code: data.code as string,
    hostUserId: (data.host_user_id as string | null) ?? null,
    createdAt: Number(data.created_at),
    closedAt: data.closed_at == null ? null : Number(data.closed_at),
    seedSession: (data as { seed_session?: unknown }).seed_session ?? null,
  };
}

/**
 * THE GATE. Is this person a current member of this room?
 *
 * Returns their membership or null. Every route that reads or writes a room's
 * events calls this first, with the user id from the session — never with a
 * value from the request body, and never skipping it because the caller
 * supplied a valid-looking code.
 */
export async function membershipOf(
  roomIdValue: string,
  userId: string
): Promise<Member | null> {
  const { data, error } = await supabaseAdmin()
    .from('logos_room_members')
    .select('room_id, user_id, seat, display_name, joined_at, joined_seq, left_at')
    .eq('room_id', roomIdValue)
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle();
  if (error || !data) return null;
  return {
    roomId: data.room_id as string,
    userId: data.user_id as string,
    seat: data.seat as Seat,
    displayName: data.display_name as string,
    joinedAt: Number(data.joined_at),
    joinedSeq: Number(data.joined_seq ?? 0),
    leftAt: data.left_at == null ? null : Number(data.left_at),
  };
}

/** Everyone currently in the room, for presence. */
export async function membersOf(roomIdValue: string): Promise<Member[]> {
  const { data } = await supabaseAdmin()
    .from('logos_room_members')
    .select('room_id, user_id, seat, display_name, joined_at, joined_seq, left_at')
    .eq('room_id', roomIdValue)
    .is('left_at', null)
    .order('joined_at', { ascending: true });
  return (data ?? []).map((d: Record<string, unknown>) => ({
    roomId: d.room_id as string,
    userId: d.user_id as string,
    seat: d.seat as Seat,
    displayName: d.display_name as string,
    joinedAt: Number(d.joined_at),
    joinedSeq: Number(d.joined_seq ?? 0),
    leftAt: null,
  }));
}

/** Open a room and seat its host. */
export async function createRoom(
  userId: string,
  displayName: string,
  now: number,
  seedSession: unknown = null
): Promise<Room | null> {
  const db = supabaseAdmin();
  // A collision is astronomically unlikely but cheap to survive, and the
  // partial unique index on open codes makes it a hard error rather than a
  // silent second room answering to the same code.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeRoomCode();
    const id = roomId(code, now);
    const { error } = await db.from('logos_rooms').insert({
      id,
      code,
      host_user_id: userId,
      seed_session: seedSession,
      created_at: now,
      closed_at: null,
    });
    if (error) continue;
    const { error: mErr } = await db.from('logos_room_members').insert({
      room_id: id,
      user_id: userId,
      seat: 'host',
      display_name: displayName,
      joined_at: now,
      joined_seq: 0, // a room with no log yet
      left_at: null,
    });
    if (mErr) {
      // Never leave a room nobody can be in.
      await db.from('logos_rooms').delete().eq('id', id);
      return null;
    }
    return { id, code, hostUserId: userId, createdAt: now, closedAt: null, seedSession };
  }
  return null;
}

export type JoinResult =
  | { ok: true; room: Room; member: Member }
  | { ok: false; reason: 'not_found' | 'full' | 'failed' };

/**
 * Take a seat, if there is one.
 *
 * The capacity check is the part that used to be a client-side constant. It
 * is done by inserting the membership first and counting afterwards, then
 * standing down if the count came out over the limit — so two people racing
 * for the last seat cannot both read "one occupant" and both sit down. The
 * loser is removed and told the room is full.
 */
export async function joinRoom(
  code: string,
  userId: string,
  displayName: string,
  now: number
): Promise<JoinResult> {
  const db = supabaseAdmin();
  const room = await openRoomByCode(code);
  if (!room) return { ok: false, reason: 'not_found' };

  // Already in it (a reload, a second tab): idempotent.
  const existing = await membershipOf(room.id, userId);
  if (existing) return { ok: true, room, member: existing };

  const seat: Seat = room.hostUserId === userId ? 'host' : 'guest';

  // Where the room is NOW. A joiner may read from here forward, never before:
  // the log up to this point is a conversation they were not part of.
  const joinedSeq = await roomTail(room.id);

  // The database holds the two seats (a partial unique index on room_id+seat
  // among members who have not left), so a third person's INSERT simply
  // fails. No counting, no compensating delete, and no window in which a
  // rejected joiner holds a row that passes the membership gate.
  const { error } = await db.from('logos_room_members').insert({
    room_id: room.id,
    user_id: userId,
    seat,
    display_name: displayName,
    joined_at: now,
    joined_seq: joinedSeq,
    left_at: null,
  });
  if (error) {
    const m = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
    // The seat is taken, or this person already holds one (a reload racing
    // itself). Re-read: an existing membership is a success, a taken seat is
    // a full room.
    if (m.includes('duplicate key') || m.includes('23505') || m.includes('unique')) {
      // Already seated (a reload racing itself): nothing to do.
      const mine = await membershipOf(room.id, userId);
      if (mine) return { ok: true, room, member: mine };

      // Or they LEFT and are coming back. Their row survives with left_at
      // set, so the insert collides on the primary key and they were told
      // the room was full — which was both wrong and unfixable, since
      // nothing ever cleared the row. Clear left_at instead, provided their
      // seat is still free.
      const { error: backErr } = await db
        .from('logos_room_members')
        .update({ left_at: null, joined_at: now, joined_seq: joinedSeq, display_name: displayName })
        .eq('room_id', room.id)
        .eq('user_id', userId)
        .not('left_at', 'is', null);
      if (!backErr) {
        const back = await membershipOf(room.id, userId);
        if (back) return { ok: true, room, member: back };
      }
      // The seat itself is taken by somebody else.
      return { ok: false, reason: 'full' };
    }
    return { ok: false, reason: 'failed' };
  }

  const member = await membershipOf(room.id, userId);
  if (!member) return { ok: false, reason: 'failed' };
  return { ok: true, room, member };
}

export async function leaveRoom(
  roomIdValue: string,
  userId: string,
  now: number
): Promise<void> {
  const db = supabaseAdmin();
  await db
    .from('logos_room_members')
    .update({ left_at: now })
    .eq('room_id', roomIdValue)
    .eq('user_id', userId);
  // The last one out closes the room, so its code stops answering — and so
  // does the HOST leaving. The room is the host's line of thinking; a guest
  // should not keep a seat in it, or keep its code alive, after the person
  // who opened it has gone.
  const left = await membersOf(roomIdValue);
  const { data: room } = await db
    .from('logos_rooms')
    .select('host_user_id')
    .eq('id', roomIdValue)
    .maybeSingle();
  const hostLeft = (room as { host_user_id?: string } | null)?.host_user_id === userId;
  if (left.length === 0 || hostLeft) {
    await db.from('logos_rooms').update({ closed_at: now }).eq('id', roomIdValue);
    if (hostLeft) {
      // Everyone's seat goes with it, so the code stops admitting anyone and
      // no one is left holding access to the host's session.
      await db
        .from('logos_room_members')
        .update({ left_at: now })
        .eq('room_id', roomIdValue)
        .is('left_at', null);
    }
  }
}

export interface StoredEvent {
  seq: number;
  id: string;
  userId: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

/** The highest seq in a room, so a joiner can start from its tail. */
export async function roomTail(roomIdValue: string): Promise<number> {
  const { data } = await supabaseAdmin()
    .from('logos_room_events')
    .select('seq')
    .eq('room_id', roomIdValue)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Number((data as { seq: number }).seq) : 0;
}

/** Events after `since`, oldest first. The caller has already been checked. */
export async function eventsSince(
  roomIdValue: string,
  since: number,
  limit = 200
): Promise<StoredEvent[]> {
  const { data } = await supabaseAdmin()
    .from('logos_room_events')
    .select('seq, id, user_id, kind, payload, created_at')
    .eq('room_id', roomIdValue)
    .gt('seq', since)
    .order('seq', { ascending: true })
    .limit(limit);
  return (data ?? []).map((d: Record<string, unknown>) => ({
    seq: Number(d.seq),
    id: d.id as string,
    userId: d.user_id as string,
    kind: d.kind as string,
    payload: (d.payload ?? {}) as Record<string, unknown>,
    createdAt: Number(d.created_at),
  }));
}

/**
 * Append one event, authored by the session user.
 *
 * `userId` is the authenticated caller, full stop. The client sends a payload;
 * it does not get to say who wrote it. This is the column that later makes
 * "export what I contributed" and "delete what I wrote" answerable at all.
 *
 * A repeated event id is not an error — the client retries on a flaky network
 * and the id is the idempotence key.
 */
export async function appendEvent(
  roomIdValue: string,
  userId: string,
  ev: { id: string; kind: string; payload: Record<string, unknown> },
  now: number
): Promise<boolean> {
  const { error } = await supabaseAdmin().from('logos_room_events').insert({
    // (room_id, id) is the primary key, so a repeat of the same id in the
    // SAME room is the retry we forgive; the same id in another room is a
    // different row and lands normally.
    id: ev.id,
    room_id: roomIdValue,
    user_id: userId,
    kind: ev.kind,
    payload: ev.payload,
    created_at: now,
  });
  if (error) {
    const m = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
    if (m.includes('duplicate key') || m.includes('23505')) return true;
    return false;
  }
  return true;
}

/**
 * Account deletion, for the one kind of data two people share.
 *
 * Deletes this person's own events and memberships, then tidies the rooms:
 * a room they hosted has its host reference cleared and is closed, so the
 * other participant's events are not orphaned; a room with nobody left is
 * removed and its events go with it. What is deliberately NOT done is
 * deleting the other participant's events — those are that person's words,
 * and dropping them because somebody else left would be deleting a third
 * party's data on a stranger's request.
 */
export async function purgeUserFromRooms(userId: string, now: number): Promise<void> {
  const db = supabaseAdmin();

  // Every statement here is checked, and a failure throws rather than being
  // stepped over. The caller turns that into "your account was not deleted"
  // — which is the honest outcome. Reporting a deletion that half happened is
  // worse than refusing one.
  const fail = (what: string, error: unknown): never => {
    throw new Error(`room purge: ${what}: ${JSON.stringify(error)}`);
  };

  const { data: mine, error: readErr } = await db
    .from('logos_room_members')
    .select('room_id')
    .eq('user_id', userId);
  if (readErr) fail('reading memberships', readErr);
  const roomIds = Array.from(new Set((mine ?? []).map((r: { room_id: string }) => r.room_id)));

  const { error: evErr } = await db.from('logos_room_events').delete().eq('user_id', userId);
  if (evErr) fail('deleting events', evErr);

  const { error: memErr } = await db.from('logos_room_members').delete().eq('user_id', userId);
  if (memErr) fail('deleting memberships', memErr);

  const { error: hostErr } = await db
    .from('logos_rooms')
    .update({ host_user_id: null, closed_at: now })
    .eq('host_user_id', userId);
  if (hostErr) fail('clearing hosted rooms', hostErr);

  for (const id of roomIds) {
    const { count, error: countErr } = await db
      .from('logos_room_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('room_id', id);
    // A failed count used to read as `count == null`, i.e. "nobody is left",
    // and the room was deleted — taking the OTHER participant's events with
    // it through the cascade. Deleting somebody else's data because a query
    // failed is the worst available outcome, so an unreadable count leaves
    // the room alone.
    if (countErr) continue;
    if (count === 0) {
      const { error: delErr } = await db.from('logos_rooms').delete().eq('id', id);
      if (delErr) fail('deleting an empty room', delErr);
    }
  }
}
