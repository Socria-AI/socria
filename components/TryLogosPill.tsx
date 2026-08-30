'use client';

import type { SocriaModel } from '@/lib/socria-prompt';
import { LogosMark } from './LogosMark';

/** The quiet way back to the invitation, once it has been dismissed for now. */
export function TryLogosPill({
  onOpen,
  currentModel,
  visible,
}: {
  onOpen: () => void;
  currentModel: SocriaModel;
  visible: boolean;
}) {
  if (!visible || currentModel === 'logos') return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="try-core3-pill inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 h-7 rounded-full bg-moss-50 border border-moss-200/70 text-moss-700 text-[12px] leading-none font-medium hover:bg-moss-100 hover:border-moss-600/60 transition-colors"
      aria-label="See what Socria Logos does"
    >
      <span className="shrink-0 flex items-center" aria-hidden>
        <LogosMark size={12} />
      </span>
      <span className="whitespace-nowrap">Try Logos</span>
    </button>
  );
}
