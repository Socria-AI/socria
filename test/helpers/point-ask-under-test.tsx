// What the Point & Ask suite imports, from ONE bundle — so the display kinds
// are registered in the registry the focus descriptions look them up in, and
// the components render with the same TeX picker context they read.

export { describeFocus, describePassage, describeExpression, focusBlock, sanitizeFocus } from '@/lib/workspace/focus';
export { cleanAboutRef, aboutLine, ABOUT_KINDS } from '@/lib/chat-thread';
export { create, kindOf, makeDisplay, documentFromDoc, EMPTY_SPACE } from '@/lib/objects';
export { readDocument } from '@/lib/docs/read';
export { TeX, TexPick, MathText } from '@/components/TeX';
export { LogosMessage } from '@/components/LogosMessage';
export { LogosComposer } from '@/components/LogosComposer';
