'use client';

// components/surfaces/GravitySurface.tsx
//
// Gravity, integrated — the one surface where the answer is not known in
// advance.
//
// WHY THIS IS DIFFERENT FROM THE ORBIT DRAWING. Two bodies have a closed form:
// the ellipse can be drawn exactly and the position at any time solved for. At
// three it stops. There is no general solution, and Poincaré showed there
// cannot be — so the only way to show three bodies is to step them forward,
// and the only honest way to step them is with a scheme that does not
// manufacture energy while nobody is looking.
//
// Velocity Verlet does that (lib/logos-physics.ts). Its energy error
// oscillates rather than accumulating, so a circular orbit is still a circle
// after a hundred thousand steps; forward Euler spirals outward visibly within
// a minute. The readout shows the drift as it runs, because a simulation that
// does not show you its own error is asking to be trusted rather than checked.
//
// THE FIGURE-EIGHT is the one worth finding. Three equal masses chasing each
// other around a figure of eight is a real solution of the three-body problem,
// found in 2000 and stable enough to watch. Nothing about it is obvious, and
// no closed form produces it.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PHYS,
  barycentre,
  energy,
  gravityPreset,
  gravityRun,
  recentre,
  sayText,
  type Body,
  type GravityPreset,
} from '@/lib/logos-physics';
import { Surface3D, type RenderArgs, type SurfaceRender } from './Surface3D';

const PRESETS: { id: GravityPreset; label: string }[] = [
  { id: 'two', label: 'Two bodies' },
  { id: 'figure8', label: 'Figure eight' },
  { id: 'inner', label: 'Inner planets' },
  { id: 'binary', label: 'Binary + one' },
  { id: 'cluster', label: 'Twelve' },
];

/** Colour by mass, so the heavy one is readable at a glance. */
const MASS_COLOUR = ['#C2603A', '#D8B44A', '#4A6FA5', '#4F7A42', '#7A5C9E', '#5E9CA8', '#8C6239', '#A8452F'];

const GROUPS = [
  {
    id: 'system',
    label: 'System',
    ctls: [
      { id: 'preset', label: 'setup', min: 0, max: PRESETS.length - 1, step: 1, read: (v: number) => PRESETS[Math.round(v)].label, help: 'Which starting conditions. Each shows something the others cannot.' },
      { id: 'speed', label: 'speed', min: 0, max: 400, step: 5, read: (v: number) => `${v} steps/frame`, help: 'How many integration steps run per frame. The step size itself is fixed by the setup — this is how fast you watch it, not how coarsely it is computed.' },
    ],
  },
  {
    id: 'trace',
    label: 'Trace',
    ctls: [
      { id: 'trail', label: 'trail', min: 0, max: 900, step: 10, read: (v: number) => `${v} points`, help: 'How much of each path is kept. The trails are what make a three-body solution legible at all.' },
      { id: 'zoomf', label: 'frame', min: 0.3, max: 4, step: 0.05, read: (v: number) => `× ${v.toFixed(2)}`, help: 'How much of the system is in view.' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    ctls: [
      { id: 'rate', label: 'rate', min: 0, max: 3, step: 0.05, read: (v: number) => `× ${v.toFixed(2)}`, help: 'The clock. At zero everything holds still and you can still turn it.' },
    ],
  },
];

const LAYERS = [
  { id: 'trails', label: 'Trails' },
  { id: 'bodies', label: 'Bodies' },
  { id: 'com', label: 'Barycentre' },
  { id: 'labels', label: 'Labels' },
];

const INITIAL = { preset: 1, speed: 60, trail: 400, zoomf: 1, rate: 1 };

export function GravitySurface() {
  // The state the integrator owns. Held in a ref rather than in React state
  // because it changes sixty times a second and nothing about it belongs in a
  // render: the component reads it, it never sets it.
  const sim = useRef<{
    which: GravityPreset;
    bodies: Body[];
    trails: { x: number; y: number }[][];
    dt: number;
    eps: number;
    span: number;
    E0: number;
    steps: number;
  } | null>(null);
  const [, force] = useState(0);

  const boot = useCallback((which: GravityPreset) => {
    const p = gravityPreset(which);
    const bodies = recentre(p.bodies);
    sim.current = {
      which,
      bodies,
      trails: bodies.map(() => []),
      dt: p.dt,
      eps: p.eps,
      span: p.span,
      E0: energy(bodies, p.eps),
      steps: 0,
    };
  }, []);

  useEffect(() => {
    boot('figure8');
    force((n) => n + 1);
  }, [boot]);

  const render = useCallback(
    (a: RenderArgs): SurfaceRender => {
      const { W, H, cam, vals, layers } = a;
      const which = PRESETS[Math.round(vals.preset)].id;
      if (!sim.current || sim.current.which !== which) boot(which);
      const s = sim.current!;

      // Advance. The step COUNT is the control; the step SIZE belongs to the
      // setup, so turning the speed up never makes the integration coarser —
      // it only makes you watch more of it. That distinction is the difference
      // between a fast simulation and a wrong one.
      const n = Math.round(vals.speed) * (vals.rate ?? 1);
      if (n > 0) {
        s.bodies = gravityRun(s.bodies, s.dt, Math.round(n), s.eps);
        s.steps += Math.round(n);
        const keep = Math.round(vals.trail);
        s.bodies.forEach((b, i) => {
          if (keep <= 0) {
            s.trails[i] = [];
            return;
          }
          s.trails[i].push({ x: b.x, y: b.y });
          if (s.trails[i].length > keep) s.trails[i].splice(0, s.trails[i].length - keep);
        });
      }

      const span = s.span / Math.max(0.05, vals.zoomf);
      const scale = (Math.min(W, H) * 0.42) / span;
      const cy = Math.cos(cam.yaw);
      const sy = Math.sin(cam.yaw);
      const cp = Math.cos(cam.pitch);
      const sp = Math.sin(cam.pitch);
      // THE SYSTEM LIES IN THE WORLD'S xz PLANE, like the black hole's disc,
      // and the pitch says how far from overhead you are looking. Written with
      // the plane as xy instead, every point's height came out as −rz·sin(pitch)
      // — so at pitch zero the whole thing collapsed onto a single line, which
      // is exactly what the first render showed. Face-on is pitch = π/2.
      const D = cam.dist * span * 0.06;
      const cast = (x: number, y: number) => {
        const rx = x * cy - y * sy;
        const rz = x * sy + y * cy;
        const ry = -rz * sp;
        const depth = rz * cp + D;
        const f = D / Math.max(0.35, depth);
        return { x: W / 2 + rx * scale * f, y: H / 2 - ry * scale * f, f };
      };
      const d = (pts: { x: number; y: number }[]) =>
        pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

      const nodes: React.ReactNode[] = [];
      const mMax = Math.max(...s.bodies.map((b) => b.m));

      if (layers.trails) {
        s.trails.forEach((tr, i) => {
          if (tr.length < 2) return;
          nodes.push(
            <path
              key={`t${i}`}
              d={d(tr.map((p) => cast(p.x, p.y)))}
              fill="none"
              stroke={MASS_COLOUR[i % MASS_COLOUR.length]}
              strokeOpacity={0.4}
              strokeWidth={0.9}
              vectorEffect="non-scaling-stroke"
            />
          );
        });
      }
      if (layers.bodies) {
        s.bodies.forEach((b, i) => {
          const p = cast(b.x, b.y);
          const r = Math.max(1.4, 4.6 * Math.cbrt(b.m / mMax) * p.f);
          nodes.push(
            <circle
              key={`b${i}`}
              cx={p.x}
              cy={p.y}
              r={r}
              fill={MASS_COLOUR[i % MASS_COLOUR.length]}
              stroke="var(--lg-panel)"
              strokeWidth="0.8"
            />
          );
        });
      }
      if (layers.com) {
        const c = barycentre(s.bodies);
        const p = cast(c.x, c.y);
        nodes.push(
          <g key="com">
            <path className="gvx-com" d={`M${p.x - 5},${p.y} L${p.x + 5},${p.y}`} />
            <path className="gvx-com" d={`M${p.x},${p.y - 5} L${p.x},${p.y + 5}`} />
          </g>
        );
      }
      if (layers.labels) {
        nodes.push(
          <text key="ttl" className="sfx-l person" x={W / 2} y="15" textAnchor="middle">
            {PRESETS[Math.round(vals.preset)].label} · {s.bodies.length} bodies
          </text>
        );
      }

      const E = energy(s.bodies, s.eps);
      const drift = s.E0 !== 0 ? Math.abs((E - s.E0) / s.E0) : 0;
      const simYears = (s.steps * s.dt) / PHYS.year;

      return {
        content: nodes,
        left: `energy drift ${(drift * 100).toExponential(1)}%`,
        right: `${simYears < 1 ? `${(simYears * 365.25).toFixed(1)} d` : sayText(simYears * PHYS.year, 's')} simulated`,
        note:
          which === 'figure8'
            ? 'Three equal masses on a figure of eight — a real solution of the three-body problem, found in 2000. There is no formula that produces this; it is here because it is being integrated.'
            : which === 'two'
              ? 'Two bodies are the case with an exact answer, which makes them the case worth checking the integrator against: the orbit should close, and keep closing.'
              : which === 'cluster'
                ? 'Twelve bodies are not harder in kind than three — only in patience. Watch a close pass and the energy drift tick up: that is the softening, and it is the price of a fixed step.'
                : 'The drift readout is the integrator marking its own work. Symplectic stepping keeps that number oscillating instead of climbing, which is why the orbits do not slowly unwind.',
        label: `A gravitational system of ${s.bodies.length} bodies, integrated. Setup: ${PRESETS[Math.round(vals.preset)].label}. Energy drift ${(drift * 100).toExponential(1)} per cent.`,
      };
    },
    [boot]
  );

  return (
    <Surface3D
      title="Gravity · N bodies, integrated"
      groups={GROUPS}
      layers={LAYERS}
      initial={INITIAL}
      initialCam={{ yaw: 0, pitch: 1.2, dist: 15 }}
      distRange={[5, 60]}
      render={render}
    />
  );
}
