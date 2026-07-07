'use client';

export function TryCore3Pill({
  onOpen,
  currentModel,
  visible,
}: {
  onOpen: () => void;
  currentModel: 'core-2' | 'core-3';
  visible: boolean;
}) {
  if (!visible || currentModel === 'core-3') return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="try-core3-pill inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 h-7 rounded-full bg-moss-50 border border-moss-200/70 text-moss-700 text-[12px] leading-none font-medium hover:bg-moss-100 hover:border-moss-600/60 transition-colors"
      aria-label="Learn about Socria Core 3"
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
        className="shrink-0"
      >
        <path d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2z" />
      </svg>
      <span className="whitespace-nowrap">Try Core 3</span>
    </button>
  );
}
