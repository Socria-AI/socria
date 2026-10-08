'use client';
// components/mind/MindAtlas.tsx
//
// EVERYTHING SOCRIA REMEMBERS, CONNECTED — drawn.
//
// Two ways of looking, one atlas (lib/mind/atlas.ts):
//
//   THIS CHAT   the chat in the middle, what is in it around it, and on the
//               outside the other chats, the Project and the memories those
//               things lead to. "What else have I thought about this in" as a
//               picture, with the answer listed beside it — every connected
//               chat, what it shares with this one, and a way into it.
//   EVERYTHING  the whole of it as one constellation (MindConstellation):
//               memory in the middle, every chat around it — a Logos line of
//               thinking drawn as its own map, filed in its Project's arc —
//               what was made in each chat beside it, and threaded between
//               them whatever two chats share.
//
// Read-only. Correcting a memory happens on the Memory page, where every row
// can be changed or forgotten; this is where you see how things connect.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MindConstellation } from './MindConstellation';
import { contentsOf } from '@/lib/mind/constellation';
import {
  neighbourhood,
  radialLayout,
  relatedChats,
  relLabel,
  type Atlas,
  type AtlasNode,
} from '@/lib/mind/atlas';
// The Memory page's own styles (.mem-root, the segmented control): the atlas
// is drawn inside one in Logos too, where nothing else brings them in.
import './mind-graph.css';
import './mind-atlas.css';

const KIND_WORD: Record<AtlasNode['kind'], string> = {
  memory: 'Memory',
  project: 'Project',
  chat: 'Chat',
  idea: 'On a map',
  plot: 'Plot',
  model: 'Model',
  object: 'Object of thought',
};

export function MindAtlas({
  scope,
  focusChat = null,
  onOpenChat,
  refreshKey,
  embedded = false,
}: {
  /** 'logos' never receives a private memory, or a chat that made one */
  scope: 'all' | 'logos';
  /** the chat to centre on; without one, everything */
  focusChat?: string | null;
  onOpenChat?: (id: string, surface: 'core' | 'logos') => void;
  /** changes when there may be something new to read — a turn just landed */
  refreshKey?: string | number;
  embedded?: boolean;
}) {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'here' | 'all'>(focusChat ? 'here' : 'all');
  const [sel, setSel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/mind/atlas?scope=${scope}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as Atlas;
      setAtlas({ nodes: j.nodes ?? [], edges: j.edges ?? [], stats: j.stats });
      setErr(null);
    } catch {
      setErr('What Socria remembers could not be read just now.');
    }
    setLoading(false);
  }, [scope]);

  // Once on open, and again a few seconds after each turn — memory is written
  // after the reply, so reading it the instant the reply lands would miss it.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      void load();
      return;
    }
    const t = setTimeout(() => void load(), 5000);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  useEffect(() => setSel(null), [mode, focusChat]);

  const here = !!(focusChat && atlas?.nodes.some((n) => n.id === `c:${focusChat}`));
  const byId = useMemo(() => new Map((atlas?.nodes ?? []).map((n) => [n.id, n])), [atlas]);
  const chatTitle = (id: string) => byId.get(`c:${id}`)?.label ?? 'A chat';
  const surfaceOf = (id: string) => byId.get(`c:${id}`)?.surface ?? 'logos';

  const related = useMemo(() => (atlas && focusChat ? relatedChats(atlas, focusChat, 16) : []), [atlas, focusChat]);
  const selected = sel ? byId.get(sel) ?? null : null;
  const links = useMemo(() => {
    if (!atlas || !sel) return [];
    return atlas.edges
      .filter((e) => e.from === sel || e.to === sel)
      .map((e) => {
        const other = byId.get(e.from === sel ? e.to : e.from);
        return other ? { rel: relLabel(e.rel), out: e.from === sel, other } : null;
      })
      .filter((x): x is { rel: string; out: boolean; other: AtlasNode } => !!x)
      .slice(0, 14);
  }, [atlas, sel, byId]);

  const open = (id: string) => onOpenChat?.(id, surfaceOf(id));

  if (loading && !atlas) {
    return (
      <div className={`mem-root ma-root${embedded ? ' ma-embedded' : ''}`}>
        <p className="ma-quiet" aria-live="polite">Reading what Socria remembers…</p>
      </div>
    );
  }
  if (err && !atlas) {
    return (
      <div className={`mem-root ma-root${embedded ? ' ma-embedded' : ''}`}>
        <p className="ma-quiet" role="alert">{err}</p>
      </div>
    );
  }
  const a = atlas!;
  const st = a.stats;
  const showing = mode === 'here' && focusChat ? 'here' : 'all';

  return (
    <div className={`mem-root ma-root${embedded ? ' ma-embedded' : ''}`} data-tour="mind">
      <div className="ma-bar">
        {focusChat && (
          <span className="seg" role="group" aria-label="How much to show">
            <button aria-pressed={showing === 'here'} onClick={() => setMode('here')}>This chat</button>
            <button aria-pressed={showing === 'all'} onClick={() => setMode('all')}>Everything</button>
          </span>
        )}
        <span className="ma-counts">
          <Count n={st.memories} one="memory" many="memories" />
          <Count n={st.chats} one="chat" many="chats" />
          <Count n={st.ideas} one="idea on a map" many="ideas on maps" />
          <Count n={st.plots} one="plot" many="plots" />
          <Count n={st.models} one="model" many="models" />
          <Count n={st.objects} one="object" many="objects" />
          <Count n={st.projects} one="project" many="projects" />
          {st.shared > 0 && (
            <span className="ma-shared">
              <b>{st.shared}</b> in more than one chat
            </span>
          )}
        </span>
        <button className="ma-refresh" onClick={() => void load()} disabled={loading} aria-label="Read it again">
          {loading ? 'Reading…' : 'Refresh'}
        </button>
      </div>
      {st.dropped > 0 && (
        <p className="ma-note">
          {st.dropped} {st.dropped === 1 ? 'thing is' : 'things are'} left out to keep this readable — the oldest chats and the
          ideas nothing else shares.
        </p>
      )}

      <div className={`ma-body${selected || (showing === 'here' && here) ? ' has-side' : ''}`}>
        <div className="ma-canvas">
          {showing === 'here' ? (
            here ? (
              <Neighbourhood atlas={a} chatId={focusChat!} sel={sel} onSel={setSel} panel={embedded} />
            ) : (
              <div className="ma-empty">
                <p>
                  <b>Nothing from this chat is joined to the rest yet.</b>
                </p>
                <p>
                  Talk it through and what it touches will connect here — to your other chats, your Projects and what
                  Socria already remembers. <em>A conversation kept to itself never is.</em>
                </p>
              </div>
            )
          ) : a.nodes.length ? (
            <MindConstellation atlas={a} sel={sel} onSel={setSel} onOpenChat={open} embedded={embedded} />
          ) : (
            <div className="ma-empty">
              <p><b>Nothing yet.</b></p>
              <p>Every chat, map and plot will appear here, joined to what Socria remembers.</p>
            </div>
          )}
        </div>

        {(selected || (showing === 'here' && here)) && (
          <aside className="ma-side">
            {selected ? (
              <>
                <div className="ma-side-head">
                  <span className={`ma-kind k-${selected.kind}`}>{KIND_WORD[selected.kind]}{selected.kind !== 'chat' && selected.kind !== 'project' && selected.type ? ` · ${selected.type}` : ''}</span>
                  <button className="ma-x" aria-label="Close" onClick={() => setSel(null)}>×</button>
                </div>
                <h3 className="ma-title">{selected.label}</h3>
                {selected.sub && selected.kind !== 'chat' && <p className="ma-sub">{selected.sub}</p>}
                {selected.status && selected.status !== 'active' && <p className="ma-status">{selected.status}</p>}
                {selected.kind === 'chat' ? (
                  <>
                    <button className="ma-open" onClick={() => open(selected.chats[0])}>
                      Open this {selected.surface === 'core' ? 'chat' : 'line of thinking'} →
                    </button>
                    <ChatHolds atlas={a} chatId={selected.chats[0]} onSel={setSel} />
                  </>
                ) : selected.chats.length > 0 ? (
                  <>
                    <p className="ma-k">In {selected.chats.length} {selected.chats.length === 1 ? 'chat' : 'chats'}</p>
                    <ul className="ma-chats">
                      {selected.chats.slice(0, 10).map((c) => (
                        <li key={c}>
                          <button onClick={() => open(c)} disabled={c === focusChat}>
                            <span className="t">{chatTitle(c)}</span>
                            <span className="s">{c === focusChat ? 'this one' : surfaceOf(c) === 'core' ? 'Core' : 'Logos'}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {links.length > 0 && selected.kind !== 'chat' && (
                  <>
                    <p className="ma-k">Connected</p>
                    <ul className="ma-links">
                      {links.map((l, i) => (
                        <li key={i}>
                          <button onClick={() => setSel(l.other.id)}>
                            <span className="r">{l.out ? l.rel : `← ${l.rel}`}</span>
                            <span className="t">{l.other.label}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <>
                <p className="ma-k">Connected to this chat</p>
                {related.length ? (
                  <ul className="ma-related">
                    {related.map((r) => (
                      <li key={r.id}>
                        <button onClick={() => open(r.id)}>
                          <span className="t">{r.label}</span>
                          <span className="s">
                            {r.surface === 'core' ? 'Core' : 'Logos'}
                            {r.sameProject ? ' · same Project' : ''}
                          </span>
                          {r.shared.length > 0 && (
                            <span className="chips">
                              {r.shared.slice(0, 4).map((x) => (
                                <i key={x}>{x}</i>
                              ))}
                              {r.shared.length > 4 && <i className="more">+{r.shared.length - 4}</i>}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ma-quiet">No other chat shares anything with this one yet.</p>
                )}
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

/** What one chat holds, read from the atlas: its map, what was made in it, what was learned from it. */
function ChatHolds({ atlas, chatId, onSel }: { atlas: Atlas; chatId: string; onSel: (id: string) => void }) {
  const h = useMemo(() => contentsOf(atlas, chatId), [atlas, chatId]);
  const made = [...h.models, ...h.plots, ...h.objects];
  if (!h.ideas.length && !made.length && !h.memories.length) {
    return <p className="ma-quiet">Nothing from it is joined to the rest yet.</p>;
  }
  const word = (k: AtlasNode['kind']) => (k === 'model' ? 'model' : k === 'plot' ? 'plot' : 'object');
  const project = atlas.edges.find((e) => e.rel === 'filed_in' && e.from === `c:${chatId}`);
  const projectName = project ? atlas.nodes.find((n) => n.id === project.to)?.label : null;
  return (
    <div className="ma-holds">
      {projectName && (
        <p className="ma-filed">
          Filed in <button type="button" onClick={() => onSel(project!.to)}>{projectName}</button>
        </p>
      )}
      {h.ideas.length > 0 && (
        <>
          <p className="ma-k">On its map · {h.ideas.length}</p>
          <p className="ma-chips">
            {h.ideas.slice(0, 16).map((n) => (
              <button
                key={n.id}
                type="button"
                className={n.chats.length > 1 ? 'is-shared' : undefined}
                title={n.chats.length > 1 ? `Also in ${n.chats.length - 1} other ${n.chats.length === 2 ? 'chat' : 'chats'}` : undefined}
                onClick={() => onSel(n.id)}
              >
                {n.label}
              </button>
            ))}
            {h.ideas.length > 16 && <i>+{h.ideas.length - 16}</i>}
          </p>
        </>
      )}
      {made.length > 0 && (
        <>
          <p className="ma-k">Made here</p>
          <ul className="ma-links">
            {made.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => onSel(n.id)}>
                  <span className="r">{word(n.kind)}</span>
                  <span className="t">{n.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {h.memories.length > 0 && (
        <>
          <p className="ma-k">Remembered from it</p>
          <ul className="ma-links">
            {h.memories.slice(0, 10).map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => onSel(n.id)}>
                  <span className="r">{n.type.toLowerCase()}</span>
                  <span className="t">{n.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Count({ n, one, many }: { n: number; one: string; many: string }) {
  if (!n) return null;
  return (
    <span>
      <b>{n}</b> {n === 1 ? one : many}
    </span>
  );
}

// ── one chat's neighbourhood ────────────────────────────────────────

/** the canvas: a page has room to spread; a panel draws nearer its real size */
const SIZE = { page: { W: 900, H: 600, room: [30, 18, 26] }, panel: { W: 720, H: 540, room: [26, 14, 22] } };

function Neighbourhood({
  atlas,
  chatId,
  sel,
  onSel,
  panel = false,
}: {
  atlas: Atlas;
  chatId: string;
  sel: string | null;
  onSel: (id: string | null) => void;
  panel?: boolean;
}) {
  const { W, H, room: ROOM } = panel ? SIZE.panel : SIZE.page;
  const nb = useMemo(() => neighbourhood(atlas, chatId, 64), [atlas, chatId]);
  const place = useMemo(() => radialLayout(nb, chatId, W, H), [nb, chatId, W, H]);
  const [hov, setHov] = useState<string | null>(null);
  const focus = hov ?? sel;
  const near = useMemo(() => {
    const s = new Set<string>();
    if (!focus) return s;
    for (const e of nb.edges) {
      if (e.from === focus) s.add(e.to);
      if (e.to === focus) s.add(e.from);
    }
    return s;
  }, [nb, focus]);
  const cx = W / 2;
  const cy = H / 2;

  return (
    <svg
      className="ma-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`This chat and ${nb.nodes.length - 1} things it connects to. The list beside it names every connected chat.`}
      onClick={() => onSel(null)}
    >
      <ellipse className="ma-ring" cx={cx} cy={cy} rx={(W / 2 - 150) * 0.42} ry={(H / 2 - 30) * 0.46} />
      {nb.edges.map((e, i) => {
        const p = place[e.from];
        const q = place[e.to];
        if (!p || !q) return null;
        const lit = !!focus && (e.from === focus || e.to === focus);
        // bowed toward the middle, so lines between rings do not cut across it
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        const bx = mx + (cx - mx) * 0.18;
        const by = my + (cy - my) * 0.18;
        return (
          <path
            key={i}
            className={`ma-edge${lit ? ' on' : ''}${focus && !lit ? ' dim' : ''}`}
            d={`M${p.x},${p.y} Q${bx},${by} ${q.x},${q.y}`}
          />
        );
      })}
      {nb.nodes.map((n) => {
        const p = place[n.id];
        if (!p) return null;
        const root = p.ring === 0;
        const r = root ? 13 : n.kind === 'chat' || n.kind === 'project' ? 8 : 6;
        const right = Math.cos(p.angle) >= 0;
        const dim = focus && n.id !== focus && !near.has(n.id) && !root;
        const room = n.id === sel || n.id === hov ? 60 : ROOM[p.ring];
        const label = n.label.length > room ? n.label.slice(0, room - 1) + '…' : n.label;
        return (
          <g
            key={n.id}
            className={`ma-node k-${n.kind}${n.id === sel ? ' sel' : ''}${dim ? ' dim' : ''}`}
            transform={`translate(${p.x},${p.y})`}
            tabIndex={0}
            role="button"
            aria-label={`${KIND_WORD[n.kind]}: ${n.label}`}
            onClick={(e) => {
              e.stopPropagation();
              onSel(n.id === sel ? null : n.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSel(n.id);
              }
            }}
            onPointerEnter={() => setHov(n.id)}
            onPointerLeave={() => setHov(null)}
          >
            {n.id === sel && <circle className="ma-sel" r={r + 5} />}
            {n.kind === 'chat' || n.kind === 'project' ? (
              <rect className="ma-dot" x={-r} y={-r} width={r * 2} height={r * 2} rx={n.kind === 'project' ? 2 : r * 0.45} />
            ) : (
              <circle className="ma-dot" r={r} />
            )}
            {root ? (
              <text className="ma-label is-root" y={r + 16} textAnchor="middle">{label}</text>
            ) : (
              <text
                className="ma-label"
                x={right ? r + 6 : -(r + 6)}
                y={3.5}
                textAnchor={right ? 'start' : 'end'}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
