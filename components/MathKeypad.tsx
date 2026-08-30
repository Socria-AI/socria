'use client';

// A compact keypad for the notation a keyboard makes awkward.
//
// Two rules shape it. It never appears unless mathematics is actually in play
// (lib/math-context.ts decides that), and it never duplicates a key you
// already have: no digits, no + or -, no letters. What it offers is what is
// genuinely hard to type — ∫ and √ and →, and the structures where the
// difficulty is not the symbol but the shape.
//
// Insertion is plain text into the ordinary textarea, not a structured math
// editor. That is a deliberate limit: prose and mathematics have to mix in one
// box, and every rich-input approach makes ordinary typing worse. What it does
// instead is put the caret where the next thing goes — √(⟨here⟩) — so building
// √((x^2+1)/(x-3)) is a sequence of presses rather than a bracket-counting
// exercise.

import { useEffect, useRef } from 'react';
import type { MathTopic } from '@/lib/math-context';

/** `snippet` may contain one ‸ marking where the caret should land. */
interface Key {
  id: string;
  /** what the button shows */
  face: string;
  snippet: string;
  title: string;
  /** narrower buttons for the single glyphs */
  wide?: boolean;
}

const CARET = '‸';

const BASIC: Key[] = [
  { id: 'sq', face: 'x²', snippet: '^2', title: 'squared' },
  { id: 'pow', face: 'xⁿ', snippet: '^(‸)', title: 'to a power' },
  { id: 'sqrt', face: '√', snippet: 'sqrt(‸)', title: 'square root' },
  { id: 'frac', face: 'a⁄b', snippet: '(‸)/()', title: 'fraction' },
  { id: 'abs', face: '|x|', snippet: 'abs(‸)', title: 'absolute value' },
  { id: 'paren', face: '( )', snippet: '(‸)', title: 'brackets' },
  { id: 'pi', face: 'π', snippet: 'pi', title: 'pi' },
  { id: 'e', face: 'e', snippet: 'e', title: "Euler's number" },
  { id: 'inf', face: '∞', snippet: '∞', title: 'infinity' },
];

const CALCULUS: Key[] = [
  { id: 'lim', face: 'lim', snippet: 'lim x→‸ ', title: 'limit', wide: true },
  { id: 'to', face: '→', snippet: '→', title: 'approaches' },
  { id: 'ddx', face: 'd/dx', snippet: 'd/dx(‸)', title: 'derivative', wide: true },
  { id: 'prime', face: "f'(x)", snippet: "f'(‸)", title: 'derivative of f', wide: true },
  { id: 'int', face: '∫', snippet: '∫(‸)dx', title: 'integral' },
  { id: 'intb', face: '∫ᵃᵇ', snippet: '∫ from ‸ to  of () dx', title: 'definite integral', wide: true },
  { id: 'sum', face: '∑', snippet: '∑(‸)', title: 'sum' },
  { id: 'delta', face: 'δ', snippet: 'δ', title: 'delta' },
];

const FUNCTIONS: Key[] = [
  { id: 'sin', face: 'sin', snippet: 'sin(‸)', title: 'sine', wide: true },
  { id: 'cos', face: 'cos', snippet: 'cos(‸)', title: 'cosine', wide: true },
  { id: 'tan', face: 'tan', snippet: 'tan(‸)', title: 'tangent', wide: true },
  { id: 'ln', face: 'ln', snippet: 'ln(‸)', title: 'natural log' },
  { id: 'log', face: 'log', snippet: 'log(‸)', title: 'log base 10', wide: true },
  { id: 'exp', face: 'eˣ', snippet: 'exp(‸)', title: 'e to the x' },
];

const RELATIONS: Key[] = [
  { id: 'neq', face: '≠', snippet: ' ≠ ', title: 'not equal' },
  { id: 'le', face: '≤', snippet: ' ≤ ', title: 'less than or equal' },
  { id: 'ge', face: '≥', snippet: ' ≥ ', title: 'greater than or equal' },
  { id: 'approx', face: '≈', snippet: ' ≈ ', title: 'approximately' },
  { id: 'pm', face: '±', snippet: '±', title: 'plus or minus' },
  { id: 'theta', face: 'θ', snippet: 'θ', title: 'theta' },
];

const GROUPS: { id: string; label: string; keys: Key[] }[] = [
  { id: 'basic', label: 'Basic', keys: BASIC },
  { id: 'calc', label: 'Calculus', keys: CALCULUS },
  { id: 'fn', label: 'Functions', keys: FUNCTIONS },
  { id: 'rel', label: 'Relations', keys: RELATIONS },
];

/**
 * The handful of keys that go first, given what is being discussed. This is
 * the whole of the "context-aware keypad": a short row promoted to the front,
 * not a different keypad per topic. Reordering is enough to be useful and
 * cheap enough to never be wrong in an expensive way.
 */
const PROMOTED: Record<MathTopic, string[]> = {
  limits: ['lim', 'to', 'inf', 'delta', 'frac', 'sqrt'],
  derivatives: ['ddx', 'prime', 'pow', 'exp', 'ln', 'sin'],
  integrals: ['int', 'intb', 'sum', 'pi', 'e', 'sin'],
  trig: ['sin', 'cos', 'tan', 'pi', 'theta', 'pow'],
  general: [],
};

const ALL = new Map(GROUPS.flatMap((g) => g.keys.map((k) => [k.id, k] as const)));

export function MathKeypad({
  topic,
  onInsert,
  onClose,
}: {
  topic: MathTopic;
  /** text to insert, and where the caret should end up within it */
  onInsert: (text: string, caret: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Escape closes it, the way every other transient surface here behaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const press = (k: Key) => {
    const i = k.snippet.indexOf(CARET);
    const text = k.snippet.replace(CARET, '');
    onInsert(text, i === -1 ? text.length : i);
  };

  const promoted = PROMOTED[topic].map((id) => ALL.get(id)).filter(Boolean) as Key[];

  return (
    <div className="lg-keypad" ref={ref} role="group" aria-label="Mathematical symbols">
      {promoted.length > 0 && (
        <div className="lg-keypad-row is-promoted">
          {promoted.map((k) => (
            <button
              key={`p-${k.id}`}
              type="button"
              className={`lg-key${k.wide ? ' is-wide' : ''}`}
              title={k.title}
              onClick={() => press(k)}
            >
              {k.face}
            </button>
          ))}
        </div>
      )}
      {GROUPS.map((g) => (
        <div key={g.id} className="lg-keypad-row">
          <span className="lg-keypad-label">{g.label}</span>
          {g.keys.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`lg-key${k.wide ? ' is-wide' : ''}`}
              title={k.title}
              onClick={() => press(k)}
            >
              {k.face}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
