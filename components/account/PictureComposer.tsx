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
          <Avatar cfg={cfg} size={220} className="av-big" />
          <div className="av-sizes">
            <Avatar cfg={cfg} size={44} className="av-sm" />
            <Avatar cfg={cfg} size={28} className="av-sm" />
            <span className="ch">44 and 28 — where it is usually seen</span>
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

          {/* ── the ground ── */}
          <div className="opts">
            <span className="lbl">Ground</span>
            <div className="sw-row">
              {GROUNDS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={'sw' + (cfg.ground === g.id ? ' on' : '') + (locked(g.one) ? ' locked' : '')}
                  style={{ background: g.bg, color: g.ink }}
                  onClick={() => !locked(g.one) && set({ ground: g.id })}
                  aria-pressed={cfg.ground === g.id}
                  title={locked(g.one) ? `${g.name} — Socria One` : g.name}
                >
                  <span className="sw-name">{g.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── ring and texture ── */}
          <div className="opts">
            <span className="lbl">Edge</span>
            <div className="sw-row">
              {RINGS.map((r) => {
                const one = 'one' in r && r.one === true;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={'sw' + (cfg.ring === r.id ? ' on' : '') + (locked(one) ? ' locked' : '')}
                    onClick={() => !locked(one) && set({ ring: r.id })}
                    aria-pressed={cfg.ring === r.id}
                  >
                    <span className="sw-name">{r.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="opts">
            <span className="lbl">Surface</span>
            <div className="sw-row">
              {TEXTURES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={'sw' + (cfg.texture === t.id ? ' on' : '')}
                  onClick={() => set({ texture: t.id })}
                  aria-pressed={cfg.texture === t.id}
                >
                  <span className="sw-name">{t.name}</span>
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
