'use client';

// components/MathField.tsx — a real math input, the way Desmos has one.
//
// The expression box used to be a plain <input>, so writing x² meant typing a
// caret and reading back "x^2 - 3". That is programmer notation in a box that
// is asking for mathematics, and for the people this surface exists for — a
// student who cannot yet say what a derivative is — it is one more layer of
// syntax between them and the idea.
//
// This wraps MathLive's <math-field>: press ^ and the caret rises into a real
// superscript, / builds a fraction with a rule, sqrt draws a radical you type
// inside, and the arrow keys walk the structure rather than the string.
//
// THE BOUNDARY IS ASCIIMATH, NOT LATEX.
//
// MathLive speaks both, and LaTeX would have been the obvious choice — but
// everything downstream of this box (sanitizeViz, freeNamesOf, the "only + − ×
// ÷ ^ ( )" check that writes the error message) works on the evaluator's own
// plain grammar, and \frac{x}{2} fails that check on its backslash. AsciiMath
// is that same grammar: `sqrt(x)`, `x^2`, `(a)/(b)`, `pi`. So the draft stays
// plain text exactly as before, nothing downstream changes, and the only new
// thing in the system is what the reader sees while typing.
//
// IT ALWAYS DEGRADES TO THE OLD BOX. MathLive is ~800KB of web component
// loaded on demand; a slow network, a blocked chunk or a browser without
// custom elements must not take the editor with it. Until it resolves — and
// for ever, if it never does — this renders the plain input, with the same
// value and the same callback. Somebody on that path can still type x^2 - 3.

import { useEffect, useRef, useState } from 'react';

/** The bits of MathfieldElement this file touches. */
interface MathfieldLike extends HTMLElement {
  value: string;
  getValue(format: string): string;
  setValue(value: string, options?: { format?: string; suppressChangeNotifications?: boolean }): void;
  menuItems: unknown[];
}

/**
 * Load MathLive once per page, and remember the outcome.
 *
 * A module-level promise rather than per-instance state: the plot editor can
 * open and close repeatedly, and re-importing on each open would re-run the
 * element registration and re-fetch nothing useful.
 */
let loader: Promise<boolean> | null = null;

function loadMathLive(): Promise<boolean> {
  if (loader) return loader;
  loader = import('mathlive')
    .then((m) => {
      const El = (m as unknown as { MathfieldElement?: typeof HTMLElement & Record<string, unknown> })
        .MathfieldElement;
      if (!El) return false;
      // Served from /public rather than guessed relative to the chunk, which
      // is hashed and moves. Sounds off: a keypress that clicks is a
      // surprising thing for a page to do without being asked.
      (El as unknown as Record<string, unknown>).fontsDirectory = '/mathlive/fonts';
      (El as unknown as Record<string, unknown>).soundsDirectory = null;
      return true;
    })
    .catch(() => false);
  return loader;
}

export function MathField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoFocus,
  className,
}: {
  /** the evaluator's plain grammar — "x^2 - 3", not LaTeX */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [ready, setReady] = useState(false);
  const host = useRef<MathfieldLike | null>(null);
  // What this field last emitted. Without it, the value coming back down as a
  // prop re-enters setValue on every keystroke, which resets the caret to the
  // end and makes editing anywhere but the end impossible.
  const emitted = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    loadMathLive().then((ok) => {
      if (live && ok) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  // Seed the field, and re-seed only when the value genuinely came from
  // somewhere else — a scene arriving from Logos, or a concept switch.
  useEffect(() => {
    const el = host.current;
    if (!el || !ready) return;
    if (emitted.current !== null && emitted.current === value) return;
    emitted.current = null;
    try {
      el.setValue(value, { format: 'ascii-math', suppressChangeNotifications: true });
    } catch {
      // A string AsciiMath cannot parse is still a string somebody typed;
      // showing it verbatim beats blanking their work.
      el.value = value;
    }
  }, [value, ready]);

  if (!ready) {
    return (
      <input
        className={className}
        value={value}
        spellCheck={false}
        autoComplete="off"
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <math-field
      ref={(el: MathfieldLike | null) => {
        host.current = el;
        if (el) {
          // The right-click menu offers LaTeX export, colour and matrix
          // editing — a different application's worth of options hanging off
          // a box that draws one curve.
          el.menuItems = [];
          if (autoFocus) el.focus();
        }
      }}
      class={className}
      aria-label={ariaLabel}
      placeholder={placeholder}
      // The virtual keyboard is MathLive's own panel. On a touch screen it is
      // the whole point — there is no ^ on a phone keyboard — and on a desktop
      // it would cover the graph the moment the box is focused.
      math-virtual-keyboard-policy="auto"
      onInput={(e: React.FormEvent<MathfieldLike>) => {
        const el = e.currentTarget;
        let next: string;
        try {
          next = el.getValue('ascii-math');
        } catch {
          next = el.value;
        }
        emitted.current = next;
        onChange(next);
      }}
    />
  );
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          class?: string;
          placeholder?: string;
          'math-virtual-keyboard-policy'?: string;
          ref?: (el: MathfieldLike | null) => void;
        },
        HTMLElement
      >;
    }
  }
}
