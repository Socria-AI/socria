'use client';

// components/ux-v0/graphics/CeilingPanels.tsx — the expanded vocabulary by hand: a library of shapes and patterns with
// search, and the inspector's sections for what an object can now be (parameters, paint, strokes, compositing,
// effects, type beyond the basics, picture adjustments, vector operations, operations on several objects).
//
// Every control here writes one document operation (lib/ux-v0/graphics/doc.ts): one change, one step of history,
// refused whole when something is locked. Every capability the AI can use is here too, so nothing needs a model.

import { useEffect, useMemo, useRef, useState } from 'react';
import { fontAxes } from '@/lib/ux-v0/fonts';
import { isLocked, newId, type Artboard, type GraphicDoc, type Located, type Node, type Op, type Paint, type ShapeNode, type Stroke, type TextNode } from '@/lib/ux-v0/graphics/doc';
import { EFFECTS, EFFECT_BY_KIND, EFFECT_CATEGORIES, EFFECT_PRESETS, effectDefaults, type Effect } from '@/lib/ux-v0/graphics/effects';
import { pathD, primDefaults, primPath, PRIM_CATEGORIES, PRIMITIVES, PRIMITIVE_BY_KIND, type ParamSpec } from '@/lib/ux-v0/graphics/geometry';
import { GRADIENT_PRESETS, harmonies, parseColor, tintPreset, type Gradient } from '@/lib/ux-v0/graphics/paint';
import { isPxParam, PATTERN_BY_KIND, PATTERN_CATEGORIES, PATTERNS, patternDefaults, patternParams, runPattern } from '@/lib/ux-v0/graphics/patterns';
import { searchCapabilities } from '@/lib/ux-v0/graphics/capabilities';
import { embedSvg, importSvg } from '@/lib/ux-v0/graphics/svgimport';
import { fitToPath, type Measure } from '@/lib/ux-v0/graphics/text';

type OnOps = (ops: Op[], label: string) => void;
const r2 = (v: number) => Math.round(v * 100) / 100;

// ── small controls ──

function NumField({ label, value, min, max, step = 1, onCommit, suffix }: { label: string; value: number; min?: number; max?: number; step?: number; onCommit: (v: number) => void; suffix?: string }) {
  const [v, setV] = useState(String(r2(value)));
  useEffect(() => setV(String(r2(value))), [value]);
  const commit = () => {
    const n = Number(v);
    if (!Number.isFinite(n)) return setV(String(r2(value)));
    const c = Math.max(min ?? -1e6, Math.min(max ?? 1e6, n));
    if (Math.abs(c - value) > 1e-9) onCommit(c);
    else setV(String(r2(value)));
  };
  return (
    <label className="gx-num">
      <span>{label}</span>
      <input type="number" value={v} step={step} min={min} max={max} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      {suffix && <em>{suffix}</em>}
    </label>
  );
}

function ColourField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  return (
    <label className="gx-colour">
      <span>{label}</span>
      <input type="color" value={(parseColor(value) ?? '#000000').slice(0, 7)} onChange={(e) => onCommit(e.target.value)} aria-label={label} />
      <code>{(parseColor(value) ?? value).slice(0, 7)}</code>
    </label>
  );
}

/** A parameter list (a primitive's, a generator's, an effect's) as fields: a slider and its number. */
function ParamFields({ specs, values, onCommit, idPrefix }: { specs: readonly ParamSpec[]; values: Record<string, number>; onCommit: (key: string, v: number) => void; idPrefix: string }) {
  return (
    <div className="gx-params">
      {specs.map((q) => {
        const v = values[q.key] ?? q.def;
        return (
          <label key={q.key} className="gx-param">
            <span>{q.label}</span>
            <input type="range" min={q.min} max={q.max} step={q.step} value={v} aria-label={`${q.label}`} id={`${idPrefix}-${q.key}`} onChange={(e) => onCommit(q.key, Number(e.target.value))} />
            <output htmlFor={`${idPrefix}-${q.key}`}>{r2(v)}</output>
          </label>
        );
      })}
    </div>
  );
}

/** A section that opens and closes under the designer's hand (its first state from what the object has), not with
 * every change to the object. */
function More({ initial, summary, children }: { initial: boolean; summary: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <details className="gx-more" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}

// ── the library ──

const LIB_CATS = [...PRIM_CATEGORIES.map((c) => [c.id, c.label] as const), ['procedural', 'Procedural'] as const, ['custom', 'Custom'] as const];

function PrimPreview({ kind }: { kind: string }) {
  const d = useMemo(() => pathD(primPath(primDefaults(kind)!, 40, 40)), [kind]);
  const spec = PRIMITIVE_BY_KIND.get(kind);
  return (
    <svg viewBox="-2 -2 44 44" width="40" height="40" aria-hidden="true">
      <path d={d} fill={spec?.stroked ? 'none' : 'currentColor'} stroke={spec?.stroked ? 'currentColor' : 'none'} strokeWidth={1.4} fillRule={spec?.evenodd ? 'evenodd' : 'nonzero'} />
    </svg>
  );
}
function PatternPreview({ gen }: { gen: string }) {
  const paths = useMemo(() => {
    const p = { ...patternDefaults(gen)! };
    for (const k of Object.keys(p)) if (isPxParam(gen, k)) p[k] = p[k] * 0.32;
    return runPattern(gen, p, 44, 44, 2);
  }, [gen]);
  return (
    <svg viewBox="0 0 44 44" width="40" height="40" aria-hidden="true">
      <g transform={`translate(${paths.frame.x} ${paths.frame.y}) rotate(${paths.frame.rotation} ${paths.frame.w / 2} ${paths.frame.h / 2})`}>
        {paths.paths.map((p, i) => (p.stroke !== undefined ? <path key={i} d={p.d} fill="none" stroke={p.ink ? 'var(--sb-accent, #c2410c)' : 'currentColor'} strokeWidth={Math.max(0.6, p.stroke)} /> : <path key={i} d={p.d} fill={p.ink ? 'var(--sb-accent, #c2410c)' : 'currentColor'} />))}
      </g>
    </svg>
  );
}

/** The categorised library of shapes and patterns, with search, and what is brought in from elsewhere (SVG). */
export function ShapeLibrary({ board, doc, onOps, onNote }: { board: Artboard; doc: GraphicDoc; onOps: OnOps; onNote?: (text: string) => void }) {
  const [cat, setCat] = useState<string>('basic');
  const [q, setQ] = useState('');
  const [paste, setPaste] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const u = Math.min(board.width, board.height) / 100;
  const t = doc.tokens.colors;
  const addPrim = (kind: string) => {
    const spec = PRIMITIVE_BY_KIND.get(kind);
    const s = u * 26;
    const node = { id: newId('s'), type: 'shape', shape: 'prim', prim: primDefaults(kind), role: 'motif', name: spec?.label ?? 'Shape', x: board.width / 2 - s / 2, y: board.height / 2 - s / 2, w: s, h: s, rotation: 0, opacity: 1, ...(spec?.stroked ? { fill: null, stroke: { color: t.text, width: Math.max(1.2, u * 0.4), cap: 'round', join: 'round' } } : { fill: t.accent }) };
    onOps([{ op: 'add', artboard: board.id, node }], `${spec?.label ?? 'a shape'} added`);
  };
  const addPattern = (gen: string) => {
    const p = { ...patternDefaults(gen)! };
    const k = Math.min(board.width, board.height) / 1080;
    for (const key of Object.keys(p)) if (isPxParam(gen, key)) p[key] = r2(p[key] * k);
    const node = { id: newId('p'), type: 'pattern', gen, params: p, colors: [t.text, t.accent, doc.tokens.accent2 ?? t.muted], role: 'motif', name: PATTERN_BY_KIND.get(gen)?.label ?? 'Pattern', x: board.safe, y: board.safe, w: board.width - board.safe * 2, h: (board.height - board.safe * 2) / 2, rotation: 0, opacity: 1 };
    onOps([{ op: 'add', artboard: board.id, node, index: 0 }], `${PATTERN_BY_KIND.get(gen)?.label ?? 'a pattern'} added (behind everything)`);
  };
  const addPath = () => {
    const node = { id: newId('s'), type: 'shape', shape: 'bezier', role: 'motif', name: 'Path', x: board.width / 2 - u * 15, y: board.height / 2 - u * 10, w: u * 30, h: u * 20, rotation: 0, opacity: 1, fill: null, stroke: { color: t.text, width: Math.max(1.5, u * 0.5), cap: 'round', join: 'round' }, bez: { subpaths: [{ closed: false, nodes: [{ x: 0, y: 70, out: [25, 0] }, { x: 50, y: 50, in: [35, 100], out: [65, 0], smooth: true }, { x: 100, y: 30, in: [75, 100] }] }] } };
    onOps([{ op: 'add', artboard: board.id, node }], 'a path added (double-click it to edit its nodes)');
  };
  const bringSvg = (text: string, name: string) => {
    try {
      const target = { x: board.safe, y: board.safe, w: board.width - board.safe * 2, h: board.height - board.safe * 2 };
      const r = importSvg(text, target, { name, idPrefix: `sv${Date.now().toString(36).slice(-4)}` });
      if (!r.group || r.preferEmbed) {
        const em = embedSvg(text);
        const asset = { id: newId('a'), kind: 'image', src: em.src, width: em.width, height: em.height, name, source: 'upload' };
        const k = Math.min(target.w / em.width, target.h / em.height, 1);
        onOps([{ op: 'asset', asset }, { op: 'add', artboard: board.id, node: { id: newId('i'), type: 'image', asset: asset.id, fit: 'contain', name, x: target.x, y: target.y, w: em.width * k, h: em.height * k, rotation: 0, opacity: 1 } }], `${name} embedded as a picture (it uses what cannot be edited here: ${r.notes.slice(0, 1).join('') || 'nothing editable'})`);
        return;
      }
      onOps([...r.assets.map((a) => ({ op: 'asset', asset: a }) as Op), { op: 'add', artboard: board.id, node: r.group }], `${name} imported as editable objects: ${r.stats.paths} paths, ${r.stats.texts} texts, ${r.stats.images} pictures${r.notes.length ? ` (${r.notes.length} note${r.notes.length > 1 ? 's' : ''})` : ''}`);
      if (r.notes.length) onNote?.(r.notes.join(' '));
    } catch (e) {
      onNote?.((e as Error).message);
    }
  };
  const found = q.trim() ? searchCapabilities(q, ['primitive', 'pattern'], 40) : null;
  const prims = found ? found.filter((c) => c.kind === 'primitive').map((c) => c.id) : PRIMITIVES.filter((p) => p.category === cat).map((p) => p.kind);
  const pats = found ? found.filter((c) => c.kind === 'pattern').map((c) => c.id) : cat === 'procedural' ? PATTERNS.map((p) => p.kind) : [];
  return (
    <section className="gx-panel" aria-label="Shape library">
      <p className="gx-panel-h">Shapes and patterns</p>
      <input className="gx-search" type="search" placeholder="Search: “ribbon”, “dense rays”, “contours”…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search shapes and patterns" />
      {!found && (
        <div className="gx-cats" role="tablist" aria-label="Categories">
          {LIB_CATS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={cat === id} className={cat === id ? 'is-on' : ''} onClick={() => setCat(id)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {!found && cat === 'procedural' && <p className="v0-quiet">Generators: every one seeded and editable as parameters, redrawn the same every time.</p>}
      <div className="gx-lib">
        {prims.map((k) => (
          <button key={k} type="button" title={PRIMITIVE_BY_KIND.get(k)?.label} aria-label={`Add ${PRIMITIVE_BY_KIND.get(k)?.label}`} onClick={() => addPrim(k)}>
            <PrimPreview kind={k} />
            <span>{PRIMITIVE_BY_KIND.get(k)?.label}</span>
          </button>
        ))}
        {pats.map((g) => (
          <button key={g} type="button" title={PATTERN_BY_KIND.get(g)?.label} aria-label={`Add ${PATTERN_BY_KIND.get(g)?.label} pattern`} onClick={() => addPattern(g)}>
            <PatternPreview gen={g} />
            <span>{PATTERN_BY_KIND.get(g)?.label}</span>
          </button>
        ))}
      </div>
      {found && !prims.length && !pats.length && <p className="v0-quiet">Nothing by that name; try another word.</p>}
      {!found && cat === 'custom' && (
        <div className="gx-custom">
          <button type="button" onClick={addPath}>A Bézier path</button>
          <button type="button" onClick={() => file.current?.click()}>Import SVG…</button>
          <input ref={file} type="file" accept=".svg,image/svg+xml" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) bringSvg(await f.text(), f.name.replace(/\.svg$/i, ''));
            e.target.value = '';
          }} />
          <label className="gx-text">
            <span>Or paste SVG code</span>
            <textarea rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="<svg …>…</svg>" />
          </label>
          <button type="button" disabled={!paste.trim()} onClick={() => (bringSvg(paste, 'Pasted SVG'), setPaste(''))}>Import the pasted SVG</button>
          <p className="v0-quiet">Paths, shapes, text, pictures and groups become editable objects; scripts and external references are never brought in. A drawing that leans on filters or masks is embedded whole instead, as a picture.</p>
        </div>
      )}
    </section>
  );
}

// ── paint ──

const blank = (c: string): Gradient => ({ type: 'linear', angle: 90, stops: [{ at: 0, color: c }, { at: 1, color: '#ffffff' }] });

/** A fill: a colour (with harmonies to choose from) or a gradient of any kind, with its stops, angle, centre, repeat
 * and interpolation; presets tinted to the palette. */
export function PaintEditor({ label, paint, onCommit, doc, allowNone = true }: { label: string; paint: Paint | null; onCommit: (p: Paint | null, what: string) => void; doc: GraphicDoc; allowNone?: boolean }) {
  const kind = paint === null ? 'none' : typeof paint === 'string' ? 'solid' : paint.type;
  const base = typeof paint === 'string' ? paint : paint && paint.type !== 'mesh' ? paint.stops[0]?.color ?? doc.tokens.colors.accent : doc.tokens.colors.accent;
  const g = paint && typeof paint === 'object' ? paint : null;
  const setKind = (k: string) => {
    if (k === 'none') return onCommit(null, 'no fill');
    if (k === 'solid') return onCommit(base, 'solid fill');
    if (k === 'mesh') return onCommit({ type: 'mesh', angle: 0, stops: [], mesh: [base, doc.tokens.colors.background, doc.tokens.accent2 ?? doc.tokens.colors.muted, doc.tokens.colors.text] }, 'mesh gradient');
    const stops = g && g.stops.length >= 2 ? g.stops : blank(base).stops;
    onCommit({ type: k as Gradient['type'], angle: g?.angle ?? (k === 'linear' ? 90 : 0), stops, ...(k === 'radial' || k === 'conic' ? { cx: 0.5, cy: 0.5 } : {}), ...(k === 'radial' ? { r: 0.6 } : {}) }, `${k} gradient`);
  };
  const put = (next: Partial<Gradient>, what: string) => g && onCommit({ ...g, ...next } as Gradient, what);
  const harm = typeof paint === 'string' ? harmonies(paint) : null;
  return (
    <div className="gx-paint">
      <label className="gx-sel-field">
        <span>{label}</span>
        <select className="v0-select" value={kind} onChange={(e) => setKind(e.target.value)}>
          {allowNone && <option value="none">None</option>}
          <option value="solid">Colour</option>
          <option value="linear">Linear gradient</option>
          <option value="radial">Radial gradient</option>
          <option value="conic">Conic gradient</option>
          <option value="mesh">Mesh gradient</option>
        </select>
      </label>
      {typeof paint === 'string' && (
        <>
          <ColourField label={label} value={paint} onCommit={(v) => onCommit(v, 'colour')} />
          <div className="gx-swatches" aria-label="The design's colours">
            {[...new Set([...Object.values(doc.tokens.colors), doc.tokens.accent2 ?? '', ...(doc.swatches ?? [])].filter(Boolean))].slice(0, 12).map((c) => (
              <button key={c} type="button" style={{ background: c }} title={c} aria-label={`Use ${c}`} onClick={() => onCommit(c, 'colour')} />
            ))}
          </div>
          {harm && (
            <More initial={false} summary={<>Harmonies</>}>
              {Object.entries(harm).map(([name, list]) => (
                <div key={name} className="gx-harmony">
                  <span>{name}</span>
                  {list.map((c, i) => (
                    <button key={i} type="button" style={{ background: c }} title={c} aria-label={`${name} ${c}`} onClick={() => onCommit(c, `${name} colour`)} />
                  ))}
                </div>
              ))}
            </More>
          )}
        </>
      )}
      {g && g.type !== 'mesh' && (
        <>
          <ol className="gx-stops">
            {g.stops.map((s, i) => (
              <li key={i}>
                <input type="color" value={s.color.slice(0, 7)} aria-label={`Stop ${i + 1} colour`} onChange={(e) => put({ stops: g.stops.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) }, 'gradient stop')} />
                <input type="range" min={0} max={100} value={Math.round(s.at * 100)} aria-label={`Stop ${i + 1} position`} onChange={(e) => put({ stops: g.stops.map((x, j) => (j === i ? { ...x, at: Number(e.target.value) / 100 } : x)).sort((p, q) => p.at - q.at) }, 'gradient stop')} />
                <button type="button" className="gx-icon" aria-label={`Remove stop ${i + 1}`} disabled={g.stops.length <= 2} onClick={() => put({ stops: g.stops.filter((_, j) => j !== i) }, 'stop removed')}>✕</button>
              </li>
            ))}
          </ol>
          <div className="gx-btns">
            <button type="button" disabled={g.stops.length >= 16} onClick={() => put({ stops: [...g.stops, { at: 1, color: g.stops[g.stops.length - 1].color }].sort((p, q) => p.at - q.at) }, 'stop added')}>Add a stop</button>
            <button type="button" onClick={() => put({ stops: g.stops.map((s) => ({ ...s, at: 1 - s.at })).reverse() }, 'gradient reversed')}>Reverse</button>
          </div>
          <div className="gx-grid2">
            <NumField label="Angle" value={g.angle} min={-360} max={360} onCommit={(v) => put({ angle: v }, 'gradient angle')} suffix="°" />
            {(g.type === 'radial' || g.type === 'conic') && (
              <>
                <NumField label="Centre X" value={Math.round((g.cx ?? 0.5) * 100)} min={-100} max={200} onCommit={(v) => put({ cx: v / 100 }, 'gradient centre')} suffix="%" />
                <NumField label="Centre Y" value={Math.round((g.cy ?? 0.5) * 100)} min={-100} max={200} onCommit={(v) => put({ cy: v / 100 }, 'gradient centre')} suffix="%" />
              </>
            )}
            {g.type === 'radial' && <NumField label="Radius" value={Math.round((g.r ?? 0.6) * 100)} min={5} max={300} onCommit={(v) => put({ r: v / 100 }, 'gradient radius')} suffix="%" />}
            {g.type === 'conic' && <NumField label="Turns" value={g.turns ?? 1} min={1} max={12} onCommit={(v) => put({ turns: Math.round(v) }, 'gradient turns')} />}
            {(g.type === 'linear' || g.type === 'radial') && (
              <label className="gx-sel-field">
                <span>Repeat</span>
                <select className="v0-select" value={g.repeat ?? 'none'} onChange={(e) => put({ repeat: e.target.value as Gradient['repeat'], period: g.period ?? 0.2 }, 'gradient repeat')}>
                  <option value="none">No</option>
                  <option value="repeat">Repeat</option>
                  <option value="reflect">Reflect</option>
                </select>
              </label>
            )}
            {g.repeat && g.repeat !== 'none' && <NumField label="Period" value={Math.round((g.period ?? 0.2) * 100)} min={2} max={100} onCommit={(v) => put({ period: v / 100 }, 'gradient period')} suffix="%" />}
            <NumField label="Opacity" value={Math.round((g.opacity ?? 1) * 100)} min={0} max={100} onCommit={(v) => put({ opacity: v / 100 }, 'gradient opacity')} suffix="%" />
            <label className="gx-check">
              <input type="checkbox" checked={g.space === 'linear'} onChange={(e) => put({ space: e.target.checked ? 'linear' : 'srgb' }, 'gradient interpolation')} /> Linear light
            </label>
          </div>
        </>
      )}
      {g && g.type === 'mesh' && (
        <>
          <div className={`gx-mesh is-${(g.mesh ?? []).length === 9 ? 3 : 2}`}>
            {(g.mesh ?? []).map((c, i) => (
              <input key={i} type="color" value={c.slice(0, 7)} aria-label={`Mesh colour ${i + 1}`} onChange={(e) => put({ mesh: (g.mesh ?? []).map((x, j) => (j === i ? e.target.value : x)) }, 'mesh colour')} />
            ))}
          </div>
          <button type="button" className="sb-link is-meta" onClick={() => put({ mesh: (g.mesh ?? []).length === 9 ? (g.mesh ?? []).filter((_, i) => [0, 2, 6, 8].includes(i)) : [g.mesh![0], g.mesh![0], g.mesh![1], g.mesh![2], g.mesh![0], g.mesh![1], g.mesh![2], g.mesh![3], g.mesh![3]] }, 'mesh grid')}>
            {(g.mesh ?? []).length === 9 ? 'A 2 × 2 mesh' : 'A 3 × 3 mesh'}
          </button>
        </>
      )}
      <label className="gx-sel-field">
        <span>Presets</span>
        <select className="v0-select" value="" onChange={(e) => {
          const p = GRADIENT_PRESETS.find((x) => x.id === e.target.value.replace(/^tint:/, ''));
          if (p) onCommit(e.target.value.startsWith('tint:') ? tintPreset(p.paint, doc.tokens.colors.accent) : p.paint, `${p.label}`);
        }}>
          <option value="">Choose a preset…</option>
          {GRADIENT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
          {GRADIENT_PRESETS.map((p) => (
            <option key={`t${p.id}`} value={`tint:${p.id}`}>{p.label}, in the accent’s hue</option>
          ))}
        </select>
      </label>
    </div>
  );
}

// ── effects ──

/** An object's effect stack: each effect on or off, reordered, removed, its parameters and colours; presets. */
export function EffectsStack({ node, board, onCommit }: { node: Node; board: Artboard; onCommit: (effects: Effect[] | null, what: string) => void }) {
  const list = node.effects ?? [];
  const [open, setOpen] = useState<number | null>(null);
  const k = Math.min(board.width, board.height) / 1080;
  const sized = (e: Effect): Effect => ({ ...e, params: Object.fromEntries(Object.entries(e.params).map(([key, v]) => [key, ['dx', 'dy', 'blur', 'spread', 'width', 'radius', 'distance', 'depth', 'offset'].includes(key) ? r2(v * k) : v])) });
  const write = (next: Effect[], what: string) => onCommit(next.length ? next : null, what);
  return (
    <div className="gx-fx">
      <ul className="gx-fx-list" aria-label="Effects, applied from the top">
        {list.map((e, i) => {
          const spec = EFFECT_BY_KIND.get(e.kind);
          return (
            <li key={`${e.kind}${i}`} className={e.on ? '' : 'is-off'}>
              <div className="gx-fx-row">
                <label className="gx-check">
                  <input type="checkbox" checked={e.on} onChange={() => write(list.map((x, j) => (j === i ? { ...x, on: !x.on } : x)), `${spec?.label ?? e.kind} ${e.on ? 'off' : 'on'}`)} aria-label={`${spec?.label} on`} /> {spec?.label ?? e.kind}
                </label>
                <span className="gx-fx-acts">
                  <button type="button" className="gx-icon" aria-label={`Move ${spec?.label} up`} disabled={i === 0} onClick={() => write(list.map((x, j) => (j === i - 1 ? list[i] : j === i ? list[i - 1] : x)), 'effects reordered')}>↑</button>
                  <button type="button" className="gx-icon" aria-label={`Move ${spec?.label} down`} disabled={i === list.length - 1} onClick={() => write(list.map((x, j) => (j === i + 1 ? list[i] : j === i ? list[i + 1] : x)), 'effects reordered')}>↓</button>
                  <button type="button" className="gx-icon" aria-label={`Settings for ${spec?.label}`} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>⚙</button>
                  <button type="button" className="gx-icon" aria-label={`Remove ${spec?.label}`} onClick={() => write(list.filter((_, j) => j !== i), `${spec?.label} removed`)}>✕</button>
                </span>
              </div>
              {open === i && spec && (
                <div className="gx-fx-body">
                  <ParamFields specs={spec.params} values={e.params} idPrefix={`fx${i}`} onCommit={(key, v) => write(list.map((x, j) => (j === i ? { ...x, params: { ...x.params, [key]: v } } : x)), `${spec.label}: ${key}`)} />
                  {(spec.colors ?? []).map((c) => (
                    <ColourField key={c.key} label={c.label} value={e[c.key] ?? c.def} onCommit={(v) => write(list.map((x, j) => (j === i ? { ...x, [c.key]: v } : x)), `${spec.label}: ${c.label.toLowerCase()}`)} />
                  ))}
                  <p className="v0-quiet">{spec.says}.</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="gx-grid2">
        <label className="gx-sel-field">
          <span>Add</span>
          <select className="v0-select" value="" onChange={(e) => {
            const fx = effectDefaults(e.target.value);
            if (fx) write([...list, sized(fx)], `${EFFECT_BY_KIND.get(fx.kind)?.label} added`);
          }}>
            <option value="">An effect…</option>
            {EFFECT_CATEGORIES.map((c) => (
              <optgroup key={c.id} label={c.label}>
                {EFFECTS.filter((x) => x.category === c.id).map((x) => (
                  <option key={x.kind} value={x.kind}>{x.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="gx-sel-field">
          <span>Presets</span>
          <select className="v0-select" value="" onChange={(e) => {
            const p = EFFECT_PRESETS.find((x) => x.id === e.target.value);
            if (p) write([...list, ...p.effects.map(sized)], `${p.label} preset`);
          }}>
            <option value="">A preset…</option>
            {EFFECT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="v0-quiet">Effects never change the object: switch them off, reorder or remove them at any time. They export as they show.</p>
    </div>
  );
}

// ── strokes ──

function StrokeFields({ label, stroke, onCommit, onRemove }: { label: string; stroke: Stroke; onCommit: (s: Stroke) => void; onRemove?: () => void }) {
  return (
    <div className="gx-stroke">
      <div className="gx-grid2">
        <ColourField label={label} value={stroke.color} onCommit={(v) => onCommit({ ...stroke, color: v })} />
        <NumField label={label} value={stroke.width} min={0.25} max={200} step={0.25} onCommit={(v) => onCommit({ ...stroke, width: v })} />
        <label className="gx-sel-field">
          <span>Ends</span>
          <select className="v0-select" value={stroke.cap ?? 'butt'} onChange={(e) => onCommit({ ...stroke, cap: e.target.value as Stroke['cap'] })}>
            <option value="butt">Flat</option>
            <option value="round">Round</option>
            <option value="square">Square</option>
          </select>
        </label>
        <label className="gx-sel-field">
          <span>Joins</span>
          <select className="v0-select" value={stroke.join ?? 'miter'} onChange={(e) => onCommit({ ...stroke, join: e.target.value as Stroke['join'] })}>
            <option value="miter">Mitre</option>
            <option value="round">Round</option>
            <option value="bevel">Bevel</option>
          </select>
        </label>
        <label className="gx-text">
          <span>Dashes</span>
          <input defaultValue={(stroke.dash ?? []).join(' ')} placeholder="e.g. 8 4" onBlur={(e) => {
            const dash = e.target.value.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0);
            onCommit({ ...stroke, dash: dash.length && dash.some((n) => n > 0) ? dash : undefined });
          }} />
        </label>
        {onRemove && (
          <button type="button" className="sb-link is-meta" onClick={onRemove}>Remove this stroke</button>
        )}
      </div>
    </div>
  );
}

// ── the expanded inspector ──

const WARPS = ['wave', 'rise', 'perspective', 'bulge', 'stagger'] as const;
const FEATURES: readonly [string, string][] = [['liga', 'Ligatures'], ['dlig', 'Rare ligatures'], ['smcp', 'Small caps'], ['onum', 'Old-style figures'], ['tnum', 'Tabular figures'], ['frac', 'Fractions'], ['ss01', 'Stylistic set 1'], ['swsh', 'Swashes']];

function TypeMore({ n, set, measure }: { n: TextNode; set: (s: Record<string, unknown>, label: string) => void; measure: Measure }) {
  const axes = fontAxes(n.font);
  const words = useMemo(() => [...n.text.matchAll(/\S+/g)].map((m) => ({ w: m[0], at: m.index ?? 0 })), [n.text]);
  const [picked, setPicked] = useState<number[]>([]);
  useEffect(() => setPicked([]), [n.id, n.text]);
  const style = (s: Partial<NonNullable<TextNode['runs']>[number]> | null, label: string) => {
    const ranges = picked.map((i) => ({ start: words[i].at, end: words[i].at + words[i].w.length }));
    const others = (n.runs ?? []).filter((r) => !ranges.some((g) => r.start < g.end && r.end > g.start));
    set({ runs: s === null ? (others.length ? others : null) : [...others, ...ranges.map((g) => ({ ...g, ...s }))] }, label);
  };
  return (
    <More initial={!!(n.path || n.warp || n.repeat || n.runs)} summary={<>More type</>}>
      <label className="gx-sel-field">
        <span>Along a path</span>
        <select className="v0-select" value={n.path?.kind ?? 'none'} onChange={(e) => {
          const kind = e.target.value;
          if (kind === 'none') return set({ path: null }, 'off its path');
          const path = { kind, bend: 55, start: kind === 'circle' ? 0 : 50, ...(kind === 'wave' ? { cycles: 1.5, amplitude: 45 } : {}) };
          set({ path, warp: null, size: fitToPath({ ...n, path: path as TextNode['path'] }, measure) }, `set along ${kind === 'arc' ? 'an arc' : `a ${kind}`}`);
        }}>
          <option value="none">No path</option>
          <option value="arc">An arc</option>
          <option value="circle">A circle</option>
          <option value="wave">A wave</option>
        </select>
      </label>
      {n.path && (
        <div className="gx-grid2">
          {n.path.kind === 'arc' && <NumField label="Bend" value={n.path.bend} min={-100} max={100} onCommit={(v) => set({ path: { ...n.path!, bend: v } }, 'bend')} />}
          <NumField label={n.path.kind === 'circle' ? 'Angle' : 'Position'} value={n.path.start} min={0} max={100} onCommit={(v) => set({ path: { ...n.path!, start: v } }, 'position on the path')} suffix="%" />
          {n.path.kind === 'circle' && (
            <label className="gx-check">
              <input type="checkbox" checked={n.path.side === 'inside'} onChange={(e) => set({ path: { ...n.path!, side: e.target.checked ? 'inside' : 'outside' } }, 'side of the circle')} /> Inside
            </label>
          )}
          {n.path.kind === 'wave' && (
            <>
              <NumField label="Waves" value={n.path.cycles ?? 1.5} min={0.5} max={8} step={0.25} onCommit={(v) => set({ path: { ...n.path!, cycles: v } }, 'waves')} />
              <NumField label="Height" value={n.path.amplitude ?? 40} min={0} max={100} onCommit={(v) => set({ path: { ...n.path!, amplitude: v } }, 'wave height')} suffix="%" />
            </>
          )}
          <button type="button" className="sb-link is-meta" onClick={() => set({ size: fitToPath(n, measure) }, 'fitted to its path')}>Fit to the path</button>
        </div>
      )}
      <label className="gx-sel-field">
        <span>Warp</span>
        <select className="v0-select" value={n.warp?.kind ?? 'none'} onChange={(e) => set({ warp: e.target.value === 'none' ? null : { kind: e.target.value, amount: 50, cycles: 1 }, ...(e.target.value !== 'none' ? { path: null } : {}) }, e.target.value === 'none' ? 'unwarped' : `${e.target.value} warp`)}>
          <option value="none">None</option>
          {WARPS.map((w) => (
            <option key={w} value={w}>{w.charAt(0).toUpperCase() + w.slice(1)}</option>
          ))}
        </select>
      </label>
      {n.warp && <NumField label="Amount" value={n.warp.amount} min={-100} max={100} onCommit={(v) => set({ warp: { ...n.warp!, amount: v } }, 'warp amount')} />}
      <div className="gx-grid2">
        <NumField label="Echo copies" value={n.repeat?.count ?? 0} min={0} max={40} onCommit={(v) => set({ repeat: v > 0 ? { count: v, dx: n.repeat?.dx ?? n.size * 0.06, dy: n.repeat?.dy ?? n.size * 0.06, fade: n.repeat?.fade ?? 0.7, outline: n.repeat?.outline ?? true } : null }, v > 0 ? 'echo' : 'no echo')} />
        {n.repeat && (
          <>
            <NumField label="Echo X" value={n.repeat.dx} min={-2000} max={2000} onCommit={(v) => set({ repeat: { ...n.repeat!, dx: v } }, 'echo offset')} />
            <NumField label="Echo Y" value={n.repeat.dy} min={-2000} max={2000} onCommit={(v) => set({ repeat: { ...n.repeat!, dy: v } }, 'echo offset')} />
            <NumField label="Fade" value={Math.round(n.repeat.fade * 100)} min={0} max={100} onCommit={(v) => set({ repeat: { ...n.repeat!, fade: v / 100 } }, 'echo fade')} suffix="%" />
            <label className="gx-check">
              <input type="checkbox" checked={!!n.repeat.outline} onChange={(e) => set({ repeat: { ...n.repeat!, outline: e.target.checked } }, 'echo outlined')} /> Outlined copies
            </label>
          </>
        )}
      </div>
      <label className="gx-sel-field">
        <span>Ink</span>
        <select className="v0-select" value={n.fill === null ? 'none' : n.fill ? 'gradient' : 'colour'} onChange={(e) => set({ fill: e.target.value === 'none' ? null : e.target.value === 'gradient' ? { type: 'linear', angle: 90, stops: [{ at: 0, color: n.color }, { at: 1, color: '#888888' }] } : n.color }, e.target.value === 'none' ? 'outlined (no fill)' : e.target.value)}>
          <option value="colour">Its colour</option>
          <option value="gradient">A gradient</option>
          <option value="none">None (an outline)</option>
        </select>
      </label>
      <div className="gx-grid2">
        <label className="gx-sel-field">
          <span>Line</span>
          <select className="v0-select" value={n.decoration ?? 'none'} onChange={(e) => set({ decoration: e.target.value === 'none' ? null : e.target.value }, e.target.value)}>
            <option value="none">None</option>
            <option value="underline">Underline</option>
            <option value="line-through">Strike through</option>
          </select>
        </label>
        <NumField label="Paragraphs" value={n.paragraph ?? 0} min={0} max={4} step={0.1} onCommit={(v) => set({ paragraph: v || null }, 'paragraph spacing')} suffix="em" />
        <label className="gx-check">
          <input type="checkbox" checked={n.kerning !== 'none'} onChange={(e) => set({ kerning: e.target.checked ? null : 'none' }, e.target.checked ? 'kerning on' : 'kerning off')} /> Kerning
        </label>
      </div>
      <fieldset className="gx-features">
        <legend>OpenType</legend>
        {FEATURES.map(([tag, label]) => (
          <label key={tag} className="gx-check">
            <input type="checkbox" checked={!!n.features?.includes(tag)} onChange={(e) => set({ features: e.target.checked ? [...(n.features ?? []), tag] : (n.features ?? []).filter((f) => f !== tag) }, `${label} ${e.target.checked ? 'on' : 'off'}`)} /> {label}
          </label>
        ))}
      </fieldset>
      {(Object.keys(axes).length > 0 || true) && (
        <div className="gx-params" aria-label="Variable axes">
          <label className="gx-param">
            <span>Weight (any)</span>
            <input type="range" min={100} max={900} step={1} value={n.axes?.wght ?? n.weight} onChange={(e) => set({ axes: { ...(n.axes ?? {}), wght: Number(e.target.value) } }, 'weight axis')} aria-label="Weight axis" />
            <output>{n.axes?.wght ?? n.weight}</output>
          </label>
          {Object.entries(axes).map(([tag, [lo, hi]]) => (
            <label key={tag} className="gx-param">
              <span>{{ wdth: 'Width', opsz: 'Optical size', slnt: 'Slant', SOFT: 'Softness', WONK: 'Wonk', CASL: 'Casual', MONO: 'Mono', CRSV: 'Cursive', GRAD: 'Grade' }[tag] ?? tag}</span>
              <input type="range" min={lo} max={hi} step={(hi - lo) / 100} value={n.axes?.[tag] ?? lo} onChange={(e) => set({ axes: { ...(n.axes ?? {}), [tag]: Number(e.target.value) } }, `${tag} axis`)} aria-label={`${tag} axis`} />
              <output>{r2(n.axes?.[tag] ?? lo)}</output>
            </label>
          ))}
          {!Object.keys(axes).length && <p className="v0-quiet">{n.font} has no other variable axes (Anybody, Roboto Flex, Recursive and Fraunces do).</p>}
        </div>
      )}
      <div className="gx-runs">
        <p className="v0-quiet">Mixed styles: pick words, then style them.</p>
        <div className="gx-chips">
          {words.map((w, i) => (
            <button key={i} type="button" aria-pressed={picked.includes(i)} className={picked.includes(i) ? 'is-on' : ''} onClick={() => setPicked(picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i])}>
              {w.w}
            </button>
          ))}
        </div>
        <div className="gx-btns">
          <button type="button" disabled={!picked.length} onClick={() => style({ weight: 800 }, 'words bold')}>Bold</button>
          <button type="button" disabled={!picked.length} onClick={() => style({ weight: 300 }, 'words light')}>Light</button>
          <button type="button" disabled={!picked.length} onClick={() => style({ italic: true }, 'words italic')}><i>Italic</i></button>
          <button type="button" disabled={!picked.length} onClick={() => style({ decoration: 'underline' }, 'words underlined')}>Underline</button>
          <label className="gx-colour-inline">
            <input type="color" disabled={!picked.length} onChange={(e) => style({ color: e.target.value }, 'words coloured')} aria-label="Colour the picked words" />
          </label>
          <button type="button" disabled={!picked.length} onClick={() => style(null, 'styles cleared')}>Clear</button>
        </div>
      </div>
    </More>
  );
}

/** The inspector's further sections for one object, or the operations for several. */
export function CeilingInspector({ doc, board, selected, onOps, measure, onPathEdit }: { doc: GraphicDoc; board: Artboard; selected: Located[]; onOps: OnOps; measure: Measure; onPathEdit: (id: string | null) => void }) {
  const [repeat, setRepeat] = useState({ mode: 'linear', count: 4 });
  const [offset, setOffset] = useState(10);
  const [steps, setSteps] = useState(5);
  const [alignTo, setAlignTo] = useState<'selection' | 'parent'>('selection');
  if (selected.length > 1) {
    const ids = selected.map((l) => l.node.id);
    const shapes = selected.every((l) => l.node.type === 'shape' || (l.node.type === 'group' && l.node.boolean));
    return (
      <section className="gx-panel" aria-label="Operations on the selection">
        <p className="gx-panel-h">Combine {selected.length} objects</p>
        <div className="gx-btns" role="group" aria-label="Booleans">
          {(['union', 'subtract', 'intersect', 'exclude'] as const).map((m) => (
            <button key={m} type="button" disabled={!shapes} onClick={() => onOps([{ op: 'boolean', ids, mode: m }], `${m} (live: the shapes stay editable)`)}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
          <button type="button" disabled={!selected.every((l) => l.node.type === 'shape')} onClick={() => onOps([{ op: 'combine', ids }], 'combined into one path')}>Combine paths</button>
        </div>
        {!shapes && <p className="v0-quiet">Booleans combine shapes; text, pictures and charts take no part.</p>}
        <div className="gx-btns" role="group" aria-label="Masks">
          <button type="button" onClick={() => onOps([{ op: 'mask', ids, mode: 'alpha' }], 'masked by the bottom object’s silhouette')}>Mask (silhouette)</button>
          <button type="button" onClick={() => onOps([{ op: 'mask', ids, mode: 'luminance' }], 'masked by the bottom object’s brightness')}>Mask (brightness)</button>
          <button type="button" onClick={() => onOps([{ op: 'mask', ids, mode: 'alpha', invert: true }], 'cut out by the bottom object')}>Cut out</button>
        </div>
        {selected.length === 2 && selected.every((l) => l.node.type === 'shape') && (
          <div className="gx-row">
            <NumField label="Steps" value={steps} min={1} max={60} onCommit={(v) => setSteps(Math.round(v))} />
            <button type="button" className="sb-link is-meta is-strong" onClick={() => onOps([{ op: 'blend', from: selected[0].node.id, to: selected[1].node.id, steps }], `a blend of ${steps} steps`)}>Blend between them</button>
          </div>
        )}
        <div className="gx-row">
          <label className="gx-sel-field">
            <span>Align to</span>
            <select className="v0-select" value={alignTo} onChange={(e) => setAlignTo(e.target.value as 'selection' | 'parent')}>
              <option value="selection">The selection</option>
              <option value="parent">The artboard</option>
            </select>
          </label>
        </div>
        <div className="gx-btns" role="group" aria-label="Align and distribute">
          {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((edge) => (
            <button key={edge} type="button" onClick={() => onOps([{ op: 'align', ids, edge, to: alignTo }], `aligned ${edge}`)}>
              {edge}
            </button>
          ))}
          <button type="button" disabled={selected.length < 3} onClick={() => onOps([{ op: 'distribute', ids, axis: 'x' }], 'spaced evenly across')}>Space across</button>
          <button type="button" disabled={selected.length < 3} onClick={() => onOps([{ op: 'distribute', ids, axis: 'y' }], 'spaced evenly down')}>Space down</button>
        </div>
      </section>
    );
  }
  const one = selected[0];
  if (!one) return null;
  const n = one.node;
  const locked = isLocked(one);
  const set = (s: Record<string, unknown>, label: string) => onOps([{ op: 'update', id: n.id, set: s }], label);
  const shape = n.type === 'shape' ? (n as ShapeNode) : null;
  const primSpec = shape?.prim ? PRIMITIVE_BY_KIND.get(shape.prim.kind) : undefined;
  return (
    <section key={n.id} className="gx-panel gx-ceiling" aria-label="More properties">
      <fieldset disabled={locked} className="gx-fields">
        {shape?.shape === 'prim' && shape.prim && primSpec && (
          <More initial={true} summary={<>{primSpec.label}: parameters</>}>
            <label className="gx-sel-field">
              <span>Shape</span>
              <select className="v0-select" value={shape.prim.kind} onChange={(e) => {
                const spec = PRIMITIVE_BY_KIND.get(e.target.value);
                // a name that was the old shape's own label follows the new shape; a name the designer gave is kept
                const renamed = !shape.name || shape.name === primSpec.label ? { name: spec?.label ?? shape.name } : {};
                set({ prim: primDefaults(e.target.value), ...renamed, ...(spec?.stroked ? { fill: null, stroke: shape.stroke ?? { color: doc.tokens.colors.text, width: 2 } } : { fill: shape.fill ?? doc.tokens.colors.accent }) }, `now a ${spec?.label.toLowerCase()}`);
              }}>
                {PRIM_CATEGORIES.map((c) => (
                  <optgroup key={c.id} label={c.label}>
                    {PRIMITIVES.filter((p) => p.category === c.id).map((p) => (
                      <option key={p.kind} value={p.kind}>{p.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <ParamFields specs={primSpec.params} values={shape.prim.params} idPrefix={`pr-${n.id}`} onCommit={(key, v) => set({ prim: { ...shape.prim!, params: { ...shape.prim!.params, [key]: v } } }, `${primSpec.label}: ${key}`)} />
            {primSpec.params.some((q) => q.key === 'seed') && (
              <button type="button" className="sb-link is-meta" onClick={() => set({ prim: { ...shape.prim!, params: { ...shape.prim!.params, seed: Math.floor(Math.random() * 9000) + 1 } } }, 'another seed')}>Another one (new seed)</button>
            )}
          </More>
        )}
        {n.type === 'pattern' && (
          <More initial={true} summary={<>{PATTERN_BY_KIND.get(n.gen)?.label}: generator</>}>
            <label className="gx-sel-field">
              <span>Generator</span>
              <select className="v0-select" value={n.gen} onChange={(e) => {
                const p = { ...patternDefaults(e.target.value)! };
                const k = Math.min(board.width, board.height) / 1080;
                for (const key of Object.keys(p)) if (isPxParam(e.target.value, key)) p[key] = r2(p[key] * k);
                const renamed = !n.name || n.name === PATTERN_BY_KIND.get(n.gen)?.label ? { name: PATTERN_BY_KIND.get(e.target.value)?.label ?? n.name } : {};
                set({ gen: e.target.value, ...renamed, params: { ...p, seed: n.params.seed ?? p.seed } }, `now ${PATTERN_BY_KIND.get(e.target.value)?.label.toLowerCase()}`);
              }}>
                {PATTERN_CATEGORIES.map((c) => (
                  <optgroup key={c.id} label={c.label}>
                    {PATTERNS.filter((p) => p.category === c.id).map((p) => (
                      <option key={p.kind} value={p.kind}>{p.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <ParamFields specs={patternParams(n.gen)} values={n.params} idPrefix={`pt-${n.id}`} onCommit={(key, v) => set({ params: { ...n.params, [key]: v } }, `${PATTERN_BY_KIND.get(n.gen)?.label}: ${key}`)} />
            <button type="button" className="sb-link is-meta" onClick={() => set({ params: { ...n.params, seed: Math.floor(Math.random() * 9000) + 1 } }, 'another seed')}>Another one (new seed)</button>
            <div className="gx-inks">
              {n.colors.map((c, i) => (
                <span key={i} className="gx-ink">
                  <input type="color" value={c.slice(0, 7)} aria-label={`Ink ${i + 1}`} onChange={(e) => set({ colors: n.colors.map((x, j) => (j === i ? e.target.value : x)) }, `ink ${i + 1}`)} />
                  {n.colors.length > 1 && <button type="button" className="gx-icon" aria-label={`Remove ink ${i + 1}`} onClick={() => set({ colors: n.colors.filter((_, j) => j !== i) }, 'ink removed')}>✕</button>}
                </span>
              ))}
              {n.colors.length < 4 && <button type="button" className="sb-link is-meta" onClick={() => set({ colors: [...n.colors, doc.tokens.colors.accent] }, 'ink added')}>Add an ink</button>}
            </div>
            <label className="gx-sel-field">
              <span>Boundary</span>
              <select className="v0-select" value={!n.bound ? 'box' : n.bound === 'ellipse' ? 'ellipse' : n.bound.kind} onChange={(e) => set({ bound: e.target.value === 'box' ? null : e.target.value === 'ellipse' ? 'ellipse' : primDefaults(e.target.value) }, 'pattern boundary')}>
                <option value="box">Its box</option>
                <option value="ellipse">An ellipse</option>
                {['blob', 'star', 'hexagon', 'triangle', 'wavy-circle', 'drop', 'diamond', 'superellipse', 'arch'].filter((k) => PRIMITIVE_BY_KIND.has(k)).map((k) => (
                  <option key={k} value={k}>{PRIMITIVE_BY_KIND.get(k)?.label}</option>
                ))}
              </select>
            </label>
          </More>
        )}
        {shape && shape.shape !== 'line' && !primSpec?.stroked && (
          <PaintEditor label="Fill" paint={shape.fill} doc={doc} onCommit={(p, what) => set({ fill: p }, what)} />
        )}
        {shape && (
          <More initial={true} summary={<>Strokes</>}>
            {shape.stroke ? <StrokeFields label="Stroke" stroke={shape.stroke} onCommit={(s) => set({ stroke: s }, 'stroke')} onRemove={primSpec?.stroked || shape.shape === 'line' ? undefined : () => set({ stroke: null }, 'no stroke')} /> : <NumField label="Stroke" value={0} min={0} max={200} step={0.5} onCommit={(v) => v > 0 && set({ stroke: { color: doc.tokens.colors.text, width: v } }, 'stroke added')} />}
            {(shape.strokes ?? []).map((s, i) => (
              <StrokeFields key={i} label={`Stroke ${i + 2}`} stroke={s} onCommit={(x) => set({ strokes: (shape.strokes ?? []).map((y, j) => (j === i ? x : y)) }, 'stroke')} onRemove={() => set({ strokes: (shape.strokes ?? []).filter((_, j) => j !== i) }, 'stroke removed')} />
            ))}
            {(shape.strokes ?? []).length < 4 && <button type="button" className="sb-link is-meta" onClick={() => set({ strokes: [...(shape.strokes ?? []), { color: doc.tokens.colors.accent, width: (shape.stroke?.width ?? 2) * 3, join: 'round' }] }, 'another stroke beneath')}>Add a stroke beneath</button>}
          </More>
        )}
        {shape && (
          <More initial={false} summary={<>Path operations</>}>
            <div className="gx-btns">
              <button type="button" onClick={() => onOps([{ op: 'flatten', id: n.id }], 'converted to an editable path')}>Convert to path</button>
              <button type="button" onClick={() => (shape.shape === 'bezier' ? onPathEdit(n.id) : (onOps([{ op: 'flatten', id: n.id }], 'converted to an editable path'), window.setTimeout(() => onPathEdit(n.id), 50)))}>Edit nodes</button>
              <button type="button" disabled={!shape.stroke} onClick={() => onOps([{ op: 'outline-stroke', id: n.id }], 'stroke outlined')}>Outline stroke</button>
              {(['simplify', 'smooth', 'reverse', 'roughen', 'close', 'open'] as const).map((a) => (
                <button key={a} type="button" onClick={() => onOps([{ op: 'path', id: n.id, action: a }], `path: ${a}`)}>{a.charAt(0).toUpperCase() + a.slice(1)}</button>
              ))}
            </div>
            <div className="gx-row">
              <NumField label="Offset" value={offset} min={-500} max={500} onCommit={setOffset} />
              <button type="button" className="sb-link is-meta" onClick={() => onOps([{ op: 'offset', id: n.id, d: offset }], `offset by ${offset}`)}>{offset >= 0 ? 'Grow' : 'Inset'} a copy</button>
            </div>
            {shape.shape === 'bezier' && (
              <label className="gx-check">
                <input type="checkbox" checked={shape.rule === 'evenodd'} onChange={(e) => set({ rule: e.target.checked ? 'evenodd' : null }, 'fill rule')} /> Even-odd (rings inside are holes)
              </label>
            )}
          </More>
        )}
        {n.type === 'text' && <TypeMore n={n} set={set} measure={measure} />}
        {n.type === 'text' && n.fill && typeof n.fill === 'object' && <PaintEditor label="Gradient ink" paint={n.fill} doc={doc} allowNone={false} onCommit={(p, what) => set({ fill: p }, what)} />}
        {n.type === 'image' && (
          <More initial={!!(n.adjust || n.crop)} summary={<>Adjust and crop</>}>
            <div className="gx-params">
              {([['brightness', 'Brightness', -100, 100], ['contrast', 'Contrast', -100, 100], ['saturation', 'Saturation', -100, 100], ['hue', 'Hue', -180, 180], ['temperature', 'Temperature', -100, 100], ['blur', 'Blur', 0, 60], ['vignette', 'Vignette', 0, 100]] as const).map(([k, label, lo, hi]) => (
                <label key={k} className="gx-param">
                  <span>{label}</span>
                  <input type="range" min={lo} max={hi} step={1} value={n.adjust?.[k] ?? 0} onChange={(e) => set({ adjust: { ...(n.adjust ?? {}), [k]: Number(e.target.value) } }, label.toLowerCase())} aria-label={label} />
                  <output>{n.adjust?.[k] ?? 0}</output>
                </label>
              ))}
            </div>
            <div className="gx-grid2">
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <NumField key={k} label={`Crop ${k.toUpperCase()}`} value={Math.round(((n.crop ?? { x: 0, y: 0, w: 1, h: 1 })[k]) * 100)} min={k === 'w' || k === 'h' ? 2 : 0} max={100} onCommit={(v) => set({ crop: { ...(n.crop ?? { x: 0, y: 0, w: 1, h: 1 }), [k]: v / 100 } }, 'crop')} suffix="%" />
              ))}
            </div>
            <div className="gx-btns">
              <button type="button" onClick={() => set({ adjust: null }, 'adjustments reset')}>Reset adjustments</button>
              <button type="button" onClick={() => set({ crop: null }, 'crop reset')}>Reset crop</button>
            </div>
            <p className="v0-quiet">The original picture is never changed: every adjustment is reversible.</p>
          </More>
        )}
        <More initial={!!(n.blend || n.skewX || n.skewY || n.flipX || n.flipY || (n.type === 'group' && (n.mask || n.boolean)))} summary={<>Compositing and transform</>}>
          <label className="gx-sel-field">
            <span>Blend</span>
            <select className="v0-select" value={n.blend ?? 'normal'} onChange={(e) => set({ blend: e.target.value === 'normal' ? null : e.target.value }, `blend: ${e.target.value}`)}>
              {['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'soft-light', 'hard-light', 'difference', 'exclusion'].map((b) => (
                <option key={b} value={b}>{b.replace('-', ' ')}</option>
              ))}
            </select>
          </label>
          <div className="gx-grid2">
            <NumField label="Skew X" value={n.skewX ?? 0} min={-70} max={70} onCommit={(v) => set({ skewX: v || null }, 'skew')} suffix="°" />
            <NumField label="Skew Y" value={n.skewY ?? 0} min={-70} max={70} onCommit={(v) => set({ skewY: v || null }, 'skew')} suffix="°" />
          </div>
          <div className="gx-btns">
            <button type="button" aria-pressed={!!n.flipX} onClick={() => onOps([{ op: 'mirror', id: n.id, axis: 'x' }], 'flipped across')}>Flip ↔</button>
            <button type="button" aria-pressed={!!n.flipY} onClick={() => onOps([{ op: 'mirror', id: n.id, axis: 'y' }], 'flipped down')}>Flip ↕</button>
            <button type="button" onClick={() => onOps([{ op: 'mirror', id: n.id, axis: 'x', copy: true }], 'a mirrored copy beside it')}>Mirrored copy</button>
          </div>
          <div className="gx-row">
            <label className="gx-sel-field">
              <span>Repeat</span>
              <select className="v0-select" value={repeat.mode} onChange={(e) => setRepeat({ ...repeat, mode: e.target.value })}>
                <option value="linear">In a line</option>
                <option value="radial">Round a centre</option>
                <option value="grid">In a grid</option>
              </select>
            </label>
            <NumField label="Copies" value={repeat.count} min={2} max={120} onCommit={(v) => setRepeat({ ...repeat, count: Math.round(v) })} />
            <button type="button" className="sb-link is-meta is-strong" onClick={() => onOps([{ op: 'repeat', id: n.id, mode: repeat.mode as 'linear', count: repeat.count, ...(repeat.mode === 'linear' ? { fade: 0.4 } : {}) }], `repeated ${repeat.count} times`)}>Repeat</button>
          </div>
          {n.type === 'group' && (
            <div className="gx-grid2">
              <label className="gx-sel-field">
                <span>Mask</span>
                <select className="v0-select" value={n.mask ?? 'none'} onChange={(e) => set({ mask: e.target.value === 'none' ? null : e.target.value }, e.target.value === 'none' ? 'no mask' : `masked by its first object (${e.target.value})`)}>
                  <option value="none">None</option>
                  <option value="alpha">The first object’s silhouette</option>
                  <option value="luminance">The first object’s brightness</option>
                </select>
              </label>
              {n.mask && (
                <label className="gx-check">
                  <input type="checkbox" checked={!!n.maskInvert} onChange={(e) => set({ maskInvert: e.target.checked || null }, e.target.checked ? 'mask inverted' : 'mask upright')} /> Invert
                </label>
              )}
              <label className="gx-sel-field">
                <span>Boolean</span>
                <select className="v0-select" value={n.boolean ?? 'none'} onChange={(e) => set({ boolean: e.target.value === 'none' ? null : e.target.value }, e.target.value === 'none' ? 'not a boolean' : `a live ${e.target.value}`)}>
                  <option value="none">None</option>
                  <option value="union">Union</option>
                  <option value="subtract">Subtract</option>
                  <option value="intersect">Intersect</option>
                  <option value="exclude">Exclude</option>
                </select>
              </label>
              {n.boolean && <button type="button" className="sb-link is-meta" onClick={() => onOps([{ op: 'flatten', id: n.id }], 'the boolean flattened into one path')}>Flatten to a path</button>}
              <label className="gx-check">
                <input type="checkbox" checked={!!n.isolate} onChange={(e) => set({ isolate: e.target.checked || null }, e.target.checked ? 'blending kept within the group' : 'blending with what is beneath')} /> Blend only within
              </label>
              <label className="gx-check">
                <input type="checkbox" checked={!!n.clip} onChange={(e) => set({ clip: e.target.checked || null }, e.target.checked ? 'clipped to its box' : 'not clipped')} /> Clip to its box
              </label>
            </div>
          )}
        </More>
        <More initial={!!n.effects?.length} summary={<>Effects {n.effects?.length ? `(${n.effects.length})` : ''}</>}>
          <EffectsStack node={n} board={board} onCommit={(effects, what) => set({ effects }, what)} />
        </More>
      </fieldset>
    </section>
  );
}
