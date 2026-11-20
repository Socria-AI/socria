// lib/ux-v0/graphics/styles/hash.ts — the one hash the style modules seed from: FNV-1a over the characters, then a
// finishing mix, so salts that differ only in their last character ("x0", "x1", …) land far apart.

export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
