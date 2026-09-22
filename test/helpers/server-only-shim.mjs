// `server-only` is a guard, not code: it throws when resolved for a browser,
// which is exactly its job in a Next.js build. Under test it would stop a
// server-only module being imported at all, so the bundler aliases it here.
//
// Narrower than switching esbuild's export conditions: the `react-server`
// condition also changes how React itself resolves, which broke an unrelated
// .tsx module under test. The guarantee that matters is asserted separately —
// test/no-client-secrets checks that no client component imports one of these
// modules — so nothing is lost by making the marker a no-op here.
export {};
