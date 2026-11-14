// lib/objects/display-kept.ts — AN ELEMENT KEPT FROM THE CONVERSATION.
//
// The conversation thinks with things in the moment — a graph to change, a
// small simulation, a claim to inspect, a question to work out — one to a
// reply, done when it has done its job. Artifacts are what is kept and built
// on. "Keep" on an element is the bridge between them: the element, exactly as
// the person left it (where they dragged the point, which part they doubted,
// what they answered), filed in Artifacts with where it came from — the reply
// it was in and when — so it can be opened, changed and come back to.
//
// The kept element is drawn by the same component the conversation draws it
// with (components/display/KeptFigure.tsx → components/inline/InlineUI.tsx),
// so nothing is converted and nothing is lost; what is done with it in
// Artifacts is kept with it, as a step like any other display's. A chart, a
// comparison and a decision keep their larger forms instead (lib/inline-ui.ts
// artifactFromSpec): a data display, a comparison. Made only by Keep — never
// offered, never proposed (internal).
//
// Pure: sanitizing, facts and text. No model, no network, no clock.

import { register, type Part, type ViewDecl } from './core';
import { cleanText, displayKind, headOps, op, registerDisplay, type DisplayHead, type DisplayMeta } from './display-base';
import { inlineFrom, inlineNow, inlinePlainText, sanitizeInlineSpec, sanitizeInlineStateOne, type InlineSpec, type InlineState } from '../inline-ui';
import { applyEdits, changeSaid, readEdit, sanitizeEdits, specChanges } from '../artifact-edit';

export interface KeptFrom {
  /** the line of thinking it was kept from */
  session?: string;
  /** the reply it was in */
  message?: string;
  /** the reply's opening words, so it can be recognised */
  said?: string;
  /** when it was kept (ms) */
  at?: number;
}
export interface KeptState extends DisplayHead {
  view: 'live';
  /** the element, as the reply wrote it (lib/inline-ui.ts sanitizeInlineSpec) */
  spec: InlineSpec;
  /** what the person did with it, as it stands (lib/inline-ui.ts sanitizeInlineStateOne) */
  ui?: InlineState;
  from: KeptFrom;
}

const ID = /^[A-Za-z0-9_:-]{1,64}$/;
const KEEPS_ITS_OWN = new Set(['paths', 'options']);

export function sanitizeKept(raw: unknown): KeptState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const spec = sanitizeInlineSpec(r.spec);
  if (!spec || KEEPS_ITS_OWN.has(spec.type)) return null;
  const ui = sanitizeInlineStateOne(r.ui) ?? undefined;
  const f = r.from && typeof r.from === 'object' ? (r.from as Record<string, unknown>) : {};
  const from: KeptFrom = {
    ...(typeof f.session === 'string' && ID.test(f.session) ? { session: f.session } : {}),
    ...(typeof f.message === 'string' && ID.test(f.message) ? { message: f.message } : {}),
    ...(cleanText(f.said, 160) ? { said: cleanText(f.said, 160) } : {}),
    ...(typeof f.at === 'number' && Number.isFinite(f.at) && f.at > 0 ? { at: Math.round(f.at) } : {}),
  };
  const named = 'title' in spec && typeof spec.title === 'string' ? spec.title : '';
  const title = cleanText(r.title, 80) || cleanText(named, 80) || keptName(spec);
  return { title, view: 'live', spec, ...(ui ? { ui } : {}), from };
}

/** What a kept element is called when the reply gave it no title: "Graph", "Claim". */
export function keptName(spec: InlineSpec): string {
  if (spec.type === 'claim') return cleanText(`Claim: ${spec.claim}`, 80);
  // the case for and against one thing is known by that thing, as a claim is by what it claims
  if (spec.type === 'balance') return cleanText(`Pros and cons: ${spec.subject}`, 80);
  const w = inlineFrom(spec).replace(/^the\s+/, '').replace(/[“”]/g, '');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** The state Keep makes: the element, what was done with it, and where it came from. */
export function keptFrom(spec: InlineSpec, ui: InlineState | undefined, from: KeptFrom): KeptState | null {
  return sanitizeKept({ spec, ...(ui ? { ui } : {}), from });
}

const views: ViewDecl<KeptState>[] = [
  { id: 'live', label: 'As kept', shows: 'the element as it was left, to keep working with', primary: true, interactions: ['change it as in the conversation — what is done is kept with it'] },
];
type S = KeptState;

export const KEPT_OPS = {
  ...headOps<S>(views, sanitizeKept),
  // what was done with it in Artifacts: the element's own state, as the conversation keeps it
  // using it (a slider moved, a part opened) sets the controls whole: a run of it is one step (core.ts coalesce)
  state: {
    ...op<S>(
      'Change',
      (_s, a) => {
        try {
          return sanitizeInlineStateOne(JSON.parse(String(a.state ?? ''))) || a.state === '{}' ? null : 'Nothing to keep.';
        } catch {
          return 'Nothing to keep.';
        }
      },
      (s, a) => {
        let ui: InlineState | null = null;
        try {
          ui = sanitizeInlineStateOne(JSON.parse(String(a.state ?? '')));
        } catch {
          ui = null;
        }
        const { ui: _old, ...rest } = s;
        return sanitizeKept(ui ? { ...rest, ui } : rest) ?? s;
      },
      () => 'changed it'
    ),
    coalesce: true,
  },
  // CHANGED, NOT REMADE (lib/artifact-edit.ts): edits at paths inside the element — a curve added, a node renamed,
  // the window moved — checked whole by the element's own validator. Proposed by the person's words, the editor's
  // controls or Socria's reply; applied the same way, as a step that Undo takes back.
  edit: op<S>(
    'Change',
    (s, a) => {
      const ops = sanitizeEdits(a.ops);
      if (!ops) return 'Those changes were not well formed.';
      const r = applyEdits(s.spec, ops);
      return r.ok ? null : r.why;
    },
    (s, a) => {
      const ops = sanitizeEdits(a.ops);
      const r = ops ? applyEdits(s.spec, ops) : null;
      return r?.ok ? sanitizeKept({ ...s, spec: r.spec, title: retitled(s, r.spec) }) ?? s : s;
    },
    (a) => cleanText(a.said, 240) || 'changed it'
  ),
  // the editor's whole new version, when it is easier to send than the edits that make it: the same checks
  spec: op<S>(
    'Edit',
    (s, a) => {
      let next: InlineSpec | null = null;
      try {
        next = sanitizeInlineSpec(JSON.parse(String(a.spec ?? '')));
      } catch {
        next = null;
      }
      if (!next) return 'That would not be a valid element — nothing was changed.';
      if (next.type !== s.spec.type) return 'An edit keeps what kind of thing it is.';
      return specChanges(s.spec, next).length ? null : 'That changes nothing.';
    },
    (s, a) => {
      let next: InlineSpec | null = null;
      try {
        next = sanitizeInlineSpec(JSON.parse(String(a.spec ?? '')));
      } catch {
        next = null;
      }
      return next && next.type === s.spec.type ? sanitizeKept({ ...s, spec: next, title: retitled(s, next) }) ?? s : s;
    },
    (a) => cleanText(a.said, 240) || 'edited it'
  ),
};

/** A title given in the element follows it; a name the person gave the kept element stays theirs. */
function retitled(s: KeptState, next: InlineSpec): string {
  const before = 'title' in s.spec && typeof s.spec.title === 'string' ? s.spec.title : '';
  const after = 'title' in next && typeof next.title === 'string' ? next.title : '';
  return before !== after && (s.title === before || s.title === keptName(s.spec)) ? cleanText(after, 80) || keptName(next) : s.title;
}

/** An edit the words plainly ask for, on this element (lib/artifact-edit.ts readEdit), with what it would change said. */
export function readKeptEdit(text: string, s: KeptState): { op: string; args: Record<string, string | number> } | null {
  const ops = readEdit(text, s.spec);
  if (!ops) return null;
  const r = applyEdits(s.spec, ops);
  return r.ok ? { op: 'edit', args: { ops: JSON.stringify(ops), said: changeSaid(r.changes) } } : null;
}

/** The kept element in words: what the reply model reads, what is copied. */
export function keptText(s: KeptState): string {
  const now = s.ui ? inlineNow(s.spec, s.ui) : null;
  return `${inlinePlainText(s.spec)}${now ? `\nAs it was left: ${now}` : ''}`;
}

export const KEPT = displayKind<S>({
  kind: 'kept',
  label: 'Kept',
  sanitize: sanitizeKept,
  ops: KEPT_OPS,
  // "call it …", "remove …", "X causes Y" are also things people say about other things: heard only while the
  // element is in hand (open in Artifacts, or in its editor, which reads its own box directly)
  readOp: (text, s) => readKeptEdit(text, s),
  readOpScope: 'in-hand',
  facts: (s) => [
    `${s.title}: ${inlineFrom(s.spec)} the person kept from the conversation${s.from.said ? ` (from the reply that began “${s.from.said}”)` : ''}, kept as they left it.`,
    keptText(s),
  ],
  text: (s) => keptText(s),
  parts: (): Part[] => [],
  views,
  // what was done with it, and every change to it — enough versions to go back through
  maxStates: 30,
  argLimits: { count: 4, length: 6000 },
  size: (_s, mode) => (mode === 'card' ? { w: 300, h: 170 } : mode === 'trail' ? { w: 200, h: 110 } : { w: 720, h: 640 }),
  shape: (s) => `${keptName(s.spec)} · kept from the conversation`,
});

export const KEPT_META: DisplayMeta = {
  kind: 'kept',
  noun: 'kept element',
  handle: 'K',
  about: 'Something from the conversation — a graph, a simulation, a claim, a question, the working, a diagram, the pros and cons, an equation — kept as the person left it, with the reply it came from. Made by pressing Keep on it.',
  internal: true,
  madeFrom: 'kept from the conversation',
  tell: (guarded) =>
    `A KEPT element is something the person kept from the conversation, as they left it — what they set and did with it reaches you as its text. Build on it; never redo it from scratch.${guarded ? ' The Answer Guard is up: what it would answer is not given away.' : ''}`,
};

register(KEPT);
registerDisplay(KEPT_META);
