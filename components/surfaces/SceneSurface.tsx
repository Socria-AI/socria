'use client';

// components/surfaces/SceneSurface.tsx
//
// The seam between a scene the extractor wrote and the surface that draws it.
//
// WHY IT EXISTS. `kind: 'simulation'` used to be drawn by MathViz along with
// every other scene, which meant an accretion disc went through the same
// renderer as a parabola: orthographic, flat, no camera, no occlusion. It was
// correct and it did not look like an object. The surfaces
// (BlackHoleSurface and the rest) are the real ones — perspective, depth
// sorting, a sphere with a facing hemisphere, a disc with a surface — and this
// is the two lines that let the plot lens reach them.
//
// WHAT IT CARRIES ACROSS, AND WHAT IT DOES NOT. The object, and the starting
// values of any control the scene names — "ten solar masses" is a starting
// value. Not the ranges: those belong to the physics and a scene cannot widen
// them (lib/logos-viz.ts OWNS_RANGES). So a conversation can say where to
// begin and cannot say what is possible.

import { SURFACE_OBJECTS, type VizScene } from '@/lib/logos-viz';
import type { SurfaceProps } from './Surface3D';
import { BlackHoleSurface } from './BlackHoleSurface';
import { BigBangSurface } from './BigBangSurface';
import { GravitySurface } from './GravitySurface';

/**
 * Which simulated objects have a surface of their own.
 *
 * NOT ALL OF THEM, AND THAT IS THE RIGHT ANSWER. An oscillator's response
 * curve IS a graph and a projectile's trajectory IS a graph — drawing them in
 * a perspective camera would be dressing up two-dimensional facts. Those stay
 * on the plot renderer, which suits them. A black hole, a universe and an
 * orbiting system are objects in space, and they do not.
 */
const HAS_SURFACE = new Set<string>(SURFACE_OBJECTS);

/**
 * True when this scene wants a working surface rather than a plot.
 *
 * NO DEFAULT. This read `scene.sim?.object ?? 'black-hole'`, so a simulation
 * scene with no named object was CLASSIFIED as having a surface — which is
 * what routed it to the black hole below. A scene with no object wants no
 * surface, which is the honest reading of "I do not know what this is".
 */
export function isSimulation(scene: VizScene | null | undefined): boolean {
  const object = scene?.sim?.object;
  return !!scene && scene.kind === 'simulation' && !!object && HAS_SURFACE.has(object);
}

export function SceneSurface({
  scene,
  fill = true,
  onRead,
  ops,
}: { scene: VizScene } & SurfaceProps) {
  // The scene's sliders become starting values. Unknown ids are ignored by the
  // surface and out-of-range ones are clamped by the control, so nothing here
  // has to be trusted.
  const initial: Record<string, number> = {};
  for (const p of scene.params ?? []) {
    if (Number.isFinite(p.value)) initial[p.id] = p.value;
  }

  // The seam to the conversation goes straight through: whichever surface is
  // mounted, the chat reads ITS state and its commands reach IT. Nothing here
  // knows what a black hole is, which is the property that makes the next
  // surface a file and not a change to this one.
  const pass = { initial, fill, onRead, ops };
  // NAMED, OR NOTHING. The last line here was `return <BlackHoleSurface/>`,
  // so every object this file did not recognise — and every scene with no
  // object at all — was rendered as a Kerr black hole, with real
  // general-relativistic readouts attached to somebody else's subject. The
  // sanitiser now refuses an unnamed simulation outright and `isSimulation`
  // above will not route one here; this returns null rather than a subject so
  // that a future path reaching it another way shows nothing instead of
  // showing a lie.
  const object = scene.sim?.object;
  if (object === 'big-bang') return <BigBangSurface {...pass} />;
  if (object === 'orbit') return <GravitySurface {...pass} />;
  if (object === 'black-hole') return <BlackHoleSurface {...pass} />;
  return null;
}
