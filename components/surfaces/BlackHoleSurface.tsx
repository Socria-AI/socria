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
import { Surface3D, type RenderArgs, type SurfaceRender, type SurfaceProps, snap } from './Surface3D';
import { BLACK_HOLE_ENTITIES, SURFACE_MODEL } from '@/lib/viz-semantics';

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

export function BlackHoleSurface({ initial, fill, onRead, ops }: SurfaceProps = {}) {
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
        const beta = orbitalBeta(bh, rSI);
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
          const { T, boost } = observedTemperature(bh, rSI, mdot, cosTheta);
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

    // ── gas parcels, at the Keplerian rate, dragged by spin ────────
    if (layers.matter && vals.matter > 0) {
      const drag = 1 + 0.9 * vals.spin;
      const n = Math.round(vals.matter);
      for (let i = 0; i < n; i++) {
        const r = rIn + (((i * 7919) % n) / n) * (rOut - rIn);
        const om = 1.7 * drag * Math.pow(r / rIn, -1.5);
        const th = (i / n) * Math.PI * 2 + om * t;
        const p = onDisc(r * Math.cos(th), r * Math.sin(th), 0);
        if (hidden(p)) continue;
        const rSI = r * bh.rs;
        const vx = -Math.sin(th);
        const vz = Math.cos(th);
        const cosTheta = Math.max(-1, Math.min(1, vx * (-sy * cp) + vz * (-cy * cp) * ci));
        const { T, boost } = observedTemperature(bh, rSI, mdot, cosTheta);
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
    if (layers.photon) {
      for (const [pl, key] of [['xz', 'a'], ['yz', 'b']] as const) {
        const c = greatCircle(g.photon, pl);
        runs(c).forEach((seg, k) =>
          put(mid(seg), <path key={`ph${key}${k}`} data-obj="photon" className="bhx-photon" d={d(seg)} />)
        );
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

    // The shadow: what is actually dark to a distant observer, √27 r_g wide —
    // 2.6 times the horizon, because light passing near it is bent in. Drawn
    // flat to the sky, because that is what it is: an apparent size.
    put(-1e9, <circle key="sh" data-obj="shadow" className="bhx-shadow" cx={snap(centre.x)} cy={snap(centre.y)} r={snap(g.bc * scale * centre.f)} />);

    // ── the light, integrated ──────────────────────────────────────
    let captured = 0;
    if (layers.rays) {
      const n = Math.round(vals.rays);
      for (let i = 0; i < n; i++) {
        const b = g.bc * (0.5 + (n === 1 ? 0.6 : (i / (n - 1)) * vals.spread));
        const ray = photonPath(b * 2, { steps: 1400, maxTurn: 8 * Math.PI });
        if (ray.captured) captured++;
        const clip = rOut * 1.25;
        const pts = ray.points
          .map((q) => ({ wx: q.x / 2, wz: q.y / 2 }))
          .filter((q) => Math.hypot(q.wx, q.wz) <= clip)
          .map((q) => cast(q.wx, q.wz, 0));
        const near = Math.abs(b - vals.bsel) < 0.35;
        runs(pts).forEach((seg, k) =>
          put(
            mid(seg),
            <path
              key={`r${i}_${k}`}
              data-obj="rays"
              className={(ray.captured ? 'bhx-ray-lost' : 'bhx-ray') + (near ? ' on' : '')}
              d={d(seg)}
            />
          )
        );
        if (pts.length > 4) {
          const ph = ((t * 0.18 + i * 0.17) % 1 + 1) % 1;
          const q = pts[Math.min(pts.length - 1, Math.floor(ph * pts.length))];
          if (!hidden(q)) {
            put(q.depth, <circle key={`rd${i}`} data-obj="rays" className={`bhx-dot${ray.captured ? ' lost' : ''}`} cx={snap(q.x)} cy={snap(q.y)} r={2.2} />);
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
      put(0, g.photon, 0, `photon orbit ${g.photon.toFixed(2)} r`, 'question', -Math.PI / 2, 30);
      put(-isco, 0, 0, `ISCO ${isco.toFixed(2)} r`, 'evidence', Math.PI, 40);
      put(0, -g.horizon, 0, `horizon ${g.horizon.toFixed(2)} r`, 'person', Math.PI / 2, 26);
    }

    const innerT = observedTemperature(bh, Math.max(rIn * 1.36, rIn + 0.01) * bh.rs, mdot, 0).T;
    const spinning = Math.abs(vals.spin) > 0.02;
    return {
      content: nodes,
      // THE FACTS THAT ARE ACTUALLY LIVE, and only those. Everything else a
      // reader might ask about these objects is the same on every frame and is
      // declared once in lib/viz-semantics.ts. Kept honest to the arithmetic:
      // the capture count is the number of integrated rays that ended inside
      // the capture radius, not an estimate of one.
      live: {
        horizon: `${g.horizon.toFixed(2)} r, which is ${sayText(bh.rs, 'm')} across for this mass`,
        shadow: `${g.bc.toFixed(2)} r — the apparent size a distant observer would measure`,
        disc: `running from ${rIn.toFixed(1)} to ${rOut.toFixed(1)} r, inner edge at ${sayText(innerT, 'K')} at ${(vals.edd * 100).toFixed(0)}% of the Eddington rate`,
        matter: `${Math.round(vals.matter)} parcels drawn`,
        rays: `${Math.round(vals.rays)} rays integrated, ${captured} captured (they ended inside ${g.bc.toFixed(2)} r and could not get out)`,
        photon: `${g.photon.toFixed(2)} r`,
        isco: `${isco.toFixed(2)} r${retro ? ', pushed outward because the disc runs against the spin' : vals.spin > 0.02 ? ', pulled inward by prograde spin' : ''}`,
        ergo: spinning
          ? `drawn, because the hole is spinning at a = ${vals.spin.toFixed(3)}`
          : 'not drawn: at a = 0 there is no ergosphere',
      },
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
      surface="black-hole"
      entities={BLACK_HOLE_ENTITIES}
      model={SURFACE_MODEL['black-hole'].model}
      assumptions={SURFACE_MODEL['black-hole'].assumptions}
      equations={SURFACE_MODEL['black-hole'].equations}
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

/** The ISCO for an orbit running against the spin: the other root. */
function retrogradeIsco(a: number): number {
  const Z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const Z2 = Math.sqrt(3 * a * a + Z1 * Z1);
  return (3 + Z2 + Math.sqrt(Math.max(0, (3 - Z1) * (3 + Z1 + 2 * Z2)))) / 2;
}
