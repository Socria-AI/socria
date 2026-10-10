'use client';

// LIVE 3D (experimental) — a scene object of thought, built by describing it
// in the conversation.
//
// The panel has no box of its own: the chat box is where a person works in
// Logos. What they are typing there is read as they type (debounced) into
// the scene kind's own operations (lib/objects/scene-chat.ts), and the scene
// those operations WOULD compute is drawn here at once, with what would
// change ghosted. Nothing is in the scene until they send it: then the same
// operations are applied by the workspace, as one step, and what was built is
// said in the conversation — the preview and the result are the same
// computation. A message that is not about the scene shows nothing here, and
// one read only in part says, clause by clause, what could not be read.
//
// The view itself is handled directly: select, move, rotate and scale with
// the gizmo, type a size into the inspector, undo and redo.
//
// Every number here is the scene's: sizes, positions, volumes. The panel says
// what the scene is — a geometric preview — and what it is not: nothing in it
// is loaded, stressed or simulated; a mass is density × volume, and only where a
// density was given. Under the Answer Guard (`guarded`) the volumes, areas and
// masses are held back here as they are in the conversation.
//
// What a description is wrapped in — "an interactive 3D model of", "with
// sliders", "labelled dimensions", "display its volume" — is read back as
// noted, not as a problem (scene-intent.ts REQUEST_FRAMING).

import dynamic from 'next/dynamic';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { currentOf, type ThoughtObject } from '@/lib/objects';
import { DIMS, EXPRS, MATERIALS, SHAPE_WORD, UNIT_M, massOf, measure, sceneMass, sizeOf, type LengthUnit, type SceneNode, type SceneState } from '@/lib/objects/scene';
import { sceneTurn, type SceneTurn } from '@/lib/objects/scene-chat';
import type { GizmoMode } from './SceneCanvas';
import './scene3d.css';

const SceneCanvas = dynamic(() => import('./SceneCanvas').then((m) => m.SceneCanvas), {
  ssr: false,
  loading: () => <div className="s3-wait">Starting the 3D view…</div>,
});

const EMPTY: SceneState = { nodes: [], next: 1, unit: 'm' };
const UNITS: LengthUnit[] = ['m', 'cm', 'mm', 'in', 'ft'];
const STARTS = ['a red box 2 m wide, 1 tall and 3 deep, then a blue sphere of radius 0.5 on top of it', 'a ring of 8 cylinders 2 m tall', 'a surface z = sin(x)*cos(y) for x from -3 to 3 and y from -3 to 3'];

export interface ScenePanelProps {
  /** the scene, or null before one has been made */
  obj: ThoughtObject | null;
  selected: string | null;
  onSelect: (part: string | null) => void;
  /** apply one operation to the scene — computed by the workspace; an edit made by hand is one step */
  onOp: (objId: string, op: string, args: Record<string, string | number>, at: number) => { ok: boolean; why?: string };
  onSeek: (objId: string, at: number) => void;
  /** what is being typed in the chat box — drawn here as it would be built when sent */
  draft?: string;
  /** the part the conversation last made or changed: "it", when nothing is selected */
  last?: string | null;
  /** put a description into the chat box, to be finished and sent from there */
  onSuggest?: (text: string) => void;
  readOnly?: boolean;
  dark?: boolean;
  /**
   * The Answer Guard is up (learning mode): the conversation is holding back
   * the volumes, areas and masses, so the panel does too — its Measured
   * section says they are held back while the person works them out, and the
   * parts list shows no mass. Sizes, places and the scene itself still show.
   * Default false: everything is shown.
   */
  guarded?: boolean;
}

/** The 3D view, or — where WebGL cannot start — a sentence saying so. The parts and the description still work. */
class CanvasGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <div className="s3-wait">The 3D view could not start in this browser (WebGL). The parts below, and describing them in the chat, still work.</div>;
    return this.props.children;
  }
}

/** The steps of one description share a timestamp: undo takes the whole description back. */
function groupStart(o: ThoughtObject): number {
  let i = o.at;
  const t = o.steps[i - 1]?.at;
  while (i > 0 && o.steps[i - 1].at === t) i--;
  return i;
}
function groupEnd(o: ThoughtObject): number {
  let i = o.at;
  const t = o.steps[i]?.at;
  while (i < o.steps.length && o.steps[i].at === t) i++;
  return i;
}

const num = (v: number) => Number(v.toPrecision(6)).toString();

export function ScenePanel(p: ScenePanelProps) {
  const scene = p.obj ? (currentOf(p.obj) as SceneState) : EMPTY;
  const [turn, setTurn] = useState<SceneTurn | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<GizmoMode>('translate');
  const [snap, setSnap] = useState(true);
  const [fitKey, setFitKey] = useState(0);
  const draft = p.readOnly ? '' : (p.draft ?? '');

  // READ AS THEY TYPE IN THE CHAT — a pause, then the whole message again, against the scene as it is now
  useEffect(() => {
    if (!draft.trim()) {
      setTurn(null);
      return;
    }
    const t = setTimeout(() => setTurn(sceneTurn(draft, scene, { selected: p.selected, last: p.last ?? null })), 180);
    return () => clearTimeout(t);
  }, [draft, scene, p.selected, p.last]);
  useEffect(() => setNotice(null), [draft]);

  // the first time there is something to see, frame it
  const hadParts = useRef(scene.nodes.length > 0);
  useEffect(() => {
    if (!hadParts.current && scene.nodes.length) setFitKey((k) => k + 1);
    hadParts.current = scene.nodes.length > 0;
  }, [scene.nodes.length]);

  // only what sending will build is drawn: a message read in part builds nothing, so nothing of it is ghosted
  const building = turn?.kind === 'build' ? turn.reading : null;
  const shown = building ? building.preview : scene;
  const sel = p.selected ? scene.nodes.find((n) => n.id === p.selected) ?? null : null;

  /** an edit made by hand — the inspector, the gizmo — as one step */
  function edit(op: string, args: Record<string, string | number>): boolean {
    if (p.readOnly || !p.obj) return false;
    const r = p.onOp(p.obj.id, op, args, Date.now());
    if (!r.ok) setNotice(r.why ?? 'That could not be computed.');
    return r.ok;
  }

  const canUndo = !!p.obj && p.obj.at > 0;
  const canRedo = !!p.obj && p.obj.at < p.obj.states.length - 1;
  const recent = p.obj ? p.obj.steps.slice(0, p.obj.at).slice(-4).reverse() : [];

  return (
    <div className="s3">
      <header className="s3-head">
        <span className="s3-title">Live 3D</span>
        <span className="s3-exp">experimental</span>
        <span className="s3-preview" title="Shapes, sizes and positions, computed exactly; mass only as density × volume. Nothing is loaded, stressed or simulated.">
          Geometric preview — not a physical simulation
        </span>
        <span className="s3-sp" />
        <div className="s3-tools" role="toolbar" aria-label="Scene tools">
          {(['translate', 'rotate', 'scale'] as const).map((m) => (
            <button key={m} type="button" className={mode === m ? 'is-on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)} disabled={p.readOnly}>
              {m === 'translate' ? 'Move' : m === 'rotate' ? 'Rotate' : 'Scale'}
            </button>
          ))}
          <button type="button" className={snap ? 'is-on' : ''} aria-pressed={snap} onClick={() => setSnap((v) => !v)} title="Snap the gizmo: 5 cm, 15°, ×0.05">
            Snap
          </button>
          <button type="button" onClick={() => setFitKey((k) => k + 1)} title="Frame the whole scene">
            Fit
          </button>
          <button type="button" disabled={!canUndo || p.readOnly} onClick={() => p.obj && p.onSeek(p.obj.id, groupStart(p.obj))} title="Undo the last description or edit">
            Undo
          </button>
          <button type="button" disabled={!canRedo || p.readOnly} onClick={() => p.obj && p.onSeek(p.obj.id, groupEnd(p.obj))} title="Redo">
            Redo
          </button>
          <select aria-label="Show lengths in" value={scene.unit} disabled={p.readOnly || !p.obj} onChange={(e) => edit('unit', { unit: e.target.value })}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="s3-body">
      <div className="s3-main">
      <div className="s3-stage">
        <CanvasGuard>
          <SceneCanvas
            scene={shown}
            base={scene}
            changes={building ? building.changes : null}
            selected={p.selected}
            onSelect={p.onSelect}
            mode={mode}
            snap={snap}
            onTransform={
              p.readOnly
                ? undefined
                : (id, t) => {
                    const n = scene.nodes.find((x) => x.id === id);
                    const args: Record<string, string | number> = { id, x: t.pos[0], y: t.pos[1], z: t.pos[2], rx: t.rot[0], ry: t.rot[1], rz: t.rot[2], sx: t.scale[0], sy: t.scale[1], sz: t.scale[2] };
                    // moved only across the floor (or along what it rests on): it keeps resting there
                    if (n && Math.abs(n.pos[1] - t.pos[1]) < 1e-6) args.keep = 'y';
                    return edit('transform', args);
                  }
            }
            fitKey={fitKey}
            dark={p.dark}
          />
        </CanvasGuard>
        {!scene.nodes.length && !building && (
          <div className="s3-empty">
            <p>{p.readOnly ? 'Nothing has been built in this scene yet.' : 'Describe something in the chat to build it here. It appears as you type, and is made when you send it.'}</p>
            {!p.readOnly && p.onSuggest && (
              <ul>
                {STARTS.map((s) => (
                  <li key={s}>
                    <button type="button" onClick={() => p.onSuggest!(s)}>
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {(turn || notice) && (
        <div className="s3-read" aria-live="polite">
          <ol>
            {notice && <li className="is-problem">{notice}</li>}
            {turn?.reading.clauses.map((c, i) => (
              <li key={i} className={c.problem ? 'is-problem' : c.understood ? 'is-ok' : 'is-noted'}>
                <span className="s3-mark" aria-hidden>
                  {c.problem ? '✗' : c.understood ? '✓' : '·'}
                </span>
                {/* a clause that is only request framing — "add sliders …" — builds nothing, and is noted */}
                <span>{c.problem ?? c.understood ?? `noted: ${(c.noted ?? []).join('; ')}`}</span>
                {c.understood && c.noted?.length ? <span className="s3-noted">noted: {c.noted.join('; ')}</span> : null}
                {c.skipped?.length ? <span className="s3-skip">not read: {c.skipped.join(', ')}</span> : null}
                {c.notes?.map((n) => (
                  <span key={n} className="s3-note">
                    {n}
                  </span>
                ))}
              </li>
            ))}
          </ol>
          {turn && (
            <p className="s3-next">
              {turn.kind === 'build' ? 'Send it in the chat to build this. Undo takes it back whole.' : 'Sending this builds nothing until all of it reads.'}
            </p>
          )}
        </div>
      )}

      </div>
      <aside className="s3-side" aria-label="Parts of the scene">
        {/* the part in hand first, so it is in view however many parts there are */}
        {sel && <Inspector key={sel.id} node={sel} scene={scene} readOnly={!!p.readOnly} guarded={!!p.guarded} edit={edit} onDone={() => p.onSelect(null)} />}
        <PartsList scene={scene} selected={p.selected} onSelect={p.onSelect} guarded={!!p.guarded} />
        {recent.length > 0 && (
          <div className="s3-steps">
            <h4>Steps</h4>
            <ul>
              {recent.map((s, i) => (
                <li key={i}>
                  {s.said}
                  {s.note && <span className="s3-note">{s.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
      </div>
    </div>
  );
}

function PartsList({ scene, selected, onSelect, guarded }: { scene: SceneState; selected: string | null; onSelect: (id: string | null) => void; guarded: boolean }) {
  // under the Answer Guard a mass is an answer (density × volume): it is not shown here either
  const weighed = useMemo(() => (guarded ? null : sceneMass(scene)), [scene, guarded]);
  if (!scene.nodes.length) return null;
  return (
    <div className="s3-parts">
      <h4>
        Parts <span>{scene.nodes.length}</span>
        {weighed && (
          <span className="s3-mass" title={`over the ${weighed.weighed} part${weighed.weighed === 1 ? '' : 's'} with a density${weighed.nominal ? '; some on nominal densities' : ''}; centre of mass at (${weighed.at.map((v) => num(v / UNIT_M[scene.unit])).join(', ')}) ${scene.unit}`}>
            {' '}· {weighed.kg >= 1000 ? `${num(weighed.kg / 1000)} t` : `${num(weighed.kg)} kg`}
            {weighed.unweighed ? ` (${weighed.unweighed} unweighed)` : ''}
          </span>
        )}
      </h4>
      <ul>
        {scene.nodes.map((n) => {
          const rest = n.on === 'ground' ? 'on the floor' : n.on ? `on ${scene.nodes.find((x) => x.id === n.on)?.name ?? n.on}` : 'free';
          return (
            <li key={n.id}>
              <button type="button" className={n.id === selected ? 'is-sel' : ''} aria-pressed={n.id === selected} onClick={() => onSelect(n.id === selected ? null : n.id)}>
                <span className="s3-sw" style={{ background: n.color }} aria-hidden />
                <span className="s3-pn">{n.name}</span>
                <span className="s3-ps">{sizeOf(n, scene.unit)}</span>
                <span className="s3-pr">{rest}</span>
                {n.assumed?.length ? <span className="s3-def" title="Sizes nobody gave — defaults">default size</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A field that commits on Enter or when it loses focus — and shows the scene's value again if refused. */
function Field({ label, value, onCommit, disabled, suffix, wide }: { label: string; value: string; onCommit: (v: string) => boolean; disabled?: boolean; suffix?: string; wide?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const done = () => {
    if (v.trim() === value) return;
    if (!onCommit(v.trim())) setV(value);
  };
  return (
    <label className={`s3-f${wide ? ' is-wide' : ''}`}>
      <span>{label}</span>
      <input
        value={v}
        disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setV(value);
        }}
        spellCheck={false}
      />
      {suffix && <em>{suffix}</em>}
    </label>
  );
}

function Inspector({ node: n, scene, readOnly, guarded, edit, onDone }: { node: SceneNode; scene: SceneState; readOnly: boolean; guarded: boolean; edit: (op: string, a: Record<string, string | number>) => boolean; onDone: () => void }) {
  const u = scene.unit;
  const k = UNIT_M[u];
  const m = useMemo(() => measure(n), [n]);
  const mass = useMemo(() => massOf(n), [n]);
  const transform = (patch: Partial<Record<'x' | 'y' | 'z' | 'rx' | 'ry' | 'rz' | 'sx' | 'sy' | 'sz', number>>) => {
    const base = { x: n.pos[0], y: n.pos[1], z: n.pos[2], rx: n.rot[0], ry: n.rot[1], rz: n.rot[2], sx: n.scale[0], sy: n.scale[1], sz: n.scale[2] };
    const next = { ...base, ...patch };
    return edit('transform', { id: n.id, ...next, ...(patch.y === undefined ? { keep: 'y' } : {}) });
  };
  const numIn = (s: string) => (s !== '' && Number.isFinite(Number(s)) ? Number(s) : null);
  const supports = scene.nodes.filter((x) => x.id !== n.id);
  return (
    <div className="s3-insp" aria-label={`${n.name}, inspected`}>
      <header>
        <Field label="Name" value={n.name} wide disabled={readOnly} onCommit={(v) => !!v && edit('rename', { id: n.id, name: v })} />
        <span className="s3-kind">
          {SHAPE_WORD[n.shape]} · {n.id}
        </span>
        <button type="button" className="s3-x" aria-label="Close the inspector" onClick={onDone}>
          ×
        </button>
      </header>
      <section>
        <h5>Size</h5>
        <div className="s3-row">
          {DIMS[n.shape].map((d) => {
            const isLen = !d.count && !d.coord;
            const shownV = isLen ? n.dims[d.key] / k : n.dims[d.key];
            return (
              <Field
                key={d.key}
                label={d.label}
                value={num(shownV)}
                suffix={isLen ? u : undefined}
                disabled={readOnly}
                onCommit={(s) => {
                  const v = numIn(s);
                  return v !== null && edit('set', { id: n.id, key: d.key, value: isLen ? v * k : v });
                }}
              />
            );
          })}
        </div>
        {EXPRS[n.shape] &&
          Object.keys(EXPRS[n.shape]!).map((key) => (
            <Field
              key={key}
              wide
              label={key === 'pts' ? 'corners (x,z | …)' : `${key}(${EXPRS[n.shape]![key].join(', ')}) =`}
              value={n.exprs?.[key] ?? ''}
              disabled={readOnly}
              onCommit={(s) => !!s && edit('set', { id: n.id, key: `expr.${key}`, value: s })}
            />
          ))}
        {n.assumed?.length ? <p className="s3-note">Default: {n.assumed.map((a) => DIMS[n.shape].find((d) => d.key === a)?.label ?? a).join(', ')} — nobody gave {n.assumed.length === 1 ? 'it' : 'them'}.</p> : null}
      </section>
      <section>
        <h5>Place</h5>
        <div className="s3-row">
          {(['x', 'y', 'z'] as const).map((ax, i) => (
            <Field key={ax} label={ax} value={num(n.pos[i] / k)} suffix={u} disabled={readOnly} onCommit={(s) => { const v = numIn(s); return v !== null && transform({ [ax]: v * k }); }} />
          ))}
        </div>
        <div className="s3-row">
          {(['rx', 'ry', 'rz'] as const).map((ax, i) => (
            <Field key={ax} label={`turn ${ax[1]}`} value={num(n.rot[i])} suffix="°" disabled={readOnly} onCommit={(s) => { const v = numIn(s); return v !== null && transform({ [ax]: v }); }} />
          ))}
        </div>
        <div className="s3-row">
          {(['sx', 'sy', 'sz'] as const).map((ax, i) => (
            <Field key={ax} label={`stretch ${ax[1]}`} value={num(n.scale[i])} suffix="×" disabled={readOnly} onCommit={(s) => { const v = numIn(s); return v !== null && v > 0 && transform({ [ax]: v }); }} />
          ))}
        </div>
        <label className="s3-f is-wide">
          <span>Rests on</span>
          <select
            value={n.on ?? ''}
            disabled={readOnly}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'ground') edit('place', { id: n.id, target: 'ground', side: 'ground', gap: 0 });
              else if (v) edit('place', { id: n.id, target: v, side: 'top', gap: 0 });
            }}
          >
            <option value="" disabled>
              nothing — it stands free
            </option>
            <option value="ground">the floor</option>
            {supports.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section>
        <h5>Look</h5>
        <div className="s3-row">
          <label className="s3-f">
            <span>colour</span>
            <input type="color" value={n.color} disabled={readOnly} onChange={(e) => edit('look', { id: n.id, color: e.target.value })} />
          </label>
          <label className="s3-f">
            <span>finish</span>
            <select value={n.mat} disabled={readOnly} onChange={(e) => edit('look', { id: n.id, mat: e.target.value })}>
              {MATERIALS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <Field label="opacity" value={num(n.opacity)} disabled={readOnly} onCommit={(s) => { const v = numIn(s); return v !== null && edit('look', { id: n.id, opacity: v }); }} />
        </div>
      </section>
      <section>
        <h5>Made of</h5>
        <div className="s3-row">
          <Field
            label="material"
            value={n.material ?? ''}
            disabled={readOnly}
            onCommit={(v) => !!v && edit('matter', { id: n.id, name: v, ...(n.densityFrom === 'given' && n.density !== undefined ? { density: n.density } : {}) })}
          />
          <Field
            label={n.densityFrom === 'nominal' ? 'density (nominal)' : 'density'}
            value={n.density !== undefined ? num(n.density) : ''}
            suffix="kg/m³"
            disabled={readOnly}
            onCommit={(v) => {
              const d = numIn(v);
              return d !== null && edit('matter', { id: n.id, ...(n.material ? { name: n.material } : {}), density: d });
            }}
          />
        </div>
        {n.densityFrom === 'nominal' && <p className="s3-note">A typical value for {n.material}, not a measurement — type a measured density to replace it.</p>}
      </section>
      <section className="s3-measure">
        <h5>Measured</h5>
        {guarded ? (
          // THE ANSWER GUARD, here too: the conversation holds back the volumes, areas and masses
          // while the person works them out (SCENE.facts guarded), so the panel does not hand them over
          <p className="s3-guardnote" role="note">
            working it out — its volume, surface area and mass stay yours until you reveal them
          </p>
        ) : (
          <>
            <p>
              {m.volume !== null ? `volume ${num(m.volume / k ** 3)} ${u}³` : 'no volume'}
              {m.area !== null ? ` · surface ${num(m.area / k ** 2)} ${u}²` : ''}
              <span className={`s3-how is-${m.how}`}>{m.how === 'exact' ? 'exact' : 'numerical'}</span>
            </p>
            {mass && (
              <p>
                mass {mass.kg >= 1000 ? `${num(mass.kg / 1000)} t` : `${num(mass.kg)} kg`}
                <span className={`s3-how is-${mass.how}`}>{mass.nominal ? 'nominal density' : mass.how === 'exact' ? 'exact' : 'numerical'}</span>
              </p>
            )}
            {m.note && <p className="s3-note">{m.note}</p>}
          </>
        )}
        <p className="s3-note">{guarded ? 'Nothing is loaded or stressed — no strength is modelled.' : mass ? 'Mass is density × volume. Nothing is loaded or stressed — no strength is modelled.' : 'Give it a material or a density for its mass. Nothing is loaded or stressed — no strength is modelled.'}</p>
      </section>
      <footer>
        <button type="button" disabled={readOnly} onClick={() => edit('copy', { id: n.id, count: 1, dx: Math.max(0.25, 1.25 * (sizeOfX(n) || 1)) })}>
          Copy
        </button>
        <button type="button" className="is-danger" disabled={readOnly} onClick={() => edit('remove', { id: n.id }) && onDone()}>
          Remove
        </button>
      </footer>
    </div>
  );
}

/** The part's width on the floor, for placing a copy beside it. */
function sizeOfX(n: SceneNode): number {
  const d = n.dims;
  const w = n.shape === 'box' || n.shape === 'plane' ? d.w : d.R !== undefined ? 2 * (d.R + (n.shape === 'torus' ? d.r : 0)) : d.r !== undefined ? 2 * d.r : 1;
  return w * n.scale[0];
}

export default ScenePanel;
