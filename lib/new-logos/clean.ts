// lib/new-logos/clean.ts — text and addresses made safe to keep: control characters out, length capped, only web
// addresses that are web addresses. Shared by the node model and the primitives (no other imports, so neither
// depends on the other to load).
//
// Pure: no I/O.

/** A string, trimmed of control characters and capped; anything else is ''. */
export function cleanText(v: unknown, max: number, opts: { multiline?: boolean } = {}): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  let s = v.replace(opts.multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]+/g, opts.multiline ? '' : ' ');
  if (!opts.multiline) s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
}

const URL_MAX = 2000;

/** http(s) only: never a script address. */
export function cleanUrl(v: unknown): string | undefined {
  const s = cleanText(v, URL_MAX);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

