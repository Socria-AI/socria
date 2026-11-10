// components/preview/types.ts — what a preview is asked to open.

import type { Attachment } from '@/lib/logos-attachments';

export interface PreviewTarget {
  /** the file's own name, as it was attached */
  name: string;
  /** the original's id (lib/file-originals.ts) */
  file?: string;
  /** the reading's id (lib/docs) — "What Socria read" */
  doc?: string;
  format?: string;
  mime?: string;
  size?: number;
  pages?: number;
  at?: number;
  /** a photo: the smaller copies kept in the conversation, for when the original is not at hand */
  preview?: string;
  thumb?: string;
  /** a photo: what Socria read in it; a note: its text */
  reading?: string;
  /** a note read as text, for files attached before readings had ids */
  text?: string;
}

/** An attachment as something to open. */
export function targetOf(a: Attachment): PreviewTarget {
  return {
    name: a.name || (a.kind === 'image' ? 'Photo' : a.kind === 'note' ? 'Note' : 'Document'),
    ...(a.file ? { file: a.file } : {}),
    ...(a.doc ? { doc: a.doc } : {}),
    ...(a.format ? { format: a.format } : {}),
    ...(a.mime ? { mime: a.mime } : {}),
    ...(a.size ? { size: a.size } : {}),
    ...(a.pages ? { pages: a.pages } : {}),
    ...(a.at ? { at: a.at } : {}),
    ...(a.preview ? { preview: a.preview } : {}),
    ...(a.thumb ? { thumb: a.thumb } : {}),
    ...(a.reading ? { reading: a.reading } : {}),
    ...(a.text && !a.doc ? { text: a.text } : {}),
  };
}

/** Whether there is anything to open: an original, a reading, or a photo's copy. */
export const canPreview = (a: Attachment) => !!(a.file || a.doc || a.preview || a.thumb);
