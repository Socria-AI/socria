'use client';

// components/display/ArgumentFigure.tsx — an argument, drawn as the tree it is.
//
// The layout and every finding are the kind's (lib/objects/display-argument.ts):
// a tidy tree from the thesis, how each item bears on the one above it
// (supports, opposes, answers, asks, concludes), and the audit — claims with no
// evidence, counterarguments nobody has answered, open questions, evidence
// with no source, claims resting only on Socria's unchecked suggestions. This
// draws them in place, in words as well as marks, and turns what the person
// does into operations: add beneath the selected item, reword, move, give a
// source, resolve a question, remove.

import { useState } from 'react';
import {
  ARGUMENT_LIMITS,
  ARG_ROLES,
  PARENT_ROLES,
  ROLE_WORD,
  argumentLayout,
  audit,
  outline,
  type ArgItem,
  type ArgumentState,
  type Role,
} from '@/lib/objects/display-argument';
import type { FigureProps } from '@/components/objects/figures';
import { AddRow, DisplayShell, Edit, useDisplay, type Display } from './DisplayShell';
import { Confirm, Field, Group, Inspector, Tool, useSelection } from './primitives';
import { NodeLinks } from './NodeLinks';
import './argument.css';

type S = ArgumentState;
type D = Display<S>;
const BOX = { w: 178, h: 58, gapX: 22, gapY: 50 };

export function ArgumentFigure(p: FigureProps) {
  const d = useDisplay<S>(p);
  const s = d.state;
  const [sel, select] = useSelection(p);
  const a = audit(s);
  const picked = s.items.find((i) => i.id === sel) ?? null;
  const thesis = s.items.find((i) => i.role === 'thesis');
  const gaps = a.unsupported.length + a.unanswered.length + a.open.length + a.unsourced.length;
  return (
    <DisplayShell
      p={p}
      d={d}
      aside={`${s.items.length} item${s.items.length === 1 ? '' : 's'}${gaps ? ` · ${gaps} gap${gaps === 1 ? '' : 's'}` : ''}`}
      tools={!thesis ? <Tool label="State your thesis" onClick={() => select('__thesis')}>+ Thesis</Tool> : undefined}
    >
      {!s.items.length && <p className="dsp-empty">Nothing here yet — state your thesis, then the claims that hold it up.</p>}
      {s.view === 'map' ? <MapView d={d} sel={sel} select={select} /> : <OutlineView d={d} sel={sel} select={select} />}
      {sel === '__thesis' && d.live && !thesis && (
        <Inspector title="Your thesis" by="person" onClose={() => select(null)}>
          <AddRow label="Your thesis" placeholder="What you are arguing, in one sentence…" onAdd={(t) => d.act('add', { role: 'thesis', text: t, by: 'person' }) && (select(null), true)} />
        </Inspector>
      )}
      {picked && <ItemPanel d={d} it={picked} onClose={() => select(null)} />}
      <Audit d={d} select={select} />
    </DisplayShell>
  );
}

function flags(s: S, id: string): string[] {
  const a = audit(s);
  const out: string[] = [];
  if (a.unsupported.includes(id)) out.push('no evidence yet');
  if (a.suggestionOnly.includes(id)) out.push('rests on unchecked suggestions');
  if (a.unanswered.includes(id)) out.push('not answered yet');
  if (a.open.includes(id)) out.push('open');
  if (a.unsourced.includes(id)) out.push('no source');
  if (a.unattached.includes(id)) out.push('attached to nothing');
  return out;
}

function MapView({ d, sel, select }: { d: D; sel: string | null; select: (id: string | null) => void }) {
  const s = d.state;
  const lay = argumentLayout(s, BOX);
  const byId = new Map(s.items.map((i) => [i.id, i]));
  if (!lay.boxes.length) return null;
  return (
    <NodeLinks
      width={lay.width}
      height={lay.height}
      boxes={lay.boxes}
      label={`Argument map: ${s.title}`}
      lines={lay.links.map((l) => ({ from: l.from, to: l.to, label: l.relation, className: `is-${l.relation}`, dashed: l.relation === 'opposes' || l.relation === 'asks' }))}
      boxClass={(id) => {
        const it = byId.get(id);
        return `dsp-arg-box is-${it?.role ?? ''}${it?.by === 'socria' ? ' is-socria' : ''}${sel === id ? ' is-sel' : ''}${flags(s, id).length ? ' has-gap' : ''}`;
      }}
      renderBox={(b) => {
        const it = byId.get(b.id)!;
        const f = flags(s, it.id);
        return (
          <button type="button" className="dsp-arg-in" aria-pressed={sel === it.id} onClick={() => select(sel === it.id ? null : it.id)}>
            <span className="dsp-arg-role">
              {ROLE_WORD[it.role]}
              {it.by === 'socria' ? ' · suggested' : ''}
            </span>
            <span className="dsp-arg-text">{it.text}</span>
            {f.length > 0 && <span className="dsp-arg-flag">{f.join(' · ')}</span>}
          </button>
        );
      }}
    />
  );
}

function OutlineView({ d, sel, select }: { d: D; sel: string | null; select: (id: string | null) => void }) {
  const s = d.state;
  const byId = new Map(s.items.map((i) => [i.id, i]));
  return (
    <ol className="dsp-arg-outline">
      {outline(s).map((l) => {
        const it = byId.get(l.id)!;
        const f = flags(s, it.id);
        return (
          <li key={l.id} style={{ paddingLeft: `${l.depth * 18}px` }} className={`is-${it.role}`}>
            <button type="button" className={`dsp-arg-line${sel === it.id ? ' is-sel' : ''}`} aria-pressed={sel === it.id} onClick={() => select(sel === it.id ? null : it.id)}>
              <span className="dsp-arg-role">{ROLE_WORD[it.role]}</span> {it.text}
              {it.source && <span className="dsp-arg-src"> — {it.source}</span>}
              {it.by === 'socria' && <span className="dsp-arg-flag"> suggested by Socria</span>}
              {f.length > 0 && <span className="dsp-arg-flag"> · {f.join(' · ')}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ItemPanel({ d, it, onClose }: { d: D; it: ArgItem; onClose: () => void }) {
  const s = d.state;
  const childRoles = ARG_ROLES.filter((r) => PARENT_ROLES[r].includes(it.role));
  const [role, setRole] = useState<Role>(childRoles[0] ?? 'question');
  const parents = s.items.filter((x) => x.id !== it.id && PARENT_ROLES[it.role].includes(x.role));
  return (
    <Inspector title={ROLE_WORD[it.role]} by={it.by} onClose={onClose}>
      <div className="dsp-fields">
        <Field label="It says" wide>
          {d.live ? <Edit value={it.text} label="What it says" onDone={(v) => v && v !== it.text && d.act('text', { id: it.id, text: v })} max={ARGUMENT_LIMITS.text} /> : <span>{it.text}</span>}
        </Field>
        {it.role !== 'thesis' && (
          <Field label="Sits under">
            <select value={it.parent ?? ''} disabled={!d.live} onChange={(e) => e.target.value && d.act('parent', { id: it.id, parent: e.target.value })}>
              {!it.parent && <option value="">nothing</option>}
              {parents.map((x) => (
                <option key={x.id} value={x.id}>
                  {ROLE_WORD[x.role]}: {x.text.slice(0, 50)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {it.role === 'evidence' && (
          <Field label="Source">
            {d.live ? <Edit value={it.source ?? ''} label="Source" placeholder="where it comes from" onDone={(v) => (v || it.source) && d.act('source', { id: it.id, source: v })} max={ARGUMENT_LIMITS.source} /> : <span>{it.source ?? '—'}</span>}
          </Field>
        )}
        {it.role === 'question' && d.live && (
          <Group label="Question">
            <button type="button" className="dsp-tool" onClick={() => d.act('status', { id: it.id, status: it.status === 'resolved' ? 'open' : 'resolved' })}>
              {it.status === 'resolved' ? 'Reopen it' : 'Mark it resolved'}
            </button>
          </Group>
        )}
      </div>
      {it.by === 'socria' && it.role === 'evidence' && <p className="dsp-empty">Socria’s evidence is a suggestion to check — give it a source once you have.</p>}
      {d.live && childRoles.length > 0 && (
        <AddRow
          label={`Add beneath this ${ROLE_WORD[it.role].toLowerCase()}`}
          placeholder={`Add beneath it…`}
          onAdd={(t) => d.act('add', { role, text: t, parent: it.id, by: 'person' })}
          extra={
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="What it is">
              {childRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_WORD[r]}
                </option>
              ))}
            </select>
          }
        />
      )}
      {d.live && <Confirm label="Remove" ask={`Remove this ${ROLE_WORD[it.role].toLowerCase()}?`} onConfirm={() => (d.act('remove', { id: it.id }), onClose())} />}
    </Inspector>
  );
}

function Audit({ d, select }: { d: D; select: (id: string | null) => void }) {
  const s = d.state;
  const a = audit(s);
  const name = (id: string) => s.items.find((i) => i.id === id)?.text ?? id;
  const rows: [string, string[]][] = [
    ['Claims with no evidence yet', a.unsupported],
    ['Claims resting only on Socria’s unchecked suggestions', a.suggestionOnly],
    ['Counterarguments not answered', a.unanswered],
    ['Questions still open', a.open],
    ['Evidence with no source', a.unsourced],
    ['Attached to nothing', a.unattached],
  ];
  const any = rows.some(([, l]) => l.length);
  if (!s.items.length) return null;
  return (
    <details className="dsp-details dsp-arg-audit" open={any}>
      <summary>{any ? 'Where the argument is thin' : 'Every claim has evidence and every counterargument an answer'}</summary>
      {rows
        .filter(([, l]) => l.length)
        .map(([title, l]) => (
          <div key={title} className="dsp-arg-audit-row">
            <span className="dsp-sub">{title}</span>
            <ul>
              {l.map((id) => (
                <li key={id}>
                  <button type="button" className="dsp-link" onClick={() => select(id)}>
                    {name(id)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </details>
  );
}
