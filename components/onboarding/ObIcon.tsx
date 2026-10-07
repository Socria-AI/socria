// components/onboarding/ObIcon.tsx — the onboarding's own small line icons.
// One stroke weight, one size, drawn to sit beside a serif title: the paper's
// ink, not an app's glyph set.

const PATHS: Record<string, string> = {
  // what they mostly think about
  study: 'M3 5.5c3-1.4 6-1.4 9 .5 3-1.9 6-1.9 9-.5v13c-3-1.4-6-1.4-9 .5-3-1.9-6-1.9-9-.5zM12 6v13.5',
  build: 'M4 14h7v6H4zM13 14h7v6h-7zM8.5 8h7v6h-7zM8.5 8l3.5-4 3.5 4',
  research: 'M9 3h6M10 3v5.5L5 18a1.6 1.6 0 0 0 1.4 2.4h11.2A1.6 1.6 0 0 0 19 18l-5-9.5V3M7.5 14h9',
  create: 'M4 20l4.5-1.2L19 8.3a2.1 2.1 0 0 0-3-3L5.5 15.8zM14.5 6.8l2.7 2.7M4 20h7',
  lead: 'M5 21V4M5 4h11l-2 4 2 4H5',
  care: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  life: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
  // the starting points
  decide: 'M12 21v-7M12 14L6 6M12 14l6-8M6 6V3.5M6 6H3.5M18 6V3.5M18 6h2.5',
  understand: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  develop: 'M12 21v-8M12 13c0-4 2.5-6.5 7-7 0 4.5-2.5 7-7 7zM12 15c0-3-2-5-6-5.5 0 3.5 2 5.5 6 5.5z',
  problem: 'M4 4h7v4h4V4h5v7h-4v4h4v5h-7v-4H9v4H4v-7h4V9H4z',
  look: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20',
};

export function ObIcon({ name, size = 22 }: { name: string; size?: number }) {
  const d = PATHS[name === 'research-intent' ? 'look' : name];
  if (!d) return null;
  return (
    <svg className="ob-ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
