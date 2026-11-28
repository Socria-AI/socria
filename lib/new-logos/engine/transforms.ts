// lib/new-logos/engine/transforms.ts — SHOWING A COMPONENT ANOTHER WAY, and what that may and may not mean.
//
// Two different things are both called transforming:
//   • a CHANGE OF REPRESENTATION shows the same information another way — a table as a plot, bars or measures; a plot
//     as the table of its values; steps as a timeline and back; an equation as its graph; a variable as a slider or a
//     number. Deterministic, instant, lossless and reversible: the item's data is untouched, only its `view` changes.
//     Which views apply depends on the data (a plot needs two number columns), so only those are offered.
//   • an ANALYTICAL TRANSFORMATION makes something new from it — assumptions written as words turned into a model,
//     thoughts turned into a map of how they relate, a summary, a comparison. That takes reasoning: it goes to the
//     intelligence layer, the original is kept as it is, and what is made is tied to it as derived from it.
// Pure: no I/O.

import { VIEWS, VIEW_WORD, isModelKind, type ItemOf, type RepItem } from '../representation';
import type { TableColumn } from '../primitives';

export interface ViewOption {
  as: string;
  /** how it is offered: "As a plot" */
  label: string;
  x?: string;
  y?: string;
}

const numeric = (c: TableColumn) => c.kind === 'number' || c.kind === 'formula';

/** For a table: its number columns, and its first column of words (labels for bars). */
export function columnsOf(it: ItemOf<'matrix'>): { numbers: TableColumn[]; label?: TableColumn } {
  if (it.prim.type !== 'table') return { numbers: [] };
  const cols = it.prim.data.columns;
  return { numbers: cols.filter(numeric), label: cols.find((c) => c.kind === 'text') };
}

/** Whether an equation is a function of x (so it can be drawn as a graph). */
export function isFunctionOfX(it: ItemOf<'equation'>): boolean {
  if (it.prim.type !== 'equation') return false;
  const d = it.prim.data;
  return d.params.includes('x') || (!d.params.length && /(^|[^A-Za-z_])x([^A-Za-z0-9_]|$)/.test(d.expr));
}

/** The ways this item can be shown, given what it holds; its current way first. Nothing for a kind with one way. */
export function viewsFor(it: RepItem): ViewOption[] {
  const all = VIEWS[it.kind];
  if (!all) return [];
  const out: ViewOption[] = [];
  const offer = (as: string, extra: Partial<ViewOption> = {}) => out.push({ as, label: `As ${VIEW_WORD[as] ?? as}`, ...extra });
  switch (it.kind) {
    case 'matrix': {
      const { numbers, label } = columnsOf(it);
      offer('table');
      if (numbers.length >= 2) offer('plot', { x: numbers[0].id, y: numbers[1].id });
      if (numbers.length >= 1 && (label || it.prim.type === 'table')) offer('bars', { y: numbers[0].id, ...(label ? { x: label.id } : {}) });
      if (numbers.length >= 1) offer('metrics');
      break;
    }
    case 'plot':
      offer('plot');
      if (it.prim.type === 'plot' && it.prim.data.series.some((s) => s.kind === 'fn')) offer('table');
      break;
    case 'equation':
      offer('equation');
      if (isFunctionOfX(it)) offer('plot');
      break;
    default:
      for (const v of all) offer(v);
  }
  return out.length > 1 ? out : [];
}

/** The view to show an item as, if it can be shown that way (by name: "plot", "graph", "chart", "timeline"…). */
export function viewNamed(it: RepItem, word: string): ViewOption | null {
  const w = word.toLowerCase().trim();
  const as =
    /^(plot|graph|line|line chart|curve|scatter|chart)$/.test(w) ? 'plot'
    : /^(bars?|bar chart|bar graph|histogram)$/.test(w) ? 'bars'
    : /^(table|grid|spreadsheet|values|data)$/.test(w) ? 'table'
    : /^(metrics?|measures?|numbers|summary|totals|stats|statistics)$/.test(w) ? 'metrics'
    : /^(timeline|chronology|time ?line)$/.test(w) ? 'timeline'
    : /^(steps|list|sequence|procedure)$/.test(w) ? 'steps'
    : /^(equation|formula)$/.test(w) ? 'equation'
    : /^(slider)$/.test(w) ? 'slider'
    : /^(number|input|field)$/.test(w) ? 'number'
    : '';
  if (!as) return null;
  // a chart of one number column is bars; of two, a plot
  const options = viewsFor(it);
  const exact = options.find((o) => o.as === as);
  if (exact) return exact;
  if (as === 'plot') return options.find((o) => o.as === 'bars') ?? null;
  return null;
}

/** Analytical transformations offered for what is selected: each is a question to the intelligence layer. */
export function analyticalFor(items: readonly RepItem[]): { label: string; ask: string }[] {
  if (!items.length) return [];
  const words = items.filter((i) => !isModelKind(i.kind));
  const out: { label: string; ask: string }[] = [];
  const names = (xs: readonly RepItem[]) => xs.map((x) => `“${x.text}”`).join(', ');
  if (words.length && words.some((w) => /\d/.test(w.text))) out.push({ label: 'Make a model of it', ask: `Turn the quantities in ${names(words)} into an interactive model: variables for the inputs and equations for what follows from them. Keep the originals and mark what you make as derived from them.` });
  if (words.length >= 3) out.push({ label: 'Map how these relate', ask: `Show how ${names(words)} relate to each other: connect them, saying for each connection whether it is established or only possible. Change nothing else.` });
  if (items.length === 2) out.push({ label: 'Compare them', ask: `Compare ${names(items)}: what is the same, what differs, and what that means. Keep both as they are.` });
  if (words.length >= 2) out.push({ label: 'Summarise them', ask: `Summarise ${names(words)} in one statement, marked as derived from them. Keep the originals.` });
  return out;
}
