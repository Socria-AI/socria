// What the document suites import, from ONE bundle — so the context a test
// provides is the very one the document figure reads, and the display kinds
// are registered in the registry the figures look them up in.

export * from '@/lib/docs/conversation';
export * from '@/lib/docs/edit';
export { renderDoc, renderDocs, renderDocAsNote, citeKey, parseKey, DOC_RULES, defuse } from '@/lib/docs/render';
export { checkReply, citeVerdicts, groundOf, selectPassages } from '@/lib/docs/ground';
export { readDocument } from '@/lib/docs/read';
export { sanitizeSourceDoc } from '@/lib/docs/sanitize';
export { sanitizeAttachments, renderMessageForModel } from '@/lib/logos-attachments';
export { kindOf, makeDisplay, EMPTY_SPACE, displayKinds, readDisplayRequest, documentFromDoc, chartFromTable, functionFromEquation, buildDisplayPrompt } from '@/lib/objects';
export { offeredKinds } from '@/lib/objects/display-base';
export { sanitizeData } from '@/lib/objects/display-data';
export { DocumentFigure } from '@/components/display/DocumentFigure';
export { DocsContext } from '@/components/display/docs-context';
export { Gallery } from '@/components/display/Gallery';
export { RichText } from '@/components/RichText';
export { DocPreview } from '@/components/DocPreview';
