'use client';
// components/new-logos/primitives/Surface.tsx — an artifact shown where it is referenced (a card on a conversation's
// or an objective's canvas, its details page): its primitives where they sit on its own plane, scaled to fit the room
// there is, and live — a slider moves, a table takes typing, a plot follows — through the same operations as on the
// artifact's own canvas. Arranging (moving, resizing, adding, removing) is done there.

import { useMemo, useRef } from 'react';
import { evaluateScope } from '@/lib/new-logos/compose';
import { boundsOf, sanitizeComposition } from '@/lib/new-logos/primitives';
import type { NodeRow } from '@/lib/new-logos/model';
import { useNL } from '../state';
import { PrimitiveFrame } from './Primitive';
import { useSize } from './common';

export function Surface({ node, editable = true, maxScale = 1 }: { node: NodeRow; editable?: boolean; maxScale?: number }) {
  const { artifactOps } = useNL();
  const comp = useMemo(() => sanitizeComposition(node.content), [node.content]);
  const scope = useMemo(() => evaluateScope(comp), [comp]);
  const hostRef = useRef<HTMLDivElement>(null);
  const { w } = useSize(hostRef);
  const b = boundsOf(comp.primitives);
  const k = w && b ? Math.min(maxScale, w / b.w) : 0;
  const run = (ops: Parameters<typeof artifactOps>[1]) => artifactOps(node.id, ops);
  // the host is always drawn, so its width is known the moment there is something to fit into it
  return (
    <div ref={hostRef} className="nl-surface nl-cv-noDrag" style={{ height: b ? (k ? Math.ceil(b.h * k) : 120) : 'auto' }}>
      {!b ? <p className="nl-hint">This artifact is empty. Open it to add text, equations, controls, plots, tables, graphs, diagrams or images.</p> : null}
      {b && k ? (
        <div className="nl-surface-plane" style={{ width: b.w, height: b.h, transform: `scale(${k})` }}>
          {comp.primitives.map((p) => (
            <div key={p.id} className="nl-surface-item" style={{ left: p.x - b.x, top: p.y - b.y, width: p.w, height: p.h }}>
              <PrimitiveFrame head="plain" p={p} comp={comp} scope={scope} editable={editable && node.archived_at === null} selected={false} run={run} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
