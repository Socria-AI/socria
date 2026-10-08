// components/scene3d/geometry.ts
//
// A scene part, as Three.js geometry — built from its dimensions, or from the
// person's own expression, by the same functions that measured it
// (lib/objects/scene-geometry.ts). Nothing is a stand-in: a star is extruded
// from its computed outline, a surface is f evaluated on its grid, a tube
// follows the curve it is given, sampled where Three asks for a point.
//
// Each geometry is centred on the part's own origin exactly as localBox says,
// so what is drawn sits where the scene's numbers put it.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { compileExpr } from '@/lib/logos-math';
import { profile, revolveProfile, surfaceGrid, type ShapeLike } from '@/lib/objects/scene-geometry';

const SEG = 48;

/** The curve (x(t), y(t), z(t)) in math axes, in the scene's: (x, z, −y). Evaluated, not interpolated. */
class ExprCurve extends THREE.Curve<THREE.Vector3> {
  private fx: (t: number) => number;
  private fy: (t: number) => number;
  private fz: (t: number) => number;
  constructor(
    ex: string,
    ey: string,
    ez: string,
    private t0: number,
    private t1: number
  ) {
    super();
    const c = (e: string) => {
      const k = compileExpr(e, ['t']);
      return (t: number) => {
        const v = k ? k.eval({ t }) : NaN;
        return Number.isFinite(v) ? v : 0;
      };
    };
    this.fx = c(ex);
    this.fy = c(ey);
    this.fz = c(ez);
  }
  getPoint(u: number, target = new THREE.Vector3()) {
    const t = this.t0 + (this.t1 - this.t0) * u;
    return target.set(this.fx(t), this.fz(t), -this.fy(t));
  }
}

/** The part's geometry about its own origin, or null when its shape cannot be built (it is then not drawn). */
export function geometryOf(s: ShapeLike): THREE.BufferGeometry | null {
  const d = s.dims;
  switch (s.shape) {
    case 'box':
      return new THREE.BoxGeometry(d.w, d.h, d.d);
    case 'sphere':
      return new THREE.SphereGeometry(d.r, SEG, SEG / 2);
    case 'cylinder':
      return new THREE.CylinderGeometry(d.r, d.r, d.h, SEG);
    case 'cone':
      return new THREE.ConeGeometry(d.r, d.h, SEG);
    case 'capsule':
      return new THREE.CapsuleGeometry(d.r, Math.max(0, d.h - 2 * d.r), 12, SEG);
    case 'torus': {
      // lying flat: the ring in the x–z plane, as localBox has it
      const g = new THREE.TorusGeometry(d.R, d.r, 24, 96);
      g.rotateX(-Math.PI / 2);
      return g;
    }
    case 'plane': {
      const g = new THREE.PlaneGeometry(d.w, d.d);
      g.rotateX(-Math.PI / 2);
      return g;
    }
    case 'prism':
    case 'star':
    case 'ring':
    case 'polygon':
    case 'airfoil': {
      const p = profile(s);
      if (!p) return null;
      // The outline is in the part's x–z plane. A Shape is drawn in (u, v) and
      // extruded along w; turning −90° about x sends (u, v, w) to (u, w, −v),
      // so v = −z puts the outline back where it was, and w becomes height.
      const shape = new THREE.Shape(p.outer.map(([x, z]) => new THREE.Vector2(x, -z)));
      for (const hole of p.holes) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
      const g = new THREE.ExtrudeGeometry(shape, { depth: d.h, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);
      g.translate(0, -d.h / 2, 0);
      return g;
    }
    case 'surface': {
      const grid = surfaceGrid(s);
      if (!grid) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(grid.positions, 3));
      g.setIndex(grid.indices);
      g.computeVertexNormals();
      return g;
    }
    case 'revolve': {
      const r = revolveProfile(s);
      if (!r) return null;
      const lathe = new THREE.LatheGeometry(
        r.pts.map(([x, y]) => new THREE.Vector2(x, y)),
        96
      );
      // CLOSED AT BOTH ENDS, as it is measured: its volume is the solid π∫r² dy,
      // so an end with a radius is a face — without it a pulley drew as a band
      const ends: THREE.BufferGeometry[] = [];
      for (const [k, up] of [[0, false], [r.pts.length - 1, true]] as const) {
        const [rr, y] = r.pts[k];
        if (!(rr > 1e-9)) continue;
        const disc = new THREE.CircleGeometry(rr, 96);
        disc.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
        disc.translate(0, y, 0);
        ends.push(disc);
      }
      if (!ends.length) return lathe;
      const merged = mergeGeometries([lathe, ...ends]);
      if (!merged) return lathe;
      lathe.dispose();
      for (const e of ends) e.dispose();
      return merged;
    }
    case 'tube': {
      const e = s.exprs ?? {};
      if (!e.x || !e.y || !e.z) return null;
      const curve = new ExprCurve(e.x, e.y, e.z, d.t0, d.t1);
      return new THREE.TubeGeometry(curve, Math.max(8, Math.min(1000, Math.round(d.n || 200))), d.r, 12, false);
    }
  }
  return null;
}

/** Open surfaces are seen from both sides. */
export const twoSided = (shape: string) => shape === 'surface' || shape === 'plane' || shape === 'revolve';
