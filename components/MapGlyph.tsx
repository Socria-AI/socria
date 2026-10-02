// The mark on a rail row that says "this one has a map".
//
// It is a small thinking map — four nodes and the lines between them — rather
// than the Logos brain, because the brain is the mark of a MODEL and what the
// row is reporting is a fact about the session: it grew a map. A chat begun in
// Core and a line of thinking begun in Logos sit in one list, and the thing
// that tells them apart is the thing this draws. Drawn in currentColor so it
// takes the row's ink, and the rail's own `.s-glyph` box sets its width.

export function MapGlyph({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className ? `map-glyph ${className}` : 'map-glyph'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* the edges: a root to two branches, one branch to a leaf */}
      <path d="M6.6 6.2 L15.9 11.4" />
      <path d="M6.6 6.2 L8.4 17.3" />
      <path d="M15.9 11.4 L8.4 17.3" />
      <path d="M15.9 11.4 L19.2 18.4" />
      {/* the nodes, filled so they sit on top of the lines */}
      <circle cx="6.6" cy="6.2" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="15.9" cy="11.4" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="8.4" cy="17.3" r="2" fill="currentColor" stroke="none" />
      <circle cx="19.2" cy="18.4" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}
