'use client';

// components/logos5/SocriaVoice.tsx — SOCRIA VOICE (EXPERIMENTAL), ON SCREEN.
//
//   VoiceButton   beside the box: "Voice", marked Experimental. Pressed, Voice
//                 starts — the first time, after the notice below.
//   VoicePanel    while Voice is on, over the box: what it is doing (starting,
//                 listening, hearing — the words as they are said — turning a
//                 turn into text, Socria answering, paused, a problem), the
//                 microphone's level and the pause that will end the turn, a
//                 turn waiting for Socria to finish, a "yes" being waited for,
//                 and what the last turn did. Pause, Resume, Send now, Cancel,
//                 Stop (the answer) and Turn off are all one press — and all
//                 can be said.
//   VoiceSheet    the first-use notice (what Voice does, where the audio goes,
//                 which recogniser), its settings, and what can be said.
//
// The ear (components/logos5/useSocriaVoice.ts) and what a turn does
// (components/LogosApp.tsx onVoiceTurn) are elsewhere; this only shows them.

import { useEffect, useRef } from 'react';
import type { Ear, EarState } from './useSocriaVoice';
import { useEar } from './useSocriaVoice';
import { VOICE_HELP, type Pace, type VoiceEngine, type VoiceSettings, type WhileAnswering } from '@/lib/voice/speech';
import { otherEngine } from '@/lib/voice/recognizer';
import './voice.css';

const ENGINE_NAME: Record<VoiceEngine, string> = {
  browser: 'your browser’s speech recognition',
  socria: 'Socria’s transcription',
};

function Mic({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

/**
 * Voice's own mark: a sound wave, not a microphone. Hold to talk sits beside it
 * with the microphone, and two identical microphones side by side asked which
 * one was which; the wave says "a conversation out loud", the microphone
 * "dictate into the box".
 */
function Wave({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 10v4M8 6.5v11M12 3.5v17M16 6.5v11M20 10v4" />
    </svg>
  );
}

/** "Voice", marked Experimental, beside the box. On while Voice is listening or paused. */
export function VoiceButton({ ear, onPress }: { ear: Ear | null; onPress: () => void }) {
  return <VoiceButtonView phase={useEar(ear, (s) => s.phase)} onPress={onPress} />;
}

/** The button, drawn from where Voice is. */
export function VoiceButtonView({ phase, onPress }: { phase: EarState['phase']; onPress: () => void }) {
  const on = phase !== 'off';
  return (
    <button
      type="button"
      className={`sv-btn${on ? ' is-on' : ''}${phase === 'hearing' ? ' is-hearing' : ''}`}
      onClick={onPress}
      aria-pressed={on}
      aria-label={on ? 'Socria Voice (experimental) is on — turn it off' : 'Socria Voice (experimental) — talk instead of typing'}
      title={on ? 'Socria Voice is on — press to turn it off' : 'Socria Voice — talk instead of typing'}
    >
      <Wave />
      <span className="sv-btn-l">Voice</span>
      <span className="sv-exp" aria-hidden="true">
        <span className="sv-exp-long">Experimental</span>
        <span className="sv-exp-short">Exp.</span>
      </span>
    </button>
  );
}

/** Why Voice went off by itself (five minutes without a word), where the panel was — until dismissed or Voice is on again. */
export function VoiceOffNote({ ear, onOn }: { ear: Ear | null; onOn: () => void }) {
  const note = useEar(ear, (s) => (s.phase === 'off' ? s.note : null));
  if (!ear || !note) return null;
  return (
    <p className="sv-offnote" role="status">
      {note}{' '}
      <button type="button" className="sv-link" onClick={onOn}>
        Turn Voice on
      </button>{' '}
      <button type="button" className="sv-link" onClick={() => ear.dismiss()}>
        Dismiss
      </button>
    </p>
  );
}

export interface VoiceQueued {
  id: string;
  text: string;
}

export interface VoiceConfirming {
  what: string;
  level: 'destructive' | 'sensitive';
  text: string;
}

/** What the last turn did, in a line. */
export interface VoiceOutcome {
  heard: string;
  did: string;
  at: number;
}

/** What the panel's presses do: the ear's own (components/logos5/useSocriaVoice.ts). */
export type VoiceActs = Pick<Ear, 'resume' | 'pause' | 'sendNow' | 'cancelTurn' | 'retry' | 'discardFailed' | 'dismiss'>;

export function VoicePanel({ ear, ...rest }: Omit<VoicePanelProps, 's' | 'act'> & { ear: Ear }) {
  const s = useEar(ear, (x) => x);
  return <VoicePanelView s={s} act={ear} {...rest} />;
}

interface VoicePanelProps {
  /** the ear's state */
  s: EarState;
  act: VoiceActs;
  /** over the Universal Map or Memory: a pill at the screen's foot rather than over the box */
  floating?: boolean;
  /** Socria is answering */
  busy: boolean;
  queued: readonly VoiceQueued[];
  confirming: VoiceConfirming | null;
  outcome: VoiceOutcome | null;
  dictating: boolean;
  /** turns go into the box rather than being sent */
  boxMode: boolean;
  /** where a turn goes, in a few words: "to Socria", "into a new line of thinking" */
  where: string;
  onSettings: () => void;
  onHelp: () => void;
  onConfirm: (yes: boolean) => void;
  onDrop: (id: string) => void;
  onStopAnswer: () => void;
  onOff: () => void;
  onSwitch: (to: VoiceEngine) => void;
}

/** The panel, drawn from the ear's state and what Logos 5 is doing. */
export function VoicePanelView({
  s,
  act,
  floating,
  busy,
  queued,
  confirming,
  outcome,
  dictating,
  boxMode,
  where,
  onSettings,
  onHelp,
  onConfirm,
  onDrop,
  onStopAnswer,
  onOff,
  onSwitch,
}: VoicePanelProps) {
  const live = s.phase === 'listening' || s.phase === 'hearing';
  const words = s.phase === 'hearing' ? [s.heard, s.interim].filter(Boolean).join(' ') : '';
  const other = s.problem?.switchable ? otherEngine(s.engine, s.has) : null;
  const status =
    s.phase === 'starting'
      ? 'Starting the microphone…'
      : s.phase === 'paused'
        ? 'Paused — the microphone is off'
        : s.phase === 'error'
          ? 'Voice stopped listening'
          : s.phase === 'hearing'
            ? s.engine === 'socria'
              ? 'Hearing you…'
              : 'Hearing you'
            : s.pending > 0
              ? 'Turning that into text…'
              : busy
                ? 'Socria is answering — still listening'
                : dictating
                  ? 'Dictating into your writing'
                  : 'Listening';
  // the live region says what changed, not every word as it is heard
  const said = s.phase === 'error' ? (s.problem?.message ?? '') : status;
  return (
    <section className={`sv-panel${floating ? ' is-floating' : ''}${s.phase === 'error' ? ' is-error' : ''}`} aria-label="Socria Voice">
      <div className="sv-row">
        <span className={`sv-dot${live ? ' is-live' : ''}${s.phase === 'hearing' ? ' is-hearing' : ''}`} aria-hidden="true">
          {s.engine === 'socria' && live && <span className="sv-level" style={{ transform: `scale(${1 + s.level * 1.4})` }} />}
        </span>
        <span className="sv-status">
          <span className="sv-status-k">{status}</span>
          <span className="sv-tag">Voice · Experimental</span>
        </span>
        <span className="sv-sr" role="status" aria-live="polite">
          {said}
        </span>
        <span className="sv-tools">
          {busy && (
            <button type="button" className="sv-chip" onClick={onStopAnswer} title="Stop the answer — or say “stop”">
              Stop answer
            </button>
          )}
          {s.phase === 'paused' || s.phase === 'error' ? (
            <button type="button" className="sv-chip is-primary" onClick={() => act.resume()}>
              {s.phase === 'error' ? 'Try again' : 'Resume'}
            </button>
          ) : s.phase !== 'starting' ? (
            <button type="button" className="sv-chip" onClick={() => act.pause()} title="Pause — the microphone goes off. Or say “pause listening”">
              Pause
            </button>
          ) : null}
          <button type="button" className="sv-icon" onClick={onHelp} aria-label="What can I say?" title="What can I say?">
            ?
          </button>
          <button type="button" className="sv-icon" onClick={onSettings} aria-label="Voice settings" title="Voice settings">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" />
            </svg>
          </button>
          <button type="button" className="sv-icon" onClick={onOff} aria-label="Turn Voice off" title="Turn Voice off — or say “stop listening”">
            ×
          </button>
        </span>
      </div>

      {s.phase === 'hearing' && (
        <div className="sv-live">
          <p className="sv-words" aria-hidden="true">
            {words ? (
              <>
                {s.heard && <span>{s.heard} </span>}
                {s.interim && <span className="sv-interim">{s.interim}</span>}
              </>
            ) : (
              <span className="sv-interim">…</span>
            )}
          </p>
          <span className="sv-ending" aria-hidden="true" style={{ ['--sv-end' as string]: String(s.ending) }} />
          <span className="sv-live-tools">
            <button type="button" className="sv-chip is-primary" onClick={() => act.sendNow()}>
              {boxMode ? 'Done' : 'Send now'}
            </button>
            <button type="button" className="sv-chip" onClick={() => act.cancelTurn()}>
              Cancel
            </button>
          </span>
        </div>
      )}

      {s.phase === 'starting' && <p className="sv-note">If your browser asks, allow the microphone.</p>}

      {s.phase === 'listening' && !confirming && !queued.length && !outcome && !s.problem && (
        <p className="sv-note">
          {dictating ? (
            <>What you say is written into your writing. Say “stop dictating” to finish.</>
          ) : boxMode ? (
            <>What you say goes into the box. Say “send” to send it.</>
          ) : (
            <>Say anything — it goes {where} when you pause. Say “what can I say” for the commands.</>
          )}
        </p>
      )}

      {s.phase === 'paused' && s.note && <p className="sv-note">{s.note}</p>}

      {s.problem && (
        <p className={`sv-problem${s.phase === 'error' ? ' is-stop' : ''}`} role={s.phase === 'error' ? 'alert' : undefined}>
          {s.problem.message}{' '}
          {s.failed && (
            <>
              <button type="button" className="sv-link" onClick={() => act.retry()}>
                Retry
              </button>{' '}
              <button type="button" className="sv-link" onClick={() => act.discardFailed()}>
                Discard
              </button>{' '}
            </>
          )}
          {other && (
            <button type="button" className="sv-link" onClick={() => onSwitch(other)}>
              Use {ENGINE_NAME[other]} instead
            </button>
          )}
          {!s.failed && s.phase !== 'error' && (
            <button type="button" className="sv-link" onClick={() => act.dismiss()}>
              Dismiss
            </button>
          )}
        </p>
      )}

      {confirming && (
        <div className={`sv-confirm is-${confirming.level}`} role="alertdialog" aria-label="Confirm">
          <p className="sv-confirm-q">{confirming.what}</p>
          <p className="sv-confirm-heard">Heard: “{confirming.text}”</p>
          <span className="sv-confirm-tools">
            <span className="sv-confirm-say">Say “yes” or “no”</span>
            <button type="button" className="sv-chip is-primary" onClick={() => onConfirm(true)}>
              Yes
            </button>
            <button type="button" className="sv-chip" onClick={() => onConfirm(false)}>
              No
            </button>
          </span>
        </div>
      )}

      {queued.length > 0 && (
        <ul className="sv-queue" aria-label="Waiting to be sent">
          {queued.map((q) => (
            <li key={q.id}>
              <span className="sv-queue-k">Sent when Socria finishes:</span> <span className="sv-queue-t">“{q.text}”</span>{' '}
              <button type="button" className="sv-link" onClick={() => onDrop(q.id)}>
                Drop
              </button>
            </li>
          ))}
        </ul>
      )}

      {outcome && !confirming && s.phase !== 'hearing' && (
        <p className="sv-outcome">
          <span className="sv-outcome-heard">“{outcome.heard}”</span> <span className="sv-outcome-did">{outcome.did}</span>
        </p>
      )}
    </section>
  );
}

export type SheetKind = 'consent' | 'settings' | 'help';

/** The notice before Voice first listens, its settings, and what can be said. */
export function VoiceSheet({
  kind,
  has,
  settings,
  onChange,
  onStart,
  onClose,
}: {
  kind: SheetKind;
  /** what this browser can use (the ear's state) */
  has: EarState['has'];
  settings: VoiceSettings;
  onChange: (next: VoiceSettings) => void;
  /** the notice's own button: Voice starts with the recogniser chosen */
  onStart: (engine: VoiceEngine) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('button, input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, kind]);
  const engine: VoiceEngine | null = settings.engine && has[settings.engine] ? settings.engine : has.browser ? 'browser' : has.socria ? 'socria' : null;
  const set = <K extends keyof VoiceSettings>(k: K, v: VoiceSettings[K]) => onChange({ ...settings, [k]: v });
  const title = kind === 'consent' ? 'Socria Voice' : kind === 'settings' ? 'Voice settings' : 'What you can say';
  return (
    <div className="sv-sheet-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sv-sheet" role="dialog" aria-modal="true" aria-label={title} ref={box}>
        <header className="sv-sheet-head">
          <h2>
            {title} {kind !== 'help' && <span className="sv-exp is-big">Experimental</span>}
          </h2>
          <button type="button" className="sv-icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="sv-sheet-body">
          {kind === 'consent' && (
            <p className="sv-sheet-lead">
              Talk to Socria, and work Logos 5 by voice: anything you can type works spoken, and so do the things you would press — the views, the Logic Map, your writing, the artifacts. Socria
              answers in text, here in the conversation. Nothing is spoken back.
            </p>
          )}

          {kind !== 'help' && (
            <fieldset className="sv-field">
              <legend>How Voice hears you</legend>
              {!has.browser && !has.socria && <p className="sv-note">This browser can’t listen: it has no speech recognition of its own, and Socria’s transcription isn’t available here.</p>}
              {has.browser && (
                <label className={`sv-choice${engine === 'browser' ? ' is-on' : ''}`}>
                  <input type="radio" name="sv-engine" checked={engine === 'browser'} onChange={() => set('engine', 'browser')} />
                  <span>
                    <b>Your browser’s speech recognition</b> — words appear as you say them.
                    <small>Your audio goes to your browser maker’s speech service (Google for Chrome and Edge, Apple for Safari), as with their own dictation.</small>
                  </span>
                </label>
              )}
              {has.socria && (
                <label className={`sv-choice${engine === 'socria' ? ' is-on' : ''}`}>
                  <input type="radio" name="sv-engine" checked={engine === 'socria'} onChange={() => set('engine', 'socria')} />
                  <span>
                    <b>Socria’s transcription</b> — a sentence at a time, after you pause.
                    <small>Each turn is sent, once you pause, to the transcription Socria uses (OpenAI). Nothing is recorded between turns, and nothing is kept.</small>
                  </span>
                </label>
              )}
            </fieldset>
          )}

          {kind !== 'help' && (
            <>
              <fieldset className="sv-field">
                <legend>A turn ends after a pause of</legend>
                <span className="sv-seg" role="radiogroup" aria-label="Pause before a turn ends">
                  {(['quick', 'normal', 'patient'] as Pace[]).map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={settings.pace === p} className={settings.pace === p ? 'is-on' : ''} onClick={() => set('pace', p)}>
                      {p === 'quick' ? 'Short' : p === 'normal' ? 'Medium' : 'Long'}
                    </button>
                  ))}
                </span>
              </fieldset>
              <fieldset className="sv-field">
                <legend>When a turn ends</legend>
                <span className="sv-seg" role="radiogroup" aria-label="When a turn ends">
                  <button type="button" role="radio" aria-checked={settings.autoSend} className={settings.autoSend ? 'is-on' : ''} onClick={() => set('autoSend', true)}>
                    Send it
                  </button>
                  <button type="button" role="radio" aria-checked={!settings.autoSend} className={!settings.autoSend ? 'is-on' : ''} onClick={() => set('autoSend', false)}>
                    Put it in the box
                  </button>
                </span>
              </fieldset>
              <fieldset className="sv-field">
                <legend>Speaking while Socria answers</legend>
                <span className="sv-seg" role="radiogroup" aria-label="Speaking while Socria answers">
                  {(['hold', 'interrupt'] as WhileAnswering[]).map((w) => (
                    <button
                      key={w}
                      type="button"
                      role="radio"
                      aria-checked={settings.whileAnswering === w}
                      className={settings.whileAnswering === w ? 'is-on' : ''}
                      onClick={() => set('whileAnswering', w)}
                    >
                      {w === 'hold' ? 'Wait for the answer' : 'Stop the answer'}
                    </button>
                  ))}
                </span>
              </fieldset>
            </>
          )}

          {kind === 'consent' && (
            <ul className="sv-promises">
              <li>The microphone is on only while Voice listens. Pause turns it off; switching tabs pauses Voice, and five minutes without a word turns it off.</li>
              <li>Anything that removes or deletes, keeps something in your memory, or shares your work waits for your “yes”.</li>
              <li>What you said is marked with a microphone in the conversation, and saved like anything you type.</li>
            </ul>
          )}

          {kind === 'help' && (
            <div className="sv-help">
              {VOICE_HELP.map((g) => (
                <section key={g.group}>
                  <h3>{g.group}</h3>
                  <ul>
                    {g.says.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <footer className="sv-sheet-foot">
          {kind === 'consent' ? (
            <>
              <button type="button" className="sv-chip" onClick={onClose}>
                Not now
              </button>
              <button type="button" className="sv-chip is-primary" disabled={!engine} onClick={() => engine && onStart(engine)}>
                Start Voice
              </button>
            </>
          ) : (
            <button type="button" className="sv-chip is-primary" onClick={onClose}>
              Done
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
