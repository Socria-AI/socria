'use client';
// components/new-logos/primitives/Palette.tsx — choosing a primitive to put on an artifact's plane, where it was
// asked for (a double-click, or the Add button).

import { useEffect, useRef } from 'react';
import { PRIMITIVE_LABEL, PRIMITIVE_TYPES, type PrimitiveType } from '@/lib/new-logos/primitives';
import { PrimGlyph } from './common';

export const PRIMITIVE_HINT: Record<PrimitiveType, string> = {
  text: 'Notes, explanations, annotations',
  equation: 'A definition, a function or an expression',
  control: 'A slider, number, toggle or choice',
  plot: 'Functions, data and points on axes',
  table: 'Rows, columns and formulas',
  graph: 'Concepts and how they relate',
  diagram: 'Shapes, connectors, processes',
  media: 'An image or visual evidence',
};

export function Palette({ screen, onPick, onClose }: { screen: { x: number; y: number }; onPick: (t: PrimitiveType) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  const w = 300;
  const left = typeof window === 'undefined' ? screen.x : Math.max(12, Math.min(screen.x - 20, window.innerWidth - w - 12));
  const top = typeof window === 'undefined' ? screen.y : Math.max(60, Math.min(screen.y - 16, window.innerHeight - 420));
  return (
    <div ref={ref} className="nl-creator nl-palette nl-cv-ui" style={{ left, top, width: `min(${w}px, calc(100vw - 24px))` }} role="dialog" aria-label="Add a primitive">
      <div className="nl-label">Add here</div>
      <div className="nl-pick">
        {PRIMITIVE_TYPES.map((t) => (
          <button key={t} type="button" onClick={() => onPick(t)}>
            <PrimGlyph type={t} />
            <span>
              {PRIMITIVE_LABEL[t]}
              <small>{PRIMITIVE_HINT[t]}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
