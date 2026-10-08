// lib/science/provenance.ts
//
// WHERE A NUMBER CAME FROM, carried with it.
//
// Every value Logos computes from data travels with one of five origins, and
// the origin is never upgraded on the way:
//
//   observed   recorded in the world: a count on a checklist, a GPS fix, a
//              sample in a recording — as the source holds it
//   derived    computed deterministically from observations alone: a distance
//              between two fixes, a spectrogram, an effort-normalised rate
//   modeled    an estimate that depends on a model's assumptions: a fitted
//              coefficient, a predicted abundance, an occupancy probability
//   simulated  drawn from a model on purpose: a Monte Carlo run, a synthetic
//              fixture with a known ground truth (lib/science/random.ts)
//   imputed    filled in where nothing was observed: an interpolated track
//              point. Allowed only where the person asked, and always said.
//
// Combining values takes the WEAKEST origin of the inputs (derive), so a
// distance between an observed fix and an interpolated one is imputed, not
// derived, and a rate computed over a simulated table is simulated. The order
// is the trust order: observed > derived > modeled > imputed > simulated.
//
// A table's identity is its content: sha256 of a canonical serialisation, so
// "the same data" is a fact a test can check, not a filename.
//
// PURE: no clock, no I/O; the SHA-256 below is a plain implementation so the
// browser and the server get the same digest synchronously.

export const ORIGINS = ['observed', 'derived', 'modeled', 'imputed', 'simulated'] as const;
export type Origin = (typeof ORIGINS)[number];

/** Lower is more trustworthy. Combining never moves up this list. */
const RANK: Record<Origin, number> = { observed: 0, derived: 1, modeled: 2, imputed: 3, simulated: 4 };

export interface SourceRef {
  /** a repository or study: 'eBird', 'Movebank study 1234', 'synthetic fixture' */
  name: string;
  url?: string;
  /** the licence as the source states it — never assumed to be open */
  license?: string;
  citation?: string;
  /** when the data was retrieved, ISO 8601 UTC, as the person or the importer said */
  retrieved?: string;
  /** a download DOI or version string, where the source gives one */
  version?: string;
}

export interface Provenance {
  origin: Origin;
  source?: SourceRef;
  /** what was done, in a phrase: 'haversine distance', 'Poisson GLM (IRLS)' */
  method?: string;
  /** content digests of the inputs (fingerprint) */
  inputs?: string[];
  /** the settings that produced it — window length, offset term, seed */
  params?: Record<string, string | number | boolean>;
  /** what a reader must not forget: 'coordinates generalised to 0.1°' */
  caveats?: string[];
}

export function isOrigin(v: unknown): v is Origin {
  return typeof v === 'string' && (ORIGINS as readonly string[]).includes(v);
}

/** The weakest of the origins: what a value computed from all of them can honestly claim. */
export function weakest(origins: readonly Origin[]): Origin {
  let out: Origin = 'observed';
  for (const o of origins) if (RANK[o] > RANK[out]) out = o;
  return out;
}

/**
 * What a computation over `from` is.
 *
 * Deterministic arithmetic on observations is `derived`; a model's estimate is
 * at best `modeled` (`estimate: true`); and anything built on imputed or
 * simulated inputs stays what it was built on. Caveats are carried forward,
 * de-duplicated, because a generalised coordinate is still generalised two
 * steps later.
 */
export function derive(
  from: readonly Provenance[],
  method: string,
  opts: { estimate?: boolean; params?: Provenance['params']; inputs?: string[]; caveats?: string[] } = {}
): Provenance {
  const base = weakest(from.map((p) => p.origin));
  let origin: Origin = base === 'observed' ? 'derived' : base;
  if (opts.estimate && RANK[origin] < RANK.modeled) origin = 'modeled';
  const caveats = [...new Set([...from.flatMap((p) => p.caveats ?? []), ...(opts.caveats ?? [])])];
  const inputs = [...new Set([...from.flatMap((p) => p.inputs ?? []), ...(opts.inputs ?? [])])];
  return {
    origin,
    method,
    ...(opts.params ? { params: opts.params } : {}),
    ...(inputs.length ? { inputs } : {}),
    ...(caveats.length ? { caveats } : {}),
  };
}

/** How the origin is said on screen, beside the value. */
export function originLabel(o: Origin): string {
  switch (o) {
    case 'observed':
      return 'Observed';
    case 'derived':
      return 'Computed from observations';
    case 'modeled':
      return 'Model estimate';
    case 'imputed':
      return 'Filled in — not observed';
    case 'simulated':
      return 'Simulated — not real data';
  }
}

// ── content identity ─────────────────────────────────────────────────

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** SHA-256 of a string (UTF-8), as lowercase hex. */
export function sha256(text: string): string {
  const msg = utf8(text);
  const bitLen = msg.length * 8;
  const padded = new Uint8Array(((msg.length + 9 + 63) >> 6) << 6);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const view = new DataView(padded.buffer);
  // lengths beyond 2^32 bits are not expected here; the high word is written for correctness
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padded.length - 4, bitLen >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
}

/**
 * The content digest of rows: columns in the order given, values in a
 * canonical text form (numbers as shortest round-trip, null as an empty
 * field), so reordering object keys or reformatting 1.50 as 1.5 does not make
 * different data, and changing one value does.
 */
export function fingerprint(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return JSON.stringify(String(v));
  };
  const lines = [columns.map((c) => JSON.stringify(c)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(','));
  return 'sha256:' + sha256(lines.join('\n'));
}
