// lib/new-logos/source-ops.ts — WHAT CAN BE DONE WITH SOURCES AND REFERENCES, and what cannot.
//
//   ONE RECORD PER FILE. Bringing in a file the library already has (the same reading, or the same original) returns
//   the record that is there, joined to the new conversation if one is given — never a second copy.
//   A REFERENCE NEVER DUPLICATES A SOURCE. It ties a component to a source (optionally a passage); the same tie twice
//   is the same reference. Removing one leaves the source and every other reference as they were.
//   DELETING A SOURCE IS ITS OWN ACT. It removes the record and its references (the interface asks first); whether the
//   original file is released as well depends on whether a conversation still holds it (the route decides, with
//   lib/file-originals-store.ts), so a conversation never loses a file it shows.
//   A QUESTION GETS PASSAGES, NOT DOCUMENTS. passagesFor returns, for each source asked about, its outline and the
//   passages that bear on the question (sources.ts readingForQuestion), within a budget.

import { cleanText } from './clean';
import type { Result } from './ops';
import {
  SOURCE_LIMITS,
  metaOf,
  newRefId,
  newSourceId,
  readingForQuestion,
  sanitizeRefInput,
  sanitizeSourceInput,
  statusOf,
  type SourceMeta,
  type SourceRefRow,
  type SourceRow,
} from './sources';
import type { SourceStore } from './source-store';
import type { SourceDoc } from '@/lib/docs/types';

const fail = <T>(code: 'invalid' | 'not_found' | 'limit', message: string): Result<T> => ({ ok: false, error: { code, message } });
const done = <T>(value: T): Result<T> => ({ ok: true, value });

/** Bring a file into the library, or find it there already. */
export async function createSource(store: SourceStore, userId: string, raw: unknown, now: number): Promise<Result<{ source: SourceMeta; existing: boolean }>> {
  const input = sanitizeSourceInput(raw);
  if (!input) return fail('invalid', 'That is not a file that can be kept as a source.');
  const had = (input.doc_id ? await store.findByDoc(userId, input.doc_id) : null) ?? (input.file_id ? await store.findByFile(userId, input.file_id) : null);
  if (had) {
    // the same file again: one record, now also in this conversation; a reading or original it lacked is added
    const conversation_ids = [...new Set([...had.conversation_ids, ...input.conversation_ids])].slice(0, SOURCE_LIMITS.conversations);
    const patch: Partial<SourceRow> = {};
    if (conversation_ids.length !== had.conversation_ids.length) patch.conversation_ids = conversation_ids;
    if (!had.file_id && input.file_id) patch.file_id = input.file_id;
    if (!had.doc_id && input.reading) Object.assign(patch, { doc_id: input.doc_id, reading: input.reading, status: statusOf(input.reading, had.kind), pages: input.reading.pageCount, format: input.reading.format });
    if (Object.keys(patch).length) {
      patch.updated_at = now;
      await store.updateSource(userId, had.id, patch);
    }
    return done({ source: { ...had, ...(patch as Partial<SourceMeta>) }, existing: true });
  }
  if ((await store.sources(userId)).length >= SOURCE_LIMITS.sourcesPerUser) return fail('limit', 'The library is full. Remove sources you no longer need first.');
  const row: SourceRow = {
    id: newSourceId(),
    user_id: userId,
    name: input.name,
    file_name: input.file_name,
    mime: input.mime,
    size: input.size,
    kind: input.kind,
    file_id: input.file_id,
    doc_id: input.doc_id,
    status: statusOf(input.reading, input.kind),
    pages: input.reading?.pageCount ?? 0,
    format: input.reading?.format ?? (input.file_name.split('.').pop() ?? '').toLowerCase().slice(0, 12),
    conversation_ids: input.conversation_ids,
    reading: input.reading,
    created_at: now,
    updated_at: now,
  };
  await store.insertSource(row);
  return done({ source: metaOf(row), existing: false });
}

export async function renameSource(store: SourceStore, userId: string, id: unknown, name: unknown, now: number): Promise<Result<SourceMeta>> {
  const sid = typeof id === 'string' ? id : '';
  const n = cleanText(name, SOURCE_LIMITS.name);
  if (!n) return fail('invalid', 'A source needs a name.');
  const s = await store.source(userId, sid);
  if (!s) return fail('not_found', 'That source was not found.');
  if (s.name === n) return done(metaOf(s));
  await store.updateSource(userId, sid, { name: n, updated_at: now });
  return done({ ...metaOf(s), name: n, updated_at: now });
}

/** Delete a source for good: the record and its references. Returns what the original was, for the route to release. */
export async function deleteSource(store: SourceStore, userId: string, id: unknown): Promise<Result<{ id: string; file_id: string | null; references: number }>> {
  const sid = typeof id === 'string' ? id : '';
  const s = await store.source(userId, sid);
  if (!s) return fail('not_found', 'That source was not found.');
  const references = (await store.refs(userId)).filter((r) => r.source_id === sid).length;
  await store.deleteSource(userId, sid);
  return done({ id: sid, file_id: s.file_id, references });
}

/** Tie a component to a source (at a passage, when given). The same tie twice is the one already there. */
export async function addRef(store: SourceStore, userId: string, raw: unknown, now: number): Promise<Result<SourceRefRow>> {
  const input = sanitizeRefInput(raw);
  if (!input) return fail('invalid', 'A reference needs a component and a source.');
  if (!(await store.source(userId, input.source_id))) return fail('not_found', 'That source was not found.');
  if (!(await store.nodeExists(userId, input.node_id))) return fail('not_found', 'That component was not found.');
  const all = await store.refs(userId);
  const had = all.find((r) => r.node_id === input.node_id && r.source_id === input.source_id && (r.passage ?? '') === (input.passage ?? ''));
  if (had) return done(had);
  if (all.length >= SOURCE_LIMITS.refsPerUser) return fail('limit', 'This account has reached the reference limit.');
  const row: SourceRefRow = { id: newRefId(), user_id: userId, ...input, created_at: now };
  await store.insertRef(row);
  return done(row);
}

export async function removeRef(store: SourceStore, userId: string, id: unknown): Promise<Result<{ id: string }>> {
  const rid = typeof id === 'string' ? id : '';
  if (!(await store.deleteRef(userId, rid))) return fail('not_found', 'That reference was not found.');
  return done({ id: rid });
}

/**
 * The passages of the asked-about sources that bear on a question, as readings of the same documents (so the chat
 * endpoint letters and cites them), within the per-question budget. Sources may be named by id or by reading id.
 */
export async function passagesFor(store: SourceStore, userId: string, raw: unknown): Promise<Result<{ docs: SourceDoc[]; sources: { id: string; doc_id: string; name: string }[] }>> {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const query = cleanText(r.query, 2000, { multiline: true });
  const asked = (Array.isArray(r.ids) ? r.ids : []).filter((x): x is string => typeof x === 'string').slice(0, SOURCE_LIMITS.perAsk * 2);
  const byDoc = (Array.isArray(r.docIds) ? r.docIds : []).filter((x): x is string => typeof x === 'string').slice(0, SOURCE_LIMITS.perAsk * 2);
  const all = await store.sources(userId);
  const ids = [...new Set([...asked.filter((id) => all.some((s) => s.id === id)), ...byDoc.map((d) => all.find((s) => s.doc_id === d)?.id).filter((x): x is string => !!x)])].slice(0, SOURCE_LIMITS.perAsk);
  const rows = await store.readings(userId, ids);
  const docs: SourceDoc[] = [];
  const sources: { id: string; doc_id: string; name: string }[] = [];
  for (const s of rows) {
    if (!s.reading) continue;
    docs.push(readingForQuestion(s.reading, query));
    sources.push({ id: s.id, doc_id: s.reading.id, name: s.name });
  }
  return done({ docs, sources });
}
