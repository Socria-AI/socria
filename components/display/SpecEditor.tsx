'use client';

// components/display/SpecEditor.tsx — THE CONTROLS FOR CHANGING AN ARTIFACT, BY WHAT IT IS.
//
// A graph is changed by its equations, sliders, window, points and shading; a force diagram by its forces; a
// step-through by its steps; a mind map by its parts, where each hangs and the links across; a list by its items. No
// control here belongs to another kind. What is typed is kept as typed (a half-written formula is not thrown away),
// and every change is run through the same validator the conversation's elements go through
// (lib/inline-ui.ts sanitizeInlineSpec): the picture beside it is always the last version that holds, and a field
// that does not hold yet says so in a line, never by breaking the picture.
//
// The editor only proposes: the version it reports (onChange) is applied by the kept element as a step of its
// history (components/display/KeptFigure.tsx), so it saves, undoes and syncs like every other change.

import { useEffect, useMemo, useRef, useState } from 'react';
import { DIAGRAM_RELS, sanitizeInlineSpec, type DiagramRel, type InlineSpec } from '@/lib/inline-ui';
import { droppedBy, droppedNoun } from '@/lib/artifact-edit';

type Raw = Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const numOr = (v: unknown): unknown => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v);
const asArr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);
const REL_WORD: Record<DiagramRel, string> = { part: 'part of', causes: 'causes', leads: 'leads to', needs: 'needs', relates: 'relates to' };

/** A raw model with numbers that were typed as text made numbers, so the validator sees what the person meant. */
function normalized(raw: Raw): Raw {
  const walk = (v: unknown, key = ''): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Raw).map(([k, x]) => [k, walk(x, k)]));
    // fields that are numbers, or numbers-or-formulas: a number typed is a number
    return ['min', 'max', 'value', 'step', 'from', 'to', 'n', 'digits'].includes(key) ? numOr(v) : v;
  };
  const out = walk(raw) as Raw;
  for (const k of ['x', 'y']) if (Array.isArray(out[k])) out[k] = (out[k] as unknown[]).map(numOr);
  if (out.view && typeof out.view === 'object' && !Array.isArray(out.view)) for (const k of ['x', 'y']) { const r = (out.view as Raw)[k]; if (Array.isArray(r)) (out.view as Raw)[k] = r.map(numOr); }
  if (Array.isArray(out.t)) out.t = (out.t as unknown[]).map(numOr);
  for (const p of asArr(out.points)) { p.x = numOr(p.x); if (p.y === '' || p.y === undefined) delete p.y; else p.y = numOr(p.y); }
  for (const v of asArr(out.vectors)) { v.mag = numOr(v.mag); v.angle = numOr(v.angle); }
  return out;
}

export function SpecEditor({ spec, onChange }: { spec: InlineSpec; onChange: (next: InlineSpec) => void }) {
  const [raw, setRaw] = useState<Raw>(() => clone(spec) as unknown as Raw);
  const [problem, setProblem] = useState<string | null>(null);
  // a new version from elsewhere (Undo, Socria's change) restarts the form from it — but the version this form
  // just reported coming back (as the preview, then saved) does not: what is typed stays as typed ("0." on the way
  // to "0.5", the space before the next word), though the version that holds has it tidied
  const key = useMemo(() => JSON.stringify(spec), [spec]);
  const mine = useRef<string | null>(null);
  useEffect(() => {
    if (key === mine.current) return;
    setRaw(clone(spec) as unknown as Raw);
    setProblem(null);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (mut: (r: Raw) => void) => {
    const next = clone(raw);
    mut(next);
    setRaw(next);
    const typed = normalized(next);
    const ok = sanitizeInlineSpec(typed);
    // all of it must hold: a curve the validator would leave out is "not yet", never the curve gone from the picture
    const lost = ok ? droppedBy(typed, ok) : null;
    if (ok && ok.type === spec.type && !lost) {
      setProblem(null);
      mine.current = JSON.stringify(ok);
      onChange(ok);
    } else setProblem(`${lost ? `${droppedNoun(lost)} does not hold as it stands` : 'Not drawable as it stands'} — the picture shows the last version that held.`);
  };
  const field = (label: string, value: unknown, put: (v: string) => void, o: { wide?: boolean; mono?: boolean; placeholder?: string } = {}) => (
    <label className={`se-field${o.wide ? ' is-wide' : ''}`}>
      <span className="se-k">{label}</span>
      <input className={o.mono ? 'is-mono' : ''} value={value === undefined || value === null ? '' : String(value)} placeholder={o.placeholder} onChange={(e) => put(e.target.value)} spellCheck={!o.mono} />
    </label>
  );
  const remove = (onClick: () => void, what: string) => (
    <button type="button" className="se-x" onClick={onClick} aria-label={`Remove ${what}`} title={`Remove ${what}`}>
      ×
    </button>
  );
  const add = (label: string, onClick: () => void, disabled = false) => (
    <button type="button" className="se-add" onClick={onClick} disabled={disabled}>
      + {label}
    </button>
  );
  const title = field('Title', raw.title, (v) => set((r) => { if (v) r.title = v; else delete r.title; }), { wide: true });

  let body: React.ReactNode = null;
  if (spec.type === 'graph') {
    const curves = asArr(raw.curves), params = asArr(raw.params), points = asArr(raw.points);
    const area = raw.area && typeof raw.area === 'object' ? (raw.area as Raw) : null;
    const rects = area?.rects && typeof area.rects === 'object' ? (area.rects as Raw) : null;
    const features = Array.isArray(raw.features) ? (raw.features as string[]) : [];
    body = (
      <>
        <fieldset className="se-group">
          <legend>Equations</legend>
          <div className="se-row">
            {field('y =', raw.expr, (v) => set((r) => void (r.expr = v)), { wide: true, mono: true })}
            {field('Name', raw.label, (v) => set((r) => { if (v) r.label = v; else delete r.label; }))}
          </div>
          {curves.map((c, i) => (
            <div className="se-row" key={i}>
              {field('y =', c.expr, (v) => set((r) => void (asArr(r.curves)[i].expr = v)), { wide: true, mono: true })}
              {field('Name', c.label, (v) => set((r) => { const cc = asArr(r.curves)[i]; if (v) cc.label = v; else delete cc.label; }))}
              {remove(() => set((r) => { asArr(r.curves).splice(i, 1); if (!asArr(r.curves).length) { delete r.curves; r.features = (r.features as string[] ?? []).filter((f) => f !== 'crossings'); } }), 'this curve')}
            </div>
          ))}
          {add('Curve', () => set((r) => void (r.curves = [...asArr(r.curves), { expr: 'x', label: `curve ${asArr(r.curves).length + 2}` }])), curves.length >= 2)}
        </fieldset>
        <fieldset className="se-group">
          <legend>Window</legend>
          <div className="se-row">
            {field('x from', (raw.x as unknown[])?.[0], (v) => set((r) => void ((r.x as unknown[])[0] = v)), { mono: true })}
            {field('to', (raw.x as unknown[])?.[1], (v) => set((r) => void ((r.x as unknown[])[1] = v)), { mono: true })}
            {field('y from', (raw.y as unknown[] | undefined)?.[0], (v) => set((r) => { if (v === '' && !(r.y as unknown[] | undefined)?.[1]) delete r.y; else r.y = [v, (r.y as unknown[] | undefined)?.[1] ?? '']; }), { mono: true, placeholder: 'fits' })}
            {field('to', (raw.y as unknown[] | undefined)?.[1], (v) => set((r) => { if (v === '' && !(r.y as unknown[] | undefined)?.[0]) delete r.y; else r.y = [(r.y as unknown[] | undefined)?.[0] ?? '', v]; }), { mono: true, placeholder: 'fits' })}
          </div>
        </fieldset>
        <fieldset className="se-group">
          <legend>Sliders</legend>
          {params.map((p, i) => (
            <div className="se-row" key={i}>
              {field('Letter', p.name, (v) => set((r) => void (asArr(r.params)[i].name = v.trim())), { mono: true })}
              {field('Called', p.label, (v) => set((r) => void (asArr(r.params)[i].label = v)))}
              {field('From', p.min, (v) => set((r) => void (asArr(r.params)[i].min = v)), { mono: true })}
              {field('To', p.max, (v) => set((r) => void (asArr(r.params)[i].max = v)), { mono: true })}
              {field('Starts at', p.value, (v) => set((r) => void (asArr(r.params)[i].value = v)), { mono: true })}
              {remove(() => set((r) => void asArr(r.params).splice(i, 1)), 'this slider')}
            </div>
          ))}
          {add('Slider', () => set((r) => { const used = new Set(asArr(r.params).map((p) => p.name)); const name = 'abcdkmnpqrsuvw'.split('').find((c) => !used.has(c)) ?? 'k'; r.params = [...asArr(r.params), { name, label: name, min: 0, max: 10, value: 1, step: 0.1 }]; }), params.length >= 3)}
        </fieldset>
        <fieldset className="se-group">
          <legend>Points</legend>
          {points.map((p, i) => (
            <div className="se-row" key={i}>
              {field('x', p.x, (v) => set((r) => void (asArr(r.points)[i].x = v)), { mono: true })}
              {field('y', p.y, (v) => set((r) => void (asArr(r.points)[i].y = v)), { mono: true, placeholder: 'on the curve' })}
              <label className="se-check">
                <input type="checkbox" checked={!!p.open} onChange={(e) => set((r) => { const pt = asArr(r.points)[i]; if (e.target.checked) pt.open = true; else delete pt.open; })} /> open (a hole)
              </label>
              {remove(() => set((r) => { asArr(r.points).splice(i, 1); if (!asArr(r.points).length) delete r.points; }), 'this point')}
            </div>
          ))}
          {add('Point', () => set((r) => void (r.points = [...asArr(r.points), { x: (Number((r.x as unknown[])[0]) + Number((r.x as unknown[])[1])) / 2 }])), points.length >= 6)}
        </fieldset>
        <fieldset className="se-group">
          <legend>Shading</legend>
          {area ? (
            <div className="se-row">
              {field('From x', area.from, (v) => set((r) => void ((r.area as Raw).from = v)), { mono: true })}
              {field('To x', area.to, (v) => set((r) => void ((r.area as Raw).to = v)), { mono: true })}
              {field('Rectangles', rects?.n, (v) => set((r) => { const a = r.area as Raw; if (v === '') delete a.rects; else a.rects = { n: v, rule: (a.rects as Raw | undefined)?.rule ?? 'left' }; }), { mono: true, placeholder: 'none' })}
              {rects && (
                <label className="se-field">
                  <span className="se-k">Height at</span>
                  <select value={String(rects.rule ?? 'left')} onChange={(e) => set((r) => void (((r.area as Raw).rects as Raw).rule = e.target.value))}>
                    <option value="left">left end</option>
                    <option value="mid">middle</option>
                    <option value="right">right end</option>
                  </select>
                </label>
              )}
              {remove(() => set((r) => void delete r.area), 'the shading')}
            </div>
          ) : (
            add('Shade an area', () => set((r) => void (r.area = { from: (r.x as unknown[])[0], to: (r.x as unknown[])[1] })))
          )}
        </fieldset>
        <fieldset className="se-group">
          <legend>Marked on it</legend>
          <div className="se-row">
            {(['turning', 'roots', 'intercept', 'crossings'] as const).map((f) => (
              <label key={f} className="se-check">
                <input type="checkbox" checked={features.includes(f)} disabled={f === 'crossings' && !curves.length} onChange={(e) => set((r) => { const fs = new Set((r.features as string[]) ?? []); if (e.target.checked) fs.add(f); else fs.delete(f); r.features = [...fs]; })} /> {f === 'turning' ? 'turning points' : f}
              </label>
            ))}
          </div>
        </fieldset>
      </>
    );
  } else if (spec.type === 'vectors') {
    const vectors = asArr(raw.vectors), params = asArr(raw.params);
    body = (
      <>
        <div className="se-row">
          {field('Body', raw.body, (v) => set((r) => { if (v) r.body = v; else delete r.body; }))}
          {field('Unit', raw.unit, (v) => set((r) => { if (v) r.unit = v; else delete r.unit; }))}
          <label className="se-check">
            <input type="checkbox" checked={raw.resultant !== false} onChange={(e) => set((r) => void (r.resultant = e.target.checked))} /> draw their sum
          </label>
        </div>
        <fieldset className="se-group">
          <legend>Forces</legend>
          {vectors.map((v, i) => (
            <div className="se-row" key={i}>
              {field('Called', v.label, (x) => set((r) => void (asArr(r.vectors)[i].label = x)))}
              {field('Size', v.mag, (x) => set((r) => void (asArr(r.vectors)[i].mag = x)), { mono: true })}
              {field('Direction (°)', v.angle, (x) => set((r) => void (asArr(r.vectors)[i].angle = x)), { mono: true })}
              {vectors.length > 1 && remove(() => set((r) => void asArr(r.vectors).splice(i, 1)), 'this force')}
            </div>
          ))}
          {add('Force', () => set((r) => void (r.vectors = [...asArr(r.vectors), { label: `force ${asArr(r.vectors).length + 1}`, mag: 5, angle: 0 }])), vectors.length >= 5)}
        </fieldset>
        <fieldset className="se-group">
          <legend>Sliders</legend>
          {params.map((p, i) => (
            <div className="se-row" key={i}>
              {field('Letter', p.name, (v) => set((r) => void (asArr(r.params)[i].name = v.trim())), { mono: true })}
              {field('Called', p.label, (v) => set((r) => void (asArr(r.params)[i].label = v)))}
              {field('From', p.min, (v) => set((r) => void (asArr(r.params)[i].min = v)), { mono: true })}
              {field('To', p.max, (v) => set((r) => void (asArr(r.params)[i].max = v)), { mono: true })}
              {remove(() => set((r) => void asArr(r.params).splice(i, 1)), 'this slider')}
            </div>
          ))}
          {add('Slider', () => set((r) => void (r.params = [...asArr(r.params), { name: 'p', label: 'p', min: 0, max: 20, value: 5, step: 1 }])), params.length >= 3)}
        </fieldset>
      </>
    );
  } else if (spec.type === 'trace') {
    const steps = asArr(raw.steps);
    body = (
      <>
        <label className="se-field">
          <span className="se-k">Holds</span>
          <select value={String(raw.kind ?? 'array')} onChange={(e) => set((r) => void (r.kind = e.target.value))}>
            <option value="array">a list</option>
            <option value="stack">a stack</option>
            <option value="queue">a queue</option>
          </select>
        </label>
        <fieldset className="se-group">
          <legend>Steps</legend>
          {steps.map((st, i) => (
            <div className="se-step" key={i}>
              <span className="se-step-n">{i + 1}</span>
              {field('Cells', asArr(st.cells as unknown).join(', '), (v) => set((r) => void (asArr(r.steps)[i].cells = v.split(',').map((x) => x.trim()).filter(Boolean))), { wide: true, mono: true })}
              {field('Looking at', ((st.mark as number[]) ?? []).join(', '), (v) => set((r) => { const s = asArr(r.steps)[i]; const m = v.split(',').map((x) => Number(x.trim())).filter((x) => Number.isInteger(x)); if (m.length) s.mark = m; else delete s.mark; }), { mono: true, placeholder: 'positions' })}
              {field('Pointers', asArr(st.pointers as unknown).map((p) => `${p.name}=${p.at}`).join(', '), (v) => set((r) => { const s = asArr(r.steps)[i]; const ps = v.split(',').map((x) => x.split('=').map((y) => y.trim())).filter(([n, a]) => n && /^-?\d+$/.test(a ?? '')).map(([n, a]) => ({ name: n, at: Number(a) })); if (ps.length) s.pointers = ps; else delete s.pointers; }), { mono: true, placeholder: 'lo=0, hi=6' })}
              {field('What it did', st.note, (v) => set((r) => void (asArr(r.steps)[i].note = v)), { wide: true })}
              {steps.length > 2 && remove(() => set((r) => void asArr(r.steps).splice(i, 1)), `step ${i + 1}`)}
            </div>
          ))}
          {add('Step', () => set((r) => { const last = asArr(r.steps).at(-1) ?? { cells: ['1'] }; r.steps = [...asArr(r.steps), { cells: clone(last.cells), note: 'Next step' }]; }), steps.length >= 40)}
        </fieldset>
      </>
    );
  } else if (spec.type === 'sim') {
    const params = asArr(raw.params);
    const view = (raw.view ?? {}) as Raw;
    body = (
      <>
        <fieldset className="se-group">
          <legend>Motion</legend>
          <div className="se-row">
            {field('x(t) =', raw.x, (v) => set((r) => void (r.x = v)), { wide: true, mono: true })}
            {field('y(t) =', raw.y, (v) => set((r) => void (r.y = v)), { wide: true, mono: true })}
          </div>
          <div className="se-row">
            {field('t from', (raw.t as unknown[])?.[0], (v) => set((r) => void ((r.t as unknown[])[0] = v)), { mono: true })}
            {field('to', (raw.t as unknown[])?.[1], (v) => set((r) => void ((r.t as unknown[])[1] = v)), { mono: true })}
            {field('x view', (view.x as unknown[])?.join(' to '), (v) => set((r) => { const [a, b] = v.split(/\s*to\s*/); ((r.view as Raw).x as unknown[]) = [a, b]; }), { mono: true })}
            {field('y view', (view.y as unknown[])?.join(' to '), (v) => set((r) => { const [a, b] = v.split(/\s*to\s*/); ((r.view as Raw).y as unknown[]) = [a, b]; }), { mono: true })}
          </div>
        </fieldset>
        <fieldset className="se-group">
          <legend>Sliders</legend>
          {params.map((p, i) => (
            <div className="se-row" key={i}>
              {field('Letter', p.name, (v) => set((r) => void (asArr(r.params)[i].name = v.trim())), { mono: true })}
              {field('Called', p.label, (v) => set((r) => void (asArr(r.params)[i].label = v)))}
              {field('From', p.min, (v) => set((r) => void (asArr(r.params)[i].min = v)), { mono: true })}
              {field('To', p.max, (v) => set((r) => void (asArr(r.params)[i].max = v)), { mono: true })}
              {field('Unit', p.unit, (v) => set((r) => { const pp = asArr(r.params)[i]; if (v) pp.unit = v; else delete pp.unit; }))}
            </div>
          ))}
        </fieldset>
      </>
    );
  } else if (spec.type === 'diagram') {
    const nodes = asArr(raw.nodes);
    const edges = (Array.isArray(raw.edges) ? raw.edges : []) as unknown[][];
    const hier = raw.view === 'mind' || raw.view === 'tree';
    const parentOf = (id: unknown) => edges.find((e) => e[1] === id && !e[2])?.[0];
    const label = (id: unknown) => String(nodes.find((n) => n.id === id)?.label ?? id);
    const freshId = () => { for (let i = nodes.length + 1; ; i++) if (!nodes.some((n) => n.id === `n${i}`)) return `n${i}`; };
    body = (
      <>
        <label className="se-field">
          <span className="se-k">Shown as</span>
          <select value={String(raw.view)} onChange={(e) => set((r) => { r.view = e.target.value; if (e.target.value !== 'mind') r.edges = (r.edges as unknown[][]).filter((x) => !x[2]).map((x) => [x[0], x[1]]); })}>
            <option value="mind">a mind map</option>
            <option value="tree">a hierarchy</option>
            <option value="flow">a flow</option>
            <option value="cycle">a cycle</option>
            <option value="causes">causes</option>
          </select>
        </label>
        <fieldset className="se-group">
          <legend>Parts</legend>
          {nodes.map((n, i) => (
            <div className="se-row" key={String(n.id)}>
              {field(i === 0 && hier ? 'Centre' : 'Part', n.label, (v) => set((r) => void (asArr(r.nodes)[i].label = v)), { wide: true })}
              {field('What it says', n.detail, (v) => set((r) => { const nn = asArr(r.nodes)[i]; if (v) nn.detail = v; else delete nn.detail; }), { wide: true })}
              {hier && i > 0 && (
                <label className="se-field">
                  <span className="se-k">Under</span>
                  <select value={String(parentOf(n.id) ?? '')} onChange={(e) => set((r) => { const es = (r.edges as unknown[][]).filter((x) => !(x[1] === n.id && !x[2])); es.push([e.target.value, n.id]); r.edges = es; })}>
                    {nodes.filter((o) => o.id !== n.id).map((o) => (
                      <option key={String(o.id)} value={String(o.id)}>{String(o.label)}</option>
                    ))}
                  </select>
                </label>
              )}
              {nodes.length > 3 && i > 0 && remove(() => set((r) => { r.edges = (r.edges as unknown[][]).filter((x) => x[0] !== n.id && x[1] !== n.id); asArr(r.nodes).splice(i, 1); }), String(n.label))}
            </div>
          ))}
          {add('Part', () => set((r) => { const id = freshId(); r.nodes = [...asArr(r.nodes), { id, label: 'New part' }]; if (hier || raw.view === 'flow') r.edges = [...(r.edges as unknown[][]), [hier ? asArr(r.nodes)[0].id : asArr(r.nodes).at(-2)?.id, id]]; }), nodes.length >= (raw.view === 'mind' ? 24 : 9))}
        </fieldset>
        {raw.view === 'mind' && (
          <fieldset className="se-group">
            <legend>Links across the branches</legend>
            {edges.map((e, k) => (e[2] ? (
              <div className="se-row" key={k}>
                <label className="se-field"><span className="se-k">From</span><select value={String(e[0])} onChange={(ev) => set((r) => void ((r.edges as unknown[][])[k][0] = ev.target.value))}>{nodes.map((o) => <option key={String(o.id)} value={String(o.id)}>{String(o.label)}</option>)}</select></label>
                <label className="se-field"><span className="se-k">Kind</span><select value={String(e[2])} onChange={(ev) => set((r) => void ((r.edges as unknown[][])[k][2] = ev.target.value))}>{DIAGRAM_RELS.filter((x) => x !== 'part').map((x) => <option key={x} value={x}>{REL_WORD[x]}</option>)}</select></label>
                <label className="se-field"><span className="se-k">To</span><select value={String(e[1])} onChange={(ev) => set((r) => void ((r.edges as unknown[][])[k][1] = ev.target.value))}>{nodes.map((o) => <option key={String(o.id)} value={String(o.id)}>{String(o.label)}</option>)}</select></label>
                {remove(() => set((r) => void (r.edges as unknown[][]).splice(k, 1)), `the link from ${label(e[0])}`)}
              </div>
            ) : null))}
            {add('Link', () => set((r) => void (r.edges = [...(r.edges as unknown[][]), [asArr(r.nodes)[1]?.id, asArr(r.nodes)[2]?.id, 'relates']])), nodes.length < 3)}
          </fieldset>
        )}
      </>
    );
  } else if (spec.type === 'sequence' || spec.type === 'concepts') {
    const items = asArr(raw.items);
    const k1 = spec.type === 'sequence' ? 'label' : 'name';
    const k2 = spec.type === 'sequence' ? (spec.kind === 'timeline' ? 'when' : 'detail') : 'gist';
    body = (
      <fieldset className="se-group">
        <legend>{spec.type === 'sequence' ? (spec.kind === 'timeline' ? 'Events' : 'Steps') : 'Parts'}</legend>
        {items.map((it, i) => (
          <div className="se-row" key={i}>
            {field(spec.type === 'sequence' ? 'Step' : 'Part', it[k1], (v) => set((r) => void (asArr(r.items)[i][k1] = v)))}
            {field(k2 === 'when' ? 'When' : k2 === 'gist' ? 'In a line' : 'Detail', it[k2], (v) => set((r) => { const x = asArr(r.items)[i]; if (v) x[k2] = v; else delete x[k2]; }), { wide: true })}
            {items.length > 3 && remove(() => set((r) => void asArr(r.items).splice(i, 1)), String(it[k1]))}
          </div>
        ))}
        {add(spec.type === 'sequence' ? 'Step' : 'Part', () => set((r) => void (r.items = [...asArr(r.items), { [k1]: 'New', ...(k2 === 'when' ? { when: '—' } : k2 === 'gist' ? { gist: 'what it is' } : {}) }])), items.length >= 8)}
      </fieldset>
    );
  } else if (spec.type === 'steps') {
    const lines = asArr(raw.lines);
    body = (
      <fieldset className="se-group">
        <legend>Lines of working</legend>
        {lines.map((ln, i) => (
          <div className="se-row" key={i}>
            {field('Line (TeX)', ln.tex, (v) => set((r) => void (asArr(r.lines)[i].tex = v)), { wide: true, mono: true })}
            {field('Why', ln.why, (v) => set((r) => { const x = asArr(r.lines)[i]; if (v) x.why = v; else delete x.why; }), { wide: true })}
            {lines.length > 2 && remove(() => set((r) => void asArr(r.lines).splice(i, 1)), `line ${i + 1}`)}
          </div>
        ))}
        {add('Line', () => set((r) => void (r.lines = [...asArr(r.lines), { tex: '= ' }])), lines.length >= 8)}
      </fieldset>
    );
  } else if (spec.type === 'equation') {
    const terms = asArr(raw.terms);
    body = (
      <>
        {field('Equation (TeX)', raw.tex, (v) => set((r) => void (r.tex = v)), { wide: true, mono: true })}
        <fieldset className="se-group">
          <legend>What each term means</legend>
          {terms.map((t, i) => (
            <div className="se-row" key={i}>
              {field('Term', t.sym, (v) => set((r) => void (asArr(r.terms)[i].sym = v)), { mono: true })}
              {field('Means', t.means, (v) => set((r) => void (asArr(r.terms)[i].means = v)), { wide: true })}
              {remove(() => set((r) => { asArr(r.terms).splice(i, 1); if (!asArr(r.terms).length) delete r.terms; }), String(t.sym))}
            </div>
          ))}
          {add('Term', () => set((r) => void (r.terms = [...asArr(r.terms), { sym: 'x', means: 'what x is' }])), terms.length >= 6)}
        </fieldset>
      </>
    );
  } else if (spec.type === 'balance') {
    const side = (k: 'for' | 'against') => asArr(raw[k]);
    body = (
      <>
        {field('About', raw.subject, (v) => set((r) => void (r.subject = v)), { wide: true })}
        {(['for', 'against'] as const).map((k) => (
          <fieldset className="se-group" key={k}>
            <legend>{k === 'for' ? 'For' : 'Against'}</legend>
            {side(k).map((it, i) => (
              <div className="se-row" key={i}>
                {field('Point', it.text, (v) => set((r) => void (asArr(r[k])[i].text = v)), { wide: true })}
                {side(k).length > 2 && remove(() => set((r) => void asArr(r[k]).splice(i, 1)), String(it.text))}
              </div>
            ))}
            {add('Point', () => set((r) => void (r[k] = [...asArr(r[k]), { text: 'Another point' }])), side(k).length >= 4)}
          </fieldset>
        ))}
        {field('It turns on', raw.turns_on, (v) => set((r) => { if (v) r.turns_on = v; else delete r.turns_on; }), { wide: true })}
      </>
    );
  } else {
    body = <p className="se-none">This kind is changed by asking — say what to change below, and Socria changes this one, in place.</p>;
  }
  return (
    <div className="se" role="group" aria-label="Change it">
      {spec.type !== 'balance' && title}
      {body}
      {problem && <p className="se-problem" role="status">{problem}</p>}
    </div>
  );
}
