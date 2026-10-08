'use client';

// A LIVE 3D DESIGN, DRAWN ON A DOCS PAGE.
//
// The words above each figure are read by Live 3D's own reader
// (lib/objects/scene-intent.ts) — in this browser, as the page loads — and
// the scene they build is drawn by the panel's own canvas
// (components/scene3d/SceneCanvas.tsx). Nothing here is a picture of a
// design: it is the design, built from the description, and it can be turned,
// zoomed and clicked like the one in the workspace.
//
// Until the figure is near the screen — and in a browser with no WebGL, with
// JavaScript off, or in print — the same scene is shown from above, computed
// from the same geometry (lib/objects/scene-plan.ts) by the page on the server
// and handed in, so the page and the figure agree to the last pixel.
//
// A page of fifteen of these must still scroll: the canvas takes the wheel and
// a dragging finger only after it is clicked, and gives them back when the
// pointer leaves it.

import dynamic from 'next/dynamic';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { readScene } from '@/lib/objects/scene-intent';
import type { PlanPath } from '@/lib/objects/scene-plan';
import type { SceneState } from '@/lib/objects/scene';
import '@/components/scene3d/scene3d.css';

const SceneCanvas = dynamic(() => import('@/components/scene3d/SceneCanvas').then((m) => m.SceneCanvas), {
  ssr: false,
  loading: () => <div className="d-cad-wait">Starting the 3D view…</div>,
});

const EMPTY: SceneState = { nodes: [], next: 1, unit: 'm' };

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** If the canvas cannot start after all, the plan stays. */
class Guard extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** The plan box the page computes the outlines for. */
const PLAN_W = 640;
const PLAN_H = 300;

/** The scene seen from above: every part's outline, as the map card draws it. */
function Plan({ paths, title }: { paths: PlanPath[]; title: string }) {
  if (!paths.length) return null;
  return (
    <svg className="d-cad-plan" viewBox={`0 0 ${PLAN_W} ${PLAN_H}`} role="img" aria-label={`${title}, seen from above: ${paths.length} part${paths.length === 1 ? '' : 's'}`}>
      {paths.map((p) => (
        <path key={p.id} d={p.d} fillRule="evenodd" fill={p.color} fillOpacity={0.5} stroke="currentColor" strokeOpacity={0.55} strokeWidth={0.8} strokeDasharray={p.silhouette ? undefined : '3 2'} />
      ))}
    </svg>
  );
}

export function DemoScene({ say, title, plan: paths }: { say: string; title: string; plan: PlanPath[] }) {
  const scene = useMemo(() => readScene(say, EMPTY).preview, [say]);
  const host = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const [gl, setGl] = useState<boolean | null>(null);
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);

  useEffect(() => setGl(hasWebGL()), []);

  useEffect(() => {
    const el = host.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  const live = near && gl === true;
  const plan = <Plan paths={paths} title={title} />;
  return (
    <figure className={`d-cad${active ? ' is-active' : ''}`} ref={host} onMouseLeave={() => setActive(false)}>
      <div className="d-cad-stage">
        {live ? (
          <Guard fallback={plan}>
            <SceneCanvas scene={scene} base={scene} changes={null} selected={selected} onSelect={setSelected} mode="translate" snap={false} fitKey={fitKey} />
          </Guard>
        ) : (
          plan
        )}
        {live && !active && (
          <button type="button" className="d-cad-wake" onClick={() => setActive(true)} aria-label={`Explore ${title} in 3D`}>
            <span>Click to turn and zoom</span>
          </button>
        )}
      </div>
      <figcaption className="d-cad-cap">
        <span>
          {live
            ? active
              ? 'Drag to turn it · scroll or pinch to zoom · click a part for its name and size'
              : 'Built in this browser by Live 3D’s own reader, from the words above'
            : gl === false
              ? 'Seen from above — this browser has no WebGL for the 3D view'
              : 'Seen from above'}
        </span>
        {live && (
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setFitKey((k) => k + 1);
            }}
          >
            Reset view
          </button>
        )}
      </figcaption>
    </figure>
  );
}
