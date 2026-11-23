// lib/ux-v0/graphics/creative/plan.ts — a creative instruction as a plan: what kind of change it is, what to keep, and
// each decision to change. The model writes plans (creative-edit stage), the reader writes them when the model cannot
// be reached (interpret.ts), and the engine carries them out (execute.ts). Whatever writes it, a plan is held to this
// shape here: an unknown decision, a form or a theme outside the catalogue, a colour that is not a colour, a font off
// the list or text the person did not give is dropped, never carried out.

import { FONTS } from '../../fonts';
import { ROLES, type Role } from '../doc';
import { FORM_KINDS, type FormKind } from './forms';
import { PALETTE_SHIFTS, QUALITIES, THEMES, TYPE_CHARACTERS, type PaletteShift, type TypeCharacter } from './lexicon';
import { DECISION_KEYS, type DecisionKey } from './decisions';

export const INTENTS = ['object', 'global', 'composition', 'typography', 'style', 'brand', 'content', 'redesign', 'theme', 'concept'] as const;
export type Intent = (typeof INTENTS)[number];

export const KEEPABLE = ['palette', 'type', 'composition', 'forms', 'background', 'depth', 'words', 'logo', 'pictures'] as const;
export type Keepable = (typeof KEEPABLE)[number];

export const COMPOSITION_ACTIONS = ['rethink', 'unexpected', 'airy', 'denser', 'asymmetric', 'centred', 'alternative'] as const;
export type CompositionAction = (typeof COMPOSITION_ACTIONS)[number];

export const CONCEPT_ACTIONS = ['save', 'duplicate', 'compare', 'revisit', 'new', 'alternative'] as const;
export type ConceptAction = (typeof CONCEPT_ACTIONS)[number];

export type Change =
  | { decision: 'theme'; theme: string; forms?: FormKind; abstraction?: number; mode?: 'light' | 'dark' }
  | { decision: 'palette'; shifts?: PaletteShift[]; colours?: { ground?: string; ink?: string; accent?: string; support?: string[] }; from?: string }
  | { decision: 'type'; character?: TypeCharacter; display?: string; body?: string; weight?: 'lighter' | 'heavier'; case?: 'upper' | 'none'; from?: string }
  | { decision: 'composition'; action: CompositionAction; from?: string }
  | { decision: 'forms'; kind?: FormKind; abstraction?: number; delta?: number; count?: number; scale?: number; remove?: boolean; from?: string }
  | { decision: 'background'; kind?: 'flat' | 'gradient' | 'texture'; colours?: string[]; tone?: 'darker' | 'lighter' | 'theme' | 'contrast'; from?: string }
  | { decision: 'depth'; delta?: number; level?: number }
  | { decision: 'mood'; qualities: string[] }
  | { decision: 'content'; role: Role; text: string }
  | { decision: 'object'; words: string }
  | { decision: 'revert'; target: DecisionKey }
  | { decision: 'concept'; action: ConceptAction; ref?: string; name?: string };

export interface PlanQuestion {
  text: string;
  /** at most four ways to answer, each the words that would be said */
  options: { label: string; words: string }[];
}

export interface CreativePlan {
  intent: Intent;
  /** what will change, said to the person, in a sentence */
  summary: string;
  keep: Keepable[];
  changes: Change[];
  /** one question, when the instruction can mean genuinely different things */
  question?: PlanQuestion;
  /** why these changes (what was measured, for a vague improvement), said back with what was done; the reader's own */
  reason?: string;
  /** who read the words into this plan */
  by: 'model' | 'reader';
}

const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined);
const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: unknown) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : undefined);
const font = (v: unknown) => (typeof v === 'string' ? FONTS.find((f) => f.name.toLowerCase() === v.toLowerCase())?.name : undefined);
const REF = /^[\w -]{1,60}$/;

/** A theme by id, or by any word its catalogue entry recognises ("sky" → cloud). */
export function themeOf(v: unknown): string | undefined {
  const w = str(v, 60).toLowerCase();
  if (!w) return undefined;
  return (THEMES.find((t) => t.id === w) ?? THEMES.find((t) => t.words.test(w)))?.id;
}

function change(v: unknown, given: string): Change | null {
  const r = o(v);
  switch (r.decision) {
    case 'theme': {
      const theme = themeOf(r.theme);
      if (!theme) return null;
      return { decision: 'theme', theme, ...(oneOf(r.forms, FORM_KINDS) ? { forms: r.forms } : {}), ...(num(r.abstraction, 0, 100) !== undefined ? { abstraction: num(r.abstraction, 0, 100) } : {}), ...(oneOf(r.mode, ['light', 'dark'] as const) ? { mode: r.mode } : {}) };
    }
    case 'palette': {
      const shifts = (Array.isArray(r.shifts) ? r.shifts : []).map((x: unknown) => oneOf(x, PALETTE_SHIFTS)).filter((x: PaletteShift | undefined): x is PaletteShift => !!x).slice(0, 4);
      const c = o(r.colours);
      const colours = { ...(hex(c.ground) ? { ground: hex(c.ground) } : {}), ...(hex(c.ink) ? { ink: hex(c.ink) } : {}), ...(hex(c.accent) ? { accent: hex(c.accent) } : {}), ...((sup) => (sup.length ? { support: sup } : {}))((Array.isArray(c.support) ? c.support : []).map(hex).filter((x: string | undefined): x is string => !!x).slice(0, 3)) };
      const from = str(r.from, 60);
      if (!shifts.length && !Object.keys(colours).length && !REF.test(from)) return null;
      return { decision: 'palette', ...(shifts.length ? { shifts } : {}), ...(Object.keys(colours).length ? { colours } : {}), ...(REF.test(from) ? { from } : {}) };
    }
    case 'type': {
      const out: Extract<Change, { decision: 'type' }> = { decision: 'type' };
      if (oneOf(r.character, TYPE_CHARACTERS)) out.character = r.character;
      if (font(r.display)) out.display = font(r.display);
      if (font(r.body)) out.body = font(r.body);
      if (oneOf(r.weight, ['lighter', 'heavier'] as const)) out.weight = r.weight;
      if (oneOf(r.case, ['upper', 'none'] as const)) out.case = r.case;
      if (REF.test(str(r.from, 60))) out.from = str(r.from, 60);
      return Object.keys(out).length > 1 ? out : null;
    }
    case 'composition': {
      const action = oneOf(r.action, COMPOSITION_ACTIONS);
      if (!action) return null;
      return { decision: 'composition', action, ...(REF.test(str(r.from, 60)) ? { from: str(r.from, 60) } : {}) };
    }
    case 'forms': {
      const out: Extract<Change, { decision: 'forms' }> = { decision: 'forms' };
      if (oneOf(r.kind, FORM_KINDS)) out.kind = r.kind;
      if (num(r.abstraction, 0, 100) !== undefined) out.abstraction = num(r.abstraction, 0, 100);
      if (num(r.delta, -100, 100) !== undefined) out.delta = num(r.delta, -100, 100);
      if (num(r.count, -1, 3) !== undefined) out.count = num(r.count, -1, 3);
      if (num(r.scale, -0.8, 1.5) !== undefined) out.scale = num(r.scale, -0.8, 1.5);
      if (r.remove === true) out.remove = true;
      if (REF.test(str(r.from, 60))) out.from = str(r.from, 60);
      return Object.keys(out).length > 1 ? out : null;
    }
    case 'background': {
      const out: Extract<Change, { decision: 'background' }> = { decision: 'background' };
      if (oneOf(r.kind, ['flat', 'gradient', 'texture'] as const)) out.kind = r.kind;
      const colours = (Array.isArray(r.colours) ? r.colours : []).map(hex).filter((x: string | undefined): x is string => !!x).slice(0, 3);
      if (colours.length) out.colours = colours;
      if (oneOf(r.tone, ['darker', 'lighter', 'theme', 'contrast'] as const)) out.tone = r.tone;
      if (REF.test(str(r.from, 60))) out.from = str(r.from, 60);
      return Object.keys(out).length > 1 ? out : { decision: 'background', kind: 'gradient' };
    }
    case 'depth': {
      const delta = num(r.delta, -3, 3);
      const level = num(r.level, 0, 3);
      if (delta === undefined && level === undefined) return null;
      return { decision: 'depth', ...(delta !== undefined ? { delta: Math.round(delta) } : {}), ...(level !== undefined ? { level: Math.round(level) } : {}) };
    }
    case 'mood': {
      const ids = new Set(QUALITIES.map((q) => q.id));
      const qualities = (Array.isArray(r.qualities) ? r.qualities : []).filter((q: unknown): q is string => typeof q === 'string' && ids.has(q)).slice(0, 4);
      return qualities.length ? { decision: 'mood', qualities } : null;
    }
    case 'content': {
      const role = oneOf(r.role, ROLES);
      const text = str(r.text, 300);
      // the words are the person's own: a plan never invents copy, so text must appear in what they said
      if (!role || !text || !given.toLowerCase().includes(text.toLowerCase())) return null;
      return { decision: 'content', role, text };
    }
    case 'object': {
      const words = str(r.words, 300);
      return words ? { decision: 'object', words } : null;
    }
    case 'revert': {
      const target = oneOf(r.target, DECISION_KEYS);
      return target ? { decision: 'revert', target } : null;
    }
    case 'concept': {
      const action = oneOf(r.action, CONCEPT_ACTIONS);
      if (!action) return null;
      return { decision: 'concept', action, ...(REF.test(str(r.ref, 60)) ? { ref: str(r.ref, 60) } : {}), ...(str(r.name, 60) ? { name: str(r.name, 60) } : {}) };
    }
  }
  return null;
}

/** One question with two to four ways to answer it, each the words that would be said; null when it is not one. */
export function normalizeQuestion(v: unknown): PlanQuestion | null {
  const q = o(v);
  const options = (Array.isArray(q.options) ? q.options : [])
    .map((x: unknown) => (typeof x === 'string' ? { label: str(x, 80), words: str(x, 200) } : { label: str(o(x).label, 80), words: str(o(x).words, 200) || str(o(x).label, 200) }))
    .filter((x: { label: string; words: string }) => x.label && x.words)
    .slice(0, 4);
  return str(q.text, 300) && options.length >= 2 ? { text: str(q.text, 300), options } : null;
}

/**
 * A plan held to its shape (a model's answer, or anything read back): bounded, every change checked, keep and change
 * reconciled (a decision kept is not changed), at most one question with at most four answers. Null when nothing in
 * it can be carried out or asked.
 */
export function normalizePlan(v: unknown, given: string, by: CreativePlan['by']): CreativePlan | null {
  const r = o(v);
  const keep = [...new Set((Array.isArray(r.keep) ? r.keep : []).map((k: unknown) => oneOf(k, KEEPABLE)).filter((k: Keepable | undefined): k is Keepable => !!k))] as Keepable[];
  const kept = new Set<string>(keep);
  const changes = (Array.isArray(r.changes) ? r.changes : [])
    .slice(0, 12)
    .map((c: unknown) => change(c, given))
    .filter((c: Change | null): c is Change => !!c)
    // a decision kept is never changed by the same plan
    .filter((c: Change) => !kept.has(c.decision === 'theme' ? 'forms' : c.decision));
  const question = normalizeQuestion(r.question) ?? undefined;
  if (!changes.length && !question) return null;
  return { intent: oneOf(r.intent, INTENTS) ?? 'global', summary: str(r.summary, 300) || 'the change asked for', keep, changes, ...(question ? { question } : {}), by };
}
