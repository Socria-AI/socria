'use client';
// components/useNewSocria.ts
//
// Whether the new Socria is open in this browser (lib/new-socria.ts), and
// staying right as it changes: the code entered under Manage Account, in
// another tab, or on another device and brought here by the account
// (components/account/AccessCode.tsx useGateSync).

import { useEffect, useLayoutEffect, useState } from 'react';
import { GATE_CHANGED } from '@/lib/feature-gates';
import { newSocriaOpen } from '@/lib/new-socria';

/** before paint in a browser; nothing on the server */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * `atOnce` reads the browser in the first render — only for a component the
 * server never renders (LogosApp, mounted once the chat page has chosen its
 * model), so its first frame is already the right screen. Anything rendered
 * on the server starts closed and opens before paint, so its markup matches
 * the server's.
 */
export function useNewSocria(atOnce = false): boolean {
  const [open, setOpen] = useState(() => atOnce && typeof window !== 'undefined' && newSocriaOpen());
  useBeforePaint(() => {
    const read = () => setOpen(newSocriaOpen());
    read();
    window.addEventListener(GATE_CHANGED, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(GATE_CHANGED, read);
      window.removeEventListener('storage', read);
    };
  }, []);
  return open;
}
