// lib/visual/intent.ts — A PERSON'S WORDS ABOUT WHAT IS ON SCREEN, AS ACTIONS (Logos 6, November 2026).
//
// "Highlight the demand curve." "Show me what happens when demand increases." "Show me the second step of binary
// search." "Highlight question 4's incorrect step." "Why did this move?" Read against the artifacts on screen (newest
// first), the part they selected, and the artifact they last touched, a request becomes one of:
//   • act — actions to take now, checked (./actions.ts), and a line saying what was done;
//   • ambiguous — more than one part fits and nothing tells them apart: which, asked in a line, never a guess;
//   • about — a question about a part (or the artifact), resolved, so Socria answers about THAT one with its state;
//   • cannot — understood, but the picture cannot do it (already at the end of its range, nothing marked as a
//     mistake): said, never faked;
//   • null — not about what is on screen at all; the conversation goes on as it would have.
// Only an explicit request acts: a question that merely names a part ("what is the demand curve?") is left to Socria,
// which may point at it in its reply (./actions.ts markers).
//
// Pure: no React, no DOM, no clock.

import { compileOver, fmtPoint, fmtVal } from '../inline-math';
import { graphReadings, type InlineSpec } from '../inline-ui';
import { actionSaid, checkAction, onStep, type VisualAction } from './actions';
import { ordinal, type VisualArtifact, type VisualElement } from './elements';

export interface SceneArtifact extends VisualArtifact {
  /** the specification as drawn (for the arithmetic of a shift) */
  spec?: InlineSpec;
  /** its parameters now */
  values?: Record<string, number>;
  /** the step it shows now (a trace, a sequence), from 1 */
  at?: number;
}

export interface Scene {
  /** what is on screen, newest first */
  artifacts: SceneArtifact[];
  /** the part they pressed, if any */
  selection?: { key: string; id: string } | null;
  /** the artifact they last touched */
  active?: string | null;
}

export type VisualAsk =
  | { kind: 'act'; key: string; actions: VisualAction[]; said: string }
  | { kind: 'ambiguous'; candidates: { key: string; id: string; label: string; title: string }[]; said: string }
  | { kind: 'about'; key: string; id: string | null; said: string }
  | { kind: 'cannot'; key: string | null; said: string }
  | null;

const norm = (t: string) =>
  ` ${String(t ?? '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()} `;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A word or phrase said as itself, not inside another word. */
const said = (text: string, w: string) => new RegExp(`(^|[^a-z0-9'])${esc(w)}(?=$|[^a-z0-9])`).test(text);

const KIND_WORDS: Record<string, RegExp> = {
  curve: /\b(?:curves?|function|graph|line)\b/,
  point: /\b(?:points?|dot|intersection)\b/,
  line: /\b(?:line|tangent|secant|chord)\b/,
  region: /\b(?:area|region|shaded|rectangles?)\b/,
  param: /\b(?:slider|value|parameter|number)\b/,
  vector: /\b(?:vectors?|forces?|arrows?)\b/,
  step: /\b(?:steps?|lines?)\b/,
  node: /\b(?:nodes?|boxes?|parts?|stages?)\b/,
  item: /\b(?:events?|items?|stages?|steps?)\b/,
  question: /\b(?:questions?)\b/,
};

/** Words of a title that name nothing in particular. */
const TITLE_STOP = new Set(['graph', 'curve', 'with', 'from', 'what', 'that', 'this', 'under', 'between', 'into', 'over', 'their', 'your', 'step']);

const DEMONSTRATIVE = /\b(?:this|that|it|this one|that one|these|those|here)\b/;
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const ORDINAL_N: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12 };

/** What they asked to be done, in the order the readers are tried: the most specific first. */
const ASKS: [string, RegExp][] = [
  ['reset', /\b(?:reset|start (?:it |this )?over|put (?:it|that|this|everything|the graph|them) back|back to (?:the )?(?:start|beginning|how it was)|undo (?:that|the change|the move))\b/],
  ['pause', /\b(?:pause|freeze|stop (?:the )?(?:animation|it|that|this|moving|playing))\b/],
  ['resume', /\b(?:resume|unpause|keep (?:going|playing)|continue (?:the )?(?:animation|playing))\b/],
  ['step', /\b(?:step (?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|last|final|next|previous) (?:step|stage|line|event)\b|go (?:to|back to) step|step (?:forward|back(?:ward)?))/],
  ['replay', /\b(?:replay|play (?:it |that |this )?again|run (?:it |that )?again|show (?:me )?(?:it|that|this) again|do (?:it|that) again|one more time)\b/],
  ['compare', /\b(?:compare|before and after|side by side|against (?:the )?(?:original|previous one|start)|how (?:it|this|that) (?:differs|changed) from)\b/],
  ['zoom', /\b(?:zoom(?: in)?(?: on| into| to)?|close[- ]?up|magnify|enlarge)\b/],
  ['trace', /\b(?:trace|follow (?:the|it|that|this)|walk (?:me )?(?:along|through) (?:the )?(?:curve|path|trajectory)|move along the)\b/],
  ['change', /\b(?:what happens (?:when|if|as)|show (?:me )?what happens|make (?:the |it |that |this )?[a-z' ]{0,40}?(?:move|shift|flatter|steeper|bigger|smaller|wider|narrower|larger)|(?:shift|move|slide|drag|push) (?:the |it |that |this )?[a-z' ]{0,40}?(?:right|left|up|down|out|in)\b|(?:increase|decrease|raise|lower|double|halve) (?:the |it |that |this )|(?:more|fewer) rectangles|(?:larger|bigger|smaller) (?:sample|n\b))/],
  ['focus', /\b(?:focus (?:in )?on|centre on|center on|show me where|where(?:'s| is) the|point (?:out|to|at)|take me to)\b/],
  ['highlight', /\b(?:highlight|emphasi[sz]e|mark|circle|underline|light up|make (?:the |it |that |this )?[a-z' ]{0,30}stand out|show (?:me )?(?:the |which |that |this |my )|show me$)/],
  ['play', /\b(?:play (?:it|the animation|this|that)?|run the animation|animate (?:it|this|that|the)|start the animation)\b/],
  ['about', /\b(?:why (?:did|has|is|does) (?:this|that|it)|what (?:just )?happened|what changed|what(?:'s| is) (?:happening|going on)(?: here| there)?|explain (?:this|that)(?: part| bit)?|what(?:'s| is) (?:this|that)\b)/],
];

const UP = /\b(?:increas\w*|rise[sn]?|rising|raise[sd]?|go(?:es)? up|higher|more|larger|bigger|grows?|growing|right(?:ward)?|outwards?|expand\w*|widen\w*|steeper|double[sd]?)\b/;
const DOWN = /\b(?:decreas\w*|falls?|fell|falling|drops?|dropp\w*|go(?:es)? down|lower\w*|less|fewer|smaller|shrinks?|shrinking|left(?:ward)?|inwards?|contract\w*|narrow\w*|flatter|halve[sd]?)\b/;

/** How well an element's names are said in the text: the longest name said, 0 for none. */
function heard(text: string, raw: string, e: VisualElement): number {
  let best = 0;
  for (const w of e.words) {
    if (w.length <= best) continue;
    // a one- or two-letter name ("D", "MR") counts only as a name: written in capitals, or beside "curve"
    if (w.length <= 2 && !(new RegExp(`(^|[^A-Za-z])${esc(w.toUpperCase())}(?![A-Za-z])`).test(raw) || said(text, `${w} curve`) || said(text, `curve ${w}`))) continue;
    if (said(text, w)) best = w.length;
  }
  return best;
}

interface Hit {
  art: SceneArtifact;
  e: VisualElement;
  score: number;
  len: number;
}

/** The parts the words name, best first. */
function hits(text: string, raw: string, scene: Scene, op: string): Hit[] {
  const out: Hit[] = [];
  scene.artifacts.forEach((art, i) => {
    // the artifact's own name said ("on the coffee graph"): its words count for more than which is newest
    const titleWords = art.title.toLowerCase().split(/[^a-z0-9’']+/).filter((w) => w.length > 3 && !TITLE_STOP.has(w));
    const titleHit = Math.min(40, titleWords.filter((w) => said(text, w)).length * 20);
    for (const e of art.elements) {
      if (e.kind === 'edge') continue;
      const len = heard(text, raw, e);
      if (!len) continue;
      const kind = KIND_WORDS[e.kind]?.test(text) ? 12 : 0;
      const fits = op === 'about' || op === 'change' || e.ops.includes(op as never) || (op === 'focus' && e.ops.includes('highlight')) ? 0 : -40;
      // a change asked for ("what happens when demand increases"): a part that can move, before one that cannot
      const movable = op === 'change' && e.kind === 'curve' ? (e.meta?.params ? 25 : -25) : 0;
      // the artifact they last touched is what they are looking at: it outweighs which is newest
      out.push({ art, e, len, score: len * 10 + kind + fits + movable + titleHit + (scene.active === art.key ? 30 : 0) - i * 3 });
    }
  });
  return out.sort((a, b) => b.score - a.score);
}

/** The step a request names: "step 3", "the third step", "the last step", "next step" (relative to where it is). */
function stepNamed(text: string, art: SceneArtifact): number | null {
  const steps = art.elements.filter((e) => e.kind === 'step' || e.kind === 'item').length;
  const m = /\bstep (\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/.exec(text);
  if (m) return /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
  const o = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|last|final|next|previous)\b (?:step|stage|line|event)\b/.exec(text);
  if (o) {
    if (o[1] === 'last' || o[1] === 'final') return steps;
    if (o[1] === 'next') return Math.min(steps, (art.at ?? 1) + 1);
    if (o[1] === 'previous') return Math.max(1, (art.at ?? 1) - 1);
    return ORDINAL_N[o[1]];
  }
  if (/\bstep forward\b/.test(text)) return Math.min(steps, (art.at ?? 1) + 1);
  if (/\bstep back/.test(text)) return Math.max(1, (art.at ?? 1) - 1);
  return null;
}

/**
 * Which way a parameter moves for a curve to "increase": a market's curves shift RIGHT (more is wanted, or offered, at
 * every price — supply rises by moving down), any other curve rises. Worked out on the curve, numerically: the sign of
 * the curve's change in that parameter, against its slope for a horizontal shift. Null when the parameter does nothing.
 */
export function shiftSign(spec: Extract<InlineSpec, { type: 'graph' }>, curveExpr: string, param: string, values: Record<string, number>, market: boolean): number | null {
  const names = spec.params.map((p) => p.name);
  const c = compileOver(curveExpr, names);
  if (!c) return null;
  const p = spec.params.find((q) => q.name === param);
  if (!p) return null;
  const xm = (spec.x[0] + spec.x[1]) / 2;
  const h = Math.max(p.step, (p.max - p.min) / 200) || 1e-3;
  const at = (dp: number, dx = 0) => c.eval({ ...values, [param]: (values[param] ?? p.value) + dp, x: xm + dx });
  const dydp = (at(h) - at(-h)) / (2 * h);
  if (!Number.isFinite(dydp) || Math.abs(dydp) < 1e-9) return null;
  if (!market) return Math.sign(dydp);
  const hx = (spec.x[1] - spec.x[0]) / 400;
  const dydx = (at(0, hx) - at(0, -hx)) / (2 * hx);
  if (!Number.isFinite(dydx) || Math.abs(dydx) < 1e-9) return Math.sign(dydp);
  return Math.sign(-dydp / dydx);
}

/** A parameter's next value, a quarter of its range on (a count doubles or halves), or null at the end of its range. */
function nudged(p: VisualElement, now: number, dir: 1 | -1): number | null {
  const min = p.meta?.min as number, max = p.meta?.max as number, step = (p.meta?.step as number) || 0;
  let to: number;
  if (step >= 1 && Number.isInteger(step) && min > 0) to = dir > 0 ? Math.max(now * 2, now + step) : Math.min(now / 2, now - step);
  else to = now + dir * Math.max(step, (max - min) / 4);
  const v = onStep(to, p);
  return Math.abs(v - now) < 1e-9 ? null : v;
}

const curveOf = (art: SceneArtifact, id: string) => art.elements.find((e) => e.id === id);
const isMarket = (e: VisualElement) => e.words.some((w) => w === 'demand' || w === 'supply' || w === 'aggregate demand' || w === 'aggregate supply');

/** One request about what is on screen, read; null when it is not one. */
export function readVisualAsk(message: string, scene: Scene): VisualAsk {
  if (!scene.artifacts.length) return null;
  const raw = ` ${String(message ?? '').replace(/\s+/g, ' ').trim()} `;
  const text = norm(message);
  if (text.trim().length < 3 || text.length > 400) return null;
  const op = ASKS.find(([, re]) => re.test(text))?.[0];
  if (!op) return null;
  const sel = scene.selection ? (() => {
    const art = scene.artifacts.find((a) => a.key === scene.selection!.key);
    const e = art?.elements.find((x) => x.id === scene.selection!.id);
    return art && e ? { art, e } : null;
  })() : null;
  const demo = DEMONSTRATIVE.test(text);
  const activeArt = scene.artifacts.find((a) => a.key === scene.active) ?? scene.artifacts[0];

  // a quiz's question, and the answer they gave: "highlight question 4's incorrect step"
  const qn = /\bquestion (\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b|\bq(\d{1,2})\b/.exec(text);
  if (qn && (op === 'highlight' || op === 'focus' || op === 'about')) {
    const n = qn[1] ? (/^\d+$/.test(qn[1]) ? Number(qn[1]) : NUMBER_WORDS[qn[1]]) : Number(qn[2]);
    const quiz = scene.artifacts.find((a) => a.type === 'quiz' && a.elements.some((e) => e.id === `question:${n}`));
    if (!quiz) return { kind: 'cannot', key: null, said: `There is no finished quiz with a question ${n} here to show.` };
    const q = quiz.elements.find((e) => e.id === `question:${n}`)!;
    const yours = quiz.elements.find((e) => e.id === `question:${n}/yours`);
    const wantsMistake = /\b(?:incorrect|wrong|mistake|error|went wrong|slip)\b/.test(text);
    if (wantsMistake && (!yours || yours.meta?.wrong !== true))
      return { kind: 'act', key: quiz.key, actions: [{ op: 'focus', targets: [q.id], hold: true }], said: `Question ${n} was answered correctly, so there is no incorrect step to show; it is in view.` };
    const targets = wantsMistake && yours ? [q.id, yours.id] : [q.id];
    return act(quiz, [{ op: 'focus', targets, hold: true }], wantsMistake ? `Highlighted your answer to question ${n} on “${quiz.title}”: it is the step that went wrong.` : undefined);
  }

  // a mistake asked for where nothing is marked as one: said, never made up
  if ((op === 'highlight' || op === 'focus') && /\b(?:my )?(?:mistake|error|what i got wrong|where i went wrong)\b/.test(text)) {
    const marked = scene.artifacts.flatMap((a) => a.elements.filter((e) => e.meta?.wrong === true).map((e) => ({ a, e })));
    if (!marked.length) return { kind: 'cannot', key: activeArt.key, said: `Nothing on “${activeArt.title}” is marked as a mistake, so nothing was highlighted.` };
    return act(marked[0].a, [{ op: 'focus', targets: [marked[0].e.id], hold: true }]);
  }

  if (op === 'reset' || op === 'pause' || op === 'resume' || op === 'replay' || op === 'compare' || op === 'play') {
    const named = hits(text, raw, scene, 'highlight')[0];
    const art = named?.art ?? (sel?.art ?? activeArt);
    const a: VisualAction = { op: op === 'play' ? 'animate' : (op as VisualAction['op']), targets: [] };
    return act(art, [a]);
  }

  if (op === 'step') {
    const withSteps = scene.artifacts.filter((a) => a.elements.some((e) => e.kind === 'step' || e.kind === 'item') && a.ops.includes('step'));
    const steps = withSteps.length ? withSteps : scene.artifacts.filter((a) => a.elements.some((e) => e.kind === 'step'));
    if (!steps.length) return null;
    // the one their words name ("of binary search"), else the one they last touched, else the newest
    const art = steps.find((a) => a.title && text.includes(a.title.toLowerCase().replace(/^(?:a|the) /, '').slice(0, 24))) ?? steps.find((a) => a.title.split(/\s+/).filter((w) => w.length > 4).some((w) => said(text, w.toLowerCase()))) ?? steps.find((a) => a.key === scene.active) ?? steps[0];
    const n = stepNamed(text, art);
    if (n === null) return null;
    if (!art.ops.includes('step')) return act(art, [{ op: 'focus', targets: [`step:${n}`], hold: true }]);
    return act(art, [{ op: 'step', targets: [], step: n }]);
  }

  const found = hits(text, raw, scene, op);
  let target: Hit | null = found[0] ?? null;
  // "this", "that": the part they pressed, before anything their other words might match
  if (sel && demo && (!target || target.len < 6)) target = { art: sel.art, e: sel.e, score: 1e6, len: 99 };

  if (op === 'about') {
    if (target) return { kind: 'about', key: target.art.key, id: target.e.id, said: `They are asking about ${target.e.label} on “${target.art.title}”.` };
    if (!demo) return null;
    return { kind: 'about', key: activeArt.key, id: null, said: `They are asking about “${activeArt.title}”.` };
  }

  if (op === 'change') return change(text, raw, scene, target, sel);

  // nothing named: a kind said once ("the curve") over several parts of that kind is a question back, not a guess
  if (!target) {
    const kind = Object.entries(KIND_WORDS).find(([, re]) => re.test(text))?.[0];
    if (!kind) return null;
    const same = activeArt.elements.filter((e) => e.kind === kind && (e.ops.includes(op as never) || op === 'focus'));
    if (same.length === 1) target = { art: activeArt, e: same[0], score: 1, len: 1 };
    else if (same.length > 1) return ambiguous(activeArt, same);
    else return null;
  }
  // two parts heard equally well, neither pressed nor said more exactly: which?
  const rival = found.find((h) => h !== target && h.e.id !== target!.e.id && h.score === target!.score && h.len === target!.len);
  if (rival && !(sel && demo)) return ambiguous(target.art, [target.e, rival.e], rival.art.key !== target.art.key ? rival.art : undefined);

  const opNow = op === 'zoom' && target.e.kind !== 'point' ? 'focus' : op;
  const a: VisualAction = { op: opNow as VisualAction['op'], targets: [target.e.id], ...(op === 'highlight' || op === 'focus' ? { hold: true } : {}), ...(op === 'zoom' ? { k: 2.5 } : {}) };
  return act(target.art, [a]);
}

/** Something to do, checked: an act, or why it cannot be done. */
function act(art: SceneArtifact, actions: VisualAction[], line?: string): VisualAsk {
  const done: VisualAction[] = [];
  const lines: string[] = [];
  for (const a of actions) {
    const c = checkAction(a, art, art.values);
    if (!c.ok) return { kind: 'cannot', key: art.key, said: `That could not be shown: ${c.why}.` };
    done.push(c.action);
    lines.push(actionSaid(c.action, art, art.values));
  }
  return { kind: 'act', key: art.key, actions: done, said: line ?? lines.join(' ') };
}

function ambiguous(art: SceneArtifact, parts: VisualElement[], other?: SceneArtifact): VisualAsk {
  const candidates = parts.slice(0, 4).map((e, i) => ({ key: i === 1 && other ? other.key : art.key, id: e.id, label: e.label, title: i === 1 && other ? other.title : art.title }));
  return { kind: 'ambiguous', candidates, said: `More than one thing fits: ${candidates.map((c) => c.label).join(' or ')}.` };
}

/** "Show what happens when demand increases", "more rectangles", "move the point right", "make the tangent flatter". */
function change(text: string, raw: string, scene: Scene, target: Hit | null, sel: { art: SceneArtifact; e: VisualElement } | null): VisualAsk {
  const up = UP.test(text), down = DOWN.test(text);
  const flatter = /\bflatter\b/.test(text), steeper = /\bsteeper\b/.test(text);
  if (!target && sel) target = { art: sel.art, e: sel.e, score: 1, len: 1 };
  if (!target) return null;
  const { art, e } = target;
  const values = art.values ?? {};
  // a tangent made flatter or steeper: moved along the curve to where its slope is nearer 0, or further from it
  if ((flatter || steeper) && (e.id === 'line:tangent' || e.kind === 'point') && art.spec?.type === 'graph') {
    const param = String(e.meta?.at ?? e.meta?.param ?? '');
    const p = art.elements.find((x) => x.id === `param:${param}`);
    if (!p) return null;
    const c = compileOver(art.spec.expr, art.spec.params.map((q) => q.name));
    if (!c) return null;
    const slope = (x: number) => (c.eval({ ...values, x: x + 1e-4 }) - c.eval({ ...values, x: x - 1e-4 })) / 2e-4;
    const now = values[param] ?? (p.meta?.value as number);
    const s0 = Math.abs(slope(now));
    const min = p.meta?.min as number, max = p.meta?.max as number;
    const cands = Array.from({ length: 81 }, (_, i) => min + ((max - min) * i) / 80).filter((x) => Number.isFinite(slope(x)));
    const ok = cands.filter((x) => (flatter ? Math.abs(slope(x)) <= s0 * 0.5 : Math.abs(slope(x)) >= s0 * 1.6 + 0.2));
    if (!ok.length) return { kind: 'cannot', key: art.key, said: `The tangent cannot get ${flatter ? 'flatter' : 'steeper'} on this curve's window.` };
    const to = ok.sort((a, b) => Math.abs(a - now) - Math.abs(b - now))[0];
    return act(art, [{ op: 'highlight', targets: ['line:tangent'] }, { op: 'animate', targets: [p.id], to }]);
  }
  if (!up && !down) return null;
  const dir: 1 | -1 = up ? 1 : -1;
  // the number to move: the one named, or the one behind a point, a tangent, the rectangles, or a curve
  let param: VisualElement | undefined;
  let sign = 1;
  if (e.kind === 'param') param = e;
  else if (typeof e.meta?.param === 'string' || typeof e.meta?.at === 'string') param = art.elements.find((x) => x.id === `param:${e.meta?.param ?? e.meta?.at}`);
  else if (e.kind === 'curve' && art.spec?.type === 'graph') {
    const spec = art.spec;
    const mine = String(e.meta?.params ?? '').split(',').filter(Boolean);
    // a parameter only this curve uses: shifting demand never moves supply
    const others = art.elements.filter((x) => x.kind === 'curve' && x.id !== e.id).flatMap((x) => String(x.meta?.params ?? '').split(','));
    const own = mine.filter((n) => !others.includes(n));
    const pick = (own.length ? own : mine).map((n) => ({ n, s: shiftSign(spec, String(e.meta?.expr), n, values, isMarket(e)) })).find((x) => x.s !== null);
    if (!pick) return { kind: 'cannot', key: art.key, said: `${e.label} has nothing on “${art.title}” that moves it.` };
    param = art.elements.find((x) => x.id === `param:${pick.n}`);
    sign = pick.s!;
  }
  if (!param) return null;
  const now = values[String(param.meta?.name)] ?? (param.meta?.value as number);
  const to = nudged(param, now, (dir * sign) as 1 | -1);
  if (to === null) return { kind: 'cannot', key: art.key, said: `${param.label} is already at the ${dir * sign > 0 ? 'top' : 'bottom'} of its range (${fmtVal(now)}).` };
  const actions: VisualAction[] = [];
  if (e.kind === 'curve') actions.push({ op: 'highlight', targets: [e.id] });
  actions.push({ op: 'animate', targets: [param.id], to });
  // where it ends up: the new meeting point, when there is one
  const meet = art.elements.find((x) => x.kind === 'point' && /^point:(?:equilibrium|mr-mc|crossing)/.test(x.id));
  if (meet && e.kind === 'curve') actions.push({ op: 'focus', targets: [meet.id] });
  const r = act(art, actions);
  if (r?.kind === 'act' && e.kind === 'curve') {
    // said with the model's own numbers: the parameter, and where the curves now meet against where they met
    const name = String(param.meta?.name);
    const before = art.spec?.type === 'graph' ? graphReadings(art.spec, { ...values, [name]: now }).crossings[0] : undefined;
    const after = art.spec?.type === 'graph' ? graphReadings(art.spec, { ...values, [name]: to }).crossings[0] : undefined;
    const moved = isMarket(e) ? `Shifted ${e.label} ${dir > 0 ? 'right' : 'left'}` : `Moved ${e.label} ${dir > 0 ? 'up' : 'down'}`;
    r.said = `${moved} (${param.label} ${fmtVal(now)} → ${fmtVal(to)}) on “${art.title}”${meet && before && after ? `; ${meet.label} moved from ${fmtPoint(before)} to ${fmtPoint(after)}` : ''}.`;
  }
  return r;
}

/** Where a trace or sequence stands, in words (for the line Socria is told). */
export const stepSaid = (n: number, of: number) => `the ${ordinal(n)} step of ${of}`;
