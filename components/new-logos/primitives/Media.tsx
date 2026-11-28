'use client';
// components/new-logos/primitives/Media.tsx — an image as evidence or reference: uploaded (kept privately under the
// account, shown only to its owner) or by address, with a caption and where it came from. Empty, it offers the ways
// to put one in: choose a file, drop one, paste one, or give an address.

import { useRef, useState } from 'react';
import { cleanUrl } from '@/lib/new-logos/clean';
import { mediaUrl, uploadImage } from './media-client';
import { CommitInput, type PrimProps } from './common';

export function MediaPrim({ p, editable, run }: PrimProps<'media'>) {
  const d = p.data;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const put = async (file: File) => {
    setProblem(null);
    const local = URL.createObjectURL(file);
    setBusy(local);
    try {
      const kept = await uploadImage(file);
      setBroken(false);
      run([{ op: 'update', id: p.id, data: { src: { kind: 'upload', id: kept.id }, alt: d.alt || file.name.replace(/\.[a-z0-9]+$/i, '') } }]);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'The image could not be kept.');
    } finally {
      URL.revokeObjectURL(local);
      setBusy(null);
    }
  };
  const src = busy ?? (d.src ? (d.src.kind === 'upload' ? mediaUrl(d.src.id) : d.src.url) : null);

  return (
    <figure
      className="nl-prim-media"
      onDragOver={(e) => editable && e.dataTransfer.types.includes('Files') && (e.preventDefault(), e.stopPropagation())}
      onDrop={(e) => {
        if (!editable) return;
        const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
        if (!f) return;
        e.preventDefault();
        e.stopPropagation();
        void put(f);
      }}
      onPaste={(e) => {
        if (!editable) return;
        const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/'));
        if (f) (e.preventDefault(), void put(f));
      }}
    >
      {src && !broken ? (
        <div className={`nl-media-frame is-${d.fit}${busy ? ' is-busy' : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={d.alt || d.caption || 'Image'} draggable={false} onError={() => !busy && setBroken(true)} />
          {busy ? <span className="nl-media-busy">Keeping the image…</span> : null}
        </div>
      ) : (
        <div className="nl-media-empty">
          {broken ? <p className="nl-prim-hint">This image cannot be shown{d.src?.kind === 'url' ? ' from its address' : ''}.</p> : null}
          {editable ? (
            <>
              <button type="button" className="nl-btn is-small" onClick={() => fileRef.current?.click()}>
                Choose an image
              </button>
              <span className="nl-prim-hint">or drop or paste one here, or give its address:</span>
              <CommitInput
                className="nl-in is-small"
                aria-label="Image address"
                placeholder="https://…"
                value={d.src?.kind === 'url' ? d.src.url : ''}
                onCommit={(v) => {
                  const url = cleanUrl(v);
                  if (!url) return setProblem(v.trim() ? 'That is not a web address.' : null);
                  setProblem(null);
                  setBroken(false);
                  run([{ op: 'update', id: p.id, data: { src: { kind: 'url', url } } }]);
                }}
              />
            </>
          ) : (
            <p className="nl-prim-hint">No image yet.</p>
          )}
        </div>
      )}
      {problem ? (
        <p className="nl-prim-error" role="status">
          {problem}
        </p>
      ) : null}
      {d.caption || d.source ? (
        <figcaption>
          {d.caption}
          {d.source ? (
            <span className="nl-media-source">
              {' '}
              Source:{' '}
              {d.source.url ? (
                <a href={d.source.url} target="_blank" rel="noopener noreferrer nofollow">
                  {d.source.label}
                </a>
              ) : (
                d.source.label
              )}
            </span>
          ) : null}
        </figcaption>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void put(f);
        }}
      />
    </figure>
  );
}
