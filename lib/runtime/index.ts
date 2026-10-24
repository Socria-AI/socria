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

const off = (v: string | undefined): boolean => /^(off|0|false|no)$/i.test((v ?? '').trim());

/** The runtime on the server: on unless LOGOS_RUNTIME says otherwise. */
export function runtimeOn(env: Record<string, string | undefined> = process.env): boolean {
  return !off(env.LOGOS_RUNTIME);
}

/** Which persona speaks: the Logos 5 core, or the Logos 3.5 prompt (for rollback and for the ablation). */
export function personaOf(env: Record<string, string | undefined> = process.env): 'v5' | 'classic' {
  return runtimeOn(env) && !/^classic$/i.test((env.LOGOS_PERSONA ?? '').trim()) ? 'v5' : 'classic';
}
