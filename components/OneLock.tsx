'use client';

// The quiet mark of something Socria One opens.
//
// It is deliberately small and never in the way. The product's job at a
// boundary is to say "there is more here", once, and then get out of the way —
// not to interrupt someone mid-thought with a sales page. Clicking it is what
// opens the full screen.

export function OneLock({
  label = 'Socria One',
  onClick,
  className,
}: {
  label?: string;
  onClick?: () => void;
  className?: string;
}) {
  const cls = `lg-onelock${className ? ` ${className}` : ''}`;
  const glyph = (
    <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2.2" />
      <path d="M8.5 11V7.8a3.5 3.5 0 0 1 7 0V11" />
    </svg>
  );
  if (!onClick) {
    return (
      <span className={cls} title={`${label} opens this`}>
        {glyph}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`${label} opens this`}
      aria-label={`${label} opens this`}
    >
      {glyph}
    </button>
  );
}
