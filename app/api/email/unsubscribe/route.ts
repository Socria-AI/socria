// app/api/email/unsubscribe/route.ts
// GET  → a one-button page asking whether to stop the notes.
// POST → stop them.
//
// This is pressed from a mail client, on a phone that has never seen Socria,
// by someone who may be mildly annoyed. So it has to work signed out, in one
// press, and it has to be honest about what it did. The GET renders a
// confirmation rather than acting, because mail scanners follow links; a
// link that unsubscribed on GET would unsubscribe everyone whose corporate
// mail filter opened it. The POST is what acts — from the button, or from
// a mail client's own one-click unsubscribe (RFC 8058), which POSTs the
// List-Unsubscribe address with no page in between.
//
// Who may act: the holder of a valid token for the id in the link (the HMAC
// in lib/lifecycle.ts), or a signed-in person for their own account. A bad
// token is a 400 and a plain sentence — never a hint about what was wrong
// with it.
//
// Nothing here throws across the boundary. A store that cannot record the
// refusal says so on the page, in the same voice.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { emailSecret } from '@/lib/email';
import { escapeHtml, verifyUnsubscribeToken } from '@/lib/lifecycle';
import { setUnsubscribed } from '@/lib/lifecycle-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Clerk's auth() throws where its middleware did not run; this page is public. */
function signedInUser(): string | null {
  try {
    return auth().userId ?? null;
  } catch {
    return null;
  }
}

function page(title: string, body: string, status = 200): NextResponse {
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex">' +
    `<title>${escapeHtml(title)} — Socria</title></head>` +
    '<body style="margin:0;background:#fafaf8;color:#1d1d1f;' +
    'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;line-height:1.55">' +
    '<main style="max-width:32em;margin:0 auto;padding:4em 1.25em">' +
    '<p style="margin:0 0 1.5em;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6e6e73">Socria</p>' +
    `<h1 style="font-size:22px;font-weight:600;margin:0 0 .75em">${escapeHtml(title)}</h1>` +
    body +
    '</main></body></html>';
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const BUTTON =
  'style="appearance:none;border:1px solid #1d1d1f;background:#1d1d1f;color:#fff;' +
  'border-radius:8px;padding:.6em 1.1em;font:inherit;font-size:15px;cursor:pointer"';

const P = 'style="margin:0 0 1em;font-size:16px"';
const MUTED = 'style="margin:1.5em 0 0;font-size:14px;color:#6e6e73"';

function invalid(): NextResponse {
  return page(
    'This link is not valid',
    `<p ${P}>It may have been copied incompletely, or it belongs to a different account.</p>` +
      `<p ${MUTED}>Signed in, you can turn these notes off under <a href="/account/data" style="color:inherit">Data &amp; Privacy</a>.</p>`,
    400
  );
}

/**
 * Whose refusal this is. The token path is checked first because a link
 * carries the id it was made for; the signed-in path is the fallback for a
 * person who arrived without one.
 */
function resolveUser(u: string | null, t: string | null): string | null {
  const secret = emailSecret();
  if (u && t) return secret && verifyUnsubscribeToken(u, t, secret) ? u : null;
  const me = signedInUser();
  if (!me) return null;
  // A link for someone else, opened while signed in as yourself, acts on
  // nobody: the two ids disagree and neither is proven.
  if (u && u !== me) return null;
  return me;
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u');
  const t = req.nextUrl.searchParams.get('t');
  const userId = resolveUser(u, t);
  if (!userId) return invalid();

  const hidden =
    (u ? `<input type="hidden" name="u" value="${escapeHtml(u)}">` : '') +
    (t ? `<input type="hidden" name="t" value="${escapeHtml(t)}">` : '');

  return page(
    'Stop these notes?',
    `<p ${P}>Socria sends the occasional note about your thinking here — that a map is where you left it, or when something opens. Press below and it stops.</p>` +
      `<form method="post" action="/api/email/unsubscribe">${hidden}` +
      `<button type="submit" ${BUTTON}>Stop these notes</button></form>` +
      `<p ${MUTED}>Your account, your conversations and your maps are untouched. You can turn the notes back on under Data &amp; Privacy.</p>`
  );
}

export async function POST(req: NextRequest) {
  // The id and token may be in the query (a one-click POST to the
  // List-Unsubscribe address, or our own form's action) or in the form body.
  let u = req.nextUrl.searchParams.get('u');
  let t = req.nextUrl.searchParams.get('t');
  if (!u || !t) {
    try {
      const form = await req.formData();
      const fu = form.get('u');
      const ft = form.get('t');
      if (typeof fu === 'string' && fu) u = fu;
      if (typeof ft === 'string' && ft) t = ft;
    } catch {
      // No body, or not a form. The query and the session are what remain.
    }
  }

  const userId = resolveUser(u, t);
  if (!userId) return invalid();

  const ok = await setUnsubscribed(userId, true);
  if (!ok) {
    return page(
      'That did not save',
      `<p ${P}>Socria could not record this just now. Try the link again in a moment, or write to <a href="mailto:hellosocria@gmail.com" style="color:inherit">hellosocria@gmail.com</a> and it will be done by hand.</p>`,
      500
    );
  }

  return page(
    'Done',
    `<p ${P}>No more notes from Socria. Everything else stays as it is.</p>` +
      `<p ${MUTED}>Changed your mind later? The switch is under <a href="/account/data" style="color:inherit">Data &amp; Privacy</a>.</p>`
  );
}
