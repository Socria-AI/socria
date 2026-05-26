// components/Button.tsx
import Link from 'next/link';
import { forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface BaseProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}

const base =
  'inline-flex items-center justify-center font-medium tracking-tight transition-all duration-200 rounded-full disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper';

const variants: Record<Variant, string> = {
  primary:
    'bg-moss-600 text-paper hover:bg-moss-700 shadow-[0_1px_0_rgba(0,0,0,0.04)]',
  secondary:
    'bg-transparent text-ink border border-ink/15 hover:border-ink/40 hover:bg-ink/5',
  ghost: 'bg-transparent text-ink hover:bg-ink/5',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-12 px-7 text-base',
};

export const Button = forwardRef<
  HTMLButtonElement,
  BaseProps & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ variant = 'primary', size = 'md', className = '', ...rest }, ref) => (
  <button
    ref={ref}
    className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
    {...rest}
  />
));
Button.displayName = 'Button';

export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: BaseProps & { href: string } & Omit<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    'href'
  >) {
  return (
    <Link
      href={href}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}
