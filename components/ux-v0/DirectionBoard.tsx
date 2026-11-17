'use client';
// components/ux-v0/DirectionBoard.tsx — art direction, the designer's to decide.
//
// Three directions for the approved brief, each drawn as a real specimen by
// the same renderer the design will use, so what is chosen is what will be
// drawn. The designer can write their own direction and what to avoid and ask
// again, take one as it is, change any part of it (a change locks that part:
// it survives asking again, regenerating and refining), or let SocriaUX
// choose. Nothing here calls a model unless they ask for three new ones.

import { useEffect, useMemo, useRef, useState } from 'react';
import { contrastRatio } from '@/lib/ux/audit';
import { LOCK_LABEL, languageOf, type ArtDirection, type DirectionState, type LockGroup } from '@/lib/ux-v0/direction';
import { FONTS, nearestWeight } from '@/lib/ux-v0/fonts';
import { renderDesign } from '@/lib/ux-v0/render';
import { BUTTONS, CONTAINERS, FRAMES, GRIDS, MOTIFS, TREATMENTS, normalizeSpec, type Look } from '@/lib/ux-v0/spec';
import type { DesignBrief, MoodboardRef } from '@/lib/ux-v0/types';

interface Props {
  state: DirectionState;
  brief: DesignBrief;
  name: string;
  refs: MoodboardRef[];
  busy: string | null;
  /** what the model is doing for the three, said quietly */
  note: string;
  onNotes: (notes: string, avoid: string) => void;
  onAsk: () => void;
  onEdit: (id: string, next: ArtDirection, group: LockGroup) => void;
  onLock: (id: string, group: LockGroup, on: boolean) => void;
  onApprove: (d: ArtDirection) => void;
  onAuto: () => void;
  onBack: () => void;
}

const GRID_LABEL: Record<string, string> = { stack: 'Stacked', editorial: 'Editorial side column', swiss: 'Strict columns', centered: 'Centred', asymmetric: 'Asymmetric', poster: 'Poster', modular: 'Modular cells' };
const CONTAINER_LABEL: Record<string, string> = { open: 'Open', ruled: 'Ruled', cards: 'Cards', bands: 'Colour bands', framed: 'Framed' };
const BUTTON_LABEL: Record<string, string> = { solid: 'Solid', pill: 'Pill', outline: 'Outline', underline: 'Underlined link', block: 'Heavy block', offset: 'Hard shadow' };
const FRAME_LABEL: Record<string, string> = { plain: 'Plain', inset: 'Mounted', arch: 'Arch', circle: 'Circle', offset: 'Offset shadow' };
const TREAT_LABEL: Record<string, string> = { natural: 'Natural', muted: 'Muted', warm: 'Warm', mono: 'Black and white', duotone: 'Duotone', contrast: 'High contrast' };
const MOTIF_LABEL: Record<string, string> = { numbering: 'Numbered sections', shapes: 'Flat shapes', marquee: 'Running marquee', captions: 'Captions', 'big-numerals': 'Giant numerals', 'pull-quote': 'Pull quotes', icons: 'Icons' };
const RATIOS: [number, string][] = [
  [1.2, 'Quiet (1.2)'],
  [1.25, 'Measured (1.25)'],
  [1.333, 'Balanced (1.33)'],
  [1.414, 'Pronounced (1.41)'],
  [1.5, 'Dramatic (1.5)'],
  [1.618, 'Poster (1.62)'],
];
const nearestRatio = (r: number) => RATIOS.reduce((a, b) => (Math.abs(b[0] - r) < Math.abs(a[0] - r) ? b : a))[0];

/** A short page in the direction, from the brief's own words: what the design will be drawn like. */
function specimen(d: ArtDirection, brief: DesignBrief, name: string, refs: MoodboardRef[]): string {
  const lang = languageOf(d.language);
  const kept = refs.filter((r) => r.state === 'kept');
  const img = kept[0] ? [kept[0].id] : [];
  const heroPref = (lang?.prefer.hero ?? ['statement']).find((v) => (v === 'split' || v === 'full-bleed' ? img.length > 0 : true)) ?? 'statement';
  const goals = brief.userGoals.slice(0, 3);
  const spec = normalizeSpec(
    {
      title: name,
      pageType: 'website',
      tokens: d.tokens,
      look: d.look,
      sections: [
        { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: name, links: ['About', 'Work', 'Visit'], cta: 'Begin' } },
        {
          id: 'hero', kind: 'hero', variant: heroPref, images: img, tone: 'base', pad: 'm',
          content: { eyebrow: brief.personality.slice(0, 3).join(' · '), title: name, subtitle: brief.objective, primary: 'Begin', secondary: 'Read more' },
        },
        goals.length >= 2
          ? { id: 'goals', kind: 'features', variant: (lang?.prefer.features ?? ['columns'])[0], tone: d.look.containers === 'bands' ? 'alt' : 'base', content: { title: 'What people come to do', items: goals.map((g) => ({ title: g.slice(0, 60), text: '' })) } }
          : null,
        { id: 'cta', kind: 'cta', variant: (lang?.prefer.cta ?? ['band'])[0], tone: lang?.tones.cta ?? 'base', content: { title: brief.audience ? `For ${brief.audience.charAt(0).toLowerCase()}${brief.audience.slice(1, 60)}` : 'Begin', primary: 'Begin' } },
      ].filter(Boolean),
    },
    { refs, queries: [], palettes: [], type: [] } as any
  );
  return spec ? renderDesign(spec, refs).html : '';
}

function Swatch({ hex, label }: { hex: string; label: string }) {
  return <span className="v0-swatch is-lg" style={{ background: hex }} title={`${label} ${hex}`} aria-label={`${label} ${hex}`} role="img" />;
}

function Lock({ d, group, onLock }: { d: ArtDirection; group: LockGroup; onLock: Props['onLock'] }) {
  const on = d.locks.includes(group);
  return (
    <label className={`v0-lock${on ? ' is-on' : ''}`} title={on ? 'Kept when you ask again, regenerate or refine' : 'Free to change'}>
      <input type="checkbox" checked={on} onChange={(e) => onLock(d.id, group, e.target.checked)} />
      <span>{on ? `${LOCK_LABEL[group]} kept` : `Keep ${LOCK_LABEL[group].toLowerCase()}`}</span>
    </label>
  );
}

function Edit({ d, onEdit, onLock }: { d: ArtDirection; onEdit: Props['onEdit']; onLock: Props['onLock'] }) {
  const set = (group: LockGroup, tokens: Partial<ArtDirection['tokens']>, look: Partial<Look> = {}, extra: Partial<ArtDirection> = {}) =>
    onEdit(d.id, { ...d, ...extra, tokens: { ...d.tokens, ...tokens }, look: { ...d.look, ...look }, source: 'person' }, group);
  const c = d.tokens.colors;
  const colour = (key: keyof typeof c, label: string) => (
    <label className="v0-colour">
      <input type="color" value={c[key]} onChange={(e) => set('palette', { colors: { ...c, [key]: e.target.value } })} aria-label={label} />
      <span>{label}</span>
    </label>
  );
  return (
    <div className="v0-dir-edit-body">
      <fieldset className="v0-dir-group">
        <legend className="sb-label">Colours</legend>
        <div className="v0-colours">
          {colour('background', 'Ground')}
          {colour('text', 'Text')}
          {colour('accent', 'Accent')}
          {colour('accentText', 'On accent')}
          <label className="v0-colour">
            <input type="color" value={d.look.accent2 || c.accent} onChange={(e) => set('palette', {}, { accent2: e.target.value })} aria-label="Second ink" />
            <span>Second ink</span>
          </label>
        </div>
        <p className={`v0-quiet${contrastRatio(c.text, c.background) < 7 ? ' v0-warn' : ''}`}>Text on ground {contrastRatio(c.text, c.background).toFixed(1)}:1 · on accent {contrastRatio(c.accentText, c.accent).toFixed(1)}:1</p>
        <Lock d={d} group="palette" onLock={onLock} />
      </fieldset>
      <fieldset className="v0-dir-group">
        <legend className="sb-label">Type</legend>
        <div className="v0-type-pick">
          <select className="v0-select" value={d.tokens.fonts.display} aria-label="Headline face" onChange={(e) => set('type', { fonts: { ...d.tokens.fonts, display: e.target.value } }, { weight: nearestWeight(e.target.value, d.look.weight) })}>
            {FONTS.filter((f) => f.kind !== 'mono').map((f) => (
              <option key={f.name}>{f.name}</option>
            ))}
          </select>
          <select className="v0-select" value={d.tokens.fonts.body} aria-label="Text face" onChange={(e) => set('type', { fonts: { ...d.tokens.fonts, body: e.target.value } })}>
            {FONTS.filter((f) => !f.displayOnly && f.kind !== 'mono').map((f) => (
              <option key={f.name}>{f.name}</option>
            ))}
          </select>
          <select className="v0-select" value={nearestRatio(d.look.ratio)} aria-label="Type scale" onChange={(e) => set('type', {}, { ratio: Number(e.target.value) })}>
            {RATIOS.map(([r, l]) => (
              <option key={r} value={r}>
                {l}
              </option>
            ))}
          </select>
          <select className="v0-select" value={d.look.case} aria-label="Headline case" onChange={(e) => set('type', {}, { case: e.target.value as Look['case'] })}>
            <option value="sentence">Sentence case</option>
            <option value="upper">Capitals</option>
          </select>
          <select className="v0-select" value={String(Math.round(d.look.weight / 100) * 100)} aria-label="Headline weight" onChange={(e) => set('type', {}, { weight: nearestWeight(d.tokens.fonts.display, Number(e.target.value)) })}>
            {[300, 400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w} value={w}>
                Weight {w}
              </option>
            ))}
          </select>
        </div>
        <Lock d={d} group="type" onLock={onLock} />
      </fieldset>
      <fieldset className="v0-dir-group">
        <legend className="sb-label">Layout</legend>
        <div className="v0-type-pick">
          <select className="v0-select" value={d.look.grid} aria-label="Grid" onChange={(e) => set('layout', {}, { grid: e.target.value as Look['grid'] })}>
            {GRIDS.map((g) => (
              <option key={g} value={g}>
                {GRID_LABEL[g]}
              </option>
            ))}
          </select>
          <select className="v0-select" value={d.look.width} aria-label="Width" onChange={(e) => set('layout', {}, { width: e.target.value as Look['width'] })}>
            <option value="narrow">Narrow</option>
            <option value="standard">Standard</option>
            <option value="wide">Wide</option>
          </select>
          <select className="v0-select" value={d.tokens.scale} aria-label="Space" onChange={(e) => set('layout', { scale: e.target.value as ArtDirection['tokens']['scale'] })}>
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="spacious">Spacious</option>
          </select>
        </div>
        <Lock d={d} group="layout" onLock={onLock} />
      </fieldset>
      <fieldset className="v0-dir-group">
        <legend className="sb-label">Surfaces</legend>
        <div className="v0-type-pick">
          <select className="v0-select" value={d.look.containers} aria-label="Containers" onChange={(e) => set('surface', {}, { containers: e.target.value as Look['containers'] })}>
            {CONTAINERS.map((x) => (
              <option key={x} value={x}>
                {CONTAINER_LABEL[x]}
              </option>
            ))}
          </select>
          <select className="v0-select" value={d.look.buttons} aria-label="Buttons" onChange={(e) => set('surface', {}, { buttons: e.target.value as Look['buttons'] })}>
            {BUTTONS.map((x) => (
              <option key={x} value={x}>
                {BUTTON_LABEL[x]}
              </option>
            ))}
          </select>
          <select className="v0-select" value={d.tokens.radius} aria-label="Corners" onChange={(e) => set('surface', { radius: e.target.value as ArtDirection['tokens']['radius'] })}>
            <option value="none">Square corners</option>
            <option value="soft">Soft corners</option>
            <option value="round">Round corners</option>
          </select>
        </div>
        <Lock d={d} group="surface" onLock={onLock} />
      </fieldset>
      <fieldset className="v0-dir-group">
        <legend className="sb-label">Imagery</legend>
        <div className="v0-type-pick">
          <select className="v0-select" value={d.tokens.imageTreatment} aria-label="Treatment" onChange={(e) => set('imagery', { imageTreatment: e.target.value as ArtDirection['tokens']['imageTreatment'] })}>
            {TREATMENTS.map((x) => (
              <option key={x} value={x}>
                {TREAT_LABEL[x]}
              </option>
            ))}
          </select>
          <select className="v0-select" value={d.look.frame} aria-label="Frame" onChange={(e) => set('imagery', {}, { frame: e.target.value as Look['frame'] })}>
            {FRAMES.map((x) => (
              <option key={x} value={x}>
                {FRAME_LABEL[x]}
              </option>
            ))}
          </select>
        </div>
        <Lock d={d} group="imagery" onLock={onLock} />
      </fieldset>
      <fieldset className="v0-dir-group">
        <legend className="sb-label">Motifs</legend>
        <div className="v0-motifs">
          {MOTIFS.map((m) => (
            <label key={m} className="v0-check">
              <input
                type="checkbox"
                checked={d.look.motifs.includes(m)}
                onChange={(e) => {
                  const motifs = e.target.checked ? [...d.look.motifs, m] : d.look.motifs.filter((x) => x !== m);
                  set('motifs', {}, { motifs, shapes: motifs.includes('shapes') ? (d.look.shapes.length ? d.look.shapes : ['circle', 'square']) : [] });
                }}
              />
              <span>{MOTIF_LABEL[m]}</span>
            </label>
          ))}
        </div>
        <Lock d={d} group="motifs" onLock={onLock} />
      </fieldset>
      <fieldset className="v0-dir-group">
        <legend className="sb-label">Voice</legend>
        <textarea className="v0-field" rows={2} value={d.voice} aria-label="How the copy speaks" onChange={(e) => set('voice', {}, {}, { voice: e.target.value.slice(0, 280) })} />
        <Lock d={d} group="voice" onLock={onLock} />
      </fieldset>
    </div>
  );
}

function Tile({ d, n, brief, name, refs, busy, onEdit, onLock, onApprove }: { d: ArtDirection; n: number; brief: DesignBrief; name: string; refs: MoodboardRef[]; busy: string | null } & Pick<Props, 'onEdit' | 'onLock' | 'onApprove'>) {
  const html = useMemo(() => specimen(d, brief, name, refs), [d, brief, name, refs]);
  const lang = languageOf(d.language);
  // the specimen is drawn at 1280 px and scaled to whatever width the tile has
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.31);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setScale(Math.max(0.1, e.contentRect.width / 1280)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const c = d.tokens.colors;
  return (
    <article className="v0-dir" aria-label={`Direction ${n}: ${d.name}`}>
      <div className="v0-dir-preview" ref={box} style={{ ['--dir-scale' as string]: scale }}>
        <iframe title={`Specimen of ${d.name}`} sandbox="" srcDoc={html} tabIndex={-1} aria-hidden="true" loading="lazy" />
      </div>
      <div className="v0-dir-text">
        <span className="sb-label">
          Direction {n}
          {lang && lang.name !== d.name ? ` · ${lang.name}` : ''}
          {d.source === 'person' ? ' · changed by you' : d.source === 'model' ? ' · written by SocriaUX' : ''}
        </span>
        <h3 className="v0-cell-title">{d.name}</h3>
        <p className="v0-body">{d.concept}</p>
        <div className="v0-dir-facts">
          <span className="v0-dir-swatches">
            <Swatch hex={c.background} label="Ground" />
            <Swatch hex={c.text} label="Text" />
            <Swatch hex={c.accent} label="Accent" />
            {d.look.accent2 && <Swatch hex={d.look.accent2} label="Second ink" />}
          </span>
          <span className="v0-quiet">
            {d.tokens.fonts.display} and {d.tokens.fonts.body} · {GRID_LABEL[d.look.grid].toLowerCase()} · {CONTAINER_LABEL[d.look.containers].toLowerCase()}
          </span>
        </div>
        {d.locks.length > 0 && <p className="v0-quiet v0-dir-locks">Kept: {d.locks.map((g) => LOCK_LABEL[g].toLowerCase()).join(', ')}</p>}
        <details className="v0-dir-more">
          <summary className="sb-link is-meta">Why, and how it speaks</summary>
          <ul className="v0-plain">
            {d.rationale.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <dl className="v0-kv">
            <dt>Voice</dt>
            <dd>{d.voice}</dd>
            <dt>Layout</dt>
            <dd>{d.composition}</dd>
            <dt>Imagery</dt>
            <dd>{d.imagery}</dd>
            {d.avoid.length > 0 && (
              <>
                <dt>Refuses</dt>
                <dd>{d.avoid.join('; ')}</dd>
              </>
            )}
          </dl>
        </details>
        <details className="v0-dir-more">
          <summary className="sb-link is-meta">Change any part of it</summary>
          <p className="v0-quiet">What you change is kept: asking again, regenerating and refining leave it as you set it.</p>
          <Edit d={d} onEdit={onEdit} onLock={onLock} />
        </details>
        <div className="v0-q-acts">
          <button type="button" className={`sb-btn${n === 1 ? ' is-primary' : ''}`} onClick={() => onApprove(d)} disabled={!!busy}>
            Use this direction
          </button>
        </div>
      </div>
    </article>
  );
}

export function DirectionBoard(p: Props) {
  const { state } = p;
  return (
    <div className="v0-brief v0-direct">
      <header className="v0-brief-head">
        <span className="sb-label">Art direction · before anything is drawn</span>
        <h2 className="v0-brief-title">Three ways this could look.</h2>
        <p className="v0-body v0-direct-lede">
          Each is a different visual language for the same brief, drawn by the renderer your design will use. Take one, change any part of it, write your own direction, or let SocriaUX choose.
        </p>
      </header>

      <div className="v0-direct-own">
        <label className="v0-brief-field">
          <span className="sb-label">Your direction, if you have one</span>
          <textarea className="v0-field" rows={2} value={state.notes} placeholder="“Like a printed museum guide”, “darker, more like a bar”, “no serifs”, a colour like #c4421a…" onChange={(e) => p.onNotes(e.target.value, state.avoid)} />
        </label>
        <label className="v0-brief-field">
          <span className="sb-label">What it must not look like</span>
          <input className="v0-field" value={state.avoid} placeholder="“gradients”, “rounded cards”, “anything dark”" onChange={(e) => p.onNotes(state.notes, e.target.value)} />
        </label>
        <div className="v0-direct-ask">
          <button type="button" className="sb-btn" onClick={p.onAsk} disabled={!!p.busy}>
            {state.notes || state.avoid ? 'Show three for this' : 'Show three others'}
          </button>
          {p.note && <span className="v0-quiet" role="status">{p.note}</span>}
        </div>
      </div>

      <div className="v0-direct-grid">
        {state.options.map((d, i) => (
          <Tile key={d.id} d={d} n={i + 1} brief={p.brief} name={p.name} refs={p.refs} busy={p.busy} onEdit={p.onEdit} onLock={p.onLock} onApprove={p.onApprove} />
        ))}
      </div>

      <footer className="v0-brief-foot">
        <button type="button" className="sb-btn is-primary" onClick={p.onAuto} disabled={!!p.busy || !state.options.length}>
          {p.busy ?? 'Let SocriaUX choose'}
        </button>
        <button type="button" className="sb-link" onClick={p.onBack}>
          Back to the brief
        </button>
        <span className="v0-quiet">SocriaUX’s choice is the first: the most faithful reading of your brief, with its palette and type as you approved them.</span>
      </footer>
    </div>
  );
}

