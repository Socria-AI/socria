'use client';

// The quiet way back to the Logos 2 cover, once it has been closed.
//
// The standing invitation in the chat is the environment's — the surface a
// person has not seen yet and would not guess from a text box. It stays
// until they say "don't show again" on the cover itself, and disappears on
// the surface it is inviting them to.

import type { SocriaModel } from '@/lib/socria-prompt';
import { SOCRIA_MODELS } from '@/lib/socria-prompt';
import { ModelGlyph } from './ModelGlyph';

export function TryLogos2Pill({
  onOpen,
  currentModel,
  visible,
}: {
  onOpen: () => void;
  currentModel: SocriaModel;
  visible: boolean;
}) {
  // Nothing to invite somebody to when they are already there.
  if (!visible || SOCRIA_MODELS[currentModel].logosSurface) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="try-core3-pill inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 h-7 rounded-full bg-moss-50 border border-moss-200/70 text-moss-700 text-[12px] leading-none font-medium hover:bg-moss-100 hover:border-moss-600/60 transition-colors"
      aria-label="See what Socria Logos 2 does"
    >
      <span className="shrink-0 flex items-center" aria-hidden>
        <ModelGlyph model="logos-2" size={12} />
      </span>
      <span className="whitespace-nowrap">Try Logos 2</span>
    </button>
  );
}
