// lib/og/card.tsx
//
// The link-preview card, drawn: 1200×630, on the site's own paper, in its own
// faces — the mark and the name top left, the kicker in moss, the title in
// Instrument Serif, one line beneath it, and "Think for yourself." signed at
// the foot. What it says comes from lib/og-cards.ts; this only lays it out.
//
// Runs on the edge (app/og/[...key]/route.tsx). The fonts and the mark are
// read with `new URL(…, import.meta.url)`, which the bundler turns into
// files shipped with the route; the faces are TTF copies of app/fonts (see
// fonts/README.md), because the renderer cannot read WOFF2.

import { ImageResponse } from 'next/og';
import type { OgCard } from '@/lib/og-cards';

const PAPER = '#F4F1E8';
const INK = '#1F1F1F';
const INK_70 = 'rgba(31,31,31,0.7)';
const MOSS = '#5e7633';
const RULE = 'rgba(31,31,31,0.14)';

let assets: Promise<{
  serif: ArrayBuffer;
  serifItalic: ArrayBuffer;
  sans: ArrayBuffer;
  sansBold: ArrayBuffer;
  mark: ArrayBuffer;
}> | null = null;

function load() {
  assets ??= Promise.all([
    fetch(new URL('./fonts/InstrumentSerif-Regular.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('./fonts/InstrumentSerif-Italic.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('./fonts/Inter-400.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('./fonts/Inter-600.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('../../public/socria-mark.png', import.meta.url)).then((r) => r.arrayBuffer()),
  ]).then(([serif, serifItalic, sans, sansBold, mark]) => ({ serif, serifItalic, sans, sansBold, mark }));
  return assets;
}

/** The title's size steps down as it lengthens, so it always fits three lines. */
function titleSize(t: string): number {
  const n = t.length;
  if (n <= 24) return 104;
  if (n <= 34) return 88;
  if (n <= 48) return 76;
  if (n <= 70) return 64;
  return 56;
}

/** The line signed at the foot — never the same words as the title above it. */
function footFor(card: OgCard): string {
  return /^think for yourself/i.test(card.title) ? 'Free to start. No sign-up.' : 'Think for yourself.';
}

export async function renderCard(card: OgCard, opts: { cacheSeconds?: number } = {}): Promise<ImageResponse> {
  const a = await load();
  const cache = opts.cacheSeconds ?? 86_400;
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: PAPER,
          padding: '64px 76px 58px',
          fontFamily: 'Inter',
          color: INK,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={a.mark as unknown as string} width={58} height={54} />
          <div style={{ fontFamily: 'Instrument Serif', fontSize: 44, letterSpacing: -0.5 }}>Socria</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1040 }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: MOSS,
            }}
          >
            {card.kicker}
          </div>
          <div
            style={{
              fontFamily: 'Instrument Serif',
              fontSize: titleSize(card.title),
              lineHeight: 1.02,
              letterSpacing: -1.5,
            }}
          >
            {card.title}
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.35, color: INK_70, maxWidth: 960 }}>{card.line}</div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: `1px solid ${RULE}`,
            paddingTop: 22,
          }}
        >
          <div style={{ fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 36, color: MOSS }}>
            {footFor(card)}
          </div>
          <div style={{ fontSize: 24, color: INK_70 }}>socria.app</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Instrument Serif', data: a.serif, weight: 400, style: 'normal' },
        { name: 'Instrument Serif', data: a.serifItalic, weight: 400, style: 'italic' },
        { name: 'Inter', data: a.sans, weight: 400, style: 'normal' },
        { name: 'Inter', data: a.sansBold, weight: 600, style: 'normal' },
      ],
      headers: {
        // Social sites keep their own copy; a day here lets an edited title
        // reach the next share without anybody purging a cache.
        'Cache-Control': `public, max-age=${cache}, s-maxage=${cache}, stale-while-revalidate=604800`,
      },
    }
  );
}
