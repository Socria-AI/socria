// lib/science/records.ts
//
// METADATA THAT MUST SURVIVE: licences on media, citations on claims.
//
//   licenceTerms     what a recording's licence string permits — commercial
//                    use, derivatives, attribution, share-alike — read from
//                    the Creative Commons family by name. Anything else is
//                    'unknown', and unknown means "ask", never "free".
//   readRecording    a recording's metadata against the atlas's schema, with
//                    the licence kept verbatim beside the reading of it
//   compareWithCitations  two entities' traits side by side, where every
//                    difference shown carries its source. A trait without a
//                    source is listed as unsourced, not shown as a difference.
//                    Nothing here identifies anything: it lays out what the
//                    cited sources say.
//
// PURE.

export interface LicenceTerms {
  /** the licence as written, untouched */
  raw: string;
  family: 'cc0' | 'cc' | 'all-rights-reserved' | 'unknown';
  commercial: boolean | null;
  derivatives: boolean | null;
  attribution: boolean | null;
  shareAlike: boolean | null;
  /** what to do before reusing it */
  advice: string;
}

export function licenceTerms(raw: string | null | undefined): LicenceTerms {
  const s = (raw ?? '').trim();
  const l = s.toLowerCase().replace(/[_\s]+/g, '-');
  const unknown = (advice: string): LicenceTerms => ({ raw: s, family: 'unknown', commercial: null, derivatives: null, attribution: null, shareAlike: null, advice });
  if (!s) return unknown('No licence is recorded: treat it as all rights reserved and ask the rights holder.');
  if (/all-rights-reserved|copyright/.test(l) && !/creativecommons|cc-/.test(l)) {
    return { raw: s, family: 'all-rights-reserved', commercial: false, derivatives: false, attribution: true, shareAlike: false, advice: 'Not reusable without the rights holder’s permission.' };
  }
  if (/cc0|publicdomain\/zero|public-domain/.test(l)) {
    return { raw: s, family: 'cc0', commercial: true, derivatives: true, attribution: false, shareAlike: false, advice: 'Dedicated to the public domain (CC0); attribution is still good practice.' };
  }
  const m = /(?:creativecommons\.org\/licenses\/|cc-?)(by(?:-(?:nc|nd|sa))*)/.exec(l);
  if (!m) return unknown('This licence is not one this reader knows: read its terms before any reuse.');
  const parts = m[1].split('-');
  const nc = parts.includes('nc'), nd = parts.includes('nd'), sa = parts.includes('sa');
  return {
    raw: s,
    family: 'cc',
    commercial: !nc,
    derivatives: !nd,
    attribution: true,
    shareAlike: sa,
    advice: [
      'Credit the author and link the licence.',
      nc ? 'Non-commercial use only.' : '',
      nd ? 'No modified versions (a spectrogram image may count as one — check).' : '',
      sa ? 'Share adaptations under the same licence.' : '',
    ].filter(Boolean).join(' '),
  };
}

export interface RecordingMeta {
  recording_id: string;
  taxon_id: string | null;
  media_uri: string | null;
  sample_rate_hz: number | null;
  channels: number | null;
  duration_s: number | null;
  license: string | null;
  recording_context: string | null;
}

export type RecordingIssue = 'missing_id' | 'bad_sample_rate' | 'bad_channels' | 'bad_duration' | 'no_licence';

/** One recording's metadata read as given; problems listed, the licence kept verbatim and read. */
export function readRecording(input: Record<string, unknown>): { meta: RecordingMeta; licence: LicenceTerms; issues: RecordingIssue[] } {
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  const str = (v: unknown) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());
  const meta: RecordingMeta = {
    recording_id: str(input.recording_id) ?? '',
    taxon_id: str(input.taxon_id),
    media_uri: str(input.media_uri),
    sample_rate_hz: num(input.sample_rate_hz),
    channels: num(input.channels),
    duration_s: num(input.duration_s),
    license: str(input.license),
    recording_context: str(input.recording_context),
  };
  const issues: RecordingIssue[] = [];
  if (!meta.recording_id) issues.push('missing_id');
  if (meta.sample_rate_hz !== null && !(Number.isFinite(meta.sample_rate_hz) && meta.sample_rate_hz > 0)) issues.push('bad_sample_rate');
  if (meta.channels !== null && !(Number.isInteger(meta.channels) && meta.channels > 0)) issues.push('bad_channels');
  if (meta.duration_s !== null && !(Number.isFinite(meta.duration_s) && meta.duration_s > 0)) issues.push('bad_duration');
  if (!meta.license) issues.push('no_licence');
  return { meta, licence: licenceTerms(meta.license), issues };
}

export interface CitedTrait {
  trait: string;
  value: string;
  /** a citation someone can follow: a book and page, a DOI, a URL */
  source?: string | null;
}

/**
 * Two entities' traits aligned by name. A row is a cited difference only when
 * both values are sourced and differ; anything unsourced is set aside under
 * its own heading so it cannot be read as established.
 */
export function compareWithCitations(a: { name: string; traits: readonly CitedTrait[] }, b: { name: string; traits: readonly CitedTrait[] }) {
  const norm = (t: string) => t.trim().toLowerCase();
  const names = [...new Set([...a.traits, ...b.traits].map((t) => norm(t.trait)))];
  const find = (xs: readonly CitedTrait[], n: string) => xs.find((t) => norm(t.trait) === n);
  const differences: { trait: string; a: CitedTrait; b: CitedTrait }[] = [];
  const shared: { trait: string; a: CitedTrait; b: CitedTrait }[] = [];
  const unsourced: { trait: string; entity: string; value: string }[] = [];
  const oneSided: { trait: string; entity: string; value: string; source: string | null }[] = [];
  for (const n of names) {
    const x = find(a.traits, n), y = find(b.traits, n);
    for (const [t, who] of [[x, a.name], [y, b.name]] as const) if (t && !t.source) unsourced.push({ trait: t.trait, entity: who, value: t.value });
    if (x && y && x.source && y.source) {
      (norm(x.value) === norm(y.value) ? shared : differences).push({ trait: x.trait, a: x, b: y });
    } else if ((x && x.source && !y) || (y && y.source && !x)) {
      const t = (x ?? y)!;
      oneSided.push({ trait: t.trait, entity: x ? a.name : b.name, value: t.value, source: t.source ?? null });
    }
  }
  return { differences, shared, oneSided, unsourced, identifies: false as const };
}
