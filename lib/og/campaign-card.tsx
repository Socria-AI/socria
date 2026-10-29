// lib/og/campaign-card.tsx
//
// The relaunch's link-preview card (/og/campaign): black, the network the page
// settles into (lib/campaign/scene.ts, built at the card's own size), and the
// one line in white. Nothing else — it is a share of the same page.
//
// Runs on the edge (app/og/[...key]/route.tsx); the face is the TTF Inter 600
// that lib/og/card.tsx uses.

import { ImageResponse } from 'next/og';
import { CAMPAIGN_LINE, SHOW_LINKS } from '@/lib/campaign';
import { TIMELINE, buildScene, nodeAt, wordsDim } from '@/lib/campaign/scene';

let face: Promise<ArrayBuffer> | null = null;

export async function renderCampaignCard(): Promise<ImageResponse> {
  face ??= fetch(new URL('./fonts/Inter-600.ttf', import.meta.url)).then((r) => r.arrayBuffer());
  const sans = await face;
  const W = 1200;
  const H = 630;
  const scene = buildScene({ w: W, h: H });
  const t = TIMELINE.settled + 2;
  const at = scene.nodes.map((n) => nodeAt(n, t));
  const [top, bottom] = CAMPAIGN_LINE.replace(/\.$/, '').split(/ (?=THE)/);
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', position: 'relative' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
        {(SHOW_LINKS ? scene.edges : []).map((e, i) => {
          const p = at[e.a];
          const q = at[e.b];
          const a = (e.strong ? 0.26 : 0.16) * wordsDim(scene, (p.x + q.x) / 2, (p.y + q.y) / 2, t);
          return <line key={`e${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#ffffff" strokeOpacity={a} strokeWidth={1.2} />;
        })}
        {scene.nodes.map((n, i) => {
          const p = at[i];
          const dim = wordsDim(scene, p.x, p.y, t);
          return <circle key={`n${i}`} cx={p.x} cy={p.y} r={n.r * 1.3} fill="#ffffff" fillOpacity={0.92 * dim} />;
        })}
      </svg>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          color: '#ffffff',
          fontFamily: 'Inter',
          fontWeight: 600,
          fontSize: 104,
          lineHeight: 1.02,
          letterSpacing: -3,
        }}
      >
        <div>{top}</div>
        <div>{`${bottom}.`}</div>
      </div>
    </div>,
    {
      width: W,
      height: H,
      fonts: [{ name: 'Inter', data: sans, weight: 600, style: 'normal' }],
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800' },
    }
  );
}
