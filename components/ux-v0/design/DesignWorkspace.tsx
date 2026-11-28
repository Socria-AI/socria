'use client';
// components/ux-v0/design/DesignWorkspace.tsx — where a design is made: the conversation, the canvas, the inspector.
//
// The designer writes the design as HTML and CSS (lib/ux-v0/design); it streams onto the canvas as it is written,
// is looked at once when it is new or rewritten, and becomes a version. Anything can then be changed by hand on the
// canvas (select, retype, drag, the inspector) with no model at all, or in words, with or without a selection.
// Every change — the designer's or the person's — is a version: undo, redo and the history move between them.
// Everything is kept on the project in this browser first and, signed in, in the account (lib/ux-v0/store.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { putProject } from '@/lib/ux-v0/store';
import { makeNonce } from '@/lib/ux-v0/sandbox';
import { getSystem } from '@/lib/ux-v0/dsi/store';
import type { DesignProject } from '@/lib/ux-v0/types';
import {
  amend,
  annotate,
  approveArtboard,
  artboardOf,
  canRedo,
  canUndo,
  commit,
  emptyState,
  keepVersion,
  moveTo,
  newId,
  placeNew,
  redoTarget,
  reopenArtboard,
  restoreArtboard,
  undoTarget,
  withArtboardLock,
  withElementLock,
  withState,
  type ArtboardState,
  type DesignArtboard,
  type DesignAsset,
  type DesignDoc,
  type DesignFinding,
  type DesignState,
} from '@/lib/ux-v0/design/doc';
import { applyHandEdit, elementFacts, labelOf, type HandEdit } from '@/lib/ux-v0/design/elements';
import { markFinding, runRequest, runReview } from '@/lib/ux-v0/design/flow';
import { checkLocks } from '@/lib/ux-v0/design/locks';
import { mergePins, pinsFrom } from '@/lib/ux-v0/design/pins';
import { wantsReview } from '@/lib/ux-v0/design/request';
import { firstRequest } from '@/lib/ux-v0/design/start';
import { brandForDesign, type BrandForDesign } from '@/lib/ux-v0/design/brand';
import { getCompany } from '@/lib/ux-v0/company/store';
import { companyTold, libraryFor, libraryPictures, missingFor } from '@/lib/ux-v0/company/told';
import type { Company } from '@/lib/ux-v0/company/schema';
import { SystemBadge } from '../systems/SystemBadge';
import { useLinkedSystem } from '../systems/useLinkedSystem';
import { FORMATS, formatOf, sizeLabel } from '@/lib/ux-v0/design/formats';
import { frameDoc } from '@/lib/ux-v0/design/frame';
import { artboardHtml, artboardPicture, artboardsPdf, artboardSvg, download, embeddedFonts, fileName } from '@/lib/ux-v0/design/export';
import { facesFor } from '@/lib/ux-v0/design/frame';
import { addUpload } from '../uploads';
import { Canvas, fitView, type ElementPick, type FrameEvent, type View } from './Canvas';
import { Inspector } from './Inspector';
import { Chat } from './Chat';
import { CompareModal, HistoryPanel } from './Versions';
import { assetData, browserBench, parseHtml, routeTransport } from './runtime';
import './design.css';

type Busy = { phase: 'writing' | 'looking' | 'fixing' | 'reviewing'; say: string; started: number } | null;

const withDesign = (p: DesignProject): DesignProject => (p.design ? p : { ...p, medium: 'design', design: emptyState('graphic', undefined, p.intent ?? '') });

export function DesignWorkspace({ initial, signedIn, onExit, startIntent }: { initial: DesignProject; signedIn: boolean; onExit: () => void; startIntent?: string }) {
  const [project, setProject] = useState(() => withDesign(initial));
  const s = project.design!;
  const cur = useRef(project);
  cur.current = project;
  const nonce = useMemo(() => makeNonce(), []);

  // ── keeping it ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void putProject(cur.current), 500);
  }, [project]);
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void putProject(cur.current);
    },
    []
  );
  const update = useCallback((fn: (st: DesignState) => DesignState) => setProject((p) => ({ ...p, design: fn(p.design!), updatedAt: Date.now() })), []);

  // ── pictures and the brand ──
  // the project's own, the brand's approved ones, and its company's library: all placed as asset:<id>
  const [brand, setBrand] = useState<BrandForDesign | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  // (the first request waits for the company too, so the first design is made within it)
  const [companyReady, setCompanyReady] = useState(!initial.companyId);
  useEffect(() => {
    let live = true;
    void getCompany(project.companyId)
      .catch(() => null)
      .then((c) => {
        if (!live) return;
        setCompany(c);
        setCompanyReady(true);
      });
    return () => {
      live = false;
    };
  }, [project.companyId]);
  const shared = useMemo(() => {
    const m = new Map<string, DesignAsset>();
    for (const a of [...(brand?.pictures ?? []), ...(company ? libraryPictures(company) : [])]) if (!m.has(a.id)) m.set(a.id, a);
    return [...m.values()];
  }, [brand, company]);
  const sharedRef = useRef(shared);
  sharedRef.current = shared;
  const allAssets = useCallback(() => {
    const own = cur.current.design!.assets;
    return [...own, ...sharedRef.current.filter((x) => !own.some((a) => a.id === x.id))];
  }, []);
  const assetsKey = `${s.assets.map((a) => a.id).join(',')}|${shared.map((a) => a.id).join(',')}`;
  const [assets, setAssets] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let live = true;
    void assetData(allAssets()).then((m) => live && setAssets(m));
    return () => {
      live = false;
    };
  }, [assetsKey, allAssets]);
  const assetsNow = useCallback(() => assetData(allAssets()), [allAssets]);
  /** What a request is told beyond the project: its company, and the pictures of the brand and the library it may use. */
  const beyond = useCallback(
    (words: string) => {
      const lib = new Map<string, { id: string; name: string; width: number; height: number; note?: string }>();
      for (const a of [...(brand?.pictures ?? []), ...(company ? libraryFor(company, words) : [])]) if (!lib.has(a.id)) lib.set(a.id, { id: a.id, name: a.name, width: a.width, height: a.height, note: a.note });
      const absent = company ? missingFor(company, words) : [];
      const told = company ? companyTold(company) : null;
      return { company: told ? { ...told, missing: [...new Set([...absent, ...told.missing])] } : undefined, library: [...lib.values()], absent };
    },
    [brand, company]
  );
  // the first request waits for the system a project is built in, so the first design is made in it
  const [brandReady, setBrandReady] = useState(!initial.systemLink);
  const linked = useLinkedSystem(project.systemLink);
  useEffect(() => {
    const link = project.systemLink;
    if (!link) {
      setBrand(null);
      setBrandReady(true);
      return;
    }
    let live = true;
    void getSystem(link.id)
      .catch(() => null)
      .then((rec) => {
      if (!live) return;
      setBrandReady(true);
      if (!rec) return;
      const b = brandForDesign(rec, link);
      setBrand(b);
      // the system's tokens become the shared styles of a design that has none yet
      if (b && !cur.current.design!.doc.tokens) update((st) => ({ ...st, doc: { ...st.doc, tokens: b.css } }));
    });
    return () => {
      live = false;
    };
  }, [project.systemLink, update]);

  // ── selection, the view ──
  const [sel, setSel] = useState<{ artboard: string | null; element: string | null }>({ artboard: s.doc.artboards[0]?.id ?? null, element: null });
  const [pick, setPick] = useState<ElementPick | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 40, y: 40, k: 0.3 });
  const fit = useCallback((doc?: DesignDoc) => {
    const el = stage.current;
    if (!el) return;
    setView(fitView(doc ?? cur.current.design!.doc, el.clientWidth, el.clientHeight));
  }, []);
  const count = s.doc.artboards.length;
  const fitted = useRef(-1);
  useEffect(() => {
    if (count !== fitted.current) {
      fitted.current = count;
      fit();
    }
  }, [count, fit]);
  const control = useRef<((artboard: string, msg: Record<string, unknown>) => void) | null>(null);

  // ── the designer ──
  const [busy, setBusy] = useState<Busy>(null);
  const [draftDoc, setDraftDoc] = useState<DesignDoc | null>(null);
  const [writing, setWriting] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const abort = useRef<AbortController | null>(null);
  const transport = useMemo(() => routeTransport(project.id), [project.id]);
  const bench = useMemo(() => browserBench(assetsNow), [assetsNow]);

  // something said about what just happened on the canvas (a protected thing left alone), gone after a moment
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tell = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }, []);
  useEffect(() => () => void (noticeTimer.current && clearTimeout(noticeTimer.current)), []);

  // a critical look at the work: findings to apply or set aside, and nothing changed (flow.ts runReview)
  const review = useCallback(
    async (words = '') => {
      if (abort.current) return;
      const st = cur.current.design!;
      const one = artboardOf(st.doc, sel.artboard);
      const ids = one ? [one.id] : st.doc.artboards.slice(-3).map((a) => a.id);
      if (!ids.length) return;
      setError(null);
      setDraft('');
      const ctl = new AbortController();
      abort.current = ctl;
      setBusy({ phase: 'reviewing', say: '', started: Date.now() });
      const more = beyond(words);
      const out = await runReview(st, { words, artboards: ids, system: brand ? { name: brand.name, rules: brand.rules } : null, company: more.company, library: more.library }, transport, bench, { signal: ctl.signal });
      abort.current = null;
      setBusy(null);
      if (out.kind === 'failed') {
        if (words) setDraft(words);
        setError(out.cancelled ? 'Stopped. Nothing changed.' : out.signIn ? 'Sign in to design with SocriaUX. Your work stays in this browser either way.' : out.error);
        return;
      }
      update((x) => ({ ...x, turns: [...x.turns, ...out.state.turns.slice(st.turns.length)] }));
    },
    [bench, beyond, brand, sel.artboard, transport, update]
  );

  const ask = useCallback(
    async (words: string, o: { selection?: boolean; picture?: boolean; target?: { artboard: string; element: string | null }; finding?: string } = {}) => {
      if (abort.current) return;
      const st = cur.current.design!;
      // asked for a judgement of the work, not a change to it: a review
      if (!o.target && st.doc.artboards.length && wantsReview(words)) return review(words);
      setError(null);
      setDraft('');
      const a = artboardOf(st.doc, o.target?.artboard ?? sel.artboard);
      const element = o.target ? o.target.element : sel.element;
      const useSel = o.selection !== false && !!a;
      const selection = useSel ? { artboard: a!.id, element, label: element ? (pick && pick.id === element && !o.target ? labelOf({ id: pick.id, tag: pick.tag, text: pick.text, classes: pick.classes, style: '' }) : labelOf(elementFacts(a!.html, element, parseHtml))) : `artboard “${a!.name}”` } : null;
      const last = st.turns[st.turns.length - 1];
      const answering = last?.role === 'designer' && last.options?.length ? { text: last.text, options: last.options } : null;
      // a change of look travels with a picture of the artboard as it is
      const looky = /\b(feel|look|mood|atmospher|cinematic|premium|sophisticat|better|stronger|bolder|cleaner|minimal|vibe|style|theme|colou?r|warmer|cooler|darker|lighter|elegant|playful|modern|editorial)/i.test(words);
      const ctl = new AbortController();
      abort.current = ctl;
      setBusy({ phase: 'writing', say: '', started: Date.now() });
      // the person's words appear at once
      const pending = { id: newId('t'), role: 'person' as const, text: words, at: Date.now(), ...(selection ? { selection } : {}) };
      update((x) => ({ ...x, turns: [...x.turns, pending] }));
      const before = { ...st };
      const more = beyond(words);
      // what was asked for that the company does not have: said at once, and told to the designer so nothing stands in
      if (more.absent.length) tell(`Not in ${company?.name ?? 'the company'}’s library: ${more.absent.join('; ')}. The designer is told not to invent it.`);
      const out = await runRequest(before, { words, selection, answering, system: brand ? { name: brand.name, rules: brand.rules } : null, withPicture: !!selection && (o.picture ?? looky), company: more.company, library: more.library }, transport, bench, {
        parse: parseHtml,
        signal: ctl.signal,
        onDraft: (doc, ans) => {
          setDraftDoc(doc);
          setBusy((b) => (b ? { ...b, say: ans.say } : b));
          const open = new Set<string>();
          for (const blk of ans.blocks) if (blk.kind === 'artboard' && blk.open) doc.artboards.forEach((x) => !st.doc.artboards.some((y) => y.id === x.id && y.html === x.html) && open.add(x.id));
          setWriting(open);
        },
        onPhase: (ph) => setBusy((b) => (b ? { ...b, phase: ph } : b)),
      });
      abort.current = null;
      setBusy(null);
      setDraftDoc(null);
      setWriting(new Set());
      if (out.kind === 'failed') {
        // the words go back in the composer; the turn shown at once is taken back
        update((x) => ({ ...x, turns: x.turns.filter((t) => t.id !== pending.id) }));
        setDraft(words);
        setError(out.cancelled ? 'Stopped. Nothing changed.' : out.signIn ? 'Sign in to design with SocriaUX. Your work stays in this browser either way.' : out.error);
        return;
      }
      // the outcome's turns already hold the person's words: replace the one shown at once
      update((x) => {
        const kept = x.turns.filter((t) => t.id !== pending.id);
        const added = out.state.turns.slice(before.turns.length);
        return { ...out.state, assets: x.assets, comments: x.comments, turns: [...kept, ...added] };
      });
      if (out.kind === 'done' && out.applied.made.length) {
        setSel({ artboard: out.applied.made[0], element: null });
        setPick(null);
      }
      // a finding is applied when something was really changed for it
      if (o.finding && out.kind === 'done' && (out.applied.touched.length || out.applied.tokensChanged)) update((x) => markFinding(x, o.finding!, 'applied'));
    },
    [bench, beyond, brand, company, pick, review, sel.artboard, sel.element, tell, transport, update]
  );

  // the first design is asked for the moment a project begun in conversation opens
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !signedIn || !brandReady || !companyReady) return;
    const st = cur.current.design!;
    if (st.doc.artboards.length || st.turns.length) return;
    started.current = true;
    if (startIntent?.trim()) void ask(startIntent.trim(), { selection: false });
    else if (st.memory.brief) void ask(firstRequest(st.kind), { selection: false });
  }, [ask, signedIn, startIntent, brandReady, companyReady]);

  // ── by hand ──
  const lastHand = useRef<{ key: string; at: number } | null>(null);
  const hand = useCallback(
    (artboard: string, e: HandEdit) => {
      const st = cur.current.design!;
      const a = artboardOf(st.doc, artboard);
      if (!a) return;
      // what the person protected is not changed by hand either: said, and the frame drawn again as it was
      const refuse = (why: string) => {
        tell(why);
        control.current?.(artboard, { sx: 'redraw' });
      };
      if (a.locked) return refuse(a.state === 'approved' ? `“${a.name}” is approved and locked. Reopen it to change it.` : `“${a.name}” is locked. Unlock it to change it.`);
      const html = applyHandEdit(a.html, e, parseHtml);
      if (html == null || html === a.html) return;
      if (a.locks?.length) {
        const c = checkLocks(a, html, st.doc.tokens, st.doc.tokens, parseHtml);
        if (!c.ok) return refuse(`${c.broken[0][0].toUpperCase()}${c.broken[0].slice(1)} is protected. Unlock it to change it.`);
      }
      const doc = { ...st.doc, artboards: st.doc.artboards.map((x) => (x.id === artboard ? { ...x, html } : x)) };
      const key = `${artboard}:${e.id}:${e.op}${e.op === 'style' ? `:${Object.keys(e.props).join(',')}` : ''}`;
      const recent = lastHand.current && lastHand.current.key === key && Date.now() - lastHand.current.at < 1500 && st.versions[st.at]?.by === 'person';
      update((x) => (recent ? amend(x, doc) : commit(x, doc, `Edited on the canvas${pick && pick.id === e.id ? `: ${labelOf({ id: pick.id, tag: pick.tag, text: pick.text, classes: pick.classes, style: '' })}` : ''}`, 'person')));
      lastHand.current = { key, at: Date.now() };
      if (e.op === 'remove') {
        setSel({ artboard, element: null });
        setPick(null);
      }
    },
    [pick, tell, update]
  );

  /** A key that acts on the selected element (delete, duplicate, nudge), wherever the keyboard's focus is. */
  const keyOnSelection = useCallback(
    (key: string, shift: boolean, mod: boolean): boolean => {
      const el = sel.element;
      if (!sel.artboard || !el) return false;
      if (mod && /^d$/i.test(key)) hand(sel.artboard, { op: 'duplicate', id: el });
      else if (key === 'Delete' || key === 'Backspace') hand(sel.artboard, { op: 'remove', id: el });
      else if (key.startsWith('Arrow')) {
        const d = shift ? 10 : 1;
        hand(sel.artboard, { op: 'move', id: el, dx: key === 'ArrowLeft' ? -d : key === 'ArrowRight' ? d : 0, dy: key === 'ArrowUp' ? -d : key === 'ArrowDown' ? d : 0 });
      } else return false;
      return true;
    },
    [hand, sel.artboard, sel.element]
  );

  // undo: the version this one was made from; redo: the newest made from this one (a branch is never lost)
  const undo = useCallback(() => update((x) => (canUndo(x) ? moveTo(x, undoTarget(x)) : x)), [update]);
  const redo = useCallback(() => update((x) => (canRedo(x) ? moveTo(x, redoTarget(x)) : x)), [update]);

  const onFrame = useCallback(
    (e: FrameEvent) => {
      if (abort.current) return;
      if (e.type === 'select') {
        setSel({ artboard: e.artboard, element: e.pick?.id ?? null });
        setPick(e.pick);
      } else if (e.type === 'move') hand(e.artboard, { op: 'move', id: e.id, dx: e.dx, dy: e.dy });
      else if (e.type === 'text') hand(e.artboard, { op: 'text', id: e.id, text: e.text });
      else if (e.type === 'key') {
        if (e.mod && /^z$/i.test(e.key)) (e.shift ? redo : undo)();
        else if (e.mod && /^y$/i.test(e.key)) redo();
        else if (e.key === 'Escape') {
          setSel({ artboard: e.artboard, element: null });
          setPick(null);
        } else if (sel.artboard === e.artboard) keyOnSelection(e.key, e.shift, e.mod);
      }
    },
    [hand, keyOnSelection, redo, sel.artboard, undo]
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && /^z$/i.test(e.key)) {
        e.preventDefault();
        (e.shiftKey ? redo : undo)();
      } else if (mod && /^y$/i.test(e.key)) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') {
        setSel((x) => ({ ...x, element: null }));
        setPick(null);
      } else if (!abort.current && !document.querySelector('.dx-modal, .dx-present') && keyOnSelection(e.key, e.shiftKey, mod)) e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [keyOnSelection, redo, undo]);

  // ── artboards ──
  const setArtboards = (fn: (a: DesignArtboard[]) => DesignArtboard[], said: string) => update((x) => commit(x, { ...x.doc, artboards: fn(x.doc.artboards) }, said, 'person'));
  const menu = (id: string, action: 'duplicate' | 'delete' | 'variations' | 'export') => {
    const a = artboardOf(s.doc, id);
    if (!a) return;
    if (action === 'duplicate') {
      const at = placeNew(s.doc, a.width, a.height, a);
      // a copy is a new piece of work: it starts unprotected and unapproved
      const { state: _s, locked: _l, locks: _k, ...plain } = a;
      void _s, _l, _k;
      const copy = { ...plain, id: newId('ab'), name: `${a.name} copy`.slice(0, 80), x: at.x, y: at.y };
      setArtboards((list) => [...list, copy], `Duplicated “${a.name}”`);
      setSel({ artboard: copy.id, element: null });
    } else if (action === 'delete') {
      if (a.locked) return tell(`“${a.name}” is ${a.state === 'approved' ? 'approved and ' : ''}locked. ${a.state === 'approved' ? 'Reopen' : 'Unlock'} it first.`);
      setArtboards((list) => list.filter((x) => x.id !== id), `Deleted “${a.name}”`);
      setSel({ artboard: null, element: null });
      setPick(null);
    } else if (action === 'variations') {
      setSel({ artboard: id, element: null });
      void ask(`Make three distinctly different directions for “${a.name}” as new artboards beside it (one group): each a different idea and structure, not a recolour, with the same words.`, { selection: false });
    } else if (action === 'export') {
      setSel({ artboard: id, element: null });
      setPick(null);
    }
  };

  const [formatsFor, setFormatsFor] = useState<string | null>(null);
  const [chosenFormats, setChosenFormats] = useState<string[]>([]);
  const quick = (kind: 'variations' | 'formats' | 'better' | 'review') => {
    if (kind === 'review') return void review();
    const a = artboardOf(s.doc, sel.artboard) ?? s.doc.artboards[s.doc.artboards.length - 1];
    if (!a) return;
    if (kind === 'variations') return menu(a.id, 'variations');
    if (kind === 'formats') {
      setChosenFormats([]);
      return setFormatsFor(a.id);
    }
    setSel({ artboard: a.id, element: null });
    void ask(`Push “${a.name}” further: look at it as a demanding art director would and make it stronger — sharper idea, bolder scale, more considered type — keeping its words and what already works.`, { selection: false, picture: true });
  };
  const adapt = () => {
    const a = artboardOf(s.doc, formatsFor);
    setFormatsFor(null);
    if (!a || !chosenFormats.length) return;
    const list = chosenFormats.map((id) => formatOf(id)).filter(Boolean).map((f) => `${f!.label} (format="${f!.id}")`);
    void ask(`Adapt “${a.name}” to ${list.join(', ')}: one new artboard each, in one group beside it, each recomposed for its own shape — the same idea, words, palette and type, not just resized.`, { selection: false });
  };

  // ── pictures ──
  const attach = async (files: FileList) => {
    const added: DesignAsset[] = [];
    for (const f of Array.from(files).slice(0, 8)) {
      const r = await addUpload(f);
      if (!r.ok) {
        setError(r.error);
        continue;
      }
      added.push({ id: newId('img'), name: r.ref.title || f.name, src: `upload:${r.ref.providerId}`, width: r.ref.width, height: r.ref.height });
    }
    if (!added.length) return;
    update((x) => ({ ...x, assets: [...x.assets, ...added].slice(-60) }));
    setDraft((d) => `${d}${d ? ' ' : ''}(Added ${added.length === 1 ? `a picture: ${added[0].name}` : `${added.length} pictures`}.) `);
  };

  // ── export ──
  const [exporting, setExporting] = useState('');
  const doExport = async (kind: 'png' | 'jpeg' | 'pdf' | 'svg' | 'html', ids?: string[]) => {
    const st = cur.current.design!;
    const boards = (ids ?? (sel.artboard ? [sel.artboard] : st.doc.artboards.map((a) => a.id))).map((id) => artboardOf(st.doc, id)).filter((a): a is DesignArtboard => !!a);
    if (!boards.length) return;
    setExporting(`Exporting ${kind.toUpperCase()}…`);
    try {
      const map = await assetData(allAssets());
      if (kind === 'pdf') {
        const r = await artboardsPdf(boards, st.doc.tokens, map, project.name);
        download(r.blob, `${fileName(project.name)}.pdf`);
      } else
        for (const a of boards) {
          if (kind === 'png' || kind === 'jpeg') {
            const r = await artboardPicture(a, st.doc.tokens, map, { type: kind === 'png' ? 'image/png' : 'image/jpeg', scale: a.medium === 'print' ? 1 : 2 });
            download(r.blob, `${fileName(a.name)}.${kind === 'png' ? 'png' : 'jpg'}`);
          } else if (kind === 'svg') {
            const fonts = await embeddedFonts(facesFor(a, st.doc.tokens).faces);
            download(new Blob([artboardSvg(a, st.doc.tokens, { fontCss: fonts.css, assets: map, background: '#ffffff' })], { type: 'image/svg+xml' }), `${fileName(a.name)}.svg`);
          } else download(new Blob([artboardHtml(a, st.doc.tokens, map)], { type: 'text/html' }), `${fileName(a.name)}.html`);
        }
      setExporting('');
    } catch (e) {
      setExporting('');
      setError(e instanceof Error ? e.message : 'The export could not be made.');
    }
  };

  // ── the person's authority: states, locks, what to keep, findings ──
  const setState = (id: string, state: ArtboardState) => update((x) => annotate(x, withState(x.doc, id, state), 'Changed its status'));
  const approve = (id: string) => {
    update((x) => approveArtboard(x, id));
    const a = artboardOf(s.doc, id);
    if (a) tell(`“${a.name}” is approved and locked. This version is kept in the history for good.`);
  };
  const lockArtboard = (id: string, locked: boolean) => update((x) => annotate(x, withArtboardLock(x.doc, id, locked), locked ? 'Locked an artboard' : 'Unlocked an artboard'));
  const lockElement = (id: string, element: string, what: string | null) => update((x) => annotate(x, withElementLock(x.doc, id, element, what), what === null ? 'Unlocked an element' : 'Locked an element'));
  const keep = (what: 'faces' | 'colours') => {
    const a = artboardOf(s.doc, sel.artboard);
    if (!a) return;
    const pins = pinsFrom(a, s.doc.tokens, what);
    const got = what === 'faces' ? pins.faces ?? [] : pins.colours ?? [];
    if (!got.length) return tell(what === 'faces' ? 'No typeface is named on this artboard to keep.' : 'No colour is written on this artboard to keep.');
    update((x) => ({ ...x, memory: { ...x.memory, pins: mergePins(x.memory.pins, pins) } }));
    tell(what === 'faces' ? `Keeping ${got.join(', ')}: everything made from now on is held to ${got.length === 1 ? 'it' : 'them'}.` : `Keeping these ${got.length} colours, their tints and shades.`);
  };
  const release = (what: 'faces' | 'colours') =>
    update((x) => {
      const { [what]: _gone, ...rest } = x.memory.pins ?? {};
      void _gone;
      const { pins: _p, ...memory } = x.memory;
      void _p;
      return { ...x, memory: Object.keys(rest).length ? { ...memory, pins: rest } : memory };
    });
  const showElement = (artboard: string, element: string | null) => {
    setSel({ artboard, element });
    setPick(null);
    if (element) control.current?.(artboard, { sx: 'select', id: element, report: true });
  };
  const onFinding = (f: DesignFinding, action: 'apply' | 'dismiss' | 'show' | 'reopen') => {
    if (action === 'show') return showElement(f.artboard, f.element);
    if (action === 'dismiss') return update((x) => markFinding(x, f.id, 'dismissed'));
    if (action === 'reopen') return update((x) => markFinding(x, f.id, 'open'));
    // applied: asked of the designer about that element only — a targeted change, never a new design
    showElement(f.artboard, f.element);
    void ask(f.fix, { target: { artboard: f.artboard, element: f.element }, finding: f.id });
  };

  // ── comments ──
  const comment = (text: string) => {
    if (!sel.artboard) return;
    update((x) => ({ ...x, comments: [...x.comments, { id: newId('c'), artboard: sel.artboard!, element: sel.element, text: text.slice(0, 2000), at: Date.now(), resolved: false }] }));
  };
  const notes = s.comments.filter((c) => !c.resolved);
  const notesBy = useMemo(() => notes.reduce<Record<string, number>>((m, c) => ((m[c.artboard] = (m[c.artboard] ?? 0) + 1), m), {}), [notes]);

  // ── versions, presenting ──
  // pictures the design places that this browser does not hold (a library kept on another device): said, not hidden
  const absentPictures = useMemo(() => {
    const out = new Set<string>();
    for (const a of s.doc.artboards) for (const m of a.html.matchAll(/asset:([A-Za-z0-9_-]{1,40})/g)) if (!assets.has(m[1])) out.add(m[1]);
    return out.size;
  }, [s.doc.artboards, assets]);
  const [history, setHistory] = useState(false);
  const [comparing, setComparing] = useState<number | null>(null);
  const [presenting, setPresenting] = useState<number | null>(null);
  const shown = draftDoc ?? s.doc;
  const selArtboard = artboardOf(shown, sel.artboard);

  return (
    <div className="dx sb">
      <header className="dx-head">
        <button type="button" className="dx-home" onClick={onExit} aria-label="All designs">
          <img src="/socria-mark.png" alt="" width={20} height={20} />
          <span>
            Socria<em>UX</em>
          </span>
        </button>
        <input className="dx-name" value={project.name} onChange={(e) => setProject((p) => ({ ...p, name: e.target.value.slice(0, 80), updatedAt: Date.now() }))} aria-label="Design name" />
        <div className="dx-head-r">
          {company && (
            <a className="dx-badge" href={`/ux-v0?company=${company.id}`} title={`Made for ${company.name}: designed within its identity, with its library. Nothing here changes the company.`}>
              For {company.name}
            </a>
          )}
          <SystemBadge
            project={project}
            linked={linked}
            onApply={(fn) => {
              const r = fn(cur.current);
              const turn = { id: newId('t'), role: 'designer' as const, text: r.say, at: Date.now() };
              setProject({ ...r.project, design: { ...r.project.design!, turns: [...r.project.design!.turns, turn] } });
            }}
          />
          <button type="button" className="dx-btn dx-ghost" onClick={undo} disabled={!canUndo(s) || !!busy} title="Undo (⌘Z)">
            Undo
          </button>
          <button type="button" className="dx-btn dx-ghost" onClick={redo} disabled={!canRedo(s) || !!busy} title="Redo (⇧⌘Z)">
            Redo
          </button>
          <div className="dx-pop">
            <button type="button" className="dx-btn dx-ghost" onClick={() => setHistory((h) => !h)} disabled={!s.versions.length} aria-expanded={history}>
              History{s.versions.length ? ` (${s.versions.length})` : ''}
            </button>
            {history && (
              <HistoryPanel
                s={s}
                onOpen={(i) => {
                  update((x) => moveTo(x, i));
                  setHistory(false);
                }}
                onCompare={(i) => {
                  setComparing(i);
                  setHistory(false);
                }}
                onKeep={(i) => update((x) => keepVersion(x, i, 'Kept by you'))}
              />
            )}
          </div>
          <button type="button" className="dx-btn dx-ghost" onClick={() => fit()} disabled={!count}>
            Fit
          </button>
          <span className="dx-zoom">{Math.round(view.k * 100)}%</span>
          <button type="button" className="dx-btn dx-ghost" onClick={() => setPresenting(0)} disabled={!count}>
            Present
          </button>
          <button type="button" className="dx-btn" onClick={() => doExport('pdf', s.doc.artboards.map((a) => a.id))} disabled={!count || !!exporting}>
            {exporting || 'Export PDF'}
          </button>
        </div>
      </header>
      <div className="dx-body">
        <Chat
          turns={s.turns}
          busy={busy}
          selection={selArtboard ? { label: sel.element && pick ? labelOf({ id: pick.id, tag: pick.tag, text: pick.text, classes: pick.classes, style: '' }) : `“${selArtboard.name}”` } : null}
          error={error}
          draft={draft}
          onDraft={setDraft}
          onSend={(w) => void ask(w)}
          onCancel={() => abort.current?.abort()}
          onClearSelection={() => {
            setSel({ artboard: null, element: null });
            setPick(null);
          }}
          onAttach={(f) => void attach(f)}
          onQuick={quick}
          onFinding={onFinding}
          names={Object.fromEntries(s.doc.artboards.map((a) => [a.id, a.name]))}
          hasArtboards={!!count}
          signedIn={signedIn}
        />
        <div ref={stage} className="dx-stage">
          {!shown.artboards.length && !busy && (
            <div className="dx-stage-empty">
              <p>Your design appears here, drawn as it is written.</p>
            </div>
          )}
          {!shown.artboards.length && busy && (
            <div className="dx-stage-empty">
              <p className="dx-shimmer">Designing…</p>
            </div>
          )}
          <Canvas
            doc={shown}
            assets={assets}
            nonce={nonce}
            interactive={!busy}
            writing={writing}
            selected={sel}
            view={view}
            onView={setView}
            onSelectArtboard={(id) => {
              setSel({ artboard: id, element: null });
              setPick(null);
            }}
            onFrame={onFrame}
            onRename={(id, name) => setArtboards((list) => list.map((a) => (a.id === id ? { ...a, name } : a)), `Renamed to “${name}”`)}
            onMenu={menu}
            comments={notesBy}
            control={control}
          />
          {absentPictures > 0 && assets.size + absentPictures > 0 && (
            <div className="dx-warn" role="status">
              {absentPictures === 1 ? 'A picture this design uses is' : `${absentPictures} pictures this design uses are`} not in this browser, so {absentPictures === 1 ? 'it is' : 'they are'} drawn as nothing here. {company ? `Add ${absentPictures === 1 ? 'it' : 'them'} to ${company.name}’s library on this device.` : 'Add the file again to see it.'}
            </div>
          )}
          {notice && (
            <div className="dx-toast" role="status">
              {notice}
            </div>
          )}
        </div>
        <div className="dx-side">
          <Inspector
            pick={sel.element ? pick : null}
            artboard={selArtboard}
            onEdit={(e) => sel.artboard && hand(sel.artboard, e)}
            onParent={() => sel.artboard && control.current?.(sel.artboard, { sx: 'parent' })}
            onAsk={(pre) => setDraft(pre)}
            onFormat={(f) => {
              const a = selArtboard;
              const fmt = formatOf(f);
              if (!a || !fmt || f === a.format) return;
              void ask(`Recompose “${a.name}” as ${fmt.label} (${sizeLabel(fmt)}): rewrite it whole with format="${fmt.id}", the same idea and words, composed for the new shape.`, { selection: false });
            }}
            onExport={(k) => void doExport(k)}
            onComment={comment}
            pins={s.memory.pins}
            busy={!!busy}
            onState={(st) => sel.artboard && setState(sel.artboard, st)}
            onApprove={() => sel.artboard && approve(sel.artboard)}
            onReopen={() => sel.artboard && update((x) => reopenArtboard(x, sel.artboard!))}
            onLockArtboard={(l) => sel.artboard && lockArtboard(sel.artboard, l)}
            onLockElement={(el, what) => sel.artboard && lockElement(sel.artboard, el, what)}
            onKeep={keep}
            onRelease={release}
            onShow={(el) => sel.artboard && showElement(sel.artboard, el)}
            onReview={() => void review()}
          />
          {selArtboard && notes.some((c) => c.artboard === selArtboard.id) && (
            <div className="dx-notes">
              <h4 className="dx-sub">Notes</h4>
              <ul>
                {notes
                  .filter((c) => c.artboard === selArtboard.id)
                  .map((c) => (
                    <li key={c.id}>
                      <p>{c.text}</p>
                      <div className="dx-row">
                        {c.element && (
                          <button type="button" className="dx-btn dx-ghost dx-small" onClick={() => setSel({ artboard: c.artboard, element: c.element })}>
                            Show
                          </button>
                        )}
                        <button type="button" className="dx-btn dx-ghost dx-small" onClick={() => void ask(`Act on this note${c.element ? ` about data-sx="${c.element}"` : ''}: ${c.text}`, { selection: false })}>
                          Ask the designer
                        </button>
                        <button type="button" className="dx-btn dx-ghost dx-small" onClick={() => update((x) => ({ ...x, comments: x.comments.map((y) => (y.id === c.id ? { ...y, resolved: true } : y)) }))}>
                          Resolve
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {formatsFor && (
        <div className="dx-modal" role="dialog" aria-label="Other formats" onClick={(e) => e.target === e.currentTarget && setFormatsFor(null)}>
          <div className="dx-modal-box">
            <h3 className="dx-h">Other formats</h3>
            <p className="dx-muted">Each is recomposed for its own shape, not just resized.</p>
            <div className="dx-formats">
              {FORMATS.filter((f) => f.id !== artboardOf(s.doc, formatsFor)?.format).map((f) => (
                <label key={f.id} className="dx-check">
                  <input type="checkbox" checked={chosenFormats.includes(f.id)} onChange={(e) => setChosenFormats((c) => (e.target.checked ? [...c, f.id] : c.filter((x) => x !== f.id)))} />
                  <span>{f.label}</span>
                  <small>{sizeLabel(f)}</small>
                </label>
              ))}
            </div>
            <div className="dx-row dx-end">
              <button type="button" className="dx-btn dx-ghost" onClick={() => setFormatsFor(null)}>
                Cancel
              </button>
              <button type="button" className="dx-btn dx-primary" onClick={adapt} disabled={!chosenFormats.length}>
                Make {chosenFormats.length || ''} {chosenFormats.length === 1 ? 'artboard' : 'artboards'}
              </button>
            </div>
          </div>
        </div>
      )}

      {comparing != null && s.versions[comparing] && comparing !== s.at && (
        <CompareModal
          s={s}
          other={comparing}
          assets={assets}
          nonce={nonce}
          selected={sel.artboard}
          onOther={setComparing}
          onOpen={(i) => {
            update((x) => moveTo(x, i));
            setComparing(null);
          }}
          onRestore={(id) => {
            const from = comparing;
            update((x) => restoreArtboard(x, from, id));
            setComparing(null);
            const back = s.versions[from]?.doc.artboards.find((a) => a.id === id);
            tell(`Brought back from v${from + 1}${back?.state === 'approved' ? ', approved and locked as it was there' : ''}. Everything else is as it was.`);
          }}
          onClose={() => setComparing(null)}
        />
      )}

      {presenting != null && s.doc.artboards[presenting] && <Present doc={s.doc} at={presenting} assets={assets} nonce={nonce} onAt={setPresenting} />}
    </div>
  );
}

function Present({ doc, at, assets, nonce, onAt }: { doc: DesignDoc; at: number; assets: ReadonlyMap<string, string>; nonce: string; onAt: (i: number | null) => void }) {
  const a = doc.artboards[at];
  const [size, setSize] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1200, h: typeof window !== 'undefined' ? window.innerHeight : 800 });
  useEffect(() => {
    const r = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', r);
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onAt(null);
      else if (e.key === 'ArrowRight' || e.key === ' ') onAt(Math.min(doc.artboards.length - 1, at + 1));
      else if (e.key === 'ArrowLeft') onAt(Math.max(0, at - 1));
    };
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('resize', r);
      window.removeEventListener('keydown', k);
    };
  }, [at, doc.artboards.length, onAt]);
  const k = Math.min((size.w - 80) / a.width, (size.h - 100) / a.height);
  const page = useMemo(() => frameDoc(a, doc.tokens, { parse: parseHtml, nonce, assets, interactive: false }), [a, doc.tokens, nonce, assets]);
  return (
    <div className="dx-present" role="dialog" aria-label="Presentation">
      <div className="dx-present-board" style={{ width: a.width * k, height: a.height * k }}>
        <iframe title={a.name} sandbox="allow-scripts" srcDoc={page} style={{ width: a.width, height: a.height, transform: `scale(${k})`, transformOrigin: '0 0' }} />
      </div>
      <div className="dx-present-bar">
        <button type="button" onClick={() => onAt(Math.max(0, at - 1))} disabled={at === 0}>
          ←
        </button>
        <span>
          {a.name} · {at + 1} / {doc.artboards.length}
        </span>
        <button type="button" onClick={() => onAt(Math.min(doc.artboards.length - 1, at + 1))} disabled={at === doc.artboards.length - 1}>
          →
        </button>
        <button type="button" onClick={() => onAt(null)}>
          Close
        </button>
      </div>
    </div>
  );
}
