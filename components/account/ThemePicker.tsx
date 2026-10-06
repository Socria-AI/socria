'use client';
// components/account/ThemePicker.tsx
//
// Four grounds to read Socria on. Paper and Dark are everyone's; White and the
// Socria One blue are part of One, shown to everyone so the choice is visible,
// and offered as the way in for someone who is not a member yet.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { applyTheme, chooseTheme, effectiveTheme, readTheme, setMembership, themeAppliesTo, THEME_CHANGED, THEME_IDS, THEMES, type ThemeId } from '@/lib/theme';

export function ThemePicker({ isOne, onUpgrade }: { isOne: boolean; onUpgrade?: () => void }) {
  const [current, setCurrent] = useState<ThemeId>('paper');
  useEffect(() => {
    setCurrent(effectiveTheme(readTheme(window.localStorage), isOne));
    const on = (e: Event) => setCurrent(((e as CustomEvent).detail as ThemeId) ?? 'paper');
    window.addEventListener(THEME_CHANGED, on);
    return () => window.removeEventListener(THEME_CHANGED, on);
  }, [isOne]);

  return (
    <div className="themes" role="radiogroup" aria-label="Theme">
      {THEME_IDS.map((id) => {
        const t = THEMES[id];
        const locked = t.one && !isOne;
        const [ground, ink, accent] = t.swatch;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={current === id}
            aria-disabled={locked || undefined}
            className={`theme${current === id ? ' is-on' : ''}${locked ? ' is-locked' : ''}`}
            data-theme-id={id}
            onClick={() => {
              if (locked) return;
              setCurrent(chooseTheme(id, isOne));
            }}
            title={locked ? `${t.says} — comes with Socria One` : t.says}
          >
            <span className="theme-swatch" style={{ background: ground }} aria-hidden="true">
              <span className="theme-line" style={{ background: ink }} />
              <span className="theme-line is-short" style={{ background: ink, opacity: 0.45 }} />
              <span className="theme-dot" style={{ background: accent }} />
            </span>
            <span className="theme-name">
              {t.label}
              {t.one && <span className="theme-one">One</span>}
            </span>
          </button>
        );
      })}
      {!isOne && (
        <p className="theme-note">
          White and the One blue come with Socria One.{' '}
          <Link className="link-act" href="/one" onClick={onUpgrade}>
            See One →
          </Link>
        </p>
      )}
    </div>
  );
}

/**
 * Keep the shown theme honest once the plan is known: a One theme on a
 * browser whose membership has lapsed goes back to paper, without forgetting
 * the choice — it returns if the membership does.
 */
export function useThemeGuard(isOne: boolean, known: boolean) {
  useEffect(() => {
    if (!known) return;
    setMembership(isOne);
    if (!themeAppliesTo(window.location.pathname)) return;
    const shown = effectiveTheme(readTheme(window.localStorage), isOne);
    if ((document.documentElement.getAttribute('data-theme') ?? 'paper') !== shown) applyTheme(shown);
  }, [isOne, known]);
}
