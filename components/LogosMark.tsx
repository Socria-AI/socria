// The Logos 3 mark: one idea at the top, two lines of thought running down
// from it. The left one is drawn solid and ends in an open node — a thought
// worked through. The right one is dashed and ends in a dashed node — a
// thought still forming. Everything Logos does sits between those two.
//
// Drawn on a 320 × 320 grid in currentColor, so it takes the colour of
// whatever carries it (the header, a chip, a dark theme).

export function LogosMark({
  size = 26,
  className,
}: {
  /** rendered height in px; the mark is square */
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className ? `lg-mark ${className}` : 'lg-mark'}
      width={size}
      height={size}
      viewBox="0 0 320 320"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* the idea */}
      <circle cx="160" cy="57" r="30" fill="currentColor" stroke="none" />
      {/* a line of thought worked through */}
      <path d="M141 94 L 79 218" strokeWidth="15" />
      <circle cx="57" cy="250" r="30" strokeWidth="15" />
      {/* a line of thought still forming */}
      <path d="M178 95 L 241 218" strokeWidth="15" strokeDasharray="13 15" />
      <circle cx="259" cy="254" r="28" strokeWidth="15" strokeDasharray="14 15" />
    </svg>
  );
}
