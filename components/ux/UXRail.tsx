'use client';

// components/ux/UXRail.tsx — the left side of the workspace.
//
//   Brief     the problem and the people, in the designer's words, each field
//             with the question that tends to sharpen it.
//   Layers    the selected screen's elements, and the inspector for the one
//             selected — including what on the map rests on it.
//   Screens   every artboard, alternatives under the screen they explore, and
//             the ways to add one: a template, a blank frame, a screenshot.

import { useState } from 'react';
import {
  ELEMENT_KINDS,
  NODE_META,
  briefFilled,
  makeElement,
  makeNode,
  nextArtboardSlot,
  uid,
  type Artboard,
  type Brief,
  type ElementKind,
  type UXElement,
  type UXProject,
} from '@/lib/ux/model';
import { contrastRatio, backgroundOf } from '@/lib/ux/audit';
import { TEMPLATES, artboardFromTemplate, type TemplateId } from '@/lib/ux/templates';
import { INTENT_META, type Intent } from '@/lib/ux/reasoning';
import type { Dispatch } from './useProject';
import type { Selection } from './UXCanvas';

export type RailTab = 'brief' | 'layers' | 'screens';

const BRIEF_FIELDS: { key: keyof Brief; label: string; prompt: string; placeholder: string }[] = [
  {
    key: 'problem',
    label: 'Problem',
    prompt: 'Is this a problem, or a solution in disguise? Could someone disagree that it is a problem?',
    placeholder: 'New patients abandon sign-up before booking…',
  },
  {
    key: 'users',
    label: 'Intended users',
    prompt: 'Who exactly, in what situation, with what at stake? Who is this not for?',
    placeholder: 'Patients over 60, on a phone, sometimes helped by family…',
  },
  { key: 'goals', label: 'Goals', prompt: 'Whose goal is each one — the user’s or the business’s?', placeholder: 'Reach a booked appointment from the reminder link…' },
  { key: 'constraints', label: 'Constraints', prompt: 'Which of these are real, and which are habits?', placeholder: 'Results must be delivered securely…' },
  { key: 'success', label: 'Success looks like', prompt: 'How would you know, a month after launch, that this worked?', placeholder: 'Completion from the SMS link above 60%…' },
];

const KIND_LABEL: Record<ElementKind, string> = {
  heading: 'Heading',
  text: 'Text',
  button: 'Button',
  input: 'Input',
  checkbox: 'Checkbox',
  link: 'Link',
  image: 'Image',
  rect: 'Shape',
  nav: 'Navigation',
};

interface Props {
  project: UXProject;
  dispatch: Dispatch;
  tab: RailTab;
  onTab: (t: RailTab) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  focusArtboardId: string | null;
  onShowNode: (id: string) => void;
  onUpload: () => void;
  ask: (intent: Intent, message: string, focus?: Partial<Selection>) => void;
  busy: boolean;
}

export function UXRail(p: Props) {
  return (
    <aside className="uxl" aria-label="Project">
      <div className="uxp-tabs" role="tablist">
        {(['brief', 'layers', 'screens'] as RailTab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={p.tab === t} className={`uxp-tab${p.tab === t ? ' is-on' : ''}`} onClick={() => p.onTab(t)}>
            {t === 'brief' ? 'Brief' : t === 'layers' ? 'Layers' : 'Screens'}
          </button>
        ))}
      </div>
      <div className="uxl-body">
        {p.tab === 'brief' && <BriefTab {...p} />}
        {p.tab === 'layers' && <LayersTab {...p} />}
        {p.tab === 'screens' && <ScreensTab {...p} />}
      </div>
    </aside>
  );
}

function BriefTab({ project, dispatch, ask, busy }: Props) {
  const filled = briefFilled(project.brief);
  return (
    <div className="uxl-section">
      <div className="uxl-meter" aria-label={`${filled} of 5 brief fields written`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={i < filled ? 'is-on' : ''} />
        ))}
        <span className="uxl-meter-n">{filled} / 5</span>
      </div>
      {BRIEF_FIELDS.map((f) => (
        <label key={f.key} className="uxr-field">
          <span>{f.label}</span>
          <textarea
            className="uxr-input"
            rows={f.key === 'problem' || f.key === 'users' ? 3 : 2}
            value={project.brief[f.key]}
            placeholder={f.placeholder}
            onChange={(e) => dispatch({ type: 'brief/set', patch: { [f.key]: e.target.value } })}
          />
          <em className="uxl-prompt">{f.prompt}</em>
        </label>
      ))}
      <button type="button" className="uxr-btn wide" disabled={busy} onClick={() => ask('frame', INTENT_META.frame.prompt, { artboardId: null, elementId: null })}>
        Frame it with SocriaUX
      </button>
    </div>
  );
}

function num(v: string, fallback: number) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="uxr-field uxl-color">
      <span>{label}</span>
      <span className="uxl-color-row">
        <input type="color" value={value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} colour`} />
        <input className="uxr-input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} hex`} spellCheck={false} />
      </span>
    </label>
  );
}

function Inspector({ project, dispatch, ab, el, onSelect, onShowNode, ask, busy }: { ab: Artboard; el: UXElement } & Props) {
  const set = (patch: Partial<UXElement>) => dispatch({ type: 'element/update', artboardId: ab.id, id: el.id, patch });
  const linked = project.nodes.filter((n) => n.artboardId === ab.id && n.elementId === el.id);
  const pins = project.annotations.filter((a) => a.artboardId === ab.id && a.elementId === el.id && a.status !== 'dismissed');
  const textual = el.kind !== 'rect' && el.kind !== 'image';
  const ratio = textual ? contrastRatio(el.color, backgroundOf(ab, el)) : null;
  return (
    <div className="uxl-inspector">
      <div className="uxl-insp-head">
        <span className="uxr-eyebrow">{KIND_LABEL[el.kind]}</span>
        <input className="uxr-input uxl-name" value={el.name} placeholder="Name this element" onChange={(e) => set({ name: e.target.value })} aria-label="Element name" />
      </div>
      {el.kind !== 'rect' && (
        <label className="uxr-field">
          <span>{el.kind === 'input' ? 'Placeholder' : el.kind === 'image' ? 'Description' : el.kind === 'nav' ? 'Items (separate with ·)' : 'Text'}</span>
          {el.kind === 'checkbox' ? null : <textarea className="uxr-input" rows={el.kind === 'text' ? 3 : 1} value={el.text} onChange={(e) => set({ text: e.target.value })} />}
        </label>
      )}
      {(el.kind === 'input' || el.kind === 'checkbox') && (
        <label className="uxr-field">
          <span>Visible label</span>
          <input className="uxr-input" value={el.label} placeholder="None — placeholder only" onChange={(e) => set({ label: e.target.value })} />
        </label>
      )}
      <div className="uxl-grid4">
        {(['x', 'y', 'w', 'h'] as const).map((k) => (
          <label key={k} className="uxr-field">
            <span>{k.toUpperCase()}</span>
            <input className="uxr-input" type="number" value={Math.round(el[k])} onChange={(e) => set({ [k]: num(e.target.value, el[k]) })} />
          </label>
        ))}
      </div>
      {textual && (
        <div className="uxl-grid2">
          <label className="uxr-field">
            <span>Size</span>
            <input className="uxr-input" type="number" value={el.fontSize} onChange={(e) => set({ fontSize: num(e.target.value, el.fontSize) })} />
          </label>
          <label className="uxr-field">
            <span>Weight</span>
            <select className="uxr-select" value={el.fontWeight} onChange={(e) => set({ fontWeight: Number(e.target.value) })}>
              {[300, 400, 500, 600, 700].map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {el.kind === 'button' && (
        <label className="uxr-field">
          <span>Emphasis</span>
          <div className="uxr-seg">
            {(['primary', 'secondary', 'ghost'] as const).map((v) => (
              <button key={v} type="button" className={el.variant === v ? 'is-on' : ''} onClick={() => set({ variant: v })}>
                {v}
              </button>
            ))}
          </div>
        </label>
      )}
      <div className="uxl-grid2">
        {textual && <ColorField label="Text" value={el.color} onChange={(v) => set({ color: v })} />}
        {(el.kind === 'button' || el.kind === 'rect' || el.kind === 'image' || el.kind === 'input' || el.kind === 'nav' || el.kind === 'checkbox') && (
          <ColorField label="Fill" value={el.fill} onChange={(v) => set({ fill: v })} />
        )}
      </div>
      {ratio !== null && (
        <p className={`uxl-contrast${ratio < 4.5 ? ' is-low' : ''}`}>
          Contrast {ratio.toFixed(2)}:1 {ratio >= 7 ? '· AAA' : ratio >= 4.5 ? '· AA' : ratio >= 3 ? '· large text only' : '· fails'}
        </p>
      )}
      {(el.kind === 'button' || el.kind === 'rect' || el.kind === 'image' || el.kind === 'input' || el.kind === 'checkbox') && (
        <label className="uxr-field">
          <span>Corner radius</span>
          <input className="uxr-input" type="number" value={el.radius} onChange={(e) => set({ radius: num(e.target.value, el.radius) })} />
        </label>
      )}
      <div className="uxl-actions">
        <button type="button" className="uxr-btn ghost sm" onClick={() => dispatch({ type: 'element/order', artboardId: ab.id, id: el.id, dir: 'front' })}>
          To front
        </button>
        <button type="button" className="uxr-btn ghost sm" onClick={() => dispatch({ type: 'element/order', artboardId: ab.id, id: el.id, dir: 'back' })}>
          To back
        </button>
        <button
          type="button"
          className="uxr-btn ghost sm"
          onClick={() => {
            const copy = makeElement(el.kind, { ...el, id: uid('el'), x: el.x + 16, y: el.y + 16, name: el.name ? `${el.name} copy` : '' });
            dispatch({ type: 'element/add', artboardId: ab.id, element: copy });
            onSelect({ artboardId: ab.id, elementId: copy.id });
          }}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="uxr-btn ghost sm danger"
          onClick={() => {
            dispatch({ type: 'element/remove', artboardId: ab.id, id: el.id });
            onSelect({ artboardId: ab.id, elementId: null });
          }}
        >
          Delete
        </button>
      </div>

      <div className="uxl-reasoning">
        <span className="uxr-eyebrow">Reasoning on this element</span>
        {!linked.length && !pins.length && <p className="uxp-hint">Nothing on the map rests on it yet. Why is it here, and what would happen without it?</p>}
        {linked.map((n) => (
          <button key={n.id} type="button" className={`uxl-linked kind-${n.kind}`} onClick={() => onShowNode(n.id)}>
            <span>{NODE_META[n.kind].label}</span>
            {n.label}
          </button>
        ))}
        {pins.length > 0 && (
          <p className="uxp-hint">
            {pins.length} annotation{pins.length === 1 ? '' : 's'} pinned here.
          </p>
        )}
        <div className="uxl-actions">
          <button
            type="button"
            className="uxr-btn ghost sm"
            onClick={() => {
              const left = project.nodes.length ? Math.min(...project.nodes.map((n) => n.x)) : 0;
              const bottom = project.nodes.length ? Math.max(...project.nodes.map((n) => n.y)) + 150 : 0;
              const n = makeNode('assumption', `Users will understand “${(el.text || el.label || el.kind).slice(0, 40)}”`, { artboardId: ab.id, elementId: el.id, x: left, y: bottom });
              dispatch({ type: 'node/add', node: n });
              onShowNode(n.id);
            }}
          >
            Record an assumption
          </button>
          <button
            type="button"
            className="uxr-btn ghost sm"
            onClick={() => {
              const left = project.nodes.length ? Math.min(...project.nodes.map((n) => n.x)) + 300 : 0;
              const bottom = project.nodes.length ? Math.max(...project.nodes.map((n) => n.y)) + 150 : 0;
              const n = makeNode('decision', `${el.name || KIND_LABEL[el.kind]}: why it is designed this way`, { artboardId: ab.id, elementId: el.id, x: left, y: bottom });
              dispatch({ type: 'node/add', node: n });
              onShowNode(n.id);
            }}
          >
            Record a decision
          </button>
          <button type="button" className="uxr-btn sm" disabled={busy} onClick={() => ask('critique', `Critique the ${KIND_LABEL[el.kind].toLowerCase()} “${(el.text || el.label || el.name).slice(0, 40)}”.`, { artboardId: ab.id, elementId: el.id })}>
            Critique this
          </button>
        </div>
      </div>
    </div>
  );
}

function BoardInspector({ project, dispatch, ab, onSelect, ask, busy }: { ab: Artboard } & Props) {
  const set = (patch: Partial<Artboard>) => dispatch({ type: 'artboard/update', id: ab.id, patch });
  const parent = ab.parentId ? project.artboards.find((a) => a.id === ab.parentId) : null;
  return (
    <div className="uxl-inspector">
      <div className="uxl-insp-head">
        <span className="uxr-eyebrow">Screen</span>
        <input className="uxr-input uxl-name" value={ab.name} onChange={(e) => set({ name: e.target.value })} aria-label="Screen name" />
      </div>
      <div className="uxl-grid2">
        <label className="uxr-field">
          <span>Width</span>
          <input className="uxr-input" type="number" value={ab.w} onChange={(e) => set({ w: num(e.target.value, ab.w) })} />
        </label>
        <label className="uxr-field">
          <span>Height</span>
          <input className="uxr-input" type="number" value={ab.h} onChange={(e) => set({ h: num(e.target.value, ab.h) })} />
        </label>
      </div>
      <ColorField label="Background" value={ab.background} onChange={(v) => set({ background: v })} />
      {parent && (
        <label className="uxr-field">
          <span>What this alternative tries (vs. {parent.name})</span>
          <textarea className="uxr-input" rows={2} value={ab.intent} onChange={(e) => set({ intent: e.target.value })} placeholder="If we…, we expect…" />
        </label>
      )}
      <div className="uxl-actions">
        <button type="button" className="uxr-btn sm" disabled={busy} onClick={() => ask('critique', `Critique the screen “${ab.name}”.`, { artboardId: ab.id, elementId: null })}>
          Critique this screen
        </button>
        <button
          type="button"
          className="uxr-btn ghost sm danger"
          onClick={() => {
            if (window.confirm(`Delete “${ab.name}” and its annotations?`)) {
              dispatch({ type: 'artboard/remove', id: ab.id });
              onSelect({ artboardId: null, elementId: null });
            }
          }}
        >
          Delete screen
        </button>
      </div>
    </div>
  );
}

function LayersTab(p: Props) {
  const { project, selection, onSelect, dispatch } = p;
  const ab = project.artboards.find((a) => a.id === (selection.artboardId ?? p.focusArtboardId));
  if (!ab) return <p className="uxp-empty">Select a screen on the canvas to see its layers.</p>;
  const el = ab.elements.find((e) => e.id === selection.elementId);
  return (
    <div className="uxl-section">
      <div className="uxl-layers-head">
        <span className="uxr-eyebrow">{ab.name}</span>
        <select
          className="uxr-select sm"
          value=""
          aria-label="Add an element"
          onChange={(e) => {
            const kind = e.target.value as ElementKind;
            if (!kind) return;
            const proto = makeElement(kind);
            const n = makeElement(kind, { x: kind === 'nav' ? 0 : 24, y: Math.min(ab.h - proto.h, 24 + ab.elements.length * 8), w: kind === 'nav' ? ab.w : Math.min(proto.w, ab.w - 48) });
            dispatch({ type: 'element/add', artboardId: ab.id, element: n });
            onSelect({ artboardId: ab.id, elementId: n.id });
          }}
        >
          <option value="">+ Add element</option>
          {ELEMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      <ul className="uxl-layers">
        {[...ab.elements].reverse().map((e) => (
          <li key={e.id}>
            <button type="button" className={`uxl-layer${selection.elementId === e.id ? ' is-on' : ''}`} onClick={() => onSelect({ artboardId: ab.id, elementId: e.id })}>
              <span className="uxl-layer-kind">{KIND_LABEL[e.kind]}</span>
              <span className="uxl-layer-name">{e.name || e.text || e.label || '—'}</span>
            </button>
          </li>
        ))}
        {!ab.elements.length && <li className="uxp-hint">No elements. Add one above, or use the toolbar under the canvas.</li>}
      </ul>
      {el ? <Inspector {...p} ab={ab} el={el} /> : <BoardInspector {...p} ab={ab} />}
    </div>
  );
}

function ScreensTab(p: Props) {
  const { project, dispatch, onSelect, selection } = p;
  const [altFor, setAltFor] = useState<string | null>(null);
  const [intent, setIntent] = useState('');
  const roots = project.artboards.filter((a) => !a.parentId || !project.artboards.some((b) => b.id === a.parentId));
  const kids = (id: string) => project.artboards.filter((a) => a.parentId === id);

  const add = (id: TemplateId) => {
    const proto = artboardFromTemplate(id);
    const slot = nextArtboardSlot(project, proto.w);
    const ab = artboardFromTemplate(id, { x: slot.x, y: slot.y });
    dispatch({ type: 'artboard/add', artboard: ab });
    onSelect({ artboardId: ab.id, elementId: null });
  };

  const row = (a: Artboard, depth: number): React.ReactNode => (
    <li key={a.id}>
      <div className={`uxl-screen${selection.artboardId === a.id ? ' is-on' : ''}`} style={{ paddingLeft: 10 + depth * 16 }}>
        <button type="button" className="uxl-screen-name" onClick={() => onSelect({ artboardId: a.id, elementId: null })}>
          {depth > 0 && <span className="uxl-alt-mark">↳ </span>}
          {a.name}
          <span className="uxl-screen-meta">
            {a.w}×{a.h} · {a.elements.length} el.{a.image ? ' · screenshot' : ''}
          </span>
        </button>
        <button type="button" className="uxr-btn ghost sm" onClick={() => (setAltFor(altFor === a.id ? null : a.id), setIntent(''))} title="Explore an alternative to this screen">
          Alternative
        </button>
      </div>
      {altFor === a.id && (
        <div className="uxl-altform">
          <label className="uxr-field">
            <span>What will the alternative try?</span>
            <textarea className="uxr-input" rows={2} value={intent} autoFocus onChange={(e) => setIntent(e.target.value)} placeholder="If booking comes before the account, more people will finish…" />
          </label>
          <div className="uxl-actions">
            <button
              type="button"
              className="uxr-btn sm"
              onClick={() => {
                const id = uid('ab');
                dispatch({ type: 'artboard/alternative', id: a.id, newId: id, intent });
                onSelect({ artboardId: id, elementId: null });
                setAltFor(null);
              }}
            >
              Create alternative
            </button>
            <button type="button" className="uxr-btn ghost sm" onClick={() => setAltFor(null)}>
              Cancel
            </button>
          </div>
          <p className="uxp-hint">A copy of the screen, beside it, carrying your hypothesis. Change it, then compare the two with SocriaUX.</p>
        </div>
      )}
      {kids(a.id).length > 0 && <ul>{kids(a.id).map((k) => row(k, depth + 1))}</ul>}
    </li>
  );

  return (
    <div className="uxl-section">
      <ul className="uxl-screens">{roots.map((r) => row(r, 0))}</ul>
      {!project.artboards.length && <p className="uxp-hint">No screens yet.</p>}
      <span className="uxr-eyebrow uxp-sub">Add a screen</span>
      <div className="uxl-templates">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="uxl-template" onClick={() => add(t.id)}>
            <span className="uxl-template-name">{t.name}</span>
            <span className="uxl-template-meta">{t.size}</span>
            <span className="uxl-template-note">{t.note}</span>
          </button>
        ))}
        <button type="button" className="uxl-template" onClick={p.onUpload}>
          <span className="uxl-template-name">Upload a screenshot</span>
          <span className="uxl-template-meta">PNG, JPG · or paste ⌘V</span>
          <span className="uxl-template-note">Critique a design you already have; annotate over it.</span>
        </button>
      </div>
      {project.artboards.filter((a) => a.parentId).length > 0 && (
        <button
          type="button"
          className="uxr-btn wide ghost"
          disabled={p.busy}
          onClick={() => p.ask('alternatives', 'Compare the alternatives I have explored with the screens they came from. What does each one gain and give up, and what would tell me which works better?')}
        >
          Compare alternatives with SocriaUX
        </button>
      )}
    </div>
  );
}
