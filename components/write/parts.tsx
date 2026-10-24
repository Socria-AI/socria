'use client';

// components/write/parts.tsx — what the Writing Space shows beside the page.
//
// A reading Socria was asked for, the edits it proposes (each on its own, to
// accept or reject), the findings of the proofreading with how sure each one
// is, the versions kept, and the pickers that link writing to the passages of
// the person's documents and the ideas on their Logic Map. None of it changes
// the writing until the person presses the one button that says what it does.

import { useMemo, useState } from 'react';
import type { SourceDoc } from '@/lib/docs/types';
import type { ThinkingMap } from '@/lib/logos';
import { docText, findText, wordCount, type Card, type Version, type WriteDoc } from '@/lib/write/doc';
import { ISSUE_KIND_LABEL, ISSUE_KINDS, type Issue, type IssueKind } from '@/lib/write/checks';
import { WRITE_OP_META, type AssistResult, type Role, type WriteOp } from '@/lib/write/assist';

const CERTAINTY: Record<Issue['certainty'], string> = { definite: 'Definite', likely: 'Likely', suggestion: 'A judgement call' };

export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 50) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** A proposed edit, located in the writing. */
export interface Proposal {
  id: string;
  block: string;
  s: number;
  e: number;
  from: string;
  to: string;
  why: string;
  kind?: string;
  /** the words have changed since it was proposed */
  stale?: boolean;
}

// ── a reading Socria was asked for ─────────────────────────────────

export function AssistPanel({
  op,
  result,
  loading,
  error,
  proposals,
  onAccept,
  onReject,
  onShow,
  onUseOption,
  onInsert,
  onAsk,
  onRetry,
}: {
  op: WriteOp;
  result: AssistResult | null;
  loading: boolean;
  error: string | null;
  proposals: Proposal[];
  onAccept: (p: Proposal) => void;
  onReject: (p: Proposal) => void;
  onShow: (p: Proposal) => void;
  onUseOption: (text: string) => void;
  onInsert: (text: string) => void;
  onAsk: () => void;
  onRetry: () => void;
}) {
  const meta = WRITE_OP_META[op];
  return (
    <div className="w-assist" aria-live="polite">
      <p className="w-eyebrow">
        {meta.label} · <span>{meta.blurb}</span>
      </p>
      {loading && <p className="w-quiet w-pulse">Reading what you wrote…</p>}
      {error && (
        <div className="w-error" role="alert">
          <p>{error}</p>
          <button type="button" className="w-btn" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {result && (
        <>
          {result.body && <p className="w-said">{result.body}</p>}
          {!!result.points?.length && (
            <ul className="w-points">
              {result.points.map((p, k) => (
                <li key={k}>{p}</li>
              ))}
            </ul>
          )}
          {result.question && <p className="w-q">{result.question}</p>}
          {(op === 'shorten' || op === 'improve') && (
            <div className="w-props">
              {proposals.length ? (
                <>
                  <p className="w-eyebrow">
                    {proposals.length} proposed edit{proposals.length === 1 ? '' : 's'} — review each; nothing changes until you accept it
                  </p>
                  <ul>
                    {proposals.map((p) => (
                      <li key={p.id} className={`w-prop${p.stale ? ' is-stale' : ''}`} onMouseEnter={() => onShow(p)} onFocus={() => onShow(p)} tabIndex={-1}>
                        <p className="w-diff">
                          <del>{p.from}</del>
                          {p.to ? <ins>{p.to}</ins> : <span className="w-cut">(cut)</span>}
                        </p>
                        <p className="w-why">{p.why}</p>
                        {p.stale ? (
                          <p className="w-quiet">The words changed since this was proposed.</p>
                        ) : (
                          <div className="w-row">
                            <button type="button" className="w-btn is-primary" onClick={() => onAccept(p)}>
                              Accept
                            </button>
                            <button type="button" className="w-btn" onClick={() => onReject(p)}>
                              Reject
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                !loading && <p className="w-quiet">No edits left to review.</p>
              )}
            </div>
          )}
          {op === 'develop' && (
            <div className="w-develop">
              {!!result.questions?.length && (
                <>
                  <p className="w-eyebrow">Questions only you can answer</p>
                  <ul className="w-points">
                    {result.questions.map((q, k) => (
                      <li key={k}>{q}</li>
                    ))}
                  </ul>
                </>
              )}
              {result.shape && (
                <>
                  <p className="w-eyebrow">A shape for it — the brackets are for your words</p>
                  <p className="w-shapeline">{result.shape}</p>
                </>
              )}
              {!!result.transitions?.length && (
                <>
                  <p className="w-eyebrow">Ways in from the paragraph before</p>
                  <div className="w-row is-wrap">
                    {result.transitions.map((t, k) => (
                      <button key={k} type="button" className="w-chip" title={`${t.why} — puts it at the start of the paragraph`} onClick={() => onInsert(t.text)}>
                        {t.text}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {result.missing && <p className="w-q">{result.missing}</p>}
            </div>
          )}
          {op === 'phrase' && !!result.options?.length && (
            <ul className="w-options">
              {result.options.map((o, k) => (
                <li key={k}>
                  <p>{o.text}</p>
                  <p className="w-why">{o.why}</p>
                  <button type="button" className="w-btn" onClick={() => onUseOption(o.text)}>
                    Use this wording
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(op === 'explain' || op === 'critique' || op === 'develop') && (
            <button type="button" className="w-link-btn" onClick={onAsk}>
              Talk it through in the conversation →
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── the proofreading ───────────────────────────────────────────────

export function CheckPanel({
  issues,
  onFix,
  onDismiss,
  onShow,
  onProofread,
  proofreading,
  scopeLabel,
  underline,
  onUnderline,
  error,
}: {
  issues: Issue[];
  onFix: (i: Issue) => void;
  onDismiss: (i: Issue) => void;
  onShow: (i: Issue) => void;
  onProofread: (focus: 'all' | 'grammar') => void;
  proofreading: boolean;
  scopeLabel: string;
  underline: boolean;
  onUnderline: (on: boolean) => void;
  error: string | null;
}) {
  const [kind, setKind] = useState<IssueKind | 'all'>('all');
  const counts = useMemo(() => {
    const c = new Map<IssueKind, number>();
    for (const i of issues) c.set(i.kind, (c.get(i.kind) ?? 0) + 1);
    return c;
  }, [issues]);
  const shown = issues.filter((i) => kind === 'all' || i.kind === kind);
  return (
    <div className="w-check">
      <p className="w-eyebrow">Proofreading · rules on your device; Socria only when you ask</p>
      <div className="w-row is-wrap" role="tablist" aria-label="Kinds of finding">
        <button type="button" role="tab" aria-selected={kind === 'all'} className={`w-chip${kind === 'all' ? ' is-on' : ''}`} onClick={() => setKind('all')}>
          All {issues.length}
        </button>
        {ISSUE_KINDS.filter((k) => counts.get(k)).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={`w-chip${kind === k ? ' is-on' : ''}`} onClick={() => setKind(k)}>
            {ISSUE_KIND_LABEL[k]} {counts.get(k)}
          </button>
        ))}
      </div>
      {!issues.length && <p className="w-quiet">Nothing the rules can see. Logic and whether a claim holds need a reading — ask for one below.</p>}
      <ul className="w-issues">
        {shown.map((i) => (
          <li key={i.id} className={`w-issue is-${i.certainty}`}>
            <button type="button" className="w-issue-head" onClick={() => onShow(i)}>
              <span className="w-issue-t">{i.title}</span>
              <span className={`w-badge is-${i.certainty}`}>{CERTAINTY[i.certainty]}</span>
              {i.by === 'socria' && <span className="w-badge is-socria">Socria</span>}
            </button>
            <p className="w-issue-words">“{i.text.length > 120 ? `${i.text.slice(0, 119)}…` : i.text}”</p>
            <p className="w-why">{i.why}</p>
            <div className="w-row">
              {i.fix !== undefined && (
                <button type="button" className="w-btn is-primary" onClick={() => onFix(i)} title={`Change it to “${i.fix}”`}>
                  Change to “{i.fix.length > 28 ? `${i.fix.slice(0, 27)}…` : i.fix}”
                </button>
              )}
              <button type="button" className="w-btn" onClick={() => onDismiss(i)}>
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="w-check-foot">
        <div className="w-row is-wrap">
          <button type="button" className="w-btn" onClick={() => onProofread('all')} disabled={proofreading}>
            {proofreading ? 'Socria is reading…' : `Ask Socria to proofread ${scopeLabel}`}
          </button>
          <button type="button" className="w-btn is-quiet" onClick={() => onProofread('grammar')} disabled={proofreading} title="Grammar, spelling and punctuation — nothing about the argument">
            The language only
          </button>
        </div>
        {error && <p className="w-error" role="alert">{error}</p>}
        <label className="w-toggle">
          <input type="checkbox" checked={underline} onChange={(e) => onUnderline(e.target.checked)} /> Underline what is definite or likely, as I write
        </label>
      </div>
    </div>
  );
}

/** The card shown under an underlined word. */
export function IssueCard({ issue, rect, onFix, onDismiss, onClose }: { issue: Issue; rect: DOMRect; onFix: () => void; onDismiss: () => void; onClose: () => void }) {
  const top = Math.min(rect.bottom + 8, (typeof window !== 'undefined' ? window.innerHeight : 800) - 180);
  const left = Math.max(12, Math.min(rect.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 312));
  return (
    <div className={`w-issuecard is-${issue.certainty}`} role="dialog" aria-label={issue.title} style={{ top, left }} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <p className="w-issue-head">
        <span className="w-issue-t">{issue.title}</span>
        <span className={`w-badge is-${issue.certainty}`}>{CERTAINTY[issue.certainty]}</span>
      </p>
      <p className="w-why">{issue.why}</p>
      <div className="w-row">
        {issue.fix !== undefined && (
          <button type="button" className="w-btn is-primary" onMouseDown={(e) => e.preventDefault()} onClick={onFix}>
            Change to “{issue.fix}”
          </button>
        )}
        <button type="button" className="w-btn" onMouseDown={(e) => e.preventDefault()} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

/**
 * A proposed edit, on its own words: what they would become and why — taken
 * or left right there. The page does not change until Accept is pressed.
 */
export function ProposalCard({ proposal, rect, onAccept, onReject, onClose }: { proposal: Proposal; rect: DOMRect; onAccept: () => void; onReject: () => void; onClose: () => void }) {
  const top = Math.min(rect.bottom + 8, (typeof window !== 'undefined' ? window.innerHeight : 800) - 200);
  const left = Math.max(12, Math.min(rect.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 332));
  return (
    <div className="w-issuecard is-proposal" role="dialog" aria-label="A proposed edit" style={{ top, left }} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <p className="w-issue-head">
        <span className="w-issue-t">Proposed edit</span>
        {proposal.kind && <span className="w-badge">{proposal.kind}</span>}
      </p>
      <p className="w-diff">
        <del>{proposal.from}</del>
        {proposal.to ? <ins>{proposal.to}</ins> : <span className="w-cut">(cut)</span>}
      </p>
      <p className="w-why">{proposal.why}</p>
      <div className="w-row">
        <button type="button" className="w-btn is-primary" onMouseDown={(e) => e.preventDefault()} onClick={onAccept}>
          Accept
        </button>
        <button type="button" className="w-btn" onMouseDown={(e) => e.preventDefault()} onClick={onReject}>
          Reject
        </button>
      </div>
    </div>
  );
}

// ── the argument's structure ──────────────────────────────────────

const ROLE_LABEL: Record<Role, string> = {
  claim: 'Claim',
  reason: 'Reason',
  evidence: 'Evidence',
  example: 'Example',
  counter: 'Objection',
  response: 'Answer',
  background: 'Background',
  transition: 'Link',
  conclusion: 'Conclusion',
  other: 'Other',
};

/**
 * A reverse outline: what each paragraph does, said about it; the sentence
 * that reads as the main claim, found in their words; moves to consider,
 * each one press and one undo; gaps as questions. Nothing here writes.
 */
export function StructurePanel({
  doc,
  result,
  loading,
  error,
  onShow,
  onMove,
  onRetry,
}: {
  doc: WriteDoc;
  result: AssistResult | null;
  loading: boolean;
  error: string | null;
  onShow: (block: string, s: number, e: number) => void;
  onMove: (block: string, after: string | null) => void;
  onRetry: () => void;
}) {
  const label = (id: string) => {
    const b = findText(doc, id);
    if (!b) return 'a paragraph that is no longer there';
    const t = b.text.replace(/\s+/g, ' ').trim();
    return `“${t.length > 60 ? `${t.slice(0, 59)}…` : t}”`;
  };
  const thesis = result?.thesis;
  const tb = thesis ? findText(doc, thesis.block) : null;
  const at = tb && thesis ? tb.text.indexOf(thesis.quote) : -1;
  return (
    <div className="w-structure" aria-live="polite">
      <p className="w-eyebrow">
        Structure · <span>what each paragraph does, read back to you</span>
      </p>
      {loading && <p className="w-quiet w-pulse">Reading the argument…</p>}
      {error && (
        <div className="w-error" role="alert">
          <p>{error}</p>
          <button type="button" className="w-btn" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {result && (
        <>
          {thesis && at >= 0 ? (
            <div className="w-thesis">
              <p className="w-eyebrow">What reads as your main claim</p>
              <button type="button" className="w-thesis-q" onClick={() => onShow(thesis.block, at, at + thesis.quote.length)}>
                “{thesis.quote}”
              </button>
              <p className="w-quiet">If that is not the claim you mean to make, the reader may not find it either.</p>
            </div>
          ) : (
            <p className="w-q">Nothing reads clearly as one main claim yet — what is the one sentence you want a reader to come away with?</p>
          )}
          {!!result.outline?.length && (
            <ol className="w-reverse">
              {result.outline.map((o) => (
                <li key={o.block} className={findText(doc, o.block) ? '' : 'is-gone'}>
                  <span className={`w-role is-${o.role}`}>{ROLE_LABEL[o.role]}</span>
                  <button type="button" className="w-reverse-go" onClick={() => onShow(o.block, 0, 0)} title={label(o.block)}>
                    {o.does}
                  </button>
                </li>
              ))}
            </ol>
          )}
          {!!result.moves?.length && (
            <div className="w-moves">
              <p className="w-eyebrow">Moves to consider — each one changes only the order</p>
              <ul className="w-props">
                {result.moves.map((m) => (
                  <li key={m.block} className="w-prop">
                    <p>
                      Move {label(m.block)} {m.after ? <>after {label(m.after)}</> : 'to the top'}
                    </p>
                    <p className="w-why">{m.why}</p>
                    <div className="w-row">
                      <button type="button" className="w-btn" disabled={!findText(doc, m.block) || (m.after !== null && !findText(doc, m.after))} onClick={() => onMove(m.block, m.after)}>
                        Move it
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!result.gaps?.length && (
            <>
              <p className="w-eyebrow">Questions the argument leaves open</p>
              <ul className="w-points">
                {result.gaps.map((g, k) => (
                  <li key={k}>{g}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── versions ───────────────────────────────────────────────────────

const WHY: Record<Version['why'], string> = { auto: 'Kept as you wrote', manual: 'Kept by you', import: 'Before an import', restore: 'Before a restore', outline: 'Before an outline was added' };

export function VersionsPanel({ doc, onKeep, onRestore }: { doc: WriteDoc; onKeep: (name: string) => void; onRestore: (v: Version) => void }) {
  const [name, setName] = useState('');
  const [peek, setPeek] = useState<string | null>(null);
  return (
    <div className="w-versions">
      <p className="w-eyebrow">Versions · kept with the conversation; a restore keeps what it replaces</p>
      <form
        className="w-row"
        onSubmit={(e) => {
          e.preventDefault();
          onKeep(name);
          setName('');
        }}
      >
        <input className="w-input" value={name} placeholder="Name this version (optional)" aria-label="Version name" onChange={(e) => setName(e.target.value)} maxLength={80} />
        <button type="submit" className="w-btn is-primary">
          Keep a version
        </button>
      </form>
      {!doc.versions.length && <p className="w-quiet">No versions yet — one is kept by itself every ten minutes or so of writing, and before anything replaces your words.</p>}
      <ul className="w-vlist">
        {doc.versions.map((v) => (
          <li key={v.id}>
            <div className="w-row">
              <span className="w-vname">{v.name || WHY[v.why]}</span>
              <span className="w-quiet">
                {ago(v.at)} · {wordCount(docText(v)).toLocaleString()} words
              </span>
            </div>
            <div className="w-row">
              <button type="button" className="w-btn is-quiet" aria-expanded={peek === v.id} onClick={() => setPeek((p) => (p === v.id ? null : v.id))}>
                {peek === v.id ? 'Hide' : 'Look'}
              </button>
              <button type="button" className="w-btn" onClick={() => onRestore(v)}>
                Restore
              </button>
            </div>
            {peek === v.id && (
              <div className="w-peek">
                {v.title && <p className="w-peek-title">{v.title}</p>}
                {v.blocks.slice(0, 40).map((b) => (
                  <p key={b.id} className={`w-peek-${b.t}`}>
                    {b.t === 'img' ? `[Picture${b.alt ? `: ${b.alt}` : ''}]` : b.t === 'hr' ? '———' : b.t === 'pb' ? '[Page break]' : b.t === 'table' ? `[Table: ${b.rows?.length ?? 0} rows]` : b.text}
                  </p>
                ))}
                {v.blocks.length > 40 && <p className="w-quiet">…and {v.blocks.length - 40} more paragraphs.</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── linking: passages, map ideas, cards ─────────────────────────────

export interface Pick {
  k: 'doc' | 'node' | 'card';
  id: string;
  doc?: string;
  label: string;
  quote?: string;
}

const unitOf = (d: SourceDoc) => (d.format === 'pptx' || d.format === 'odp' ? 'slide' : d.format === 'xlsx' || d.format === 'ods' ? 'sheet' : 'p.');

export function LinkPicker({
  mode,
  docs,
  map,
  cards,
  exclude,
  onPick,
  onClose,
}: {
  mode: 'doc' | 'node' | 'card';
  docs: ReadonlyMap<string, SourceDoc>;
  map: ThinkingMap | null;
  cards: Card[];
  exclude?: string;
  onPick: (p: Pick) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const items: Pick[] = useMemo(() => {
    if (mode === 'doc') {
      const out: Pick[] = [];
      for (const d of Array.from(docs.values())) {
        for (const b of d.blocks) {
          if (b.kind === 'header' || b.kind === 'footer' || b.kind === 'figure' || !b.text.trim()) continue;
          const label = `${d.name.replace(/\.[^.]+$/, '')}, ${unitOf(d)} ${b.page}`;
          out.push({ k: 'doc', id: b.id, doc: d.id, label, quote: b.text.replace(/\s+/g, ' ').trim().slice(0, 400) });
        }
      }
      return out;
    }
    if (mode === 'node') return (map?.nodes ?? []).map((n) => ({ k: 'node' as const, id: n.id, label: n.label }));
    return cards.filter((c) => c.id !== exclude && c.text.trim()).map((c) => ({ k: 'card' as const, id: c.id, label: c.text.slice(0, 120) }));
  }, [mode, docs, map, cards, exclude]);
  const shown = items.filter((i) => !needle || i.label.toLowerCase().includes(needle) || (i.quote ?? '').toLowerCase().includes(needle)).slice(0, 80);
  const title = mode === 'doc' ? 'Link a passage from your files' : mode === 'node' ? 'Link an idea on the Logic Map' : 'Link another card';
  const empty =
    mode === 'doc'
      ? 'No documents have been read in this conversation on this device yet. Add one in Components, then link its passages here.'
      : mode === 'node'
        ? 'The Logic Map has no ideas yet.'
        : 'There are no other cards yet.';
  return (
    <div className="w-picker" role="dialog" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="w-row">
        <p className="w-eyebrow">{title}</p>
        <button type="button" className="w-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {items.length > 0 && <input className="w-input" autoFocus value={q} placeholder="Search" aria-label="Search" onChange={(e) => setQ(e.target.value)} />}
      {!items.length && <p className="w-quiet">{empty}</p>}
      <ul className="w-picks">
        {shown.map((i) => (
          <li key={`${i.k}:${i.doc ?? ''}:${i.id}`}>
            <button type="button" onClick={() => onPick(i)}>
              <span className="w-pick-l">{i.label}</span>
              {i.quote && <span className="w-pick-q">“{i.quote.length > 150 ? `${i.quote.slice(0, 149)}…` : i.quote}”</span>}
            </button>
          </li>
        ))}
      </ul>
      {items.length > shown.length && !needle && <p className="w-quiet">Search to see more — {items.length.toLocaleString()} in all.</p>}
    </div>
  );
}
