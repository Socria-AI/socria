// Adaptive response rendering, gathered for test/inline-ui.test.mjs: the inline
// vocabulary (lib/inline-ui.ts), the planner that offers it (lib/runtime/
// presentation.ts), the stream gate that checks it, the parser and the
// components that draw it, and the objects an element opens as in Artifacts.
export * from '@/lib/inline-ui';
export { planPresentation, renderPresentation, presentationRoom, representationOf, REPRESENTATIONS } from '@/lib/runtime/presentation';
export { readTurnState } from '@/lib/runtime/state';
export { routeTurn } from '@/lib/runtime/orchestrate';
export { indexWorkspace, searchWorkspace } from '@/lib/runtime/representation';
export { readSignals } from '@/lib/core4/signals';
export { SentenceGate } from '@/lib/core4/stream-gate';
export { parseBlocks } from '@/lib/rich-text';
export { RichText, StreamingRichText, keepFoldOpen } from '@/components/RichText';
export { InlineBlock } from '@/components/inline/InlineUI';
export { L5Message } from '@/components/logos5/L5Message';
export { makeDisplay, EMPTY_SPACE } from '@/lib/objects';
// the core prompt's rule on the shape of a reply (logos5-v3)
export { LOGOS5_CORE, PERSONA_VERSION } from '@/lib/runtime/behavior';
// how a Logos 5 reply is laid out to be read (lib/reply-layout.ts, logos5-v4)
export * from '@/lib/reply-layout';
// the arithmetic of the live elements (lib/inline-math.ts) and the Logic Map under a reply (lib/logos5/mapSlice.ts)
export * from '@/lib/inline-math';
export * from '@/lib/logos5/mapSlice';
// minimum explanation, maximum understanding: how a turn is read, what it is told, what is drawn
export { claimCheck, PRACTICAL_SHOULD } from '@/lib/cognition/claims';
export { wantsExplanation, asksForDecision, isFactQuestion, chooseAssist, renderAssist } from '@/lib/cognition/assist';
export { readExchange } from '@/lib/cognition/register';
export { allocate, renderAllocation } from '@/lib/runtime/allocation';
export { LOGOS5_MATH } from '@/lib/runtime/behavior';
export { NO_LOOKUP_FACT } from '@/lib/core4/web';
// keep: an element into Artifacts as it was left; a quick plot drawn inline
export { quickPlot } from '@/lib/runtime/plot-ask';
export { sanitizeKept, keptFrom, keptText, keptName } from '@/lib/objects/display-kept';
export { kindOf } from '@/lib/objects/core';
export { displayMeta, offeredKinds } from '@/lib/objects/display-base';
// a reply still being written, and how the parser reads a list line (vx-render: disclosure, density, streaming)
export { L5Pending } from '@/components/logos5/L5Message';
export { listLine, isTableRule, bulletBlock } from '@/lib/rich-text';
// how a diagram's parts are placed and said (lib/inline-diagram.ts); an element that throws, said in words instead
export * from '@/lib/inline-diagram';
export { InlineSafe, InlineFallback } from '@/components/inline/InlineUI';
export { fmtNum } from '@/lib/objects/display-data';
// Logos 6 artifacts: the edit engine, the mind map's layout, the kept element's history (lib/artifact-edit.ts,
// lib/inline-diagram.ts, lib/objects/display-kept.ts over lib/objects/core.ts)
export * from '@/lib/artifact-edit';
export { mindLayout, mindRows, defaultFolds, wrapLabel, REL_SAID } from '@/lib/inline-diagram';
export { readKeptEdit } from '@/lib/objects/display-kept';
export { create as createObject, apply as applyObjectStep, seek as seekObject, currentOf, sanitizeSpace } from '@/lib/objects/core';
// the artifact's editor (components/display/SpecEditor.tsx) and whose words a kept element hears (lib/objects readOperation)
export { SpecEditor } from '@/components/display/SpecEditor';
export { readOperation } from '@/lib/objects';
// Socria's changes made in place (lib/artifact-focus.ts): what asks for one, what it is about, the gate, the landing
export * from '@/lib/artifact-focus';
// an artifact looked over before it is shown (lib/artifact-qa.ts)
export * from '@/lib/artifact-qa';
