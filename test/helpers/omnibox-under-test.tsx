// One input (Logos 6): the Omnibox's reader, the structure it proposes from the graph, the objective's milestones,
// and the canvas's work — one bundle, for test/omnibox.test.mjs.
export * from '@/lib/logos6/omnibox';
export { structureProposal, structureRows } from '@/lib/logos6/graph';
export { applyMapEdits } from '@/lib/map-edit';
export { sanitizeMap, EMPTY_MAP } from '@/lib/logos';
export { keepPlaced } from '@/lib/logos6/protect';
export { workItemsOf, cardFor, workLabelFor } from '@/lib/logos6/work';
export { focusOf, sanitizeCanvasFocus, canvasFocusBlock, recentChanges } from '@/lib/logos6/focus-context';
export { addMilestone, tickMilestone, objectiveBlock, sanitizeObjective, workOf } from '@/lib/logos6/objective';
export { nodeVid, edgeVid } from '@/lib/logos6/canvas-visual';
export { edgeIdOf } from '@/lib/logos6/graph';
export { ThinkingCanvas } from '@/components/logos6/ThinkingCanvas';
