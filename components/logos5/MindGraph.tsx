'use client';
// components/logos5/MindGraph.tsx — the Mind Graph: what Socria remembers
// about how you think, as its own place (lib/logos5/mindgraph.ts).
//
// Read from the memory Socria already keeps — GET /api/mind?scope=logos (so
// nothing private arrives on this surface) and the atlas for the
// conversations each memory was learned in. Every memory can be edited
// (PATCH /api/mind/node), shown where it came from, or forgotten
// (DELETE /api/mind/node — tombstoned, so it is not learned again). Nothing
// here is used until a line of thinking reads it.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { GROUP_LABEL, GROUP_REGION, GROUP_TAB, groupOf, memoryMatches, mindDrawing, type EdgeIn, type MemoryIn, type MindGroup, type Neuron, type PlaceIn } from '@/lib/logos5/mindgraph';
import { L5Switch } from './L5Chrome';

/** a dendrite, drawn upward from the cell body and turned to its angle */
const BRANCH = 'M0,-30 C4,-46 12,-54 16,-70 M12,-54 C20,-56 26,-64 34,-64 M16,-70 C14,-80 20,-86 20,-94';
/** the cell body, at radius 30 */
const SOMA = 'M0,-30 C16,-33 31,-20 30,-3 C32,15 17,31 0,29 C-17,31 -32,15 -30,-3 C-32,-20 -16,-33 0,-30Z';
/** each region's cell body: paper's, unless a dark ground gives its own (app/themes.css), as it does the ink a neuron is drawn in */
const FILL: Record<MindGroup, string> = { habit: 'var(--l5m-habit, #EDF3E8)', fact: 'var(--l5m-fact, #fffdf8)', project: 'var(--l5m-project, #FAF3E3)' };

function ago(at: number): string {
  if (!at) return '';
  const days = Math.floor((Date.now() - at) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

type Load = { state: 'loading' } | { state: 'off'; say: string } | { state: 'ok'; nodes: MemoryIn[]; edges: EdgeIn[]; places: Map<string, PlaceIn[]> };

export function MindGraphView({
  signedIn,
  head,
  onOpen,
  narrow = false,
}: {
  signedIn: boolean;
  /** a phone: the regions one under another, a memory to a row, and the page scrolls */
  narrow?: boolean;
  /** the screen's header, given the switch for its middle */
  head: (center: ReactNode) => ReactNode;
  /** a conversation a memory was learned in, opened */
  onOpen: (place: PlaceIn) => void;
}) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [group, setGroup] = useState<'all' | MindGroup>('all');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ label: string; content: string } | null>(null);
  const [forgetting, setForgetting] = useState(false);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const read = useCallback(async () => {
    if (!signedIn) return setLoad({ state: 'off', say: 'signed-out' });
    try {
      const [mr, ar] = await Promise.all([fetch('/api/mind?scope=logos', { cache: 'no-store' }), fetch('/api/mind/atlas?scope=logos', { cache: 'no-store' })]);
      const mind = mr.ok ? await mr.json() : null;
      if (!mind || mind.storage?.ok === false) return setLoad({ state: 'off', say: 'unavailable' });
      const atlas = ar.ok ? await ar.json().catch(() => null) : null;
      // where each memory was learned: the atlas's memory → chat lines, with the chats' names
      const chats = new Map<string, PlaceIn>();
      for (const n of atlas?.nodes ?? []) if (n.kind === 'chat' && typeof n.id === 'string') chats.set(n.id, { id: n.id.replace(/^c:/, ''), title: n.label || 'A conversation', surface: n.surface === 'core' ? 'core' : 'logos' });
      const places = new Map<string, PlaceIn[]>();
      for (const e of atlas?.edges ?? []) {
        if (e.rel !== 'learned_in' || typeof e.from !== 'string') continue;
        const chat = chats.get(e.to);
        if (!chat) continue;
        const id = e.from.replace(/^m:/, '');
        const list = places.get(id) ?? [];
        if (!list.some((p) => p.id === chat.id)) list.push(chat);
        places.set(id, list);
      }
      setLoad({ state: 'ok', nodes: Array.isArray(mind.nodes) ? mind.nodes : [], edges: Array.isArray(mind.edges) ? mind.edges : [], places });
    } catch {
      setLoad({ state: 'off', say: 'unavailable' });
    }
  }, [signedIn]);
  useEffect(() => {
    void read();
  }, [read]);

  const all = load.state === 'ok' ? load : null;
  const counts = useMemo(() => {
    const c: Record<'all' | MindGroup, number> = { all: 0, habit: 0, fact: 0, project: 0 };
    for (const n of all?.nodes ?? []) {
      const g = groupOf(n.type);
      if (!g || n.status === 'archived' || !n.label?.trim()) continue;
      c.all += 1;
      c[g] += 1;
    }
    return c;
  }, [all]);
  // a search narrows what is drawn, so it reaches memories past the cap as well
  const drawing = useMemo(() => {
    if (!all) return null;
    const q = query.trim();
    const nodes = q ? all.nodes.filter((n) => memoryMatches({ label: n.label ?? '', content: n.content ?? '' }, q)) : all.nodes;
    return mindDrawing(nodes, all.edges, all.places, { group: group === 'all' ? null : group, narrow });
  }, [all, group, query, narrow]);
  const byId = useMemo(() => new Map((drawing?.neurons ?? []).map((n) => [n.id, n])), [drawing]);
  const chosen = sel ? byId.get(sel) ?? null : null;
  useEffect(() => {
    setEditing(null);
    setForgetting(false);
    setNote(null);
  }, [sel]);

  async function save() {
    if (!chosen || !editing || !all) return;
    setWorking(true);
    try {
      const r = await fetch('/api/mind/node', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: chosen.id, label: editing.label.trim().slice(0, 80), content: editing.content.trim().slice(0, 400) }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || j?.say || 'That could not be saved.');
      setLoad({ ...all, nodes: all.nodes.map((n) => (n.id === chosen.id ? { ...n, ...(j.node ?? {}), label: j.node?.label ?? editing.label.trim(), content: j.node?.content ?? editing.content.trim() } : n)) });
      setEditing(null);
      setNote(j.say || 'Saved.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That could not be saved.');
    } finally {
      setWorking(false);
    }
  }
  async function forget() {
    if (!chosen || !all) return;
    setWorking(true);
    try {
      const r = await fetch('/api/mind/node', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: chosen.id }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || 'That could not be forgotten.');
      setLoad({ ...all, nodes: all.nodes.filter((n) => n.id !== chosen.id), edges: all.edges.filter((e) => e.sourceId !== chosen.id && e.targetId !== chosen.id) });
      setSel(null);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That could not be forgotten.');
      setForgetting(false);
    } finally {
      setWorking(false);
    }
  }

  const tabs = (
    <L5Switch
      label="Which memories"
      value={group}
      onChange={(id) => {
        setGroup(id as 'all' | MindGroup);
        setSel(null);
      }}
      items={[
        { id: 'all', label: 'All', count: counts.all },
        { id: 'habit', label: GROUP_TAB.habit },
        { id: 'fact', label: GROUP_TAB.fact },
        { id: 'project', label: GROUP_TAB.project },
      ]}
      wide={narrow}
    />
  );
  const most = narrow ? 30 : 46;
  const neuron = (n: Neuron) => {
    const s = n.r / 30;
    const stroke = n.lead ? 'var(--l5m-lead, #354620)' : 'var(--l5m-line, rgba(53,70,32,.55))';
    return (
      <g
        key={n.id}
        className={`l5m-n${sel === n.id ? ' is-on' : ''}`}
        transform={`translate(${n.x},${n.y})`}
        role="button"
        tabIndex={0}
        aria-label={`${n.label} — ${n.sub}`}
        onClick={() => setSel(sel === n.id ? null : n.id)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSel(n.id))}
      >
        {n.dendrites.map((a, i) => (
          <path key={i} d={BRANCH} transform={`rotate(${a}) scale(${s})`} fill="none" style={{ stroke }} strokeWidth={1.2 / s} opacity={0.7} />
        ))}
        <path d={SOMA} transform={`scale(${s})`} style={{ fill: FILL[n.group], stroke }} strokeWidth={(n.lead ? 1.8 : 1.4) / s} />
        <circle r={n.lead ? 7 : 5.5} style={{ fill: stroke }} />
        <text className="l5m-t" x={n.left ? -n.r - 10 : n.r + 12} y={4} textAnchor={n.left ? 'end' : 'start'}>
          {n.label.length > most ? n.label.slice(0, most - 1) + '…' : n.label}
        </text>
        <text className="l5m-s" x={n.left ? -n.r - 10 : n.r + 12} y={22} textAnchor={n.left ? 'end' : 'start'}>
          {n.sub}
        </text>
      </g>
    );
  };

  let body: ReactNode;
  if (load.state === 'loading') body = <p className="l5m-empty">Reading what Socria remembers…</p>;
  else if (load.state === 'off')
    body =
      load.say === 'signed-out' ? (
        <div className="l5m-empty">
          <h2>Your Mind Graph lives with your account.</h2>
          <p>Sign in, and what Socria learns about how you decide, what you are holding and what you are working on gathers here — yours to edit or forget.</p>
        </div>
      ) : (
        <div className="l5m-empty">
          <h2>Socria’s memory isn’t reachable just now.</h2>
          <p>Your lines of thinking are all still here. Try again in a moment.</p>
        </div>
      );
  else if (!drawing || !drawing.neurons.length)
    body = (
      <div className="l5m-empty">
        <h2>{query.trim() ? `Nothing remembered about “${query.trim()}”.` : group === 'all' ? 'Nothing remembered yet.' : `No ${GROUP_TAB[group].toLowerCase()} remembered yet.`}</h2>
        <p>As you think things through, what Socria learns about how you decide, what you are holding and what you are working on appears here — each with where it was learned, yours to edit or forget.</p>
      </div>
    );
  else
    body = (
      <svg className="l5m-svg" viewBox={`0 0 ${drawing.width} ${drawing.height}`} preserveAspectRatio={narrow ? 'xMinYMin meet' : 'xMidYMid meet'} onClick={(e) => e.target === e.currentTarget && setSel(null)}>
        {drawing.regions.map((r) => (
          <text key={r.group} className="l5m-region" x={r.x} y={r.y}>
            {GROUP_REGION[r.group].toUpperCase()}
          </text>
        ))}
        {drawing.axons.map((a, i) => {
          const A = byId.get(a.from);
          const B = byId.get(a.to);
          if (!A || !B) return null;
          const ang = Math.atan2(B.y - A.y, B.x - A.x);
          const x1 = A.x + Math.cos(ang) * A.r;
          const y1 = A.y + Math.sin(ang) * A.r;
          const x2 = B.x - Math.cos(ang) * (B.r + 4);
          const y2 = B.y - Math.sin(ang) * (B.r + 4);
          const mx = (x1 + x2) / 2;
          const lit = sel === a.from || sel === a.to;
          return (
            <g key={i} className={`l5m-axon${a.strong || lit ? ' is-strong' : ''}`}>
              <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} />
              <circle cx={x2} cy={y2} r={a.strong ? 4.5 : 3.5} />
            </g>
          );
        })}
        {drawing.neurons.map(neuron)}
      </svg>
    );

  return (
    <>
      {head(load.state === 'ok' && !narrow ? tabs : null)}
      {load.state === 'ok' && narrow && <div className="l5x-tabs">{tabs}</div>}
      <section className={`l5m${narrow ? ' is-narrow' : ''}`} aria-label="Mind Graph">
        {body}
        {chosen && (
          <aside className="l5m-card" aria-label={chosen.label}>
            <div className="l5m-card-head">
              <span className="l5m-card-what">
                <span className="l5m-card-k">{GROUP_LABEL[chosen.group]} · remembered</span>
                {editing ? (
                  <input className="l5m-in" value={editing.label} maxLength={80} onChange={(e) => setEditing({ ...editing, label: e.target.value })} aria-label="What it is called" />
                ) : (
                  <span className="l5m-card-t">{chosen.label}</span>
                )}
              </span>
              <button type="button" className="l5m-x" aria-label="Close" onClick={() => setSel(null)}>
                ×
              </button>
            </div>
            {editing ? (
              <textarea className="l5m-in is-area" value={editing.content} maxLength={400} rows={4} onChange={(e) => setEditing({ ...editing, content: e.target.value })} aria-label="What Socria remembers" />
            ) : (
              chosen.content && <p className="l5m-card-p">{chosen.content}</p>
            )}
            <div className="l5m-card-facts">
              {chosen.learnedIn.length > 0 && (
                <span>
                  Learned from{' '}
                  {chosen.learnedIn.slice(0, 3).map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && ', '}
                      <button type="button" className="l5m-link" onClick={() => onOpen(p)}>
                        {p.title}
                      </button>
                    </span>
                  ))}
                </span>
              )}
              {chosen.informs.length > 0 && (
                <span>
                  Informs{' '}
                  {chosen.informs.slice(0, 3).map((id, i) => (
                    <span key={id}>
                      {i > 0 && ', '}
                      <button type="button" className="l5m-link" onClick={() => setSel(id)}>
                        {byId.get(id)?.label ?? 'another memory'}
                      </button>
                    </span>
                  ))}
                </span>
              )}
              {chosen.firstAt > 0 && <span>First noticed {ago(chosen.firstAt)}</span>}
            </div>
            {note && <p className="l5m-note">{note}</p>}
            <div className="l5m-card-acts">
              {editing ? (
                <>
                  <button type="button" className="l5m-btn is-primary" disabled={working || !editing.label.trim()} onClick={() => void save()}>
                    {working ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" className="l5m-btn" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </>
              ) : forgetting ? (
                <>
                  <span className="l5m-sure">Forget it for good?</span>
                  <button type="button" className="l5m-btn is-danger" disabled={working} onClick={() => void forget()}>
                    {working ? 'Forgetting…' : 'Forget'}
                  </button>
                  <button type="button" className="l5m-btn" onClick={() => setForgetting(false)}>
                    Keep it
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="l5m-btn" onClick={() => setEditing({ label: chosen.label, content: chosen.content })}>
                    Edit
                  </button>
                  {chosen.learnedIn[0] && (
                    <button type="button" className="l5m-btn" onClick={() => onOpen(chosen.learnedIn[0])}>
                      Show where
                    </button>
                  )}
                  <button type="button" className="l5m-btn is-danger" onClick={() => setForgetting(true)}>
                    Forget this
                  </button>
                </>
              )}
            </div>
          </aside>
        )}
        {load.state === 'ok' && (
          <>
            <p className="l5m-foot">
              Yours to edit or forget · Socria reads it only inside a line of thinking
              {drawing && drawing.more > 0 ? ` · ${drawing.more} more — search to find them` : ''} ·{' '}
              <a href="/memory">Everything, private included</a>
            </p>
            <label className="l5m-find">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4 4" />
              </svg>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a memory" aria-label="Find a memory" />
            </label>
          </>
        )}
      </section>
    </>
  );
}
