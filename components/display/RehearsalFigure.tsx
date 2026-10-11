'use client';

// components/display/RehearsalFigure.tsx — a conversation, practised before it is had.
//
// The person writes their own lines, always. Socria plays only the other
// side, through the experience route, and every line it gives is marked as
// simulated — a possibility to practise against, not what the real person
// will say. Any line can be tried again another way (a new take; the old one
// stays), the rehearsal can be paused, and the pushback made gentler or
// tougher. Looking back shows counts of what was actually said, take by
// take — never a score, never a judgment of anyone.

import { useEffect, useRef, useState } from 'react';
import {
  DIFFICULTY_WORD,
  REFLECT_PROMPTS,
  REHEARSAL_LIMITS,
  feedback,
  lineOf,
  whoseTurn,
  type Difficulty,
  type RehearsalState,
} from '@/lib/objects/display-rehearsal';
import type { FigureProps } from '@/components/objects/figures';
import { AddRow, DisplayShell, Edit, useDisplay, type Display } from './DisplayShell';
import { Segmented, Tool } from './primitives';
import { Area, AskStatus, BasisMark, Links, Section, Shared, useAsk } from './experience-ui';
import './experience.css';

type S = RehearsalState;
type D = Display<S>;

export function RehearsalFigure(p: FigureProps) {
  const d = useDisplay<S>(p);
  const s = d.state;
  const ask = useAsk(p);
  const who = s.counterpart.name || s.counterpart.role || 'the other person';
  const line = lineOf(s);
  const take = s.branches.find((b) => b.id === s.current);
  return (
    <DisplayShell
      p={p}
      d={d}
      aside={`with ${who} · ${take?.label ?? ''}${s.paused ? ' · paused' : ''}`}
      tools={
        <>
          {s.view === 'room' && (
            <Tool label={s.paused ? 'Carry on' : 'Pause'} onClick={() => d.act('pause', { on: s.paused ? 'no' : 'yes' })} on={s.paused}>
              {s.paused ? 'Carry on' : 'Pause'}
            </Tool>
          )}
          {s.view === 'room' && line.length > 0 && (
            <Tool label="Start a new take from the beginning" onClick={() => d.act('branch', { after: '' })} disabled={s.branches.length >= REHEARSAL_LIMITS.branches}>
              New take
            </Tool>
          )}
        </>
      }
    >
      <AskStatus busy={ask.busy} said={ask.said} />
      {s.branches.length > 1 && (
        <div className="xp-takes" role="group" aria-label="Takes">
          {s.branches.map((b) => (
            <button key={b.id} type="button" className={b.id === s.current ? 'is-on' : ''} aria-pressed={b.id === s.current} disabled={!d.live} onClick={() => b.id !== s.current && d.act('switchTo', { branch: b.id })}>
              {b.label}
            </button>
          ))}
        </div>
      )}
      {s.view === 'setup' && <Setup p={p} d={d} />}
      {s.view === 'room' && <Room p={p} d={d} ask={ask} who={who} />}
      {s.view === 'review' && <Review p={p} d={d} who={who} />}
      <Links links={s.links} p={p} />
    </DisplayShell>
  );
}

// ── set up ───────────────────────────────────────────────────────────

function Setup({ p, d }: { p: FigureProps; d: D }) {
  const s = d.state;
  return (
    <div className="xp-rr-setup">
      <Section title="What you want from the conversation" id={`${p.obj.id}-goal`} aside={s.goalBy === 'socria' && s.goal ? <BasisMark by="socria" basis="inferred" /> : undefined}>
        {d.live ? <Area value={s.goal} label="What you want from it" placeholder="e.g. a raise that reflects the new accounts I took on" rows={2} max={REHEARSAL_LIMITS.text} onDone={(v) => d.act('setup', { goal: v, by: 'person' })} /> : <p className="xp-quote">{s.goal || '—'}</p>}
      </Section>
      <Section title="The situation" id={`${p.obj.id}-sit`} aside={s.situationBy === 'socria' && s.situation ? <BasisMark by="socria" basis="inferred" /> : undefined}>
        {d.live ? <Area value={s.situation} label="The situation" placeholder="What is going on, as you see it" rows={3} max={REHEARSAL_LIMITS.long} onDone={(v) => d.act('setup', { situation: v, by: 'person' })} /> : <p className="xp-quote">{s.situation || '—'}</p>}
      </Section>
      <Section title="Who it is with" id={`${p.obj.id}-who`}>
        <div className="xp-panel-grid">
          <label className="dsp-field">
            <span>Who they are to you</span>
            {d.live ? <Edit value={s.counterpart.role} label="Who they are to you" placeholder="my manager" onDone={(v) => d.act('setup', { role: v, by: 'person' })} max={REHEARSAL_LIMITS.name} /> : <span>{s.counterpart.role || '—'}</span>}
          </label>
          <label className="dsp-field">
            <span>Their name (optional)</span>
            {d.live ? <Edit value={s.counterpart.name} label="Their name" placeholder="—" onDone={(v) => d.act('setup', { name: v, by: 'person' })} max={REHEARSAL_LIMITS.name} /> : <span>{s.counterpart.name || '—'}</span>}
          </label>
          <label className="dsp-field is-wide">
            <span>What they are like, as you see them</span>
            {d.live ? <Area value={s.counterpart.about} label="What they are like" placeholder="Your description — Socria plays them from it, as a possibility." rows={2} max={REHEARSAL_LIMITS.long} onDone={(v) => d.act('setup', { about: v, by: 'person' })} /> : <span>{s.counterpart.about || '—'}</span>}
          </label>
        </div>
      </Section>
      <Section title="How hard they push back" id={`${p.obj.id}-diff`}>
        <Segmented
          label="How hard they push back"
          options={(['gentle', 'realistic', 'tough'] as Difficulty[]).map((k) => ({ id: k, label: k[0].toUpperCase() + k.slice(1), title: DIFFICULTY_WORD[k] }))}
          value={s.difficulty}
          disabled={!d.live}
          onChange={(k) => d.act('setup', { difficulty: k, by: 'person' })}
        />
        <p className="xp-dim">{DIFFICULTY_WORD[s.difficulty]}</p>
      </Section>
      <Section title="What you want to get across" id={`${p.obj.id}-aims`}>
        <ul className="xp-list">
          {s.objectives.map((o) => (
            <li key={o.id}>
              <span className="xp-list-text">
                {o.text} <BasisMark by={o.by} />
              </span>
              {d.live && (
                <button type="button" className="dsp-x" aria-label={`Remove: ${o.text}`} onClick={() => d.act('removeObjective', { id: o.id })}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        {d.live && s.objectives.length < REHEARSAL_LIMITS.objectives && <AddRow label="Add something to get across" placeholder="A point you want to make…" onAdd={(t) => d.act('addObjective', { text: t, by: 'person' })} />}
      </Section>
      {d.live && (
        <button type="button" className="xp-onward-btn is-primary" onClick={() => d.act('view', { view: 'room' })}>
          Start rehearsing
        </button>
      )}
    </div>
  );
}

// ── the room ─────────────────────────────────────────────────────────

function Room({ p, d, ask, who }: { p: FigureProps; d: D; ask: ReturnType<typeof useAsk>; who: string }) {
  const s = d.state;
  const line = lineOf(s);
  const [draft, setDraft] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const turn = whoseTurn(s);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [line.length, reduced]);
  const canAsk = !!p.ask && !!p.onWorkspace;
  const reply = () => ask.run(`${who} is answering`, { kind: 'rehearsal', action: 'reply' });
  const say = async () => {
    const text = draft.trim();
    if (!text || !d.act('say', { who: 'you', text, by: 'person' })) return;
    setDraft('');
    // the other side answers — simulated, through the route — when it can
    if (canAsk) setTimeout(() => void reply(), 0);
  };
  return (
    <div className="xp-room">
      <p className="xp-dim">Your lines are yours. {who[0].toUpperCase() + who.slice(1)}’s are simulated by Socria — a possibility to practise against, not a prediction of what they will say.</p>
      <ol className="xp-lines" aria-label="The conversation" aria-live="polite">
        {line.map((t) => {
          const hints = s.hints.filter((h) => h.turn === t.id);
          const mine = t.who === 'you';
          return (
            <li key={t.id} className={`xp-line is-${t.who}`}>
              <span className="xp-line-who">
                {mine ? 'You' : who}
                {!mine && (t.by === 'socria' ? <BasisMark by="socria" basis="simulated" /> : <span className="xp-dim"> · as you scripted it</span>)}
              </span>
              <p className="xp-line-text">{t.text}</p>
              {d.live && (
                <span className="xp-line-acts">
                  {mine && canAsk && (
                    <button type="button" className="dsp-tool" disabled={!!ask.busy} onClick={() => ask.run('Socria is finding another way to put it', { kind: 'rehearsal', action: 'rephrase', turn: t.id })}>
                      Another way to say it
                    </button>
                  )}
                  <button type="button" className="dsp-tool" disabled={s.branches.length >= REHEARSAL_LIMITS.branches} onClick={() => d.act('branch', { after: t.id })} title="Start a new take that continues from this line — this take stays">
                    Try again from here
                  </button>
                </span>
              )}
              {hints.map((h) => (
                <div key={h.id} className="xp-hint">
                  <BasisMark by="socria" /> <span className="xp-hint-text">“{h.text}”</span>
                  {d.live && (
                    <>
                      <button
                        type="button"
                        className="dsp-tool"
                        onClick={() => {
                          setDraft(h.text);
                          box.current?.focus();
                        }}
                      >
                        Use as a start
                      </button>
                      <button type="button" className="dsp-x" aria-label="Dismiss the suggestion" onClick={() => d.act('removeHint', { id: h.id })}>
                        ×
                      </button>
                    </>
                  )}
                </div>
              ))}
            </li>
          );
        })}
      </ol>
      <div ref={end} />
      {!line.length && <p className="dsp-empty">Nothing said yet. Open the conversation yourself, or let {who} start.</p>}
      {d.live && (
        <form
          className="xp-say"
          onSubmit={(e) => {
            e.preventDefault();
            void say();
          }}
        >
          <textarea
            ref={box}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void say();
              }
            }}
            rows={2}
            maxLength={REHEARSAL_LIMITS.line}
            placeholder={s.paused ? 'Paused — carry on when you are ready.' : turn === 'you' ? 'Say your line…' : `Your line (or let ${who} answer)`}
            aria-label="Your line"
            disabled={s.paused}
          />
          <span className="xp-say-acts">
            <button type="submit" disabled={!draft.trim() || s.paused}>
              Say it
            </button>
            {canAsk && turn === 'them' && (
              <button type="button" className="dsp-tool" disabled={!!ask.busy || s.paused} onClick={() => void reply()}>
                Let {who} answer
              </button>
            )}
            {canAsk && !line.length && (
              <button type="button" className="dsp-tool" disabled={!!ask.busy || s.paused} onClick={() => void reply()}>
                Let {who} start
              </button>
            )}
            {line.length > 0 && (
              <button type="button" className="dsp-tool" onClick={() => d.act('retract', {})} title="Take back the last line of this take">
                Take back the last line
              </button>
            )}
          </span>
          {!canAsk && <p className="xp-dim">Open it beside the conversation for {who} to answer.</p>}
        </form>
      )}
    </div>
  );
}

// ── looking back ─────────────────────────────────────────────────────

function Review({ p, d, who }: { p: FigureProps; d: D; who: string }) {
  const s = d.state;
  const f = feedback(s);
  const takes = s.branches.map((b) => ({ b, f: feedback(s, b.id), n: lineOf(s, b.id).length })).filter((x) => x.n > 0);
  return (
    <div className="xp-review">
      <p className="xp-dim">Counts of what was said in this take — not a judgment of how it went, or of anyone.</p>
      <dl className="xp-counts">
        <div>
          <dt>Your lines</dt>
          <dd>{f.lines}</dd>
        </div>
        <div>
          <dt>Questions you asked</dt>
          <dd>{f.questions}</dd>
        </div>
        <div>
          <dt>Reasons you gave</dt>
          <dd>{f.reasons}</dd>
        </div>
        <div>
          <dt>Words, you : {who}</dt>
          <dd>
            {f.balance.you} : {f.balance.them}
          </dd>
        </div>
      </dl>
      <Section title="Specifics you gave" id={`${p.obj.id}-spec`}>
        {f.specifics.length ? <p>{f.specifics.join(' · ')}</p> : <p className="dsp-empty">No numbers, amounts or dates were said.</p>}
      </Section>
      <Section title="Words that soften a request" id={`${p.obj.id}-soft`} aside="how often you used them — yours to weigh">
        {f.softeners.length ? <p>{f.softeners.map((x) => `${x.word} ×${x.n}`).join(' · ')}</p> : <p className="dsp-empty">None of the common ones.</p>}
      </Section>
      {f.theirQuestions.length > 0 && (
        <Section title={`Questions ${who} asked`} id={`${p.obj.id}-qs`}>
          <ul className="xp-list">
            {f.theirQuestions.map((q, i) => (
              <li key={i}>
                <span className="xp-list-text">“{q.text}”</span>
                <span className="xp-dim">{q.touched ? 'your next line shares words with it' : 'your next line shares no words with it — check you answered it'}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {f.objectives.length > 0 && (
        <Section title="What you wanted to get across" id={`${p.obj.id}-got`}>
          <ul className="xp-list">
            {f.objectives.map((o) => (
              <li key={o.id}>
                <span className="xp-list-text">
                  {o.text} <span className="xp-dim">— {o.said ? 'said out loud' : 'not said yet'}</span>
                </span>
                <Segmented
                  label={`Did it land: ${o.text}`}
                  options={[
                    { id: 'yes', label: 'Got it across' },
                    { id: 'no', label: 'Not yet' },
                    { id: '', label: '—' },
                  ]}
                  value={o.met === true ? 'yes' : o.met === false ? 'no' : ''}
                  disabled={!d.live}
                  onChange={(v) => d.act('met', { id: o.id, ok: v })}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {takes.length > 1 && (
        <Section title="Take by take" id={`${p.obj.id}-takes`}>
          <table className="dsp-table xp-takes-table">
            <thead>
              <tr>
                <th scope="col">Take</th>
                <th scope="col">Lines</th>
                <th scope="col">Questions</th>
                <th scope="col">Reasons</th>
                <th scope="col">Specifics</th>
                <th scope="col">Aims said</th>
              </tr>
            </thead>
            <tbody>
              {takes.map(({ b, f: g }) => (
                <tr key={b.id} className={b.id === s.current ? 'is-on' : ''}>
                  <th scope="row">{d.live ? <Edit value={b.label} label={`Name of ${b.label}`} onDone={(v) => v && v !== b.label && d.act('renameTake', { branch: b.id, label: v })} max={60} /> : b.label}</th>
                  <td>{g.lines}</td>
                  <td>{g.questions}</td>
                  <td>{g.reasons}</td>
                  <td>{g.specifics.length}</td>
                  <td>
                    {g.objectives.filter((o) => o.said).length}/{g.objectives.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
      <Shared shared={p.shared} what="your reflection" />
      {REFLECT_PROMPTS.map((q) => (
        <Section key={q.id} title={q.ask} id={`${p.obj.id}-rf-${q.id}`}>
          {d.live ? <Area value={s.reflection[q.id] ?? ''} label={q.ask} placeholder="In your words — only you write here." onDone={(v) => d.act('reflect', { field: q.id, text: v })} /> : <p className="xp-quote">{s.reflection[q.id] || '—'}</p>}
        </Section>
      ))}
    </div>
  );
}
