// app/api/conversations/route.ts
// GET   /api/conversations         → list current user's conversations
// PUT   /api/conversations         → upsert a single conversation
// PATCH /api/conversations         → rename one (title only)
// POST /api/conversations          → bulk-upsert (used for localStorage → cloud migration)

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sanitizeMemory, EMPTY_MEMORY } from '@/lib/socria-prompt';
import { EMPTY_MAP, sanitizeMap, sanitizeByRef } from '@/lib/logos';
import { sanitizeAttachments } from '@/lib/logos-attachments';
import { MAX_FILE_TEXT } from '@/lib/file-kinds';
import { sanitizeContexts } from '@/lib/logos-sources';
import { MindStoreError, listProjects, loadGraph, persistGraph } from '@/lib/mind/store';
import { adoptConversation, releaseConversation } from '@/lib/mind/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TITLE = 200;
const MAX_MESSAGES_PER_CONVO = 200;
const MAX_BULK_CONVOS = 200;

type Msg = {
  role: 'user' | 'assistant';
  content: string;
  attachments?: ReturnType<typeof sanitizeAttachments>;
};

function sanitizeMessages(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m: any) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    )
    .slice(-MAX_MESSAGES_PER_CONVO)
    .map((m: any) => {
      // Core 4's files are whole documents, so the stored ceiling is the
      // larger of the two; a Logos note is capped smaller where it is made.
      const attachments = sanitizeAttachments(m.attachments, MAX_FILE_TEXT);
      // Who said it, when two people were thinking together (Logos 2). Kept
      // so a shared session opened alone later still shows whose idea each
      // one was; validated so a broken author reads as none, not as a crash.
      const by = sanitizeByRef(m.by);
      return {
        role: m.role,
        content: m.content,
        ...(attachments.length ? { attachments } : {}),
        ...(by ? { by } : {}),
      };
    });
}

// Logos sessions live in the same table as ordinary chats, so both surfaces
// list one another's work instead of each keeping a private drawer.
type Kind = 'chat' | 'logos';
const asKind = (v: unknown): Kind => (v === 'logos' ? 'logos' : 'chat');

// ── legacy-database fallback ────────────────────────────────────────
// kind/map/draft/contexts arrived after the original conversations table, as
// idempotent ALTERs in supabase/schema.sql. A deployment whose database never
// ran them used to hard-fail the moment someone signed in ("column
// conversations.kind does not exist"). The app cannot ALTER TABLE through
// PostgREST, so instead: detect the missing column, retry with the columns
// every database has, and keep chat working while saying — loudly, on the
// server — exactly what to run.
//
// Postgres reports 42703 on select; PostgREST reports PGRST204 ("Could not
// find the '…' column in the schema cache") on insert/upsert.
function missingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return /column .* does not exist|could not find the '.*' column/i.test(error.message ?? '');
}

// Where the Logos fields go when their columns don't exist yet.
//
// `memory` is jsonb and has existed since the first schema, so on an
// un-migrated database we park kind/map/draft/contexts inside it under this
// key rather than dropping them. Without this, a Logos session round-trips
// with no `kind`, comes back as 'chat', and disappears from the Logos rail
// while cluttering the Core chat list — which reads to the person as
// "Logos chats aren't saving".
//
// Self-healing: once the migration runs, the real columns take precedence and
// the sidecar is simply ignored (and rehydrated for rows written before it).
const SIDECAR = '__logos';

interface Sidecar {
  kind?: unknown;
  map?: unknown;
  draft?: unknown;
  contexts?: unknown;
  projectId?: unknown;
}

/**
 * Which Project a conversation is in, if any.
 *
 * An opaque id we generated, so anything else is refused rather than stored.
 * Not checked against the Project list: this is the person's own row, and a
 * Project id that is not theirs resolves to nothing everywhere it is read —
 * every Project lookup is scoped to the owner.
 */
function sanitizeProjectId(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(raw) ? raw : null;
}

// project_id is the NEWEST column here, and it must degrade on its own.
//
// The fallback below is all-or-nothing: one missing column sends the read to
// a select that omits kind/map/draft/contexts entirely. Folding project_id
// into that same select would have meant every deployment that had not yet
// re-run schema.sql for Projects — which is every deployment, on the day
// this shipped — lost its Logos maps from the list. So a missing project_id
// is tried away first, and only then does the older fallback run.
let warnedProject = false;
function warnProjectColumn() {
  if (warnedProject) return;
  warnedProject = true;
  console.error(
    'conversations: this database has no project_id column, so conversations cannot be filed ' +
      'under a Project yet. Everything else works. Re-run supabase/schema.sql (it is idempotent).'
  );
}

/** One stored row → the shape the clients expect, whichever schema wrote it. */
function shape(c: any) {
  const memory = c.memory ?? EMPTY_MEMORY;
  const side: Sidecar = (memory && typeof memory === 'object' && memory[SIDECAR]) || {};
  // Never let the sidecar leak into the memory the Core chat reads.
  let clean = memory;
  if (memory && typeof memory === 'object' && SIDECAR in memory) {
    clean = { ...memory };
    delete clean[SIDECAR];
  }
  return {
    id: c.id,
    title: c.title,
    messages: c.messages,
    memory: clean ?? EMPTY_MEMORY,
    // Real column first, sidecar second — so a migrated database wins and a
    // row written while degraded still comes back whole.
    kind: asKind(c.kind ?? side.kind),
    map: c.map ?? side.map ?? EMPTY_MAP,
    draft: c.draft ?? side.draft ?? null,
    contexts: c.contexts ?? side.contexts ?? null,
    projectId: sanitizeProjectId(c.project_id ?? side.projectId),
    updatedAt: Number(c.updated_at),
  };
}

let warnedLegacy = false;
function warnLegacy(op: string) {
  if (warnedLegacy) return;
  warnedLegacy = true;
  console.error(
    `conversations ${op}: this database is missing newer columns (kind/map/draft/contexts). ` +
      'Falling back to storing the Logos fields inside `memory` so nothing is lost — ' +
      'run supabase/schema.sql against this project (SQL Editor or psql) to restore ' +
      'proper columns; it is idempotent and the fallback rows rehydrate automatically.'
  );
}

// The draft is the person's own writing, so it is stored verbatim — only
// bounded, never reformatted or cleaned up on their behalf.
const MAX_DRAFT_HTML = 200_000;
function sanitizeDraft(raw: any): { title: string; html: string } | null {
  if (!raw || typeof raw !== 'object' || typeof raw.html !== 'string') return null;
  return {
    title: typeof raw.title === 'string' ? raw.title.slice(0, MAX_TITLE) : '',
    html: raw.html.slice(0, MAX_DRAFT_HTML),
  };
}

export async function GET() {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // `any[]`: the two selects below return different row shapes on purpose
    // (the fallback asks only for the columns every database has); the mapping
    // after them defaults whatever is absent.
    let data: any[] | null;
    let error;
    ({ data, error } = await supabaseAdmin()
      .from('conversations')
      .select('id, title, messages, memory, kind, map, draft, contexts, project_id, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }));

    // Without project_id first — see warnProjectColumn.
    if (error && missingColumn(error)) {
      ({ data, error } = await supabaseAdmin()
        .from('conversations')
        .select('id, title, messages, memory, kind, map, draft, contexts, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false }));
      if (!error) warnProjectColumn();
    }

    // An old database: list what it does have, defaulting the rest, so
    // signing in still works while the migration is outstanding.
    if (error && missingColumn(error)) {
      warnLegacy('GET');
      ({ data, error } = await supabaseAdmin()
        .from('conversations')
        .select('id, title, messages, memory, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false }));
    }

    if (error) {
      console.error('GET conversations error:', error);
      return NextResponse.json(
        { error: `Supabase: ${error.message}` },
        { status: 500 }
      );
    }

    const conversations = (data || []).map(shape);
    return NextResponse.json({ conversations });
  } catch (e: any) {
    console.error('GET conversations threw:', e);
    return NextResponse.json(
      { error: e?.message || 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * Rename one conversation, and touch nothing else.
 *
 * PUT writes the whole row, which is right when the caller holds the whole
 * conversation and wrong for a rename: the sidebar knows a session's id and
 * title and nothing more, so renaming through PUT would send an empty
 * `messages` and an empty map and quietly erase the thing being renamed. It
 * would also race — a rename typed while a reply is streaming would land on
 * top of a row the chat is mid-way through saving.
 *
 * So this writes one column. `updated_at` is deliberately left alone: the
 * sidebar is ordered by it, and renaming is not thinking — a rename that
 * reordered the list would move the row out from under the cursor that just
 * finished using it.
 */
export async function PATCH(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id;
  // Filing a conversation under a Project (or taking it out of one) is its
  // own operation, with its own consequences in the Mind Graph — see
  // moveToProject below.
  if (typeof id === 'string' && id && body && 'projectId' in body && body.title === undefined) {
    return moveToProject(userId, id, body.projectId);
  }
  const raw = body?.title;
  if (typeof id !== 'string' || !id || typeof raw !== 'string') {
    return NextResponse.json({ error: 'Invalid rename' }, { status: 400 });
  }
  // Same shape the client settles on, applied again here because a client is
  // not a place to enforce anything.
  const title = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  if (!title) {
    return NextResponse.json({ error: 'A name is required' }, { status: 400 });
  }

  try {
    // Scoped to (id, user_id), so it can only ever touch your own row; an id
    // belonging to somebody else matches nothing and 404s rather than
    // reporting a success that did not happen.
    const { error, count } = await supabaseAdmin()
      .from('conversations')
      .update({ title }, { count: 'exact' })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('PATCH conversation error:', error);
      return NextResponse.json({ error: `Supabase: ${error.message}` }, { status: 500 });
    }
    if (!count) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, title });
  } catch (e: any) {
    console.error('PATCH conversation threw:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

/**
 * Move one conversation into a Project, out of one, or between two.
 *
 * Two writes, in the order that is safe to repeat. The conversation's
 * project_id first — that is what the rail shows, and a move that fails
 * after it can simply be done again. Then the graph: what the conversation
 * taught is untied from the Project it left and tied to the one it joined
 * (releaseConversation / adoptConversation in lib/mind/projects.ts). Moving
 * a chat is filing, never forgetting — no memory is created or removed,
 * only the ties that say which Project it was worked on in.
 *
 * `updated_at` is left alone for the same reason a rename leaves it: the rail
 * is ordered by it, and filing is not thinking.
 */
async function moveToProject(userId: string, id: string, raw: unknown) {
  const target = raw === null ? null : sanitizeProjectId(raw);
  if (raw !== null && !target) return NextResponse.json({ error: 'Which Project?' }, { status: 400 });

  try {
    const db = supabaseAdmin();
    const { data: row, error: readErr } = await db
      .from('conversations').select('id, project_id').eq('id', id).eq('user_id', userId).maybeSingle();
    if (readErr) {
      if (missingColumn(readErr)) {
        warnProjectColumn();
        return NextResponse.json(
          { error: 'Projects are not set up on this database yet — re-run supabase/schema.sql.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: `Supabase: ${readErr.message}` }, { status: 500 });
    }
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const from = sanitizeProjectId((row as { project_id?: unknown }).project_id);
    if (from === target) return NextResponse.json({ ok: true, projectId: target });

    // Both Projects must be this person's. Scoped reads: anybody else's id is
    // simply absent from the list.
    const projects = await listProjects(userId);
    const to = target ? projects.find((p) => p.id === target) : null;
    if (target && !to) return NextResponse.json({ error: 'No such Project.' }, { status: 404 });
    const left = from ? projects.find((p) => p.id === from) : null;

    const { error: upErr } = await db
      .from('conversations').update({ project_id: target }).eq('id', id).eq('user_id', userId);
    if (upErr) return NextResponse.json({ error: `Supabase: ${upErr.message}` }, { status: 500 });

    const now = Date.now();
    let seq = 0;
    const nextId = () => `m_${now.toString(36)}_M${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const before = await loadGraph(userId);
    let after = before;
    let untied = 0;
    let tied = 0;
    if (left && after.nodes.some((n) => n.id === left.nodeId)) {
      const r = releaseConversation(after, left.nodeId, id);
      after = r.graph; untied = r.untied;
    }
    if (to && after.nodes.some((n) => n.id === to.nodeId)) {
      const r = adoptConversation(after, to.nodeId, id, { now, nextId });
      after = r.graph; tied = r.tied;
    }
    if (after !== before) {
      const saved = await persistGraph(userId, before, after);
      if (!saved.ok) {
        // The conversation IS filed; its memories are not yet tied. Said,
        // rather than reported as success: moving it again repairs it.
        return NextResponse.json({ ok: true, projectId: target, graph: 'pending' });
      }
    }
    return NextResponse.json({ ok: true, projectId: target, tied, untied });
  } catch (e: any) {
    if (e instanceof MindStoreError) {
      return NextResponse.json({ error: 'Projects are not set up on this deployment yet.' }, { status: 503 });
    }
    console.error('PATCH conversation move threw:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const c = body?.conversation;
  if (
    !c ||
    typeof c.id !== 'string' ||
    typeof c.title !== 'string' ||
    !Array.isArray(c.messages)
  ) {
    return NextResponse.json({ error: 'Invalid conversation' }, { status: 400 });
  }

  try {
    const extras = {
      kind: asKind(c.kind),
      map: sanitizeMap(c.map ?? EMPTY_MAP),
      draft: sanitizeDraft(c.draft),
      contexts: sanitizeContexts(c.contexts),
    };
    const base = {
      id: c.id,
      user_id: userId,
      title: c.title.slice(0, MAX_TITLE),
      messages: sanitizeMessages(c.messages),
      memory: sanitizeMemory(c.memory ?? EMPTY_MEMORY),
      updated_at: Number(c.updatedAt) || Date.now(),
    };
    // NOT an upsert. `conversations.id` is the primary key on its own, so an
    // upsert conflicts on the id alone — and a caller who supplied someone
    // else's conversation id would overwrite that row and take ownership of
    // it. Reads and deletes were always scoped to the owner; this write was
    // the one path that was not.
    //
    // Update-then-insert closes it without a check-then-act race: the update
    // is scoped to (id, user_id) so it can only ever touch your own row, and
    // if it matches nothing the insert either creates the row or fails on the
    // primary key because the id belongs to somebody else.
    const projectId = sanitizeProjectId(c.projectId);
    // Where the project id goes when its column is missing along with the
    // older ones: into the sidecar, like them, so it is not dropped.
    const sidecar = { ...extras, ...(projectId ? { projectId } : {}) };

    let { error, count } = await supabaseAdmin()
      .from('conversations')
      .update({ ...base, ...extras, project_id: projectId }, { count: 'exact' })
      .eq('id', c.id)
      .eq('user_id', userId);

    // Without project_id first, so a database that only lacks THAT column
    // keeps kind/map/draft/contexts in their real columns.
    let projectColumn = true;
    if (error && missingColumn(error)) {
      ({ error, count } = await supabaseAdmin()
        .from('conversations')
        .update({ ...base, ...extras }, { count: 'exact' })
        .eq('id', c.id)
        .eq('user_id', userId));
      if (!error) { projectColumn = false; warnProjectColumn(); }
    }

    let legacy = false;
    if (error && missingColumn(error)) {
      warnLegacy('PUT');
      legacy = true;
      ({ error, count } = await supabaseAdmin()
        .from('conversations')
        .update({ ...base, memory: { ...base.memory, [SIDECAR]: sidecar } }, { count: 'exact' })
        .eq('id', c.id)
        .eq('user_id', userId));
    }

    if (!error && !count) {
      // Annotated, or the ternary infers a union the client's generics reject.
      const row: Record<string, unknown> = legacy
        ? { ...base, memory: { ...base.memory, [SIDECAR]: sidecar } }
        : { ...base, ...extras, ...(projectColumn ? { project_id: projectId } : {}) };
      ({ error } = await supabaseAdmin().from('conversations').insert(row));

      if (error && missingColumn(error) && !legacy && projectColumn) {
        ({ error } = await supabaseAdmin().from('conversations').insert({ ...base, ...extras }));
        if (!error) warnProjectColumn();
      }
      if (error && missingColumn(error)) {
        warnLegacy('PUT');
        ({ error } = await supabaseAdmin()
          .from('conversations')
          .insert({ ...base, memory: { ...base.memory, [SIDECAR]: sidecar } }));
      }

      // A primary-key collision here means the id exists and is not yours.
      if (error && /duplicate key|23505/i.test(`${error.code} ${error.message}`)) {
        return NextResponse.json(
          { error: 'That conversation belongs to another account.' },
          { status: 403 }
        );
      }
    }

    if (error) {
      console.error('PUT conversation error:', error);
      return NextResponse.json(
        { error: `Supabase: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('PUT conversation threw:', e);
    return NextResponse.json(
      { error: e?.message || 'Internal error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const list = body?.conversations;
  if (!Array.isArray(list)) {
    return NextResponse.json(
      { error: 'conversations array required' },
      { status: 400 }
    );
  }

  const usable = list
    .filter(
      (c: any) =>
        c && typeof c.id === 'string' && Array.isArray(c.messages)
    )
    .slice(0, MAX_BULK_CONVOS);
  const prepared = usable.map((c: any) => {
    const base = {
      id: c.id,
      user_id: userId,
      title: (typeof c.title === 'string' ? c.title : 'Imported session').slice(
        0,
        MAX_TITLE
      ),
      messages: sanitizeMessages(c.messages),
      memory: sanitizeMemory(c.memory ?? EMPTY_MEMORY),
      updated_at: Number(c.updatedAt) || Date.now(),
    };
    const extras = {
      kind: asKind(c.kind),
      map: sanitizeMap(c.map ?? EMPTY_MAP),
      draft: sanitizeDraft(c.draft),
      contexts: sanitizeContexts(c.contexts),
    };
    return { base, extras };
  });
  const rows = prepared.map(({ base, extras }) => ({ ...base, ...extras }));
  const legacyRows = prepared.map(({ base, extras }) => ({
    ...base,
    memory: { ...base.memory, [SIDECAR]: extras },
  }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, imported: 0 });
  }

  try {
    // Same hazard as PUT: an upsert conflicts on `id` alone, so a caller could
    // hand us somebody else's conversation ids and overwrite their rows. This
    // is the sign-in migration path, where every id SHOULD be new to us — so
    // drop any id that already exists and does not belong to this account,
    // rather than letting it through and taking the row.
    const ids = rows.map((r) => r.id as string);

    // An id is an opaque handle we generated; anything else is a probe. This
    // also keeps PostgREST's `in()` list free of the characters that would
    // otherwise change how it parses — a malformed id must not be able to
    // turn the ownership query into an error.
    if (ids.some((id) => !/^[A-Za-z0-9_-]{1,120}$/.test(id))) {
      return NextResponse.json({ error: 'Bad conversation id.' }, { status: 400 });
    }

    const { data: existing, error: checkError } = await supabaseAdmin()
      .from('conversations')
      .select('id, user_id')
      .in('id', ids);

    // FAIL CLOSED. This query is the ONLY thing standing between a caller and
    // another account's rows: `conversations.id` is the whole primary key, so
    // an upsert carrying somebody else's id overwrites their row and takes
    // ownership of it. The error used to be discarded — on any failure `data`
    // came back null, `foreign` came out empty, nothing was filtered, and the
    // upsert ran unguarded. A check that cannot be completed is a check that
    // failed; nothing is imported.
    if (checkError) {
      console.error('POST conversations: ownership check failed', checkError);
      return NextResponse.json(
        { error: 'Could not import right now. Nothing was changed.' },
        { status: 503 }
      );
    }

    const foreign = new Set(
      (existing ?? [])
        .filter((r: { user_id: string }) => r.user_id !== userId)
        .map((r: { id: string }) => r.id)
    );
    const mine = (list: { id: unknown }[]) =>
      list.filter((r) => !foreign.has(r.id as string));

    let { error } = await supabaseAdmin().from('conversations').upsert(mine(rows));
    if (error && missingColumn(error)) {
      warnLegacy('POST');
      ({ error } = await supabaseAdmin().from('conversations').upsert(mine(legacyRows)));
    }
    if (foreign.size) {
      console.warn(
        `POST conversations: skipped ${foreign.size} id(s) owned by another account`
      );
    }
    if (error) {
      console.error('POST conversations error:', error);
      return NextResponse.json(
        { error: `Supabase: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, imported: rows.length - foreign.size });
  } catch (e: any) {
    console.error('POST conversations threw:', e);
    return NextResponse.json(
      { error: e?.message || 'Internal error' },
      { status: 500 }
    );
  }
}
