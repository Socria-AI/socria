// components/Colophon.tsx
//
// The bottom of every page, and the only place some of it is reachable from.
//
// WHY IT IS SHARED. This markup used to live inlined in the homepage, which
// meant the homepage was the only public surface carrying a route to the
// privacy policy, the terms, the security page or the subprocessor list.
// /blog, /one and /explore had no legal footer at all. A policy nobody can
// navigate to is not a published policy — it is a URL you have to already
// know — and "it is on the front page" is not an answer when somebody landed
// on a blog post from a search result.
//
// So one component, one link set, every public page. Adding a page now means
// adding a Colophon to it, and forgetting is visible.
//
// STYLING IS PER-SURFACE, DELIBERATELY. The journal issue is a dark forest
// ground and everything else is paper, so a single colour would be invisible
// on one of them. The class `colophon` (already defined under .jr-root, and
// more specific than the base rules here) keeps the dark treatment; every
// other surface gets `sc-colophon` and reads on paper. The LINKS — the part
// that actually matters — are the same everywhere.

import Link from 'next/link';

const LINKS: { href: string; label: string }[] = [
  { href: '/logos', label: 'Logos' },
  { href: '/explore', label: 'Explore' },
  { href: '/blog', label: 'Blog' },
  { href: '/docs', label: 'Docs' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/security', label: 'Security' },
  { href: '/subprocessors', label: 'Subprocessors' },
];

export function Colophon({
  className = '',
  children,
}: {
  /** extra classes — the journal passes `colophon` for its dark treatment */
  className?: string;
  /** anything surface-specific, e.g. the journal's print link */
  children?: React.ReactNode;
}) {
  return (
    <div className={`sc-colophon ${className}`.trim()}>
      <span>Socria · Human-first AI</span>
      {LINKS.map((l) => (
        <span key={l.href}>
          <Link href={l.href}>{l.label}</Link>
        </span>
      ))}
      {children}
      <span className="it">Think For Yourself.</span>
      <span>
        {/* Rendered from the clock so it cannot rot into last year. */}©{' '}
        <span data-year="">{new Date().getFullYear()}</span>
      </span>
    </div>
  );
}
