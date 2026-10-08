'use client';
// components/logos3/LiveExample.tsx
//
// ONE THING LOGOS 3 BUILDS, BUILT HERE.
//
// A showcase item (lib/logos3-showcase.ts) is the words that ask for it. This
// draws what the product makes of those words, with the product's own code:
//
//   a model   the example's proposal goes through the engine's on-ramp
//             (openFromProposal — validated, solved, refused if it does not
//             hold), and the product's ModelView draws it, controls and all
//   a design  Live 3D's own reader turns the sentence into a scene, and the
//             workspace's own canvas draws it in 3D. Without WebGL — or until
//             the figure is wanted — the same scene is shown from above,
//             computed from the same geometry.
//
// So the figure on a cover or a page is the feature, in a smaller frame: move
// a control and it is solved again; drag the design and it turns.

import dynamic from 'next/dynamic';
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ModelView } from '@/components/model/ModelView';
import { ENGINEERING } from '@/lib/model/engineering';
import { DYNAMICS } from '@/lib/model/dynamics-examples';
import { EMPTY_WORKSPACE, editsState, modelFor, openFromProposal } from '@/lib/model/docs';
import { readScene } from '@/lib/objects/scene-intent';
import { planPaths } from '@/lib/objects/scene-plan';
import type { SceneState } from '@/lib/objects/scene';
import type { ShowcaseItem } from '@/lib/logos3-showcase';
import '@/components/scene3d/scene3d.css';

const SceneCanvas = dynamic(() => import('@/components/scene3d/SceneCanvas').then((m) => m.SceneCanvas), {
  ssr: false,
  loading: () => <div className="lx-wait">Starting the 3D view…</div>,
});

const EMPTY_SCENE: SceneState = { nodes: [], next: 1, unit: 'm' };

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** If the 3D canvas cannot start after all, the plan stays. */
class Guard extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ModelFigure({ id }: { id: string }) {
  const opened = useMemo(() => {
    const ex = [...ENGINEERING, ...DYNAMICS].find((e) => e.id === id);
    return ex ? openFromProposal(EMPTY_WORKSPACE, ex.model(), { at: 0 }) : null;
  }, [id]);
  if (!opened?.doc) return <p className="lx-said-not">{opened?.says ?? 'This example is not available.'}</p>;
  return <ModelView model={modelFor(opened.doc)} edits={editsState(opened.workspace) ?? undefined} fill />;
}

/** A design built from exactly the words shown beside it. */
function SceneFigure({ say, title }: { say: string; title: string }) {
  const scene = useMemo(() => readScene(say, EMPTY_SCENE).preview, [say]);
  const plan = useMemo(() => planPaths(scene, 640, 300), [scene]);
  const [gl, setGl] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setGl(hasWebGL()), []);
  const flat = (
    <svg className="lx-plan" viewBox="0 0 640 300" role="img" aria-label={`${title}, seen from above`}>
      {plan.map((p) => (
        <path key={p.id} d={p.d} fillRule="evenodd" fill={p.color} fillOpacity={0.5} stroke="currentColor" strokeOpacity={0.55} strokeWidth={0.8} strokeDasharray={p.silhouette ? undefined : '3 2'} />
      ))}
    </svg>
  );
  if (gl !== true) return flat;
  return (
    <Guard fallback={flat}>
      <SceneCanvas scene={scene} base={scene} changes={null} selected={selected} onSelect={setSelected} mode="translate" snap={false} fitKey={0} />
    </Guard>
  );
}

/** The figure alone — the frame, the words and the cue are the caller's. */
export function LiveFigure({ item }: { item: ShowcaseItem }) {
  return item.kind === 'scene' ? <SceneFigure say={item.said} title={item.title} /> : <ModelFigure id={item.id} />;
}
