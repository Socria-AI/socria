'use client';

// A mark per model, so the switcher reads as an identity rather than a line
// of text repeating the word "Socria".
//
//   Core 2    a plain outlined circle — the quiet one
//   Core 3.1  the same circle, filled and polished, with a slow sweep of
//             light across it; it is the one that notices language
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

  // Core 3.1 — the shiny one.
  const fill = `sg${uid}`;
  const gloss = `sh${uid}`;
  const clip = `sc${uid}`;
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
        <linearGradient id={fill} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9CB874" />
          <stop offset="52%" stopColor="#5e7633" />
          <stop offset="100%" stopColor="#B8A26B" />
        </linearGradient>
        <linearGradient id={gloss} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clip}>
          <circle cx="12" cy="12" r="9" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="9" fill={`url(#${fill})`} />
      <g clipPath={`url(#${clip})`}>
        {/* the sweep of light, held still most of the cycle */}
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
      {/* a specular catch, top-left, the way a bead of glass takes the room */}
      <ellipse cx="9.1" cy="8.4" rx="3.1" ry="2" fill="#fff" opacity="0.3"
        transform="rotate(-28 9.1 8.4)" />
    </svg>
  );
}
