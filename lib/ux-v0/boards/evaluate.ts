// lib/ux-v0/boards/evaluate.ts — how a board holds together, measured on what can be measured.
//
// Coherence without repetition: every material in the system's palette and faces (a property a designer changed on
// purpose counts as a local override, said as such), siblings that differ in composition (two posters with the same
// archetype on the same ground are one design twice), each material clean by the Graphics checks, notes that still
// say what is true, nothing on the board on top of anything else, every material made. This is structural
// evaluation, not taste: whether the board is beautiful is left to the designer's eye.

import { checkDoc } from '../graphics/check';
import { walk, type TextNode } from '../graphics/doc';
import { decodeSignature, similarity, TOO_SIMILAR } from '../graphics/generative/evaluate';
import type { Measure } from '../graphics/text';
import { annotate, verifyNotes } from './annotate';
import { arrange, collisions } from './layout';
import { applyBoardOps, nodeOfMaterial, type BoardOp, type BoardState, type GraphicMaterial } from './model';
import { overridesOf, refineKeepingOverrides } from './system';

export interface BoardFinding {
  id: string;
  kind: 'status' | 'consistency' | 'typography' | 'palette' | 'repetition' | 'composition' | 'hierarchy' | 'export' | 'annotation' | 'arrangement' | 'website' | 'mockup';
  severity: 'high' | 'medium' | 'low';
  message: string;
  material?: string;
  node?: string;
  /** what fixes it, when something does without taking a decision away */
  fix?: 'refine' | 'regenerate' | 'arrange' | 'annotate' | 'retry' | 'choose-source' | 'sync-website';
}

export interface BoardEvaluation {
  /** 0–100: the mean of the dimensions */
  score: number;
  dims: { key: string; label: string; score: number; detail: string }[];
  findings: BoardFinding[];
  /** local overrides across the materials (kept by choice; listed per material in the inspector) */
  overrides: number;
}

const hex7 = (v: string | null | undefined) => (v ?? '').slice(0, 7).toLowerCase();

/** The board measured (see the head of this file). `websites` gives what is known of linked website projects. */
export function evaluateBoard(b: BoardState, ctx: { measure?: Measure; websites?: Record<string, { display: string; body: string; accent: string } | null>; missingUploads?: readonly string[] } = {}): BoardEvaluation {
  const findings: BoardFinding[] = [];
  const add = (f: Omit<BoardFinding, 'id'>) => findings.push({ ...f, id: `${f.kind}:${f.material ?? f.node ?? ''}:${findings.length}` });
  const sys = b.system;
  const graphics = b.materials.filter((m): m is GraphicMaterial => m.type === 'graphic');
  const ready = graphics.filter((m) => m.status === 'ready' && m.doc);

  // every material made, each mockup with something to present
  for (const m of b.materials) {
    if (m.status === 'failed') add({ kind: 'status', severity: 'high', material: m.id, message: `${m.name} failed${m.error ? `: ${m.error}` : ''}.`, fix: 'retry' });
    else if (m.status !== 'ready') add({ kind: 'status', severity: 'medium', material: m.id, message: `${m.name} is ${m.status}.` });
    if (m.type === 'mockup' && !m.source) add({ kind: 'mockup', severity: 'medium', material: m.id, message: `${m.name} has no design to present.`, fix: 'choose-source' });
    if (!nodeOfMaterial(b, m.id)) add({ kind: 'arrangement', severity: 'low', material: m.id, message: `${m.name} is not placed on the board.`, fix: 'arrange' });
  }
  const statusScore = b.materials.length ? b.materials.filter((m) => m.status === 'ready').length / b.materials.length : 1;

  // brand consistency: bound properties still at the system's values
  let bound = 0;
  let overrides = 0;
  for (const m of ready) {
    bound += Object.values(m.bindings.nodes).reduce((s, r) => s + Object.keys(r).length, 0) + Object.keys(m.bindings.boards).length;
    if (sys) {
      const o = overridesOf(m.doc, m.bindings, sys);
      overrides += o.length;
      if (o.length) add({ kind: 'consistency', severity: 'low', material: m.id, message: `${m.name} keeps ${o.length} local override${o.length === 1 ? '' : 's'} of the system (${o.slice(0, 2).map((x) => `${x.name} ${x.prop}`).join(', ')}${o.length > 2 ? '…' : ''}).` });
    }
  }
  const consistency = bound ? 1 - overrides / bound : 1;

  // typography coherence: the faces set across the materials
  let texts = 0;
  let inSystem = 0;
  if (sys) {
    const faces = new Set([sys.tokens.fonts.display, sys.tokens.fonts.body]);
    for (const m of ready) {
      const off = new Set<string>();
      for (const ab of m.doc!.artboards)
        for (const l of walk(ab)) {
          if (l.node.type !== 'text' || l.node.hidden) continue;
          texts++;
          if (faces.has(l.node.font)) inSystem++;
          else off.add(l.node.font);
        }
      if (off.size) add({ kind: 'typography', severity: 'medium', material: m.id, message: `${m.name} sets text in ${[...off].join(', ')}, outside the system’s two faces.` });
    }
  }
  const typography = texts ? inSystem / texts : 1;

  // palette consistency: grounds and large fields in the system's colours
  let fields = 0;
  let inPalette = 0;
  if (sys) {
    const palette = new Set([...Object.values(sys.tokens.colors), sys.tokens.accent2].filter(Boolean).map((c) => hex7(c as string)));
    for (const m of ready) {
      const off = new Set<string>();
      for (const ab of m.doc!.artboards) {
        if (ab.background) {
          fields++;
          if (palette.has(hex7(ab.background))) inPalette++;
          else off.add(hex7(ab.background));
        }
        for (const l of walk(ab)) {
          const n = l.node;
          if (n.type !== 'shape' || typeof n.fill !== 'string' || n.hidden || n.w * n.h < ab.width * ab.height * 0.02) continue;
          fields++;
          if (palette.has(hex7(n.fill))) inPalette++;
          else off.add(hex7(n.fill));
        }
      }
      if (off.size) add({ kind: 'palette', severity: 'medium', material: m.id, message: `${m.name} has fields in ${[...off].slice(0, 3).join(', ')}, outside the palette.` });
    }
  }
  const palette = fields ? inPalette / fields : 1;

  // material differentiation: siblings must not be one design twice
  let pairs = 0;
  let repeats = 0;
  for (let i = 0; i < ready.length; i++)
    for (let j = i + 1; j < ready.length; j++) {
      const p = ready[i];
      const q = ready[j];
      if (p.brief.kind !== q.brief.kind) continue;
      pairs++;
      // one design twice: the same structure (by the generated designs' signatures), else the same composition and ground
      const sp = p.doc!.artboards[0]?.concept?.signature;
      const sq = q.doc!.artboards[0]?.concept?.signature;
      const dp = sp ? decodeSignature(sp) : null;
      const dq = sq ? decodeSignature(sq) : null;
      const same = p.brief.formats[0] === q.brief.formats[0] && (dp && dq ? similarity(dp, dq) >= TOO_SIMILAR : p.plan?.archetype === q.plan?.archetype && hex7(p.doc!.artboards[0]?.background) === hex7(q.doc!.artboards[0]?.background));
      if (same) {
        repeats++;
        add({ kind: 'repetition', severity: 'medium', material: q.id, message: `${q.name} has the same composition and ground as ${p.name}: one design twice. Regenerate one to differ.`, fix: 'regenerate' });
      }
    }
  const differentiation = pairs ? 1 - repeats / pairs : 1;

  // composition quality: the Graphics checks on each material
  let clean = 0;
  for (const m of ready) {
    const fs = checkDoc(m.doc!, ctx.measure).filter((f) => f.severity !== 'low');
    if (!fs.length) clean++;
    for (const f of fs.slice(0, 2)) add({ kind: 'composition', severity: f.severity, material: m.id, message: `${m.name}: ${f.message}`, ...(f.fix && !f.blocked ? { fix: 'refine' as const } : {}) });
  }
  const composition = ready.length ? clean / ready.length : 1;

  // visual hierarchy: in each graphic the headline is the largest text, clearly (1.5 times the next) — a measure
  let ordered = 0;
  for (const m of ready) {
    const texts = m.doc!.artboards[0] ? walk(m.doc!.artboards[0]).map((l) => l.node).filter((n): n is TextNode => n.type === 'text' && !n.hidden && n.text.trim().length > 0) : [];
    const head = texts.find((t) => t.role === 'headline');
    const others = texts.filter((t) => t !== head && t.role !== 'logo').map((t) => t.size);
    const next = others.length ? Math.max(...others) : 0;
    if (!head || head.size >= next * 1.5) ordered++;
    else add({ kind: 'hierarchy', severity: 'medium', material: m.id, message: `${m.name}: the headline (${Math.round(head.size)}) is not clearly the largest text (another is ${Math.round(next)}).`, fix: 'refine' });
  }
  const hierarchy = ready.length ? ordered / ready.length : 1;

  // export readiness: each material can be delivered in its own formats as it is
  let deliverable = 0;
  const missing = new Set(ctx.missingUploads ?? []);
  for (const m of b.materials) {
    let ok = m.status === 'ready';
    if (m.type === 'graphic' && m.doc) {
      const gone = m.doc.assets.filter((x) => missing.has(x.src));
      if (gone.length) {
        ok = false;
        add({ kind: 'export', severity: 'medium', material: m.id, message: `${m.name}: ${gone.length} of its pictures ${gone.length === 1 ? 'is' : 'are'} not in this browser, so it would export without ${gone.length === 1 ? 'it' : 'them'}.` });
      }
    }
    if (m.type === 'mockup' && !m.source) ok = false;
    if (m.type === 'website' && ctx.websites && ctx.websites[m.projectId] === null) ok = false;
    if (ok) deliverable++;
  }
  const exportable = b.materials.length ? deliverable / b.materials.length : 1;

  // annotation accuracy: generated notes that still say what is true
  const generated = b.nodes.filter((n) => n.type === 'note' && n.generated).length;
  const stale = verifyNotes(b);
  for (const s of stale) add({ kind: 'annotation', severity: 'medium', node: s.note, message: `A note no longer matches the board: ${s.reasons.join('; ')}.`, fix: 'annotate' });
  const annotations = generated ? 1 - stale.length / generated : 1;

  // the board's arrangement: nothing over anything else
  const hits = collisions(b);
  for (const [p, q] of hits.slice(0, 4)) add({ kind: 'arrangement', severity: 'medium', node: q.id, message: `Two things overlap on the board (${p.type} and ${q.type}).`, fix: 'arrange' });
  const arrangement = b.nodes.length ? Math.max(0, 1 - hits.length / Math.max(4, b.nodes.length)) : 1;

  // linked websites in step with the system, where they are known
  if (sys && ctx.websites)
    for (const m of b.materials) {
      if (m.type !== 'website') continue;
      const w = ctx.websites[m.projectId];
      if (w === null) add({ kind: 'website', severity: 'medium', material: m.id, message: `${m.name}: its website project is not in this browser.` });
      else if (w && (w.display !== sys.tokens.fonts.display || hex7(w.accent) !== hex7(sys.tokens.colors.accent))) add({ kind: 'website', severity: 'low', material: m.id, message: `${m.name} is out of step with the system (${w.display !== sys.tokens.fonts.display ? `its headlines in ${w.display}` : `its accent ${w.accent}`}).`, fix: 'sync-website' });
    }

  const dims = [
    { key: 'status', label: 'Materials made', score: statusScore, detail: `${b.materials.filter((m) => m.status === 'ready').length} of ${b.materials.length} ready` },
    { key: 'consistency', label: 'Brand consistency', score: consistency, detail: `${bound - overrides} of ${bound} shared properties at the system’s values${overrides ? `, ${overrides} kept as local overrides` : ''}` },
    { key: 'typography', label: 'Typography coherence', score: typography, detail: `${inSystem} of ${texts} texts in the system’s faces` },
    { key: 'palette', label: 'Palette consistency', score: palette, detail: `${inPalette} of ${fields} grounds and fields in the palette` },
    { key: 'differentiation', label: 'Material differentiation', score: differentiation, detail: pairs ? `${pairs - repeats} of ${pairs} sibling pairs composed differently` : 'no siblings of one kind' },
    { key: 'composition', label: 'Composition quality', score: composition, detail: `${clean} of ${ready.length} materials with nothing to fix` },
    { key: 'hierarchy', label: 'Visual hierarchy', score: hierarchy, detail: `${ordered} of ${ready.length} graphics led clearly by their headline` },
    { key: 'export', label: 'Export readiness', score: exportable, detail: `${deliverable} of ${b.materials.length} materials ready to deliver in their own formats` },
    { key: 'annotations', label: 'Annotation accuracy', score: annotations, detail: generated ? `${generated - stale.length} of ${generated} notes still true` : 'no generated notes' },
    { key: 'arrangement', label: 'Board arrangement', score: arrangement, detail: hits.length ? `${hits.length} overlap${hits.length === 1 ? '' : 's'}` : 'nothing overlaps' },
  ];
  return { score: Math.round((dims.reduce((s, d) => s + d.score, 0) / dims.length) * 100), dims: dims.map((d) => ({ ...d, score: Math.round(d.score * 100) / 100 })), findings, overrides };
}

/**
 * One bounded round of fixes for what the checks found, never taking a decision away: each material's bounded repair
 * (its local overrides held), the arrangement made again where things overlap, the notes written again where they no
 * longer hold. What only a new composition can fix (one design twice) and what failed are returned, to be regenerated
 * or retried on their own; the rest is left, and said.
 */
export function refineBoardOps(b: BoardState, ev: BoardEvaluation, measure?: Measure): { ops: BoardOp[]; regenerate: string[]; retry: string[]; said: string[] } {
  const ops: BoardOp[] = [];
  const said: string[] = [];
  const sys = b.system;
  const refine = [...new Set(ev.findings.filter((f) => f.fix === 'refine' && f.material).map((f) => f.material!))];
  for (const id of refine) {
    const m = b.materials.find((x): x is GraphicMaterial => x.id === id && x.type === 'graphic');
    if (!m?.doc || !sys) continue;
    const r = refineKeepingOverrides(m.doc, m.bindings, sys, measure);
    if (r.doc !== m.doc && r.fixed.length) {
      ops.push({ op: 'material-update', id, set: { doc: r.doc, bindings: r.bindings } });
      said.push(`${m.name}: ${r.fixed.map((f) => f.replace(/\.$/, '')).join('; ')}`);
    }
  }
  let cur = applyBoardOps(b, ops);
  let board = cur.ok ? cur.board : b;
  if (ev.findings.some((f) => f.fix === 'arrange')) {
    const a = arrange(board, board.arrangement);
    cur = applyBoardOps(board, a);
    if (cur.ok) {
      ops.push(...a);
      board = cur.board;
      said.push('the board arranged again so nothing overlaps');
    }
  }
  if (ops.length || ev.findings.some((f) => f.fix === 'annotate')) {
    if (board.nodes.some((n) => n.type === 'note' && n.generated)) {
      const n = annotate(board);
      cur = applyBoardOps(board, n);
      if (cur.ok && n.length) {
        ops.push(...n);
        if (ev.findings.some((f) => f.fix === 'annotate')) said.push('the notes written again from the facts');
      }
    }
  }
  const regenerate = [...new Set(ev.findings.filter((f) => f.fix === 'regenerate' && f.material).map((f) => f.material!))];
  const retry = [...new Set(ev.findings.filter((f) => f.fix === 'retry' && f.material).map((f) => f.material!))];
  return { ops, regenerate, retry, said };
}
