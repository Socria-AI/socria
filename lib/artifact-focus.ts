// lib/artifact-focus.ts — SOCRIA CHANGES THE ARTIFACT IN PLACE (Logos 6, November 2026).
//
// "Add a branch for memory cells", "make the tax 2", "show it as a tree": said about an artifact the person can see,
// it is a change to THAT artifact, never a reason to draw a new one. This is the server's half:
//
//   • asksToChange — the words plainly ask for a change (an imperative edit verb), not a question about something;
//   • editTargetOf — the artifact they mean: the kept one open in Artifacts ("in hand"), else the element in Socria's
//     last reply (or what it was kept as), else nothing — never guessed from further back;
//   • editFocusBlock — what the model is told: the artifact as it stands (its JSON, which is what an edit is written
//     against), how to write the change as an edit block, and that everything not named stays as it is;
//   • gateEditBlock — the edit block, checked WHOLE against that artifact before anyone sees it (lib/artifact-edit.ts
//     applyEdits): one that would not hold changes nothing and says so; one that holds goes out in canonical form with
//     what it changes said by the code, not by the model.
//
// The client applies a canonical block as a Socria step on the kept artifact (keeping the reply's element first when it
// was not kept yet), so it is undone, versioned and synced like any other change (components/LogosApp.tsx).

import { parseInlineSpec, sanitizeInlineState, specsIn, type EditSpec, type InlineSpec, type InlineState } from './inline-ui';
import { applyEdits, changeSaid, nounOf, sanitizeEdits, EDIT_LIMITS } from './artifact-edit';
import { apply as applyStep, currentOf, objOf, type ObjectSpace } from './objects/core';
import { keptFrom, makeDisplay } from './objects';

/** What can be changed in place: every element Keep keeps as itself (components/inline/InlineUI.tsx KEEPABLE). */
export const EDITABLE = new Set<InlineSpec['type']>(['graph', 'sim', 'claim', 'check', 'steps', 'slider', 'reasoning', 'concepts', 'sequence', 'draft', 'diagram', 'balance', 'equation', 'vectors', 'trace']);

const LEAD = String.raw`^(?:(?:ok(?:ay)?|now|then|and|also|so|right|great|thanks|cool|nice|perfect|good|yes|yeah)[,!.\s—–-]+)*(?:(?:can|could|would|will) you\s+|let'?s\s+|i'?d like (?:you )?to\s+|i want (?:you )?to\s+|please\s+|pls\s+)?(?:please\s+)?`;
/** Verbs that change a structure whatever follows them ("add memory cells under adaptive immunity"). */
const STRONG = new RegExp(`${LEAD}(?:add|remove|delete|drop|rename|relabel|connect|link|unlink|move|merge|split|combine|expand|collapse|fold|restructure|rearrange|reorgani[sz]e|reorder|insert|take out|get rid of|shade|swap)\\b`, 'i');
/** Verbs that change it only when it is named ("make it a tree", "change the title", "show the roots"). */
const WEAK = new RegExp(`${LEAD}(?:make|turn|change|set|put|show|hide|mark|highlight|label|colou?r|extend|widen|narrow|shorten|lengthen|zoom|simplify|update|edit|fix|correct|redraw|rework|tweak|adjust|increase|decrease|raise|lower|double|halve|flip|reverse|group|include|use)\\b`, 'i');
const NAMED = /\b(?:it|this|that|the (?:graph|map|mind ?map|concept map|diagram|chart|plot|picture|figure|drawing|curves?|lines?|branch(?:es)?|nodes?|parts?|steps?|forces?|vectors?|timeline|tree|flow ?chart|cycle|sim(?:ulation)?|sliders?|window|x[- ]?axis|y[- ]?axis|axis|axes|labels?|title|centre|center|root|links?|shading|area|rectangles?|points?|roots|crossings?|turning points?|intercepts?|asymptotes?|tangent|gradient|slope|equation|tax|price|range)|(?:a|an|another|one more|two more|more) (?:branch|branches|node|nodes|curve|curves|line|lines|step|steps|force|forces|point|points|link|links|slider|sliders|label|labels|part|parts|item|items|event|events))\b/i;
const ASKS = /^(?:what|why|how|who|whom|when|where|which|is|are|was|were|does|do|did|should|would it|could it|will it|can it|has|have)\b/i;
/** Idioms that use an edit verb about something else: "make sense of this", "make sure", "show me how". */
const NOT_EDIT = /\b(?:make (?:sense|sure|clear)|show me (?:how|why|what|where)|show me around|add up|set up (?:a|an|my)|put (?:it|this|that) (?:simply|another way|plainly))\b/i;

/** The words plainly ask for a change to something they can see — an edit verb in the imperative, not a question about it. */
export function asksToChange(text: string): boolean {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 320 || ASKS.test(t) || NOT_EDIT.test(t)) return false;
  return STRONG.test(t) || (WEAK.test(t) && NAMED.test(t));
}

export interface EditTarget {
  /** what the edit block names: a kept artifact's id, or "<message id>:<n>" for a reply's element not kept yet */
  ref: string;
  title: string;
  spec: InlineSpec;
  /** where it is: kept in Artifacts, or still only in Socria's last reply */
  where: 'kept' | 'reply';
}

type WireMsg = { id?: unknown; role?: unknown; content?: unknown; ui?: unknown };
const MSG_ID = /^[\w-]{1,64}$/;
const UI_BLOCK = /```[ \t]*ui[ \t]*\n([\s\S]*?)```/gi;
const titleOf = (spec: InlineSpec): string => ('title' in spec && typeof spec.title === 'string' && spec.title.trim() ? spec.title.trim() : nounOf(spec).replace(/^./, (c) => c.toUpperCase()));

function keptTarget(space: ObjectSpace | null, id: unknown): EditTarget | null {
  if (!space || typeof id !== 'string') return null;
  const o = space.objs.find((x) => x.id === id);
  if (!o || o.kind !== 'kept') return null;
  const st = currentOf(o) as { title?: unknown; spec?: InlineSpec } | null;
  const spec = st?.spec ? parseInlineSpec(JSON.stringify(st.spec)) : null;
  if (!spec || !EDITABLE.has(spec.type)) return null;
  return { ref: o.id, title: typeof st?.title === 'string' && st.title.trim() ? st.title.trim().slice(0, 80) : titleOf(spec), spec, where: 'kept' };
}

/**
 * The artifact a change is about, or null. In order: the kept artifact open in Artifacts (`inHand`, sent by the
 * client); else the last element worth keeping in Socria's reply just before this message — as what it was kept as,
 * when it was kept (so the change lands on the version they have been changing), else as the reply drew it.
 * Nothing further back: "it" is what is on screen.
 */
export function editTargetOf(input: { text: string; space: ObjectSpace | null; inHand?: unknown; messages: readonly unknown[] }): EditTarget | null {
  if (!asksToChange(input.text)) return null;
  const held = keptTarget(input.space, input.inHand);
  if (held) return held;
  const msgs = (Array.isArray(input.messages) ? input.messages : []) as WireMsg[];
  // Socria's reply just before their newest message — only that one
  let i = msgs.length - 1;
  while (i >= 0 && msgs[i]?.role === 'user') i--;
  const reply = msgs[i];
  if (!reply || reply.role !== 'assistant' || typeof reply.content !== 'string' || !reply.content.includes('```')) return null;
  const specs = [...reply.content.matchAll(UI_BLOCK)].map((m) => parseInlineSpec(m[1]));
  let n = -1;
  for (let k = specs.length - 1; k >= 0; k--) if (specs[k] && EDITABLE.has(specs[k]!.type)) { n = k; break; }
  if (n < 0) return null;
  const ui = sanitizeInlineState(reply.ui) as Record<string, InlineState> | undefined;
  const kept = keptTarget(input.space, ui?.[String(n)]?.artifact);
  if (kept) return kept;
  if (typeof reply.id !== 'string' || !MSG_ID.test(reply.id)) return null;
  const spec = specs[n]!;
  return { ref: `${reply.id}:${n}`, title: titleOf(spec), spec, where: 'reply' };
}

/** Where each kind keeps what a person changes, in its own field names — enough to write a path without guessing. */
const FIELDS: Partial<Record<InlineSpec['type'], string>> = {
  graph:
    '"expr" and "label" are the first curve; "curves": [{"expr","label"}] the others; "params": the sliders [{"name","label","min","max","value","step"}] (one-letter names; e is Euler\'s number); "x" and "y": [from, to]; "points": [{"x","y","open"?}]; "area": {"from","to","rects"?: {"n","rule": "left"|"right"|"mid"}}; "features": marks such as "crossings", "turning", "roots", "intercept"',
  diagram:
    '"nodes": [{"id","label","detail"?}] (a new part takes a new id: n1, n2 …); "edges": [[from, to]] — in a mind map ("view": "mind") a plain pair hangs a part under another (every part but the centre has exactly one parent, four levels at most) and [from, to, "causes"|"leads"|"needs"|"relates"] is a link across branches; "view": "mind"|"tree"|"flow"|"cycle"|"causes"',
  sequence: '"items": [{"label","detail"?,"when"?}] in order',
  concepts: '"items": [{"name","gist"}]',
  vectors: '"vectors": [{"label","mag","angle"}] (angle in degrees from the positive x-axis, anticlockwise); "body"; "resultant": true|false; "params": sliders as a graph\'s',
  sim: '"x" and "y": formulas in t; "t": [from, to]; "params": sliders as a graph\'s',
  steps: '"steps": [{"text","math"?}] in order',
  balance: '"for" and "against": [{"text","weight"}]',
};

/** What the model is told when the person asks for a change to an artifact they can see. */
export function editFocusBlock(t: EditTarget): string {
  const where = t.where === 'kept' ? 'kept in Artifacts' : 'drawn in your last reply';
  const fields = FIELDS[t.spec.type];
  return (
    `\n\nTHE ARTIFACT THEY MEAN — “${t.title}”, a ${nounOf(t.spec)} ${where} (ref "${t.ref}"), as it stands now:\n` +
    `${JSON.stringify(t.spec)}\n` +
    `If they are asking to change it, change THIS artifact in place — never draw it again as a new element, and never a second copy beside it. Write exactly one block:\n` +
    '```ui\n' +
    `{"type":"edit","of":"${t.ref}","ops":[{"op":"replace","path":"/title","value":"…"}],"note":"what you changed, in a few words"}\n` +
    '```\n' +
    `Each op is "add" (a new key, or "-" as the last step of a path to append to a list), "replace" or "remove", at a path of keys and list positions into the JSON above (/nodes/3/label, /curves/-, /x). ` +
    `Change only what they asked for: everything else stays exactly as it is. "type" never changes. At most ${EDIT_LIMITS.ops} ops. ` +
    (fields ? `Its fields: ${fields}. ` : '') +
    `The block is checked whole against the artifact: one that would not hold changes nothing. ` +
    `Around it, say in a sentence what changed — the person sees the artifact change where it is. ` +
    `If what they ask cannot be done to this artifact (a different kind of picture altogether), say so plainly and offer what can be done; do not write a block.\n`
  );
}

const EDIT_LANGS = new Set(['ui', 'socria-ui', 'socria', 'ui-json', 'inline-ui', 'element', 'json', '']);

/**
 * The stream gate's hook for an edit block: null when the block is not one (the inline gate reads it as usual);
 * otherwise what the person sees — the canonical block with what it changes said by the code, a notice when it
 * would not hold, or nothing (cut off, not asked for this turn, or a second edit in one reply).
 */
export function gateEditBlock(chunk: string, target: EditTarget | null, seen: { n: number }, open = false): string | null {
  const m = /^```[ \t]*([\w-]*)[ \t]*\n?([\s\S]*?)(?:```\s*)?$/.exec(chunk.trim());
  if (!m || !EDIT_LANGS.has(m[1].toLowerCase())) return null;
  const body = m[2].trim();
  if (!/^\{\s*"type"\s*:\s*"edit"/.test(body)) return null;
  // a ```json (or unlabelled) block is read as an edit only on a turn that asked for one: otherwise it is code, theirs
  // to read (the element gate leaves it as it is)
  const lang = m[1].toLowerCase();
  if (!target && (lang === 'json' || lang === '')) return null;
  if (open) return '';
  let raw: { type?: unknown; of?: unknown; ops?: unknown; note?: unknown } | null = null;
  try {
    raw = JSON.parse(body);
  } catch {
    raw = null;
  }
  if (!raw || raw.type !== 'edit' || !target || seen.n >= 1) return '';
  const name = `“${target.title}”`;
  if (raw.of !== target.ref) return '';
  const ops = sanitizeEdits(raw.ops);
  if (!ops) return `_The change to ${name} was not made: it was not written in a form that could be checked._\n\n`;
  const r = applyEdits(target.spec, ops);
  if (!r.ok) {
    const why = r.why.replace(/\s*Nothing was changed\.?$|\s*—?\s*nothing was changed\.?$/i, '').replace(/\.$/, '');
    return `_The change to ${name} was not made — ${why.charAt(0).toLowerCase()}${why.slice(1)}._\n\n`;
  }
  seen.n++;
  const note = typeof raw.note === 'string' ? raw.note.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  return '```ui\n' + JSON.stringify({ type: 'edit', of: target.ref, title: target.title.slice(0, 80), ops, said: changeSaid(r.changes), ...(note ? { note } : {}) }) + '\n```\n\n';
}

// ── the client's half: the change, landed on the artifact ─────────────

export interface LandedEdit {
  space: ObjectSpace;
  /** the kept artifact the change was made to */
  id: string;
  /** a reply's element that was kept for it: link it where it was drawn (msg.ui[n].artifact) */
  link: { msg: string; n: number } | null;
}
type FoundMsg = { id: string; content: string; ui?: Record<string, InlineState> };

/**
 * A canonical edit block (lib/inline-ui.ts parseEditSpec), landed: applied to the artifact it names as Socria's step,
 * checked whole again by the kept kind (the artifact may have moved on since the reply was written). A reply's element
 * not kept yet is kept first — and if the change then does not hold, nothing is kept either. `from` is the block's key
 * ("<reply id>#<n>"), carried by the step, so a block is landed once however often it is read.
 */
export function landEdit(space: ObjectSpace, edit: EditSpec, from: string, find: (msgId: string) => FoundMsg | null, meta: { session?: string; said?: (content: string) => string; at?: number } = {}): LandedEdit | { skip: string } {
  let sp = space;
  let id: string | null = objOf(sp, edit.of)?.kind === 'kept' ? edit.of : null;
  let link: LandedEdit['link'] = null;
  if (!id) {
    const m = /^([\w-]{1,64}):(\d{1,2})$/.exec(edit.of);
    const msg = m ? find(m[1]) : null;
    if (!m || !msg) return { skip: 'The artifact it changes is not here.' };
    const k = Number(m[2]);
    const had = msg.ui?.[String(k)]?.artifact;
    if (had && objOf(sp, had)?.kind === 'kept') id = had;
    else {
      const spec = specsIn(msg.content)[k];
      const kept = spec ? keptFrom(spec, msg.ui?.[String(k)], { session: meta.session, message: msg.id, said: meta.said?.(msg.content) ?? '', at: meta.at ?? Date.now() }) : null;
      if (!kept) return { skip: 'That element cannot be kept, so it cannot be changed in place.' };
      const made = makeDisplay(sp, 'kept', kept, 'socria');
      if (!made.ok) return { skip: made.says };
      sp = made.space;
      id = made.obj.id;
      link = { msg: msg.id, n: k };
    }
  }
  const o = objOf(sp, id);
  if (!o) return { skip: 'The artifact it changes is not here.' };
  if (o.steps.some((st) => st.args.from === from)) return { skip: 'Already made.' };
  const r = applyStep(sp, id, 'edit', { ops: JSON.stringify(edit.ops), said: edit.said, from }, { by: 'socria' });
  if (!r.ok) return { skip: r.why };
  return { space: r.space, id, link };
}
