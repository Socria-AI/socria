'use client';
// components/quiet/QuietMotion.tsx
//
// The register's own behaviour, and nothing else.
//
// WHAT THIS REPLACED, AND WHY. The first version called initJournal() on the
// grounds that quiet.js and issue.js share their reveal code. They do — but
// initJournal is the JOURNAL's driver, and it does far more than fill a
// progress bar: it adds `.pre` (opacity: 0) to every `.rv`, `[data-split]`,
// `.turn`, `.fig` and `.reading` it can find, and it REWRITES text nodes to
// wrap each word in a span for the rise animation.
//
// Pointed at /logos, which has none of those affordances and its own motion
// already, that hid most of the page and mangled the rest. The page came out
// as a masthead over an empty sheet.
//
// So this does the two things the register actually asks for — fill the
// hairline as the page is read, and mark the masthead once it has scrolled —
// and touches nothing it did not render itself. It never adds `.pre`, so
// `.q-root .rv.pre { opacity: 0 }` can never fire and nothing here can hide
// content that was on the page before it mounted.

import { useEffect } from 'react';

export function QuietMotion() {
  useEffect(() => {
    const doc = document.documentElement;
    const bar = document.querySelector<HTMLElement>('.rp');
    const mast = document.querySelector<HTMLElement>('.qmast');
    if (!bar && !mast) return;

    const onScroll = () => {
      const top = window.scrollY || doc.scrollTop;
      const span = doc.scrollHeight - window.innerHeight;
      if (bar) bar.style.width = `${span > 0 ? (top / span) * 100 : 0}%`;
      if (mast) mast.classList.toggle('scrolled', top > 8);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return null;
}
