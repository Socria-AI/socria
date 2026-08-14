// A session's map, small enough to sit in a list. Not a preview you can read —
// a shape you can recognise. Two sessions with different reasoning should look
// different at a glance, which is what makes the rail browsable.
//
// The layout is a pure function of node ids, so a thumbnail never drifts
// between renders the way the live force graph does.

import type { LogosNodeType, ThinkingMap } from '@/lib/logos';

const W = 58;
const H = 38;

// Warm/cool split by what the node does: intentions and evidence read solid,
// open threads read light, friction reads rust.
const TONE: Record<LogosNodeType, string> = {
  goal: 'var(--lg-primary)',
  decision: 'var(--lg-primary)',
  value: 'var(--lg-secondary)',
  belief: 'var(--lg-accent)',
  idea: 'var(--lg-accent)',
  assumption: 'var(--lg-secondary)',
  evidence: 'var(--lg-primary)',
  question: 'var(--lg-ink-40)',
  tension: 'var(--lg-tension)',
  consequence: 'var(--lg-accent)',
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function MapThumb({ map }: { map: ThinkingMap }) {
  const nodes = map.nodes.slice(0, 12);
  if (!nodes.length) {
    return (
      <span className="lg-thumb is-empty" aria-hidden="true">
        <svg viewBox={`0 0 ${W} ${H}`}>
          <circle cx={W / 2} cy={H / 2} r="2.4" fill="currentColor" opacity="0.28" />
        </svg>
      </span>
    );
  }

  // First node anchors the centre; the rest ring it, nudged by their id so the
  // constellation is particular to this session.
  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => {
    if (i === 0) {
      pos.set(n.id, { x: W / 2, y: H / 2 });
      return;
    }
    const k = i - 1;
    const count = Math.max(nodes.length - 1, 1);
    const angle = (k / count) * Math.PI * 2 + hash(n.id) * 0.9;
    const r = 9 + hash(n.id + 'r') * 7;
    pos.set(n.id, {
      x: W / 2 + Math.cos(angle) * r * 1.5,
      y: H / 2 + Math.sin(angle) * r,
    });
  });

  return (
    <span className="lg-thumb" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`}>
        {map.edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--lg-primary)"
              strokeWidth={e.strength === 'strong' ? 0.9 : 0.55}
              opacity={e.strength === 'weak' ? 0.16 : 0.34}
              strokeDasharray={e.relation === 'conflicts' ? '1.6 1.4' : undefined}
            />
          );
        })}
        {nodes.map((n, i) => {
          const p = pos.get(n.id)!;
          const settled = n.status === 'resolved' || n.status === 'revised';
          return (
            <circle
              key={n.id}
              cx={p.x}
              cy={p.y}
              r={i === 0 ? 2.9 : 2}
              fill={settled ? 'none' : TONE[n.type]}
              stroke={settled ? TONE[n.type] : 'none'}
              strokeWidth="0.8"
              opacity={n.status === 'revised' ? 0.42 : 0.9}
            />
          );
        })}
      </svg>
    </span>
  );
}
