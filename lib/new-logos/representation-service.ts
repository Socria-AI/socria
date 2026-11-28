// lib/new-logos/representation-service.ts — A WORKSPACE'S COMPONENTS, READ AND CHANGED (server side, any store).
//
// A workspace is a conversation's space (c:<conversation id>) or an objective's (o:<objective node id>). Every change
// to its components goes through the one operation system (representation-ops.ts): the person's own (made directly,
// by a command, or from the Smart Omnibox), the assistant's turns (a conversation's only: they are taken in with the
// conversation's messages, which the other interface reads), and undoing. Every write is compare-and-swap on the
// record's version: the person's batch made from a stale copy is refused (the page merges and sends it again); the
// assistant's turn and an undo are made again on the newer record. Only the workspace's owner reads or changes it.

import type { NlErrorCode, Result } from './ops';
import { EMPTY_REPRESENTATION, sanitizeRepresentation, type Representation } from './representation';
import { EMPTY_RECORD, REP_OP_LIMIT, commit, revertTo, sanitizeLog, type LogEntry, type RepApply, type RepOp, type RepRecord } from './representation-ops';
import { WORKSPACE_KEY_RE, type RepresentationStore } from './representation-store';

export const CONVERSATION_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;
export { WORKSPACE_KEY_RE };
const fail = <T>(code: NlErrorCode, message: string): Result<T> => ({ ok: false, error: { code, message } });
const done = <T>(value: T): Result<T> => ({ ok: true, value });

export interface Loaded {
  record: RepRecord;
  version: number;
}

/** What the page is sent of the log: what each batch did, in words — never the before-images. */
export interface LogLine {
  id: string;
  at: number;
  by: 'ai' | 'person';
  turn?: string;
  summary: string;
  read?: string;
  /** an undo: the entries it reversed */
  undoes?: string[];
}
export const logLines = (log: readonly LogEntry[]): LogLine[] =>
  log.map(({ id, at, by, turn, summary, read, undoes }) => ({ id, at, by, ...(turn ? { turn } : {}), summary, ...(read ? { read } : {}), ...(undoes?.length ? { undoes } : {}) }));

/** A stored record, checked again on the way out of the database. */
export function cleanRecord(raw: unknown): RepRecord {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { rep: sanitizeRepresentation(o.rep), log: sanitizeLog(o.log) };
}

const emptyLoaded = (): Loaded => ({ record: { rep: { ...EMPTY_REPRESENTATION, items: [], relations: [], variables: [], turns: [] }, log: [] }, version: 0 });

async function read(store: RepresentationStore, userId: string, key: string): Promise<Loaded> {
  const s = await store.read(userId, key);
  return s ? { record: cleanRecord(s.record), version: s.version } : emptyLoaded();
}

/** A workspace's components: empty (version 0) for one with none yet, or one not yet saved. */
export async function loadRepresentation(store: RepresentationStore, userId: string, key: string): Promise<Result<Loaded>> {
  if (!WORKSPACE_KEY_RE.test(key)) return fail('invalid', 'Which workspace?');
  // a record exists only for a workspace this person owns (writes check it), and is read by owner: none means empty
  return done(await read(store, userId, key));
}

const PERSON_OPS = new Set(['add', 'update', 'status', 'answer', 'remove', 'merge', 'relate', 'unrelate', 'model', 'keep', 'view']);

/** The person's operations, in shape: a list of known operations, within the batch limit. Their content is checked when applied. */
export function parsePersonOps(raw: unknown): { ok: true; ops: RepOp[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || !raw.length) return { ok: false, error: 'Nothing to change.' };
  if (raw.length > REP_OP_LIMIT) return { ok: false, error: 'Too many changes at once.' };
  for (const o of raw) if (!o || typeof o !== 'object' || Array.isArray(o) || !PERSON_OPS.has(String((o as Record<string, unknown>).op))) return { ok: false, error: 'That is not a change this can make.' };
  return { ok: true, ops: raw as RepOp[] };
}

export interface Applied {
  loaded: Loaded;
  entry: LogEntry | null;
  result: RepApply;
}

const notYours = (key: string) => fail<never>(key.startsWith('c:') ? 'conversation_unknown' : 'not_found', key.startsWith('c:') ? 'This conversation is not on this account.' : 'This workspace is not on this account.');

/** The person's batch, made on the version they saw. A stale version is a conflict: the page reads again and resends. */
export async function personBatch(store: RepresentationStore, userId: string, key: string, rawOps: unknown, version: unknown, now: number, summary?: string): Promise<Result<Applied>> {
  if (!WORKSPACE_KEY_RE.test(key)) return fail('invalid', 'Which workspace?');
  const parsed = parsePersonOps(rawOps);
  if (!parsed.ok) return fail('invalid', parsed.error);
  if (!(await store.owns(userId, key))) return notYours(key);
  const at = await read(store, userId, key);
  if (typeof version !== 'number' || version !== at.version) return fail('conflict', 'Changed elsewhere since this was read.');
  const { record, result, entry } = commit(at.record, parsed.ops, { by: 'person', at: now, ...(summary ? { summary: summary.slice(0, 200) } : {}) });
  if (!entry) return done({ loaded: at, entry: null, result });
  const v = await store.write(userId, key, record, at.version, now);
  if (v === null) return fail('conflict', 'Changed elsewhere since this was read.');
  return done({ loaded: { record, version: v }, entry, result });
}

/** Back to how it was before a logged batch. Made again on a newer record if one is saved first. */
export async function undoBatch(store: RepresentationStore, userId: string, key: string, entryId: unknown, now: number): Promise<Result<{ loaded: Loaded; entry: LogEntry | null }>> {
  if (!WORKSPACE_KEY_RE.test(key) || typeof entryId !== 'string') return fail('invalid', 'Which change?');
  if (!(await store.owns(userId, key))) return notYours(key);
  for (let attempt = 0; attempt < 3; attempt++) {
    const at = await read(store, userId, key);
    const r = revertTo(at.record, entryId, 'person', now);
    if (!r) return fail('not_found', 'That change is no longer in the history.');
    const v = await store.write(userId, key, r.record, at.version, now);
    if (v !== null) return done({ loaded: { record: r.record, version: v }, entry: r.entry });
  }
  return fail('conflict', 'Changed elsewhere while undoing. Try again.');
}

/**
 * The assistant's turn in a conversation's workspace: its operations (already read leniently from what it sent)
 * applied as the assistant's, with the person's message taken in. Made again on a newer record if the person changed
 * something meanwhile.
 */
export async function assistantTurn(
  store: RepresentationStore,
  userId: string,
  key: string,
  ops: RepOp[],
  ctx: { at: number; turn: string; read?: string; /** earlier messages the assistant read and took in with this turn */ alsoTaken?: string[] }
): Promise<Result<Applied & { before: Representation }>> {
  if (!WORKSPACE_KEY_RE.test(key) || !key.startsWith('c:')) return fail('invalid', 'Which conversation?');
  if (!(await store.owns(userId, key))) return notYours(key);
  const all: RepOp[] = [...(ctx.alsoTaken ?? []).map((message): RepOp => ({ op: 'turn', message })), { op: 'turn', message: ctx.turn }, ...ops];
  for (let attempt = 0; attempt < 3; attempt++) {
    const at = await read(store, userId, key);
    const { record, result, entry } = commit(at.record, all, { by: 'ai', at: ctx.at, turn: ctx.turn, ...(ctx.read ? { read: ctx.read } : {}) });
    if (!entry) return done({ loaded: at, entry: null, result, before: at.record.rep });
    const v = await store.write(userId, key, record, at.version, ctx.at);
    if (v !== null) return done({ loaded: { record, version: v }, entry, result, before: at.record.rep });
  }
  return fail('conflict', 'Changed elsewhere while this turn was being taken in. Try again.');
}

export { EMPTY_RECORD };
