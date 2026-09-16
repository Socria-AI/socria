'use client';
// components/journal/ds.ts
//
// What the journal may use, and with which props.
//
// The bodies live in ds-bundle.ts, which is machine-extracted and runs with
// checking off. This file is the contract: each declaration is written from
// that component's own parameter list, so a typo in a prop name fails here
// even though the implementation it points at is unchecked.

import type React from 'react';
import * as B from './ds-bundle';

// ── the typed surface the journal imports ────────────────────────────
//
// The bodies above are untyped by construction. These declarations are the
// contract the rest of the journal is checked against, written from each
// component's own parameter list.

export type NodeType =
  | 'goal' | 'decision' | 'value' | 'belief' | 'idea'
  | 'assumption' | 'evidence' | 'question' | 'tension' | 'consequence'
  | 'claim' | 'counterpoint' | 'source' | 'concept' | 'misconception';

export interface TranscriptLine { who: 'you' | 'socria'; text: string; label?: string }
export interface SynthesisSection { label: string; items: string[] }

type C<P> = (props: P) => React.ReactElement | null;

export const Logo = B._Logo as C<{
  size?: 'sm' | 'md' | 'lg' | 'xl'; showWordmark?: boolean; onDark?: boolean;
  markSrc?: string; href?: string;
}>;
export const Label = B._Label as C<{
  children?: React.ReactNode; tone?: 'faint' | 'moss' | 'paper'; tick?: boolean; as?: any;
}>;
export const Button = B._Button as C<{
  children?: React.ReactNode; variant?: 'primary' | 'line' | 'quiet' | 'link';
  size?: 'sm' | 'md' | 'lg' | 'xl'; arrow?: boolean; onDark?: boolean;
  disabled?: boolean; as?: 'a' | 'button'; href?: string; onClick?: () => void;
}>;
export const InkMark = B._InkMark as C<{
  children?: React.ReactNode; shape?: 'circle' | 'underline' | 'strike';
  tone?: 'moss' | 'sage'; drawn?: boolean; italic?: boolean;
}>;
export const InsightCard = B._InsightCard as C<{
  label?: string; text?: string; eyebrow?: string;
  onContinue?: () => void; onShare?: () => void;
}>;
export const Message = B._Message as C<{
  role?: 'user' | 'assistant'; text?: string; children?: React.ReactNode;
}>;
export const SynthesisCard = B._SynthesisCard as C<{
  title?: string; sections?: SynthesisSection[]; markSrc?: string;
}>;
export const Transcript = B._Transcript as C<{ lines?: TranscriptLine[] }>;
export const DefinitionEntry = B._DefinitionEntry as C<{
  word?: string; pronunciation?: string; pos?: string;
  gloss?: React.ReactNode; coda?: React.ReactNode;
}>;
export const Composer = B._Composer as C<{
  placeholder?: string; note?: string; value?: string; showAttach?: boolean;
  onChange?: (v: string) => void; onSend?: (v: string) => void; disabled?: boolean;
}>;
export const GuardBar = B._GuardBar as C<{
  text?: string; hintLabel?: string; revealLabel?: string; hintsLeft?: number;
  onHint?: () => void; onReveal?: () => void;
}>;
export const LogosNode = B._LogosNode as C<{
  type?: NodeType; label?: string; status?: string;
  state?: 'default' | 'lit' | 'focused' | 'dim';
  onClick?: () => void; style?: React.CSSProperties;
}>;

/** The One seal. `letter` turns it into a numbered plate on the ledger. */
export const OneMark = B._OneMark as C<{
  size?: number;
  tone?: 'light' | 'dark';
  drawn?: boolean;
  letter?: string;
}>;
/**
 * The lock beside a node a free map stops short of.
 *
 * Not a bare glyph — it carries its own label and is pressable, so the lock
 * IS the invitation rather than a decoration next to one. Typed from the
 * bundle's own signature rather than from what I assumed it would be.
 */
export const OneLock = B._OneLock as C<{ label?: string; onClick?: () => void }>;
/** The free/One standard, written down so nothing is implied. */
export const SpecTable = B._SpecTable as C<{
  head?: [string, string];
  rows?: [string, string][];
}>;
