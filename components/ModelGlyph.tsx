'use client';

// A mark per model, so the switcher reads as an identity rather than a line
// of text repeating the word "Socria".
//
//   Core 2    a plain outlined circle — the quiet one
//   Core 3.1  the same circle, polished: a gradient ring with a slow sweep
//             of light across it; it is the one that notices language
//   Logos     the brain, the same mark the Logos header carries
//
// Gradients need ids that are unique per instance — two of these render at
// once (the button and its menu row) — so they're keyed off useId().

import { useId } from 'react';
import type { SocriaModel } from '@/lib/socria-prompt';
import { LogosMark } from './LogosMark';

export function ModelGlyph({
  model,
  size = 14,
  className,
}: {
  model: SocriaModel;
  size?: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const cls = className ? `socria-glyph ${className}` : 'socria-glyph';

  if (model === 'logos') return <LogosMark size={size} className={className} />;

  if (model === 'core-2') {
    return (
      <svg
        className={cls}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="8.5" />
      </svg>
    );
  }

  // Core 3.1 — the same hollow circle, but polished: the ring itself is drawn
  // in gradient, a sweep of light travels across it, and a short arc catches
  // the highlight. Hollow like Core 2's, so they read as one family.
  const ring = `sg${uid}`;
  const gloss = `sh${uid}`;
  const hole = `sm${uid}`;
  return (
    <svg
      className={cls}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={ring} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9CB874" />
          <stop offset="50%" stopColor="#5e7633" />
          <stop offset="100%" stopColor="#B8A26B" />
        </linearGradient>
        <linearGradient id={gloss} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {/* the sweep is confined to the ring, not the hole it encloses */}
        <mask id={hole}>
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="#fff" strokeWidth="2.6" />
        </mask>
      </defs>
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="none"
        stroke={`url(#${ring})`}
        strokeWidth="2.6"
      />
      <g mask={`url(#${hole})`}>
        <rect
          className="socria-shine"
          x="-10"
          y="-4"
          width="7"
          height="32"
          fill={`url(#${gloss})`}
          transform="rotate(18 12 12)"
        />
      </g>
      {/* a standing highlight on the upper-left of the ring */}
      <path
        d="M5.9 8.1 A8.5 8.5 0 0 1 11.4 3.6"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
