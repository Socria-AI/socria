'use client';
// components/logos5/Universe.tsx — the Universal Map, Logos 5's home.
//
// Every past conversation, on one map: "Your map, not a list." How much of
// it, chosen at the top right: Today and This week are drawn as subjects —
// each a dashed circle, a real study session a disc in its colour, a quick
// question a dot on a spoke from its session, and what joins two subjects a
// dashed curve with a card that says why (lib/logos5/bubbles.ts; nothing has
// to be filed for that, lib/logos5/subjects.ts reads what each is about) —
// and This month and All time are a line through time, the oldest on the
// left and the newest on the right (lib/logos5/timeline.ts), where something
// half-remembered is found by scrolling back. lib/logos5/arrange.ts keeps how
// the person arranged it. One box at the foot finds or starts. Pressing a
// conversation opens its card; pressing again, or Continue, opens it.
// Everything arranged can be undone. Each lens comes in drawn.
//
// The pieces: UniverseBubbles.tsx (the map), UniverseTime.tsx (the line),
// UniverseParts.tsx (the card, the box, the menus).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { resumeOf, sharedIdeas, tileMatch, tilesOf, type ProjectIn, type Tile, type UniverseIn } from '@/lib/logos5/universe';
import { dayName, dayStart, homesOf, todayOf, weekStart } from '@/lib/logos5/spatial';
import { monthStart } from '@/lib/logos5/timeline';
import { OTHER } from '@/lib/logos5/subjects';
import * as A from '@/lib/logos5/arrange';
import { useArrangement } from './useArrangement';
import { BubbleMap, type BubbleActs } from './UniverseBubbles';
import { TimeView } from './UniverseTime';
import { ActionBar, FindOrStart, Glyph, HiddenTray, PreviewCard, StarMark, ViewMenu, kindLine, shortDate, type Found } from './UniverseParts';
import './universe.css';

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
/** before paint in a browser; nothing on the server */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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

/** How much of it is shown; short on a phone. Today and This week are a map, the other two a line through time. */
const LENS_SAID: Record<A.HomeMode, { long: string; short: string }> = {
  today: { long: 'Today', short: 'Today' },
  week: { long: 'This week', short: 'Week' },
  month: { long: 'This month', short: 'Month' },
  all: { long: 'All time', short: 'All' },
};

const HINT: Record<A.HomeMode, string> = {
  today: 'Today’s sessions, what they build on, and what links them across subjects · press one to see it, twice to open it · drag one into another subject to file it there',
  week: 'This week by subject — a disc is a real study session, a dot a quick question · drag one into another subject to file it there · ↩ finds where a subject was before',
  month: 'Oldest on the left, newest on the right — each where it began; joined when it followed on within a week · ↩ goes back to where a subject was before',
  all: 'Oldest on the left, newest on the right — each where it began; joined when it followed on within a week · ↩ goes back to where a subject was before',
};

const DAY = 86_400_000;
/** In order (This month, All time) rather than a map. */
const inTime = (m: A.HomeMode) => m === 'month' || m === 'all';
/** what the page's own words and the box at the foot cover of the map, wide and on a phone */
const TOP = { wide: 150, narrow: 140 } as const;
const FOOT = { wide: 92, narrow: 78 } as const;
/** the foot's width that holds what the marks mean beside the box */
const LEGEND_ROOM = 1120;

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
  drawing = null,
  initial,
  now: nowGiven,
}: {
  conversations: readonly UniverseIn[];
  /** the person's Projects; undefined when there are none to have (signed out, or not loaded) */
  projects?: readonly ProjectIn[];
  activeId: string | null;
  signedIn?: boolean;
  narrow?: boolean;
  /** the screen's header, given what goes in its middle (nothing: the box that finds or starts is at the map's foot) and how many conversations are on the map */
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
  /** the contents column: every conversation, by subject */
  contents?: boolean;
  /** the Mind Atlas, for a signed-in person */
  atlas?: ReactNode;
  /** the Core chats brought in having their maps drawn: how many of how many, while it lasts */
  drawing?: { done: number; total: number } | null;
  /** start from this arrangement (a test; otherwise it is read from where it is kept) */
  initial?: A.Arrangement;
  /** the time to read "recent" and "today" against (a test; otherwise now) */
  now?: number;
}) {
  const { arr, put } = useArrangement(signedIn, initial);
  const arrRef = useRef(arr);
  arrRef.current = arr;
  const lens = arr.mode;
  const tiles = useMemo(() => tilesOf(conversations), [conversations]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => nowGiven ?? Date.now(), [nowGiven, tiles]);
  const tileById = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const hidden = useMemo(() => new Set(arr.hidden), [arr.hidden]);
  const starredSet = useMemo(() => new Set(arr.starred), [arr.starred]);
  /** on the map at all: not hidden, and not a Core chat when those are put away */
  const visible = useMemo(() => tiles.filter((t) => !hidden.has(t.id) && (arr.display.chats || t.kind !== 'core')), [tiles, hidden, arr.display.chats]);
  const homes = useMemo(() => homesOf(visible, projects, arr), [visible, projects, arr]);
  /** where every conversation would be, hidden ones too: for naming what a search finds */
  const allHomes = useMemo(() => homesOf(tiles, projects, arr), [tiles, projects, arr]);
  const only = useMemo(() => (arr.projects ? new Set(arr.projects) : null), [arr.projects]);
  const shown = useMemo(() => (only ? visible.filter((t) => only.has(homes.of.get(t.id)?.key ?? OTHER)) : visible), [visible, only, homes]);
  const shownHomes = useMemo(() => (only ? { ...homes, list: homes.list.filter((h) => only.has(h.key)) } : homes), [homes, only]);
  // ── how much of it: a week (this one, or one chosen from the line), this month, or all of it ──
  /** the week shown as a map, when it is not this one — chosen from the line; not kept */
  const [weekAt, setWeekAt] = useState<number | null>(null);
  const weekFrom = weekStart(weekAt ?? now);
  const weekTo = weekStart(weekFrom + 8 * DAY);
  const scoped = useMemo(() => {
    // this week: what was worked on in it; a week before: what was begun in it, as the line shows it
    if (lens === 'week') return shown.filter((t) => (weekAt === null ? t.at >= weekFrom || t.started >= weekFrom : t.started >= weekFrom && t.started < weekTo));
    if (lens === 'month') return shown.filter((t) => t.started >= monthStart(now));
    return shown;
  }, [lens, shown, weekAt, weekFrom, weekTo, now]);
  const ideas = useMemo(() => sharedIdeas(lens === 'week' ? scoped : shown), [lens, scoped, shown]);
  /** on the week's map: by each subject there, the last of that subject before the week */
  const backOf = useMemo(() => {
    if (lens !== 'week') return undefined;
    const inWeek = new Set(scoped.map((t) => t.id));
    const firstOf = new Map<string, Tile>();
    for (const t of [...scoped].sort((a, b) => a.started - b.started)) {
      const key = homes.of.get(t.id)?.key;
      if (key && key !== OTHER && !firstOf.has(key)) firstOf.set(key, t);
    }
    const out = new Map<string, { id: string; at: number }>();
    for (const [key, t] of firstOf) {
      let best: Tile | null = null;
      for (const u of visible) if (!inWeek.has(u.id) && u.started < weekFrom && homes.of.get(u.id)?.key === key && (!best || u.started > best.started)) best = u;
      if (best) out.set(t.id, { id: best.id, at: best.started });
    }
    return out;
  }, [lens, scoped, homes, visible, weekFrom]);
  /** Today: the day it is about — today, or the last day anything was worked on */
  const todayPlan = useMemo(() => (lens === 'today' ? todayOf(shown, shownHomes, ideas, now, arr.links) : null), [lens, shown, shownHomes, ideas, now, arr.links]);
  /** Today: the folded subjects opened; let go on leaving Today */
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  /** go to one on the line — a ↩ on the week's map, "Find it in time" — once per press */
  const [timeFocus, setTimeFocus] = useState<{ id: string; n: number } | null>(null);
  const [endKey, setEndKey] = useState(0);
  const homeByKey = useMemo(() => new Map(homes.list.map((h) => [h.key, h])), [homes]);

  const [query, setQuery] = useState('');
  const q = query.trim();
  const matches = useMemo(() => (q ? new Map(tiles.map((t) => [t.id, tileMatch(t, q)])) : null), [tiles, q]);
  const matchOf = useMemo(() => (matches ? (id: string) => matches.get(id) ?? null : null), [matches]);
  const found: Found[] = useMemo(
    () =>
      matches
        ? tiles
            .filter((t) => matches.get(t.id))
            .map((t) => ({ tile: t, match: matches.get(t.id)!, hidden: hidden.has(t.id), group: allHomes.of.get(t.id)?.name ?? 'Everything else' }))
            .sort((x, y) => (x.match.why === 'title' ? 0 : 1) - (y.match.why === 'title' ? 0 : 1) || y.tile.at - x.tile.at)
        : [],
    [matches, tiles, hidden, allHomes]
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
  const topRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const center = useRef({ x: 0, y: 0 });
  /**
   * How much of the map the page's own words cover at the top, and the box at
   * the foot: measured, so the map is fitted between them — and whether the
   * foot is wide enough for what the marks mean beside the box (a smaller
   * window, or the List open beside the map, and it gives way).
   */
  const [insets, setInsets] = useState<{ top: number; foot: number; legend: boolean } | null>(null);
  const hasTop = tiles.length > 0 && !atlasOn;
  useBeforePaint(() => {
    const measure = () => {
      const t = topRef.current?.getBoundingClientRect().height ?? 0;
      const f = footRef.current?.getBoundingClientRect();
      if (!f?.height) return;
      const next = { top: Math.ceil(t), foot: Math.ceil(f.height), legend: f.width >= LEGEND_ROOM };
      setInsets((cur) => (cur && cur.top === next.top && cur.foot === next.foot && cur.legend === next.legend ? cur : next));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (topRef.current) ro?.observe(topRef.current);
    if (footRef.current) ro?.observe(footRef.current);
    return () => ro?.disconnect();
  }, [narrow, hasTop, lens]);

  useEffect(() => {
    if (!said) return;
    const t = setTimeout(() => setSaid(null), 4200);
    return () => clearTimeout(t);
  }, [said]);
  // another week is another map, fitted to it; leaving Today folds again what was opened there
  useEffect(() => setFitKey((k) => k + 1), [weekAt]);
  useEffect(() => {
    if (lens !== 'today') setOpened((o) => (o.size ? new Set() : o));
  }, [lens]);

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
  /** How the map is shown — the lens, labels, colour, which subjects — kept, but not among what Undo takes back. */
  const prefer = useCallback(
    (change: (a: A.Arrangement) => A.Arrangement) => {
      const before = arrRef.current;
      const after = change(before);
      if (after !== before) put(after);
    },
    [put]
  );
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

  // ── the lenses ──
  const pickLens = (m: A.HomeMode) => {
    setPreview(null);
    setWeekAt(null);
    // pressed again: back to today on the line, the whole of it on a map
    if (m === lens) return inTime(m) ? setEndKey((k) => k + 1) : setFitKey((k) => k + 1);
    setSel([]);
    prefer((a) => A.setMode(a, m));
  };
  /** the week a conversation began in, as a map */
  const seeWeek = (t: Tile) => {
    setPreview(null);
    setSel([]);
    const w = weekStart(t.started);
    setWeekAt(w >= weekStart(now) ? null : w);
    prefer((a) => A.setMode(a, 'week'));
  };
  /** where a conversation is in time: All time, brought to it */
  const findInTime = (id: string) => {
    setPreview(null);
    setSel([]);
    if (lens !== 'all') prefer((a) => A.setMode(a, 'all'));
    setTimeFocus({ id, n: Date.now() });
  };

  /** Filed in a Project — which is then its subject, so any subject it was given by hand is let go. */
  const fileTo = (ids: readonly string[], projectId: string | null) => {
    const files: Filing[] = [];
    for (const id of ids) {
      const t = tileById.get(id);
      if (t && (t.projectId ?? null) !== projectId) files.push({ id, kind: t.kind, from: t.projectId, to: projectId });
    }
    if (files.length) commit((a) => A.setSubject(A.unpinTiles(a, ids), ids, null), files, true);
  };

  const newProjectWith = async (ids: readonly string[], name: string) => {
    if (!onCreateProject) return;
    const pid = await onCreateProject(name);
    if (!pid) return setSaid('That Project could not be made.');
    fileTo(ids, pid);
    setSel([]);
    setSaid(`“${name}” made, with ${ids.length === 1 ? 'it' : `these ${ids.length}`} in it.`);
  };

  const membersOf = (key: string) => shown.filter((t) => homes.of.get(t.id)?.key === key).map((t) => t.id);
  const projectOf = (key: string) => homeByKey.get(key)?.projectId ?? null;
  const refuseSay = () => setSaid(signedIn ? 'That could not be moved there.' : 'Sign in to file conversations in Projects.');

  /**
   * Conversations put in another subject on the map: into a Project, filed
   * there, and the Project is their subject; into a course, a field or
   * everything else, that is their subject now — out of their Project, if
   * they were in one.
   */
  const refile = (ids: readonly string[], toKey: string) => {
    const target = homeByKey.get(toKey);
    if (!target) return;
    const files: Filing[] = [];
    const given: { id: string; key: string | null }[] = [];
    let refused = false;
    for (const id of ids) {
      const t = tileById.get(id);
      if (!t || homes.of.get(id)?.key === toKey) continue;
      if (target.kind === 'project') {
        if (!onFile || !target.projectId) {
          refused = true;
          continue;
        }
        files.push({ id, kind: t.kind, from: t.projectId, to: target.projectId });
        given.push({ id, key: null });
      } else {
        if (t.projectId) {
          if (!onFile) {
            refused = true;
            continue;
          }
          files.push({ id, kind: t.kind, from: t.projectId, to: null });
        }
        given.push({ id, key: target.key === OTHER ? OTHER : target.key });
      }
    }
    if (refused) refuseSay();
    if (!given.length) return;
    commit(
      (a) => {
        let next = A.unpinTiles(a, given.map((g) => g.id));
        for (const g of given) next = A.setSubject(next, [g.id], g.key);
        return next;
      },
      files,
      true
    );
    setSaid(`${given.length === 1 ? `“${tileById.get(given[0].id)?.title ?? 'It'}” is` : `${given.length} are`} in ${target.name} now.`);
  };

  // ── the map's hands ──
  const mapActs: BubbleActs = {
    onSelect: (ids, add) => {
      setSel((cur) => (add ? [...cur.filter((x) => !ids.includes(x)), ...ids.filter((x) => !cur.includes(x))] : ids));
      if (!add && ids.length !== 1) setPreview(null);
    },
    onPreview: (id, at) => setPreview(id ? { id, at } : null),
    onOpen: openId,
    onRefile: refile,
    onFold: (key, folded) => commit((a) => A.setFrame(a, key, { collapsed: folded }), [], true),
    onOpenFar: (key, on) =>
      setOpened((cur) => {
        const next = new Set(cur);
        if (on) next.add(key);
        else next.delete(key);
        return next;
      }),
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
    onMakeProject:
      onFile && onCreateProject && projects
        ? (key) => {
            const h = homeByKey.get(key);
            if (h) void newProjectWith(membersOf(key), h.name);
          }
        : undefined,
    onFileSuggested: onFile
      ? (key) => {
          const pid = projectOf(key);
          const ids = shown.filter((t) => homes.of.get(t.id)?.key === key && homes.suggested.has(t.id)).map((t) => t.id);
          if (!pid || !ids.length) return;
          fileTo(ids, pid);
          setSaid(`${ids.length === 1 ? 'Filed' : `${ids.length} filed`} in “${homeByKey.get(key)?.name ?? 'the Project'}”.`);
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
      setSaid('Linked. Its card says what joins them — press “Say what joins them” to write it.');
    },
    onLinkEdit: (id, label) => commit((a) => (label === null ? A.removeLink(a, id) : A.relabelLink(a, id, label))),
    onBack: (id) => findInTime(id),
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

  // ── the card beside a pressed conversation ──
  const previewTile = preview ? tileById.get(preview.id) ?? null : null;
  const pvStyle = (() => {
    if (!preview?.at || narrow || !mainRef.current) return undefined;
    const box = mainRef.current.getBoundingClientRect();
    const W = 344;
    const a = preview.at;
    const right = a.right + 12 + W <= box.right - 8;
    const left = right ? a.right - box.left + 12 : Math.max(8, a.left - box.left - W - 12);
    const top = Math.max(64, Math.min(a.top - box.top, box.height - 440));
    return { left, top, width: W };
  })();
  const previewHome = previewTile ? homes.of.get(previewTile.id) ?? allHomes.of.get(previewTile.id) ?? null : null;
  const previewSuggested = previewTile && homes.suggested.has(previewTile.id) && previewHome?.projectId ? previewHome : null;
  const previewEl =
    previewTile && preview ? (
      <PreviewCard
        tile={previewTile}
        home={previewHome}
        suggested={previewSuggested?.name ?? null}
        starred={starredSet.has(previewTile.id)}
        pinned={false}
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
          // a link is drawn on the map; the line through time draws only what followed on
          onLink: inTime(lens)
            ? undefined
            : () => {
                setLinkFrom(previewTile.id);
                setPreview(null);
              },
          onWeek: inTime(lens) ? () => seeWeek(previewTile) : undefined,
          onTime: inTime(lens) ? undefined : () => findInTime(previewTile.id),
          onUnpin: () => commit((a) => A.unpinTiles(a, [previewTile.id]), [], true),
          onMove: onFile && projects?.length ? (pid) => fileTo([previewTile.id], pid) : undefined,
          onNewProject: onFile && onCreateProject && projects ? (name) => void newProjectWith([previewTile.id], name) : undefined,
          onFileHere: previewSuggested && onFile ? () => fileTo([previewTile.id], previewSuggested.projectId) : undefined,
          onUnsubject: arr.subjectOf[previewTile.id] ? () => commit((a) => A.setSubject(A.unpinTiles(a, [previewTile.id]), [previewTile.id], null), [], true) : undefined,
          onClose: () => setPreview(null),
        }}
      />
    ) : null;

  // ── the box that finds or starts, at the foot ──
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

  // ── the list column: every conversation, by subject ──
  const contentsEl = contents ? (
    <aside className="l5c" aria-label="Contents">
      <div className="l5c-head">
        <span className="l5c-k">Contents</span>
        <h2>Your Universal Map</h2>
        <p>
          {visible.length} {visible.length === 1 ? 'conversation' : 'conversations'}
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
        {shownHomes.list.map((h) => {
          const list = shown.filter((t) => homes.of.get(t.id)?.key === h.key && (!matchOf || matchOf(t.id))).sort((a, b) => b.at - a.at);
          if (!list.length) return null;
          return (
            <div key={h.key} className="l5c-group">
              <span className="l5c-k">{h.name}</span>
              {list.map((t) => (
                <button key={t.id} type="button" className={`l5c-item${t.id === activeId ? ' is-here' : ''}`} onClick={() => open(t)}>
                  <span className="l5c-t">{t.title}</span>
                  <span className="l5c-s">{kindLine(t)}</span>
                </button>
              ))}
            </div>
          );
        })}
        {!shown.some((t) => !matchOf || matchOf(t.id)) && <p className="l5c-none">{tiles.length ? 'Nothing matches.' : 'Nothing here yet — every conversation you have is listed here.'}</p>}
      </div>
      {onMind && (
        <button type="button" className="l5c-mind" onClick={onMind}>
          Mind Graph <span aria-hidden="true">→</span>
        </button>
      )}
    </aside>
  ) : null;

  // ── the page: its name, how much of it, and what goes with each ──
  const top = (insets?.top ?? (narrow ? TOP.narrow : TOP.wide)) + (narrow ? 4 : 8);
  const foot = insets?.foot ?? (narrow ? FOOT.narrow : FOOT.wide);
  const plural = (n: number) => `${n} ${n === 1 ? 'conversation' : 'conversations'}`;
  const stepWeek = (by: -1 | 1) => {
    setPreview(null);
    setSel([]);
    const next = weekStart(by < 0 ? weekFrom - 3 * DAY : weekFrom + 8 * DAY);
    setWeekAt(next >= weekStart(now) ? null : next);
  };
  const pickUp =
    resume || starredTiles.length ? (
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
    ) : null;
  /** under the page's name: which day, or which week (and the weeks either side), or how many */
  const subline =
    lens === 'today' ? (
      <div className="l5h-sub">
        <span className="l5h-sub-k">{todayPlan?.when === 'last' ? `Nothing yet today · last worked on ${dayName(todayPlan.day)}` : `Today · ${dayName(todayPlan?.day ?? dayStart(now))}`}</span>
        {pickUp}
      </div>
    ) : lens === 'week' ? (
      <div className="l5h-sub l5h-weektitle">
        <button type="button" className="l5h-wt-step" aria-label="The week before" onClick={() => stepWeek(-1)}>
          ‹
        </button>
        <span className="l5h-sub-k">
          {weekAt === null ? `This week · ${dayName(weekFrom)} – today` : `Week of ${shortDate(weekFrom)} · ${shortDate(weekFrom)} – ${shortDate(weekTo - DAY)}`} · {plural(scoped.length)}
        </span>
        <button type="button" className="l5h-wt-step" aria-label="The week after" disabled={weekAt === null} onClick={() => stepWeek(1)}>
          ›
        </button>
        {weekAt !== null && (
          <button type="button" className="l5h-btn" onClick={() => setWeekAt(null)}>
            Back to this week
          </button>
        )}
        {pickUp}
      </div>
    ) : (
      <div className="l5h-sub">
        <span className="l5h-sub-k">{lens === 'month' ? `This month · ${plural(scoped.length)}` : `All time · ${plural(scoped.length)} · oldest on the left`}</span>
        {pickUp}
      </div>
    );

  const isMap = !atlasOn && shown.length > 0;
  /** a map, not the line: what can be chosen several at once, linked, noted */
  const isSky = isMap && !inTime(lens);
  const selPinned = sel.some((id) => !!arr.pins[id]);

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
        <p>Every conversation you have appears here — a map of what you have learned, by day, by week and by subject.</p>
        <button type="button" className="l5h-go" onClick={() => onStart('')}>
          What are you working on? <span aria-hidden="true">→</span>
        </button>
      </div>
    );
  else if (!shown.length)
    body = (
      <div className="l5h-empty">
        <p>Nothing is shown with the map set this way.</p>
        <button type="button" className="l5h-btn" onClick={() => prefer((a) => A.setDisplay(A.setProjects(a, null), { chats: true }))}>
          Show everything
        </button>
      </div>
    );
  else if (inTime(lens))
    body = scoped.length ? (
      <TimeView
        key={lens}
        tiles={scoped}
        tileById={tileById}
        homes={homes}
        now={now}
        from={lens === 'month' ? monthStart(now) : null}
        narrow={narrow}
        activeId={activeId}
        selected={sel}
        starred={starredSet}
        matchOf={matchOf}
        focus={timeFocus}
        endKey={endKey}
        top={top}
        bottom={foot}
        acts={{
          onPreview: mapActs.onPreview,
          onOpen: openId,
          onSelect: (ids) => setSel(ids),
        }}
      />
    ) : (
      <div className="l5h-empty">
        <p>Nothing begun this month yet — the rest is all still here, in order.</p>
        <button type="button" className="l5h-btn" onClick={() => prefer((a) => A.setMode(a, 'all'))}>
          All time →
        </button>
      </div>
    );
  else if (lens === 'week' && !scoped.length)
    body = (
      <div className="l5h-empty">
        <p>{weekAt === null ? 'Nothing yet this week.' : 'Nothing was begun that week.'}</p>
        <button type="button" className="l5h-btn" onClick={() => prefer((a) => A.setMode(a, 'all'))}>
          All time →
        </button>
      </div>
    );
  else
    body = (
      <BubbleMap
        key={lens === 'week' ? `week:${weekFrom}` : 'today'}
        lens={lens === 'week' ? 'week' : 'today'}
        tiles={lens === 'week' ? scoped : shown}
        tileById={tileById}
        homes={shownHomes}
        ideas={ideas}
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
        top={top}
        bottom={foot}
        narrow={narrow}
        opened={opened}
        backOf={backOf}
        acts={mapActs}
      />
    );

  return (
    <section className={`l5h${narrow ? ' is-narrow' : ''}${contents ? ' has-contents' : ''}`} aria-label="Universal Map">
      {head?.(null, visible.length)}
      <div className="l5h-body">
        {contentsEl}
        <div className={`l5h-main lens-${lens}${inTime(lens) ? ' is-time' : ''}${isMap && !arr.seen.hint ? ' has-hint' : ''}`} ref={mainRef} style={{ ['--l5h-foot' as string]: `${foot}px` }}>
          {body}
          {hasTop && (
            <div className="l5h-top" ref={topRef}>
              <div className="l5h-title">
                <p className="l5h-kicker">Everything you’ve studied</p>
                <h1 className="l5h-h">
                  Your map, <em>not a list</em>
                </h1>
                {subline}
              </div>
              <div className="l5h-right">
                <LensSwitch lens={lens} narrow={narrow} onPick={pickLens} />
                <div className="l5h-tools" role="toolbar" aria-label="The map">
                  {isSky && (
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
                  {!narrow && homes.list.length > 1 && (
                    <button type="button" className={`l5h-tool l5h-viewbtn is-subjects${arr.projects ? ' is-on' : ''}`} aria-expanded={viewOpen} onClick={() => setViewOpen((v) => !v)} title="Which subjects are shown">
                      <span className="l5h-tool-l">{arr.projects ? `${arr.projects.length} of ${homes.list.length} subjects` : 'All subjects'} ▾</span>
                    </button>
                  )}
                  <button type="button" className={`l5h-tool l5h-viewbtn${viewOpen ? ' is-on' : ''}`} aria-expanded={viewOpen} onClick={() => setViewOpen((v) => !v)}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5v5M8 14.5v5" />
                    </svg>
                    <span className="l5h-tool-l">View</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="l5h-foot" ref={footRef}>
            {!narrow && hasTop && insets?.legend !== false && <Legend lens={lens} />}
            <div className="l5h-omni">{findEl}</div>
          </div>
          {viewOpen && (
            <ViewMenu
              arr={arr}
              lens={lens}
              groups={homes.list.map((h) => ({ key: h.key, name: h.name }))}
              hasChats={tiles.some((t) => t.kind === 'core')}
              hiddenCount={arr.hidden.filter((id) => tileById.has(id)).length}
              onDisplay={(patch) => prefer((a) => A.setDisplay(a, patch))}
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
                isMap && lens === 'week'
                  ? () => {
                      setViewOpen(false);
                      mapActs.onNote(center.current.x, center.current.y);
                    }
                  : undefined
              }
              onReset={() => {
                commit((a) => A.resetLayout(a), [], true);
                setOpened(new Set());
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
          {drawing && drawing.total > 0 && !linkFrom && (
            <p className="l5h-drawing" role="status" title="Your chats from Core are here now. Each one's map is being drawn from what was said in it — nothing of this month's allowance is spent.">
              <span className="l5h-drawing-dot" aria-hidden="true" />
              Drawing maps for your chats · {Math.min(drawing.done + 1, drawing.total)} of {drawing.total}
            </p>
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
              {HINT[lens]}
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

/**
 * How much of it: Today, This week, This month, All time — set in the
 * serif, the one chosen on a dark pill that slides to it.
 */
function LensSwitch({ lens, narrow, onPick }: { lens: A.HomeMode; narrow: boolean; onPick: (m: A.HomeMode) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const measure = useCallback(() => {
    const on = ref.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (on) setPill((p) => (p && p.x === on.offsetLeft && p.w === on.offsetWidth ? p : { x: on.offsetLeft, w: on.offsetWidth }));
  }, []);
  useBeforePaint(measure, [lens, narrow, measure]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // the serif arriving, or the room changing, moves the words under the pill
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    void (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.then(measure);
    return () => ro?.disconnect();
  }, [measure]);
  return (
    <div ref={ref} className={`l5h-lens${pill ? ' is-measured' : ''}`} role="radiogroup" aria-label="How much of it">
      {pill && <span className="l5h-lens-pill" aria-hidden="true" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />}
      {A.MODES.map((m) => (
        <button key={m} type="button" role="radio" aria-checked={lens === m} className={lens === m ? 'is-on' : ''} onClick={() => onPick(m)}>
          <span className="l5h-long">{LENS_SAID[m].long}</span>
          <span className="l5h-short">{LENS_SAID[m].short}</span>
        </button>
      ))}
    </div>
  );
}

/** What the marks mean: on the map, a session, a quick question, a link across subjects; on the line, what follows on. */
function Legend({ lens }: { lens: A.HomeMode }) {
  return (
    <ul className="l5h-legend" aria-label="What the marks mean">
      <li>
        <span className="l5h-lg-hub" aria-hidden="true" />
        Hub — a real study session
      </li>
      <li>
        <span className="l5h-lg-dot" aria-hidden="true" />
        Quick question
      </li>
      {inTime(lens) ? (
        <li>
          <span className="l5h-lg-line" aria-hidden="true" />
          Followed on within a week
        </li>
      ) : (
        <li>
          <span className="l5h-lg-link" aria-hidden="true" />
          Connects across courses
        </li>
      )}
    </ul>
  );
}
