'use client';
// components/account/PictureComposer.tsx
//
// Your picture, composed from the marks Socria already has.
//
// No new glyph was drawn for this: four brand marks and the same NodeGlyph
// set the map draws with, which is why every option reads as Socria before it
// reads as a picture.
//
// The gating is per-SWATCH rather than per-configuration. A member's gold
// seal is dimmed rather than removed when they are not on One, so they can
// see what it is — and lib/pfp.ts keeps their stored choice intact rather
// than rewriting it, so a picture returns whole if they subscribe again.

import { useCallback, useEffect, useState } from 'react';
import { Avatar } from './Avatar';
import {
  BRAND_MARKS, DEFAULT_PFP, GROUNDS, GROUPS, PFP_KEY, RINGS, TEXTURES,
  groundOf, markOf, needsOne, sanitizePfp, type PfpConfig,
} from '@/lib/pfp';

export function PictureComposer({ isOne = false }: { isOne?: boolean }) {
  const [cfg, setCfg] = useState<PfpConfig>(DEFAULT_PFP);
  const [tab, setTab] = useState('brand');
  const [saved, setSaved] = useState(false);

  // Read once. Sanitised against the plan, so a lapsed member's stored gold
  // is drawn as something they can have rather than failing to draw at all.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PFP_KEY);
      if (raw) setCfg(sanitizePfp(JSON.parse(raw), { isOne }));
    } catch {
      /* a blocked store costs the picture, never the page */
    }
  }, [isOne]);

  const set = useCallback((patch: Partial<PfpConfig>) => {
    setCfg((c) => ({ ...c, ...patch }));
    setSaved(false);
  }, []);

  const save = useCallback(() => {
    try {
      localStorage.setItem(PFP_KEY, JSON.stringify(cfg));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [cfg]);

  const locked = (one?: boolean) => !!one && !isOne;
  const group = GROUPS.find((g) => g.id === tab) ?? GROUPS[0];

  return (
    <div className="pfp-root">
      <div className="pfp-head">
        <h1>Your picture</h1>
        <p>
          Composed from the marks Socria already uses — the brand&rsquo;s own, and the glyphs the
          map draws with. Nothing new was invented for it.
        </p>
      </div>

      <div className="pfp-body">
        {/* the preview, and the sizes it will actually be seen at */}
        <div className="pfp-stage">
          <Avatar cfg={cfg} className="av-big" />
          {/* The sizes it will actually be seen at. `.ch` is a SECTION in this
              sheet — padding and a rule — not a caption, which is why the
              first version drew a bordered box around the label. */}
          <div className="av-sizes">
            {[44, 28, 20].map((n) => (
              <span className="one" key={n}>
                <Avatar cfg={cfg} size={n} className="av-sm" />
                <span className="px">{n}px</span>
              </span>
            ))}
          </div>
        </div>

        <div className="pfp-choices">
          {/* ── the mark ── */}
          <div className="tabs" role="tablist" aria-label="Which mark">
            {GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={tab === g.id}
                className={tab === g.id ? 'on' : ''}
                onClick={() => setTab(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>

          <div className="mk-grid">
            {group.types === null
              ? BRAND_MARKS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={'mk-cell' + (cfg.mark === m.id ? ' on' : '') + (locked(m.one) ? ' locked' : '')}
                    onClick={() => !locked(m.one) && set({ mark: m.id })}
                    aria-pressed={cfg.mark === m.id}
                    title={locked(m.one) ? `${m.name} — Socria One` : m.name}
                  >
                    <Avatar cfg={{ ...cfg, mark: m.id }} size={38} className="av-sm" />
                    <span className="sw-name">{m.name}</span>
                  </button>
                ))
              : group.types.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={'mk-cell' + (cfg.mark === t ? ' on' : '')}
                    onClick={() => set({ mark: t })}
                    aria-pressed={cfg.mark === t}
                    title={t}
                  >
                    <Avatar cfg={{ ...cfg, mark: t }} size={38} className="av-sm" />
                    <span className="sw-name">{t}</span>
                  </button>
                ))}
          </div>

          {markOf(cfg.mark).kind === 'letter' && (
            <div className="ltr-field">
              <label htmlFor="pfp-letter">Your initial</label>
              <input
                id="pfp-letter"
                value={cfg.letter}
                maxLength={2}
                onChange={(e) => set({ letter: e.target.value.slice(0, 2) })}
              />
            </div>
          )}

          {/* ── the ground ──
              A bare swatch is a 44px circle with NOTHING in it; the name
              belongs to the SELECTED one and sits beside the row. Putting a
              label inside each swatch (which is what I first wrote) stacks
              text on top of every circle. */}
          <div className="ch">
            <span className="lbl">The ground</span>
            <div className="sw-row">
              {GROUNDS.map((g) => {
                const lk = locked(g.one);
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={'sw' + (lk ? ' is-locked' : '')}
                    style={{ background: g.bg }}
                    aria-pressed={cfg.ground === g.id}
                    aria-label={g.name + (lk ? ' — opens with One' : '')}
                    title={lk ? `${g.name} — Socria One` : g.name}
                    onClick={() => !lk && set({ ground: g.id })}
                  />
                );
              })}
              <span className="sw-name">{groundOf(cfg.ground).name}</span>
            </div>
          </div>

          {/* ── the frame ── pills, not swatches */}
          <div className="ch">
            <span className="lbl">The frame</span>
            <div className="opts">
              {RINGS.map((r) => {
                const one = 'one' in r && r.one === true;
                const lk = locked(one);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={lk ? 'is-locked' : ''}
                    aria-pressed={cfg.ring === r.id}
                    onClick={() => !lk && set({ ring: r.id })}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ch">
            <span className="lbl">The surface</span>
            <div className="opts">
              {TEXTURES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={cfg.texture === t.id}
                  onClick={() => set({ texture: t.id })}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {needsOne(cfg) && !isOne && (
            <p className="one-note">
              This one is part of Socria One. Your choice is kept either way — it comes back if you
              join.
            </p>
          )}

          <div className="pfp-bar">
            <button type="button" className="save" onClick={save}>
              {saved ? 'Saved' : 'Save picture'}
            </button>
            <button type="button" className="reset" onClick={() => { setCfg(DEFAULT_PFP); setSaved(false); }}>
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
