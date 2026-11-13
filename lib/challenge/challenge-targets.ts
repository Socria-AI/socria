// lib/challenge/challenge-targets.ts — WHAT THE STRUCTURE SHOWS, FOUND IN CODE (Logos 6, Phase 1; pure).
//
// Before any model is asked, the map is read for the weaknesses its structure proves on its own: two settled
// claims the map says pull against each other; an assumption with nothing under it that other ideas rest on; a
// claim with no evidence; a constraint working against something wanted; a decision with one option, or options
// and nothing to judge them by. These are Synthesize's findings (lib/logos-synthesis.ts digest) and the
// workspace's gaps, phrased as challenge findings and ordered by how much rests on each (lib/logos6/support.ts).
//
// Each quotes the card it is about, word for word — so each passes the gate's quote check by construction, and a
// challenge can stand on these alone when no model answers (or the trial's day is spent). The model is shown them
// as what the structure already shows, to phrase better and to add to, never to contradict without a quote.
//
// Socria's own cards are never targets: a drawing of the subject (origin 'drawn'), material they brought
// ('source'), something computed, a finding kept from an earlier challenge.

import { digest } from '../logos-synthesis';
import type { ThinkingMap } from '../logos';
import { isTheirs, restsOn, weightOf } from '../logos6/support';
import type { ChallengeScopeKind, Finding, FindingKind } from './challenge';

export interface ScopeIn {
  kind: ChallengeScopeKind;
  ids?: string[];
}

/** A structural finding with the weight that orders it. */
export interface Targeted extends Finding {
  weight: number;
}

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The cards a challenge of this scope is about: the selection, the card and what touches it, or the whole line. */
export function scopeIds(map: Pick<ThinkingMap, 'nodes' | 'edges'>, scope: ScopeIn): Set<string> | null {
  if (scope.kind === 'line' || scope.kind === 'document' || !scope.ids?.length) return null;
  const ids = new Set(scope.ids.filter((id) => map.nodes.some((n) => n.id === id)));
  if (scope.kind === 'card') {
    // a card's challenge looks at what it rests on and what pulls against it too
    for (const e of map.edges) {
      if (ids.has(e.from)) ids.add(e.to);
      else if (ids.has(e.to)) ids.add(e.from);
    }
  }
  return ids.size ? ids : null;
}

/**
 * The weaknesses the structure proves, as findings, strongest first. `limit` keeps the list short enough to
 * show the model and to stand alone.
 */
export function structureFindings(map: ThinkingMap, scope: ScopeIn, limit = 6): Targeted[] {
  if (!map.nodes.length) return [];
  const within = scopeIds(map, scope);
  const inScope = (id: string) => !within || within.has(id);
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const theirs = (id: string) => {
    const n = byId.get(id);
    return !!n && isTheirs(n);
  };
  const out: Targeted[] = [];
  const seen = new Set<string>();
  const push = (kind: FindingKind, text: string, refs: string[], extra: Partial<Finding> = {}) => {
    const key = `${kind}:${refs.join(',')}`;
    if (seen.has(key) || !refs.length || !refs.every((r) => byId.has(r))) return;
    seen.add(key);
    const anchors = refs.slice(0, 2).map((r) => ({ from: 'idea' as const, ref: r, quote: byId.get(r)!.label }));
    const weight = Math.max(...refs.map((r) => weightOf(map, r)));
    out.push({ id: '', kind, text, anchors, confidence: 'high', target: refs[0], by: 'structure', weight, ...extra });
  };

  const d = digest(map, scope.kind === 'selection' && scope.ids?.length ? { scope: 'selection', ids: scope.ids } : {});
  for (const f of d.findings) {
    if (!f.refs.some(inScope) || !f.refs.every(theirs)) continue;
    const [a, b] = f.refs.map((r) => byId.get(r)!);
    if (f.kind === 'contradiction' && a && b) {
      push('contradiction', `“${short(a.label)}” and “${short(b.label)}” are both treated as settled, but they pull against each other.`, [a.id, b.id], {
        matters: 'Whatever rests on either one inherits the conflict.',
        settle: 'Say which one gives way, or under what condition each holds.',
      });
    } else if (f.kind === 'constraint-against-goal' && a && b) {
      push('risk', `The constraint “${short(a.label)}” works against “${short(b.label)}”, which you want.`, [a.id, b.id], {
        settle: 'Decide which yields, or find what would let both hold.',
      });
    } else if (f.kind === 'single-option' && a) {
      push('alternative', `Only one option is on the table: “${short(a.label)}”.`, [a.id], {
        matters: 'Without something to choose against, it is not yet a choice.',
        settle: 'Name the strongest alternative and judge both the same way.',
      });
    } else if (f.kind === 'no-criteria' && a) {
      push('gap', 'The options are there, but nothing says what they should be judged on.', f.refs.slice(0, 2), {
        settle: 'Write down the two or three things that would make one option better.',
      });
    }
  }

  // assumptions and claims with nothing under them, worth most where most rests on them
  for (const n of map.nodes) {
    if (!inScope(n.id) || !isTheirs(n) || n.status === 'resolved' || n.status === 'supported') continue;
    if (restsOn(map, n.id).length) continue;
    const w = weightOf(map, n.id);
    if (n.type === 'assumption' && w >= 1) {
      push('assumption', `${w === 1 ? 'Another idea rests' : `${w} other ideas rest`} on “${short(n.label)}”, and nothing here supports it yet.`, [n.id], {
        matters: 'If it is wrong, what rests on it goes with it.',
        settle: 'Find one piece of evidence for it, or one against.',
      });
    } else if ((n.type === 'claim' || n.role === 'claim') && w >= 1) {
      push('evidence', `“${short(n.label)}” has no evidence under it, and ${w === 1 ? 'another idea rests' : `${w} other ideas rest`} on it.`, [n.id], {
        settle: 'Attach the source or the observation it comes from.',
      });
    }
  }

  return out
    .sort((x, y) => y.weight - x.weight || x.kind.localeCompare(y.kind))
    .slice(0, limit)
    .map((f, i) => ({ ...f, id: `s${i + 1}` }));
}
