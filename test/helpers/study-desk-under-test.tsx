// Study, read left to right (Logos 5, Screen 4): the facts the desk reads
// (lib/logos5/studyDesk.ts), the desk itself (components/logos5/StudyDesk.tsx)
// and where the conversation docks beside it (lib/logos5/views.ts besideSide)
// — one bundle, for test/logos5-study-desk.test.mjs.
export * from '@/lib/logos5/studyDesk';
export { StudyDesk, drawsInCard } from '@/components/logos5/StudyDesk';
export { besideSide } from '@/lib/logos5/views';
