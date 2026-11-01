// The line of thinking, zoomed out: what goes on the canvas (lib/logos5/canvas.ts),
// the canvas itself and its Logic Map card (components/logos5/L5Canvas.tsx), and
// what Socria is told when the chatbox is aimed at something on it (lib/workspace/focus.ts).
export * from '@/lib/logos5/canvas';
export { L5Canvas, MapPreview } from '@/components/logos5/L5Canvas';
export { describeFocus } from '@/lib/workspace/focus';
