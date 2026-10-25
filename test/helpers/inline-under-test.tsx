// Adaptive response rendering, gathered for test/inline-ui.test.mjs: the inline
// vocabulary (lib/inline-ui.ts), the planner that offers it (lib/runtime/
// presentation.ts), the stream gate that checks it, the parser and the
// components that draw it, and the objects an element opens as in Artifacts.
export * from '@/lib/inline-ui';
export { planPresentation, renderPresentation, presentationRoom } from '@/lib/runtime/presentation';
export { readTurnState } from '@/lib/runtime/state';
export { routeTurn } from '@/lib/runtime/orchestrate';
export { indexWorkspace, searchWorkspace } from '@/lib/runtime/representation';
export { readSignals } from '@/lib/core4/signals';
export { SentenceGate } from '@/lib/core4/stream-gate';
export { parseBlocks } from '@/lib/rich-text';
export { RichText, StreamingRichText } from '@/components/RichText';
export { InlineBlock } from '@/components/inline/InlineUI';
export { L5Message } from '@/components/logos5/L5Message';
export { makeDisplay, EMPTY_SPACE } from '@/lib/objects';
// the core prompt's rule on the shape of a reply (logos5-v3)
export { LOGOS5_CORE, PERSONA_VERSION } from '@/lib/runtime/behavior';
