'use client';
// components/ux-v0/DirectionBoard.tsx — art direction, presented: SocriaUX's reading of the vision, before production.
//
// Three directions for the approved brief, each laid out as a presentation
// board an art director would pin up, not a card: its name set in its own
// display face, a one-sentence thesis, the page drawn by the same renderer the
// design will use (desktop and phone studies, and a preview in motion), a type
// specimen with its whole scale, the palette applied to real interface parts,
// the designer's own references treated the way the direction treats pictures,
// a live study of how it moves, how it is composed, how it speaks and what it
// refuses. The arrangement follows the language (type-led, picture-led,
// system-led), so the three boards do not look alike.
//
// Everything on a board can be decided on the board: lock the type or try
// another pairing, change a colour, another composition, another treatment of
// pictures, a calmer or livelier motion, reject a motif, swap a direction for
// another, or take one into production. A change locks its part: it survives
// asking again, regenerating and refining. The full set of controls is under
// "Change any part of it". Nothing here calls a model unless the designer asks
// for three new ones.
//
// Honesty: the pictures here are drawn by SocriaUX's renderer from the
// direction, or are the designer's own references with the direction's
// treatment applied. SocriaUX has no image generator in this build, and none
// of this pretends otherwise.

import { useEffect, useMemo, useRef, useState } from 'react';
import { contrastRatio } from '@/lib/ux/audit';
import { LOCK_LABEL, languageOf, type ArtDirection, type DirectionState, type LockGroup } from '@/lib/ux-v0/direction';
import { FONTS, fontStack, fontStylesheet, nearestWeight } from '@/lib/ux-v0/fonts';
import { EASE_CURVE, HEADLINE_LABEL, MOTION_LABEL, describeMotion, motionFor, stepMotion } from '@/lib/ux-v0/motion';
import { takenFrom } from '@/lib/ux-v0/references';
import { renderDesign } from '@/lib/ux-v0/render';
import { buildSandboxDoc } from '@/lib/ux-v0/sandbox';
import { BUTTONS, CONTAINERS, FRAMES, GRIDS, MOTIFS, MOTION_FEELS, STILL_MOTION, TREATMENTS, normalizeSpec, type DesignSpec, type Look, type Motion } from '@/lib/ux-v0/spec';
import type { DesignBrief, MoodboardRef } from '@/lib/ux-v0/types';
import { Preview } from './Preview';

interface Props {
  state: DirectionState;
  brief: DesignBrief;
  name: string;
  refs: MoodboardRef[];
  busy: string | null;
  /** what the model is doing for the three, said quietly */
  note: string;
  nonce: string;
  onNotes: (notes: string, avoid: string) => void;
  onAsk: () => void;
  onEdit: (id: string, next: ArtDirection, group: LockGroup) => void;
  onLock: (id: string, group: LockGroup, on: boolean) => void;
  onApprove: (d: ArtDirection) => void;
  onAuto: () => void;
  onBack: () => void;
  /** swap one direction for another the engine has not shown, keeping the other two */
  onReplace: (id: string) => void;
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

/** How pictures look under each treatment, applied to the designer's references on the board. */
const TREAT_FILTER: Record<string, string> = { natural: 'none', muted: 'saturate(.55) contrast(.95)', warm: 'sepia(.28) saturate(1.15)', mono: 'grayscale(1) contrast(1.05)', duotone: 'grayscale(1) contrast(1.15)', contrast: 'contrast(1.35) saturate(1.1)' };

/** Which part leads the board: the language decides. */
const ARRANGE: Record<string, 'type' | 'picture' | 'system'> = {
  poster: 'type', swiss: 'type', 'retro-print': 'type', geometric: 'type',
  'quiet-luxury': 'picture', night: 'picture', gallery: 'picture', craft: 'picture', organic: 'picture',
  utility: 'system', civic: 'system', broadsheet: 'system',
};

/** A short page in the direction, from the brief's own words: what the design will be drawn like. */
function specimenSpec(d: ArtDirection, brief: DesignBrief, name: string, refs: MoodboardRef[]): DesignSpec | null {
  const lang = languageOf(d.language);
  // only a picture marked for the page appears in the page; references only inspire
  const usable = refs.filter((r) => r.state !== 'rejected' && r.media !== 'video' && !r.avoid && r.asContent !== false && (r.provider !== 'upload' || r.asContent === true) && r.url);
  const img = usable[0] ? [usable[0].id] : [];
  const heroPref = (lang?.prefer.hero ?? ['statement']).find((v) => (v === 'split' || v === 'full-bleed' ? img.length > 0 : true)) ?? 'statement';
  const goals = brief.userGoals.slice(0, 3);
  return normalizeSpec(
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
          ? { id: 'goals', kind: 'features', variant: (lang?.prefer.features ?? ['columns'])[0], tone: d.look.containers === 'bands' ? 'alt' : 'base', content: { title: 'What people come to do', items: goals.map((g) => ({ title: g, text: '' })) } }
          : null,
        { id: 'cta', kind: 'cta', variant: (lang?.prefer.cta ?? ['band'])[0], tone: lang?.tones.cta ?? 'base', content: { title: brief.audience ? `For ${brief.audience.charAt(0).toLowerCase()}${brief.audience.slice(1, 60)}` : 'Begin here', primary: 'Begin' } },
      ].filter(Boolean),
    },
    { refs, queries: [], palettes: [], type: [] } as any
  );
}

/** A study: the specimen drawn at a width and scaled to its box. */
function Study({ html, width, label, ratio }: { html: string; width: number; label: string; ratio: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setScale(Math.max(0.08, e.contentRect.width / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div className="ad-study" ref={box} style={{ aspectRatio: String(ratio) }}>
      <iframe title={label} sandbox="" srcDoc={html} tabIndex={-1} aria-hidden="true" loading="lazy" style={{ width, height: Math.ceil(width / ratio), transform: `scale(${scale})` }} />
    </div>
  );
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

/** How the direction moves, played on a small stage in its own type and colours. */
function MotionStudy({ d, name }: { d: ArtDirection; name: string }) {
  const m = d.look.motion ?? STILL_MOTION;
  const [run, setRun] = useState(0);
  const words = name.split(/\s+/).slice(0, 5);
  const c = d.tokens.colors;
  const style = {
    ['--md-d' as string]: `${Math.max(1, m.duration)}ms`,
    ['--md-s' as string]: `${m.stagger}ms`,
    ['--md-x' as string]: `${m.distance}px`,
    ['--md-e' as string]: EASE_CURVE[m.ease],
    background: c.background,
    color: c.text,
  };
  const head =
    m.headline === 'letters'
      ? words.join(' ').split('').map((ch, i) => (
          <span key={i} className="md-k" style={{ ['--i' as string]: i }}>
            {ch === ' ' ? ' ' : ch}
          </span>
        ))
      : m.headline === 'words'
        ? words.map((w, i) => (
            <span key={i} className="md-k" style={{ ['--i' as string]: i }}>
              {w}&nbsp;
            </span>
          ))
        : words.join(' ');
  return (
    <div className={`ad-motion md-${m.feel} mh-${m.headline} me-${m.entrance}`} style={style} key={run}>
      <p className="md-h" style={{ fontFamily: fontStack(d.tokens.fonts.display), fontWeight: d.look.weight, textTransform: d.look.case === 'upper' ? 'uppercase' : undefined }}>
        {head}
      </p>
      <div className="md-row" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="md-item" style={{ ['--i' as string]: i, background: i === 1 ? c.accent : c.surface, borderColor: c.line }} />
        ))}
      </div>
      <button type="button" className="md-replay" onClick={() => setRun((n) => n + 1)} style={{ color: c.text, borderColor: c.line }} disabled={m.feel === 'still'}>
        {m.feel === 'still' ? 'Still' : 'Play again'}
      </button>
    </div>
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
  const m = d.look.motion ?? STILL_MOTION;
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
        <p className={`v0-quiet${contrastRatio(c.text, c.background) < 7 ? ' v0-warn' : ''}`}>
          Text on ground {contrastRatio(c.text, c.background).toFixed(1)}:1 · on accent {contrastRatio(c.accentText, c.accent).toFixed(1)}:1
        </p>
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
        <legend className="sb-label">Motion</legend>
        <div className="v0-type-pick">
          <select className="v0-select" value={m.feel} aria-label="How it moves" onChange={(e) => set('motion', {}, { motion: e.target.value === 'still' ? { ...STILL_MOTION } : motionFor(e.target.value as Motion['feel']) })}>
            {MOTION_FEELS.map((f) => (
              <option key={f} value={f}>
                {MOTION_LABEL[f]}
              </option>
            ))}
          </select>
          <select className="v0-select" value={m.headline} aria-label="Headline arrives" disabled={m.feel === 'still'} onChange={(e) => set('motion', {}, { motion: { ...m, headline: e.target.value as Motion['headline'] } })}>
            {(['none', 'fade', 'mask', 'words', 'letters'] as const).map((h) => (
              <option key={h} value={h}>
                Headline: {HEADLINE_LABEL[h].toLowerCase()}
              </option>
            ))}
          </select>
          <select className="v0-select" value={String(m.parallax)} aria-label="Parallax" disabled={m.feel === 'still'} onChange={(e) => set('motion', {}, { motion: { ...m, parallax: Number(e.target.value) } })}>
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {['No parallax', 'Gentle parallax', 'Clear parallax', 'Deep parallax'][n]}
              </option>
            ))}
          </select>
        </div>
        <Lock d={d} group="motion" onLock={onLock} />
      </fieldset>
      <fieldset className="v0-dir-group">
        <legend className="sb-label">Motifs</legend>
        <div className="v0-motifs">
          {MOTIFS.map((mo) => (
            <label key={mo} className="v0-check">
              <input
                type="checkbox"
                checked={d.look.motifs.includes(mo)}
                onChange={(e) => {
                  const motifs = e.target.checked ? [...d.look.motifs, mo] : d.look.motifs.filter((x) => x !== mo);
                  set('motifs', {}, { motifs, shapes: motifs.includes('shapes') ? (d.look.shapes.length ? d.look.shapes : ['circle', 'square']) : [] });
                }}
              />
              <span>{MOTIF_LABEL[mo]}</span>
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

/** One direction, as a presentation board. */
function Spread({ d, n, total, p, onPreview }: { d: ArtDirection; n: number; total: number; p: Props; onPreview: (spec: DesignSpec, title: string) => void }) {
  const lang = languageOf(d.language);
  const spec = useMemo(() => specimenSpec(d, p.brief, p.name, p.refs), [d, p.brief, p.name, p.refs]);
  const seal = (html: string) => buildSandboxDoc(html, { parse: (h) => new DOMParser().parseFromString(h, 'text/html'), runScripts: false, nonce: p.nonce, inspector: '' }).doc;
  const html = useMemo(() => (spec ? seal(renderDesign(spec, p.refs).html) : ''), [spec, p.refs]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = d.tokens.colors;
  const L = d.look;
  const m = L.motion ?? STILL_MOTION;
  const arrange = ARRANGE[d.language] ?? 'type';
  const set = (group: LockGroup, tokens: Partial<ArtDirection['tokens']>, look: Partial<Look> = {}) => p.onEdit(d.id, { ...d, tokens: { ...d.tokens, ...tokens }, look: { ...d.look, ...look }, source: 'person' }, group);
  // the type scale, as the page will set it (a 17 px body)
  const steps = [3, 2, 1, 0].map((k) => Math.round(17 * Math.pow(L.ratio, k)));
  const inspiring = p.refs.filter((r) => r.state === 'kept' && !r.avoid && r.url).slice(0, 5);
  const otherPairing = () => {
    const ds = (lang?.display ?? []).filter((f) => f !== d.tokens.fonts.display);
    const bs = (lang?.body ?? []).filter((f) => f !== d.tokens.fonts.body);
    const display = ds[0] ?? d.tokens.fonts.display;
    set('type', { fonts: { display, body: bs[0] ?? d.tokens.fonts.body } }, { weight: nearestWeight(display, L.weight) });
  };
  const otherGrid = () => {
    const pool = [...new Set([...(lang ? (Array.isArray(lang.look.grid) ? lang.look.grid : [lang.look.grid]) : []), ...GRIDS])] as Look['grid'][];
    set('layout', {}, { grid: pool[(pool.indexOf(L.grid) + 1) % pool.length] });
  };
  const otherTreatment = () => set('imagery', { imageTreatment: TREATMENTS[(TREATMENTS.indexOf(d.tokens.imageTreatment) + 1) % TREATMENTS.length] });
  const fontsHref = useMemo(() => fontStylesheet([d.tokens.fonts.display, d.tokens.fonts.body]), [d.tokens.fonts.display, d.tokens.fonts.body]);
  useEffect(() => {
    if (!fontsHref || document.querySelector(`link[data-v0-fonts="${CSS.escape(fontsHref)}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = fontsHref;
    l.dataset.v0Fonts = fontsHref;
    document.head.appendChild(l);
  }, [fontsHref]);
  const display = { fontFamily: fontStack(d.tokens.fonts.display), fontWeight: L.weight, textTransform: L.case === 'upper' ? ('uppercase' as const) : undefined, letterSpacing: L.tracking === 'tight' ? '-0.02em' : L.tracking === 'wide' ? '0.04em' : undefined };
  const body = { fontFamily: fontStack(d.tokens.fonts.body) };
  return (
    <article className={`v0-dir ad ad-${arrange}`} id={`dir-${n}`} aria-label={`Direction ${n}: ${d.name}`}>
      <header className="ad-mast v0-dir-text">
        <span className="sb-label">
          Direction {n}
          {lang && lang.name !== d.name ? ` · ${lang.name}` : ''}
          {d.source === 'person' ? ' · changed by you' : d.source === 'model' ? ' · written by SocriaUX' : ''}
        </span>
        <h3 className="v0-cell-title ad-name" style={display}>
          {d.name}
        </h3>
        <p className="ad-thesis">{d.concept}</p>
        {d.locks.length > 0 && <p className="v0-quiet v0-dir-locks">Kept: {d.locks.map((g) => LOCK_LABEL[g].toLowerCase()).join(', ')}</p>}
        <div className="ad-acts">
          <button type="button" className={`sb-btn${n === 1 ? ' is-primary' : ''}`} onClick={() => p.onApprove(d)} disabled={!!p.busy}>
            Use this direction
          </button>
          {spec && (
            <button type="button" className="sb-link is-meta is-strong" onClick={() => onPreview(spec, `${d.name}, direction ${n}`)}>
              Preview in motion
            </button>
          )}
          <button type="button" className="sb-link is-meta" onClick={() => p.onReplace(d.id)} disabled={!!p.busy} title="Swap this one for a direction not yet shown; the others stay">
            Not this one
          </button>
        </div>
      </header>

      <section className="ad-page" aria-label="The page, drawn">
        <div className="ad-studies v0-dir-preview">
          {html && <Study html={html} width={1280} ratio={16 / 11} label={`Desktop study of ${d.name}`} />}
          {html && <Study html={html} width={390} ratio={390 / 760} label={`Phone study of ${d.name}`} />}
        </div>
        <p className="ad-caption">
          <b>Fig. {n}.1</b> Drawn by SocriaUX’s renderer from this direction, at 1280 and 390 px.
        </p>
      </section>

      <section className="ad-type" aria-label="Typography">
        <div className="ad-block-head">
          <span className="ad-l">Type</span>
          <span className="ad-tools">
            <button type="button" className="sb-link is-meta" onClick={otherPairing} disabled={d.locks.includes('type')}>
              Another pairing
            </button>
            <Lock d={d} group="type" onLock={p.onLock} />
          </span>
        </div>
        <p className="ad-aa" style={display}>
          Aa
        </p>
        <ul className="ad-scale">
          {steps.map((px, i) => (
            <li key={px}>
              <span className="ad-scale-n">{px}</span>
              <span style={{ ...(i < 3 ? display : body), fontSize: Math.min(px, 64) * 0.62 + 'px' }}>{i === 0 ? p.name : i === 1 ? 'A heading in the voice' : i === 2 ? 'A subheading, quieter' : 'Body text at reading size, steady over a long paragraph.'}</span>
            </li>
          ))}
        </ul>
        <p className="ad-meta">
          {d.tokens.fonts.display} {L.weight} with {d.tokens.fonts.body} · scale {L.ratio} · {L.case === 'upper' ? 'capitals' : 'sentence case'}
        </p>
      </section>

      <section className="ad-colour" aria-label="Colour">
        <div className="ad-block-head">
          <span className="ad-l">Colour</span>
          <span className="ad-tools">
            <label className="ad-pick" title="Change the accent">
              <input type="color" value={c.accent} onChange={(e) => set('palette', { colors: { ...c, accent: e.target.value } })} aria-label={`Accent of ${d.name}`} />
              Accent
            </label>
            <label className="ad-pick" title="Change the ground">
              <input type="color" value={c.background} onChange={(e) => set('palette', { colors: { ...c, background: e.target.value } })} aria-label={`Ground of ${d.name}`} />
              Ground
            </label>
            <Lock d={d} group="palette" onLock={p.onLock} />
          </span>
        </div>
        <div className="ad-swatches">
          {(
            [
              ['Ground', c.background],
              ['Text', c.text],
              ['Accent', c.accent],
              ...(L.accent2 ? [['Second ink', L.accent2]] : []),
              ['Lines', c.line],
            ] as [string, string][]
          ).map(([label, hex]) => (
            <span key={label} className="ad-sw" style={{ background: hex, color: contrastRatio('#ffffff', hex) > contrastRatio('#111111', hex) ? '#fff' : '#111' }}>
              <b>{label}</b>
              <span>{hex}</span>
            </span>
          ))}
        </div>
        <div className="ad-applied" style={{ background: c.background, color: c.text, borderColor: c.line }}>
          <p style={display}>{p.brief.personality[0] ? `${p.brief.personality[0].charAt(0).toUpperCase()}${p.brief.personality[0].slice(1)}, in use` : 'In use'}</p>
          <span className="ad-applied-btn" style={{ background: c.accent, color: c.accentText, borderRadius: d.tokens.radius === 'round' ? 999 : d.tokens.radius === 'soft' ? 8 : 0 }}>
            Begin
          </span>
          <span className="ad-applied-link" style={{ color: c.text, borderColor: c.accent }}>
            Read more
          </span>
          <span className="ad-applied-muted" style={{ color: c.muted }}>
            Text {contrastRatio(c.text, c.background).toFixed(1)}:1 · button {contrastRatio(c.accentText, c.accent).toFixed(1)}:1
          </span>
        </div>
      </section>

      <section className="ad-atmos" aria-label="Atmosphere and imagery">
        <div className="ad-block-head">
          <span className="ad-l">Atmosphere</span>
          <span className="ad-tools">
            <button type="button" className="sb-link is-meta" onClick={otherTreatment} disabled={d.locks.includes('imagery')}>
              Another treatment
            </button>
            <Lock d={d} group="imagery" onLock={p.onLock} />
          </span>
        </div>
        {inspiring.length ? (
          <div className={`ad-collage n-${Math.min(inspiring.length, 5)}`}>
            {inspiring.map((r) =>
              r.media === 'video' ? (
                <video key={r.id} src={r.url} muted loop playsInline preload="metadata" style={{ filter: TREAT_FILTER[d.tokens.imageTreatment] }} aria-label={r.title || 'A moving reference'} />
              ) : (
                <img key={r.id} src={r.thumb || r.url} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ filter: TREAT_FILTER[d.tokens.imageTreatment] }} />
              )
            )}
          </div>
        ) : (
          <div className="ad-collage is-empty" style={{ background: c.background }}>
            <span className="ad-shape s1" style={{ background: c.accent }} />
            <span className="ad-shape s2" style={{ background: L.accent2 || c.text }} />
            <span className="ad-shape s3" style={{ background: c.line }} />
          </div>
        )}
        <p className="ad-copy">{d.imagery}</p>
        <p className="ad-caption">
          {inspiring.length ? (
            <>
              <b>Fig. {n}.2</b> Your references, treated as this direction treats pictures ({TREAT_LABEL[d.tokens.imageTreatment].toLowerCase()}): {takenFrom(inspiring[0]).take.join(', ') || 'atmosphere'} taken, never pasted in.
            </>
          ) : (
            <>
              <b>Fig. {n}.2</b> No references kept: the direction’s inks and shapes stand in.
            </>
          )}
        </p>
      </section>

      <section className="ad-move" aria-label="Motion">
        <div className="ad-block-head">
          <span className="ad-l">Motion · {MOTION_LABEL[m.feel]}</span>
          <span className="ad-tools">
            <button type="button" className="sb-link is-meta" onClick={() => set('motion', {}, { motion: stepMotion(m, -1) })} disabled={m.feel === 'still' || d.locks.includes('motion')}>
              Calmer
            </button>
            <button type="button" className="sb-link is-meta" onClick={() => set('motion', {}, { motion: stepMotion(m, 1) })} disabled={m.feel === 'kinetic' || d.locks.includes('motion')}>
              Livelier
            </button>
            <Lock d={d} group="motion" onLock={p.onLock} />
          </span>
        </div>
        <MotionStudy d={d} name={p.name} />
        <p className="ad-copy">{describeMotion(m)}</p>
      </section>

      <section className="ad-comp" aria-label="Composition and voice">
        <div className="ad-block-head">
          <span className="ad-l">Composition</span>
          <span className="ad-tools">
            <button type="button" className="sb-link is-meta" onClick={otherGrid} disabled={d.locks.includes('layout')}>
              Another composition
            </button>
            <Lock d={d} group="layout" onLock={p.onLock} />
          </span>
        </div>
        <p className="ad-copy">{d.composition}</p>
        <p className="ad-meta">
          {GRID_LABEL[L.grid]} · {L.width} width · {CONTAINER_LABEL[L.containers].toLowerCase()} · {BUTTON_LABEL[L.buttons].toLowerCase()} buttons
        </p>
        <div className="ad-motifs" aria-label="Motifs">
          {L.motifs.map((mo) => (
            <span key={mo} className="ad-motif">
              {MOTIF_LABEL[mo]}
              <button type="button" onClick={() => set('motifs', {}, { motifs: L.motifs.filter((x) => x !== mo), shapes: mo === 'shapes' ? [] : L.shapes })} aria-label={`Leave out ${MOTIF_LABEL[mo].toLowerCase()}`} disabled={d.locks.includes('motifs')}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="ad-voice">
          <span className="ad-l">Voice</span>
          <p style={body}>{d.voice}</p>
        </div>
        {d.avoid.length > 0 && (
          <ul className="ad-refuses" aria-label="It refuses">
            {d.avoid.map((a) => (
              <li key={a}>
                <span className="st-glyph g-objection is-sm" aria-hidden="true" /> {a}
              </li>
            ))}
          </ul>
        )}
        <details className="v0-dir-more ad-why">
          <summary className="sb-link is-meta">Why it fits</summary>
          <ul className="v0-plain">
            {d.rationale.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </details>
      </section>

      <details className="v0-dir-more ad-edit">
        <summary className="sb-link is-meta">Change any part of it</summary>
        <p className="v0-quiet">What you change is kept: asking again, regenerating and refining leave it as you set it.</p>
        <Edit d={d} onEdit={p.onEdit} onLock={p.onLock} />
      </details>
      <p className="ad-folio" aria-hidden="true">
        {String(n).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </p>
    </article>
  );
}

export function DirectionBoard(p: Props) {
  const { state } = p;
  const [preview, setPreview] = useState<{ spec: DesignSpec; title: string } | null>(null);
  return (
    <div className="v0-brief v0-direct ad-board">
      <header className="v0-brief-head ad-head">
        <span className="sb-label">Art direction · before anything is drawn{state.round ? ` · round ${state.round + 1}` : ''}</span>
        <h2 className="v0-brief-title ad-title">Three ways this could look.</h2>
        <p className="v0-body v0-direct-lede">
          SocriaUX’s reading of your brief and moodboard, as three art directions, each drawn by the renderer your design will use. Decide anything on a board, take one into production, or let SocriaUX choose.
        </p>
      </header>

      <div className="v0-direct-own ad-own">
        <label className="v0-brief-field">
          <span className="sb-label">Your direction, if you have one</span>
          <textarea className="v0-field" rows={2} value={state.notes} placeholder="“Like a printed museum guide”, “darker, more like a bar”, “kinetic type”, “no serifs”, a colour like #c4421a…" onChange={(e) => p.onNotes(e.target.value, state.avoid)} />
        </label>
        <label className="v0-brief-field">
          <span className="sb-label">What it must not look like</span>
          <input className="v0-field" value={state.avoid} placeholder="“gradients”, “rounded cards”, “anything dark”, “animation”" onChange={(e) => p.onNotes(state.notes, e.target.value)} />
        </label>
        <div className="v0-direct-ask">
          <button type="button" className="sb-btn" onClick={p.onAsk} disabled={!!p.busy}>
            {state.notes || state.avoid ? 'Show three for this' : 'Show three others'}
          </button>
          {p.note && (
            <span className="v0-quiet" role="status">
              {p.note}
            </span>
          )}
        </div>
      </div>

      {state.options.length > 1 && (
        <nav className="ad-index" aria-label="The directions">
          {state.options.map((d, i) => (
            <a key={d.id} href={`#dir-${i + 1}`} className="ad-index-item">
              <span className="ad-index-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="ad-index-sw" aria-hidden="true">
                {[d.tokens.colors.background, d.tokens.colors.text, d.tokens.colors.accent].map((h, j) => (
                  <span key={j} style={{ background: h }} />
                ))}
              </span>
              <span className="ad-index-name">{d.name}</span>
              <span className="ad-index-lang">
                {languageOf(d.language)?.name ?? d.language} · {MOTION_LABEL[(d.look.motion ?? STILL_MOTION).feel].toLowerCase()}
              </span>
            </a>
          ))}
        </nav>
      )}

      <div className="v0-direct-grid ad-spreads">
        {state.options.map((d, i) => (
          <Spread key={d.id} d={d} n={i + 1} total={state.options.length} p={p} onPreview={(spec, title) => setPreview({ spec, title })} />
        ))}
      </div>

      <footer className="v0-brief-foot ad-foot">
        <button type="button" className="sb-btn is-primary" onClick={p.onAuto} disabled={!!p.busy || !state.options.length}>
          {p.busy ?? 'Let SocriaUX choose'}
        </button>
        <button type="button" className="sb-link" onClick={p.onBack}>
          Back to the brief
        </button>
        <span className="v0-quiet">SocriaUX’s choice is the first: the most faithful reading of your brief, with its palette and type as you approved them.</span>
      </footer>
      {preview && <Preview spec={preview.spec} refs={p.refs} nonce={p.nonce} title={preview.title} onClose={() => setPreview(null)} />}
    </div>
  );
}
