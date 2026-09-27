// app/surfaces/page.tsx — the working surfaces, side by side.
//
// A place to see all three at once while they are being built, and the page
// the Logos panel will mount them from. Each one is self-contained: it owns
// its controls, its camera and its clock, and shares only lib/logos-physics.ts.

import type { Metadata } from 'next';
import { BlackHoleSurface } from '@/components/surfaces/BlackHoleSurface';
import { BigBangSurface } from '@/components/surfaces/BigBangSurface';
import { GravitySurface } from '@/components/surfaces/GravitySurface';
import './surfaces.css';

export const metadata: Metadata = {
  title: 'Working surfaces — Socria Logos',
  description:
    'A Kerr black hole with integrated geodesics and a Doppler-coloured disc, the thermal history of the universe, and gravity as an N-body integration. Every control moves the physics.',
};

export default function SurfacesPage() {
  return (
    <div className="sfx-page">
      <header>
        <p className="k">Socria · Logos · working surfaces</p>
        <h1>Every control moves the physics</h1>
        <p className="lede">
          Not one number on these is typed in. The light rays are integrated null geodesics;
          the disc takes its colour from its own temperature, Doppler factor and redshift; the
          universe&rsquo;s history comes out of the Friedmann equation; and the three-body
          orbits are stepped forward because no formula produces them. Drag to turn, scroll to
          zoom, drag the bar under each to make it taller.
        </p>
      </header>
      <div className="sfx-grid">
        <BlackHoleSurface />
        <BigBangSurface />
        <GravitySurface />
      </div>
    </div>
  );
}
