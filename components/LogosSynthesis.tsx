'use client';
// components/LogosSynthesis.tsx
//
// A SYNTHESIS, AS A PAGE OF AN INTELLECTUAL BRIEF — not a chat bubble.
//
// One block, ruled above and below, set in the product's own type: an
// eyebrow, a serif heading, a short paragraph, then the sections the
// structure earned, each a small-caps label over a few lines. What the map
// holds and what Socria reads into it are told apart on the page: Socria's
// reading, its critique and its possibilities carry its blue, and nothing it
// suggests reaches the map unless the person takes it.
//
// Concise by default: three lines a section, the rest a click away.

import { useState } from 'react';
import { sectionLabel, type Critique, type Next, type Possibility, type Ref, type Synthesis } from '@/lib/logos-synthesis';
import './logos-synthesis.css';

const LEVEL: Record<Critique['level'], string> = {
  problem: 'In the structure',
  risk: 'Worth questioning',
  suggestion: 'Suggestion',
};

function when(at: number): string {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function LogosSynthesis({
  synthesis: s,
  onNext,
  onPossibility,
  onReading,
  onRef,
  latest = true,
}: {
  synthesis: Synthesis;
  onNext?: (n: Next) => void;
  onPossibility?: (p: Possibility, act: 'explore' | 'add' | 'dismiss') => void;
  onReading?: (key: string, item: Ref, act: 'add' | 'dismiss') => void;
  onRef?: (id: string) => void;
  /** only the latest synthesis offers its next moves */
  latest?: boolean;
}) {
  const [all, setAll] = useState(false);
  const taken = s.taken ?? {};
  const SHOW = all ? 8 : 3;
  const hidden = s.sections.reduce((n, sec) => n + Math.max(0, sec.items.length - 3), 0) + Math.max(0, s.critique.length - 3);
  const reading = s.sections.find((x) => x.id === 'reading');
  const structural = s.sections.filter((x) => x.id !== 'reading');
  const possibilities = s.possibilities.filter((p) => !taken[p.id]);

  const line = (item: Ref, i: number) => (
    <li key={i} className={item.by === 'socria' ? 'is-socria' : undefined}>
      {item.refs.length && onRef ? (
        <button type="button" className="syn-ref" onClick={() => onRef(item.refs[0])} title="Show on the map">
          {item.text}
        </button>
      ) : (
        item.text
      )}
    </li>
  );

  return (
    <article className="syn" aria-label={`Synthesis: ${s.title}`} data-source={s.source}>
      <p className="syn-eyebrow">
        <span>Synthesis</span>
        <span aria-hidden="true">·</span>
        <span>{when(s.at)}</span>
        {s.scope.kind === 'selection' && (
          <>
            <span aria-hidden="true">·</span>
            <span>{s.scope.ids?.length ?? 0} selected</span>
          </>
        )}
        {s.source === 'structure' && (
          <span className="syn-src" title="Written from the structure of your map alone">from your map’s structure</span>
        )}
      </p>
      <h2 className="syn-title">{s.title}</h2>
      <p className="syn-lede">{s.lede}</p>

      {s.change && (
        <section className="syn-sec syn-change">
          <h3 className="syn-k">Since last time</h3>
          <p className="syn-p">{s.change.said}</p>
        </section>
      )}

      {s.shape && (
        <section className="syn-sec">
          <h3 className="syn-k">Current shape</h3>
          <p className="syn-flow">
            {s.shape.layers.map((l, i) => (
              <span key={i} className="syn-step">
                {l.length > 1 ? <span className="syn-fork">{l.join(' / ')}</span> : l[0]}
                {i < s.shape!.layers.length - 1 && <i aria-hidden="true">→</i>}
              </span>
            ))}
          </p>
        </section>
      )}

      {structural.length > 0 && (
        <div className="syn-grid">
          {structural.map((sec) => (
            <section key={sec.id} className={`syn-sec syn-${sec.id}`}>
              <h3 className="syn-k">{sectionLabel(sec.id)}</h3>
              <ul className="syn-list">{sec.items.slice(0, SHOW).map(line)}</ul>
            </section>
          ))}
        </div>
      )}

      {reading && (
        <section className="syn-sec syn-socria">
          <h3 className="syn-k">
            Socria’s reading <em>— an interpretation, not yours until you say so</em>
          </h3>
          <ul className="syn-list">
            {reading.items.slice(0, SHOW).map((item, i) => {
              const key = `r${i}`;
              if (taken[key] === 'dismissed') return null;
              return (
                <li key={key}>
                  <span>{item.text}</span>
                  {onReading && taken[key] !== 'added' && (
                    <span className="syn-acts">
                      <button type="button" onClick={() => onReading(key, item, 'add')}>Add as a principle</button>
                      <button type="button" onClick={() => onReading(key, item, 'dismiss')}>Dismiss</button>
                    </span>
                  )}
                  {taken[key] === 'added' && <span className="syn-done">on your map</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {s.critique.length > 0 && (
        <section className="syn-sec syn-critique">
          <h3 className="syn-k">What I’d question</h3>
          <ul className="syn-list">
            {s.critique.slice(0, SHOW).map((c, i) => (
              <li key={i} className={`is-${c.level}`}>
                <span className="syn-level">{LEVEL[c.level]}</span>
                {c.refs.length && onRef ? (
                  <button type="button" className="syn-ref" onClick={() => onRef(c.refs[0])} title="Show on the map">
                    {c.text}
                  </button>
                ) : (
                  <span>{c.text}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {possibilities.length > 0 && (
        <section className="syn-sec syn-possible">
          <h3 className="syn-k">
            Possibilities to explore <em>— Socria’s, not on your map</em>
          </h3>
          <ul className="syn-list">
            {possibilities.map((p) => (
              <li key={p.id}>
                <span className="syn-p-label">{p.label}</span>
                <span className="syn-p-text">{p.text}</span>
                {onPossibility && (
                  <span className="syn-acts">
                    <button type="button" onClick={() => onPossibility(p, 'explore')}>Explore</button>
                    <button type="button" onClick={() => onPossibility(p, 'add')}>Add to map</button>
                    <button type="button" onClick={() => onPossibility(p, 'dismiss')}>Dismiss</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {Object.values(taken).includes('added') && s.possibilities.some((p) => taken[p.id] === 'added') && (
        <p className="syn-note">
          Added to your map, marked as Socria’s suggestion:{' '}
          {s.possibilities.filter((p) => taken[p.id] === 'added').map((p) => p.label).join(', ')}.
        </p>
      )}

      <footer className="syn-foot">
        <span className="syn-counts">{s.counts}</span>
        {hidden > 0 && (
          <button type="button" className="syn-more" onClick={() => setAll((v) => !v)}>
            {all ? 'Less' : `${hidden} more`}
          </button>
        )}
      </footer>
      {latest && onNext && s.next.length > 0 && (
        <nav className="syn-next" aria-label="What next">
          {s.next.map((n) => (
            <button key={n.id} type="button" className={n.id === 'continue' ? 'is-quiet' : undefined} onClick={() => onNext(n)}>
              {n.label}
            </button>
          ))}
        </nav>
      )}
    </article>
  );
}

/** While Socria reads the map: the shape of a synthesis, quietly. */
export function SynthesisPending({ scope }: { scope: 'workspace' | 'selection' }) {
  return (
    <article className="syn is-pending" aria-busy="true" aria-label="Synthesising">
      <p className="syn-eyebrow">
        <span>Synthesis</span>
        <span aria-hidden="true">·</span>
        <span>{scope === 'selection' ? 'reading what you selected' : 'reading what you’ve built'}</span>
      </p>
      <span className="syn-bar is-title" />
      <span className="syn-bar" />
      <span className="syn-bar is-short" />
    </article>
  );
}
