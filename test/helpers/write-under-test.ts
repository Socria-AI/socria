// The writing system in one bundle: the document model, its renderers and
// readers, Word in and out, the proofreading rules, the Draft Space's reading
// of its board, and the assist route's prompts and checks (lib/write/*).
export * from '@/lib/write/doc';
export * from '@/lib/write/render';
export * from '@/lib/write/parse';
export * from '@/lib/write/zip';
export * from '@/lib/write/docx';
export * from '@/lib/write/pdf';
export * from '@/lib/write/media';
export * from '@/lib/write/word';
export * from '@/lib/write/import';
export * from '@/lib/write/checks';
export * from '@/lib/write/board';
export * from '@/lib/write/assist';
export * from '@/lib/write/focus';
export { richWriting } from '@/lib/write/flags';
export { focusBlock, sanitizeFocus } from '@/lib/workspace/focus';
export { cleanAboutRef, aboutLine } from '@/lib/chat-thread';
