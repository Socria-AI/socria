// Geometric SVG cover art generator — color + shape come from Sanity.
// Mirrors the .cv-* / .stroke styling in the design.

const SHAPES: Record<string, React.ReactNode> = {
  circle: (
    <circle className="stroke" cx="100" cy="100" r="46" fill="none" />
  ),
  diamond: (
    <rect
      className="stroke"
      x="58"
      y="58"
      width="84"
      height="84"
      transform="rotate(45 100 100)"
      fill="none"
    />
  ),
  'two-circles': (
    <>
      <circle className="stroke" cx="76" cy="100" r="30" fill="none" />
      <circle className="stroke" cx="124" cy="100" r="30" fill="none" />
    </>
  ),
  concentric: (
    <>
      <circle className="stroke" cx="100" cy="100" r="46" fill="none" />
      <circle className="stroke" cx="100" cy="100" r="20" fill="none" />
    </>
  ),
  tower: (
    <>
      <circle className="stroke" cx="100" cy="68" r="26" fill="none" />
      <line className="stroke" x1="100" y1="94" x2="100" y2="150" />
      <rect className="stroke" x="72" y="150" width="56" height="14" fill="none" />
    </>
  ),
  combined: (
    <>
      <circle className="stroke" cx="100" cy="64" r="34" fill="none" />
      <rect
        className="stroke"
        x="64"
        y="108"
        width="72"
        height="72"
        transform="rotate(45 100 144)"
        fill="none"
      />
    </>
  ),
};

const ALLOWED_COLORS = new Set([
  'forest',
  'moss',
  'sage',
  'gold',
  'blue',
  'ink',
]);

export function CoverArt({
  color,
  shape,
  label,
  className,
}: {
  color?: string | null;
  shape?: string | null;
  label?: string | null;
  className?: string;
}) {
  const safeColor =
    color && ALLOWED_COLORS.has(color) ? color : 'forest';
  const safeShape = shape && SHAPES[shape] ? shape : 'combined';
  return (
    <div className={`cover-art cv-${safeColor}${className ? ' ' + className : ''}`}>
      <div className="tex" />
      <svg viewBox="0 0 200 200" aria-hidden="true">
        {SHAPES[safeShape]}
      </svg>
      {label && <span className="lbl">{label}</span>}
    </div>
  );
}
