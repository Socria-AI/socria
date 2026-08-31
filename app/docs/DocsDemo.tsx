'use client';

// The wiki's own live demonstrations — pieces the /logos page doesn't show.
//
// Same rule as there: these are the REAL components the app renders, mounted
// with canned data, never look-alikes. The heavier Logos exhibits (the split
// view, the lenses, the moves, the Board, the guard, depth, the dials) are
// imported straight from app/logos/LogosDemo.tsx by the content pages;
// docs.css carries the re-scoped demo chrome that makes both sets sit in a
// wiki figure.

import { useState, type ReactNode } from 'react';
import { MathBoard } from '@/components/MathBoard';
import { MathPlot } from '@/components/MathPlot';
import { MathViz } from '@/components/MathViz';
import { sanitizeViz, type VizScene } from '@/lib/logos-viz';
import { COUNTER_SCOPE, PLANS, type Counter } from '@/lib/entitlements';
import { SOCRIA_ONE } from '@/lib/socria-one';
import { ModelPicker } from '@/components/ModelPicker';
import { SynthesisCard } from '@/components/SynthesisCard';
import { ChoiceChips } from '@/components/ChoiceChips';
import type { ThinkingMap } from '@/lib/logos';
import type { SocriaModel } from '@/lib/socria-prompt';
import type { SynthesisData } from '@/lib/synthesis';

/** The same framed figure the imported Logos demos use. */
export function DocsFrame({
  label,
  height,
  bare = false,
  children,
}: {
  label: string;
  height?: number;
  /** chat-side components style themselves; skip the Logos surface wrapper */
  bare?: boolean;
  children: React.ReactNode;
}) {
  return (
    <figure className="ui-frame">
      <div className="ui-chrome" aria-hidden="true">
        <span className="ui-addr">Socria · live</span>
      </div>
      <div className="ui-body" style={height ? { height } : undefined}>
        {bare ? (
          <div className="d-demo-bare">{children}</div>
        ) : (
          <div className="logos-root lg-demo">{children}</div>
        )}
      </div>
      <figcaption className="ui-cap">{label}</figcaption>
    </figure>
  );
}

/* ── the function plot, on a small plottable map ──────────────────── */
// The equation nodes of the worked demo carry "= 0", which the sandboxed
// evaluator rightly refuses — an equation is not a curve. This map holds the
// same problem's function side, so the plot has something honest to draw.
const PLOT_MAP: ThinkingMap = {
  context: 'math',
  intent: 'exploration',
  nodes: [
    { id: 'p1', type: 'equation', label: 'the parabola', tex: 'x^2 - 5x + 6' },
    { id: 'p2', type: 'equation', label: 'its slope', tex: '2x - 5' },
  ],
  edges: [{ from: 'p1', to: 'p2', relation: 'transforms_to', op: 'differentiate' }],
};

export function DemoPlot() {
  return (
    <DocsFrame label="The Plot lens — the demo problem’s parabola, and its slope" height={330}>
      <div className="lg-panel" style={{ height: '100%' }}>
        <MathPlot map={PLOT_MAP} width={680} height={300} />
      </div>
    </DocsFrame>
  );
}

/* ── economics ─────────────────────────────────────────────────────── */
// Live, like the calculus scenes: drag the shift sliders and the equilibrium
// moves, because the crossing is computed rather than drawn.

const MARKET = viz({
  kind: 'supply-demand',
  demand: { intercept: 100, slope: -1 },
  supply: { intercept: 20, slope: 1 },
});
const CEILING = viz({
  kind: 'supply-demand',
  demand: { intercept: 100, slope: -1 },
  supply: { intercept: 20, slope: 1 },
  control: { kind: 'ceiling', at: 45 },
  surplus: true,
});
const PPC = viz({
  kind: 'ppc',
  frontier: { xMax: 100, yMax: 80, bowed: true },
  axes: { x: 'Guns', y: 'Butter' },
});
const ADAS = viz({
  kind: 'ad-as',
  ad: { intercept: 140, slope: -1 },
  sras: { intercept: 20, slope: 1 },
  potential: 60,
});

export function DemoMarket() {
  return (
    <VizFigure
      scene={MARKET}
      label="Shift demand or supply — the crossing moves, and so do P* and Q*"
      height={560}
    />
  );
}

export function DemoCeiling() {
  return (
    <VizFigure
      scene={CEILING}
      label="A price ceiling: the shortage, what actually trades, and the surplus destroyed"
      /* Eight readings, a third slider and a two-line narration all keep
         their size when the figure is short — the plot is the only thing
         that gives, and it is the only thing worth looking at. */
      height={720}
    />
  );
}

export function DemoPpc() {
  return (
    <VizFigure
      scene={PPC}
      label="Slide along the frontier — each extra unit of one good costs more of the other"
      height={600}
    />
  );
}

export function DemoAdAs() {
  return (
    <VizFigure
      scene={ADAS}
      label="AD, SRAS and LRAS — the output gap is the distance from potential"
      height={600}
    />
  );
}

/* ── what each plan holds ──────────────────────────────────────────── */
// Read from lib/entitlements at render time rather than typed out.
//
// The table this replaces said a free map holds 4 nodes when it holds 8, and
// listed six of the seven counters not at all. That is the ordinary fate of
// a number written down twice: the code moved and the docs did not. Now the
// page cannot disagree with the product, because it is reading the product.

/** How each counter is described to a reader, and what its period is. */
const COUNTER_LABEL: Record<Counter, string> = {
  chats: 'Lines of thinking begun',
  explore: 'Explore, on a node',
  research: 'Research runs',
  challenge: 'Challenge — Logos pushing back',
  context: 'Nodes grounded in your own material',
  images: 'Images read',
  files: 'Files read',
};

const PERIOD: Record<'month' | 'chat', string> = {
  month: 'per month',
  chat: 'per conversation',
};

/** The free tier's numbers are boundaries someone will actually meet. */
function cap(n: number | null): string {
  return n === null ? 'Uncapped' : String(n);
}

/**
 * One's numbers are not the same kind of thing.
 *
 * Where a cap exists at all it is a fair-use ceiling set where nobody working
 * seriously will meet it — so printing a bare "400" next to the free tier's
 * "2" invites the reader to compare two figures that mean different things,
 * and makes a plan sold as "without the limits" look metered. The number is
 * still shown, because hiding it would be the other kind of dishonest.
 */
function oneCap(n: number | null): ReactNode {
  if (n === null) return 'Uncapped';
  return (
    <>
      {n} <span className="d-dim">fair use</span>
    </>
  );
}

export function DemoLimitsTable() {
  const free = PLANS.free;
  const one = PLANS.one;
  const counters = Object.keys(COUNTER_LABEL) as Counter[];
  return (
    <div className="d-tablewrap">
      <table>
        <thead>
          <tr>
            <th>What</th>
            <th>Free</th>
            <th>
              Socria One · {SOCRIA_ONE.currency}
              {SOCRIA_ONE.price}/{SOCRIA_ONE.period}
            </th>
          </tr>
        </thead>
        <tbody>
          {counters.map((c) => (
            <tr key={c}>
              <td>
                {COUNTER_LABEL[c]}{' '}
                <span className="d-dim">{PERIOD[COUNTER_SCOPE[c]]}</span>
              </td>
              <td>{cap(free.counters[c])}</td>
              <td>{oneCap(one.counters[c])}</td>
            </tr>
          ))}
          <tr>
            <td>Nodes a map grows to</td>
            <td>{cap(free.mapNodes)}</td>
            <td>{oneCap(one.mapNodes)}</td>
          </tr>
          <tr>
            <td>Lenses onto the map</td>
            <td>{cap(free.lenses)}</td>
            <td>All of them</td>
          </tr>
          <tr>
            <td>Thinking depth</td>
            <td>{free.allDepths ? 'All four' : 'Balanced only'}</td>
            <td>{one.allDepths ? 'All four' : 'Balanced only'}</td>
          </tr>
          <tr>
            <td>The map re-organising as you talk</td>
            <td>{free.liveMap ? 'Yes' : '—'}</td>
            <td>{one.liveMap ? 'Yes' : '—'}</td>
          </tr>
          <tr>
            <td>Turns the memory carries</td>
            <td>{cap(free.memoryTurns)}</td>
            <td>{oneCap(one.memoryTurns)}</td>
          </tr>
          <tr>
            <td>Attachments on one message</td>
            <td>{free.attachmentsPerMessage}</td>
            <td>{one.attachmentsPerMessage}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ── the interactive graph ─────────────────────────────────────────── */
// These are live MathViz instances, not pictures of one. Every control below
// works in the page: drag the slider, press play, scroll to zoom, drag to
// pan. That is the point of showing them here rather than screenshotting —
// a screenshot of an instrument tells you it exists; the instrument tells you
// what it does.
//
// sanitizeViz is the same gate the model's output passes through, so a scene
// that would be rejected in the product is rejected here too. If one of these
// ever stops rendering, the docs are telling the truth about a real break.

function viz(raw: unknown): VizScene | null {
  return sanitizeViz(raw);
}

const SECANT = viz({ kind: 'derivative', expr: 'sin(x)', varName: 'x', a: 1 });
const RIEMANN = viz({ kind: 'riemann', expr: 'x^2', varName: 'x', a: 0, b: 2 });
const LIMIT = viz({ kind: 'limit', expr: '(x^2 - 9)/(x - 3)', varName: 'x', a: 3 });
const TAYLOR = viz({ kind: 'taylor', expr: 'exp(x)', varName: 'x', a: 0, order: 6 });
const VECTORS = viz({
  kind: 'vectors',
  vectors: [{ x: 2, y: 1, label: 'u' }, { x: -1, y: 2, label: 'v' }],
});
const DIST = viz({ kind: 'distribution', dist: 'normal', mu: 0, sigma: 1 });

/** One live scene in a wiki figure. Renders nothing if the scene is invalid. */
function VizFigure({
  scene,
  label,
  height = 560,
}: {
  scene: VizScene | null;
  label: string;
  height?: number;
}) {
  if (!scene) return null;
  // MathViz stacks a narration column, a row of readings, the transport and
  // a full-width slider around the plot. Give the figure too little and all
  // of that keeps its size while the drawing — the only part anyone came to
  // look at — is what shrinks.
  return (
    <DocsFrame label={label} height={height}>
      <div className="lg-panel" style={{ height: '100%', position: 'relative' }}>
        <MathViz scene={scene} width={680} height={height - 24} />
      </div>
    </DocsFrame>
  );
}

/** The secant becoming a tangent — the moment the derivative is defined. */
export function DemoVizDerivative() {
  return (
    <VizFigure
      scene={SECANT}
      label="Drag h toward 0, or press play — the secant becomes the tangent"
    />
  );
}

/** Rectangles narrowing under a curve. */
export function DemoVizRiemann() {
  return (
    <VizFigure
      scene={RIEMANN}
      label="More rectangles, each thinner — the staircase closing on the area"
    />
  );
}

/** Two readings closing in on a value the function never takes. */
export function DemoVizLimit() {
  return (
    <VizFigure
      scene={LIMIT}
      label="Squeeze δ toward 0 — both sides arrive where the function has a hole"
    />
  );
}

/** A polynomial growing degree by degree until it hugs the curve. */
export function DemoVizTaylor() {
  return (
    <VizFigure
      scene={TAYLOR}
      label="Each degree of the Taylor polynomial, added one at a time"
    />
  );
}

/** Linear algebra and probability, in the same instrument. */
export function DemoVizOthers() {
  return (
    <>
      <VizFigure
        scene={VECTORS}
        label="Slide s and t — everything the combination s·u + t·v can reach"
        height={500}
      />
      <VizFigure
        scene={DIST}
        label="A normal distribution, with the area under the interval you choose"
        height={500}
      />
    </>
  );
}

/* ── the same vocabulary, at college level ────────────────────────── */
// Two more worked Boards, because the quadratic undersells the range. The
// point these make is that nothing math-specific was added for them: the
// same eleven node types, the same chain edges with the operation written
// on them, carry integration by parts and a hypothesis test unchanged.

/** Integration by parts — with the classic dropped minus, kept and repaired. */
const CALC_MAP: ThinkingMap = {
  context: 'math',
  intent: 'learning',
  nodes: [
    { id: 'cg', type: 'given', label: 'the integral', tex: '\\int x\\, e^x \\,dx' },
    { id: 'cu', type: 'unknown', label: 'the antiderivative', tex: 'F(x)' },
    {
      id: 'ct',
      type: 'theorem',
      label: 'integration by parts',
      tex: '\\int u\\,dv = uv - \\int v\\,du',
    },
    { id: 'cs', type: 'equation', label: 'choosing parts', tex: 'u = x,\\quad dv = e^x\\,dx' },
    {
      id: 'ce',
      type: 'error',
      label: 'sign slip',
      tex: 'x e^x + \\int e^x \\,dx',
      flag: 'error',
      note: 'by parts subtracts $\\int v\\,du$ — minus, not plus',
    },
    { id: 'cr', type: 'result', label: 'the antiderivative', tex: 'x e^x - e^x + C' },
    {
      id: 'cv',
      type: 'verification',
      label: 'differentiate to check',
      tex: "\\tfrac{d}{dx}\\left(x e^x - e^x\\right) = x\\,e^x",
      flag: 'verified',
    },
  ],
  edges: [
    { from: 'cg', to: 'cs', relation: 'transforms_to', op: 'pick u and dv' },
    { from: 'cs', to: 'ce', relation: 'transforms_to', op: 'apply the rule' },
    { from: 'ce', to: 'cr', relation: 'revises', op: 'restore the minus' },
    { from: 'cr', to: 'cv', relation: 'transforms_to', op: 'check' },
    { from: 'ct', to: 'cs', relation: 'justifies' },
  ],
};

/** A one-sample t-test — givens, the statistic as a theorem aside, a verdict. */
const STATS_MAP: ThinkingMap = {
  context: 'math',
  intent: 'verification',
  nodes: [
    { id: 'sg', type: 'given', label: 'the sample', tex: 'n = 40,\\ \\bar{x} = 52.3,\\ s = 6.8' },
    { id: 'sh', type: 'given', label: 'the claim to test', tex: 'H_0\\colon \\mu = 50' },
    { id: 'su', type: 'unknown', label: 'is the shift real?', tex: 'H_a\\colon \\mu \\neq 50' },
    {
      id: 'st',
      type: 'theorem',
      label: 'the t-statistic',
      tex: 't = \\dfrac{\\bar{x} - \\mu_0}{s/\\sqrt{n}}',
    },
    { id: 's1', type: 'step', label: 'standardize', tex: 't = \\dfrac{52.3 - 50}{6.8/\\sqrt{40}} \\approx 2.14' },
    { id: 's2', type: 'step', label: 'the threshold', tex: 't_{0.025,\\,39} \\approx 2.02' },
    {
      id: 'sr',
      type: 'result',
      label: 'the verdict',
      tex: '2.14 > 2.02 \\;\\Rightarrow\\; \\text{reject } H_0',
      note: 'at the 5% level, the shift is unlikely to be chance',
    },
  ],
  edges: [
    { from: 'sg', to: 's1', relation: 'transforms_to', op: 'standardize' },
    { from: 's1', to: 'sr', relation: 'implies' },
    { from: 's2', to: 'sr', relation: 'implies', op: 'compare' },
    { from: 'st', to: 's1', relation: 'justifies' },
  ],
};

const COLLEGE = [
  { id: 'calc', label: 'Calculus', map: CALC_MAP, height: 570,
    blurb: 'integration by parts — the dropped minus stays on the board, repaired beside itself' },
  { id: 'stats', label: 'Statistics', map: STATS_MAP, height: 470,
    blurb: 'a one-sample t-test — the statistic sits in the margin as the rule that licenses the step' },
] as const;

export function DemoCollege() {
  const [tab, setTab] = useState<'calc' | 'stats'>('calc');
  const cur = COLLEGE.find((c) => c.id === tab)!;
  return (
    <div className="ui-lenses">
      <div className="ui-lenstabs" role="tablist" aria-label="Subject">
        {COLLEGE.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={tab === c.id}
            className={`lg-lens${tab === c.id ? ' is-on' : ''}`}
            onClick={() => setTab(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <p className="ui-lensblurb">{cur.blurb}</p>
      <DocsFrame label="The same Board, no new vocabulary — switch subject" height={cur.height}>
        <div className="lg-panel" style={{ height: '100%' }}>
          <div className="lg-map-wrap" style={{ height: '100%' }}>
            <div className="lg-map">
              <MathBoard key={cur.id} map={cur.map} width={680} height={cur.height - 40} />
            </div>
          </div>
        </div>
      </DocsFrame>
    </div>
  );
}

/* ── the model picker, as it sits beside the chat box ─────────────── */
export function DemoModelPicker() {
  const [model, setModel] = useState<SocriaModel>('core-2');
  return (
    <DocsFrame label="The model switcher — open it, pick one" bare>
      <div className="d-pickerdemo">
        <ModelPicker value={model} onChange={setModel} isSignedIn />
        <p className="d-pickernote">
          {model === 'logos'
            ? 'In the app this swaps the whole surface into Logos, in place.'
            : `Selected: Socria ${model === 'core-3' ? 'Core 3.1' : 'Core 2'}.`}
        </p>
      </div>
    </DocsFrame>
  );
}

/* ── Core 3.1's synthesis card, with the demo conversation's content ── */
const SYNTHESIS: SynthesisData = {
  title: 'Choosing Growth Over Familiarity',
  sections: [
    {
      label: 'Recurring themes',
      items: ['The raise keeps standing in for progress', 'Learning matters more to you than title'],
    },
    {
      label: 'Tensions',
      items: ['Security pulls against growth', 'Wanting the offer vs. wanting what it proves'],
    },
    {
      label: 'Hidden assumptions',
      items: ['More money means the work got better', 'Staying means standing still'],
    },
    {
      label: 'Possible reframes',
      items: ['Judge the role by its first three months of new problems'],
    },
  ],
};

export function DemoSynthesis() {
  return (
    <DocsFrame label="A synthesis card — tap the section tabs" bare>
      <div className="d-carddemo">
        <SynthesisCard data={SYNTHESIS} />
      </div>
    </DocsFrame>
  );
}

/* ── choice chips under a Core 3.1 question ───────────────────────── */
const CHIPS = [
  'Honestly, I don’t know what it would teach me',
  'New domain — but the same skills, and that worries me',
  'It teaches me to manage, which I may not want',
  'Maybe I’m asking the wrong question entirely',
];

export function DemoChips() {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <DocsFrame label="Choice chips — every option in your own first person" bare>
      <div className="d-carddemo">
        <p className="d-chipq">What would the new role teach you?</p>
        <ChoiceChips choices={CHIPS} onPick={setPicked} />
        <p className="d-pickernote" aria-live="polite">
          {picked ? <>Sent as: &ldquo;{picked}&rdquo;</> : 'In the app, picking one sends it as your reply.'}
        </p>
      </div>
    </DocsFrame>
  );
}
