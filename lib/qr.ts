// lib/qr.ts
//
// A QR code for the authenticator app, as an SVG path.
//
// Only one thing is ever encoded here: the otpauth:// URI Clerk hands back
// when two-factor is being set up. Getting it wrong means somebody scans a
// code that enrols the wrong secret and then cannot sign in, so the encoding
// itself is left to qrcode-generator — Kazuhiko Arase's reference
// implementation, no dependencies of its own — and this file does the two
// things around it: refuse input it cannot encode faithfully, and turn the
// module grid into something React can render.

import qrcode from 'qrcode-generator';

/**
 * Can this string be encoded exactly?
 *
 * The library's default byte encoder is Latin-1: one byte per code unit, so
 * anything above U+00FF would be silently truncated into a QR code that
 * scans as the wrong text. A UTF-8 encoder ships with the package but is not
 * reachable — its package exports map declares no subpaths — so instead of
 * encoding something subtly wrong, this says no and the caller falls back to
 * the typed-in secret, which always works.
 *
 * In practice Clerk's URI is pure ASCII and this never fires. It exists
 * because "in practice" is not a guarantee, and the failure it prevents is
 * silent: a QR that scans cleanly and enrols the wrong thing.
 */
export function qrEncodable(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0xff) return false;
  }
  return true;
}

export interface QrGrid {
  /** modules per side, not counting the quiet zone */
  count: number;
  /** an SVG path covering every dark module, in module units */
  path: string;
}

/**
 * The grid for `text`, or null when it cannot be encoded faithfully.
 *
 * Error correction level M: the level an authenticator QR conventionally
 * uses, and enough that a little glare or a thumbprint still scans.
 */
export function qrGrid(text: string): QrGrid | null {
  if (!text || !qrEncodable(text)) return null;
  let qr;
  try {
    qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
  } catch {
    // Type 0 picks a version automatically, but a long enough string still
    // overflows the largest one. A missing QR beside a working secret is a
    // far better outcome than a thrown error taking the panel down.
    return null;
  }
  const count = qr.getModuleCount();

  // One path rather than count² <rect> elements: a 41×41 code is 1,681
  // nodes as rects and one node as a path, and the browser has to lay out
  // every one of them.
  const parts: string[] = [];
  for (let row = 0; row < count; row++) {
    let run = 0;
    for (let col = 0; col <= count; col++) {
      const dark = col < count && qr.isDark(row, col);
      if (dark) {
        run++;
        continue;
      }
      // Horizontal runs are merged, which roughly halves the path again.
      if (run) parts.push(`M${col - run} ${row}h${run}v1h-${run}z`);
      run = 0;
    }
  }
  return { count, path: parts.join('') };
}
