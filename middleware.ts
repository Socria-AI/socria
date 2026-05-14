// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Routes that REQUIRE auth
const isProtected = createRouteMatcher([
  '/dashboard(.*)',
  '/chat(.*)',
  '/settings(.*)',
  '/api/chat(.*)',
  '/api/conversations(.*)',
  '/api/messages(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Run on all routes except static files and _next internals
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
