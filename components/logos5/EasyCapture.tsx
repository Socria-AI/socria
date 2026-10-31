'use client';

// components/logos5/EasyCapture.tsx — EASY VIEW: the photo it is made from.
//
// Chosen in Make (lib/logos5/make.ts, `opens: 'photo'`): a sheet with two big
// ways in — take a photo (the phone's camera, straight away) or choose one —
// then "Reading the photo…" in words, not a spinner, while it is read
// (app/api/logos/easy), and the easy view opens in Artifacts. What went wrong
// is said plainly, with a way to try again. Set by the brand book, and for
// the people it is for: big type, buttons a thumb cannot miss, words on every
// control.

import { useEffect, useRef, useState } from 'react';
import { EASY_READ_EDGE, isImageFile, prepareImage, type PreparedImage } from '@/lib/logos-upload';
import './easy-capture.css';

type Phase = { at: 'choose' } | { at: 'reading'; thumb: string } | { at: 'failed'; why: string; thumb?: string };

export function EasyCapture({
  open,
  onClose,
  touch,
  said = '',
  onPhoto,
}: {
  open: boolean;
  onClose: () => void;
  /** a phone or a tablet: the camera is offered first */
  touch: boolean;
  /** what was typed in the box beside it, sent with the photo */
  said?: string;
  /** read the photo and make the easy view: null once it is made, else why not, in a sentence */
  onPhoto: (photo: PreparedImage, said: string) => Promise<string | null>;
}) {
  const [phase, setPhase] = useState<Phase>({ at: 'choose' });
  // a tablet is not narrow, but it has a camera and a finger: it is offered the camera too
  const [coarse, setCoarse] = useState(false);
  const phone = touch || coarse;
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const backTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase({ at: 'choose' });
    setCoarse(typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);
    backTo.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>('.ec-go')?.focus());
    return () => {
      backTo.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase.at !== 'reading') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, phase.at]);

  async function take(file: File | undefined) {
    if (!file) return;
    if (!isImageFile(file)) return setPhase({ at: 'failed', why: 'That is not a photo. Choose a picture — a JPEG, PNG or HEIC.' });
    let photo: PreparedImage;
    try {
      photo = await prepareImage(file, undefined, EASY_READ_EDGE);
    } catch (e: any) {
      return setPhase({ at: 'failed', why: e?.message || 'That photo could not be opened.' });
    }
    setPhase({ at: 'reading', thumb: photo.thumb });
    const why = await onPhoto(photo, said).catch((e: any) => (e?.message as string) || 'That photo could not be read just now — try again in a moment.');
    if (why) setPhase({ at: 'failed', why, thumb: photo.thumb });
  }

  if (!open) return null;
  const busy = phase.at === 'reading';
  const ways = (
    <div className="ec-ways">
      {phone && (
        <button type="button" className="ec-go is-main" onClick={() => camera.current?.click()} disabled={busy}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4.5 8.5h3l1.6-2.5h5.8l1.6 2.5h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />
            <circle cx="12" cy="13.5" r="3.2" />
          </svg>
          Take a photo
        </button>
      )}
      <button type="button" className={`ec-go${phone ? '' : ' is-main'}`} onClick={() => library.current?.click()} disabled={busy}>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
          <path d="M3.5 16l5-5 4 4 2.5-2.5 5.5 5.5" />
          <circle cx="15.5" cy="9.5" r="1.5" />
        </svg>
        Choose a photo
      </button>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={library}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif"
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );

  return (
    <div className="ec-veil" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div
        ref={panel}
        className="ec"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ec-title"
        aria-busy={busy}
        onDragOver={(e) => {
          if (!busy && e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => {
          if (busy) return;
          e.preventDefault();
          void take(e.dataTransfer.files?.[0]);
        }}
      >
        <header className="ec-head">
          <div className="ec-bar">
            <p className="ec-lbl">Easy view</p>
            <button type="button" className="ec-x" aria-label="Close" onClick={onClose} disabled={busy}>
              ×
            </button>
          </div>
          <h2 id="ec-title" className="ec-title">
            {phone ? (
              <>
                Point your phone at the <em>small print</em>.
              </>
            ) : (
              <>
                A photo of the <em>small print</em>.
              </>
            )}
          </h2>
          <p className="ec-lead">
            A menu, a medicine label, a timetable, a letter. Socria reads it and shows it big and clear — make the words bigger, switch on high contrast, or have it read aloud.
          </p>
        </header>

        {phase.at === 'reading' ? (
          <div className="ec-reading" role="status" aria-live="polite">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="ec-thumb" src={phase.thumb} alt="The photo being read" />
            <p className="ec-reading-t">Reading the photo…</p>
            <p className="ec-reading-s">This takes a few seconds.</p>
            <span className="ec-line" aria-hidden="true" />
          </div>
        ) : (
          <>
            {phase.at === 'failed' && (
              <div className="ec-failed" role="alert">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {phase.thumb && <img className="ec-thumb is-small" src={phase.thumb} alt="The photo that was tried" />}
                <p>{phase.why}</p>
              </div>
            )}
            {phase.at === 'failed' && <p className="ec-again">Try another photo:</p>}
            {ways}
            <p className="ec-tip">Hold it steady, fill the picture with the words, and find good light.</p>
          </>
        )}
      </div>
    </div>
  );
}
