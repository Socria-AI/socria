// lib/runtime/index.ts — THE LOGOS RUNTIME (docs/LOGOS-5-RUNTIME.md).
//
// Six subsystems, one module each, composed by the route — not six agents:
//
//   orchestrate.ts     which path, which view, which calls, which model
//   state.ts           the cognitive state, derived in code every turn
//   allocation.ts      Core 4's CognitiveSplit and the move: who does what
//   behavior.ts        the compact instructions
//   epistemic.ts       what may be asserted, on what evidence
//   representation.ts  the workspace as typed, linked entities
//   presentation.ts    the inline elements a reply may use this turn
//
// SWITCHED, so any of it can be taken back without a deploy of code:
//   LOGOS_RUNTIME=off   the reply route as it was before the runtime
//   LOGOS_PERSONA=classic  the Logos 3.5 prompt with the rest of the runtime

export * from './orchestrate';
export * from './state';
export * from './allocation';
export * from './behavior';
export * from './epistemic';
export * from './representation';
export * from './presentation';

const off = (v: string | undefined): boolean => /^(off|0|false|no)$/i.test((v ?? '').trim());

/** The runtime on the server: on unless LOGOS_RUNTIME says otherwise. */
export function runtimeOn(env: Record<string, string | undefined> = process.env): boolean {
  return !off(env.LOGOS_RUNTIME);
}

/**
 * Which persona speaks. The Logos 5 core is the new Socria's, and the new
 * Socria is behind its access code (lib/new-socria.ts): its screen says so on
 * every request (`surface: 'logos5'`, LogosApp guidance()). Everyone else keeps
 * the Logos they had — the Logos 3.5 prompt, the rest of the runtime with it.
 * LOGOS_PERSONA=classic is the rollback for everyone; LOGOS_PERSONA=v5 gives
 * every surface the new persona (the evaluations' ablations use both).
 */
export function personaOf(env: Record<string, string | undefined> = process.env, surface?: unknown): 'v5' | 'classic' {
  if (!runtimeOn(env)) return 'classic';
  const want = (env.LOGOS_PERSONA ?? '').trim().toLowerCase();
  if (want === 'classic') return 'classic';
  if (want === 'v5') return 'v5';
  return surface === 'logos5' ? 'v5' : 'classic';
}
