// lib/runtime/index.ts — THE LOGOS RUNTIME (docs/LOGOS-5-RUNTIME.md).
//
// Six subsystems, one module each, composed by the route — not six agents:
//
//   orchestrate.ts     which path, which view, which calls, which model
//   state.ts           the cognitive state, derived in code every turn
//   allocation.ts      Core 4's allocation and the move: who does what
//   replay.ts          Core 4's state, replayed from the conversation (no store, no model)
//   behavior.ts        the compact instructions
//   epistemic.ts       what may be asserted, on what evidence
//   representation.ts  the workspace as typed, linked entities
//   presentation.ts    the inline elements a reply may use this turn
//
// SWITCHED, so any of it can be taken back without a deploy of code:
//   LOGOS_RUNTIME=off   the reply route as it was before the runtime
//   LOGOS_PERSONA=classic  the Logos 3.5 prompt with the rest of the runtime
//   LOGOS_ALLOCATION=lite  the split and the move without Core 4's allocator

export * from './orchestrate';
export * from './state';
export * from './allocation';
export * from './replay';
export * from './behavior';
export * from './epistemic';
export * from './representation';
export * from './presentation';

const off = (v: string | undefined): boolean => /^(off|0|false|no)$/i.test((v ?? '').trim());

/**
 * Core 4's allocator over the replayed conversation (replay.ts), or the split
 * and the move alone. On unless LOGOS_ALLOCATION=lite (or off).
 */
export function allocationMode(env: Record<string, string | undefined> = process.env): 'core4' | 'lite' {
  const v = (env.LOGOS_ALLOCATION ?? '').trim().toLowerCase();
  return v === 'lite' || off(v) ? 'lite' : 'core4';
}

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
