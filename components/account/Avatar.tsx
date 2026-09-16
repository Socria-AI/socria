'use client';
// components/account/Avatar.tsx
//
// One avatar, at any size. The 220px preview and the 28px chip are the same
// component, which is the only way the thing somebody composes is the thing
// they actually get.
//
// Nothing here chooses a colour. The ground carries its own ink and whether
// the mark is drawn light or dark follows THAT rather than a threshold on
// the background — see takesLightInk in lib/pfp.ts for the bug that rule
// exists to prevent.

import { NodeGlyph } from '@/components/NodeGlyph';
import { LogosMark } from '@/components/LogosMark';
import { groundOf, markOf, takesLightInk, type PfpConfig } from '@/lib/pfp';
import type { LogosNodeType } from '@/lib/logos';
import './avatar.css';

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.07'/%3E%3C/svg%3E\")";

/**
 * WHO OWNS THE SIZE.
 *
 * `.av-big` sizes itself in CSS — `min(228px, 54vw, 30svh)` — and sizes the
 * mark inside it at 52%. `.av-sm` sets no size at all and expects the caller
 * to give one. So passing a pixel `size` for the big preview did not make it
 * 220px "as well"; inline styles beat the stylesheet, so it REPLACED the
 * responsive rule and the preview stopped shrinking on a narrow window.
 *
 * Hence: `size` is optional. Give it for the small marks; leave it off for
 * the big one and let the sheet do its job.
 */
export function Avatar({
  cfg,
  size,
  className = 'av-big',
}: {
  cfg: PfpConfig;
  /** px. Omit where the stylesheet owns the size (.av-big). */
  size?: number;
  className?: string;
}) {
  const g = groundOf(cfg.ground);
  const light = takesLightInk(g);
  const m = markOf(cfg.mark);

  const glyph =
    m.kind === 'img' || m.kind === 'one' ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={m.src} alt="" style={{ filter: light ? 'invert(1) brightness(1.7)' : 'none' }} />
    ) : m.kind === 'logos' ? (
      <LogosMark size={size ? size * 0.52 : 64} />
    ) : m.kind === 'letter' ? (
      // .av-big gives the letter its own clamp(); .av-sm has none, so a
      // caller that set a size sets the type too.
      <span className="ltr" style={size ? { fontSize: size * 0.42 } : undefined}>
        {(cfg.letter || 'A').slice(0, 2)}
      </span>
    ) : (
      // NodeGlyph draws into a 16px box, so its wrapper carries the size —
      // and the sheet already constrains .mk to 52%, so 100% is right at
      // both scales.
      <span style={{ display: 'block', width: '100%', height: '100%' }}>
        <NodeGlyph type={m.id as LogosNodeType} />
      </span>
    );

  return (
    <div
      className={className}
      style={{
        ...(size ? { width: size, height: size } : null),
        background: g.bg,
        color: g.ink,
      }}
    >
      {cfg.texture === 'grid' && (
        <span
          className="tex"
          style={{
            backgroundImage: `radial-gradient(circle, ${
              light ? 'rgba(244,241,232,.22)' : 'rgba(53,70,32,.2)'
            } 1px, transparent 1px)`,
            backgroundSize: `${Math.max(7, (size ?? 220) * 0.118)}px ${Math.max(7, (size ?? 220) * 0.118)}px`,
          }}
        />
      )}
      {cfg.texture === 'grain' && (
        <span
          className="tex"
          style={{ opacity: 0.5, mixBlendMode: 'multiply', backgroundImage: GRAIN }}
        />
      )}
      {(cfg.ring === 'ring' || cfg.ring === 'seal') && (
        <span className="ring" style={{ inset: size ? size * 0.055 : '5.5%' }} />
      )}
      {cfg.ring === 'seal' && <span className="ring" style={{ inset: size ? size * 0.105 : '10.5%' }} />}
      <span className="mk">{glyph}</span>
    </div>
  );
}
