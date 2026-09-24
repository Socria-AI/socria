'use client';

// The quiet way back to the Core 4 introduction, once it has been closed.
//
// It replaces the Try Logos pill in the same slot. Logos is one surface among
// several now; the model somebody is about to talk to is the thing worth a
// standing invitation, and a rail with two pills in it has neither.

import type { SocriaModel } from '@/lib/socria-prompt';
import { ModelGlyph } from './ModelGlyph';

export function TryCore4Pill({
  onOpen,
  currentModel,
  visible,
}: {
  onOpen: () => void;
  currentModel: SocriaModel;
  visible: boolean;
}) {
  // Nothing to invite somebody to when they are already there.
  if (!visible || currentModel === 'core-4') return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="try-core3-pill inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 h-7 rounded-full bg-moss-50 border border-moss-200/70 text-moss-700 text-[12px] leading-none font-medium hover:bg-moss-100 hover:border-moss-600/60 transition-colors"
      aria-label="See what Socria Core 4 does"
    >
      <span className="shrink-0 flex items-center" aria-hidden>
        <ModelGlyph model="core-4" size={12} />
      </span>
      <span className="whitespace-nowrap">Try Core 4</span>
    </button>
  );
}
