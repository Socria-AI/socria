// lib/visual/context.ts — WHAT SOCRIA KNOWS ABOUT THE PICTURES ON SCREEN (Logos 6, November 2026).
//
// Two things reach Core with a turn, both as words it reads, never as anything it runs:
//   • THE CATALOGUE, built on the server from the conversation it already has (each reply's elements and what was done
//     with them, lib/inline-ui.ts): the newest pictures, each with its key, its parts' ids and labels, and the numbers
//     that matter now — a parameter's value, range and start; where the curves meet; the rectangles' total against the
//     exact area. So "why did the approximation get better?" is answered from the graph as it stands.
//   • THE NOTE, from the browser, with the person's message: what was done on screen for that message (the demand curve
//     highlighted), what they selected ("this"), the meaningful changes since they last wrote (n from 4 to 20, by them),
//     a reference that was ambiguous, a request that could not be shown. Untrusted: shaped and clipped here
//     (sanitizeVisNote), read as one bracketed line before their words, never as their words.
// And the rule that lets a reply point while it explains (VISUAL_CUES): markers on its own words (./actions.ts).
//
// Pure: no React, no DOM, no clock.

import { fmtVal } from '../inline-math';
import { sanitizeInlineState, specsIn, type InlineSpec } from '../inline-ui';
import { visualArtifact, type VisualArtifact, type VisualElement } from './elements';

// ── the note from the browser ────────────────────────────────────────

export interface VisNote {
  /** what was done on screen for this message: "Highlighted the demand curve on “Market”." */
  done?: string[];
  /** the part they had selected when they wrote: "the Demand curve on “Market”" */
  sel?: string;
  /** meaningful changes since they last wrote: "On “Riemann sums”, n went from 4 to 20 (moved by them)." */
  changes?: string[];
  /** their words fit more than one part: the candidates, for Socria to ask which */
  ask?: string;
  /** understood, but not something the picture can show */
  cannot?: string;
  /** what they are looking at that the conversation does not hold: the Mind Map open, its cards by exact id */
  on?: string;
}

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** The note as it came from a browser: shaped, clipped, a few lines at most — context, trusted for nothing else. */
export function sanitizeVisNote(raw: unknown): VisNote | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => clip(x, 220)).filter(Boolean).slice(0, 4) : []);
  const out: VisNote = {};
  const done = list(r.done), changes = list(r.changes);
  if (done.length) out.done = done;
  if (changes.length) out.changes = changes;
  const sel = clip(r.sel, 160), ask = clip(r.ask, 240), cannot = clip(r.cannot, 220), on = clip(r.on, 900);
  if (sel) out.sel = sel;
  if (on) out.on = on;
  if (ask) out.ask = ask;
  if (cannot) out.cannot = cannot;
  return Object.keys(out).length ? out : undefined;
}

/** The note as Socria reads it: one bracketed line before their words. */
export function visNoteLine(n: VisNote): string {
  const parts = [
    n.done?.length ? `Done on screen for this message, before your reply: ${n.done.join(' ')} It is done — say what to notice; do not explain how to do it.` : '',
    n.sel ? `They had selected ${n.sel} ("this", "that" means it).` : '',
    n.changes?.length ? `Changed since they last wrote: ${n.changes.join(' ')}` : '',
    n.ask ? `Their words fit more than one part (${n.ask}): ask which, in one short line, naming them — do not pick one.` : '',
    n.cannot ? `They asked for something the picture cannot show: ${n.cannot} Say so plainly; do not pretend it was shown.` : '',
    n.on ? `${n.on} — point at a card with [its words](vis:focus/node:…) using these ids.` : '',
  ].filter(Boolean);
  return parts.length ? `[On screen — ${parts.join(' ')}]` : '';
}

// ── the catalogue, from the conversation ─────────────────────────────

/** The kinds whose parts are worth naming to Socria. */
const NAMED = new Set(['graph', 'vectors', 'trace', 'steps', 'diagram', 'sequence', 'sim', 'equation']);

/** One part, as Socria is told it: id, label, and the number that matters about it now. */
function partSaid(e: VisualElement): string {
  const m = e.meta ?? {};
  const v = (k: string) => (typeof m[k] === 'number' && Number.isFinite(m[k] as number) ? fmtVal(m[k] as number) : null);
  let tail = '';
  if (e.kind === 'param') tail = ` = ${v('value')}${m.unit ? ` ${m.unit}` : ''} (${v('min')} to ${v('max')}${m.value !== m.start ? `, started ${v('start')}` : ''})`;
  else if (e.kind === 'point' && m.at) tail = ` at ${m.at}${m.was && m.was !== m.at ? ` (was ${m.was})` : ''}`;
  else if (e.kind === 'point' && v('x') !== null && v('y') !== null) tail = ` at (${v('x')}, ${v('y')})`;
  // an approximation against the exact value, to four places: 2.6658 against 2.6667, not 2.67 against 2.67
  else if (e.id === 'region:rectangles' && v('sum') !== null) tail = `: ${m.n} ${m.rule} rectangles, total ${fmtVal(m.sum as number, 4)} against ${fmtVal(m.exact as number, 4)}`;
  else if (e.kind === 'region' && v('value') !== null) tail = ` = ${v('value')}`;
  else if (e.kind === 'line' && v('slope') !== null) tail = `, slope ${v('slope')}`;
  else if (e.kind === 'curve' && m.expr) tail = ` (y = ${m.expr})`;
  else if (e.kind === 'vector' && v('mag') !== null) tail = ` ${v('mag')} at ${v('angle')}°`;
  const label = e.label.length > 70 ? `${e.label.slice(0, 67)}…` : e.label;
  return `${e.id} “${label}”${tail}`;
}

/** One artifact in a line: what it is, its key, its parts. */
export function catalogueLine(a: VisualArtifact, where?: string): string {
  const parts = a.elements.filter((e) => e.kind !== 'edge' && e.kind !== 'cell').slice(0, 14).map(partSaid);
  return `- “${a.title}” — ${a.type}${where ? ` ${where}` : ''} [${a.key}]: ${parts.join('; ')}${a.elements.length > 14 ? '; …' : ''}`;
}

/**
 * The pictures on screen, newest first, from the conversation: each reply's elements as they now stand (the state the
 * person left them in). At most three, and only kinds with parts to name.
 */
export function catalogueOf(messages: readonly { id?: string; role?: string; content?: unknown; ui?: unknown }[], max = 3): VisualArtifact[] {
  const out: VisualArtifact[] = [];
  for (let i = messages.length - 1; i >= 0 && out.length < max; i--) {
    const m = messages[i];
    if (!m?.id || m.role !== 'assistant' || typeof m.content !== 'string' || !m.content.includes('```ui')) continue;
    const ui = sanitizeInlineState(m.ui);
    const specs = specsIn(m.content) as (InlineSpec | null)[];
    for (let n = specs.length - 1; n >= 0 && out.length < max; n--) {
      const spec = specs[n];
      if (!spec || !NAMED.has(spec.type)) continue;
      const a = visualArtifact(`${m.id}:${n}`, spec, ui?.[String(n)]);
      if (a.elements.length) out.push(a);
    }
  }
  return out;
}

/**
 * HOW A REPLY POINTS. Shown when there is a picture to point at — on screen, or offered to this reply.
 * The ids of what is drawn in the same reply follow from its labels, so the reply can point at what it is drawing.
 */
export const VISUAL_CUES =
  '\n\nPOINTING AT THE PICTURE. When a sentence explains a part of a picture — one on screen (listed below) or one you draw in this reply — you may wrap the few words naming that part in a marker, and it is lit as they read that sentence: [the demand curve](vis:highlight/curve:demand). Other markers: [the equilibrium](vis:focus/point:equilibrium); [demand rises](vis:animate/param:d?to=4) moves the model\'s own parameter, so the picture changes exactly as the model says (only to a value inside its range); [the second step](vis:step?step=2); [along the curve](vis:trace/curve:f); [where it started](vis:compare); [MR and MC](vis:highlight/curve:mr+curve:mc). Ids of what you draw now come from its labels: curve:<label in lower case, hyphens for spaces> (curve:f when it has none), point:equilibrium (demand meets supply), point:mr-mc, point:crossing, point:turning, point:root, line:tangent, line:secant, region:<the area\'s label> (region:area when it has none), region:rectangles, param:<name>, vector:<label>, vector:sum, step:<n>, node:<id>, item:<n>, path:trajectory. Rules: at most three markers in a reply, each on the sentence that explains that part, in the order you explain them; only parts that exist — a marker that names nothing is shown as plain words; never on every mention, never for decoration; an animation only when the change IS what the sentence explains. A graph you draw can carry "animate": {"param":"b","to":2.05} to play a change when it first appears (a secant closing on a tangent, rectangles growing in number, demand shifting) — the model\'s own parameter, moving inside its range.';

/** The pictures on screen and how to point at them, for this turn; nothing when there is nothing to point at. */
export function visualBlock(arts: readonly VisualArtifact[], drawing: boolean): string {
  if (!arts.length && !drawing) return '';
  const list = arts.length ? `\nON SCREEN NOW (newest first; ids are exact):\n${arts.map((a, i) => catalogueLine(a, i === 0 ? '(newest)' : '')).join('\n')}` : '';
  return `${VISUAL_CUES}${list}`;
}
