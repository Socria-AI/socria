import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';
import { ENTRY_COOKIE, decide, entryValid, needsEntry, takeoverEnv, takeoverOn } from '@/lib/takeover';

// Clerk only runs where it is configured.
//
// clerkMiddleware() with no keys sends every request into the sign-in
// handshake and the whole app looks broken — which is what a preview
// deployment does when it has no Clerk credentials of its own. Making it
// conditional means such a build still works: signed out, conversations kept
// in the browser, everything else intact. That is a usable state for showing
// somebody a branch, and it is strictly better than a redirect loop.
//
// The condition is deliberately only "are the keys present". It is tempting to
// also skip when the keys look wrong for the domain — a production Clerk key on
// a preview URL — but that breaks far more than it fixes: auth() reads what
// clerkMiddleware() puts on the request, so skipping the middleware makes every
// auth() call site throw, and each of the 34 of them becomes a 500. A preview
// with a mismatched key at least renders; one without the middleware does not.
// The fix for a mismatched key is development keys (pk_test_… / sk_test_…) on
// Vercel's Preview environment, not a middleware that opts itself out.
const configured =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

// THE RELAUNCH (lib/takeover.ts). While it runs, every public page is the
// campaign's — "WE KILLED THE CHATBOT." and a field for the access code — Logos
// 5 opens only with that code, and the routes that do Logos 5's thinking
// refuse without it. Signing in, the account, billing, the legal pages,
// events, webhooks, email and cron go on as before. The entry cookie is only
// checked on the paths whose answer depends on it. SOCRIA_TAKEOVER=off (and a
// redeploy) turns all of this off and the site is what it was.
async function takeover(req: NextRequest): Promise<NextResponse | undefined> {
  const env = takeoverEnv();
  if (!takeoverOn(env)) return undefined;
  const path = req.nextUrl.pathname;
  const entered = needsEntry(path) && (await entryValid(crypto.subtle, env, req.cookies.get(ENTRY_COOKIE)?.value, Date.now()));
  const d = decide(path, entered);
  // the campaign page, at the address asked for: entering the code opens it
  if (d.do === 'show') return NextResponse.rewrite(new URL('/', req.url));
  if (d.do === 'go') return NextResponse.redirect(new URL(d.to, req.url), 307);
  if (d.do === 'refuse') {
    return NextResponse.json({ error: 'This needs the access code. Reload the page to enter it.', locked: true }, { status: 403 });
  }
  return undefined;
}

export default configured
  ? clerkMiddleware((_auth, req) => takeover(req))
  : async (req: NextRequest) => (await takeover(req)) ?? NextResponse.next();

export const config = {
  matcher: [
    // Skip _next assets, static files, the Sanity Studio route, and favicons.
    '/((?!_next|favicon.ico|socria-mark.png|socria-logo.png|studio|.*\\..*).*)',
    '/api/(.*)',
  ],
};
