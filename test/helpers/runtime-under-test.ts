// The Logos Runtime in one bundle (lib/runtime): orchestration, the cognitive
// state, allocation, behaviour, epistemic control and the representation layer.
export * from '@/lib/runtime';
export { readSignals } from '@/lib/core4/signals';
export { LOGOS_CHAT_PROMPT } from '@/lib/logos';
// What kind of exchange a turn is (lib/cognition/register.ts), read before the runtime's state.
export { readExchange, smallTalk, asksAboutSocria, onlyAboutSocria, withoutGreeting, mannerOf, TALK, EXCHANGES } from '@/lib/cognition/register';
export { chooseAssist, renderAssist, offersWork, wantsExplanation } from '@/lib/cognition/assist';
export { webIntent } from '@/lib/core4/web';
export { interrogatives } from '@/lib/core4/questions';
export { SentenceGate } from '@/lib/core4/stream-gate';
