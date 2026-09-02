'use client';

// The Board — a mathematician's scratch-space. It renders the same map the
// other lenses do, but as worked-through notebook: equations in a serif math
// face, the operations and asides in a handwritten one, hand-drawn arrows and
// underlines, mistakes struck out with the correction beside them.
//
// The variation is DETERMINISTIC — every wobble, tilt and offset is seeded off
// the node's id — so the board looks hand-made but never jitters between
// renders. It reflects only what has actually been worked out; while the
// Answer Guard is on it never fills in the result the person hasn't reached.

import { useMemo } from 'react';
import type { LogosNode, ThinkingMap } from '@/lib/logos';
import { TeX, MathText } from './TeX';
import { LogosMark } from './LogosMark';

// ── seeded, stable pseudo-randomness per node ───────────────────────
function seed(s: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Kept in step with CHAIN_REL in lib/logos-layout.ts — an equivalence is a
// step in the work like any other, and leaving it out here disconnected the
// chain the Board draws.
const CHAIN_REL = new Set(['transforms_to', 'implies', 'precedes', 'equivalent_to']);
const SETUP = new Set<LogosNode['type']>(['given', 'unknown', 'constraint']);
const ASIDE = new Set<LogosNode['type']>(['theorem', 'definition']);

interface Item {
  node: LogosNode;
  x: number;
  y: number;
  w: number;
  rot: number;
  kind: 'setup' | 'chain' | 'aside';
  op?: string; // operation written beside a chain step
}

export function MathBoard({
  map,
  width,
  height,
  guarded,
}: {
  map: ThinkingMap;
  width: number;
  height: number;
  guarded?: boolean;
}) {
  const { items, arrows } = useMemo(() => layout(map, width), [map, width]);

  if (!map.nodes.length) {
    return (
      <div className="lg-map-empty">
        <span className="lg-map-empty-mark" aria-hidden="true">
          <LogosMark size={46} />
        </span>
        <p className="lg-board-empty">Nothing on the board yet.</p>
      </div>
    );
  }

  return (
    <div className="lg-board">
      <svg className="lg-board-ink" aria-hidden="true">
        <defs>
          <marker id="lg-hand-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,1.5 L8,5 L0,8.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </marker>
        </defs>
        {arrows.map((a) => (
          <path key={a.key} d={a.d} className="lg-board-arrow" markerEnd="url(#lg-hand-arrow)" />
        ))}
      </svg>

      {items.map((it) => {
        const n = it.node;
        const isErr = n.type === 'error' || n.flag === 'error';
        const isResult = n.type === 'result';
        // The guard masks the CONCLUSION — a stated result, or a verification
        // that restates it — across ALL three channels (tex, label, note), so
        // the board can't fill in an answer the person hasn't reached. The
        // working itself (givens, steps, equations, errors) stays visible;
        // that is the scratch the board exists to show.
        const hideVal = !!guarded && (isResult || n.type === 'verification');
        const tex = n.tex || '';
        return (
          <div
            key={n.id}
            className={`lg-board-item lg-board-${it.kind}${isErr ? ' is-error' : ''}${
              n.flag === 'verified' ? ' is-verified' : ''
            }${isResult ? ' is-result' : ''}`}
            style={{
              left: it.x,
              top: it.y,
              width: it.w,
              transform: `rotate(${it.rot}deg)`,
            }}
          >
            {/* setup gets a handwritten tag: given / find */}
            {it.kind === 'setup' && (
              <span className="lg-board-tag">
                {n.type === 'unknown' ? 'find' : n.type === 'constraint' ? 'note' : 'given'}
              </span>
            )}

            {/* the operation, written by hand to the side of a step */}
            {it.op && <span className="lg-board-op">{it.op}</span>}

            <span className="lg-board-eq">
              {hideVal ? (
                <TeX tex={'=\\ ?'} />
              ) : tex ? (
                <TeX tex={tex} />
              ) : (
                <span className="lg-board-prose">{n.label}</span>
              )}
              {isErr && <span className="lg-board-strike" aria-hidden="true" />}
            </span>

            {/* aside (theorem/definition) reads as a margin note */}
            {it.kind === 'aside' && <span className="lg-board-by">by {n.label}</span>}

            {/* a note, or the correction on a mistake — suppressed on a
                guarded conclusion, where it would spell out the answer */}
            {n.note && !hideVal && (
              <span className={`lg-board-note${isErr ? ' is-fix' : ''}`}>
                {isErr && <span className="lg-board-arrowin" aria-hidden="true">↳</span>}
                <MathText>{n.note}</MathText>
              </span>
            )}
          </div>
        );
      })}

      {guarded && (
        <span className="lg-board-guardnote">
          working it out — the answer stays yours until you reveal it
        </span>
      )}
    </div>
  );
}

// ── layout ──────────────────────────────────────────────────────────
function layout(map: ThinkingMap, width: number) {
  const W = Math.max(360, width);
  const byId = new Map(map.nodes.map((n) => [n.id, n]));

  // asides = theorem/definition that justifies a step
  const asideOf = new Map<string, string>();
  for (const e of map.edges) {
    if (e.relation === 'justifies' && ASIDE.has(byId.get(e.from)?.type as any) && byId.has(e.to)) {
      asideOf.set(e.from, e.to);
    }
  }
  const setup = map.nodes.filter((n) => SETUP.has(n.type) || (ASIDE.has(n.type) && !asideOf.has(n.id)));
  const setupIds = new Set(setup.map((n) => n.id));
  const asides = map.nodes.filter((n) => asideOf.has(n.id));
  const asideIds = new Set(asides.map((n) => n.id));
  const chain = map.nodes.filter((n) => !setupIds.has(n.id) && !asideIds.has(n.id));

  // op for a chain node = the op of its incoming transforms_to edge
  const opInto = new Map<string, string>();
  const prevOf = new Map<string, string>();
  for (const e of map.edges) {
    if (CHAIN_REL.has(e.relation) && byId.has(e.from) && byId.has(e.to)) {
      if (e.op) opInto.set(e.to, e.op);
      prevOf.set(e.to, e.from);
    }
  }

  // order chain by longest-path depth over chain relations
  const preds = new Map<string, string[]>();
  for (const e of map.edges) {
    if (!CHAIN_REL.has(e.relation) || !byId.has(e.from) || !byId.has(e.to)) continue;
    if (!preds.has(e.to)) preds.set(e.to, []);
    preds.get(e.to)!.push(e.from);
  }
  const memo = new Map<string, number>();
  const depth = (id: string, seen = new Set<string>()): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const ps = (preds.get(id) ?? []).filter((p) => !setupIds.has(p) && !asideIds.has(p));
    const d = ps.length ? Math.max(...ps.map((p) => depth(p, seen))) + 1 : 0;
    memo.set(id, d);
    return d;
  };
  let maxD = 0;
  for (const n of chain) maxD = Math.max(maxD, depth(n.id));
  const rank = (n: LogosNode) =>
    n.type === 'verification' ? maxD + 2 : n.type === 'result' ? maxD + 1 : depth(n.id);
  const ordered = [...chain].sort((a, b) => rank(a) - rank(b) || chain.indexOf(a) - chain.indexOf(b));

  const items: Item[] = [];
  const pos = new Map<string, Item>();
  const colX = Math.min(W * 0.3, 220);
  const eqW = Math.min(300, W * 0.42);

  // setup across the top, jittered
  setup.forEach((n, i) => {
    const r = seed(n.id + 's');
    const per = Math.min(210, (W - 80) / Math.max(setup.length, 1));
    const it: Item = {
      node: n,
      x: 40 + i * per + (r() - 0.5) * 18,
      y: 30 + (r() - 0.5) * 16,
      // floor keeps the width positive on a narrow board with many setup
      // nodes — a negative inline width is invalid CSS and falls back to
      // auto, which makes the tags render wider than their slot and overlap.
      w: Math.max(64, Math.min(180, per - 14)),
      rot: (r() - 0.5) * 3.2,
      kind: 'setup',
    };
    items.push(it);
    pos.set(n.id, it);
  });

  // chain down the middle-left
  const top = 30 + (setup.length ? 110 : 0);
  const gap = 92;
  ordered.forEach((n, i) => {
    const r = seed(n.id + 'c');
    const it: Item = {
      node: n,
      x: colX + (r() - 0.5) * 30,
      y: top + i * gap + (r() - 0.5) * 12,
      w: eqW,
      rot: (r() - 0.5) * 2.4,
      kind: 'chain',
      op: opInto.get(n.id),
    };
    items.push(it);
    pos.set(n.id, it);
  });

  // asides in the right margin, near the step they justify
  asides.forEach((n) => {
    const target = pos.get(asideOf.get(n.id)!);
    const r = seed(n.id + 'a');
    const it: Item = {
      node: n,
      x: Math.min(colX + eqW + 30 + (r() - 0.5) * 16, W - 190),
      y: (target?.y ?? top) + (r() - 0.5) * 10,
      w: 170,
      rot: (r() - 0.5) * 4 + 1.5,
      kind: 'aside',
    };
    items.push(it);
    pos.set(n.id, it);
  });

  // hand-drawn arrows down the chain (from the prev worked line into this one)
  const arrows: { key: string; d: string }[] = [];
  for (const n of ordered) {
    const from = prevOf.get(n.id);
    const a = from ? pos.get(from) : undefined;
    const b = pos.get(n.id);
    if (!a || !b || b.y <= a.y) continue;
    const x1 = a.x + 22;
    const y1 = a.y + 40;
    const x2 = b.x + 22;
    const y2 = b.y - 6;
    const r = seed(n.id + 'arr');
    const wob = (r() - 0.5) * 16;
    const midX = (x1 + x2) / 2 + wob;
    const midY = (y1 + y2) / 2;
    arrows.push({ key: n.id, d: `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}` });
  }

  return { items, arrows };
}
