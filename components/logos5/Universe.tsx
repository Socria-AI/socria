'use client';
// components/logos5/Universe.tsx — the Universal Map, Logos 5's home.
//
// Every past conversation, on ONE map. How much of it, chosen at the top right:
// Today, Week, Month or All Time (lib/logos5/scales.ts) — temporal scales of
// the same map, never four maps. The whole of it is laid out once, from every
// conversation (lib/logos5/bubbles.ts): each subject a circle, a real study
// session a disc in its colour, a quick question a dot on a spoke from its
// session, and what joins two subjects a dashed curve with a card that says
// why (nothing has to be filed for that, lib/logos5/subjects.ts reads what
// each is about). A scale only says which conversations are lit: a wider one
// lights more of the same universe, each subject's region growing round what
// came, and the camera glides out to take it in; nothing already there moves.
// Seen from far away the map draws the shape of what they know; close up,
// every word (lib/logos5/mapLod.ts). "Find on your map" (components/logos5/
// MapFind.tsx) finds a conversation from months ago — widening the scale if it
// has to — and goes there; Back returns. lib/logos5/arrange.ts keeps how the
// person arranged it. It is where Logos 5 opens, and where everything
// begins: one box at the foot finds, starts, or takes files to be sorted —
// dropped on it, or anywhere on the map. Pressing a conversation opens its
// card; pressing again, or Continue, opens it.
// Everything arranged can be undone. Each lens comes in drawn.
//
// Signed in, what Socria remembers is on the map too (Memory, a key among the
// tools, on until it is turned off): each memory beside the conversation it
// came from, read from the same private-filtered feed the Memory view reads
// (/api/mind?scope=logos, lib/logos5/memoryAtlas.ts mapMemoriesOf); a
// conversation's card says what it taught Socria, and a reading still waiting
// can be confirmed or corrected there, through the store's own route.
//
// The pieces: UniverseBubbles.tsx (the map), MapFind.tsx (finding, and the way
// back), UniverseParts.tsx (the card, the box, the menus).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { resumeOf, sharedIdeas, tileMatch, tilesOf, type ProjectIn, type Tile, type UniverseIn } from '@/lib/logos5/universe';
import { dayName, dayStart, homesOf } from '@/lib/logos5/spatial';
import { TODAY_EMPTY } from '@/lib/logos5/views';
import { covers, idsInScale, scaleCounts, scaleFrom, scaleOf, widerWithMore, SCALE_SAID, SCALES } from '@/lib/logos5/scales';
import { recentOf, searchMap, type MapFound } from '@/lib/logos5/mapSearch';
import { OTHER } from '@/lib/logos5/subjects';
import * as A from '@/lib/logos5/arrange';
import { mapMemoriesOf, mapProvenance, type MemoryIn, type ProvIn } from '@/lib/logos5/memoryAtlas';
import { logosPersistPolicy } from '@/lib/mind/logos-turn';
import { useArrangement } from './useArrangement';
import { BubbleMap, type BubbleActs, type MapMemoryLayer, type MapNav } from './UniverseBubbles';
import { BackPill, MapFind } from './MapFind';
import type { Attachment } from '@/lib/logos-attachments';
import type { Intent } from '@/lib/logos5/study';
import { ActionBar, FindOrStart, Glyph, HiddenTray, PreviewCard, StarMark, StartDisc, ViewMenu, kindLine, shortDate, type Found, type Taught } from './UniverseParts';
import { START_R } from '@/lib/logos5/bubbles';
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** what the page's own words and the box at the foot cover of the map, wide and on a phone */
const TOP = { wide: 150, narrow: 140 } as const;
const FOOT = { wide: 92, narrow: 78 } as const;

/** Something another person shared with this one (/api/shared): a Project or a conversation, and whose it is. */
export interface SharedIn {
  type: string;
  id: string;
  /** a conversation's surface: 'logos' for a line of thinking */
  kind?: string;
  title: string;
  owner?: string;
}

export function UniverseView({
  conversations,
  projects,
  activeId,
  signedIn = false,
  narrow = false,
  head,
  onOpen,
  onOpenIdea,
  onOpenChat,
  onStart,
  onNew,
  onFile,
  onCreateProject,
  onUpdateProject,
  onRename,
  onDelete,
  onMind,
  contents = false,
  shared,
  onOpenShared,
  onJoinCode,
  atlas,
  drawing = null,
  readDocument,
  readImage,
  picker,
  voice = false,
  voiceButton,
  voiceLive = false,
  startWith = null,
  startIn = null,
  working = null,
  notice = null,
  initial,
  now: nowGiven,
  memory: memoryGiven,
}: {
  conversations: readonly UniverseIn[];
  /** the person's Projects; undefined when there are none to have (signed out, or not loaded) */
  projects?: readonly ProjectIn[];
  activeId: string | null;
  signedIn?: boolean;
  narrow?: boolean;
  /** the screen's header, given what goes in its middle (nothing: the box that finds or starts is at the map's foot) and how many conversations are on the map */
  head?: (center: ReactNode, count: number) => ReactNode;
  /** open a line of thinking — and the door it was opened by (Logos 6) */
  onOpen: (id: string, door?: 'disc' | 'pinch' | 'double' | 'enter' | 'search' | 'pickup' | 'waiting') => void;
  /** open one idea of a line of thinking, from its card on the map (Logos 6: the macro-to-micro way down) */
  onOpenIdea?: (id: string, node: string) => void;
  /** open a Core chat */
  onOpenChat?: (id: string) => void;
  /** begin a new line of thinking — with these words as its first question; with files, sorted into topics first */
  onStart: (text: string, files?: { atts: Attachment[]; goal: Intent }) => void;
  /**
   * Begin a new, empty line of thinking and open it — the big + at the map's foot, which stands where the box
   * that found or started used to. Given, the + replaces the box (the box comes back only to carry an opening
   * that was handed to it, \`startWith\`); the new line opens on ideas to explore, its chatbox ready.
   */
  onNew?: () => void;
  /** file a conversation in a Project, or take it out of one (null) */
  onFile?: (id: string, kind: 'logos' | 'core', projectId: string | null) => void;
  /** make a Project; its id, or null if it could not be made */
  onCreateProject?: (name: string) => Promise<string | null>;
  /** rename a Project or give it a colour; what went wrong, or null */
  onUpdateProject?: (id: string, patch: { name?: string; color?: string | null }) => Promise<string | null>;
  /** a new name for a line of thinking */
  onRename?: (id: string, title: string) => void;
  /** a line of thinking deleted, with everything in it */
  onDelete?: (id: string) => void;
  /** Memory (the Mind Graph, drawn), for a signed-in person */
  onMind?: () => void;
  /** the contents column: every conversation, by subject */
  contents?: boolean;
  /** what others have shared with them, listed under their own in the contents column; undefined signed out */
  shared?: readonly SharedIn[];
  onOpenShared?: (item: SharedIn) => void;
  /** open something shared by its eight-character code */
  onJoinCode?: () => void;
  /** the Mind Atlas, for a signed-in person */
  atlas?: ReactNode;
  /** the Core chats brought in having their maps drawn: how many of how many, while it lasts */
  drawing?: { done: number; total: number } | null;
  /** files can be put in the box: each read in the browser before it is sent */
  readDocument?: (file: File) => Promise<Attachment>;
  /** a picture read as a picture: shrunk, shown, described */
  readImage?: (dataUrl: string) => Promise<string>;
  /** the model and how far it goes, in the box */
  picker?: ReactNode;
  /** the hold-to-talk mic in the box: words spoken land in it to edit, never sent by themselves */
  voice?: boolean;
  /** Socria Voice's button (components/logos5/SocriaVoice.tsx), in the box */
  voiceButton?: ReactNode;
  /** Socria Voice is listening: the hold-to-talk mic steps aside */
  voiceLive?: boolean;
  /** words to begin with, put in the box (an opening chosen elsewhere) */
  startWith?: string | null;
  /** the Project a new line of thinking will be begun in, by name */
  startIn?: string | null;
  /** what is under way after the box was sent — "Sorting your files into topics…" */
  working?: string | null;
  /** something to say about what was begun (it could not be done) */
  notice?: string | null;
  /** start from this arrangement (a test; otherwise it is read from where it is kept) */
  initial?: A.Arrangement;
  /** the time to read "recent" and "today" against (a test; otherwise now) */
  now?: number;
  /** what Socria remembers (a test; otherwise read from /api/mind?scope=logos, signed in) */
  memory?: readonly MemoryIn[];
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
  // only what decides a subject (the person's own choices and order): a change of scale, sort or display keeps the
  // same homes, so the map's placement (components/logos5/UniverseBubbles.tsx bubblePlaces) is not worked out again
  const placing = useMemo(() => ({ subjectOf: arr.subjectOf, groupOrder: arr.groupOrder }), [arr.subjectOf, arr.groupOrder]);
  const homes = useMemo(() => homesOf(visible, projects, placing), [visible, projects, placing]);
  /** where every conversation would be, hidden ones too: for naming what a search finds */
  const allHomes = useMemo(() => homesOf(tiles, projects, placing), [tiles, projects, placing]);
  const only = useMemo(() => (arr.projects ? new Set(arr.projects) : null), [arr.projects]);
  const shown = useMemo(() => (only ? visible.filter((t) => only.has(homes.of.get(t.id)?.key ?? OTHER)) : visible), [visible, only, homes]);
  const shownHomes = useMemo(() => (only ? { ...homes, list: homes.list.filter((h) => only.has(h.key)) } : homes), [homes, only]);
  // ── HOW MUCH OF IT (lib/logos5/scales.ts): Today, Week, Month, All Time — one map, more or less of it lit.
  // By activity in their own time zone; each scale contains the narrower ones. An empty Today is said as one
  // (no last-day fallback, no ring of older conversations), and a wider scale is never made to look larger
  // than what it holds. ──
  const counts = useMemo(() => scaleCounts(shown, now), [shown, now]);
  const lit = useMemo(() => idsInScale(shown, lens, now), [shown, lens, now]);
  const scoped = useMemo(() => shown.filter((t) => lit.has(t.id)), [shown, lit]);
  // the ideas two subjects share, read across the whole map: what joins them never depends on the scale
  const ideas = useMemo(() => sharedIdeas(shown), [shown]);
  /** the folded subjects and Projects opened on the map (kept from one scale to the next) */
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  /** the camera, moved from here: what was found, and the way back (components/logos5/UniverseBubbles.tsx MapNav) */
  const navRef = useRef<MapNav | null>(null);
  const [canBack, setCanBack] = useState(false);
  const homeByKey = useMemo(() => new Map(homes.list.map((h) => [h.key, h])), [homes]);

  const [query, setQuery] = useState('');
  // THE MAP'S OWN SEARCH, BACK (Logos 6): since the + moved into the map the box at its foot was never mounted, so
  // "/", dimming what does not match and dropping files on the map did nothing. "/" brings the box back; it goes
  // again when it is emptied and left — the + stays where it was put.
  const [findOpen, setFindOpen] = useState(false);
  /** FIND ON YOUR MAP (components/logos5/MapFind.tsx): open, and its words — its own, apart from the box at the foot */
  const [mapOpen, setMapOpen] = useState(false);
  /** whether the map is drawn now: where / goes (read by the key handler, set as the page is drawn) */
  const mapShown = useRef(false);
  const [mapQuery, setMapQuery] = useState('');
  // what the map is narrowed to: the header's words, or Find on your map's while it is open (a jump closes the panel and
  // keeps its words for /, but the map is then whole again)
  const q = (query || (mapOpen ? mapQuery : '')).trim();
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
  // what Find on your map finds — over what is on the map at All Time, so nothing it finds has nowhere to be shown
  const subjectOf = useCallback((id: string) => {
    const h = homes.of.get(id);
    return h ? { key: h.key, name: h.name } : null;
  }, [homes]);
  const mapFound = useMemo(() => (mapOpen && mapQuery.trim() ? searchMap({ tiles: shown, subjectOf, now, scale: lens }, mapQuery) : []), [mapOpen, mapQuery, shown, subjectOf, now, lens]);
  const mapRecent = useMemo(
    () => (mapOpen ? recentOf(shown, narrow ? 6 : 8).map((t) => ({ id: t.id, title: t.title, at: Math.max(t.at, t.started), where: subjectOf(t.id)?.name ?? null, scale: scaleOf(t, now), inView: lit.has(t.id), ...(t.kind === 'core' ? { chat: true } : {}) })) : []),
    [mapOpen, shown, narrow, subjectOf, now, lit]
  );

  // ── what Socria remembers: signed in only, and only what the private-filtered feed holds ──
  const [memNodes, setMemNodes] = useState<readonly MemoryIn[] | null>(memoryGiven ?? null);
  const readMemory = useCallback(async () => {
    if (!signedIn || memoryGiven) return;
    try {
      const r = await fetch('/api/mind?scope=logos', { cache: 'no-store' });
      const j = r.ok ? await r.json().catch(() => null) : null;
      // a store that cannot be read is no memory to show, and no key for it
      if (!j || j.storage?.ok === false || !Array.isArray(j.nodes)) return;
      setMemNodes(j.nodes as MemoryIn[]);
    } catch {
      /* the map is the same without it */
    }
  }, [signedIn, memoryGiven]);
  useEffect(() => {
    // signed out (again), nothing of it stays on the map
    if (!signedIn && !memoryGiven) setMemNodes(null);
    void readMemory();
  }, [readMemory, signedIn, memoryGiven]);
  /**
   * The conversations that contribute nothing, whatever a memory's record
   * says: off the record, or read as sensitive — by the rule the chat itself
   * keeps (lib/mind/logos-turn.ts), folded over everything they said in it.
   * Read only for the conversations a memory names.
   */
  const quiet = useMemo(() => {
    const out = new Set<string>();
    if (!memNodes) return out;
    const named = new Set<string>();
    for (const n of memNodes) for (const g of (n.provenance ?? []) as ProvIn[]) if (g.conversationId) named.add(g.conversationId);
    for (const c of conversations) {
      if (!named.has(c.id)) continue;
      const said = (c.messages ?? []).filter((m) => m.role === 'user' && typeof m.content === 'string').map((m) => m.content as string);
      if (said.length && logosPersistPolicy(said) !== 'full') out.add(c.id);
    }
    return out;
  }, [memNodes, conversations]);
  const memories = useMemo(() => (memNodes ? mapMemoriesOf(memNodes, now, { quiet }) : []), [memNodes, now, quiet]);
  /** Memory is on: signed in, a memory to read, and the person has not turned it off */
  const memOn = !!memNodes && arr.display.memory;
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
  /** the box's hands for files dropped anywhere on the map */
  const takeRef = useRef<((files: File[]) => void) | null>(null);
  const [dropping, setDropping] = useState(false);
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
  const [insets, setInsets] = useState<{ top: number; foot: number } | null>(null);
  const hasTop = tiles.length > 0 && !atlasOn;
  useBeforePaint(() => {
    const measure = () => {
      const t = topRef.current?.getBoundingClientRect().height ?? 0;
      const f = footRef.current?.getBoundingClientRect();
      if (!f?.height) return;
      const next = { top: Math.ceil(t), foot: Math.ceil(f.height) };
      setInsets((cur) => (cur && cur.top === next.top && cur.foot === next.foot ? cur : next));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (topRef.current) ro?.observe(topRef.current);
    if (footRef.current) ro?.observe(footRef.current);
    return () => ro?.disconnect();
  }, [narrow, hasTop, lens]);

  /** the big + is drawn in the map (each lens its own place for it), unless an opening is being carried in the box */
  const startable = !!onNew && !startWith;
  // N, anywhere on the map that is not a field, starts something new — the +'s key
  useEffect(() => {
    if (!onNew || startWith) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') || t.isContentEditable)) return;
      e.preventDefault();
      onNew();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNew, startWith]);

  useEffect(() => {
    if (!said) return;
    const t = setTimeout(() => setSaid(null), 4200);
    return () => clearTimeout(t);
  }, [said]);
  // an opening chosen elsewhere: in the box, to be made the person's own before it is sent
  useEffect(() => {
    if (!startWith) return;
    setQuery(startWith);
    requestAnimationFrame(() => findRef.current?.focus());
  }, [startWith]);
  useEffect(() => {
    if (notice) setSaid(notice);
  }, [notice]);
  // (a folded subject opened stays open from one scale to the next: the map keeps its shape, and nothing moves)

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
    (t: Tile, door?: 'disc' | 'pinch' | 'double' | 'enter' | 'search' | 'pickup' | 'waiting') => {
      setPreview(null);
      if (t.kind === 'core') onOpenChat?.(t.id);
      else onOpen(t.id, door);
    },
    [onOpen, onOpenChat]
  );
  const openId = (id: string, door?: 'disc' | 'pinch' | 'double' | 'enter' | 'search' | 'pickup' | 'waiting') => {
    const t = tileById.get(id);
    if (t) open(t, door);
  };

  // ── the lenses ──
  const pickLens = (m: A.HomeMode) => {
    setPreview(null);
    // pressed again: the whole of what it shows, in view
    if (m === lens) return navRef.current ? navRef.current.fit() : setFitKey((k) => k + 1);
    prefer((a) => A.setMode(a, m));
  };
  /**
   * GO TO WHAT WAS FOUND: the map widened first, to the narrowest scale that shows it, when the scale it is at
   * does not — then the camera glides there and lights it (a conversation's card opens). Nothing is found that
   * the map then refuses to show.
   */
  const goTo = (f: Pick<MapFound, 'kind' | 'id' | 'ids' | 'scale' | 'inView'>) => {
    setPreview(null);
    setFindOpen(false);
    setQuery('');
    // the panel closes so the map and the preview have the room; its words are kept, so / brings the same results back
    setMapOpen(false);
    // where the camera is now is where Back returns to, whatever a wider scale does to it first
    navRef.current?.mark();
    if (!covers(lens, f.scale)) prefer((a) => A.setMode(a, f.scale));
    requestAnimationFrame(() => (f.kind === 'conversation' ? navRef.current?.focus(f.id) : navRef.current?.focusMany(f.ids)));
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
    onStart: startable ? onNew : undefined,
    onRefile: refile,
    onFold: (key, folded) => commit((a) => A.setFrame(a, key, { collapsed: folded }), [], true),
    onNewProject:
      onCreateProject && projects
        ? (name, ids) => {
            if (ids.length && onFile) return void newProjectWith(ids, name);
            void onCreateProject(name).then((pid) => setSaid(pid ? `“${name}” made — drag conversations into it.` : 'That Project could not be made.'));
          }
        : undefined,
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
      if ((e.key === '/' && !e.metaKey && !e.ctrlKey) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        // on the map, Find on your map; with no map drawn (nothing yet, the atlas open), the box at the foot as before
        if (mapShown.current) setMapOpen(true);
        else {
          setFindOpen(true);
          requestAnimationFrame(() => findRef.current?.focus());
        }
      } else if (e.key === 'Backspace' && canBack && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        navRef.current?.back();
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
  }, [linkFrom, preview, sel.length, selectMode, undo, redo, canBack]);

  // a conversation gone from the map is no longer chosen
  useEffect(() => {
    setSel((cur) => (cur.every((id) => tileById.has(id) && !hidden.has(id)) ? cur : cur.filter((id) => tileById.has(id) && !hidden.has(id))));
  }, [tileById, hidden]);

  // ── what Socria remembers, changed: the store's own route, shown at once and then read again ──
  const memNodesRef = useRef(memNodes);
  memNodesRef.current = memNodes;
  const writeMemory = useCallback(
    async (id: string, method: 'PATCH' | 'DELETE', body: Record<string, unknown>, local: (n: MemoryIn) => MemoryIn | null, done: string) => {
      const before = memNodesRef.current;
      if (!before) return;
      setMemNodes(before.flatMap((n) => (n.id !== id ? [n] : local(n) ?? [])));
      try {
        const r = await fetch('/api/mind/node', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) });
        const j = await r.json().catch(() => null);
        if (!r.ok || j?.ok === false) throw new Error('not saved');
        setSaid(done);
        void readMemory();
      } catch {
        setMemNodes(before);
        setSaid('That could not be saved just now.');
      }
    },
    [readMemory]
  );
  const mine = (kind: string, note: string, review?: string): ProvIn => ({ kind, surface: 'user', at: Date.now(), note, ...(review ? { review } : {}) });
  /** "That's right": held as theirs, never reworded again (lib/mind/apply.ts confirmNode) */
  const confirmMemory = (id: string) =>
    void writeMemory(id, 'PATCH', { confirm: true }, (n) => ({ ...n, status: n.status === 'tentative' || n.status === 'uncertain' ? 'active' : n.status, provenance: [...(n.provenance ?? []), mine('stated', 'confirmed by you', 'confirmed')] }), 'Confirmed — Socria holds it as yours, and won’t reword it.');
  /** "Not quite", or Edit: their words, kept as theirs from then on (PATCH, recorded as edited by hand) */
  const correctMemory = (id: string, text: string) =>
    void writeMemory(id, 'PATCH', { label: text.slice(0, 80) }, (n) => ({ ...n, label: text.slice(0, 80), provenance: [...(n.provenance ?? []), mine('stated', 'edited by hand')] }), 'Kept in your words — Socria won’t reword it.');
  const forgetMemory = (id: string) => void writeMemory(id, 'DELETE', {}, () => null, 'Forgotten — Socria won’t learn it again.');
  // the layer the map draws: only with Memory on, and only what came from a conversation
  const memLayer = useMemo<MapMemoryLayer | null>(
    () => (memOn && memories.length ? { list: memories, onEdit: correctMemory, onForget: forgetMemory } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memOn, memories, writeMemory]
  );

  // ── the card beside a pressed conversation ──
  const previewTile = preview ? tileById.get(preview.id) ?? null : null;
  /** what a conversation taught Socria, for its card: nothing from one off the record (its memories name it nowhere) */
  const taughtBy = (id: string): Taught | undefined => {
    const list = memories.filter((m) => m.from.includes(id));
    if (!list.length) return undefined;
    return {
      list: list.map((m) => ({ id: m.id, text: m.text, source: m.source, waiting: m.waiting, confirmed: m.confirmed, said: mapProvenance(m, id, (x) => tileById.get(x)?.title ?? null) })),
      onConfirm: confirmMemory,
      onCorrect: correctMemory,
      onMore: onMind,
    };
  };
  const previewTaught = previewTile && memOn ? taughtBy(previewTile.id) : undefined;
  const pvStyle = (() => {
    if (!preview?.at || narrow || !mainRef.current) return undefined;
    const box = mainRef.current.getBoundingClientRect();
    const W = 344;
    const a = preview.at;
    const right = a.right + 12 + W <= box.right - 8;
    const left = right ? a.right - box.left + 12 : Math.max(8, a.left - box.left - W - 12);
    // what it taught Socria makes the card taller: raised by about that much, and never past the foot of the screen (it scrolls)
    const taughtH = previewTaught ? 52 + Math.min(previewTaught.list.length, 5) * 58 + previewTaught.list.slice(0, 5).filter((m) => m.waiting).length * 40 : 0;
    const top = Math.max(64, Math.min(a.top - box.top, box.height - 440 - taughtH));
    return previewTaught ? { left, top, width: W, maxHeight: box.height - top - 16 } : { left, top, width: W };
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
        taught={previewTaught}
        acts={{
          onOpen: () => open(previewTile, 'disc'),
          // an idea chip pressed: that idea, opened in its conversation (Logos 6)
          onIdea: onOpenIdea && previewTile.kind === 'logos' ? (node) => {
            setPreview(null);
            onOpenIdea(previewTile.id, node);
          } : undefined,
          onStar: () => commit((a) => A.setIn(a, 'starred', [previewTile.id], !starredSet.has(previewTile.id))),
          onHide: () => {
            commit((a) => A.setIn(a, 'hidden', [previewTile.id], true));
            setPreview(null);
            setSaid(`“${previewTile.title}” is hidden — View, then Hidden, brings it back.`);
          },
          onLink: () => {
            setLinkFrom(previewTile.id);
            setPreview(null);
          },
          onUnpin: () => commit((a) => A.unpinTiles(a, [previewTile.id]), [], true),
          onMove: onFile && projects?.length ? (pid) => fileTo([previewTile.id], pid) : undefined,
          onNewProject: onFile && onCreateProject && projects ? (name) => void newProjectWith([previewTile.id], name) : undefined,
          onFileHere: previewSuggested && onFile ? () => fileTo([previewTile.id], previewSuggested.projectId) : undefined,
          onUnsubject: arr.subjectOf[previewTile.id] ? () => commit((a) => A.setSubject(A.unpinTiles(a, [previewTile.id]), [previewTile.id], null), [], true) : undefined,
          // a line of thinking is renamed and deleted here, where it lives on the map (a Core chat, in Core)
          onRename: onRename && previewTile.kind === 'logos' ? (title) => onRename(previewTile.id, title) : undefined,
          onDelete:
            onDelete && previewTile.kind === 'logos'
              ? () => {
                  onDelete(previewTile.id);
                  setPreview(null);
                  setSaid(`“${previewTile.title}” is deleted.`);
                }
              : undefined,
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
      readDocument={readDocument}
      readImage={readImage}
      picker={picker}
      voice={voice}
      voiceButton={voiceButton}
      voiceLive={voiceLive}
      placeholder={startIn ? `Search, or start something new in “${startIn}”…` : undefined}
      takeRef={takeRef}
      onPick={(t) => {
        setQuery('');
        open(t);
      }}
      onStart={(text) => {
        setQuery('');
        onStart(text);
      }}
      onStartFiles={(text, atts, goal) => {
        setQuery('');
        onStart(text, { atts, goal });
      }}
    />
  );

  // ── the list column: every conversation, by subject ──
  const contentsEl = contents ? (
    <aside className="l5c" aria-label="Sessions">
      <div className="l5c-head">
        <span className="l5c-k">Sessions</span>
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
        {/* SHARED WITH YOU — Projects and conversations others opened to them,
            below their own: their own work comes first. Not searched: the
            search finds what is on their map. */}
        {shared && !q && (
          <div className="l5c-group l5c-shared" role="group" aria-label="Shared with you">
            <span className="l5c-k">Shared with you</span>
            {shared.map((it) => (
              <button
                key={`sh-${it.type}-${it.id}`}
                type="button"
                className="l5c-item"
                onClick={() => onOpenShared?.(it)}
                title={`${it.title || 'Untitled'}${it.owner ? ` — shared by ${it.owner}` : ''}`}
              >
                <span className="l5c-t">{it.title || 'Untitled'}</span>
                <span className="l5c-s">
                  {it.type === 'project' ? 'Project' : 'Conversation'}
                  {it.owner ? ` · shared by ${it.owner}` : ''}
                </span>
              </button>
            ))}
            {!shared.length && <p className="l5c-none">When someone shares with you, it appears here.</p>}
            {onJoinCode && (
              <button type="button" className="l5c-join" onClick={onJoinCode} title="Open something shared with you by its code">
                Join with a code <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        )}
      </div>
      {onMind && (
        <button type="button" className="l5c-mind" onClick={onMind}>
          Memory <span aria-hidden="true">→</span>
        </button>
      )}
    </aside>
  ) : null;

  // ── the page: its name, how much of it, and what goes with each ──
  const top = (insets?.top ?? (narrow ? TOP.narrow : TOP.wide)) + (narrow ? 4 : 8);
  const foot = insets?.foot ?? (narrow ? FOOT.narrow : FOOT.wide);
  const plural = (n: number) => `${n} ${n === 1 ? 'conversation' : 'conversations'}`;
  // the questions Socria asked and is still waiting on: the way back in is an answer
  const asked = tiles.filter((t) => t.open && !hidden.has(t.id)).sort((a, b) => b.at - a.at);
  const pickUp =
    resume || starredTiles.length || asked.length ? (
      <div className="l5h-strip" aria-label="Pick up, and starred">
        {resume && (
          <button type="button" className="l5h-pick" onClick={() => open(resume)} title={`Pick up where you left off: ${resume.title}`} aria-label={`Pick up where you left off: ${resume.title}`}>
            <Glyph look={resume.look} size={13} />
            {/* the long words where there is room, "Pick up" where there is less, none where there is little (revision2.css) */}
            <span className="l5h-pick-k">Pick up where you left off</span>
            <span className="l5h-pick-ks">Pick up</span>
            <span className="l5h-pick-t">{resume.title}</span>
            <span aria-hidden="true">→</span>
          </button>
        )}
        {asked.length > 0 && (
          <button
            type="button"
            className="l5h-waiting"
            onClick={() => open(asked[0])}
            title={`Socria asked: ${asked[0].open}`}
            aria-label={`${asked.length} ${asked.length === 1 ? 'question' : 'questions'} waiting for your answer. Answer the newest: ${asked[0].open}`}
          >
            <span className="l5-badge" aria-hidden="true">
              {asked.length}
            </span>
            {/* the long words where there is room, the short ones where there is not (revision2.css) — never wrapped */}
            <span className="l5h-w-long">{asked.length === 1 ? 'question waiting for your answer' : 'questions waiting for your answer'}</span>
            <span className="l5h-w-short">{asked.length === 1 ? 'question waiting' : 'questions waiting'}</span>
            <span className="l5-ar" aria-hidden="true">
              →
            </span>
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
  const oldest = useMemo(() => shown.reduce((m, t) => Math.min(m, t.started || t.at), Infinity), [shown]);
  const scaleWords =
    lens === 'today'
      ? `Today · ${dayName(dayStart(now))}`
      : lens === 'week'
        ? `Week · ${dayName(scaleFrom('week', now))} – today`
        : lens === 'month'
          ? `Month · since ${shortDate(scaleFrom('month', now))}`
          : `All Time${Number.isFinite(oldest) ? ` · since ${MONTHS[new Date(oldest).getMonth()]} ${new Date(oldest).getFullYear()}` : ''}`;
  const subline = (
    <div className="l5h-sub">
      <span className="l5h-sub-k">
        {scaleWords} · {plural(scoped.length)}
      </span>
      {pickUp}
    </div>
  );

  const isMap = !atlasOn && shown.length > 0;
  mapShown.current = isMap;
  /** a map (always, now): what can be chosen several at once, linked, noted */
  const isSky = isMap;
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
        {onNew ? (
          // THE FIRST THING TO DO, MADE OBVIOUS (a guest or a new account, nothing yet): one large plus, said in plain
          // words under it — the whole of it one button, easy to find and to press on any screen
          <>
            <button type="button" className="l5h-start" onClick={onNew} aria-label="Start a new line of thinking">
              <span className="l5h-start-plus" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <span className="l5h-start-t">Start a new line of thinking</span>
              <span className="l5h-start-s">Click here to start a conversation</span>
            </button>
            <p className="l5h-start-about">Every conversation you have appears here — a map of your thinking, by day, by week and by subject.</p>
          </>
        ) : (
          <>
            <p>Every conversation you have appears here — a map of your thinking, by day, by week and by subject.</p>
            <button type="button" className="l5h-go" onClick={() => findRef.current?.focus()}>
              Ask anything, or drop your files in the box below <span aria-hidden="true">↓</span>
            </button>
          </>
        )}
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
  else if (!scoped.length) {
    // nothing at this scale: said as it is, with the way to the narrowest wider scale that holds something
    const wider = widerWithMore(lens, counts);
    body = (
      <div className={`l5h-empty${lens === 'today' ? ' is-today' : ''}`}>
        {startable && onNew && <EmptyStart onStart={onNew} narrow={narrow} bare={lens === 'today'} />}
        {lens === 'today' ? (
          <button type="button" className="l5h-todaynode" onClick={() => (onNew ? onNew() : findRef.current?.focus())}>
            <span className="l5h-todaynode-dot" aria-hidden="true" />
            {TODAY_EMPTY}
          </button>
        ) : (
          <p>{lens === 'week' ? 'Nothing in the last seven days.' : 'Nothing in the last thirty days.'}</p>
        )}
        {wider && (
          <button type="button" className="l5h-btn" onClick={() => prefer((a) => A.setMode(a, wider))}>
            {SCALE_SAID[wider].long} · {plural(counts[wider])} →
          </button>
        )}
      </div>
    );
  } else
    body = (
      <BubbleMap
        scale={lens}
        visible={lit}
        navRef={navRef}
        onNav={(s) => setCanBack(s.canBack)}
        tiles={shown}
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
        all={shown}
        opened={opened}
        memory={memLayer}
        acts={mapActs}
      />
    );
  /** readings still waiting for the person, among what this map draws */
  const drawn = scoped;
  const waiting = memOn ? memories.filter((m) => m.waiting && m.from.some((id) => drawn.some((t) => t.id === id))).length : 0;

  return (
    <section className={`l5h${narrow ? ' is-narrow' : ''}${contents ? ' has-contents' : ''}`} aria-label="Universal Map">
      {head?.(null, visible.length)}
      <div className="l5h-body">
        {contentsEl}
        <div
          className={`l5h-main lens-${lens}${dropping ? ' is-dropping' : ''}`}
          ref={mainRef}
          style={{ ['--l5h-foot' as string]: `${foot}px` }}
          onDragEnter={(e) => {
            // files brought to the map: the box that takes them comes back to take them (Logos 6)
            if (!takeRef.current && e.dataTransfer?.types?.includes('Files')) setFindOpen(true);
            if (takeRef.current && e.dataTransfer?.types?.includes('Files')) (e.preventDefault(), setDropping(true));
          }}
          onDragOver={(e) => takeRef.current && e.dataTransfer?.types?.includes('Files') && e.preventDefault()}
          onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setDropping(false)}
          onDrop={(e) => {
            setDropping(false);
            if (!takeRef.current || !e.dataTransfer?.files?.length) return;
            e.preventDefault();
            takeRef.current(Array.from(e.dataTransfer.files));
          }}
        >
          {body}
          {hasTop && (
            <div className="l5h-top" ref={topRef}>
              <div className="l5h-title">{subline}</div>
              <div className="l5h-right">
                {isMap && (
                  <div className={`l5h-findmap${mapOpen ? ' is-open' : ''}`}>
                    <MapFind
                      open={mapOpen}
                      onOpenChange={(o) => {
                        setMapOpen(o);
                        if (!o) setMapQuery('');
                      }}
                      query={mapQuery}
                      onQuery={setMapQuery}
                      results={mapFound}
                      recent={mapRecent}
                      scale={lens}
                      now={now}
                      narrow={narrow}
                      onGo={goTo}
                      onOpenChat={(id) => {
                        setMapOpen(false);
                        setMapQuery('');
                        openId(id, 'search');
                      }}
                    />
                  </div>
                )}
                <LensSwitch lens={lens} narrow={narrow} counts={counts} onPick={pickLens} />
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
                  {/* Memory: what Socria remembers, on the map — signed in, with a memory to read; kept with the arrangement, not undone */}
                  {memNodes && isSky && (
                    <button
                      type="button"
                      className={`l5h-tool is-mem${arr.display.memory ? ' is-on' : ''}`}
                      aria-pressed={arr.display.memory}
                      aria-label={`Memory — what Socria remembers, on the map${waiting ? `; ${waiting} waiting for you` : ''}`}
                      onClick={() => prefer((a) => A.setDisplay(a, { memory: !a.display.memory }))}
                      title="What Socria remembers, on the map"
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12.5" r="3.2" />
                        <path d="M12 9.3V4.5M9.3 14.2l-4.2 2.8M14.7 14.2l4.2 2.8" />
                      </svg>
                      <span className="l5h-tool-l">Memory</span>
                      {waiting > 0 && (
                        <span className="l5h-mem-n" aria-hidden="true">
                          {waiting}
                        </span>
                      )}
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
            {/* what the new mark means, beside the box while Memory is on and there is room */}
            {memOn && isSky && !narrow && !contents && (
              <ul className="l5h-legend" aria-label="What the marks mean">
                <li>
                  <span className="l5h-lg-mem" aria-hidden="true" />
                  what Socria remembers
                </li>
              </ul>
            )}
            {/* the + is in the map itself now (StartDisc); the box comes back only to carry an opening */}
            {(!startable || findOpen || !!query) && (
              <div
                className="l5h-omni"
                onBlur={(e) => {
                  if (!query && !e.currentTarget.contains(e.relatedTarget as Node | null)) setFindOpen(false);
                }}
              >
                {findEl}
              </div>
            )}
          </div>
          {viewOpen && (
            <ViewMenu
              arr={arr}
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
          {canBack && isMap && (
            <div className="l5h-backwrap" style={{ bottom: foot + 14 }}>
              <BackPill onBack={() => navRef.current?.back()} />
            </div>
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
          {dropping && (
            <div className="l5h-dropzone" aria-hidden="true">
              <span>Drop your files — notes, documents, slides, PDFs — and Socria sorts them into topics</span>
            </div>
          )}
          {working && (
            <p className="l5h-drawing is-working" role="status">
              <span className="l5h-drawing-dot" aria-hidden="true" />
              {working}
            </p>
          )}
          {drawing && drawing.total > 0 && !linkFrom && !working && (
            <p className="l5h-drawing" role="status" title="Your earlier chats are here now. Each one's map is being drawn from what was said in it — nothing of this month's allowance is spent.">
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
function LensSwitch({ lens, narrow, counts, onPick }: { lens: A.HomeMode; narrow: boolean; counts?: Record<A.HomeMode, number>; onPick: (m: A.HomeMode) => void }) {
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
    <div ref={ref} className={`l5h-lens${pill ? ' is-measured' : ''}`} role="radiogroup" aria-label="How much of your map: Today, Week, Month or All Time">
      {pill && <span className="l5h-lens-pill" aria-hidden="true" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />}
      {SCALES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={lens === m}
          className={lens === m ? 'is-on' : ''}
          onClick={() => onPick(m)}
          title={counts ? `${SCALE_SAID[m].long}: ${counts[m] === 1 ? 'one conversation' : `${counts[m]} conversations`}` : undefined}
        >
          <span className="l5h-long">{SCALE_SAID[m].long}</span>
          <span className="l5h-short">{SCALE_SAID[m].short}</span>
        </button>
      ))}
    </div>
  );
}

/** The big + where a lens has nothing to draw yet: the same disc, standing in the middle over the words. */
function EmptyStart({ onStart, narrow, bare = false }: { onStart: () => void; narrow: boolean; bare?: boolean }) {
  const r = narrow ? START_R.narrow : START_R.wide;
  return (
    <span className={`l5h-emptyplus${bare ? ' is-bare' : ''}`} style={{ width: 2 * r, height: 2 * r }}>
      <StartDisc x={r} y={r} r={r} onStart={onStart} bare={bare} />
    </span>
  );
}
