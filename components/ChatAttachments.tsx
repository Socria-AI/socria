'use client';

// Attaching things to a Core 4 message.
//
// Everything becomes text before it is sent, once, here:
//   images      shrunk in the browser, read by the vision pass (/api/logos/read)
//   text, code  read in the browser as they are
//   documents   PDF, Word, PowerPoint, Excel, OpenDocument, RTF and zips —
//               unpacked on the server (/api/files/read); images found inside
//               a zip come back and are read like any other image
//
// The chip says what happened to each file — reading, read, words, why not —
// because an attachment that silently came to nothing is worse than none.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Attachment } from '@/lib/logos-attachments';
import { MAX_ATTACHMENTS, guessOrigin, wordCount } from '@/lib/logos-attachments';
import { MAX_FILE_TEXT, MAX_UPLOAD_BYTES, kindOfFile, refusalFor } from '@/lib/file-kinds';
import { prepareImage } from '@/lib/logos-upload';

export interface DraftAttachment extends Attachment {
  id: string;
  status: 'reading' | 'ready' | 'error';
  error?: string;
}

/** What went wrong, in words — a dropped connection surfaces as "Failed to fetch". */
function why(e: unknown): string {
  if (e instanceof TypeError) return 'could not reach Socria — check your connection';
  return (e as Error)?.message || 'could not be read';
}

let seq = 0;
const nextId = () => `catt_${++seq}_${Date.now().toString(36)}`;

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type });
}

function noteFrom(name: string, text: string, truncated = false): Omit<DraftAttachment, 'id'> {
  const cut = text.length > MAX_FILE_TEXT;
  const kept = cut ? text.slice(0, MAX_FILE_TEXT) : text;
  return {
    kind: 'note',
    name,
    // A file is someone else's words until it reads like theirs; the chip
    // lets them say otherwise, and the model treats the two very differently.
    origin: guessOrigin(kept) === 'mine' ? 'mine' : 'source',
    text: kept,
    words: wordCount(kept),
    ...(cut || truncated ? { truncated: true } : {}),
    status: 'ready',
  };
}

/**
 * The drafts for the message being written, and the one way files get in.
 * `headers` are the page's auth headers, passed through to both readers.
 */
export function useChatAttachments(opts: { headers: () => Record<string, string>; sessionId: () => string | null }) {
  const [drafts, setDrafts] = useState<DraftAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // Read at call time, so a file attached after switching conversations is
  // counted against the conversation it was attached in.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const patch = (id: string, p: Partial<DraftAttachment>) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...p } : d)));

  const push = (d: DraftAttachment) =>
    setDrafts((prev) => (prev.length >= MAX_ATTACHMENTS ? prev : [...prev, d]));

  const addImage = useCallback(
    async (file: File) => {
      const id = nextId();
      let prepared;
      try {
        prepared = await prepareImage(file);
      } catch (e: any) {
        setNotice(e?.message || `${file.name} could not be opened.`);
        return;
      }
      push({
        id,
        kind: 'image',
        name: prepared.name,
        thumb: prepared.thumb,
        ...(prepared.preview ? { preview: prepared.preview } : {}),
        status: 'reading',
      });
      try {
        const res = await fetch('/api/logos/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...optsRef.current.headers() },
          body: JSON.stringify({ image: prepared.full, sessionId: optsRef.current.sessionId() }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.reading) throw new Error(json?.error || 'could not be read');
        patch(id, { reading: json.reading, status: 'ready' });
      } catch (e: any) {
        patch(id, { status: 'error', error: why(e) });
      }
    },
    []
  );

  const addDocument = useCallback(
    async (file: File) => {
      if (file.size > MAX_UPLOAD_BYTES) {
        setNotice(`${file.name} is too large — 4 MB is the limit for documents.`);
        return;
      }
      const id = nextId();
      push({ id, kind: 'note', name: file.name, status: 'reading' });
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/files/read', { method: 'POST', headers: optsRef.current.headers(), body: form });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'could not be read');
        const notes: { name: string; text: string; truncated: boolean }[] = json.notes ?? [];
        const images: { name: string; dataUrl: string }[] = json.images ?? [];
        const skipped: string[] = json.skipped ?? [];
        if (!notes.length && !images.length) {
          patch(id, { status: 'error', error: skipped[0] ?? 'nothing in it could be read' });
          return;
        }
        // The placeholder becomes the first note; a zip's images follow as
        // their own chips, each read once like any other image.
        setDrafts((prev) => {
          const at = prev.findIndex((d) => d.id === id);
          if (at < 0) return prev;
          const next = [...prev];
          if (notes.length) next[at] = { id, ...noteFrom(notes[0].name, notes[0].text, notes[0].truncated) };
          else next.splice(at, 1);
          return next;
        });
        for (const im of images) await addImage(await dataUrlToFile(im.dataUrl, im.name));
        if (skipped.length) {
          setNotice(
            skipped.length === 1
              ? `Left out: ${skipped[0]}`
              : `Left out ${skipped.length} files: ${skipped.slice(0, 3).join('; ')}${skipped.length > 3 ? '; …' : ''}`
          );
        }
      } catch (e: any) {
        patch(id, { status: 'error', error: why(e) });
      }
    },
    [addImage]
  );

  const add = useCallback(
    async (files: FileList | File[]) => {
      setNotice(null);
      const list = Array.from(files);
      if (list.length > MAX_ATTACHMENTS) setNotice(`Up to ${MAX_ATTACHMENTS} attachments a message.`);
      for (const f of list.slice(0, MAX_ATTACHMENTS)) {
        const kind = kindOfFile(f.name, f.type);
        if (kind === 'image') await addImage(f);
        else if (kind === 'document') await addDocument(f);
        else if (kind === 'text') {
          try {
            const text = (await f.text()).replace(/\r\n?/g, '\n');
            if (!text.trim()) setNotice(`${f.name} is empty.`);
            else push({ id: nextId(), ...noteFrom(f.name, text) });
          } catch {
            setNotice(`${f.name} could not be read.`);
          }
        } else if (kind === 'unsupported' && f.size <= MAX_UPLOAD_BYTES && !f.type.startsWith('image/')) {
          // An unfamiliar extension may still be text; the server looks.
          await addDocument(f);
        } else setNotice(refusalFor(f.name));
      }
    },
    [addImage, addDocument]
  );

  const remove = (id: string) => setDrafts((prev) => prev.filter((d) => d.id !== id));
  const setOrigin = (id: string, origin: Attachment['origin']) => patch(id, { origin });
  /** What goes with the message: only what finished reading. */
  const ready = (): Attachment[] =>
    drafts.filter((d) => d.status === 'ready').map(({ id: _i, status: _s, error: _e, ...a }) => a);

  return {
    drafts,
    setDrafts,
    notice,
    setNotice,
    add,
    remove,
    setOrigin,
    ready,
    reading: drafts.some((d) => d.status === 'reading'),
    hasReady: drafts.some((d) => d.status === 'ready'),
  };
}

function FileGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M4 2.5h5.5L12.5 5.5V13a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z" />
      <path d="M9.5 2.5V5a.5.5 0 0 0 .5.5h2.5M5.5 8h5M5.5 10.5h5" strokeLinecap="round" />
    </svg>
  );
}

type Item = Attachment & { id?: string; status?: DraftAttachment['status']; error?: string };

/** The picture, full size, over everything; Esc or a click outside closes it. */
function Lightbox({ item, onClose }: { item: Item; onClose: () => void }) {
  const [showReading, setShowReading] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const src = item.preview || item.thumb;
  // Portalled to <body>: the conversation column is its own stacking context,
  // and a fixed overlay inside it is painted UNDER the header and composer.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={item.name || 'Image'}
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={item.name || 'Attached image'}
        className="max-w-[92vw] max-h-[78vh] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="flex max-w-[92vw] flex-col items-center gap-2 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 text-[13px] text-white/85">
          <span className="truncate max-w-[60vw]">{item.name || 'Image'}</span>
          {item.reading && (
            <button type="button" className="underline decoration-white/40 hover:text-white" onClick={() => setShowReading((v) => !v)}>
              {showReading ? 'hide what Socria read' : 'what Socria read'}
            </button>
          )}
          <button type="button" className="rounded-full px-2 text-white/70 hover:text-white" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {showReading && item.reading && (
          <p className="max-w-[640px] max-h-[20vh] overflow-auto whitespace-pre-wrap rounded-lg bg-white/10 p-3 text-left text-[12.5px] leading-snug text-white/85">
            {item.reading}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * An image as a picture, at its own shape — a sent message shows it large, a
 * draft smaller — and clickable to open full size.
 */
function ImageTile({ a, large, onOpen, onRemove }: { a: Item; large: boolean; onOpen: () => void; onRemove?: () => void }) {
  const src = a.preview || a.thumb;
  return (
    <div className={`relative inline-block ${a.status === 'error' ? 'rounded-xl ring-1 ring-red-300' : ''}`}>
      <button
        type="button"
        onClick={onOpen}
        disabled={!src}
        className="block overflow-hidden rounded-xl border border-ink/10 bg-ink/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-600"
        aria-label={`Open ${a.name || 'image'}`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={a.name || 'Attached image'}
            className={`block object-cover ${large ? 'max-h-[320px] max-w-[min(420px,70vw)]' : 'h-24 max-w-[180px]'} w-auto`}
          />
        ) : (
          <span className={`grid place-items-center text-ink/40 ${large ? 'h-40 w-56' : 'h-24 w-24'}`}>image</span>
        )}
      </button>
      {a.status === 'reading' && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xl bg-black/55 px-2 py-1 text-[11px] text-white animate-pulse">
          reading…
        </span>
      )}
      {a.status === 'error' && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xl bg-red-700/85 px-2 py-1 text-[11px] text-white">
          {a.error || 'could not be read'}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border border-ink/15 bg-white text-ink/60 shadow-sm hover:text-ink"
          aria-label={`Remove ${a.name || 'image'}`}
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Attachments — in the composer (removable, origin correctable) or on a sent message. */
export function AttachmentChips({
  items,
  onRemove,
  onOrigin,
  align = 'start',
}: {
  items: Item[];
  onRemove?: (id: string) => void;
  onOrigin?: (id: string, origin: Attachment['origin']) => void;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [viewing, setViewing] = useState<Item | null>(null);
  if (!items.length) return null;
  // Sent messages are the ones without a remove button: they show pictures large.
  const large = !onRemove;
  const images = items.map((a, i) => [a, i] as const).filter(([a]) => a.kind === 'image');
  const notes = items.map((a, i) => [a, i] as const).filter(([a]) => a.kind !== 'image');
  return (
    <div className={`flex flex-col gap-2 ${align === 'end' ? 'items-end' : 'items-start'}`}>
      {images.length > 0 && (
        <div className={`flex flex-wrap gap-2 ${align === 'end' ? 'justify-end' : ''}`}>
          {images.map(([a, i]) => (
            <ImageTile
              key={a.id ?? i}
              a={a}
              large={large}
              onOpen={() => setViewing(a)}
              onRemove={onRemove && a.id ? () => onRemove(a.id!) : undefined}
            />
          ))}
        </div>
      )}
      {notes.length > 0 && (
      <div className={`flex flex-wrap gap-2 ${align === 'end' ? 'justify-end' : ''}`}>
      {notes.map(([a, i]) => {
        const sub =
          a.status === 'reading'
            ? 'reading…'
            : a.status === 'error'
              ? a.error || 'could not be read'
              : `${(a.words ?? wordCount(a.text ?? '')).toLocaleString('en-US')} words${a.truncated ? ' · long, cut' : ''}`;
        return (
          <div
            key={a.id ?? i}
            className={`relative max-w-full rounded-xl border px-2.5 py-1.5 text-left ${
              a.status === 'error' ? 'border-red-300 bg-red-50' : 'border-ink/15 bg-white'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-8 h-8 rounded-md grid place-items-center shrink-0 ${
                  a.status === 'reading' ? 'bg-moss-50 text-moss-700 animate-pulse' : 'bg-ink/5 text-ink/60'
                }`}
              >
                <FileGlyph />
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] text-ink truncate max-w-[220px]">{a.name || 'Text'}</span>
                <span className={`block text-[11px] ${a.status === 'error' ? 'text-red-800' : 'text-ink/50'} max-w-[260px]`}>
                  {sub}
                  {a.text && a.status !== 'reading' && (
                    <button type="button" className="ml-2 underline decoration-ink/25 hover:text-ink" onClick={() => setOpen(open === i ? null : i)}>
                      {open === i ? 'hide' : 'view'}
                    </button>
                  )}
                </span>
              </span>
              {onRemove && a.id && (
                <button
                  type="button"
                  onClick={() => onRemove(a.id!)}
                  className="ml-1 w-6 h-6 shrink-0 rounded-full text-ink/40 hover:text-ink hover:bg-ink/5"
                  aria-label={`Remove ${a.name || 'attachment'}`}
                >
                  ×
                </button>
              )}
            </div>
            {/* Whose words these are. Guessed, always correctable while it is
                a draft — Socria treats a source and your own writing differently. */}
            {onOrigin && a.id && a.status === 'ready' && (
              <div className="mt-1.5 flex gap-1 text-[11px]" role="radiogroup" aria-label="Whose words are these?">
                {(['source', 'mine'] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={(a.origin ?? 'source') === o}
                    onClick={() => onOrigin(a.id!, o)}
                    className={`rounded-full px-2 py-0.5 border ${
                      (a.origin ?? 'source') === o ? 'border-moss-600 bg-moss-50 text-moss-800' : 'border-ink/15 text-ink/55 hover:text-ink'
                    }`}
                  >
                    {o === 'source' ? 'Source material' : 'My own writing'}
                  </button>
                ))}
              </div>
            )}
            {open === i && (
              <pre className="mt-2 max-h-64 max-w-[min(520px,80vw)] overflow-auto whitespace-pre-wrap rounded-lg bg-ink/5 p-2 text-[11.5px] leading-snug text-ink/80">
                {a.text?.slice(0, 20_000)}
                {(a.text?.length ?? 0) > 20_000 ? '\n…' : ''}
              </pre>
            )}
          </div>
        );
      })}
      </div>
      )}
      {viewing && <Lightbox item={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

export function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
