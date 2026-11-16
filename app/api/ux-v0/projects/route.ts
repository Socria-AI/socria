// app/api/ux-v0/projects/route.ts
// GET            → { projects: [{ id, name, updatedAt }], storage }
// GET ?id=…      → { project }
// PUT { project } → { ok, updatedAt } — the newer copy wins
// DELETE ?id=…   → { ok }
//
// The copy of a signed-in designer's SocriaUX v0 projects that follows them to
// another device. The browser keeps the first copy (lib/ux-v0/store.ts). The
// document travels without crops (they are rebuilt from the file); imported
// originals travel separately, through the private files bucket
// (/api/files/original). Every document passes normalizeProject before it is
// stored, and every query filters on user_id.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizeProject } from '@/lib/ux-v0/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLE = 'ux_v0_projects';
const MAX_DOC = 2_000_000;
const MAX_PROJECTS = 200;
const ID = /^[A-Za-z0-9_-]{1,96}$/;

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  let db;
  try {
    db = supabaseAdmin();
  } catch {
    return NextResponse.json({ projects: [], storage: { ok: false, reason: 'not-configured' } });
  }
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    if (!ID.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    const { data, error } = await db.from(TABLE).select('doc').eq('user_id', userId).eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: 'Your project could not be read.', storage: { ok: false } }, { status: 503 });
    const project = data ? normalizeProject(data.doc) : null;
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ project });
  }
  const { data, error } = await db.from(TABLE).select('id, name, updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(MAX_PROJECTS);
  if (error) return NextResponse.json({ projects: [], storage: { ok: false, reason: 'table' } });
  return NextResponse.json({ projects: (data ?? []).map((r: any) => ({ id: r.id, name: r.name, updatedAt: Number(r.updated_at) || 0 })), storage: { ok: true } });
}

export async function PUT(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const text = await req.text().catch(() => '');
  if (text.length > MAX_DOC) return NextResponse.json({ error: 'This project is too large to sync; it is kept in this browser.', tooLarge: true }, { status: 413 });
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const project = normalizeProject(body?.project, { forSync: true });
  if (!project || !body?.project?.id || project.id !== body.project.id) return NextResponse.json({ error: 'project required' }, { status: 400 });
  let db;
  try {
    db = supabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'Sync is not configured here.', storage: { ok: false } }, { status: 503 });
  }
  const { data: existing, error: readErr } = await db.from(TABLE).select('updated_at').eq('user_id', userId).eq('id', project.id).maybeSingle();
  if (readErr) return NextResponse.json({ error: 'Sync is unavailable.', storage: { ok: false } }, { status: 503 });
  if (existing && Number(existing.updated_at) > project.updatedAt) return NextResponse.json({ ok: false, stale: true, updatedAt: Number(existing.updated_at) }, { status: 409 });
  if (!existing) {
    const { count } = await db.from(TABLE).select('id', { count: 'exact', head: true }).eq('user_id', userId);
    if ((count ?? 0) >= MAX_PROJECTS) return NextResponse.json({ error: `Sync holds ${MAX_PROJECTS} projects.` }, { status: 409 });
  }
  const { error } = await db
    .from(TABLE)
    .upsert({ user_id: userId, id: project.id, name: project.name, doc: project, created_at: project.createdAt, updated_at: project.updatedAt }, { onConflict: 'user_id,id' });
  if (error) return NextResponse.json({ error: 'Your project could not be synced.', storage: { ok: false } }, { status: 503 });
  return NextResponse.json({ ok: true, updatedAt: project.updatedAt });
}

export async function DELETE(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!ID.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  let db;
  try {
    db = supabaseAdmin();
  } catch {
    return NextResponse.json({ ok: false, storage: { ok: false } }, { status: 503 });
  }
  const { error } = await db.from(TABLE).delete().eq('user_id', userId).eq('id', id);
  if (error) return NextResponse.json({ ok: false }, { status: 503 });
  return NextResponse.json({ ok: true });
}
