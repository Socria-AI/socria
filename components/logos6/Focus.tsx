'use client';
// components/logos6/Focus.tsx — one idea, and what holds it up (Logos 6, Phase 2).
//
// The app's sheet (components/one/one-sheet.css), as the One and Sleep sheets are: the page dimmed, the bare ×, a
// label over the serif title, hairline rows, one filled control and words for everything else. A bottom sheet on a
// phone. It reads the map through lib/logos6/support.ts, so it says what the Logic Map's lines say.

import { useEffect, useRef, type ReactNode } from 'react';
import type { LogosNode, ThinkingMap } from '@/lib/logos';
import { KIND_LABEL } from '@/lib/challenge/challenge';
import { besides, pulledAgainst, restingOn, restsOn } from '@/lib/logos6/support';
import { L5Close } from '@/components/logos5/L5Chrome';
import '@/components/one/one-sheet.css';
import './logos6.css';

export interface FocusProps {
  map: ThinkingMap;
  id: string;
  line: string;
  project?: string | null;
  findings?: { kind: keyof typeof KIND_LABEL; text: string; state: string }[];
  evidence?: { key: string; name: string; quote: string; verdict?: string; doc: string; block: string }[];
  came?: { said: string; id: string } | null;
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

const kindOf = (n: LogosNode) => (n.finding ? KIND_LABEL[n.finding.kind] : n.type.charAt(0).toUpperCase() + n.type.slice(1));
const VERDICT: Record<string, string> = { supported: 'supports it', partly: 'partly supports it', contradicted: 'says otherwise' };
const STATE: Record<string, string> = { kept: 'on your map', considered: 'dismissed', dismissed: 'dismissed', resolved: 'resolved' };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="l6f-row">
      <dt className="l5-label">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Ideas({ nodes, empty, onIdea }: { nodes: LogosNode[]; empty: string; onIdea: (id: string) => void }) {
  if (!nodes.length) return <span className="l6f-none">{empty}</span>;
  return (
    <ul className="l6f-list">
      {nodes.map((n) => (
        <li key={n.id}>
          <button type="button" className="l6f-idea" onClick={() => onIdea(n.id)}>
            {n.label}
          </button>
          <span className="l6f-k">{kindOf(n)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Focus(p: FocusProps) {
  const node = p.map.nodes.find((n) => n.id === p.id);
  const ref = useRef<HTMLDivElement>(null);
  const close = p.onClose;
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [p.id, close]);
  if (!node) return null;
  const under = restsOn(p.map, node.id);
  const over = restingOn(p.map, node.id);
  const against = pulledAgainst(p.map, node.id);
  const near = besides(p.map, node.id).filter((n) => !n.finding).slice(0, 5);
  const words: { label: string; on?: () => void }[] = [
    { label: 'Simpler', on: p.onSimpler },
    { label: 'Deeper', on: p.onDeeper },
    { label: 'Explain it back', on: p.onExplainBack },
    { label: 'Check against my sources', on: p.onCheckSources },
    { label: 'Show on the Logic Map', on: p.onShowOnMap },
    { label: 'Copy link', on: p.onCopyLink },
  ];
  return (
    <div className="os-scrim l6-focus" role="dialog" aria-modal="true" aria-labelledby="l6f-title">
      <div className="os-back" onClick={close} aria-hidden="true" />
      <div className="os-sheet is-wide l6f-sheet" ref={ref} tabIndex={-1}>
        <span className="os-grab" aria-hidden="true" />
        <L5Close label="Close" onClose={close} className="os-x" />
        <nav className="l6f-crumbs" aria-label="Where this idea sits">
          {p.project && (
            <>
              {p.onProject ? (
                <button type="button" className="l5-link is-meta" onClick={p.onProject}>
                  {p.project}
                </button>
              ) : (
                <span>{p.project}</span>
              )}
              <span aria-hidden="true">/</span>
            </>
          )}
          {p.onLine ? (
            <button type="button" className="l5-link is-meta" onClick={p.onLine}>
              {p.line}
            </button>
          ) : (
            <span>{p.line}</span>
          )}
        </nav>
        <p className="l5-label">{node.finding ? `${kindOf(node)} · Socria’s, kept by you` : kindOf(node)}</p>
        <h2 id="l6f-title" className="os-title l6f-title">
          {node.label}
        </h2>
        {node.detail && <p className="os-sub">{node.detail}</p>}

        <dl className="l6f-rows">
          <Row label="Rests on">
            <Ideas nodes={under} empty="Nothing yet" onIdea={p.onIdea} />
          </Row>
          <Row label="Builds on it">
            <Ideas nodes={over} empty="Nothing yet" onIdea={p.onIdea} />
          </Row>
          {against.length > 0 && (
            <Row label="Pulls against it">
              <Ideas nodes={against} empty="" onIdea={p.onIdea} />
            </Row>
          )}
          {(p.evidence?.length ?? 0) > 0 && (
            <Row label="In your sources">
              <ul className="l6f-list">
                {p.evidence!.map((e) => (
                  <li key={`${e.doc}:${e.block}`}>
                    <button type="button" className="l6f-idea is-quote" onClick={() => p.onEvidence?.(e.doc, e.block)}>
                      “{e.quote}”
                    </button>
                    <span className={`l6f-k${e.verdict === 'contradicted' ? ' is-tension' : ''}`}>
                      {e.name}, {e.key}
                      {e.verdict && VERDICT[e.verdict] ? ` · ${VERDICT[e.verdict]}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Row>
          )}
          {(p.findings?.length ?? 0) > 0 && (
            <Row label="Worth checking">
              <ul className="l6f-list">
                {p.findings!.map((f, i) => (
                  <li key={i} className={f.state === 'dismissed' || f.state === 'considered' ? 'is-out' : ''}>
                    <span className="l6f-text">{f.text}</span>
                    <span className="l6f-k">
                      {KIND_LABEL[f.kind]}
                      {STATE[f.state] ? ` · ${STATE[f.state]}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Row>
          )}
          {near.length > 0 && (
            <Row label="Also connected">
              <Ideas nodes={near} empty="" onIdea={p.onIdea} />
            </Row>
          )}
          {p.came && (
            <Row label="Came from">
              {p.onCame ? (
                <button type="button" className="l6f-idea is-quote" onClick={p.onCame}>
                  “{p.came.said.length > 140 ? `${p.came.said.slice(0, 139).trimEnd()}…` : p.came.said}”
                </button>
              ) : (
                <span className="l6f-text">“{p.came.said}”</span>
              )}
            </Row>
          )}
        </dl>

        <div className="l6f-actions">
          {p.onChallenge && (
            <button type="button" className="l5-btn is-primary is-wide" onClick={p.onChallenge}>
              Challenge it
            </button>
          )}
          <div className="l6f-words">
            {words
              .filter((w) => w.on)
              .map((w) => (
                <button key={w.label} type="button" className="l5-link is-meta" onClick={w.on}>
                  {w.label}
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
