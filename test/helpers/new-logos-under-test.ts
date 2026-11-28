// New Logos (docs/NEW-LOGOS.md): the node model, its operations, the context package, the conversation helpers — and
// the existing objective contract the context must satisfy, and the relaunch gate's path rules.
export * from '../../lib/new-logos/model';
export * from '../../lib/new-logos/ops';
export * from '../../lib/new-logos/context';
export * from '../../lib/new-logos/convo';
export { memoryStore, NlSetupError } from '../../lib/new-logos/store';
export { sanitizeObjectiveTurn, objectiveBlock } from '../../lib/logos6/objective';
export { decide as takeoverDecide, pathClass } from '../../lib/takeover';
// the spatial layer: exchanges, layouts, placement — and the existing Point & Ask contracts a canvas ask must satisfy
export * as Canvas from '../../lib/new-logos/canvas';
export { askMessage } from '../../components/new-logos/ask';
export { sanitizeFocus, focusBlock } from '../../lib/workspace/focus';
export { cleanAboutRef, aboutLine } from '../../lib/chat-thread';
// visual primitives and composable artifacts: the expression language, the primitive model, shared state, operations
export * as Expr from '../../lib/new-logos/expr';
export * as Prim from '../../lib/new-logos/primitives';
export * as Compose from '../../lib/new-logos/compose';
export * as AOps from '../../lib/new-logos/artifact-ops';
export { readEquationLine, equationLine } from '../../components/new-logos/primitives/Equation';
// sources: the canonical records, references, retrieval for a question — and the existing reader they reuse
export * as Src from '../../lib/new-logos/sources';
export * as SrcOps from '../../lib/new-logos/source-ops';
export { memorySourceStore } from '../../lib/new-logos/source-store';
export { readPlain } from '../../lib/docs/plain';
export { sanitizeSourceDoc } from '../../lib/docs/sanitize';
