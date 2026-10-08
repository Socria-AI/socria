// A MATRIX, as an object of thought.
//
// The state is the entries, exactly (lib/objects/rational.ts). The operations
// are the three elementary row operations — every one of them reversible,
// which is why they preserve what elimination is for — computed here and
// nowhere else:
//
//   swap   R_i ↔ R_j
//   scale  R_i ← k·R_i              k ≠ 0
//   comb   R_i ← a·R_i + b·R_j      a ≠ 0, i ≠ j   (a = 1 is the textbook R_i ← R_i + b·R_j)
//
// What the computation can say about a step is said as a fact about the
// entries, and when the person's step did not do what it seems to have been
// for, as a question pointing at the entry — never as the right operation.
//
// PURE.

import { register, type ObjectKind, type Part } from './core';
import { add, div, eq, isZero, mul, neg, parseQ, q, safe, say, show, tex as qtex, ZERO, ONE, type Q } from './rational';
import { analysisFacts } from './matrix-analysis';

export interface MatrixState {
  /** entries as exact rational text, rows first */
  rows: string[][];
  /** the last column is a right-hand side (an augmented matrix) */
  aug?: boolean;
}

export const MAX_DIM = 8;

const grid = (s: MatrixState): Q[][] => s.rows.map((r) => r.map((v) => parseQ(v) ?? ZERO));
const pack = (m: Q[][], aug?: boolean): MatrixState => ({ rows: m.map((r) => r.map(show)), ...(aug ? { aug } : {}) });

export function sanitizeMatrix(raw: unknown): MatrixState | null {
  const src = Array.isArray(raw) ? raw : (raw as { rows?: unknown })?.rows;
  if (!Array.isArray(src) || src.length < 1 || src.length > MAX_DIM) return null;
  const rows: string[][] = [];
  for (const r of src) {
    if (!Array.isArray(r) || r.length < 1 || r.length > MAX_DIM) return null;
    const row: string[] = [];
    for (const v of r) {
      const x = parseQ(v);
      if (!x || !safe(x)) return null;
      row.push(show(x));
    }
    rows.push(row);
  }
  if (rows.some((r) => r.length !== rows[0].length)) return null;
  // one number is a number, not a matrix
  if (rows.length * rows[0].length < 2) return null;
  const aug = (raw as { aug?: unknown })?.aug === true && rows[0].length >= 2;
  return { rows, ...(aug ? { aug: true } : {}) };
}

const sameMatrix = (a: MatrixState, b: MatrixState) =>
  a.rows.length === b.rows.length && a.rows.every((r, i) => r.length === b.rows[i].length && r.every((v, j) => v === b.rows[i][j]));

/** First nonzero column of a row — its leading entry — or -1 for a zero row. */
export const lead = (row: Q[]): number => row.findIndex((v) => !isZero(v));

const ri = (args: Record<string, string | number>, k: string, n: number): number | null => {
  const v = Number(args[k]);
  return Number.isInteger(v) && v >= 1 && v <= n ? v - 1 : null;
};
const rq = (args: Record<string, string | number>, k: string): Q | null => (args[k] === undefined ? null : parseQ(args[k]));

/** "3R1", "−R1", "(1/2)R3" — a coefficient written the way it is read. */
function term(c: Q, row: number, first: boolean): string {
  const neg_ = c.n < 0;
  const mag = say({ n: Math.abs(c.n), d: c.d });
  const coef = mag === '1' ? '' : c.d === 1 ? mag : `(${mag})`;
  return `${first ? (neg_ ? '−' : '') : neg_ ? ' − ' : ' + '}${coef}R${row}`;
}

export function sayOp(op: string, args: Record<string, string | number>): string {
  const i = Number(args.i), j = Number(args.j);
  if (op === 'swap') return `R${i} ↔ R${j}`;
  if (op === 'scale') return `R${i} ← ${term(parseQ(args.k) ?? ONE, i, true)}`;
  const a = parseQ(args.a ?? 1) ?? ONE;
  const b = parseQ(args.b) ?? ONE;
  return `R${i} ← ${term(a, i, true)}${term(b, j, false)}`;
}

// ── reading an operation out of words ───────────────────────────────

const ROW = String.raw`(?:r(?:ow)?\s*_?\s*\{?\s*(\d)\s*\}?)`;
const NUM = String.raw`(?:\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|\(\s*-?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?\s*\))`;

/** Linear terms in rows: "R2 - 3R1", "2R2 + (1/2) R1", "R3/2". Null unless every token is a term. */
function readTerms(expr: string, trailing = false): { row: number; c: Q }[] | null {
  const s = expr.replace(/\s+/g, ' ').trim();
  const re = new RegExp(String.raw`^\s*([+-])?\s*(${NUM})?\s*\*?\s*${ROW}\s*(?:\/\s*(${NUM}))?`, 'i');
  const out: { row: number; c: Q }[] = [];
  let rest = s;
  while (rest.trim()) {
    const m = re.exec(rest);
    // "R2 ← R2 − 3R1 should clear it": words after the last term end it
    if (!m) return trailing && out.length && /^\s*[a-z]{2,}/i.test(rest) ? out : null;
    let c = m[2] ? parseQ(m[2].replace(/[()\s]/g, '')) : ONE;
    if (!c) return null;
    if (m[4]) {
      const d = parseQ(m[4].replace(/[()\s]/g, ''));
      if (!d || isZero(d)) return null;
      c = div(c, d);
    }
    if (m[1] === '-') c = neg(c);
    out.push({ row: Number(m[3]), c });
    rest = rest.slice(m[0].length);
    if (out.length > 2) return null;
  }
  return out.length ? out : null;
}

export function readMatrixOp(text: string, state: MatrixState): { op: string; args: Record<string, string | number> } | null {
  if (typeof text !== 'string' || text.length > 200) return null;
  let s = text
    .replace(/[−–—]/g, '-')
    .replace(/\\leftrightarrow/g, '↔')
    .replace(/\\leftarrow|\\gets/g, '←')
    .replace(/\\to|\\rightarrow/g, '→')
    .replace(/_\{(\d)\}/g, '_$1')
    .replace(/[↔⟷]|<->|<=>/g, ' <~> ')
    .replace(/[⟵←]|<-{1,2}|:=/g, ' <- ')
    .replace(/[⟶→]|-{1,2}>/g, ' -> ')
    .replace(/[·×]/g, '*')
    .replace(/\\(?:left|right)/g, '')
    .replace(/\$/g, '')
    .trim();
  // A question or a refusal is about an operation, not a request to do one.
  if (/\?\s*$/.test(s) || /\b(don'?t|do not|not|never|shouldn'?t|wouldn'?t|won'?t|can'?t|isn'?t|instead of)\b/i.test(s)) return null;
  s = s.replace(/[.!]+\s*$/, '');
  const n = state.rows.length;
  const ok = (r: number) => r >= 1 && r <= n;

  let m = new RegExp(String.raw`${ROW}\s*<~>\s*${ROW}`, 'i').exec(s) ?? new RegExp(String.raw`\b(?:swap|exchange|interchange)\s+(?:rows?\s*)?${ROW}\s*(?:and|&|,|with)\s*${ROW}`, 'i').exec(s);
  if (!m) m = /\b(?:swap|exchange|interchange)\s+rows?\s*(\d)\s*(?:and|&|,|with)\s*(\d)\b/i.exec(s);
  if (m) {
    const i = Number(m[1]), j = Number(m[2]);
    return ok(i) && ok(j) && i !== j ? { op: 'swap', args: { i, j } } : null;
  }

  m = new RegExp(String.raw`\b(multiply|divide)\s+${ROW}\s+by\s+(-?\s*${NUM})`, 'i').exec(s);
  if (m) {
    let k = parseQ(m[3].replace(/[()\s]/g, ''));
    const i = Number(m[2]);
    if (!k || !ok(i)) return null;
    // multiplying by 0 is read as what it is and REFUSED with the reason, not
    // ignored: the reason is the thing worth learning
    if (m[1].toLowerCase() === 'divide') {
      if (isZero(k)) return null;
      k = div(ONE, k);
    }
    return { op: 'scale', args: { i, k: show(k) } };
  }

  // assignment, either way round: "R2 <- R2 - 3R1", "R2 = R2 - 3R1", "R2 - 3R1 -> R2"
  let target: number | null = null;
  let expr: string | null = null;
  let trailing = false;
  m = new RegExp(String.raw`(?<![a-z0-9])${ROW}\s*(?:<-|=|->)\s*([^=<>]+)$`, 'i').exec(s);
  const single = (e: string) => new RegExp(String.raw`^\s*${ROW}\s*$`, 'i').test(e);
  const arrowRight = !!m && /->/.test(m[0].slice(0, m[0].indexOf(m[2])));
  if (m && !(arrowRight && single(m[2]))) {
    // "R2 ← R2 − 3R1", "R2 = R2 − 3R1", and "R3 → R3 − 5R1" (the row, becoming)
    target = Number(m[1]);
    expr = m[2];
    trailing = true;
  } else {
    // "R2 − 3R1 → R2" (the combination, going into the row)
    m = new RegExp(String.raw`([^=<>]+?)\s*->\s*${ROW}\s*$`, 'i').exec(s);
    if (m) {
      const at = m[1].search(new RegExp(String.raw`[-+(]?\s*(?:${NUM}\s*\*?\s*)?r(?:ow)?\s*_?\s*\{?\d`, 'i'));
      expr = at >= 0 ? m[1].slice(at) : m[1];
      target = Number(m[2]);
      if (single(expr) && Number(new RegExp(ROW, 'i').exec(expr)?.[1]) !== target) return null;
    }
  }
  if (target === null) {
    // a bare expression is an operation only when it is the whole message:
    // "R2 - 3R1", "let's do R2 - 3R1", "try R3 - 5R1"
    m = /^(?:let'?s\s+(?:do|try)\s+|i'?(?:d|ll)\s+(?:do|try)\s+|try\s+|do\s+|then\s+)?(.+)$/i.exec(s);
    const terms = m ? readTerms(m[1]) : null;
    if (!terms || terms.length !== 2 || !eq(terms[0].c, ONE)) return null;
    target = terms[0].row;
    expr = m![1];
  }
  const terms = expr ? readTerms(expr, trailing) : null;
  if (!terms || !ok(target)) return null;
  const self = terms.filter((t) => t.row === target);
  const other = terms.filter((t) => t.row !== target);
  if (self.length > 1 || other.length > 1) return null;
  if (!other.length) {
    if (!self.length) return null;
    return { op: 'scale', args: { i: target, k: show(self[0].c) } };
  }
  if (!ok(other[0].row)) return null;
  return {
    op: 'comb',
    args: { i: target, a: show(self[0]?.c ?? ZERO), j: other[0].row, b: show(other[0].c) },
  };
}

// ── finding a matrix in what someone wrote ───────────────────────────

export interface FoundMatrix {
  name?: string;
  rows: string[][];
  aug?: boolean;
  /** where in the text it was, so a caller can tell one from another */
  index: number;
}

const NUM_TOKEN = /^[-+−]?\d+(?:\.\d+)?(?:\/\d+)?$/;
const cellsOf = (row: string): string[] | null => {
  const cells = row.trim().split(/\s*[,&]\s*|\s+/).filter(Boolean);
  return cells.length && cells.every((c) => NUM_TOKEN.test(c)) ? cells.map((c) => c.replace('−', '-')) : null;
};

/**
 * Matrices written in a message: LaTeX (bmatrix/pmatrix/…, with a | for an
 * augmented one), nested brackets [[1,2],[3,4]], semicolon rows [1 2; 3 4],
 * or one bracketed row per line. Each is checked as a matrix; anything that
 * is not plainly rows of numbers is left as words.
 */
export function findMatrices(text: string): FoundMatrix[] {
  if (typeof text !== 'string') return [];
  const out: FoundMatrix[] = [];
  const nameBefore = (at: number): string | undefined => {
    const m = /([A-Z])\s*=\s*$/.exec(text.slice(Math.max(0, at - 6), at));
    return m?.[1];
  };
  const push = (rows: string[][] | null, index: number, aug?: boolean) => {
    if (!rows || rows.length < 2 || rows.some((r) => r.length !== rows[0].length) || rows[0].length < 2) return;
    const st = sanitizeMatrix({ rows, aug });
    if (!st || out.some((o) => o.index === index)) return;
    out.push({ name: nameBefore(index), rows: st.rows, ...(st.aug ? { aug: true } : {}), index });
  };

  for (const m of text.matchAll(/\\begin\{([pbBvV]?matrix|array)\}(\{[^}]*\})?([\s\S]*?)\\end\{\1\}/g)) {
    const aug = !!m[2] && m[2].includes('|');
    const rows = m[3].split(/\\\\/).map((r) => r.trim()).filter(Boolean).map((r) => cellsOf(r.replace(/\\hline|\\,/g, '')));
    push(rows.every(Boolean) ? (rows as string[][]) : null, m.index ?? 0, aug);
  }
  for (const m of text.matchAll(/\[\s*(\[[^\[\]]+\](?:\s*,?\s*\[[^\[\]]+\])+)\s*\]/g)) {
    const rows = [...m[1].matchAll(/\[([^\[\]]+)\]/g)].map((r) => cellsOf(r[1]));
    push(rows.every(Boolean) ? (rows as string[][]) : null, m.index ?? 0);
  }
  for (const m of text.matchAll(/\[([^\[\]\n]*;[^\[\]\n]*)\]/g)) {
    const parts = m[1].split(';');
    const bar = parts.every((p) => p.includes('|'));
    const rows = parts.map((r) => cellsOf(r.replace('|', ' ')));
    push(rows.every(Boolean) ? (rows as string[][]) : null, m.index ?? 0, bar);
  }
  // one bracketed row per line (or several on one line): [1 3 5 7] [3 5 7 9] …
  const runs = /(?:\[\s*[-+−\d.\/\s,|]+\]\s*){2,}/g;
  for (const m of text.matchAll(runs)) {
    if (out.some((o) => Math.abs(o.index - (m.index ?? 0)) < 4)) continue;
    const pieces = [...m[0].matchAll(/\[([^\]]+)\]/g)].map((r) => r[1]);
    const bar = pieces.every((p) => p.includes('|'));
    const rows = pieces.map((r) => cellsOf(r.replace('|', ' ')));
    push(rows.every(Boolean) ? (rows as string[][]) : null, m.index ?? 0, bar);
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Where a matrix someone wrote differs from a state: the cells, 1-based. */
export function diffCells(a: MatrixState, b: MatrixState): { r: number; c: number; was: string; is: string }[] | null {
  if (a.rows.length !== b.rows.length || a.rows[0].length !== b.rows[0].length) return null;
  const out: { r: number; c: number; was: string; is: string }[] = [];
  a.rows.forEach((row, i) => row.forEach((v, j) => {
    if (v !== b.rows[i][j]) out.push({ r: i + 1, c: j + 1, was: v, is: b.rows[i][j] });
  }));
  return out;
}

// ── what the computation can say ─────────────────────────────────────

/** Row echelon form: each leading entry right of the one above, zero rows last. */
export function echelon(m: Q[][]): boolean {
  let last = -1;
  let zero = false;
  for (const r of m) {
    const l = lead(r);
    if (l === -1) {
      zero = true;
      continue;
    }
    if (zero || l <= last) return false;
    last = l;
  }
  return true;
}

export function reduced(m: Q[][]): boolean {
  if (!echelon(m)) return false;
  return m.every((r, i) => {
    const l = lead(r);
    if (l === -1) return true;
    return eq(r[l], ONE) && m.every((o, k) => k === i || isZero(o[l]));
  });
}

/** Nonzero entries still beneath a row's leading entry — what elimination has left to do. */
export function beneath(m: Q[][]): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = [];
  const seen = new Set<number>();
  m.forEach((row, i) => {
    const l = lead(row);
    if (l === -1 || seen.has(l)) return;
    seen.add(l);
    for (let k = i + 1; k < m.length; k++) if (!isZero(m[k][l]) && lead(m[k]) === l) out.push({ r: k + 1, c: l + 1 });
  });
  return out;
}

function consequence(before: MatrixState, after: MatrixState, step: { op: string; args: Record<string, string | number> }): string | null {
  const B = grid(before), A = grid(after);
  const i = Number(step.args.i) - 1;
  if (step.op === 'swap') return `Rows ${i + 1} and ${step.args.j} exchanged places.`;
  if (step.op === 'scale') {
    const l = lead(A[i]);
    return `Row ${i + 1} was multiplied by ${say(parseQ(step.args.k) ?? ONE)}${l >= 0 && eq(A[i][l], ONE) && !eq(B[i][l], ONE) ? ' — it now leads with 1' : ''}.`;
  }
  const j = Number(step.args.j) - 1;
  if (A[i].every(isZero)) return `Row ${i + 1} is now all zeros.`;
  const c = lead(B[j]);
  if (c === -1) return `R${j + 1} is all zeros, so adding it changed nothing but the scale of R${i + 1}.`;
  const was = B[i][c], is = A[i][c];
  const at = `(${i + 1}, ${c + 1})`;
  if (!isZero(was) && isZero(is)) return `Entry ${at} is now 0.`;
  if (!isZero(was) && !isZero(is)) {
    // perhaps the step was for a different entry — say what it did do
    const cleared = B[i].findIndex((v, k) => !isZero(v) && isZero(A[i][k]));
    if (cleared >= 0) return `Entry (${i + 1}, ${cleared + 1}) is now 0.`;
    return `Entry ${at} was ${say(was)} and is now ${say(is)}, not 0. What multiple of R${j + 1} would make it vanish?`;
  }
  if (isZero(was) && !isZero(is)) return `Entry ${at} was 0 and is now ${say(is)} — this step put a nonzero back beneath R${j + 1}'s leading entry.`;
  return `Row ${i + 1} changed.`;
}

function check(state: MatrixState, op: string, args: Record<string, string | number>): string | null {
  const n = state.rows.length;
  const i = ri(args, 'i', n);
  if (i === null) return `There is no row ${args.i} — this matrix has ${n} rows.`;
  if (op === 'swap') {
    const j = ri(args, 'j', n);
    if (j === null) return `There is no row ${args.j} — this matrix has ${n} rows.`;
    if (i === j) return 'Swapping a row with itself changes nothing.';
    return null;
  }
  if (op === 'scale') {
    const k = rq(args, 'k');
    if (!k) return 'That multiplier is not a number I can use.';
    if (isZero(k)) return `Multiplying R${i + 1} by 0 would erase it — a row operation has to be undoable, so the multiplier cannot be 0.`;
    if (eq(k, ONE)) return 'Multiplying by 1 leaves the row as it was.';
    return null;
  }
  if (op === 'comb') {
    const j = ri(args, 'j', n);
    if (j === null) return `There is no row ${args.j} — this matrix has ${n} rows.`;
    if (i === j) return `R${i + 1} ← R${i + 1} + k·R${i + 1} only rescales the row; to scale it, write R${i + 1} ← k·R${i + 1}.`;
    const a = rq(args, 'a') ?? ONE, b = rq(args, 'b');
    if (!b) return 'That multiple is not a number I can use.';
    if (isZero(a)) return `Replacing R${i + 1} by a multiple of R${j + 1} throws R${i + 1} away and cannot be undone — keep R${i + 1} in it: R${i + 1} ← R${i + 1} + k·R${j + 1}.`;
    if (isZero(b)) return 'Adding 0 of another row leaves this one as it was.';
    return null;
  }
  return 'A matrix cannot do that.';
}

function run(state: MatrixState, op: string, args: Record<string, string | number>): MatrixState {
  const m = grid(state);
  const i = Number(args.i) - 1;
  let out = m.map((r) => [...r]);
  if (op === 'swap') {
    const j = Number(args.j) - 1;
    [out[i], out[j]] = [out[j], out[i]];
  } else if (op === 'scale') {
    const k = parseQ(args.k)!;
    out[i] = m[i].map((v) => mul(k, v));
  } else {
    const j = Number(args.j) - 1;
    const a = parseQ(args.a ?? 1) ?? ONE, b = parseQ(args.b)!;
    out[i] = m[i].map((v, c) => add(mul(a, v), mul(b, m[j][c])));
  }
  if (out.some((r) => r.some((v) => !safe(v)))) throw new Error('The numbers have grown too large to keep exact. Try scaling a row down first.');
  out = out.map((r) => r.map((v) => (isZero(v) ? ZERO : v)));
  return pack(out, state.aug);
}

const opDef = (op: string, label: string) => ({
  label,
  check: (s: MatrixState, a: Record<string, string | number>) => check(s, op, a),
  apply: (s: MatrixState, a: Record<string, string | number>) => run(s, op, a),
  say: (a: Record<string, string | number>) => sayOp(op, a),
});

export function matrixTeX(s: MatrixState): string {
  const cols = s.rows[0].length;
  const spec = s.aug ? `{${'c'.repeat(cols - 1)}|c}` : '';
  const body = s.rows.map((r) => r.map((v) => qtex(parseQ(v) ?? ZERO)).join(' & ')).join(' \\\\ ');
  return s.aug ? `\\left[\\begin{array}${spec} ${body} \\end{array}\\right]` : `\\begin{bmatrix} ${body} \\end{bmatrix}`;
}

/** The rows read as linear equations: x₁ + 3x₂ + 5x₃ = 7 (augmented), or … = 0. */
export function equationsOf(s: MatrixState): string[] {
  const m = grid(s);
  const k = s.aug ? m[0].length - 1 : m[0].length;
  return m.map((r) => {
    const parts: string[] = [];
    for (let c = 0; c < k; c++) {
      const v = r[c];
      if (isZero(v)) continue;
      const mag = qtex({ n: Math.abs(v.n), d: v.d });
      parts.push(`${v.n < 0 ? (parts.length ? ' - ' : '-') : parts.length ? ' + ' : ''}${mag === '1' ? '' : mag}x_{${c + 1}}`);
    }
    return `${parts.join('') || '0'} = ${s.aug ? qtex(r[k]) : '0'}`;
  });
}

const width = (s: MatrixState) => Math.max(...s.rows.flat().map((v) => v.length));

export const MATRIX: ObjectKind<MatrixState> = {
  kind: 'matrix',
  label: 'Matrix',
  sanitize: sanitizeMatrix,
  same: sameMatrix,
  ops: {
    swap: opDef('swap', 'Swap two rows'),
    scale: opDef('scale', 'Scale a row'),
    comb: opDef('comb', 'Add a multiple of another row'),
  },
  readOp: readMatrixOp,
  consequence,
  facts(s, { guarded }) {
    const m = grid(s);
    const leads = m.map((r, i) => {
      const l = lead(r);
      return l === -1 ? `R${i + 1}: all zeros` : `R${i + 1}: leading entry ${say(r[l])} in column ${l + 1}`;
    });
    const out = [leads.join('; ')];
    const left = beneath(m);
    if (echelon(m)) {
      out.push(reduced(m) ? 'It is in reduced row echelon form.' : 'It is in row echelon form.');
      if (!guarded) out.push(`Rank ${m.filter((r) => lead(r) >= 0).length}.`);
    } else if (left.length) {
      out.push(
        `${guarded ? 'For you to ask about, not to state: ' : ''}nonzero beneath a leading entry at ${left.map((p) => `(${p.r}, ${p.c})`).join(', ')}.`
      );
    } else {
      out.push('Not yet in row echelon form — some row leads further left than the one above it.');
    }
    // WHAT IT IS, computed — but not while someone is working it out by hand: the steps are theirs
    if (!guarded) out.push(...analysisFacts(s));
    return out;
  },
  text: (s) => s.rows.map((r) => `[ ${r.map((v) => v.padStart(width(s))).join('  ')} ]`).join('\n'),
  parts(s) {
    const parts: Part[] = s.rows.map((_, i) => ({ id: `r${i + 1}`, label: `Row ${i + 1}` }));
    s.rows[0].forEach((_, j) => parts.push({ id: `c${j + 1}`, label: `Column ${j + 1}` }));
    s.rows.forEach((r, i) => r.forEach((_, j) => parts.push({ id: `e${i + 1}.${j + 1}`, label: `Entry (${i + 1}, ${j + 1})` })));
    return parts;
  },
  partFacts(s, part) {
    const m = grid(s);
    let p = /^r(\d+)$/.exec(part);
    if (p) {
      const r = m[Number(p[1]) - 1];
      if (!r) return null;
      const l = lead(r);
      return [`Row ${p[1]}: [ ${r.map(say).join('  ')} ]`, l === -1 ? 'all zeros' : `leading entry ${say(r[l])}, in column ${l + 1}`];
    }
    p = /^c(\d+)$/.exec(part);
    if (p) {
      const c = Number(p[1]) - 1;
      if (c >= m[0].length) return null;
      return [`Column ${p[1]}: ${m.map((r) => say(r[c])).join(', ')} (top to bottom)`, ...(s.aug && c === m[0].length - 1 ? ['the right-hand side'] : [])];
    }
    p = /^e(\d+)\.(\d+)$/.exec(part);
    if (p) {
      const r = Number(p[1]) - 1, c = Number(p[2]) - 1;
      const v = m[r]?.[c];
      if (!v) return null;
      const l = lead(m[r]);
      return [
        `Entry (${p[1]}, ${p[2]}) = ${say(v)}`,
        l === c ? `it is row ${p[1]}'s leading entry` : l >= 0 && l < c ? `row ${p[1]} leads in column ${l + 1}, to its left` : isZero(v) ? 'zero' : 'left of the row’s leading entry is impossible; this one is nonzero',
      ];
    }
    return null;
  },
  views: [
    {
      id: 'grid',
      label: 'Matrix',
      shows: 'the entries themselves, and what each row operation does to them',
      primary: true,
      interactions: ['select a row, a column or an entry', 'apply a row operation', 'step back and forward through the states'],
    },
    {
      id: 'equations',
      label: 'As equations',
      shows: 'the same rows read as linear equations — each row operation is an equation operation',
      interactions: ['select an equation'],
      unavailable: (s) => (s.rows[0].length < 2 ? 'a single column is a vector, not a system' : null),
    },
    {
      id: 'analysis',
      label: 'What it is',
      shows: 'its rank and four subspaces with their bases, A = CR, the determinant, eigenvalues and singular values, and what Ax = b has — computed from the entries',
      interactions: ['read it beside the elimination'],
    },
    {
      id: 'plane',
      label: 'On the plane',
      shows: 'what the matrix does to the plane: the grid and basis vectors moving',
      interactions: ['play the transformation'],
      unavailable: (s) => (s.rows.length === 2 && s.rows[0].length === 2 ? null : `a ${s.rows.length} × ${s.rows[0].length} matrix does not act on the plane; that picture is for 2 × 2`),
    },
  ],
  size(s, mode) {
    const cw = Math.max(34, width(s) * 8.5 + 22);
    const cols = s.rows[0].length, n = s.rows.length;
    // as drawn: head, the bracketed grid, the step and what it showed, the operation line, the steps
    if (mode === 'live') return { w: Math.max(320, Math.round(cols * cw + 110)), h: Math.round(n * 43 + 250) };
    if (mode === 'trail') return { w: Math.round(cols * cw * 0.74 + 40), h: Math.round(n * 27 + 50) };
    return { w: 168, h: Math.min(n, 4) * 17 + 46 };
  },
  shape: (s) => `${s.rows.length} × ${s.rows[0].length}${s.aug ? ' augmented' : ''} matrix`,
};

register(MATRIX);

export { q };
