'use client';
// components/ux-v0/systems/useLinkedSystem.ts — the registry design system a project is linked to, read from this
// browser: the record and the published content the link reads (the pinned version, or the latest). Never the draft.

import { useEffect, useState } from 'react';
import { getSystem } from '@/lib/ux-v0/dsi/store';
import { latestVersion, publishedContent, type SystemRecord } from '@/lib/ux-v0/dsi/registry';
import type { SystemContent } from '@/lib/ux-v0/dsi/schema';
import type { SystemLink } from '@/lib/ux-v0/dsi/link-schema';

export interface LinkedSystem {
  rec: SystemRecord;
  content: SystemContent;
  version: number;
  /** a newer published version than the one applied, for a project that follows the latest */
  update: number | null;
}

export function useLinkedSystem(link: SystemLink | undefined): LinkedSystem | null {
  const [state, setState] = useState<LinkedSystem | null>(null);
  const key = link ? `${link.id}|${String(link.pin)}|${link.version}` : '';
  useEffect(() => {
    let live = true;
    if (!link) {
      setState(null);
      return;
    }
    getSystem(link.id).then((rec) => {
      if (!live || !rec) return setState(null);
      const content = publishedContent(rec, link.pin);
      if (!content) return setState(null);
      const latest = latestVersion(rec)?.n ?? 0;
      setState({ rec, content, version: link.pin === 'latest' ? latest : (link.pin as number), update: link.pin === 'latest' && latest > link.version ? latest : null });
    });
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
