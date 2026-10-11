'use client';

// components/display/TimeFigure.tsx — how this thinking got to where it is.
//
// Drawn from what was recorded and nothing else (lib/objects/timeline.ts):
// every step each followed object took, and every change the map's record
// kept, in time order — with where the record is incomplete said first.
// Looking at an earlier moment is a look along that object's history (the
// later states stay); starting afresh from one makes a new object beside the
// old. Why something changed is the person's to say — where they have not,
// it reads "no reason was recorded", never a guess. History is forgotten only
// when the person asks, and what was forgotten stays counted.

import { useMemo, useState } from 'react';
import { compareMap, compareStates, kindOf, timelineOf, type TimelineEvent } from '@/lib/objects';
import { ideasAt } from '@/lib/map-history';
import type { TimeState } from '@/lib/objects/display-timemachine';
import type { FigureProps } from '@/components/objects/figures';
import { DisplayShell, Edit, useDisplay, type Display } from './DisplayShell';
import { Confirm } from './primitives';
import { Area, Links, Section, Shared } from './experience-ui';
import './experience.css';

type S = TimeState;
type D = Display<S>;
const WHO: Record<TimelineEvent['who'], string> = { person: 'you', socria: 'Socria', suggested: 'you, on Socria’s suggestion', turn: 'a turn of the conversation', edit: 'your edit by hand' };
const when = (at: number) => (at ? new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'time not recorded');

export function TimeFigure(p: FigureProps) {
  const d = useDisplay<S>(p);
  const s = d.state;
  const tl = useMemo(() => timelineOf(p.space, p.history, { tracked: s.tracked, map: s.map, exclude: p.obj.id }), [p.space, p.history, s.tracked, s.map, p.obj.id]);
  if (!p.space) {
    return (
      <DisplayShell p={p} d={d}>
        <p className="dsp-empty">Open it beside the conversation to look back through what was recorded.</p>
      </DisplayShell>
    );
  }
  return (
    <DisplayShell p={p} d={d} aside={`${tl.events.length} recorded change${tl.events.length === 1 ? '' : 's'}`}>
      <div className="xp-tm-subject">
        <span className="xp-h">Looking back at</span>
        {d.live ? <Edit value={s.subject} label="What you are looking back at" placeholder="Say it in your words" onDone={(v) => v && v !== s.subject && d.act('subject', { text: v, by: 'person' })} max={240} /> : <p className="xp-quote">{s.subject || '—'}</p>}
      </div>
      <Follow p={p} d={d} />
      {tl.gaps.length > 0 && (
        <ul className="xp-gaps" aria-label="Where the record is incomplete">
          {tl.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      )}
      {s.view === 'timeline' && <Timeline p={p} d={d} events={tl.events} />}
      {s.view === 'compare' && <Compare p={p} d={d} />}
      {s.view === 'reasons' && <Reasons p={p} d={d} events={tl.events} />}
      <Links links={s.links} p={p} />
    </DisplayShell>
  );
}

function Follow({ p, d }: { p: FigureProps; d: D }) {
  const s = d.state;
  const objs = (p.space?.objs ?? []).filter((o) => o.id !== p.obj.id);
  const all = !s.tracked.length;
  return (
    <div className="xp-tm-follow" role="group" aria-label="What it follows">
      <span className="xp-dim">Following:</span>
      <button type="button" className={`xp-chip-btn${all ? ' is-on' : ''}`} aria-pressed={all} disabled={!d.live || all} onClick={() => d.act('followAll', {})}>
        Everything
      </button>
      {objs.map((o) => {
        const on = s.tracked.includes(o.id);
        const title = String((o.states[o.at] as { title?: unknown } | undefined)?.title ?? o.name);
        return (
          <button key={o.id} type="button" className={`xp-chip-btn${on ? ' is-on' : ''}`} aria-pressed={on} disabled={!d.live} onClick={() => d.act('track', { obj: o.id, on: on ? 'no' : 'yes' })} title={kindOf(o.kind)?.label}>
            {title}
          </button>
        );
      })}
      <button type="button" className={`xp-chip-btn${s.map ? ' is-on' : ''}`} aria-pressed={s.map} disabled={!d.live} onClick={() => d.act('map', { on: s.map ? 'no' : 'yes' })}>
        The map
      </button>
    </div>
  );
}

function Timeline({ p, d, events }: { p: FigureProps; d: D; events: TimelineEvent[] }) {
  const s = d.state;
  const [open, setOpen] = useState<string | null>(null);
  if (!events.length) return <p className="dsp-empty">Nothing recorded yet. Changes appear here as you work — from now on.</p>;
  return (
    <ol className="xp-tl" aria-label="Recorded changes, oldest first">
      {events.map((e) => {
        const reason = s.reasons.find((r) => r.key === e.key);
        const o = e.source.kind === 'step' ? p.space?.objs.find((x) => x.id === (e.source as { obj: string }).obj) : null;
        const idx = e.source.kind === 'step' ? e.source.index + 1 : e.source.index;
        const here = o ? o.at === idx : false;
        const isOpen = open === e.key;
        return (
          <li key={e.key} className={`xp-tl-ev${here ? ' is-here' : ''}`}>
            <button type="button" className="xp-tl-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.key)}>
              <span className="xp-tl-when">{when(e.at)}</span>
              <span className="xp-tl-about">{e.about}</span>
              <span className="xp-tl-said">{e.said}</span>
              <span className="xp-tl-who">by {WHO[e.who]}</span>
              {here && <span className="xp-chip is-yours">shown now</span>}
            </button>
            {isOpen && (
              <div className="xp-tl-body">
                {e.note && <p className="xp-tl-note">What the workspace computed: {e.note}</p>}
                {e.words && <p className="xp-tl-words">What you said on that turn: “{e.words}”</p>}
                <p className="xp-tl-why">
                  <span className="xp-dim">Why it changed: </span>
                  {reason ? <q>{reason.text}</q> : <span className="xp-dim">no reason was recorded.</span>}
                </p>
                {d.live && <Area value={reason?.text ?? ''} label={`Why this changed: ${e.said}`} placeholder="Say why, in your words — only you write here." onDone={(v) => d.act('reason', { key: e.key, text: v })} rows={2} />}
                {d.live && p.onWorkspace && o && (
                  <span className="xp-tl-acts">
                    <button type="button" className="dsp-tool" disabled={here} onClick={() => p.onWorkspace?.({ type: 'seek', obj: o.id, at: idx })} title="Look at it as it was just after this change — nothing later is lost">
                      Show it as it was then
                    </button>
                    {o.at !== o.states.length - 1 && (
                      <button type="button" className="dsp-tool" onClick={() => p.onWorkspace?.({ type: 'seek', obj: o.id, at: o.states.length - 1 })}>
                        Back to now
                      </button>
                    )}
                    <button type="button" className="dsp-tool" onClick={() => p.onWorkspace?.({ type: 'branch', obj: o.id, at: idx, from: p.obj.id })} title="A new copy from this moment, beside the original — the original is untouched">
                      Start afresh from here
                    </button>
                    {idx > 0 && <Confirm label="Forget what came before" ask={`Delete ${idx} earlier step${idx === 1 ? '' : 's'} of ${o.name}’s history? The present stays.`} onConfirm={() => p.onWorkspace?.({ type: 'forget', obj: o.id, before: idx })} />}
                  </span>
                )}
                {d.live && p.onWorkspace && e.source.kind === 'map' && idx > 0 && (
                  <span className="xp-tl-acts">
                    <Confirm label="Forget the map’s record before this" ask={`Delete ${idx} earlier change${idx === 1 ? '' : 's'} from the map’s record? The map stays as it is.`} onConfirm={() => p.onWorkspace?.({ type: 'forgetMap', before: idx })} />
                  </span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Compare({ p, d }: { p: FigureProps; d: D }) {
  const s = d.state;
  const objs = (p.space?.objs ?? []).filter((o) => o.id !== p.obj.id && (!s.tracked.length || s.tracked.includes(o.id)) && o.states.length > 1);
  const [which, setWhich] = useState<string>(objs[0]?.id ?? (p.history ? 'map' : ''));
  const o = objs.find((x) => x.id === which) ?? null;
  const n = o ? o.states.length : (p.history?.changes.length ?? 0) + 1;
  const [a, setA] = useState(0);
  const [b, setB] = useState(Math.max(0, n - 1));
  const A = Math.min(a, n - 1);
  const B = Math.min(b, n - 1);
  const label = (i: number) => {
    if (o) return i === 0 ? `the earliest kept${o.trimmed ? ` (after ${o.trimmed} forgotten)` : ''}` : `after: ${o.steps[i - 1]?.said ?? ''}`.slice(0, 70);
    return i === 0 ? 'when the record began' : `${when(p.history!.changes[i - 1].at)}`;
  };
  const diff = o ? compareStates(o, A, B, !!p.guarded) : p.history ? compareMap(p.history, A - 1, B - 1) : null;
  if (!objs.length && !p.history) return <p className="dsp-empty">Nothing here has changed yet, so there are no two moments to compare.</p>;
  return (
    <div className="xp-tm-compare">
      <div className="xp-pair">
        <select value={which} onChange={(e) => (setWhich(e.target.value), setA(0), setB(Number.MAX_SAFE_INTEGER))} aria-label="What to compare">
          {objs.map((x) => (
            <option key={x.id} value={x.id}>
              {String((x.states[x.at] as { title?: unknown } | undefined)?.title ?? x.name)}
            </option>
          ))}
          {p.history && <option value="map">The map</option>}
        </select>
        <select value={A} onChange={(e) => setA(Number(e.target.value))} aria-label="Then">
          {Array.from({ length: n }, (_, i) => (
            <option key={i} value={i}>
              {label(i)}
            </option>
          ))}
        </select>
        <span className="xp-dim">to</span>
        <select value={B} onChange={(e) => setB(Number(e.target.value))} aria-label="Now">
          {Array.from({ length: n }, (_, i) => (
            <option key={i} value={i}>
              {label(i)}
            </option>
          ))}
        </select>
      </div>
      {diff && (
        <div className="xp-thennow">
          <Section title="Then" id="xp-then">
            {'then' in diff && diff.then.length ? (
              <ul className="xp-list">
                {diff.then.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            ) : null}
            {diff.removed.length ? <p>No longer there: {diff.removed.map((x) => `“${typeof x === 'string' ? x : x.label}”`).join(', ')}</p> : null}
            {!diff.removed.length && !('then' in diff && diff.then.length) && <p className="xp-dim">Nothing that is gone now.</p>}
          </Section>
          <Section title="Now" id="xp-now">
            {'now' in diff && diff.now.length ? (
              <ul className="xp-list">
                {diff.now.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            ) : null}
            {diff.added.length ? <p>New: {diff.added.map((x) => `“${typeof x === 'string' ? x : x.label}”`).join(', ')}</p> : null}
            {diff.renamed.length ? <p>Reworded: {diff.renamed.map((r) => `“${r.from}” → “${r.to}”`).join('; ')}</p> : null}
            {!diff.added.length && !diff.renamed.length && !('now' in diff && diff.now.length) && <p className="xp-dim">Nothing new.</p>}
          </Section>
        </div>
      )}
      {!o && p.history && <p className="xp-dim">On the map then: {ideasAt(p.history, A - 1).length} ideas · now: {ideasAt(p.history, B - 1).length}.</p>}
    </div>
  );
}

function Reasons({ p, d, events }: { p: FigureProps; d: D; events: TimelineEvent[] }) {
  const s = d.state;
  const given = events.filter((e) => s.reasons.some((r) => r.key === e.key));
  const without = events.filter((e) => !s.reasons.some((r) => r.key === e.key) && e.who !== 'socria');
  const orphaned = s.reasons.filter((r) => !events.some((e) => e.key === r.key));
  return (
    <div className="xp-tm-reasons">
      <Shared shared={p.shared} what="your reasons" />
      <Section title="Why things changed, in your words" id="xp-reasons">
        {given.length ? (
          <ul className="xp-list">
            {given.map((e) => (
              <li key={e.key}>
                <span className="xp-dim">{when(e.at)} · {e.said}</span> — <q>{s.reasons.find((r) => r.key === e.key)!.text}</q>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dsp-empty">No reasons written yet.</p>
        )}
        {orphaned.length > 0 && <p className="xp-dim">{orphaned.length} reason{orphaned.length === 1 ? ' is' : 's are'} about changes no longer in the record.</p>}
      </Section>
      <Section title="Changes with no reason recorded" id="xp-noreason" aside={`${without.length}`}>
        <ul className="xp-list">
          {without.slice(-12).map((e) => (
            <li key={e.key}>
              <span className="xp-list-text">
                <span className="xp-dim">{when(e.at)} · </span>
                {e.said}
              </span>
              {d.live && <Area value="" label={`Why: ${e.said}`} placeholder="Why, if you remember…" rows={1} onDone={(v) => v && d.act('reason', { key: e.key, text: v })} />}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
