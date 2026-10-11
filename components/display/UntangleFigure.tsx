'use client';

// components/display/UntangleFigure.tsx — everything on the person's mind, sorted into something they can act on.
//
// The dump stays exactly as they wrote it (What you wrote), and nothing in it
// is lost: what no thought holds yet is shown, ready to separate. Each thought
// is their words; what kind of thought it is reads as Socria's until they set
// it. Grouping is by hand — drag a thought to a group, or choose the group in
// its panel (a keyboard does everything a pointer does). Commitments, what is
// urgent or important, and what is done are theirs alone; connections Socria
// notices wait for them to confirm. Next steps go in an order their own
// connections allow, and can become a plan beside this.

import { useRef, useState, type DragEvent } from 'react';
import {
  CATEGORIES,
  CATEGORY_WORD,
  QUADRANT_WORD,
  STATUSES,
  STATUS_WORD,
  UNTANGLE_LIMITS,
  blockers,
  counts,
  nextSteps,
  quadrants,
  unsorted,
  type Category,
  type Quadrant,
  type Status,
  type Thought,
  type UntangleState,
} from '@/lib/objects/display-untangle';
import type { FigureProps } from '@/components/objects/figures';
import { AddRow, DisplayShell, Edit, useDisplay, type Display } from './DisplayShell';
import { Confirm, Inspector, Segmented, Tool, useSelection } from './primitives';
import { Area, AskStatus, BasisMark, Links, Section, useAsk } from './experience-ui';
import './experience.css';

type S = UntangleState;
type D = Display<S>;
const QUADS: Quadrant[] = ['do', 'plan', 'hand', 'drop'];

export function UntangleFigure(p: FigureProps) {
  const d = useDisplay<S>(p);
  const s = d.state;
  const [sel, select] = useSelection(p);
  const ask = useAsk(p);
  const addRef = useRef<HTMLDivElement>(null);
  const c = counts(s);
  const left = unsorted(s);
  const picked = s.thoughts.find((t) => t.id === sel) ?? null;
  return (
    <DisplayShell
      p={p}
      d={d}
      aside={`${s.thoughts.length} thought${s.thoughts.length === 1 ? '' : 's'}${c.done ? ` · ${c.done} done` : ''}${left.length ? ` · ${left.length} not sorted yet` : ''}`}
      tools={
        <>
          <Tool label="Add a thought" onClick={() => addRef.current?.querySelector('input')?.focus()} disabled={s.thoughts.length >= UNTANGLE_LIMITS.thoughts}>
            + Thought
          </Tool>
          {left.length > 0 && (
            <Tool label="Separate what is not sorted yet into thoughts" onClick={() => d.act('separate', {})}>
              Separate
            </Tool>
          )}
          <Tool label="Ask Socria to suggest groups and kinds" onClick={() => ask.run('Socria is suggesting how to sort it', { kind: 'untangle', action: 'sort' })} disabled={!!ask.busy || !s.thoughts.length}>
            Suggest groups
          </Tool>
        </>
      }
    >
      <AskStatus busy={ask.busy} said={ask.said} />
      {s.view === 'landscape' && <Landscape d={d} sel={sel} select={select} />}
      {s.view === 'list' && <ByKind d={d} sel={sel} select={select} />}
      {s.view === 'matrix' && <Matrix d={d} sel={sel} select={select} />}
      {s.view === 'source' && <Source d={d} left={left} />}
      {picked && <ThoughtPanel d={d} t={picked} onClose={() => select(null)} />}
      {s.view !== 'source' && <Suggested d={d} />}
      {s.view !== 'source' && d.live && (
        <div ref={addRef}>
          <AddRow label="Add a thought" placeholder="Add a thought…" onAdd={(t) => d.act('add', { text: t, by: 'person' })} />
        </div>
      )}
      {s.view !== 'source' && <Next p={p} d={d} />}
      <Links links={s.links} p={p} />
    </DisplayShell>
  );
}

// ── a thought, as a chip ─────────────────────────────────────────────

function Chip({ t, d, on, select, draggable }: { t: Thought; d: D; on: boolean; select: (id: string | null) => void; draggable?: boolean }) {
  const blocked = blockers(d.state, t.id).length > 0;
  return (
    <button
      type="button"
      className={`xp-chipt is-${t.cat} is-${t.status}${on ? ' is-on' : ''}${blocked ? ' is-blocked' : ''}`}
      aria-pressed={on}
      draggable={d.live && draggable ? true : undefined}
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.setData('text/x-thought', t.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => select(on ? null : t.id)}
      title={`${CATEGORY_WORD[t.cat]}${t.catBy === 'socria' ? ' (Socria’s reading — check it)' : ''} · ${STATUS_WORD[t.status]}`}
    >
      <span className="xp-chipt-kind">
        {CATEGORY_WORD[t.cat]}
        {t.catBy === 'socria' ? '?' : ''}
      </span>
      <span className="xp-chipt-text">{t.text}</span>
      {t.by === 'socria' && <BasisMark by="socria" />}
      {t.status !== 'open' && <span className="xp-chipt-status">{STATUS_WORD[t.status]}</span>}
      {(t.urgent || t.important) && <span className="xp-chipt-flag">{[t.urgent ? 'urgent' : '', t.important ? 'important' : ''].filter(Boolean).join(' · ')}</span>}
      {blocked && <span className="xp-chipt-flag">waiting</span>}
    </button>
  );
}

// ── landscape: the groups ────────────────────────────────────────────

function Landscape({ d, sel, select }: { d: D; sel: string | null; select: (id: string | null) => void }) {
  const s = d.state;
  const [over, setOver] = useState<string | null>(null);
  const cols = [...s.clusters.map((g) => ({ id: g.id, name: g.name, by: g.by })), { id: '', name: 'Not in a group', by: 'person' as const }];
  const drop = (e: DragEvent, cluster: string) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/x-thought');
    const t = s.thoughts.find((x) => x.id === id);
    if (t && (t.cluster ?? '') !== cluster) d.act('place', { id, cluster });
  };
  if (!s.thoughts.length) return <p className="dsp-empty">Nothing here yet — write it all out in “What you wrote”, or add a thought below.</p>;
  return (
    <div className="xp-land">
      <div className="xp-land-cols">
        {cols.map((g) => {
          const here = s.thoughts.filter((t) => (t.cluster ?? '') === g.id && t.status !== 'dropped');
          if (!g.id && !here.length && s.clusters.length) return null;
          return (
            <div
              key={g.id || 'none'}
              className={`xp-land-col${over === g.id ? ' is-over' : ''}${!g.id ? ' is-none' : ''}`}
              onDragOver={(e) => {
                if (!d.live) return;
                e.preventDefault();
                setOver(g.id);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => d.live && drop(e, g.id)}
              aria-label={g.name}
            >
              <div className="xp-land-h">
                {g.id && d.live ? <Edit value={g.name} label={`Group name: ${g.name}`} onDone={(v) => v && v !== g.name && d.act('renameCluster', { id: g.id, name: v, by: 'person' })} max={60} /> : <span>{g.name}</span>}
                {g.id && <BasisMark by={g.by} />}
                {g.id && d.live && (
                  <button type="button" className="dsp-x" aria-label={`Remove the group ${g.name} (its thoughts stay)`} onClick={() => d.act('removeCluster', { id: g.id })}>
                    ×
                  </button>
                )}
              </div>
              <div className="xp-land-chips">
                {here.map((t) => (
                  <Chip key={t.id} t={t} d={d} on={sel === t.id} select={select} draggable />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {d.live && s.clusters.length < UNTANGLE_LIMITS.clusters && <AddRow label="Make a group" placeholder="Make a group…" onAdd={(t) => d.act('addCluster', { name: t, by: 'person' })} />}
      {s.thoughts.some((t) => t.status === 'dropped') && <p className="xp-dim">{s.thoughts.filter((t) => t.status === 'dropped').length} let go — still in “By kind”.</p>}
    </div>
  );
}

// ── by kind ──────────────────────────────────────────────────────────

function ByKind({ d, sel, select }: { d: D; sel: string | null; select: (id: string | null) => void }) {
  const s = d.state;
  return (
    <div className="xp-kinds">
      {CATEGORIES.map((k) => {
        const of = s.thoughts.filter((t) => t.cat === k);
        if (!of.length) return null;
        return (
          <Section key={k} title={CATEGORY_WORD[k]} id={`xp-k-${k}`} aside={`${of.length}`}>
            <ul className="xp-list">
              {of.map((t) => (
                <li key={t.id} className={`is-${t.status}`}>
                  <Chip t={t} d={d} on={sel === t.id} select={select} />
                  <Segmented
                    label={`Where “${t.text}” stands`}
                    options={STATUSES.map((st) => ({ id: st, label: STATUS_WORD[st] }))}
                    value={t.status}
                    disabled={!d.live}
                    onChange={(st) => d.act('status', { id: t.id, status: st })}
                  />
                </li>
              ))}
            </ul>
          </Section>
        );
      })}
    </div>
  );
}

// ── urgent / important ───────────────────────────────────────────────

function Matrix({ d, sel, select }: { d: D; sel: string | null; select: (id: string | null) => void }) {
  const q = quadrants(d.state);
  const [over, setOver] = useState<string | null>(null);
  const flags: Record<Quadrant, { urgent: string; important: string }> = {
    do: { urgent: 'yes', important: 'yes' },
    plan: { urgent: 'no', important: 'yes' },
    hand: { urgent: 'yes', important: 'no' },
    drop: { urgent: 'no', important: 'no' },
  };
  return (
    <div className="xp-matrix">
      <p className="xp-dim">Only what you place is here — urgent and important are your calls. Drag a thought into a quarter, or set it in its panel.</p>
      <div className="xp-quads">
        {QUADS.map((k) => (
          <div
            key={k}
            className={`xp-quad is-${k}${over === k ? ' is-over' : ''}`}
            onDragOver={(e) => {
              if (!d.live) return;
              e.preventDefault();
              setOver(k);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData('text/x-thought');
              if (id && d.live) d.act('flag', { id, ...flags[k] });
            }}
          >
            <span className="xp-quad-h">{QUADRANT_WORD[k]}</span>
            {q[k].map((t) => (
              <Chip key={t.id} t={t} d={d} on={sel === t.id} select={select} draggable />
            ))}
          </div>
        ))}
      </div>
      {q.unplaced.length > 0 && (
        <Section title="Not placed yet" id="xp-unplaced">
          <div className="xp-land-chips">
            {q.unplaced.map((t) => (
              <Chip key={t.id} t={t} d={d} on={sel === t.id} select={select} draggable />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── what you wrote ───────────────────────────────────────────────────

function Source({ d, left }: { d: D; left: { text: string; span: [number, number] }[] }) {
  const s = d.state;
  return (
    <div className="xp-src">
      <p className="xp-dim">Exactly as you wrote it. Socria never rewrites this; sorting never changes it.</p>
      {d.live ? (
        <Area value={s.dump} label="What is on your mind" placeholder="Write everything that is on your mind — in any order, as messy as it is." rows={8} max={UNTANGLE_LIMITS.dump} onDone={(v) => d.act('dump', { text: v })} />
      ) : (
        <pre className="xp-dump">{s.dump || '—'}</pre>
      )}
      {left.length > 0 ? (
        <Section title="Not a thought here yet" id="xp-left" aside={`${left.length}`}>
          <ul className="xp-list">
            {left.map((piece) => (
              <li key={piece.span.join('-')}>
                <span className="xp-list-text">{piece.text}</span>
                {d.live && (
                  <button type="button" className="dsp-tool" onClick={() => d.act('add', { text: piece.text, by: 'person' })}>
                    Add as a thought
                  </button>
                )}
              </li>
            ))}
          </ul>
          {d.live && (
            <button type="button" className="xp-onward-btn" onClick={() => d.act('separate', {})}>
              Separate all of it into thoughts
            </button>
          )}
        </Section>
      ) : (
        s.dump && <p className="xp-dim">Everything you wrote is a thought here.</p>
      )}
    </div>
  );
}

// ── one thought, opened ──────────────────────────────────────────────

function ThoughtPanel({ d, t, onClose }: { d: D; t: Thought; onClose: () => void }) {
  const s = d.state;
  const [dep, setDep] = useState('');
  const waits = s.ties.filter((x) => x.to === t.id && x.kind === 'depends');
  const yes = (v: boolean | undefined) => (v === true ? 'yes' : v === false ? 'no' : '');
  return (
    <Inspector title={t.text} by={t.by} onClose={onClose}>
      <div className="xp-panel-grid">
        {d.live && (
          <label className="dsp-field is-wide">
            <span>In your words</span>
            <Edit value={t.text} label="The thought" onDone={(v) => v && v !== t.text && d.act('edit', { id: t.id, text: v, by: 'person' })} max={UNTANGLE_LIMITS.text} />
          </label>
        )}
        <label className="dsp-field">
          <span>Kind {t.catBy === 'socria' && <BasisMark by="socria" basis="inferred" />}</span>
          <select value={t.cat} disabled={!d.live} onChange={(e) => d.act('cat', { id: t.id, cat: e.target.value as Category, by: 'person' })}>
            {CATEGORIES.map((k) => (
              <option key={k} value={k}>
                {CATEGORY_WORD[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="dsp-field">
          <span>Group</span>
          <select value={t.cluster ?? ''} disabled={!d.live} onChange={(e) => d.act('place', { id: t.id, cluster: e.target.value })}>
            <option value="">Not in a group</option>
            {s.clusters.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <div className="dsp-field is-wide">
          <span>Where it stands</span>
          <Segmented label="Where it stands" options={STATUSES.map((st) => ({ id: st as Status, label: STATUS_WORD[st] }))} value={t.status} disabled={!d.live} onChange={(st) => d.act('status', { id: t.id, status: st })} />
        </div>
        <div className="dsp-field">
          <span>Urgent?</span>
          <Segmented label="Urgent?" options={[{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }, { id: '', label: '—' }]} value={yes(t.urgent)} disabled={!d.live} onChange={(v) => d.act('flag', { id: t.id, urgent: v })} />
        </div>
        <div className="dsp-field">
          <span>Important?</span>
          <Segmented label="Important?" options={[{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }, { id: '', label: '—' }]} value={yes(t.important)} disabled={!d.live} onChange={(v) => d.act('flag', { id: t.id, important: v })} />
        </div>
        <div className="dsp-field">
          <span>How big</span>
          <Segmented
            label="How big"
            options={[{ id: 'small', label: 'Small' }, { id: 'medium', label: 'Medium' }, { id: 'large', label: 'Large' }, { id: '', label: '—' }]}
            value={t.effort ?? ''}
            disabled={!d.live}
            onChange={(v) => d.act('flag', { id: t.id, effort: v })}
          />
        </div>
      </div>
      {t.cat !== 'commitment' && d.live && <p className="xp-dim">Only you make something a commitment — choose “Commitment” as its kind when you mean it.</p>}
      <div className="xp-waits">
        <span className="xp-dim">Waits on:</span>
        {waits.length ? (
          waits.map((w) => {
            const from = s.thoughts.find((x) => x.id === w.from);
            return (
              <span key={w.from} className={`xp-chip${w.confirmed ? '' : ' is-suggested'}`}>
                {from?.text}
                {!w.confirmed && ' (suggested)'}
                {d.live && (
                  <button type="button" className="dsp-x" aria-label={`No longer waits on ${from?.text}`} onClick={() => d.act('untie', { from: w.from, to: w.to })}>
                    ×
                  </button>
                )}
              </span>
            );
          })
        ) : (
          <span className="xp-dim">nothing</span>
        )}
        {d.live && (
          <span className="xp-pair">
            <select value={dep} onChange={(e) => setDep(e.target.value)} aria-label="It waits on">
              <option value="">add…</option>
              {s.thoughts
                .filter((x) => x.id !== t.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.text.slice(0, 60)}
                  </option>
                ))}
            </select>
            <button type="button" className="dsp-tool" disabled={!dep} onClick={() => d.act('tie', { from: dep, to: t.id, kind: 'depends', by: 'person' }) && setDep('')}>
              Add
            </button>
          </span>
        )}
      </div>
      {d.live && <Confirm label="Remove the thought" ask={`Remove “${t.text.slice(0, 40)}”? (It stays in what you wrote.)`} onConfirm={() => d.act('remove', { id: t.id })} />}
    </Inspector>
  );
}

// ── what Socria noticed, waiting for the person ──────────────────────

function Suggested({ d }: { d: D }) {
  const s = d.state;
  const pending = s.ties.filter((t) => !t.confirmed);
  if (!pending.length) return null;
  const text = (id: string) => s.thoughts.find((t) => t.id === id)?.text ?? id;
  return (
    <Section title="Connections Socria noticed" id="xp-noticed" aside="none counts until you confirm it">
      <ul className="xp-list">
        {pending.map((t) => (
          <li key={`${t.from}-${t.to}`}>
            <span className="xp-list-text">
              “{text(t.to)}” may need “{text(t.from)}” first
            </span>
            {d.live && (
              <>
                <button type="button" className="dsp-tool" onClick={() => d.act('confirmTie', { from: t.from, to: t.to })}>
                  Yes
                </button>
                <button type="button" className="dsp-tool" onClick={() => d.act('untie', { from: t.from, to: t.to })}>
                  No
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ── next steps ───────────────────────────────────────────────────────

function Next({ p, d }: { p: FigureProps; d: D }) {
  const s = d.state;
  const ns = nextSteps(s);
  return (
    <Section title="Next steps" id={`${p.obj.id}-next`} aside={ns.length ? 'in an order your connections allow' : undefined}>
      {ns.length ? (
        <ol className="xp-list">
          {ns.map(({ thought, blockedBy }) => (
            <li key={thought.id}>
              <span className="xp-list-text">
                {thought.text}
                {blockedBy.length > 0 && <span className="xp-dim"> — waits on {blockedBy.map((b) => `“${b.text}”`).join(', ')}</span>}
              </span>
              {d.live && (
                <button type="button" className="dsp-tool" onClick={() => d.act('status', { id: thought.id, status: 'done' })}>
                  Done
                </button>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="dsp-empty">None chosen. Open a thought and mark it “Next” — what is one thing you could do?</p>
      )}
      {d.live && p.onWorkspace && ns.length > 0 && (
        <button
          type="button"
          className="xp-onward-btn"
          onClick={() =>
            p.onWorkspace?.({
              type: 'make',
              kind: 'plan',
              state: {
                title: `Next: ${s.title}`.slice(0, 80),
                view: 'checklist',
                items: ns.map(({ thought }) => ({ id: thought.id, text: thought.text.slice(0, 120), by: thought.by, ...(thought.status === 'doing' ? { status: 'doing' } : {}) })),
                links: s.ties.filter((t) => t.kind === 'depends' && t.confirmed && ns.some((n) => n.thought.id === t.from) && ns.some((n) => n.thought.id === t.to)).map((t) => ({ from: t.from, to: t.to, by: 'person' })),
              },
              from: { obj: p.obj.id },
            })
          }
        >
          Make a plan from these
        </button>
      )}
      {d.live && p.onWorkspace && (
        <Problems p={p} d={d} />
      )}
    </Section>
  );
}

/** A problem or a question that is really a decision can become one — linked, not copied. */
function Problems({ p, d }: { p: FigureProps; d: D }) {
  const s = d.state;
  const open = s.thoughts.filter((t) => (t.cat === 'question' || t.cat === 'uncertainty' || t.cat === 'problem') && t.status !== 'done' && t.status !== 'dropped');
  const [pick, setPick] = useState('');
  if (!open.length) return null;
  const t = open.find((x) => x.id === pick);
  return (
    <div className="xp-pair xp-to-decision">
      <span className="xp-dim">Work one through as a decision:</span>
      <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="A question or problem to work through">
        <option value="">choose…</option>
        {open.map((x) => (
          <option key={x.id} value={x.id}>
            {x.text.slice(0, 70)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="dsp-tool"
        disabled={!t}
        onClick={() =>
          t &&
          p.onWorkspace?.({ type: 'make', kind: 'crossroads', state: { title: t.text.slice(0, 80), decision: t.text, decisionBy: t.by }, from: { obj: p.obj.id, part: t.id } })
        }
      >
        Open in Crossroads
      </button>
    </div>
  );
}
