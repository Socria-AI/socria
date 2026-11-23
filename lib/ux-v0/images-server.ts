import 'server-only';
// lib/ux-v0/images-server.ts — what is left of the moodboard's image libraries.
//
// The moodboard no longer searches image libraries: a designer brings their own pictures, or points to websites, which
// are read for their colours and type (lib/ux-v0/studio/reference-server.ts). Boards made before may still hold photos
// from Unsplash, whose guidelines ask to be told when one is used in a design — that is all this does.

type Env = Record<string, string | undefined>;

/** Unsplash asks to be told when a photo is used in a design. Best effort; never fails the request. */
export async function pingUse(ref: { provider: string; downloadPing: string }, opts: { env?: Env; fetcher?: typeof fetch } = {}): Promise<void> {
  const env = opts.env ?? process.env;
  if (ref.provider !== 'unsplash' || !ref.downloadPing || !env.UNSPLASH_ACCESS_KEY) return;
  if (!/^https:\/\/api\.unsplash\.com\//.test(ref.downloadPing)) return;
  try {
    await (opts.fetcher ?? fetch)(ref.downloadPing, { headers: { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`, 'Accept-Version': 'v1' }, cache: 'no-store' });
  } catch {
    /* best effort */
  }
}
