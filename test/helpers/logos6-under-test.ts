// Logos 6 under test (docs/LOGOS-6.md): its switches, its measures, its feature tests — and, as the phases land,
// the challenge engine, Focus, links, evidence and the learning actions. Pure modules only.
export { readL6, withArms, armToken, cleanArms, L6_PARTS, EXPERIMENT_PARTS } from '@/lib/logos6/switches';
export { useModel, returnModel } from '@/lib/logos6/measure';
export { armIn, armsFor, runningExperiments, FEATURE_EXPERIMENTS } from '@/lib/logos6/arms-server';
export { recentCapability, noteCapability, LAST_CAPABILITY_KEY } from '@/lib/logos6/track6';
export { kindsFor } from '@/lib/product-event-kinds';
export { EVENTS, scrub } from '@/lib/analytics';
export { COUNTED_EVENTS } from '@/lib/product-events';
export * as vocab from '@/lib/logos6/vocab';
// Phase 1: the challenge engine
export {
  KIND_LABEL, SHOWN, MAX_KEPT, sanitizeChallenge, challengeText, isChallengeText, checkedLine, findingCard, consideredIn,
  challengeReady, stateOf, challengeId, CHALLENGE_MARK,
} from '@/lib/challenge/challenge';
export { challengeAsked } from '@/lib/challenge/challenge-intent';
export { structureFindings, scopeIds } from '@/lib/challenge/challenge-targets';
export { gate, quoteIn } from '@/lib/challenge/challenge-gate';
export { CHALLENGE_SYSTEM, challengeUser } from '@/lib/challenge/challenge-prompt';
export { restsOn, restingOn, pulledAgainst, besides, weightOf, foundations, supportOf, isTheirs } from '@/lib/logos6/support';
export { keepPlaced } from '@/lib/logos6/protect';
export { sanitizeMap, sanitizeNodeFinding, sanitizeNodeEvidence } from '@/lib/logos';
export { applyMapEdits } from '@/lib/map-edit';
export { chooseAssist } from '@/lib/cognition/assist';
