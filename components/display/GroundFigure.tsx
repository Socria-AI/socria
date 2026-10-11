'use client';

// components/display/GroundFigure.tsx — people who disagree, finding what they actually share.
//
// Each person joins in their own name and writes their own perspective; no
// one else can change it, and Socria never writes one. Whatever anyone adds
// is theirs; agreement is marked by each person for themselves, and an item
// reads as AGREED BY EVERYONE only when every person in the session marked it
// so (lib/objects/display-commonground.ts computes it from the marks, never
// from the words). Socria's suggestions are labelled and agreed by no one
// until people agree. What is written here is seen by everyone in it — and
// nothing from anyone's memories or other conversations is brought in.

import { useState } from 'react';
import {
  GROUND_LIMITS,
  ITEM_KINDS,
  ITEM_WORD,
  nameOf,
  sharedGround,
  standing,
  waitingOn,
  type GroundItem,
  type GroundState,
  type ItemKind,
} from '@/lib/objects/display-commonground';
import type { FigureProps } from '@/components/objects/figures';
import { AddRow, DisplayShell, Edit, useDisplay, type Display } from './DisplayShell';
import { Tool } from './primitives';
import { Area, AskStatus, BasisMark, Links, Section, useAsk } from './experience-ui';
import './experience.css';

type S = GroundState;
type D = Display<S>;
const OPEN_KINDS: ItemKind[] = ['disagreement', 'question', 'evidence', 'experiment', 'compromise'];

export function GroundFigure(p: FigureProps) {
  const d = useDisplay<S>(p);
  const s = d.state;
  const ask = useAsk(p);
  const me = p.me ?? null;
  const joined = !!me && s.participants.some((x) => x.id === me.id);
  const shared = sharedGround(s).length;
  return (
    <DisplayShell
      p={p}
      d={d}
      aside={`${s.participants.length} ${s.participants.length === 1 ? 'person' : 'people'} · ${shared} agreed by everyone`}
      tools={
        <Tool label="Ask Socria for possible common ground" onClick={() => ask.run('Socria is looking for possible common ground', { kind: 'commonground', action: 'suggest' })} disabled={!!ask.busy || (!s.perspectives.length && !s.items.length)}>
          Suggest
        </Tool>
      }
    >
      <AskStatus busy={ask.busy} said={ask.said} />
      <div className="xp-cg-q">
        <span className="xp-h">What you are working out</span>
        {d.live ? <Edit value={s.question} label="The question" placeholder="Say the question in your words" onDone={(v) => v && v !== s.question && d.act('question', { text: v, by: 'person' })} max={GROUND_LIMITS.text} /> : <p className="xp-quote">{s.question || '—'}</p>}
      </div>
      <p className="xp-shared">Everyone in this session sees what is written here. Nothing from anyone’s memories or other conversations is brought in — only what people write.</p>
      <People p={p} d={d} joined={joined} />
      {s.view === 'perspectives' && <Perspectives p={p} d={d} joined={joined} />}
      {s.view === 'ground' && <Ground d={d} me={joined ? me!.id : null} kinds={['goal', 'fact', 'value']} />}
      {s.view === 'open' && <Ground d={d} me={joined ? me!.id : null} kinds={OPEN_KINDS} />}
      <Links links={s.links} p={p} />
    </DisplayShell>
  );
}

function People({ p, d, joined }: { p: FigureProps; d: D; joined: boolean }) {
  const s = d.state;
  const me = p.me;
  return (
    <div className="xp-cg-people" aria-label="In this session">
      {s.participants.map((x) => (
        <span key={x.id} className={`xp-chip${me && x.id === me.id ? ' is-yours' : ''}`}>
          {x.name}
          {me && x.id === me.id ? ' (you)' : ''}
        </span>
      ))}
      {!s.participants.length && <span className="xp-dim">No one has joined yet.</span>}
      {d.live && me && !joined && s.participants.length < GROUND_LIMITS.participants && (
        <button type="button" className="xp-onward-btn is-primary" onClick={() => d.act('join', { as: me.id, name: me.name })}>
          Join as {me.name}
        </button>
      )}
      {d.live && me && joined && (
        <button type="button" className="dsp-tool" onClick={() => d.act('leave', { as: me.id })} title="What you wrote stays, under your name; your agreements are taken back">
          Leave
        </button>
      )}
      {!me && <span className="xp-dim">Open it beside the conversation to take part.</span>}
    </div>
  );
}

function Perspectives({ p, d, joined }: { p: FigureProps; d: D; joined: boolean }) {
  const s = d.state;
  const me = p.me;
  const authors = [...new Set([...s.participants.map((x) => x.id), ...s.perspectives.map((x) => x.author)])];
  return (
    <div className="xp-cg-persp">
      {authors.map((id) => {
        const pv = s.perspectives.find((x) => x.author === id);
        const mine = joined && me && id === me.id;
        return (
          <section key={id} className={`xp-persp${mine ? ' is-mine' : ''}`} aria-label={`${nameOf(s, id)}’s perspective`}>
            <h5 className="xp-persp-h">
              {nameOf(s, id)}
              {mine ? ' — yours' : ''}
            </h5>
            <span className="xp-dim">Where they stand</span>
            {mine && d.live ? <Area value={pv?.position ?? ''} label="Where you stand" placeholder="Where you stand, in your words" onDone={(v) => d.act('perspective', { as: id, position: v })} max={GROUND_LIMITS.long} /> : <p className="xp-quote">{pv?.position || 'Not written yet.'}</p>}
            <span className="xp-dim">What matters to them underneath it</span>
            {mine && d.live ? <Area value={pv?.why ?? ''} label="What matters to you underneath it" placeholder="What matters to you underneath it" onDone={(v) => d.act('perspective', { as: id, why: v })} max={GROUND_LIMITS.long} /> : <p className="xp-quote">{pv?.why || 'Not written yet.'}</p>}
          </section>
        );
      })}
      {!authors.length && <p className="dsp-empty">Join, then write where you stand — each person writes their own.</p>}
    </div>
  );
}

const STANDING_WORD = { shared: 'Agreed by everyone', open: 'Open', contested: 'Contested', resolved: 'Resolved by everyone' } as const;

function Ground({ d, me, kinds }: { d: D; me: string | null; kinds: ItemKind[] }) {
  const s = d.state;
  const [kind, setKind] = useState<ItemKind>(kinds[0]);
  const items = s.items.filter((it) => kinds.includes(it.kind));
  const groups = (['shared', 'resolved', 'open', 'contested'] as const).map((g) => ({ g, list: items.filter((it) => standing(s, it) === g) })).filter((x) => x.list.length);
  return (
    <div className="xp-cg-ground">
      {groups.map(({ g, list }) => (
        <Section key={g} title={STANDING_WORD[g]} id={`xp-cg-${g}`} aside={`${list.length}`}>
          <ul className="xp-list">
            {list.map((it) => (
              <Item key={it.id} d={d} it={it} me={me} />
            ))}
          </ul>
        </Section>
      ))}
      {!items.length && <p className="dsp-empty">{kinds.includes('goal') ? 'Nothing here yet — add a goal you think you share, or a fact you would both accept.' : 'No disagreements, questions or things to try yet.'}</p>}
      {d.live && me && (
        <AddRow
          label="Add"
          placeholder="Add, in your words…"
          onAdd={(t) => d.act('add', { kind, text: t, as: me, by: 'person' })}
          extra={
            <select value={kind} onChange={(e) => setKind(e.target.value as ItemKind)} aria-label="What it is">
              {ITEM_KINDS.filter((k) => kinds.includes(k)).map((k) => (
                <option key={k} value={k}>
                  {ITEM_WORD[k]}
                </option>
              ))}
            </select>
          }
        />
      )}
    </div>
  );
}

function Item({ d, it, me }: { d: D; it: GroundItem; me: string | null }) {
  const s = d.state;
  const mineMark = me ? (it.agreed.includes(me) ? 'agree' : it.disputed.includes(me) ? 'dispute' : '') : '';
  const resolvedForMe = !!me && it.resolved.includes(me);
  const waiting = waitingOn(s, it);
  const canEdit = d.live && me && ((it.by === 'person' && it.author === me) || it.by === 'socria');
  return (
    <li className={`xp-cg-item is-${standing(s, it)}`}>
      <span className="xp-cg-kind">{ITEM_WORD[it.kind]}</span>
      <span className="xp-list-text">
        {canEdit ? <Edit value={it.text} label={`Reword: ${it.text}`} onDone={(v) => v && v !== it.text && d.act('edit', { id: it.id, text: v, as: me!, by: 'person' })} max={GROUND_LIMITS.text} /> : it.text}
        {it.by === 'socria' ? <BasisMark by="socria" /> : <span className="xp-dim"> — {nameOf(s, it.author)}</span>}
      </span>
      <span className="xp-cg-marks">
        {it.kind === 'disagreement' ? (
          <>
            <span className="xp-dim">{it.resolved.length ? `resolved for ${it.resolved.map((x) => nameOf(s, x)).join(', ')}` : 'resolved for no one yet'}</span>
            {d.live && me && (
              <button type="button" className={`dsp-tool${resolvedForMe ? ' is-on' : ''}`} aria-pressed={resolvedForMe} onClick={() => d.act('resolve', { id: it.id, as: me, ok: resolvedForMe ? 'no' : 'yes' })}>
                Resolved for me
              </button>
            )}
          </>
        ) : (
          <>
            <span className="xp-dim">
              {it.agreed.length ? `agreed: ${it.agreed.map((x) => nameOf(s, x)).join(', ')}` : 'agreed by no one yet'}
              {it.disputed.length ? ` · disputed: ${it.disputed.map((x) => nameOf(s, x)).join(', ')}` : ''}
              {waiting.length && s.participants.length > 1 ? ` · waiting on ${waiting.map((x) => x.name).join(', ')}` : ''}
            </span>
            {d.live && me && (
              <span className="dsp-seg" role="radiogroup" aria-label={`Where you stand on: ${it.text}`}>
                {(['agree', 'dispute'] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={mineMark === m} className={mineMark === m ? 'is-on' : ''} onClick={() => d.act('mark', { id: it.id, as: me, ok: mineMark === m ? '' : m })}>
                    {m === 'agree' ? 'Agree' : 'Dispute'}
                  </button>
                ))}
              </span>
            )}
          </>
        )}
        {d.live && me && (it.by === 'socria' || it.author === me) && (
          <button type="button" className="dsp-x" aria-label={`Remove: ${it.text}`} onClick={() => d.act('remove', { id: it.id, as: me })}>
            ×
          </button>
        )}
      </span>
    </li>
  );
}
