'use client';
// components/ux-v0/studio/AidPicker.tsx — what a question shows when seeing would help more than reading
// (lib/ux-v0/studio/brief.ts Aid): a few palettes in their real colours, a few pairings of typefaces set in the faces
// themselves (loaded before they are shown), or a few moods (each its colours, a face and a line on how it would feel).
//
// Compact, inside the conversation, never required: a card can be picked (it is said as the person's reply), or the
// person can write instead — mix two, change one, name their own colours or faces, or skip it. Nothing here is a
// template: what is picked tells the designer about taste, not layout.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Aid, Mood, Palette, TypePair } from '@/lib/ux-v0/studio/brief';
import { loadFaces, type Face } from './faces';

const stack = (face: string) => `"${face}", Inter, system-ui, sans-serif`;

/** The faces an aid sets its words in, loaded before they are shown (so no specimen is shown in a fallback face). */
function useFaces(faces: readonly Face[]): boolean {
  const key = faces.map((f) => `${f.face}|${f.weight}|${f.italic ? 1 : 0}`).join(';');
  const [ready, setReady] = useState(!faces.length);
  useEffect(() => {
    if (!faces.length) return setReady(true);
    let live = true;
    setReady(false);
    void loadFaces(faces).finally(() => live && setReady(true));
    // show what has arrived after a moment, whatever is still on its way
    const t = window.setTimeout(() => live && setReady(true), 2500);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return ready;
}

/** A sample set large in its face, made smaller until its longest word fits (never broken inside a word). */
function useFit<T extends HTMLElement>(ready: boolean, text: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      let size = parseFloat(getComputedStyle(el).fontSize);
      for (let i = 0; i < 14 && el.scrollWidth > el.clientWidth + 1 && size > 12; i++) {
        size *= 0.9;
        el.style.fontSize = `${size.toFixed(1)}px`;
      }
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [ready, text]);
  return ref;
}

function PaletteCard({ p, i, onPick }: { p: Palette; i: number; onPick: (i: number) => void }) {
  const [ground, ink, accent, ...rest] = p.colours;
  return (
    <li style={{ ['--i' as string]: i }}>
      <button type="button" className="sd-dq-card" onClick={() => onPick(i)} aria-label={`${p.name}: ${p.note}. Colours ${p.colours.join(', ')}`}>
        <span className="sd-dq-pal" style={{ background: ground, color: ink }} aria-hidden="true">
          <span className="sd-dq-pal-aa">Aa</span>
          <span className="sd-dq-pal-row">
            <span className="sd-dq-pal-accent" style={{ background: accent }} />
            {rest.map((c, j) => (
              <span key={`${c}-${j}`} className="sd-dq-pal-dot" style={{ background: c }} />
            ))}
          </span>
        </span>
        <span className="sd-dq-name">{p.name}</span>
        {p.note && <span className="sd-dq-note">{p.note}</span>}
        <span className="sd-dq-hex">{p.colours.join(' · ')}</span>
      </button>
    </li>
  );
}

function TypeCard({ t, i, sample, ready, onPick }: { t: TypePair; i: number; sample: string; ready: boolean; onPick: (i: number) => void }) {
  const spec = useFit<HTMLSpanElement>(ready, sample);
  return (
    <li style={{ ['--i' as string]: i }}>
      <button type="button" className="sd-dq-card is-face" onClick={() => onPick(i)} aria-label={`${t.name}: ${t.display}${t.body !== t.display ? ` with ${t.body}` : ''}. ${t.note}`}>
        <span ref={spec} className="sd-dq-spec" style={{ fontFamily: stack(t.display), fontWeight: t.weight ?? 400, textTransform: t.upper ? 'uppercase' : 'none', letterSpacing: t.upper ? '0.04em' : '-0.01em' }}>
          {sample}
        </span>
        {t.note && (
          <span className="sd-dq-spec-body" style={{ fontFamily: stack(t.body) }}>
            {t.note}
          </span>
        )}
        <span className="sd-dq-meta">
          <span className="sd-dq-name">{t.name}</span>
          <span className="sd-dq-hex">
            {t.display}
            {t.body !== t.display ? ` · ${t.body}` : ''}
          </span>
        </span>
      </button>
    </li>
  );
}

function MoodCard({ m, i, sample, ready, onPick }: { m: Mood; i: number; sample: string; ready: boolean; onPick: (i: number) => void }) {
  const [ground, ink, accent, support] = m.colours;
  const word = useFit<HTMLSpanElement>(ready, sample);
  return (
    <li style={{ ['--i' as string]: i }}>
      <button type="button" className="sd-dq-card" onClick={() => onPick(i)} aria-label={`${m.name}: ${m.note}`}>
        <span className="sd-aid-mood" style={{ background: ground, color: ink }} aria-hidden="true">
          <span ref={word} className="sd-aid-mood-w" style={{ fontFamily: stack(m.display) }}>
            {sample}
          </span>
          <span className="sd-aid-mood-row">
            <span className="sd-aid-mood-bar" style={{ background: accent }} />
            {support && <span className="sd-dq-pal-dot" style={{ background: support }} />}
          </span>
        </span>
        <span className="sd-dq-name">{m.name}</span>
        <span className="sd-dq-note">{m.note}</span>
      </button>
    </li>
  );
}

export function AidPicker({ aid, onPick }: { aid: Aid; onPick: (index: number) => void }) {
  const faces: Face[] =
    aid.kind === 'type'
      ? aid.options.flatMap((t) => [
          { face: t.display, weight: t.weight ?? 400, italic: false },
          { face: t.body, weight: 400, italic: false },
        ])
      : aid.kind === 'moods'
        ? aid.options.map((m) => ({ face: m.display, weight: 400, italic: false }))
        : [];
  const ready = useFaces(faces);
  const label = aid.kind === 'palettes' ? 'Palettes to look at' : aid.kind === 'type' ? 'Lettering to look at' : 'Moods to look at';
  return (
    <div className="sd-dq sd-aid">
      {aid.kind === 'palettes' && (
        <ul className="sd-dq-grid" role="list" aria-label={label}>
          {aid.options.map((p, i) => (
            <PaletteCard key={p.name} p={p} i={i} onPick={onPick} />
          ))}
        </ul>
      )}
      {aid.kind === 'type' && (
        <ul className={`sd-dq-list is-faces${ready ? ' is-ready' : ''}`} role="list" aria-label={label}>
          {aid.options.map((t, i) => (
            <TypeCard key={t.name} t={t} i={i} sample={aid.sample} ready={ready} onPick={onPick} />
          ))}
        </ul>
      )}
      {aid.kind === 'moods' && (
        <ul className={`sd-dq-grid is-moods${ready ? ' is-ready' : ''}`} role="list" aria-label={label}>
          {aid.options.map((m, i) => (
            <MoodCard key={m.name} m={m} i={i} sample={aid.sample} ready={ready} onPick={onPick} />
          ))}
        </ul>
      )}
      <p className="sd-aid-hint">Pick one, or just write — mix them, change one, name your own{aid.kind === 'palettes' ? ' colours (hex codes are fine)' : aid.kind === 'type' ? ' typefaces' : ''}, or skip it.</p>
    </div>
  );
}
