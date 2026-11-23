'use client';
// components/ux-v0/studio/Conversation.tsx — talking it through with a creative director, before the work is made.
//
// A conversation, not a questionnaire: SocriaUX says what it understood and asks a question only when one would change
// the work (lib/ux-v0/studio/director.ts) — at most a few, each written for this brief. Creative questions show their
// answers (./DiscoveryOptions.tsx): palettes to see, lettering set in real faces, moods drawn by the engine; the person
// taps one, answers in their own words, asks for others, skips it, or says "surprise me" — or "make it now" at any
// point. Links to websites they like are read and shown as references (what was read, the page drawn as it is, what to
// take from it); pictures can be dropped in at any point. Once the brief is enough the work is made: there is no
// separate stage of choosing a direction. Everything understood is in the brief drawer, each line with where it came
// from.

import { useEffect, useRef, useState } from 'react';
import type { RefTake, StudioMode, StudioReference, StudioState } from '@/lib/ux-v0/studio/schema';
import { REF_TAKES } from '@/lib/ux-v0/studio/schema';
import { MODES, modeInfo } from '@/lib/ux-v0/studio/modes';
import { questionFor, subjectFor, understand, type DirectorEnv, type Topic } from '@/lib/ux-v0/studio/director';
import { referenceSaid } from '@/lib/ux-v0/studio/references';
import type { SystemRecord } from '@/lib/ux-v0/dsi/registry';
import { SystemPicker, usableSystems } from './SystemPicker';
import { Brief } from './Brief';
import { SitePreview } from './previews';
import { DiscoveryOptions } from './DiscoveryOptions';
import { ArrowUp, Attach, Check, Close, Down, FileMark, ModeGlyph, Panel } from './glyphs';

export interface ConversationProps {
  studio: StudioState;
  env: DirectorEnv;
  nonce: string;
  saveWords?: string;
  systems: readonly SystemRecord[];
  onSystem: (id: string | null) => void;
  onManageSystems: () => void;
  /** the person's message, with any files they attached to it */
  onSend: (text: string, files: File[]) => void;
  /** "Make it now": whatever is open is left to SocriaUX */
  onMake: () => void;
  /** one of the options a creative question offered, tapped */
  onChoose: (optionId: string) => void;
  /** the creative question waiting is being written for this brief (its words and options are not shown yet) */
  thinking?: boolean;
  /** what to take from a reference, or that it is not wanted */
  onReference: (id: string, patch: Partial<Pick<StudioReference, 'take' | 'state'>>) => void;
  /** pages read this visit, drawn as they are (by reference id) */
  previews: Record<string, string>;
  /** sites being read right now */
  reading: string[];
  /** what is happening while the work begins ('' when nothing is) */
  starting: string;
  error: string;
  onExit: () => void;
  onSwitchMode: (mode: StudioMode) => void;
}

const ATTACH = '.png,.jpg,.jpeg,.webp,.gif,.svg,.json,.css,.scss,.pdf,.ttf,.otf,.woff,.woff2,.html,.htm,image/*,application/json,text/css,application/pdf,text/html';
const TAKE_LABEL: Record<RefTake, string> = { colour: 'Colours', type: 'Type', layout: 'Layout', mood: 'Mood' };

function ReferenceCard({ r, preview, onReference }: { r: StudioReference; preview?: string; onReference: ConversationProps['onReference'] }) {
  const rejected = r.state === 'rejected';
  return (
    <figure className={`sd-refcard${rejected ? ' is-rejected' : ''}`} data-ref={r.id}>
      {preview && !rejected ? <SitePreview html={preview} label={`${r.host}, drawn without its scripts`} /> : null}
      <figcaption className="sd-refcard-cap">
        <span className="sd-refcard-t">
          <a href={r.url} target="_blank" rel="noopener noreferrer nofollow">
            {r.host}
          </a>
          {r.title && r.title.toLowerCase() !== r.host ? <span className="sd-refcard-title"> — {r.title}</span> : null}
        </span>
        {r.colours.length > 0 && (
          <span className="sd-refcard-sw" role="img" aria-label={`Its colours: ${r.colours.slice(0, 6).join(', ')}`}>
            {r.colours.slice(0, 6).map((c, i) => (
              <span key={`${c}-${i}`} style={{ background: c }} />
            ))}
          </span>
        )}
        {(r.fonts.length > 0 || r.notes.length > 0) && <span className="sd-refcard-notes">{[r.fonts.length ? `Set in ${r.fonts.slice(0, 2).join(' and ')}` : '', ...r.notes].filter(Boolean).join(' · ')}</span>}
      </figcaption>
      {rejected ? (
        <span className="sd-refcard-acts">
          <span className="sd-refcard-off">Set aside.</span>
          <button type="button" className="sd-textlink is-small" onClick={() => onReference(r.id, { state: 'liked' })}>
            Use it after all
          </button>
        </span>
      ) : (
        <span className="sd-refcard-acts" role="group" aria-label={`What to take from ${r.host}`}>
          <span className="sd-refcard-k">Take</span>
          {REF_TAKES.map((t) => {
            const on = !!r.take?.includes(t);
            return (
              <button key={t} type="button" className={`sd-chip is-tiny${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => onReference(r.id, { take: on ? (r.take ?? []).filter((x) => x !== t) : [...(r.take ?? []), t] })}>
                {TAKE_LABEL[t]}
              </button>
            );
          })}
          <span className="sd-refcard-hint">{r.take?.length ? '' : 'or all of it'}</span>
          <button type="button" className="sd-textlink is-small" onClick={() => onReference(r.id, { state: 'rejected' })}>
            Not this one
          </button>
        </span>
      )}
    </figure>
  );
}

export function Conversation(p: ConversationProps) {
  const { studio: st, env } = p;
  const [words, setWords] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [briefOpen, setBriefOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [over, setOver] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const modeBox = useRef<HTMLDivElement>(null);
  const info = modeInfo(st.mode);
  const pending = st.pending && st.pending !== 'discover' ? (st.pending as Topic) : undefined;
  const question = pending ? questionFor(st, pending, env) : null;
  const creative = st.pending === 'discover' ? st.discovery?.current : undefined;
  // Socria's last turn that moved things on (a site read after a question leaves the question, and its suggestions, open)
  const lastQuestion = [...st.transcript].reverse().find((m) => m.from === 'socria' && (m.kind === 'question' || m.kind === 'offer' || m.stage === 'making'));
  const u = understand(st);
  const sample = subjectFor(st, u).sample;
  // a logo cannot be made without its name, a critique without its design, an import without its source
  const blocked = st.modeBy === 'unsure' || (st.mode === 'logo' && !u.name) || u.required.includes('file') || u.required.includes('source');

  // the newest turn in view, gently (at once for those who asked for less motion)
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const calm = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    box.scrollTo({ top: box.scrollHeight, behavior: calm ? 'auto' : 'smooth' });
  }, [st.transcript.length, p.reading.length, p.starting, p.thinking]);
  useEffect(() => field.current?.focus(), [st.transcript.length]);
  // the reply grows with what is said
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(200, el.scrollHeight)}px`;
  }, [words]);
  useEffect(() => {
    if (!modeOpen && !briefOpen) return;
    const away = (e: PointerEvent) => modeOpen && !modeBox.current?.contains(e.target as Node) && setModeOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (setModeOpen(false), setBriefOpen(false));
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [modeOpen, briefOpen]);

  const send = (text = words) => {
    const t = text.trim();
    if (!t && !files.length) return field.current?.focus();
    p.onSend(t, files);
    setWords('');
    setFiles([]);
  };
  const add = (list: FileList | File[] | null) => {
    const xs = [...(list ?? [])];
    if (xs.length) setFiles((cur) => [...cur, ...xs.filter((f) => !cur.some((c) => c.name === f.name && c.size === f.size))].slice(0, 8));
  };

  const busy = !!p.starting;
  const refs = new Map((st.references ?? []).map((r) => [r.id, r]));

  return (
    <div className="v0 sb sd sd-conv sd-chat">
      <header className="sd-head">
        <div className="sd-head-l">
          <button type="button" className="sd-mark" onClick={p.onExit} aria-label="SocriaUX home">
            <img src="/socria-mark.png" alt="" width={18} height={18} />
            <span className="sd-wordmark">
              Socria<em>UX</em>
            </span>
          </button>
          {st.modeBy !== 'unsure' && (
            <div className="sd-mode" ref={modeBox}>
              <button type="button" className="sd-pill sd-mode-btn" aria-expanded={modeOpen} aria-haspopup="true" onClick={() => setModeOpen((o) => !o)} title="Change what we are making">
                <ModeGlyph mode={st.mode} size={16} />
                <span>{info.label}</span>
                <Down size={13} />
              </button>
              {modeOpen && (
                <div className="sd-pop is-modes" role="group" aria-label="What we are making">
                  <p className="sd-pop-k">What we are making</p>
                  {MODES.map((m) => (
                    <button
                      key={m.mode}
                      type="button"
                      className={`sd-pop-item${m.mode === st.mode ? ' is-on' : ''}`}
                      aria-pressed={m.mode === st.mode}
                      onClick={() => {
                        setModeOpen(false);
                        if (m.mode !== st.mode) p.onSwitchMode(m.mode);
                      }}
                    >
                      <ModeGlyph mode={m.mode} size={18} />
                      <span className="sd-pop-t">{m.label}</span>
                      <span className="sd-pop-h">{m.line}</span>
                      {m.mode === st.mode && <Check size={15} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="sd-head-r">
          {usableSystems(p.systems).length > 0 && st.mode !== 'critique' && st.mode !== 'system' && <SystemPicker systems={p.systems} value={st.systemId ?? null} onChange={p.onSystem} onManage={p.onManageSystems} label={false} align="end" />}
          {p.saveWords && (
            <span className="sd-save" role="status">
              {p.saveWords}
            </span>
          )}
          <button type="button" className="sd-pill is-ghost sd-ctx-toggle" aria-expanded={briefOpen} aria-controls="sd-brief" onClick={() => setBriefOpen((o) => !o)}>
            <Panel size={15} /> Brief
          </button>
          <button type="button" className="sd-icon" onClick={p.onExit} aria-label="Leave the conversation (it is kept)">
            <Close size={17} />
          </button>
        </div>
      </header>

      <div className="sd-chat-body">
        <div className="sd-chat-scroll" ref={scroller}>
          <ol className="sd-transcript sd-chat-col" aria-label="The conversation">
            {st.transcript.map((m) => {
              if (m.from === 'person')
                return (
                  <li key={m.id} className={`sd-msg is-person k-${m.kind}`}>
                    <div className="sd-bubble">
                      <p>{m.text}</p>
                      {m.attachments?.length ? (
                        <p className="sd-bubble-files">
                          {m.attachments
                            .map((id) => st.attachments.find((a) => a.id === id)?.name)
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              const r = m.kind === 'reference' && m.stage ? refs.get(m.stage) : undefined;
              const isLast = m.id === lastQuestion?.id;
              const asking = isLast && m.kind === 'question' && m.stage === 'discover' && !!creative && st.status === 'discovering';
              // the question being written for this brief: its words and options are shown once they are ready
              if (asking && p.thinking)
                return (
                  <li key={m.id} className="sd-msg is-socria k-note">
                    <p className="sd-said is-wait sd-thinking" role="status" aria-live="polite">
                      Thinking about what would change this most…
                    </p>
                  </li>
                );
              return (
                <li key={m.id} className={`sd-msg is-socria k-${m.kind}${asking ? ' is-asking' : ''}`}>
                  <div className="sd-say">
                    <p className="sd-said">{r ? referenceSaid(r) : m.text}</p>
                    {r && <ReferenceCard r={r} preview={p.previews[r.id]} onReference={p.onReference} />}
                    {asking && creative && !busy && <DiscoveryOptions key={creative.id} q={creative} sample={sample} onChoose={p.onChoose} onSend={(w) => p.onSend(w, [])} />}
                    {isLast && m.kind === 'question' && question && question.suggestions.length > 0 && !busy && (
                      <p className="sd-suggest" role="group" aria-label="Some ways to answer">
                        {question.suggestions.map((s) => (
                          <button key={s} type="button" className="sd-suggestion" onClick={() => send(s)}>
                            {s}
                          </button>
                        ))}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
            {p.reading.map((h) => (
              <li key={`reading-${h}`} className="sd-msg is-socria">
                <p className="sd-said is-wait" role="status">
                  Reading {h}…
                </p>
              </li>
            ))}
            {p.starting && (
              <li className="sd-msg is-socria">
                <section className="sd-starting" role="status" aria-live="polite">
                  <span className="sd-starting-bar" aria-hidden="true" />
                  <p className="sd-said">{p.starting}</p>
                </section>
              </li>
            )}
            {p.error && (
              <li className="sd-msg is-socria">
                <p className="sd-error" role="alert">
                  {p.error}
                </p>
              </li>
            )}
          </ol>
        </div>

        <form
          className={`sd-reply sd-chat-composer${over ? ' is-over' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            add(e.dataTransfer.files);
          }}
        >
          <div className="sd-chat-acts">
            {st.status === 'discovering' && !busy && (
              <button type="button" className="sd-pill is-sm is-quiet sd-make" onClick={p.onMake} disabled={blocked} title={blocked ? 'One thing is needed first' : 'Leave whatever is open to SocriaUX, and make it'}>
                Make it now
              </button>
            )}
            {question?.optional && !busy && (
              <button type="button" className="sd-textlink is-small" onClick={() => send('skip')}>
                Skip this
              </button>
            )}
          </div>
          {files.length > 0 && (
            <ul className="sd-attached" aria-label="To send">
              {files.map((f) => (
                <li key={`${f.name}|${f.size}`} className="sd-att">
                  <FileMark size={15} />
                  <span className="sd-att-n">{f.name}</span>
                  <button type="button" className="sd-icon is-small" aria-label={`Remove ${f.name}`} onClick={() => setFiles((xs) => xs.filter((x) => x !== f))}>
                    <Close size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="sd-reply-in">
            <button type="button" className="sd-icon" onClick={() => fileInput.current?.click()} aria-label="Attach files or pictures" title="Attach files or pictures">
              <Attach size={18} />
            </button>
            <label htmlFor="sd-reply" className="v0-sr">
              Reply in your own words
            </label>
            <textarea
              id="sd-reply"
              ref={field}
              rows={1}
              value={words}
              placeholder={creative ? (creative.kind === 'colour' ? 'Choose a palette, or name your colours — hex codes or words' : creative.kind === 'type' ? 'Choose one, or name a typeface or describe the lettering you like' : creative.kind === 'vibe' ? 'Choose a mood, or describe the feel in your own words' : 'Answer in your own words') : question ? 'Answer in your own words — or tell me anything else' : 'Tell me anything else, paste a link to something you like, or say “make it”'}
              onChange={(e) => setWords(e.target.value.slice(0, 1200))}
              onPaste={(e) => {
                const pics = [...e.clipboardData.files];
                if (pics.length) {
                  e.preventDefault();
                  add(pics);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button type="submit" className="sd-send" disabled={(!words.trim() && !files.length) || busy} aria-label="Send">
              <ArrowUp size={17} />
            </button>
            <input ref={fileInput} type="file" hidden multiple accept={ATTACH} onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
          </div>
          <p className="sd-reply-hint">
            {env.hasSystem && env.systemName ? `Made in ${env.systemName}. ` : ''}
            Once it is made, change anything in your own words.
          </p>
        </form>

        {briefOpen && <button type="button" className="sd-scrim" aria-label="Close the brief" onClick={() => setBriefOpen(false)} />}
        <aside id="sd-brief" className={`sd-side${briefOpen ? ' is-open' : ''}`} aria-label="The brief" aria-hidden={!briefOpen}>
          <div className="sd-side-head">
            <button type="button" className="sd-icon sd-side-close" onClick={() => setBriefOpen(false)} aria-label="Close the brief">
              <Close size={16} />
            </button>
          </div>
          <Brief st={st} env={env} />
          {st.mode !== 'critique' && st.mode !== 'system' && usableSystems(p.systems).length > 0 && (
            <div className="sd-side-foot">
              <div className="sd-side-sys">
                <SystemPicker systems={p.systems} value={st.systemId ?? null} onChange={p.onSystem} onManage={p.onManageSystems} />
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
