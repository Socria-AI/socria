'use client';
// components/ux-v0/LivingBrief.tsx — the brief, so far: a small collection that arranges itself.
//
// While SocriaUX asks, this keeps what is decided in one place, the way a
// studio wall does: what is being made, what is understood (each subject on
// its own line), the references, palette and type kept from the board, and
// what is still to find out. Nothing here is a form. Anything kept can be let
// go from here without leaving the conversation, and the brief can be written
// (or opened, once it exists) from the foot of it.

import { useEffect, useMemo } from 'react';
import { fontStack, fontStylesheet } from '@/lib/ux-v0/fonts';
import { TOPICS, TOPIC_LABEL, type DesignBrief, type Discovery, type Moodboard, type RefState, type Topic } from '@/lib/ux-v0/types';
import { EditLine } from './Discovery';

interface Props {
  intent: string;
  discovery: Discovery;
  board: Moodboard;
  brief: { doc: DesignBrief | null; approved: boolean; version: number };
  busy: string | null;
  onIntent: (v: string) => void;
  onRef: (id: string, state: RefState) => void;
  onPalette: (id: string, state: RefState) => void;
  onType: (id: string, state: RefState) => void;
  onWrite: () => void;
  onOpen: () => void;
}

export function LivingBrief(p: Props) {
  const known = TOPICS.filter((t) => p.discovery.understanding.known[t]).map((t) => [t, p.discovery.understanding.known[t]!] as [Topic, string]);
  const gaps = p.discovery.understanding.gaps.filter((t) => !p.discovery.understanding.known[t]);
  const refs = p.board.refs.filter((r) => r.state === 'kept');
  const palettes = p.board.palettes.filter((x) => x.state === 'kept');
  const pairs = p.board.type.filter((x) => x.state === 'kept');
  const answered = p.discovery.questions.filter((q) => q.answer).length;

  const href = useMemo(() => fontStylesheet(pairs.flatMap((t) => [t.display, t.body])), [pairs]);
  useEffect(() => {
    if (!href || document.querySelector(`link[data-v0-fonts="${CSS.escape(href)}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.dataset.v0Fonts = href;
    document.head.appendChild(l);
  }, [href]);

  const filled = known.length + (refs.length ? 1 : 0) + (palettes.length ? 1 : 0) + (pairs.length ? 1 : 0);
  return (
    <div className="v0-rail-body st-rail st-living">
      <header className="st-living-head">
        <p className="st-living-title">The brief, so far.</p>
        <p className="st-living-sub">
          {p.brief.doc ? `Version ${p.brief.version}, ${p.brief.approved ? 'approved' : 'a draft'}. It keeps arranging itself as you answer and keep things.` : 'It arranges itself as you answer and keep things on the board. Change anything here.'}
        </p>
        <span className="st-arch-meter" title={`${Math.min(6, filled)} of 6 parts of the brief are filled`}>
          <svg viewBox="0 0 22 26" aria-hidden="true" focusable="false">
            <path className="is-track" d="M2 25V11a9 9 0 0 1 18 0v14" pathLength={1} />
            <path className="is-fill" d="M2 25V11a9 9 0 0 1 18 0v14" pathLength={1} strokeDasharray={`${Math.min(6, filled) / 6} 1`} />
          </svg>
          <span>{Math.min(6, filled)}/6</span>
        </span>
      </header>

      <section className="st-rail-sec">
        <h3 className="st-rail-label">
          <span className="st-glyph g-idea is-sm" aria-hidden="true" />
          The idea
        </h3>
        <EditLine value={p.intent} onSave={p.onIntent} big />
        {p.discovery.understanding.summary && <p className="st-understood">{p.discovery.understanding.summary}</p>}
      </section>

      {known.length > 0 && (
        <section className="st-rail-sec">
          <h3 className="st-rail-label">Decided</h3>
          <dl className="st-known">
            {known.map(([t, v]) => (
              <div key={t} className="st-known-row">
                <dt>{TOPIC_LABEL[t]}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="st-rail-sec">
        <h3 className="st-rail-label">
          <span className="st-glyph g-file is-sm" aria-hidden="true" />
          References <span className="st-count">{refs.length}</span>
        </h3>
        {refs.length ? (
          <ul className="st-pins">
            {refs.slice(0, 9).map((r) => (
              <li key={r.id}>
                <img src={r.thumb} alt={r.title || 'Reference'} loading="lazy" referrerPolicy="no-referrer" />
                <button type="button" className="st-unpin" onClick={() => p.onRef(r.id, 'proposed')} aria-label={`Let go of ${r.title || 'this reference'}`} title="Let go">
                  ×
                </button>
              </li>
            ))}
            {refs.length > 9 && <li className="st-pins-more">+{refs.length - 9}</li>}
          </ul>
        ) : (
          <p className="st-none">Keep images on the board and they gather here.</p>
        )}
      </section>

      {(palettes.length > 0 || pairs.length > 0) && (
        <section className="st-rail-sec">
          <h3 className="st-rail-label">Colour and type</h3>
          {palettes.map((x) => (
            <div key={x.id} className="st-kept-pal">
              <span className="st-kept-swatches" aria-hidden="true">
                {x.colors.map((c, i) => (
                  <span key={i} style={{ background: c.hex }} />
                ))}
              </span>
              <span className="st-kept-name">{x.name}</span>
              <button type="button" className="sb-link is-meta" onClick={() => p.onPalette(x.id, 'proposed')} aria-label={`Let go of the ${x.name} palette`}>
                Let go
              </button>
            </div>
          ))}
          {pairs.map((t) => (
            <div key={t.id} className="st-kept-type">
              <span className="st-kept-aa" style={{ fontFamily: fontStack(t.display) }} aria-hidden="true">
                Aa
              </span>
              <span className="st-kept-name">
                {t.display}
                <span> with {t.body}</span>
              </span>
              <button type="button" className="sb-link is-meta" onClick={() => p.onType(t.id, 'proposed')} aria-label={`Let go of ${t.display} with ${t.body}`}>
                Let go
              </button>
            </div>
          ))}
        </section>
      )}

      {gaps.length > 0 && !p.brief.doc && (
        <section className="st-rail-sec">
          <h3 className="st-rail-label">
            <span className="st-glyph g-question is-sm" aria-hidden="true" />
            Still to find out
          </h3>
          <p className="st-gaps">{gaps.map((t) => TOPIC_LABEL[t]).join(' · ')}</p>
        </section>
      )}

      <footer className="st-living-foot">
        {p.brief.doc ? (
          <button type="button" className="sb-btn is-sm" onClick={p.onOpen}>
            Open the brief
          </button>
        ) : (
          <button type="button" className="sb-btn is-sm" onClick={p.onWrite} disabled={!!p.busy || !p.intent}>
            Write it up as the brief
          </button>
        )}
        <span className="st-none">{answered ? `${answered} answer${answered === 1 ? '' : 's'} so far` : 'No answers yet'}</span>
      </footer>
    </div>
  );
}
