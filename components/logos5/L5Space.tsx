'use client';
// components/logos5/L5Space.tsx — EVERYTHING IN ONE SPACE. (Logos 5.5, Revision III.)
//
// A line of thinking as one space: what was brought, the ideas on the Logic
// Map, what Socria made and the open idea holding Socria's newest reply, on one
// canvas, joined by what made what. The row under the header brings one kind
// forward without moving anything; Words shows the conversation itself, each
// turn beside what it made, threaded in order. The chatbox sits at the foot.
// On a phone the space is one column: the open idea, what was made from it,
// what it comes from — and the row chooses which kind the column lists.
//
// Its rules are lib/logos5/ideas.ts; this file draws them.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { NodeGlyph } from '@/components/NodeGlyph';
import type { LogosNodeType } from '@/lib/logos';
import type { CanvasTurn } from '@/lib/logos5/canvas';
import { pinchOut } from '@/lib/logos5/morph';
import { anchorScroll, clampZoom, fitZoom, SPACE_ZOOM, zoomByWheel, zoomLabel, zoomStep } from '@/lib/logos5/spaceZoom';
import { roman } from '@/lib/logos5/oneView';
import { CloseGlyph } from './L5Chrome';
import {
  aroundOf,
  broughtKey,
  forwardIn,
  ideaKey,
  ideaLayout,
  ideaTone,
  ideasCount,
  madeKey,
  OPEN_KEY,
  spaceLinks,
  threadReplies,
  threadWords,
  trailRows,
  wordTargets,
  type IdeaEdgeLite,
  type SpaceKind,
} from '@/lib/logos5/ideas';
import './space.css';
// Revision IV: colour by kind, Socria's question in a gold panel, four columns on a 1440 screen, the arrival
import './space-colour.css';

/** A preview is something to look at here, not to use: nothing in it takes focus or a click. */
function Inert({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.setAttribute('inert', '');
  }, []);
  return (
    <div ref={ref} className="ls-inert" aria-hidden="true">
      {children}
    </div>
  );
}

export interface SpaceIdea {
  id: string;
  type: string;
  role?: string | null;
  label: string;
  /** what it is, as its card says it: "Given", "Step", "Concept" */
  kind: string;
  /** the turn that put it on the map */
  turn: number | null;
}

export interface SpaceThing {
  key: string;
  /** "You brought · photo", "Made · Live graph" */
  kicker: string;
  title: string;
  turn: number | null;
  preview?: ReactNode;
  note?: string;
  onOpen?: () => void;
}

// the same names the views and the menus use: what you brought is Files, what Socria made is Artifacts
const KIND_NAMES: Record<SpaceKind, string> = { all: 'Everything', ideas: 'Ideas', brought: 'Files', made: 'Artifacts', words: 'Words' };

function KindGlyph({ k }: { k: SpaceKind }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.1 } as const;
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      {k === 'all' && (
        <g {...p}>
          <rect x="2" y="2" width="5" height="5" rx="1" />
          <rect x="9" y="2" width="5" height="5" rx="1" />
          <rect x="2" y="9" width="5" height="5" rx="1" />
          <rect x="9" y="9" width="5" height="5" rx="1" />
        </g>
      )}
      {k === 'ideas' && (
        <g {...p}>
          <circle cx="4" cy="8" r="2.2" />
          <circle cx="12" cy="4" r="2.2" />
          <circle cx="12" cy="12" r="2.2" />
          <path d="M6 7l4-2M6 9l4 2" />
        </g>
      )}
      {k === 'brought' && <path {...p} d="M4 2h5l3 3v9H4z M9 2v3h3" />}
      {k === 'made' && (
        <g {...p}>
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="M4 11l3-3 2 2 3-4" />
        </g>
      )}
      {k === 'words' && <path {...p} d="M2.5 4.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7l-3 3v-3h.5a2 2 0 0 1-2-2z" />}
    </svg>
  );
}

interface Drawn {
  d: string;
  word: string;
  x: number;
  y: number;
  kind: string;
  dashed?: boolean;
  back: boolean;
}

export function L5Space({
  ideas,
  edges,
  brought,
  made,
  turns,
  fromMsg,
  openId,
  openTurn,
  openBody,
  lit,
  picked,
  composer,
  openHero,
  onIdea,
  onPage,
  onAnswer,
  onZoomOut,
  narrow = false,
  follow = false,
}: {
  ideas: SpaceIdea[];
  edges: IdeaEdgeLite[];
  brought: SpaceThing[];
  made: SpaceThing[];
  turns: CanvasTurn[];
  fromMsg: ReadonlyMap<string, readonly string[]> | null;
  /** the idea open: the newest turn's, unless another was pressed */
  openId: string | null;
  /** the turn read in the open card */
  openTurn: number | null;
  /** that turn's reply, as the conversation draws it (or the reply still arriving) */
  openBody: ReactNode;
  /** the ideas the open turn put on the map */
  lit: ReadonlySet<string>;
  /** the idea the chatbox asks about */
  picked: string | null;
  composer: ReactNode;
  /** what the open turn made, drawn large in the open idea (the visual carries it; the bubble keeps to words) */
  openHero?: { node: ReactNode; onOpen?: () => void } | null;
  /** an idea pressed: it opens, with the turn it came from */
  onIdea: (id: string) => void;
  /** the conversation as a page, every turn in order */
  onPage: () => void;
  /** Socria's question pressed while the chatbox is answering it: the cursor goes to the box */
  onAnswer?: () => void;
  onZoomOut?: () => void;
  narrow?: boolean;
  /** the open reply is still arriving: its last words stay in view */
  follow?: boolean;
}) {
  const [kind, setKind] = useState<SpaceKind>('all');
  // THE THREAD (Revision VI): every one of Socria's replies, opened from the bubble; a reply hovered lights what it made
  const [threadOn, setThreadOn] = useState(false);
  const [hoverTurn, setHoverTurn] = useState<number | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  // A MADE THING, ENLARGED (Revision VI): drawn to fit its card on the canvas; pressed, it opens large over the space
  // to look into, with the way to work with it beside the space
  const [enlarged, setEnlarged] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  // ZOOM (lib/logos5/spaceZoom.ts): the cards and their lines drawn smaller or larger as one, by the keys in the row
  // or a pinch. The scroll area is sized to the zoomed space, so every edge can still be scrolled to.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);

  // ARRIVING (Revision IV): when the space opens — a line of thinking opened, or come back to — the cards settle
  // in reading order and then the lines draw. Once: the open idea changing within the line does not replay it.
  const [arriving, setArriving] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setArriving(false), 2400);
    return () => clearTimeout(t);
  }, []);
  // Socria's question, pressed, puts the cursor in the chatbox
  const answerRef = useRef(onAnswer);
  answerRef.current = onAnswer;
  useEffect(() => {
    const el = openRef.current;
    if (!el) return;
    const on = (e: MouseEvent) => {
      if (answerRef.current && (e.target as HTMLElement | null)?.closest?.('.socria-asks')) answerRef.current();
    };
    el.addEventListener('click', on);
    return () => el.removeEventListener('click', on);
  });

  // A PINCH zooms the space about the pointer; pinched on out past its smallest, it goes up a level, to this line on
  // the Universal Map (lib/logos5/morph.ts). A phone's feed is a column of cards and is not zoomed.
  const zoomOutRef = useRef(onZoomOut);
  zoomOutRef.current = onZoomOut;
  const zoomTo = (next: number, at?: { x: number; y: number }) => {
    const k = zoomRef.current;
    const to = clampZoom(next);
    const sc = scrollRef.current;
    if (to === k || !sc) return;
    const point = at ?? { x: sc.clientWidth / 2, y: Math.max(0, sc.clientHeight - footRef.current) / 2 };
    pendingScroll.current = anchorScroll({ left: sc.scrollLeft, top: sc.scrollTop }, point, k, to);
    setZoom(to);
  };
  const zoomToRef = useRef(zoomTo);
  zoomToRef.current = zoomTo;
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const acc = { n: 0, at: 0 };
    const on = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const k = zoomRef.current;
      if (narrow || (e.deltaY > 0 && k <= SPACE_ZOOM.min)) {
        if (zoomOutRef.current && pinchOut(e, acc, Date.now()) === 'move') zoomOutRef.current();
        return;
      }
      acc.n = 0;
      const sc = scrollRef.current;
      const r = sc?.getBoundingClientRect();
      zoomToRef.current(zoomByWheel(k, e.deltaY), r ? { x: e.clientX - r.left, y: e.clientY - r.top } : undefined);
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, [narrow]);
  // the view kept on the point it was zoomed about, once the space has its new size
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    const want = pendingScroll.current;
    if (!sc || !want) return;
    pendingScroll.current = null;
    sc.scrollLeft = want.left;
    sc.scrollTop = want.top;
  }, [zoom, natural]);

  const byId = useMemo(() => new Map(ideas.map((n) => [n.id, n])), [ideas]);
  const open = openId ? byId.get(openId) ?? null : null;
  const layout = useMemo(() => ideaLayout(ideas, edges), [ideas, edges]);
  const things = useMemo(() => ({ brought: brought.map((b) => ({ key: b.key, turn: b.turn })), made: made.map((m) => ({ key: m.key, turn: m.turn })) }), [brought, made]);
  const links = useMemo(
    () => spaceLinks({ nodes: ideas, edges, brought: things.brought, made: things.made, turns, fromMsg, openId: open ? open.id : null, openTurn }),
    [ideas, edges, things, turns, fromMsg, open, openTurn]
  );
  const targets = useMemo(
    () => wordTargets({ nodes: ideas, brought: things.brought, made: things.made, turns, fromMsg, openId: open ? open.id : null, openTurn }),
    [ideas, things, turns, fromMsg, open, openTurn]
  );
  const wordAt = useMemo(() => {
    const m = new Map<string, number>();
    targets.forEach((k, t) => {
      if (k) m.set(k, t);
    });
    return m;
  }, [targets]);
  const openKey = open ? ideaKey(open.id) : OPEN_KEY;
  const rows = useMemo(() => trailRows(turns, fromMsg, ideas), [turns, fromMsg, ideas]);
  const replies = threadReplies(turns);
  const earlier = Math.max(0, replies - 1);
  const glow = useMemo(() => {
    const g = new Set<string>();
    if (hoverTurn === null) return g;
    for (const m of rows[hoverTurn]?.made ?? []) g.add(ideaKey(m.id));
    for (const n of ideas) if (n.turn === hoverTurn) g.add(ideaKey(n.id));
    for (const m of made) if (m.turn === hoverTurn) g.add(madeKey(m.key));
    for (const b of brought) if (b.turn === hoverTurn) g.add(broughtKey(b.key));
    return g;
  }, [hoverTurn, rows, ideas, made, brought]);
  useEffect(() => {
    if (!enlarged) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setEnlarged(null);
      }
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, [enlarged]);
  // the thread opens at its newest reply; Esc puts it away
  useLayoutEffect(() => {
    const el = threadRef.current;
    if (threadOn && el) el.scrollTop = el.scrollHeight;
  }, [threadOn, turns.length]);
  useEffect(() => {
    if (!threadOn) {
      setHoverTurn(null);
      return;
    }
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setThreadOn(false);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [threadOn]);
  const cardKindOf = (k: string): 'idea' | 'brought' | 'made' | 'open' => (k === openKey ? 'open' : k.startsWith('c:') ? 'brought' : k.startsWith('m:') ? 'made' : 'idea');

  // THE LINES: measured once the cards are laid out, and again whenever the space changes size
  const [drawn, setDrawn] = useState<{ lines: Drawn[]; thread: string; w: number; h: number }>({ lines: [], thread: '', w: 0, h: 0 });
  const measure = () => {
    const box = colsRef.current;
    if (!box || narrow) return;
    const cr = box.getBoundingClientRect();
    // the boxes are measured as drawn (zoomed); the lines are drawn inside the zoomed space, so in its own units
    const z = zoom || 1;
    const at = (k: string) => {
      const el = box.querySelector<HTMLElement>(`[data-k="${CSS.escape(k)}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { l: (r.left - cr.left) / z, t: (r.top - cr.top) / z, r: (r.right - cr.left) / z, b: (r.bottom - cr.top) / z, h: r.height / z };
    };
    const lines: Drawn[] = [];
    for (const ln of links) {
      let A = at(ln.from);
      let B = at(ln.to);
      if (!A || !B) continue;
      const yOf = (x: { t: number; h: number }, k: string) => x.t + Math.min(x.h / 2, k === openKey ? 72 : 36);
      let d: string;
      let lx: number;
      let ly: number;
      let fromK = ln.from;
      let toK = ln.to;
      if (B.r <= A.l + 1) {
        [A, B] = [B, A];
        [fromK, toK] = [toK, fromK];
      }
      if (A.r <= B.l + 1) {
        const x1 = A.r, x2 = B.l, y1 = yOf(A, fromK), y2 = yOf(B, toK), mx = (x1 + x2) / 2;
        d = `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
        lx = mx;
        ly = (y1 + y2) / 2;
      } else {
        // the same column: a bow along the left edge, from the upper card to the lower
        const [U, D] = A.t <= B.t ? [A, B] : [B, A];
        const x = Math.min(U.l, D.l), y1 = U.t + Math.min(U.h / 2, 30), y2 = D.t + Math.min(D.h / 2, 30);
        d = `M${x} ${y1} C ${x - 26} ${y1}, ${x - 26} ${y2}, ${x} ${y2}`;
        lx = x - 20;
        ly = (y1 + y2) / 2;
      }
      const back = !forwardIn(kind, cardKindOf(ln.from)) && !forwardIn(kind, cardKindOf(ln.to));
      lines.push({ d, word: ln.word, x: lx, y: ly, kind: ln.kind, ...(ln.dashed ? { dashed: true } : {}), back });
    }
    let thread = '';
    if (kind === 'words') {
      const pts: string[] = [];
      const ws = [...box.querySelectorAll<HTMLElement>('[data-w]')].sort((a, b) => Number(a.dataset.w) - Number(b.dataset.w));
      for (const w of ws) {
        const r = w.getBoundingClientRect();
        pts.push(`${(r.left - cr.left + r.width / 2) / z} ${(r.top - cr.top + r.height / 2) / z}`);
      }
      if (pts.length > 1) thread = `M${pts.join(' L ')}`;
    }
    const next = { lines, thread, w: box.scrollWidth, h: box.scrollHeight };
    setDrawn((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
  };
  const measureRef = useRef(measure);
  measureRef.current = measure;
  useLayoutEffect(() => {
    measureRef.current();
  });
  useEffect(() => {
    const box = colsRef.current;
    if (!box || narrow || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureRef.current());
    ro.observe(box);
    box.querySelectorAll('.ls-col').forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [narrow, ideas.length, brought.length, made.length, openKey]);
  // the space's size at 100% (a transform does not change it): the zoomed scroll area is this times the zoom
  useLayoutEffect(() => {
    const box = colsRef.current;
    if (!box || narrow) return;
    const set = () => setNatural((n) => (n.w === box.offsetWidth && n.h === box.offsetHeight ? n : { w: box.offsetWidth, h: box.offsetHeight }));
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(box);
    return () => ro.disconnect();
  }, [narrow]);
  // FIT: the whole space — every card — in the view above the chatbox, from its top left
  const fitSpace = () => {
    const box = colsRef.current;
    const sc = scrollRef.current;
    if (!box || !sc) return;
    const z = zoomRef.current;
    const cr = box.getBoundingClientRect();
    let right = 0;
    let bottom = 0;
    box.querySelectorAll<HTMLElement>('.ls-col').forEach((c) => {
      const r = c.getBoundingClientRect();
      right = Math.max(right, r.right - cr.left);
      bottom = Math.max(bottom, r.bottom - cr.top);
    });
    const to = fitZoom({ w: right / z + 40, h: bottom / z + 16 }, { w: sc.clientWidth, h: sc.clientHeight }, footRef.current);
    pendingScroll.current = { left: 0, top: 0 };
    if (to === z) {
      sc.scrollLeft = 0;
      sc.scrollTop = 0;
      pendingScroll.current = null;
      return;
    }
    setZoom(to);
  };

  // THE FOOT: the chatbox (and the note above it, when there is one) floats over the canvas's foot. Its height is
  // measured, never assumed, so the canvas always has room to scroll what it covers clear of it
  const footRef = useRef(0);
  // Socria's reply — and the question it ends on — kept whole above the chatbox: it is what is read and answered, so it
  // stays on screen even when that takes the idea above it partly out of view (a wide screen; a phone's feed scrolls on)
  const keepReplyClear = (smooth = false) => {
    const sc = scrollRef.current;
    const el = openRef.current;
    if (!sc || !el || narrow) return;
    const sr = sc.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.bottom < sr.top || r.top > sr.bottom - 80) return;
    const bub = el.querySelector('.ls-bub')?.getBoundingClientRect() ?? r;
    const over = r.bottom - (sr.bottom - (chatRef.current?.offsetHeight ?? footRef.current) - 20);
    const room = bub.top - sr.top - 12;
    // a hair under the box is not worth moving the view for; the reply's last line is
    if (over <= 12 || room <= 0) return;
    const top = sc.scrollTop + Math.min(over, room);
    if (smooth && typeof sc.scrollTo === 'function') sc.scrollTo({ top, behavior: 'smooth' });
    else sc.scrollTop = top;
  };
  const keepRef = useRef(keepReplyClear);
  keepRef.current = keepReplyClear;
  // once the cards have settled (they rise into place as the space opens, so their boxes move until then)
  useEffect(() => {
    if (!arriving) keepRef.current(true);
  }, [arriving]);
  useEffect(() => {
    const chat = chatRef.current;
    const root = rootRef.current;
    if (!chat || !root || typeof ResizeObserver === 'undefined') return;
    const set = () => {
      const grew = chat.offsetHeight > footRef.current;
      footRef.current = chat.offsetHeight;
      root.style.setProperty('--ls-foot', `${chat.offsetHeight}px`);
      // a note arriving above the box (or the box growing) would cover the reply's foot: keep it clear
      if (grew) keepRef.current(true);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(chat);
    return () => ro.disconnect();
  }, [narrow]);

  // THE OPEN IDEA IN VIEW: brought into the space's view when it changes; its last words kept in view while it grows
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    const el = openRef.current;
    if (!sc || !el) return;
    const sr = sc.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!narrow) {
      // the open idea in full, and the whole of the column after it (what it made) when there is room for both —
      // it was allowed a fixed 320px, so a made card 270 wide sat cut by the screen's edge
      const left = r.left - sr.left + sc.scrollLeft;
      const right = left + r.width;
      const colEl = el.closest('.ls-col');
      const next = colEl?.nextElementSibling;
      // offsetWidth and the gap are the space's own units; the view is zoomed
      const gap = (colsRef.current ? parseFloat(getComputedStyle(colsRef.current).columnGap) || 64 : 64) * zoom;
      const after = next instanceof HTMLElement && next.classList.contains('ls-col') ? gap + next.offsetWidth * zoom + 40 : 40;
      const want = Math.min(Math.max(0, left - 40), Math.max(0, right + after - sc.clientWidth));
      if (Math.abs(sc.scrollLeft - want) > 4) sc.scrollLeft = want;
    }
    const top = r.top - sr.top + sc.scrollTop;
    if (r.top < sr.top || r.top > sr.bottom - 80) sc.scrollTop = Math.max(0, top - 16);
    else keepRef.current();
  }, [openKey, openTurn, narrow, kind, threadOn]);
  useEffect(() => {
    const sc = scrollRef.current;
    const el = openRef.current;
    if (!follow || !sc || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const sr = sc.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const over = r.bottom - (sr.bottom - Math.max(150, footRef.current + 32));
      if (over > 0) sc.scrollTop += over;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [follow, openKey]);

  // THE ROW FINDS WHAT IT BRINGS FORWARD: Made scrolls the canvas to what was made, Brought to what was brought in —
  // they sit at its far edges, and were often off screen
  useEffect(() => {
    if (narrow || kind !== 'words') return;
    // Words: the latest turn's words, which sit under the reply — brought up clear of the chatbox, not left behind it
    const sc = scrollRef.current;
    const words = colsRef.current?.querySelectorAll<HTMLElement>('.ls-word');
    const last = words && words.length ? words[words.length - 1] : null;
    if (!sc || !last) return;
    const sr = sc.getBoundingClientRect();
    const r = last.getBoundingClientRect();
    const over = r.bottom - (sr.bottom - (chatRef.current?.offsetHeight ?? footRef.current) - 32);
    if (over > 0 && typeof sc.scrollTo === 'function') sc.scrollTo({ top: sc.scrollTop + over, behavior: 'smooth' });
  }, [kind, narrow]);
  useEffect(() => {
    if (narrow || (kind !== 'made' && kind !== 'brought')) return;
    const sc = scrollRef.current;
    const col = colsRef.current?.querySelector<HTMLElement>(kind === 'made' ? '.ls-col.is-made' : '.ls-col.is-frame');
    if (!sc || !col) return;
    const want = Math.max(0, col.offsetLeft * zoomRef.current - 40);
    if (typeof sc.scrollTo === 'function') sc.scrollTo({ left: want, behavior: 'smooth' });
    else sc.scrollLeft = want;
  }, [kind, narrow]);

  // READING ORDER (Revision IV): the frame column, then each column top to bottom, then what was made — the order
  // the cards settle in when the space opens
  const inFrame = new Set(layout.frame);
  const placed = !!open && (inFrame.has(open.id) || layout.columns.some((c) => c.includes(open.id)));
  const orderOf = useMemo(() => {
    const keys = [...layout.frame.map(ideaKey), ...brought.map((b) => broughtKey(b.key)), ...layout.columns.flat().map(ideaKey)];
    if (!placed) keys.push(OPEN_KEY);
    keys.push(...made.map((m) => madeKey(m.key)));
    return new Map(keys.map((k, i) => [k, i]));
  }, [layout, brought, made, placed]);
  const order = (k: string) => ({ ['--i' as string]: orderOf.get(k) ?? 0 });
  const back = (k: string) => (forwardIn(kind, cardKindOf(k)) ? '' : ' is-back') + (glow.has(k) ? ' is-glow' : '');
  const turnWords = (t: number) => {
    const turn = turns[t];
    if (!turn) return null;
    return (
      <div className="ls-word" data-w={t}>
        <span className="ls-word-n">{roman(t + 1)}.</span>
        {turn.asked && (
          <span className="ls-word-you">
            <b>You</b> {turn.asked}
          </span>
        )}
        {(turn.asks || turn.said) && (
          <span className="ls-word-s">
            <b>Socria</b> {turn.pending ? 'Replying…' : turn.asks || turn.said}
          </span>
        )}
      </div>
    );
  };
  const words = (k: string) => {
    if (kind !== 'words') return null;
    const t = wordAt.get(k);
    return t === undefined ? null : turnWords(t);
  };
  const press = (fn?: () => void) => (e: ReactKeyboardEvent) => {
    if (fn && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      fn();
    }
  };

  const ideaEl = (n: SpaceIdea, small = false) => {
    const k = ideaKey(n.id);
    return (
      <div key={k} className={`ls-it${back(k)}`} data-k={k} style={order(k)}>
        <button
          type="button"
          className={`ls-idea is-${n.type === 'question' ? 'question' : 'idea'}${lit.has(n.id) ? ' is-lit' : ''}${picked === n.id ? ' is-picked' : ''}${small ? ' is-small' : ''}`}
          data-tone={ideaTone(n)}
          onClick={() => onIdea(n.id)}
          title={`Open “${n.label}”`}
        >
          {/* Revision V: the glyph and the colour say what it is; no kind word, no turn tag */}
          <span className="ls-t">
            <span className="ls-k-g" aria-hidden="true" title={n.type === 'question' ? 'Your question' : n.kind}>
              <NodeGlyph type={n.type as LogosNodeType} />
            </span>
            {n.label}
          </span>
        </button>
        {words(k)}
      </div>
    );
  };
  const thingEl = (c: SpaceThing, what: 'brought' | 'made') => {
    const k = what === 'brought' ? broughtKey(c.key) : madeKey(c.key);
    // something to look at is enlarged first; with nothing to show, the card opens beside the space as before
    const act = c.preview ? () => setEnlarged(k) : c.onOpen;
    return (
      <div key={k} className={`ls-it${back(k)}`} data-k={k} style={order(k)}>
        <div
          className={`ls-${what === 'brought' ? 'file' : 'made'}${c.preview ? ' has-prev' : ''}`}
          role={act ? 'button' : undefined}
          tabIndex={act ? 0 : undefined}
          onClick={act}
          onKeyDown={press(act)}
          aria-label={`${c.kicker}${c.title ? `: ${c.title}` : ''}${c.preview ? '. Enlarge it' : c.onOpen ? '. Open it' : ''}`}
        >
          <span className="ls-t ls-tt">{c.title || c.kicker}</span>
          {c.preview ? (
            <div className={`ls-prev${what === 'made' ? ' is-fit' : ''}`}>
              <Inert>{c.preview}</Inert>
              <span className="ls-enl" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
                </svg>
                Enlarge
              </span>
            </div>
          ) : null}
          {c.note && what === 'brought' && <span className="ls-note">{c.note}</span>}
        </div>
        {words(k)}
      </div>
    );
  };
  const t = openTurn !== null ? turns[openTurn] : null;
  const openEl = (
    <div key={openKey} ref={openRef} className={`ls-it is-open${back(openKey)}`} data-k={openKey} style={order(openKey)}>
      {/* THE OPEN IDEA (Revision V): the idea and what was made for it — the visual carries it */}
      {open && (
        <article className="ls-open" aria-label={`Open: ${open.label}`}>
          <h2 className="ls-stmt">
            <span className="ls-k-g" aria-hidden="true">
              <NodeGlyph type={open.type as LogosNodeType} />
            </span>
            {open.label}
          </h2>
          {openHero && (
            <div
              className="ls-hero"
              role={openHero.onOpen ? 'button' : undefined}
              tabIndex={openHero.onOpen ? 0 : undefined}
              onClick={openHero.onOpen}
              onKeyDown={press(openHero.onOpen)}
              aria-label={openHero.onOpen ? 'Open it beside the space' : undefined}
            >
              {openHero.node}
            </div>
          )}
        </article>
      )}
      {/* SOCRIA'S BUBBLE: the reply in words, its own bubble pointing at the idea — the one place it is a conversation */}
      <div className={`ls-bub${open ? ' has-tail' : ''}${openHero ? ' has-hero' : ''}${earlier > 0 ? ' has-earlier' : ''}`} aria-label="Socria’s reply">
        <span className="ls-bub-who">
          <span className="ls-bub-name">Socria</span>
          {openTurn !== null && <span className="ls-tn">{t?.pending ? 'thinking…' : openTurn === turns.length - 1 ? 'just now' : `turn ${roman(openTurn + 1)}`}</span>}
          {earlier > 0 && (
            // the replies before this one, stacked under it: pressed, every reply opens as a thread
            <button type="button" className="ls-earlier" aria-expanded={threadOn} onClick={() => setThreadOn((v) => !v)}>
              <span className="ls-earlier-n">{earlier}</span>
              {earlier === 1 ? 'earlier reply' : 'earlier replies'}
            </button>
          )}
        </span>
        <div className="ls-body">{openBody}</div>
      </div>
      {words(openKey)}
    </div>
  );

  const big = enlarged ? [...made.map((m) => ({ m, k: madeKey(m.key) })), ...brought.map((m) => ({ m, k: broughtKey(m.key) }))].find((x) => x.k === enlarged)?.m ?? null : null;
  const lightboxEl = big ? (
    <div className="ls-lb" role="dialog" aria-modal="true" aria-label={big.title || big.kicker} onClick={(e) => e.target === e.currentTarget && setEnlarged(null)}>
      <div className="ls-lb-card">
        <div className="ls-lb-head">
          <span className="ls-t ls-tt">{big.title || big.kicker}</span>
          <span className="ls-sp" />
          {big.onOpen && (
            <button
              type="button"
              className="l5-link is-go"
              onClick={() => {
                setEnlarged(null);
                big.onOpen?.();
              }}
            >
              Work with it beside the space <span className="l5-ar">→</span>
            </button>
          )}
          <button type="button" className="l5-icon l5-close ls-lb-x" aria-label="Close" onClick={() => setEnlarged(null)}>
            <CloseGlyph />
          </button>
        </div>
        <div className="ls-lb-body">{big.preview}</div>
      </div>
    </div>
  ) : null;

  const threadEl = threadOn ? (
    <aside className="ls-thread" aria-label="Socria’s replies">
      {narrow && <span className="ls-grab" aria-hidden="true" />}
      <div className="ls-thead">
        <span className="l5-label">Socria · {replies} {replies === 1 ? 'reply' : 'replies'}</span>
        <button type="button" className="l5-link ls-thx" onClick={() => setThreadOn(false)}>
          {narrow ? 'Done' : 'Back to the space ×'}
        </button>
      </div>
      <div className="ls-tscroll" ref={threadRef}>
        {rows.map((r) => {
          const turn = turns[r.index];
          if (!turn) return null;
          const { said, asks } = threadWords(turn);
          const madeHere = made.filter((m) => m.turn === r.index);
          const first = r.made[0]?.id ?? null;
          return (
            <div key={r.index} className="ls-tturn">
              {turn.asked && <p className="ls-mine">{turn.asked}</p>}
              {(said || asks || turn.pending) && (
                <div
                  className={`ls-tb${r.index === openTurn ? ' is-now' : ''}${first ? ' is-go' : ''}`}
                  data-turn={r.index}
                  role={first ? 'button' : undefined}
                  tabIndex={first ? 0 : undefined}
                  onClick={first ? () => onIdea(first) : undefined}
                  onKeyDown={first ? press(() => onIdea(first)) : undefined}
                  onMouseEnter={() => setHoverTurn(r.index)}
                  onMouseLeave={() => setHoverTurn((h) => (h === r.index ? null : h))}
                  onFocus={() => setHoverTurn(r.index)}
                  onBlur={() => setHoverTurn((h) => (h === r.index ? null : h))}
                >
                  <span className="ls-bub-who">
                    <span className="ls-bub-name">Socria</span>
                    <span className="ls-tn">{turn.pending ? 'thinking…' : r.index === turns.length - 1 ? 'just now' : roman(r.index + 1)}</span>
                  </span>
                  {turn.pending ? <p className="ls-tsay">Replying…</p> : said && <p className="ls-tsay">{said}</p>}
                  {asks && !turn.pending && <p className="ls-task">{asks}</p>}
                  {(r.made.length > 0 || madeHere.length > 0) && (
                    <span className="ls-tchips">
                      {r.made.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className="ls-tchip is-lit"
                          onClick={(e) => {
                            e.stopPropagation();
                            onIdea(m.id);
                          }}
                        >
                          {m.label}
                        </button>
                      ))}
                      {madeHere.map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          className="ls-tchip is-made"
                          onClick={(e) => {
                            e.stopPropagation();
                            m.onOpen?.();
                          }}
                          disabled={!m.onOpen}
                        >
                          {m.title || m.kicker}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  ) : null;

  const counts: Record<SpaceKind, string> = {
    all: String(ideas.length + brought.length + made.length),
    ideas: String(ideas.length),
    brought: String(brought.length),
    made: String(made.length),
    words: `${turns.length} ${turns.length === 1 ? 'turn' : 'turns'}`,
  };
  const kindsEl = (
    <nav className="ls-kinds" aria-label="Bring forward">
      {/* a kind with nothing in it is not offered ("Files 0" brought nothing forward); the one chosen always stays */}
      {(['all', 'ideas', 'brought', 'made', 'words'] as SpaceKind[]).filter((k) => k === 'all' || k === kind || (k === 'words' ? turns.length > 0 : Number(counts[k]) > 0)).map((k) => (
        <button key={k} type="button" data-kind={k} className={`ls-kd${kind === k ? ' is-on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
          {!narrow && <KindGlyph k={k} />}
          {KIND_NAMES[k]}
          {k !== 'all' && <span className="ls-c">{narrow && k === 'words' ? turns.length : counts[k]}</span>}
        </button>
      ))}
      <span className="ls-sp" />
      {!narrow && (
        <span className="ls-zoom-keys" role="group" aria-label="Zoom the space">
          <button type="button" aria-label="Zoom out" title="Zoom out (or pinch)" onClick={() => zoomTo(zoomStep(zoom, -1))} disabled={zoom <= SPACE_ZOOM.min}>
            −
          </button>
          <button type="button" className="is-pct" aria-label={`Zoom ${zoomLabel(zoom)}: back to 100%`} title="Back to 100%" onClick={() => zoomTo(1)} disabled={zoom === 1}>
            {zoomLabel(zoom)}
          </button>
          <button type="button" aria-label="Zoom in" title="Zoom in (or pinch)" onClick={() => zoomTo(zoomStep(zoom, 1))} disabled={zoom >= SPACE_ZOOM.max}>
            +
          </button>
          <button type="button" className="is-fit" aria-label="Fit the whole space on screen" title="Fit the whole space on screen" onClick={fitSpace}>
            Fit
          </button>
        </span>
      )}
      <button type="button" className="l5-link is-go ls-page" onClick={onPage}>
        {narrow ? 'As a conversation' : 'Read as a conversation'} <span className="l5-ar">→</span>
      </button>
    </nav>
  );
  const chatEl = (
    <div className="ls-chat" ref={chatRef}>
      {composer}
    </div>
  );

  // ── A PHONE: one column ──
  if (narrow) {
    const around = open ? aroundOf(open.id, ideas, edges) : { before: [], after: [], against: [] };
    const madeHere = made.filter((m) => openTurn !== null && m.turn === openTurn);
    const broughtHere = brought.filter((b) => openTurn !== null && b.turn !== null && b.turn <= openTurn).slice(-2);
    const rows = trailRows(turns, fromMsg, ideas);
    const list = (ns: SpaceIdea[]) => ns.map((n) => ideaEl(n, true));
    return (
      <div ref={rootRef} className={`ls is-phone${threadOn ? ' has-thread' : ''}`}>
        {kindsEl}
        <div className="ls-feed" ref={scrollRef}>
          {kind === 'all' && (
            <>
              {openEl}
              {madeHere.length > 0 && <span className="l5-label ls-sec">Made from it</span>}
              {madeHere.map((m) => thingEl(m, 'made'))}
              {(around.before.length > 0 || broughtHere.length > 0) && <span className="l5-label ls-sec">It comes from</span>}
              {around.before.length > 0 && <div className="ls-pair">{list(around.before.map((id) => byId.get(id)!).filter(Boolean))}</div>}
              {broughtHere.length > 0 && <div className="ls-pair">{broughtHere.map((b) => thingEl(b, 'brought'))}</div>}
              {around.after.length > 0 && <span className="l5-label ls-sec">Leads to</span>}
              {around.after.length > 0 && <div className="ls-pair">{list(around.after.map((id) => byId.get(id)!).filter(Boolean))}</div>}
              {around.against.length > 0 && <span className="l5-label ls-sec">Against it</span>}
              {around.against.length > 0 && <div className="ls-pair">{list(around.against.map((id) => byId.get(id)!).filter(Boolean))}</div>}
              {ideas.length > 0 && (
                <button type="button" className="l5-link is-go ls-all" onClick={() => setKind('ideas')}>
                  See all {ideasCount(ideas.length)} <span className="l5-ar">→</span>
                </button>
              )}
            </>
          )}
          {kind === 'ideas' && (ideas.length ? list(ideas) : <p className="ls-empty">Ideas you put into words land here as the conversation goes.</p>)}
          {kind === 'brought' && (brought.length ? brought.map((b) => thingEl(b, 'brought')) : <p className="ls-empty">Nothing brought yet. Add a file or a photo with +.</p>)}
          {kind === 'made' && (made.length ? made.map((m) => thingEl(m, 'made')) : <p className="ls-empty">Nothing made yet. Ask for a table, a chart or a drawing.</p>)}
          {kind === 'words' && (
            <ol className="ls-trail">
              {rows.map((r) => (
                <li key={r.index} className="ls-trow">
                  <span className="ls-word-n">{roman(r.index + 1)}.</span>
                  <div>
                    {r.asked && (
                      <p className="ls-word-you">
                        <b>You</b> {r.asked}
                      </p>
                    )}
                    {r.said && (
                      <p className="ls-word-s">
                        <b>Socria</b> {r.pending ? 'Replying…' : r.said}
                      </p>
                    )}
                    {r.made.length > 0 && (
                      <span className="ls-chips">
                        {r.made.map((m) => (
                          <button key={m.id} type="button" className="ls-chip" onClick={() => (onIdea(m.id), setKind('all'))}>
                            {m.label}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        {chatEl}
        {threadEl}
        {lightboxEl}
      </div>
    );
  }

  // ── A WIDE SCREEN: the space, left to right ──
  const col = (ids: string[]) => ids.map((id) => (open && id === open.id ? openEl : byId.get(id) ? ideaEl(byId.get(id)!) : null));
  return (
    <div
      ref={rootRef}
      className={`ls is-${kind}${arriving ? ' is-arriving' : ''}${threadOn ? ' has-thread' : ''}${hoverTurn !== null ? ' is-hovering' : ''}${zoom !== 1 ? ' is-zoomed' : ''}`}
      // the lines start drawing once the last card has settled
      style={{ ['--ls-base' as string]: `${(ideas.length + brought.length + made.length + (placed ? 0 : 1)) * 70 + 300}ms`, ['--ls-k' as string]: String(zoom) }}
    >
      {kindsEl}
      <div className="ls-canvas l5-dots" ref={scrollRef}>
        <div className="ls-zoom" style={zoom !== 1 && natural.w ? { width: natural.w * zoom, height: natural.h * zoom } : undefined}>
        <div className="ls-cols" ref={colsRef} style={zoom !== 1 ? { transform: `scale(${zoom})` } : undefined}>
          <svg className="ls-edges" width={drawn.w} height={drawn.h} aria-hidden="true">
            {drawn.lines.map((l, i) => (
              <g key={i} className={`ls-ln is-${l.dashed ? 'against' : l.kind}${l.back ? ' is-back' : ''}`} style={{ ['--j' as string]: i }}>
                {/* a solid line is drawn in when the space opens (pathLength 1: CSS draws it from 1 to 0) */}
                <path d={l.d} pathLength={l.dashed ? undefined : 1} strokeDasharray={l.dashed ? '4 4' : undefined} />
              </g>
            ))}
            {drawn.thread && <path className="ls-thread" d={drawn.thread} />}
          </svg>
          {(layout.frame.length > 0 || brought.length > 0) && (
            <div className="ls-col is-frame">
              {col(layout.frame)}
              {brought.map((b) => thingEl(b, 'brought'))}
            </div>
          )}
          {layout.columns.map((ids, i) => (
            <div key={i} className={`ls-col${open && ids.includes(open.id) ? ' has-open' : ''}`}>
              {col(ids)}
            </div>
          ))}
          {!placed && <div className="ls-col has-open">{openEl}</div>}
          {made.length > 0 && <div className="ls-col is-made">{made.map((m) => thingEl(m, 'made'))}</div>}
        </div>
        </div>
      </div>
      {chatEl}
      {threadEl}
      {lightboxEl}
    </div>
  );
}
