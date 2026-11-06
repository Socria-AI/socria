// The universal Logic Map (Logos 5): the model that holds a drawing beside
// the person's thinking, what a diagram request routes to, the map pass's
// instructions, edits by hand and the free plan's whole-or-nothing rule for a
// drawing — one bundle, for test/logic-map-universal.test.mjs.
export { sanitizeMap, mapCaps, mapInstructions, NODE_TYPES, RELATIONS, NODE_ORIGINS, DIAGRAM_KINDS, DRAWING_LIMITS, MAP_LABEL_MAX } from '@/lib/logos';
export { GRAMMARS, GRAMMAR_IDS, ROLES, statedBuilding, satisfies, structuralScores, hasLoop, readBuilding, lensFor } from '@/lib/representation';
export { routeTurn, needsMap, diagramAsked, drawable, askedToSee } from '@/lib/runtime/orchestrate';
export { applyMapEdits, dropRemoved, keyOf } from '@/lib/map-edit';
export { keepAddedNodes, addedNodes, drawingNote } from '@/lib/quota-map';
export { RELATION_WORDS } from '@/lib/logos5/ar';
export { RELATION_LABEL, LENSES, availableLenses, ideaLenses } from '@/lib/logos-layout';
export { drawingOf, drawingFromInline, withDrawing, diagramFromDrawing, isDrawn } from '@/lib/logos5/drawing';
export { sanitizeDiagram } from '@/lib/objects/display-diagram';
export { inspectorEdits, inspectorKinds, aboutLine, kindWord } from '@/components/logos5/MapInspector';
