'use client';

// Logos 4, Voice to Text: the recorder behind the composer's mic.
//
// Record → stop → the words come back for the composer to place; nothing is
// sent. Everything a microphone can do wrong is handled here so the button
// stays simple: the permission prompt and its refusal, no microphone, a
// recording cut off at the cap, a cancel that throws the audio away, a failed
// transcription that can be retried with the same audio, and the tracks
// released (the browser's red dot goes out) the moment recording stops or
// the composer goes away.
//
// The mic is drawn only where it can work: the browser can record, the
// feature is on (lib/logos4/flags.ts) and the server has a transcription key
// (GET /api/transcribe, asked once per page).
//
// PUSH TO TALK. `press` and `release` are the held mic: press starts, letting
// go stops and transcribes — or, for a tap, a slide off the button, or a hold
// interrupted by the permission prompt, records nothing and leaves a short
// hint (lib/logos4/voice.ts holdOutcome). `start`/`stop` remain for a mic
// pressed without a hand on it (a screen reader's activation): click once to
// start, again to stop.

import { useCallback, useEffect, useRef, useState } from 'react';
import { LOGOS4 } from '@/lib/logos4/flags';
import { MAX_RECORD_SECONDS, holdOutcome, micError, pickRecorderType } from '@/lib/logos4/voice';

export type VoiceState = 'idle' | 'asking' | 'recording' | 'transcribing' | 'error';
/** A line under the composer after a hold that recorded nothing: why, and what to do. */
export type VoiceHint = 'hold' | 'ready' | null;

let serverSays: Promise<boolean> | null = null;
function serverAvailable(): Promise<boolean> {
  serverSays ??= fetch('/api/transcribe', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { available: false }))
    .then((j: { available?: unknown }) => j.available === true)
    .catch(() => false);
  return serverSays;
}

const canRecord = () =>
  typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export function useVoiceInput(onText: (text: string) => void) {
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [capped, setCapped] = useState(false);

  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const lastAudio = useRef<Blob | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelled = useRef(false);
  const startedAt = useRef(0);
  const live = useRef(true);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  /** the hand came off while the browser was still asking for the microphone */
  const releasedEarly = useRef(false);
  const pressedAt = useRef(0);
  const stateRef = useRef<VoiceState>('idle');
  stateRef.current = state;
  const [hint, setHint] = useState<VoiceHint>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showHint = useCallback((h: VoiceHint) => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(h);
    if (h) hintTimer.current = setTimeout(() => live.current && setHint(null), 2600);
  }, []);
  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  useEffect(() => {
    live.current = true;
    if (!LOGOS4.voice || !canRecord()) return;
    void serverAvailable().then((ok) => live.current && setAvailable(ok));
    return () => {
      live.current = false;
    };
  }, []);

  const release = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  // the composer going away mid-recording must not leave the microphone on
  useEffect(
    () => () => {
      cancelled.current = true;
      try {
        if (recorder.current?.state === 'recording') recorder.current.stop();
      } catch {
        /* already stopped */
      }
      release();
    },
    [release]
  );

  const send = useCallback(async (audio: Blob) => {
    setState('transcribing');
    setError(null);
    try {
      const form = new FormData();
      form.append('audio', audio, 'speech');
      const lang = (navigator.language || '').slice(0, 2);
      if (lang) form.append('language', lang);
      const r = await fetch('/api/transcribe', { method: 'POST', body: form });
      const j = (await r.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!live.current) return;
      if (!r.ok || !j.text) {
        setError(j.error || 'That recording couldn’t be transcribed.');
        setState('error');
        return;
      }
      lastAudio.current = null;
      setState('idle');
      onTextRef.current(j.text);
    } catch {
      if (!live.current) return;
      setError('Couldn’t reach Socria to transcribe that. Check the connection and retry.');
      setState('error');
    }
  }, []);

  const stop = useCallback(() => {
    const r = recorder.current;
    if (r && r.state === 'recording') r.stop();
  }, []);

  const start = useCallback(async () => {
    if (state === 'recording' || state === 'asking' || state === 'transcribing') return;
    setError(null);
    setCapped(false);
    setSeconds(0);
    lastAudio.current = null;
    setState('asking');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!live.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      const type = pickRecorderType((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(s, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32_000 });
      recorder.current = rec;
      chunks.current = [];
      cancelled.current = false;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        release();
        if (cancelled.current || !live.current) {
          chunks.current = [];
          if (live.current) setState('idle');
          return;
        }
        const audio = new Blob(chunks.current, { type: rec.mimeType || type || 'audio/webm' });
        chunks.current = [];
        lastAudio.current = audio;
        void send(audio);
      };
      rec.start(1000);
      startedAt.current = Date.now();
      setState('recording');
      // The permission prompt took the hand off the mic: nothing was said
      // into this one. Stop it unrecorded; the next hold works.
      if (releasedEarly.current) {
        releasedEarly.current = false;
        cancelled.current = true;
        rec.stop();
        showHint('ready');
        return;
      }
      timer.current = setInterval(() => {
        const sec = (Date.now() - startedAt.current) / 1000;
        setSeconds(sec);
        if (sec >= MAX_RECORD_SECONDS) {
          setCapped(true);
          stop();
        }
      }, 250);
    } catch (e) {
      release();
      releasedEarly.current = false;
      if (!live.current) return;
      setError(micError(e));
      setState('error');
    }
  }, [state, release, send, stop, showHint]);

  const cancel = useCallback(() => {
    if (recorder.current?.state === 'recording') {
      cancelled.current = true;
      recorder.current.stop();
    } else {
      release();
      setState('idle');
    }
    lastAudio.current = null;
    setError(null);
  }, [release]);

  /** Send the same recording again after a failed transcription. */
  const retry = useCallback(() => {
    if (lastAudio.current) void send(lastAudio.current);
    else void start();
  }, [send, start]);

  const dismiss = useCallback(() => {
    lastAudio.current = null;
    setError(null);
    setState('idle');
  }, []);

  /** The mic pressed and held: start recording. */
  const press = useCallback(() => {
    releasedEarly.current = false;
    pressedAt.current = Date.now();
    showHint(null);
    void start();
  }, [start, showHint]);

  /** The mic let go: transcribe what was said, or — for a tap, a slide off, or a hold the permission prompt interrupted — nothing. */
  const releaseHold = useCallback(
    (opts: { away?: boolean } = {}) => {
      const outcome = holdOutcome({ state: stateRef.current, heldMs: Date.now() - pressedAt.current, away: !!opts.away });
      if (outcome === 'later') releasedEarly.current = true;
      else if (outcome === 'stop') stop();
      else if (outcome === 'cancel') cancel();
      else if (outcome === 'tap') {
        cancel();
        showHint('hold');
      }
    },
    [stop, cancel, showHint]
  );

  return { available, state, error, seconds, capped, start, stop, cancel, retry, dismiss, press, release: releaseHold, hint, canRetryAudio: !!lastAudio.current };
}
