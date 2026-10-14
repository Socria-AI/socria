// What test/dashboard renders and checks: the developer dashboard's pure
// parts, from one bundle — the gate, the counters' vocabulary, the
// aggregation and the server-rendered page body.
export { Dashboard } from '@/components/dashboard/Dashboard';
export { aggregate, isAcademicDomain, PERSONAL_DOMAINS, DOMAIN_FLOOR } from '@/lib/dashboard/aggregate';
export { mayViewDashboard, parseAdmins } from '@/lib/dashboard/gate';
export { parseRange, RANGES } from '@/lib/dashboard/types';
export { kindsFor, answerAllowed, dayOf, ONBOARDING_STEPS } from '@/lib/product-event-kinds';
export { COUNTED_EVENTS, isCounted, countFirstParty } from '@/lib/product-events';
export { INTENTS, START_MODELS } from '@/lib/onboarding-intents';
export { ROLES } from '@/lib/onboarding-roles';
