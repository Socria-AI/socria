'use client';

// components/display/docs-context.ts — the documents this device holds, for the figures that show them.
//
// A document's reading lives on the device that read it (lib/docs/client.ts),
// not in the workspace, so the document display reads it from here. Logos
// provides it; anywhere it is not provided, a document display says the
// reading is not at hand rather than showing anything else.

import { createContext, useContext } from 'react';
import type { SourceDoc } from '@/lib/docs/types';

export interface DocsApi {
  /** the documents at hand, by id */
  docs: ReadonlyMap<string, SourceDoc>;
  /** the letter this conversation cites a document by ("A"), when it has one */
  letterOf: (id: string) => string | null;
  /** read pages from their pictures; resolves when done, or with why it stopped */
  readPages: (id: string, pages: number[]) => Promise<{ read: number; stopped?: string }>;
  /** pages being read from their pictures right now, per document */
  reading: Readonly<Record<string, { done: number; of: number }>>;
  /** a document changed by the person's hand (a correction) — kept, and shown everywhere */
  save: (doc: SourceDoc) => void;
}

export const DocsContext = createContext<DocsApi | null>(null);
export const useDocs = (): DocsApi | null => useContext(DocsContext);
