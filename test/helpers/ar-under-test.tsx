// AR Mode, gathered for test/ar-mode.test.mjs: the geometry (lib/logos5/ar.ts), who may use it
// (lib/ar-access.ts), the overlay itself (components/logos5/ARMode.tsx), and the store a card put down
// is kept in — the Logic Map's own (lib/canvas-store.ts).
export * from '@/lib/logos5/ar';
export { mayUseAr, openToAll, waitlistAddress } from '@/lib/ar-access';
export { ARMode } from '@/components/logos5/ARMode';
export { CANVAS_CHANGED, announceCanvas, emptyCanvas, isPinned, lensOf, loadCanvas, pin, saveCanvas, withSettled } from '@/lib/canvas-store';
export { RELATIONS } from '@/lib/logos';
