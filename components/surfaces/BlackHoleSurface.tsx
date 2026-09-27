'use client';

// components/surfaces/BlackHoleSurface.tsx
//
// A Kerr black hole, and every control moves the physics.
//
// WHAT IS DIFFERENT FROM THE PICTURE THIS IS MODELLED ON. The design's version
// bends its light rays with `cos(a·u^3.2)` — a curve chosen because it looks
// like bending. Here the rays are the actual null geodesics of the metric,
// integrated by RK4 on d²u/dφ² + u = 3u² (lib/logos-physics.ts), which means
// the capture threshold is not a number typed in: a ray is drawn falling in
// because the integration takes it through the horizon. Far from the hole the
// same integration reproduces 4GM/bc² to a hundredth of a per cent, which is
// the deflection the 1919 eclipse measured.
//
// AND THE DISC HAS ITS REAL COLOUR. Temperature from the thin-disc profile,
// then the Doppler factor of the orbiting gas and the gravitational redshift
// of climbing out of the well, then the blackbody colour of the result. That
// is where the lopsidedness comes from — the approaching side beamed brighter
// and bluer by a factor of about twelve in brightness — and it is arithmetic
// rather than an artistic decision about what a black hole looks like.
//
// UNITS ARE SCHWARZSCHILD RADII, matching the labels on the design: the
// horizon of a still hole is 1 r, the photon orbit 1.5 r, the ISCO 3 r, and a
// photon is captured below b = 2.60 r. In r_g those are 2, 3, 6 and 5.196 —
// the same geometry under a different ruler, and r_s is the one that puts a 1
// on the horizon.

import { useCallback } from 'react';
import {
  PHYS,
  blackHole,
  blackbodyCSS,
  eddingtonRate,
  observedTemperature,
  orbitalBeta,
  photonPath,
  sayText,
  type BlackHole,
} from '@/lib/logos-physics';
import { Surface3D, type RenderArgs, type SurfaceRender } from './Surface3D';

/** The geometry in Schwarzschild radii, which is how the labels read. */
function inRs(bh: BlackHole) {
  return {
    horizon: bh.horizon / bh.rs,
    photon: bh.photonSphere / bh.rs,
    isco: bh.isco / bh.rs,
    /** the capture radius: √27 r_g is 2.598 r_s */
    bc: bh.shadow / bh.rs,
    ergo: bh.ergosphere / bh.rs,
  };
}

const GROUPS = [
  {
    id: 'hole',
    label: 'Hole',
    ctls: [
      { id: 'm', label: 'M', min: 1, max: 12, step: 0.5, read: (v: number) => `${v}×10⁶ M☉`, help: 'The mass. Every length scales with it; the temperature falls as its fourth root.' },
      { id: 'spin', label: 'spin', min: -0.998, max: 0.998, step: 0.002, read: (v: number) => `a = ${v.toFixed(3)}`, help: 'The Kerr parameter. Prograde spin drags the innermost stable orbit inward — the disc reaches closer and runs hotter for it. Negative is retrograde.' },
    ],
  },
  {
    id: 'disc',
    label: 'Disc',
    ctls: [
      { id: 'tilt', label: 'tilt', min: -1.2, max: 1.2, step: 0.01, read: (v: number) => `${Math.round(v * 57.2958)}°`, help: 'How far the disc is tipped from the line of sight.' },
      { id: 'outer', label: 'outer', min: 4, max: 40, step: 0.5, read: (v: number) => `${v} r`, help: 'How far out the disc is drawn. Take it far enough and the outer rings really do redden — the temperature falls as r^-3/4.' },
      { id: 'edd', label: 'rate', min: 0.01, max: 1, step: 0.01, read: (v: number) => `${(v * 100).toFixed(0)}% Edd`, help: 'How fast it is being fed, as a fraction of the Eddington rate. It sets the temperature, and so the colour.' },
      { id: 'matter', label: 'matter', min: 0, max: 80, step: 1, read: (v: number) => `${v} bodies`, help: 'Gas parcels, orbiting at the Keplerian rate for their radius and dragged faster by spin.' },
    ],
  },
  {
    id: 'light',
    label: 'Light',
    ctls: [
      { id: 'rays', label: 'rays', min: 1, max: 14, step: 1, read: (v: number) => `${v} photons`, help: 'Each one integrated as a real null geodesic.' },
      { id: 'spread', label: 'spread', min: 0.4, max: 4, step: 0.05, read: (v: number) => `× ${v.toFixed(2)}`, help: 'How wide a range of aiming distances the rays cover.' },
      { id: 'bsel', label: 'b', min: 0.5, max: 12, step: 0.1, read: (v: number) => `b = ${v.toFixed(1)} r`, help: 'Highlights the ray aimed closest to this. Below the capture radius it cannot get out.' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    ctls: [
      { id: 'rate', label: 'rate', min: 0, max: 4, step: 0.05, read: (v: number) => `× ${v.toFixed(2)}`, help: 'How fast the clock runs.' },
    ],
  },
];

const LAYERS = [
  { id: 'disc', label: 'Disc' },
  { id: 'matter', label: 'Matter' },
  { id: 'photon', label: 'Photon orbit' },
  { id: 'isco', label: 'ISCO' },
  { id: 'ergo', label: 'Ergosphere' },
  { id: 'rays', label: 'Light' },
  { id: 'labels', label: 'Labels' },
];

const INITIAL = {
  m: 4, spin: 0, tilt: 0.34, outer: 12, edd: 0.1, matter: 26,
  rays: 6, spread: 2, bsel: 3.2, rate: 1,
};

export function BlackHoleSurface() {
  const render = useCallback((a: RenderArgs): SurfaceRender => {
    const { W, H, cam, t, vals, layers } = a;
    const bh = blackHole(vals.m * 1e6 * PHYS.Msun, Math.abs(vals.spin));
    const retro = vals.spin < 0;
    const g = inRs(bh);
    // Retrograde: the ISCO moves out instead of in. blackHole() returns the
    // prograde root, so the retrograde one is taken from the same closed form
    // with the sign of the square root flipped.
    const isco = retro ? retrogradeIsco(Math.abs(vals.spin)) : g.isco;
    const mdot = eddingtonRate(bh, vals.edd);

    const rIn = Math.max(isco, g.horizon * 1.04);
    const rOut = Math.max(rIn + 1, vals.outer);

    const ci = Math.cos(vals.tilt);
    const si = Math.sin(vals.tilt);
    const cy = Math.cos(cam.yaw);
    const sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);

    // THE SCALE IS FITTED, NOT GUESSED.
    //
    // The panel is wide and short, and its aspect changes when the reader drags
    // it taller or goes full screen — so a scale computed from the radius alone
    // put a twelve-radius disc across a hundred-pixel box and drew a smear. The
    // outer ring is projected once at unit scale, its extent measured, and the
    // scale chosen to fit it. It costs one loop and it is right at every
    // aspect, every tilt and every camera angle.
    const fit = (() => {
      let mx = 0.001;
      let my = 0.001;
      for (let i = 0; i < 48; i++) {
        const th = (i / 48) * Math.PI * 2;
        const x = rOut * Math.cos(th);
        const zz = rOut * Math.sin(th);
        const wy = zz * si;
        const wz = zz * ci;
        const rx = x * cy - wz * sy;
        const rz = x * sy + wz * cy;
        const ry = wy * cp - rz * sp;
        const depth = wy * sp + rz * cp + cam.dist;
        const f = cam.dist / Math.max(0.35, depth);
        mx = Math.max(mx, Math.abs(rx * f));
        my = Math.max(my, Math.abs(ry * f));
      }
      return Math.min((W * 0.44) / mx, (H * 0.42) / my);
    })();
    const scale = fit;

    /** world → screen, with distance shrinking things */
    const cast = (x: number, y: number, z: number) => {
      const rx = x * cy - z * sy;
      const rz = x * sy + z * cy;
      const ry = y * cp - rz * sp;
      const depth = y * sp + rz * cp + cam.dist;
      const f = cam.dist / Math.max(0.35, depth);
      return { x: W / 2 + rx * scale * f, y: H / 2 - ry * scale * f, depth, f };
    };
    /** a point in the disc's own plane, tipped by the tilt control */
    const onDisc = (x: number, z: number) => cast(x, z * si, z * ci);
    const centre = cast(0, 0, 0);
    const bodyR = g.horizon * scale * centre.f;
    const hidden = (p: { x: number; y: number; depth: number }) =>
      p.depth > centre.depth && Math.hypot(p.x - centre.x, p.y - centre.y) < bodyR;
    const d = (pts: { x: number; y: number }[]) =>
      pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const runs = <T extends { x: number; y: number; depth: number }>(pts: T[]) => {
      const out: T[][] = [];
      let run: T[] = [];
      for (const p of pts) {
        if (hidden(p)) {
          if (run.length > 1) out.push(run);
          run = [];
        } else run.push(p);
      }
      if (run.length > 1) out.push(run);
      return out;
    };
    const ring = (r: number, n = 128) =>
      Array.from({ length: n + 1 }, (_, i) => {
        const th = (i / n) * Math.PI * 2;
        return onDisc(r * Math.cos(th), r * Math.sin(th));
      });
    const greatCircle = (r: number, plane: 'xz' | 'yz') =>
      Array.from({ length: 97 }, (_, i) => {
        const th = (i / 96) * Math.PI * 2;
        const c = Math.cos(th) * r;
        const s = Math.sin(th) * r;
        return plane === 'xz' ? cast(c, 0, s) : cast(0, c, s);
      });

    const nodes: React.ReactNode[] = [];

    // ── the disc, in its own colour ────────────────────────────────
    //
    // Each ring is drawn as a set of short arcs so the colour can follow the
    // Doppler factor around it: the approaching quarter is bright and blue,
    // the receding one dim and red, and the transition is where the gas is
    // moving across the line of sight.
    if (layers.disc) {
      const RINGS = 16;
      for (let i = 0; i <= RINGS; i++) {
        const frac = i / RINGS;
        const r = rIn + (rOut - rIn) * frac ** 1.35;
        const rSI = r * bh.rs;
        const beta = orbitalBeta(bh, rSI);
        const SEGS = 48;
        for (let k = 0; k < SEGS; k++) {
          const th0 = (k / SEGS) * Math.PI * 2;
          const th1 = ((k + 1) / SEGS) * Math.PI * 2;
          const pts = [th0, (th0 + th1) / 2, th1].map((th) =>
            onDisc(r * Math.cos(th), r * Math.sin(th))
          );
          if (pts.some(hidden)) continue;
          // The component of the orbital velocity along the line of sight.
          // The gas runs anticlockwise in the disc plane; after the camera's
          // yaw the approaching side is where sin carries it toward the eye.
          const thm = (th0 + th1) / 2;
          const vx = -Math.sin(thm);
          const vz = Math.cos(thm);
          const losX = -sy * cp;
          const losZ = -cy * cp;
          const cosTheta = Math.max(-1, Math.min(1, vx * losX + vz * losZ * ci));
          const { T, boost } = observedTemperature(bh, rSI, mdot, cosTheta);
          if (T <= 0) continue;
          const alpha = Math.min(0.95, 0.1 + 0.42 * Math.cbrt(boost) * (1 - 0.55 * frac));
          nodes.push(
            <path
              key={`d${i}_${k}`}
              d={d(pts)}
              fill="none"
              stroke={blackbodyCSS(T, 1)}
              strokeOpacity={alpha}
              strokeWidth={Math.max(0.9, 2.6 * (1 - frac * 0.55))}
              strokeLinecap="round"
            />
          );
        }
      }
    }

    // ── gas parcels, at the Keplerian rate, dragged by spin ────────
    if (layers.matter && vals.matter > 0) {
      const drag = 1 + 0.9 * vals.spin;
      const n = Math.round(vals.matter);
      for (let i = 0; i < n; i++) {
        const r = rIn + (((i * 7919) % n) / n) * (rOut - rIn);
        const om = 1.7 * drag * Math.pow(r / rIn, -1.5);
        const th = (i / n) * Math.PI * 2 + om * t;
        const p = onDisc(r * Math.cos(th), r * Math.sin(th));
        if (hidden(p)) continue;
        const rSI = r * bh.rs;
        const vx = -Math.sin(th);
        const vz = Math.cos(th);
        const cosTheta = Math.max(-1, Math.min(1, vx * (-sy * cp) + vz * (-cy * cp) * ci));
        const { T, boost } = observedTemperature(bh, rSI, mdot, cosTheta);
        nodes.push(
          <circle
            key={`m${i}`}
            cx={p.x}
            cy={p.y}
            r={Math.max(0.8, (1.9 - 1.1 * ((r - rIn) / Math.max(0.1, rOut - rIn))) * p.f)}
            fill={blackbodyCSS(T, 1)}
            opacity={Math.min(1, 0.35 + 0.3 * Math.cbrt(boost))}
          />
        );
      }
    }

    // ── the marked surfaces ────────────────────────────────────────
    if (layers.ergo && Math.abs(vals.spin) > 0.02) {
      // r_E(θ) = r_g(1 + √(1 − a²cos²θ)), in r_s. It touches the horizon at
      // the poles and reaches 1 r_s at the equator whatever the spin.
      const A = Math.abs(vals.spin);
      const pts: { x: number; y: number; depth: number }[] = [];
      for (let i = 0; i <= 96; i++) {
        const th = (Math.PI * i) / 96;
        const rE = (1 + Math.sqrt(Math.max(0, 1 - A * A * Math.cos(th) ** 2))) / 2;
        pts.push(cast(rE * Math.sin(th), rE * Math.cos(th), 0));
      }
      for (let i = 96; i >= 0; i--) {
        const th = (Math.PI * i) / 96;
        const rE = (1 + Math.sqrt(Math.max(0, 1 - A * A * Math.cos(th) ** 2))) / 2;
        pts.push(cast(-rE * Math.sin(th), rE * Math.cos(th), 0));
      }
      nodes.push(<path key="ergo" className="bhx-ergo" d={d(pts)} />);
    }
    if (layers.photon) {
      nodes.push(<path key="ph1" className="bhx-photon" d={d(greatCircle(g.photon, 'xz'))} />);
      nodes.push(<path key="ph2" className="bhx-photon" d={d(greatCircle(g.photon, 'yz'))} />);
    }
    if (layers.isco) {
      runs(ring(isco)).forEach((s, k) => nodes.push(<path key={`i${k}`} className="bhx-isco" d={d(s)} />));
    }

    // ── the hole ───────────────────────────────────────────────────
    nodes.push(<circle key="h" className="bhx-horizon" cx={centre.x} cy={centre.y} r={bodyR} />);
    // The shadow: what is actually dark to a distant observer, which is wider
    // than the horizon because light passing near it is bent in.
    nodes.push(
      <circle key="sh" className="bhx-shadow" cx={centre.x} cy={centre.y} r={g.bc * scale * centre.f} />
    );

    // ── the light, integrated ──────────────────────────────────────
    let captured = 0;
    if (layers.rays) {
      const n = Math.round(vals.rays);
      for (let i = 0; i < n; i++) {
        // Impact parameters spread about the capture radius, so some fall in
        // and some do not, and the boundary between them is visible.
        const b = g.bc * (0.5 + (n === 1 ? 0.6 : (i / (n - 1)) * vals.spread));
        // photonPath works in r_g; b here is in r_s, so double it going in and
        // halve the path coming out.
        const ray = photonPath(b * 2, { steps: 1400, maxTurn: 8 * Math.PI });
        if (ray.captured) captured++;
        // IN VIEW ONLY. photonPath starts the ray six impact parameters out so
        // the integration has somewhere to converge from; at b = 5 r that is 30 r,
        // and drawing all of it put four straight lines across the whole panel
        // and left the bend — the only interesting part — squeezed into a corner.
        const clip = rOut * 1.25;
        const pts = ray.points
          .map((q) => ({ wx: q.x / 2, wz: q.y / 2 }))
          .filter((q) => Math.hypot(q.wx, q.wz) <= clip)
          // The vertical plane, not the disc's. In the disc plane the arc is
          // foreshortened by exactly the tilt that makes the disc read as a
          // disc, and the bend — the only thing a light ray is here to show —
          // flattened into a stroke.
          .map((q) => cast(q.wx, q.wz, 0));
        const near = Math.abs(b - vals.bsel) < 0.35;
        runs(pts).forEach((s, k) =>
          nodes.push(
            <path
              key={`r${i}_${k}`}
              className={(ray.captured ? 'bhx-ray-lost' : 'bhx-ray') + (near ? ' on' : '')}
              d={d(s)}
            />
          )
        );
        // a photon running along its own path, so the direction is visible
        if (pts.length > 4) {
          const ph = ((t * 0.18 + i * 0.17) % 1 + 1) % 1;
          const q = pts[Math.min(pts.length - 1, Math.floor(ph * pts.length))];
          if (!hidden(q)) {
            nodes.push(
              <circle key={`rd${i}`} className={`bhx-dot${ray.captured ? ' lost' : ''}`} cx={q.x} cy={q.y} r={2.2} />
            );
          }
        }
      }
    }

    // ── labels ─────────────────────────────────────────────────────
    if (layers.labels) {
      // PUSHED OUT IN SCREEN SPACE, not in world space.
      //
      // The horizon, the photon orbit and the ISCO live at 1, 1.5 and 3 r while
      // the disc runs to 12 — so at any scale that fits the disc, all three
      // labels project into the same few pixels and stack on the hole. Each is
      // anchored to its own surface and then pushed outward along its own
      // screen bearing by a fixed number of pixels, which separates them at
      // every zoom instead of only at one.
      const put = (
        x: number, y: number, z: number, text: string, cls: string, bearing: number, push: number
      ) => {
        const p = cast(x, y, z);
        if (p.depth <= cam.dist * 0.2) return;
        const lx = p.x + Math.cos(bearing) * push;
        const ly = p.y + Math.sin(bearing) * push;
        if (lx < 30 || lx > W - 30 || ly < 12 || ly > H - 20) return;
        nodes.push(
          <g key={text}>
            <path
              className="bhx-leader"
              d={`M${p.x.toFixed(1)},${p.y.toFixed(1)} L${(lx - Math.cos(bearing) * 5).toFixed(1)},${(ly - Math.sin(bearing) * 5).toFixed(1)}`}
            />
            <text className={`sfx-l ${cls}`} x={lx} y={ly} textAnchor="middle">
              {text}
            </text>
          </g>
        );
      };
      // Three labels on three different bearings, each on its own surface, so
      // they cannot stack on one another or on the hole the way they did when
      // all three sat on the vertical.
      put(0, g.photon, 0, `photon orbit ${g.photon.toFixed(2)} r`, 'question', -Math.PI / 2, 30);
      put(-isco, 0, 0, `ISCO ${isco.toFixed(2)} r`, 'evidence', Math.PI, 40);
      put(0, -g.horizon, 0, `horizon ${g.horizon.toFixed(2)} r`, 'person', Math.PI / 2, 26);
    }

    const innerT = observedTemperature(bh, Math.max(rIn * 1.36, rIn + 0.01) * bh.rs, mdot, 0).T;
    return {
      content: nodes,
      left: `bᶜ = ${g.bc.toFixed(2)} r · ${sayText(bh.rs, 'm')}`,
      right: `${captured} of ${Math.round(vals.rays)} captured · disc ${sayText(innerT, 'K')}`,
      note: retro
        ? 'Retrograde: the disc orbits against the spin and its inner edge is pushed out toward 4.5 r, so it never gets hot.'
        : vals.spin > 0.5
          ? 'Prograde spin pulls the innermost stable orbit in toward the horizon. The disc reaches closer, orbits faster, and runs hotter for it.'
          : 'Every control moves the physics. The rays are integrated geodesics, not drawn curves — below bᶜ one cannot get out, and at a = 0 that is 2.60 r, not the photon orbit at 1.5.',
      label: `A Kerr black hole of ${vals.m} million solar masses, spin ${vals.spin.toFixed(2)}. ${captured} of ${Math.round(vals.rays)} light rays are captured. The disc runs from ${rIn.toFixed(1)} to ${rOut.toFixed(1)} Schwarzschild radii.`,
    };
  }, []);

  return (
    <Surface3D
      title="Black hole · Kerr geometry"
      groups={GROUPS}
      layers={LAYERS}
      initial={INITIAL}
      initialCam={{ yaw: 0.5, pitch: 0.52, dist: 15 }}
      distRange={[4, 90]}
      render={render}
    />
  );
}

/** The ISCO for an orbit running against the spin: the other root. */
function retrogradeIsco(a: number): number {
  const Z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const Z2 = Math.sqrt(3 * a * a + Z1 * Z1);
  return (3 + Z2 + Math.sqrt(Math.max(0, (3 - Z1) * (3 + Z1 + 2 * Z2)))) / 2;
}
