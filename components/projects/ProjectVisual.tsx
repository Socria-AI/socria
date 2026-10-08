'use client';
// components/projects/ProjectVisual.tsx
//
// The Project, drawn the way its content asks (lib/project-visual.ts). One
// component, five drawings, one switch between them — the person can always
// change the view, and a click on anything says which conversations it is in
// and opens them.

import { useMemo, useState } from 'react';
import type { Atlas, AtlasNode } from '@/lib/mind/atlas';
import { relLabel } from '@/lib/mind/atlas';
import { VISUAL_NAME, type VisualKind } from '@/lib/project-home';
import { evidenceLayout, madeThings, roadmapLayout, timelineLayout, webLayout } from '@/lib/project-visual';

interface ChatLite {
  id: string;
  title: string;
  kind: 'chat' | 'logos';
  updatedAt: number;
  createdAt: number;
}

const W = 820;
const H = 440;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const when = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function ProjectVisual({
  atlas,
  anchor,
  kind,
  available,
  why,
  chats,
  goals,
  onKind,
  onOpenChat,
  onExpand,
}: {
  atlas: Atlas;
  anchor: string | null;
  kind: VisualKind;
  available: VisualKind[];
  why: string;
  chats: ChatLite[];
  goals: { id: string; label: string; status: string }[];
  onKind: (k: VisualKind) => void;
  onOpenChat: (id: string, kind: 'chat' | 'logos') => void;
  onExpand?: () => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const byId = useMemo(() => new Map(atlas.nodes.map((n) => [n.id, n])), [atlas]);
  const chatById = useMemo(() => new Map(chats.map((c) => [c.id, c])), [chats]);
  const selected = sel ? byId.get(sel) ?? null : null;
  const pick = (id: string) => setSel((s) => (s === id ? null : id));
  const openChatOf = (n: AtlasNode) => {
    if (n.kind === 'chat') {
      const c = chatById.get(n.chats[0]);
      if (c) onOpenChat(c.id, c.kind);
    }
  };

  const empty = atlas.nodes.filter((n) => n.kind !== 'project').length === 0;

  return (
    <div className="ph-visual">
      <div className="ph-visual-bar">
        <span className="ph-seg" role="tablist" aria-label="How to draw this Project">
          {available.map((k) => (
            <button key={k} role="tab" aria-selected={k === kind} onClick={() => { setSel(null); onKind(k); }}>
              {VISUAL_NAME[k]}
            </button>
          ))}
        </span>
        {onExpand && (
          <button className="ph-link" onClick={onExpand}>
            Open in Logos →
          </button>
        )}
      </div>
      <p className="ph-visual-why">{why}</p>

      <div className={`ph-visual-body${selected ? ' has-side' : ''}`}>
        <div className="ph-canvas">
          {empty ? (
            <div className="ph-visual-empty">
              <p>The picture grows as you think here.</p>
              <p className="q">Start a conversation in this Project, and what it holds — ideas, questions, evidence, plots — is drawn here, joined to the rest.</p>
            </div>
          ) : kind === 'ideas' || kind === 'concepts' ? (
            <Web atlas={atlas} anchor={anchor} concepts={kind === 'concepts'} sel={sel} onPick={pick} />
          ) : kind === 'evidence' ? (
            <Evidence atlas={atlas} sel={sel} onPick={pick} />
          ) : kind === 'roadmap' ? (
            <Road atlas={atlas} chats={chats} goals={goals} sel={sel} onPick={pick} onOpen={(id) => { const c = chatById.get(id); if (c) onOpenChat(c.id, c.kind); }} />
          ) : kind === 'timeline' ? (
            <Timeline atlas={atlas} chats={chats} sel={sel} onPick={pick} />
          ) : (
            <Made atlas={atlas} chatById={chatById} onOpenChat={onOpenChat} />
          )}
        </div>
        {selected && (
          <aside className="ph-vside" aria-label={selected.label}>
            <div className="ph-vside-head">
              <span className="k">{selected.kind === 'idea' ? `On a map · ${selected.type}` : selected.kind === 'memory' ? `Remembered · ${selected.type}` : selected.type}</span>
              <button className="x" aria-label="Close" onClick={() => setSel(null)}>×</button>
            </div>
            <h4>{selected.label}</h4>
            {selected.sub && selected.kind !== 'chat' && <p className="sub">{selected.sub}</p>}
            {selected.kind === 'chat' ? (
              <button className="ph-btn" onClick={() => openChatOf(selected)}>Open →</button>
            ) : (
              <>
                <p className="k2">In {selected.chats.length} {selected.chats.length === 1 ? 'conversation' : 'conversations'}</p>
                <ul>
                  {selected.chats.map((cid) => {
                    const c = chatById.get(cid);
                    return c ? (
                      <li key={cid}>
                        <button onClick={() => onOpenChat(c.id, c.kind)}>
                          <span>{c.title || 'Untitled'}</span>
                          <i>{c.kind === 'logos' ? 'Logos' : 'Chat'}</i>
                        </button>
                      </li>
                    ) : null;
                  })}
                </ul>
                {(() => {
                  const ls = atlas.edges.filter((e) => (e.from === selected.id || e.to === selected.id) && byId.get(e.from === selected.id ? e.to : e.from)?.kind !== 'chat').slice(0, 8);
                  return ls.length ? (
                    <>
                      <p className="k2">Connected</p>
                      <ul>
                        {ls.map((e, i) => {
                          const o = byId.get(e.from === selected.id ? e.to : e.from)!;
                          return (
                            <li key={i}>
                              <button onClick={() => setSel(o.id)}>
                                <i>{relLabel(e.rel)}</i>
                                <span>{o.label}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : null;
                })()}
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

// ── ideas and concepts ──────────────────────────────────────────────

function Web({ atlas, anchor, concepts, sel, onPick }: { atlas: Atlas; anchor: string | null; concepts: boolean; sel: string | null; onPick: (id: string) => void }) {
  const { nb, place } = useMemo(
    () => (anchor ? webLayout(atlas, anchor, concepts, W, H) : { nb: atlas, place: {} as Record<string, never> }),
    [atlas, anchor, concepts]
  );
  const [hov, setHov] = useState<string | null>(null);
  const focus = hov ?? sel;
  const near = useMemo(() => {
    const s = new Set<string>();
    if (focus) for (const e of nb.edges) { if (e.from === focus) s.add(e.to); if (e.to === focus) s.add(e.from); }
    return s;
  }, [nb, focus]);
  if (!anchor) return null;
  return (
    <svg className="ph-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${nb.nodes.length - 1} things in this Project, and how they connect`}>
      {nb.edges.map((e, i) => {
        const p = place[e.from];
        const q = place[e.to];
        if (!p || !q) return null;
        const lit = !!focus && (e.from === focus || e.to === focus);
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        return (
          <path key={i} className={`ph-edge${lit ? ' on' : ''}${focus && !lit ? ' dim' : ''}${e.rel === 'conflicts' ? ' conflict' : ''}`}
            d={`M${p.x},${p.y} Q${mx + (W / 2 - mx) * 0.2},${my + (H / 2 - my) * 0.2} ${q.x},${q.y}`} />
        );
      })}
      {nb.nodes.map((n) => {
        const p = place[n.id];
        if (!p) return null;
        const root = p.ring === 0;
        const r = root ? 12 : n.kind === 'chat' ? 7 : 5.5;
        const right = Math.cos(p.angle) >= 0;
        const dim = focus && n.id !== focus && !near.has(n.id) && !root;
        const room = n.id === sel || n.id === hov ? 60 : root ? 30 : p.ring === 1 ? 16 : 24;
        return (
          <g key={n.id} className={`ph-node k-${n.kind}${n.id === sel ? ' sel' : ''}${dim ? ' dim' : ''}`}
            transform={`translate(${p.x},${p.y})`} tabIndex={0} role="button" aria-label={`${n.type}: ${n.label}`}
            onClick={() => onPick(n.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(n.id); } }}
            onPointerEnter={() => setHov(n.id)} onPointerLeave={() => setHov(null)}>
            {n.id === sel && <circle className="sel-ring" r={r + 5} />}
            {n.kind === 'chat' || n.kind === 'project'
              ? <rect className="dot" x={-r} y={-r} width={r * 2} height={r * 2} rx={n.kind === 'project' ? 3 : r * 0.45} />
              : <circle className="dot" r={r} />}
            {root
              ? <text className="lbl root" y={r + 17} textAnchor="middle">{clip(n.label, room)}</text>
              : <text className="lbl" x={right ? r + 6 : -(r + 6)} y={3.5} textAnchor={right ? 'start' : 'end'}>{clip(n.label, room)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ── evidence ────────────────────────────────────────────────────────

function Evidence({ atlas, sel, onPick }: { atlas: Atlas; sel: string | null; onPick: (id: string) => void }) {
  const h = Math.max(H, 0);
  const lay = useMemo(() => evidenceLayout(atlas, W, h), [atlas, h]);
  const byId = useMemo(() => new Map(atlas.nodes.map((n) => [n.id, n])), [atlas]);
  const at = new Map([...lay.claims, ...lay.evidence].map((p) => [p.id, p]));
  if (!lay.links.length) {
    return <div className="ph-visual-empty"><p>No evidence is drawn on these maps yet.</p><p className="q">When a conversation weighs a claim against what supports or undercuts it, it appears here.</p></div>;
  }
  return (
    <svg className="ph-svg" viewBox={`0 0 ${W} ${h}`} role="img" aria-label="Claims on the left, the evidence for and against them on the right">
      <text className="col" x={W * 0.3} y={18} textAnchor="end">WHAT IS CLAIMED</text>
      <text className="col" x={W * 0.72} y={18}>WHAT BEARS ON IT</text>
      {lay.links.map((l, i) => {
        const a = at.get(l.from)!;
        const b = at.get(l.to)!;
        const lit = sel === l.from || sel === l.to;
        return <path key={i} className={`ph-edge${lit ? ' on' : ''}${l.rel === 'conflicts' ? ' conflict' : ''}`} d={`M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`} />;
      })}
      {lay.claims.map((p) => (
        <g key={p.id} className={`ph-node k-idea${sel === p.id ? ' sel' : ''}`} transform={`translate(${p.x},${p.y})`} tabIndex={0} role="button" onClick={() => onPick(p.id)} aria-label={byId.get(p.id)?.label}>
          <circle className="dot" r={5.5} />
          <text className="lbl" x={-11} y={3.5} textAnchor="end">{clip(byId.get(p.id)?.label ?? '', 40)}</text>
        </g>
      ))}
      {lay.evidence.map((p) => (
        <g key={p.id} className={`ph-node k-evidence${sel === p.id ? ' sel' : ''}`} transform={`translate(${p.x},${p.y})`} tabIndex={0} role="button" onClick={() => onPick(p.id)} aria-label={byId.get(p.id)?.label}>
          <rect className="dot" x={-5} y={-5} width={10} height={10} rx={2} />
          <text className="lbl" x={11} y={3.5}>{clip(byId.get(p.id)?.label ?? '', 34)}</text>
        </g>
      ))}
    </svg>
  );
}

// ── roadmap ─────────────────────────────────────────────────────────

function Road({ atlas, chats, goals, sel, onPick, onOpen }: { atlas: Atlas; chats: ChatLite[]; goals: { id: string; label: string; status: string }[]; sel: string | null; onPick: (id: string) => void; onOpen: (chatId: string) => void }) {
  const order = useMemo(() => [...chats].sort((a, b) => (a.createdAt || a.updatedAt) - (b.createdAt || b.updatedAt)).map((c) => c.id), [chats]);
  const { stops } = useMemo(() => roadmapLayout(atlas, order, W), [atlas, order]);
  const title = new Map(chats.map((c) => [c.id, c.title || 'Untitled']));
  const lineY = 46;
  const most = Math.max(0, ...stops.map((s) => s.items.length));
  const h = lineY + 44 + (most ? 30 + most * 22 : 0);
  return (
    <div className="ph-road">
      {goals.length > 0 && (
        <ul className="ph-goals" aria-label="Goals">
          {goals.map((g) => (
            <li key={g.id} className={g.status === 'historical' ? 'done' : ''}>
              <span className="tick" aria-hidden="true">{g.status === 'historical' ? '✓' : ''}</span>
              {g.label}
              {g.status === 'historical' && <em> — marked done</em>}
            </li>
          ))}
        </ul>
      )}
      <svg className="ph-svg" viewBox={`0 0 ${W} ${h}`} role="img" aria-label="The conversations in the order they began, with the steps each holds">
        {stops.length > 1 && <line className="ph-road-line" x1={stops[0].x} y1={lineY} x2={stops[stops.length - 1].x} y2={lineY} />}
        {stops.map((s, i) => (
          <g key={s.chatId}>
            <g className="ph-node k-chat" transform={`translate(${s.x},${lineY})`} tabIndex={0} role="button" onClick={() => onOpen(s.chatId)} aria-label={`Open ${title.get(s.chatId)}`}>
              <rect className="dot" x={-7} y={-7} width={14} height={14} rx={3} />
              <text className="lbl" y={i % 2 ? 30 : -18} textAnchor="middle">{clip(title.get(s.chatId) ?? '', 22)}</text>
            </g>
            {s.items.map((it, j) => (
              <g key={it.id} className={`ph-node k-idea${sel === it.id ? ' sel' : ''}`} transform={`translate(${s.x},${lineY + 58 + j * 22})`} tabIndex={0} role="button" onClick={() => onPick(it.id)} aria-label={it.label}>
                <circle className="dot" r={3.5} />
                <text className="lbl small" x={8} y={3.5}>{clip(it.label, 18)}</text>
              </g>
            ))}
          </g>
        ))}
      </svg>
      <p className="ph-note">Progress is only what you mark done. Nothing here is checked off for you.</p>
    </div>
  );
}

// ── timeline ────────────────────────────────────────────────────────

function Timeline({ atlas, chats, sel, onPick }: { atlas: Atlas; chats: ChatLite[]; sel: string | null; onPick: (id: string) => void }) {
  const TH = 230;
  const lay = useMemo(() => timelineLayout(chats.map((c) => ({ id: c.id, at: c.createdAt || c.updatedAt })), atlas, W, TH), [chats, atlas]);
  const title = new Map(chats.map((c) => [c.id, c.title || 'Untitled']));
  const at = new Map(lay.points.map((p) => [p.id, p]));
  const y = 78;
  return (
    <svg className="ph-svg" viewBox={`0 0 ${W} ${TH}`} role="img" aria-label="The conversations in time, and what each carried into a later one">
      <line className="ph-road-line" x1={40} y1={y} x2={W - 40} y2={y} />
      {lay.ticks.map((t, i) => <text key={i} className="tick" x={t.x} y={TH - 10} textAnchor="middle">{when(t.at)}</text>)}
      {lay.arcs.map((a, i) => {
        const p = at.get(a.from)!;
        const q = at.get(a.to)!;
        const lift = Math.min(110, 22 + Math.abs(q.x - p.x) * 0.22);
        return (
          <g key={i}>
            <path className="ph-edge arc" strokeWidth={Math.min(3, 1 + a.n * 0.5)} d={`M${p.x},${y} Q${(p.x + q.x) / 2},${y + lift} ${q.x},${y}`} />
            <title>{a.n === 1 ? a.label : `${a.label} and ${a.n - 1} more`}</title>
          </g>
        );
      })}
      {lay.points.map((p) => (
        <g key={p.id} className={`ph-node k-chat${sel === `c:${p.id}` ? ' sel' : ''}`} transform={`translate(${p.x},${y})`} tabIndex={0} role="button" onClick={() => onPick(`c:${p.id}`)} aria-label={title.get(p.id)}>
          <rect className="dot" x={-6} y={-6} width={12} height={12} rx={3} />
          <text className="lbl" y={p.up ? -16 : 26} textAnchor="middle">{clip(title.get(p.id) ?? '', 20)}</text>
        </g>
      ))}
    </svg>
  );
}

// ── models ──────────────────────────────────────────────────────────

function Made({ atlas, chatById, onOpenChat }: { atlas: Atlas; chatById: Map<string, ChatLite>; onOpenChat: (id: string, kind: 'chat' | 'logos') => void }) {
  const things = madeThings(atlas);
  if (!things.length) return <div className="ph-visual-empty"><p>No models or plots yet.</p><p className="q">Build one in Logos and it appears here, with where it was made.</p></div>;
  return (
    <ul className="ph-made">
      {things.map((t) => {
        const c = chatById.get(t.chats[0]);
        return (
          <li key={t.id} className={`k-${t.kind}`}>
            <span className="k">{t.kind === 'model' ? 'Model' : t.kind === 'plot' ? 'Plot' : 'Object'}</span>
            <b>{t.label}</b>
            {t.sub && <span className="sub">{t.sub}</span>}
            {c && <button onClick={() => onOpenChat(c.id, c.kind)}>in “{clip(c.title || 'Untitled', 30)}” →</button>}
            {t.chats.length > 1 && <span className="more">and {t.chats.length - 1} more</span>}
          </li>
        );
      })}
    </ul>
  );
}
