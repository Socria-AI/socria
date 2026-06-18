import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip _next assets, static files, the Sanity Studio route, and favicons.
    '/((?!_next|favicon.ico|socria-mark.png|socria-logo.png|studio|.*\\..*).*)',
    '/api/(.*)',
  ],
};
