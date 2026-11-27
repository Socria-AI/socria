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
