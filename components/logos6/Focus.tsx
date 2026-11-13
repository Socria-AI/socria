'use client';
// components/logos6/Focus.tsx — ONE IDEA, AND WHAT HOLDS IT UP (Logos 6, Phase 2; docs/LOGOS-6.md §3).
//
// The micro end of macro-to-micro. One idea, large, with what it rests on to one side and what rests on it to the
// other, what pulls against it, the passages it rests on in their documents, the findings about it and what became
// of them, and the turn it came from. Breadcrumbs say where it sits — Project › Line › Idea — and each is a way up.
//
// It is a reading of the map, not a seventh drawing of it: lists of cards, read through lib/logos6/support.ts, so
// it says exactly what the Logic Map's lines say. It opens over the conversation and Escape closes it — never a new
// panel beside the one that is there.

import { useEffect, useRef } from 'react';
import type { LogosNode, ThinkingMap } from '@/lib/logos';
import { KIND_LABEL } from '@/lib/challenge/challenge';
import { besides, foundations, pulledAgainst, restingOn, restsOn } from '@/lib/logos6/support';
import './logos6.css';

export interface FocusProps {
  map: ThinkingMap;
  id: string;
  /** the line's title, and its Project's name when filed */
  line: string;
  project?: string | null;
  /** findings about this idea, from this line's challenges: what each said, and what became of it */
  findings?: { kind: keyof typeof KIND_LABEL; text: string; state: string }[];
  /** the passages it rests on, named for the person */
  evidence?: { key: string; name: string; quote: string; verdict?: string; doc: string; block: string }[];
  /** the words that put it on the map, when the turn is known */
  came?: { said: string; id: string } | null;
  /** what can be done from here (each optional: shown only where it does something) */
  onIdea: (id: string) => void;
  onClose: () => void;
  onLine?: () => void;
  onProject?: () => void;
  onChallenge?: () => void;
  onSimpler?: () => void;
  onDeeper?: () => void;
  onExplainBack?: () => void;
  onCheckSources?: () => void;
  onShowOnMap?: () => void;
  onCame?: () => void;
  onEvidence?: (doc: string, block: string) => void;
  onCopyLink?: () => void;
}

const TYPE_WORD: Partial<Record<LogosNode['type'], string>> = {
  claim: 'Claim',
  assumption: 'Assumption',
  evidence: 'Evidence',
  decision: 'Decision',
  goal: 'Goal',
  question: 'Question',
  tension: 'Tension',
  counterpoint: 'Counterpoint',
  consequence: 'Consequence',
  constraint: 'Constraint',
  value: 'Value',
  concept: 'Concept',
  idea: 'Idea',
};
const kindOf = (n: LogosNode) => TYPE_WORD[n.type] ?? n.type.charAt(0).toUpperCase() + n.type.slice(1);

function Cards({ title, empty, nodes, onIdea }: { title: string; empty: string; nodes: LogosNode[]; onIdea: (id: string) => void }) {
  return (
    <section className="l6f-col" aria-label={title}>
      <h4 className="l6f-h">{title}</h4>
      {nodes.length ? (
        <ul className="l6f-cards">
          {nodes.map((n) => (
            <li key={n.id}>
              <button type="button" className={`l6f-card is-${n.type}${n.finding ? ' is-finding' : ''}`} onClick={() => onIdea(n.id)}>
                <span className="l6f-k">{n.finding ? KIND_LABEL[n.finding.kind] : kindOf(n)}</span>
                <span className="l6f-t">{n.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="l6f-empty">{empty}</p>
      )}
    </section>
  );
}

export function Focus(p: FocusProps) {
  const node = p.map.nodes.find((n) => n.id === p.id);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        p.onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);
  if (!node) return null;
  const under = restsOn(p.map, node.id);
  const over = restingOn(p.map, node.id);
  const against = pulledAgainst(p.map, node.id);
  const near = besides(p.map, node.id).filter((n) => !n.finding);
  const deep = foundations(p.map, node.id).length;
  return (
    <div className="l6-focus" role="dialog" aria-modal="false" aria-label={`Focus: ${node.label}`} ref={ref} tabIndex={-1}>
      <nav className="l6f-crumbs" aria-label="Where this idea sits">
        {p.project && (
          <>
            {p.onProject ? (
              <button type="button" className="l6f-crumb" onClick={p.onProject}>
                {p.project}
              </button>
            ) : (
              <span className="l6f-crumb is-still">{p.project}</span>
            )}
            <span className="l6f-sep" aria-hidden="true">
              ›
            </span>
          </>
        )}
        {p.onLine ? (
          <button type="button" className="l6f-crumb" onClick={p.onLine}>
            {p.line}
          </button>
        ) : (
          <span className="l6f-crumb is-still">{p.line}</span>
        )}
        <span className="l6f-sep" aria-hidden="true">
          ›
        </span>
        <span className="l6f-crumb is-here" aria-current="page">
          {node.label.length > 48 ? `${node.label.slice(0, 47)}…` : node.label}
        </span>
        <button type="button" className="l6f-close" aria-label="Close Focus (Escape)" title="Close (Escape)" onClick={p.onClose}>
          ×
        </button>
      </nav>

      <div className="l6f-grid">
        <Cards title="Rests on" empty="Nothing under it yet." nodes={under} onIdea={p.onIdea} />
        <section className="l6f-core" aria-label="The idea">
          <p className="l6f-kind">
            {node.finding ? `${KIND_LABEL[node.finding.kind]} · Socria’s, kept by you` : kindOf(node)}
            {node.status && node.status !== 'open' ? ` · ${node.status}` : ''}
          </p>
          <h3 className="l6f-idea">{node.label}</h3>
          {node.detail && <p className="l6f-detail">{node.detail}</p>}
          <p className="l6f-weight">
            {over.length ? `${over.length === 1 ? 'One idea rests' : `${over.length} ideas rest`} on it directly` : 'Nothing rests on it yet'}
            {deep ? ` · it stands on ${deep === 1 ? 'one idea' : `${deep} ideas`} below` : ''}
          </p>
          <div className="l6f-acts" role="group" aria-label="What to do with this idea">
            {p.onChallenge && (
              <button type="button" className="l6f-act is-primary" onClick={p.onChallenge}>
                Challenge it
              </button>
            )}
            {p.onSimpler && (
              <button type="button" className="l6f-act" onClick={p.onSimpler}>
                Simpler
              </button>
            )}
            {p.onDeeper && (
              <button type="button" className="l6f-act" onClick={p.onDeeper}>
                Deeper
              </button>
            )}
            {p.onExplainBack && (
              <button type="button" className="l6f-act" onClick={p.onExplainBack}>
                Explain it back
              </button>
            )}
            {p.onCheckSources && (
              <button type="button" className="l6f-act" onClick={p.onCheckSources}>
                Check against my sources
              </button>
            )}
            {p.onShowOnMap && (
              <button type="button" className="l6f-act" onClick={p.onShowOnMap}>
                Show on the Logic Map
              </button>
            )}
            {p.onCopyLink && (
              <button type="button" className="l6f-act" onClick={p.onCopyLink}>
                Copy link
              </button>
            )}
          </div>
          {p.came && (
            <p className="l6f-came">
              <span className="l6f-k2">Came from:</span>{' '}
              {p.onCame ? (
                <button type="button" className="l6f-link" onClick={p.onCame}>
                  “{p.came.said.length > 120 ? `${p.came.said.slice(0, 119)}…` : p.came.said}”
                </button>
              ) : (
                <q>{p.came.said}</q>
              )}
            </p>
          )}
        </section>
        <Cards title="Rests on it" empty="Nothing builds on it yet." nodes={over} onIdea={p.onIdea} />
      </div>

      <div className="l6f-below">
        {against.length > 0 && <Cards title="Pulls against it" empty="" nodes={against} onIdea={p.onIdea} />}
        {(p.evidence?.length ?? 0) > 0 && (
          <section className="l6f-col" aria-label="In your sources">
            <h4 className="l6f-h">In your sources</h4>
            <ul className="l6f-cards">
              {p.evidence!.map((e) => (
                <li key={`${e.doc}:${e.block}`}>
                  <button type="button" className={`l6f-card is-source${e.verdict ? ` is-${e.verdict}` : ''}`} onClick={() => p.onEvidence?.(e.doc, e.block)}>
                    <span className="l6f-k">
                      {e.name} · {e.key}
                      {e.verdict ? ` · ${e.verdict === 'partly' ? 'partly supports it' : e.verdict === 'contradicted' ? 'cuts against it' : 'supports it'}` : ''}
                    </span>
                    <span className="l6f-t">“{e.quote}”</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {(p.findings?.length ?? 0) > 0 && (
          <section className="l6f-col" aria-label="Worth checking, about it">
            <h4 className="l6f-h">Worth checking, about it</h4>
            <ul className="l6f-cards">
              {p.findings!.map((f, i) => (
                <li key={i} className={`l6f-finding is-${f.state}`}>
                  <span className="l6f-k">
                    {KIND_LABEL[f.kind]}
                    {f.state !== 'open' ? ` · ${f.state === 'kept' ? 'on your map' : f.state === 'considered' ? 'thought about' : f.state === 'dismissed' ? 'not relevant' : 'resolved'}` : ''}
                  </span>
                  <span className="l6f-t">{f.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {near.length > 0 && <Cards title="Also connected" empty="" nodes={near.slice(0, 6)} onIdea={p.onIdea} />}
      </div>
    </div>
  );
}
