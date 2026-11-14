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
//   LOGOS_ENGAGEMENT=off|shadow|on  how the reply meets their thinking (engagement.ts); unset: on, except in production

import { currentEnv, type Env } from '../environment';

export * from './orchestrate';
export * from './state';
export * from './allocation';
export * from './engagement';
export * from './replay';
export * from './behavior';
export * from './epistemic';
export * from './representation';
export * from './presentation';
export * from './asks';
export * from './explain';

const off = (v: string | undefined): boolean => /^(off|0|false|no)$/i.test((v ?? '').trim());
const on = (v: string | undefined): boolean => /^(on|1|true|yes)$/i.test((v ?? '').trim());

/** Where the engagement reading stands for a deployment: acted on, read and traced only, or not read at all. */
export type EngagementMode = 'on' | 'shadow' | 'off';

/**
 * How the reply meets their thinking (engagement.ts) — a dimension of the allocation, read only where this says
 * so. LOGOS_ENGAGEMENT decides:
 *   on      the reading is made and acted on;
 *   shadow  the reading is made and TRACED, and nothing else changes — the turn's instructions, the question budget
 *           and the reply are exactly what they are with it off. It is how a deployment records what people do with
 *           Socria's questions today, before anything about them changes (docs/LOGOS-ENGAGEMENT.md §9);
 *   off     no reading: the route as it was.
 * Unset, it is on wherever the deployment is not production (dev, previews, a local server) and OFF in production
 * until someone turns it on there. It changes how replies end, and that has been checked in code and against
 * scripted conversations — not yet against people.
 */
export function engagementMode(env: Record<string, string | undefined> = process.env, where: Env = currentEnv()): EngagementMode {
  if (/^shadow$/i.test((env.LOGOS_ENGAGEMENT ?? '').trim())) return 'shadow';
  if (on(env.LOGOS_ENGAGEMENT)) return 'on';
  if (off(env.LOGOS_ENGAGEMENT)) return 'off';
  return where === 'production' ? 'off' : 'on';
}

/** The reading is acted on (not shadow, not off). */
export function engagementOn(env: Record<string, string | undefined> = process.env, where: Env = currentEnv()): boolean {
  return engagementMode(env, where) === 'on';
}

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
