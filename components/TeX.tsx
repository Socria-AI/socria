'use client';

// Mathematical notation, rendered. KaTeX turns LaTeX into an HTML string
// server-and-client-side (renderToString needs no DOM), so a map node or a
// chat message can carry equations that render the same everywhere.
//
// KaTeX with trust:false + strict:false does not emit arbitrary HTML — it
// only produces its own math markup — so the rendered string is safe to
// inject. throwOnError:false means a malformed expression shows in red rather
// than crashing the surface it's on.

import katex from 'katex';
import { createContext, useContext, type KeyboardEvent, type MouseEvent } from 'react';
import { splitMath, hasMath } from '@/lib/tex-split';

/**
 * POINT & ASK (Logos 4): where a picker is provided — Socria's replies, in the
 * workspace — every expression can be selected with a click, a tap or Enter,
 * and becomes what the next message is about. Elsewhere, nothing changes.
 */
export const TexPick = createContext<((tex: string) => void) | null>(null);

const MAX_TEX = 2000; // a single expression; longer is certainly not one

function render(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex.slice(0, MAX_TEX), {
      displayMode: display,
      throwOnError: false,
      strict: false,
      trust: false,
      // Cap \rule/\kern/\hspace so a hostile expression can't render a
      // million-em box and blow up the surrounding layout.
      maxSize: 20,
      maxExpand: 1000,
      output: 'html',
    });
  } catch {
    // renderToString almost never throws with throwOnError:false, but never
    // let a math surface take the page down.
    return '';
  }
}

/** One block or inline expression. */
export function TeX({ tex, display = false }: { tex: string; display?: boolean }) {
  const pick = useContext(TexPick);
  const html = render(tex, display);
  const picking = pick
    ? {
        role: 'button',
        tabIndex: 0,
        'data-tex': tex.slice(0, 400),
        'aria-label': `Ask about the expression ${tex.slice(0, 120)}`,
        title: 'Ask Socria about this',
        onClick: (e: MouseEvent) => {
          // a drag that selected text is reading, not pointing
          if (typeof window !== 'undefined' && window.getSelection()?.toString().trim()) return;
          e.stopPropagation();
          pick(tex);
        },
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          pick(tex);
        },
      }
    : {};
  if (!html) return <span className={pick ? 'lg-tex-raw is-pickable' : 'lg-tex-raw'} {...picking}>{tex}</span>;
  return (
    <span
      className={`${display ? 'lg-tex lg-tex-block' : 'lg-tex'}${pick ? ' is-pickable' : ''}`}
      {...picking}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── mixed prose + math ──────────────────────────────────────────────
// The splitting itself lives in lib/tex-split.ts: it is pure, it is the part
// that can mangle a sentence without anyone noticing, and there it can be
// tested. Re-exported here because every caller already imports from './TeX'.

export { splitMath, hasMath, looksMath, type Seg } from '@/lib/tex-split';

/** Render a string that mixes prose and LaTeX. */
export function MathText({ children, className }: { children: string; className?: string }) {
  if (!hasMath(children)) return <>{children}</>;
  const segs = splitMath(children);
  return (
    <span className={className}>
      {segs.map((s, i) =>
        s.kind === 'text' ? (
          <span key={i}>{s.body}</span>
        ) : (
          <TeX key={i} tex={s.body} display={s.kind === 'block'} />
        )
      )}
    </span>
  );
}
