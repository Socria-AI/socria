// lib/objects/display-propose.ts — a display drafted from the conversation, sealed by its kind.
//
// THE SAME TRUST BOUNDARY AS THE MODEL ON-RAMP (lib/model/propose.ts): a
// language model PROPOSES a display's state; nothing it writes is trusted.
// The proposal is read here, its kind must be one the workspace has, the
// kind's own sanitizer decides what of it is a state that kind can hold, and
// only then does it become an object of thought (core.create) — drawn,
// edited, undone and synced like any other. When it cannot be made, the
// reason is said in a sentence; nothing is substituted for it.
//
//   buildDisplayPrompt   what the proposal pass is told: the kinds the
//                        workspace has (each kind's own spec and an example
//                        its sanitizer keeps), the day, the guard, and — for
//                        a display made from the map — the map's own ideas.
//   readDisplayProposal  what came back → a sealed state, or why not.
//   planFromMap          a plan made FROM the map is computed, not drafted:
//                        its items are the map's ideas in the person's words,
//                        in the map's own order, with what precedes what kept.
//   makeDisplay          the sealed state → an object in the workspace.
//
// Authorship is RECORDED, never claimed: every `by` a proposal writes is
// dropped before the kind reads it, so all of a drafted display is marked as
// Socria's until the person changes it — and a display converted from the
// map carries the authorship of the ideas it came from.
//
// PURE.

import { create, kindOf, MAX_OBJECTS, type ObjectSpace, type ThoughtObject } from './core';
import { cleanText, displayKinds, displayMeta, freshHandle, isDisplayKind } from './display-base';
import type { DisplayRequest } from './display-request';

/** The map's ideas, as much of them as a display made from the map needs. */
export interface MapMaterial {
  nodes: { id: string; label: string; type?: string; role?: string; origin?: string; status?: string }[];
  edges: { from: string; to: string; relation: string }[];
}

export type Proposal =
  | { ok: true; kind: string; state: unknown; gaps: string[] }
  | { ok: false; failure: 'declined' | 'unsupported' | 'malformed' | 'empty' | 'full'; says: string };

const nounOf = (kind: string | null | undefined) => (kind ? (displayMeta(kind)?.noun ?? kind) : 'display');
const aOrAn = (w: string) => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);

// ── what the proposal pass is told ───────────────────────────────────

export function buildDisplayPrompt(opts: {
  request: DisplayRequest | null;
  today: string;
  guarded: boolean;
  /** the map's ideas, when the display is to be made from them */
  map?: MapMaterial | null;
}): string {
  const r = opts.request;
  const kinds = displayKinds().filter((m) => m.spec);
  const offered = r?.kind ? kinds.filter((m) => m.kind === r.kind) : r?.kinds.length ? kinds.filter((m) => r.kinds.includes(m.kind)) : kinds;
  const catalogue = (offered.length ? offered : kinds)
    .map((m) => {
      const ex = m.example ? `\n  Example: ${JSON.stringify(m.example)}` : '';
      return `- "${m.kind}" — ${m.about}\n  State: ${m.spec}${ex}`;
    })
    .join('\n');
  const asked = r
    ? `They asked for: ${aOrAn(`“${r.noun}”`)}${r.kind ? ` — a ${nounOf(r.kind)}${r.view ? `, opened as its ${r.view} view` : ''}` : ` — one of: ${r.kinds.map(nounOf).join(', ')}; choose the one that fits`}.`
    : 'They asked for something to look at and work with. Choose the kind below that fits what they asked; if none does, say so.';
  const material = opts.map?.nodes.length
    ? `\nMAKE IT FROM THEIR MAP. Use ONLY these ideas, in these words — add nothing the map does not hold, drop nothing that fits:\n${opts.map.nodes
        .slice(0, 40)
        .map((n) => `- [${n.id}] ${n.label}${n.type ? ` (${n.type}${n.role ? `, ${n.role}` : ''})` : ''}`)
        .join('\n')}${
        opts.map.edges.length
          ? `\nRelations: ${opts.map.edges
              .slice(0, 60)
              .map((e) => `${e.from} ${e.relation} ${e.to}`)
              .join('; ')}`
          : ''
      }\n`
    : '';
  const practice = kinds.some((m) => m.practice);
  return `You draft EVERYDAY DISPLAYS for a thinking workspace — a plan, a table, a map of an argument, a chart, a worksheet. You do not answer the conversation; you write ONE display's STATE as JSON. The workspace checks it against the kind's rules, draws it, and the person edits it directly.

${asked}
Today is ${opts.today}. A relative day ("next Friday", "in two weeks") is a real calendar day counted from today; a day the conversation does not give or plainly imply is left out, never guessed.
${material}
THE KINDS THE WORKSPACE HAS (write exactly one, using its own field names):
${catalogue}

RULES
- Use what the conversation says. Never invent facts, figures, sources, prices, dates, quotations or results. Where something is unknown, leave it out or leave the cell empty, and name it in "gaps".
- Keep the person's own words for what they said.
- Keep it to what was asked: a display, not an essay. Short labels; no commentary inside it.
- If what they asked for is none of these kinds, or there is not enough in the conversation to make it honestly, return {"none": "one sentence, in their terms, saying why"}.${
    practice
      ? `\n- A practice display (a worksheet, an exercise) holds what is needed to check the person's work — the workspace keeps it hidden until they try. Never write a worked solution or an answer into any text they can see.${opts.guarded ? ' They are learning right now: give them the problem to work, not its answers in prose.' : ''}`
      : ''
  }

Return ONLY JSON, one of:
{"display": {"kind": "<one of the kinds above>", "state": { …that kind's state… }}, "gaps": ["what could not be filled honestly"]}
{"none": "why not"}`;
}

// ── what came back ───────────────────────────────────────────────────

/** Every `by` a proposal wrote, dropped: who wrote something is recorded, not claimed. */
function unclaimed(v: unknown, depth = 0): unknown {
  if (depth > 8 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => unclaimed(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (k !== 'by') out[k] = unclaimed(x, depth + 1);
  return out;
}

/**
 * A proposal, read. `raw` is the parsed JSON the pass returned. The kind must
 * be one the workspace has and, when the person named one, the one they named
 * — a plan asked for and a comparison returned is not quietly accepted.
 */
export function readDisplayProposal(raw: unknown, ctx: { request: DisplayRequest | null }): Proposal {
  const wantedNoun = nounOf(ctx.request?.kind ?? null);
  if (!raw || typeof raw !== 'object') return { ok: false, failure: 'malformed', says: `What came back was not ${aOrAn(wantedNoun)}, so nothing was added.` };
  const r = raw as Record<string, unknown>;
  if (typeof r.none === 'string' || (r.display === undefined && typeof r.because === 'string')) {
    const why = cleanText(r.none ?? r.because, 240);
    return { ok: false, failure: 'declined', says: `No ${wantedNoun} was made${why ? `: ${why}` : '.'}` };
  }
  const d = r.display as Record<string, unknown> | undefined;
  const kind = typeof d?.kind === 'string' ? d.kind.trim().toLowerCase() : '';
  if (!d || !kind) return { ok: false, failure: 'malformed', says: `What came back was not ${aOrAn(wantedNoun)}, so nothing was added.` };
  if (!isDisplayKind(kind) || !kindOf(kind)) {
    const can = displayKinds().map((m) => m.noun);
    return { ok: false, failure: 'unsupported', says: `The workspace cannot make that kind of display. It can make ${can.slice(0, -1).join(', ')}${can.length > 1 ? ' or ' : ''}${can[can.length - 1]}.` };
  }
  const req = ctx.request;
  if (req && (req.kind ? req.kind !== kind : req.kinds.length && !req.kinds.includes(kind))) {
    return { ok: false, failure: 'malformed', says: `You asked for ${aOrAn(wantedNoun)} and what came back was ${aOrAn(nounOf(kind))}, so nothing was added. Ask again and it will be drafted afresh.` };
  }
  const k = kindOf(kind)!;
  let rawState = unclaimed(d.state ?? d) as Record<string, unknown>;
  // the view the person's word asked for, where the kind has it
  if (req?.view && k.views.some((v) => v.id === req.view) && rawState && typeof rawState === 'object') rawState = { ...rawState, view: req.view };
  const state = k.sanitize(rawState);
  if (state === null) return { ok: false, failure: 'malformed', says: `What came back was not ${aOrAn(nounOf(kind))} the workspace can hold, so nothing was added.` };
  // an empty display is made only when one was plainly asked for — it opens on its starting point
  if (!k.parts(state).length && !req) return { ok: false, failure: 'empty', says: `There was not enough in the conversation to fill ${aOrAn(nounOf(kind))}, so none was made.` };
  const gaps = Array.isArray(r.gaps) ? r.gaps.map((g) => cleanText(g, 160)).filter(Boolean).slice(0, 4) : [];
  return { ok: true, kind, state, gaps };
}

// ── a plan made from the map ─────────────────────────────────────────

const SEQUENCE = new Set(['precedes', 'leads_to']);

/**
 * The map's ideas as a plan, computed: every idea in the person's words, in
 * an order the map's own sequence relations allow (a → b where a precedes or
 * leads to b, or b depends on a), with those relations kept as "waits on"
 * links. Questions stay on the map — a plan is things to do or that happen.
 */
export function planFromMap(map: MapMaterial, opts: { title?: string; view?: string } = {}): unknown {
  const nodes = map.nodes.filter((n) => n.type !== 'question' && cleanText(n.label, 120)).slice(0, 40);
  const ids = new Set(nodes.map((n) => n.id));
  const after: [string, string][] = [];
  for (const e of map.edges) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    if (SEQUENCE.has(e.relation)) after.push([e.from, e.to]);
    else if (e.relation === 'depends') after.push([e.to, e.from]);
  }
  // a stable topological order: the map's order wherever the relations leave a choice
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const [, b] of after) indeg.set(b, (indeg.get(b) ?? 0) + 1);
  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < nodes.length) {
    const next = nodes.find((n) => !done.has(n.id) && (indeg.get(n.id) ?? 0) === 0) ?? nodes.find((n) => !done.has(n.id))!;
    done.add(next.id);
    order.push(next.id);
    for (const [a, b] of after) if (a === next.id) indeg.set(b, (indeg.get(b) ?? 1) - 1);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const itemId = new Map(order.map((id, i) => [id, `i${i + 1}`]));
  return {
    title: cleanText(opts.title, 80) || 'From the map',
    ...(opts.view ? { view: opts.view } : { view: 'checklist' }),
    items: order.map((id) => {
      const n = byId.get(id)!;
      return {
        id: itemId.get(id),
        text: cleanText(n.label, 120),
        ...(n.status === 'resolved' ? { status: 'done' } : {}),
        by: n.origin === 'socria' ? 'socria' : 'person',
      };
    }),
    // the sanitizer drops any link that would close a loop, so a cyclic map still makes a plan
    links: after.map(([a, b]) => ({ from: itemId.get(a), to: itemId.get(b), by: 'person' })),
  };
}

// ── into the workspace ───────────────────────────────────────────────

/**
 * A sealed state, made an object of thought. The workspace holds a dozen
 * objects at most; past that the person is told, and nothing is evicted to
 * make room.
 */
export function makeDisplay(
  space: ObjectSpace,
  kind: string,
  state: unknown,
  origin: 'socria' | 'person'
): { ok: true; space: ObjectSpace; obj: ThoughtObject } | { ok: false; failure: 'full' | 'malformed'; says: string } {
  if (space.objs.length >= MAX_OBJECTS) {
    return { ok: false, failure: 'full', says: `The workspace already holds ${MAX_OBJECTS} things, which is as many as it keeps — remove one and ask again.` };
  }
  const meta = displayMeta(kind);
  const made = create(space, kind, state, { name: freshHandle(space.objs.map((o) => o.name), meta?.handle ?? 'D'), origin });
  if (!made) return { ok: false, failure: 'malformed', says: `That could not be kept as ${aOrAn(nounOf(kind))}, so nothing was added.` };
  return { ok: true, space: made.space, obj: made.obj };
}

/** What the person is told a display is, once it exists: one line, in their terms. */
export function madeSays(obj: ThoughtObject, gaps: string[] = []): string {
  const k = kindOf(obj.kind);
  const st = obj.states[obj.at] as { title?: string } | undefined;
  const noun = nounOf(obj.kind);
  const shape = k ? k.shape(obj.states[obj.at] as never) : noun;
  const who = obj.origin === 'person' ? 'Made from your map' : 'Drafted by Socria';
  const named = st?.title ? ` “${st.title}”` : '';
  const left = gaps.length ? ` It could not fill: ${gaps.join('; ')}.` : '';
  return `${who}: ${aOrAn(noun)}${named} (${shape}) — yours to change by hand or in words.${left}`.slice(0, 300);
}
