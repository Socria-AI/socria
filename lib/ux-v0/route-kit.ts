import 'server-only';
// lib/ux-v0/route-kit.ts — the small things every SocriaUX v0 route says the same way.

import { NextResponse, type NextRequest } from 'next/server';
import { shortHash } from './telemetry';

export const signInFirst = () => NextResponse.json({ error: 'Sign in to use SocriaUX’s reasoning. Your work stays in this browser either way.', signIn: true }, { status: 401 });
export const noModel = () => NextResponse.json({ error: 'The model is not configured on this deployment.' }, { status: 500 });
export const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
export const failed = (error = 'SocriaUX could not answer just now. Your work is saved; try again in a moment.') => NextResponse.json({ error }, { status: 502 });

/** The request body as JSON, refused past `max` characters (images included). */
export async function readBody(req: NextRequest, max = 1_500_000): Promise<Record<string, any> | null> {
  return (await readBodyPrinted(req, max)).body;
}

/**
 * The request body as JSON, and its fingerprint: the same body sent twice has the same one, so the second can
 * be answered with the first's answer (lib/ux-v0/stage-server.ts).
 */
export async function readBodyPrinted(req: NextRequest, max = 1_500_000): Promise<{ body: Record<string, any> | null; print: string }> {
  const text = await req.text().catch(() => '');
  if (!text || text.length > max) return { body: null, print: '' };
  try {
    const v = JSON.parse(text);
    return { body: v && typeof v === 'object' && !Array.isArray(v) ? v : null, print: `${text.length.toString(36)}.${shortHash(text)}` };
  } catch {
    return { body: null, print: '' };
  }
}

export const projectIdOf = (v: unknown): string => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(v) ? v : 'unknown');

/** A data-URL image small enough to send: what the model reads instead of a whole design. */
export function imageDataUrl(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.length <= max && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null;
}
