// components/Logo.tsx
import Link from 'next/link';

export function Logo({
  size = 'md',
  href = '/',
}: {
  size?: 'sm' | 'md' | 'lg';
  href?: string | null;
}) {
  const sizeClass =
    size === 'sm' ? 'text-xl' : size === 'lg' ? 'text-4xl' : 'text-2xl';

  const inner = (
    <span className="inline-flex items-baseline gap-2 group">
      {/* Glyph */}
      <span
        aria-hidden
        className="relative inline-block w-2.5 h-2.5 rounded-full bg-moss-600 translate-y-[-1px] transition-all group-hover:bg-moss-700"
      />
      <span className={`font-serif ${sizeClass} tracking-tight text-ink`}>
        Socria
      </span>
    </span>
  );

  if (!href) return inner;
  return <Link href={href}>{inner}</Link>;
}
