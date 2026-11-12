// lib/teaching/observe.ts — FROM DIGESTED MATERIALS TO OBSERVATIONS, EACH WITH ITS EVIDENCE.
//
// Every observation here is worked out from the units of the materials the
// student added (lib/teaching/materials.ts), and says where it comes from:
//
//   OBSERVED   a count of what is in the materials — "7 of 10 past questions are
//              multiple choice", "an example opens 6 of 9 sections". The claim is
//              the count; its confidence says how far it is likely to hold for
//              the course (how many units, across how many materials).
//   INFERRED   a pattern read from those counts — "most questions ask you to
//              apply an idea rather than recall it". Said as Socria's reading,
//              with the counts it rests on.
//   STATED     what the syllabus says the course will do. The course's claim
//              about itself, never something seen: on its own it is never more
//              than low confidence for how the course teaches, and moderate for
//              how it assesses. It is checked against what past exams show.
//
// CONFIDENCE (calibrate) comes only from the evidence: how many separate units
// show it, how many materials those units span, how consistent they are, and
// the basis. Not from how it reads.
//
// PURE. Deterministic.

import {
  SIDE_OF,
  SIDE_OF_DIMENSION,
  type Basis,
  type Confidence,
  type CourseConcept,
  type Dimension,
  type Evidence,
  type MaterialDigest,
  type MaterialKind,
  type Observation,
  type Unit,
} from './types';

// ── confidence ───────────────────────────────────────────────────────

export interface Support {
  /** separate units that show it */
  units: number;
  /** units that could have */
  of: number;
  /** materials those units span */
  materials: number;
  basis: Basis;
  /** 0..1: how consistent the evidence is with the claim (1 for an exact count) */
  consistency: number;
  side: 'teaching' | 'assessment';
}

const LEVEL: Confidence[] = ['low', 'moderate', 'high'];
const capAt = (c: Confidence, cap: Confidence): Confidence => LEVEL[Math.min(LEVEL.indexOf(c), LEVEL.indexOf(cap))];

/**
 * How sure an observation can be, from its evidence alone.
 *
 *   strength     more separate units, surer — with diminishing returns (1 − e^(−units/4))
 *   breadth      one material could be a one-off; three are a pattern
 *   consistency  a pattern half the units contradict is weaker than one they all show
 *   basis        observed counts > Socria's inferences > what a syllabus says
 *
 * Then caps: one unit is never more than low; fewer than four units, or a single
 * material, never high; a syllabus statement never more than low about teaching,
 * moderate about assessment.
 */
export function calibrate(s: Support): { confidence: Confidence; score: number } {
  const units = Math.max(0, s.units);
  const strength = 1 - Math.exp(-units / 4);
  const breadth = s.materials >= 3 ? 1 : s.materials === 2 ? 0.82 : 0.6;
  const consistency = 0.45 + 0.55 * Math.max(0, Math.min(1, s.consistency));
  const basis = s.basis === 'observed' ? 1 : s.basis === 'inferred' ? 0.8 : 0.55;
  const score = Math.round(strength * breadth * consistency * basis * 100) / 100;
  let confidence: Confidence = score >= 0.55 ? 'high' : score >= 0.3 ? 'moderate' : 'low';
  if (units < 2) confidence = 'low';
  if (units < 4 || s.materials < 2) confidence = capAt(confidence, 'moderate');
  if (s.basis === 'stated') confidence = capAt(confidence, s.side === 'teaching' ? 'low' : 'moderate');
  if (s.basis === 'inferred' && s.materials < 2) confidence = capAt(confidence, 'moderate');
  return { confidence, score };
}

// ── units, with where they came from ─────────────────────────────────

interface Placed {
  unit: Unit;
  doc: string;
  kind: MaterialKind;
  order: number;
}

const evidenceOf = (p: Placed): Evidence => ({ doc: p.doc, block: p.unit.block, page: p.unit.page, quote: p.unit.quote, unit: p.unit.label });

/** Up to n places, spread across materials (one from each in turn), in the order they appear. */
export function spread(ps: Placed[], n = 6): Evidence[] {
  const byDoc = new Map<string, Placed[]>();
  for (const p of ps) byDoc.set(p.doc, [...(byDoc.get(p.doc) ?? []), p]);
  const lists = [...byDoc.values()];
  const out: Evidence[] = [];
  for (let i = 0; out.length < n && lists.some((l) => l.length > i); i++) for (const l of lists) if (l[i] && out.length < n) out.push(evidenceOf(l[i]));
  return out;
}

const docsOf = (ps: Placed[]) => new Set(ps.map((p) => p.doc)).size;
const kindsOf = (ps: Placed[]): MaterialKind[] => [...new Set(ps.map((p) => p.kind))];
const has = (code: string) => (p: Placed) => p.unit.codes.includes(code);
const pct = (n: number, d: number) => (d ? n / d : 0);
const ofSaid = (n: number, d: number, what: string) => `${n} of ${d} ${what}`;

function make(
  dimension: Dimension,
  key: string,
  code: string,
  said: string,
  basis: Basis,
  shown: Placed[],
  pool: Placed[],
  extra: { consistency?: number; share?: number; terms?: string[]; caveat?: string; evidence?: Evidence[]; materials?: number } = {}
): Observation {
  const side = SIDE_OF_DIMENSION[dimension];
  const materials = extra.materials ?? docsOf(shown);
  const { confidence, score } = calibrate({ units: shown.length, of: pool.length, materials, basis, consistency: extra.consistency ?? 1, side });
  return {
    id: `${dimension}:${key}`,
    dimension,
    code,
    said,
    basis,
    confidence,
    score,
    support: { units: shown.length, of: pool.length, materials, kinds: kindsOf(shown) },
    evidence: extra.evidence ?? spread(shown),
    ...(extra.share !== undefined ? { share: Math.round(extra.share * 100) / 100 } : {}),
    ...(extra.terms ? { terms: extra.terms } : {}),
    ...(extra.caveat ? { caveat: extra.caveat } : {}),
  };
}

// ── assessment ───────────────────────────────────────────────────────

const FORMAT_SAID: Record<string, [string, string]> = {
  'format.mcq': ['mcq', 'are multiple choice'],
  'format.tf': ['tf', 'are true or false'],
  'format.free': ['free', 'are free response'],
  'format.calc': ['calc', 'ask you to calculate something'],
  'format.essay': ['essay', 'ask for a written explanation or argument'],
  'format.proof': ['proof', 'ask you to prove or derive a result'],
  'format.short': ['short', 'want a short answer'],
  'format.match': ['match', 'are matching'],
  'format.fill': ['fill', 'are fill in the blank'],
  parts: ['parts', 'have several parts'],
};

const BLOOM_ORDER = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
const bloomOf = (u: Unit) => Math.max(0, BLOOM_ORDER.indexOf((u.codes.find((c) => c.startsWith('bloom.')) ?? 'bloom.understand').slice(6)));

/** How demanding a question is, roughly: the thinking its verbs ask for, plus parts, a scenario, numbers, a justification, a trap. */
export function demandOf(u: Unit): number {
  let d = bloomOf(u);
  if (u.codes.includes('parts')) d += 1;
  if (u.codes.includes('scenario')) d += 0.5;
  if (u.codes.includes('num') || u.codes.includes('format.calc')) d += 0.5;
  if (u.codes.includes('justify')) d += 0.5;
  if (u.codes.some((c) => c.startsWith('trap.'))) d += 0.5;
  return d;
}

const TRAPS: [string, string, string][] = [
  ['trap.negation', 'negation', 'turn on a NOT, EXCEPT or LEAST in the question'],
  ['trap.allabove', 'allabove', 'offer “all/none of the above” or combined options'],
  ['trap.absolute', 'absolute', 'have options that say always, never or only'],
  ['trap.contrast', 'contrast', 'ask you to tell apart two related ideas'],
  ['trap.best', 'best', 'ask for the best or most likely answer among plausible ones'],
  ['trap.scale', 'scale', 'turn on units or scale (percentage points, per unit, in thousands)'],
  ['scenario', 'scenario', 'set up a scenario before asking'],
  ['justify', 'justify', 'ask you to justify an answer or show your work'],
];

function assessment(A: Placed[], digests: MaterialDigest[]): Observation[] {
  const out: Observation[] = [];
  if (!A.length) return out;
  const n = A.length;
  const qs = (k: number) => (k === 1 ? 'question' : 'questions');
  // formats: counted
  for (const [code, [key, what]] of Object.entries(FORMAT_SAID)) {
    const shown = A.filter(has(code));
    const share = pct(shown.length, n);
    if (!shown.length || (shown.length < 2 && share < 0.2) || share < 0.12) continue;
    out.push(make('formats', key, code, `${ofSaid(shown.length, n, `past ${qs(n)}`)} ${what}`, 'observed', shown, A, { share }));
  }
  // points: where the marks are, when the materials say
  const pointed = A.filter((p) => p.unit.points);
  if (pointed.length >= Math.max(3, n * 0.5)) {
    const total = pointed.reduce((t, p) => t + (p.unit.points ?? 0), 0);
    const free = pointed.filter((p) => !p.unit.codes.includes('format.mcq') && !p.unit.codes.includes('format.tf'));
    const freePts = free.reduce((t, p) => t + (p.unit.points ?? 0), 0);
    if (total > 0 && free.length && freePts / total >= 0.15) {
      out.push(make('formats', 'points-free', 'points.free', `Free-response questions carry ${Math.round((freePts / total) * 100)}% of the marks where marks are given`, 'observed', free, pointed, { share: freePts / total }));
    }
  }
  // difficulty: Socria's reading of the demand
  const demands = A.map((p) => demandOf(p.unit));
  const avg = demands.reduce((t, d) => t + d, 0) / n;
  const level = avg < 1.4 ? 'direct' : avg < 2.4 ? 'mixed' : 'multistep';
  const fits = A.filter((_, i) => (level === 'direct' ? demands[i] < 1.9 : level === 'multistep' ? demands[i] >= 1.9 : demands[i] >= 0.9 && demands[i] < 2.9));
  const multi = A.filter((p) => p.unit.codes.includes('parts') || p.unit.codes.includes('scenario') || demandOf(p.unit) >= 3);
  const saidD =
    level === 'direct'
      ? 'Questions are mostly direct: one step, one idea'
      : level === 'multistep'
        ? `Questions mostly take several steps: a scenario, numbers or parts that build on each other (${ofSaid(multi.length, n, qs(n))})`
        : `A mix of direct questions and multi-step ones (${ofSaid(multi.length, n, qs(n))} take several steps)`;
  out.push(make('difficulty', level, `difficulty.${level}`, saidD, 'inferred', level === 'direct' ? fits : multi.length ? multi : fits, A, { consistency: pct(fits.length, n) }));
  // understanding or recall
  const recall = A.filter((p) => bloomOf(p.unit) === 0);
  const higher = A.filter((p) => bloomOf(p.unit) >= 2);
  if (pct(higher.length, n) >= 0.5) {
    out.push(make('recall', 'apply', 'recall.apply', `Most questions ask you to apply or analyse an idea rather than recall it (${ofSaid(higher.length, n, qs(n))})`, 'inferred', higher, A, { consistency: pct(higher.length, n), share: pct(higher.length, n) }));
  } else if (pct(recall.length, n) >= 0.4) {
    out.push(make('recall', 'memory', 'recall.memory', `Many questions ask you to recall a definition or a fact (${ofSaid(recall.length, n, qs(n))})`, 'inferred', recall, A, { consistency: pct(recall.length, n), share: pct(recall.length, n) }));
  } else {
    const und = A.filter((p) => bloomOf(p.unit) === 1);
    out.push(make('recall', 'understand', 'recall.understand', `Questions mostly check that you understand an idea — explain it, recognise it in a new case — more than recall or calculation (${ofSaid(und.length, n, qs(n))})`, 'inferred', und.length ? und : A, A, { consistency: pct(und.length, n), share: pct(und.length, n) }));
  }
  // numbers
  const num = A.filter((p) => p.unit.codes.includes('num') || p.unit.codes.includes('format.calc'));
  if (num.length) {
    const share = pct(num.length, n);
    const key = share >= 0.4 ? 'frequent' : share >= 0.15 ? 'some' : 'rare';
    out.push(make('numeric', key, `numeric.${key}`, `${ofSaid(num.length, n, `${qs(n)}`)} involve working with numbers`, 'observed', num, A, { share }));
  } else if (n >= 8) {
    out.push(make('numeric', 'none', 'numeric.none', `None of the ${n} past questions involve calculation`, 'observed', A, A, { share: 0, consistency: 1, caveat: 'An absence: other exams may differ.' }));
  }
  // graphs
  const graph = A.filter(has('graph'));
  if (graph.length) {
    const share = pct(graph.length, n);
    const key = share >= 0.3 ? 'frequent' : 'some';
    out.push(make('graphs', key, `graphs.${key}`, `${ofSaid(graph.length, n, `${qs(n)}`)} use or ask for a graph or diagram`, 'observed', graph, A, { share }));
  }
  // wording and traps
  for (const [code, key, what] of TRAPS) {
    const shown = A.filter(has(code));
    if (shown.length < 2 && pct(shown.length, n) < 0.25) continue;
    out.push(make('wording', key, code, `${ofSaid(shown.length, n, `${qs(n)}`)} ${what}`, 'observed', shown, A, { share: pct(shown.length, n) }));
  }
  // how it has changed: earlier exams against later ones, only when the materials say when they are from
  const dated = digests.filter((d) => SIDE_OF[d.material.kind] === 'assessment' && d.material.order && d.units.length >= 3).sort((a, b) => (a.material.order ?? 0) - (b.material.order ?? 0));
  if (dated.length >= 2) {
    const early = dated.slice(0, Math.floor(dated.length / 2));
    const late = dated.slice(early.length);
    const unitsIn = (ds: MaterialDigest[]): Placed[] => ds.flatMap((d) => d.units.filter((u) => u.kind === 'item').map((u) => ({ unit: u, doc: d.material.doc, kind: d.material.kind, order: d.material.order ?? 0 })));
    const E = unitsIn(early);
    const L = unitsIn(late);
    const TREND: [string, string][] = [
      ['format.mcq', 'multiple-choice questions'],
      ['format.free', 'free-response questions'],
      ['graph', 'graph questions'],
      ['num', 'questions with numbers'],
      ['parts', 'multi-part questions'],
      ['scenario', 'scenario questions'],
    ];
    if (E.length >= 4 && L.length >= 4) {
      for (const [code, what] of TREND) {
        const e = E.filter(has(code)).length;
        const l = L.filter(has(code)).length;
        const delta = pct(l, L.length) - pct(e, E.length);
        if (Math.abs(delta) < 0.25) continue;
        const dir = delta > 0 ? 'more' : 'fewer';
        const lateTerm = late[late.length - 1].material.term ?? 'the latest';
        out.push(
          make('trend', `${code}-${dir}`, `trend.${code}.${delta > 0 ? 'up' : 'down'}`, `Later exams have ${dir} ${what} than earlier ones (${e} of ${E.length} → ${l} of ${L.length})`, 'observed', delta > 0 ? L.filter(has(code)) : E.filter(has(code)), [...E, ...L], {
            share: delta,
            materials: early.length + late.length,
            caveat: `Ordered by the terms the files name, up to ${lateTerm}. A trend across a few exams can be chance.`,
          })
        );
      }
    }
  }
  return out;
}

// ── teaching ─────────────────────────────────────────────────────────

function teaching(T: Placed[], digests: MaterialDigest[]): Observation[] {
  const out: Observation[] = [];
  if (!T.length) return out;
  const n = T.length;
  const teachDigests = digests.filter((d) => SIDE_OF[d.material.kind] === 'teaching' || (d.material.kind === 'study-guide' && d.units.some((u) => u.kind === 'section')));
  const onlySlides = teachDigests.every((d) => d.material.kind === 'slides');
  const secs = (k: number) => (onlySlides ? (k === 1 ? 'slide' : 'slides') : k === 1 ? 'section' : 'sections');
  // depth: from the prose itself
  const st = teachDigests.reduce(
    (a, d) => ({ sentences: a.sentences + d.stats.sentences, words: a.words + d.stats.words, long: a.long + d.stats.longWords, eq: a.eq + d.stats.equations }),
    { sentences: 0, words: 0, long: 0, eq: 0 }
  );
  const perSentence = st.sentences ? st.words / st.sentences : 0;
  const longShare = st.words ? st.long / st.words : 0;
  const eqUnits = T.filter(has('equation'));
  const eqShare = pct(eqUnits.length, n);
  const depth = eqShare >= 0.4 || (longShare >= 0.17 && perSentence >= 18) ? 'formal' : perSentence <= 12 && eqShare < 0.25 ? 'compact' : 'moderate';
  const depthSaid =
    depth === 'formal'
      ? `Explanations are technical: equations or derivations in ${ofSaid(eqUnits.length, n, secs(n))}, and long, precise sentences`
      : depth === 'compact'
        ? `Explanations are compact: short points (about ${Math.round(perSentence)} words a sentence) rather than long derivations`
        : `Explanations are moderately detailed: about ${Math.round(perSentence)} words a sentence${eqUnits.length ? `, with equations in ${ofSaid(eqUnits.length, n, secs(n))}` : ''}`;
  out.push(
    make('depth', depth, `depth.${depth}`, depthSaid, 'inferred', depth === 'formal' ? eqUnits.length ? eqUnits : T : T, T, {
      consistency: depth === 'formal' ? Math.max(eqShare, 0.5) : 0.7,
      ...(onlySlides ? { caveat: 'Slides are compact by nature; notes or readings would show more of how ideas are developed.' } : {}),
    })
  );
  // concepts or practice
  const conceptual = T.filter((p) => p.unit.codes.includes('why') || p.unit.codes.includes('definition') || p.unit.codes.includes('link'));
  const practical = T.filter((p) => p.unit.codes.includes('worked') || p.unit.codes.includes('application') || (p.unit.codes.includes('num') && p.unit.codes.includes('equation')));
  const c = pct(conceptual.length, n);
  const pr = pct(practical.length, n);
  const lean = pr >= c + 0.2 ? 'practical' : c >= pr + 0.2 ? 'conceptual' : 'balanced';
  out.push(
    make(
      'emphasis',
      lean,
      `emphasis.${lean}`,
      lean === 'practical'
        ? `Leans on worked problems and applications (${ofSaid(practical.length, n, secs(n))}) more than on why things happen`
        : lean === 'conceptual'
          ? `Leans on concepts — definitions, why things happen, how ideas connect (${ofSaid(conceptual.length, n, secs(n))}) — more than worked problems`
          : `Balances concepts (${conceptual.length}) with worked problems and applications (${practical.length})`,
      'inferred',
      lean === 'practical' ? practical : lean === 'conceptual' ? conceptual : [...conceptual, ...practical],
      T,
      { consistency: Math.max(c, pr, 0.5) }
    )
  );
  // examples, analogies, applications: counted
  const ex = T.filter(has('example'));
  if (ex.length) out.push(make('examples', ex.length / n >= 0.35 ? 'frequent' : 'some', ex.length / n >= 0.35 ? 'examples.frequent' : 'examples.some', `Works through an example in ${ofSaid(ex.length, n, secs(n))}`, 'observed', ex, T, { share: pct(ex.length, n) }));
  const an = T.filter(has('analogy'));
  if (an.length >= 2 || pct(an.length, n) >= 0.2) out.push(make('examples', 'analogies', 'examples.analogies', `Explains with analogies in ${ofSaid(an.length, n, secs(n))}`, 'observed', an, T, { share: pct(an.length, n) }));
  const ap = T.filter(has('application'));
  if (ap.length >= 2 || pct(ap.length, n) >= 0.2) out.push(make('examples', 'applications', 'examples.applications', `Ties ideas to real-world applications in ${ofSaid(ap.length, n, secs(n))}`, 'observed', ap, T, { share: pct(ap.length, n) }));
  // how a topic is opened
  const opened = T.filter((p) => p.unit.codes.some((x) => x.startsWith('intro.')) && !/^(Slide \d+)$/.test(p.unit.label));
  if (opened.length >= 4) {
    const tally: Record<string, Placed[]> = {};
    for (const p of opened) {
      const k = p.unit.codes.find((x) => x.startsWith('intro.'))!.slice(6);
      (tally[k] ??= []).push(p);
    }
    const [top, list] = Object.entries(tally).sort((a, b) => b[1].length - a[1].length)[0];
    const share = pct(list.length, opened.length);
    if (top !== 'statement' && share >= 0.4) {
      const what = top === 'example' ? 'an example, before the general idea' : top === 'question' ? 'a question or a puzzle' : 'a definition';
      const code = top === 'example' ? 'intro.example-first' : top === 'question' ? 'intro.question-first' : 'intro.definition-first';
      out.push(make('intro', top, code, `New topics usually open with ${what} (${ofSaid(list.length, opened.length, secs(opened.length))})`, 'inferred', list, opened, { consistency: share, share }));
    }
  }
  // connections: the words that draw them, and the ideas taken together
  const ln = T.filter(has('link'));
  if (ln.length >= 2) out.push(make('links', 'back', 'links.back', `Connects new ideas to earlier ones — “recall”, “builds on”, “compare” — in ${ofSaid(ln.length, n, secs(n))}`, 'observed', ln, T, { share: pct(ln.length, n) }));
  // how lessons are built
  const STRUCT: [string, string, string][] = [
    ['objective', 'objectives', 'States learning objectives'],
    ['recap', 'recaps', 'Sums up with a recap or key points'],
    ['check', 'checks', 'Stops for a check of understanding or a problem to try'],
    ['worked', 'worked', 'Shows worked solutions step by step'],
    ['graph', 'diagrams', 'Draws a graph or diagram'],
  ];
  for (const [code, key, what] of STRUCT) {
    const shown = T.filter(has(code));
    if (shown.length < 2 && pct(shown.length, n) < 0.2) continue;
    out.push(make('structure', key, `structure.${key}`, `${what} in ${ofSaid(shown.length, n, secs(n))}`, 'observed', shown, T, { share: pct(shown.length, n) }));
  }
  return out;
}

// ── vocabulary, concepts, and how they go together ────────────────────

export function conceptsOf(A: Placed[], T: Placed[], digests: MaterialDigest[], cap = 16): CourseConcept[] {
  const tally = new Map<string, { a: Placed[]; t: Placed[]; pts: number }>();
  const add = (p: Placed, side: 'a' | 't') => {
    for (const term of p.unit.terms) {
      const e = tally.get(term) ?? { a: [], t: [], pts: 0 };
      e[side].push(p);
      if (side === 'a') e.pts += p.unit.points ?? 1;
      tally.set(term, e);
    }
  };
  A.forEach((p) => add(p, 'a'));
  T.forEach((p) => add(p, 't'));
  const defined = new Set(digests.flatMap((d) => [...d.defined, ...d.abbreviations.map(([, phrase]) => phrase)]));
  const scored = [...tally.entries()]
    .map(([term, e]) => {
      const spreadDocs = new Set([...e.a, ...e.t].map((p) => p.doc)).size;
      // what assessments ask about counts most; taught and defined terms next; one word counts less than a phrase
      const s = (e.pts * 2 + e.t.length) * (term.includes(' ') ? 1.3 : 0.6) * (defined.has(term) ? 1.4 : 1) * (spreadDocs >= 2 ? 1.2 : 1);
      return { term, e, s, spreadDocs };
    })
    .filter((x) => x.e.a.length + x.e.t.length >= 2 && (x.e.a.length >= 2 || x.e.t.length >= 3 || (defined.has(x.term) && x.e.a.length + x.e.t.length >= 2)))
    .sort((a, b) => b.s - a.s || a.term.localeCompare(b.term));
  // drop a word already inside a kept phrase, and a phrase inside a longer one that is as strong
  const kept: typeof scored = [];
  for (const x of scored) {
    if (kept.some((k) => k.term.split(' ').includes(x.term) || (k.term.includes(x.term) && x.term.includes(' ')))) continue;
    kept.push(x);
    if (kept.length >= cap) break;
  }
  const top = kept[0]?.s ?? 1;
  return kept.map((x) => ({
    term: x.term,
    weight: Math.round((x.s / top) * 100) / 100,
    inAssessment: x.e.a.length,
    inTeaching: x.e.t.length,
    evidence: spread([...x.e.a, ...x.e.t], 3),
  }));
}

/** Pairs of the course's concepts it keeps taking together (in three or more units). */
export function pairsOf(concepts: CourseConcept[], all: Placed[], min = 3): { a: string; b: string; units: Placed[] }[] {
  const top = concepts.slice(0, 12).map((c) => c.term);
  const out: { a: string; b: string; units: Placed[] }[] = [];
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const units = all.filter((p) => p.unit.terms.includes(top[i]) && p.unit.terms.includes(top[j]));
      if (units.length >= min) out.push({ a: top[i], b: top[j], units });
    }
  }
  return out.sort((x, y) => y.units.length - x.units.length).slice(0, 3);
}

// ── the syllabus ─────────────────────────────────────────────────────

const STATED_AS: Record<string, [Dimension, string, string | null]> = {
  'stated.format.mcq': ['formats', 'The syllabus says exams include multiple-choice questions', 'format.mcq'],
  'stated.format.free': ['formats', 'The syllabus says exams include short-answer or problem questions', 'format.free'],
  'stated.format.essay': ['formats', 'The syllabus mentions essays', 'format.essay'],
  'stated.cumulative': ['topics', 'The syllabus says the final is cumulative', null],
  'stated.calculator': ['numeric', 'The syllabus mentions calculators in exams', 'num'],
  'stated.graphs': ['graphs', 'The syllabus mentions graphs or diagrams in assessments', 'graph'],
  'stated.closed-book': ['formats', 'The syllabus says exams are closed book', null],
  'stated.open-book': ['formats', 'The syllabus allows notes or a formula sheet in exams', null],
  'stated.applied': ['recall', 'The syllabus says you will apply concepts to problems', null],
  'stated.conceptual': ['recall', 'The syllabus stresses conceptual understanding', null],
  'stated.discussion': ['structure', 'The syllabus describes discussion or in-class activities', null],
  'stated.cases': ['examples', 'The syllabus mentions case studies', null],
  'stated.objectives': ['structure', 'The syllabus lists learning outcomes', null],
  'stated.weights': ['formats', 'The syllabus gives how assessments are weighted', null],
};

function stated(digests: MaterialDigest[], A: Placed[]): Observation[] {
  const out: Observation[] = [];
  const syllabi = digests.filter((d) => d.material.kind === 'syllabus');
  for (const d of syllabi) {
    for (const s of d.stated) {
      const map = STATED_AS[s.code];
      if (!map) continue;
      const [dimension, said, seenCode] = map;
      const side = SIDE_OF_DIMENSION[dimension];
      const seen = seenCode ? A.filter(has(seenCode)).length : 0;
      const caveat =
        side === 'teaching'
          ? 'A syllabus says what a course intends; slides, notes or past exams would show how it is actually taught.'
          : !A.length
            ? 'Add a past exam or quiz to see whether it holds.'
            : seenCode
              ? seen
                ? `Matches what your past exams show (${seen} of ${A.length} questions).`
                : 'Not seen in the past exams you added.'
              : undefined;
      const { confidence, score } = calibrate({ units: 1 + Math.min(seen, 3), of: 1, materials: 1 + (seen ? 1 : 0), basis: 'stated', consistency: seenCode && A.length && !seen ? 0.2 : 1, side });
      out.push({
        id: `${dimension}:${s.code}`,
        dimension,
        code: s.code,
        said,
        basis: 'stated',
        confidence,
        score,
        support: { units: 1, of: 1, materials: 1, kinds: ['syllabus'] },
        evidence: [s.evidence],
        ...(caveat ? { caveat } : {}),
      });
    }
  }
  return out;
}

// ── all of it ────────────────────────────────────────────────────────

export interface Observed {
  observations: Observation[];
  concepts: CourseConcept[];
  vocabulary: { terms: string[]; abbreviations: [string, string][] };
}

const DIMENSION_ORDER: Dimension[] = ['formats', 'difficulty', 'recall', 'numeric', 'graphs', 'wording', 'topics', 'trend', 'depth', 'terms', 'emphasis', 'examples', 'intro', 'links', 'structure'];

/** Everything the materials show, said with its evidence, its basis and its confidence. */
export function observe(digests: readonly MaterialDigest[]): Observed {
  const placed = (d: MaterialDigest): Placed[] => d.units.map((unit) => ({ unit, doc: d.material.doc, kind: d.material.kind, order: d.material.order ?? 0 }));
  const all = digests.flatMap(placed);
  const A = all.filter((p) => p.unit.kind === 'item' && SIDE_OF[p.kind] === 'assessment');
  const T = all.filter((p) => p.unit.kind === 'section' && p.kind !== 'syllabus');
  const out: Observation[] = [...assessment(A, digests as MaterialDigest[]), ...teaching(T, digests as MaterialDigest[]), ...stated(digests as MaterialDigest[], A)];

  const concepts = conceptsOf(A, T, digests as MaterialDigest[]);
  // what keeps coming up in assessments, said once with the concepts and their counts
  const definedTerms = new Set(digests.flatMap((d) => [...d.defined, ...d.abbreviations.map(([, phrase]) => phrase)]));
  const telling = (c: CourseConcept) => c.term.includes(' ') || definedTerms.has(c.term);
  const recurring = concepts.filter((c) => c.inAssessment >= 2);
  const asked = [...recurring.filter(telling), ...recurring.filter((c) => !telling(c))].slice(0, 6);
  if (asked.length) {
    const shown = A.filter((p) => asked.some((c) => p.unit.terms.includes(c.term)));
    out.push(
      make('topics', 'recurring', 'topics.recurring', `What past questions keep coming back to: ${asked.map((c) => `${c.term} (${c.inAssessment})`).join(', ')}`, 'observed', shown, A, {
        terms: asked.map((c) => c.term),
        share: pct(shown.length, A.length),
      })
    );
  }
  // the course's own words
  const abbreviations = (() => {
    const m = new Map<string, string>();
    for (const d of digests) for (const [a, p] of d.abbreviations) if (!m.has(a)) m.set(a, p);
    return [...m.entries()].slice(0, 12);
  })();
  // the course's own words: its phrases and the words it defines, before single common words
  const vocabTerms = [...concepts.filter(telling), ...concepts.filter((c) => !telling(c))].slice(0, 12).map((c) => c.term);
  if (vocabTerms.length >= 3) {
    const shown = all.filter((p) => vocabTerms.some((t) => p.unit.terms.includes(t)));
    const abbr = abbreviations.slice(0, 4).map(([a, p]) => `${p} (${a})`);
    out.push(
      make('terms', 'vocabulary', 'terms.vocabulary', `Uses its own terms throughout: ${vocabTerms.slice(0, 6).join(', ')}${abbr.length ? `; abbreviations such as ${abbr.join(', ')}` : ''}`, 'observed', shown, all, {
        terms: vocabTerms,
      })
    );
  }
  // ideas it takes together
  const pairs = pairsOf(concepts, [...A, ...T]);
  if (pairs.length) {
    const units = [...new Set(pairs.flatMap((p) => p.units))];
    out.push(
      make('links', 'pairs', 'links.pairs', `Often takes ideas together: ${pairs.map((p) => `${p.a} with ${p.b} (${p.units.length})`).join('; ')}`, 'observed', units, [...A, ...T], {
        terms: pairs.flatMap((p) => [p.a, p.b]),
      })
    );
  }
  // a profile with nothing but a syllabus says so on every teaching line
  if (!T.length && !A.length && digests.some((d) => d.material.kind === 'syllabus')) {
    for (const o of out) if (!o.caveat) o.caveat = 'From the syllabus alone: add slides, notes or a past exam to see how the course actually teaches and assesses.';
  }
  out.sort((a, b) => DIMENSION_ORDER.indexOf(a.dimension) - DIMENSION_ORDER.indexOf(b.dimension) || b.score - a.score || a.id.localeCompare(b.id));
  return { observations: out, concepts, vocabulary: { terms: vocabTerms, abbreviations } };
}
