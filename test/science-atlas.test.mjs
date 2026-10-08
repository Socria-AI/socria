// The thirty benchmarks of the ornithology data atlas, run against the general
// scientific primitives in lib/science/.
//
// EVERY FIXTURE HERE IS SYNTHETIC, made with a seed and a known answer, and is
// labelled 'simulated' wherever it travels — the atlas's first rule is never
// to pass a fixture off as an observation. The species in them are invented
// codes (TX-A, TX-B…), so no claim about a real bird is made or implied. What
// is tested is the arithmetic and the honesty of the result: a number that
// should be computed is computed and matches its known answer; a number that
// cannot be had is refused, with the reason.

import { rng } from './.tmp/random.mjs';
import { sha256, fingerprint, derive, weakest, originLabel } from './.tmp/provenance.mjs';
import { readTable, parseCSV, toCSV, parseUtc, numbers } from './.tmp/table.mjs';
import { haversine, vincenty, distance, generalize, spaceTimeJoin, coordinateProblem, gridCells } from './.tmp/geo.mjs';
import { stft, dominantFrequency, bandwidth, ridge, clipping, silence, compareAnnotations, tone, sweep } from './.tmp/signal.mjs';
import { steps, summarize, stopovers, resample, inTimeOrder } from './.tmp/track.mjs';
import { poissonGlm, negBinGlm, overdispersion, design } from './.tmp/glm.mjs';
import { fitOccupancy, simulateOccupancy, missedEntirely } from './.tmp/occupancy.mjs';
import { reportingRate, ratePerEffort, matchedComparison, richness, wilson } from './.tmp/ecology.mjs';
import { spatialBlocks, blockedFolds, randomFolds, crossValidate, rmse } from './.tmp/crossval.mjs';
import { resolveName, tallyByTaxon, versionChanges } from './.tmp/taxonomy.mjs';
import { wingLoading, aspectRatio, aeroForce, levelSpeed, reynolds, varyGeometry } from './.tmp/flight.mjs';
import { linearTrend, elasticity, oneAtATime } from './.tmp/sensitivity.mjs';
import { licenceTerms, readRecording, compareWithCitations } from './.tmp/records.mjs';
import { exportBundle } from './.tmp/bundle.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const SYNTH = { origin: 'simulated', source: { name: 'synthetic fixture (test/science-atlas.test.mjs)', license: 'CC0-1.0' } };
const HOUR = 3_600_000, DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 4, 1, 0, 0, 0);

console.log('=== B01 taxonomic synonyms resolve, distinct taxa never merge ===');
{
  const tx = {
    taxa: [
      { taxon_id: 'TX-A', scientific_name: 'Genus alpha', common_name: 'Ashy Warbler', source_version: 'v1' },
      { taxon_id: 'TX-B', scientific_name: 'Genus beta', common_name: 'Brown Warbler', source_version: 'v1' },
      { taxon_id: 'TX-A', scientific_name: 'Genus alpha', common_name: 'Ashy Warbler', source_version: 'v2' },
      { taxon_id: 'TX-B1', scientific_name: 'Genus beta', common_name: 'Northern Brown Warbler', source_version: 'v2' },
      { taxon_id: 'TX-B2', scientific_name: 'Genus betoides', common_name: 'Southern Brown Warbler', source_version: 'v2' },
    ],
    synonyms: [
      { name: 'Genus alphus', taxon_id: 'TX-A', source_version: 'v1', kind: 'synonym' },
      { name: 'Genus alphus', taxon_id: 'TX-A', source_version: 'v2', kind: 'synonym' },
      { name: 'Brown Warbler', taxon_id: 'TX-B1', source_version: 'v2', kind: 'legacy' },
      { name: 'Brown Warbler', taxon_id: 'TX-B2', source_version: 'v2', kind: 'legacy' },
    ],
  };
  ok('a synonym resolves to its taxon, case and accents folded', resolveName('GENUS ÁLPHUS', tx, 'v1').status === 'synonym' && resolveName('genus alphus', tx, 'v1').taxon_id === 'TX-A');
  const amb = resolveName('Brown Warbler', tx, 'v2');
  ok('a name now covering two taxa is ambiguous, with both, and no pick', amb.status === 'ambiguous' && amb.candidates.join() === 'TX-B1,TX-B2' && !('taxon_id' in amb));
  ok('an unknown name is unknown, not the nearest', resolveName('Brown Warblr', tx, 'v1').status === 'unknown');
  const tally = tallyByTaxon([{ name: 'Genus alpha', count: 3 }, { name: 'Genus alphus', count: 2 }, { name: 'Brown Warbler', count: 4 }, { name: 'Genus beta', count: null }], tx, 'v2');
  ok('synonyms pool under one taxon; the ambiguous name is set aside with its count', tally.taxa.find((t) => t.taxon_id === 'TX-A').count === 5 && tally.unresolved.length === 1 && tally.unresolved[0].count === 4);
  ok('…and a present-but-uncounted record is not a zero', tally.taxa.find((t) => t.taxon_id === 'TX-B1').uncounted === 1 && tally.taxa.find((t) => t.taxon_id === 'TX-B1').count === 0);
  const ch = versionChanges(['Brown Warbler', 'Genus alpha'], tx, 'v1', 'v2');
  ok('a split between versions is reported as a split', ch.length === 1 && ch[0].change === 'split');
}

console.log('=== B02 lookalikes compared, every difference cited ===');
{
  const a = { name: 'TX-A', traits: [{ trait: 'wing bars', value: 'two, white', source: 'Fixture Guide p.12' }, { trait: 'call', value: 'two notes', source: 'Fixture Guide p.12' }, { trait: 'bill', value: 'fine' }] };
  const b = { name: 'TX-B', traits: [{ trait: 'Wing bars', value: 'none', source: 'Fixture Guide p.14' }, { trait: 'call', value: 'Two notes', source: 'Fixture Guide p.14' }, { trait: 'bill', value: 'stout', source: 'Fixture Guide p.14' }] };
  const c = compareWithCitations(a, b);
  ok('a cited difference is shown with both sources', c.differences.length === 1 && c.differences[0].trait === 'wing bars' && c.differences[0].a.source && c.differences[0].b.source);
  ok('agreement is shared, not a difference', c.shared.length === 1 && c.shared[0].trait === 'call');
  ok('an uncited trait is set aside as unsourced, never shown as established', c.unsourced.some((u) => u.trait === 'bill' && u.entity === 'TX-A') && !c.differences.some((d) => d.trait === 'bill'));
  ok('the comparison identifies nothing', c.identifies === false);
}

console.log('=== B03 a checklist CSV with timestamps and coordinate uncertainty ===');
const CHECKLIST_SCHEMA = {
  name: 'checklist record',
  key: ['checklist_id', 'taxon_id'],
  columns: [
    { name: 'checklist_id', kind: 'text', required: true },
    { name: 'taxon_id', kind: 'text', required: true },
    { name: 'start_time', kind: 'datetime', required: true },
    { name: 'latitude', kind: 'number', min: -90, max: 90, required: true },
    { name: 'longitude', kind: 'number', min: -180, max: 180, required: true },
    { name: 'coordinate_uncertainty_m', kind: 'number', min: 0, unit: 'm' },
    { name: 'duration_min', kind: 'number', min: 0, unit: 'min' },
    { name: 'complete_checklist', kind: 'boolean', required: true },
    { name: 'count', kind: 'integer', min: 0 },
  ],
};
const CSV = [
  'checklist_id,taxon_id,start_time,latitude,longitude,coordinate_uncertainty_m,duration_min,complete_checklist,count',
  'C1,TX-A,2026-05-01T06:10:00Z,51.20,-1.40,30,60,true,4',
  'C1,TX-B,2026-05-01T06:10:00Z,51.20,-1.40,30,60,true,0',
  'C2,TX-A,2026-05-01T07:30:00+01:00,51.21,-1.41,,45,true,X',
  'C3,TX-A,2026-05-02T06:00:00Z,151.2,-1.4,10,30,true,2',
  'C4,TX-A,2026-05-02T06:00:00Z,51.2,-191.4,10,30,true,2',
  'C5,TX-B,2026-05-02 06:00,51.2,-1.4,10,30,false,1',
  'C6,TX-A,2026-05-03T06:00:00Z,51.25,-1.45,250,90,false,NA',
].join('\n');
const table = readTable(CSV, CHECKLIST_SCHEMA, SYNTH);
{
  ok('read: the good rows kept, in order', table.rows.length === 3 && table.rows.map((r) => r.checklist_id).join() === 'C1,C1,C6');
  ok('timestamps become UTC — the +01:00 row is not silently shifted, it is rejected for its X count', table.rows[0].start_time === Date.UTC(2026, 4, 1, 6, 10));
  ok('coordinate uncertainty is read and kept', table.rows[0].coordinate_uncertainty_m === 30 && table.rows[2].coordinate_uncertainty_m === 250);
  ok('a time with no zone is rejected, and says why', table.rejected.some((r) => r.issues.some((i) => i.kind === 'ambiguous_timezone')));
  ok('the provenance travels with the table, with its digest', table.provenance.origin === 'simulated' && table.fingerprint.startsWith('sha256:') && table.provenance.inputs[0] === table.fingerprint);
}

console.log('=== B04 impossible coordinates rejected ===');
{
  const why = table.rejected.flatMap((r) => r.issues.map((i) => `${r.row}:${i.column}:${i.kind}`));
  ok('latitude 151.2 is rejected as out of range', why.includes('4:latitude:out_of_range'));
  ok('longitude −191.4 is rejected as out of range', why.includes('5:longitude:out_of_range'));
  ok('nothing is clamped into range', !table.rows.some((r) => Math.abs(r.latitude) > 90 || Math.abs(r.longitude) > 180));
  ok('(0, 0) is flagged as the commonest typo, not rejected', coordinateProblem({ lat: 0, lon: 0 }) === 'null_island' && coordinateProblem({ lat: 91, lon: 0 }) === 'lat_out_of_range');
}

console.log('=== B05 zero counts kept apart from missing ones ===');
{
  ok('a count of 0 on a complete list is 0', table.rows[1].count === 0);
  ok('NA is missing, not 0', table.rows[2].count === null);
  const n = numbers(table, 'count');
  ok('a column read for numbers counts the missing separately', n.values.join() === '4,0' && n.missing === 1);
  ok('an X (present, uncounted) is not a number and does not become one', table.rejected.some((r) => r.issues.some((i) => i.column === 'count' && i.kind === 'not_a_number')));
}

console.log('=== B06 effort-normalised frequency, with its denominator ===');
{
  const ev = [
    { id: 'e1', complete: true, effort: 1, records: { 'TX-A': 2 } },
    { id: 'e2', complete: true, effort: 2, records: { 'TX-B': 1 } },
    { id: 'e3', complete: true, effort: 0.5, records: { 'TX-A': 1, 'TX-B': 3 } },
    { id: 'e4', complete: false, effort: 1, records: { 'TX-A': 5 } },
    { id: 'e5', complete: true, effort: null, records: { 'TX-A': 1 } },
    { id: 'e6', complete: true, effort: 1, records: { 'TX-A': null } },
  ];
  const rr = reportingRate(ev, 'TX-A');
  ok('reporting rate: k of the COMPLETE lists — 4 of 5', rr.k === 4 && rr.n === 5 && rr.excludedIncomplete === 1);
  ok('…with an interval around it', rr.low < 0.8 && rr.high > 0.8 && rr.low > 0.2);
  const rate = ratePerEffort(ev, 'TX-A');
  ok('rate per hour over lists with a count and an effort: (2+0+1+5)/(1+2+0.5+1)', near(rate.rate, 8 / 4.5, 1e-12) && rate.events === 4);
  ok('…the lists left out are counted, by reason', rate.excluded.noEffort === 1 && rate.excluded.uncounted === 1);
  ok('Wilson at k = 0 is not the empty interval, and its ends are exact', wilson(0, 10).high > 0.2 && wilson(0, 10).low === 0 && wilson(10, 10).high === 1);
}

console.log('=== B07 obscured locations stay obscured ===');
{
  const exact = { lat: 51.207349, lon: -1.403772 };
  const g = generalize(exact, 0.1);
  ok('snapped to the cell centre, with the uncertainty it added', g.lat === 51.25 && g.lon === -1.45 && g.uncertaintyM > 3000);
  ok('deterministic: the same record lands in the same cell', JSON.stringify(generalize(exact, 0.1)) === JSON.stringify(g));
  const rows = [{ id: 'o1', ...g }];
  const b = exportBundle({ title: 'obscured', exportedAt: '2026-10-08T00:00:00Z', tables: [{ name: 'occurrences', schema: { name: 'occ', columns: [] }, columns: ['id', 'lat', 'lon', 'uncertaintyM'], rows, provenance: { ...SYNTH, caveats: ['coordinates generalised to 0.1° cells'] } }], results: [], assumptions: [] });
  const all = b.files.map((f) => f.text).join('\n');
  ok('the export carries the cell, never the exact point', !/51\.2073|1\.4037/.test(all) && /51\.25/.test(all));
  ok('…and says the coordinates were generalised', /generalised to 0\.1° cells/.test(all));
}

console.log('=== B08 months compared at matched effort ===');
{
  // TRUE rate 0.2 on short lists, 0.6 on long lists — in both months. May has far more long lists.
  const r = rng(808);
  const make = (n, pLong, prefix) => Array.from({ length: n }, (_, i) => {
    const long = r.next() < pLong;
    const effort = long ? 3 : 0.5;
    const seen = r.next() < (long ? 0.6 : 0.2);
    return { id: `${prefix}${i}`, complete: true, effort, protocol: 'traveling', records: seen ? { 'TX-A': 1 } : {} };
  });
  const april = make(800, 0.2, 'a'), may = make(800, 0.8, 'm');
  const cmp = matchedComparison(april, may, 'TX-A', { effortBreaks: [1, 2] });
  ok('the crude rates differ a lot — effort, not birds', cmp.crude.b - cmp.crude.a > 0.2, `${cmp.crude.a} ${cmp.crude.b}`);
  ok('within effort strata the difference vanishes', Math.abs(cmp.standardized.difference) < 0.06 && cmp.standardized.low < 0 && cmp.standardized.high > 0, JSON.stringify(cmp.standardized));
  ok('a stratum seen in one month only is dropped, and named', matchedComparison(april, [{ id: 'x', complete: true, effort: 10, records: {} }], 'TX-A', { effortBreaks: [1, 2, 5] }).droppedStrata.length >= 1);
}

console.log('=== B09 recording metadata, licence kept verbatim and read ===');
{
  const rec = readRecording({ recording_id: 'R1', taxon_id: 'TX-A', media_uri: 'fixture://r1.wav', sample_rate_hz: '44100', channels: '1', duration_s: '12.5', license: 'https://creativecommons.org/licenses/by-nc-sa/4.0/', recording_context: 'synthetic' });
  ok('fields parsed', rec.meta.sample_rate_hz === 44100 && rec.meta.channels === 1 && rec.meta.duration_s === 12.5 && rec.issues.length === 0);
  ok('the licence verbatim, and read: no commercial use, share-alike, attribution', rec.licence.raw === 'https://creativecommons.org/licenses/by-nc-sa/4.0/' && rec.licence.commercial === false && rec.licence.shareAlike === true && rec.licence.attribution === true);
  ok('no licence is not "free"', readRecording({ recording_id: 'R2' }).licence.family === 'unknown' && /ask/i.test(readRecording({ recording_id: 'R2' }).licence.advice));
  ok('an unknown licence string is unknown', licenceTerms('Custom terms v3').family === 'unknown' && licenceTerms('Custom terms v3').commercial === null);
  ok('CC0 and CC BY read correctly', licenceTerms('CC0 1.0').commercial === true && licenceTerms('CC BY 4.0').commercial === true && licenceTerms('CC BY-ND 4.0').derivatives === false);
}

console.log('=== B10 the spectrogram of a known sine ===');
const FS = 22050;
{
  const x = tone(FS, 1, 3000, 0.5);
  const sp = stft(x, FS, { fftSize: 1024 });
  const d = dominantFrequency(sp);
  ok('peak at 3000 Hz within a tenth of a bin', Math.abs(d.hz - 3000) < sp.freqResolutionHz / 10, d.hz);
  ok('the resolution is said: fs/N, N/fs, H/fs', near(sp.freqResolutionHz, FS / 1024, 1e-9) && near(sp.windowS, 1024 / FS, 1e-12) && near(sp.hopS, 256 / FS, 1e-12));
  const bw = bandwidth(sp, {}, 20);
  ok('a pure tone is narrow: under 4 bins at −20 dB', bw.widthHz < 4 * sp.freqResolutionHz);
  ok('no frame invents samples past the end', sp.times[sp.times.length - 1] + sp.windowS / 2 <= 1 + 1e-9);
}

console.log('=== B11 a synthetic sweep, endpoints verified ===');
{
  const s = sweep(FS, 2, 2000, 7000, 'linear');
  const sp = stft(s.x, FS, { fftSize: 512, hop: 128 });
  const rd = ridge(sp);
  const first = rd[0], last = rd[rd.length - 1];
  ok('the ridge starts where the sweep does at that moment', Math.abs(first.hz - s.frequencyAt(first.t)) < sp.freqResolutionHz, `${first.hz} vs ${s.frequencyAt(first.t)}`);
  ok('…and ends where it does', Math.abs(last.hz - s.frequencyAt(last.t)) < sp.freqResolutionHz, `${last.hz} vs ${s.frequencyAt(last.t)}`);
  ok('…rising all the way', rd.every((p, i) => i === 0 || p.hz >= rd[i - 1].hz - sp.freqResolutionHz));
  const ex = sweep(FS, 1, 1000, 8000, 'exponential');
  const rdx = ridge(stft(ex.x, FS, { fftSize: 512, hop: 128 }));
  const mid = rdx[Math.floor(rdx.length / 2)];
  ok('an exponential sweep is exponential: mid-way it is near the geometric mean', Math.abs(mid.hz - ex.frequencyAt(mid.t)) < 2 * (FS / 512));
}

console.log('=== B12 clipped and silent segments flagged ===');
{
  const x = tone(FS, 0.5, 1000, 1.2).map((v) => Math.max(-1, Math.min(1, v)));
  const c = clipping(x);
  ok('clipping found, with runs and a fraction', c.clipped && c.runs.length > 10 && c.fraction > 0.1);
  ok('a clean tone is not clipped', !clipping(tone(FS, 0.5, 1000, 0.5)).clipped);
  const quiet = new Float64Array(FS);
  quiet.set(tone(FS, 0.25, 500, 0.5), FS / 2);
  const s = silence(quiet, FS);
  ok('the silent half is found as an interval', s.intervals.length >= 1 && near(s.intervals[0].t0, 0, 1e-9) && near(s.intervals[0].t1, 0.5, 0.03));
  ok('an empty recording is all silent', silence(new Float64Array(2000), FS).allSilent);
}

console.log('=== B13 two call annotations compared, no identity invented ===');
{
  const human = [
    { start_s: 1.0, end_s: 1.4, low_freq_hz: 3000, high_freq_hz: 5000, call_type: 'song', by: 'human' },
    { start_s: 4.0, end_s: 4.3, low_freq_hz: 2000, high_freq_hz: 2600, call_type: 'call', by: 'human' },
  ];
  const auto = [
    { start_s: 1.05, end_s: 1.42, low_freq_hz: 3100, high_freq_hz: 5000, by: 'automated', confidence: 0.81 },
    { start_s: 7.0, end_s: 7.2, low_freq_hz: 2000, high_freq_hz: 2600, by: 'automated', confidence: 0.4 },
  ];
  const r = compareAnnotations(human, auto);
  ok('one matched, one missed, one false alarm', r.tp === 1 && r.fn === 1 && r.fp === 1 && r.precision === 0.5 && r.recall === 0.5);
  ok('the result names boxes, not species', !JSON.stringify(r).includes('taxon') && !('species' in r));
  let threw = false;
  try {
    compareAnnotations(auto, human);
  } catch {
    threw = true;
  }
  ok('automated boxes cannot stand in as the reference', threw);
  ok('nothing to score is null, not 0 or 1', compareAnnotations([], []).precision === null && compareAnnotations([], []).recall === null);
}

console.log('=== B14 geodesic distance between known points ===');
{
  const dms = (d, m, s) => Math.sign(d) * (Math.abs(d) + m / 60 + s / 3600);
  const a = { lat: dms(-37, 57, 3.7203), lon: dms(144, 25, 29.5244) }, b = { lat: dms(-37, 39, 10.1561), lon: dms(143, 55, 35.3839) };
  ok('Vincenty: Flinders Peak → Buninyong, 54 972.271 m', near(vincenty(a, b).meters, 54972.271, 0.001), vincenty(a, b).meters);
  ok('haversine within half a percent of it', Math.abs(haversine(a, b) / 54972.271 - 1) < 0.005);
  ok('one degree of latitude along a meridian ≈ 111.2 km', near(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 111195, 10));
  const ap = distance({ lat: 0, lon: 0 }, { lat: 0.5, lon: 179.7 });
  ok('nearly antipodal: the geodesic says it did not converge, the sphere answers, and says so', ap.method === 'haversine' && ap.meters > 1.9e7);
}

console.log('=== B15–B16 a track: no division by a backwards clock, implausible speeds flagged ===');
const TRACK = [
  { t: T0, lat: 50.0, lon: 0.0 },
  { t: T0 + HOUR, lat: 50.3, lon: 0.0 },
  { t: T0 + HOUR, lat: 50.31, lon: 0.0 },
  { t: T0 + HOUR - 60_000, lat: 50.32, lon: 0.0 },
  { t: T0 + 2 * HOUR, lat: 55.0, lon: 0.0 },
];
{
  const st = steps(TRACK, { maxSpeed: 40 });
  ok('a zero interval gives no speed, and is flagged', st[1].flag === 'nonpositive_dt' && st[1].speed === null);
  ok('a backwards interval too', st[2].flag === 'nonpositive_dt' && st[2].speed === null);
  ok('≈ 520 km in an hour is flagged for review, not deleted', st[3].flag === 'implausible_speed' && st[3].speed > 140);
  const sum = summarize(TRACK, { maxSpeed: 40 });
  ok('the summary counts both kinds of flag', sum.flagged.nonpositiveDt === 2 && sum.flagged.implausibleSpeed === 1);
  ok('…and its speeds come only from valid steps', sum.maxSpeed !== null && sum.maxSpeed < 40);
  ok('inTimeOrder is stable', inTimeOrder(TRACK).map((f) => f.lat).join() === '50,50.32,50.3,50.31,55');
}

console.log('=== B17 observed fixes and interpolated points kept apart ===');
{
  const fixes = [
    { t: T0, lat: 50, lon: 0 },
    { t: T0 + 2 * HOUR, lat: 50.2, lon: 0 },
    { t: T0 + 20 * HOUR, lat: 52, lon: 0 },
  ];
  const r = resample(fixes, HOUR, 3 * HOUR);
  ok('an exact fix is observed', r.points[0].observed && r.points[2].observed);
  ok('between close fixes: interpolated, and marked so', r.points[1].observed === false && near(r.points[1].lat, 50.1, 1e-9));
  ok('across an 18-hour gap: nothing at all', r.points.every((p) => p.t <= T0 + 2 * HOUR || p.t === T0 + 20 * HOUR) && r.skippedGaps.length === 1);
}

console.log('=== B18 a stopover in a synthetic track with known labels ===');
{
  const r = rng(1818);
  const fixes = [];
  let t = T0;
  // 6 h travelling north at ~13 m/s, 10 h stopped within ~150 m, 6 h travelling on — every 15 minutes
  for (let i = 0; i < 24; i++, t += 15 * 60_000) fixes.push({ t, lat: 50 + i * 0.0105, lon: 0, label: 'move' });
  const stop = { lat: fixes[fixes.length - 1].lat + 0.01, lon: 0 };
  for (let i = 0; i < 40; i++, t += 15 * 60_000) fixes.push({ t, lat: stop.lat + (r.next() - 0.5) * 0.002, lon: (r.next() - 0.5) * 0.003, label: 'stop' });
  for (let i = 1; i <= 24; i++, t += 15 * 60_000) fixes.push({ t, lat: stop.lat + i * 0.0105, lon: 0, label: 'move' });
  const out = stopovers(fixes, { radiusM: 300, minDurationMs: 3 * HOUR, maxGapMs: HOUR });
  ok('one stopover found', out.stopovers.length === 1, JSON.stringify(out.stopovers.map((s) => [s.first, s.last])));
  const s = out.stopovers[0];
  const truth = fixes.map((f, i) => (f.label === 'stop' ? i : -1)).filter((i) => i >= 0);
  const found = new Set(Array.from({ length: s.last - s.first + 1 }, (_, k) => s.first + k));
  const recall = truth.filter((i) => found.has(i)).length / truth.length;
  const precision = [...found].filter((i) => fixes[i].label === 'stop').length / found.size;
  ok('it covers the labelled stop: recall ≥ 0.95, precision ≥ 0.9', recall >= 0.95 && precision >= 0.9, `${recall} ${precision}`);
  ok('…and says what it assumed, with the sampling interval', out.assumptions.radiusM === 300 && out.assumptions.medianIntervalS === 900);
}

console.log('=== B19 weather joined by space and time, within tolerance ===');
{
  const obs = [
    { id: 'o1', t: T0 + 10 * 60_000, lat: 50, lon: 0 },
    { id: 'o2', t: T0 + 5 * HOUR, lat: 50, lon: 0 },
    { id: 'o3', t: T0, lat: 53, lon: 0 },
  ];
  const wx = [
    { id: 'w1', t: T0, lat: 50.01, lon: 0, temperature_c: 12 },
    { id: 'w2', t: T0 + 30 * 60_000, lat: 50.02, lon: 0.01, temperature_c: 13 },
    { id: 'w3', t: T0, lat: 50.5, lon: 0, temperature_c: 9 },
  ];
  const j = spaceTimeJoin(obs, wx, { maxDistanceM: 10_000, maxDtMs: HOUR });
  ok('nearest in time among those close enough', j[0].match.id === 'w1' && j[0].dtMs === 10 * 60_000);
  ok('none within the hour: no match, and that is the reason', j[1].match === null && j[1].miss === 'none_in_time');
  ok('in time but too far: no match, and that is the reason', j[2].match === null && j[2].miss === 'none_in_distance');
}

console.log('=== B20 Poisson regression on seeded counts ===');
let countsX, countsOff, countsY;
{
  const r = rng(2020);
  const n = 500;
  const habitat = Array.from({ length: n }, () => r.normal());
  const effort = Array.from({ length: n }, () => 0.5 + 2.5 * r.next());
  countsY = habitat.map((h, i) => r.poisson(Math.exp(0.3 + 0.8 * h) * effort[i]));
  const { X, names } = design({ habitat });
  countsX = X;
  countsOff = effort.map(Math.log);
  const fit = poissonGlm(X, countsY, { offset: countsOff, names });
  ok('the coefficients come back, inside their 95% intervals', fit.ci[0][0] < 0.3 && 0.3 < fit.ci[0][1] && fit.ci[1][0] < 0.8 && 0.8 < fit.ci[1][1], JSON.stringify(fit.coef));
  ok('converged, with deviance under the null', fit.converged && fit.deviance < fit.nullDeviance);
  ok('Poisson data are not overdispersed', fit.dispersion < 1.3, fit.dispersion);
  let threw = false;
  try {
    poissonGlm(X, countsY.map((v, i) => (i === 0 ? 1.5 : v)));
  } catch {
    threw = true;
  }
  ok('a fractional "count" is refused', threw);
}

console.log('=== B21 overdispersion found, negative binomial compared ===');
{
  const r = rng(2121);
  const yNB = countsX.map((row, i) => r.negbin(Math.exp(0.3 + 0.8 * row[1] + countsOff[i]), 1.5));
  const p = poissonGlm(countsX, yNB, { offset: countsOff, names: ['(Intercept)', 'habitat'] });
  const nb = negBinGlm(countsX, yNB, { offset: countsOff, names: ['(Intercept)', 'habitat'] });
  const od = overdispersion(p, yNB, nb);
  ok('Poisson on NB data: dispersion well above 1, flagged', od.overdispersed && od.dispersion > 2, od.dispersion);
  ok('more zeros than the Poisson means predict', od.zeros.ratio > 1.2, od.zeros.ratio);
  ok('the likelihood-ratio test prefers NB, decisively', od.lrTest.p < 1e-6);
  ok('NB recovers θ ≈ 1.5 within two standard errors', Math.abs(nb.theta - 1.5) < 2 * nb.thetaSe, `${nb.theta} ± ${nb.thetaSe}`);
  ok('…and its lower AIC', nb.aic < p.aic);
}

console.log('=== B22 occupancy from repeated synthetic surveys ===');
{
  // An interval is a claim about repeated sampling, so it is tested that way: across
  // twelve seeded worlds the 95% intervals should cover the truth nearly every time.
  const runs = Array.from({ length: 12 }, (_, i) => {
    const sim = simulateOccupancy(rng(2200 + i), { sites: 400, surveys: 4, psi: 0.55, p: 0.3 });
    return fitOccupancy({ histories: sim.histories });
  });
  const covPsi = runs.filter((f) => f.psi.low < 0.55 && 0.55 < f.psi.high).length;
  const covP = runs.filter((f) => f.p.low < 0.3 && 0.3 < f.p.high).length;
  const meanPsi = runs.reduce((a, f) => a + f.psi.estimate, 0) / runs.length;
  ok('ψ: intervals cover the truth in ≥ 10 of 12 worlds, and the estimates centre on it', covPsi >= 10 && Math.abs(meanPsi - 0.55) < 0.04, `${covPsi}/12, mean ${meanPsi}`);
  ok('p: intervals cover the truth in ≥ 10 of 12 worlds', covP >= 10, `${covP}/12`);
  const sim = simulateOccupancy(rng(2222), { sites: 400, surveys: 4, psi: 0.55, p: 0.3 });
  const fit = fitOccupancy({ histories: sim.histories });
  ok('naive occupancy is biased low, as (1 − p)⁴ says it must be', fit.naiveOccupancy < 0.55 && near(missedEntirely(0.3, 4), 0.2401, 1e-9));
  ok('one visit per site: refused as unidentifiable', !fitOccupancy({ histories: sim.histories.map((h) => [h[0]]) }).identifiable);
  ok('a survey not done is skipped, not a non-detection', fitOccupancy({ histories: sim.histories.map((h) => [h[0], h[1], null, h[3]]) }).identifiable);
}

console.log('=== B23 detection bias in raw richness ===');
{
  // Two sites with THE SAME 40 taxa and the same detectabilities; site B is visited 4× as often.
  const r = rng(2323);
  const det = Array.from({ length: 40 }, (_, i) => 0.02 + 0.5 * (i / 40) ** 2);
  const visits = (n) => Array.from({ length: n }, () => det.map((p, i) => (r.next() < p ? `TX-${i}` : null)).filter(Boolean));
  const A = richness(visits(10)), B = richness(visits(40));
  ok('raw richness says B is richer — it was only visited more', B.observed > A.observed + 3, `${A.observed} ${B.observed}`);
  ok('rarefied to A’s ten visits, B is no richer', Math.abs(B.rarefied(10) - A.observed) < 3, `${B.rarefied(10)} vs ${A.observed}`);
  ok('Chao2 is a lower bound at or above what was seen', A.chao2 >= A.observed && B.chao2 >= B.observed);
}

console.log('=== B24 a spatial model cross-validated with blocked folds ===');
{
  // A smooth field over a 10° square, observed with noise; a 1-nearest-neighbour model.
  const r = rng(2424);
  const pts = Array.from({ length: 600 }, () => ({ lat: 40 + 10 * r.next(), lon: 10 * r.next() }));
  const field = (p) => Math.sin(p.lat / 1.5) + Math.cos(p.lon / 1.2);
  const y = pts.map((p) => field(p) + 0.1 * r.normal());
  const fitPredict = (train, test) => test.map((i) => {
    let best = -1, bd = Infinity;
    for (const j of train) {
      const d = (pts[i].lat - pts[j].lat) ** 2 + (pts[i].lon - pts[j].lon) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    return y[best];
  });
  const rand = crossValidate(randomFolds(pts.length, 5, 7), fitPredict, y, rmse);
  const blocks = spatialBlocks(pts, 2.5);
  const blk = crossValidate(blockedFolds(blocks, 5, 7), fitPredict, y, rmse);
  ok('random folds flatter the model: blocked error is clearly larger', blk.mean > 1.3 * rand.mean, `${rand.mean} vs ${blk.mean}`);
  ok('blocked folds put each block wholly on one side', blocks.every((b, i) => blockedFolds(blocks, 5, 7)[i] === blockedFolds(blocks, 5, 7)[blocks.indexOf(b)]));
  ok('folds are balanced by records, within a block’s size', (() => { const f = blockedFolds(blocks, 5, 7); const c = [0, 0, 0, 0, 0]; f.forEach((k) => c[k]++); return Math.max(...c) - Math.min(...c) < 60; })());
}

console.log('=== B25–B28 flight: loading, aspect ratio with units checked, lift with its assumptions, geometry varied ===');
{
  const wl = wingLoading({ value: 1100, unit: 'g' }, { value: 0.2, unit: 'm^2' });
  ok('B25 wing loading: 1.1 kg × g / 0.2 m² = 53.94 N/m²', near(wl.newtonsPerM2, 1.1 * 9.80665 / 0.2, 1e-9) && near(wl.kgPerM2, 5.5, 1e-12));
  ok('B26 aspect ratio from cm and cm², dimensionless', near(aspectRatio({ value: 120, unit: 'cm' }, { value: 2000, unit: 'cm^2' }).value, 7.2, 1e-9) && /dimensionless/.test(aspectRatio({ value: 1.2, unit: 'm' }, { value: 0.2, unit: 'm^2' }).dims));
  let threw = '';
  try {
    aspectRatio({ value: 1.2, unit: 'm' }, { value: 0.2, unit: 'm' });
  } catch (e) {
    threw = e.message;
  }
  ok('…an "area" in metres is refused, with the dimensions named', /not dimensionless/.test(threw));
  const L = aeroForce({ value: 1.225, unit: 'kg/m^3' }, { value: 10, unit: 'm/s' }, { value: 0.2, unit: 'm^2' }, { value: 1.0, basis: 'assumed', note: 'a typical gliding value' });
  ok('B27 lift ½ρV²SC_L = 12.25 N — hypothetical, because C_L was assumed, and it says so', near(L.newtons, 12.25, 1e-9) && L.hypothetical && L.assumptions.some((a) => /ASSUMED/.test(a)));
  const Lm = aeroForce({ value: 1.225, unit: 'kg/m^3' }, { value: 10, unit: 'm/s' }, { value: 0.2, unit: 'm^2' }, { value: 1.0, basis: 'measured', source: 'fixture wind tunnel' });
  ok('…a measured coefficient is not hypothetical, and cites its source', !Lm.hypothetical && Lm.assumptions[0].includes('fixture wind tunnel'));
  ok('Reynolds number is dimensionless and right', near(reynolds({ value: 1.225, unit: 'kg/m^3' }, { value: 10, unit: 'm/s' }, { value: 0.15, unit: 'm' }, { value: 1.789e-5, unit: 'Pa*s' }).value, 1.225 * 10 * 0.15 / 1.789e-5, 1e-6));
  const v = varyGeometry({ mass: { value: 1.1, unit: 'kg' }, span: { value: 1.2, unit: 'm' }, area: { value: 0.2, unit: 'm^2' }, cl: { value: 1, basis: 'assumed' } }, 'area', [0.15, 0.2, 0.25]);
  ok('B28 more area: lower loading, lower aspect ratio, slower level flight', v[0].wingLoading > v[1].wingLoading && v[1].wingLoading > v[2].wingLoading && v[0].aspectRatio > v[2].aspectRatio && v[0].levelSpeed > v[2].levelSpeed);
  ok('…level speed agrees with lift = weight', near(levelSpeed({ value: 1.1, unit: 'kg' }, { value: 0.2, unit: 'm^2' }, { value: 1.225, unit: 'kg/m^3' }, { value: 1, basis: 'assumed' }).metersPerSecond, Math.sqrt((2 * 1.1 * 9.80665) / (1.225 * 0.2)), 1e-9));
}

console.log('=== B29 sensitivity of predicted timing to temperature ===');
{
  // SYNTHETIC: arrival day = 120 − 2.5 · spring temperature + noise
  const r = rng(2929);
  const temp = Array.from({ length: 60 }, () => 6 + 8 * r.next());
  const day = temp.map((t) => 120 - 2.5 * t + 3 * r.normal());
  const fit = linearTrend(temp, day);
  ok('days per °C recovered inside its interval', fit.slopeCi[0] < -2.5 && -2.5 < fit.slopeCi[1], JSON.stringify(fit.slopeCi));
  ok('…called what it is: an association', /association/.test(fit.reading) && /not a causal/.test(fit.reading));
  const pred = (t) => fit.intercept + fit.slope * t;
  ok('elasticity of the prediction at 10 °C is slope × T / day', near(elasticity(pred, 10), (fit.slope * 10) / pred(10), 1e-6));
  const tor = oneAtATime((p) => p.a - p.b * p.t, { a: 120, b: 2.5, t: 10 }, { t: [6, 14], b: [2, 3] });
  ok('a tornado ranks inputs by the swing they cause', tor.inputs[0].input === 't' && near(tor.inputs[0].swing, 20, 1e-9));
  let threw = false;
  try {
    linearTrend([1, 1, 1], [2, 3, 4]);
  } catch {
    threw = true;
  }
  ok('no variation in x: no slope, and it says so', threw);
}

console.log('=== B30 full provenance, assumptions, uncertainty and results exported ===');
{
  const fitProv = derive([table.provenance], 'Poisson GLM (IRLS) with log(effort) offset', { estimate: true, params: { offset: 'log(duration_min)' } });
  ok('a fitted value over simulated data stays simulated', fitProv.origin === 'simulated' && weakest(['observed', 'derived']) === 'derived' && derive([{ origin: 'observed' }], 'distance').origin === 'derived' && derive([{ origin: 'observed' }], 'fit', { estimate: true }).origin === 'modeled');
  const bundle = exportBundle({
    title: 'Atlas benchmark export',
    exportedAt: '2026-10-08T00:00:00Z',
    tables: [{ name: 'checklists', schema: CHECKLIST_SCHEMA, columns: table.columns, rows: table.rows, provenance: table.provenance }],
    results: [
      { name: 'habitat coefficient', value: 0.8, provenance: fitProv, uncertainty: { low: 0.7, high: 0.9, level: 0.95 } },
      { name: 'stopover count', value: 1, provenance: { origin: 'derived', method: 'radius 300 m, ≥ 3 h' }, uncertainty: { none: 'a count under stated thresholds; depends on them' } },
    ],
    assumptions: ['effort offset is log(duration)', 'stopover: within 300 m for at least 3 h'],
  });
  const paths = bundle.files.map((f) => f.path);
  ok('data, schema, provenance, results and a README', ['data/checklists.csv', 'data/checklists.schema.json', 'data/checklists.provenance.json', 'results.json', 'README.json'].every((p) => paths.includes(p)));
  ok('every file in the manifest with its sha256', bundle.files.every((f) => bundle.manifest.includes(`${sha256(f.text)}  ${f.path}`)));
  const readme = JSON.parse(bundle.files.find((f) => f.path === 'README.json').text);
  ok('the README names the licence, the assumptions and that it is simulated', readme.licences[0].licence === 'CC0-1.0' && readme.assumptions.length === 2 && readme.simulated && /not observations/.test(readme.simulated.note));
  const results = JSON.parse(bundle.files.find((f) => f.path === 'results.json').text);
  ok('every result carries its origin and its uncertainty — or says it has none', results.every((r) => r.provenance.origin && r.uncertainty));
  ok('deterministic: the same inputs, the same bytes', exportBundle({ title: 'x', exportedAt: 'y', tables: [], results: [], assumptions: [] }).manifest === exportBundle({ title: 'x', exportedAt: 'y', tables: [], results: [], assumptions: [] }).manifest);
  ok('labels say the origin in words', originLabel('simulated').startsWith('Simulated') && originLabel('imputed').includes('not observed'));
}

console.log('=== the pieces underneath ===');
{
  ok('sha256 matches the reference vectors', sha256('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' && sha256('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  ok('a table’s digest ignores key order and number spelling, not values', fingerprint(['a', 'b'], [{ a: 1.5, b: null }]) === fingerprint(['a', 'b'], [{ b: null, a: 1.50 }]) && fingerprint(['a'], [{ a: 1 }]) !== fingerprint(['a'], [{ a: 2 }]));
  ok('CSV round-trips quotes, commas and newlines', JSON.stringify(parseCSV(toCSV(['a', 'b'], [{ a: 'x, "y"', b: 'line\nbreak' }]))) === JSON.stringify([['a', 'b'], ['x, "y"', 'line\nbreak']]));
  ok('a calendar-impossible date is not a date', parseUtc('2026-02-30T00:00:00Z') === null && parseUtc('2026-02-28T00:00:00Z') !== null);
  ok('grid cells carry effort beside counts, and missing counts are not zeros', (() => { const g = gridCells([{ lat: 50.01, lon: 0.01, c: 2, e: 1 }, { lat: 50.02, lon: 0.02, c: null, e: 2 }], 0.1, { count: (r) => r.c, effort: (r) => r.e }); return g.length === 1 && g[0].total === 2 && g[0].withCount === 1 && g[0].effort === 3; })());
  ok('seeded draws repeat exactly', rng(5).normal() === rng(5).normal() && rng(5).poisson(40) === rng(5).poisson(40));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
