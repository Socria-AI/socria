'use client';

// components/ux-v0/graphics/styleLibrary.ts — the person's own styles, kept in this browser.
//
// The library (lib/ux-v0/graphics/styles/custom.ts) is held to its shape every time it is read: a damaged or foreign
// value never reaches the composer. Kept in localStorage under one key; when storage is refused (a private window),
// the library lives for the session and says so. Sharing a library with a workspace is not available: a library is
// moved between browsers and people as an exported file.

import { useCallback, useEffect, useState } from 'react';
import { emptyLibrary, normalizeLibrary, type CustomLibrary } from '@/lib/ux-v0/graphics/styles/custom';

const KEY = 'socriaux.styles.v1';

function read(): { lib: CustomLibrary; ok: boolean } {
  try {
    const raw = window.localStorage.getItem(KEY);
    return {
      lib: raw ? normalizeLibrary(JSON.parse(raw)) : emptyLibrary(),
      ok: true,
    };
  } catch {
    return { lib: emptyLibrary(), ok: false };
  }
}

/** The library and a setter that keeps it; `stored` is false when this browser refuses to keep it. */
export function useStyleLibrary(): {
  library: CustomLibrary;
  setLibrary: (fn: (l: CustomLibrary) => CustomLibrary) => void;
  stored: boolean;
} {
  const [state, setState] = useState<{ lib: CustomLibrary; ok: boolean }>({
    lib: emptyLibrary(),
    ok: true,
  });
  useEffect(() => {
    setState(read());
    const on = (e: StorageEvent) => e.key === KEY && setState(read());
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);
  const setLibrary = useCallback((fn: (l: CustomLibrary) => CustomLibrary) => {
    setState((s) => {
      const lib = normalizeLibrary(fn(s.lib));
      let ok = true;
      try {
        window.localStorage.setItem(KEY, JSON.stringify(lib));
      } catch {
        ok = false;
      }
      return { lib, ok };
    });
  }, []);
  return { library: state.lib, setLibrary, stored: state.ok };
}
