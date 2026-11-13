// lib/logos6/project-rests.ts — WHAT A PROJECT RESTS ON (Logos 6, Phase 2; pure).
//
// Across every conversation filed in a Project, the person's own assumptions and claims that other ideas rest on —
// the foundations — grouped where the same words recur in more than one conversation, and flagged where nothing
// in any of them holds the foundation up. Ordered by how many conversations lean on it, then by how much rests on
// it. Each points at the idea in its conversation, so the Project's home can open the exact card (/chat?s=…&n=…).
//
// Read from the maps the Project home already loads (lib/project-home.ts HomeChat): no model, nothing new stored.
// The last reading of the Project — this and its synthesis — is kept on the device (projectReadingKey), so the home
// shows it again the next time instead of asking for it again.

import { keyOf } from '../map-edit';
import type { ThinkingMap } from '../logos';
import { isTheirs, restsOn, weightOf } from './support';

export interface Foundation {
  /** the words, as the newest conversation has them */
  label: string;
  kind: 'assumption' | 'claim';
  /** where it is: each conversation, and the card in it */
  where: { chat: string; node: string }[];
  /** how much rests on it, summed across the conversations */
  weight: number;
  /** nothing holds it up in any conversation it is in */
  unsupported: boolean;
}

const FOUNDATION = new Set(['assumption', 'claim', 'belief']);

/** The Project's foundations, the most leaned-on first. */
export function foundationsAcross(chats: readonly { id: string; updatedAt?: number; map?: ThinkingMap | null }[], limit = 8): Foundation[] {
  const by = new Map<string, Foundation & { newest: number }>();
  for (const c of [...chats].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))) {
    const m = c.map;
    if (!m?.nodes?.length) continue;
    for (const n of m.nodes) {
      if (!isTheirs(n) || !FOUNDATION.has(n.type) || n.status === 'resolved') continue;
      const w = weightOf(m, n.id);
      if (w < 1) continue;
      const k = keyOf(n.label);
      if (!k) continue;
      const held = restsOn(m, n.id).length > 0;
      const f = by.get(k);
      if (f) {
        if (!f.where.some((x) => x.chat === c.id)) f.where.push({ chat: c.id, node: n.id });
        f.weight += w;
        f.unsupported = f.unsupported && !held;
      } else {
        by.set(k, { label: n.label, kind: n.type === 'assumption' ? 'assumption' : 'claim', where: [{ chat: c.id, node: n.id }], weight: w, unsupported: !held, newest: c.updatedAt ?? 0 });
      }
    }
  }
  return [...by.values()]
    .sort((a, b) => b.where.length - a.where.length || Number(b.unsupported) - Number(a.unsupported) || b.weight - a.weight)
    .slice(0, limit)
    .map(({ newest: _n, ...f }) => f);
}

/** Where a Project's last reading is kept on this device. */
export const projectReadingKey = (projectId: string) => `socria.l6.project.v1:${projectId}`;
