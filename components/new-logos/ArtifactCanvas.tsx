'use client';
// components/new-logos/ArtifactCanvas.tsx — AN ARTIFACT'S OWN PLANE: where its primitives are composed.
//
// An artifact is a composition of primitives (text, equations, controls, plots, tables, relationship graphs, diagrams,
// media) and the shared variables they read (lib/new-logos/primitives.ts). Here each primitive is an object on a
// spatial canvas: placed and moved by its head, resized by its corner, selected to show its properties beside the
// canvas, duplicated (⌘/Ctrl+D) and removed (Delete) — every change one validated operation, undoable (⌘/Ctrl+Z).
// The references between primitives (a control drives an equation, an equation feeds a plot, a table supplies data, a
// note annotates a figure) are drawn as faint lines; selecting one names them.
//
// The artifact exists on its own — in the matrix as an artifact node, independent of any conversation — and can be
// opened from wherever it is referenced; where it sits there (a conversation's or an objective's canvas) is that
// canvas's business. Where its primitives sit is part of the artifact.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inverseBatch, type ArtifactOp } from '@/lib/new-logos/artifact-ops';
import { evaluateScope, linksOf, summarize, type PrimitiveLink } from '@/lib/new-logos/compose';
import { placeNear, type CanvasLayout } from '@/lib/new-logos/canvas';
import { EMPTY_COMPOSITION, PRIMITIVE_LABEL, freeName, newPrimitive, newPrimitiveId, sanitizeComposition, type PrimitiveType } from '@/lib/new-logos/primitives';
import { useNL } from './state';
import { Canvas, type CanvasLine, type CanvasObject } from './canvas/Canvas';
import { WorkspaceFrame } from './canvas/Frame';
import { useCanvasLayout } from './canvas/useLayout';
import { Inspector, VariablesPanel } from './primitives/Inspector';
import { Palette } from './primitives/Palette';
import { PrimitiveFrame } from './primitives/Primitive';
import { uploadImage } from './primitives/media-client';
import { Crumbs, InlineText } from './ui';

const pref = (id: string) => `p:${id}`;
const LINK_WORD: Record<PrimitiveLink['kind'], string> = { drives: 'moves', defines: 'gives', data: 'data', annotates: 'about' };
/** Operations that continue one gesture (a slider held, a primitive dragged) are one step to undo. */
const gestureKey = (ops: ArtifactOp[]) => (ops.length === 1 ? (ops[0].op === 'var.set' ? `set:${ops[0].name}` : ops[0].op === 'move' || ops[0].op === 'resize' ? `${ops[0].op}:${ops[0].id}` : '') : '');

interface Step {
  undo: ArtifactOp[];
  redo: ArtifactOp[];
  at: number;
  key: string;
}

export function ArtifactCanvas({ id }: { id: string }) {
  const { loaded, nodes, setup, artifactOps, artifactSaving, nodeAction, say } = useNL();
  const node = nodes.find((n) => n.id === id && n.type === 'artifact');
  const L = useCanvasLayout(node ? `a:${id}` : null);
  const comp = useMemo(() => (node ? sanitizeComposition(node.content) : EMPTY_COMPOSITION), [node]);
  const scope = useMemo(() => evaluateScope(comp), [comp]);
  const links = useMemo(() => linksOf(comp), [comp]);
  const [selected, setSelected] = useState<string | null>(null);
  const [palette, setPalette] = useState<{ at: { x: number; y: number }; screen: { x: number; y: number } } | null>(null);
  const [panel, setPanel] = useState<'variables' | null>(null);
  const [showRefs, setShowRefs] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  // a primitive just put down (or duplicated) is brought into view, wherever there was room for it
  const [focus, setFocus] = useState<{ ref: string; nonce: number } | null>(null);
  const [, setTick] = useState(0);
  const undoStack = useRef<Step[]>([]);
  const redoStack = useRef<Step[]>([]);
  const compRef = useRef(comp);
  compRef.current = comp;
  const archived = !!node && node.archived_at !== null;

  useEffect(() => {
    if (node) document.title = `${node.title} · Workspace`;
  }, [node]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  /** Apply operations, keeping the step to undo them (a continuing gesture keeps its first step). */
  const run = useCallback(
    (ops: ArtifactOp[], history = true): boolean => {
      if (archived) return false;
      const before = compRef.current;
      const inverse = history ? inverseBatch(before, ops) : [];
      if (!artifactOps(id, ops)) return false;
      if (history && inverse.length) {
        const key = gestureKey(ops);
        const last = undoStack.current[undoStack.current.length - 1];
        if (key && last && last.key === key && Date.now() - last.at < 1500) {
          last.at = Date.now();
          last.redo = ops;
        } else {
          undoStack.current.push({ undo: inverse, redo: ops, at: Date.now(), key });
          if (undoStack.current.length > 100) undoStack.current.shift();
        }
        redoStack.current = [];
        setTick((t) => t + 1);
      }
      return true;
    },
    [artifactOps, id, archived]
  );
  const undo = useCallback(() => {
    const step = undoStack.current.pop();
    if (!step) return;
    if (artifactOps(id, step.undo)) redoStack.current.push(step);
    setTick((t) => t + 1);
  }, [artifactOps, id]);
  const redo = useCallback(() => {
    const step = redoStack.current.pop();
    if (!step) return;
    if (artifactOps(id, step.redo)) undoStack.current.push({ ...step, at: 0 });
    setTick((t) => t + 1);
  }, [artifactOps, id]);

  const layout: CanvasLayout = useMemo(() => ({ items: Object.fromEntries(comp.primitives.map((p) => [pref(p.id), { x: p.x, y: p.y }])), view: L.layout.view }), [comp, L.layout.view]);
  const sizeOf = useCallback((ref: string) => {
    const p = compRef.current.primitives.find((x) => pref(x.id) === ref);
    return p ? { w: p.w, h: p.h } : { w: 300, h: 132 };
  }, []);

  const centre = () => {
    const v = layout.view ?? { x: 0, y: 0, k: 1 };
    const sx = window.innerWidth / 2, sy = window.innerHeight / 2;
    return { at: { x: (sx - v.x) / v.k - 160, y: (sy - 48 - v.y) / v.k - 80 }, screen: { x: sx - 150, y: sy - 160 } };
  };

  const add = (type: PrimitiveType, at: { x: number; y: number }) => {
    const p = newPrimitive(type, at);
    const spot = placeNear(layout, at, { w: p.w, h: p.h }, sizeOf);
    p.x = spot.x;
    p.y = spot.y;
    const ops: ArtifactOp[] = [];
    if (p.type === 'control') {
      const name = freeName(compRef.current);
      ops.push({ op: 'var.add', variable: { name, value: 1, min: 0, max: 10, step: 0.1, kind: 'number' } });
      p.data = { ...p.data, variable: name };
    }
    ops.push({ op: 'add', primitive: p as unknown as Record<string, unknown> });
    if (run(ops)) {
      setSelected(pref(p.id));
      setFocus({ ref: pref(p.id), nonce: Date.now() });
    }
    return p;
  };

  const addImages = async (files: File[], at: { x: number; y: number }) => {
    const images = files.filter((f) => f.type.startsWith('image/')).slice(0, 6);
    if (!images.length) return say('Only images can be put on an artifact.');
    for (const [k, f] of images.entries()) {
      const p = add('media', { x: at.x + k * 32, y: at.y + k * 32 });
      setToast('Keeping the image…');
      try {
        const kept = await uploadImage(f);
        run([{ op: 'update', id: p.id, data: { src: { kind: 'upload', id: kept.id }, alt: f.name.replace(/\.[a-z0-9]+$/i, '') } }], false);
        setToast(null);
      } catch (e) {
        setToast(e instanceof Error ? e.message : 'The image could not be kept.');
      }
    }
  };

  const remove = (pid: string) => {
    const p = compRef.current.primitives.find((x) => x.id === pid);
    if (!p) return;
    if (run([{ op: 'remove', id: pid }])) {
      setSelected(null);
      setToast(`${p.label || PRIMITIVE_LABEL[p.type]} removed.`);
    }
  };
  const duplicate = (pid: string) => {
    const as = newPrimitiveId();
    if (run([{ op: 'duplicate', id: pid, as, dx: 32, dy: 32 }])) {
      setSelected(pref(as));
      setFocus({ ref: pref(as), nonce: Date.now() });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
    const mod = e.metaKey || e.ctrlKey;
    const pid = selected?.slice(2);
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (mod && e.key.toLowerCase() === 'd' && pid) {
      e.preventDefault();
      duplicate(pid);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && pid && !e.defaultPrevented) {
      e.preventDefault();
      remove(pid);
    }
  };

  if (!loaded) return <main className="nl-page"><p className="nl-hint">Loading…</p></main>;
  if (setup === false || !node)
    return (
      <main className="nl-page is-narrow">
        <Crumbs nodes={nodes} at={null} current="Not found" />
        <div className="nl-empty">This artifact does not exist, or it is not on this account.</div>
      </main>
    );

  const selPrim = selected ? comp.primitives.find((p) => pref(p.id) === selected) : undefined;
  const related = new Set<string>();
  if (selPrim) for (const l of links) if (l.from === selPrim.id) related.add(l.to);
    else if (l.to === selPrim.id) related.add(l.from);

  const objects: CanvasObject[] = comp.primitives.map((p) => ({
    ref: pref(p.id),
    width: p.w,
    height: p.h,
    resizable: !archived,
    label: `${PRIMITIVE_LABEL[p.type]}${p.label ? `: ${p.label}` : ''}`,
    className: `is-prim${related.has(p.id) ? ' is-related' : ''}`,
    content: (
      <div className="nl-prim-hold" onPointerDownCapture={() => selected !== pref(p.id) && setSelected(pref(p.id))}>
        <PrimitiveFrame head={archived ? 'plain' : 'drag'} p={p} comp={comp} scope={scope} editable={!archived} selected={selected === pref(p.id)} related={related.has(p.id)} run={run} />
      </div>
    ),
  }));
  const lines: CanvasLine[] = showRefs
    ? links.map((l) => {
        const touches = selPrim && (l.from === selPrim.id || l.to === selPrim.id);
        return { id: `${l.from}-${l.to}-${l.kind}`, from: pref(l.from), to: pref(l.to), label: touches ? `${LINK_WORD[l.kind]}${l.via ? ` ${l.via}` : ''}` : '', style: l.kind === 'annotates' ? ('dashed' as const) : ('dotted' as const) };
      })
    : [];
  const saving = artifactSaving[id];

  return (
    <div className="nl-art" onKeyDown={onKeyDown} onPaste={(e) => {
      const t = e.target as HTMLElement;
      if (archived || t.closest('input, textarea, [contenteditable="true"], .nl-prim-media')) return;
      const files = [...e.clipboardData.files];
      if (files.some((f) => f.type.startsWith('image/'))) {
        e.preventDefault();
        void addImages(files, centre().at);
      }
    }}>
      <WorkspaceFrame
        onAdd={archived ? undefined : () => setPalette(centre())}
        header={
          <>
            <Crumbs nodes={nodes} at={node.parent_id} current={node.title} />
            <div className="nl-row nl-ws-title">
              <InlineText
                value={node.title}
                label="Artifact"
                className="nl-ws-title-input"
                onSave={async (t) => {
                  const r = await nodeAction(id, 'update', { title: t });
                  if (!r.ok) say(r.error ?? null);
                }}
              />
            </div>
            <div className="nl-row nl-hint">
              <span>Artifact · {summarize(comp)}</span>
              <span className="nl-art-saving" role="status" aria-live="polite">
                {archived ? 'Archived: restore it to change it' : saving === 'retrying' ? 'Not saved yet, trying again' : saving ? 'Saving…' : 'Saved'}
              </span>
              <Link className="nl-btn is-quiet is-small" href={`/new-logos/n/${encodeURIComponent(id)}`}>
                Details
              </Link>
            </div>
          </>
        }
        tools={
          <>
            <button type="button" className="nl-btn is-small" aria-pressed={panel === 'variables'} onClick={() => setPanel(panel === 'variables' ? null : 'variables')}>
              Variables{comp.variables.length ? ` (${comp.variables.length})` : ''}
            </button>
            <button type="button" className="nl-btn is-small" aria-pressed={showRefs} onClick={() => setShowRefs(!showRefs)} title="Lines between primitives that depend on one another">
              References
            </button>
            <button type="button" className="nl-btn is-small" disabled={!undoStack.current.length || archived} onClick={undo} aria-label="Undo">
              Undo
            </button>
            <button type="button" className="nl-btn is-small" disabled={!redoStack.current.length || archived} onClick={redo} aria-label="Redo">
              Redo
            </button>
          </>
        }
      >
        {L.loaded ? (
          <Canvas
            objects={objects}
            lines={lines}
            layout={layout}
            selected={selected}
            onSelect={(ref) => {
              setSelected(ref);
              if (ref && panel === 'variables') setPanel(null);
            }}
            onMove={(ref, x, y) => run([{ op: 'move', id: ref.slice(2), x, y }])}
            onResize={(ref, w, h) => run([{ op: 'resize', id: ref.slice(2), w, h }])}
            onView={L.setView}
            onCreateAt={archived ? undefined : (at, screen) => setPalette({ at, screen })}
            onDropFiles={archived ? undefined : (files, at) => void addImages(files, at)}
            focus={focus}
            empty={
              <div>
                <p>This artifact is empty.</p>
                <p className="nl-hint">Double-click anywhere, or use Add, to put down text, an equation, a control, a plot, a table, a relationship graph, a diagram or an image. Primitives that read the same variables update together.</p>
              </div>
            }
          />
        ) : (
          <p className="nl-hint" style={{ padding: 24 }}>
            Loading…
          </p>
        )}
        {palette ? (
          <Palette
            screen={palette.screen}
            onClose={() => setPalette(null)}
            onPick={(t) => {
              const at = palette.at;
              setPalette(null);
              add(t, at);
            }}
          />
        ) : null}
        {panel === 'variables' ? (
          <VariablesPanel comp={comp} run={run} onClose={() => setPanel(null)} />
        ) : selPrim && !archived ? (
          <Inspector p={selPrim} comp={comp} scope={scope} run={run} onClose={() => setSelected(null)} onDuplicate={() => duplicate(selPrim.id)} onRemove={() => remove(selPrim.id)} />
        ) : null}
        {toast ? (
          <div className="nl-art-toast nl-cv-ui" role="status">
            <span>{toast}</span>
            {undoStack.current.length && /removed/.test(toast) ? (
              <button type="button" className="nl-btn is-small" onClick={() => (undo(), setToast(null))}>
                Undo
              </button>
            ) : null}
          </div>
        ) : null}
      </WorkspaceFrame>
    </div>
  );
}
