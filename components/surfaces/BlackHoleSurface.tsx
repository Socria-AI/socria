'use client';

// components/surfaces/BlackHoleSurface.tsx
//
// A Kerr black hole, and every control moves the physics.
//
// WHAT IS DIFFERENT FROM THE PICTURE THIS IS MODELLED ON. The design's version
// bends its light rays with `cos(a·u^3.2)` — a curve chosen because it looks
// like bending. Here the rays are the actual null geodesics of the metric,
// integrated by RK4 in Boyer–Lindquist coordinates (lib/logos-physics.ts), which
// means the capture threshold is not a number typed in: a ray is drawn falling
// in because the integration takes it through the horizon. Far from the hole the
// same integration reproduces 4GM/bc² to a hundredth of a per cent, which is
// the deflection the 1919 eclipse measured.
//
// AND THE SPIN IS IN THE RAYS NOW, WHICH IT WAS NOT.
//
// The title said Kerr and the geodesics were Schwarzschild: spin moved the
// marked radii and left every light path exactly where it was. The assumptions
// list said so, honestly, but a figure whose headline is the metric ought to
// compute in it. So the rays carry the spin, the fan is fired symmetrically —
// half co-rotating, half counter-rotating, which is what a beam of parallel
// light passing a spinning hole actually is — and at high spin you can see the
// consequence directly: co-rotating light survives down to b = 2.1 r_g while
// light going the other way is swallowed out at 7. The shadow is drawn from the
// Kerr curve rather than a circle held at the non-spinning value, so it takes
// on the flat edge that is the metric's most recognisable prediction.
//
// A RETROGRADE DISC IS COMPUTED AS ONE. Negative spin means the gas runs against
// the rotation: its inner edge is the retrograde ISCO (out at 9 r_g rather than
// in at 1.2), its efficiency is 3.8% rather than 32%, and both now come from the
// retrograde root instead of the prograde one being reused with a different
// radius drawn on top.
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
  circularOrbit,
  criticalImpact,
  eddingtonRate,
  kerrShadow,
  observedTemperature,
  photonPath,
  sayText,
  type BlackHole,
  type PhotonPath,
} from '@/lib/logos-physics';
import { Surface3D, type RenderArgs, type SurfaceRender, type SurfaceProps, snap } from './Surface3D';
import { BLACK_HOLE_ENTITIES, SURFACE_MODEL } from '@/lib/viz-semantics';
import { BLACK_HOLE_SCIENCE } from '@/lib/surface-science';
import { canCompute } from '@/lib/model/science';

/**
 * Integrated rays, kept between frames.
 *
 * A ray depends on its impact parameter and the spin and on nothing else — not
 * on the clock, not on the camera — so re-integrating fourteen of them sixty
 * times a second was work thrown away. Keyed to three decimal places of each,
 * which is finer than a slider step. Bounded, because a session dragging the
 * spin control sweeps a lot of keys.
 */
const RAY_CACHE = new Map<string, PhotonPath>();
function ray(b: number, spin: number): PhotonPath {
  const key = `${b.toFixed(3)}:${spin.toFixed(3)}`;
  const held = RAY_CACHE.get(key);
  if (held) return held;
  const made = photonPath(b, { spin, steps: 4000, maxTurn: 8 * Math.PI });
  if (RAY_CACHE.size > 600) RAY_CACHE.clear();
  RAY_CACHE.set(key, made);
  return made;
}

/**
 * The geometry in Schwarzschild radii, which is how the labels read.
 *
 * Both senses of every quantity that has two. A single `isco` and a single `bc`
 * were what let a retrograde disc be drawn at the right radius with the wrong
 * temperature, and a Kerr figure quote one capture threshold for light going
 * either way round.
 */
function inRs(bh: BlackHole) {
  const crit = criticalImpact(bh.spin);
  return {
    horizon: bh.horizon / bh.rs,
    photon: bh.photonSphere / bh.rs,
    photonRetro: bh.photonSphereRetro / bh.rs,
    isco: bh.isco / bh.rs,
    iscoRetro: bh.iscoRetro / bh.rs,
    /** capture threshold for co-rotating light: √27 r_g = 2.598 r_s at rest */
    bc: crit.prograde / 2,
    /** and for counter-rotating light, which is further out at any spin */
    bcRetro: Math.abs(crit.retrograde) / 2,
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
      // STOPS AT 0.3, WHERE THE MODEL DOES. The thin-disc profile assumes an
      // optically thick, radiatively efficient, geometrically thin disc, and past
      // roughly a third of the Eddington rate radiation pressure thickens it and
      // the profile stops describing anything. A slider that ran to 1.0 was
      // offering a value the model cannot honour — see lib/model/science.ts,
      // which now refuses that arrangement outright.
      { id: 'edd', label: 'rate', min: 0.01, max: 0.3, step: 0.01, read: (v: number) => `${(v * 100).toFixed(0)}% Edd`, help: 'How fast it is being fed, as a fraction of the Eddington rate. It sets the temperature, and so the colour. It stops at 30% because the thin-disc profile does.' },
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

export function BlackHoleSurface({ initial, fill, onRead, ops }: SurfaceProps = {}) {
  const render = useCallback((a: RenderArgs): SurfaceRender => {
    const { W, H, cam, t, vals, layers } = a;
    // THE VALUES ARE CHECKED BEFORE ANYTHING IS DRAWN.
    //
    // A NaN out of a control, or a value past the end of the model's validity,
    // produces geometry either way — and geometry is read as a result. The
    // science block declares where each parameter holds (lib/surface-science.ts)
    // and canCompute reports what it had to clamp, which is said out loud in the
    // note rather than absorbed silently.
    const check = canCompute(BLACK_HOLE_SCIENCE, {
      m: vals.m, spin: vals.spin, edd: vals.edd, outer: vals.outer, tilt: vals.tilt, bsel: vals.bsel,
    });

    const bh = blackHole(vals.m * 1e6 * PHYS.Msun, Math.abs(vals.spin));
    // Negative spin on the control means the DISC runs against the hole's
    // rotation — a retrograde disc around a hole of spin |a★|, which is what it
    // physically is. Everything the disc does then takes the retrograde root:
    // its inner edge, its efficiency, its orbital rate and its direction.
    const retro = vals.spin < 0;
    const sense: 'prograde' | 'retrograde' = retro ? 'retrograde' : 'prograde';
    const g = inRs(bh);
    const isco = retro ? g.iscoRetro : g.isco;
    const mdot = eddingtonRate(bh, vals.edd, sense);

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
    /**
     * A point in the disc's own plane, tipped by the tilt control — and `h`
     * above it, which is what gives the disc a thickness to be seen edge-on.
     */
    const onDisc = (x: number, z: number, h = 0) => cast(x, z * si + h * ci, z * ci - h * si);
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
    const ringAt = (r: number, n = 128) =>
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

    // ── A DEPTH-SORTED SCENE, WHICH IS WHAT MAKES IT AN OBJECT ─────
    //
    // Everything above this point was drawn in a fixed order, so nothing ever
    // passed BEHIND anything: the disc's far side sat on top of the hole, the
    // rays crossed it, and the result was a tilted flat diagram rather than a
    // model of a thing. Each primitive is collected with the depth of the
    // point it belongs to and the whole list is painted far-to-near. That one
    // change is most of the difference between a picture of a black hole and
    // a black hole.
    const scene: { z: number; node: React.ReactNode }[] = [];
    const put = (z: number, node: React.ReactNode) => scene.push({ z, node });
    const mid = (pts: { depth: number }[]) => pts.reduce((a, q) => a + q.depth, 0) / pts.length;

    // ── the disc, with thickness, in its own colour ────────────────
    //
    // Each ring is a band rather than a line: an inner and an outer edge at a
    // small height above and below the plane, filled as a quad. A disc drawn
    // as concentric hairlines is a contour map of a disc; this one has a near
    // edge that can occlude and a far edge that can be occluded.
    if (layers.disc) {
      const RINGS = 14;
      const SEGS = 60;
      const thick = Math.max(0.05, 0.035 * rOut);
      for (let i = 0; i < RINGS; i++) {
        const f0 = i / RINGS;
        const f1 = (i + 1) / RINGS;
        const r0 = rIn + (rOut - rIn) * f0 ** 1.35;
        const r1 = rIn + (rOut - rIn) * f1 ** 1.35;
        const rSI = ((r0 + r1) / 2) * bh.rs;
        const h = thick * (0.35 + 0.65 * f0);
        for (let k = 0; k < SEGS; k++) {
          const th0 = (k / SEGS) * Math.PI * 2;
          const th1 = ((k + 1) / SEGS) * Math.PI * 2;
          // A quad: inner edge at this angle and the next, outer edge back.
          // FLAT ACROSS AZIMUTH, FLARED WITH RADIUS. Putting −h/2 on one
          // azimuthal edge and +h/2 on the other twists each patch out of the
          // plane, and the disc came out as a ring of fan blades. The height
          // belongs to the RADIUS — a real thin disc flares outward, H/R
          // growing with r — so both corners at r₀ share one height and both
          // at r₁ share another, and the surface stays a surface.
          const h0 = h * (r0 - rIn) / Math.max(0.01, rOut - rIn);
          const h1 = h * (r1 - rIn) / Math.max(0.01, rOut - rIn);
          const quad = [
            onDisc(r0 * Math.cos(th0), r0 * Math.sin(th0), h0),
            onDisc(r1 * Math.cos(th0), r1 * Math.sin(th0), h1),
            onDisc(r1 * Math.cos(th1), r1 * Math.sin(th1), h1),
            onDisc(r0 * Math.cos(th1), r0 * Math.sin(th1), h0),
          ];
          if (quad.every(hidden)) continue;
          const thm = (th0 + th1) / 2;
          const vx = -Math.sin(thm);
          const vz = Math.cos(thm);
          const cosTheta = Math.max(-1, Math.min(1, vx * (-sy * cp) + vz * (-cy * cp) * ci));
          const { T, boost } = observedTemperature(bh, rSI, mdot, cosTheta, sense);
          if (T <= 0) continue;
          // THE BEAMING HAS TO BE VISIBLE OR IT IS NOT BEING SHOWN.
          //
          // At these temperatures the disc is blue-white everywhere — that is
          // true, and it means colour cannot carry the asymmetry. Brightness
          // has to. A cube root over a narrow range washed a twelvefold
          // difference in surface brightness down to a barely perceptible one;
          // this keeps the ratio the arithmetic actually gives.
          // QUIETER, BUT STILL CARRYING THE BEAMING.
          //
          // The disc is the widest thing on screen and at full strength it
          // dominated the marked radii, the rays and the hole itself — the
          // primary modelled objects were reading as annotations on top of a
          // blue field. The ratio between the approaching and receding sides
          // is what this alpha is FOR, so it is scaled rather than compressed:
          // the same twelvefold difference, drawn at about seven tenths of the
          // weight. Nothing informational is lost; the figure stops shouting.
          const alpha = Math.min(
            0.66,
            0.035 + 0.63 * Math.pow(Math.min(1, boost / 3.4), 0.85) * (1 - 0.3 * f0)
          );
          put(
            mid(quad),
            <path
              key={`d${i}_${k}`}
              data-obj="disc"
              d={`${d(quad)} Z`}
              fill={blackbodyCSS(T, 1)}
              fillOpacity={snap(alpha)}
              stroke={blackbodyCSS(T, 1)}
              strokeOpacity={snap(alpha * 0.55)}
              strokeWidth={0.4}
            />
          );
        }
      }
    }

    // ── gas parcels, at the Kerr orbital rate ──────────────────────
    //
    // WHAT THIS REPLACED. `om = 1.7 · (1 + 0.9a) · (r/r_in)^-1.5` — the r^-3/2 is
    // Kepler and right, and the rest was a factor chosen to look like dragging.
    // The real thing is in closed form: Ω = ±1/(r̃^{3/2} ± a★), which is Kepler at
    // a★ = 0, gives co-rotating and counter-rotating gas genuinely different
    // rates at the same radius, and reverses when the disc does. The one number
    // that remains a choice is how fast the clock runs, and it is a clock rate
    // rather than a physical rate: the ratio between any two parcels is the
    // model's.
    if (layers.matter && vals.matter > 0) {
      const n = Math.round(vals.matter);
      // Normalised so the innermost ring turns at a legible rate on screen. The
      // RATIOS between radii are the computed ones; this only sets the tempo.
      const ref = Math.abs(circularOrbit(bh, rIn * bh.rs, sense).omega) || 1;
      const clock = 1.7 / ref;
      for (let i = 0; i < n; i++) {
        const r = rIn + (((i * 7919) % n) / n) * (rOut - rIn);
        const om = circularOrbit(bh, r * bh.rs, sense).omega * clock;
        const th = (i / n) * Math.PI * 2 + om * t;
        const p = onDisc(r * Math.cos(th), r * Math.sin(th), 0);
        if (hidden(p)) continue;
        const rSI = r * bh.rs;
        const vx = -Math.sin(th);
        const vz = Math.cos(th);
        const cosTheta = Math.max(-1, Math.min(1, vx * (-sy * cp) + vz * (-cy * cp) * ci));
        const { T, boost } = observedTemperature(bh, rSI, mdot, cosTheta, sense);
        put(
          p.depth,
          <circle
            key={`m${i}`}
            data-obj="matter"
            cx={snap(p.x)}
            cy={snap(p.y)}
            r={snap(Math.max(0.7, (1.7 - 1.0 * ((r - rIn) / Math.max(0.1, rOut - rIn))) * p.f))}
            fill={blackbodyCSS(T, 1)}
            opacity={snap(Math.min(1, 0.4 + 0.3 * Math.cbrt(boost)))}
          />
        );
      }
    }

    // ── the marked surfaces ────────────────────────────────────────
    if (layers.ergo && Math.abs(vals.spin) > 0.02) {
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
      put(centre.depth - 0.01, <path key="ergo" data-obj="ergo" className="bhx-ergo" d={d(pts)} />);
    }
    // THE PHOTON ORBIT IS ONLY A SPHERE WHEN THE HOLE IS STILL.
    //
    // At a★ = 0 light can orbit at 1.5 r in any plane, and two great circles are
    // the honest way to draw that. Once the hole spins there is no single radius:
    // co-rotating light orbits at 1.07 r_g where counter-rotating light orbits at
    // 4, and the surface those orbits sweep is not a sphere. Drawing a sphere
    // there implies an isotropy the metric does not have — so above a whisper of
    // spin this draws the TWO equatorial orbits instead, which is exactly what
    // the closed form gives.
    if (layers.photon) {
      const spinning = Math.abs(vals.spin) > 0.02;
      if (!spinning) {
        for (const [pl, key] of [['xz', 'a'], ['yz', 'b']] as const) {
          const c = greatCircle(g.photon, pl);
          runs(c).forEach((seg, k) =>
            put(mid(seg), <path key={`ph${key}${k}`} data-obj="photon" className="bhx-photon" d={d(seg)} />)
          );
        }
      } else {
        for (const [r, key] of [[g.photon, 'pro'], [g.photonRetro, 'ret']] as const) {
          runs(ringAt(r)).forEach((seg, k) =>
            put(mid(seg), <path key={`ph${key}${k}`} data-obj="photon" className="bhx-photon" d={d(seg)} />)
          );
        }
      }
    }
    if (layers.isco) {
      runs(ringAt(isco)).forEach((seg, k) =>
        put(mid(seg), <path key={`i${k}`} data-obj="isco" className="bhx-isco" d={d(seg)} />)
      );
    }

    // ── THE HOLE, AS A SPHERE ──────────────────────────────────────
    //
    // A filled circle is a disc, and at any angle but dead-on it reads as one.
    // The silhouette is still a circle — that is what a sphere projects to —
    // but the surface carries a wireframe of latitudes and meridians on the
    // FACING hemisphere only, which is what tells the eye it is looking at a
    // ball rather than a hole punched in the page. Hidden-line removal is the
    // same occlusion test everything else here uses.
    const Rh = g.horizon;
    put(centre.depth, <circle key="h" data-obj="horizon" className="bhx-horizon" cx={snap(centre.x)} cy={snap(centre.y)} r={snap(bodyR)} />);
    const wire: React.ReactNode[] = [];
    for (let li = 1; li <= 5; li++) {
      const lat = -Math.PI / 2 + (li * Math.PI) / 6;
      const pts = Array.from({ length: 73 }, (_, k) => {
        const lon = (k / 72) * Math.PI * 2;
        return cast(Rh * Math.cos(lat) * Math.cos(lon), Rh * Math.sin(lat), Rh * Math.cos(lat) * Math.sin(lon));
      });
      // Only the near half: a latitude drawn all the way round makes a sphere
      // look like a wire cage rather than a solid.
      const front = pts.filter((q) => q.depth < centre.depth);
      if (front.length > 1) wire.push(<path key={`la${li}`} className="bhx-wire" d={d(front)} />);
    }
    for (let mi = 0; mi < 8; mi++) {
      const lon = (mi / 8) * Math.PI * 2;
      const pts = Array.from({ length: 49 }, (_, k) => {
        const lat = -Math.PI / 2 + (k / 48) * Math.PI;
        return cast(Rh * Math.cos(lat) * Math.cos(lon), Rh * Math.sin(lat), Rh * Math.cos(lat) * Math.sin(lon));
      });
      const front = pts.filter((q) => q.depth < centre.depth);
      if (front.length > 1) wire.push(<path key={`me${mi}`} className="bhx-wire" d={d(front)} />);
    }
    put(centre.depth - bodyR * 0.001, <g key="wire" data-obj="horizon">{wire}</g>);

    // ── THE SHADOW, AS THE METRIC DRAWS IT ─────────────────────────
    //
    // What is dark to a distant observer, and NOT a circle unless the hole is
    // still. Co-rotating light escapes from closer in, so the silhouette is
    // pushed in on one side and bulges on the other — flat-edged near the
    // extremal limit, at exactly 2 r_g, which is the Kerr metric's most
    // recognisable prediction and the shape an image of one gets compared
    // against. The old code drew a fixed circle at the non-spinning radius with a
    // comment admitting it.
    //
    // Drawn flat to the sky at the disc's inclination, because that is what it
    // is: an apparent outline, not a surface anything sits on.
    {
      const rim = kerrShadow(bh.spin, Math.PI / 2 - Math.abs(vals.tilt));
      // In r_s, on the sky: α across, β up. The axis is the spin axis, so the
      // curve is oriented by the same tilt the disc is.
      const sky = rim.points.map((q) => ({
        x: centre.x + (q.alpha / 2) * scale * centre.f,
        y: centre.y - (q.beta / 2) * scale * centre.f,
      }));
      if (sky.length > 2) {
        put(
          -1e9,
          <path key="sh" data-obj="shadow" className="bhx-shadow" d={`${d(sky)} Z`} />
        );
      }
    }

    // ── the light, integrated, and now in the right metric ─────────
    //
    // FIRED SYMMETRICALLY, which is both more honest and the only way to SEE the
    // spin. A beam of parallel light passing a spinning hole has rays on both
    // sides of the axis, and those two halves carry opposite angular momentum:
    // one co-rotates, one runs against the rotation. They are captured at
    // different impact parameters — ±√27 when the hole is still, +2.11 and −7.00
    // at the Thorne limit — so the fan is split in two, and at high spin the
    // asymmetry is the most visible thing in the figure.
    let captured = 0;
    const fired: {
      b: number;
      sense: 'prograde' | 'retrograde';
      captured: boolean;
      deflection: number;
      periapsis: number;
      windings: number;
      decidedBy: 'integration' | 'threshold';
      highlighted: boolean;
    }[] = [];
    if (layers.rays) {
      const n = Math.round(vals.rays);
      for (let i = 0; i < n; i++) {
        // Half the fan each way. With one ray it goes co-rotating, because that
        // is the side the aiming control reads against.
        const side = n === 1 ? 1 : i % 2 === 0 ? 1 : -1;
        const step = n <= 2 ? 0 : Math.floor(i / 2) / Math.max(1, Math.ceil(n / 2) - 1);
        const bMag = (side > 0 ? g.bc : g.bcRetro) * (0.5 + step * vals.spread);
        const b = side * bMag;
        const path = ray(b * 2, bh.spin);
        if (path.captured) captured++;
        const highlighted = Math.abs(bMag - vals.bsel) < 0.35;
        fired.push({
          b: bMag,
          sense: path.sense,
          captured: path.captured,
          deflection: path.deflection,
          periapsis: path.periapsis / 2,
          windings: path.windings,
          decidedBy: path.decidedBy,
          highlighted,
        });
        const clip = rOut * 1.25;
        const pts = path.points
          .map((q) => ({ wx: q.x / 2, wz: q.y / 2 }))
          .filter((q) => Math.hypot(q.wx, q.wz) <= clip)
          .map((q) => cast(q.wx, q.wz, 0));
        runs(pts).forEach((seg, k) =>
          put(
            mid(seg),
            <path
              key={`r${i}_${k}`}
              data-obj="rays"
              className={(path.captured ? 'bhx-ray-lost' : 'bhx-ray') + (highlighted ? ' on' : '')}
              d={d(seg)}
            />
          )
        );
        if (pts.length > 4) {
          const ph = ((t * 0.18 + i * 0.17) % 1 + 1) % 1;
          const q = pts[Math.min(pts.length - 1, Math.floor(ph * pts.length))];
          if (!hidden(q)) {
            put(q.depth, <circle key={`rd${i}`} data-obj="rays" className={`bhx-dot${path.captured ? ' lost' : ''}`} cx={snap(q.x)} cy={snap(q.y)} r={2.2} />);
          }
        }
      }
    }

    // Painted far to near. The labels are added after, because they belong to
    // the reader rather than to the scene and must never be occluded by it.
    scene.sort((a, b) => b.z - a.z);
    const nodes: React.ReactNode[] = scene.map((s) => s.node);

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
          <g key={text} data-obj="labels">
            <path
              className="bhx-leader"
              d={`M${p.x.toFixed(1)},${p.y.toFixed(1)} L${(lx - Math.cos(bearing) * 5).toFixed(1)},${(ly - Math.sin(bearing) * 5).toFixed(1)}`}
            />
            <text className={`sfx-l ${cls}`} x={snap(lx)} y={snap(ly)} textAnchor="middle">
              {text}
            </text>
          </g>
        );
      };
      // Three labels on three different bearings, each on its own surface, so
      // they cannot stack on one another or on the hole the way they did when
      // all three sat on the vertical.
      const spinning = Math.abs(vals.spin) > 0.02;
      put(
        0, spinning ? g.photon : g.photon, 0,
        spinning ? `photon orbit ${g.photon.toFixed(2)}/${g.photonRetro.toFixed(2)} r` : `photon orbit ${g.photon.toFixed(2)} r`,
        'question', -Math.PI / 2, 30
      );
      put(-isco, 0, 0, `ISCO ${isco.toFixed(2)} r${retro ? ' retro' : ''}`, 'evidence', Math.PI, 40);
      put(0, -g.horizon, 0, `horizon ${g.horizon.toFixed(2)} r`, 'person', Math.PI / 2, 26);
    }

    const innerT = observedTemperature(bh, Math.max(rIn * 1.36, rIn + 0.01) * bh.rs, mdot, 0, sense).T;
    const spinning = Math.abs(vals.spin) > 0.02;
    const inner = circularOrbit(bh, rIn * bh.rs, sense);

    // The ray the aiming control is pointing at, said in full. "Why did that
    // photon get captured?" is answerable from this and nothing else: the
    // impact parameter it was fired with, the threshold for its OWN sense of
    // rotation, where it actually turned, and whether the integration settled it
    // or the exact threshold had to.
    const picked = fired.find((f) => f.highlighted) ?? fired[0] ?? null;
    const pickedSays = picked
      ? `b = ${picked.b.toFixed(2)} r ${picked.sense}, threshold ${(picked.sense === 'prograde' ? g.bc : g.bcRetro).toFixed(2)} r — ` +
        (picked.captured
          ? `inside it, so it was captured` +
            (picked.decidedBy === 'threshold'
              ? '; the drawn path stops where the integration reached its winding limit, and the verdict is from the exact threshold'
              : `, reaching ${picked.periapsis.toFixed(2)} r before crossing`)
          : `outside it, so it escaped, bent by ${picked.deflection.toFixed(3)} rad after passing ${picked.periapsis.toFixed(2)} r` +
            (picked.windings > 1 ? ` and going round ${picked.windings.toFixed(1)} times` : ''))
      : 'no ray is drawn';

    return {
      content: nodes,
      // THE FACTS THAT ARE ACTUALLY LIVE, and only those. Everything else a
      // reader might ask about these objects is the same on every frame and is
      // declared once in lib/viz-semantics.ts. Kept honest to the arithmetic:
      // the capture count is the number of integrated rays that ended inside
      // the capture radius, not an estimate of one.
      live: {
        horizon: `${g.horizon.toFixed(2)} r, which is ${sayText(bh.rs, 'm')} across for this mass`,
        shadow: spinning
          ? `not a circle at this spin: ${g.bc.toFixed(2)} r on the co-rotating side, ${g.bcRetro.toFixed(2)} r on the other, from the Kerr shadow curve`
          : `${g.bc.toFixed(2)} r in every direction — a circle, because the hole is not spinning`,
        disc: `${sense}, running from ${rIn.toFixed(1)} to ${rOut.toFixed(1)} r, inner edge at ${sayText(innerT, 'K')} at ${(vals.edd * 100).toFixed(0)}% of the Eddington rate; efficiency ${((retro ? bh.efficiencyRetro : bh.efficiency) * 100).toFixed(1)}%`,
        matter: `${Math.round(vals.matter)} parcels drawn, turning ${sense} at the computed Kerr rate — one orbit at the inner edge takes ${sayText(inner.period, 's')}`,
        rays: `${Math.round(vals.rays)} rays integrated in Kerr at a = ${bh.spin.toFixed(3)}, half each way round; ${captured} captured. Thresholds: ${g.bc.toFixed(2)} r co-rotating, ${g.bcRetro.toFixed(2)} r against. The highlighted one: ${pickedSays}`,
        photon: spinning
          ? `${g.photon.toFixed(2)} r co-rotating and ${g.photonRetro.toFixed(2)} r against — two equatorial orbits, not a sphere, once the hole spins`
          : `${g.photon.toFixed(2)} r, and a sphere: at a = 0 light can orbit in any plane`,
        isco: `${isco.toFixed(2)} r${retro ? ', pushed outward because the disc runs against the spin' : vals.spin > 0.02 ? ', pulled inward by prograde spin' : ''}`,
        ergo: spinning
          ? `drawn, because the hole is spinning at a = ${vals.spin.toFixed(3)}; frame dragging at the inner edge is ${inner.drag.toExponential(2)} rad/s`
          : 'not drawn: at a = 0 there is no ergosphere',
      },
      left: `bᶜ = ${g.bc.toFixed(2)}/${g.bcRetro.toFixed(2)} r · ${sayText(bh.rs, 'm')}`,
      right: `${captured} of ${Math.round(vals.rays)} captured · disc ${sayText(innerT, 'K')}`,
      note: check.clamped.length
        ? `Held at the edge of the model: ${check.clamped.map((c) => `${c.id} at ${c.to} — ${c.why}`).join('; ')}.`
        : retro
          ? `Retrograde: the disc runs against the spin, so its inner edge is the retrograde ISCO at ${isco.toFixed(2)} r and it radiates ${(bh.efficiencyRetro * 100).toFixed(1)}% of what falls in, against ${(bh.efficiency * 100).toFixed(1)}% the other way round. It never gets as hot.`
          : spinning
            ? `Spin is in the light as well as the geometry: co-rotating rays survive to ${g.bc.toFixed(2)} r while rays going the other way are swallowed out at ${g.bcRetro.toFixed(2)} r, and the shadow takes its flat edge from the difference.`
            : 'Every control moves the physics. The rays are integrated geodesics, not drawn curves — below bᶜ one cannot get out, and at a = 0 that is 2.60 r, not the photon orbit at 1.5.',
      label: `A Kerr black hole of ${vals.m} million solar masses, spin ${vals.spin.toFixed(2)}, with a ${sense} disc from ${rIn.toFixed(1)} to ${rOut.toFixed(1)} Schwarzschild radii. ${captured} of ${Math.round(vals.rays)} integrated light rays are captured.`,
    };
  }, []);

  return (
    <Surface3D
      title="Black hole · Kerr geometry"
      surface="black-hole"
      entities={BLACK_HOLE_ENTITIES}
      model={SURFACE_MODEL['black-hole'].model}
      assumptions={SURFACE_MODEL['black-hole'].assumptions}
      equations={SURFACE_MODEL['black-hole'].equations}
      science={BLACK_HOLE_SCIENCE}
      onRead={onRead}
      ops={ops}
      groups={GROUPS}
      layers={LAYERS}
      initial={{ ...INITIAL, ...initial }}
      // FAR ENOUGH OUT TO BE LOOKING AT IT. `dist` is in the same units as the
      // radii, so 15 put the eye a quarter of a disc-width from the near edge:
      // the near side was magnified nine times over the far side and the whole
      // thing opened like a fan. At 48 the ratio is under two, which is the
      // perspective of looking at an object rather than standing in one.
      initialCam={{ yaw: 0.5, pitch: 0.62, dist: 48 }}
      distRange={[16, 260]}
      render={render}
      fill={fill}
    />
  );
}


