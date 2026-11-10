'use client';

// components/preview/context.tsx — opening a file, from anywhere in a conversation.
//
// A chip in a message, a picture, a card in Files: each asks the one host to open
// the file, and the host draws the preview beside the conversation (FilePreview).
// The heavy part (pdf.js, the Word and slide readers) loads only when a file is
// first opened.

import dynamic from 'next/dynamic';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import type { PreviewTarget } from './types';
import { keepOriginal } from '@/lib/preview/originals';
import type { Attachment } from '@/lib/logos-attachments';

export type { PreviewTarget } from './types';

export interface Host {
  open: (t: PreviewTarget) => void;
  /** keep a file's original as it is attached (this device, and the account when signed in): what its attachment carries */
  keep: (file: File) => Promise<Pick<Attachment, 'file' | 'size' | 'mime' | 'at'> | null>;
}

const Ctx = createContext<Host | null>(null);

/** The host's way to open a file, or null where there is none (the caller keeps its old behaviour). */
export function useFilePreview(): Host | null {
  return useContext(Ctx);
}

const FilePreview = dynamic(() => import('./FilePreview').then((m) => m.FilePreview), { ssr: false });

export function FilePreviewHost({
  children,
  account,
  headers,
  onOpenReading,
  hostRef,
}: {
  children: ReactNode;
  /** signed in: originals are fetched from the account when this device does not have them */
  account: boolean;
  headers: () => Record<string, string>;
  /** open a document's reading (with its citation keys) beside the map */
  onOpenReading?: (docId: string) => void;
  /** for the component that renders the host, which cannot read its own context */
  hostRef?: MutableRefObject<Host | null>;
}) {
  const [target, setTarget] = useState<PreviewTarget | null>(null);
  const open = useCallback((t: PreviewTarget) => setTarget(t), []);
  const headersRef = useRef(headers);
  headersRef.current = headers;
  const keep = useCallback(
    (file: File) => keepOriginal(file, { account, headers: () => headersRef.current() }).catch(() => null),
    [account]
  );
  const host = useMemo(() => ({ open, keep }), [open, keep]);
  if (hostRef) hostRef.current = host;
  return (
    <Ctx.Provider value={host}>
      {children}
      {target && <FilePreview key={`${target.file ?? ''}:${target.doc ?? ''}:${target.name}`} target={target} account={account} headers={headers} onClose={() => setTarget(null)} {...(onOpenReading ? { onOpenReading } : {})} />}
    </Ctx.Provider>
  );
}
