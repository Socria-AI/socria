import { NextResponse } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';
import { clerkConfigured, clerkKeyMismatch } from '@/lib/environment';

// Clerk only runs where it is configured.
//
// clerkMiddleware() with no keys sends every request into the sign-in
// handshake and the whole app looks broken — which is what a preview
// deployment does when it has no Clerk credentials of its own. Making it
// conditional means such a build still works: signed out, conversations kept
// in the browser, everything else intact. That is a usable state for showing
// somebody a branch, and it is strictly better than a redirect loop.
//
// The same is now true of the other failure, which used to be worse: a
// PRODUCTION Clerk key on a preview domain. The keys are present, so this ran,
// and the handshake redirected to <instance>.accounts.dev and back for ever —
// a preview that looks broken rather than one that is missing sign-in. Since a
// production instance is bound to its production domain, that handshake was
// never going to complete, and attempting it cost the whole deployment.
//
// So it is skipped, and the preview works signed out: every page renders,
// conversations stay in the browser, and the badge in the corner says why and
// names the fix (development keys, pk_test_… / sk_test_…, on Vercel's Preview
// environment). ClerkProvider still mounts in the layout, so every hook and
// <SignedOut> keeps working — it is only the redirect that is refused.
const canAuthenticate = clerkConfigured() && !clerkKeyMismatch();

export default canAuthenticate ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip _next assets, static files, the Sanity Studio route, and favicons.
    '/((?!_next|favicon.ico|socria-mark.png|socria-logo.png|studio|.*\\..*).*)',
    '/api/(.*)',
  ],
};
