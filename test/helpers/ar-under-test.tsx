// AR Mode, gathered for test/ar-mode.test.mjs: the geometry (lib/logos5/ar.ts), who may use it
// (lib/ar-access.ts), the overlay itself (components/logos5/ARMode.tsx), and the store a card put down
// is kept in — the Logic Map's own (lib/canvas-store.ts).
export * from '@/lib/logos5/ar';
export { mayUseAr, openToAll, waitlistAddress } from '@/lib/ar-access';
export { ARMode } from '@/components/logos5/ARMode';
export { CANVAS_CHANGED, announceCanvas, emptyCanvas, isPinned, lensOf, loadCanvas, pin, saveCanvas, withSettled } from '@/lib/canvas-store';
export { RELATIONS } from '@/lib/logos';
// hands on all of Logos 5: a hand as a pointer (lib/hand-pointer.ts)
export { HandPointer, HandCursor, frameToScreen, zoomWheelDelta, CONTROL_BOX, CLICK_SLOP } from '@/lib/hand-pointer';
// what is said while the hands are on (lib/logos5/hand-commands.ts)
export { readHandCommand, findCard, plainSaid, HANDCAM_EVENT } from '@/lib/logos5/hand-commands';
// reaching the hands without loading them: Stop and the pointer's spoken commands (lib/hand-bus.ts)
export { stopHands, registerHandStop, handPointer, registerHandPointer } from '@/lib/hand-bus';
