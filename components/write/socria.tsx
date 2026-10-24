'use client';

// components/write/socria.tsx — the one place the Writing Space asks Socria.
//
// Three tabs, each a plain job:
//
//   Check             what is wrong or worth a look — the rules on the device,
//                     grouped (the language; how it reads; what holds it up),
//                     every definite slip fixable at once, and Socria's own
//                     reading only when asked for;
//   Improve           the selected words, or the paragraph the cursor is in:
//                     clearer, shorter, or other wordings — edits to accept or
//                     reject one at a time, never applied unasked;
//   Think it through  questions only the writer can answer, where the argument
//                     gives way, and how the whole is organised — none of it
//                     writes a sentence for them.
//
// Nothing here changes the writing until the button that says what it does
// is pressed.

import { useMemo } from 'react';
import { findText, type WriteDoc } from '@/lib/write/doc';
import { ISSUE_GROUPS, type Issue } from '@/lib/write/checks';
import type { AssistResult, WriteOp } from '@/lib/write/assist';
import { StructurePanel, type Proposal } from './parts';

export type SocriaTab = 'check' | 'improve' | 'think';
export type ImproveOp = 'improve' | 'shorten' | 'phrase';
export type ThinkOp = 'develop' | 'critique' | 'structure';

/** A reading Socria was asked for, and where it stands. */
export interface Asked {
  op: WriteOp;
  result: AssistResult | null;
  loading: boolean;
  error: string | null;
}

/** What Improve and Think work on: the selected words, or the paragraph the cursor is in. */
export interface Target {
  kind: 'selection' | 'paragraph';
  words: number;
  text: string;
}

const CERTAINTY: Record<Issue['certainty'], string> = { definite: 'Definite', likely: 'Likely', suggestion: 'A judgement call' };
const keep = (e: React.MouseEvent) => e.preventDefault();
const clip = (t: string, n: number) => {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

export function SocriaPanel(p: {
  tab: SocriaTab;
  onTab: (t: SocriaTab) => void;
  doc: WriteDoc;
  target: Target | null;
  // Check
  issues: Issue[];
  onFix: (i: Issue) => void;
  onDismiss: (i: Issue) => void;
  onShowIssue: (i: Issue) => void;
  onFixAll: (list: Issue[]) => void;
  onProofread: (focus: 'all' | 'grammar') => void;
  proofreading: boolean;
  proofError: string | null;
  scopeLabel: string;
  underline: boolean;
  onUnderline: (on: boolean) => void;
  // Improve
  improve: Asked | null;
  proposals: Proposal[];
  onImprove: (op: ImproveOp) => void;
  onAccept: (p: Proposal) => void;
  onReject: (p: Proposal) => void;
  onAcceptAll: () => void;
  onShowProposal: (p: Proposal) => void;
  onUseOption: (text: string) => void;
  // Think it through
  think: Asked | null;
  onThink: (op: ThinkOp) => void;
  onInsert: (text: string) => void;
  onAsk: () => void;
  onMove: (block: string, after: string | null) => void;
  onShowSpan: (block: string, s: number, e: number) => void;
}) {
  const toFix = p.issues.filter((i) => i.certainty !== 'suggestion').length;
  const tabs: [SocriaTab, string][] = [
    ['check', 'Check'],
    ['improve', 'Improve'],
    ['think', 'Think it through'],
  ];
  return (
    <div className="w-socria">
      <div className="w-tabs" role="tablist" aria-label="What to ask Socria">
        {tabs.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={p.tab === t} className={p.tab === t ? 'is-on' : ''} onMouseDown={keep} onClick={() => p.onTab(t)}>
            {label}
            {t === 'check' && toFix > 0 && <span className="w-num">{toFix}</span>}
          </button>
        ))}
      </div>
      {p.tab === 'check' && <CheckTab {...p} />}
      {p.tab === 'improve' && <ImproveTab {...p} />}
      {p.tab === 'think' && <ThinkTab {...p} />}
    </div>
  );
}

// ── Check ────────────────────────────────────────────────────────────

/** The words a finding is on, in the sentence around them. */
function contextOf(doc: WriteDoc, i: Issue): { before: string; words: string; after: string } {
  const text = findText(doc, i.block)?.text ?? '';
  if (text.slice(i.s, i.e) !== i.text) return { before: '', words: clip(i.text, 90), after: '' };
  if (i.e - i.s > 90) return { before: '', words: clip(i.text, 90), after: '' };
  let a = Math.max(0, i.s - 38);
  let b = Math.min(text.length, i.e + 38);
  if (a > 0) a = text.indexOf(' ', a) + 1 || a;
  if (b < text.length) b = text.lastIndexOf(' ', b) > i.e ? text.lastIndexOf(' ', b) : b;
  return {
    before: (a > 0 ? '…' : '') + text.slice(a, i.s).replace(/\s+/g, ' '),
    words: text.slice(i.s, i.e) || ' ',
    after: text.slice(i.e, b).replace(/\s+/g, ' ') + (b < text.length ? '…' : ''),
  };
}

function CheckTab(p: Parameters<typeof SocriaPanel>[0]) {
  const fixable = useMemo(() => p.issues.filter((i) => i.certainty === 'definite' && i.fix !== undefined), [p.issues]);
  const toFix = p.issues.filter((i) => i.certainty !== 'suggestion').length;
  const toConsider = p.issues.length - toFix;
  return (
    <div className="w-check">
      {p.issues.length ? (
        <div className="w-check-sum">
          <p>
            {toFix > 0 && (
              <>
                <b>{toFix}</b> to fix
              </>
            )}
            {toFix > 0 && toConsider > 0 && ' · '}
            {toConsider > 0 && <>{toConsider} to consider</>}
          </p>
          {fixable.length > 1 && (
            <button type="button" className="w-btn is-primary" onMouseDown={keep} onClick={() => p.onFixAll(fixable)} title="Make every definite change at once — one Undo takes them all back">
              Fix all {fixable.length}
            </button>
          )}
        </div>
      ) : (
        <p className="w-quiet">Nothing the rules can see. Whether the argument holds needs a reading — ask Socria below, or try Think it through.</p>
      )}
      {ISSUE_GROUPS.map((g) => {
        const list = p.issues.filter((i) => g.kinds.includes(i.kind));
        if (!list.length) return null;
        return (
          <section key={g.key} className="w-igroup" aria-label={g.label}>
            <h3 className="w-igroup-h">
              {g.label} <span>{list.length}</span>
            </h3>
            <ul className="w-issues">
              {list.map((i) => {
                const c = contextOf(p.doc, i);
                return (
                  <li key={i.id} className={`w-issue is-${i.certainty}`}>
                    <button type="button" className="w-issue-main" onMouseDown={keep} onClick={() => p.onShowIssue(i)} title="Show it in the writing">
                      <span className="w-issue-head">
                        <span className="w-issue-t">{i.title}</span>
                        <span className={`w-badge is-${i.certainty}`}>{CERTAINTY[i.certainty]}</span>
                        {i.by === 'socria' && <span className="w-badge is-socria">Socria</span>}
                      </span>
                      <span className="w-issue-ctx">
                        {c.before}
                        <mark>{c.words}</mark>
                        {c.after}
                      </span>
                    </button>
                    <p className="w-why">{i.why}</p>
                    <div className="w-row">
                      {i.fix !== undefined && (
                        <button type="button" className="w-btn is-primary is-small" onMouseDown={keep} onClick={() => p.onFix(i)} title={`Change it to “${i.fix}”`}>
                          {i.fix.trim() ? `Change to “${clip(i.fix, 26)}”` : 'Remove it'}
                        </button>
                      )}
                      <button type="button" className="w-btn is-quiet is-small" onMouseDown={keep} onClick={() => p.onDismiss(i)}>
                        Dismiss
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <div className="w-check-foot">
        <p className="w-quiet">The checks above run on your device as you write. Socria can read {p.scopeLabel} for what rules cannot see.</p>
        <div className="w-row is-wrap">
          <button type="button" className="w-btn" onMouseDown={keep} onClick={() => p.onProofread('all')} disabled={p.proofreading}>
            {p.proofreading ? 'Socria is reading…' : 'Check with Socria'}
          </button>
          <button type="button" className="w-btn is-quiet" onMouseDown={keep} onClick={() => p.onProofread('grammar')} disabled={p.proofreading} title="Grammar, spelling and punctuation — nothing about the argument">
            The language only
          </button>
        </div>
        {p.proofError && (
          <p className="w-error" role="alert">
            {p.proofError}
          </p>
        )}
        <label className="w-toggle">
          <input type="checkbox" checked={p.underline} onChange={(e) => p.onUnderline(e.target.checked)} /> Underline what is definite or likely, as I write
        </label>
      </div>
    </div>
  );
}

// ── Improve ──────────────────────────────────────────────────────────

const IMPROVE: [ImproveOp, string, string][] = [
  ['improve', 'Clearer', 'Edits to review, in your voice'],
  ['shorten', 'Shorter', 'Cuts to review, one by one'],
  ['phrase', 'Other wordings', 'A few ways to say it, to choose from'],
];

function TargetLine({ target, what }: { target: Target | null; what: string }) {
  if (!target) return <p className="w-target is-none">Select some words, or put the cursor in a paragraph, then choose {what}.</p>;
  return (
    <div className="w-target">
      <p className="w-target-k">{target.kind === 'selection' ? `The selected words · ${target.words.toLocaleString()} word${target.words === 1 ? '' : 's'}` : 'The paragraph your cursor is in'}</p>
      <p className="w-target-q">“{clip(target.text, 150)}”</p>
    </div>
  );
}

function Working({ asked, onRetry }: { asked: Asked; onRetry: () => void }) {
  if (asked.loading) return <p className="w-quiet w-pulse">Reading what you wrote…</p>;
  if (asked.error)
    return (
      <div className="w-error" role="alert">
        <p>{asked.error}</p>
        <button type="button" className="w-btn" onMouseDown={keep} onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  return null;
}

function ImproveTab(p: Parameters<typeof SocriaPanel>[0]) {
  const a = p.improve;
  const live = p.proposals.filter((x) => !x.stale);
  return (
    <div className="w-improve">
      <TargetLine target={p.target} what="how to improve it" />
      <div className="w-choices">
        {IMPROVE.map(([op, label, blurb]) => (
          <button key={op} type="button" className={`w-choice${a?.op === op ? ' is-on' : ''}`} disabled={!p.target || !!a?.loading} onMouseDown={keep} onClick={() => p.onImprove(op)}>
            <b>{label}</b>
            <span>{blurb}</span>
          </button>
        ))}
      </div>
      {a && <Working asked={a} onRetry={() => p.onImprove(a.op as ImproveOp)} />}
      {a?.result && (
        <div className="w-result" aria-live="polite">
          {a.result.body && <p className="w-said">{a.result.body}</p>}
          {(a.op === 'improve' || a.op === 'shorten') &&
            (p.proposals.length ? (
              <>
                <div className="w-result-head">
                  <p className="w-eyebrow">
                    {live.length} suggested edit{live.length === 1 ? '' : 's'}
                  </p>
                  {live.length > 1 && (
                    <button type="button" className="w-btn is-small" onMouseDown={keep} onClick={p.onAcceptAll} title="Make every suggested edit — one Undo takes them all back">
                      Accept all
                    </button>
                  )}
                </div>
                <ul className="w-props">
                  {p.proposals.map((x) => (
                    <li key={x.id} className={`w-prop${x.stale ? ' is-stale' : ''}`} onMouseEnter={() => p.onShowProposal(x)}>
                      <p className="w-diff">
                        <del>{x.from}</del>
                        {x.to ? <ins>{x.to}</ins> : <span className="w-cut">(cut)</span>}
                      </p>
                      <p className="w-why">{x.why}</p>
                      {x.stale ? (
                        <p className="w-quiet">The words changed since this was suggested.</p>
                      ) : (
                        <div className="w-row">
                          <button type="button" className="w-btn is-primary is-small" onMouseDown={keep} onClick={() => p.onAccept(x)}>
                            Accept
                          </button>
                          <button type="button" className="w-btn is-quiet is-small" onMouseDown={keep} onClick={() => p.onReject(x)}>
                            Reject
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              !a.loading && <p className="w-quiet">No edits left to review.</p>
            ))}
          {a.op === 'phrase' &&
            (a.result.options?.length ? (
              <ul className="w-options">
                {a.result.options.map((o, k) => (
                  <li key={k}>
                    <p>{o.text}</p>
                    <p className="w-why">{o.why}</p>
                    <button type="button" className="w-btn is-small" onMouseDown={keep} onClick={() => p.onUseOption(o.text)}>
                      Use this wording
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="w-quiet">Socria had no other wording worth offering.</p>
            ))}
        </div>
      )}
      <p className="w-quiet w-foot-note">Your words stay yours: nothing changes until you accept it, and Undo takes it back.</p>
    </div>
  );
}

// ── Think it through ─────────────────────────────────────────────────

const THINK: [ThinkOp, string, string][] = [
  ['develop', 'Questions to develop it', 'What only you can answer — never the sentence'],
  ['critique', 'Where it gives way', 'The spots a careful reader would push on'],
  ['structure', 'How it’s organised', 'What each paragraph does, for the whole piece'],
];

function ThinkTab(p: Parameters<typeof SocriaPanel>[0]) {
  const a = p.think;
  const r = a?.result;
  return (
    <div className="w-think">
      <TargetLine target={p.target} what="what to think through" />
      <div className="w-choices">
        {THINK.map(([op, label, blurb]) => (
          <button key={op} type="button" className={`w-choice${a?.op === op ? ' is-on' : ''}`} disabled={(op !== 'structure' && !p.target) || !!a?.loading} onMouseDown={keep} onClick={() => p.onThink(op)}>
            <b>{label}</b>
            <span>{blurb}</span>
          </button>
        ))}
      </div>
      {a && a.op !== 'structure' && <Working asked={a} onRetry={() => p.onThink(a.op as ThinkOp)} />}
      {a?.op === 'structure' && (
        <StructurePanel doc={p.doc} result={a.result} loading={a.loading} error={a.error} onShow={p.onShowSpan} onMove={p.onMove} onRetry={() => p.onThink('structure')} />
      )}
      {r && a?.op !== 'structure' && (
        <div className="w-result" aria-live="polite">
          {r.body && <p className="w-said">{r.body}</p>}
          {!!r.points?.length && (
            <ul className="w-points">
              {r.points.map((x, k) => (
                <li key={k}>{x}</li>
              ))}
            </ul>
          )}
          {r.question && <p className="w-q">{r.question}</p>}
          {a?.op === 'develop' && (
            <div className="w-develop">
              {!!r.questions?.length && (
                <>
                  <p className="w-eyebrow">Questions only you can answer</p>
                  <ul className="w-points">
                    {r.questions.map((q, k) => (
                      <li key={k}>{q}</li>
                    ))}
                  </ul>
                </>
              )}
              {r.shape && (
                <>
                  <p className="w-eyebrow">A shape for it — the brackets are for your words</p>
                  <p className="w-shapeline">{r.shape}</p>
                </>
              )}
              {!!r.transitions?.length && (
                <>
                  <p className="w-eyebrow">Ways in from the paragraph before</p>
                  <div className="w-row is-wrap">
                    {r.transitions.map((t, k) => (
                      <button key={k} type="button" className="w-chip" title={`${t.why} — puts it at the start of the paragraph`} onMouseDown={keep} onClick={() => p.onInsert(t.text)}>
                        {t.text}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {r.missing && <p className="w-q">{r.missing}</p>}
            </div>
          )}
          <button type="button" className="w-link-btn" onMouseDown={keep} onClick={p.onAsk}>
            Talk it through in the conversation →
          </button>
        </div>
      )}
    </div>
  );
}
