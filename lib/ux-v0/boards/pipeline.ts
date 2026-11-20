// lib/ux-v0/boards/pipeline.ts — a board made from a request: the stages, in order, each one checkable.
//
//   request → brief (readBoardRequest) → Master Design System (proposed from the brief's words and accent by the
//   art-direction engine, or taken from a website's approved direction) → material plan (planMaterials) → each
//   material composed in the system (composeMaterial), at most `concurrency` at a time, its status said as it goes
//   (planned, generating, rendering, ready, failed) → the board arranged (arrange) → its notes written from the
//   facts (annotate) → evaluated (evaluateBoard).
//
// A material that fails does not touch the others: it is retried once on its own (the next composition variant),
// then said failed with its reason and its draft kept, to retry alone later. Nothing here calls a model; what
// needs the browser (measuring text with real faces, writing a website project to the store) is given in.

import { proposeDirections, type ArtDirection } from '../direction';
import { accentFor } from '../graphics/compose';
import { vocabularyFor } from '../graphics/vocabulary';
import { normalizeBrief, type DesignProject } from '../types';
import type { Measure } from '../graphics/text';
import type { Asset } from '../graphics/doc';
import { annotate } from './annotate';
import { arrange, presentSize } from './layout';
import { applyBoardOps, boardId, emptyBoard, type BoardBrief, type BoardOp, type BoardState, type GraphicMaterial, type Material, type WebsiteMaterial } from './model';
import { composeMaterial, graphicIndex, paletteTurn, planMaterials, siblingIndex, type ComposedMaterial } from './plan';
import { directionOfSystem, systemFromDirection, systemInStyle, type MasterDesignSystem } from './system';
import { styledOptions } from '../graphics/styles/propose';

/** Three systems for a brief: the art-direction engine's directions, each given the accent the brief suggests. */
export function proposeSystems(brief: BoardBrief, salt: string, opts: { round?: number; seen?: readonly string[] } = {}): MasterDesignSystem[] {
  const accent = accentFor({ purpose: brief.purpose, mood: brief.mood, content: brief.content }, salt);
  const db = normalizeBrief({
    pageType: 'website',
    objective: brief.purpose || brief.content.headline,
    personality: brief.mood,
    visualDirection: [brief.purpose, brief.mood.join(', ')].filter(Boolean).join('. '),
    palette: [{ name: 'Accent', hex: accent.hex, role: 'accent' }],
    typography: { display: '', body: '' },
    decisions: { colour: 'delegated', typography: 'delegated' },
  });
  if (!db) return [];
  const systems = proposeDirections({ brief: db, salt, round: opts.round ?? 0, seen: opts.seen ?? [], count: 3 }).map((d) => systemFromDirection(d, { name: brief.name, personality: brief.mood, accentWhy: accent.why }));
  // each system in a design language chosen from the brief (one it names first): every material will speak it
  const styled = styledOptions({ purpose: brief.purpose, kind: 'campaign', formats: [], content: brief.content, mood: brief.mood, images: brief.images }, systems.map(directionOfSystem), { salt: `${salt}|${opts.round ?? 0}`, seedKey: salt, seen: opts.seen ?? [] });
  return systems.map((s, i) => (styled.options[i]?.style ? systemInStyle(s, styled.options[i]) : s));
}

/** The system of a website project's approved direction (null without one). */
export function systemFromWebsite(p: DesignProject, name?: string): MasterDesignSystem | null {
  const d = p.direction?.chosen;
  if (!d || !p.direction.approved) return null;
  return systemFromDirection(d as ArtDirection, { name: name || p.name, personality: p.brief.doc?.personality ?? [], source: { projectId: p.id, name: p.name || 'Untitled' }, accentWhy: `the accent of the website “${p.name || 'Untitled'}”` });
}

/**
 * A board begun from a brief and a system: its materials planned (not yet composed), each placed at its
 * presentation size, the design-system overview placed, arranged as a campaign overview.
 */
export function startBoard(brief: BoardBrief, sys: MasterDesignSystem, opts: { request?: string; assets?: Asset[]; websiteProject?: string } = {}): BoardState {
  const materials = planMaterials(brief, { websiteProject: opts.websiteProject });
  let x = 0;
  const nodes = materials.map((m) => {
    const s = presentSize(m);
    const node = { id: boardId('bn'), type: 'material' as const, material: m.id, x, y: 300, w: s.w, h: s.h };
    x += s.w + 72;
    return node;
  });
  // one vocabulary for the whole board, read from its brief (kept when the system already has one)
  const vocabulary = sys.vocabulary ?? vocabularyFor({ words: brief.purpose, mood: brief.mood, language: sys.direction.language, intensity: sys.composition.intensity, hasImage: (opts.assets ?? []).length > 0, seed: sys.id });
  const system = vocabulary.strength >= 1 ? { ...sys, vocabulary } : sys;
  const b: BoardState = { ...emptyBoard(), request: opts.request ?? brief.purpose, brief, system, options: [], materials, nodes: [...nodes, { id: boardId('bn'), type: 'system', x: x + 200, y: 300, w: 960, h: 640 }], assets: opts.assets ?? [] };
  return applyAll(b, arrange(b, 'editorial'));
}

/** Operations applied to a board in order (the pipeline's own: it has made them valid). */
export function applyAll(b: BoardState, ops: readonly BoardOp[]): BoardState {
  const r = applyBoardOps(b, ops);
  return r.ok ? r.board : b;
}

export interface GenerateDeps {
  measure?: Measure;
  /** composes one graphic material (default: composeMaterial with the board's assets) */
  compose?: (m: GraphicMaterial, sibling: number, turn: number) => ComposedMaterial | Promise<ComposedMaterial>;
  /** makes (or links) the website project of a website material; returns its project id */
  website?: (m: WebsiteMaterial, board: BoardState) => Promise<string>;
}

/**
 * Every material of a board composed (or only those named), at most `concurrency` at a time, each status reported
 * as an operation for the caller to apply (see the head of this file). Returns when all have settled.
 */
export async function generate(start: BoardState, deps: GenerateDeps, emit: (op: BoardOp) => void, opts: { concurrency?: number; only?: readonly string[]; signal?: { aborted: boolean } } = {}): Promise<{ ready: number; failed: number }> {
  const sys = start.system;
  if (!sys) return { ready: 0, failed: 0 };
  const todo = start.materials.filter((m) => (opts.only ? opts.only.includes(m.id) : m.status !== 'ready'));
  const graphicsAndSites = todo.filter((m) => m.type !== 'mockup');
  const mockups = todo.filter((m) => m.type === 'mockup');
  let ready = 0;
  let failed = 0;
  const pause = () => new Promise((res) => setTimeout(res, 0));
  const one = async (m: Material) => {
    if (opts.signal?.aborted) return;
    emit({ op: 'material-update', id: m.id, set: { status: 'generating', error: '' } });
    await pause();
    try {
      if (m.type === 'graphic') {
        const sibling = siblingIndex(start.materials, m);
        const order = Math.max(0, graphicIndex(start.materials, m));
        const turn = Math.max(0, paletteTurn(start.materials, m));
        // composed, then once more in the next variant if high findings remain; then said
        let variant = m.variant;
        let made: ComposedMaterial | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          const cur = { ...m, variant };
          made = deps.compose ? await deps.compose(cur, sibling, turn) : composeMaterial(cur, sys, { measure: deps.measure, assets: start.assets, sibling, order, turn });
          if (!made.left.length) break;
          variant++;
        }
        emit({ op: 'material-update', id: m.id, set: { status: 'rendering' } });
        await pause();
        if (!made) throw new Error('nothing was composed');
        const bad = made.left.length > 0;
        emit({ op: 'material-update', id: m.id, set: { doc: made.doc, bindings: made.bindings, plan: made.plan, variant, composed: made.doc.revision, findings: made.left.length, status: bad ? 'failed' : 'ready', error: bad ? `${made.left.length} problem${made.left.length === 1 ? '' : 's'} the bounded repair could not fix: ${made.left[0].message} Retry it, change its words, or keep it as it is.` : '' } });
        if (bad) failed++;
        else ready++;
      } else if (m.type === 'website') {
        if (!deps.website) throw new Error('websites can only be made in the browser');
        const projectId = await deps.website(m, start);
        emit({ op: 'material-update', id: m.id, set: { projectId, status: 'ready', error: '' } });
        ready++;
      }
    } catch (e) {
      failed++;
      emit({ op: 'material-update', id: m.id, set: { status: 'failed', error: `${(e as Error).message || 'it could not be made'}. Retry it on its own: the other materials are not affected.` } });
    }
  };
  // a bounded pool: at most `concurrency` materials in progress at once
  const queue = [...graphicsAndSites];
  const workers = Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 3, queue.length || 1)) }, async () => {
    while (queue.length && !opts.signal?.aborted) await one(queue.shift()!);
  });
  await Promise.all(workers);
  // mockups present their sources: ready once the source is, said waiting otherwise
  for (const m of mockups) {
    if (m.type !== 'mockup') continue;
    emit({ op: 'material-update', id: m.id, set: { status: 'rendering' } });
    await pause();
    emit({ op: 'material-update', id: m.id, set: m.source ? { status: 'ready', error: '' } : { status: 'failed', error: 'There is no design for it to present. Choose one.' } });
    if (m.source) ready++;
    else failed++;
  }
  return { ready, failed };
}

/** The board finished after generation: arranged as a campaign overview and, when asked, annotated from the facts. */
export function finishOps(b: BoardState): BoardOp[] {
  const ops: BoardOp[] = [...arrange(b, b.arrangement)];
  if (b.brief?.annotate !== false) {
    const arranged = applyAll(b, ops);
    const notes = annotate(arranged);
    const withNotes = applyAll(arranged, notes);
    // the notes in their places under what they explain
    return [...ops, ...notes, ...arrange(withNotes, withNotes.arrangement)];
  }
  return ops;
}

/** Materials left mid-generation (the page was closed while they were being made), said failed so they can be retried
 * alone: never left “generating” forever, never taken for finished. */
export function interruptedOps(b: BoardState): BoardOp[] {
  return b.materials.filter((m) => m.status === 'generating' || m.status === 'rendering').map((m) => ({ op: 'material-update', id: m.id, set: { status: 'failed', error: 'Interrupted: the page was closed while it was being made. Retry it on its own; the others are as they were.' } }) as BoardOp);
}
