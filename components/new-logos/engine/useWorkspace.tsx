'use client';
// components/new-logos/engine/useWorkspace.tsx — A WORKSPACE: its components on the canvas, and everything that acts on
// them, shared by a conversation's space and an objective's.
//
// It holds the workspace's components (useRepresentation), runs every change through the operation engine
// (useEngine: one path for the Smart Omnibox, slash commands, the action bar, the context menu, shortcuts, drags and
// the assistant), and gives the page what to draw: the components as native objects, their relations (established
// solid, unverified dashed, labels only for what is selected), groups as frames or collapsed tiles, and what a filter
// leaves out shown faint. The Smart Omnibox's words are read here first (lib/new-logos/engine/commands.ts interpret):
// a command runs at once (or after a yes, when it is destructive); words naming something unclear are said so, with
// what they might mean; a question, a thought, or an instruction not read here goes to the intelligence layer
// (`think`: in a conversation, a turn; in an objective's space, a new conversation).

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SIZE, type CanvasLayout } from '@/lib/new-logos/canvas';
import { compositionOf, itemById, KIND_COUNT, KIND_WORD, REL_WORD, standingWords, type RepItem } from '@/lib/new-logos/representation';
import { valuesOf } from '@/lib/new-logos/representation-ops';
import { estimateSize, isRepRef, placeRep, repRef } from '@/lib/new-logos/rep-layout';
import { contentsInWords, frames as framesOf, groupBounds, groupsAround, hiddenBy, membersOf, movePatch, tiles } from '@/lib/new-logos/groups';
import { COMMANDS, SLASH, commandById, interpret, planFromModel, selInfo, type Plan, type UiIntent } from '@/lib/new-logos/engine/commands';
import { catalogue, type WorkspaceCtx } from '@/lib/new-logos/engine/resolve';
import { linksOf } from '@/lib/new-logos/compose';
import type { NodeRow } from '@/lib/new-logos/model';
import type { CanvasFrame, CanvasLine, CanvasObject } from '../canvas/Canvas';
import type { LayoutApi } from '../canvas/useLayout';
import type { About } from '../ask';
import type { Mention } from '../sources/Omnibox';
import { useNL } from '../state';
import { useSources } from '../sources/state';
import { useRepresentation } from '../represent/useRepresentation';
import { RepObject, spokenOf } from '../represent/RepObject';
import { RepInspector } from '../represent/RepInspector';
import { ChangeNote, RepConnectChooser, RepFocus, Working, type Note } from '../represent/RepChrome';
import { ActionBar, ContextMenu, type Act } from './Actions';
import { useEngine } from './useEngine';

export interface WorkspaceOpts {
  /** c:<conversation id> or o:<objective node id> */
  wsKey: string;
  enabled: boolean;
  /** the objective what is kept here goes into: the conversation's objective, or the objective whose space this is */
  container?: string | null;
  L: LayoutApi;
  measured: React.MutableRefObject<Record<string, { w: number; h: number }>>;
  /** exchanges shown on this canvas (said elsewhere, not yet represented), for references */
  exchanges?: { key: string; text: string }[];
  /** a question, a thought, or an instruction for the intelligence layer, with what it is about */
  think: (text: string, about: About | undefined, refs: string[], kind: 'question' | 'instruction') => void;
  setFocus: (f: { ref: string; nonce: number; ifHidden?: boolean; refs?: string[] }) => void;
  openHistory: () => void;
  /** the page is waiting for the assistant */
  busy: boolean;
  working?: { text: string; stop?: () => void } | null;
}

const words = (k: string, n: number) => {
  const c = KIND_COUNT[k as keyof typeof KIND_COUNT];
  return c ? (n === 1 ? `${/^[aeiou]/.test(c[0]) ? 'an' : 'a'} ${c[0]}` : `${n} ${c[1]}`) : `${n} ${k}`;
};

export function useWorkspace(o: WorkspaceOpts) {
  const router = useRouter();
  const { nodes, relations, createNode, nodeAction, link, unlink, say } = useNL();
  const { sources, openViewer, openLibrary } = useSources();
  const R = useRepresentation(o.wsKey, o.enabled);
  const [sel, setSel] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [filter, setFilter] = useState<{ refs: Set<string>; label: string } | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [menu, setMenu] = useState<{ screen: { x: number; y: number }; at: { x: number; y: number } } | null>(null);
  const [connecting, setConnecting] = useState<{ from: string; to: string; screen: { x: number; y: number } } | null>(null);
  const [focusItem, setFocusItem] = useState<string | null>(null);
  const [inspect, setInspect] = useState<{ ref: string; section?: 'backlinks' } | null>(null);
  const [pointing, setPointing] = useState<{ ref: string; label: string; about: About } | null>(null);
  const [, setTick] = useState(0);
  const nearRef = useRef<[string, string][]>([]);
  const L = o.L;

  const sizeOf = useCallback(
    (ref: string) => {
      const m = o.measured.current[ref];
      if (m) return m;
      if (isRepRef(ref)) {
        const it = itemById(R.rep, ref.slice(2));
        return it ? estimateSize(it) : { w: DEFAULT_SIZE.w, h: DEFAULT_SIZE.h };
      }
      return { w: DEFAULT_SIZE.w, h: DEFAULT_SIZE.h };
    },
    [o.measured, R.rep]
  );

  // ── where new components go: beside what they belong to, once, never moving what is placed ──
  useEffect(() => {
    if (!L.loaded || !R.loaded) return;
    const missing = R.rep.items.filter((i) => !L.layout.items[repRef(i.id)]).map((i) => i.id);
    if (!missing.length) return;
    const v = L.layout.view;
    const origin = v ? { x: Math.round((window.innerWidth / 2 - v.x) / v.k - 210), y: Math.round((window.innerHeight / 2 - 120 - v.y) / v.k) } : { x: 0, y: 0 };
    const placed = placeRep(L.layout, R.rep, missing, nearRef.current, sizeOf, origin);
    const patch = Object.fromEntries(missing.filter((id) => placed.items[repRef(id)]).map((id) => [repRef(id), placed.items[repRef(id)]]));
    if (Object.keys(patch).length) L.setItems(patch);
  }, [L, R.loaded, R.rep, sizeOf]);

  // what changed fades after a moment
  useEffect(() => {
    if (!R.fresh.at) return;
    const t = window.setTimeout(() => setTick((x) => x + 1), 4200);
    return () => window.clearTimeout(t);
  }, [R.fresh.at]);

  const model = useMemo(() => {
    const comp = compositionOf(R.rep);
    const { scope, values } = valuesOf(R.rep);
    return { comp, scope, values };
  }, [R.rep]);

  const nodeById = useCallback((id: string) => nodes.find((n) => n.id === id), [nodes]);
  const sourceName = useCallback((id: string) => sources.find((s) => s.id === id)?.name ?? null, [sources]);
  const openSource = useCallback((sourceId: string, passage?: string) => openViewer({ sourceId, passage: passage ?? null }), [openViewer]);

  // ── the workspace, as the engine reads it ──
  const ctx: WorkspaceCtx = useMemo(
    () => ({
      key: o.wsKey,
      rep: R.rep,
      layout: L.layout,
      selection: sel,
      recent,
      nodes: nodes.filter((n) => n.archived_at === null && (L.layout.items[`n:${n.id}`] || n.type === 'objective')).map((n) => ({ id: n.id, type: n.type, title: n.title, created_at: n.created_at })),
      sources: sources.map((s) => ({ id: s.id, name: s.name, created_at: s.created_at })),
      exchanges: o.exchanges,
      sizeOf,
      now: Date.now(),
    }),
    [o.wsKey, R.rep, L.layout, sel, recent, nodes, sources, o.exchanges, sizeOf]
  );

  // the workspace as it is now (for what runs after a wait: the assistant's commands)
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const touch = useCallback((refs: string[]) => setRecent((r) => [...r.filter((x) => !refs.includes(x)), ...refs].slice(-20)), []);
  const select = useCallback(
    (refs: string[], how: 'replace' | 'add' | 'toggle' = 'replace') => {
      setSel((s) => (how === 'replace' ? refs : how === 'add' ? [...new Set([...s, ...refs])] : refs.reduce((acc, r) => (acc.includes(r) ? acc.filter((x) => x !== r) : [...acc, r]), s)));
      if (refs.length) touch(refs);
      setInspect(null);
    },
    [touch]
  );

  // ── the engine ──
  const ui = useCallback(
    (u: UiIntent) => {
      switch (u.do) {
        case 'select':
          return select(u.refs);
        case 'focus':
          return o.setFocus({ ref: u.ref, nonce: Date.now() });
        case 'filter':
          return setFilter(u.refs ? { refs: new Set(u.refs), label: u.label ?? '' } : null);
        case 'navigate':
          return router.push(u.href);
        case 'library':
          return openLibrary({ ...(u.query ? { query: u.query } : {}), ...(u.since ? { since: u.since } : {}) });
        case 'viewer':
          return openViewer({ sourceId: u.sourceId, passage: u.passage ?? null });
        case 'inspect':
          setSel([u.ref]);
          return setInspect({ ref: u.ref, ...(u.section ? { section: u.section } : {}) });
        case 'history':
          return o.openHistory();
        case 'connect': {
          const el = document.querySelector(`[data-ref="${CSS.escape(u.to)}"]`)?.getBoundingClientRect();
          return setConnecting({ from: u.from, to: u.to, screen: { x: el ? el.left : window.innerWidth / 2, y: el ? el.top : window.innerHeight / 2 } });
        }
        case 'transform': {
          const el = document.querySelector(`[data-ref="${CSS.escape(u.ref)}"]`)?.getBoundingClientRect();
          setSel([u.ref]);
          return setMenu({ screen: { x: el ? el.left : 200, y: el ? el.bottom + 8 : 200 }, at: { x: 0, y: 0 } });
        }
      }
    },
    [select, o, router, openLibrary, openViewer]
  );

  const aboutOf = useCallback(
    (refs: string[]): About | undefined => {
      const lines: string[] = [];
      for (const r of refs.slice(0, 6)) {
        if (r.startsWith('r:')) {
          const it = itemById(R.rep, r.slice(2));
          if (!it) continue;
          const st = standingWords(it);
          lines.push(`${KIND_WORD[it.kind]} [${it.id}]${st ? ` (${st})` : ''}: ${it.text}`);
          if (it.detail) lines.push(`  ${it.detail.slice(0, 200)}`);
        } else if (r.startsWith('g:')) {
          const g = L.layout.groups?.[r.slice(2)];
          const m = membersOf(L.layout, r.slice(2)).filter((x) => x.startsWith('r:'));
          lines.push(`Group “${g?.name ?? 'unnamed'}” of ${m.length}: ${m.map((x) => itemById(R.rep, x.slice(2))?.text ?? '').filter(Boolean).slice(0, 6).join('; ')}`);
        }
      }
      if (!lines.length) return undefined;
      const label = refs.length === 1 ? (catalogue(ctx).find((t) => t.ref === refs[0])?.label ?? 'this') : `${refs.length} things`;
      return { label: label.slice(0, 80), of: 'this workspace', lines: lines.slice(0, 12) };
    },
    [R.rep, L.layout, ctx]
  );

  const engine = useEngine({
    R,
    layout: { apply: L.apply, current: L.current },
    nodes: {
      create: async (type, title) => {
        const r = await createNode({ type, title, parentId: null, provenance: { origin: 'human' } });
        return r.ok && r.node ? { ok: true, id: r.node.id } : { ok: false, error: r.error ?? 'Not made.' };
      },
      action: async (id, action, fields) => {
        const r = await nodeAction(id, action, fields ?? {});
        return r.ok ? { ok: true } : { ok: false, error: r.error ?? undefined };
      },
      link: async (from, to, kind) => {
        const r = await link(from, to, kind);
        return r.ok ? { ok: true } : { ok: false, error: r.error ?? undefined };
      },
      unlink: async (from, to) => {
        const rel = relations.find((x) => (x.from_id === from && x.to_id === to) || (x.from_id === to && x.to_id === from));
        if (!rel) return { ok: true };
        const r = await unlink(rel.id);
        return r.ok ? { ok: true } : { ok: false, error: r.error ?? undefined };
      },
      titleOf: (id) => nodeById(id)?.title ?? '',
    },
    ui,
    ask: (text, refs) => o.think(text, aboutOf(refs), refs, 'instruction'),
  });

  /** Run a plan, asking first when it says to; say what happened, with Undo. */
  const runPlan = useCallback(
    async (plan: Plan, by: 'person' | 'ai' = 'person', confirmed = false): Promise<boolean> => {
      const r = await engine.run(plan, { by, confirmed });
      if (r.confirm) {
        setNote({ summary: r.confirm, confirm: { yes: () => (setNote(null), void runPlan(plan, by, true)), no: () => setNote(null) } });
        return false;
      }
      if (!r.ok) {
        setNote({ summary: r.error ?? 'That could not be done.' });
        return false;
      }
      if (r.label && !plan.ask) setNote({ summary: r.label, undoable: !!r.recorded });
      if (plan.result?.length) touch(plan.result);
      return true;
    },
    [engine, touch]
  );

  /** What was typed in the Smart Omnibox: a command here, or something for the intelligence layer. */
  const submit = useCallback(
    (text: string, mentions: Mention[]) => {
      const m = mentions.map((x) => ({ label: x.label, ref: x.kind === 'source' ? `s:${x.id}` : x.kind === 'component' ? `r:${x.id}` : x.kind === 'group' ? `g:${x.id}` : `n:${x.id}` }));
      const pointed = pointing ? [{ label: pointing.label, ref: pointing.ref }] : [];
      const c: WorkspaceCtx = { ...ctx, mentions: [...m, ...pointed], ...(pointing && !sel.length ? { selection: [pointing.ref] } : {}) };
      const r = interpret(text, c);
      setPointing(null);
      if (r.kind === 'plan') return void runPlan(r.plan);
      if (r.kind === 'unclear') {
        const cands = (r.candidates ?? []).map((ref) => ({ ref, label: catalogue(c).find((t) => t.ref === ref)?.label ?? ref }));
        return setNote({ summary: cands.length ? `${r.why} Which one?` : r.why, ...(cands.length ? { candidates: cands } : {}) });
      }
      const refs = [...new Set([...m.map((x) => x.ref), ...pointed.map((p) => p.ref)])];
      o.think(text, pointing ? pointing.about : aboutOf(refs.length ? refs : sel), refs.length ? refs : sel, r.kind);
    },
    [ctx, pointing, sel, runPlan, aboutOf, o]
  );

  /** The assistant's commands: planned by the same rules, run as its changes (undoable), destructive ones asked first. */
  const runFromModel = useCallback(
    async (commands: unknown[]) => {
      // what the turn itself made is placed first, so the commands can name it
      await new Promise((r) => window.setTimeout(r, 300));
      for (const c of commands.slice(0, 12)) {
        const p = planFromModel(c, ctxRef.current);
        if ('error' in p) continue;
        await runPlan(p, 'ai');
        await new Promise((r) => window.setTimeout(r, 0));
      }
    },
    [runPlan]
  );

  const act = useCallback(
    (a: Act) => {
      if (a.kind === 'view') return void runPlan({ label: `Showed ${catalogue(ctx).find((t) => t.ref === a.ref)?.label ?? 'it'} ${a.view.label.toLowerCase()}`, rep: [{ op: 'view', id: a.ref.slice(2), as: a.view.as, ...(a.view.x ? { x: a.view.x } : {}), ...(a.view.y ? { y: a.view.y } : {}) }], result: [a.ref] });
      if (a.kind === 'ask') return o.think(a.text, aboutOf(a.refs), a.refs, 'instruction');
      if (a.kind === 'make') return;
      const cmd = commandById(a.id);
      if (!cmd) return;
      const p = cmd.plan(ctx, { refs: sel, target: sel[0], ...(a.args ?? {}) });
      if ('error' in p) return setNote({ summary: p.error });
      void runPlan(p);
    },
    [ctx, sel, runPlan, aboutOf, o]
  );

  const makeAt = useCallback(
    (kind: string, at?: { x: number; y: number }, text = '') => {
      const needsWords = ['thought', 'text', 'question', 'unknown', 'hypothesis', 'observation', 'caveat'].includes(kind);
      const p = commandById('create')!.plan(ctx, { kind, text: text || (needsWords ? (kind === 'question' ? 'A question' : kind === 'thought' ? 'A thought' : 'Something to say') : ''), ...(at ? { at } : {}) });
      if ('error' in p) return setNote({ summary: p.error });
      void runPlan(p).then((ok) => ok && p.result?.[0] && needsWords && setInspect({ ref: p.result[0] }));
    },
    [ctx, runPlan]
  );

  // ── shortcuts: the same commands from the keyboard ──
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      const mod = e.metaKey || e.ctrlKey;
      const run = (id: string, args: Record<string, unknown> = {}) => {
        const cmd = commandById(id);
        if (!cmd) return;
        e.preventDefault();
        const p = cmd.plan(ctx, { refs: sel, target: sel[0], ...args });
        if ('error' in p) return setNote({ summary: p.error });
        void runPlan(p);
      };
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) return run('undo');
      if ((mod && e.key.toLowerCase() === 'z' && e.shiftKey) || (mod && e.key.toLowerCase() === 'y')) return run('redo');
      if (mod && e.key.toLowerCase() === 'g' && !e.shiftKey && sel.length) return run('group');
      if (mod && e.key.toLowerCase() === 'g' && e.shiftKey && sel.some((r) => r.startsWith('g:'))) return run('ungroup', { target: sel.find((r) => r.startsWith('g:')) });
      if (mod && e.key.toLowerCase() === 'd' && sel.some((r) => r.startsWith('r:'))) return run('duplicate');
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        return select(catalogue(ctx).map((x) => x.ref).filter((r) => L.layout.items[r] || r.startsWith('g:')));
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) return run('delete');
      if (e.key === 'Escape') {
        if (filter) return setFilter(null);
        if (sel.length) return setSel([]);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [ctx, sel, runPlan, select, filter, L.layout.items]);

  // ── what to draw ──
  const hidden = useMemo(() => hiddenBy(L.layout), [L.layout]);
  const tileIds = useMemo(() => tiles(L.layout), [L.layout]);
  const freshOf = (id: string) => (Date.now() - R.fresh.at < 4000 ? (R.fresh.added.has(id) ? 'added' : R.fresh.revised.has(id) ? 'revised' : null) : null);
  /** classes saying which groups an object sits in, so a frame moves its members */
  const classOf = useCallback((ref: string) => groupsAround(L.layout, ref).map((g) => `in-${g}`).join(' '), [L.layout]);

  const objects: CanvasObject[] = useMemo(() => {
    const out: CanvasObject[] = [];
    for (const it of R.rep.items) {
      const ref = repRef(it.id);
      if (hidden.has(ref)) continue;
      out.push({
        ref,
        width: estimateSize(it).w,
        label: spokenOf(it),
        connectable: true,
        className: `is-rep is-rep-${it.kind} ${classOf(ref)}`,
        content: (
          <RepObject
            item={it}
            model={model}
            fresh={freshOf(it.id)}
            selected={sel.includes(ref)}
            run={(ops) => R.modelEdit(ops, (entry) => engine.record(entry.summary, entry.id, 'person'))}
            onSource={openSource}
            sourceName={sourceName}
          />
        ),
      });
    }
    for (const gid of tileIds) {
      const ref = `g:${gid}`;
      const g = L.layout.groups?.[gid];
      const members = membersOf(L.layout, gid).filter((r) => r.startsWith('r:'));
      const kinds = members.map((r) => itemById(R.rep, r.slice(2))?.kind ?? '').filter(Boolean);
      const what = contentsInWords(kinds, words);
      out.push({
        ref,
        width: 240,
        label: `Group${g?.name ? ` ${g.name}` : ''}, collapsed: ${what}`,
        className: `is-group-tile ${classOf(ref)}`,
        content: (
          <div className="nl-gtile" data-drag>
            <div className="nl-gtile-name">{g?.name || 'A group'}</div>
            <div className="nl-gtile-what">{what || 'Empty'}</div>
            <button type="button" className="nl-linkish" onClick={() => void runPlan(commandById('expand')!.plan(ctx, { target: ref }) as Plan)}>
              Expand
            </button>
          </div>
        ),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [R.rep, R.fresh, model, sel, hidden, tileIds, L.layout, classOf, sourceName, openSource]);

  /** the layout with each collapsed group's tile where its members are */
  const shownLayout: CanvasLayout = useMemo(() => {
    if (!tileIds.length) return L.layout;
    const items = { ...L.layout.items };
    for (const gid of tileIds) {
      const members = membersOf(L.layout, gid);
      const xs = members.map((r) => L.layout.items[r]).filter(Boolean);
      if (xs.length) items[`g:${gid}`] = { x: Math.min(...xs.map((p) => p.x)), y: Math.min(...xs.map((p) => p.y)) };
    }
    return { ...L.layout, items };
  }, [L.layout, tileIds]);
  const tilePlaces = useMemo(() => Object.fromEntries(Object.entries(shownLayout.items).filter(([r]) => r.startsWith('g:'))), [shownLayout]);

  const frames: CanvasFrame[] = useMemo(
    () =>
      framesOf(L.layout).flatMap((gid): CanvasFrame[] => {
        const box = groupBounds(L.layout, gid, sizeOf);
        const g = L.layout.groups?.[gid];
        return box ? [{ id: gid, box, label: g?.name || `${membersOf(L.layout, gid).length} together`, depth: groupsAround(L.layout, membersOf(L.layout, gid, false)[0] ?? '').length, selected: sel.includes(`g:${gid}`) }] : [];
      }),
    [L.layout, sizeOf, sel]
  );

  /** an object hidden in a collapsed group is drawn as that group's tile (connections too) */
  const shownRef = useCallback((ref: string) => (hidden.has(ref) ? `g:${hidden.get(ref)}` : ref), [hidden]);
  const lines: CanvasLine[] = useMemo(() => {
    const out: CanvasLine[] = [];
    const seen = new Set<string>();
    for (const r of R.rep.relations) {
      const from = shownRef(repRef(r.from)), to = shownRef(repRef(r.to));
      if (from === to || seen.has(`${from}>${to}`)) continue;
      seen.add(`${from}>${to}`);
      out.push({ id: `rel-${r.id}`, from, to, label: r.label || REL_WORD[r.kind], style: r.status === 'established' ? 'solid' : 'dashed', quiet: true });
    }
    // computational links (what a variable drives, what an equation defines), drawn only for the selection
    const selIds = new Set(sel.filter((x) => x.startsWith('r:')).map((x) => x.slice(2)));
    if (selIds.size)
      for (const l of linksOf(model.comp)) {
        if (!selIds.has(l.from) && !selIds.has(l.to)) continue;
        const from = shownRef(repRef(l.from)), to = shownRef(repRef(l.to));
        if (from !== to) out.push({ id: `calc-${l.from}-${l.to}`, from, to, label: l.via ? `${l.via}` : 'computes', style: 'dotted', quiet: true });
      }
    return out;
  }, [R.rep.relations, shownRef, sel, model.comp]);

  const dimmed = useMemo(() => {
    if (!filter) return undefined;
    const keep = new Set(filter.refs);
    // a group shown when something in it is
    for (const r of filter.refs) for (const g of groupsAround(L.layout, r)) keep.add(`g:${g}`);
    const all = [...Object.keys(L.layout.items), ...tileIds.map((g) => `g:${g}`)];
    return new Set(all.filter((r) => !keep.has(r)));
  }, [filter, L.layout, tileIds]);

  const canvasProps = {
    selection: sel,
    onSelectMany: (refs: string[], how: 'toggle' | 'add' | 'replace') => select(refs, how),
    onMoveMany: (refs: string[], dx: number, dy: number) => {
      const p = movePatch(L.current(), refs, dx, dy);
      if (p) void engine.run({ label: `Moved ${refs.length} things`, layout: p, result: refs });
    },
    frames,
    onFrameMove: (gid: string, dx: number, dy: number) => {
      const p = movePatch(L.current(), [`g:${gid}`], dx, dy);
      if (p) void engine.run({ label: 'Moved the group', layout: p, result: [`g:${gid}`] });
    },
    onFrameSelect: (gid: string) => select([`g:${gid}`]),
    onContext: (ref: string | null, screen: { x: number; y: number }, at: { x: number; y: number }) => {
      if (ref && !sel.includes(ref)) setSel([ref]);
      if (!ref) setSel([]);
      setMenu({ screen, at });
    },
    dimmed,
  };

  /** a single object moved by dragging: through the engine (so undo reaches it); a tile moves its whole group */
  const onMove = useCallback(
    (ref: string, x: number, y: number) => {
      const was = L.current().items[ref];
      if (ref.startsWith('g:')) {
        const at = shownLayout.items[ref];
        const p = at ? movePatch(L.current(), [ref], x - at.x, y - at.y) : null;
        if (p) void engine.run({ label: 'Moved the group', layout: p, result: [ref] });
        return;
      }
      if (!was || (was.x === x && was.y === y)) return;
      void engine.run({ label: 'Moved it', layout: { items: { [ref]: { x, y } } }, result: [ref] });
    },
    [L, shownLayout, engine]
  );

  const mentionables: Mention[] = useMemo(
    () => [
      ...R.rep.items.map((it) => ({ kind: 'component' as const, id: it.id, label: (it.text || KIND_WORD[it.kind]).slice(0, 80), hint: it.kind === 'variable' && it.prim.type === 'control' ? `Variable ${it.prim.data.variable}` : KIND_WORD[it.kind] })),
      ...Object.entries(L.layout.groups ?? {}).map(([gid, g]) => ({ kind: 'group' as const, id: gid, label: g.name || 'A group', hint: 'Group' })),
    ],
    [R.rep.items, L.layout.groups]
  );
  const slash = useMemo(() => {
    const s = selInfo(ctx);
    return SLASH.filter((x) => !x.available || x.available(ctx, s)).map((x) => ({ name: x.name, hint: x.hint, now: ['undo', 'group', 'connect', 'transform', 'source'].includes(x.name) }));
  }, [ctx]);

  const primary = sel.length === 1 ? sel[0] : null;
  const inspected = inspect?.ref ?? (primary && primary.startsWith('r:') ? primary : null);
  const selItem = inspected?.startsWith('r:') ? itemById(R.rep, inspected.slice(2)) : undefined;
  const anchor = inspected && typeof document !== 'undefined' ? document.querySelector<HTMLElement>(`[data-ref="${CSS.escape(inspected)}"]`) : null;

  // backlinks: everything that points at an item — connections, the model computing from it, nodes kept from it,
  // other workspaces holding it
  const backlinksOf = useCallback(
    (it: RepItem) => {
      const out: { label: string; ref?: string; href?: string }[] = [];
      for (const r of R.rep.relations) if (r.to === it.id || r.from === it.id) {
        const other = itemById(R.rep, r.to === it.id ? r.from : r.to);
        if (other) out.push({ label: `${other.text || KIND_WORD[other.kind]} — ${r.to === it.id ? `${REL_WORD[r.kind]} it` : `it ${REL_WORD[r.kind]} this`}`, ref: repRef(other.id) });
      }
      for (const l of linksOf(model.comp)) if (l.from === it.id) {
        const other = itemById(R.rep, l.to);
        if (other) out.push({ label: `${other.text || KIND_WORD[other.kind]} — computed from it${l.via ? ` (${l.via})` : ''}`, ref: repRef(other.id) });
      }
      for (const m of R.rep.items) if (m.kind === 'metric' && m.expr && it.kind === 'variable' && it.prim.type === 'control' && new RegExp(`(^|[^A-Za-z0-9_])${it.prim.data.variable}([^A-Za-z0-9_]|$)`).test(m.expr)) out.push({ label: `${m.text} — measured from it`, ref: repRef(m.id) });
      if (it.kept) {
        const n = nodeById(it.kept);
        if (n) {
          out.push({ label: `Kept in the workspace as ${n.type === 'knowledge' ? 'knowledge' : n.type}: ${n.title}`, href: `/new-logos/n/${encodeURIComponent(n.id)}` });
          const parent = n.parent_id ? nodeById(n.parent_id) : undefined;
          if (parent) out.push({ label: `Shown in the workspace ‘${parent.title}’`, href: `/new-logos/w/${encodeURIComponent(parent.id)}` });
          for (const rel of relations.filter((x) => x.to_id === n.id || x.from_id === n.id)) {
            const other = nodeById(rel.to_id === n.id ? rel.from_id : rel.to_id);
            if (other) out.push({ label: `${other.type === 'decision' ? 'A decision relies on it' : 'Connected'}: ${other.title}`, href: `/new-logos/n/${encodeURIComponent(other.id)}` });
          }
        }
      }
      return out;
    },
    [R.rep, model.comp, nodeById, relations]
  );

  const overlays: ReactNode = (
    <>
      <ActionBar ctx={ctx} onAct={act} hidden={!!menu || !!connecting || !!focusItem} />
      {menu ? <ContextMenu ctx={ctx} screen={menu.screen} onAct={act} onMake={(k) => makeAt(k, menu.at)} onClose={() => setMenu(null)} /> : null}
      {connecting ? (
        <RepConnectChooser
          screen={connecting.screen}
          onClose={() => setConnecting(null)}
          onPick={(kind, status) => {
            const c = connecting;
            setConnecting(null);
            const p = commandById('connect')!.plan(ctx, { from: c.from, to: c.to, kind, status, direct: true });
            if ('error' in p) return setNote({ summary: p.error });
            void runPlan(p);
          }}
        />
      ) : null}
      {selItem && !focusItem && !menu ? (
        <RepInspector
          item={selItem}
          rep={R.rep}
          anchor={anchor}
          busy={o.busy}
          backlinks={backlinksOf(selItem)}
          openBacklinks={inspect?.section === 'backlinks'}
          onClose={() => (setSel([]), setInspect(null))}
          change={(ops, summary) => void runPlan({ label: summary ?? 'Changed', rep: ops, result: [repRef(selItem.id)] })}
          onSelect={(id) => (select([repRef(id)]), o.setFocus({ ref: repRef(id), nonce: Date.now(), ifHidden: true }))}
          onAskAbout={(it) => (setPointing({ ref: repRef(it.id), label: (it.text || KIND_WORD[it.kind]).slice(0, 60), about: aboutOf([repRef(it.id)]) as About }), setSel([]))}
          onAnswer={(it, answer) => {
            void runPlan({ label: `Answered ‘${it.text.slice(0, 40)}’`, rep: [{ op: 'answer', id: it.id, answer }], result: [repRef(it.id)] }).then(() => o.think(answer, aboutOf([repRef(it.id)]), [repRef(it.id)], 'question'));
            setSel([]);
          }}
          onKeep={(it, as) => void keepItem(it, as)}
          onFocus={(it) => setFocusItem(it.id)}
          onSource={openSource}
          sourceName={sourceName}
          onNavigate={(href) => router.push(href)}
        />
      ) : null}
      {focusItem && itemById(R.rep, focusItem) ? (
        <RepFocus
          it={itemById(R.rep, focusItem) as RepItem}
          rep={R.rep}
          model={model}
          run={(ops) => R.modelEdit(ops, (entry) => engine.record(entry.summary, entry.id, 'person'))}
          onClose={() => setFocusItem(null)}
          onSelect={(id) => setFocusItem(id)}
          onSource={openSource}
          sourceName={sourceName}
        />
      ) : null}
      {filter ? (
        <div className="nl-rfilter nl-cv-ui" role="status">
          <span>Showing {filter.label ? `what relates to ${filter.label}` : 'a part'}</span>
          <button type="button" className="nl-linkish" onClick={() => setFilter(null)}>
            Show everything
          </button>
        </div>
      ) : null}
      {o.working ? <Working text={o.working.text} onStop={o.working.stop} /> : note ? <ChangeNote note={note} onUndo={() => void engine.undo(1).then((r) => setNote({ summary: r.ok ? r.label ?? 'Undone.' : r.error ?? '' }))} onAsk={(t) => submit(t, [])} onHistory={o.openHistory} onClose={() => setNote(null)} onPick={(ref) => (select([ref]), o.setFocus({ ref, nonce: Date.now() }), setNote(null))} /> : null}
    </>
  );

  /** Keep a component in the workspace as a node: the canonical object other workspaces can show (synchronised). */
  async function keepItem(it: RepItem, as: 'knowledge' | 'question' | 'decision') {
    const title = (it.text || KIND_WORD[it.kind]).slice(0, 200);
    const content =
      as === 'knowledge'
        ? { body: [it.kind === 'hypothesis' ? `A possibility, not established: ${it.text}` : it.text, it.detail].filter(Boolean).join('\n\n'), kind: it.kind === 'observation' ? 'observation' : it.kind === 'hypothesis' ? 'understanding' : 'finding' }
        : as === 'decision'
          ? { rationale: it.detail ?? '' }
          : undefined;
    const r = await createNode({ type: as, title, parentId: o.container ?? null, provenance: { origin: it.by === 'person' ? 'human' : 'ai', ...(o.wsKey.startsWith('c:') ? { conversationId: o.wsKey.slice(2) } : {}), ...(it.turn ? { messageId: it.turn } : {}) }, ...(content ? { content } : {}) });
    if (!r.ok || !r.node) return setNote({ summary: r.error ?? 'Not kept.' });
    const at = L.current().items[repRef(it.id)];
    // one change: the node, the component's link to it, and its place; undoing it archives the node (never deletes)
    const ok = await runPlan({
      label: `Kept ‘${title.slice(0, 40)}’ in the workspace`,
      rep: [{ op: 'keep', id: it.id, node: r.node.id }],
      nodes: [{ do: 'adopt', id: r.node.id }],
      ...(at ? { layout: { items: { [`n:${r.node.id}`]: { x: at.x + sizeOf(repRef(it.id)).w + 40, y: at.y } } } } : {}),
      result: [repRef(it.id)],
    });
    if (!ok) await nodeAction(r.node.id, 'archive');
  }

  return {
    R,
    engine,
    ctx,
    sel,
    select,
    primary,
    objects,
    shownLayout,
    tilePlaces,
    lines,
    hidden,
    classOf,
    canvasProps,
    onMove,
    submit,
    runPlan,
    runFromModel,
    mentionables,
    slash,
    pointing: pointing ? { label: pointing.label } : null,
    unpoint: () => setPointing(null),
    overlays,
    setNote,
    makeAt,
    sizeOf,
    nearRef,
    commands: COMMANDS,
  };
}
