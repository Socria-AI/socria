'use client';
// components/logos5/useTemplates.ts — the person's own templates (lib/logos5/templates.ts), kept current:
// saved or removed in this page, or in another tab of this browser.

import { useEffect, useState } from 'react';
import { onTemplates, readTemplates, removeTemplate, type ArtifactTemplate } from '@/lib/logos5/templates';

const store = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function useTemplates(): ArtifactTemplate[] {
  const [list, setList] = useState<ArtifactTemplate[]>([]);
  useEffect(() => {
    const read = () => setList(readTemplates(store()));
    read();
    const off = onTemplates(read);
    const other = (e: StorageEvent) => {
      if (!e.key || e.key === 'socria.logos5.templates.v1') read();
    };
    window.addEventListener('storage', other);
    return () => {
      off();
      window.removeEventListener('storage', other);
    };
  }, []);
  return list;
}

/** Remove one, on this device. */
export function removeTemplateHere(id: string): void {
  removeTemplate(store(), id);
}
