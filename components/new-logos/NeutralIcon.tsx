'use client';
// components/new-logos/NeutralIcon.tsx — the site-wide favicon, repointed. Next.js emits the root favicon.ico on every
// route and a route cannot opt out of it (it is a root-only file convention), so under /new-logos any icon link that is
// not the neutral mark is pointed at the neutral mark instead — an attribute change, never a removal, so the head React
// manages is left intact. Links added later (a navigation within the route) are caught by the observer.

import { useEffect } from 'react';
import { NEUTRAL_ICON } from './icon';

export function NeutralIcon() {
  useEffect(() => {
    const fix = () => {
      document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]').forEach((l) => {
        if (l.getAttribute('href') === NEUTRAL_ICON) return;
        l.setAttribute('href', NEUTRAL_ICON);
        l.setAttribute('type', 'image/svg+xml');
        l.removeAttribute('sizes');
      });
    };
    fix();
    const watch = new MutationObserver(fix);
    watch.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    return () => watch.disconnect();
  }, []);
  return null;
}
