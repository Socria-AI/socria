'use client';

// Logos 3.5's displays, live on the docs page — made from the words above
// each one by the product's own code (the request reader and the makers in
// lib/objects), drawn by the same figures the workspace uses, and worked in
// here: switch a view, drag, tick, undo. Nothing is saved; the page keeps its
// own small workspace while it is open.

import { useMemo, useState } from 'react';
import { ObjectFigure } from '@/components/objects/ObjectFigure';
import { apply, create, EMPTY_SPACE, makeFromRequest, readDisplayRequest, seek, type ObjectSpace } from '@/lib/objects';

export interface DisplayExample {
  said: string;
  /** what the person said just before, when the request points back at it ("these expenses") */
  before?: string;
  caption: string;
}

/** A fixed day, so a "Jan 5" on the page is the same day for every reader. */
const TODAY = '2026-10-11';

export function DisplaysShowcase({ items }: { items: readonly DisplayExample[] }) {
  const first = useMemo(() => {
    let space: ObjectSpace = EMPTY_SPACE;
    const ids: (string | null)[] = [];
    for (const it of items) {
      const req = readDisplayRequest(it.said);
      const turns = it.before ? [it.before, it.said] : [it.said];
      const made = req ? makeFromRequest(req, { said: turns.join('\n'), map: { nodes: [], edges: [] }, space, latest: it.said, turns, today: TODAY }) : null;
      const c = made && !('why' in made) && !('open' in made) ? create(space, made.kind, made.state, { origin: made.origin }) : null;
      if (c) space = c.space;
      ids.push(c ? c.obj.id : null);
    }
    return { space, ids };
  }, [items]);
  const [space, setSpace] = useState<ObjectSpace>(first.space);

  return (
    <div className="d-displays">
      {items.map((it, i) => {
        const id = first.ids[i];
        const obj = id ? space.objs.find((o) => o.id === id) : null;
        return (
          <figure key={it.said} className="d-display">
            <p className="d-show-said">
              <span>You</span>
              {it.before ? (
                <>
                  <em className="d-display-before">{it.before}</em> {it.said}
                </>
              ) : (
                it.said
              )}
            </p>
            <div className="d-display-frame">
              {obj ? (
                <ObjectFigure
                  obj={obj}
                  at={obj.at}
                  mode="live"
                  space={space}
                  onOp={(op, args) => {
                    const r = apply(space, obj.id, op, args, { by: 'person' });
                    if (r.ok) setSpace(r.space);
                    return r.ok ? { ok: true } : { ok: false, why: r.why };
                  }}
                  onSeek={(at) => setSpace(seek(space, obj.id, at))}
                />
              ) : (
                <p className="d-display-none">This example could not be made.</p>
              )}
            </div>
            <figcaption>{it.caption}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}
