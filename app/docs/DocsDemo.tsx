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
