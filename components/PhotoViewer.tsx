'use client';

// components/PhotoViewer.tsx — a photo in the conversation, opened large.
//
// Pressed from the picture in a message, or from a photo's chip while it is
// still in the box (components/LogosComposer.tsx AttachmentList): the photo
// as big as the screen allows, on ink, with its name, and what Socria read in
// it a press away. A press on the photo shows it at its full size, to pan
// across small print; another fits it again. Escape, the close button or the
// ground around it close it, and the focus goes back where it was.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './photos.css';

export function PhotoViewer({ src, name, reading, onClose }: { src: string; name: string; reading?: string; onClose: () => void }) {
  const [full, setFull] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  // the page around it re-renders (a reply streaming in): only the latest way to close is kept, nothing is redone
  const closing = useRef(onClose);
  closing.current = onClose;
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      closing.current();
    };
    window.addEventListener('keydown', onKey, true);
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      html.style.overflow = was;
      back?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="pv" role="dialog" aria-modal="true" aria-label={name} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pv-bar">
        <p className="pv-lbl">Photo</p>
        <button ref={close} type="button" className="pv-x" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className={`pv-stage${full ? ' is-full' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <button type="button" className="pv-photo" aria-pressed={full} aria-label={full ? 'Fit the photo to the screen' : 'Show the photo at full size'} onClick={() => setFull((f) => !f)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={name} draggable={false} />
        </button>
      </div>
      <div className="pv-foot">
        <p className="pv-name">{name}</p>
        <p className="pv-hint">{full ? 'Press the photo to fit it to the screen.' : 'Press the photo to see it at full size.'}</p>
        {reading && (
          <details className="pv-read">
            <summary>What Socria read in it</summary>
            <p>{reading}</p>
          </details>
        )}
      </div>
    </div>,
    document.body
  );
}
