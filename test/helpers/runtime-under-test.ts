// The Logos Runtime in one bundle (lib/runtime): orchestration, the cognitive
// state, allocation, behaviour, epistemic control and the representation layer.
export * from '@/lib/runtime';
export { readSignals } from '@/lib/core4/signals';
export { LOGOS_CHAT_PROMPT } from '@/lib/logos';
// What kind of exchange a turn is (lib/cognition/register.ts), read before the runtime's state.
export { readExchange, smallTalk, asksAboutSocria, onlyAboutSocria, withoutGreeting, mannerOf, wrapsUp, takesIn, saysGoodbye, TALK, EXCHANGES } from '@/lib/cognition/register';
// How hard a turn is to think about (lib/model-router.ts): read beside the engagement reading, which it is independent of.
// Under its own name: the runtime already exports a levelOf (lib/runtime/explain.ts — what the person knows).
export { levelOf as reasoningLevelOf } from '@/lib/model-router';
export { chooseAssist, renderAssist, offersWork, wantsExplanation } from '@/lib/cognition/assist';
export { webIntent } from '@/lib/core4/web';
export { interrogatives } from '@/lib/core4/questions';
export { SentenceGate } from '@/lib/core4/stream-gate';
// Their claims decided by the engine, as the route hands them to Core 4's allocator (replay.ts).
export { planTurn } from '@/lib/accuracy/accuracy';
// A claim put up to be checked, and a pick asked for (lib/cognition/claims.ts) — test/presentation-selection.test.mjs.
export { claimCheck, pickAsk, practicalShould } from '@/lib/cognition/claims';
