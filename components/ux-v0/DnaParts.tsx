'use client';
// components/ux-v0/DnaParts.tsx — the Creative DNA drawn small: a fingerprint of tracks, and the DNA in words.
//
// Each dimension is a hairline track with a mark where the design sits; a second, hollow mark shows where
// something else sits (the project's DNA, against a direction's). Used on the DNA step, the direction boards,
// the canvas and the references. Drawn in SocriaUX's own interface colours: this is the tool, not the design.

import { DNA_CORE, DNA_META, dnaWord, type DnaKey, type DnaVector } from '@/lib/ux-v0/dna';

export function DnaGlyph({ dna, against, keys = DNA_CORE, label, size = 'sm' }: { dna: DnaVector; against?: DnaVector; keys?: readonly DnaKey[]; label?: string; size?: 'sm' | 'md' }) {
  const shown = keys.filter((k) => typeof dna[k] === 'number');
  const said = shown.map((k) => `${DNA_META[k].label}: ${dnaWord(k, dna[k] as number)}${against && typeof against[k] === 'number' ? ` (the project: ${dnaWord(k, against[k] as number)})` : ''}`).join('; ');
  return (
    <span className={`dna-glyph is-${size}`} role="img" aria-label={label ? `${label}. ${said}` : said}>
      {shown.map((k) => (
        <span key={k} className="dna-glyph-row" title={`${DNA_META[k].label}: ${dnaWord(k, dna[k] as number)}`}>
          <span className="dna-glyph-track" />
          {against && typeof against[k] === 'number' && <span className="dna-glyph-ghost" style={{ left: `${against[k]}%` }} />}
          <span className="dna-glyph-mark" style={{ left: `${dna[k]}%` }} />
        </span>
      ))}
    </span>
  );
}

/** The DNA in five words: "Restrained · Structured · Editorial · Subtle · Airy". */
export function dnaWords(dna: DnaVector, keys: readonly DnaKey[] = DNA_CORE): string {
  return keys
    .filter((k) => typeof dna[k] === 'number')
    .map((k) => dnaWord(k, dna[k] as number))
    .join(' · ');
}
