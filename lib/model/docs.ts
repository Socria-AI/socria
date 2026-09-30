// lib/model/docs.ts
//
// A MODEL THE PERSON OWNS — with a name that survives being edited.
//
// WHAT WAS WRONG BEFORE THIS FILE. A model was something Logos produced and then
// effectively froze: the next request produced a DIFFERENT model, so there was
// no such thing as "this model, now stiffer". That made undo impossible, made
// branching impossible, made comparison meaningless, and made every edit a
// regeneration — which is why "delete the second spring" could only ever hide
// pixels. Identity is the prerequisite for all of it.
//
// So a model here is a DOCUMENT: one id, a stack of revisions, and a cursor into
// that stack.
//
//   doc.id          spring-system-01, for as long as it exists
//   doc.revisions   [r1, r2, r3] — each a whole Model, oldest first
//   doc.at          which revision is current; undo moves it back
//
// An edit appends a revision and moves the cursor. Undo moves the cursor; the
// revision it left is still there, so redo is not a re-derivation. A branch
// copies the document under a new id and records what it came from, so the
// original is never touched by work done on the copy.
//
// WHY REVISIONS ARE WHOLE MODELS AND NOT DIFFS. A diff stack has to be replayed
// to be read, which means every representation of an older state depends on the
// replay being correct; a stored state is simply the state. The cost is size, and
// the cap below is the answer to it: eight revisions per document, which is what
// an editing session actually reaches for, with the oldest dropped rather than
// the newest refused.
//
// SEMANTIC EDITS EDIT THE DECLARATION. Removing a spring means removing it from
// `mechanism.springs` — not deleting the expanded object, which is derived and
// would come straight back. The governing system is then reassembled on the next
// build (expand, in mechanism.ts), the dependent values recompute, and every
// representation follows. That is the difference between an edit and a redraw.
//
// PURE: models in, models out. No React, no storage, no clock of its own.

import { solveSystem } from './algebra';
import { inputsOf } from './derive';
import { affectedBy } from './deps';
import { bindings, symbolTable } from './symbols';
import { compare, type Comparison } from './state';
import { unpack } from './unpack';
import { objectOf, sanitizeModel, setParam, type Model, type ModelObject } from './schema';
import { buildProposal, revalidate, type BuildReport, type Refusal } from './propose';
import type { VizModelState, VizOp } from '@/lib/viz-model';

/** How many revisions one document keeps. The oldest is dropped, never the newest. */
export const REVISION_CAP = 8;
/** How many documents one session holds. */
export const DOC_CAP = 6;

export interface ModelDoc {
  id: string;
  title: string;
  /** whole models, oldest first */
  revisions: Model[];
  /** index of the current revision */
  at: number;
  /** the document this was branched from, and at which revision */
  branchedFrom?: { id: string; at: number };
  /** what the engine said when it was built */
  report?: BuildReport;
  /** a one-line history a reader can follow: what each revision changed */
  log: {
    at: number;
    said: string;
    /**
     * What KIND of change this was, when it is one that coalesces.
     *
     * Present only for selection and cursor moves, which happen continuously and
     * must not leave undo stepping through a drag one frame at a time. Its
     * absence means a structural edit, and those never merge.
     */
    kind?: string;
  }[];
}

export interface ModelWorkspace {
  docs: ModelDoc[];
  /** which document the surface is showing */
  active: string | null;
}

export const EMPTY_WORKSPACE: ModelWorkspace = { docs: [], active: null };

export const current = (doc: ModelDoc): Model => doc.revisions[doc.at] ?? doc.revisions[doc.revisions.length - 1];
export const docOf = (ws: ModelWorkspace, id: string | null): ModelDoc | null =>
  (id ? ws.docs.find((d) => d.id === id) : null) ?? null;
export const activeDoc = (ws: ModelWorkspace): ModelDoc | null => docOf(ws, ws.active);
export const canUndo = (doc: ModelDoc): boolean => doc.at > 0;
export const canRedo = (doc: ModelDoc): boolean => doc.at < doc.revisions.length - 1;

/** Append a revision, with the sentence that says what it was. */
function revise(doc: ModelDoc, model: Model, said: string, opts?: { coalesce?: string }): ModelDoc {
  // An edit made after an undo discards the revisions that were ahead: they are a
  // future that did not happen, and keeping them would make redo mean two things.
  const kept = doc.revisions.slice(0, doc.at + 1);

  // COALESCED, FOR THE CHANGES A DRAG MAKES A HUNDRED OF.
  //
  // Selection and the input cursors are canonical state — a view is a projection
  // and cannot own what it projects — but they are also changed continuously.
  // Appending a revision per frame would leave undo stepping back through a drag
  // one pixel at a time, which is not what anybody means by undoing. So a change
  // of the SAME KIND, immediately after one of that kind, replaces the top
  // revision instead of appending: the history keeps where you ended up and not
  // every point you passed through.
  //
  // Structural edits never coalesce. Removing a spring twice is two removals.
  const top = doc.log[doc.log.length - 1];
  if (opts?.coalesce && top?.kind === opts.coalesce && doc.at === doc.revisions.length - 1 && doc.revisions.length > 1) {
    const revisions = [...doc.revisions.slice(0, -1), model];
    const log = [...doc.log.slice(0, -1), { at: revisions.length - 1, said, kind: opts.coalesce }];
    return { ...doc, revisions, at: revisions.length - 1, log };
  }

  const revisions = [...kept, model].slice(-REVISION_CAP);
  const log = [
    ...doc.log.slice(-(REVISION_CAP * 2)),
    { at: revisions.length - 1, said, ...(opts?.coalesce ? { kind: opts.coalesce } : {}) },
  ];
  return { ...doc, revisions, at: revisions.length - 1, log };
}

/**
 * SELECT AN OBJECT — canonically, so every view means the same thing by "this".
 *
 * NOT AN EDIT, and coalesced accordingly: clicking around a model should not
 * leave undo walking back through every click. But it IS canonical, because
 * linked views stay in step by reading one selection rather than by messaging
 * each other, and because "ask about this" has to be handed an IDENTITY.
 */
export function selectObject(ws: ModelWorkspace, id: string, objectId: string | null, at = 0): EditResult {
  const doc = docOf(ws, id);
  if (!doc) return no(ws, `there is no model called ${id} here`);
  const model = current(doc);
  if (objectId === null) {
    if (!model.selected) return no(ws, 'nothing was selected');
    const { selected: _gone, ...rest } = model;
    return {
      workspace: patch(ws, id, (d) => revise(d, { ...rest, version: (model.version ?? 0) + 1 }, 'selection cleared', { coalesce: 'select' })),
      ok: true, says: 'nothing is selected now', affected: [],
    };
  }
  const target = objectOf(unpack(model), objectId);
  if (!target) return no(ws, `${model.title} has nothing called ${objectId}`);
  if (model.selected === target.id) return no(ws, `${target.label} is already selected`);
  return {
    workspace: patch(ws, id, (d) =>
      revise(d, { ...model, version: (model.version ?? 0) + 1, selected: target.id }, `selected ${target.label}`, { coalesce: 'select' })
    ),
    ok: true,
    says: `${target.label} is selected — ${target.meaning ?? target.kind}`,
    affected: [],
  };
}

// ── create, read, delete ────────────────────────────────────────────

/**
 * Open a document on a model the ENGINE built.
 *
 * Takes a built model rather than a proposal on purpose: a document is a thing
 * the person owns and edits, and there is no honest document over a model nobody
 * validated. The on-ramp (buildProposal) is the only way in.
 */
export function open(
  ws: ModelWorkspace,
  model: Model,
  opts?: { report?: BuildReport; title?: string }
): { workspace: ModelWorkspace; doc: ModelDoc } {
  const id = uniqueId(ws, model.id);
  const doc: ModelDoc = {
    id,
    title: opts?.title ?? model.title,
    revisions: [{ ...model, id }],
    at: 0,
    ...(opts?.report ? { report: { ...opts.report, id } } : {}),
    log: [{ at: 0, said: 'built from the conversation and validated by the engine' }],
  };
  const docs = [...ws.docs.filter((d) => d.id !== id), doc].slice(-DOC_CAP);
  return { workspace: { docs, active: id }, doc };
}

function uniqueId(ws: ModelWorkspace, wanted: string): string {
  const base = (wanted || 'model').slice(0, 40);
  if (!ws.docs.some((d) => d.id === base)) return base;
  for (let n = 2; n < 100; n++) {
    const tried = `${base}-${n}`.slice(0, 48);
    if (!ws.docs.some((d) => d.id === tried)) return tried;
  }
  return `${base}-${ws.docs.length + 1}`.slice(0, 48);
}

/** Remove a document. The person said delete, so it goes. */
export function remove(ws: ModelWorkspace, id: string): ModelWorkspace {
  const docs = ws.docs.filter((d) => d.id !== id);
  return { docs, active: ws.active === id ? (docs[docs.length - 1]?.id ?? null) : ws.active };
}

export function use(ws: ModelWorkspace, id: string): ModelWorkspace {
  return ws.docs.some((d) => d.id === id) ? { ...ws, active: id } : ws;
}

/** A copy under its own id, with the original untouched and the lineage recorded. */
export function duplicate(ws: ModelWorkspace, id: string, opts?: { title?: string }): { workspace: ModelWorkspace; doc: ModelDoc | null } {
  const src = docOf(ws, id);
  if (!src) return { workspace: ws, doc: null };
  const newId = uniqueId(ws, `${src.id}-copy`);
  const model = { ...current(src), id: newId };
  const doc: ModelDoc = {
    id: newId,
    title: opts?.title ?? `${src.title} (copy)`,
    revisions: [model],
    at: 0,
    branchedFrom: { id: src.id, at: src.at },
    ...(src.report ? { report: { ...src.report, id: newId } } : {}),
    log: [{ at: 0, said: `copied from ${src.id} at revision ${src.at + 1}` }],
  };
  return { workspace: { docs: [...ws.docs, doc].slice(-DOC_CAP), active: newId }, doc };
}

/** The same thing as duplicate, named for what it is for: work you may throw away. */
export function branch(ws: ModelWorkspace, id: string, name: string): { workspace: ModelWorkspace; doc: ModelDoc | null } {
  return duplicate(ws, id, { title: name.slice(0, 90) || 'A branch' });
}

// ── history ─────────────────────────────────────────────────────────

export function undo(ws: ModelWorkspace, id: string): ModelWorkspace {
  return patch(ws, id, (doc) => (canUndo(doc) ? { ...doc, at: doc.at - 1 } : doc));
}

export function redo(ws: ModelWorkspace, id: string): ModelWorkspace {
  return patch(ws, id, (doc) => (canRedo(doc) ? { ...doc, at: doc.at + 1 } : doc));
}

/** Back to how it was built, kept as a new revision so the way back is not lost. */
export function reset(ws: ModelWorkspace, id: string): ModelWorkspace {
  return patch(ws, id, (doc) =>
    doc.revisions.length ? revise(doc, doc.revisions[0], 'reset to how it was built') : doc
  );
}

/** Back to a named earlier revision, also as a new revision. */
export function restore(ws: ModelWorkspace, id: string, at: number): ModelWorkspace {
  return patch(ws, id, (doc) => {
    const want = doc.revisions[at];
    return want ? revise(doc, want, `restored revision ${at + 1}`) : doc;
  });
}

function patch(ws: ModelWorkspace, id: string, f: (doc: ModelDoc) => ModelDoc): ModelWorkspace {
  return { ...ws, docs: ws.docs.map((d) => (d.id === id ? f(d) : d)) };
}

// ── editing the model ───────────────────────────────────────────────

export interface EditResult {
  workspace: ModelWorkspace;
  ok: boolean;
  /** what happened, or why nothing did — for the reply, verbatim */
  says: string;
  /** object ids whose values no longer hold and will be recomputed on the build */
  affected: string[];
}

const no = (ws: ModelWorkspace, says: string): EditResult => ({ workspace: ws, ok: false, says, affected: [] });

/** Move a parameter. The existing verb, so dependency propagation comes with it. */
export function setValue(ws: ModelWorkspace, id: string, param: string, value: number, at = 0): EditResult {
  const doc = docOf(ws, id);
  if (!doc) return no(ws, `there is no model called ${id} here`);
  const model = current(doc);
  const p = model.params.find((q) => q.id === param);
  if (!p) return no(ws, `${model.title} has no control called ${param}`);
  const next = setParam(model, param, value, at);
  if (next === model) return no(ws, `${param} is already ${p.value}${p.units ? ` ${p.units}` : ''}`);
  const affected = next.lastChange?.affected ?? [];
  return {
    workspace: patch(ws, id, (d) => revise(d, next, `${param} → ${next.params.find((q) => q.id === param)?.value}`)),
    ok: true,
    says: `${param} is now ${next.params.find((q) => q.id === param)?.value}${p.units ? ` ${p.units}` : ''}${
      affected.length ? `, and ${affected.length} thing${affected.length === 1 ? '' : 's'} recompute` : ''
    }`,
    affected,
  };
}

/**
 * Move a FREE INPUT to a point inside its range.
 *
 * A DIFFERENT VERB FROM `set`, because it is a different act. `set` moves a
 * parameter and changes the FUNCTION — a different relationship. This moves the
 * cursor and changes WHERE ON the same relationship you are reading, which is
 * what a free input is for. Both produce a revision, because both are changes to
 * canonical state that a person may want to undo; the model is authoritative and
 * the view is a projection of it.
 *
 * Clamped to the input's own domain, because a point outside the range somebody
 * stated is not a point on this model.
 */
export function setInput(ws: ModelWorkspace, id: string, input: string, value: number, at = 0): EditResult {
  const doc = docOf(ws, id);
  if (!doc) return no(ws, `there is no model called ${id} here`);
  const model = current(doc);
  const inputs = inputsOf(unpack(model));
  const target = inputs.find((q) => q.id.toLowerCase() === input.toLowerCase());
  if (!target) {
    return no(
      ws,
      inputs.length
        ? `${model.title} has no free input called ${input}. It has ${inputs.map((q) => q.label).join(', ')}`
        : `${model.title} has no free inputs — nothing in it is evaluated over a range somebody named`
    );
  }
  const next = Math.min(target.max, Math.max(target.min, value));
  if (next === target.at) {
    return no(ws, `${target.label} is already ${next}${target.units ? ` ${target.units}` : ''}`);
  }
  const edited: Model = {
    ...model,
    version: (model.version ?? 0) + 1,
    at: { ...(model.at ?? {}), [target.id]: next },
    lastChange: { what: target.id, from: target.at, to: next, affected: affectedBy(unpack(model), [target.id]), at },
  };
  const affected = edited.lastChange?.affected ?? [];
  return {
    workspace: patch(ws, id, (d) => revise(d, edited, `${target.label} → ${next}`, { coalesce: `at:${target.id}` })),
    ok: true,
    says:
      `${target.label} is now ${next}${target.units ? ` ${target.units}` : ''}` +
      (next !== value ? `, which is as far as the range you gave goes` : '') +
      `. The relationship has not changed — this is where on it you are reading`,
    affected,
  };
}

/**
 * Add or drop ONE RELATION in a system of equations.
 *
 * THE SAME VERB AS ADDING A SPRING, one level up. A relation is a term in what
 * the system determines, so dropping `Pc = Pp + t` does not hide a line: it
 * leaves four unknowns with three independent relationships, and the only honest
 * response is to stop reporting an equilibrium and say which unknown is now
 * free. That is what the reply below carries, computed by the solver rather than
 * described in prose — and because it goes through `revise`, undo restores the
 * relation and the next build solves again.
 *
 * SANITISED LIKE ANY OTHER INPUT. The relation text arrives from a reply, so the
 * edited model is put back through `sanitizeModel`, which is the one filter that
 * decides what an expression may contain. A relation it refuses is refused here.
 */
export function setRelation(
  ws: ModelWorkspace,
  id: string,
  objectId: string,
  relation: string,
  drop: boolean,
  at = 0
): EditResult {
  const doc = docOf(ws, id);
  if (!doc) return no(ws, `there is no model called ${id} here`);
  const model = current(doc);

  // The person may name the carrier or any of the unknowns it solved for, and
  // both mean the same system — `eq__pc` exists only after expansion.
  const target = objectOf(unpack(model), objectId);
  const carrierId = target && typeof target.meta?.of === 'string' ? (target.meta.of as string) : objectId;
  const carrier = objectOf(model, carrierId);
  if (!carrier?.equations) return no(ws, `${model.title} has no system of equations called ${objectId}`);

  const tidy = (e: string) => e.replace(/\s+/g, ' ').trim();
  const want = tidy(relation);
  const decl = carrier.equations;
  const has = decl.relations.findIndex((r) => tidy(r) === want);

  if (drop && has < 0) {
    return no(
      ws,
      `${carrier.label} does not contain “${want}”. What it relates: ${decl.relations.map((r) => tidy(r)).join('; ')}`
    );
  }
  if (!drop && has >= 0) return no(ws, `${carrier.label} already relates “${want}”`);
  if (!drop && !want.includes('=')) return no(ws, `“${want}” is not an equation: it needs one = sign`);
  if (drop && decl.relations.length <= 1) {
    return no(ws, `“${want}” is the only relation here: a system with nothing in it is not a system`);
  }

  const relations = drop ? decl.relations.filter((_, i) => i !== has) : [...decl.relations, want];
  const edited: Model = {
    ...model,
    version: (model.version ?? 0) + 1,
    objects: model.objects.map((o) => (o.id === carrier.id ? { ...o, equations: { ...decl, relations } } : o)),
  };
  const next = sanitizeModel(edited);
  if (!next) return no(ws, `“${want}” is not something this engine can hold as a relation`);
  const kept = objectOf(next, carrier.id)?.equations?.relations ?? [];
  if (kept.length !== relations.length) {
    return no(ws, `“${want}” is not something this engine can hold as a relation`);
  }

  // WHAT THE SYSTEM NOW IS, from the solver rather than from a guess. This is
  // the sentence the brief asks for: not "that changed something" but which
  // unknown stopped being determined, and what would determine it again.
  const after = solveSystem(relations, decl.unknowns, bindings(symbolTable(next)));
  const affected = [carrier.id, ...decl.unknowns.map((u) => `${carrier.id}__${u}`)];
  const said = `${drop ? 'dropped' : 'added'} “${want}”`;
  return {
    workspace: patch(ws, id, (d) => revise(d, { ...next, lastChange: { what: carrier.id, affected, at } }, said)),
    ok: true,
    says:
      `${carrier.label} now holds ${relations.length} relation${relations.length === 1 ? '' : 's'}: ` +
      `${relations.map((r) => tidy(r)).join('; ')}. ` +
      (after.values
        ? `Solved: ${after.says}.`
        : `Not solved: ${after.says}. The previous answer no longer holds and is not being shown as though it did.`),
    affected,
  };
}

/**
 * Remove something FROM THE MODEL.
 *
 * The important case is a mechanism part: a spring lives in
 * `mechanism.springs`, and the object the person clicked is the EXPANDED copy of
 * it. Deleting the expanded object would be deleting a shadow — it is rebuilt
 * from the declaration on the next build. So the declaration is edited, the
 * expanded copies are dropped, and the governing system is reassembled with one
 * fewer term. That reassembly is the whole point: the equations change, so the
 * motion changes, so every view changes.
 */
export function removeObject(ws: ModelWorkspace, id: string, objectId: string, at = 0): EditResult {
  const doc = docOf(ws, id);
  if (!doc) return no(ws, `there is no model called ${id} here`);
  const model = current(doc);
  // THE IDS EVERYONE ELSE SEES ARE THE EXPANDED ONES.
  //
  // A document stores the DECLARATION — the mechanism's parts, not the objects
  // assembled from them — because that is what an edit has to change. But the
  // person clicked `mech__c1`, the conversation was told `mech__c1`, and the
  // renderer drew `mech__c1`, all of which exist only after expansion. So the
  // target is resolved against the expanded model and the edit is applied to the
  // declaration. Looking it up in the stored model instead reported "there is
  // nothing called that" for every part, one edit after the first.
  const target = objectOf(unpack(model), objectId);
  if (!target) return no(ws, `${model.title} has nothing called ${objectId}`);

  const part = typeof target.meta?.part === 'string' ? target.meta.part : null;
  const carrierId = typeof target.meta?.mech === 'string' ? target.meta.mech : null;

  if (part && carrierId) {
    const carrier = objectOf(model, carrierId);
    if (!carrier?.mechanism) return no(ws, `${target.label} belongs to a mechanism that is not in this model`);
    const mech = carrier.mechanism;
    const gone = {
      bodies: (mech.bodies ?? []).filter((b) => b.id !== part),
      springs: (mech.springs ?? []).filter((x) => x.id !== part),
      dampers: (mech.dampers ?? []).filter((x) => x.id !== part),
      forces: (mech.forces ?? []).filter((x) => x.id !== part),
    };
    if (!gone.bodies.length) {
      return no(ws, `${target.label} is the only body: a mechanism with no inertia has no state, so this would not be a model any more`);
    }
    // Anything attached to a body that is going goes with it — a spring to
    // nothing is not a spring, and leaving it would be a dangling term in the
    // equations rather than a visible problem.
    const bodyGone = target.kind === 'body';
    const stillThere = new Set([...gone.bodies.map((b) => b.id), 'ground']);
    const keep = <T extends { between: [string, string] }>(list: T[]) =>
      bodyGone ? list.filter((l) => l.between.every((e) => stillThere.has(e))) : list;
    const nextMech = {
      ...mech,
      bodies: gone.bodies,
      springs: keep(gone.springs),
      dampers: keep(gone.dampers),
      forces: bodyGone ? gone.forces.filter((f) => stillThere.has(f.on)) : gone.forces,
    };

    const next: Model = {
      ...model,
      version: (model.version ?? 0) + 1,
      // The expanded copies go too: they are derived, and unpack() will rebuild
      // exactly the ones the new declaration implies.
      objects: model.objects
        .filter((o) => o.meta?.mech !== carrierId)
        .map((o) => (o.id === carrierId ? stripAssembled({ ...o, mechanism: nextMech }) : o)),
      lastChange: { what: `removed ${part}`, affected: [carrierId], at },
    };
    return {
      workspace: patch(ws, id, (d) => revise(d, next, `removed ${target.label} from the mechanism`)),
      ok: true,
      says: `${target.label} is out of the model — the governing system is reassembled with one fewer term, and everything recomputes from it`,
      affected: [carrierId],
    };
  }

  // A PART OF A SPECIFICATION. "Remove education" must change what the model
  // SAYS — the regressor leaves the specification and the equation is one term
  // shorter — rather than deleting a derived object that unpack() would put
  // straight back on the next build. Same rule as a mechanism part above; this
  // is the specification's half of it.
  const specOf = typeof target.meta?.spec === 'string' ? target.meta.spec : null;
  if (specOf) {
    const carrier = objectOf(model, specOf);
    if (!carrier?.estimation) return no(ws, `${target.label} belongs to a specification that is not in this model`);
    const est = carrier.estimation;
    const role = target.meta?.role;
    const column = typeof target.meta?.column === 'string' ? target.meta.column : null;

    if (role === 'outcome') {
      return no(
        ws,
        `${target.label} is what this model explains — a specification with nothing on the left is not a specification. Say what the outcome should be instead, and I will change it.`
      );
    }
    if (role === 'coefficient' || role === 'error') {
      return no(
        ws,
        `${target.label} is not something to delete: it is there because the specification has ${
          role === 'error' ? 'a part it does not explain' : 'that term'
        }. Remove the variable it belongs to and it goes with it.`
      );
    }
    if (role === 'intercept') {
      const next: Model = {
        ...model,
        version: (model.version ?? 0) + 1,
        objects: model.objects
          .filter((o) => o.meta?.spec !== specOf)
          .map((o) => (o.id === specOf ? { ...o, estimation: { ...est, intercept: false } } : o)),
        lastChange: { what: 'dropped the intercept', affected: [specOf], at },
      };
      return {
        workspace: patch(ws, id, (d) => revise(d, next, 'the specification is fitted through the origin')),
        ok: true,
        says: 'The intercept is out — the specification now passes through the origin, which is a real assumption and rarely the right one. Say so if you want it back.',
        affected: [specOf],
      };
    }
    if (role === 'regressor' && column) {
      if (est.x.length === 1) {
        return no(
          ws,
          `${target.label} is the only thing explaining ${est.y}: taking it out would leave a specification with nothing on the right. Add another variable first, or say what should replace it.`
        );
      }
      const next: Model = {
        ...model,
        version: (model.version ?? 0) + 1,
        objects: model.objects
          // The derived objects go; unpack() rebuilds exactly the ones the new
          // specification implies, and their ids are positional.
          .filter((o) => o.meta?.spec !== specOf)
          .map((o) =>
            o.id === specOf ? { ...o, estimation: { ...est, x: est.x.filter((c) => c !== column) } } : o
          ),
        lastChange: { what: `removed ${column}`, affected: [specOf], at },
      };
      return {
        workspace: patch(ws, id, (d) => revise(d, next, `removed ${column} from the specification`)),
        ok: true,
        says: `${column} is out of the specification — ${est.y} is now explained by ${est.x
          .filter((c) => c !== column)
          .join(', ')}${
          est.data ? ', and anything fitted is re-estimated from that' : ', and the coefficients remain symbols until there is data'
        }`,
        affected: [specOf],
      };
    }
  }

  // An ordinary object. Relations pointing at it go with it, because an edge to
  // nothing is not a relation.
  const next: Model = {
    ...model,
    version: (model.version ?? 0) + 1,
    objects: model.objects
      .filter((o) => o.id !== objectId)
      .map((o) =>
        o.relations?.some((r) => r.to === objectId)
          ? { ...o, relations: o.relations.filter((r) => r.to !== objectId) }
          : o
      ),
    lastChange: { what: `removed ${objectId}`, affected: [], at },
  };
  return {
    workspace: patch(ws, id, (d) => revise(d, next, `removed ${target.label}`)),
    ok: true,
    says: `${target.label} is out of the model`,
    affected: [],
  };
}

/** Drop the assembled system so it is rebuilt from the edited declaration. */
function stripAssembled(o: ModelObject): ModelObject {
  if (!o.mechanism || !o.system) return o;
  const { system: _drop, ...rest } = o;
  return rest as ModelObject;
}

/**
 * Replace a part with a part of another kind.
 *
 * "Replace this damper with a spring" is a change to the STRUCTURE — a
 * dissipative term becomes a restoring one — so the value moves from `dampers`
 * to `springs` and the equations are assembled again. Nothing about the drawing
 * is touched; it follows because it is derived.
 */
export function replacePart(
  ws: ModelWorkspace,
  id: string,
  objectId: string,
  becomes: 'spring' | 'damper',
  at = 0
): EditResult {
  const doc = docOf(ws, id);
  if (!doc) return no(ws, `there is no model called ${id} here`);
  const model = current(doc);
  const target = objectOf(unpack(model), objectId);
  if (!target) return no(ws, `${model.title} has nothing called ${objectId}`);
  const part = typeof target.meta?.part === 'string' ? target.meta.part : null;
  const carrierId = typeof target.meta?.mech === 'string' ? target.meta.mech : null;
  if (!part || !carrierId) return no(ws, `${target.label} is not a mechanism part, so there is nothing to swap`);
  if (target.kind === becomes) return no(ws, `${target.label} is already a ${becomes}`);
  if (target.kind !== 'spring' && target.kind !== 'damper') {
    return no(ws, `only a spring and a damper can be swapped for one another; ${target.label} is a ${target.kind}`);
  }
  const carrier = objectOf(model, carrierId);
  if (!carrier?.mechanism) return no(ws, `${target.label} belongs to a mechanism that is not in this model`);

  const mech = carrier.mechanism;
  const from = target.kind === 'spring' ? (mech.springs ?? []) : (mech.dampers ?? []);
  const link = from.find((l) => l.id === part);
  if (!link) return no(ws, `${target.label} is not in the mechanism's declaration any more`);
  const rest = from.filter((l) => l.id !== part);
  const into = becomes === 'spring' ? (mech.springs ?? []) : (mech.dampers ?? []);
  const nextMech = {
    ...mech,
    ...(target.kind === 'spring' ? { springs: rest } : { dampers: rest }),
    ...(becomes === 'spring' ? { springs: [...into, link] } : { dampers: [...into, link] }),
  };

  const next: Model = {
    ...model,
    version: (model.version ?? 0) + 1,
    objects: model.objects
      .filter((o) => o.meta?.mech !== carrierId)
      .map((o) => (o.id === carrierId ? stripAssembled({ ...o, mechanism: nextMech }) : o)),
    lastChange: { what: `${part} became a ${becomes}`, affected: [carrierId], at },
  };
  return {
    workspace: patch(ws, id, (d) => revise(d, next, `${target.label} became a ${becomes}`)),
    ok: true,
    says:
      becomes === 'spring'
        ? `${target.label} is a spring now: its term in the equations is restoring rather than dissipative, so the system is reassembled and the motion is different`
        : `${target.label} is a damper now: its term is dissipative rather than restoring, so the system is reassembled and the motion decays`,
    affected: [carrierId],
  };
}

/**
 * Add a part to a mechanism.
 *
 * Bounded on purpose: a body, a spring or a damper, between things that exist,
 * with a value that is a number or the id of a control. Anything more elaborate
 * is a new model rather than an edit, and building one is the on-ramp's job.
 */
export function addPart(
  ws: ModelWorkspace,
  id: string,
  spec: { kind: 'body' | 'spring' | 'damper' | 'variable'; partId: string; between?: [string, string]; value?: number | string; mass?: number | string; label?: string },
  at = 0
): EditResult {
  const doc = docOf(ws, id);
  if (!doc) return no(ws, `there is no model called ${id} here`);
  const model = current(doc);

  // A VARIABLE JOINS A SPECIFICATION. The same verb as adding a spring, because
  // it is the same act: the model gains a term, the equation is written again
  // with it, and anything fitted is re-estimated. Handled before the mechanism
  // branch because the two carriers are different objects.
  if (spec.kind === 'variable') {
    const carrier = model.objects.find((o) => !!o.estimation);
    if (!carrier?.estimation) return no(ws, `${model.title} has no specification to add a variable to`);
    const est = carrier.estimation;
    const name = spec.partId;
    if (name === est.y) return no(ws, `${name} is the outcome — it cannot also explain itself`);
    if (est.x.includes(name)) return no(ws, `${name} is already in the specification`);
    if (est.x.length >= 20) return no(ws, `this specification already carries ${est.x.length} regressors`);
    const next: Model = {
      ...model,
      version: (model.version ?? 0) + 1,
      objects: model.objects
        .filter((o) => o.meta?.spec !== carrier.id)
        .map((o) => (o.id === carrier.id ? { ...o, estimation: { ...est, x: [...est.x, name] } } : o)),
      lastChange: { what: `added ${name}`, affected: [carrier.id], at },
    };
    // WHETHER THE DATA HAS IT IS A SEPARATE QUESTION, and the estimator answers
    // it: a column that is not in the block comes back as missing structure
    // rather than as a silent drop. Saying so here would be guessing at it.
    const hasData = !!est.data && !!model.data?.[est.data];
    return {
      workspace: patch(ws, id, (d) => revise(d, next, `added ${name} to the specification`)),
      ok: true,
      says: `${name} is in the specification — ${est.y} is now explained by ${[...est.x, name].join(', ')}${
        hasData
          ? ', and the fit is re-estimated with it. If the data has no such column, the model will say so rather than drop it quietly.'
          : ', with its coefficient a symbol until there is data'
      }`,
      affected: [carrier.id],
    };
  }

  const carrier = model.objects.find((o) => !!o.mechanism);
  if (!carrier?.mechanism) return no(ws, `${model.title} has no mechanism to add to`);
  const mech = carrier.mechanism;
  const taken = new Set([
    ...(mech.bodies ?? []).map((b) => b.id),
    ...(mech.springs ?? []).map((l) => l.id),
    ...(mech.dampers ?? []).map((l) => l.id),
    ...(mech.forces ?? []).map((f) => f.id),
  ]);
  if (taken.has(spec.partId)) return no(ws, `there is already a part called ${spec.partId}`);

  let nextMech = mech;
  if (spec.kind === 'body') {
    const mass = spec.mass ?? 1;
    const lastAt = Math.max(0, ...(mech.bodies ?? []).map((b) => b.at ?? 0));
    nextMech = {
      ...mech,
      bodies: [...(mech.bodies ?? []), { id: spec.partId, mass, at: lastAt + 2, ...(spec.label ? { label: spec.label } : {}) }],
    };
  } else {
    const between = spec.between;
    if (!between) return no(ws, `a ${spec.kind} needs two ends`);
    const bodies = new Set([...(mech.bodies ?? []).map((b) => b.id), 'ground']);
    if (!between.every((e) => bodies.has(e))) {
      return no(ws, `a ${spec.kind} cannot attach to ${between.filter((e) => !bodies.has(e)).join(' or ')} — there is nothing there`);
    }
    const link = { id: spec.partId, between, value: spec.value ?? 1, ...(spec.label ? { label: spec.label } : {}) };
    nextMech =
      spec.kind === 'spring'
        ? { ...mech, springs: [...(mech.springs ?? []), link] }
        : { ...mech, dampers: [...(mech.dampers ?? []), link] };
  }

  const next: Model = {
    ...model,
    version: (model.version ?? 0) + 1,
    objects: model.objects
      .filter((o) => o.meta?.mech !== carrier.id)
      .map((o) => (o.id === carrier.id ? stripAssembled({ ...o, mechanism: nextMech }) : o)),
    lastChange: { what: `added ${spec.partId}`, affected: [carrier.id], at },
  };
  return {
    workspace: patch(ws, id, (d) => revise(d, next, `added a ${spec.kind}, ${spec.partId}`)),
    ok: true,
    says: `${spec.partId} is in the model — the system is assembled again with the new term and everything recomputes`,
    affected: [carrier.id],
  };
}

// ── what a reader and the conversation are told ─────────────────────

/** Two revisions of one document, compared by the existing comparison. */
export function compareRevisions(doc: ModelDoc, a: number, b: number): Comparison | null {
  const x = doc.revisions[a];
  const y = doc.revisions[b];
  return x && y ? compare(x, y) : null;
}

/** This document against the state it was built in — "what have I changed?" */
export function sinceBuilt(doc: ModelDoc): Comparison | null {
  return doc.revisions.length > 1 ? compare(doc.revisions[0], current(doc)) : null;
}

/**
 * The document, in lines the conversation reads.
 *
 * Identity first, because that is the thing that was missing: the same model at a
 * later revision, not a new picture.
 */
export function docLines(doc: ModelDoc, limit = 10): string[] {
  const model = current(doc);
  const lines = [
    `Model ${doc.id} — “${doc.title}”, revision ${doc.at + 1} of ${doc.revisions.length}${
      doc.branchedFrom ? ` (branched from ${doc.branchedFrom.id})` : ''
    }.`,
    `You can undo${canUndo(doc) ? '' : ' nothing yet'}${canRedo(doc) ? ', and redo' : ''}.`,
    ...doc.log.slice(-4).map((l) => `revision ${l.at + 1}: ${l.said}`),
    `Controls: ${model.params.map((p) => `${p.id} = ${p.value}${p.units ? ` ${p.units}` : ''}`).join(', ') || 'none'}.`,
  ];
  return lines.slice(0, limit);
}

// ── storage ─────────────────────────────────────────────────────────

/**
 * Read a workspace back from storage, re-validating every model in it.
 *
 * THE SAME TRUST RULE AS THE SCENE. A document arriving from a browser or a
 * database is worth what it can still prove, so each revision goes back through
 * the engine and a revision that no longer computes is dropped rather than kept
 * with a claim it cannot support. A document whose revisions all fail is not a
 * document.
 */
export function sanitizeWorkspace(raw: unknown): ModelWorkspace {
  if (!raw || typeof raw !== 'object') return EMPTY_WORKSPACE;
  const r = raw as { docs?: unknown; active?: unknown };
  const docs: ModelDoc[] = [];
  for (const d of Array.isArray(r.docs) ? r.docs.slice(0, DOC_CAP) : []) {
    if (!d || typeof d !== 'object') continue;
    const q = d as Record<string, unknown>;
    const id = typeof q.id === 'string' ? q.id.slice(0, 48) : '';
    if (!/^[a-z0-9][a-z0-9_-]{0,47}$/i.test(id)) continue;
    const revisions = (Array.isArray(q.revisions) ? q.revisions.slice(-REVISION_CAP) : [])
      .map((m) => revalidate(m))
      .filter(Boolean) as Model[];
    if (!revisions.length) continue;
    const at = typeof q.at === 'number' && q.at >= 0 && q.at < revisions.length ? Math.floor(q.at) : revisions.length - 1;
    const log = (Array.isArray(q.log) ? q.log.slice(-REVISION_CAP * 2) : [])
      .map((l) => {
        const e = l as Record<string, unknown>;
        return {
          at: typeof e?.at === 'number' ? Math.max(0, Math.floor(e.at)) : 0,
          said: typeof e?.said === 'string' ? e.said.slice(0, 160) : '',
        };
      })
      .filter((l) => l.said);
    docs.push({
      id,
      title: typeof q.title === 'string' ? q.title.slice(0, 90) : revisions[at].title,
      revisions,
      at,
      ...(q.branchedFrom && typeof q.branchedFrom === 'object'
        ? (() => {
            const b = q.branchedFrom as Record<string, unknown>;
            const bid = typeof b.id === 'string' ? b.id.slice(0, 48) : '';
            return bid ? { branchedFrom: { id: bid, at: typeof b.at === 'number' ? Math.floor(b.at) : 0 } } : {};
          })()
        : {}),
      log,
    });
  }
  const active = typeof r.active === 'string' && docs.some((d) => d.id === r.active) ? r.active : (docs[docs.length - 1]?.id ?? null);
  return { docs, active };
}

/** Build a proposal and open a document on it, in one step — the on-ramp's own door. */
export function openFromProposal(
  ws: ModelWorkspace,
  proposal: unknown,
  opts?: { at?: number }
): {
  workspace: ModelWorkspace;
  doc: ModelDoc | null;
  says: string;
  /**
   * The engine's own refusal, when it refused.
   *
   * CARRIED OUT RATHER THAN FLATTENED TO A SENTENCE. The caller has to sort the
   * refusal into a kind — is this missing data, missing structure, or a backend
   * that does not exist? — and each needs something completely different from
   * the person. Re-deriving that from prose would be parsing our own English.
   */
  refusal?: Refusal;
} {
  const built = buildProposal(proposal, opts);
  if (!built.ok) return { workspace: ws, doc: null, says: built.refusal.says, refusal: built.refusal };
  const made = open(ws, built.model, { report: built.report });
  return { workspace: made.workspace, doc: made.doc, says: built.report.says };
}

/** A built model, for the renderer: the current revision, expanded and ready. */
export function modelFor(doc: ModelDoc): Model {
  return unpack(current(doc));
}

/** For a host that has to store it: the workspace, plainly. */
export function serializeWorkspace(ws: ModelWorkspace): { docs: ModelDoc[]; active: string | null } {
  return { docs: ws.docs.map((d) => ({ ...d, revisions: d.revisions.map((m) => sanitizeModel(m) ?? m) })), active: ws.active };
}

// ── the verbs, applied ──────────────────────────────────────────────

/**
 * Apply the model's own verbs to a workspace.
 *
 * WHERE THE TWO KINDS OF OP PART COMPANY. Everything in `VizOp` that changes how
 * a model is LOOKED AT — set, layer, select, slice, view, time, compare — stays
 * with the view and is applied by applyOps (lib/model/state.ts) against the
 * current revision. Everything that changes the MODEL comes here, because it has
 * to produce a revision of a document with a stable id, and a view has no
 * business owning that.
 *
 * `set` appears in both worlds and is handled here on purpose: moving a parameter
 * is a change to the model that should be undoable, and leaving it to the view
 * would mean a slider drag is remembered and a chat instruction is not.
 */
export function applyModelOps(
  ws: ModelWorkspace,
  ops: readonly VizOp[],
  opts?: { at?: number }
): { workspace: ModelWorkspace; said: string[]; changed: boolean } {
  const at = opts?.at ?? 0;
  let out = ws;
  const said: string[] = [];
  let changed = false;

  for (const op of ops) {
    const id = out.active;
    const doc = docOf(out, id);

    switch (op.op) {
      case 'set': {
        if (!doc) break;
        const r = setValue(out, doc.id, op.id, op.value, at);
        out = r.workspace;
        said.push(r.says);
        changed = changed || r.ok;
        break;
      }
      case 'remove': {
        if (!doc) break;
        const r = removeObject(out, doc.id, op.of, at);
        out = r.workspace;
        said.push(r.says);
        changed = changed || r.ok;
        break;
      }
      case 'replace': {
        if (!doc) break;
        const r = replacePart(out, doc.id, op.of, op.becomes, at);
        out = r.workspace;
        said.push(r.says);
        changed = changed || r.ok;
        break;
      }
      case 'select': {
        if (!doc) break;
        const r = selectObject(out, doc.id, op.id, at);
        out = r.workspace;
        said.push(r.says);
        changed = changed || r.ok;
        break;
      }
      case 'at': {
        if (!doc) break;
        const r = setInput(out, doc.id, op.id, op.value, at);
        out = r.workspace;
        said.push(r.says);
        changed = changed || r.ok;
        break;
      }
      case 'relate': {
        if (!doc) break;
        const r = setRelation(out, doc.id, op.of, op.is, !!op.drop, at);
        out = r.workspace;
        said.push(r.says);
        changed = changed || r.ok;
        break;
      }
      case 'add': {
        if (!doc) break;
        const r = addPart(
          out,
          doc.id,
          {
            kind: op.kind,
            partId: op.id,
            ...(op.between ? { between: op.between } : {}),
            ...(op.value !== undefined ? (op.kind === 'body' ? { mass: op.value } : { value: op.value }) : {}),
          },
          at
        );
        out = r.workspace;
        said.push(r.says);
        changed = changed || r.ok;
        break;
      }
      case 'duplicate': {
        if (!doc) break;
        const r = duplicate(out, doc.id);
        out = r.workspace;
        if (r.doc) {
          said.push(`copied as ${r.doc.id}; the original ${doc.id} is untouched`);
          changed = true;
        }
        break;
      }
      case 'branch': {
        if (!doc) break;
        const r = branch(out, doc.id, op.name);
        out = r.workspace;
        if (r.doc) {
          said.push(`branched as ${r.doc.id} — “${r.doc.title}”; ${doc.id} is untouched`);
          changed = true;
        }
        break;
      }
      case 'undo': {
        if (!doc) break;
        if (!canUndo(doc)) {
          said.push(`${doc.id} is at its first revision — there is nothing to undo`);
          break;
        }
        out = undo(out, doc.id);
        const now = docOf(out, doc.id)!;
        said.push(`back to revision ${now.at + 1} of ${doc.id}`);
        changed = true;
        break;
      }
      case 'redo': {
        if (!doc) break;
        if (!canRedo(doc)) {
          said.push(`${doc.id} is at its latest revision — there is nothing to redo`);
          break;
        }
        out = redo(out, doc.id);
        const now = docOf(out, doc.id)!;
        said.push(`forward to revision ${now.at + 1} of ${doc.id}`);
        changed = true;
        break;
      }
      case 'delete': {
        if (!doc) break;
        out = remove(out, doc.id);
        said.push(`${doc.id} is deleted`);
        changed = true;
        break;
      }
      case 'use': {
        const want = docOf(out, op.id);
        if (!want) {
          said.push(`there is no model called ${op.id} here`);
          break;
        }
        out = use(out, op.id);
        said.push(`showing ${want.id} — “${want.title}”`);
        changed = true;
        break;
      }
      case 'reset': {
        // `reset` means the MODEL goes back to how it was built when there is a
        // document; on a hand-built surface it means the controls go back, which
        // the view still handles. Both are "undo everything", in their own terms.
        if (!doc) break;
        out = reset(out, doc.id);
        said.push(`${doc.id} is back to how it was built, kept as a new revision`);
        changed = true;
        break;
      }
      default:
        break;
    }
  }

  return { workspace: out, said, changed };
}

/**
 * What the conversation is told about the document it is looking at.
 *
 * Attached to the state the picture reports (VizModelState.edits), which is what
 * turns the edit verbs on in the ops grammar and what lets a reply say "the same
 * model, one revision later" rather than describing a new picture.
 */
export function editsState(ws: ModelWorkspace): NonNullable<VizModelState['edits']> | null {
  const doc = activeDoc(ws);
  if (!doc) return null;
  return {
    id: doc.id,
    title: doc.title,
    revision: doc.at + 1,
    revisions: doc.revisions.length,
    canUndo: canUndo(doc),
    canRedo: canRedo(doc),
    others: ws.docs.filter((d) => d.id !== doc.id).map((d) => d.id),
    log: doc.log.slice(-4).map((l) => l.said),
  };
}
