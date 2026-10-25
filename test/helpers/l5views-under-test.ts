// Logos 5's four views, its titles and its Content (lib/logos5/views.ts,
// title.ts, content.ts, contentBoard.ts, make.ts) — one bundle, so the suite that
// holds them reads the same routing the browser and the server run.
export * from '@/lib/logos5/views';
export * from '@/lib/logos5/title';
export * from '@/lib/logos5/content';
export * from '@/lib/logos5/contentBoard';
export { routeTurn } from '@/lib/runtime/orchestrate';
// what to make, chosen before asking (lib/logos5/make.ts), and the reader every choice must satisfy
export * from '@/lib/logos5/make';
export { readDisplayRequest } from '@/lib/objects';
