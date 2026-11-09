// lib/logos5/canvas.ts — A LINE OF THINKING, ZOOMED OUT.
//
// The conversation and what it made are one thing at two distances. Close in,
// it is the chat; pulled back, it is a canvas: the turns down the middle as a
// spine, and beside each turn what that turn made — the live elements in its
// reply, the notes it wrote, the practice it set — with the Logic Map beside
// the turns that drew it. This file is the reading of a conversation into
// that canvas, kept pure so it can be tested; components/logos5/L5Canvas.tsx
// draws it.

import { parseBlocks } from '@/lib/rich-text';
import { scanMath, unescapeDollars } from '@/lib/tex-split';
import type { InlineSpec } from '@/lib/inline-ui';

export interface CanvasMsg {
  id?: string;
  role: string;
  content?: unknown;
  synthesis?: unknown;
  ui?: Record<string, { artifact?: string } | undefined>;
}

/** One exchange: what they asked, and the gist of what Socria said back. */
export interface CanvasTurn {
  key: string;
  /** 0-based, in the order the turns happened */
  index: number;
  askedId?: string;
  replyId?: string;
  /** where its question and its reply are in the conversation (a message not yet saved has no id) */
  askedAt?: number;
  replyAt?: number;
  asked: string;
  said: string;
  /** the question the reply ends on, when it ends on one — what a folded turn shows (Logos 5.5, the page) */
  asks?: string;
  /** Socria is still writing this turn's reply */
  pending?: boolean;
  /** a synthesis — where the thinking stands — rather than a reply */
  synthesis?: boolean;
}

/** What the canvas can be narrowed to: everything, the ideas, what was made (practice with it), or just the chat. */
export type CanvasFilter = 'all' | 'ideas' | 'made' | 'chats';
export type CanvasLane = 'ideas' | 'made' | 'practice';

/** An element a reply drew, placed beside the turn that drew it. */
export interface CanvasElement {
  key: string;
  turn: number;
  replyId: string;
  /** its position among the reply's elements — the key its state is kept under */
  n: number;
  spec: InlineSpec;
  lane: Exclude<CanvasLane, 'ideas'>;
  title: string;
  /** the artifact it was kept as, when it was */
  kept?: string;
}

/** The ways onward and the choices to tap belong to the moment; they are not things made. */
const NOT_MADE = new Set(['paths', 'options']);

/** TeX's names for what a line of type can show as itself. */
const TEX_SYMBOL: Record<string, string> = {
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  approx: '≈', equiv: '≡', sim: '~', propto: '∝', infty: '∞', to: '→', rightarrow: '→', leftarrow: '←',
  Rightarrow: '⇒', implies: '⇒', iff: '⇔', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩',
  sum: 'Σ', prod: 'Π', int: '∫', partial: '∂', nabla: '∇', forall: '∀', exists: '∃', degree: '°', circ: '°',
  ldots: '…', cdots: '…', dots: '…', quad: ' ', qquad: ' ',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ',
  pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω', Pi: 'Π',
};
const SUPER: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', n: 'ⁿ', '-': '⁻' };
/** A fraction's part, bracketed when it is more than one term. */
const part = (x: string) => (/^[\w.·√]+$/.test(x.trim()) ? x.trim() : `(${x.trim()})`);

/** TeX as a line of type reads it: \frac{a}{b} as a/b, \sqrt{x} as √x, x^2 as x², \pi as π. */
export function readTex(tex: string): string {
  let s = tex;
  // innermost first, so a fraction inside a root reads too
  for (let i = 0; i < 6; i++) {
    const before = s;
    s = s
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, a: string, b: string) => `${part(a)}/${part(b)}`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_m, a: string) => `√${part(a)}`)
      .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|textbf|textit|mathbb)\s*\{([^{}]*)\}/g, '$1');
    if (s === before) break;
  }
  return s
    // an escaped character is that character: \$6 is six dollars, \% a percent sign
    .replace(/\\([$%&#_])/g, '$1')
    // p^* is "p star", written as type
    .replace(/\^\{?\*\}?/g, '*')
    .replace(/\\(?:left|right|big|Big|bigg|Bigg)\b\s*/g, '')
    .replace(/\\([A-Za-z]+)/g, (m, name: string) => TEX_SYMBOL[name] ?? (/^(sin|cos|tan|log|ln|exp|lim|max|min)$/.test(name) ? name : ''))
    .replace(/\^\{([0-9n-]{1,3})\}|\^([0-9n])/g, (m, a?: string, b?: string) => {
      const sup = (a ?? b ?? '').split('').map((c) => SUPER[c]);
      return sup.every(Boolean) ? sup.join('') : m;
    })
    .replace(/\\[,;:!]/g, ' ')
    .replace(/\\\\/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s*([=<>≤≥≠≈])\s*/g, ' $1 ');
}

/** Text as it reads: no fenced blocks, no marks, TeX as type, one line. */
export function plainText(content: unknown): string {
  const s = typeof content === 'string' ? content : '';
  // the shape of the lines first — fences, headings, bullets, quotations — on the whole text
  const lines = s
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '');
  // then the mathematics as type and the prose without its marks — never the other way round:
  // the marks taken out of a formula left $p^*$ as "p^" and $x_1$ as "x1" (lib/tex-split.ts finds the spans)
  return scanMath(lines)
    .map((g) =>
      g.kind === 'text'
        ? unescapeDollars(g.body)
            .replace(/\\[A-Za-z]+(?:\{[^{}]*\})*/g, (m) => readTex(m))
            .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, '$1$2')
            .replace(/[*`~]/g, '')
        : ` ${readTex(g.body)} `
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first words of a text, cut at a word, never mid-sentence without saying so. */
export function excerpt(content: unknown, max = 180): string {
  const t = plainText(content);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sentence = cut.match(/^[\s\S]*[.!?](?=\s)/)?.[0];
  if (sentence && sentence.length > max * 0.55) return sentence;
  return `${cut.slice(0, cut.lastIndexOf(' ') > max * 0.6 ? cut.lastIndexOf(' ') : max).trimEnd()}…`;
}

/**
 * The question a reply ends on: its last sentence, when that sentence asks
 * something — "If 1 to 3 is cut into 4 equal pieces, how wide is each one?".
 * Empty when the reply does not end on a question.
 */
export function closingAsk(content: unknown, max = 160): string {
  const t = plainText(content).trim();
  if (!t.endsWith('?')) return '';
  const m = /([^.!?…\n]*\?)["'’”)\]]*\s*$/.exec(t);
  const q = (m?.[1] ?? '').trim().replace(/^[—–-]\s*/, '');
  if (!q) return '';
  return q.length > max ? `${q.slice(0, max).replace(/\s+\S*$/, '')}…` : q;
}

/** The conversation as turns: a question and its reply, in order. Synthesis is a turn of its own. */
export function canvasTurns(messages: readonly CanvasMsg[], opts: { pending?: boolean } = {}): CanvasTurn[] {
  const turns: CanvasTurn[] = [];
  let open: CanvasTurn | null = null;
  const start = (t: Omit<CanvasTurn, 'key' | 'index'>) => {
    const turn: CanvasTurn = { ...t, index: turns.length, key: `t${turns.length}:${t.askedId ?? t.replyId ?? turns.length}` };
    turns.push(turn);
    return turn;
  };
  messages.forEach((m, at) => {
    if (m.synthesis) {
      start({ asked: '', said: 'Where your thinking stands', replyId: m.id, replyAt: at, synthesis: true });
      open = null;
      return;
    }
    if (m.role === 'user') {
      open = start({ asked: excerpt(m.content, 140), said: '', askedId: m.id, askedAt: at });
      return;
    }
    if (m.role !== 'assistant') return;
    const said = excerpt(m.content, 200);
    const asks = closingAsk(m.content);
    if (open && open.replyAt === undefined) {
      open.replyId = m.id;
      open.replyAt = at;
      open.said = said;
      if (asks) open.asks = asks;
    } else start({ asked: '', said, replyId: m.id, replyAt: at, ...(asks ? { asks } : {}) });
    open = null;
  });
  // the turn still being answered
  const last = turns[turns.length - 1];
  if (opts.pending && last && last.replyAt === undefined && !last.synthesis) last.pending = true;
  return turns;
}

/** What a drawn element is called on the canvas: its own title, its claim, its question, or its kind. */
export function elementTitle(spec: InlineSpec): string {
  const s = spec as unknown as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const named = str(s.title) || str(s.claim) || str(s.subject) || str(s.prompt) || str(s.summary);
  if (named) return named.length > 80 ? `${named.slice(0, 77).trimEnd()}…` : named;
  if (spec.type === 'compare' && Array.isArray(s.options)) return (s.options as unknown[]).map(String).slice(0, 3).join(' vs ');
  if (spec.type === 'graph' && str(s.expr)) return `y = ${str(s.expr)}`;
  return ELEMENT_NOUN[spec.type] ?? 'Something drawn';
}

/** The kind of a drawn element, as a card names it: "Live graph", "Comparison". */
export const ELEMENT_NOUN: Partial<Record<InlineSpec['type'], string>> = {
  graph: 'Live graph',
  sim: 'Simulation',
  slider: 'Slider',
  chart: 'Chart',
  compare: 'Comparison',
  decide: 'Decision',
  claim: 'Claim',
  diagram: 'Diagram',
  concepts: 'Overview',
  sequence: 'Sequence',
  balance: 'Two sides',
  equation: 'Equation',
  steps: 'Working',
  reasoning: 'Reasoning',
  draft: 'Draft',
  check: 'Practice',
};

/** Every element the replies drew, beside the turn that drew it — practice in its own lane. */
export function canvasElements(messages: readonly CanvasMsg[], turns: readonly CanvasTurn[]): CanvasElement[] {
  const byReply = new Map<string, number>();
  for (const t of turns) if (t.replyId) byReply.set(t.replyId, t.index);
  const out: CanvasElement[] = [];
  for (const m of messages) {
    if (m.role !== 'assistant' || m.synthesis || !m.id || typeof m.content !== 'string') continue;
    const turn = byReply.get(m.id);
    if (turn === undefined) continue;
    for (const b of parseBlocks(m.content, { rich: true })) {
      if (b.kind !== 'ui' || !b.spec || NOT_MADE.has(b.spec.type)) continue;
      const kept = m.ui?.[String(b.n)]?.artifact;
      out.push({
        key: `e:${m.id}:${b.n}`,
        turn,
        replyId: m.id,
        n: b.n,
        spec: b.spec,
        lane: b.spec.type === 'check' ? 'practice' : 'made',
        title: elementTitle(b.spec),
        ...(kept ? { kept } : {}),
      });
    }
  }
  return out;
}

/**
 * Whether something in a lane shows under a filter. The turns always show: they are the spine.
 * Chats is the spine alone — what was said, nothing beside it; practice is something made.
 */
export function inFilter(lane: CanvasLane, filter: CanvasFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'chats') return false;
  if (filter === 'made') return lane === 'made' || lane === 'practice';
  return filter === lane;
}

/** Which turn a content entry came from: the turn whose question or reply its id names, else none. */
export function turnOfEntry(entryId: string, turns: readonly CanvasTurn[]): number | null {
  for (const t of turns) {
    if ((t.replyId && entryId.includes(t.replyId)) || (t.askedId && entryId.includes(t.askedId))) return t.index;
  }
  return null;
}

/**
 * Where a card sits beside its turn: ideas and reading on the left, what was
 * made and practice on the right — moved across when one side would hold
 * everything and the other nothing.
 */
export function sidesFor(cards: readonly { key: string; lane: CanvasLane; tone: string }[]): Record<string, 'l' | 'r'> {
  const side: Record<string, 'l' | 'r'> = {};
  for (const c of cards) side[c.key] = c.tone === 'map' || c.tone === 'content' ? 'l' : 'r';
  const left = cards.filter((c) => side[c.key] === 'l');
  const right = cards.filter((c) => side[c.key] === 'r');
  if (left.length === 0 && right.length > 1) for (const c of right.slice(Math.ceil(right.length / 2))) side[c.key] = 'l';
  if (right.length === 0 && left.length > 1) for (const c of left.slice(Math.ceil(left.length / 2))) side[c.key] = 'r';
  return side;
}

/** The zoom the canvas opens at, and the steps it moves in. */
export const ZOOM = { min: 0.5, max: 1, step: 0.1, start: 0.8 } as const;
export function clampZoom(z: number): number {
  return Math.round(Math.min(ZOOM.max, Math.max(ZOOM.min, z)) * 100) / 100;
}
