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
import { amend, artboardOf, canRedo, canUndo, commit, emptyState, moveTo, newId, placeNew, type DesignArtboard, type DesignAsset, type DesignDoc, type DesignState } from '@/lib/ux-v0/design/doc';
import { applyHandEdit, labelOf, type HandEdit } from '@/lib/ux-v0/design/elements';
import { runRequest } from '@/lib/ux-v0/design/flow';
import { firstRequest } from '@/lib/ux-v0/design/start';
import { brandForDesign, type BrandForDesign } from '@/lib/ux-v0/design/brand';
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
import { assetData, browserBench, parseHtml, routeTransport } from './runtime';
import './design.css';

type Busy = { phase: 'writing' | 'looking' | 'fixing'; say: string; started: number } | null;

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
  const assetsKey = s.assets.map((a) => a.id).join(',');
  const [assets, setAssets] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let live = true;
    void assetData(cur.current.design!.assets).then((m) => live && setAssets(m));
    return () => {
      live = false;
    };
  }, [assetsKey]);
  const assetsNow = useCallback(() => assetData(cur.current.design!.assets), []);
  const [brand, setBrand] = useState<BrandForDesign | null>(null);
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

  const ask = useCallback(
    async (words: string, o: { selection?: boolean; picture?: boolean } = {}) => {
      if (abort.current) return;
      const st = cur.current.design!;
      setError(null);
      setDraft('');
      const a = artboardOf(st.doc, sel.artboard);
      const useSel = o.selection !== false && !!a;
      const selection = useSel ? { artboard: a!.id, element: sel.element, label: sel.element && pick ? labelOf({ id: pick.id, tag: pick.tag, text: pick.text, classes: pick.classes, style: '' }) : `artboard “${a!.name}”` } : null;
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
      const out = await runRequest(before, { words, selection, answering, system: brand ? { name: brand.name, rules: brand.rules } : null, withPicture: !!selection && (o.picture ?? looky) }, transport, bench, {
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
    },
    [bench, brand, pick, sel.artboard, sel.element, transport, update]
  );

  // the first design is asked for the moment a project begun in conversation opens
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !signedIn || !brandReady) return;
    const st = cur.current.design!;
    if (st.doc.artboards.length || st.turns.length) return;
    started.current = true;
    if (startIntent?.trim()) void ask(startIntent.trim(), { selection: false });
    else if (st.memory.brief) void ask(firstRequest(st.kind), { selection: false });
  }, [ask, signedIn, startIntent, brandReady]);

  // ── by hand ──
  const lastHand = useRef<{ key: string; at: number } | null>(null);
  const hand = useCallback(
    (artboard: string, e: HandEdit) => {
      const st = cur.current.design!;
      const a = artboardOf(st.doc, artboard);
      if (!a) return;
      const html = applyHandEdit(a.html, e, parseHtml);
      if (html == null || html === a.html) return;
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
    [pick, update]
  );

  const undo = useCallback(() => update((x) => (canUndo(x) ? moveTo(x, x.at - 1) : x)), [update]);
  const redo = useCallback(() => update((x) => (canRedo(x) ? moveTo(x, x.at + 1) : x)), [update]);

  const onFrame = useCallback(
    (e: FrameEvent) => {
      if (abort.current) return;
      if (e.type === 'select') {
        setSel({ artboard: e.artboard, element: e.pick?.id ?? null });
        setPick(e.pick);
      } else if (e.type === 'move') hand(e.artboard, { op: 'move', id: e.id, dx: e.dx, dy: e.dy });
      else if (e.type === 'text') hand(e.artboard, { op: 'text', id: e.id, text: e.text });
      else if (e.type === 'key') {
        const el = sel.artboard === e.artboard ? sel.element : null;
        if (e.mod && /^z$/i.test(e.key)) (e.shift ? redo : undo)();
        else if (e.mod && /^y$/i.test(e.key)) redo();
        else if (e.mod && /^d$/i.test(e.key) && el) hand(e.artboard, { op: 'duplicate', id: el });
        else if ((e.key === 'Delete' || e.key === 'Backspace') && el) hand(e.artboard, { op: 'remove', id: el });
        else if (e.key === 'Escape') {
          setSel({ artboard: e.artboard, element: null });
          setPick(null);
        } else if (e.key.startsWith('Arrow') && el) {
          const d = e.shift ? 10 : 1;
          hand(e.artboard, { op: 'move', id: el, dx: e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy: e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0 });
        }
      }
    },
    [hand, redo, sel.artboard, sel.element, undo]
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
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [redo, undo]);

  // ── artboards ──
  const setArtboards = (fn: (a: DesignArtboard[]) => DesignArtboard[], said: string) => update((x) => commit(x, { ...x.doc, artboards: fn(x.doc.artboards) }, said, 'person'));
  const menu = (id: string, action: 'duplicate' | 'delete' | 'variations' | 'export') => {
    const a = artboardOf(s.doc, id);
    if (!a) return;
    if (action === 'duplicate') {
      const at = placeNew(s.doc, a.width, a.height, a);
      const copy = { ...a, id: newId('ab'), name: `${a.name} copy`.slice(0, 80), x: at.x, y: at.y };
      setArtboards((list) => [...list, copy], `Duplicated “${a.name}”`);
      setSel({ artboard: copy.id, element: null });
    } else if (action === 'delete') {
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
  const quick = (kind: 'variations' | 'formats' | 'better') => {
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
      const map = await assetData(st.assets);
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

  // ── comments ──
  const comment = (text: string) => {
    if (!sel.artboard) return;
    update((x) => ({ ...x, comments: [...x.comments, { id: newId('c'), artboard: sel.artboard!, element: sel.element, text: text.slice(0, 2000), at: Date.now(), resolved: false }] }));
  };
  const notes = s.comments.filter((c) => !c.resolved);
  const notesBy = useMemo(() => notes.reduce<Record<string, number>>((m, c) => ((m[c.artboard] = (m[c.artboard] ?? 0) + 1), m), {}), [notes]);

  // ── versions, presenting ──
  const [history, setHistory] = useState(false);
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
              <ol className="dx-history">
                {[...s.versions]
                  .map((v, i) => ({ v, i }))
                  .reverse()
                  .map(({ v, i }) => (
                    <li key={i}>
                      <button
                        type="button"
                        className={i === s.at ? 'is-on' : ''}
                        onClick={() => {
                          update((x) => moveTo(x, i));
                          setHistory(false);
                        }}
                      >
                        <span>{v.said || 'A version'}</span>
                        <small>
                          {v.by === 'model' ? 'Designer' : 'You'} · {new Date(v.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </small>
                      </button>
                    </li>
                  ))}
              </ol>
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
