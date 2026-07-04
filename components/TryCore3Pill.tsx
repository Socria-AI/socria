'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'socria.core3Discovered.v1';

export function TryCore3Pill({
  onTry,
  isSignedIn,
  currentModel,
}: {
  onTry: () => void;
  isSignedIn: boolean;
  currentModel: 'core-2' | 'core-3';
}) {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);

  // Only show when the user is on Core 2 and hasn't dismissed / tried it.
  useEffect(() => {
    if (currentModel !== 'core-2') {
      setVisible(false);
      return;
    }
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== '1');
    } catch {
      setVisible(true);
    }
  }, [currentModel]);

  function persistDismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {}
    setVisible(false);
  }

  function handleTry() {
    // Only mark discovered for signed-in users; anon get redirected to
    // /sign-in and the pill should return after they come back.
    if (isSignedIn) persistDismiss();
    setOpen(false);
    onTry();
  }

  if (!visible) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={handleTry}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="try-core3-pill inline-flex items-center gap-1.5 px-3 h-7 rounded-full bg-moss-50 border border-moss-200/70 text-moss-700 text-[12px] font-medium hover:bg-moss-100 hover:border-moss-600/60 transition-colors"
        aria-describedby="try-core3-popover"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2z" />
        </svg>
        Try Core 3
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          persistDismiss();
        }}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-ink text-paper text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
        style={{ opacity: open ? 1 : 0 }}
      >
        ×
      </button>

      {open && (
        <div
          id="try-core3-popover"
          role="dialog"
          className="absolute right-0 top-full mt-2 w-[300px] rounded-2xl border border-ink/10 bg-white shadow-xl z-40 p-4 animate-fade-up"
        >
          <p className="text-[10px] uppercase tracking-[0.18em] text-moss-700 font-medium mb-2.5">
            Language noticing
          </p>
          <div className="text-[13.5px] text-ink leading-relaxed border-l-2 border-moss-600/60 pl-3 py-1 bg-moss-50/50 rounded-r">
            You said{' '}
            <span className="try-core3-word" aria-label="might">
              might
            </span>{' '}
            — not fully convinced yet.
          </div>
          <p className="mt-3 text-[12px] text-ink/60 leading-snug">
            Core 3 notices the loaded words in your thinking and reflects
            them back — in italic serif green.
          </p>
          <button
            type="button"
            onClick={handleTry}
            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-moss-600 hover:bg-moss-700 text-paper h-9 text-[13px] font-medium transition-colors"
          >
            {isSignedIn ? 'Switch to Core 3' : 'Sign in to unlock'}
            <span aria-hidden>→</span>
          </button>
        </div>
      )}
    </div>
  );
}
