// components/Logo.tsx
import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  href?: string | null;
  showWordmark?: boolean;
}

export function Logo({ size = 'md', href = '/', showWordmark = true }: LogoProps) {
  const markSize =
    size === 'sm' ? 22 :
    size === 'lg' ? 44 :
    size === 'xl' ? 80 :
    28;

  const textClass =
    size === 'sm' ? 'text-xl' :
    size === 'lg' ? 'text-3xl' :
    size === 'xl' ? 'text-5xl' :
    'text-2xl';

  const inner = (
    <span className="inline-flex items-center gap-2.5 group">
      <Image
        src="/socria-mark.png"
        alt="Socria mark"
        width={markSize}
        height={markSize}
        priority
        className="transition-transform group-hover:scale-105"
        style={{
          width: markSize,
          height: 'auto',
          objectFit: 'contain',
        }}
      />
      {showWordmark && (
        <span className={`font-serif ${textClass} tracking-tight text-ink leading-none`}>
          Socria
        </span>
      )}
    </span>
  );

  if (!href) return inner;
  return <Link href={href}>{inner}</Link>;
}
