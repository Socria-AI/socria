'use client';

// components/surfaces/SurfaceSwitch.tsx
//
// The tab bar over the working surface: one plate, whichever surface the
// question needs. Mounting only the chosen one matters — each surface runs a
// clock and an integrator, and three of those running behind two hidden tabs
// is three times the work for one picture.

import { useState } from 'react';
import { BlackHoleSurface } from './BlackHoleSurface';
import { BigBangSurface } from './BigBangSurface';
import { GravitySurface } from './GravitySurface';

const TABS = [
  { id: 'blackhole', label: 'Black hole' },
  { id: 'bigbang', label: 'Big Bang' },
  { id: 'gravity', label: 'Gravity' },
] as const;

export function SurfaceSwitch({ initial = 'blackhole' }: { initial?: (typeof TABS)[number]['id'] }) {
  const [tab, setTab] = useState<string>(initial);
  return (
    <div className="sfx-switch">
      <div className="sfx-tabs" role="tablist" aria-label="Working surface">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'blackhole' && <BlackHoleSurface />}
      {tab === 'bigbang' && <BigBangSurface />}
      {tab === 'gravity' && <GravitySurface />}
    </div>
  );
}
