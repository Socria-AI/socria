// lib/objects/display-timemachine.ts — THE TIME MACHINE: how this thinking got to where it is.
//
// The person looks back through how their line of thinking changed — a
// decision's options and weights, an untangled list, a plan, the map itself —
// event by event, compares any two moments, and writes down, in their own
// words, why something changed. Everything shown is read from what was
// recorded (lib/objects/timeline.ts): each object's own history of steps and
// the map's record of changes (lib/map-history.ts). Nothing earlier is
// imagined; where no reason was recorded, it says so.
//
// Looking back never costs anything. Going back to an earlier state is a look
// along the object's history — the later states are kept — and starting
// afresh from an earlier moment makes a NEW object beside the old one. What is
// forgotten is forgotten only when the person says so.
//
// This state holds only what is the Time Machine's own: what it is about,
// what it follows, and the person's reasons. The timeline is worked out from
// the workspace every time it is drawn, so it never drifts from it.
//
// PURE.

import type { Part, ViewDecl } from './core';
import { register } from './core';
import { cleanBy, cleanText, displayKind, guardBy, headOps, op, registerDisplay, type Args, type By, type Ctx, type DisplayHead, type DisplayMeta } from './display-base';
import { cleanLinks, linkOps, REASONING_VERSION, type Link } from './reasoning';

export type TimeView = 'timeline' | 'compare' | 'reasons';

export interface Reason {
  /** the event it explains: `${obj}@${at}` or `map@${at}` (lib/objects/timeline.ts) */
  key: string;
  /** why it changed, in the person's words */
  text: string;
}

export interface TimeState extends DisplayHead {
  version: number;
  view: TimeView;
  subject: string;
  subjectBy: By;
  /** the objects it follows — none named: every object in the workspace */
  tracked: string[];
  /** whether it follows the map's changes too */
  map: boolean;
  reasons: Reason[];
  links: Link[];
}

export const TIME_LIMITS = { tracked: 16, reasons: 40, text: 400, subject: 240 } as const;
const L = TIME_LIMITS;
const VIEWS: TimeView[] = ['timeline', 'compare', 'reasons'];
const KEY = /^(?:[A-Za-z0-9_]{1,16}|map)(?:@\d{1,14}(?:\+\d{1,3})?|#\d{1,4})$/;
const OBJ = /^[A-Za-z0-9_]{1,16}$/;

export function sanitizeTime(raw: unknown): TimeState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const tracked = [...new Set((Array.isArray(r.tracked) ? r.tracked : []).filter((x): x is string => typeof x === 'string' && OBJ.test(x)))].slice(0, L.tracked);
  const reasons: Reason[] = [];
  for (const x of Array.isArray(r.reasons) ? r.reasons : []) {
    if (reasons.length >= L.reasons) break;
    const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : null;
    const key = typeof o?.key === 'string' && KEY.test(o.key) ? o.key : null;
    const text = cleanText(o?.text, L.text);
    if (!key || !text || reasons.some((q) => q.key === key)) continue;
    reasons.push({ key, text });
  }
  return {
    title: cleanText(r.title, 80) || 'Time Machine',
    version: REASONING_VERSION,
    view: VIEWS.includes(r.view as TimeView) ? (r.view as TimeView) : 'timeline',
    subject: cleanText(r.subject, L.subject),
    subjectBy: cleanBy(r.subjectBy),
    tracked,
    map: r.map !== false,
    reasons,
    links: cleanLinks(r.links),
  };
}

const views: ViewDecl<TimeState>[] = [
  { id: 'timeline', label: 'Timeline', shows: 'every recorded change, in order, and who made it', primary: true, interactions: ['look at a moment', 'go back to it', 'start afresh from it'] },
  { id: 'compare', label: 'Then and now', shows: 'what differs between two moments', interactions: ['choose two moments'] },
  { id: 'reasons', label: 'Why it changed', shows: 'the reasons you gave, and the changes with no reason recorded', interactions: ['say why'] },
];

type S = TimeState;
const withS = (s: S, patch: Partial<S>): S => sanitizeTime({ ...s, ...patch }) ?? s;
const yours = (ctx: Ctx, what: string) => (ctx?.by === 'socria' ? `${what} is yours — Socria does not write it.` : null);

export const TIME_OPS = {
  ...headOps<S>(views, sanitizeTime),
  subject: op<S>(
    'What it is about',
    (s, a, ctx) => (cleanText(a.text, L.subject) ? null : 'Say what you are looking back at.') ?? (ctx?.by === 'socria' && s.subjectBy === 'person' ? 'That is in your words — Socria does not rewrite it.' : null) ?? guardBy(a, ctx),
    (s, a) => withS(s, { subject: cleanText(a.text, L.subject), subjectBy: a.by === 'person' ? 'person' : s.subjectBy }),
    (a) => `about: “${cleanText(a.text, 60)}”`
  ),
  track: op<S>(
    'Follow',
    (s, a, ctx) =>
      (typeof a.obj === 'string' && OBJ.test(a.obj) ? null : 'Say what to follow.') ??
      (a.on === 'yes' || a.on === 'no' ? null : 'Follow it or not.') ??
      (a.on === 'yes' && s.tracked.includes(String(a.obj)) ? 'It is already followed.' : null) ??
      (a.on === 'no' && !s.tracked.includes(String(a.obj)) ? 'It is not followed.' : null) ??
      (a.on === 'yes' && s.tracked.length >= L.tracked ? `It follows ${L.tracked} things at most.` : null) ??
      yours(ctx, 'What it follows'),
    (s, a) => withS(s, { tracked: a.on === 'yes' ? [...s.tracked, String(a.obj)] : s.tracked.filter((x) => x !== a.obj) }),
    (a) => (a.on === 'yes' ? `following ${String(a.obj)}` : `no longer following ${String(a.obj)}`)
  ),
  followAll: op<S>(
    'Follow everything',
    (s, _a, ctx) => (s.tracked.length ? null : 'It already follows everything.') ?? yours(ctx, 'What it follows'),
    (s) => withS(s, { tracked: [] }),
    () => 'following everything'
  ),
  map: op<S>(
    'Follow the map',
    (s, a, ctx) => (a.on === 'yes' || a.on === 'no' ? null : 'Follow the map or not.') ?? (s.map === (a.on === 'yes') ? 'Nothing to change.' : null) ?? yours(ctx, 'What it follows'),
    (s, a) => withS(s, { map: a.on === 'yes' }),
    (a) => (a.on === 'yes' ? 'following the map' : 'not following the map')
  ),
  reason: op<S>(
    'Why it changed',
    (s, a, ctx) =>
      (typeof a.key === 'string' && KEY.test(a.key) ? null : 'Say which change.') ??
      (typeof a.text === 'string' && a.text.length > L.text ? `Say it in ${L.text} characters or fewer.` : null) ??
      (!cleanText(a.text, L.text) && !s.reasons.some((r) => r.key === a.key) ? 'Say why.' : null) ??
      (cleanText(a.text, L.text) && !s.reasons.some((r) => r.key === a.key) && s.reasons.length >= L.reasons ? 'It keeps as many reasons as it can.' : null) ??
      yours(ctx, 'Why something changed'),
    (s, a) => {
      const rest = s.reasons.filter((r) => r.key !== a.key);
      const text = cleanText(a.text, L.text);
      return withS(s, { reasons: text ? [...rest, { key: String(a.key), text }] : rest });
    },
    (a) => (cleanText(a.text, L.text) ? 'said why it changed' : 'took back a reason')
  ),
  ...linkOps<S>(sanitizeTime),
};

export function readTimeOp(text: string, s: S): { op: string; args: Args } | null {
  const t = text.trim().replace(/[.!]+$/, '').toLowerCase();
  if (/^(?:follow|track) (?:everything|it all|all of it)$/.test(t) && s.tracked.length) return { op: 'followAll', args: {} };
  if (/^(?:stop following|ignore|leave out) the map$/.test(t) && s.map) return { op: 'map', args: { on: 'no' } };
  if (/^(?:follow|track|include) the map$/.test(t) && !s.map) return { op: 'map', args: { on: 'yes' } };
  return null;
}

export const TIME = displayKind<S>({
  kind: 'timemachine',
  label: 'Time Machine',
  sanitize: sanitizeTime,
  ops: TIME_OPS,
  readOp: readTimeOp,
  facts: (s) => [
    `${s.title}: the person is looking back at how their thinking changed${s.subject ? ` — “${s.subject}”` : ''}, following ${s.tracked.length ? s.tracked.join(', ') : 'everything in the workspace'}${s.map ? ' and the map' : ''}.`,
    'Its timeline is read only from recorded steps and the map’s record; nothing before the record began is known.',
    ...(s.reasons.length ? [`Reasons they gave for changes: ${s.reasons.map((r) => `“${r.text}”`).join('; ')}.`] : []),
  ],
  text: (s) => [`TIME MACHINE “${s.title}”${s.subject ? ` — ${s.subject}` : ''}`, ...s.reasons.map((r) => `Their reason for ${r.key}: ${r.text}`)].join('\n'),
  parts: (s): Part[] => s.reasons.map((r) => ({ id: r.key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 24), label: r.text })),
  views,
  maxStates: 20,
  argLimits: { count: 8, length: L.text },
  size: (_s, mode) => (mode === 'card' ? { w: 280, h: 150 } : mode === 'trail' ? { w: 200, h: 110 } : { w: 760, h: 560 }),
  shape: (s) => `looking back · ${s.tracked.length ? `${s.tracked.length} followed` : 'everything'}${s.reasons.length ? ` · ${s.reasons.length} reason${s.reasons.length === 1 ? '' : 's'}` : ''}`,
});

/** A Time Machine from how it was asked for: what it is about in the person's words, following everything and the map. */
export function timeMachineFromWords(said: string, tracked: readonly string[] = []): TimeState | null {
  const subject = cleanText(said.replace(/^\s*(?:please\s+)?(?:open\s+)?(?:the\s+)?time machine\s*[:—-]?\s*/i, ''), L.subject);
  return sanitizeTime({ title: 'Time Machine', subject, subjectBy: subject ? 'person' : 'socria', tracked, map: true });
}

export const TIME_META: DisplayMeta = {
  kind: 'timemachine',
  noun: 'time machine',
  handle: 'TM',
  about: 'How this line of thinking changed, read only from what was recorded: every step and every change to the map, two moments side by side, and why things changed in your own words. Going back keeps everything.',
  called: [{ words: ['time machine', 'thinking timeline', 'history of my thinking'] }],
  intents: [
    /\bhow (?:has|have|did) (?:my |our )?(?:thinking|views?|mind|opinions?|plans?|decisions?|ideas?|understanding)(?: \w+){0,4}? (?:changed|change|evolved|evolve|shifted|shift|developed)\b/,
    /\btime machine\b/,
    /\b(?:look|go) back (?:at|over|through) (?:how|what) (?:i|we|my)\b/,
    /\bwhat did i (?:think|believe|say|have) (?:before|earlier|at first|originally|at the start)\b/,
  ],
  experience: true,
  prompts: ['How has my thinking on this changed?', 'Open the time machine on my decision', 'What did I think at the start?'],
  tell: () =>
    'A TIME MACHINE shows how this thinking changed, from recorded steps and the map’s record only. Never describe what the person thought earlier beyond what that record shows, never invent a reason for a change — where none was recorded, say none was — and say plainly when the record does not go back far enough.',
};

register(TIME);
registerDisplay(TIME_META);
