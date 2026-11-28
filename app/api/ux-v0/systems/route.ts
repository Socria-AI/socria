// app/api/ux-v0/systems/route.ts
// GET             → { systems: [{ id, name, updatedAt }], storage }
// GET ?id=…       → { system }
// PUT { system }  → { ok, updatedAt } — the newer copy wins
// DELETE ?id=…    → { ok }
//
// The account copy of a signed-in designer's registry design systems (lib/ux-v0/dsi/registry.ts); the browser keeps
// the first copy (lib/ux-v0/dsi/store.ts). Every record passes normalizeRecord before it is stored, is stamped with its
// owner, and every query filters on user_id: a system is never visible to another account. No model is asked.
//
// A company's record (lib/ux-v0/company/schema.ts) is kept in the same table, under its own kind of id (co_…), by
// the same rules: GET ?companies=1 → { companies: [{ id, name, updatedAt }] }, GET ?company=<id> → { company },
// PUT { company } → { ok, updatedAt }. Its library's files are not sent: they stay in the browser that holds them.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { ID, normalizeRecord } from '@/lib/ux-v0/dsi/registry';
import { COMPANY_ID, normalizeCompany } from '@/lib/ux-v0/company/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLE = 'ux_v0_systems';
const MAX_DOC = 4_000_000;
const MAX_SYSTEMS = 100;

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'uxsync');
  if (limited) return limited;
  let db;
  try {
    db = supabaseAdmin();
  } catch {
    return NextResponse.json({ systems: [], storage: { ok: false, reason: 'not-configured' } });
  }
  const companyId = req.nextUrl.searchParams.get('company');
  if (companyId) {
    if (!COMPANY_ID.test(companyId)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    const { data, error } = await db.from(TABLE).select('doc').eq('user_id', userId).eq('id', companyId).maybeSingle();
    if (error) return NextResponse.json({ error: 'That company could not be read.', storage: { ok: false } }, { status: 503 });
    const company = data ? normalizeCompany(data.doc) : null;
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ company: { ...company, owner: userId } });
  }
  if (req.nextUrl.searchParams.get('companies')) {
    const { data, error } = await db.from(TABLE).select('id, name, updated_at').eq('user_id', userId).like('id', 'co\\_%').order('updated_at', { ascending: false }).limit(20);
    if (error) return NextResponse.json({ companies: [], storage: { ok: false, reason: 'table' } });
    return NextResponse.json({ companies: (data ?? []).map((r: any) => ({ id: r.id, name: r.name, updatedAt: Number(r.updated_at) || 0 })), storage: { ok: true } });
  }
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    if (!ID.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    const { data, error } = await db.from(TABLE).select('doc').eq('user_id', userId).eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: 'That design system could not be read.', storage: { ok: false } }, { status: 503 });
    const system = data ? normalizeRecord(data.doc) : null;
    if (!system) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ system: { ...system, owner: userId } });
  }
  const { data, error } = await db.from(TABLE).select('id, name, updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(MAX_SYSTEMS);
  if (error) return NextResponse.json({ systems: [], storage: { ok: false, reason: 'table' } });
  return NextResponse.json({ systems: (data ?? []).filter((r: any) => ID.test(String(r.id))).map((r: any) => ({ id: r.id, name: r.name, updatedAt: Number(r.updated_at) || 0 })), storage: { ok: true } });
}

export async function PUT(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'uxsync');
  if (limited) return limited;
  const text = await req.text().catch(() => '');
  if (text.length > MAX_DOC) return NextResponse.json({ error: 'This design system is too large to keep in your account; it stays in this browser.', tooLarge: true }, { status: 413 });
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (body?.company) return putCompanyDoc(userId, body.company);
  const rec = normalizeRecord(body?.system);
  if (!rec || rec.id !== body?.system?.id) return NextResponse.json({ error: 'system required' }, { status: 400 });
  // a record kept by another account is never written over: the owner is this account
  if (body.system.owner && body.system.owner !== userId) return NextResponse.json({ error: 'That design system belongs to another account.' }, { status: 403 });
  let db;
  try {
    db = supabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'Account storage is not configured here.', storage: { ok: false } }, { status: 503 });
  }
  const { data: existing, error: readErr } = await db.from(TABLE).select('updated_at').eq('user_id', userId).eq('id', rec.id).maybeSingle();
  if (readErr) return NextResponse.json({ error: 'Account storage is unavailable.', storage: { ok: false } }, { status: 503 });
  if (existing && Number(existing.updated_at) > rec.updatedAt) return NextResponse.json({ ok: false, stale: true, updatedAt: Number(existing.updated_at) }, { status: 409 });
  if (!existing) {
    const { count } = await db.from(TABLE).select('id', { count: 'exact', head: true }).eq('user_id', userId);
    if ((count ?? 0) >= MAX_SYSTEMS) return NextResponse.json({ error: `Your account holds ${MAX_SYSTEMS} design systems.` }, { status: 409 });
  }
  const doc = { ...rec, owner: userId };
  const { error } = await db.from(TABLE).upsert({ user_id: userId, id: rec.id, name: rec.name, doc, created_at: rec.createdAt, updated_at: rec.updatedAt }, { onConflict: 'user_id,id' });
  if (error) return NextResponse.json({ error: 'The design system could not be kept in your account.', storage: { ok: false } }, { status: 503 });
  return NextResponse.json({ ok: true, updatedAt: rec.updatedAt });
}

export async function DELETE(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'uxsync');
  if (limited) return limited;
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!ID.test(id) && !COMPANY_ID.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
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

/** A company's record kept in the account (the newer copy wins; another account's is never written over). */
async function putCompanyDoc(userId: string, raw: any) {
  const c = normalizeCompany(raw);
  if (!c || c.id !== raw?.id) return NextResponse.json({ error: 'company required' }, { status: 400 });
  if (raw.owner && raw.owner !== userId) return NextResponse.json({ error: 'That company belongs to another account.' }, { status: 403 });
  let db;
  try {
    db = supabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'Account storage is not configured here.', storage: { ok: false } }, { status: 503 });
  }
  const { data: existing, error: readErr } = await db.from(TABLE).select('updated_at').eq('user_id', userId).eq('id', c.id).maybeSingle();
  if (readErr) return NextResponse.json({ error: 'Account storage is unavailable.', storage: { ok: false } }, { status: 503 });
  if (existing && Number(existing.updated_at) > c.updatedAt) return NextResponse.json({ ok: false, stale: true, updatedAt: Number(existing.updated_at) }, { status: 409 });
  // the library's larger files stay in the browser that holds them: only what says what they are is kept here
  const doc = { ...c, owner: userId };
  const { error } = await db.from(TABLE).upsert({ user_id: userId, id: c.id, name: c.name, doc, created_at: c.createdAt, updated_at: c.updatedAt }, { onConflict: 'user_id,id' });
  if (error) return NextResponse.json({ error: 'The company could not be kept in your account.', storage: { ok: false } }, { status: 503 });
  return NextResponse.json({ ok: true, updatedAt: c.updatedAt });
}
