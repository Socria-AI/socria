// lib/voice/wav.ts — ONE SPOKEN TURN, AS A FILE SOCRIA'S TRANSCRIPTION TAKES.
//
// Socria's own recogniser hears a turn as the microphone's samples, kept in
// the page while the turn is spoken (components/logos5/useSocriaVoice.ts) —
// with a moment from before the turn began, so its first syllable is not cut
// off the way a recorder started on the word would cut it. When the turn ends
// they are made one small WAV file: 16 kHz, mono, 16-bit — what speech needs,
// and a minute of it (the longest turn, lib/voice/speech.ts MAX_TURN_MS) is
// under 2 MB, inside what /api/transcribe accepts (lib/logos4/voice.ts
// MAX_AUDIO_BYTES). WAV is read by every browser and the provider alike; no
// codec is asked of the browser at all.
//
// PURE.

export const SPEECH_RATE = 16_000;

/** The samples, at another rate: each new sample the mean of the old ones it stands for (enough filtering for speech). */
export function resample(input: Float32Array, from: number, to: number = SPEECH_RATE): Float32Array {
  if (!input.length || from <= 0 || to <= 0) return new Float32Array(0);
  if (from === to) return input.slice();
  const ratio = from / to;
  const n = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(input.length, Math.max(a + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = a; j < b; j++) sum += input[j];
    out[i] = sum / (b - a);
  }
  return out;
}

/** Several frames, one after another, as one run of samples. */
export function joinFrames(frames: readonly Float32Array[]): Float32Array {
  let n = 0;
  for (const f of frames) n += f.length;
  const out = new Float32Array(n);
  let at = 0;
  for (const f of frames) {
    out.set(f, at);
    at += f.length;
  }
  return out;
}

/** 16-bit mono PCM in a WAV file. */
export function encodeWav(samples: Float32Array, rate: number = SPEECH_RATE): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true); // the format block's size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // one channel
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); // bytes a second
  v.setUint16(32, 2, true); // bytes a frame
  v.setUint16(34, 16, true); // bits a sample
  text(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

/** A turn's frames, captured at `rate`, as the file to transcribe. */
export function turnWav(frames: readonly Float32Array[], rate: number): ArrayBuffer {
  return encodeWav(resample(joinFrames(frames), rate, SPEECH_RATE), SPEECH_RATE);
}

/** How many frames of `frameLen` samples at `rate` make `ms` milliseconds — at least one. */
export function framesFor(ms: number, frameLen: number, rate: number): number {
  return Math.max(1, Math.ceil(((ms / 1000) * rate) / Math.max(1, frameLen)));
}
