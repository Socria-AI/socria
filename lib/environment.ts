// lib/environment.ts
//
// Which deployment is this? One answer, so nothing has to guess twice.
//
// The distinction that matters is production vs everything else. A preview
// build is unfinished work with a public URL, and until now nothing in the
// codebase knew the difference: previews were indexable by search engines,
// looked identical to production, and pointed at the same database.

export type Env = 'production' | 'preview' | 'development';

/**
 * Vercel sets VERCEL_ENV on every deployment ('production' | 'preview' |
 * 'development'). Off Vercel we fall back to NODE_ENV, so a local `next
 * start` still reads as development rather than pretending to be live.
 *
 * NEXT_PUBLIC_ so the browser can know too — the badge and the noindex tag
 * both need it, and neither is a secret.
 */
export function currentEnv(): Env {
  const v = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV;
  if (v === 'production' || v === 'preview' || v === 'development') return v;
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

export function isProduction(): boolean {
  return currentEnv() === 'production';
}

/**
 * Anything that is not the real thing. The rule for these: never indexed,
 * always labelled, and ideally not sharing production's data.
 */
export function isPreviewLike(): boolean {
  return !isProduction();
}

/** What to call this environment on screen. */
export function envLabel(): string {
  const e = currentEnv();
  return e === 'preview' ? 'Preview' : e === 'development' ? 'Local' : 'Production';
}

/**
 * Whether sign-in can work at all here.
 *
 * Clerk needs both halves of a key pair, and which pair matters: a
 * production key is bound to its production domain and will fail the
 * handshake on a preview URL — the redirect loop through
 * <instance>.accounts.dev that makes a preview look broken. Development keys
 * accept any origin, which is why previews want those.
 */
export function clerkConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    !!process.env.CLERK_SECRET_KEY
  );
}

/** True when the key is a Clerk *development* instance key (pk_test_…). */
export function clerkIsDevInstance(): boolean {
  return (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').startsWith('pk_test_');
}

/**
 * The mismatch worth warning about: a production Clerk key on a preview
 * deployment. Sign-in cannot work, and the failure looks like a broken app
 * rather than a misconfiguration.
 */
export function clerkKeyMismatch(): boolean {
  return currentEnv() === 'preview' && clerkConfigured() && !clerkIsDevInstance();
}
