// components/ux-v0/studio/research-client.ts — what looking for references needs from the person's browser: the
// searching itself is lib/ux-v0/studio/research.ts (Openverse is asked from here, as openverse.org itself does, so each
// person's own allowance is used); reading a liked reference's colours needs a canvas, so it lives here.

import type { StudioReference } from '@/lib/ux-v0/studio/research';
import { sampleSwatches } from '../uploads';
export { runResearch, researchSaid } from '@/lib/ux-v0/studio/research';

/** A liked reference's colours, read from its picture (nothing when the picture cannot be read). */
export const coloursOf = (r: Pick<StudioReference, 'thumb'>) => sampleSwatches(r.thumb, 5);
