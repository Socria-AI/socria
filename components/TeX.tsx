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
  const html = render(tex, display);
  if (!html) return <span className="lg-tex-raw">{tex}</span>;
  return (
    <span
      className={display ? 'lg-tex lg-tex-block' : 'lg-tex'}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── mixed prose + math ──────────────────────────────────────────────
// Chat replies and notes are prose with math sprinkled in: $…$ / \(…\) for
// inline, $$…$$ / \[…\] for display. Split on those and render each piece.

interface Seg {
  kind: 'text' | 'inline' | 'block';
  body: string;
}

// Ordered so the longer delimiters ($$, \[, \() are tried before the shorter
// ones and never mis-split a $$ as two $.
const PATTERNS: { re: RegExp; kind: 'inline' | 'block' }[] = [
  { re: /\$\$([\s\S]+?)\$\$/, kind: 'block' },
  { re: /\\\[([\s\S]+?)\\\]/, kind: 'block' },
  { re: /\\\(([\s\S]+?)\\\)/, kind: 'inline' },
  // single-$ inline: not a currency amount ("$5") — require a non-space start
  // and a non-digit-only body so "it cost $5 and $10" stays prose.
  { re: /\$(?!\s)([^$\n]*?[^\s$])\$/, kind: 'inline' },
];

export function splitMath(input: string): Seg[] {
  const segs: Seg[] = [];
  let rest = input;
  let guard = 0;
  while (rest && guard++ < 400) {
    let best: { index: number; len: number; body: string; kind: 'inline' | 'block' } | null =
      null;
    for (const { re, kind } of PATTERNS) {
      const m = re.exec(rest);
      if (m && (best === null || m.index < best.index)) {
        best = { index: m.index, len: m[0].length, body: m[1], kind };
      }
    }
    if (!best) {
      segs.push({ kind: 'text', body: rest });
      break;
    }
    if (best.index > 0) segs.push({ kind: 'text', body: rest.slice(0, best.index) });
    // a single-$ span is math only if its body actually looks mathematical.
    // "$5-$10" and "$100$" are money; "$x=3$", "$\pi$", "$a^2$" are math.
    if (best.kind === 'inline' && !/[a-zA-Z\\^_{}]/.test(best.body)) {
      segs.push({ kind: 'text', body: rest.slice(0, best.index + best.len) });
    } else {
      segs.push({ kind: best.kind, body: best.body });
    }
    rest = rest.slice(best.index + best.len);
  }
  return segs;
}

export function hasMath(input: string): boolean {
  // block/paren math, or single-$ inline whose body carries a math signal
  return /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?!\s)(?=[^$\n]*[a-zA-Z\\^_{}])[^$\n]*?[^\s$]\$/.test(input);
}

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
