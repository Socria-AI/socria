'use client';

// components/logos5/MapInspector.tsx — WHAT A CARD IS, AND CHANGING IT (Logos 5).
//
// The Logic Map draws almost anything now, and a drawing carries more than a
// label: what a part says when it is opened, when it comes, the region it
// sits in, and the words along its lines (lib/logos.ts). A pressed card shows
// them here, at the top of its menu — whose it is (drawn by Socria, or
// theirs), what kind of thing, and the detail — and "Edit" changes any of it
// by hand, deterministically, through the same edits the conversation uses
// (lib/map-edit.ts). Nothing here asks a model.

import { useMemo, useState } from 'react';
import type { LogosNode, LogosNodeType, LogosRelation, ThinkingMap } from '@/lib/logos';
import { DRAWING_LIMITS, MAP_LABEL_MAX, NODE_TYPES, RELATIONS } from '@/lib/logos';
import { RELATION_LABEL } from '@/lib/logos-layout';
import type { MapEdit } from '@/lib/map-edit';

/** The kinds a drawing's parts are, offered first when a drawn part is retyped. */
const DRAWING_KINDS: readonly LogosNodeType[] = ['entity', 'process', 'event', 'state', 'actor', 'component', 'category', 'quantity', 'concept', 'step'];

/** A kind of card, in words: "a component", "an event". */
export function kindWord(type: string): string {
  const w = type.replace(/_/g, ' ');
  return `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;
}

/** What the card says about itself in one line: "Drawn by Socria · a process · 2 · in Cytoplasm". */
export function aboutLine(node: Pick<LogosNode, 'origin' | 'type' | 'at' | 'group'>): string {
  const whose = node.origin === 'drawn' ? 'Drawn by Socria' : node.origin === 'socria' ? 'Suggested by Socria' : node.origin === 'source' ? 'From your material' : node.origin === 'computed' ? 'Computed' : 'Yours';
  return [whose, kindWord(node.type), node.at, node.group ? `in ${node.group}` : null].filter(Boolean).join(' · ');
}

/**
 * The kinds a card may be changed to. A drawn part is offered a drawing's kinds
 * first. A mathematical map reads "process" as a concept and "quantity" as a
 * given on the person's own cards (lib/logos.ts MATH_READS), so those two are
 * not offered there: a kind that would not survive a save is not a choice.
 */
export function inspectorKinds(drawn: boolean, context?: string): readonly LogosNodeType[] {
  if (drawn) return [...DRAWING_KINDS, ...NODE_TYPES.filter((k) => !DRAWING_KINDS.includes(k))];
  return context === 'math' ? NODE_TYPES.filter((k) => k !== 'process' && k !== 'quantity') : NODE_TYPES;
}

/**
 * The edits that turn `node` (and its lines) into what the form holds — only
 * what changed, in the order a reader would say them. Pure, for the suite.
 */
export function inspectorEdits(
  node: LogosNode,
  lines: readonly { from: string; to: string; label?: string; relation: LogosRelation }[],
  form: { label: string; type: LogosNodeType; detail: string; at: string; group: string; lines: readonly { from: string; to: string; label: string; relation: LogosRelation }[] }
): MapEdit[] {
  const out: MapEdit[] = [];
  const t = (s: string) => s.replace(/\s+/g, ' ').trim();
  if (t(form.label) && t(form.label) !== node.label) out.push({ op: 'rename', id: node.id, label: t(form.label) });
  if (form.type !== node.type) out.push({ op: 'retype', id: node.id, type: form.type });
  if (t(form.detail) !== (node.detail ?? '')) out.push({ op: 'detail', id: node.id, detail: t(form.detail) });
  if (t(form.at) !== (node.at ?? '')) out.push({ op: 'at', id: node.id, at: t(form.at) });
  if (t(form.group) !== (node.group ?? '')) out.push({ op: 'group', id: node.id, group: t(form.group) });
  // each line of the form is the line at the same place in `lines` — two lines between the same cards are two rows
  form.lines.forEach((f, i) => {
    const was = lines[i];
    if (!was || was.from !== f.from || was.to !== f.to) return;
    const label = t(f.label);
    const labelChanged = label !== (was.label ?? '');
    const relationChanged = f.relation !== was.relation;
    if (labelChanged || relationChanged) out.push({ op: 'edge', from: f.from, to: f.to, was: was.relation, ...(labelChanged ? { label } : {}), ...(relationChanged ? { relation: f.relation } : {}) });
  });
  return out;
}

export function MapInspector({ node, map, onEdits }: { node: LogosNode; map: Pick<ThinkingMap, 'nodes' | 'edges' | 'context'>; onEdits?: (edits: MapEdit[]) => void }) {
  const [editing, setEditing] = useState(false);
  const lines = useMemo(() => map.edges.filter((e) => e.from === node.id || e.to === node.id).slice(0, 8), [map.edges, node.id]);
  const name = (id: string) => map.nodes.find((n) => n.id === id)?.label ?? id;
  const drawn = node.origin === 'drawn';
  const [form, setForm] = useState(() => ({
    label: node.label,
    type: node.type,
    detail: node.detail ?? '',
    at: node.at ?? '',
    group: node.group ?? '',
    lines: lines.map((l) => ({ from: l.from, to: l.to, label: l.label ?? '', relation: l.relation })),
  }));
  const kinds = inspectorKinds(drawn, map.context);

  if (!editing) {
    return (
      <div className="lg-insp" role="group" aria-label={`About ${node.label}`}>
        <p className="lg-insp-k">{aboutLine(node)}</p>
        {node.detail && <p className="lg-insp-d">{node.detail}</p>}
        {drawn && lines.length > 0 && (
          <ul className="lg-insp-lines">
            {lines.map((l) => {
              const out = l.from === node.id;
              return (
                <li key={`${l.from}>${l.to}>${l.relation}`}>
                  <span className="lg-insp-arrow" aria-hidden="true">{out ? '→' : '←'}</span>
                  <span className="lg-insp-other">{name(out ? l.to : l.from)}</span>
                  {(l.label || l.when) && <span className="lg-insp-says">{l.label ?? l.when}</span>}
                </li>
              );
            })}
          </ul>
        )}
        {onEdits && (
          <button type="button" className="lg-insp-edit" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
    );
  }

  const save = () => {
    const edits = inspectorEdits(node, lines, form);
    if (edits.length) onEdits?.(edits);
    setEditing(false);
  };
  const field = (k: 'detail' | 'at' | 'group') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form
      className="lg-insp is-editing"
      aria-label={`Edit ${node.label}`}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="lg-insp-f">
        <span>Name</span>
        <input value={form.label} maxLength={MAP_LABEL_MAX} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} autoFocus />
      </label>
      <label className="lg-insp-f">
        <span>Kind</span>
        <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as LogosNodeType }))}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </label>
      <label className="lg-insp-f">
        <span>Says when opened</span>
        <textarea value={form.detail} maxLength={DRAWING_LIMITS.detail} rows={3} onChange={field('detail')} />
      </label>
      {(drawn || node.at || node.group) && (
        <div className="lg-insp-row">
          <label className="lg-insp-f">
            <span>When</span>
            <input value={form.at} maxLength={DRAWING_LIMITS.at} placeholder="1789, Stage 2" onChange={field('at')} />
          </label>
          <label className="lg-insp-f">
            <span>Region</span>
            <input value={form.group} maxLength={DRAWING_LIMITS.group} placeholder="Nucleus" onChange={field('group')} />
          </label>
        </div>
      )}
      {form.lines.length > 0 && (
        <fieldset className="lg-insp-lines-edit">
          <legend>Its lines</legend>
          {form.lines.map((l, i) => {
            const out = l.from === node.id;
            return (
              <div key={`${l.from}>${l.to}>${i}`} className="lg-insp-line">
                <span className="lg-insp-other">
                  {out ? '→' : '←'} {name(out ? l.to : l.from)}
                </span>
                <input
                  aria-label={`What the line ${out ? 'to' : 'from'} ${name(out ? l.to : l.from)} says`}
                  value={l.label}
                  maxLength={DRAWING_LIMITS.edgeLabel}
                  placeholder="what it says"
                  onChange={(e) => setForm((f) => ({ ...f, lines: f.lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))}
                />
                <select
                  aria-label="What kind of line"
                  value={l.relation}
                  onChange={(e) => setForm((f) => ({ ...f, lines: f.lines.map((x, j) => (j === i ? { ...x, relation: e.target.value as LogosRelation } : x)) }))}
                >
                  {RELATIONS.map((r) => (
                    <option key={r} value={r}>
                      {RELATION_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </fieldset>
      )}
      <div className="lg-insp-acts">
        <button type="submit" className="lg-insp-save">
          Save
        </button>
        <button type="button" className="lg-insp-cancel" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
