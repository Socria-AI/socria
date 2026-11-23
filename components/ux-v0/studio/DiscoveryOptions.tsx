'use client';
// components/ux-v0/studio/DiscoveryOptions.tsx — the answers a creative question offers, shown rather than listed.
//
// Colours as palettes you can see (the ground, the ink on it, the accent and what supports it), with a colour of your
// own a tap away; lettering as real specimens (the brief's own words, set in faces from the font library, loaded before
// they are shown); moods as small compositions the engine draws itself (lib/ux-v0/studio/vibe-preview.ts); written
// questions with a few suggested answers. Every option was generated for this brief (lib/ux-v0/studio/discovery.ts, or
// the model's question held to the same shape); none is required — the composer below is always the main way to
// answer, and "Skip", "Surprise me" and "Show me others" are beside them.

import { useEffect, useMemo, useState } from 'react';
import type { DiscoveryQuestion, PaletteChoice, TypeChoice, VibeChoice } from '@/lib/ux-v0/studio/discovery';
import { renderArtboard } from '@/lib/ux-v0/graphics/render';
import { vibeFaces, vibePreviewDoc } from '@/lib/ux-v0/studio/vibe-preview';
import { loadFaces, useFaceMeasure, type Face } from './faces';

export interface DiscoveryOptionsProps {
  q: DiscoveryQuestion;
  /** the words to set specimens and moods in (the headline, else the name) */
  sample: string;
  onChoose: (optionId: string) => void;
  /** the person's own answer, as if typed ("#c2410c", "skip", "Surprise me") */
  onSend: (words: string) => void;
}

const stack = (face: string, kind: 'serif' | 'sans' = 'sans') => `"${face}", ${kind === 'serif' ? 'Georgia, serif' : 'Inter, system-ui, sans-serif'}`;

function Palettes({ palettes, onChoose, onSend }: { palettes: readonly PaletteChoice[]; onChoose: (id: string) => void; onSend: (w: string) => void }) {
  const [own, setOwn] = useState<string | null>(null);
  return (
    <ul className="sd-dq-grid is-palettes" role="list" aria-label="Palettes to choose from">
      {palettes.map((p, i) => (
        <li key={p.id} style={{ ['--i' as string]: i }}>
          <button type="button" className="sd-dq-card" onClick={() => onChoose(p.id)} aria-label={`${p.name}: ${p.note}`}>
            <span className="sd-dq-pal" style={{ background: p.ground, color: p.ink }} aria-hidden="true">
              <span className="sd-dq-pal-aa">Aa</span>
              <span className="sd-dq-pal-row">
                <span className="sd-dq-pal-accent" style={{ background: p.accent }} />
                {p.support.slice(0, 2).map((c, j) => (
                  <span key={`${c}-${j}`} className="sd-dq-pal-dot" style={{ background: c }} />
                ))}
              </span>
            </span>
            <span className="sd-dq-name">{p.name}</span>
            <span className="sd-dq-note">{p.note}</span>
            <span className="sd-dq-hex">{[p.ground, p.ink, p.accent].join(' · ')}</span>
          </button>
        </li>
      ))}
      <li style={{ ['--i' as string]: palettes.length }}>
        <div className="sd-dq-card is-own">
          <label className="sd-dq-own">
            <input type="color" value={own ?? palettes[0]?.accent ?? '#7a7a70'} onChange={(e) => setOwn(e.target.value)} aria-label="Pick a colour of your own" />
            <span className="sd-dq-name">A colour of your own</span>
          </label>
          <span className="sd-dq-note">Pick one, or name your colours in the box below — hex codes or words.</span>
          {own && (
            <button type="button" className="sd-pill is-sm is-primary" onClick={() => onSend(`Use ${own}`)}>
              Use {own}
            </button>
          )}
        </div>
      </li>
    </ul>
  );
}

function Faces({ faces, sample, onChoose }: { faces: readonly TypeChoice[]; sample: string; onChoose: (id: string) => void }) {
  const [ready, setReady] = useState(false);
  const key = faces.map((f) => `${f.display}|${f.weight}|${f.body}`).join(';');
  useEffect(() => {
    let live = true;
    setReady(false);
    const want: Face[] = faces.flatMap((f) => [
      { face: f.display, weight: f.weight, italic: false },
      { face: f.body, weight: 400, italic: false },
    ]);
    void loadFaces(want).finally(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ul className={`sd-dq-list is-faces${ready ? ' is-ready' : ''}`} role="list" aria-label="Lettering to choose from">
      {faces.map((f, i) => (
        <li key={f.id} style={{ ['--i' as string]: i }}>
          <button type="button" className="sd-dq-card is-face" onClick={() => onChoose(f.id)} aria-label={`${f.name}: ${f.display}${f.body !== f.display ? ` with ${f.body}` : ''}`}>
            <span className="sd-dq-spec" style={{ fontFamily: stack(f.display), fontWeight: f.weight, textTransform: f.case === 'upper' ? 'uppercase' : 'none', letterSpacing: f.case === 'upper' ? '0.04em' : '-0.01em' }}>
              {sample}
            </span>
            <span className="sd-dq-spec-body" style={{ fontFamily: stack(f.body) }}>
              The quick brown fox jumps over the lazy dog — set for reading in {f.body}.
            </span>
            <span className="sd-dq-meta">
              <span className="sd-dq-name">{f.name}</span>
              <span className="sd-dq-note">{f.note}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Vibes({ vibes, sample, onChoose }: { vibes: readonly VibeChoice[]; sample: string; onChoose: (id: string) => void }) {
  const faces = useMemo<Face[]>(
    () =>
      vibes.flatMap((v) => {
        const f = vibeFaces(v);
        return [{ face: f.display, weight: f.weight, italic: false }];
      }),
    [vibes],
  );
  const { measure } = useFaceMeasure(faces);
  const drawn = useMemo(
    () =>
      vibes.map((v, i) => {
        try {
          const doc = vibePreviewDoc(v, sample, 11 + i * 17);
          return renderArtboard(doc, doc.artboards[0], { measure, idPrefix: `vb${i}-${v.id}-` }).replace(/^<svg([^>]*?) width="[^"]+" height="[^"]+"/, '<svg$1 width="100%" height="100%"');
        } catch {
          return '';
        }
      }),
    [vibes, sample, measure],
  );
  return (
    <ul className="sd-dq-grid is-vibes" role="list" aria-label="Moods to choose from">
      {vibes.map((v, i) => (
        <li key={v.id} style={{ ['--i' as string]: i }}>
          <button type="button" className="sd-dq-card is-vibe" onClick={() => onChoose(v.id)} aria-label={`${v.name}: ${v.note}`}>
            <span className="sd-dq-vibe" style={{ background: v.palette.ground }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: drawn[i] }} />
            <span className="sd-dq-name">{v.name}</span>
            <span className="sd-dq-note">{v.note}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The options of the creative question waiting, and the ways to set it aside. */
export function DiscoveryOptions({ q, sample, onChoose, onSend }: DiscoveryOptionsProps) {
  const visual = q.kind !== 'text';
  return (
    <div className={`sd-dq k-${q.kind}`} data-question={q.decides}>
      {q.kind === 'colour' && q.palettes?.length ? <Palettes palettes={q.palettes} onChoose={onChoose} onSend={onSend} /> : null}
      {q.kind === 'type' && q.faces?.length ? <Faces faces={q.faces} sample={sample} onChoose={onChoose} /> : null}
      {q.kind === 'vibe' && q.vibes?.length ? <Vibes vibes={q.vibes} sample={sample} onChoose={onChoose} /> : null}
      {q.kind === 'text' && q.options?.length ? (
        <p className="sd-suggest" role="group" aria-label="Some ways to answer">
          {q.options.map((o) => (
            <button key={o.id} type="button" className="sd-suggestion" onClick={() => onChoose(o.id)}>
              {o.label}
            </button>
          ))}
        </p>
      ) : null}
      <p className="sd-dq-acts" role="group" aria-label="Or">
        {visual && (
          <button type="button" className="sd-chip is-tiny" onClick={() => onSend('Show me others')}>
            Show me others
          </button>
        )}
        <button type="button" className="sd-chip is-tiny" onClick={() => onSend('Surprise me')}>
          Surprise me
        </button>
        <button type="button" className="sd-chip is-tiny" onClick={() => onSend('Skip')}>
          Skip
        </button>
      </p>
    </div>
  );
}
