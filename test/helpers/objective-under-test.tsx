// One chat, one objective (Logos 6): the objective module, the map that holds it, the pass that must keep it, the
// line that shows it, and the drift reader it works beside — one bundle, for test/objective.test.mjs.
export * from '@/lib/logos6/objective';
export { sanitizeMap, EMPTY_MAP } from '@/lib/logos';
export { keepPlaced } from '@/lib/logos6/protect';
export { readDrift } from '@/lib/topic-drift';
export { titleFor, emptySession } from '@/lib/logos-sessions';
export { ObjectiveLine } from '@/components/logos6/ObjectiveLine';
