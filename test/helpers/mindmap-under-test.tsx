// Mind Map 2.0 (Logos 6): one canonical graph, three ways of working with it — the schema and its cleaning
// (lib/logos.ts), the edits (lib/map-edit.ts), what survives the map pass (lib/logos6/protect.ts), the projections
// (lib/logos6/graph.ts), and the canvas that draws them (components/logos6/ThinkingCanvas.tsx).
export { sanitizeMap, sanitizeNodeMind, sanitizeEdgeExtra, EMPTY_MAP, MIND_TONES } from '@/lib/logos';
export { applyMapEdits, keyOf } from '@/lib/map-edit';
export { keepPlaced } from '@/lib/logos6/protect';
export * from '@/lib/logos6/graph';
export * from '@/lib/logos6/canvas-visual';
export { ThinkingCanvas } from '@/components/logos6/ThinkingCanvas';
export { latestOf } from '@/lib/session-rail';
export { readNavSide, NAV_SIDES } from '@/components/logos5/nav-side';
export { sanitizeVisNote, visNoteLine } from '@/lib/visual/context';
export { readVisualAsk } from '@/lib/visual/intent';
