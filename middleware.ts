import { NextResponse } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';

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

export default configured ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip _next assets, static files, the Sanity Studio route, and favicons.
    '/((?!_next|favicon.ico|socria-mark.png|socria-logo.png|studio|.*\\..*).*)',
    '/api/(.*)',
  ],
};
