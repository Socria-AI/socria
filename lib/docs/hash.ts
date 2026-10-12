// lib/docs/hash.ts — a short, stable fingerprint of some text.
//
// For noticing that a page is unchanged (so it is never read twice), not for
// security: FNV-1a over UTF-16 code units, two independent 32-bit lanes, as
// 16 hex characters. The same in the browser and on the server.
//
// PURE.

export function fingerprint(s: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a ^= c;
    a = Math.imul(a, 0x01000193);
    b ^= c + 0x9e37;
    b = Math.imul(b, 0x01000193) ^ (b >>> 13);
  }
  return ((a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')).slice(0, 16);
}
