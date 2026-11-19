'use client';
// components/ux-v0/DnaStudio.tsx — the Creative DNA step: the design language every direction is drawn from.
//
// Between the brief and the directions. SocriaUX has already read the DNA from the brief, the designer's words
// and their references (lib/ux-v0/dna.ts deriveDNA): each dimension shows where it sits, in a word, and where
// that came from. The designer can leave all of it to SocriaUX (one click on to the directions), set any
// dimension (it becomes theirs), lock what must hold through every direction, generation and change, give a
// dimension back, or add one the kind of work does not have by default. The specimen beside it is a real study
// drawn by the renderer the design will use, from the DNA as it stands — so every control visibly does something.
//
// The references panel says what each kept reference's pixels measured (lib/ux-v0/ref-dna.ts), honestly: measured,
// still measuring, or could not be read (a library that does not let its pictures be read). What the designer
// takes from a reference and what they leave behind is set here too, aspect by aspect; only where a reference sits
// on these dimensions is used — never its layout or its content.

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { proposeDirections } from '@/lib/ux-v0/direction';
import { DNA_EXTRA, DNA_META, dnaKeysFor, dnaValues, dnaWord, type CreativeDNA, type DnaKey, type DnaSource } from '@/lib/ux-v0/dna';
import { renderDesign } from '@/lib/ux-v0/render';
import { buildSandboxDoc } from '@/lib/ux-v0/sandbox';
import { studySpec } from '@/lib/ux-v0/study';
import { REF_ASPECTS, type DesignBrief, type MoodboardRef, type RefAspect } from '@/lib/ux-v0/types';
import { DnaGlyph, dnaWords } from './DnaParts';

export type Measuring = Record<string, { state: 'measuring' } | { state: 'failed'; reason: string }>;

interface Props {
  dna: CreativeDNA;
  kind: string;
  hasImages: boolean;
  brief: DesignBrief;
  name: string;
  salt: string;
  /** the moodboard's references, with this browser's addresses for uploads */
  refs: MoodboardRef[];
  /** the same, as a sandboxed frame can show them (the study) */
  frameRefs: MoodboardRef[];
  measuring: Measuring;
  nonce: string;
  busy: string | null;
  onSet: (key: DnaKey, value: number) => void;
  onLock: (key: DnaKey, on: boolean) => void;
  onRelease: (key: DnaKey) => void;
  onDelegateAll: () => void;
  onAdd: (key: DnaKey) => void;
  onRemove: (key: DnaKey) => void;
  onAspects: (refId: string, take: RefAspect[], leave: RefAspect[]) => void;
  onMeasure: (ref: MoodboardRef) => void;
  onExplore: () => void;
  onBack: () => void;
}

const SOURCE_SAYS: Record<DnaSource, string> = { designer: 'Set by you', brief: 'From your brief', references: 'From your references', kind: 'Typical of this kind of work' };
const ASPECT_SAYS: Record<RefAspect, string> = { atmosphere: 'Atmosphere', colour: 'Colour', typography: 'Type', composition: 'Composition', imagery: 'Imagery', texture: 'Texture', motion: 'Motion' };

/** A study drawn from the DNA as it stands, scaled to its box (the same renderer the design will use). */
function Specimen({ html, label }: { html: string; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const W = 1200;
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setScale(Math.max(0.1, e.contentRect.width / W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="dna-specimen" ref={box}>
      {html ? <iframe title={label} sandbox="" srcDoc={html} tabIndex={-1} aria-hidden="true" style={{ width: W, height: Math.ceil(W * 1.15), transform: `scale(${scale})` }} /> : <p className="v0-quiet">The study appears once there is a brief.</p>}
    </div>
  );
}

function Dimension({ k, dna, p, own }: { k: DnaKey; dna: CreativeDNA; p: Props; own: boolean }) {
  const d = dna.dims[k]!;
  const meta = DNA_META[k];
  const [v, setV] = useState(d.value);
  // follows the DNA when it changes from elsewhere (derived again, released, delegated)
  useEffect(() => setV(d.value), [d.value]);
  const id = `dna-${k}`;
  const added = (DNA_EXTRA as readonly string[]).includes(k) && !own;
  return (
    <div className={`dna-dim${d.locked ? ' is-locked' : ''}${d.source === 'designer' ? ' is-own' : ''}`}>
      <div className="dna-dim-head">
        <label htmlFor={id} className="dna-dim-label">
          {meta.label}
        </label>
        <span className="dna-dim-word" aria-live="polite">
          {dnaWord(k, v)}
        </span>
        <button type="button" className={`dna-lock${d.locked ? ' is-on' : ''}`} aria-pressed={d.locked} onClick={() => p.onLock(k, !d.locked)} title={d.locked ? 'Locked: holds through every direction, generation and change' : 'Lock it: hold it through every direction, generation and change'}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
            <path d={d.locked ? 'M5.5 7V5a2.5 2.5 0 0 1 5 0v2' : 'M5.5 7V5a2.5 2.5 0 0 1 5 0'} fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <span className="v0-sr">{d.locked ? `Unlock ${meta.label}` : `Lock ${meta.label}`}</span>
        </button>
      </div>
      <div className="dna-range">
        <span className="dna-end" aria-hidden="true">
          {meta.low}
        </span>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={v}
          aria-valuetext={`${dnaWord(k, v)} (${v} of 100, from ${meta.low.toLowerCase()} to ${meta.high.toLowerCase()})`}
          style={{ ['--v' as string]: `${v}%` }}
          onChange={(e) => {
            const n = Number(e.target.value);
            setV(n);
            p.onSet(k, n);
          }}
        />
        <span className="dna-end" aria-hidden="true">
          {meta.high}
        </span>
      </div>
      <div className="dna-dim-foot">
        <span className={`dna-src s-${d.source}`}>
          <span className="dna-src-dot" aria-hidden="true" />
          {SOURCE_SAYS[d.source]}
          {d.because.length > 0 && d.source !== 'designer' && <span className="dna-why"> — {d.because.slice(0, 2).join('; ')}</span>}
        </span>
        <span className="dna-dim-acts">
          {d.source === 'designer' && !d.locked && (
            <button type="button" className="sb-link is-meta" onClick={() => p.onRelease(k)}>
              SocriaUX decides
            </button>
          )}
          {added && (
            <button type="button" className="sb-link is-meta" onClick={() => p.onRemove(k)}>
              Remove
            </button>
          )}
        </span>
      </div>
      <p className="dna-draws">{meta.draws.charAt(0).toUpperCase() + meta.draws.slice(1)}.</p>
    </div>
  );
}

function RefRow({ r, p }: { r: MoodboardRef; p: Props }) {
  const m = p.measuring[r.id];
  const take = r.take ?? [];
  const leave = r.leave ?? [];
  // each aspect: neither → take → leave → neither
  const cycle = (a: RefAspect) => {
    if (take.includes(a)) p.onAspects(r.id, take.filter((x) => x !== a), [...leave, a]);
    else if (leave.includes(a)) p.onAspects(r.id, take, leave.filter((x) => x !== a));
    else p.onAspects(r.id, [...take, a], leave.filter((x) => x !== a));
  };
  const src = r.thumb || r.url;
  return (
    <li className={`dna-ref${r.avoid ? ' is-avoid' : ''}`}>
      <span className="dna-ref-pic">{src ? <img src={src} alt="" loading="lazy" /> : <span className="dna-ref-none" />}</span>
      <div className="dna-ref-body">
        <span className="dna-ref-title">
          {r.title || 'Your reference'}
          {r.key ? ' · key' : ''}
          {r.avoid ? ' · steer away' : ''}
        </span>
        {r.dna ? (
          <>
            <span className="dna-ref-said">
              {r.dna.via.includes('motion') ? 'Measured from its frames: ' : 'Measured from its pixels: '}
              {r.dna.said.slice(0, 3).join(', ') || 'nothing that stands out'}
            </span>
            <DnaGlyph dna={r.dna.votes} keys={(['restraint', 'composition', 'density', 'colour', 'imagery', 'motion'] as DnaKey[]).filter((k) => typeof r.dna!.votes[k] === 'number')} label={`What “${r.title || 'this reference'}” measured`} />
          </>
        ) : m?.state === 'measuring' ? (
          <span className="dna-ref-said">Measuring its pixels…</span>
        ) : m?.state === 'failed' ? (
          <span className="dna-ref-said is-failed">
            {m.reason}{' '}
            <button type="button" className="sb-link is-meta" onClick={() => p.onMeasure(r)}>
              Try again
            </button>
          </span>
        ) : (
          <span className="dna-ref-said">
            Not measured yet.{' '}
            <button type="button" className="sb-link is-meta" onClick={() => p.onMeasure(r)}>
              Measure
            </button>
          </span>
        )}
        <span className="dna-aspects" role="group" aria-label={`What to take from “${r.title || 'this reference'}” and what to leave`}>
          {REF_ASPECTS.map((a) => {
            const st = take.includes(a) ? 'take' : leave.includes(a) ? 'leave' : '';
            return (
              <button key={a} type="button" className={`dna-aspect${st ? ` is-${st}` : ''}`} onClick={() => cycle(a)} aria-label={`${ASPECT_SAYS[a]}: ${st === 'take' ? 'take' : st === 'leave' ? 'leave behind' : 'neither'}`}>
                {st === 'take' ? '+ ' : st === 'leave' ? '− ' : ''}
                {ASPECT_SAYS[a]}
              </button>
            );
          })}
        </span>
      </div>
    </li>
  );
}

export function DnaStudio(p: Props) {
  const { dna } = p;
  const keys = useMemo(() => {
    const base = dnaKeysFor(p.kind, p.hasImages);
    const present = Object.keys(dna.dims) as DnaKey[];
    return [...new Set([...base, ...present])].filter((k) => dna.dims[k]);
  }, [dna, p.kind, p.hasImages]);
  const own = useMemo(() => new Set(dnaKeysFor(p.kind, p.hasImages)), [p.kind, p.hasImages]);
  const addable = (DNA_EXTRA as readonly DnaKey[]).filter((k) => !dna.dims[k]);
  // the study follows the DNA a moment behind the slider, so dragging stays smooth
  const later = useDeferredValue(dna);
  const html = useMemo(() => {
    try {
      const [d] = proposeDirections({ brief: p.brief, count: 1, dna: later, salt: p.salt });
      const spec = d ? studySpec(d, p.brief, p.name, p.frameRefs) : null;
      if (!spec) return '';
      return buildSandboxDoc(renderDesign(spec, p.frameRefs).html, { parse: (h) => new DOMParser().parseFromString(h, 'text/html'), runScripts: false, nonce: p.nonce, inspector: '' }).doc;
    } catch {
      return '';
    }
  }, [later, p.brief, p.name, p.frameRefs, p.salt, p.nonce]);
  const kept = p.refs.filter((r) => r.state === 'kept' || r.avoid);
  const vals = dnaValues(dna);
  const locked = keys.filter((k) => dna.dims[k]?.locked);
  const set = keys.filter((k) => dna.dims[k]?.source === 'designer');
  return (
    <div className="v0-brief dna-studio">
      <header className="v0-brief-head dna-head">
        <span className="sb-label">Creative DNA · optional</span>
        <h2 className="v0-brief-title dna-title">The design language, before the directions.</h2>
        <p className="v0-body dna-lede">
          SocriaUX read this from your brief{kept.length ? ' and references' : ''}. Every direction, the design and each change are drawn from it. Leave it to SocriaUX, set any dimension, or lock what must hold.
        </p>
        <p className="dna-summary" aria-live="polite">
          <DnaGlyph dna={vals} keys={keys} size="md" label="Your Creative DNA" />
          <span className="dna-summary-words">{dnaWords(vals, keys)}</span>
          <span className="v0-quiet">
            {locked.length ? `${locked.length} locked` : 'Nothing locked'}
            {set.length ? ` · ${set.length} set by you` : ''}
          </span>
        </p>
      </header>

      <div className="dna-layout">
        <section className="dna-dims" aria-label="The dimensions">
          {keys.map((k) => (
            <Dimension key={k} k={k} dna={dna} p={p} own={own.has(k)} />
          ))}
          {addable.length > 0 && (
            <div className="dna-add">
              <span className="sb-label">Add a dimension</span>
              {addable.map((k) => (
                <button key={k} type="button" className="sb-link is-meta dna-add-item" onClick={() => p.onAdd(k)} title={DNA_META[k].draws}>
                  + {DNA_META[k].label}
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="dna-side">
          <figure className="dna-figure">
            <Specimen html={html} label="A study drawn from this Creative DNA" />
            <figcaption className="v0-quiet">A study drawn from this DNA by the renderer your design will use. It changes as you do.</figcaption>
          </figure>
          {kept.length > 0 && (
            <section className="dna-refs" aria-label="What your references say">
              <span className="sb-label">What your references say</span>
              <p className="v0-quiet dna-refs-note">Measured from each picture’s pixels in this browser, not by a model. Mark what to take (+) and what to leave behind (−). Only where a reference sits on these dimensions is used — never its layout or its content.</p>
              <ul className="dna-ref-list">
                {kept.slice(0, 12).map((r) => (
                  <RefRow key={r.id} r={r} p={p} />
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <footer className="v0-brief-foot dna-foot">
        <button type="button" className="sb-btn is-primary" onClick={p.onExplore} disabled={!!p.busy}>
          Explore directions
        </button>
        <button type="button" className="sb-link" onClick={p.onDelegateAll} disabled={!set.length}>
          SocriaUX decides everything{locked.length ? ' (locks kept)' : ''}
        </button>
        <button type="button" className="sb-link" onClick={p.onBack}>
          Back to the brief
        </button>
      </footer>
    </div>
  );
}
