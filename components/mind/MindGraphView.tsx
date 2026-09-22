'use client';
// components/mind/MindGraphView.tsx
//
// The Mind Graph, drawn and inspectable.
//
// NOT A SEPARATE REPRESENTATION. The nodes and edges here are the rows from
// mind_nodes and mind_edges, unchanged. That equivalence is the point of the
// whole architecture, so this component deliberately holds no model of its
// own beyond x/y positions — which belong to the drawing, not to the memory.
//
// Canvas rather than SVG: a few thousand nodes is past what SVG handles, and
// a graph that stutters is one nobody explores. The layout is a small
// force simulation written here rather than pulled in, because it needs to be
// deterministic under reduced motion and to stop settling rather than run
// forever.
//
// A LIST VIEW IS NOT A FALLBACK, it is the other half. The canvas answers
// "what is connected to what"; the list answers "what do you actually hold",
// and the second question is the one somebody arrives with when they want to
// correct something. It also means the page works with reduced motion, with
// a screen reader, and on a phone.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './mind-graph.css';

interface Provenance {
  kind: string;
  surface: string;
  at: number;
  conversationId?: string;
  sourceNodeId?: string;
  charStart?: number;
  charEnd?: number;
  note?: string;
}
export interface Node {
  id: string; type: string; label: string; content: string; aliases: string[];
  status: string; confidence: number; certainty: number; importance: number;
  seen: number; private: boolean; provenance: Provenance[];
  createdAt: number; updatedAt: number; lastAccessed: number;
}
export interface Edge {
  id: string; sourceId: string; targetId: string; relationship: string;
  confidence: number; strength: number; provenance: Provenance[];
  createdAt: number; updatedAt: number; lastReinforced: number;
}
interface Pending { fingerprint?: string; type: string; label: string; content: string; sources: string[]; firstAt: number; lastAt: number }
interface Source { id: string; name: string; bytes: number; createdAt: number }

/** Socria's own colours, by what a node is. */
const TYPE_COLOUR: Record<string, string> = {
  Person: '#5e7633', Organization: '#5e7633', Project: '#26485A', Plan: '#26485A',
  Goal: '#26485A', Decision: '#D8402F', Belief: '#3A6EA5', Assumption: '#3A6EA5',
  Preference: '#3A6EA5', Concept: '#6b6b5f', Insight: '#a8842c', Question: '#a8842c',
  Uncertainty: '#a8842c', Evidence: '#3A6EA5', Source: '#8a8a7a', Event: '#8a6a4a',
  Experience: '#8a6a4a', Place: '#6b6b5f', Conversation: '#8a8a7a',
};
const FALLBACK_COLOUR = '#8a8a7a';
const colourOf = (t: string) => TYPE_COLOUR[t] ?? FALLBACK_COLOUR;

/** Faded when it is not current. The statuses are visible, never hidden. */
const STATUS_ALPHA: Record<string, number> = {
  active: 1, tentative: 0.75, uncertain: 0.65, contradicted: 0.6,
  historical: 0.5, superseded: 0.45, archived: 0.25,
};

interface Placed extends Node { x: number; y: number; vx: number; vy: number }

/** Mirrors MindStoreFailure in lib/mind/store.ts. */
type StorageFault = 'missing-tables' | 'denied' | 'unavailable';

export function MindGraphView() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [forgotten, setForgotten] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  /** Set when the STORE failed, as opposed to the person having nothing yet. */
  const [storage, setStorage] = useState<StorageFault | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const canvas = useRef<HTMLCanvasElement | null>(null);
  const placed = useRef<Placed[]>([]);
  const frame = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mind', { cache: 'no-store' });
      if (!res.ok) throw new Error('failed');
      const j = await res.json();
      setStorage(j.storage?.ok === false ? (j.storage.reason as StorageFault) : null);
      setNodes(j.nodes ?? []);
      setEdges(j.edges ?? []);
      setPending(j.pending ?? []);
      setSources(j.sources ?? []);
      setForgotten(j.forgotten ?? 0);
      setErr(null);
    } catch {
      setErr('Could not read your memory just now.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── layout ────────────────────────────────────────────────────────
  //
  // A few hundred iterations of repulsion plus edge springs, then it stops.
  // Running forever would be a battery drain in service of a picture that
  // stopped changing after the first second.
  useEffect(() => {
    if (!nodes.length) { placed.current = []; return; }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const W = 900, H = 560;
    // Deterministic placement from the id, so the same graph draws the same
    // way twice and nothing jumps between reloads.
    placed.current = nodes.map((n, i) => {
      const seed = [...n.id].reduce((a, c) => a + c.charCodeAt(0), 0);
      const angle = (seed % 360) * (Math.PI / 180);
      const r = 120 + ((seed * 7) % 180);
      return { ...n, x: W / 2 + Math.cos(angle) * r, y: H / 2 + Math.sin(angle) * r, vx: 0, vy: 0 };
    });

    const byId = new Map(placed.current.map((p) => [p.id, p]));
    const steps = reduced ? 200 : 420;
    for (let s = 0; s < steps; s++) {
      const k = 1 - s / steps;
      for (let i = 0; i < placed.current.length; i++) {
        const a = placed.current[i];
        for (let j = i + 1; j < placed.current.length; j++) {
          const b = placed.current[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = (i - j) || 1; dy = 1; d2 = 2; }
          if (d2 > 160_000) continue;
          // Strong enough to actually separate a small graph. Too weak and
          // six nodes settle into a knot in the middle of an empty canvas
          // with their labels on top of each other, which reads as a bug
          // rather than as a picture of anything.
          const f = (14_000 / d2) * k;
          const d = Math.sqrt(d2);
          a.vx += (dx / d) * f; a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
        }
      }
      for (const e of edges) {
        const a = byId.get(e.sourceId), b = byId.get(e.targetId);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        // A stronger edge pulls harder: clusters form from what is actually
        // connected rather than from anything imposed.
        const f = (d - 150) * 0.010 * (0.4 + e.strength) * k;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
      for (const p of placed.current) {
        // Just enough to keep the graph on the canvas; any more and it
        // fights the repulsion and pulls everything back into a knot.
        p.vx += (W / 2 - p.x) * 0.0006; p.vy += (H / 2 - p.y) * 0.0006;
        p.x += p.vx; p.y += p.vy; p.vx *= 0.82; p.vy *= 0.82;
        p.x = Math.max(24, Math.min(W - 24, p.x));
        p.y = Math.max(24, Math.min(H - 24, p.y));
      }
    }
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const draw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const W = 900, H = 560;
    c.width = W * dpr; c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const byId = new Map(placed.current.map((p) => [p.id, p]));

    for (const e of edges) {
      const a = byId.get(e.sourceId), b = byId.get(e.targetId);
      if (!a || !b) continue;
      const lit = selected && (e.sourceId === selected || e.targetId === selected);
      ctx.strokeStyle = lit ? 'rgba(35,36,31,.55)' : 'rgba(35,36,31,.13)';
      ctx.lineWidth = lit ? 1.6 : 0.4 + e.strength * 1.2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (lit) {
        ctx.fillStyle = 'rgba(35,36,31,.7)';
        ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
        ctx.fillText(e.relationship, (a.x + b.x) / 2 + 4, (a.y + b.y) / 2 - 3);
      }
    }

    // Labels already on the canvas, so a later one can avoid them.
    const drawn: { x: number; y: number; w: number; h: number }[] = [];
    for (const p of placed.current) {
      const r = 5 + p.importance * 9;
      ctx.globalAlpha = STATUS_ALPHA[p.status] ?? 0.6;
      ctx.fillStyle = colourOf(p.type);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      if (p.id === selected) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#23241f'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(35,36,31,.78)';
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      const label = p.label.length > 26 ? p.label.slice(0, 25) + '…' : p.label;
      // Two labels on top of each other are less readable than one, so a
      // label that would collide is dropped — unless its node is selected,
      // where the name is the whole reason to look.
      const box = { x: p.x + r + 4, y: p.y + 4, w: ctx.measureText(label).width, h: 12 };
      const collides = drawn.some(
        (d) => box.x < d.x + d.w + 4 && box.x + box.w + 4 > d.x && box.y < d.y + d.h && box.y + box.h > d.y
      );
      if (!collides || p.id === selected) {
        ctx.fillText(label, box.x, box.y);
        drawn.push(box);
      }
    }
  }, [edges, selected]);

  // `view` matters here: the canvas is conditionally rendered, so switching
  // back from the list mounts a FRESH element that has never been drawn to.
  // Without this the graph comes back blank until something else changes —
  // and the layout is already settled, so nothing else would.
  useEffect(() => { draw(); }, [draw, view]);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  const pick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 900;
    const y = ((ev.clientY - rect.top) / rect.height) * 560;
    let best: Placed | null = null, bestD = 22;
    for (const p of placed.current) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { best = p; bestD = d; }
    }
    setSelected(best ? best.id : null);
  };

  const node = useMemo(() => nodes.find((n) => n.id === selected) ?? null, [nodes, selected]);
  const connections = useMemo(() => {
    if (!node) return [];
    return edges
      .filter((e) => e.sourceId === node.id || e.targetId === node.id)
      .map((e) => {
        const otherId = e.sourceId === node.id ? e.targetId : e.sourceId;
        return {
          edge: e,
          out: e.sourceId === node.id,
          other: nodes.find((n) => n.id === otherId) ?? null,
        };
      })
      .filter((c) => c.other);
  }, [node, edges, nodes]);

  async function mutate(body: Record<string, unknown>, method: 'PATCH' | 'DELETE') {
    setBusy(true); setNote(null);
    try {
      const res = await fetch('/api/mind/node', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('failed');
      await load();
      if (method === 'DELETE') setSelected(null);
      setNote(method === 'DELETE' ? 'Forgotten. It will not come back.' : 'Saved.');
    } catch {
      setNote('That did not save.');
    }
    setBusy(false);
  }

  async function removeSource(id: string) {
    setBusy(true); setNote(null);
    try {
      const res = await fetch('/api/mind/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'failed');
      await load();
      setNote(j?.note ?? 'File removed.');
    } catch {
      setNote('That file could not be removed.');
    }
    setBusy(false);
  }

  async function upload(file: File) {
    setBusy(true); setNote(null);
    try {
      const text = await file.text();
      const res = await fetch('/api/mind/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, text }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'failed');
      await load();
      setNote(`Read ${j.chunks} passages: ${j.created} new, ${j.reinforced} already known${j.conflicts ? `, ${j.conflicts} in conflict` : ''}.`);
    } catch (e) {
      setNote(e instanceof Error && e.message !== 'failed' ? e.message : 'That file could not be read.');
    }
    setBusy(false);
  }

  if (loading) return <p className="mg-quiet">Reading your memory…</p>;
  if (err) return <p className="dp-err" role="alert">{err}</p>;

  return (
    <div className="mg">
      <div className="mg-bar">
        <span className="mg-count">
          {nodes.length} {nodes.length === 1 ? 'thing' : 'things'} · {edges.length}{' '}
          {edges.length === 1 ? 'connection' : 'connections'}
          {forgotten > 0 && <> · {forgotten} forgotten</>}
        </span>
        <span className="mg-views">
          <button type="button" className={view === 'graph' ? 'on' : ''} onClick={() => setView('graph')}>Graph</button>
          <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
        </span>
        <label className="mg-upload">
          Add a .txt file
          <input
            type="file"
            accept=".txt,text/plain"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.currentTarget.value = '';
            }}
          />
        </label>
      </div>

      {note && <p className="mg-note" role="status">{note}</p>}

      {storage ? (
        // NOT "nothing yet". Nothing yet is a fact about the person; this is a
        // fact about the deployment, and showing the first when the second is
        // true tells somebody they have no memories when the truth is that
        // nothing was ever able to store one.
        <p className="mg-quiet" role="alert">
          <strong>Memory is not set up on this deployment.</strong>{' '}
          {storage === 'missing-tables'
            ? 'The tables it lives in do not exist yet — supabase/schema.sql has not been applied to this database.'
            : storage === 'denied'
              ? 'The database refused the read. This usually means the server is holding the anon key where the service role key belongs.'
              : 'The database could not be reached just now.'}{' '}
          Nothing you have said has been lost — none of it was ever stored.
          Run <code>npm run doctor:mind</code> against this environment for the
          specifics.
        </p>
      ) : !nodes.length ? (
        <p className="mg-quiet">
          Nothing yet. Talk to Core 4, or add a .txt file, and what it
          understands will appear here.
        </p>
      ) : view === 'graph' ? (
        <canvas
          ref={canvas}
          className="mg-canvas"
          style={{ width: '100%', aspectRatio: '900 / 560' }}
          onClick={pick}
          aria-label={`A graph of ${nodes.length} things Socria remembers. Switch to the list view to read them.`}
        />
      ) : (
        <ul className="mg-list">
          {[...nodes]
            .sort((a, b) => a.type.localeCompare(b.type) || b.importance - a.importance)
            .map((n) => (
              <li key={n.id}>
                <button type="button" className={n.id === selected ? 'on' : ''} onClick={() => setSelected(n.id)}>
                  <span className="mg-dot" style={{ background: colourOf(n.type), opacity: STATUS_ALPHA[n.status] ?? 0.6 }} />
                  <span className="mg-li-type">{n.type}</span>
                  <span className="mg-li-label">{n.label}</span>
                  {n.status !== 'active' && <span className="mg-li-status">{n.status}</span>}
                  {n.private && <span className="mg-li-private">private</span>}
                </button>
              </li>
            ))}
        </ul>
      )}

      {node && <NodePanel
        node={node}
        connections={connections}
        sources={sources}
        busy={busy}
        onClose={() => setSelected(null)}
        onSave={(patch) => void mutate({ id: node.id, ...patch }, 'PATCH')}
        onForget={() => void mutate({ id: node.id, kind: 'node' }, 'DELETE')}
        onForgetEdge={(id) => void mutate({ id, kind: 'edge' }, 'DELETE')}
        onSelect={setSelected}
      />}

      {sources.length > 0 && (
        <section className="mg-sources">
          <h2>Files you added</h2>
          <ul>
            {sources.map((sf) => (
              <li key={sf.id}>
                <span>{sf.name}</span>
                <span className="mg-src-size">{Math.round(sf.bytes / 1024)} KB</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeSource(sf.id)}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
          <p>
            Removing a file leaves what Socria learned from it. Those are in
            the graph above and each can be removed on its own.
          </p>
        </section>
      )}

      {pending.length > 0 && (
        <section className="mg-pending">
          <h2>Noticed once, not believed</h2>
          <p>
            Things Socria has read between the lines a single time. They are
            not in the graph, they never reach a conversation, and they only
            become memory if a <em>different</em> conversation suggests the
            same thing. One afternoon is not a pattern.
          </p>
          <p className="mg-pending-note">
            Saying <em>no</em> to one clears it and stops it being suggested
            again.
          </p>
          <ul>
            {pending.map((p) => (
              <li key={p.fingerprint ?? p.label}>
                <span>
                  <span className="mg-li-type">{p.type}</span> {p.label} — {p.content}
                </span>
                <button
                  type="button"
                  disabled={busy || !p.fingerprint}
                  onClick={() => p.fingerprint && void mutate({ id: p.fingerprint, kind: 'pending' }, 'DELETE')}
                  aria-label={`Dismiss: ${p.label}`}
                >
                  no
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function NodePanel({
  node, connections, sources, busy, onClose, onSave, onForget, onForgetEdge, onSelect,
}: {
  node: Node;
  connections: { edge: Edge; out: boolean; other: Node | null }[];
  sources: Source[];
  busy: boolean;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => void;
  onForget: () => void;
  onForgetEdge: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const [content, setContent] = useState(node.content);
  const [challenge, setChallenge] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => { setContent(node.content); setChallenge(''); setConfirming(false); }, [node.id, node.content]);

  const when = (t: number) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  return (
    <aside className="mg-panel" aria-label={`About ${node.label}`}>
      <div className="mg-panel-head">
        <span className="mg-dot" style={{ background: colourOf(node.type) }} />
        <span className="mg-panel-type">{node.type}</span>
        <button type="button" className="mg-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <h3>{node.label}</h3>

      <textarea
        className="mg-edit"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        aria-label="What Socria understands"
      />
      {content !== node.content && (
        <button type="button" className="mg-save" disabled={busy} onClick={() => onSave({ content })}>
          Save this wording
        </button>
      )}

      <dl className="mg-meta">
        <div><dt>Status</dt><dd>
          <select value={node.status} disabled={busy} onChange={(e) => onSave({ status: e.target.value })}>
            {['active', 'tentative', 'uncertain', 'historical', 'superseded', 'contradicted', 'archived'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </dd></div>
        <div><dt>How sure Socria is</dt><dd>{Math.round(node.confidence * 100)}%</dd></div>
        <div><dt>How sure you seemed</dt><dd>{Math.round(node.certainty * 100)}%</dd></div>
        <div><dt>Come up</dt><dd>{node.seen} {node.seen === 1 ? 'time' : 'times'}</dd></div>
        <div><dt>First known</dt><dd>{when(node.createdAt)}</dd></div>
        <div><dt>Last changed</dt><dd>{when(node.updatedAt)}</dd></div>
        {node.private && <div><dt>Private</dt><dd>Never carried into Logos</dd></div>}
      </dl>

      {connections.length > 0 && (
        <section className="mg-conn">
          <h4>How it connects</h4>
          <ul>
            {connections.map(({ edge, out, other }) => {
              // WHY something changed lives on the edge, not on either node —
              // it is a fact about the transition. A panel that showed the
              // supersession without the reason would answer "what do you
              // think now" and leave out "and why did that move", which is
              // the more useful half.
              const why = [...edge.provenance].reverse().find((pv) => pv.note)?.note;
              return (
                <li key={edge.id}>
                  <span className="mg-conn-row">
                    <button type="button" className="mg-link" onClick={() => other && onSelect(other.id)}>
                      {out ? '→' : '←'} <em>{edge.relationship}</em> {other?.label}
                    </button>
                    <button type="button" className="mg-unlink" disabled={busy} onClick={() => onForgetEdge(edge.id)} aria-label="Remove this connection">
                      remove
                    </button>
                  </span>
                  {why && <span className="mg-conn-why">{why}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mg-prov">
        <h4>Where this came from</h4>
        <ul>
          {node.provenance.map((p, i) => {
            const src = p.sourceNodeId ? sources.find((s) => s.id === p.sourceNodeId) : null;
            return (
              <li key={i}>
                <span className="mg-kind">{p.kind}</span> · {p.surface}
                {src && <> · {src.name}{typeof p.charStart === 'number' ? ` (chars ${p.charStart}–${p.charEnd})` : ''}</>}
                · {when(p.at)}
                {p.note && <div className="mg-prov-note">{p.note}</div>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mg-challenge">
        <h4>Is this wrong?</h4>
        <p>
          Telling Socria it is wrong keeps the claim and marks it — so the
          record of what it got wrong survives. Forgetting removes it for
          good, and it cannot come back.
        </p>
        <input
          type="text"
          value={challenge}
          placeholder="What it got wrong"
          onChange={(e) => setChallenge(e.target.value)}
          aria-label="What Socria got wrong"
        />
        <div className="mg-actions">
          <button type="button" disabled={busy || !challenge.trim()} onClick={() => onSave({ challenge })}>
            That is wrong
          </button>
          {confirming ? (
            <button type="button" className="mg-forget go" disabled={busy} onClick={onForget}>
              Forget it permanently
            </button>
          ) : (
            <button type="button" className="mg-forget" disabled={busy} onClick={() => setConfirming(true)}>
              Forget
            </button>
          )}
        </div>
      </section>
    </aside>
  );
}
