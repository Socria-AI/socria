'use client';
// components/logos5/IdeaSeeds.tsx — AN EMPTY LINE OF THINKING, AS IDEAS TO EXPLORE.
//
// A small mind map in the space's empty canvas (lib/logos5/seeds.ts): a centre,
// "A new line of thinking", and a few clusters of ideas around it — what was
// left open elsewhere, where they might go further, and something new. Each
// idea is a bubble; pressing one puts its question in the chatbox to be made
// their own (never sent by itself). On a phone the clusters stack, as rows of
// rounded ideas, under the centre.

import { useEffect, useMemo, useRef, useState } from 'react';
import { seedLayout, type Seed, type SeedGroup } from '@/lib/logos5/seeds';
import './seeds.css';

type Pt = { x: number; y: number };

/**
 * A gently bowed line from a to b, starting `fromR` out from a and stopping on the edge of b (`toR`), so no line runs
 * under a bubble or the centre — some themes draw them translucent. It bows away from the centre.
 */
function arc(a: Pt, b: Pt, fromR: number, toR: number, centre: Pt): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const away = -uy * (midX - centre.x) + ux * (midY - centre.y) < 0 ? -1 : 1;
  const mx = midX - uy * len * 0.12 * away;
  const my = midY + ux * len * 0.12 * away;
  const sx = a.x + ux * fromR;
  const sy = a.y + uy * fromR;
  const ex0 = b.x - mx;
  const ey0 = b.y - my;
  const el = Math.hypot(ex0, ey0) || 1;
  const r = (n: number) => Math.round(n * 10) / 10;
  return `M ${r(sx)} ${r(sy)} Q ${r(mx)} ${r(my)} ${r(b.x - (ex0 / el) * toR)} ${r(b.y - (ey0 / el) * toR)}`;
}

export function IdeaSeeds({ groups, narrow, onPick }: { groups: SeedGroup[]; narrow: boolean; onPick: (seed: Seed) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((cur) => (cur && Math.abs(cur.w - r.width) < 2 && Math.abs(cur.h - r.height) < 2 ? cur : { w: Math.round(r.width), h: Math.round(r.height) }));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const layout = useMemo(() => (size && !narrow ? seedLayout(groups, size.w, size.h) : null), [groups, size, narrow]);
  const pick = (s: Seed) => {
    setPicked(s.prompt);
    onPick(s);
  };
  let n = 0;

  if (narrow) {
    return (
      <div className="ls-seeds is-narrow" ref={boxRef} aria-label="Ideas to explore">
        <div className="ls-seed-centre">
          <span className="ls-seed-ct">A new line of thinking</span>
          <span className="ls-seed-cs">Pick an idea, or say your own below</span>
        </div>
        {groups.map((g) => (
          <section key={g.name} className="ls-seed-group" data-kind={g.kind}>
            <h3 className="ls-seed-gn">{g.name}</h3>
            <div className="ls-seed-row">
              {g.seeds.map((s) => (
                <button
                  key={s.prompt}
                  type="button"
                  className={`ls-seed is-pill${picked === s.prompt ? ' is-picked' : ''}`}
                  data-kind={s.kind}
                  style={{ ['--i' as string]: n++ }}
                  onClick={() => pick(s)}
                  aria-label={`Explore: ${s.prompt}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="ls-seeds" ref={boxRef} aria-label="Ideas to explore">
      {layout && size && (
        <>
          <svg className="ls-seed-lines" width={size.w} height={size.h} aria-hidden="true">
            {layout.groups.map((g, i) => (
              <g key={i} data-kind={groups[i].kind}>
                <path d={arc(layout.center, g.hub, layout.center.d / 2 + 10, 0, layout.center)} />
                {g.bubbles.map((b, j) => (
                  <path key={j} className="is-twig" d={arc(g.hub, b, 0, b.d / 2, layout.center)} />
                ))}
              </g>
            ))}
          </svg>
          <div className="ls-seed-centre is-round" style={{ left: layout.center.x - layout.center.d / 2, top: layout.center.y - layout.center.d / 2, width: layout.center.d, height: layout.center.d }}>
            <span className="ls-seed-ct">A new line of thinking</span>
            <span className="ls-seed-cs">Pick an idea, or say your own below</span>
          </div>
          {layout.groups.map((g, i) => (
            <span key={`n${i}`} className="ls-seed-gn is-floating" data-kind={groups[i].kind} style={{ left: g.hub.x, top: g.hub.y }}>
              <i aria-hidden="true" />
              {g.name.label}
            </span>
          ))}
          {layout.groups.map((g, i) =>
            g.bubbles.map((b, j) => {
              const s = groups[i].seeds[j];
              return (
                <button
                  key={s.prompt}
                  type="button"
                  className={`ls-seed${layout.small ? ' is-small' : ''}${picked === s.prompt ? ' is-picked' : ''}`}
                  data-kind={s.kind}
                  style={{ left: b.x - b.d / 2, top: b.y - b.d / 2, width: b.d, height: b.d, ['--i' as string]: n++ }}
                  onClick={() => pick(s)}
                  aria-label={`Explore: ${s.prompt}`}
                  title={s.prompt}
                >
                  <span>{s.label}</span>
                </button>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
