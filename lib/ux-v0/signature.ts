// lib/ux-v0/signature.ts — a design's signature: what makes two designs alike at a glance.
//
// The visual language, the grid, the opening, the order of sections, the headline face, the accent's hue, the
// surfaces and the buttons. Kept with each project's summary in this browser, so the Originality Audit
// (lib/ux-v0/originality.ts) can say when a new design repeats an earlier one.

import { hslOf } from './color';
import type { DesignSpec } from './spec';

/** A design's signature: what makes two designs alike at a glance. */
export interface DesignSignature {
  project: string;
  name?: string;
  language: string;
  grid: string;
  hero: string;
  kinds: string[];
  display: string;
  hue: number;
  containers: string;
  buttons: string;
}

/** The longest common subsequence of two lists, as a share of the longer. */
export function sequenceLike(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[a.length][b.length] / Math.max(a.length, b.length);
}

export function signatureOf(spec: DesignSpec, project = '', name?: string): DesignSignature {
  const hero = spec.sections.find((s) => s.kind === 'hero');
  const booking = spec.sections.find((s) => s.kind === 'booking');
  return {
    project,
    ...(name ? { name } : {}),
    language: spec.look.language,
    grid: spec.look.grid,
    hero: hero ? hero.variant : booking ? `booking:${booking.variant}` : spec.sections[0]?.kind ?? '',
    kinds: spec.sections.map((s) => s.kind).slice(0, 8),
    display: spec.tokens.fonts.display,
    hue: Math.round(hslOf(spec.tokens.colors.accent)[0]),
    containers: spec.look.containers,
    buttons: spec.look.buttons,
  };
}

/** How alike two designs are at a glance, 0–1, and what they share. */
export function signatureLike(a: DesignSignature, b: DesignSignature): { similarity: number; shared: string[] } {
  const shared: string[] = [];
  let s = 0;
  const hueGap = Math.min(Math.abs(a.hue - b.hue), 360 - Math.abs(a.hue - b.hue));
  const parts: [boolean, number, string][] = [
    [a.language === b.language, 0.2, 'the visual language'],
    [a.grid === b.grid, 0.12, 'the grid'],
    [a.hero === b.hero, 0.14, 'the opening'],
    [a.display === b.display, 0.14, 'the headline face'],
    [hueGap <= 20, 0.1, 'the accent colour'],
    [a.containers === b.containers, 0.06, 'the surfaces'],
    [a.buttons === b.buttons, 0.06, 'the buttons'],
  ];
  for (const [same, w, what] of parts) if (same) (s += w), shared.push(what);
  const seq = sequenceLike(a.kinds, b.kinds);
  s += 0.18 * seq;
  if (seq >= 0.8) shared.push('the order of sections');
  return { similarity: Math.round(s * 100) / 100, shared };
}

