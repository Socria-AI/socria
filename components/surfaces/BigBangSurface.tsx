'use client';

// components/surfaces/BigBangSurface.tsx
//
// The thermal history of the universe, integrated rather than drawn.
//
// WHAT IS REAL HERE. The expansion follows the Friedmann equation from the
// density parameters; the age comes from integrating da/(aH); the temperature
// is T₀/a; recombination is a Saha solve and last scattering a fitting formula,
// so BOTH move when the reader moves Ω_m or Ω_b. Matter–radiation equality is
// where the two terms cross, not a tick someone placed. The particle content
// at any moment is whatever kT can still make.
//
// WHAT IS NOT. Nothing here forms a structure — no fluid is integrated, no
// galaxy assembles. And before about a picosecond the physics is extrapolation
// rather than measurement, so the Planck and inflation epochs are drawn in a
// different ink and say so. A picture that renders the Planck era with the same
// confidence as nucleosynthesis is making a claim nobody can make.
//
// THE COLOUR IS THE CONTENT. Each particle family has its own colour, and what
// is on the screen at a given moment is what exists at that temperature: a
// quark–gluon plasma early, then nucleons, then nuclei, then neutral atoms
// after the fog clears. The palette is the legend.

import { useCallback } from 'react';
import {
  COSMO,
  PHYS,
  ageAt,
  ageNow,
  blackbodyCSS,
  epochs,
  equalityZ,
  heliumFraction,
  kTeV,
  lastScatteringZ,
  sayText,
  speciesAt,
  temperatureAt,
  type Cosmology,
} from '@/lib/logos-physics';
import { elementColour, primordial } from '@/lib/elements';
import { Surface3D, type RenderArgs, type SurfaceRender, type SurfaceProps, snap } from './Surface3D';
import { BIG_BANG_ENTITIES, SURFACE_MODEL } from '@/lib/viz-semantics';

/** One colour per family. The legend and the picture read the same table. */
export const FAMILY_COLOUR: Record<string, string> = {
  quark: '#C2603A',
  gluon: '#8A5A2B',
  lepton: '#4A6FA5',
  boson: '#7A5C9E',
  photon: '#D8B44A',
  neutrino: '#5E9CA8',
  hadron: '#8C6239',
  nucleus: '#A8452F',
  atom: '#4F7A42',
};

const GROUPS = [
  {
    id: 'time',
    label: 'Time',
    ctls: [
      { id: 'logA', label: 'when', min: -32, max: 0, step: 0.01, read: (v: number) => `a = 10^${v.toFixed(1)}`, help: 'Where in the history you are, as the log of the scale factor. Everything else on the screen follows from this one number.' },
      { id: 'rate', label: 'rate', min: 0, max: 3, step: 0.05, read: (v: number) => `× ${v.toFixed(2)}`, help: 'How fast the clock runs when it is playing.' },
    ],
  },
  {
    id: 'cosmos',
    label: 'Cosmos',
    ctls: [
      { id: 'om', label: 'Ω_m', min: 0.05, max: 0.95, step: 0.005, read: (v: number) => v.toFixed(3), help: 'Matter density. Raise it and equality happens earlier and recombination moves — both are computed, not placed.' },
      { id: 'ol', label: 'Ω_Λ', min: 0, max: 0.95, step: 0.005, read: (v: number) => v.toFixed(3), help: 'Dark energy. It does nothing early and everything late; it sets the age of the universe.' },
      { id: 'h0', label: 'H₀', min: 50, max: 85, step: 0.1, read: (v: number) => `${v.toFixed(1)}`, help: 'The expansion rate today, in km/s per megaparsec. It scales the whole clock.' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    ctls: [
      { id: 'n', label: 'particles', min: 20, max: 400, step: 5, read: (v: number) => `${v}`, help: 'How many parcels of content are drawn. They are a sample of what exists, not a count of it.' },
    ],
  },
];

const LAYERS = [
  { id: 'shell', label: 'Expansion' },
  { id: 'particles', label: 'Content' },
  { id: 'track', label: 'Timeline' },
  { id: 'labels', label: 'Labels' },
];

const INITIAL = { logA: -12, rate: 0.6, om: COSMO.omegaM, ol: COSMO.omegaL, h0: COSMO.H0, n: 160 };

export function BigBangSurface({ initial, fill, onRead, ops }: SurfaceProps = {}) {
  const render = useCallback((a: RenderArgs): SurfaceRender => {
    const { W, H, cam, t, vals, layers } = a;
    const c: Cosmology = {
      H0: vals.h0,
      omegaM: vals.om,
      omegaL: vals.ol,
      omegaR: COSMO.omegaR,
      T0: COSMO.T0,
    };

    // The clock walks the log of the scale factor, so a run covers forty
    // orders of magnitude rather than spending the whole time at the end.
    const span = 32;
    const walked = ((t * 0.9) % span);
    const logA = Math.min(0, vals.logA + walked);
    const A = Math.pow(10, logA);
    const T = temperatureAt(c, A);
    const eV = kTeV(T);
    const age = ageAt(c, A);
    const z = 1 / A - 1;
    const here = speciesAt(c, A);
    const eps = epochs(c);
    const zLS = lastScatteringZ(c);
    const opaque = z > zLS;

    const cy = Math.cos(cam.yaw);
    const sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    const scale = Math.min(W, H) / 5.2;
    const cast = (x: number, y: number, zz: number) => {
      const rx = x * cy - zz * sy;
      const rz = x * sy + zz * cy;
      const ry = y * cp - rz * sp;
      const depth = y * sp + rz * cp + cam.dist;
      const f = cam.dist / Math.max(0.35, depth);
      return { x: W / 2 + rx * scale * f, y: H / 2 - ry * scale * f, depth, f };
    };
    const d = (pts: { x: number; y: number }[]) =>
      pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    const Y = heliumFraction();
    const nodes: React.ReactNode[] = [];

    // ── the expanding shell ────────────────────────────────────────
    //
    // Radius is the log of the scale factor mapped onto the picture, because
    // the linear thing is unviewable: between the Planck era and now, a grows
    // by 10³². What the reader watches is the ORDER of magnitude growing,
    // which is the honest way to show something that spans that much.
    const R = 0.35 + 1.55 * ((logA + 34) / 34);
    if (layers.shell) {
      for (const [plane, key] of [['xz', 'a'], ['yz', 'b'], ['xy', 'c']] as const) {
        const pts = Array.from({ length: 97 }, (_, i) => {
          const th = (i / 96) * Math.PI * 2;
          const u = Math.cos(th) * R;
          const v = Math.sin(th) * R;
          return plane === 'xz' ? cast(u, 0, v) : plane === 'yz' ? cast(0, u, v) : cast(u, v, 0);
        });
        nodes.push(<path key={`s${key}`} data-obj="shell" className="bbx-shell" d={d(pts)} />);
      }
      // a few earlier shells, so the expansion leaves a wake
      for (let k = 1; k <= 4; k++) {
        const rr = R * (1 - k * 0.16);
        if (rr <= 0.05) continue;
        const pts = Array.from({ length: 65 }, (_, i) => {
          const th = (i / 64) * Math.PI * 2;
          return cast(rr * Math.cos(th), 0, rr * Math.sin(th));
        });
        nodes.push(<path key={`w${k}`} data-obj="shell" className="bbx-wake" d={d(pts)} opacity={snap(0.3 - k * 0.055)} />);
      }
    }

    // ── the content, coloured by what it is ────────────────────────
    if (layers.particles && here.length) {
      const n = Math.round(vals.n);
      for (let i = 0; i < n; i++) {
        const s = here[i % here.length];
        // ONCE NUCLEI EXIST, COLOUR THEM AS THE ELEMENTS THEY ARE. A nucleus
        // drawn in a generic "nucleus" colour throws away the one fact
        // nucleosynthesis is about: what came out of it. The mixture is the
        // computed primordial one — hydrogen, a quarter helium by mass, a
        // trace of lithium and nothing heavier — in the convention a chemist
        // reads (lib/elements.ts).
        const isNuclear = s.family === 'nucleus' || s.family === 'atom';
        let fill = FAMILY_COLOUR[s.family] ?? '#888';
        if (isNuclear) {
          const mix = primordial(Y);
          let acc = 0;
          const pick = ((i * 7919) % 1000) / 1000;
          let sym = 'H';
          for (const m of mix) {
            acc += m.fraction;
            if (pick <= acc) { sym = m.symbol; break; }
          }
          fill = elementColour(sym, true);
        }
        // A deterministic scatter inside the shell: the same universe every
        // time, so it can be talked about.
        const u = ((i * 2654435761) % 10007) / 10007;
        const v = ((i * 40503) % 9973) / 9973;
        const w = ((i * 69069) % 9967) / 9967;
        const rr = R * Math.cbrt(0.06 + 0.94 * u);
        const th = v * Math.PI * 2 + t * 0.12 * (1 - 0.5 * u);
        const ph = Math.acos(2 * w - 1);
        const p = cast(
          rr * Math.sin(ph) * Math.cos(th),
          rr * Math.cos(ph),
          rr * Math.sin(ph) * Math.sin(th)
        );
        nodes.push(
          <circle
            key={`p${i}`}
            data-obj="content"
            cx={snap(p.x)}
            cy={snap(p.y)}
            r={snap(Math.max(0.5, 1.35 * p.f))}
            fill={fill}
            opacity={snap(opaque ? 0.42 + 0.35 * u : 0.7 + 0.25 * u)}
          />
        );
      }
      // While it is still opaque, a wash over the whole thing — the fog is a
      // fact about the era and the single most consequential one, because it
      // is why nobody can see further back than the microwave background.
      if (opaque) {
        nodes.push(
          <circle
            key="fog"
            data-obj="fog"
            cx={W / 2}
            cy={H / 2}
            r={snap(R * scale * (cam.dist / Math.max(0.35, cam.dist)))}
            fill={blackbodyCSS(Math.min(40000, Math.max(1200, T)), 1)}
            opacity={0.13}
          />
        );
      }
    }

    // ── the timeline, with the epochs on it ────────────────────────
    if (layers.track) {
      const y0 = H - 30;
      const x0 = 18;
      const x1 = W - 18;
      const at = (la: number) => x0 + ((la + 34) / 34) * (x1 - x0);
      nodes.push(
        <path key="axis" data-obj="timeline" className="bbx-axis" d={`M${x0},${y0} L${x1},${y0}`} />
      );
      for (const e of eps) {
        const la = Math.log10(Math.max(1e-34, e.a));
        const x = at(la);
        if (x < x0 - 2 || x > x1 + 2) continue;
        nodes.push(
          <path
            key={`e${e.id}`}
            data-obj="timeline"
            className={`bbx-tick${e.speculative ? ' spec' : ''}`}
            d={`M${x.toFixed(1)},${y0 - 5} L${x.toFixed(1)},${y0 + 5}`}
          />
        );
      }
      nodes.push(
        <circle key="head" data-obj="head" className="bbx-head" cx={snap(at(logA))} cy={snap(y0)} r="3.4" />
      );
    }

    // ── what is happening, in words ────────────────────────────────
    const current = [...eps].reverse().find((e) => e.a <= A * 1.0001) ?? eps[0];
    if (layers.labels) {
      nodes.push(
        <text key="ep" className="sfx-l person" x={W / 2} y="16" textAnchor="middle">
          {current.label}
          {current.speculative ? ' · not established' : ''}
        </text>
      );
      nodes.push(
        <text key="sp" className="sfx-l" x={W / 2} y={H - 42} textAnchor="middle" style={{ fontSize: 7.4 }}>
          {here.map((s) => s.label).slice(0, 4).join(' · ')}
        </text>
      );
    }

    return {
      content: nodes,
      live: {
        shell: `radius stands for a = 10^${logA.toFixed(1)}; z = ${z > 1e4 ? z.toExponential(2) : z.toFixed(0)}`,
        content: `${here.map((s2) => s2.label).join(', ')} — ${Math.round(vals.n)} parcels drawn as a sample`,
        fog: opaque
          ? `drawn: the universe is still opaque at z = ${z.toExponential(2)}, above last scattering at z = ${zLS.toFixed(0)}`
          : `not drawn: light crosses freely below z = ${zLS.toFixed(0)}`,
        timeline: `the epoch shown is ${current.label}${current.speculative ? ', which is not established physics' : ''}`,
        head: `at t = ${age < 1 ? `${age.toExponential(2)} s` : sayText(age, 's')}, T = ${sayText(T, 'K')}`,
      },
      left: `T = ${sayText(T, 'K')} · kT = ${eV > 1e6 ? `${(eV / 1e6).toPrecision(3)} MeV` : eV > 1e3 ? `${(eV / 1e3).toPrecision(3)} keV` : `${eV.toPrecision(3)} eV`}`,
      right: `t = ${age < 1 ? `${age.toExponential(2)} s` : sayText(age, 's')} · z = ${z > 1e4 ? z.toExponential(2) : z.toFixed(0)}`,
      note: current.speculative
        ? `${current.what} Everything drawn before about a picosecond is extrapolation, and this picture marks it rather than hiding it.`
        : opaque
          ? `${current.what} The universe is still opaque: light cannot cross it, which is why nothing can be seen from before last scattering at z = ${zLS.toFixed(0)}.`
          : `${current.what} Equality at z = ${equalityZ(c).toFixed(0)}, last scattering at z = ${zLS.toFixed(0)}, ${(Y * 100).toFixed(1)}% of the mass left as helium — every one of them computed from the sliders above, not placed on the line.`,
      label: `The universe at scale factor 10 to the ${logA.toFixed(1)}, temperature ${sayText(T, 'K')}, age ${age.toExponential(2)} seconds. Epoch: ${current.label}. Present: ${here.map((s) => s.label).join(', ')}.`,
    };
  }, []);

  return (
    <Surface3D
      title="The Big Bang · a thermal history"
      surface="big-bang"
      entities={BIG_BANG_ENTITIES}
      model={SURFACE_MODEL['big-bang'].model}
      assumptions={SURFACE_MODEL['big-bang'].assumptions}
      equations={SURFACE_MODEL['big-bang'].equations}
      onRead={onRead}
      ops={ops}
      groups={GROUPS}
      layers={LAYERS}
      initial={{ ...INITIAL, ...initial }}
      initialCam={{ yaw: 0.4, pitch: 0.3, dist: 9 }}
      distRange={[3, 40]}
      render={render}
      fill={fill}
    />
  );
}
