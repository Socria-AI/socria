// lib/artifact-qa.ts — AN ARTIFACT LOOKED OVER BEFORE IT IS SHOWN (Logos 6, November 2026).
//
// The validator (lib/inline-ui.ts sanitizeInlineSpec) decides what an element IS allowed to be. This decides whether it
// will READ: laid out at the widths it will be seen at — a wide screen, a narrow column, a phone — with the same layout
// code that draws it (lib/inline-diagram.ts), so what is checked is what is drawn.
//
//   overlap        two parts drawn on top of each other
//   bounds         a part drawn outside its figure
//   collision      a link across a mind map passing through a part it does not join
//   clipped-label  a label too long for its box: wrapped to two lines and cut, the rest only in the part's panel
//   window         a graph whose window shows none of a curve (the curve is there, the picture is empty)
//   crowded        more parts than a glance takes at that width (drawn as its list there instead)
//
// What can be put right without changing what the artifact says is put right before it is shown (a graph's height
// refitted to its curves); the rest is reported, so a picture that would not read is known, never silently shipped.
// The rendered check (scripts/verify-artifacts.mjs) looks at the same elements in a real browser: text overlap,
// clipping, overflow, the smallest type and contrast, at desktop and phone widths.

import { compileOver, sampleCurve } from './inline-math';
import { DIAGRAM_MIN_BOX, defaultFolds, diagramFigure, mindLayout } from './inline-diagram';
import { sanitizeInlineSpec, type DiagramSpec, type GraphSpec, type InlineSpec } from './inline-ui';

export type QaCheck = 'overlap' | 'bounds' | 'collision' | 'clipped-label' | 'window' | 'crowded';
export interface QaFinding {
  check: QaCheck;
  /** the width it was seen at, when it depends on one */
  width?: number;
  said: string;
  /** put right before it was shown */
  repaired?: boolean;
}
export interface QaResult {
  spec: InlineSpec;
  findings: QaFinding[];
}

/** The widths an element is seen at: a wide reply column, a narrow one, a phone, a small phone. */
export const QA_WIDTHS = [1100, 720, 420, 320] as const;

type Rect = { x0: number; y0: number; x1: number; y1: number };
const rect = (cx: number, cy: number, w: number, h: number): Rect => ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 });
const meets = (a: Rect, b: Rect, gap = 1) => a.x0 < b.x1 - gap && b.x0 < a.x1 - gap && a.y0 < b.y1 - gap && b.y0 < a.y1 - gap;
const outside = (r: Rect, W: number, H: number) => r.x0 < -0.5 || r.y0 < -0.5 || r.x1 > W + 0.5 || r.y1 > H + 0.5;

function pairsMeeting(rs: Rect[]): number {
  let n = 0;
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (meets(rs[i], rs[j])) n++;
  return n;
}

/** A quadratic path "M x0 y0 Q cx cy x1 y1", sampled; null for any other shape. */
function quadPoints(d: string): { x: number; y: number }[] | null {
  const m = /^M\s*([-\d.]+)[ ,]+([-\d.]+)\s*Q\s*([-\d.]+)[ ,]+([-\d.]+)[ ,]+([-\d.]+)[ ,]+([-\d.]+)\s*$/.exec(d.trim());
  if (!m) return null;
  const [x0, y0, cx, cy, x1, y1] = m.slice(1).map(Number);
  return Array.from({ length: 13 }, (_, i) => {
    const t = 0.1 + (i / 12) * 0.8;
    const u = 1 - t;
    return { x: u * u * x0 + 2 * u * t * cx + t * t * x1, y: u * u * y0 + 2 * u * t * cy + t * t * y1 };
  });
}

function qaMind(spec: DiagramSpec, out: QaFinding[]) {
  const folds = defaultFolds(spec);
  const cut = new Set<string>();
  for (const W of QA_WIDTHS) {
    const lay = mindLayout(spec, W, folds);
    if (!lay) continue;
    const rs = lay.boxes.map((b) => rect(b.cx, b.cy, b.w, b.h));
    const over = pairsMeeting(rs);
    if (over) out.push({ check: 'overlap', width: W, said: `${over} pair${over === 1 ? '' : 's'} of parts overlap at ${W}px` });
    const off = lay.boxes.filter((b, i) => outside(rs[i], lay.W, lay.H));
    if (off.length) out.push({ check: 'bounds', width: W, said: `${off.map((b) => `“${b.label}”`).join(', ')} drawn outside the figure at ${W}px` });
    for (const l of lay.links) {
      const pts = quadPoints(l.d);
      if (!pts) continue;
      const hit = lay.boxes.find((b, i) => b.id !== l.from && b.id !== l.to && pts.some((p) => p.x > rs[i].x0 + 2 && p.x < rs[i].x1 - 2 && p.y > rs[i].y0 + 2 && p.y < rs[i].y1 - 2));
      if (hit) out.push({ check: 'collision', width: W, said: `the link from “${label(spec, l.from)}” to “${label(spec, l.to)}” passes through “${hit.label}” at ${W}px` });
    }
    for (const b of lay.boxes) if (b.lines.some((x) => x.endsWith('…'))) cut.add(b.label);
  }
  if (cut.size) out.push({ check: 'clipped-label', said: `${[...cut].map((x) => `“${x}”`).join(', ')} ${cut.size === 1 ? 'is' : 'are'} cut to two lines in the picture (whole in the part’s panel and its text)` });
}
const label = (spec: DiagramSpec, id: string) => spec.nodes.find((n) => n.id === id)?.label ?? id;

function qaDiagram(spec: DiagramSpec, out: QaFinding[]) {
  if (spec.view === 'mind') return qaMind(spec, out);
  for (const W of QA_WIDTHS) {
    const fig = diagramFigure(spec, W);
    // too narrow for its boxes: the list is drawn instead at that width (by design, not a fault) — said once, widest first
    if (!fig) {
      if (!out.some((f) => f.check === 'crowded')) out.push({ check: 'crowded', width: W, said: `at ${W}px and narrower its parts would be under ${DIAGRAM_MIN_BOX[spec.view]}px wide, so it is shown as its list there` });
      continue;
    }
    const rs = fig.boxes.map((b) => rect(b.cx, b.cy, b.w, b.h));
    const over = pairsMeeting(rs);
    if (over) out.push({ check: 'overlap', width: W, said: `${over} pair${over === 1 ? '' : 's'} of parts overlap at ${W}px` });
    const off = fig.boxes.filter((_b, i) => outside(rs[i], fig.W, fig.H));
    if (off.length) out.push({ check: 'bounds', width: W, said: `${off.length} part${off.length === 1 ? '' : 's'} drawn outside the figure at ${W}px` });
  }
}

/** Does any of a graph's curves show in its window? Each curve sampled as it is drawn, with the sliders where they start. */
function visibleCurves(spec: GraphSpec): { shown: number; total: number } {
  const names = spec.params.map((p) => p.name);
  const values = Object.fromEntries(spec.params.map((p) => [p.name, p.value]));
  const exprs = [spec.expr, ...(spec.curves ?? []).map((c) => c.expr)];
  let shown = 0;
  for (const e of exprs) {
    const c = compileOver(e, names);
    const s = c ? sampleCurve(c, values, spec.x[0], spec.x[1], 200) : null;
    const pts = (s?.pts ?? []).filter((p) => Number.isFinite(p.y));
    const inWindow = spec.y ? pts.filter((p) => p.y >= spec.y![0] && p.y <= spec.y![1]) : pts;
    if (inWindow.length >= 2) shown++;
  }
  return { shown, total: exprs.length };
}

function qaGraph(spec: GraphSpec, out: QaFinding[]): InlineSpec {
  const v = visibleCurves(spec);
  if (v.shown === v.total) return spec;
  // the height was set and hides a curve: let it fit the curves (what it says is unchanged — only where it looks)
  if (spec.y) {
    const { y: _y, ...rest } = spec;
    const refit = sanitizeInlineSpec(rest) as GraphSpec | null;
    if (refit && visibleCurves(refit).shown > v.shown) {
      out.push({ check: 'window', said: `${v.total - v.shown} curve${v.total - v.shown === 1 ? ' was' : 's were'} outside the window set; the height now fits the curves`, repaired: true });
      return refit;
    }
  }
  out.push({ check: 'window', said: `${v.total - v.shown} of ${v.total} curve${v.total === 1 ? '' : 's'} cannot be seen from x = ${spec.x[0]} to ${spec.x[1]}` });
  return spec;
}

/** An element looked over before it is shown: what would not read, and what was put right. */
export function qaInline(spec: InlineSpec): QaResult {
  const findings: QaFinding[] = [];
  let out: InlineSpec = spec;
  try {
    if (spec.type === 'diagram') qaDiagram(spec, findings);
    else if (spec.type === 'graph') out = qaGraph(spec, findings);
  } catch {
    // a check that cannot run says nothing either way; the element is shown as the validator left it
  }
  return { spec: out, findings };
}

/** The findings a person should never meet: a picture that does not read where it is drawn. */
export const QA_FAULTS: readonly QaCheck[] = ['overlap', 'bounds', 'collision'];
export const qaFaults = (r: QaResult): QaFinding[] => r.findings.filter((f) => QA_FAULTS.includes(f.check) && !f.repaired);
