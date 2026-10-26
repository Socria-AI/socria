'use client';

// components/logos5/useSocriaVoice.ts — SOCRIA VOICE'S EAR.
//
// The microphone, heard continuously and cut into turns, each turn handed to
// Logos 5 as the words of a message (components/LogosApp.tsx onVoiceTurn) —
// which sends it through the same dispatcher a typed message goes through.
// Nothing here decides what a turn means, and nothing is ever said back.
//
// Two recognisers (lib/voice/speech.ts VoiceEngine):
//
//   browser   the browser's own speech recognition (Chrome, Edge, Safari):
//             words appear as they are said, and the turn ends when they
//             pause for the pace's length (ENDPOINT_MS). The audio goes to
//             the browser maker's speech service, as that browser's own
//             dictation does — said so before Voice starts.
//   socria    Socria's transcription, the one the composer's mic already uses
//             (/api/transcribe): the microphone's level is watched here
//             (lib/voice/vad.ts) and each turn, once it ends, is sent as one
//             short recording (lib/voice/wav.ts) — the words arrive a sentence
//             at a time. Nothing is recorded between turns, and nothing is kept.
//
// What the ear does about the microphone, so the panel stays simple:
//   • the permission prompt, a refusal, no microphone, a microphone taken away
//   • listening again after every turn, and after the browser's recogniser
//     stops by itself — but not forever: one that stops without hearing
//     anything again and again is reported (lib/voice/recognizer.ts)
//   • Pause releases the microphone (the browser's red dot goes out); so does
//     the tab going into the background, and five minutes without a word
//     turn Voice off (IDLE_OFF_MS)
//   • words heard when listening is paused or turned off mid-turn are not
//     sent: the live words go into the box, to read and send or not
//   • a transcription that fails is kept for Retry; a busy one is retried
//
// THE STORE. The microphone's level and the live words change ten times a
// second; Logos 5 is one large component, and must not draw itself again that
// often. So the ear keeps its state outside React and each part reads only
// what it shows (useEar): the panel the level, LogosApp only the phase.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { ENDPOINT_MS, IDLE_OFF_MS, MAX_TURN_MS, type Pace, type VoiceEngine } from '@/lib/voice/speech';
import { createVad, rmsDb } from '@/lib/voice/vad';
import { browserProblem, heardOf, mayRestart, readResults, restartDelay, STALLED, transcribeOutcome, type ResultLike, type VoiceProblem } from '@/lib/voice/recognizer';
import { framesFor, turnWav } from '@/lib/voice/wav';
import { micError } from '@/lib/logos4/voice';
import { serverAvailable } from '@/components/useVoiceInput';

export type VoicePhase = 'off' | 'starting' | 'listening' | 'hearing' | 'paused' | 'error';

export interface EarState {
  /** what this browser can use: its own recogniser, and Socria's (a microphone the page can read, and a server that transcribes) */
  has: { browser: boolean; socria: boolean };
  engine: VoiceEngine | null;
  phase: VoicePhase;
  /** the turn's settled words (browser recogniser) */
  heard: string;
  /** the words still being heard (browser recogniser) */
  interim: string;
  /** 0–1, the microphone's level (Socria's recogniser; the browser's does not say) */
  level: number;
  /** 0–1, how far into the pause that will end the turn */
  ending: number;
  /** turns on their way to text (Socria's recogniser) */
  pending: number;
  /** what went wrong: in phase 'error' it stopped listening; otherwise listening goes on */
  problem: VoiceProblem | null;
  /** a turn that could not be transcribed, kept for Retry */
  failed: boolean;
  /** why Voice paused or went off by itself */
  note: string | null;
}

export interface EarIO {
  /** a turn ended: what was said */
  turn: (text: string, engine: VoiceEngine) => void;
  /** words heard but not to be sent — listening was paused or turned off mid-turn */
  unsent: (text: string) => void;
}

interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((e: { results: ArrayLike<ResultLike> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
type AudioCtor = new () => AudioContext;
function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}
const canCapture = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!audioCtor();
/** Phones' recognisers repeat themselves in continuous mode: there, one recognition per turn. */
const phoneRecogniser = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
const lang = () => (typeof navigator !== 'undefined' && navigator.language) || 'en-US';

/** The microphone's samples, a frame at a time, off the audio thread. */
const WORKLET = `class SocriaEar extends AudioWorkletProcessor {
  constructor(o) { super(); this.n = (o && o.processorOptions && o.processorOptions.frame) || 2048; this.buf = new Float32Array(this.n); this.i = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let k = 0; k < ch.length; k++) {
      this.buf[this.i++] = ch[k];
      if (this.i === this.n) { this.port.postMessage(this.buf, [this.buf.buffer]); this.buf = new Float32Array(this.n); this.i = 0; }
    }
    return true;
  }
}
registerProcessor('socria-ear', SocriaEar);`;

const FRAME = 2048;
/** Kept from before a turn begins, so its first syllable is in the recording. */
const PREROLL_MS = 400;
/** Kept of the pause that ended a turn. */
const KEEP_TAIL_MS = 300;
/** A busy transcription is tried this many times before it is left for Retry. */
const MAX_TRIES = 3;
/** The browser recogniser's settled words are waited for this long after it is asked to finish a turn. */
const FINISH_MS = 1500;

/** Audio contexts the frame reader is already loaded into (a second load of the same name is refused). */
const workletIn = new WeakSet<AudioContext>();

const INITIAL: EarState = { has: { browser: false, socria: false }, engine: null, phase: 'off', heard: '', interim: '', level: 0, ending: 0, pending: 0, problem: null, failed: false, note: null };

export type Ear = ReturnType<typeof createEar>;

export function createEar(io: EarIO, pace0: Pace = 'normal') {
  let state: EarState = { ...INITIAL, has: { browser: !!recognitionCtor(), socria: false } };
  const subs = new Set<() => void>();
  const set = (p: Partial<EarState>) => {
    let changed = false;
    for (const k of Object.keys(p) as (keyof EarState)[]) if (state[k] !== p[k]) changed = true;
    if (!changed) return;
    state = { ...state, ...p };
    subs.forEach((f) => f());
  };

  let pace: Pace = pace0;
  let on = false;
  let paused = false;
  /** every start, pause and stop begins a new generation: what an older one hears afterwards is ignored */
  let gen = 0;
  let idle: ReturnType<typeof setTimeout> | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };

  const touch = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => {
      if (on && !paused) stop('Voice turned off after five minutes without a word.');
    }, IDLE_OFF_MS);
  };

  // ── the browser's recogniser ───────────────────────────────────────
  let rec: RecognitionLike | null = null;
  let words = { finals: '', interim: '' };
  let fatal: VoiceProblem | null = null;
  let quietStarts: number[] = [];
  let quiet = 0;
  let firstStart = true;
  let lastWordAt = 0;
  let endTimer: ReturnType<typeof setTimeout> | null = null;
  let ring: ReturnType<typeof setInterval> | null = null;

  const clearEnd = () => {
    if (endTimer) clearTimeout(endTimer);
    endTimer = null;
    if (ring) clearInterval(ring);
    ring = null;
  };

  function openRec(g: number) {
    const R = recognitionCtor();
    if (!R) return fail({ kind: 'unsupported', message: 'This browser has no speech recognition of its own.', switchable: true, retryable: false });
    const r = new R();
    r.continuous = !phoneRecogniser();
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.lang = lang();
    words = { finals: '', interim: '' };
    fatal = null;
    r.onstart = () => {
      if (rec !== r || g !== gen) return;
      firstStart = false;
      set({ phase: state.phase === 'hearing' ? 'hearing' : 'listening', problem: state.problem?.kind === 'stalled' ? null : state.problem });
    };
    r.onresult = (e) => {
      if (rec !== r || g !== gen) return;
      words = readResults(e.results);
      const all = heardOf(words);
      set({ heard: words.finals, interim: words.interim, ...(all ? { phase: 'hearing' as const } : {}) });
      if (!all) return;
      quiet = 0;
      quietStarts = [];
      lastWordAt = Date.now();
      touch();
      armEnd(r, g);
    };
    r.onerror = (e) => {
      if (rec !== r || g !== gen) return;
      const p = browserProblem(e.error);
      // a restart the browser refused needs a tap — not a refusal of the microphone
      if (p && !firstStart && (e.error === 'not-allowed' || e.error === 'service-not-allowed'))
        fatal = { kind: 'permission', message: 'Your browser needs a tap to keep listening.', switchable: false, retryable: true };
      else if (p) fatal = p;
    };
    r.onend = () => finishRec(r, g);
    rec = r;
    try {
      r.start();
    } catch {
      rec = null;
      fail({ kind: 'service', message: 'Speech recognition could not be started.', switchable: true, retryable: true });
    }
  }

  /** The words have stopped: after the pace's pause, the turn ends. */
  function armEnd(r: RecognitionLike, g: number) {
    if (endTimer) clearTimeout(endTimer);
    endTimer = setTimeout(() => endRec(r, g), ENDPOINT_MS[pace]);
    // the ring fills only once the words have plainly paused, not in the gaps between them
    ring ??= setInterval(() => {
      const dt = Date.now() - lastWordAt;
      set({ ending: dt < 300 ? 0 : Math.min(1, (dt - 300) / Math.max(1, ENDPOINT_MS[pace] - 300)) });
    }, 100);
  }

  /** End the turn: the recogniser settles what it heard, then ends. */
  function endRec(r: RecognitionLike, g: number) {
    if (rec !== r || g !== gen || !heardOf(words)) return;
    clearEnd();
    try {
      r.stop();
    } catch {
      /* already ending */
    }
    // a recogniser that does not end when asked is ended
    later(() => {
      if (rec !== r) return;
      try {
        r.abort();
      } catch {
        /* gone */
      }
      finishRec(r, g);
    }, FINISH_MS);
  }

  function finishRec(r: RecognitionLike, g: number) {
    if (rec !== r || g !== gen) return;
    rec = null;
    clearEnd();
    const said = heardOf(words);
    words = { finals: '', interim: '' };
    set({ heard: '', interim: '', ending: 0 });
    if (said) io.turn(said, 'browser');
    if (fatal) {
      const p = fatal;
      fatal = null;
      return fail(p);
    }
    if (!on || paused) return;
    set({ phase: 'listening' });
    const now = Date.now();
    if (!said) {
      quiet++;
      quietStarts.push(now);
      if (!mayRestart(quietStarts, now)) return fail(STALLED);
    }
    later(
      () => {
        if (g === gen && on && !paused && !rec) openRec(g);
      },
      said ? 60 : restartDelay(quiet)
    );
  }

  /** Stop the recogniser without the turn it was hearing: returns what it had heard. */
  function dropRec(): string {
    const r = rec;
    const had = heardOf(words);
    rec = null;
    words = { finals: '', interim: '' };
    clearEnd();
    try {
      r?.abort();
    } catch {
      /* gone */
    }
    return had;
  }

  // ── Socria's recogniser ────────────────────────────────────────────
  let actx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let graph: AudioNode[] = [];
  let vad = createVad();
  let pre: Float32Array[] = [];
  let preN = 1;
  let turnFrames: Float32Array[] | null = null;
  let rate = 48_000;
  let lastUi = 0;
  const queue: { wav: Blob; tries: number }[] = [];
  let sending = false;
  let failedWav: Blob | null = null;

  /** Made inside the press that starts Voice: a phone's browser starts sound only from a press. */
  function audioContext(): AudioContext | null {
    if (actx && actx.state !== 'closed') return actx;
    const AC = audioCtor();
    if (!AC) return null;
    actx = new AC();
    void actx.resume?.().catch(() => {});
    return actx;
  }

  async function openMic(g: number) {
    const ctx = audioContext();
    if (!ctx) return fail({ kind: 'unsupported', message: 'This browser can’t read the microphone.', switchable: true, retryable: false });
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) {
      if (g !== gen) return;
      const name = (e as { name?: string } | null)?.name ?? '';
      return fail({ kind: name === 'NotAllowedError' || name === 'SecurityError' ? 'permission' : 'no-mic', message: micError(e), switchable: false, retryable: true });
    }
    if (g !== gen || !on || paused) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = s;
    try {
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      rate = ctx.sampleRate;
      const src = ctx.createMediaStreamSource(s);
      // processed but never heard
      const sink = ctx.createGain();
      sink.gain.value = 0;
      sink.connect(ctx.destination);
      let node: AudioNode;
      try {
        if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') throw new Error('no worklet');
        if (!workletIn.has(ctx)) {
          const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
          try {
            await ctx.audioWorklet.addModule(url);
            workletIn.add(ctx);
          } finally {
            URL.revokeObjectURL(url);
          }
        }
        const w = new AudioWorkletNode(ctx, 'socria-ear', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, processorOptions: { frame: FRAME } });
        w.port.onmessage = (e: MessageEvent) => frame(g, e.data as Float32Array);
        node = w;
      } catch {
        // older browsers: the same frames, on the page's own thread
        const sp = ctx.createScriptProcessor(FRAME, 1, 1);
        sp.onaudioprocess = (e) => frame(g, new Float32Array(e.inputBuffer.getChannelData(0)));
        node = sp;
      }
      if (g !== gen) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      src.connect(node);
      node.connect(sink);
      graph = [src, node, sink];
      vad = createVad({ frameMs: (FRAME / rate) * 1000, endpointMs: ENDPOINT_MS[pace], maxTurnMs: MAX_TURN_MS });
      preN = framesFor(PREROLL_MS, FRAME, rate);
      pre = [];
      turnFrames = null;
      // unplugged, or taken away in the browser's settings
      s.getAudioTracks().forEach((t) => {
        t.onended = () => {
          if (g === gen && on && !paused) fail({ kind: 'no-mic', message: 'The microphone stopped.', switchable: false, retryable: true });
        };
      });
      set({ phase: 'listening', problem: state.problem?.kind === 'limit' || state.problem?.kind === 'transcribe' ? state.problem : null });
    } catch {
      if (g === gen) fail({ kind: 'no-mic', message: 'The microphone could not be read.', switchable: true, retryable: true });
    }
  }

  function frame(g: number, samples: Float32Array) {
    if (g !== gen || !on || paused) return;
    const ev = vad.push(rmsDb(samples));
    if (turnFrames) turnFrames.push(samples);
    else {
      pre.push(samples);
      if (pre.length > preN) pre.shift();
    }
    if (ev === 'start') {
      turnFrames = pre;
      pre = [];
      touch();
      set({ phase: 'hearing' });
    } else if (ev === 'end') {
      const frames = turnFrames ?? [];
      turnFrames = null;
      // the pause that ended it, mostly cut off
      const drop = Math.max(0, Math.floor((vad.tail - KEEP_TAIL_MS) / vad.frameMs));
      const kept = drop ? frames.slice(0, Math.max(1, frames.length - drop)) : frames;
      set({ phase: 'listening', ending: 0 });
      enqueue(new Blob([turnWav(kept, rate)], { type: 'audio/wav' }));
    } else if (ev === 'noise') {
      turnFrames = null;
      set({ phase: 'listening', ending: 0 });
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastUi > 90) {
      lastUi = now;
      set({ level: Math.round(vad.level * 20) / 20, ending: Math.round(vad.ending * 20) / 20 });
    }
  }

  function enqueue(wav: Blob) {
    queue.push({ wav, tries: 0 });
    set({ pending: queue.length });
    void pump();
  }

  async function pump() {
    if (sending || !queue.length) return;
    sending = true;
    const item = queue[0];
    try {
      const form = new FormData();
      form.append('audio', item.wav, 'speech.wav');
      const l = lang().slice(0, 2).toLowerCase();
      if (/^[a-z]{2}$/.test(l)) form.append('language', l);
      const r = await fetch('/api/transcribe', { method: 'POST', body: form });
      const body = (await r.json().catch(() => null)) as { text?: unknown; error?: unknown } | null;
      const out = transcribeOutcome(r.status, body, r.headers.get('Retry-After'));
      if (out.ok) {
        queue.shift();
        if (on) io.turn(out.text, 'socria');
        else io.unsent(out.text);
      } else if (out.silent) {
        queue.shift();
      } else if (out.problem.kind === 'limit' && ++item.tries < MAX_TRIES) {
        set({ problem: out.problem });
        sending = false;
        later(() => void pump(), out.retryAfterMs ?? 8000);
        return;
      } else {
        queue.shift();
        failedWav = item.wav;
        set({ problem: out.problem, failed: true });
        if (out.problem.kind === 'signed-out' || (out.problem.kind === 'unsupported' && !out.problem.retryable)) fail({ ...out.problem, switchable: out.problem.switchable && state.has.browser });
      }
    } catch {
      queue.shift();
      failedWav = item.wav;
      set({ problem: { kind: 'network', message: 'Couldn’t reach Socria to transcribe that. Check the connection, then Retry.', switchable: state.has.browser, retryable: true }, failed: true });
    }
    sending = false;
    set({ pending: queue.length, ...(state.problem?.kind === 'limit' ? { problem: null } : {}) });
    void pump();
  }

  function closeMic() {
    turnFrames = null;
    pre = [];
    for (const n of graph) {
      try {
        n.disconnect();
      } catch {
        /* already apart */
      }
    }
    graph = [];
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    vad.reset();
  }

  // ── the ear, whichever recogniser ──────────────────────────────────

  function closeAll(): string {
    gen++;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    const had = dropRec();
    closeMic();
    return had;
  }

  function open() {
    const g = gen;
    set({ phase: 'starting', heard: '', interim: '', level: 0, ending: 0, note: null });
    touch();
    if (state.engine === 'browser') openRec(g);
    else void openMic(g);
  }

  function fail(p: VoiceProblem) {
    const had = closeAll();
    if (had) io.unsent(had);
    if (idle) clearTimeout(idle);
    set({ phase: 'error', problem: p, heard: '', interim: '', level: 0, ending: 0 });
  }

  /** Start listening (call it from a press: phones start the microphone only from one). */
  function start(engine: VoiceEngine) {
    closeAll();
    on = true;
    paused = false;
    quiet = 0;
    quietStarts = [];
    firstStart = true;
    set({ engine, problem: null, failed: state.failed && engine === 'socria' });
    if (engine === 'socria') audioContext();
    open();
  }

  function pause(note: string | null = null) {
    if (!on || paused) return;
    paused = true;
    const had = closeAll();
    if (had) io.unsent(had);
    if (idle) clearTimeout(idle);
    set({ phase: 'paused', heard: '', interim: '', level: 0, ending: 0, note });
  }

  function resume() {
    if (!on || !state.engine) return;
    paused = false;
    quiet = 0;
    quietStarts = [];
    if (state.engine === 'socria') audioContext();
    gen++;
    set({ problem: state.phase === 'error' ? null : state.problem });
    open();
  }

  function stop(note: string | null = null) {
    const was = on;
    on = false;
    paused = false;
    const had = closeAll();
    if (had && was) io.unsent(had);
    if (idle) clearTimeout(idle);
    void actx?.close().catch(() => {});
    actx = null;
    set({ phase: 'off', heard: '', interim: '', level: 0, ending: 0, note, problem: null });
  }

  /** "Send now": the turn being heard ends here. */
  function sendNow() {
    if (!on || paused) return;
    if (state.engine === 'browser' && rec) {
      const r = rec;
      if (heardOf(words)) endRec(r, gen);
      return;
    }
    if (turnFrames && turnFrames.length) {
      const frames = turnFrames;
      turnFrames = null;
      vad.reset();
      set({ phase: 'listening', ending: 0 });
      enqueue(new Blob([turnWav(frames, rate)], { type: 'audio/wav' }));
    }
  }

  /** Throw the turn being heard away and listen afresh. */
  function cancelTurn() {
    if (!on || paused) return;
    if (state.engine === 'browser') {
      dropRec();
      set({ heard: '', interim: '', ending: 0, phase: 'listening' });
      const g = gen;
      later(() => {
        if (g === gen && on && !paused && !rec) openRec(g);
      }, 80);
      return;
    }
    turnFrames = null;
    vad.reset();
    set({ phase: 'listening', ending: 0 });
  }

  function retry() {
    if (!failedWav) return;
    const wav = failedWav;
    failedWav = null;
    set({ failed: false, problem: null });
    queue.unshift({ wav, tries: 0 });
    set({ pending: queue.length });
    void pump();
  }

  function discardFailed() {
    failedWav = null;
    set({ failed: false, problem: state.phase === 'error' ? state.problem : null });
  }

  return {
    get: () => state,
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    /** what this browser can use (Socria's recogniser once the server has said it transcribes) */
    setHas(has: { browser: boolean; socria: boolean }) {
      set({ has });
    },
    start,
    pause,
    resume,
    stop,
    sendNow,
    cancelTurn,
    retry,
    discardFailed,
    /** clear a problem that did not stop listening, or a note */
    dismiss() {
      set({ note: null, ...(state.phase !== 'error' ? { problem: null } : {}) });
    },
    /** a new pace, from the next pause on */
    tune(next: Pace) {
      pace = next;
      vad.tune({ endpointMs: ENDPOINT_MS[next] });
    },
    get on() {
      return on;
    },
    dispose() {
      on = false;
      closeAll();
      if (idle) clearTimeout(idle);
      void actx?.close().catch(() => {});
      actx = null;
      subs.clear();
    },
  };
}

/**
 * The ear, made once for the page, with what this browser can use found out:
 * the browser's own recogniser at once, Socria's when the server answers that
 * it transcribes. The tab going to the background pauses it.
 */
export function useSocriaVoice(io: EarIO, pace: Pace, enabled: boolean): Ear | null {
  const ioRef = useRef(io);
  ioRef.current = io;
  const earRef = useRef<Ear | null>(null);
  if (!earRef.current && typeof window !== 'undefined' && enabled) {
    earRef.current = createEar({ turn: (t, e) => ioRef.current.turn(t, e), unsent: (t) => ioRef.current.unsent(t) }, pace);
  }
  const ear = earRef.current;

  useEffect(() => {
    if (!ear) return;
    let live = true;
    const browser = !!recognitionCtor();
    ear.setHas({ browser, socria: false });
    if (canCapture()) void serverAvailable().then((ok) => live && ear.setHas({ browser, socria: ok }));
    const onHide = () => {
      if (document.hidden && ear.on) ear.pause('Paused while this tab was in the background.');
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [ear]);

  useEffect(() => {
    ear?.tune(pace);
  }, [ear, pace]);

  // turned off where Voice cannot be used (left Logos 5, read-only), and released when the page goes
  useEffect(() => {
    if (ear && !enabled && ear.on) ear.stop();
  }, [ear, enabled]);
  useEffect(() => () => earRef.current?.dispose(), []);

  return ear;
}

/**
 * One part of the ear's state, read where it is shown — a part that draws only
 * when that part changes. `pick` returns a value or a part of the state as it
 * is, never a new object (it is compared by identity).
 */
export function useEar<T>(ear: Ear | null, pick: (s: EarState) => T): T {
  return useSyncExternalStore(
    (fn) => (ear ? ear.subscribe(fn) : () => {}),
    () => pick(ear ? ear.get() : INITIAL),
    () => pick(INITIAL)
  );
}
