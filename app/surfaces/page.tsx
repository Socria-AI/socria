// app/surfaces/page.tsx — the working surfaces, side by side.
//
// A place to see all three at once while they are being built, and the page
// the Logos panel will mount them from. Each one is self-contained: it owns
// its controls, its camera and its clock, and shares only lib/logos-physics.ts.

import type { Metadata } from 'next';
import { BlackHoleSurface } from '@/components/surfaces/BlackHoleSurface';
import { BigBangSurface } from '@/components/surfaces/BigBangSurface';
import { GravitySurface } from '@/components/surfaces/GravitySurface';
import './page.css';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  path: '/surfaces',
  title: 'Working surfaces — Socria Logos',
  absolute: true,
  description:
    'Physics you can move: a Kerr black hole with integrated geodesics, the thermal history of the universe, and gravity as an N-body integration.',
});

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
      {/* the three surfaces each title themselves (h3); this names the set, for the page's outline */}
      <h2 className="sr-only">Three surfaces: a black hole, the early universe and gravity</h2>
      <div className="sfx-grid">
        <BlackHoleSurface />
        <BigBangSurface />
        <GravitySurface />
      </div>
    </div>
  );
}
