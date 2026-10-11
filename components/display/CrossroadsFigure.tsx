'use client';

// components/display/CrossroadsFigure.tsx — a decision, worked through by the person who has to make it.
//
// Everything computed here is the kind's (lib/objects/display-crossroads.ts):
// the weighted score of each option from THEIR ratings and weights (a summary
// of their inputs, labelled so, never a verdict), what each option fails of
// their must-haves, what is still unknown, the trade-offs between two
// options, the weight at which the order would turn, which assumptions the
// decision most rests on. This draws them and turns what the person does into
// operations. Socria's part is labelled where it appears — an option it
// drafted, a question it suggested, a scenario it imagined — and it can be
// asked for questions and scenarios; it is never asked for an answer.

import { useRef, useState } from 'react';
import {
  CASE_WORD,
  CONFIDENCE_WORD,
  CROSSROADS_LIMITS,
  NOTE_WORD,
  PROMPTS,
  keyAssumptions,
  missing,
  sensitivityOf,
  standings,
  tradeoffs,
  type Case,
  type Confidence,
  type CrossroadsState,
  type NoteKind,
} from '@/lib/objects/display-crossroads';
import type { FigureProps } from '@/components/objects/figures';
import { AddRow, DisplayShell, Edit, useDisplay, type Display } from './DisplayShell';
import { Confirm, NumberEdit, Segmented, Slider, Tool } from './primitives';
import { Area, AskStatus, BasisMark, Links, Section, Shared, useAsk } from './experience-ui';
import './experience.css';

type S = CrossroadsState;
type D = Display<S>;
const one = (n: number | null) => (n === null ? '—' : (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, ''));
const NOTE_KINDS: NoteKind[] = ['pro', 'con', 'unknown', 'evidence', 'risk', 'opportunity'];
const CASES: Case[] = ['best', 'plausible', 'worst'];
const CONFIDENCES: Confidence[] = ['sure', 'unsure', 'guess'];

export function CrossroadsFigure(p: FigureProps) {
  const d = useDisplay<S>(p);
  const s = d.state;
  const ask = useAsk(p);
  const optRef = useRef<HTMLDivElement>(null);
  const priRef = useRef<HTMLDivElement>(null);
  const st = standings(s);
  const left = missing(s);
  const decidedName = s.decided ? s.alternatives.find((a) => a.id === s.decided!.alt)?.name : null;
  const aside = decidedName ? `You chose ${decidedName}` : `${s.alternatives.length} option${s.alternatives.length === 1 ? '' : 's'} · nothing decided`;
  return (
    <DisplayShell
      p={p}
      d={d}
      aside={aside}
      tools={
        <>
          <Tool label="Add an option" onClick={() => optRef.current?.querySelector('input')?.focus()} disabled={s.alternatives.length >= CROSSROADS_LIMITS.alternatives}>
            + Option
          </Tool>
          <Tool label="Add something that matters" onClick={() => priRef.current?.querySelector('input')?.focus()} disabled={s.priorities.length >= CROSSROADS_LIMITS.priorities}>
            + What matters
          </Tool>
          <Tool label="Ask Socria what else to consider" onClick={() => ask.run('Socria is looking for what is missing', { kind: 'crossroads', action: 'consider' })} disabled={!!ask.busy || !s.alternatives.length}>
            What am I missing?
          </Tool>
        </>
      }
    >
      <AskStatus busy={ask.busy} said={ask.said} />
      {s.view === 'center' && <Center p={p} d={d} optRef={optRef} st={st} left={left} />}
      {s.view === 'priorities' && <Priorities d={d} priRef={priRef} />}
      {s.view === 'compare' && <SideBySide d={d} st={st} />}
      {s.view === 'scenarios' && <WhatIf p={p} d={d} ask={ask} />}
      {s.view === 'reflect' && <Reflect p={p} d={d} />}
      <Links links={s.links} p={p} />
      {d.live && p.onWorkspace && s.alternatives.length > 0 && (
        <div className="xp-onward">
          <button
            type="button"
            className="xp-onward-btn"
            onClick={() =>
              p.onWorkspace?.({
                type: 'make',
                kind: 'rehearsal',
                state: { title: `Talking about: ${s.title}`.slice(0, 80), view: 'setup', situation: s.decision, situationBy: s.decisionBy, goal: '', goalBy: 'socria' },
                from: { obj: p.obj.id },
              })
            }
          >
            Rehearse a conversation about this
          </button>
          <button type="button" className="xp-onward-btn" onClick={() => p.onWorkspace?.({ type: 'make', kind: 'timemachine', state: { title: `Looking back: ${s.title}`.slice(0, 80), subject: s.decision, subjectBy: s.decisionBy, tracked: [p.obj.id], map: false }, from: { obj: p.obj.id } })}>
            Look back at how this changed
          </button>
        </div>
      )}
    </DisplayShell>
  );
}

// ── the decision ─────────────────────────────────────────────────────

function Center({ p, d, optRef, st, left }: { p: FigureProps; d: D; optRef: React.RefObject<HTMLDivElement>; st: ReturnType<typeof standings>; left: ReturnType<typeof missing> }) {
  const s = d.state;
  const [choice, setChoice] = useState('');
  const [why, setWhy] = useState('');
  const rowOf = (id: string) => st.rows.find((r) => r.alt === id);
  return (
    <div className="xp-cr-center">
      <Section title="What you are deciding" id={`${p.obj.id}-dec`} aside={s.decisionBy === 'socria' && s.decision ? <BasisMark by="socria" basis="inferred" /> : undefined}>
        {d.live ? (
          <Area value={s.decision} onDone={(v) => v && d.act('decision', { text: v, by: 'person' })} label="What you are deciding" placeholder="Say it in your own words" rows={2} max={CROSSROADS_LIMITS.text} />
        ) : (
          <p className="xp-quote">{s.decision || 'Not stated yet.'}</p>
        )}
      </Section>
      <Section title="Options" id={`${p.obj.id}-opts`} aside={st.tooClose ? 'the top two are too close to call on your ratings' : undefined}>
        {!s.alternatives.length && <p className="dsp-empty">No options yet — add the ones you are choosing between.</p>}
        <ul className="xp-cr-opts">
          {s.alternatives.map((a) => {
            const r = rowOf(a.id);
            const chosen = s.decided?.alt === a.id;
            return (
              <li key={a.id} className={`xp-cr-opt${chosen ? ' is-chosen' : ''}`}>
                <span className="xp-cr-opt-name">
                  {d.live ? <Edit value={a.name} label={`Option name: ${a.name}`} onDone={(v) => v && v !== a.name && d.act('renameAlt', { id: a.id, name: v, by: 'person' })} max={CROSSROADS_LIMITS.name} /> : a.name}
                  <BasisMark by={a.by} />
                  {chosen && <span className="xp-chip is-yours">your choice</span>}
                </span>
                <span className="xp-cr-opt-facts">
                  {r?.total !== null && r?.total !== undefined ? (
                    <span title="Weighted from your own ratings and weights — a summary of your inputs, not a verdict">
                      {one(r.total)}
                      <span className="xp-dim"> / 10 from your ratings</span>
                    </span>
                  ) : (
                    <span className="xp-dim">not rated yet</span>
                  )}
                  {r && r.unrated > 0 && r.total !== null && <span className="xp-dim"> · {r.unrated} not rated</span>}
                  {r && r.fails.length > 0 && <span className="xp-fail"> · misses {r.fails.map((id) => s.priorities.find((x) => x.id === id)?.name).join(', ')}</span>}
                </span>
                {d.live && !chosen && <Confirm label="Remove" ask={`Remove “${a.name}”?`} onConfirm={() => d.act('removeAlt', { id: a.id })} />}
              </li>
            );
          })}
        </ul>
        {d.live && (
          <div ref={optRef}>
            <AddRow label="Add an option" placeholder="Add an option…" onAdd={(t) => d.act('addAlt', { name: t, by: 'person' })} />
          </div>
        )}
      </Section>
      <Section title="Still open" id={`${p.obj.id}-open`}>
        <p className="xp-dim">
          {[
            left.unrated ? `${left.unrated} rating${left.unrated === 1 ? '' : 's'} not given` : '',
            left.unchecked ? `${left.unchecked} must-have${left.unchecked === 1 ? '' : 's'} not checked` : '',
            left.open ? `${left.open} question${left.open === 1 ? '' : 's'} open` : '',
            left.unsure ? `${left.unsure} assumption${left.unsure === 1 ? '' : 's'} you are not sure of` : '',
          ]
            .filter(Boolean)
            .join(' · ') || 'Nothing counted as unknown — which is not the same as knowing everything.'}
        </p>
        <Questions d={d} />
      </Section>
      <Section title="Your decision" id={`${p.obj.id}-decide`}>
        {s.decided ? (
          <div className="xp-cr-decided">
            <p className="xp-quote">
              You chose <strong>{s.alternatives.find((a) => a.id === s.decided!.alt)?.name}</strong>
              {s.decided.why ? <> — because {s.decided.why}</> : null}.
            </p>
            {d.live && (
              <button type="button" className="dsp-tool" onClick={() => d.act('undecide', {})}>
                Reopen it
              </button>
            )}
          </div>
        ) : d.live && s.alternatives.length ? (
          <form
            className="xp-cr-decide"
            onSubmit={(e) => {
              e.preventDefault();
              if (choice && d.act('decide', { alt: choice, ...(why.trim() ? { why: why.trim() } : {}) })) {
                setChoice('');
                setWhy('');
              }
            }}
          >
            <label>
              <span>I choose</span>
              <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="The option you choose">
                <option value="">—</option>
                {s.alternatives.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="is-wide">
              <span>because</span>
              <input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={CROSSROADS_LIMITS.long} placeholder="in your words (optional)" aria-label="Why" />
            </label>
            <button type="submit" disabled={!choice}>
              Record my decision
            </button>
            <p className="xp-dim is-wide">Only you decide. The scores above summarise your own ratings; they do not choose for you.</p>
          </form>
        ) : (
          <p className="xp-dim">Nothing is decided.</p>
        )}
      </Section>
    </div>
  );
}

function Questions({ d }: { d: D }) {
  const s = d.state;
  return (
    <>
      <ul className="xp-list">
        {s.questions.map((q) => (
          <li key={q.id} className={q.answer ? 'is-answered' : ''}>
            <span className="xp-list-text">
              {q.text} <BasisMark by={q.by} />
            </span>
            {d.live ? <Edit value={q.answer ?? ''} label={`Answer: ${q.text}`} placeholder="What you found out…" onDone={(v) => d.act('answer', { id: q.id, answer: v })} max={CROSSROADS_LIMITS.text} /> : q.answer && <span className="xp-answer">{q.answer}</span>}
            {d.live && (
              <button type="button" className="dsp-x" aria-label={`Remove the question ${q.text}`} onClick={() => d.act('removeQuestion', { id: q.id })}>
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {d.live && <AddRow label="Add a question" placeholder="Something you still need to find out…" onAdd={(t) => d.act('addQuestion', { text: t, by: 'person' })} />}
    </>
  );
}

// ── what matters ─────────────────────────────────────────────────────

function Priorities({ d, priRef }: { d: D; priRef: React.RefObject<HTMLDivElement> }) {
  const s = d.state;
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  const st = standings(s);
  const ranked = [...st.rows].filter((r) => r.total !== null).sort((x, y) => (y.total ?? 0) - (x.total ?? 0));
  const A = a || ranked[0]?.alt || s.alternatives[0]?.id || '';
  const B = b || ranked[1]?.alt || s.alternatives.find((x) => x.id !== A)?.id || '';
  const tr = A && B && A !== B ? tradeoffs(s, A, B) : [];
  const name = (id: string) => s.alternatives.find((x) => x.id === id)?.name ?? s.priorities.find((x) => x.id === id)?.name ?? id;
  return (
    <div className="xp-cr-pri">
      <p className="xp-dim">In your order — move them to say what comes first. A must-have is met or not; a preference is weighed from 0 to 10.</p>
      <ol className="xp-pri-list">
        {s.priorities.map((pr, i) => (
          <li key={pr.id} className="xp-pri">
            <span className="xp-pri-move" role="group" aria-label={`Move ${pr.name}`}>
              <button type="button" disabled={!d.live || i === 0} onClick={() => d.act('movePri', { id: pr.id, to: i - 1 })} aria-label={`Move ${pr.name} up`}>
                ↑
              </button>
              <button type="button" disabled={!d.live || i === s.priorities.length - 1} onClick={() => d.act('movePri', { id: pr.id, to: i + 1 })} aria-label={`Move ${pr.name} down`}>
                ↓
              </button>
            </span>
            <span className="xp-pri-name">
              {d.live ? <Edit value={pr.name} label={`Rename ${pr.name}`} onDone={(v) => v && v !== pr.name && d.act('renamePri', { id: pr.id, name: v, by: 'person' })} max={CROSSROADS_LIMITS.name} /> : pr.name}
              <BasisMark by={pr.by} />
            </span>
            <Segmented
              label={`${pr.name}: must-have or preference`}
              options={[
                { id: 'preference', label: 'Weigh it' },
                { id: 'constraint', label: 'Must-have' },
              ]}
              value={pr.kind}
              disabled={!d.live}
              onChange={(k) => d.act('priKind', { id: pr.id, kind: k })}
            />
            {pr.kind === 'preference' ? (
              <span className="xp-pri-weight">
                <Slider value={pr.weight} min={0} max={10} label={`How much ${pr.name} matters`} disabled={!d.live} onCommit={(n) => d.act('weight', { id: pr.id, weight: n })} />
                {!pr.weighed && <span className="xp-dim">not weighed — counted as 5</span>}
              </span>
            ) : (
              <span className="xp-dim">met or not, per option</span>
            )}
            {d.live && <Confirm label="Remove" ask={`Remove “${pr.name}”?`} onConfirm={() => d.act('removePri', { id: pr.id })} />}
          </li>
        ))}
      </ol>
      {d.live && (
        <div ref={priRef}>
          <AddRow label="Add something that matters" placeholder="Something that matters to you…" onAdd={(t) => d.act('addPri', { name: t, by: 'person' })} />
        </div>
      )}
      {s.alternatives.length >= 2 && (
        <Section title="Trade-offs" id="xp-tradeoffs" aside="from your own ratings">
          <div className="xp-pair">
            <select value={A} onChange={(e) => setA(e.target.value)} aria-label="First option">
              {s.alternatives.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <span className="xp-dim">against</span>
            <select value={B} onChange={(e) => setB(e.target.value)} aria-label="Second option">
              {s.alternatives.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          {tr.length ? (
            <ul className="xp-list">
              {tr.map((t) => (
                <li key={t.pri}>
                  Choosing <strong>{name(t.worse)}</strong> gives up {t.by} point{t.by === 1 ? '' : 's'} on <strong>{name(t.pri)}</strong> (weight {t.weight}), where you rated {name(t.better)} higher.
                </li>
              ))}
            </ul>
          ) : (
            <p className="dsp-empty">Rate both options on the same things (Side by side) to see where they pull apart.</p>
          )}
        </Section>
      )}
    </div>
  );
}

// ── side by side ─────────────────────────────────────────────────────

function SideBySide({ d, st }: { d: D; st: ReturnType<typeof standings> }) {
  const s = d.state;
  const prefs = s.priorities.filter((x) => x.kind === 'preference');
  const musts = s.priorities.filter((x) => x.kind === 'constraint');
  const rating = (alt: string, pri: string) => s.ratings.find((r) => r.alt === alt && r.pri === pri)?.value ?? null;
  const meet = (alt: string, pri: string) => s.meets.find((m) => m.alt === alt && m.pri === pri);
  return (
    <div className="xp-sbs" style={{ ['--cols' as string]: s.alternatives.length }}>
      <p className="xp-dim">Your ratings, 0 to 10 — how well each option serves each thing. The score row is arithmetic on your own ratings and weights.</p>
      <div className="xp-sbs-grid" role="table" aria-label="Options side by side">
        <div role="row" className="xp-sbs-row is-head">
          <span role="columnheader" />
          {s.alternatives.map((a) => (
            <span key={a.id} role="columnheader" className="xp-sbs-h">
              {a.name}
            </span>
          ))}
        </div>
        {prefs.map((pr) => (
          <div key={pr.id} role="row" className="xp-sbs-row">
            <span role="rowheader" className="xp-sbs-rh">
              {pr.name} <span className="xp-dim">×{pr.weight}</span>
            </span>
            {s.alternatives.map((a) => (
              <span key={a.id} role="cell">
                <NumberEdit value={rating(a.id, pr.id)} min={0} max={10} placeholder="—" label={`${a.name} on ${pr.name}, 0 to 10`} disabled={!d.live} onDone={(v) => d.act('rate', { alt: a.id, pri: pr.id, value: v === null ? '' : v })} />
              </span>
            ))}
          </div>
        ))}
        {musts.map((pr) => (
          <div key={pr.id} role="row" className="xp-sbs-row">
            <span role="rowheader" className="xp-sbs-rh">
              {pr.name} <span className="xp-dim">must-have</span>
            </span>
            {s.alternatives.map((a) => {
              const m = meet(a.id, pr.id);
              return (
                <span key={a.id} role="cell">
                  <Segmented
                    label={`Does ${a.name} meet ${pr.name}?`}
                    options={[
                      { id: 'yes', label: 'Meets' },
                      { id: 'no', label: 'Misses' },
                      { id: '', label: '?' },
                    ]}
                    value={m ? (m.ok ? 'yes' : 'no') : ''}
                    disabled={!d.live}
                    onChange={(v) => d.act('meet', { alt: a.id, pri: pr.id, ok: v })}
                  />
                </span>
              );
            })}
          </div>
        ))}
        {prefs.length > 0 && (
          <div role="row" className="xp-sbs-row is-total">
            <span role="rowheader" className="xp-sbs-rh">
              Weighted <span className="xp-dim">your inputs, not a verdict</span>
            </span>
            {s.alternatives.map((a) => (
              <span key={a.id} role="cell" className="xp-sbs-total">
                {one(st.rows.find((r) => r.alt === a.id)?.total ?? null)}
              </span>
            ))}
          </div>
        )}
      </div>
      {!s.priorities.length && <p className="dsp-empty">Add what matters to you (What matters) to rate the options against it.</p>}
      <div className="xp-sbs-notes">
        {s.alternatives.map((a) => (
          <Notes key={a.id} d={d} alt={a.id} title={a.name} />
        ))}
      </div>
    </div>
  );
}

function Notes({ d, alt, title }: { d: D; alt: string; title: string }) {
  const s = d.state;
  const [kind, setKind] = useState<NoteKind>('pro');
  const [source, setSource] = useState('');
  const notes = s.notes.filter((n) => n.alt === alt);
  return (
    <div className="xp-notes">
      <h5 className="xp-notes-h">{title}</h5>
      {NOTE_KINDS.map((k) => {
        const of = notes.filter((n) => n.kind === k);
        if (!of.length) return null;
        return (
          <div key={k} className={`xp-notes-kind is-${k}`}>
            <span className="xp-notes-k">{NOTE_WORD[k]}</span>
            <ul className="xp-list">
              {of.map((n) => (
                <li key={n.id}>
                  <span className="xp-list-text">
                    {n.text}
                    {n.source && <span className="xp-source"> — {n.source}</span>} <BasisMark by={n.by} basis={n.basis} />
                  </span>
                  {d.live && (
                    <button type="button" className="dsp-x" aria-label={`Remove: ${n.text}`} onClick={() => d.act('removeNote', { id: n.id })}>
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {d.live && (
        <AddRow
          label={`Add a note about ${title}`}
          placeholder="Add a note…"
          onAdd={(t) => {
            const ok = d.act('addNote', { alt, kind, text: t, ...(kind === 'evidence' && source.trim() ? { source: source.trim() } : {}), by: 'person' });
            if (ok) setSource('');
            return ok;
          }}
          extra={
            <>
              <select value={kind} onChange={(e) => setKind(e.target.value as NoteKind)} aria-label="What kind of note">
                {NOTE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {NOTE_WORD[k]}
                  </option>
                ))}
              </select>
              {kind === 'evidence' && <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="source" aria-label="Where it comes from" maxLength={160} />}
            </>
          }
        />
      )}
    </div>
  );
}

// ── what if ──────────────────────────────────────────────────────────

function WhatIf({ p, d, ask }: { p: FigureProps; d: D; ask: ReturnType<typeof useAsk> }) {
  const s = d.state;
  const sen = sensitivityOf(s);
  const name = (id: string) => s.alternatives.find((x) => x.id === id)?.name ?? id;
  const ks = keyAssumptions(s);
  return (
    <div className="xp-cr-whatif">
      <p className="xp-dim">Hypothetical — ways each option could go, to think with. None of it is a forecast, and nothing here gives odds.</p>
      {s.alternatives.map((a) => (
        <Section
          key={a.id}
          title={a.name}
          id={`${p.obj.id}-sc-${a.id}`}
          aside={
            d.live && p.ask ? (
              <button type="button" className="dsp-tool" disabled={!!ask.busy} onClick={() => ask.run(`Socria is imagining how ${a.name} could go`, { kind: 'crossroads', action: 'imagine', alt: a.id })}>
                Imagine with Socria
              </button>
            ) : undefined
          }
        >
          <div className="xp-cases">
            {CASES.map((c) => {
              const list = s.scenarios.filter((x) => x.alt === a.id && x.case === c);
              return (
                <div key={c} className={`xp-case is-${c}`}>
                  <span className="xp-case-h">{CASE_WORD[c]}</span>
                  {list.map((x) => (
                    <div key={x.id} className="xp-case-item">
                      {d.live && x.by === 'person' ? <Area value={x.text} label={`${a.name}: ${CASE_WORD[c]}`} onDone={(v) => (v ? d.act('editScenario', { id: x.id, text: v, by: 'person' }) : d.act('removeScenario', { id: x.id }))} rows={2} /> : <p>{x.text}</p>}
                      <BasisMark by={x.by} basis={x.basis} />
                      {d.live && x.by === 'socria' && (
                        <button type="button" className="dsp-x" aria-label="Dismiss this scenario" onClick={() => d.act('removeScenario', { id: x.id })}>
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {d.live && !list.some((x) => x.by === 'person') && (
                    <Area value="" label={`Imagine ${a.name}: ${CASE_WORD[c].toLowerCase()}`} placeholder="Imagine it in your words…" rows={2} onDone={(v) => v && d.act('addScenario', { alt: a.id, case: c, text: v, by: 'person' })} />
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      ))}
      <Section title="What it rests on" id={`${p.obj.id}-assume`} aside="least certain first">
        <ul className="xp-list">
          {ks.map((x) => (
            <li key={x.id}>
              <span className="xp-list-text">
                {x.text} <BasisMark by={x.by} basis={x.basis} />
                {x.pri && <span className="xp-dim"> · bears on {s.priorities.find((pr) => pr.id === x.pri)?.name}</span>}
              </span>
              <Segmented
                label={`How sure you are: ${x.text}`}
                options={CONFIDENCES.map((c) => ({ id: c, label: CONFIDENCE_WORD[c] }))}
                value={x.confidence}
                disabled={!d.live}
                onChange={(c) => d.act('assumption', { id: x.id, confidence: c })}
              />
              {d.live && (
                <button type="button" className="dsp-x" aria-label={`Remove: ${x.text}`} onClick={() => d.act('removeAssumption', { id: x.id })}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        {d.live && <AddRow label="Name an assumption" placeholder="Something you are assuming…" onAdd={(t) => d.act('addAssumption', { text: t, by: 'person' })} />}
      </Section>
      <Section title="What would change the order" id={`${p.obj.id}-sens`} aside="computed from your weights">
        {sen ? (
          <ul className="xp-list">
            {sen.flips.map((f) => {
              const pr = s.priorities.find((x) => x.id === f.criterion);
              return (
                <li key={f.criterion}>
                  <strong>{pr?.name}</strong>{' '}
                  {f.at === null ? (
                    <span className="xp-dim">— no weight from 0 to 10 changes which of {name(sen.leader)} and {name(sen.runnerUp)} scores higher.</span>
                  ) : (
                    <>
                      — if it mattered {f.dir === 'up' ? 'more' : 'less'} than {one(f.at)} (now {f.weight}), {name(sen.runnerUp)} would score higher than {name(sen.leader)}.
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="dsp-empty">Rate at least two options to see how much your weights hold the order in place.</p>
        )}
      </Section>
    </div>
  );
}

// ── reflect ──────────────────────────────────────────────────────────

function Reflect({ p, d }: { p: FigureProps; d: D }) {
  const s = d.state;
  const history = p.obj.steps.slice(0, p.at).filter((x) => x.op === 'decide' || x.op === 'undecide');
  return (
    <div className="xp-cr-reflect">
      <Shared shared={p.shared} what="your reflections" />
      {PROMPTS.map((q) => {
        const r = s.reflections.find((x) => x.prompt === q.id);
        return (
          <Section key={q.id} title={q.ask} id={`${p.obj.id}-r-${q.id}`}>
            {d.live ? <Area value={r?.text ?? ''} label={q.ask} placeholder="In your words — only you write here." onDone={(v) => d.act('reflect', { prompt: q.id, text: v })} /> : <p className="xp-quote">{r?.text || '—'}</p>}
          </Section>
        );
      })}
      <Section title="Decision history" id={`${p.obj.id}-hist`}>
        {history.length ? (
          <ol className="xp-list">
            {history.map((x, i) => (
              <li key={i}>
                {x.said}
                {x.at ? <span className="xp-dim"> · {new Date(x.at).toLocaleString()}</span> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="dsp-empty">No decision recorded yet.</p>
        )}
      </Section>
    </div>
  );
}
