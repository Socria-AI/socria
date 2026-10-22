'use client';

// components/model/Understand.tsx
//
// THE LAYER THAT LETS SOMEBODY WALK AROUND INSIDE A MODEL — in two places now.
//
// WHAT THIS IS NOT: more charts. It adds no renderer and knows no domain. It is
// the surface of two pure modules — lib/model/views.ts, which derives what
// representations this model can honestly offer, and lib/model/inspect.ts, which
// reads what the model already knows about itself — and its entire job is to put
// that within reach.
//
// WHERE IT SITS. It used to be a strip under the picture: a sentence, a row of
// views and a toggle, three rows of small type under a figure that a floating
// composer then covered. It is two things in the frame's own places now
// (components/surfaces/Surface3D.tsx):
//
//   ViewSwitch   in the header: the ways of looking at the main subject as one
//                segmented control, and everything else — the model's own
//                accounts, other subjects, and what is not available and why —
//                one menu away.
//   ModelAside   in the side panel, under the controls: what is selected and
//                why it is what it is, the values the model computes now, and
//                the account of the whole model, opened when asked for.
//
// NOTHING HERE COMPOSES A FACT. Every line is read from the inspection, with its
// provenance attached — so a caption cannot drift from the model, and a language
// model reading this aloud is reading rather than guessing.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Model } from '@/lib/model/schema';
import { inspectModel, inspectObject, transparencyLine, whatChanged, whyOf } from '@/lib/model/inspect';
import { groupViews, unavailable, viewsFor, type ViewSpec } from '@/lib/model/views';
import './understand.css';

const ORIGIN_MARK: Record<string, string> = {
  user: 'you set it',
  inference: 'proposed, unconfirmed',
  equation: 'follows from an equation here',
  computation: 'a computation produced it',
  simulation: 'stepped forward',
  dataset: 'from the supplied data',
  source: 'from a named source',
};

/** "m^3" as it is written: m³. Only the exponents a unit actually carries. */
export function unitText(u: string | undefined | null): string {
  if (!u) return '';
  const sup: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return u.replace(/\^(-?\d+)/g, (_, n: string) => [...n].map((c) => sup[c] ?? c).join('')).replace(/\*/g, '·');
}

/** A value a person reads: four significant figures, a real minus, no float noise. */
export function valueText(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = a !== 0 && (a < 1e-3 || a >= 1e7) ? v.toExponential(2) : String(Number(v.toPrecision(4)));
  return s.replace(/^-/, '−');
}

/**
 * THE ENGINE'S WORDS, AS A READER IS SHOWN THEM. Its accounts name the source
 * file a method lives in — "(lib/model/solid.ts)" — for whoever maintains it,
 * and an operation by its name in capitals (EVALUATE, SIMULATE) for the
 * conversation; neither is for the person looking at their model.
 */
const OPERATION_WORD = /^(EVALUATE|DERIVE|SIMULATE|ESTIMATE|READ|OPTIMISE|SOLVE|REARRANGE|RANGE)\b/;
export function plainLabel(s: string): string {
  return s.replace(OPERATION_WORD, (w) => w[0] + w.slice(1).toLowerCase());
}
export function plainText(s: string): string {
  return (
    s
      .replace(/\s*\((?:lib|components|app)\/[^)]*\)/g, '')
      // a fidelity's tag, as lib/model/inspect.ts `sentence` sets it for the grade: "CONCEPTUAL — …" → "Conceptual — …"
      .replace(/^([A-Z][A-Z -]*[A-Z])(?= — )/, (w) => w[0] + w.slice(1).toLowerCase())
  );
}

/** The view open now: the model's own choice, or the one the engine would make. */
export function currentView(model: Model, views: ViewSpec[]): string | null {
  return model.view && views.some((v) => v.id === model.view) ? model.view : (views.find((v) => v.primary)?.id ?? views[0]?.id ?? null);
}

// ── THE WAYS OF LOOKING, IN THE HEADER ────────────────────────────────

/**
 * The main subject's views as one segmented control, and the rest one menu
 * away. The subject is the one the open view belongs to — or the first one,
 * when what is open is one of the model's own accounts — so the control in
 * front of somebody is always about the thing in front of them.
 */
export function ViewSwitch({ model, onView }: { model: Model; onView?: (id: string) => void }) {
  const views = useMemo(() => viewsFor(model), [model]);
  const groups = useMemo(() => groupViews(views), [views]);
  const missing = useMemo(() => unavailable(model), [model]);
  const current = currentView(model, views);
  const subjects = groups.filter((g) => g.subject);
  const lead = subjects.find((g) => g.views.some((v) => v.id === current)) ?? subjects[0] ?? null;
  // the lead's ways of looking, as the segmented control — when there are two or more to choose between
  const seg = lead && lead.views.length > 1 ? lead.views.slice(0, 4) : [];
  // and everything else, in the menu, under what it is a view of
  const menu = groups.map((g) => ({ g, list: g.views.filter((v) => !seg.includes(v)) })).filter((m) => m.list.length);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  if (!views.length) return null;
  const pick = (id: string) => {
    setOpen(false);
    onView?.(id);
  };
  const currentElsewhere = !!current && !seg.some((v) => v.id === current);

  return (
    <div className="mv-views" ref={box}>
      {seg.length > 1 && (
        <div className="mv-seg" role="group" aria-label={lead?.subject ? `Ways of looking at ${lead.subject}` : 'Views'}>
          {seg.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`mv-seg-b${current === v.id ? ' is-on' : ''}`}
              aria-pressed={current === v.id}
              data-view={v.id}
              title={`${v.shows}\n\nAvailable because ${v.because}.`}
              // ONE CALL. Opening a view of an object also selects it — so the
              // inspector and the conversation are about the thing on screen —
              // but that happens in ONE revision of the model, in the handler
              // (ModelView openView). Two calls here each computed their next
              // model from the same captured one, and the view never changed.
              onClick={() => pick(v.id)}
            >
              {v.variant || v.label}
            </button>
          ))}
        </div>
      )}
      {(menu.length > 0 || missing.length > 0) && (
        <span className="mv-more">
          <button
            type="button"
            className={`mv-more-b${currentElsewhere ? ' is-on' : ''}`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {currentElsewhere ? (views.find((v) => v.id === current)?.label ?? 'More views') : seg.length > 1 ? 'More views' : 'Views'}
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 4.5l3 3 3-3" />
            </svg>
          </button>
          {open && (
            <div className="mv-menu" role="menu" aria-label="Every way of looking at this model">
              {menu.map(({ g, list }) => {
                return (
                  <div key={g.subject || 'model'} className="mv-menu-g">
                    <p className="mv-menu-k">{g.subject || 'The model itself'}</p>
                    {list.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={current === v.id}
                        className={`mv-menu-row${current === v.id ? ' is-on' : ''}`}
                        data-view={v.id}
                        onClick={() => pick(v.id)}
                      >
                        <span className="mv-menu-l">{g.subject && g.views.length > 1 ? v.variant || v.label : v.label}</span>
                        <span className="mv-menu-w">{v.shows}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              {missing.length > 0 && (
                <div className="mv-menu-g is-missing">
                  <p className="mv-menu-k">Not available for this model</p>
                  {missing.map((u) => (
                    <p key={u.family} className="mv-menu-no">
                      <span className="mv-menu-l">{u.family}</span>
                      <span className="mv-menu-w">would need {u.wouldNeed}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </span>
      )}
    </div>
  );
}

// ── WHAT IT IS, WHAT IT COMPUTES, WHAT IS SELECTED — IN THE SIDE ──────

export function ModelAside({
  model,
  onSelect,
  onAsk,
}: {
  model: Model;
  /** selecting is canonical: it writes to the model, not to this component */
  onSelect?: (id: string | null) => void;
  /** hand the object's IDENTITY to the conversation — never a description of pixels */
  onAsk?: (id: string) => void;
}) {
  const inspection = useMemo(() => inspectModel(model), [model]);
  const change = useMemo(() => whatChanged(model), [model]);
  const selected = model.selected ?? null;
  const about = useMemo(() => (selected ? inspectObject(model, selected) : null), [model, selected]);
  const why = useMemo(() => (selected ? whyOf(model, selected) : []), [model, selected]);
  // THE VALUES THE MODEL COMPUTES NOW — read off the objects that hold one, in
  // their own units. A volume a person asked for is the first thing they look
  // for, and it was three clicks away in a table.
  const results = useMemo(
    () =>
      model.objects
        .filter((o) => typeof o.meta?.value === 'number' && Number.isFinite(o.meta.value as number))
        .map((o) => ({ id: o.id, label: o.label, value: o.meta!.value as number, units: o.units ?? '' })),
    [model.objects]
  );
  const [allResults, setAllResults] = useState(false);
  const [deep, setDeep] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ state: true });
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const holds = model.assumptions ?? [];
  const states = model.equations ?? [];
  const what = inspection.sections.find((s) => s.id === 'what');

  return (
    <>
      {/* ── WHAT IS SELECTED, AND WHY IT IS WHAT IT IS ─────────────
          The chain comes from the dependency graph; a reader can follow it
          back to the things somebody supplied. */}
      {about && (
        <section className="sfx-sec mv-picked" aria-label="Selected">
          <div className="sfx-sec-h">
            <span className="sfx-sec-k">Selected</span>
            <button type="button" className="sfx-reset" onClick={() => onSelect?.(null)}>
              Clear
            </button>
          </div>
          <p className="mv-picked-t">{about.what}</p>
          {/* what it is and how it behaves; what could be done with it, and
              what it rests on (the chain below says that), are in Everything */}
          {about.sections
            .filter((s) => s.id === 'what' || s.id === 'behaviour')
            .map((s) => (
              <dl key={s.id} className="mv-facts">
                {s.facts.slice(0, 6).map((f, i) => (
                  <div key={i} className="mv-fact">
                    <dt>{plainLabel(f.label)}</dt>
                    <dd>
                      {plainText(f.value)}
                      {f.origin ? <em className="mv-origin">{ORIGIN_MARK[f.origin] ?? f.origin}</em> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            ))}
          {why.length > 1 && (
            <div className="mv-why">
              <span className="mv-why-k">Why it is what it is</span>
              {why.map((s, i) => (
                <p key={`${s.of}-${i}`} className="mv-step" style={{ paddingLeft: `${s.depth * 0.8}rem` }}>
                  {s.depth ? <span className="mv-arrow">←</span> : null}
                  <button type="button" className="mv-step-name" onClick={() => onSelect?.(s.of)}>
                    {s.label}
                  </button>
                  <span className="mv-step-says">{s.says}</span>
                </p>
              ))}
            </div>
          )}
          {onAsk && (
            <button type="button" className="mv-ask" onClick={() => onAsk(about.of)}>
              Ask about this
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3.5 6h5M6.5 3.5L9 6l-2.5 2.5" />
              </svg>
            </button>
          )}
        </section>
      )}

      {/* ── WHAT IT COMPUTES, NOW ───────────────────────────────── */}
      {results.length > 0 && (
        <section className="sfx-sec" aria-label="Results">
          <div className="sfx-sec-h">
            <span className="sfx-sec-k">Results</span>
          </div>
          <div className="mv-results">
            {(allResults ? results : results.slice(0, 4)).map((r) => (
              <button
                key={r.id}
                type="button"
                className={`mv-result${selected === r.id ? ' is-on' : ''}`}
                onClick={() => onSelect?.(selected === r.id ? null : r.id)}
                title={`Select ${r.label} — ask about it, or see why it is what it is`}
              >
                <span className="mv-result-k">{r.label}</span>
                <span className="mv-result-v">
                  {valueText(r.value)}
                  {r.units ? <small>{unitText(r.units)}</small> : null}
                </span>
              </button>
            ))}
          </div>
          {results.length > 4 && (
            <button type="button" className="sfx-reset mv-allres" onClick={() => setAllResults((v) => !v)}>
              {allResults ? 'Fewer' : `All ${results.length}`}
            </button>
          )}
          {/* WHAT CHANGED, AND WHAT DID NOT: "the mass is unchanged" is what
              makes "the trajectory moved" mean something. */}
          {change && !/^built\b/.test(change.what) && (
            <p className="mv-changed">
              <span>Changed</span> {change.what}
              {change.from !== undefined ? ` ${change.from} → ${change.to}` : ''}
              {change.reached.length ? <> · recomputed {change.reached.map((r) => r.label).join(', ')}</> : null}
            </p>
          )}
        </section>
      )}

      {/* ── WHAT IT IS ─────────────────────────────────────────── */}
      <section className="sfx-sec mv-about" aria-label="About this model">
        <div className="sfx-sec-h">
          <span className="sfx-sec-k">About</span>
          <button type="button" className="sfx-reset" aria-expanded={deep} onClick={() => setDeep((v) => !v)}>
            {deep ? 'Less' : 'Everything'}
          </button>
        </div>
        {states.length > 0 && (
          <div className="mv-states">
            {states.slice(0, 3).map((e, i) => (
              <p key={i} className="mv-eq">
                {e}
              </p>
            ))}
          </div>
        )}
        {holds.length > 0 && (
          <ul className="mv-holds">
            {holds.slice(0, deep ? holds.length : 2).map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        )}
        {!holds.length && !states.length && what && <p className="mv-what">{what.summary}</p>}
        {deep && (
          <div className="mv-deep">
            <p className="mv-ran">{plainText(transparencyLine(model))}</p>
            {/* ── THE MODEL ITSELF, SECTION BY SECTION ───────────────
                Only sections that exist are here at all: an empty one reads
                as a category the model was measured against and failed. */}
            {inspection.sections.map((s) => (
              <div key={s.id} className={`mv-sec${open[s.id] ? ' is-open' : ''}`}>
                <button type="button" className="mv-sec-head" onClick={() => toggle(s.id)} aria-expanded={!!open[s.id]}>
                  <span className="mv-sec-label">{s.label}</span>
                  <span className="mv-sec-mark" aria-hidden>
                    {open[s.id] ? '−' : '+'}
                  </span>
                </button>
                {open[s.id] ? (
                  <div className="mv-sec-body">
                    <p className="mv-sec-sum">{s.summary}</p>
                    {s.facts.map((f, i) => (
                      <p key={`${f.label}-${i}`} className="mv-fact-line">
                        {f.of && onSelect ? (
                          <button type="button" className="mv-fact-k is-link" onClick={() => onSelect(f.of!)}>
                            {plainLabel(f.label)}
                          </button>
                        ) : (
                          <span className="mv-fact-k">{plainLabel(f.label)}</span>
                        )}
                        <span className="mv-fact-v">{plainText(f.value)}</span>
                        {f.origin ? <em className="mv-origin">{ORIGIN_MARK[f.origin] ?? f.origin}</em> : null}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
