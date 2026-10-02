'use client';

// components/model/Understand.tsx
//
// THE LAYER THAT LETS SOMEBODY WALK AROUND INSIDE A MODEL.
//
// WHAT THIS IS NOT: more charts. It adds no renderer and knows no domain. It is
// the surface of two pure modules — lib/model/views.ts, which derives what
// representations this model can honestly offer, and lib/model/inspect.ts, which
// reads what the model already knows about itself — and its entire job is to put
// that within reach.
//
// WHY IT IS A SEPARATE COMPONENT. The picture is one view of the model; so is
// this. Putting it inside the renderer would make the renderer the owner of
// something it is only a projection of, which is the mistake the whole
// architecture is arranged against.
//
// PROGRESSIVE DISCLOSURE. Everything is collapsed except what is happening now,
// because a model carries far more than anybody wants at once and a wall of
// metadata is a debugger rather than an instrument. Each section states its
// count and its one-line summary closed; opening it is a choice.
//
// NOTHING HERE COMPOSES A FACT. Every line is read from the inspection, with its
// provenance attached — so a caption cannot drift from the model, and a language
// model reading this aloud is reading rather than guessing.

import { useMemo, useState } from 'react';
import type { Model } from '@/lib/model/schema';
import { inspectModel, inspectObject, transparencyLine, whatChanged, whyOf } from '@/lib/model/inspect';
import { unavailable, viewsFor } from '@/lib/model/views';
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

export function Understand({
  model,
  onSelect,
  onView,
  onAsk,
}: {
  model: Model;
  /** selecting is canonical: it writes to the model, not to this component */
  onSelect?: (id: string | null) => void;
  /**
   * OPENING A VIEW, and this is what the row of views was missing.
   *
   * It writes `Model.view` — canonical, like the selection — so choosing "level
   * sets" changes what is drawn rather than only changing what is highlighted.
   * Before this the buttons selected the view's object and left the figure
   * exactly as it was, which is a menu of one dish however long the menu.
   */
  onView?: (id: string) => void;
  /** hand the object's IDENTITY to the conversation — never a description of pixels */
  onAsk?: (id: string) => void;
}) {
  const inspection = useMemo(() => inspectModel(model), [model]);
  const views = useMemo(() => viewsFor(model), [model]);
  const missing = useMemo(() => unavailable(model), [model]);
  const change = useMemo(() => whatChanged(model), [model]);
  const selected = model.selected ?? null;
  // WHICH VIEW IS OPEN, read from the model and not from this component — and
  // defaulted to the one the engine would choose, so the row always shows a
  // current view rather than showing none until somebody clicks.
  const current = model.view && views.some((v) => v.id === model.view) ? model.view : (views.find((v) => v.primary)?.id ?? views[0]?.id ?? null);
  const about = useMemo(() => (selected ? inspectObject(model, selected) : null), [model, selected]);
  const why = useMemo(() => (selected ? whyOf(model, selected) : []), [model, selected]);

  // CLOSED BY DEFAULT, AND THE WHOLE PANEL — not just its sections.
  //
  // The figure is what somebody came to look at. A permanently open panel eats
  // the picture in a narrow pane, which is how a panel meant to make a model
  // legible ends up hiding it. So the resting state is one line and a row of
  // views; everything else is a choice.
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ state: true });
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <section className={`und${shown ? ' is-shown' : ''}`} aria-label="Understand this model">
      <div className="und-bar">
        <p className="und-what">
          {inspection.what}
          {inspection.grade ? <span className="und-grade">{inspection.grade}</span> : null}
        </p>
        <button
          type="button"
          className="und-act und-toggle"
          aria-expanded={shown}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? 'Less' : 'Understand'}
        </button>
      </div>
      {!shown ? null : <p className="und-ran">{transparencyLine(model)}</p>}

      {/* ── WHAT ELSE YOU CAN LOOK AT ──────────────────────────────
          Derived from the model's structure and what actually computed, so this
          row is different for a surface, a field, an integrated system and a
          fitted specification without any of them being known here. */}
      <div className="und-views">
        <span className="und-views-label">Views</span>
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`und-view${current === v.id ? ' is-current' : ''}${v.primary ? ' is-primary' : ''}`}
            aria-pressed={current === v.id}
            data-view={v.id}
            title={`${v.shows}\n\nAvailable because ${v.because}.`}
            // ONE CALL. Opening a view of an object also selects it — so the
            // inspector and the conversation are about the thing on screen —
            // but that happens in ONE revision of the model, in the handler.
            // Calling onView and then onSelect from here looked equivalent and
            // was not: each computed its next model from the same captured one,
            // so the second silently discarded the first and the view never
            // changed. See ModelView openView.
            onClick={() => onView?.(v.id)}
          >
            {v.label}
          </button>
        ))}
        {missing.length ? (
          <span
            className="und-missing"
            title={missing.map((u) => `${u.family} — would need ${u.wouldNeed}`).join('\n\n')}
          >
            {missing.length} not available
          </span>
        ) : null}
      </div>

      {!shown ? null : (
      <>
      {/* ── WHAT IS SELECTED, AND WHY IT IS WHAT IT IS ─────────────
          The chain comes from the dependency graph. A reader can follow it back
          to the things somebody supplied. */}
      {about ? (
        <div className="und-selected">
          <div className="und-selected-head">
            <span className="und-selected-what">{about.what}</span>
            <span className="und-selected-acts">
              {onAsk ? (
                <button type="button" className="und-act" onClick={() => onAsk(about.of)}>
                  Ask about this
                </button>
              ) : null}
              <button type="button" className="und-act" onClick={() => onSelect?.(null)}>
                Clear
              </button>
            </span>
          </div>
          {about.sections.map((s) => (
            <div key={s.id} className="und-selected-sec">
              <span className="und-sec-label">{s.label}</span>
              {s.facts.slice(0, 6).map((f, i) => (
                <p key={i} className="und-fact">
                  <span className="und-fact-label">{f.label}</span>
                  <span className="und-fact-value">{f.value}</span>
                  {f.origin ? <span className="und-origin">{ORIGIN_MARK[f.origin] ?? f.origin}</span> : null}
                </p>
              ))}
            </div>
          ))}
          {why.length > 1 ? (
            <div className="und-why">
              <span className="und-sec-label">Why it is what it is</span>
              {why.map((s, i) => (
                <p key={`${s.of}-${i}`} className="und-step" style={{ paddingLeft: `${s.depth * 0.9}rem` }}>
                  {s.depth ? <span className="und-arrow">←</span> : null}
                  <button type="button" className="und-step-name" onClick={() => onSelect?.(s.of)}>
                    {s.label}
                  </button>
                  <span className="und-step-says">{s.says}</span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── WHAT CHANGED, AND WHAT DID NOT ─────────────────────────
          The second half is the one usually missing and usually the more
          informative: "the mass is unchanged" is what makes "the trajectory
          moved" mean something. */}
      {change ? (
        <p className="und-changed">
          <span className="und-fact-label">Changed</span>
          {change.what}
          {change.from !== undefined ? ` ${change.from} → ${change.to}` : ''}
          {change.reached.length ? (
            <>
              {' · '}
              <span className="und-fact-label">recomputed</span>
              {change.reached.map((r) => r.label).join(', ')}
            </>
          ) : null}
          {change.untouched.length ? (
            <>
              {' · '}
              <span className="und-fact-label">unchanged</span>
              {change.untouched.slice(0, 4).map((r) => r.label).join(', ')}
            </>
          ) : null}
        </p>
      ) : null}

      {/* ── THE MODEL ITSELF, SECTION BY SECTION ───────────────────
          Only sections that exist are here at all: an empty one reads as a
          category the model was measured against and failed. */}
      {inspection.sections.map((s) => (
        <div key={s.id} className={`und-sec${open[s.id] ? ' is-open' : ''}`}>
          <button type="button" className="und-sec-head" onClick={() => toggle(s.id)} aria-expanded={!!open[s.id]}>
            <span className="und-sec-label">{s.label}</span>
            <span className="und-sec-sum">{s.summary}</span>
            <span className="und-sec-mark" aria-hidden>{open[s.id] ? '−' : '+'}</span>
          </button>
          {open[s.id] ? (
            <div className="und-sec-body">
              {s.facts.map((f, i) => (
                <p key={`${f.label}-${i}`} className="und-fact">
                  {f.of && onSelect ? (
                    <button type="button" className="und-fact-label is-link" onClick={() => onSelect(f.of!)}>
                      {f.label}
                    </button>
                  ) : (
                    <span className="und-fact-label">{f.label}</span>
                  )}
                  <span className="und-fact-value">{f.value}</span>
                  {f.origin ? <span className="und-origin">{ORIGIN_MARK[f.origin] ?? f.origin}</span> : null}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ))}
      </>
      )}
    </section>
  );
}
