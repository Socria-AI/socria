// lib/voice/vad.ts — WHERE A SPOKEN TURN STARTS AND ENDS, FROM THE MICROPHONE'S LEVEL.
//
// Socria's own recogniser (the transcription the composer's mic already uses)
// is handed one recording per turn, so the browser has to hear where a turn
// begins and ends by itself. This is that ear: the microphone's level, frame by
// frame, against a floor that follows the room — a fan, a street — so that
// speech is what rises well above it, not merely what is loud.
//
//   floor   read from the first moment the microphone is open (its quietest
//           frame), then followed: down at once to a quieter frame, up only
//           slowly — speech dips between words, a fan never does, so a hum
//           that came on later is soon below the line rather than a turn
//   start   enough consecutive frames above the floor (a click or a cough is
//           one frame, and is not a start)
//   end     a pause as long as the turn's pace allows (lib/voice/speech.ts
//           ENDPOINT_MS) — or the turn running to its limit
//   noise   something rose and fell too quickly to be words: thrown away
//
// PURE: frames in, events out. components/logos5/useSocriaVoice.ts feeds it
// from an AnalyserNode; the tests feed it numbers.

export interface VadOptions {
  /** how often a frame arrives */
  frameMs: number;
  /** a pause this long ends the turn */
  endpointMs: number;
  /** less speech than this in a turn is noise */
  minSpeechMs: number;
  /** consecutive loud frames that start a turn */
  startFrames: number;
  /** how far above the room's floor speech is */
  marginDb: number;
  /** quieter than this is never speech, however quiet the room */
  absoluteDb: number;
  /** a turn is ended for them at this length */
  maxTurnMs: number;
  /** frames, as the microphone opens, that only read the room's floor */
  calibrateFrames: number;
}

export const VAD_DEFAULTS: VadOptions = { frameMs: 50, endpointMs: 1400, minSpeechMs: 250, startFrames: 3, marginDb: 12, absoluteDb: -58, maxTurnMs: 60_000, calibrateFrames: 6 };
const FLOOR_MIN = -90;
const FLOOR_MAX = -25;
const clampFloor = (db: number) => Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, db));

export type VadEvent = 'start' | 'end' | 'noise' | null;

/** A frame's loudness in decibels (full scale), from its samples. Silence is -100. */
export function rmsDb(samples: ArrayLike<number>): number {
  let sum = 0;
  const n = samples.length || 1;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / n);
  return rms > 1e-5 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
}

export function createVad(opts: Partial<VadOptions> = {}) {
  const o: VadOptions = { ...VAD_DEFAULTS, ...opts };
  let floor = -60;
  let inSpeech = false;
  let run = 0;
  let speechMs = 0;
  let quietMs = 0;
  let turnMs = 0;
  let level = 0;
  let tail = 0;
  let seen = 0;
  return {
    /** One frame's loudness; what it starts or ends, if anything. */
    push(db: number): VadEvent {
      // the room, first: its quietest moment as the microphone opens
      if (seen < o.calibrateFrames) {
        floor = seen++ === 0 ? clampFloor(db) : Math.min(floor, clampFloor(db));
        level = 0;
        return null;
      }
      const loud = db > Math.max(floor + o.marginDb, o.absoluteDb);
      level = Math.max(0, Math.min(1, (db - floor) / 36));
      // …then followed: down at once, up slowly
      floor = clampFloor(db < floor ? floor * 0.6 + db * 0.4 : floor * 0.99 + db * 0.01);
      if (!inSpeech) {
        if (loud) {
          run++;
          if (run >= o.startFrames) {
            inSpeech = true;
            speechMs = run * o.frameMs;
            quietMs = 0;
            turnMs = speechMs;
            run = 0;
            return 'start';
          }
        } else run = 0;
        return null;
      }
      turnMs += o.frameMs;
      if (loud) {
        speechMs += o.frameMs;
        quietMs = 0;
      } else quietMs += o.frameMs;
      if (quietMs >= o.endpointMs || turnMs >= o.maxTurnMs) {
        inSpeech = false;
        run = 0;
        tail = quietMs;
        const said = speechMs;
        speechMs = 0;
        quietMs = 0;
        turnMs = 0;
        return said >= o.minSpeechMs ? 'end' : 'noise';
      }
      return null;
    },
    /** A new pace, from the next frame on; a turn being spoken goes on. */
    tune(next: Partial<VadOptions>) {
      Object.assign(o, next);
    },
    /** A new turn's pace, or a fresh start after a pause. */
    reset(next: Partial<VadOptions> = {}) {
      Object.assign(o, next);
      inSpeech = false;
      run = 0;
      speechMs = 0;
      quietMs = 0;
      turnMs = 0;
    },
    get speaking() {
      return inSpeech;
    },
    /** how far into the pause that will end the turn, 0–1 — for the ring that shows it */
    get ending() {
      return inSpeech && quietMs > o.frameMs * 2 ? Math.min(1, quietMs / o.endpointMs) : 0;
    },
    /** how loud, 0–1, for the meter */
    get level() {
      return level;
    },
    get floor() {
      return floor;
    },
    /** the silence the last turn ended with, in ms — trimmed off the recording before it is sent */
    get tail() {
      return tail;
    },
    get frameMs() {
      return o.frameMs;
    },
  };
}
