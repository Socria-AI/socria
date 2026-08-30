// Sanity env vars. Kept as plain strings (instead of throwing on missing)
// so the Next.js build still succeeds when the keys aren't configured yet.
// At runtime, `isSanityConfigured()` and the queries fall back to empty
// data, and the blog renders a "no essays yet" state.
export const apiVersion =
  process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2024-01-01';
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '';

export function isSanityConfigured(): boolean {
  return Boolean(projectId);
}
