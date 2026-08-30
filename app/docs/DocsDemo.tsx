'use client';

// The wiki's own live demonstrations — pieces the /logos page doesn't show.
//
// Same rule as there: these are the REAL components the app renders, mounted
// with canned data, never look-alikes. The heavier Logos exhibits (the split
// view, the lenses, the moves, the Board, the guard, depth, the dials) are
// imported straight from app/logos/LogosDemo.tsx by the content pages;
// docs.css carries the re-scoped demo chrome that makes both sets sit in a
// wiki figure.

import { useState } from 'react';
import { MathBoard } from '@/components/MathBoard';
import { MathPlot } from '@/components/MathPlot';
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
