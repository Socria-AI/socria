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
import Link from 'next/link';
import { Avatar } from './Avatar';
import { Label, OneMark } from '@/components/journal/ds';
import { NodeGlyph } from '@/components/NodeGlyph';
import { LogosMark } from '@/components/LogosMark';
import { OneLock } from '@/components/OneLock';
import type { LogosNodeType } from '@/lib/logos';
import {
  BRAND_MARKS, DEFAULT_PFP, GROUNDS, GROUPS, PFP_KEY, RINGS, TEXTURES,
  groundOf, markOf, needsOne, sanitizePfp, type PfpConfig,
} from '@/lib/pfp';
import { PFP_CHANGED } from './AccountControl';
import { EXPORT_SIZES, saveFile, toPng, toSvg } from './pictureFile';

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
      // The chip in the rail reads the same key. Saying so here is what makes
      // composing a picture change it everywhere without a reload — a storage
      // event only fires in OTHER tabs, never the one that wrote.
      window.dispatchEvent(new Event(PFP_CHANGED));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [cfg]);

  // Exporting, and which file is on its way. Downloads go ONE AT A TIME:
  // browsers drop simultaneous ones, so six at once would arrive as one.
  const [busy, setBusy] = useState('');

  const downloadOne = useCallback(async () => {
    saveFile(await toPng(cfg), 'socria-picture.png');
  }, [cfg]);

  const downloadAll = useCallback(async () => {
    if (busy) return;
    setBusy('Exporting…');
    try {
      const stem = `socria-picture-${cfg.mark}-${cfg.ground}`;
      saveFile(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(await toSvg(cfg))}`, `${stem}.svg`);
      for (const s of EXPORT_SIZES) {
        await new Promise((r) => setTimeout(r, 260));
        setBusy(`${s}px…`);
        saveFile(await toPng(cfg, s), `${stem}-${s}.png`);
      }
    } finally {
      setBusy('');
    }
  }, [cfg, busy]);

  const locked = (one?: boolean) => !!one && !isOne;

  /**
   * What a grid cell draws.
   *
   * The mark itself, at 26px, on the cell's own paper — NOT a miniature of
   * the finished avatar. The point of the grid is to compare marks; drawing
   * each one on the chosen ground would compare grounds instead, and at 38px
   * the discs crowd out the names.
   */
  const cellGlyph = (m: (typeof BRAND_MARKS)[number]) =>
    m.kind === 'img' ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={m.src} alt="" />
    ) : m.kind === 'logos' ? (
      <LogosMark size={26} />
    ) : m.kind === 'one' ? (
      <OneMark size={26} tone="light" />
    ) : m.kind === 'letter' ? (
      <span className="ltr">{(cfg.letter || 'A').slice(0, 1)}</span>
    ) : (
      <NodeGlyph type={m.id as LogosNodeType} />
    );
  const group = GROUPS.find((g) => g.id === tab) ?? GROUPS[0];

  return (
    <div className="pfp-root">
      <div className="pfp-head">
        <div>
          <Label tone="moss">Your account · your picture</Label>
          <h1>Your picture</h1>
          {/* `.sub` is what the sheet styles this as; it was a bare <p>. */}
          <p className="sub">
            Composed from the marks Socria already uses — the brand&rsquo;s own, and the glyphs the
            map draws with. Nothing new was invented for it.
          </p>
        </div>
        {/* THE WAY OUT. This is a full-viewport page with no masthead and no
            nav, reached from the account sheet — and it had no link back
            anywhere, so the only exit was the browser's Back button. The
            stylesheet has styled a `.back` here all along; nothing rendered
            one. */}
        <Link className="back" href="/chat">
          ← Back to Socria
        </Link>
      </div>

      <div className="pfp-body">
        {/* the preview, and the sizes it will actually be seen at */}
        <div className="pfp-stage">
          <Avatar cfg={cfg} className="av-big" />
          {/* `.stage-side` groups the sizes with the caption, which is what
              lets the whole stage turn into a row below 620px instead of the
              avatar sitting alone above a stack. */}
          <div className="stage-side">
            <div className="av-sizes">
              {[44, 28, 20].map((n) => (
                <span className="one" key={n}>
                  <Avatar cfg={cfg} size={n} className="av-sm" />
                  <span className="px">{n}px</span>
                </span>
              ))}
            </div>
            {/* What you have actually composed, named. Without it the stage
                is a picture floating in half a screen of paper. */}
            <p className="named">
              {markOf(cfg.mark).kind === 'node' ? (
                <>
                  the <em>{cfg.mark}</em> mark, on {groundOf(cfg.ground).name.toLowerCase()}
                </>
              ) : (
                <>
                  {markOf(cfg.mark).name}, on {groundOf(cfg.ground).name.toLowerCase()}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="pfp-choices">
          {/* ── the mark ──
              A SECTION, like the three below it. Without the `.ch` wrapper and
              its label the tabs and the grid sat bare against the column edge,
              with none of the padding or the hairline the others have — which
              is most of why this page read as unfinished. */}
          <div className="ch">
          <span className="lbl">The mark</span>
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

          {/* THE CELL IS A GLYPH IN A BOX, NOT A LITTLE AVATAR.
              picture.css has always described `.mk-cell > .box + .nm` — a
              30px box holding a 26px glyph, and a 9.5px caption. This rendered
              a 38px Avatar and labelled it `.sw-name`, which is the GROUND
              swatch's class: so every cell was an oversized disc with a name
              styled for something else, in a grid sized for neither. */}
          <div className="mk-grid">
            {group.types === null
              ? BRAND_MARKS.map((m) => {
                  const lk = locked(m.one);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={'mk-cell' + (lk ? ' is-locked' : '')}
                      onClick={() => !lk && set({ mark: m.id })}
                      aria-pressed={cfg.mark === m.id}
                      title={lk ? `${m.name} — Socria One` : m.name}
                    >
                      <span className="box">{cellGlyph(m)}</span>
                      <span className="nm">
                        {lk ? (
                          <span className="lk">
                            {m.name}
                            <OneLock />
                          </span>
                        ) : (
                          m.name
                        )}
                      </span>
                    </button>
                  );
                })
              : group.types.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="mk-cell"
                    onClick={() => set({ mark: t })}
                    aria-pressed={cfg.mark === t}
                    title={t}
                  >
                    <span className="box">
                      <NodeGlyph type={t as LogosNodeType} />
                    </span>
                    <span className="nm">{t}</span>
                  </button>
                ))}
          </div>

          {markOf(cfg.mark).kind === 'letter' && (
            <div className="ltr-field" style={{ marginTop: 14 }}>
              <input
                value={cfg.letter}
                maxLength={2}
                aria-label="Your initials"
                onChange={(e) => set({ letter: e.target.value.toUpperCase().slice(0, 2) })}
              />
              <span>one letter, or two</span>
            </div>
          )}
          {/* One line, and only where it says something the grid cannot.
              These are the design's own, per tab. */}
          {tab === 'maths' && (
            <p className="hint">
              The Board&rsquo;s own marks. Given, unknown, and the step where it went wrong.
            </p>
          )}
          {tab === 'reasoning' && (
            <p className="hint">
              The dashed ring is an assumption nobody has examined yet. It is the most honest one
              here.
            </p>
          )}
          </div>

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
            <p className="hint">
              Two rings is the Socria One seal — the inner is the seal, the outer the invitation
              around it.
            </p>
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

          {/* A section like the others, so it sits on the same rhythm rather
              than pressing against the one above it. */}
          {needsOne(cfg) && !isOne && (
            <div className="ch">
              <p className="one-note">
                <OneLock />
                Prussian, the gold seal and the double ring belong to Socria One. Your choice is
                kept either way — it comes back if you join.
                <Link href="/one">See what else opens →</Link>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* The bar is a SIBLING of the body, not a child of the choices column.
          It is position:fixed either way, but nesting it inside the scrolling
          column put a fixed element inside a grid track for no reason.
          Its stylesheet describes a vow on the left and an `.acts` group on
          the right; without them `space-between` threw the buttons to
          opposite edges of the window. */}
      <div className="pfp-bar">
        <p className="vow">Every file, yours: the vector master and 512 · 256 · 128 · 64 · 32px.</p>
        <div className="acts">
          {busy ? <span className="saved">{busy}</span> : saved && <span className="saved">Saved.</span>}
          <button type="button" className="reset" onClick={() => void downloadOne()} disabled={!!busy}>
            One PNG
          </button>
          <button type="button" className="reset" onClick={() => void downloadAll()} disabled={!!busy}>
            Export every file
          </button>
          <button
            type="button"
            className="reset"
            onClick={() => {
              setCfg(DEFAULT_PFP);
              setSaved(false);
            }}
          >
            Reset
          </button>
          <button type="button" className="save" onClick={save}>
            {saved ? 'Saved' : 'Use this picture'}
          </button>
        </div>
      </div>
    </div>
  );
}
