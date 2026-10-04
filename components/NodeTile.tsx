// The mark a line of thinking carries in a rail: a small square with its map
// in it — one dot per node, up to nine, joined to the first the way a map
// grows out of its opening thought. A one-node session is a single dot; a
// session that has grown reads busier at a glance, which is the point.
//
// Drawn from the node COUNT and the session id rather than the map itself,
// because both rails list sessions without loading their maps. The layout is
// a pure function of those two, so a row never shifts between renders and the
// same session looks the same in the Core rail and the Logos rail.

const S = 24;
const C = S / 2;
const MAX = 9;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function NodeTile({ count, seed, size = 22 }: { count: number; seed: string; size?: number }) {
  const n = Math.max(1, Math.min(MAX, Math.floor(count) || 1));
  const turn = hash(seed) * Math.PI * 2;
  // The first node at the centre, the rest on a ring nudged per session so
  // two sessions of the same size are still told apart.
  const pts = [{ x: C, y: C }];
  for (let i = 1; i < n; i++) {
    const a = turn + ((i - 1) / Math.max(1, n - 1)) * Math.PI * 2;
    // A bigger map spreads further out, so nine nodes do not crowd the hub.
    const r = Math.min(9.4, 5.4 + n * 0.42) + (hash(`${seed}:${i}`) - 0.5) * 1.6;
    pts.push({ x: C + Math.cos(a) * r, y: C + Math.sin(a) * r });
  }
  return (
    <span className="s-tile" aria-hidden="true" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${S} ${S}`} width={size} height={size}>
        {pts.slice(1).map((p, i) => (
          <line key={`s${i}`} x1={C} y1={C} x2={p.x} y2={p.y} className="s-tile-edge" />
        ))}
        {/* neighbours on the ring touch, so a big map reads as a web */}
        {n > 3 &&
          pts.slice(1).map((p, i) => {
            if (i % 2) return null;
            const q = pts[1 + ((i + 1) % (n - 1))];
            return <line key={`r${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="s-tile-edge is-faint" />;
          })}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 2.3 : n > 6 ? 1.3 : 1.55} className={i === 0 ? 's-tile-hub' : 's-tile-node'} />
        ))}
      </svg>
    </span>
  );
}
