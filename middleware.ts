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
// It does NOT paper over the other failure: production keys on a preview
// domain. Those are present, so Clerk runs, and Clerk correctly refuses the
// origin. The badge in the corner names that one; see lib/environment.ts.
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
