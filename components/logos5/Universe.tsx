'use client';
// components/logos5/Universe.tsx — the Universal Map, Logos 5's home.
//
// Every conversation, where the person can see and arrange it
// (lib/logos5/universe.ts lays it out; lib/logos5/arrange.ts keeps how they
// arranged it). Three ways to see it — a Map of Project frames, Columns, a
// Timeline — and, while there are only a few, large cards. One box finds or
// starts. Pressing a conversation opens its card; pressing again, or
// Continue, opens it. Everything arranged can be undone.
//
// The pieces: UniverseParts.tsx (tiles, cards, the box, menus),
// UniverseMap.tsx (the map), UniverseBoards.tsx (columns, timeline, cards).

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CHATS, LOOSE, groupKeyOf, groupsOf, resumeOf, tileMatch, tilesOf, type ProjectIn, type Tile, type UniverseIn } from '@/lib/logos5/universe';
import * as A from '@/lib/logos5/arrange';
import { useArrangement } from './useArrangement';
import { MapCanvas, type MapActs } from './UniverseMap';
import { ColumnsBoard, FewCards, TimelineBoard } from './UniverseBoards';
import { ActionBar, FindOrStart, Glyph, HiddenTray, PreviewCard, StarMark, ViewMenu, kindLine, type Found } from './UniverseParts';
import './universe.css';

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** A change that also filed conversations: undoing it files them back. */
interface Filing {
  id: string;
  kind: 'logos' | 'core';
  from: string | null;
  to: string | null;
}
interface Step {
  before: A.Arrangement;
  after: A.Arrangement;
  files: Filing[];
}

const MODE_SAID: Record<A.HomeMode, string> = { map: 'Map', columns: 'Columns', timeline: 'Timeline' };
/** fewer than this, and no arranging done yet: large cards rather than a map */
const FEW = 5;

export function UniverseView({
  conversations,
  projects,
  activeId,
  signedIn = false,
  narrow = false,
  head,
  onOpen,
  onOpenChat,
  onStart,
  onFile,
  onCreateProject,
  onUpdateProject,
  onMind,
  contents = false,
  atlas,
  initial,
  now: nowGiven,
}: {
  conversations: readonly UniverseIn[];
  /** the person's Projects; undefined when there are none to have (signed out, or not loaded) */
  projects?: readonly ProjectIn[];
  activeId: string | null;
  signedIn?: boolean;
  narrow?: boolean;
  /** the screen's header, given the find-or-start box for its middle and how many conversations are on the map */
  head?: (center: ReactNode, count: number) => ReactNode;
  /** open a line of thinking */
  onOpen: (id: string) => void;
  /** open a Core chat */
  onOpenChat?: (id: string) => void;
  /** begin a new line of thinking — with these words as its first question, when there are any */
  onStart: (text: string) => void;
  /** file a conversation in a Project, or take it out of one (null) */
  onFile?: (id: string, kind: 'logos' | 'core', projectId: string | null) => void;
  /** make a Project; its id, or null if it could not be made */
  onCreateProject?: (name: string) => Promise<string | null>;
  /** rename a Project or give it a colour; what went wrong, or null */
  onUpdateProject?: (id: string, patch: { name?: string; color?: string | null }) => Promise<string | null>;
  /** the Mind Graph, for a signed-in person */
  onMind?: () => void;
  /** the contents column: every conversation, by Project */
  contents?: boolean;
  /** the Mind Atlas, for a signed-in person */
  atlas?: ReactNode;
  /** start from this arrangement (a test; otherwise it is read from where it is kept) */
  initial?: A.Arrangement;
  /** the time to read "recent" against (a test; otherwise now) */
  now?: number;
}) {
  const { arr, put } = useArrangement(signedIn, initial);
  const arrRef = useRef(arr);
  arrRef.current = arr;
  const tiles = useMemo(() => tilesOf(conversations), [conversations]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => nowGiven ?? Date.now(), [nowGiven, tiles]);
  const tileById = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const projectIds = useMemo(() => new Set((projects ?? []).map((p) => p.id)), [projects]);
  const groups = useMemo(() => groupsOf(tiles, projects, arr), [tiles, projects, arr]);
  /** every group, whatever is filtered: for choosing which are shown */
  const allGroups = useMemo(() => groupsOf(tiles, projects, { ...arr, projects: null }), [tiles, projects, arr]);
  const groupByKey = useMemo(() => new Map(allGroups.map((g) => [g.key, g])), [allGroups]);
  const hidden = useMemo(() => new Set(arr.hidden), [arr.hidden]);
  const starredSet = useMemo(() => new Set(arr.starred), [arr.starred]);
  const keyOf = useCallback((t: Tile) => groupKeyOf(t, projectIds), [projectIds]);
  const shownCount = groups.reduce((n, g) => n + g.tiles.length, 0);
  const onMapCount = tiles.filter((t) => !hidden.has(t.id) && (arr.display.chats || t.kind !== 'core')).length;

  const [query, setQuery] = useState('');
  const q = query.trim();
  const matches = useMemo(() => (q ? new Map(tiles.map((t) => [t.id, tileMatch(t, q)])) : null), [tiles, q]);
  const matchOf = useMemo(() => (matches ? (id: string) => matches.get(id) ?? null : null), [matches]);
  const found: Found[] = useMemo(
    () =>
      matches
        ? tiles
            .filter((t) => matches.get(t.id))
            .map((t) => ({ tile: t, match: matches.get(t.id)!, hidden: hidden.has(t.id), group: groupByKey.get(keyOf(t))?.name ?? (t.kind === 'core' ? 'Chats' : 'Lines of thinking') }))
            .sort((x, y) => (x.match.why === 'title' ? 0 : 1) - (y.match.why === 'title' ? 0 : 1) || y.tile.at - x.tile.at)
        : [],
    [matches, tiles, hidden, groupByKey, keyOf]
  );
  const resume = useMemo(() => resumeOf(tiles.filter((t) => !hidden.has(t.id))), [tiles, hidden]);
  const starredTiles = useMemo(() => arr.starred.map((id) => tileById.get(id)).filter((t): t is Tile => !!t), [arr.starred, tileById]);

  const [sel, setSel] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ id: string; at: DOMRect | null } | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [editNote, setEditNote] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [atlasOn, setAtlasOn] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  const past = useRef<Step[]>([]);
  const future = useRef<Step[]>([]);
  const [, bump] = useState(0);
  const findRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const center = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!said) return;
    const t = setTimeout(() => setSaid(null), 4200);
    return () => clearTimeout(t);
  }, [said]);

  // ── changes, kept, and undone ──
  const commit = useCallback(
    (change: (a: A.Arrangement) => A.Arrangement, files: Filing[] = [], arranged = false) => {
      const before = arrRef.current;
      let after = change(before);
      if (arranged) after = A.markSeen(after, 'hint');
      if (after === before && !files.length) return;
      past.current = [...past.current.slice(-59), { before, after, files }];
      future.current = [];
      put(after);
      for (const f of files) onFile?.(f.id, f.kind, f.to);
      bump((n) => n + 1);
    },
    [put, onFile]
  );
  /** How the map is shown — which view, labels, colour, order, which Projects — kept, but not among what Undo takes back. */
  const prefer = useCallback((change: (a: A.Arrangement) => A.Arrangement) => {
    const before = arrRef.current;
    const after = change(before);
    if (after !== before) put(after);
  }, [put]);
  const undo = useCallback(() => {
    const s = past.current.pop();
    if (!s) return;
    future.current.push(s);
    put(s.before);
    for (const f of [...s.files].reverse()) onFile?.(f.id, f.kind, f.from);
    bump((n) => n + 1);
  }, [put, onFile]);
  const redo = useCallback(() => {
    const s = future.current.pop();
    if (!s) return;
    past.current.push(s);
    put(s.after);
    for (const f of s.files) onFile?.(f.id, f.kind, f.to);
    bump((n) => n + 1);
  }, [put, onFile]);

  const open = useCallback(
    (t: Tile) => {
      setPreview(null);
      if (t.kind === 'core') onOpenChat?.(t.id);
      else onOpen(t.id);
    },
    [onOpen, onOpenChat]
  );
  const openId = (id: string) => {
    const t = tileById.get(id);
    if (t) open(t);
  };

  /** Whether a conversation may live in a group, and the filing that puts it there (null: it is there already). */
  const filingTo = (t: Tile, to: string): { ok: boolean; file: Filing | null } => {
    const from = keyOf(t);
    if (to === from) return { ok: true, file: null };
    const g = groupByKey.get(to);
    if (!g) return { ok: false, file: null };
    if (g.kind === 'project') return onFile && g.projectId ? { ok: true, file: { id: t.id, kind: t.kind, from: t.projectId, to: g.projectId } } : { ok: false, file: null };
    // out of a Project: a line of thinking to the rest of them, a chat to the chats
    if ((g.key === LOOSE && t.kind === 'logos') || (g.key === CHATS && t.kind === 'core')) return onFile && t.projectId ? { ok: true, file: { id: t.id, kind: t.kind, from: t.projectId, to: null } } : { ok: true, file: null };
    return { ok: false, file: null };
  };

  const fileTo = (ids: readonly string[], projectId: string | null) => {
    const files: Filing[] = [];
    for (const id of ids) {
      const t = tileById.get(id);
      if (t && (t.projectId ?? null) !== projectId) files.push({ id, kind: t.kind, from: t.projectId, to: projectId });
    }
    if (files.length) commit((a) => A.unpinTiles(a, ids), files, true);
  };

  const newProjectWith = async (ids: readonly string[], name: string) => {
    if (!onCreateProject) return;
    const pid = await onCreateProject(name);
    if (!pid) return setSaid('That Project could not be made.');
    fileTo(ids, pid);
    setSel([]);
    setSaid(`“${name}” made, with ${ids.length === 1 ? 'it' : `these ${ids.length}`} in it.`);
  };

  const projectOf = (key: string) => groupByKey.get(key)?.projectId ?? null;

  // ── the map's hands ──
  const mapActs: MapActs = {
    onSelect: (ids, add) => {
      setSel((cur) => (add ? [...cur.filter((x) => !ids.includes(x)), ...ids.filter((x) => !cur.includes(x))] : ids));
      if (!add && ids.length !== 1) setPreview(null);
    },
    onPreview: (id, at) => setPreview(id ? { id, at } : null),
    onOpen: openId,
    onDrop: (moves, others) => {
      const files: Filing[] = [];
      const pins: { id: string; g: string; x: number; y: number }[] = [];
      const unpin: string[] = [];
      let refused = false;
      const within: typeof moves = [];
      for (const m of moves) {
        const t = tileById.get(m.id);
        if (!t) continue;
        const f = filingTo(t, m.to);
        if (!f.ok) {
          refused = true;
          continue;
        }
        // put down in its own frame, it stays where it was put; filed elsewhere, it joins that frame's order
        if (m.to === keyOf(t)) {
          pins.push({ id: m.id, g: m.to, x: m.x, y: m.y });
          within.push(m);
        } else unpin.push(m.id);
        if (f.file) files.push(f.file);
      }
      // once a frame is arranged by hand, the others in it stay where they are rather than closing the gap
      const arranged = new Set(within.map((m) => m.to));
      const placed = [...pins];
      for (const o of others) if (arranged.has(o.g)) pins.unshift({ id: o.id, g: o.g, x: o.x, y: o.y });
      // on the grid, one put down on another's place trades places with it
      if (arrRef.current.display.snap && within.length === 1) {
        const m = within[0];
        const at = [...others.filter((o) => o.g === m.to), ...Object.entries(arrRef.current.pins).filter(([, p]) => p.g === m.to).map(([id, p]) => ({ id, g: p.g, x: p.x, y: p.y }))];
        const there = at.find((o) => o.id !== m.id && o.x === m.x && o.y === m.y);
        if (there && !placed.some((p) => p.id === there.id)) pins.push({ id: there.id, g: m.to, x: m.fx, y: m.fy });
      }
      if (refused) setSaid(signedIn ? 'A Core chat lives in Chats or a Project; a line of thinking in a Project or with the rest.' : 'Sign in to file conversations in Projects.');
      if (!pins.length && !unpin.length) return;
      commit(
        (a) => {
          let next = A.unpinTiles(a, unpin);
          for (const p of pins) next = A.pinTile(next, p.id, p.g, p.x, p.y);
          return next;
        },
        files,
        true
      );
    },
    onMoveFrame: (key, dx, dy) => (dx || dy) && commit((a) => A.moveFrame(a, key, dx, dy), [], true),
    onFrameCols: (key, cols) => commit((a) => A.setFrame(a, key, { cols }), [], true),
    onFold: (key, folded) => commit((a) => A.setFrame(a, key, { collapsed: folded }), [], true),
    onRename: onUpdateProject
      ? (key, name) => {
          const pid = projectOf(key);
          if (pid) void onUpdateProject(pid, { name }).then((err) => err && setSaid(err));
        }
      : undefined,
    onColor: onUpdateProject
      ? (key, color) => {
          const pid = projectOf(key);
          if (pid) void onUpdateProject(pid, { color }).then((err) => err && setSaid(err));
        }
      : undefined,
    onNote: (x, y) => {
      const id = newId('n');
      commit((a) => A.addNote(a, { id, x: x - 40, y: y - 20, text: 'A note' }), [], true);
      setEditNote(id);
    },
    onNoteEdit: (id, text) => commit((a) => A.editNote(a, id, text)),
    onNoteMove: (id, x, y) => commit((a) => A.moveNote(a, id, x, y), [], true),
    onLinkTo: (id) => {
      const from = linkFrom;
      setLinkFrom(null);
      if (!from || from === id) return;
      commit((a) => A.addLink(a, { id: newId('l'), a: from, b: id, label: '' }), [], true);
      setSaid('Linked. Press the ⟷ on the line to say what joins them.');
    },
    onLinkEdit: (id, label) => commit((a) => (label === null ? A.removeLink(a, id) : A.relabelLink(a, id, label))),
  };

  // ── the columns' hands ──
  const showing = () => Object.fromEntries(allGroups.map((g) => [g.key, g.tiles.map((t) => t.id)]));
  const moveCard = (id: string, to: string, at: number) => {
    const t = tileById.get(id);
    if (!t) return;
    const f = filingTo(t, to);
    if (!f.ok) return setSaid(signedIn ? 'A Core chat lives in Chats or a Project; a line of thinking in a Project or with the rest.' : 'Sign in to file conversations in Projects.');
    const list = (groupByKey.get(to)?.tiles ?? []).map((x) => x.id);
    const next = A.placeInOrder(list, id, at);
    commit((a) => A.unpinTiles(A.setOrder(a, { [to]: next }, showing()), [id]), f.file ? [f.file] : [], true);
  };
  const moveColumn = (key: string, at: number) => {
    const all = allGroups.map((g) => g.key);
    const others = groups.map((g) => g.key).filter((k) => k !== key);
    const before = others[at];
    const rest = all.filter((k) => k !== key);
    commit((a) => A.moveGroup(a, all, key, before ? rest.indexOf(before) : rest.length), [], true);
  };

  // ── keys anywhere on the map: / finds, ⌘Z undoes, Escape lets go ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el?.closest?.('input, textarea, [contenteditable="true"]');
      if (e.key === 'Escape') {
        if (linkFrom) setLinkFrom(null);
        else if (preview) setPreview(null);
        else if (sel.length) setSel([]);
        else if (selectMode) setSelectMode(false);
        return;
      }
      if (typing) return;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        findRef.current?.focus();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linkFrom, preview, sel.length, selectMode, undo, redo]);

  // a conversation gone from the map is no longer chosen
  useEffect(() => {
    setSel((cur) => (cur.every((id) => tileById.has(id) && !hidden.has(id)) ? cur : cur.filter((id) => tileById.has(id) && !hidden.has(id))));
  }, [tileById, hidden]);

  const few =
    arr.mode === 'map' &&
    shownCount > 0 &&
    shownCount < FEW &&
    !Object.keys(arr.pins).length &&
    !arr.notes.length &&
    !arr.links.length &&
    !Object.values(arr.frames).some((f) => f.dx || f.dy || f.cols || f.collapsed);

  // ── the card beside a pressed conversation ──
  const previewTile = preview ? tileById.get(preview.id) ?? null : null;
  const pvStyle = (() => {
    if (!preview?.at || narrow || !mainRef.current) return undefined;
    const box = mainRef.current.getBoundingClientRect();
    const W = 344;
    const a = preview.at;
    const right = a.right + 12 + W <= box.right - 8;
    const left = right ? a.right - box.left + 12 : Math.max(8, a.left - box.left - W - 12);
    const top = Math.max(64, Math.min(a.top - box.top, box.height - 420));
    return { left, top, width: W };
  })();
  const previewEl =
    previewTile && preview ? (
      <PreviewCard
        tile={previewTile}
        group={groupByKey.get(keyOf(previewTile)) ?? null}
        starred={starredSet.has(previewTile.id)}
        pinned={arr.mode === 'map' && !!arr.pins[previewTile.id]}
        projects={(projects ?? []).filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name }))}
        links={arr.links
          .filter((l) => l.a === previewTile.id || l.b === previewTile.id)
          .map((l) => ({ id: l.id, title: tileById.get(l.a === previewTile.id ? l.b : l.a)?.title ?? 'a conversation no longer here', label: l.label }))}
        style={pvStyle}
        sheet={narrow}
        acts={{
          onOpen: () => open(previewTile),
          onStar: () => commit((a) => A.setIn(a, 'starred', [previewTile.id], !starredSet.has(previewTile.id))),
          onHide: () => {
            commit((a) => A.setIn(a, 'hidden', [previewTile.id], true));
            setPreview(null);
            setSaid(`“${previewTile.title}” is hidden — View, then Hidden, brings it back.`);
          },
          onLink:
            arr.mode === 'map' && !few
              ? () => {
                  setLinkFrom(previewTile.id);
                  setPreview(null);
                }
              : undefined,
          onUnpin: () => commit((a) => A.unpinTiles(a, [previewTile.id]), [], true),
          onMove: onFile && projects?.length ? (pid) => fileTo([previewTile.id], pid) : undefined,
          onNewProject: onFile && onCreateProject && projects ? (name) => void newProjectWith([previewTile.id], name) : undefined,
          onClose: () => setPreview(null),
        }}
      />
    ) : null;

  // ── the box that finds or starts ──
  const findEl = (
    <FindOrStart
      query={query}
      onQuery={setQuery}
      found={found}
      resume={resume}
      inputRef={findRef}
      onPick={(t) => {
        setQuery('');
        open(t);
      }}
      onStart={(text) => {
        setQuery('');
        onStart(text);
      }}
    />
  );

  // ── the list column ──
  const contentsEl = contents ? (
    <aside className="l5c" aria-label="Contents">
      <div className="l5c-head">
        <span className="l5c-k">Contents</span>
        <h2>Your Universal Map</h2>
        <p>
          {onMapCount} {onMapCount === 1 ? 'conversation' : 'conversations'}
          {arr.hidden.length ? ` · ${arr.hidden.length} hidden` : ''}
        </p>
      </div>
      <div className="l5c-list">
        {starredTiles.length > 0 && !q && (
          <div className="l5c-group">
            <span className="l5c-k">Starred</span>
            {starredTiles.map((t) => (
              <button key={t.id} type="button" className={`l5c-item${t.id === activeId ? ' is-here' : ''}`} onClick={() => open(t)}>
                <span className="l5c-t">{t.title}</span>
                <span className="l5c-s">{kindLine(t)}</span>
              </button>
            ))}
          </div>
        )}
        {groups.map((g) => {
          const list = matchOf ? g.tiles.filter((t) => matchOf(t.id)) : g.tiles;
          if (!list.length) return null;
          return (
            <div key={g.key} className="l5c-group">
              <span className="l5c-k">{g.name}</span>
              {list.map((t) => (
                <button key={t.id} type="button" className={`l5c-item${t.id === activeId ? ' is-here' : ''}`} onClick={() => open(t)}>
                  <span className="l5c-t">{t.title}</span>
                  <span className="l5c-s">{kindLine(t)}</span>
                </button>
              ))}
            </div>
          );
        })}
        {!groups.some((g) => (matchOf ? g.tiles.some((t) => matchOf(t.id)) : g.tiles.length)) && <p className="l5c-none">{tiles.length ? 'Nothing matches.' : 'Nothing here yet — each line of thinking you begin is listed here.'}</p>}
      </div>
      {onMind && (
        <button type="button" className="l5c-mind" onClick={onMind}>
          Mind Graph <span aria-hidden="true">→</span>
        </button>
      )}
    </aside>
  ) : null;

  // ── what the map shows ──
  let body: ReactNode;
  if (atlasOn && atlas)
    body = (
      <div className="l5h-atlas">
        <button type="button" className="l5h-btn l5h-back" onClick={() => setAtlasOn(false)}>
          ← Back to the map
        </button>
        {atlas}
      </div>
    );
  else if (!tiles.length)
    body = (
      <div className="l5h-empty">
        <p>Every line of thinking you start appears here — by Project, as a map you can arrange.</p>
        <button type="button" className="l5h-go" onClick={() => onStart('')}>
          What are you working on? <span aria-hidden="true">→</span>
        </button>
      </div>
    );
  else if (!shownCount)
    body = (
      <div className="l5h-empty">
        <p>Nothing is shown with the map set this way.</p>
        <button type="button" className="l5h-btn" onClick={() => prefer((a) => A.setDisplay(A.setProjects(a, null), { chats: true }))}>
          Show everything
        </button>
      </div>
    );
  else if (few) body = <FewCards groups={groups} arr={arr} now={now} activeId={activeId} matchOf={matchOf} onOpen={openId} onPreview={(id, el) => setPreview({ id, at: el.getBoundingClientRect() })} />;
  else if (arr.mode === 'columns')
    body = (
      <ColumnsBoard
        groups={groups}
        arr={arr}
        now={now}
        activeId={activeId}
        matchOf={matchOf}
        onOpen={openId}
        onPreview={(id, el) => setPreview({ id, at: el.getBoundingClientRect() })}
        onMoveCard={moveCard}
        onMoveColumn={moveColumn}
        onFold={(key, folded) => commit((a) => A.setFrame(a, key, { collapsed: folded }))}
      />
    );
  else if (arr.mode === 'timeline') body = <TimelineBoard groups={groups} arr={arr} now={now} matchOf={matchOf} onOpen={openId} onPreview={(id, el) => setPreview({ id, at: el.getBoundingClientRect() })} />;
  else
    body = (
      <MapCanvas
        groups={groups}
        tileById={tileById}
        arr={arr}
        now={now}
        activeId={activeId}
        resumeId={resume?.id ?? null}
        selected={sel}
        matchOf={matchOf}
        linkFrom={linkFrom}
        editNote={editNote}
        setEditNote={setEditNote}
        selectMode={selectMode}
        fitKey={fitKey}
        centerRef={center}
        top={narrow ? (resume || starredTiles.length ? 104 : 58) : 64}
        narrow={narrow}
        acts={mapActs}
      />
    );

  const isMap = arr.mode === 'map' && !few && !atlasOn && shownCount > 0;
  const selPinned = sel.some((id) => !!arr.pins[id]);

  return (
    <section className={`l5h${narrow ? ' is-narrow' : ''}${contents ? ' has-contents' : ''}`} aria-label="Universal Map">
      {head?.(narrow ? null : findEl, onMapCount)}
      {narrow && <div className="l5h-findrow">{findEl}</div>}
      <div className="l5h-body">
        {contentsEl}
        <div className="l5h-main" ref={mainRef}>
          {tiles.length > 0 && !atlasOn && (
            <div className="l5h-bar">
              <div className="l5h-seg is-modes" role="radiogroup" aria-label="Show as">
                {A.MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={arr.mode === m}
                    className={arr.mode === m ? 'is-on' : ''}
                    onClick={() => {
                      setPreview(null);
                      setSel([]);
                      prefer((a) => A.setMode(a, m));
                      if (m === 'map') setFitKey((k) => k + 1);
                    }}
                  >
                    {MODE_SAID[m]}
                  </button>
                ))}
              </div>
              {(resume || starredTiles.length > 0) && (
                <div className="l5h-strip" aria-label="Pick up, and starred">
                  {resume && (
                    <button type="button" className="l5h-pick" onClick={() => open(resume)} title={`Pick up where you left off: ${resume.title}`}>
                      <Glyph look={resume.look} size={13} />
                      <span className="l5h-pick-k">Pick up where you left off</span>
                      <span className="l5h-pick-t">{resume.title}</span>
                      <span aria-hidden="true">→</span>
                    </button>
                  )}
                  {starredTiles.map((t) => (
                    <button key={t.id} type="button" className="l5h-starchip" onClick={() => open(t)} title={t.title}>
                      <StarMark />
                      <span>{t.title}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="l5h-bar-r">
                {isMap && (
                  <button type="button" className={`l5h-tool is-select${selectMode ? ' is-on' : ''}`} aria-pressed={selectMode} onClick={() => setSelectMode((v) => !v)} title="Choose several: drag across them (or hold Shift and drag)">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeDasharray="3 2.4" aria-hidden="true">
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                    </svg>
                    <span className="l5h-tool-l">Select</span>
                  </button>
                )}
                <button type="button" className="l5h-tool" onClick={undo} disabled={!past.current.length} aria-label="Undo" title="Undo (⌘Z)">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
                  </svg>
                </button>
                <button type="button" className="l5h-tool is-redo" onClick={redo} disabled={!future.current.length} aria-label="Redo" title="Redo (⇧⌘Z)">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />
                  </svg>
                </button>
                <button type="button" className={`l5h-tool l5h-viewbtn${viewOpen ? ' is-on' : ''}`} aria-expanded={viewOpen} onClick={() => setViewOpen((v) => !v)}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5v5M8 14.5v5" />
                  </svg>
                  <span className="l5h-tool-l">View</span>
                </button>
              </div>
            </div>
          )}
          {body}
          {viewOpen && (
            <ViewMenu
              arr={arr}
              groups={allGroups.map((g) => ({ key: g.key, name: g.name }))}
              hiddenCount={arr.hidden.filter((id) => tileById.has(id)).length}
              onDisplay={(patch) => prefer((a) => A.setDisplay(a, patch))}
              onSort={(s) => prefer((a) => A.setSort(a, s))}
              onProjects={(keys) => prefer((a) => A.setProjects(a, keys))}
              onSaveView={(name) => {
                commit((a) => A.saveView(a, newId('v'), name, query));
                setSaid(`Saved “${name}”.`);
              }}
              onApplyView={(id) => {
                const v = arr.views.find((x) => x.id === id);
                prefer((a) => A.applyView(a, id));
                setQuery(v?.query ?? '');
                setFitKey((k) => k + 1);
                setViewOpen(false);
              }}
              onRemoveView={(id) => commit((a) => A.removeView(a, id))}
              onTray={() => {
                setTrayOpen(true);
                setViewOpen(false);
              }}
              onNote={
                isMap
                  ? () => {
                      setViewOpen(false);
                      mapActs.onNote(center.current.x, center.current.y);
                    }
                  : undefined
              }
              onTidy={isMap && Object.keys(arr.pins).length ? () => commit((a) => A.tidy(a), [], true) : undefined}
              onReset={() => {
                commit((a) => A.resetLayout(a), [], true);
                setFitKey((k) => k + 1);
              }}
              onAtlas={
                atlas
                  ? () => {
                      setAtlasOn(true);
                      setViewOpen(false);
                    }
                  : undefined
              }
              onClose={() => setViewOpen(false)}
            />
          )}
          {trayOpen && (
            <HiddenTray
              tiles={arr.hidden.map((id) => tileById.get(id)).filter((t): t is Tile => !!t)}
              onShow={(id) => commit((a) => A.setIn(a, 'hidden', [id], false))}
              onShowAll={() => {
                commit((a) => A.setIn(a, 'hidden', a.hidden, false));
                setTrayOpen(false);
              }}
              onClose={() => setTrayOpen(false)}
            />
          )}
          {previewEl}
          {sel.length > 1 && (
            <ActionBar
              count={sel.length}
              pinned={selPinned}
              projects={(projects ?? []).filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name }))}
              onNewProject={onFile && onCreateProject && projects ? (name) => void newProjectWith(sel, name) : undefined}
              onMove={onFile && projects ? (pid) => fileTo(sel, pid) : undefined}
              onStar={() => commit((a) => A.setIn(a, 'starred', sel, true))}
              onHide={() => {
                commit((a) => A.setIn(a, 'hidden', sel, true));
                setSaid(`${sel.length} hidden — View, then Hidden, brings them back.`);
                setSel([]);
              }}
              onUnpin={() => commit((a) => A.unpinTiles(a, sel), [], true)}
              onClear={() => setSel([])}
            />
          )}
          {linkFrom && (
            <div className="l5h-banner" role="status">
              Press the conversation to link “{tileById.get(linkFrom)?.title}” to.{' '}
              <button type="button" className="l5h-link" onClick={() => setLinkFrom(null)}>
                Cancel
              </button>
            </div>
          )}
          {isMap && !arr.seen.hint && !linkFrom && sel.length < 2 && (
            <p className="l5h-hint">
              Drag to arrange — into another Project to file it · double-click to write a note · pinch or ⌘-scroll to zoom
              <button type="button" className="l5h-x" aria-label="Got it" onClick={() => prefer((a) => A.markSeen(a, 'hint'))}>
                ×
              </button>
            </p>
          )}
          {said && (
            <p className="l5h-said" role="status">
              {said}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
