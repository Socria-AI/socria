// lib/new-logos/http.ts — the shared shape of New Logos' API routes (server only).
//
// Every route: the signed-in person or 401; the store scoped to them; an operation's Result turned into JSON with the
// right status; a database without the New Logos tables answered as `{ setup: false }` (503 for writes) rather than
// an error page — organisation waits for the migration, conversations do not.

import 'server-only';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseStore } from './store-supabase';
import { supabaseSourceStore } from './source-store-supabase';
import type { SourceStore } from './source-store';
import { supabaseRepresentationStore } from './representation-store-supabase';
import type { RepresentationStore } from './representation-store';
import { NlSetupError, type NodeStore } from './store';
import { statusOf, type Result } from './ops';

export function signedIn(): string | null {
  try {
    return auth().userId ?? null;
  } catch {
    return null;
  }
}

export const unauthorized = () => NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

export function reply<T>(r: Result<T>, key: string): NextResponse {
  if (r.ok) return NextResponse.json({ ok: true, [key]: r.value });
  return NextResponse.json({ ok: false, error: r.error.message, code: r.error.code }, { status: statusOf(r.error.code) });
}

/** Run a handler with the store; the missing-tables case and unexpected failures answered plainly. */
export async function withStore(fn: (store: NodeStore) => Promise<NextResponse>, write: boolean): Promise<NextResponse> {
  try {
    return await fn(supabaseStore());
  } catch (e) {
    if (e instanceof NlSetupError) {
      return NextResponse.json(
        { ok: false, setup: false, error: 'Organisation is not set up on this database yet.', code: 'setup' },
        { status: write ? 503 : 200 }
      );
    }
    console.error('[new-logos]', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong on the server. Nothing was changed.', code: 'server' }, { status: 500 });
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null);
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

/** Run a handler with the source store; the missing-tables case and unexpected failures answered as withStore does. */
export async function withSources(fn: (store: SourceStore) => Promise<NextResponse>, write: boolean): Promise<NextResponse> {
  try {
    return await fn(supabaseSourceStore());
  } catch (e) {
    if (e instanceof NlSetupError) {
      return NextResponse.json(
        { ok: false, setup: false, error: 'Sources are not set up on this database yet.', code: 'setup' },
        { status: write ? 503 : 200 }
      );
    }
    console.error('[new-logos/sources]', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong on the server. Nothing was changed.', code: 'server' }, { status: 500 });
  }
}

/** Run a handler with the representation store; the missing-table case and unexpected failures answered as withStore does. */
export async function withRepresentations(fn: (store: RepresentationStore) => Promise<NextResponse>, write: boolean): Promise<NextResponse> {
  try {
    return await fn(supabaseRepresentationStore());
  } catch (e) {
    if (e instanceof NlSetupError) {
      return NextResponse.json(
        { ok: false, setup: false, error: 'Representations are not set up on this database yet.', code: 'setup' },
        { status: write ? 503 : 200 }
      );
    }
    console.error('[new-logos/representations]', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong on the server. Nothing was changed.', code: 'server' }, { status: 500 });
  }
}

/** A JSON body read no further than `max` characters: null past it, {} when it is not an object. */
export async function bodyUpTo(req: Request, max: number): Promise<Record<string, unknown> | null> {
  const text = await req.text().catch(() => '');
  if (text.length > max) return null;
  try {
    const j = JSON.parse(text || '{}');
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
