'use client';

// components/ux-v0/boards/BoardPanels.tsx — the board's panels: its materials and their status, its design system
// (tokens changed here are proposed, then synced: see sync.ts), what can be added, its checks, its versions, and the
// inspector for what is selected (a material's real size against its size on the board, its local overrides and a
// reset, its editor; a note's words and whether they still hold; the board's ground and arrangement).

import { useEffect, useState } from 'react';
import { FONTS, knownFont, nearestWeight } from '@/lib/ux-v0/fonts';
import { formatOf, sizeLabel } from '@/lib/ux-v0/graphics/formats';
import { ARRANGEMENTS, MAX_BOARD_VERSIONS, MOCKUP_LABEL, MOCKUPS, type Arrangement, type BoardNode, type BoardState, type GraphicMaterial, type Material, type MockupTemplate } from '@/lib/ux-v0/boards/model';
import { COLOUR_TOKENS, overridesOf, TOKEN_LABEL, type MasterDesignSystem, type Override } from '@/lib/ux-v0/boards/system';
import { onAccent, reviseSystem } from '@/lib/ux-v0/boards/edit';
import type { BoardEvaluation } from '@/lib/ux-v0/boards/evaluate';
import type { DesignProject } from '@/lib/ux-v0/types';

const STATUS_WORD: Record<Material['status'], string> = { planned: 'Planned', generating: 'Generating', rendering: 'Rendering', ready: 'Ready', failed: 'Failed' };
const ARRANGEMENT_LABEL: Record<Arrangement, string> = { editorial: 'Campaign overview', sections: 'Sections', grid: 'Grid', rows: 'Two rows', sequence: 'One sequence' };
const KIND_ADD: [string, string, string?][] = [
  ['poster', 'Poster'],
  ['social', 'Instagram post'],
  ['social', 'Story', 'story'],
  ['banner', 'Web banner'],
  ['ad', 'Advertisement'],
  ['card', 'Business card'],
  ['label', 'Product label'],
  ['announcement', 'Announcement'],
];

export const typeLine = (m: Material) => (m.type === 'graphic' ? formatOf(m.brief.formats[0])?.label ?? 'Graphic' : m.type === 'website' ? (m.view === 'mobile' ? 'Website, phone' : 'Website') : `Mockup: ${MOCKUP_LABEL[m.template]}`);

// ── materials ──

export function MaterialsPanel(p: { board: BoardState; selected: ReadonlySet<string>; onFocus: (materialId: string) => void; onRetry: (id: string) => void; onKeep: (id: string) => void; generating: boolean; onGenerateRest: () => void }) {
  const counts = p.board.materials.reduce<Record<string, number>>((c, m) => ((c[m.status] = (c[m.status] ?? 0) + 1), c), {});
  const waiting = p.board.materials.filter((m) => m.status === 'planned' || m.status === 'failed').length;
  return (
    <section className="gx-panel bd-panel" aria-label="Materials">
      <p className="gx-panel-h">Materials</p>
      <p className="v0-quiet bd-counts" role="status">
        {(['ready', 'generating', 'rendering', 'planned', 'failed'] as const)
          .filter((s) => counts[s])
          .map((s) => `${counts[s]} ${STATUS_WORD[s].toLowerCase()}`)
          .join(' · ') || 'None yet.'}
      </p>
      <ol className="bd-mats">
        {p.board.materials.map((m) => (
          <li key={m.id} className={`bd-mat st-${m.status}${p.selected.has(m.id) ? ' is-on' : ''}`}>
            <button type="button" className="bd-mat-main" onClick={() => p.onFocus(m.id)}>
              <span className={`bd-chip st-${m.status}`}>{STATUS_WORD[m.status]}</span>
              <b>{m.name}</b>
              <em className="v0-quiet">{typeLine(m)}</em>
            </button>
            {m.status === 'failed' && (
              <span className="bd-mat-acts">
                {m.error && <span className="bd-mat-err">{m.error}</span>}
                <button type="button" className="sb-link is-meta" onClick={() => p.onRetry(m.id)}>
                  Retry this one
                </button>
                {m.type === 'graphic' && m.doc && (
                  <button type="button" className="sb-link is-meta" onClick={() => p.onKeep(m.id)}>
                    Keep it as it is
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ol>
      {!p.generating && waiting > 0 && (
        <button type="button" className="sb-btn is-sm is-primary" onClick={p.onGenerateRest}>
          Generate the {waiting} not ready
        </button>
      )}
      <p className="v0-quiet">A material that fails leaves the others as they are: retry it on its own.</p>
    </section>
  );
}

// ── the design system ──

export function SystemPanel(p: { board: BoardState; onPropose: (next: MasterDesignSystem, label: string) => void; source?: string }) {
  const sys = p.board.system;
  const [draft, setDraft] = useState(sys);
  useEffect(() => setDraft(sys), [sys]);
  if (!sys || !draft) return <p className="v0-quiet">No design system yet.</p>;
  const c = draft.tokens.colors;
  const changed = JSON.stringify(draft.tokens) !== JSON.stringify(sys.tokens) || draft.weights.display !== sys.weights.display || draft.type.case !== sys.type.case;
  const display = knownFont(draft.tokens.fonts.display);
  const weights = display?.variable ? [300, 400, 500, 600, 700, 800, 900].filter((w) => w >= display.weights[0] && w <= display.weights[1]) : display?.weights ?? [400, 700];
  const set = (fn: (s: MasterDesignSystem) => void) => setDraft(reviseSystem(draft, fn));
  return (
    <section className="gx-panel bd-panel" aria-label="The design system">
      <p className="gx-panel-h">{sys.name}</p>
      <p className="v0-quiet">
        {sys.direction.name} · {sys.direction.language.replace(/-/g, ' ')}
        {p.source ? ` · from the website “${p.source}”` : ''}
      </p>
      <p className="gx-panel-sub">Colours</p>
      <div className="bd-tokens">
        {COLOUR_TOKENS.filter((k) => k !== 'accent2' || !!draft.tokens.accent2).map((k) => {
          const value = k === 'accent2' ? draft.tokens.accent2 ?? '#000000' : ((c[k as keyof typeof c] as string | undefined) ?? '#000000');
          return (
            <label key={k} className="bd-token">
              <input
                type="color"
                value={value}
                aria-label={`${TOKEN_LABEL[k]} colour`}
                onChange={(e) =>
                  set((s) => {
                    if (k === 'accent2') s.tokens.accent2 = e.target.value;
                    else (s.tokens.colors as Record<string, string>)[k] = e.target.value;
                    if (k === 'accent') s.tokens.colors.accentText = onAccent(e.target.value);
                  })
                }
              />
              <span>
                {TOKEN_LABEL[k]}
                <em className="v0-quiet">{value.toUpperCase()}</em>
              </span>
            </label>
          );
        })}
      </div>
      <p className="gx-panel-sub">Typography</p>
      <label className="gx-field">
        <span>Headlines</span>
        <select
          className="v0-select"
          value={draft.tokens.fonts.display}
          onChange={(e) =>
            set((s) => {
              s.tokens.fonts.display = e.target.value;
              s.weights.display = nearestWeight(e.target.value, s.weights.display);
            })
          }
        >
          {FONTS.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="gx-field">
        <span>Weight</span>
        <select className="v0-select" value={draft.weights.display} onChange={(e) => set((s) => void (s.weights.display = Number(e.target.value)))}>
          {weights.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </label>
      <label className="gx-field">
        <span>Text</span>
        <select className="v0-select" value={draft.tokens.fonts.body} onChange={(e) => set((s) => void (s.tokens.fonts.body = e.target.value))}>
          {FONTS.filter((f) => !f.displayOnly).map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="gx-check">
        <input type="checkbox" checked={draft.type.case === 'upper'} onChange={(e) => set((s) => void (s.type.case = e.target.checked ? 'upper' : 'sentence'))} /> Headlines in capitals
      </label>
      <div className="bd-row">
        <button type="button" className="sb-btn is-sm is-primary" disabled={!changed} onClick={() => p.onPropose(draft, 'the design system changed by hand')}>
          Preview the change
        </button>
        <button type="button" className="sb-btn is-sm" disabled={!changed} onClick={() => setDraft(sys)}>
          Put it back
        </button>
      </div>
      <p className="v0-quiet">A change is shown first: which materials it reaches, and what each keeps (your local changes are never overwritten without your say). Nothing is composed again.</p>
      {sys.constraints.length > 0 && (
        <details className="gx-why">
          <summary>The system’s rules</summary>
          <ul>
            {sys.constraints.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// ── adding ──

export function AddPanel(p: { board: BoardState; onAddMaterial: (kind: string, format?: string) => void; onAddWebsite: () => void; onAddMockup: (template: MockupTemplate) => void; onAddNote: () => void; onAddHeading: () => void; onAddPicture: (f: File) => void; disabled?: boolean }) {
  return (
    <section className="gx-panel bd-panel" aria-label="Add">
      <p className="gx-panel-h">A new material, in this system</p>
      <div className="bd-adds">
        {KIND_ADD.map(([kind, label, format]) => (
          <button key={label} type="button" className="sb-btn is-sm" disabled={p.disabled} onClick={() => p.onAddMaterial(kind, format)}>
            {label}
          </button>
        ))}
        <button type="button" className="sb-btn is-sm" disabled={p.disabled || p.board.materials.some((m) => m.type === 'website')} onClick={p.onAddWebsite}>
          Website
        </button>
      </div>
      <p className="gx-panel-sub">A mockup of a graphic on the board</p>
      <div className="bd-adds">
        {MOCKUPS.map((t) => (
          <button key={t} type="button" className="sb-btn is-sm" disabled={p.disabled || !p.board.materials.some((m) => m.type === 'graphic')} onClick={() => p.onAddMockup(t)}>
            {MOCKUP_LABEL[t]}
          </button>
        ))}
      </div>
      <p className="gx-panel-sub">On the board</p>
      <div className="bd-adds">
        <button type="button" className="sb-btn is-sm" onClick={p.onAddNote}>
          A note
        </button>
        <button type="button" className="sb-btn is-sm" onClick={p.onAddHeading}>
          A heading
        </button>
        <label className="sb-btn is-sm gx-file">
          A reference picture
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => (e.target.files?.[0] && p.onAddPicture(e.target.files[0]), (e.target.value = ''))} />
        </label>
      </div>
    </section>
  );
}

// ── checks ──

export function ChecksPanel(p: { evaluation: BoardEvaluation | null; onRefine: () => void; refining: boolean }) {
  const e = p.evaluation;
  if (!e) return <p className="v0-quiet">Checks run once materials are ready.</p>;
  return (
    <section className="gx-panel bd-panel" aria-label="Checks">
      <p className="gx-panel-h">
        The board · <span className="bd-score">{e.score}</span>
      </p>
      <ul className="bd-dims">
        {e.dims.map((d) => (
          <li key={d.key} className={d.score >= 1 ? 'is-ok' : d.score >= 0.7 ? 'is-mid' : 'is-low'}>
            <span>{d.label}</span>
            <b>{Math.round(d.score * 100)}</b>
          </li>
        ))}
      </ul>
      {e.findings.length ? (
        <ul className="bd-findings">
          {e.findings.slice(0, 14).map((f, i) => (
            <li key={i} className={`is-${f.severity}`}>
              {f.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="v0-quiet">Nothing to look at: coherent, each material its own composition, the notes true.</p>
      )}
      <button type="button" className="sb-btn is-sm" disabled={p.refining || !e.findings.some((f) => !!f.fix)} onClick={p.onRefine}>
        Fix what can be fixed
      </button>
      <p className="v0-quiet">At most two rounds; what cannot be fixed without taking something away is left for you, and said.</p>
    </section>
  );
}

// ── versions ──

export function VersionsPanel(p: { board: BoardState; onKeep: () => void; onRestore: (i: number) => void }) {
  return (
    <section className="gx-panel bd-panel" aria-label="Versions">
      <p className="gx-panel-h">Versions</p>
      <button type="button" className="sb-btn is-sm" onClick={p.onKeep}>
        Keep this as a version
      </button>
      <ol className="gx-versions" reversed>
        {p.board.versions
          .map((v, i) => ({ v, i }))
          .reverse()
          .map(({ v, i }) => (
            <li key={`${v.at}-${i}`}>
              <span>
                <b>{v.label}</b>
                <em className="v0-quiet">
                  {new Date(v.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {v.state.materials.length} material{v.state.materials.length === 1 ? '' : 's'}
                </em>
              </span>
              <button type="button" className="sb-link is-meta" onClick={() => p.onRestore(i)}>
                Restore
              </button>
            </li>
          ))}
      </ol>
      <p className="v0-quiet">The last {MAX_BOARD_VERSIONS} are kept with the board; a change to the design system keeps the board as it was first. Every change can also be undone (⌘Z / Ctrl+Z).</p>
    </section>
  );
}

// ── the inspector ──

export interface InspectorActions {
  onOps: (ops: import('@/lib/ux-v0/boards/model').BoardOp[], label: string) => void;
  onEditMaterial: (id: string) => void;
  onOpenWebsite: (projectId: string) => void;
  onRegenerate: (ids: string[]) => void;
  onResetOverrides: (materialId: string, nodes: string[] | 'all') => void;
  onEditNote: (nodeId: string) => void;
  onAnnotate: () => void;
  onArrange: (how: Arrangement) => void;
  onExportMaterial: (id: string) => void;
}

export function BoardInspector(p: { board: BoardState; selection: readonly string[]; websites: ReadonlyMap<string, DesignProject>; stale: ReadonlyMap<string, string[]> } & InspectorActions) {
  const b = p.board;
  const nodes = p.selection.map((id) => b.nodes.find((n) => n.id === id)).filter((n): n is BoardNode => !!n);
  if (!nodes.length) {
    return (
      <section className="gx-panel bd-panel" aria-label="The board">
        <p className="gx-panel-h">The board</p>
        <label className="gx-field">
          <span>Ground</span>
          <input type="color" value={b.background.color} onChange={(e) => p.onOps([{ op: 'background', color: e.target.value }], 'the board’s ground changed')} aria-label="The board’s ground colour" />
        </label>
        <label className="gx-field">
          <span>Pattern</span>
          <select className="v0-select" value={b.background.pattern} onChange={(e) => p.onOps([{ op: 'background', pattern: e.target.value as 'dots' | 'grid' | 'none' }], 'the board’s pattern changed')}>
            <option value="dots">Dots</option>
            <option value="grid">Grid</option>
            <option value="none">None</option>
          </select>
        </label>
        <p className="gx-panel-sub">Arrangement</p>
        <div className="bd-adds">
          {ARRANGEMENTS.map((a) => (
            <button key={a} type="button" className={`sb-btn is-sm${b.arrangement === a ? ' is-primary' : ''}`} onClick={() => p.onArrange(a)}>
              {ARRANGEMENT_LABEL[a]}
            </button>
          ))}
        </div>
        <p className="gx-panel-sub">Notes</p>
        <label className="gx-check">
          <input type="checkbox" checked={b.annotations} onChange={(e) => p.onOps([{ op: 'annotations', visible: e.target.checked }], e.target.checked ? 'notes shown' : 'notes hidden')} /> Show the notes
        </label>
        <button type="button" className="sb-btn is-sm" onClick={p.onAnnotate}>
          Write the notes again from the facts
        </button>
        <p className="v0-quiet">Arranging moves materials on the board only: their own sizes and designs stay exactly as they are.</p>
      </section>
    );
  }
  if (nodes.length > 1) {
    const grouped = nodes.some((n) => n.group);
    const locked = nodes.every((n) => n.locked);
    return (
      <section className="gx-panel bd-panel" aria-label="Selection">
        <p className="gx-panel-h">{nodes.length} things selected</p>
        <div className="bd-adds">
          <button type="button" className="sb-btn is-sm" onClick={() => p.onOps([{ op: grouped ? 'ungroup' : 'group', ids: nodes.map((n) => n.id) }], grouped ? 'ungrouped' : 'grouped')}>
            {grouped ? 'Ungroup' : 'Group'}
          </button>
          <button type="button" className="sb-btn is-sm" onClick={() => p.onOps(nodes.map((n) => ({ op: 'node-update', id: n.id, set: { locked: !locked } })), locked ? 'unlocked' : 'locked')}>
            {locked ? 'Unlock' : 'Lock'}
          </button>
        </div>
        {nodes.length === 2 &&
          ((link) =>
            link ? (
              <button type="button" className="sb-btn is-sm" onClick={() => p.onOps([{ op: 'disconnect', id: link.id }], 'arrow removed')}>
                Remove the arrow between them
              </button>
            ) : (
              <button type="button" className="sb-btn is-sm" onClick={() => p.onOps([{ op: 'connect', from: nodes[0].id, to: nodes[1].id }], 'arrow drawn')}>
                Draw an arrow from the first to the second
              </button>
            ))(b.connectors.find((c) => (c.from === nodes[0].id && c.to === nodes[1].id) || (c.from === nodes[1].id && c.to === nodes[0].id)))}
        {nodes.some((n) => n.type === 'material') && (
          <button type="button" className="sb-btn is-sm" onClick={() => p.onRegenerate(nodes.filter((n) => n.type === 'material').map((n) => (n as Extract<BoardNode, { type: 'material' }>).material))}>
            Regenerate these materials
          </button>
        )}
      </section>
    );
  }
  const n = nodes[0];
  const lockBtn = (
    <button type="button" className="sb-link is-meta" onClick={() => p.onOps([{ op: 'node-update', id: n.id, set: { locked: !n.locked } }], n.locked ? 'unlocked' : 'locked')}>
      {n.locked ? 'Unlock it' : 'Lock it (kept exactly as it is)'}
    </button>
  );
  if (n.type === 'material') {
    const m = b.materials.find((x) => x.id === n.material);
    if (!m) return null;
    return <MaterialInspector {...p} board={b} node={n} material={m} lockBtn={lockBtn} />;
  }
  if (n.type === 'note') {
    const why = p.stale.get(n.id);
    return (
      <section className="gx-panel bd-panel" aria-label="Note">
        <p className="gx-panel-h">{n.generated ? 'A note written from the facts' : 'Your note'}</p>
        <p className="bd-note-copy">{n.text}</p>
        {why && <p className="bd-warn">No longer true: {why.join('; ')}. Write the notes again, or change the words.</p>}
        {n.generated && !why && <p className="v0-quiet">It states what is true of the material now: its faces, its composition, its ground. Changed by you, it becomes your note.</p>}
        <div className="bd-adds">
          <button type="button" className="sb-btn is-sm" onClick={() => p.onEditNote(n.id)}>
            Change the words
          </button>
          <button type="button" className="sb-btn is-sm" onClick={() => p.onOps([{ op: 'node-remove', ids: [n.id] }], 'note removed')}>
            Remove
          </button>
        </div>
        {lockBtn}
      </section>
    );
  }
  if (n.type === 'heading') {
    return (
      <section className="gx-panel bd-panel" aria-label="Heading">
        <p className="gx-panel-h">Heading</p>
        <p className="bd-note-copy">{n.text}</p>
        <div className="bd-adds">
          <button type="button" className="sb-btn is-sm" onClick={() => p.onEditNote(n.id)}>
            Change the words
          </button>
          <button type="button" className="sb-btn is-sm" onClick={() => p.onOps([{ op: 'node-update', id: n.id, set: { level: n.level === 1 ? 2 : 1 } }], 'heading level changed')}>
            {n.level === 1 ? 'Make it a section heading' : 'Make it the title'}
          </button>
          <button type="button" className="sb-btn is-sm" onClick={() => p.onOps([{ op: 'node-remove', ids: [n.id] }], 'heading removed')}>
            Remove
          </button>
        </div>
        {lockBtn}
      </section>
    );
  }
  if (n.type === 'system') {
    return (
      <section className="gx-panel bd-panel" aria-label="The design system">
        <p className="gx-panel-h">The design system</p>
        <p className="v0-quiet">Its palette, faces and shapes, drawn from the system every material shares. Change it in the System panel.</p>
        {lockBtn}
      </section>
    );
  }
  return (
    <section className="gx-panel bd-panel" aria-label="Picture">
      <p className="gx-panel-h">A reference picture</p>
      <button type="button" className="sb-btn is-sm" onClick={() => p.onOps([{ op: 'node-remove', ids: [n.id] }], 'picture removed')}>
        Remove
      </button>
      {lockBtn}
    </section>
  );
}

function MaterialInspector(p: { board: BoardState; node: Extract<BoardNode, { type: 'material' }>; material: Material; websites: ReadonlyMap<string, DesignProject>; lockBtn: React.ReactNode } & InspectorActions) {
  const { board: b, node: n, material: m } = p;
  const real = m.type === 'graphic' && m.doc ? sizeLabel(m.doc.artboards[0]) : null;
  const overrides: Override[] = m.type === 'graphic' && m.doc && b.system ? overridesOf(m.doc, m.bindings, b.system) : [];
  const site = m.type === 'website' ? p.websites.get(m.projectId) : undefined;
  const graphics = b.materials.filter((x): x is GraphicMaterial => x.type === 'graphic');
  return (
    <section className="gx-panel bd-panel" aria-label={m.name}>
      <p className="gx-panel-h">{m.name}</p>
      <p className="v0-quiet">
        {typeLine(m)} · {STATUS_WORD[m.status]}
      </p>
      {m.purpose && <p className="bd-purpose">{m.purpose}</p>}
      {m.status === 'failed' && m.error && <p className="bd-warn">{m.error}</p>}
      <dl className="bd-facts">
        {real && (
          <>
            <dt>Its own size</dt>
            <dd>{real}</dd>
          </>
        )}
        <dt>On the board</dt>
        <dd>
          {Math.round(n.w)} × {Math.round(n.h)} <span className="v0-quiet">(how large it is shown; never its own size)</span>
        </dd>
        {m.type === 'graphic' && m.plan && (
          <>
            <dt>Composition</dt>
            <dd>
              {m.plan.archetype.replace(/-/g, ' ')} · {m.plan.colour.replace(/-/g, ' ')}
            </dd>
          </>
        )}
      </dl>
      <div className="bd-adds">
        {m.type === 'graphic' && m.doc && (
          <button type="button" className="sb-btn is-sm is-primary" onClick={() => p.onEditMaterial(m.id)}>
            Open in the graphics editor
          </button>
        )}
        {m.type === 'website' && site && (
          <button type="button" className="sb-btn is-sm is-primary" onClick={() => p.onOpenWebsite(m.projectId)}>
            Open in the website editor
          </button>
        )}
        {m.type !== 'mockup' && (
          <button type="button" className="sb-btn is-sm" onClick={() => p.onRegenerate([m.id])}>
            Regenerate only this
          </button>
        )}
        <button type="button" className="sb-btn is-sm" onClick={() => p.onExportMaterial(m.id)}>
          Export this material
        </button>
        <button type="button" className="sb-btn is-sm" onClick={() => p.onOps([{ op: 'material-duplicate', id: m.id }], `${m.name} duplicated`)}>
          Duplicate
        </button>
        <button type="button" className="sb-btn is-sm" onClick={() => p.onOps([{ op: 'material-remove', id: m.id }], `${m.name} removed`)}>
          Remove
        </button>
      </div>
      {m.type === 'website' && (
        <p className="v0-quiet">
          {site ? `A website project of its own (“${site.name}”), version ${site.specs[site.specIndex]?.version ?? 1}: the board shows its page live; edits are made in the website editor.` : 'Its website project is not in this browser, or it is not yours.'}
        </p>
      )}
      {m.type === 'mockup' && (
        <>
          <p className="gx-panel-sub">The mockup</p>
          <label className="gx-field">
            <span>Scene</span>
            <select className="v0-select" value={m.template} onChange={(e) => p.onOps([{ op: 'material-update', id: m.id, set: { template: e.target.value } }], 'mockup scene changed')}>
              {MOCKUPS.map((t) => (
                <option key={t} value={t}>
                  {MOCKUP_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="gx-field">
            <span>Shows</span>
            <select className="v0-select" value={m.source?.material ?? ''} onChange={(e) => p.onOps([{ op: 'material-update', id: m.id, set: { source: e.target.value ? { material: e.target.value, artboard: 0 } : null } }], 'the design the mockup shows swapped')}>
              <option value="">Nothing yet</option>
              {graphics.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <p className="v0-quiet">The mockup draws the design itself, so it follows every change to it; the design stays a material of its own.</p>
        </>
      )}
      {m.type === 'graphic' && (
        <>
          <p className="gx-panel-sub">Local changes ({overrides.length})</p>
          {overrides.length ? (
            <>
              <ul className="bd-overrides">
                {overrides.map((o) => (
                  <li key={`${o.node}-${o.prop}`}>
                    <span>
                      <b>{o.name}</b> {o.prop}: <code>{o.value}</code> <span className="v0-quiet">(the system: {o.expected})</span>
                    </span>
                    <button type="button" className="sb-link is-meta" onClick={() => p.onResetOverrides(m.id, [o.node])}>
                      Reset
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="sb-btn is-sm" onClick={() => p.onResetOverrides(m.id, 'all')}>
                Reset all to the system
              </button>
              <p className="v0-quiet">Kept when the system changes; reset only when you say so.</p>
            </>
          ) : (
            <p className="v0-quiet">None: it follows the system exactly.</p>
          )}
        </>
      )}
      {p.lockBtn}
    </section>
  );
}

export { KIND_ADD, ARRANGEMENT_LABEL, STATUS_WORD };
export type { Override };
export const materialName = (b: BoardState, id: string) => b.materials.find((m) => m.id === id)?.name ?? 'material';
export const proposeLabel = (s: MasterDesignSystem) => `${s.tokens.fonts.display} / ${s.tokens.fonts.body} · ${s.tokens.colors.accent}`;
export const weightsFor = (face: string) => knownFont(face)?.weights ?? [400, 700];
export const graphicOf = (b: BoardState, id: string): GraphicMaterial | null => {
  const m = b.materials.find((x) => x.id === id);
  return m?.type === 'graphic' ? m : null;
};
export { nearestWeight };
