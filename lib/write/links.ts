// lib/write/links.ts — the Logic Map, lit by what is being written.
//
// As someone writes, the map softly lights the ideas the paragraph their caret
// is in touches. Doing this with a model would mean a request per pause; it
// is plain word overlap instead: cheap, instant, and wrong in a way that costs
// nothing — an idea lit by coincidence is a moment's distraction, not a claim.
// (Moved from the old Draft Space, lib/logos-draft.ts, unchanged.)
//
// PURE.

import type { ThinkingMap } from '@/lib/logos';

const STOP = new Set(
  `the a an and or but if then than that this these those of to in on for with as at by from is are was
   were be been being it its it's i you he she they we my your our their his her not no do does did have
   has had will would can could should may might must about into over under just very really more most
   some any all what which who when where how why so because there here them us me him`
    .split(/\s+/)
    .filter(Boolean)
);

function terms(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
      .filter((w) => w.length > 3 && !STOP.has(w))
  );
}

/** Node ids whose labels overlap the passage enough to be worth lighting. */
export function relevantNodes(map: ThinkingMap, passage: string): string[] {
  if (!passage.trim() || !map.nodes.length) return [];
  const words = terms(passage);
  if (!words.size) return [];

  const scored = map.nodes
    .map((n) => {
      const label = terms(n.label);
      if (!label.size) return { id: n.id, score: 0 };
      let hit = 0;
      for (const w of label) if (words.has(w)) hit++;
      return { id: n.id, score: hit / label.size };
    })
    // Half a label matching is a real echo; one incidental word is not.
    .filter((s) => s.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return scored.map((s) => s.id);
}
