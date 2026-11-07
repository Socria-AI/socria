// One board. The chatbox is the chat. (Logos 5, VIII · One view): the rules (lib/logos5/oneView.ts), the
// turns read from a conversation (lib/logos5/canvas.ts), and the board and its sheet drawn
// (components/logos5/L5Board.tsx) — one bundle, for test/logos5-one-view.test.mjs.
export * from '@/lib/logos5/oneView';
export { canvasTurns, closingAsk } from '@/lib/logos5/canvas';
export { L5Board } from '@/components/logos5/L5Board';
