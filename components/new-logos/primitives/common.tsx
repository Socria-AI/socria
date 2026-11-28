'use client';
// components/new-logos/primitives/common.tsx — what every primitive's drawing shares: the props a renderer receives,
// mathematics drawn from structure, a field that saves when you leave it or press Enter, a size read from the page,
// and the glyph that says what a primitive is (never colour alone).

import katex from 'katex';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode, type RefObject } from 'react';
import type { ArtifactOp } from '@/lib/new-logos/artifact-ops';
import type { Scope } from '@/lib/new-logos/compose';
import type { Composition, PrimitiveOf, PrimitiveType, Variable } from '@/lib/new-logos/primitives';

export interface PrimProps<K extends PrimitiveType> {
  p: PrimitiveOf<K>;
  comp: Composition;
  scope: Scope;
  /** whether its content may be changed in place */
  editable: boolean;
  selected: boolean;
  /** apply operations to the artifact */
  run: (ops: ArtifactOp[]) => void;
}

/** Mathematics, drawn by KaTeX from LaTeX this code wrote from an expression's structure (never from markup kept). */
export function Tex({ src, display }: { src: string; display?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(src, { displayMode: !!display, throwOnError: false, strict: 'ignore', trust: false, output: 'html' });
    } catch {
      return '';
    }
  }, [src, display]);
  return html ? <span className="nl-tex" dangerouslySetInnerHTML={{ __html: html }} /> : <code>{src}</code>;
}

/** A text field that keeps what is typed until Enter or leaving it, then saves (Escape puts it back). */
export function CommitInput({
  value,
  onCommit,
  numeric,
  className,
  ...rest
}: { value: string; onCommit: (v: string) => void; numeric?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'defaultValue'>) {
  const [v, setV] = useState(value);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setV(value);
  }, [value]);
  // once per edit: Enter commits and then leaves the field, and leaving must not commit the same text again
  const commit = () => {
    if (!editing.current) return;
    editing.current = false;
    if (v !== value) onCommit(v);
  };
  return (
    <input
      {...rest}
      className={`nl-cv-noDrag ${className ?? 'nl-in'}`}
      inputMode={numeric ? 'decimal' : rest.inputMode}
      value={v}
      onFocus={(e) => {
        editing.current = true;
        rest.onFocus?.(e);
      }}
      onChange={(e) => setV(e.target.value)}
      onBlur={(e) => {
        commit();
        rest.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        rest.onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          editing.current = false;
          setV(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** A number field: saves a number, or leaves the value as it was when what is typed is not one. */
export function NumberInput({ value, onCommit, ...rest }: { value: number; onCommit: (n: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'defaultValue'>) {
  return (
    <CommitInput
      {...rest}
      numeric
      value={Number.isFinite(value) ? String(Number(value.toPrecision(12))) : ''}
      onCommit={(s) => {
        const n = Number(s.replace(/[,\s]/g, '').replace(/^−/, '-'));
        if (s.trim() && Number.isFinite(n)) onCommit(n);
      }}
    />
  );
}

/** An element's size as laid out (unaffected by any scale transform above it). */
export function useSize(ref: RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** What a primitive is, as a small drawing. */
export function PrimGlyph({ type, size = 14 }: { type: PrimitiveType; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, 'aria-hidden': true } as const;
  switch (type) {
    case 'text':
      return (
        <svg {...p}>
          <path d="M3 4h10M3 7h10M3 10h7M3 13h5" strokeLinecap="round" />
        </svg>
      );
    case 'equation':
      return (
        <svg {...p}>
          <path d="M3 6h4M3 10h4M10 4.5l3 7M13 4.5l-3 7" strokeLinecap="round" />
        </svg>
      );
    case 'control':
      return (
        <svg {...p}>
          <path d="M2.5 8h11" strokeLinecap="round" />
          <circle cx="6" cy="8" r="2" fill="currentColor" />
        </svg>
      );
    case 'plot':
      return (
        <svg {...p}>
          <path d="M2.5 2.5v11h11" strokeLinecap="round" />
          <path d="M4 11c2-6 4-6 5-3s2 3 4-3" strokeLinecap="round" />
        </svg>
      );
    case 'table':
      return (
        <svg {...p}>
          <rect x="2.5" y="3" width="11" height="10" />
          <path d="M2.5 6.5h11M2.5 10h11M7 3v10" />
        </svg>
      );
    case 'graph':
      return (
        <svg {...p}>
          <circle cx="4" cy="8" r="1.8" />
          <circle cx="12" cy="4" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <path d="M5.6 7.2 10.4 4.8M5.6 8.8l4.8 2.4" />
        </svg>
      );
    case 'diagram':
      return (
        <svg {...p}>
          <rect x="1.8" y="5.5" width="4.4" height="5" />
          <rect x="9.8" y="5.5" width="4.4" height="5" />
          <path d="M6.2 8h3.2" />
        </svg>
      );
    case 'media':
      return (
        <svg {...p}>
          <rect x="2.5" y="3" width="11" height="10" />
          <path d="m3.5 12 3.5-4 2.5 2.5 1.5-1.5 2 3" strokeLinejoin="round" />
          <circle cx="10.5" cy="6" r="1" />
        </svg>
      );
  }
}

/** A short line of guidance inside a primitive. */
export const Hint = ({ children }: { children: ReactNode }) => <p className="nl-prim-hint">{children}</p>;

/** A value typed past a variable's range widens the range with it (one operation, so it undoes in one step). */
export function setOrWiden(v: Variable, n: number): ArtifactOp {
  return n >= v.min && n <= v.max ? { op: 'var.set', name: v.name, value: n } : { op: 'var.update', name: v.name, patch: { value: n, min: Math.min(v.min, n), max: Math.max(v.max, n) } };
}
