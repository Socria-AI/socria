'use client';
// components/ux-v0/studio/Vision.tsx — what is taking shape, gathered under the question: the references liked, the
// colours they and the answers give, the type, the temperament and the influences named. It is read from the very
// preferences the engines will be given (lib/ux-v0/studio/apply.ts, prefsOf), so what is shown here is what is used.

import type { StudioState } from '@/lib/ux-v0/studio/schema';
import { answerOf, prefsOf } from '@/lib/ux-v0/studio/apply';
import { likedOf } from '@/lib/ux-v0/studio/research';
import { styleById } from '@/lib/ux-v0/graphics/styles/registry';

const PREFIX: Record<string, string> = { graphic: 'g', logo: 'l', website: 'w', board: 'b' };

export function Vision({ st }: { st: StudioState }) {
  const p = PREFIX[st.mode];
  if (!p) return null;
  const liked = likedOf(st);
  const prefs = prefsOf(st);
  const palette = prefs.palette;
  const ownPalette = !!answerOf(st, `${p}.palette`);
  const colours = palette ? [palette.ground, palette.ink, palette.accent, palette.accent2].filter((c): c is string => !!c) : [];
  const influences = prefs.styles.map((id) => styleById(id)?.name ?? '').filter(Boolean);
  const feel = prefs.personality.slice(0, 4);
  const empty = !liked.length && !colours.length && !prefs.faces && !feel.length && !influences.length;
  return (
    <section className="sd-vision" aria-label="What is taking shape">
      <p className="sd-vision-k">Taking shape</p>
      {empty ? (
        <p className="sd-vision-empty">What you choose gathers here: the references you like, and the colour, type and temperament they point to.</p>
      ) : (
        <div className="sd-vision-row">
          {liked.length > 0 && (
            <div className="sd-vision-g">
              <span className="sd-vision-l">
                {liked.length} reference{liked.length === 1 ? '' : 's'}
              </span>
              <span className="sd-vision-refs">
                {liked.slice(0, 6).map((r) => (
                  <img key={r.id} src={r.thumb} alt={r.title ? `“${r.title}”${r.creator ? ` by ${r.creator}` : ''}` : 'A reference you liked'} title={[r.title, r.creator].filter(Boolean).join(' — ')} loading="lazy" referrerPolicy="no-referrer" />
                ))}
              </span>
            </div>
          )}
          {colours.length > 0 && (
            <div className="sd-vision-g">
              <span className="sd-vision-l">{ownPalette ? 'Colour' : 'Colour, from your references'}</span>
              <span className="sd-vision-sw" role="img" aria-label={`Colours ${colours.join(', ')}`}>
                {colours.map((c, i) => (
                  <span key={`${c}-${i}`} style={{ background: c }} />
                ))}
              </span>
            </div>
          )}
          {prefs.faces && (
            <div className="sd-vision-g">
              <span className="sd-vision-l">Type</span>
              <span className="sd-vision-v">
                {prefs.faces.display}
                {prefs.faces.body && prefs.faces.body !== prefs.faces.display ? ` with ${prefs.faces.body}` : ''}
              </span>
            </div>
          )}
          {feel.length > 0 && (
            <div className="sd-vision-g">
              <span className="sd-vision-l">Feel</span>
              <span className="sd-vision-v">{feel.join(', ')}</span>
            </div>
          )}
          {influences.length > 0 && (
            <div className="sd-vision-g">
              <span className="sd-vision-l">In the spirit of</span>
              <span className="sd-vision-v">{influences.join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
