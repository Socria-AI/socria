// Document intelligence, in one bundle: what a question about a document asks
// for (lib/docs/intent.ts), what the model is shown for it (lib/docs/render.ts),
// Socria's grounded reading of a document (lib/docs/brief.ts), and where a
// passage sits in the original (lib/preview/locate.ts).

export { docAskOf, shapeOf, leansOnLast, docAskLine, DOC_ASKS } from '@/lib/docs/intent';
export { renderDoc, renderDocs, DOC_RULES } from '@/lib/docs/render';
export { readDocument } from '@/lib/docs/read';
export { sanitizeSourceDoc } from '@/lib/docs/sanitize';
export {
  analysable,
  briefAsk,
  briefMaterial,
  briefPoints,
  dataOf,
  plainBrief,
  qualityOf,
  readableBlocks,
  restoreBrief,
  sanitizeBrief,
  standing,
  structureOf,
  BRIEF_LIMITS,
} from '@/lib/docs/brief';
export { levelOf } from '@/lib/model-router';
export { termsDiagram, argumentDiagram } from '@/lib/docs/brief-map';
export { markOf, blockAt, pickable, markRect, fold, needleOf, firstHolding, validBox, unitOf } from '@/lib/preview/locate';
export { makeDisplay, EMPTY_SPACE } from '@/lib/objects';
export { currentOf } from '@/lib/objects/core';
export { setActivity, endActivity, withActivity, activityLine } from '@/lib/activity';
