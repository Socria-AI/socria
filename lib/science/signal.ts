// lib/science/signal.ts
//
// SOUND AS NUMBERS: the short-time Fourier transform and the measurements a
// reader of a spectrogram makes by eye, made by arithmetic instead.
//
//   stft          X(m,k) = Σₙ x[n] w[n − mH] e^{−j2πkn/N}; one-sided power
//                 spectral density per frame. Frequency resolution fs/N, time
//                 resolution N/fs, hop H/fs — all three are returned, because
//                 a spectrogram without them is a picture, not a measurement.
//   dominant      the strongest frequency in a time–frequency box, refined
//                 between bins by a parabola through the peak's neighbours
//   bandwidth     where the power falls a stated number of dB below the peak
//   clipping      runs of samples pinned at full scale
//   silence       frames below a stated level, as intervals
//   annotations   human and automated boxes compared by time–frequency
//                 overlap: matched, missed, and false alarms — never merged
//
// And, for tests and teaching only, SYNTHETIC signals with a known answer:
// a tone, a sweep. They are labelled as such by the caller's provenance
// (lib/science/provenance.ts: 'simulated'); nothing here passes one off as a
// recording, and nothing here invents missing audio.
//
// PURE.

import { fft } from '../numeric/spectral';

export type WindowName = 'hann' | 'hamming' | 'rect';

export function windowOf(name: WindowName, n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = n > 1 ? (2 * Math.PI * i) / (n - 1) : 0;
    w[i] = name === 'hann' ? 0.5 - 0.5 * Math.cos(p) : name === 'hamming' ? 0.54 - 0.46 * Math.cos(p) : 1;
  }
  return w;
}

export interface Spectrogram {
  sampleRate: number;
  fftSize: number;
  hop: number;
  window: WindowName;
  /** frame centres, seconds */
  times: number[];
  /** bin centres, Hz, 0 … fs/2 */
  freqs: number[];
  /** one-sided power spectral density per frame, (units of x)²/Hz */
  power: Float64Array[];
  /** fs / N */
  freqResolutionHz: number;
  /** N / fs: the window's length in time */
  windowS: number;
  /** H / fs */
  hopS: number;
}

/**
 * The short-time Fourier transform of x sampled at fs.
 * Frames that would run past the end are not padded with invented samples:
 * the last frame is the last one that fits.
 */
export function stft(
  x: ArrayLike<number>,
  fs: number,
  opts: { fftSize?: number; hop?: number; window?: WindowName } = {}
): Spectrogram {
  if (!(fs > 0)) throw new Error('sample rate must be positive');
  const N = Math.max(8, Math.floor(opts.fftSize ?? 1024));
  const H = Math.max(1, Math.floor(opts.hop ?? N / 4));
  const wname = opts.window ?? 'hann';
  const w = windowOf(wname, N);
  const wss = w.reduce((s, v) => s + v * v, 0);
  const bins = Math.floor(N / 2) + 1;
  const freqs = Array.from({ length: bins }, (_, k) => (k * fs) / N);
  const times: number[] = [];
  const power: Float64Array[] = [];
  const re = new Float64Array(N);
  for (let start = 0; start + N <= x.length; start += H) {
    for (let i = 0; i < N; i++) re[i] = x[start + i] * w[i];
    const X = fft(re);
    const p = new Float64Array(bins);
    for (let k = 0; k < bins; k++) {
      const m2 = X.re[k] * X.re[k] + X.im[k] * X.im[k];
      // one-sided PSD: double every bin but DC and (for even N) Nyquist
      const twice = k !== 0 && !(N % 2 === 0 && k === N / 2);
      p[k] = (twice ? 2 : 1) * m2 / (fs * wss);
    }
    power.push(p);
    times.push((start + N / 2) / fs);
  }
  return { sampleRate: fs, fftSize: N, hop: H, window: wname, times, freqs, power, freqResolutionHz: fs / N, windowS: N / fs, hopS: H / fs };
}

export function toDb(p: number, floorDb = -160): number {
  return p > 0 ? Math.max(floorDb, 10 * Math.log10(p)) : floorDb;
}

export interface Box {
  t0?: number;
  t1?: number;
  f0?: number;
  f1?: number;
}

function frameRange(s: Spectrogram, b: Box): [number, number] {
  let a = 0, z = s.times.length - 1;
  if (b.t0 !== undefined) while (a <= z && s.times[a] < b.t0) a++;
  if (b.t1 !== undefined) while (z >= a && s.times[z] > b.t1) z--;
  return [a, z];
}
function binRange(s: Spectrogram, b: Box): [number, number] {
  let a = 0, z = s.freqs.length - 1;
  if (b.f0 !== undefined) while (a <= z && s.freqs[a] < b.f0) a++;
  if (b.f1 !== undefined) while (z >= a && s.freqs[z] > b.f1) z--;
  return [a, z];
}

/** The time-averaged spectrum inside a box. */
export function meanSpectrum(s: Spectrogram, box: Box = {}): { freqs: number[]; power: number[] } {
  const [fa, fz] = frameRange(s, box);
  const [ba, bz] = binRange(s, box);
  const out: number[] = [];
  for (let k = ba; k <= bz; k++) {
    let sum = 0;
    for (let m = fa; m <= fz; m++) sum += s.power[m][k];
    out.push(fz >= fa ? sum / (fz - fa + 1) : 0);
  }
  return { freqs: s.freqs.slice(ba, bz + 1), power: out };
}

/**
 * The strongest frequency in a box, refined between bins with a parabola
 * through the log-power of the peak and its neighbours.
 */
export function dominantFrequency(s: Spectrogram, box: Box = {}): { hz: number; db: number } | null {
  const { freqs, power } = meanSpectrum(s, box);
  if (!power.length) return null;
  let k = 0;
  for (let i = 1; i < power.length; i++) if (power[i] > power[k]) k = i;
  if (!(power[k] > 0)) return null;
  let hz = freqs[k];
  if (k > 0 && k < power.length - 1 && power[k - 1] > 0 && power[k + 1] > 0) {
    const a = Math.log(power[k - 1]), b = Math.log(power[k]), c = Math.log(power[k + 1]);
    const den = a - 2 * b + c;
    if (den < 0) hz += (0.5 * (a - c)) / den * s.freqResolutionHz;
  }
  return { hz, db: toDb(power[k]) };
}

/** The band around the peak inside which power stays within `dropDb` of it. */
export function bandwidth(s: Spectrogram, box: Box = {}, dropDb = 20): { lowHz: number; highHz: number; widthHz: number } | null {
  const { freqs, power } = meanSpectrum(s, box);
  if (!power.length) return null;
  let k = 0;
  for (let i = 1; i < power.length; i++) if (power[i] > power[k]) k = i;
  if (!(power[k] > 0)) return null;
  const floor = power[k] * 10 ** (-dropDb / 10);
  let lo = k, hi = k;
  while (lo > 0 && power[lo - 1] >= floor) lo--;
  while (hi < power.length - 1 && power[hi + 1] >= floor) hi++;
  return { lowHz: freqs[lo], highHz: freqs[hi], widthHz: freqs[hi] - freqs[lo] };
}

/** The dominant frequency of each frame: the ridge a sweep draws. */
export function ridge(s: Spectrogram, box: Box = {}): { t: number; hz: number }[] {
  const [fa, fz] = frameRange(s, box);
  const out: { t: number; hz: number }[] = [];
  for (let m = fa; m <= fz; m++) {
    const d = dominantFrequency(s, { t0: s.times[m], t1: s.times[m], f0: box.f0, f1: box.f1 });
    if (d) out.push({ t: s.times[m], hz: d.hz });
  }
  return out;
}

// ── quality checks ────────────────────────────────────────────────────

/** Runs of at least `minRun` samples at or beyond ±threshold × full scale. */
export function clipping(x: ArrayLike<number>, opts: { fullScale?: number; threshold?: number; minRun?: number } = {}) {
  const fsAbs = opts.fullScale ?? 1;
  const thr = (opts.threshold ?? 0.999) * fsAbs;
  const minRun = opts.minRun ?? 3;
  const runs: { start: number; length: number }[] = [];
  let start = -1;
  let clipped = 0;
  for (let i = 0; i <= x.length; i++) {
    const hit = i < x.length && Math.abs(x[i]) >= thr;
    if (hit && start < 0) start = i;
    if (!hit && start >= 0) {
      const len = i - start;
      if (len >= minRun) {
        runs.push({ start, length: len });
        clipped += len;
      }
      start = -1;
    }
  }
  return { runs, clippedSamples: clipped, fraction: x.length ? clipped / x.length : 0, clipped: runs.length > 0 };
}

/** Frames whose RMS level is below `thresholdDb` (relative to full scale), merged into intervals. */
export function silence(x: ArrayLike<number>, fs: number, opts: { frameS?: number; thresholdDb?: number; fullScale?: number } = {}) {
  const frame = Math.max(1, Math.round((opts.frameS ?? 0.02) * fs));
  const thr = opts.thresholdDb ?? -60;
  const ref = opts.fullScale ?? 1;
  const intervals: { t0: number; t1: number }[] = [];
  let open: number | null = null;
  let quietFrames = 0, frames = 0;
  for (let s = 0; s < x.length; s += frame) {
    const e = Math.min(x.length, s + frame);
    let sum = 0;
    for (let i = s; i < e; i++) sum += x[i] * x[i];
    const rms = Math.sqrt(sum / (e - s));
    const db = rms > 0 ? 20 * Math.log10(rms / ref) : -Infinity;
    frames++;
    if (db < thr) {
      quietFrames++;
      if (open === null) open = s / fs;
    } else if (open !== null) {
      intervals.push({ t0: open, t1: s / fs });
      open = null;
    }
  }
  if (open !== null) intervals.push({ t0: open, t1: x.length / fs });
  return { intervals, silentFraction: frames ? quietFrames / frames : 1, allSilent: frames > 0 && quietFrames === frames };
}

// ── annotations: human and automated, compared, never merged ─────────

export interface Annotation {
  start_s: number;
  end_s: number;
  low_freq_hz: number;
  high_freq_hz: number;
  call_type?: string;
  /** who drew it — the atlas's rule: human and automated are always distinguishable */
  by: 'human' | 'automated';
  confidence?: number;
}

/** Overlap of two time–frequency boxes as intersection over union of their areas. */
export function boxIoU(a: Annotation, b: Annotation): number {
  const dt = Math.max(0, Math.min(a.end_s, b.end_s) - Math.max(a.start_s, b.start_s));
  const df = Math.max(0, Math.min(a.high_freq_hz, b.high_freq_hz) - Math.max(a.low_freq_hz, b.low_freq_hz));
  const inter = dt * df;
  const area = (x: Annotation) => Math.max(0, x.end_s - x.start_s) * Math.max(0, x.high_freq_hz - x.low_freq_hz);
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Automated detections scored against human annotations as the reference.
 * Greedy one-to-one matching by IoU (highest first); a detection matches at
 * most one annotation. Precision and recall are null when undefined (no
 * detections; no annotations) rather than 0 or 1.
 */
export function compareAnnotations(reference: readonly Annotation[], detected: readonly Annotation[], minIoU = 0.5) {
  if (reference.some((a) => a.by !== 'human')) throw new Error('the reference must be human annotations');
  const pairs: { ref: number; det: number; iou: number }[] = [];
  for (let i = 0; i < reference.length; i++) for (let j = 0; j < detected.length; j++) {
    const iou = boxIoU(reference[i], detected[j]);
    if (iou >= minIoU) pairs.push({ ref: i, det: j, iou });
  }
  pairs.sort((a, b) => b.iou - a.iou);
  const usedR = new Set<number>(), usedD = new Set<number>();
  const matched: typeof pairs = [];
  for (const p of pairs) {
    if (usedR.has(p.ref) || usedD.has(p.det)) continue;
    usedR.add(p.ref);
    usedD.add(p.det);
    matched.push(p);
  }
  const tp = matched.length;
  const fp = detected.length - tp;
  const fn = reference.length - tp;
  return {
    matched,
    missed: reference.map((_, i) => i).filter((i) => !usedR.has(i)),
    falseAlarms: detected.map((_, j) => j).filter((j) => !usedD.has(j)),
    tp, fp, fn,
    precision: detected.length ? tp / detected.length : null,
    recall: reference.length ? tp / reference.length : null,
  };
}

// ── synthetic signals with a known answer (tests, teaching) ──────────

/** A pure tone. Synthetic: its provenance is 'simulated'. */
export function tone(fs: number, seconds: number, hz: number, amplitude = 0.5, phase = 0): Float64Array {
  const n = Math.round(fs * seconds);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = amplitude * Math.sin(2 * Math.PI * hz * (i / fs) + phase);
  return x;
}

/**
 * A frequency sweep from f0 to f1 over `seconds`, linear or exponential, with
 * its instantaneous frequency known exactly: linear f(t) = f0 + (f1−f0)t/T;
 * exponential f(t) = f0 (f1/f0)^{t/T}. Synthetic.
 */
export function sweep(fs: number, seconds: number, f0: number, f1: number, kind: 'linear' | 'exponential' = 'linear', amplitude = 0.5) {
  const n = Math.round(fs * seconds);
  const x = new Float64Array(n);
  const T = seconds;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    const phase =
      kind === 'linear'
        ? 2 * Math.PI * (f0 * t + ((f1 - f0) * t * t) / (2 * T))
        : (2 * Math.PI * f0 * T * (Math.pow(f1 / f0, t / T) - 1)) / Math.log(f1 / f0);
    x[i] = amplitude * Math.sin(phase);
  }
  const at = (t: number) => (kind === 'linear' ? f0 + ((f1 - f0) * t) / T : f0 * Math.pow(f1 / f0, t / T));
  return { x, frequencyAt: at };
}
