'use client';
// components/logos5/UniverseParts.tsx — the pieces the Universal Map is made of.
//
// A conversation drawn as a tile (on the map, at three distances), as a card
// (in Columns, and when there are only a few) and as a chip (on the
// timeline); its small graph; the card that opens when one is pressed; the
// box that finds or starts; the View menu; the tray of hidden ones; and the
// bar for several chosen at once. The map itself is UniverseMap.tsx, the
// boards UniverseBoards.tsx, and the whole is Universe.tsx.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { relTime } from '@/lib/logos-sessions';
import { freshness, type Detail, type Group, type Look, type Match, type Tile } from '@/lib/logos5/universe';
import { COLOR_BY, LABELS, SIZE_BY, type Arrangement, type ColorBy, type Display, type LabelLevel, type SizeBy, type SortBy } from '@/lib/logos5/arrange';

// ── colour ───────────────────────────────────────────────────────────

/** A Project's colours, as Project Home draws them (lib/project-home.ts PROJECT_COLORS). */
export const PROJECT_HEX: Record<string, string> = {
  moss: '#354620',
  clay: '#B4694A',
  slate: '#5C6B7A',
  ochre: '#A9822A',
  plum: '#7D5A86',
  ink: '#3a3b33',
};
export const PALETTE = ['moss', 'clay', 'slate', 'ochre', 'plum', 'ink'] as const;

/** A colour for each kind of thinking, when the map is coloured by kind. */
export const LOOK_HEX: Record<Look, string> = {
  study: '#A9822A',
  deciding: '#B4694A',
  planning: '#8d7a43',
  learning: '#354620',
  writing: '#7D5A86',
  thinking: '#8b8f82',
  chat: '#b9b3a3',
};

const hashOf = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/** A group's colour key: the Project's own, or one of the six chosen by its id so it never changes. */
export function colorKeyOf(g: Pick<Group, 'kind' | 'color' | 'projectId'>): string | null {
  if (g.kind !== 'project') return null;
  if (g.color && PROJECT_HEX[g.color]) return g.color;
  return PALETTE[hashOf(g.projectId ?? '') % PALETTE.length];
}

export function groupHex(g: Pick<Group, 'kind' | 'color' | 'projectId'>): string {
  const k = colorKeyOf(g);
  return k ? PROJECT_HEX[k] : g.kind === 'chats' ? '#b9b3a3' : '#8b8f82';
}

/** The colour on a conversation's edge, by what the person asked colour to mean. */
export function accentOf(t: Tile, g: Pick<Group, 'kind' | 'color' | 'projectId'>, by: ColorBy, now: number): string {
  if (by === 'kind') return LOOK_HEX[t.look];
  if (by === 'recency') {
    const f = freshness(t.at, now);
    return f > 0.85 ? '#354620' : f > 0.6 ? '#6f7f4f' : f > 0.3 ? '#a9ae95' : '#cdc8b9';
  }
  return groupHex(g);
}

export const cssVars = (vars: Record<string, string | number>): CSSProperties => vars as unknown as CSSProperties;

// ── a kind of thinking, as a glyph ───────────────────────────────────

const GLYPH: Record<Look, string> = {
  study: 'M4 6.5C6.5 5 9 5 12 6.5v12C9 17 6.5 17 4 18.5zM20 6.5C17.5 5 15 5 12 6.5v12c3-1.5 5.5-1.5 8 0z',
  deciding: 'M12 20v-6M12 14L6 6M12 14l6-8M4 6h4M16 6h4',
  planning: 'M4 7l1.5 1.5L8 6M4 13l1.5 1.5L8 12M11 7.5h9M11 13.5h9M11 18.5h6',
  learning: 'M3 9.5l9-4 9 4-9 4zM7 11.5v4c2.5 2 7.5 2 10 0v-4',
  writing: 'M5 19l4-1L19 8l-3-3L6 15zM14 7l3 3',
  thinking: 'M12 4v3.5M12 16.5V20M4 12h3.5M16.5 12H20M6.6 6.6l2.5 2.5M14.9 14.9l2.5 2.5M6.6 17.4l2.5-2.5M14.9 9.1l2.5-2.5',
  chat: 'M4 5.5h16v10.5H9.5L4 20z',
};

export function Glyph({ look, size = 14 }: { look: Look; size?: number }) {
  return (
    <svg className="l5h-glyph" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={GLYPH[look]} />
    </svg>
  );
}

const STAR = 'M12 3.8l2.5 5.2 5.6.7-4.1 3.9 1 5.6L12 16.5l-5 2.7 1-5.6L3.9 9.7l5.6-.7z';

/** What was made in a conversation — charts, plans, practice — counted. */
export function MadeMark({ n }: { n: number }) {
  return (
    <span className="l5h-made" title={`${n} made in it: ${n === 1 ? 'a chart, plan or practice set' : 'charts, plans or practice'}`}>
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M5 19v-7M10 19V6M15 19v-4M20 19V9" />
      </svg>
      {n}
    </span>
  );
}

/** The marks in a conversation's corner: what was made, a question waiting, a star. */
function Badges({ tile, starred, corner = false }: { tile: Tile; starred: boolean; corner?: boolean }) {
  if (!tile.made && !tile.open && !starred) return null;
  return (
    <span className={`l5h-badges${corner ? ' is-corner' : ''}`} aria-hidden="true">
      {tile.made > 0 && <MadeMark n={tile.made} />}
      {tile.open && <span className="l5h-open" title="Socria asked something and is waiting for you" />}
      {starred && <StarMark />}
    </span>
  );
}
export function StarMark({ on = true }: { on?: boolean }) {
  return (
    <svg className="l5h-star" viewBox="0 0 24 24" width="13" height="13" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d={STAR} />
    </svg>
  );
}

// ── its small graph ──────────────────────────────────────────────────

/** The graph a conversation grew, small: its most connected few named. */
export function MiniGraph({ tile, named = 3 }: { tile: Tile; named?: number }) {
  if (tile.ideas.length < 2) return null;
  const at = new Map(tile.ideas.map((n) => [n.id, n]));
  const names = new Set(
    [...tile.ideas]
      .sort((a, b) => b.degree - a.degree)
      .slice(0, named)
      .map((n) => n.id)
  );
  return (
    <svg className="l5h-graph" viewBox="-150 -116 300 232" aria-hidden="true">
      {tile.edges.map((e, i) => {
        const a = at.get(e.from);
        const b = at.get(e.to);
        return a && b ? <line key={i} x1={a.x * 104} y1={a.y * 92} x2={b.x * 104} y2={b.y * 92} /> : null;
      })}
      {tile.ideas.map((n) => {
        const r = 5 + Math.min(5, n.degree * 1.4);
        const side = Math.abs(n.x) < 0.12 ? 'middle' : n.x > 0 ? 'start' : 'end';
        return (
          <g key={n.id} transform={`translate(${n.x * 104},${n.y * 92})`} className={`is-${n.from}`}>
            <circle r={r} />
            {names.has(n.id) && (
              <text x={side === 'start' ? r + 5 : side === 'end' ? -r - 5 : 0} y={side === 'middle' ? (n.y > 0 || n.y === 0 ? r + 16 : -r - 7) : 5} textAnchor={side}>
                {n.label.length > 18 ? n.label.slice(0, 17) + '…' : n.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** "Deciding · 2d" */
export function kindLine(t: Tile): string {
  const when = relTime(t.at);
  return [t.lookSaid, when === 'now' ? 'just now' : when ? `${when} ago`.replace(/^(\w{3} \d+) ago$/, '$1') : ''].filter(Boolean).join(' · ');
}

/** For a screen reader: what the tile says. */
export function tileSaid(t: Tile, groupName?: string): string {
  const parts = [t.title, kindLine(t)];
  if (t.count) parts.push(`${t.count} ${t.count === 1 ? 'idea' : 'ideas'}`);
  if (groupName) parts.push(groupName);
  if (t.open) parts.push('a question is waiting for you');
  return parts.join(', ');
}

// ── a conversation on the map ────────────────────────────────────────

export interface TileLook {
  detail: Detail;
  labels: LabelLevel;
  accent: string;
  /** 0–1: how recently it was worked in */
  fresh: number;
  scale: number;
  starred: boolean;
  /** the conversation last open */
  here: boolean;
  /** where to pick up */
  resume: boolean;
  selected: boolean;
  dim: boolean;
  /** the idea or words a search found in it */
  found?: string;
}

/** A conversation as a tile: far, its name; mid, its kind and key ideas; near, where it stands and its graph. */
export function MapTile({ tile, look, style, groupName, handlers, lifted = false }: { tile: Tile; look: TileLook; style: CSSProperties; groupName?: string; handlers?: Record<string, unknown>; lifted?: boolean }) {
  const d = look.labels === 'minimal' ? 'far' : look.detail;
  const chat = tile.kind === 'core';
  const ideas = look.labels === 'ideas';
  return (
    <div
      className={`l5h-tile d-${d}${chat ? ' is-chat' : ''}${look.selected ? ' is-sel' : ''}${look.here ? ' is-here' : ''}${look.resume ? ' is-resume' : ''}${look.dim ? ' is-dim' : ''}${lifted ? ' is-lifted' : ''}`}
      style={{ ...style, ...cssVars({ '--acc': look.accent, '--fresh': look.fresh.toFixed(2) }) }}
      data-tile={tile.id}
      role="button"
      tabIndex={look.dim ? -1 : 0}
      aria-pressed={look.selected}
      aria-label={tileSaid(tile, groupName)}
      {...(handlers ?? {})}
    >
      <div className="l5h-tile-in" style={look.scale !== 1 ? { transform: `scale(${look.scale})` } : undefined}>
        <span className="l5h-acc" aria-hidden="true" />
        {d !== 'far' ? (
          <div className="l5h-tile-k">
            <Glyph look={tile.look} size={13} />
            {look.resume ? (
              <span className="l5h-k-t">
                {tile.lookSaid} · <b className="l5h-lasthere">last here</b>
              </span>
            ) : (
              <span className="l5h-k-t">{kindLine(tile)}</span>
            )}
            <Badges tile={tile} starred={look.starred} />
          </div>
        ) : (
          <Badges tile={tile} starred={look.starred} corner />
        )}
        <div className="l5h-tile-t">{tile.title}</div>
        {d === 'mid' && !chat && (look.found ? <p className="l5h-tile-found">{look.found}</p> : ideas && tile.key.length ? (
          <div className="l5h-chips">
            {tile.key.map((k) => (
              <span key={k} className="l5h-chip">
                {k}
              </span>
            ))}
          </div>
        ) : tile.stands ? (
          <p className="l5h-tile-s">{tile.stands}</p>
        ) : null)}
        {d === 'near' && !chat && (
          <div className="l5h-tile-near">
            <div className="l5h-tile-near-l">
              {look.found ? <p className="l5h-tile-found">{look.found}</p> : tile.stands && <p className="l5h-tile-s">{tile.stands}</p>}
              {ideas && tile.ideas.length < 2 && tile.key.length > 0 && (
                <div className="l5h-chips">
                  {tile.key.map((k) => (
                    <span key={k} className="l5h-chip">
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {ideas && <MiniGraph tile={tile} named={2} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ── a conversation as a card: in Columns, and when there are only a few ──

export function TileCard({
  tile,
  accent,
  starred,
  here,
  big = false,
  labels = 'ideas',
  onOpen,
  onPreview,
  handlers,
  dragging,
}: {
  tile: Tile;
  accent: string;
  starred: boolean;
  here?: boolean;
  big?: boolean;
  labels?: LabelLevel;
  onOpen: () => void;
  onPreview?: (el: HTMLElement) => void;
  handlers?: Record<string, unknown>;
  dragging?: boolean;
}) {
  const chat = tile.kind === 'core';
  return (
    <div className={`l5h-card${big ? ' is-big' : ''}${chat ? ' is-chat' : ''}${here ? ' is-here' : ''}${dragging ? ' is-dragging' : ''}`} style={cssVars({ '--acc': accent })} data-card={tile.id} {...(handlers ?? {})}>
      <span className="l5h-acc" aria-hidden="true" />
      <button
        type="button"
        className="l5h-card-main"
        // a large card is a press from going on; a small one shows its card first
        onClick={(e) => (onPreview && !big ? onPreview(e.currentTarget.closest('.l5h-card') as HTMLElement) : onOpen())}
        onDoubleClick={onOpen}
        aria-label={tileSaid(tile)}
      >
        <span className="l5h-tile-k">
          <Glyph look={tile.look} size={13} />
          <span className="l5h-k-t">{kindLine(tile)}</span>
          <Badges tile={tile} starred={starred} />
        </span>
        <span className="l5h-card-t">{tile.title}</span>
        {labels !== 'minimal' && (big || labels === 'titles') && tile.stands && <span className="l5h-card-s">{tile.stands}</span>}
        {labels === 'ideas' && !chat && tile.key.length > 0 && (
          <span className="l5h-chips">
            {tile.key.map((k) => (
              <span key={k} className="l5h-chip">
                {k}
              </span>
            ))}
          </span>
        )}
      </button>
      {big && labels === 'ideas' && <MiniGraph tile={tile} />}
      {big && (
        <div className="l5h-card-foot">
          <button type="button" className="l5h-go" onClick={onOpen}>
            {chat ? 'Open' : 'Continue'} <span aria-hidden="true">→</span>
          </button>
          {onPreview && (
            <button type="button" className="l5h-more" aria-label={`More for “${tile.title}”`} onClick={(e) => onPreview(e.currentTarget.closest('.l5h-card') as HTMLElement)}>
              ⋯
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── the card that opens when one is pressed ──────────────────────────

export interface PreviewActs {
  onOpen: () => void;
  onStar: () => void;
  onHide: () => void;
  onLink?: () => void;
  onUnpin?: () => void;
  /** filed: a Project's id, or null for none */
  onMove?: (projectId: string | null) => void;
  onNewProject?: (name: string) => void;
  onClose: () => void;
}

export function PreviewCard({
  tile,
  group,
  starred,
  pinned,
  projects,
  links,
  acts,
  style,
  sheet,
}: {
  tile: Tile;
  group: Group | null;
  starred: boolean;
  pinned: boolean;
  projects: { id: string; name: string }[];
  links: { id: string; title: string; label: string }[];
  acts: PreviewActs;
  style?: CSSProperties;
  /** a phone: from the foot of the screen */
  sheet?: boolean;
}) {
  const [moving, setMoving] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const chat = tile.kind === 'core';
  return (
    <aside className={`l5h-pv${sheet ? ' is-sheet' : ''}`} style={style} role="dialog" aria-label={tile.title} onPointerDown={(e) => e.stopPropagation()}>
      <div className="l5h-pv-head">
        <span className="l5h-tile-k">
          <Glyph look={tile.look} size={13} />
          <span>{kindLine(tile)}</span>
          {group && <span className="l5h-pv-g">· {group.name}</span>}
        </span>
        <button type="button" className="l5h-x" aria-label="Close" onClick={acts.onClose}>
          ×
        </button>
      </div>
      <h3 className="l5h-pv-t">{tile.title}</h3>
      {tile.stands && <p className="l5h-pv-s">{tile.stands}</p>}
      {tile.made > 0 && (
        <p className="l5h-pv-made">
          <MadeMark n={tile.made} /> {tile.made === 1 ? 'Something was made in it — a chart, a plan or practice.' : `${tile.made} things were made in it — charts, plans or practice.`}
        </p>
      )}
      {tile.open && (
        <p className="l5h-pv-q">
          <span className="l5h-open" aria-hidden="true" /> Socria asked: <em>{tile.open}</em>
        </p>
      )}
      {tile.key.length > 0 && (
        <div className="l5h-chips">
          {tile.ideas
            .slice()
            .sort((a, b) => b.degree - a.degree)
            .slice(0, 6)
            .map((n) => (
              <span key={n.id} className={`l5h-chip${n.from === 'topic' ? ' is-topic' : ''}`}>
                {n.label}
              </span>
            ))}
        </div>
      )}
      {links.length > 0 && (
        <p className="l5h-pv-links">
          Linked to{' '}
          {links.map((l, i) => (
            <span key={l.id}>
              {i > 0 && ', '}“{l.title}”{l.label ? ` — ${l.label}` : ''}
            </span>
          ))}
        </p>
      )}
      <div className="l5h-pv-acts">
        <button type="button" className="l5h-go" onClick={acts.onOpen}>
          {chat ? 'Open' : tile.open ? 'Answer it' : 'Continue'} <span aria-hidden="true">→</span>
        </button>
        <button type="button" className={`l5h-btn${starred ? ' is-on' : ''}`} aria-pressed={starred} onClick={acts.onStar}>
          <StarMark on={starred} /> {starred ? 'Starred' : 'Star'}
        </button>
        {acts.onMove && (
          <button type="button" className={`l5h-btn${moving ? ' is-on' : ''}`} aria-expanded={moving} onClick={() => setMoving((v) => !v)}>
            Move to…
          </button>
        )}
        {acts.onLink && (
          <button type="button" className="l5h-btn" onClick={acts.onLink}>
            Link to…
          </button>
        )}
        {pinned && acts.onUnpin && (
          <button type="button" className="l5h-btn" onClick={acts.onUnpin}>
            Back in order
          </button>
        )}
        <button type="button" className="l5h-btn is-quiet" onClick={acts.onHide}>
          Hide
        </button>
      </div>
      {moving && acts.onMove && (
        <div className="l5h-pv-move" role="menu" aria-label="Move to a Project">
          {projects.map((p) => (
            <button key={p.id} type="button" role="menuitem" className={`l5h-mi${tile.projectId === p.id ? ' is-on' : ''}`} onClick={() => (acts.onMove!(p.id), setMoving(false))}>
              {p.name}
            </button>
          ))}
          {tile.projectId && (
            <button type="button" role="menuitem" className="l5h-mi" onClick={() => (acts.onMove!(null), setMoving(false))}>
              Out of its Project
            </button>
          )}
          {acts.onNewProject &&
            (naming === null ? (
              <button type="button" role="menuitem" className="l5h-mi is-new" onClick={() => setNaming('')}>
                + New Project…
              </button>
            ) : (
              <form
                className="l5h-name"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (naming.trim()) acts.onNewProject!(naming.trim());
                  setNaming(null);
                  setMoving(false);
                }}
              >
                <input autoFocus value={naming} maxLength={80} placeholder="Name the Project" aria-label="Name the new Project" onChange={(e) => setNaming(e.target.value)} style={{ fontSize: 16 }} />
                <button type="submit" className="l5h-btn" disabled={!naming.trim()}>
                  Make it
                </button>
              </form>
            ))}
        </div>
      )}
    </aside>
  );
}

// ── find, or start ───────────────────────────────────────────────────

export interface Found {
  tile: Tile;
  match: Match;
  hidden: boolean;
  group: string;
}

/**
 * One box: what is typed is looked for on the map — what does not match dims —
 * and the first answer is a press of Enter away; or, if nothing is right, it
 * begins a new line of thinking with those words as its first question.
 */
export function FindOrStart({
  query,
  onQuery,
  found,
  resume,
  onPick,
  onStart,
  inputRef,
}: {
  query: string;
  onQuery: (q: string) => void;
  found: Found[];
  resume: Tile | null;
  onPick: (t: Tile) => void;
  onStart: (text: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const q = query.trim();
  const options: { key: string; run: () => void; el: ReactNode }[] = [];
  if (!q && resume)
    options.push({
      key: 'resume',
      run: () => onPick(resume),
      el: (
        <>
          <span className="l5h-o-k">Pick up where you left off</span>
          <span className="l5h-o-t">{resume.title}</span>
        </>
      ),
    });
  for (const f of found.slice(0, 6))
    options.push({
      key: f.tile.id,
      run: () => onPick(f.tile),
      el: (
        <>
          <span className="l5h-o-k">
            <Glyph look={f.tile.look} size={12} /> {f.group}
            {f.hidden ? ' · hidden' : ''}
          </span>
          <span className="l5h-o-t">{f.tile.title}</span>
          {f.match.why !== 'title' && <span className="l5h-o-s">{f.match.why === 'idea' ? `idea: ${f.match.said}` : f.match.said}</span>}
        </>
      ),
    });
  options.push({
    key: 'start',
    run: () => onStart(q),
    el: q ? (
      <>
        <span className="l5h-o-k">Start a new line of thinking</span>
        <span className="l5h-o-t">“{q}”</span>
      </>
    ) : (
      <>
        <span className="l5h-o-k">New</span>
        <span className="l5h-o-t">Start a new line of thinking</span>
      </>
    ),
  });
  useEffect(() => setAt(0), [query]);
  const pick = (i: number) => {
    const o = options[i];
    if (!o) return;
    setOpen(false);
    inputRef.current?.blur();
    o.run();
  };
  return (
    <div className={`l5h-find${open ? ' is-open' : ''}`} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOpen(false)}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="Find or start…"
        aria-label="Find a conversation or an idea, or start a new line of thinking"
        role="combobox"
        aria-expanded={open}
        aria-controls="l5h-find-list"
        aria-activedescendant={open ? `l5h-o-${at}` : undefined}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setAt((i) => Math.min(options.length - 1, i + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAt((i) => Math.max(0, i - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(open ? at : q && found[0] ? options.findIndex((o) => o.key === found[0].tile.id) : options.length - 1);
          } else if (e.key === 'Escape') {
            if (query) onQuery('');
            else inputRef.current?.blur();
            setOpen(false);
          }
        }}
        style={{ fontSize: 16 }}
      />
      {q && <span className="l5h-find-n">{found.length}</span>}
      {query && (
        <button
          type="button"
          className="l5h-find-x"
          aria-label="Clear"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onQuery('');
            inputRef.current?.focus();
          }}
        >
          ×
        </button>
      )}
      <kbd className="l5h-kbd" aria-hidden="true">
        /
      </kbd>
      {open && (
        <div className="l5h-find-list" id="l5h-find-list" role="listbox" aria-label="Found, or start">
          {options.map((o, i) => (
            <button
              key={o.key}
              id={`l5h-o-${i}`}
              type="button"
              role="option"
              aria-selected={i === at}
              className={`l5h-o${i === at ? ' is-on' : ''}${o.key === 'start' ? ' is-start' : ''}`}
              onMouseEnter={() => setAt(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
            >
              {o.el}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── the View menu ────────────────────────────────────────────────────

const SORT_SAID: Record<SortBy, string> = { manual: 'Your order', recent: 'Last active', started: 'First started', name: 'Name', size: 'Size' };
const LABEL_SAID: Record<LabelLevel, string> = { minimal: 'Minimal', titles: 'Titles', ideas: 'Ideas' };
const COLOR_SAID: Record<ColorBy, string> = { project: 'Project', kind: 'Kind', recency: 'Recency' };
const SIZE_SAID: Record<SizeBy, string> = { ideas: 'Ideas', recency: 'Recency', same: 'Same' };

function Seg<T extends string>({ label, value, options, said, onPick }: { label: string; value: T; options: readonly T[]; said: Record<T, string>; onPick: (v: T) => void }) {
  return (
    <div className="l5h-vm-row">
      <span className="l5h-vm-l">{label}</span>
      <div className="l5h-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? 'is-on' : ''} onClick={() => onPick(o)}>
            {said[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

function Check({ label, on, onFlip, hint }: { label: string; on: boolean; onFlip: () => void; hint?: string }) {
  return (
    <label className="l5h-vm-check">
      <input type="checkbox" checked={on} onChange={onFlip} />
      <span>{label}</span>
      {hint && <em>{hint}</em>}
    </label>
  );
}

export function ViewMenu({
  arr,
  groups,
  hiddenCount,
  onDisplay,
  onSort,
  onProjects,
  onSaveView,
  onApplyView,
  onRemoveView,
  onTray,
  onNote,
  onTidy,
  onReset,
  onAtlas,
  onClose,
}: {
  arr: Arrangement;
  /** every group there is, to choose which are shown */
  groups: { key: string; name: string }[];
  hiddenCount: number;
  onDisplay: (patch: Partial<Display>) => void;
  onSort: (s: SortBy) => void;
  onProjects: (keys: string[] | null) => void;
  onSaveView: (name: string) => void;
  onApplyView: (id: string) => void;
  onRemoveView: (id: string) => void;
  onTray: () => void;
  onNote?: () => void;
  onTidy?: () => void;
  onReset: () => void;
  onAtlas?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [sure, setSure] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (ref.current && !ref.current.contains(t) && !t?.closest?.('.l5h-viewbtn')) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  const shown = (k: string) => !arr.projects || arr.projects.includes(k);
  return (
    <div className="l5h-vm" ref={ref} role="dialog" aria-label="How the map is shown">
      <section>
        <h4>Order</h4>
        <div className="l5h-seg is-wrap" role="radiogroup" aria-label="Order">
          {(['started', 'recent', 'manual', 'name', 'size'] as SortBy[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={arr.sort === s} className={arr.sort === s ? 'is-on' : ''} onClick={() => onSort(s)}>
              {SORT_SAID[s]}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h4>Show</h4>
        <Check label="Core chats" on={arr.display.chats} onFlip={() => onDisplay({ chats: !arr.display.chats })} />
        <Check label="Ideas they share" on={arr.display.ideas} onFlip={() => onDisplay({ ideas: !arr.display.ideas })} />
        <Check label="Snap to the grid" hint="when you put one down" on={arr.display.snap} onFlip={() => onDisplay({ snap: !arr.display.snap })} />
        <Seg label="Labels" value={arr.display.labels} options={LABELS} said={LABEL_SAID} onPick={(v) => onDisplay({ labels: v })} />
        <Seg label="Colour by" value={arr.display.color} options={COLOR_BY} said={COLOR_SAID} onPick={(v) => onDisplay({ color: v })} />
        <Seg label="Size by" value={arr.display.size} options={SIZE_BY} said={SIZE_SAID} onPick={(v) => onDisplay({ size: v })} />
      </section>
      {groups.length > 1 && (
        <section>
          <h4>
            Projects{' '}
            {arr.projects && (
              <button type="button" className="l5h-link" onClick={() => onProjects(null)}>
                show all
              </button>
            )}
          </h4>
          {groups.map((g) => (
            <Check
              key={g.key}
              label={g.name}
              on={shown(g.key)}
              onFlip={() => {
                const cur = arr.projects ?? groups.map((x) => x.key);
                const next = shown(g.key) ? cur.filter((k) => k !== g.key) : [...cur, g.key];
                onProjects(next.length === groups.length ? null : next);
              }}
            />
          ))}
        </section>
      )}
      <section>
        <h4>Saved views</h4>
        {arr.views.map((v) => (
          <div key={v.id} className="l5h-vm-view">
            <button type="button" className="l5h-link" onClick={() => onApplyView(v.id)}>
              {v.name}
            </button>
            <button type="button" className="l5h-x" aria-label={`Forget the view “${v.name}”`} onClick={() => onRemoveView(v.id)}>
              ×
            </button>
          </div>
        ))}
        <form
          className="l5h-name"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSaveView(name.trim());
            setName('');
          }}
        >
          <input value={name} maxLength={40} placeholder="Name this view to keep it" aria-label="Name this view" onChange={(e) => setName(e.target.value)} style={{ fontSize: 16 }} />
          <button type="submit" className="l5h-btn" disabled={!name.trim()}>
            Save
          </button>
        </form>
      </section>
      <section className="l5h-vm-acts">
        {hiddenCount > 0 && (
          <button type="button" className="l5h-btn" onClick={onTray}>
            Hidden · {hiddenCount}
          </button>
        )}
        {onNote && (
          <button type="button" className="l5h-btn" onClick={onNote}>
            Add a note
          </button>
        )}
        {onTidy && (
          <button type="button" className="l5h-btn" onClick={onTidy} title="Everything you put somewhere by hand goes back in its Project's order">
            Tidy up
          </button>
        )}
        {sure ? (
          <span className="l5h-sure">
            Put every place and order back?{' '}
            <button type="button" className="l5h-btn is-danger" onClick={() => (onReset(), setSure(false))}>
              Reset
            </button>{' '}
            <button type="button" className="l5h-btn" onClick={() => setSure(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="l5h-btn is-quiet" onClick={() => setSure(true)}>
            Reset layout
          </button>
        )}
        {onAtlas && (
          <button type="button" className="l5h-btn" onClick={onAtlas}>
            Everything remembered
          </button>
        )}
      </section>
    </div>
  );
}

// ── hidden, and chosen ───────────────────────────────────────────────

export function HiddenTray({ tiles, onShow, onShowAll, onClose }: { tiles: Tile[]; onShow: (id: string) => void; onShowAll: () => void; onClose: () => void }) {
  return (
    <div className="l5h-tray" role="dialog" aria-label="Hidden from the map">
      <div className="l5h-pv-head">
        <span className="l5h-tile-k">Hidden from the map · {tiles.length}</span>
        <button type="button" className="l5h-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="l5h-tray-p">Still here, and still found by search — only not drawn.</p>
      <div className="l5h-tray-list">
        {tiles.map((t) => (
          <div key={t.id} className="l5h-tray-i">
            <Glyph look={t.look} size={13} />
            <span className="l5h-tray-t">{t.title}</span>
            <button type="button" className="l5h-btn" onClick={() => onShow(t.id)}>
              Show
            </button>
          </div>
        ))}
      </div>
      {tiles.length > 1 && (
        <button type="button" className="l5h-btn" onClick={onShowAll}>
          Show them all
        </button>
      )}
    </div>
  );
}

export function ActionBar({
  count,
  pinned,
  projects,
  onNewProject,
  onMove,
  onStar,
  onHide,
  onUnpin,
  onClear,
}: {
  count: number;
  pinned: boolean;
  projects: { id: string; name: string }[];
  onNewProject?: (name: string) => void;
  onMove?: (projectId: string | null) => void;
  onStar: () => void;
  onHide: () => void;
  onUnpin: () => void;
  onClear: () => void;
}) {
  const [naming, setNaming] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  return (
    <div className="l5h-bar-sel" role="toolbar" aria-label={`${count} chosen`}>
      <span className="l5h-bar-n">{count} chosen</span>
      {naming !== null ? (
        <form
          className="l5h-name"
          onSubmit={(e) => {
            e.preventDefault();
            if (naming.trim() && onNewProject) onNewProject(naming.trim());
            setNaming(null);
          }}
        >
          <input autoFocus value={naming} maxLength={80} placeholder="Name the Project" aria-label="Name the new Project" onChange={(e) => setNaming(e.target.value)} style={{ fontSize: 16 }} />
          <button type="submit" className="l5h-go" disabled={!naming.trim()}>
            Make it
          </button>
          <button type="button" className="l5h-btn" onClick={() => setNaming(null)}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          {onNewProject && (
            <button type="button" className="l5h-go" onClick={() => setNaming('')}>
              New Project from these
            </button>
          )}
          {onMove && projects.length > 0 && (
            <span className="l5h-rel">
              <button type="button" className={`l5h-btn${moving ? ' is-on' : ''}`} aria-expanded={moving} onClick={() => setMoving((v) => !v)}>
                Move to…
              </button>
              {moving && (
                <span className="l5h-pv-move is-up" role="menu">
                  {projects.map((p) => (
                    <button key={p.id} type="button" role="menuitem" className="l5h-mi" onClick={() => (onMove(p.id), setMoving(false))}>
                      {p.name}
                    </button>
                  ))}
                  <button type="button" role="menuitem" className="l5h-mi" onClick={() => (onMove(null), setMoving(false))}>
                    Out of their Projects
                  </button>
                </span>
              )}
            </span>
          )}
          <button type="button" className="l5h-btn" onClick={onStar}>
            <StarMark /> Star
          </button>
          <button type="button" className="l5h-btn" onClick={onHide}>
            Hide
          </button>
          {pinned && (
            <button type="button" className="l5h-btn" onClick={onUnpin}>
              Back in order
            </button>
          )}
          <button type="button" className="l5h-x" aria-label="Choose none" onClick={onClear}>
            ×
          </button>
        </>
      )}
    </div>
  );
}
