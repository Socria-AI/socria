// lib/ux-v0/studio/realise.ts — the mood chosen in the conversation, carried into the work once it is composed.
//
// A vibe (studio/discovery.ts) decides more than colours and faces: its qualities and its theme ask for forms, depth,
// a ground and a way of arranging things. Its colours and faces already reach the composition as preferences
// (apply.ts prefsOf); what remains is asked of the creative executor (graphics/creative/execute.ts) as a plan, the same
// way a change asked in words is carried out — so the work is made in the mood chosen, with nothing the person chose
// more particularly (a palette, a pairing of faces, their words, their logo, their pictures) moved by it.

import type { StudioState } from './schema';
import { prefsOf } from './apply';
import { vibePlanOf } from './discovery';
import type { Change, CreativePlan, Keepable } from '../graphics/creative/plan';

/** The plan that carries the chosen mood into a composed work, or null when no mood was chosen. */
export function vibeRealisation(st: StudioState): CreativePlan | null {
  const v = vibePlanOf(st);
  if (!v) return null;
  const qualities = v.qualities.slice(0, 3);
  if (!qualities.length && !v.theme) return null;
  const prefs = prefsOf(st);
  const changes: Change[] = [...(v.theme ? [{ decision: 'theme' as const, theme: v.theme }] : []), ...(qualities.length ? [{ decision: 'mood' as const, qualities }] : [])];
  // the colours and faces the composition was made with (the mood's own, or the person's) are not shifted again
  const keep: Keepable[] = [...(prefs.palette ? (['palette'] as const) : []), ...(prefs.faces ? (['type'] as const) : []), 'words', 'logo', 'pictures'];
  const name = prefs.vibe?.name ?? qualities.join(' and ');
  return { intent: v.theme ? 'theme' : 'style', summary: `Made in the feel you chose: ${name.toLowerCase()}.`, keep, changes, by: 'reader' };
}
