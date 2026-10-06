'use client';
// components/ThemeScope.tsx
//
// The reader's theme belongs to the app's own routes. The head script applies
// it on a first load; this keeps it right across client-side navigation —
// on into /chat, or out to the journal, which keeps its paper.

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { applyTheme, effectiveTheme, membership, readTheme, themeAppliesTo } from '@/lib/theme';

export function ThemeScope() {
  const path = usePathname();
  useEffect(() => {
    applyTheme(themeAppliesTo(path) ? effectiveTheme(readTheme(window.localStorage), membership() ?? true) : 'paper');
  }, [path]);
  return null;
}
