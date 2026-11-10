'use client';

// components/ux/UXPanel.tsx — SocriaUX beside the design.
//
// Five tabs, one for each kind of help, all of them about whatever is
// selected on the canvas or the map:
//
//   Reason     the thread with SocriaUX, in the designer's chosen mode, with
//              the moves (critique, assumptions, alternatives…) one click away.
//              What it proposes — an annotation, a map node — waits for the
//              designer to accept it. Nothing enters the project on its own.
//   Critique   what the checks measured, in the register the mode asks for,
//              and every annotation on the screen.
//   Evidence   research notes, observed versus believed, and the patterns in
//              them; any note can go on the map.
//   Decisions  the decisions, what each rests on, the untested assumptions,
//              and the record of the reasoning, exportable.
//   Code       the screen as HTML and CSS, previewed, and SocriaUX's
//              implementation snippets.

import { useEffect, useMemo, useRef, useState } from 'react';
import { RichText } from '@/components/RichText';
import {
  ASSIST_META,
  ASSIST_MODES,
  NODE_META,
  RESEARCH_KINDS,
  makeNode,
  supportOf,
  ungroundedDecisions,
  uid,
  type AssistMode,
  type ResearchKind,
  type Suggestion,
  type UXMessage,
  type UXProject,
} from '@/lib/ux/model';
import { tally, type Finding } from '@/lib/ux/audit';
import { INTENT_META, type Intent } from '@/lib/ux/reasoning';
import { generateCode } from '@/lib/ux/codegen';
import type { Dispatch } from './useProject';
import type { Selection } from './UXCanvas';

export type PanelTab = 'reason' | 'critique' | 'evidence' | 'decisions' | 'code';
export const PANEL_TABS: { id: PanelTab; label: string }[] = [
  { id: 'reason', label: 'Reason' },
  { id: 'critique', label: 'Critique' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'code', label: 'Code' },
];

const MOVES: Intent[] = ['critique', 'assumptions', 'alternatives', 'explain', 'frame', 'research', 'code', 'reflect'];

interface Props {
  project: UXProject;
  dispatch: Dispatch;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  selection: Selection;
  selectedNode: string | null;
  onSelect: (s: Selection) => void;
  onClearFocus: () => void;
  onShowNode: (id: string) => void;
  findings: Finding[];
  dismissed: Set<string>;
  onDismiss: (id: string) => void;
  activeFinding: string | null;
  onFinding: (f: Finding) => void;
  showChecks: boolean;
  onShowChecks: (v: boolean) => void;
  onOpenPin: (id: string) => void;
  ask: (intent: Intent, message: string, focus?: Partial<Selection & { nodeId: string | null }>) => void;
  busy: boolean;
  error: { text: string; signIn?: boolean } | null;
  signedIn: boolean;
  focusArtboardId: string | null;
}

export function UXPanel(p: Props) {
  return (
    <aside className="uxp" aria-label="SocriaUX">
      <div className="uxp-tabs" role="tablist">
        {PANEL_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={p.tab === t.id} className={`uxp-tab${p.tab === t.id ? ' is-on' : ''}`} onClick={() => p.onTab(t.id)}>
            {t.label}
            {t.id === 'critique' && p.findings.filter((f) => !p.dismissed.has(f.id)).length > 0 && (
              <span className="uxp-count">{p.findings.filter((f) => !p.dismissed.has(f.id)).length}</span>
            )}
          </button>
        ))}
      </div>
      <div className="uxp-body">
        {p.tab === 'reason' && <ReasonTab {...p} />}
        {p.tab === 'critique' && <CritiqueTab {...p} />}
        {p.tab === 'evidence' && <EvidenceTab {...p} />}
        {p.tab === 'decisions' && <DecisionsTab {...p} />}
        {p.tab === 'code' && <CodeTab {...p} />}
      </div>
    </aside>
  );
}

// ── focus ────────────────────────────────────────────────────────────

function focusLabel(project: UXProject, s: Selection, nodeId: string | null): string {
  const node = nodeId ? project.nodes.find((n) => n.id === nodeId) : null;
  if (node) return `${NODE_META[node.kind].label}: “${node.label.slice(0, 40)}”`;
  const ab = project.artboards.find((a) => a.id === s.artboardId);
  const el = ab?.elements.find((e) => e.id === s.elementId);
  if (el) return `${el.name || el.kind} “${(el.text || el.label).slice(0, 28)}” on ${ab!.name}`;
  if (ab) return `the screen “${ab.name}”`;
  return 'the whole project';
}

// ── Reason ───────────────────────────────────────────────────────────

function ReasonTab(p: Props) {
  const { project, dispatch } = p;
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [project.messages.length, p.busy]);

  const send = () => {
    const t = text.trim();
    if (!t || p.busy) return;
    p.ask('ask', t);
    setText('');
  };

  const accept = (m: UXMessage, s: Suggestion) => {
    const artboardId = m.focus.artboardId ?? p.focusArtboardId ?? project.artboards[0]?.id ?? null;
    if (s.type === 'annotation') {
      if (!artboardId) return;
      const ab = project.artboards.find((a) => a.id === artboardId);
      const el = ab?.elements.find((e) => e.id === s.elementId);
      const id = uid('an');
      dispatch({
        type: 'annotation/add',
        annotation: {
          id,
          artboardId,
          elementId: el ? el.id : null,
          x: 24,
          y: 24 + project.annotations.filter((a) => a.artboardId === artboardId && !a.elementId).length * 28,
          author: 'socria',
          kind: s.kind,
          severity: s.severity,
          text: s.text,
          principle: s.principle,
          status: 'open',
          createdAt: Date.now(),
        },
      });
    } else {
      const right = project.nodes.length ? Math.max(...project.nodes.map((n) => n.x)) : -280;
      const top = project.nodes.length ? Math.min(...project.nodes.map((n) => n.y)) : 0;
      const sameBatch = m.suggestions.filter((x) => x.type === 'node' && x.state === 'accepted').length;
      const node = makeNode(s.kind, s.label, {
        detail: s.detail,
        source: 'socria',
        x: right + 300,
        y: top + sameBatch * 130,
        artboardId: s.elementId ? artboardId : null,
        elementId: s.elementId,
      });
      // a second accepted node from the same reply goes in the same new column
      if (sameBatch) node.x = right;
      dispatch({ type: 'node/add', node });
      if (s.linkTo) dispatch({ type: 'edge/add', edge: { id: uid('e'), from: node.id, to: s.linkTo, kind: s.linkKind ?? 'informs' } });
    }
    dispatch({ type: 'message/suggestion', messageId: m.id, suggestionId: s.id, state: 'accepted' });
  };

  const hasBoard = project.artboards.length > 0;
  return (
    <div className="uxp-reason">
      <div className="uxp-mode">
        <div className="uxp-mode-row" role="radiogroup" aria-label="How SocriaUX helps">
          {ASSIST_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={project.mode === m}
              className={`uxp-mode-btn${project.mode === m ? ' is-on' : ''}`}
              onClick={() => dispatch({ type: 'mode/set', mode: m as AssistMode })}
            >
              {ASSIST_META[m].label}
            </button>
          ))}
        </div>
        <p className="uxp-mode-note">{ASSIST_META[project.mode].note}</p>
      </div>

      <div className="uxp-thread" aria-live="polite">
        {!project.messages.length && (
          <div className="uxp-intro">
            <p className="uxp-intro-title">What are you actually trying to work out?</p>
            <p>
              Select something on the design — a button, a screen, a node on the map — and ask about it, or start with one of the moves below. SocriaUX will question what needs questioning, explain what needs explaining, and help directly when that is what you need.
            </p>
          </div>
        )}
        {project.messages.map((m) => (
          <Message key={m.id} m={m} project={project} onAccept={accept} dispatch={dispatch} onFollow={(q) => setText(q)} />
        ))}
        {p.busy && (
          <div className="uxp-thinking" aria-label="SocriaUX is thinking">
            <span />
            <span />
            <span />
          </div>
        )}
        {p.error && (
          <div className="uxp-error" role="alert">
            {p.error.text}
            {p.error.signIn && (
              <>
                {' '}
                <a href="/sign-in?redirect_url=/ux">Sign in</a> — your project stays in this browser either way, and the checks, map and code work without an account.
              </>
            )}
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="uxp-compose">
        <div className="uxp-focus">
          <span>About {focusLabel(project, p.selection, p.selectedNode)}</span>
          {(p.selection.artboardId || p.selectedNode) && (
            <button type="button" className="uxr-icon sm" aria-label="Ask about the whole project instead" onClick={p.onClearFocus}>
              ×
            </button>
          )}
        </div>
        <div className="uxp-moves" role="group" aria-label="Moves">
          {MOVES.map((i) => (
            <button
              key={i}
              type="button"
              className="uxr-chip"
              disabled={p.busy || ((i === 'critique' || i === 'code' || i === 'explain') && !hasBoard) || (i === 'research' && !project.research.length)}
              onClick={() => p.ask(i, INTENT_META[i].prompt)}
              title={INTENT_META[i].capability}
            >
              {INTENT_META[i].label}
            </button>
          ))}
        </div>
        <div className="uxp-input-row">
          <textarea
            className="uxr-input uxp-input"
            rows={2}
            value={text}
            placeholder="Say what you are deciding, or what you are unsure about."
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
              e.stopPropagation();
            }}
            aria-label="Message SocriaUX"
          />
          <button type="button" className="uxp-send" onClick={send} disabled={!text.trim() || p.busy} aria-label="Send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <p className="uxp-note">SocriaUX reads your design; the decisions stay yours.</p>
      </div>
    </div>
  );
}

function Message({ m, project, onAccept, dispatch, onFollow }: { m: UXMessage; project: UXProject; onAccept: (m: UXMessage, s: Suggestion) => void; dispatch: Dispatch; onFollow: (q: string) => void }) {
  const [copied, setCopied] = useState(false);
  if (m.role === 'designer') {
    return (
      <div className="uxp-you">
        <div className="uxp-you-bubble">{m.text}</div>
      </div>
    );
  }
  const savedCode = !!m.code && project.code.some((c) => c.content === m.code!.content);
  const elName = (id: string | null) => {
    if (!id) return null;
    for (const a of project.artboards) {
      const e = a.elements.find((x) => x.id === id);
      if (e) return e.name || `${e.kind} “${(e.text || e.label).slice(0, 20)}”`;
    }
    return null;
  };
  return (
    <div className="uxp-socria">
      <span className="uxp-who">
        SocriaUX · {ASSIST_META[m.mode].short}
        {m.kind !== 'answer' ? ` · ${m.kind}` : ''}
      </span>
      <div className="uxr-prose">
        <RichText text={m.text} rich />
      </div>
      {m.questions.length > 0 && (
        <ul className="uxp-questions">
          {m.questions.map((q, i) => (
            <li key={i}>
              <button type="button" onClick={() => onFollow(`${q} — `)} title="Answer this">
                {q}
              </button>
            </li>
          ))}
        </ul>
      )}
      {m.principles.length > 0 && (
        <div className="uxp-principles">
          {m.principles.map((pr, i) => (
            <div key={i} className="uxp-principle">
              <span className="uxp-principle-name">{pr.name}</span>
              <span>{pr.summary}</span>
            </div>
          ))}
        </div>
      )}
      {m.code && (
        <div className="uxp-code">
          <div className="uxp-code-head">
            <span>
              {m.code.title} · {m.code.language}
            </span>
            <span className="uxp-code-actions">
              <button
                type="button"
                className="uxr-btn ghost sm"
                onClick={() => {
                  navigator.clipboard?.writeText(m.code!.content).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1400);
                  });
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                className="uxr-btn ghost sm"
                disabled={savedCode}
                onClick={() =>
                  dispatch({
                    type: 'code/add',
                    artifact: { id: uid('c'), ...m.code!, artboardId: m.focus.artboardId, createdAt: Date.now() },
                  })
                }
              >
                {savedCode ? 'Saved' : 'Save to Code'}
              </button>
            </span>
          </div>
          <pre>
            <code>{m.code.content}</code>
          </pre>
          {m.code.explanation && <p className="uxp-code-why">{m.code.explanation}</p>}
        </div>
      )}
      {m.suggestions.length > 0 && (
        <div className="uxp-suggest">
          <span className="uxr-eyebrow">Suggested — yours to accept</span>
          {m.suggestions.map((s) => (
            <div key={s.id} className={`uxp-sug st-${s.state}`}>
              <div className="uxp-sug-body">
                <span className={`uxp-sug-type ${s.type === 'node' ? `kind-${s.kind}` : `ann-${s.kind}`}`}>
                  {s.type === 'node' ? NODE_META[s.kind].label : s.kind === 'issue' ? `Issue${s.severity ? ` · ${s.severity}` : ''}` : s.kind}
                  {elName(s.elementId) ? ` · on ${elName(s.elementId)}` : ''}
                </span>
                <span className="uxp-sug-text">{s.type === 'node' ? s.label : s.text}</span>
                {s.type === 'node' && s.detail && <span className="uxp-sug-detail">{s.detail}</span>}
                {s.type === 'annotation' && s.principle && <span className="uxp-sug-detail">{s.principle}</span>}
              </div>
              {s.state === 'pending' ? (
                <div className="uxp-sug-actions">
                  <button type="button" className="uxr-btn sm" onClick={() => onAccept(m, s)}>
                    {s.type === 'node' ? 'Add to map' : 'Pin on design'}
                  </button>
                  <button type="button" className="uxr-btn ghost sm" onClick={() => dispatch({ type: 'message/suggestion', messageId: m.id, suggestionId: s.id, state: 'dismissed' })}>
                    Dismiss
                  </button>
                </div>
              ) : (
                <span className="uxp-sug-state">{s.state === 'accepted' ? 'Added' : 'Dismissed'}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Critique ─────────────────────────────────────────────────────────

function CritiqueTab(p: Props) {
  const { project } = p;
  const ab = project.artboards.find((a) => a.id === p.focusArtboardId);
  const open = p.findings.filter((f) => !p.dismissed.has(f.id));
  const t = tally(open);
  const notes = project.annotations.filter((a) => a.artboardId === ab?.id && a.status !== 'dismissed');
  const allPins = project.annotations.filter((a) => a.status !== 'dismissed');
  const active = useRef<HTMLDivElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [p.activeFinding]);

  if (!ab) return <p className="uxp-empty">Add or select a screen to see what the checks measure on it.</p>;
  return (
    <div className="uxp-section">
      <div className="uxp-crit-head">
        <div>
          <span className="uxr-eyebrow">Checks on {ab.name}</span>
          <div className="uxp-tally">
            <span className="sev-high">{t.high} high</span>
            <span className="sev-medium">{t.medium} medium</span>
            <span className="sev-low">{t.low} low</span>
          </div>
        </div>
        <label className="uxr-toggle">
          <input type="checkbox" checked={p.showChecks} onChange={(e) => p.onShowChecks(e.target.checked)} />
          <span>Show on design</span>
        </label>
      </div>
      <p className="uxp-hint">
        Measured, not judged: contrast, target size, labels, hierarchy, density, alignment. Whether the design serves its users is the part only you and your research can answer.
        {ab.image ? ' On an uploaded screenshot, only the elements you place over it are measured.' : ''}
      </p>
      <button type="button" className="uxr-btn wide" disabled={p.busy} onClick={() => p.ask('critique', INTENT_META.critique.prompt, { artboardId: ab.id, elementId: p.selection.elementId })}>
        Critique it with SocriaUX
      </button>
      {!open.length && <p className="uxp-empty">Nothing the checks can measure needs attention.</p>}
      {open.map((f) => (
        <div key={f.id} ref={p.activeFinding === f.id ? active : undefined} className={`uxp-finding sev-${f.severity}${p.activeFinding === f.id ? ' is-on' : ''}`}>
          <button type="button" className="uxp-finding-title" onClick={() => p.onFinding(f)}>
            <span className="uxp-sev" aria-label={`${f.severity} severity`} />
            <span>{f.title}</span>
          </button>
          <span className="uxp-measure">
            {f.measure} · {f.principle}
          </span>
          {project.mode === 'guided' && (
            <>
              <p className="uxp-q">{f.question}</p>
              <details>
                <summary>Why this matters</summary>
                <p>{f.explanation}</p>
              </details>
            </>
          )}
          {project.mode === 'instructional' && (
            <>
              <p>{f.explanation}</p>
              <p className="uxp-q">{f.question}</p>
            </>
          )}
          {project.mode === 'direct' && (
            <>
              <p>
                <strong>Fix:</strong> {f.fix}
              </p>
              <details>
                <summary>Why</summary>
                <p>{f.explanation}</p>
              </details>
            </>
          )}
          <div className="uxp-finding-actions">
            <button
              type="button"
              className="uxr-btn ghost sm"
              onClick={() =>
                p.ask('explain', `Help me think through this: ${f.title} (${f.measure}).`, { artboardId: f.artboardId, elementId: f.elementId })
              }
              disabled={p.busy}
            >
              Ask
            </button>
            <button
              type="button"
              className="uxr-btn ghost sm"
              onClick={() =>
                p.dispatch({
                  type: 'annotation/add',
                  annotation: {
                    id: uid('an'),
                    artboardId: f.artboardId,
                    elementId: f.elementId,
                    x: 24,
                    y: 24,
                    author: 'socria',
                    kind: 'issue',
                    severity: f.severity,
                    text: `${f.title} — ${f.measure}.`,
                    principle: f.principle,
                    status: 'open',
                    createdAt: Date.now(),
                  },
                })
              }
            >
              Pin
            </button>
            <button type="button" className="uxr-btn ghost sm" onClick={() => p.onDismiss(f.id)}>
              Not an issue here
            </button>
          </div>
        </div>
      ))}

      <span className="uxr-eyebrow uxp-sub">Annotations on this screen ({notes.length})</span>
      {!notes.length && <p className="uxp-hint">Use the note tool (N) to pin a thought to the design.</p>}
      {notes.map((a) => (
        <button key={a.id} type="button" className={`uxp-note-row by-${a.author}${a.status === 'resolved' ? ' is-resolved' : ''}`} onClick={() => p.onOpenPin(a.id)}>
          <span className="uxp-note-n">{allPins.indexOf(a) + 1}</span>
          <span className="uxp-note-text">{a.text || <em>Empty note</em>}</span>
          <span className="uxp-note-who">{a.status === 'resolved' ? 'resolved' : a.author === 'socria' ? 'SocriaUX' : 'you'}</span>
        </button>
      ))}
    </div>
  );
}

// ── Evidence ─────────────────────────────────────────────────────────

function EvidenceTab(p: Props) {
  const { project, dispatch } = p;
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [kind, setKind] = useState<ResearchKind>('interview');
  const [tags, setTags] = useState('');
  const [observed, setObserved] = useState(true);
  const [tag, setTag] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of project.research) for (const t of r.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [project.research]);
  const onMap = new Set(project.nodes.map((n) => n.researchId).filter(Boolean));
  const notes = (tag ? project.research.filter((r) => r.tags.includes(tag)) : project.research).slice().reverse();
  const observedN = project.research.filter((r) => r.isEvidence).length;

  const add = () => {
    if (!text.trim()) return;
    dispatch({
      type: 'research/add',
      note: {
        id: uid('r'),
        kind,
        source: source.trim(),
        text: text.trim(),
        tags: tags.split(/[,#\s]+/).filter(Boolean),
        isEvidence: observed,
        createdAt: Date.now(),
      },
    });
    setText('');
    setTags('');
  };

  const toMap = (id: string) => {
    const r = project.research.find((x) => x.id === id);
    if (!r) return;
    const left = project.nodes.length ? Math.min(...project.nodes.map((n) => n.x)) : 0;
    const bottom = project.nodes.length ? Math.max(...project.nodes.map((n) => n.y)) + 150 : 0;
    const n = makeNode(r.isEvidence ? 'evidence' : 'assumption', r.text.replace(/^[“"]|[”"]$/g, '').slice(0, 120), {
      source: 'research',
      researchId: r.id,
      detail: r.source,
      x: left,
      y: bottom,
    });
    dispatch({ type: 'node/add', node: n });
    p.onShowNode(n.id);
  };

  return (
    <div className="uxp-section">
      <div className="uxp-addnote">
        <label className="uxr-field">
          <span>What did you observe, hear or measure?</span>
          <textarea className="uxr-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="“I just want to book — why do I need an account?”" />
        </label>
        <div className="uxp-addnote-row">
          <input className="uxr-input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source: P3, interview" aria-label="Source" />
          <select className="uxr-select" value={kind} onChange={(e) => setKind(e.target.value as ResearchKind)} aria-label="Kind of research">
            {RESEARCH_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replace('-', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="uxp-addnote-row">
          <input className="uxr-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags: account, trust" aria-label="Tags" />
          <div className="uxr-seg" role="radiogroup" aria-label="Observed or believed">
            <button type="button" role="radio" aria-checked={observed} className={observed ? 'is-on' : ''} onClick={() => setObserved(true)}>
              Observed
            </button>
            <button type="button" role="radio" aria-checked={!observed} className={!observed ? 'is-on' : ''} onClick={() => setObserved(false)}>
              Believed
            </button>
          </div>
        </div>
        <button type="button" className="uxr-btn wide" onClick={add} disabled={!text.trim()}>
          Add note
        </button>
      </div>

      <div className="uxp-ev-head">
        <span className="uxr-eyebrow">
          {project.research.length} notes · {observedN} observed · {project.research.length - observedN} believed
        </span>
        <button type="button" className="uxr-btn ghost sm" disabled={!project.research.length || p.busy} onClick={() => p.ask('research', INTENT_META.research.prompt)}>
          Interpret with SocriaUX
        </button>
      </div>
      {counts.length > 0 && (
        <div className="uxp-tags">
          {counts.map(([t, n]) => (
            <button key={t} type="button" className={`uxr-chip${tag === t ? ' is-on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
              #{t} <span className="uxp-tagn">{n}</span>
            </button>
          ))}
        </div>
      )}
      {!project.research.length && (
        <p className="uxp-hint">
          With no research recorded, everything said about users — by you or by SocriaUX — is an assumption. Interview quotes, test observations and analytics go here; so do beliefs, marked as beliefs.
        </p>
      )}
      {notes.map((r) => (
        <div key={r.id} className={`uxp-rnote${r.isEvidence ? '' : ' is-belief'}`}>
          <p className="uxp-rnote-text">{r.text}</p>
          <span className="uxp-rnote-meta">
            {r.isEvidence ? 'Observed' : 'Believed, not observed'} · {r.kind.replace('-', ' ')}
            {r.source ? ` · ${r.source}` : ''}
            {r.tags.length ? ` · #${r.tags.join(' #')}` : ''}
          </span>
          <div className="uxp-finding-actions">
            {onMap.has(r.id) ? (
              <button type="button" className="uxr-btn ghost sm" onClick={() => p.onShowNode(project.nodes.find((n) => n.researchId === r.id)!.id)}>
                On the map
              </button>
            ) : (
              <button type="button" className="uxr-btn ghost sm" onClick={() => toMap(r.id)}>
                Add to map as {r.isEvidence ? 'evidence' : 'assumption'}
              </button>
            )}
            <button type="button" className="uxr-btn ghost sm" onClick={() => dispatch({ type: 'research/update', id: r.id, patch: { isEvidence: !r.isEvidence } })}>
              Mark {r.isEvidence ? 'believed' : 'observed'}
            </button>
            <button type="button" className="uxr-btn ghost sm danger" onClick={() => dispatch({ type: 'research/remove', id: r.id })}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Decisions ────────────────────────────────────────────────────────

export function reasoningMarkdown(project: UXProject): string {
  const lines: string[] = [`# ${project.name} — design reasoning`, '', `_Exported from SocriaUX, ${new Date().toISOString().slice(0, 10)}._`, ''];
  const b = project.brief;
  lines.push('## Brief', '', `- **Problem:** ${b.problem || '—'}`, `- **Users:** ${b.users || '—'}`, `- **Goals:** ${b.goals || '—'}`, `- **Constraints:** ${b.constraints || '—'}`, `- **Success:** ${b.success || '—'}`, '');
  const decisions = project.nodes.filter((n) => n.kind === 'decision');
  lines.push('## Decisions', '');
  if (!decisions.length) lines.push('_None recorded._', '');
  const ungrounded = new Set(ungroundedDecisions(project).map((n) => n.id));
  for (const d of decisions) {
    const { supports, contradicts } = supportOf(project, d.id);
    lines.push(`### ${d.label}${ungrounded.has(d.id) ? ' (no evidence yet)' : ''}`, '');
    if (d.detail) lines.push(`**Rationale.** ${d.detail}`, '');
    if (d.tradeoffs) lines.push(`**Trade-offs.** ${d.tradeoffs}`, '');
    if (supports.length) lines.push(`**Rests on:** ${supports.map((s) => `${NODE_META[s.kind].label.toLowerCase()} — ${s.label}`).join('; ')}`, '');
    if (contradicts.length) lines.push(`**Contradicted by:** ${contradicts.map((s) => s.label).join('; ')}`, '');
  }
  for (const kind of ['need', 'assumption', 'hypothesis', 'question', 'risk', 'evidence'] as const) {
    const ns = project.nodes.filter((n) => n.kind === kind);
    if (!ns.length) continue;
    lines.push(`## ${NODE_META[kind].plural}`, '', ...ns.map((n) => `- ${n.label}${n.status !== 'open' ? ` _(${n.status})_` : ''}${n.detail ? ` — ${n.detail}` : ''}`), '');
  }
  if (project.research.length) {
    lines.push('## Research notes', '', ...project.research.map((r) => `- ${r.isEvidence ? '' : '_(belief)_ '}${r.text}${r.source ? ` — ${r.source}` : ''}`), '');
  }
  const alts = project.artboards.filter((a) => a.parentId);
  if (alts.length) {
    lines.push('## Alternatives explored', '', ...alts.map((a) => `- **${a.name}**${a.intent ? `: ${a.intent}` : ''}`), '');
  }
  return lines.join('\n');
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DecisionsTab(p: Props) {
  const { project, dispatch } = p;
  const decisions = project.nodes.filter((n) => n.kind === 'decision');
  const ungrounded = new Set(ungroundedDecisions(project).map((n) => n.id));
  const assumptions = project.nodes.filter((n) => n.kind === 'assumption');
  const alts = project.artboards.filter((a) => a.parentId);
  return (
    <div className="uxp-section">
      <div className="uxp-ev-head">
        <span className="uxr-eyebrow">
          {decisions.length} decision{decisions.length === 1 ? '' : 's'} · {ungrounded.size} without evidence
        </span>
        <button
          type="button"
          className="uxr-btn ghost sm"
          onClick={() => {
            const n = makeNode('decision', 'New decision', { x: 0, y: (project.nodes.length ? Math.max(...project.nodes.map((x) => x.y)) : 0) + 160 });
            dispatch({ type: 'node/add', node: n });
            p.onShowNode(n.id);
          }}
        >
          Add decision
        </button>
      </div>
      {!decisions.length && <p className="uxp-hint">Every layout is a set of decisions, written down or not. Record the ones that matter, with what they rest on, so you can defend — or revise — them.</p>}
      {decisions.map((d) => {
        const { supports, contradicts } = supportOf(project, d.id);
        return (
          <button key={d.id} type="button" className={`uxp-dec${ungrounded.has(d.id) ? ' is-ungrounded' : ''}`} onClick={() => p.onShowNode(d.id)}>
            <span className="uxp-dec-label">{d.label}</span>
            {d.detail && <span className="uxp-dec-why">{d.detail}</span>}
            {d.tradeoffs && <span className="uxp-dec-why">Trade-off: {d.tradeoffs}</span>}
            <span className="uxp-dec-meta">
              {supports.length ? `Rests on ${supports.length}` : 'Rests on nothing yet'}
              {contradicts.length ? ` · contradicted by ${contradicts.length}` : ''}
              {ungrounded.has(d.id) ? ' · no evidence' : ''}
            </span>
          </button>
        );
      })}

      <span className="uxr-eyebrow uxp-sub">Assumptions ({assumptions.filter((a) => a.status === 'open').length} untested)</span>
      {assumptions.map((a) => (
        <div key={a.id} className={`uxp-asm st-${a.status}`}>
          <button type="button" className="uxp-asm-label" onClick={() => p.onShowNode(a.id)}>
            {a.label}
          </button>
          <div className="uxr-seg sm">
            {(['open', 'validated', 'invalidated'] as const).map((s) => (
              <button key={s} type="button" className={a.status === s ? 'is-on' : ''} onClick={() => dispatch({ type: 'node/update', id: a.id, patch: { status: s } })}>
                {s === 'open' ? 'untested' : s}
              </button>
            ))}
          </div>
        </div>
      ))}

      {alts.length > 0 && (
        <>
          <span className="uxr-eyebrow uxp-sub">Alternatives explored</span>
          {alts.map((a) => (
            <button key={a.id} type="button" className="uxp-dec" onClick={() => p.onSelect({ artboardId: a.id, elementId: null })}>
              <span className="uxp-dec-label">{a.name}</span>
              <span className="uxp-dec-why">{a.intent || 'No hypothesis written for it yet.'}</span>
            </button>
          ))}
        </>
      )}

      <div className="uxp-dec-foot">
        <button type="button" className="uxr-btn" disabled={p.busy} onClick={() => p.ask('reflect', INTENT_META.reflect.prompt)}>
          Document the reasoning with SocriaUX
        </button>
        <button type="button" className="uxr-btn ghost" onClick={() => download(`${project.name.replace(/[^\w-]+/g, '-').toLowerCase()}-reasoning.md`, reasoningMarkdown(project), 'text/markdown')}>
          Export as Markdown
        </button>
      </div>
    </div>
  );
}

// ── Code ─────────────────────────────────────────────────────────────

function CodeTab(p: Props) {
  const { project, dispatch } = p;
  const ab = project.artboards.find((a) => a.id === p.focusArtboardId);
  const gen = useMemo(() => (ab ? generateCode(ab) : null), [ab]);
  const [view, setView] = useState<'preview' | 'html' | 'css'>('preview');
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (k: string, t: string) =>
    navigator.clipboard?.writeText(t).then(() => {
      setCopied(k);
      window.setTimeout(() => setCopied(null), 1400);
    });
  return (
    <div className="uxp-section">
      {ab && gen ? (
        <>
          <div className="uxp-ev-head">
            <span className="uxr-eyebrow">{ab.name} as HTML and CSS</span>
            <div className="uxr-seg sm">
              {(['preview', 'html', 'css'] as const).map((v) => (
                <button key={v} type="button" className={view === v ? 'is-on' : ''} onClick={() => setView(v)}>
                  {v === 'preview' ? 'Preview' : v.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <p className="uxp-hint">Flow layout recovered from your positions: rows become flex rows, shapes around content become sections. A starting point to reason about, not production code.</p>
          {gen.notes.length > 0 && (
            <ul className="uxp-open">
              {gen.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          {view === 'preview' ? (
            <iframe className="uxp-frame" title={`${ab.name} preview`} sandbox="" srcDoc={gen.doc} />
          ) : (
            <div className="uxp-code">
              <div className="uxp-code-head">
                <span>{view === 'html' ? 'index.html' : 'styles.css'}</span>
                <button type="button" className="uxr-btn ghost sm" onClick={() => copy(view, view === 'html' ? gen.html : gen.css)}>
                  {copied === view ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="tall">
                <code>{view === 'html' ? gen.html : gen.css}</code>
              </pre>
            </div>
          )}
          <div className="uxp-dec-foot">
            <button type="button" className="uxr-btn" disabled={p.busy} onClick={() => p.ask('code', INTENT_META.code.prompt, { artboardId: ab.id, elementId: p.selection.elementId })}>
              {p.selection.elementId ? 'How do I build the selected element?' : 'How do I build this screen?'}
            </button>
            <button type="button" className="uxr-btn ghost" onClick={() => download(`${ab.name.replace(/[^\w-]+/g, '-').toLowerCase()}.html`, gen.doc, 'text/html')}>
              Download .html
            </button>
          </div>
        </>
      ) : (
        <p className="uxp-empty">Select a screen to see it as code.</p>
      )}

      <span className="uxr-eyebrow uxp-sub">Saved from SocriaUX ({project.code.length})</span>
      {!project.code.length && <p className="uxp-hint">Implementation snippets SocriaUX writes can be saved here from the thread.</p>}
      {project.code
        .slice()
        .reverse()
        .map((c) => (
          <div key={c.id} className="uxp-code">
            <div className="uxp-code-head">
              <span>
                {c.title} · {c.language}
              </span>
              <span className="uxp-code-actions">
                <button type="button" className="uxr-btn ghost sm" onClick={() => copy(c.id, c.content)}>
                  {copied === c.id ? 'Copied' : 'Copy'}
                </button>
                <button type="button" className="uxr-btn ghost sm danger" onClick={() => dispatch({ type: 'code/remove', id: c.id })}>
                  Delete
                </button>
              </span>
            </div>
            <pre>
              <code>{c.content}</code>
            </pre>
            {c.explanation && <p className="uxp-code-why">{c.explanation}</p>}
          </div>
        ))}
    </div>
  );
}
