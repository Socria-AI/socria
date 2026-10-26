'use client';

// The composer takes more than a sentence.
//
// Paste a page of notes and it becomes an attached note rather than swallowing
// the box — you keep room to say what you actually want looked at. Drop or
// paste an image and it's read once, up front, so the reply and the map both
// work from the same material.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { L5Menu } from './logos5/L5Chrome';
import { MathKeypad } from './MathKeypad';
import { DocPreview } from './DocPreview';
import type { MathTopic } from '@/lib/math-context';
import type { Attachment, AttachmentOrigin } from '@/lib/logos-attachments';
import {
  NOTE_THRESHOLD,
  MAX_ATTACHMENTS,
  MAX_NOTE_CHARS,
  ORIGINS,
  ORIGIN_LABEL,
  guessOrigin,
  wordCount,
} from '@/lib/logos-attachments';
import { isImageFile, isTextFile, prepareImage, readTextFile } from '@/lib/logos-upload';
import { DOCUMENT_EXTENSIONS, IMAGE_EXTENSIONS, TEXT_EXTENSIONS, kindOfFile, refusalFor } from '@/lib/file-kinds';

/** What the attach button offers: pictures, documents (a zip is opened in Core) and anything that is text. */
const DOC_ACCEPT = [...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS.filter((e) => e !== 'zip'), ...TEXT_EXTENSIONS].map((e) => `.${e}`).join(',');
import { mentionAt, type ReplyRef } from '@/lib/chat-thread';
import { TeX } from './TeX';
import { useVoiceInput } from './useVoiceInput';
import { MAX_RECORD_SECONDS, SLIDE_CANCEL_PX, clock, insertSpoken } from '@/lib/logos4/voice';
import './logos-thread.css';
import './logos4.css';

export interface Draft extends Attachment {
  id: string;
  status: 'reading' | 'ready' | 'error';
  error?: string;
}

let seq = 0;
const nextId = () => `att_${++seq}_${Date.now().toString(36)}`;

const FORMAT_NAME: Record<string, string> = { pdf: 'PDF', docx: 'Word', pptx: 'slides', xlsx: 'spreadsheet', odt: 'document', odp: 'slides', ods: 'spreadsheet', rtf: 'RTF', md: 'Markdown', txt: 'text', csv: 'CSV', tsv: 'TSV', html: 'web page', tex: 'LaTeX', ipynb: 'notebook', image: 'image', code: 'code' };
const UNIT: Record<string, [string, string]> = { pptx: ['slide', 'slides'], odp: ['slide', 'slides'], xlsx: ['sheet', 'sheets'], ods: ['sheet', 'sheets'] };

export function AttachmentList({
  items,
  onRemove,
  onOrigin,
  onOpenDoc,
}: {
  items: (Attachment & { id?: string; status?: string; error?: string })[];
  onRemove?: (id: string) => void;
  /** correcting whose thinking a note is — only offered while it's a draft */
  onOrigin?: (id: string, origin: AttachmentOrigin) => void;
  /** open a document's reading beside the map */
  onOpenDoc?: (docId: string) => void;
}) {
  const [openNote, setOpenNote] = useState<string | null>(null);
  /** the document being looked at under its chip */
  const [preview, setPreview] = useState<string | null>(null);
  if (!items.length) return null;

  return (
    <div className="lg-atts">
      {items.map((a, i) => {
        const id = a.id ?? String(i);
        const isOpen = openNote === id;
        if (a.kind === 'doc') {
          const unit = UNIT[a.format ?? ''] ?? ['page', 'pages'];
          const canOpen = !!onOpenDoc && !!a.doc && a.status !== 'reading';
          const canPreview = !!a.doc && a.status !== 'reading' && a.status !== 'error';
          const previewing = canPreview && preview === id;
          return (
            <div key={id} className="lg-att lg-att-doc">
              <span className="lg-att-glyph" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M4 2.5h5.5L12.5 5.5V13a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z" />
                  <path d="M9.5 2.5V5a.5.5 0 0 0 .5.5h2.5M5.5 8h5M5.5 10.5h3" strokeLinecap="round" />
                </svg>
              </span>
              <span className="lg-att-meta">
                {canOpen ? (
                  <button type="button" className="lg-att-name lg-att-open" onClick={() => onOpenDoc!(a.doc!)} title="Open the reading beside the map">
                    {a.name || 'Document'}
                  </button>
                ) : (
                  <span className="lg-att-name">{a.name || 'Document'}</span>
                )}
                <span className="lg-att-sub">
                  {a.status === 'reading'
                    ? 'reading…'
                    : a.status === 'error'
                      ? (a.error ?? 'could not be read')
                      : [a.pages ? `${a.pages} ${a.pages === 1 ? unit[0] : unit[1]}` : '', a.format ? FORMAT_NAME[a.format] ?? a.format : ''].filter(Boolean).join(' · ') || 'read'}
                  {a.status !== 'reading' && a.status !== 'error' && a.checks && (
                    <span className="lg-att-warn" title={a.checks}>
                      {' '}· check the reading
                    </span>
                  )}
                  {!onOrigin && a.origin && a.origin !== 'source' && <span className="lg-att-origin-tag">{ORIGIN_LABEL[a.origin]}</span>}
                </span>
              </span>
              {canPreview && (
                <button type="button" className="lg-att-pv" aria-expanded={previewing} onClick={() => setPreview(previewing ? null : id)}>
                  {previewing ? 'Hide' : 'Preview'}
                </button>
              )}
              {onRemove && a.id && (
                <button type="button" className="lg-att-x" onClick={() => onRemove(a.id!)} aria-label={`Remove ${a.name || 'attachment'}`}>
                  ×
                </button>
              )}
              {onOrigin && a.id && a.status === 'ready' && (
                <div className="lg-att-origin" role="radiogroup" aria-label="Whose writing is this?">
                  {ORIGINS.map((o) => (
                    <button key={o} type="button" role="radio" aria-checked={(a.origin ?? 'source') === o} className={(a.origin ?? 'source') === o ? 'is-on' : undefined} onClick={() => onOrigin(a.id!, o)}>
                      {ORIGIN_LABEL[o]}
                    </button>
                  ))}
                </div>
              )}
              {previewing && <DocPreview docId={a.doc!} name={a.name || 'Document'} format={a.format} pages={a.pages} {...(canOpen ? { onOpen: () => onOpenDoc!(a.doc!) } : {})} />}
            </div>
          );
        }
        return (
          <div key={id} className={`lg-att lg-att-${a.kind}`}>
            {a.kind === 'image' ? (
              <>
                {a.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="lg-att-thumb" src={a.thumb} alt={a.name || 'Attached image'} />
                ) : (
                  <span className="lg-att-thumb is-blank" aria-hidden="true" />
                )}
                <span className="lg-att-meta">
                  <span className="lg-att-name">{a.name || 'Image'}</span>
                  <span className="lg-att-sub">
                    {a.status === 'reading'
                      ? 'reading…'
                      : a.status === 'error'
                        ? (a.error ?? 'could not be read')
                        : a.reading
                          ? 'read'
                          : 'attached'}
                  </span>
                </span>
              </>
            ) : (
              <>
                <span className="lg-att-glyph" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <path d="M4 2.5h5.5L12.5 5.5V13a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z" />
                    <path d="M9.5 2.5V5a.5.5 0 0 0 .5.5h2.5M5.5 8h5M5.5 10.5h5" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="lg-att-meta">
                  <span className="lg-att-name">{a.name || 'Pasted note'}</span>
                  <span className="lg-att-sub">
                    {(a.words ?? wordCount(a.text ?? '')).toLocaleString()} words
                    {!onOrigin && a.origin && a.origin !== 'mine' && (
                      <span className="lg-att-origin-tag">{ORIGIN_LABEL[a.origin]}</span>
                    )}
                    {a.text ? (
                      <button
                        type="button"
                        className="lg-att-peek"
                        onClick={() => setOpenNote(isOpen ? null : id)}
                      >
                        {isOpen ? 'hide' : 'view'}
                      </button>
                    ) : null}
                  </span>
                </span>
              </>
            )}

            {onRemove && a.id && (
              <button
                type="button"
                className="lg-att-x"
                onClick={() => onRemove(a.id!)}
                aria-label={`Remove ${a.name || 'attachment'}`}
              >
                ×
              </button>
            )}

            {/* Whose words these are. Guessed, shown quietly, always
                correctable — the map treats the three very differently. */}
            {onOrigin && a.id && a.kind === 'note' && (
              <div className="lg-att-origin" role="radiogroup" aria-label="Whose thinking is this?">
                {ORIGINS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={(a.origin ?? 'mine') === o}
                    className={(a.origin ?? 'mine') === o ? 'is-on' : undefined}
                    onClick={() => onOrigin(a.id!, o)}
                  >
                    {ORIGIN_LABEL[o]}
                  </button>
                ))}
              </div>
            )}

            {isOpen && a.text && <pre className="lg-att-full">{a.text}</pre>}
          </div>
        );
      })}
    </div>
  );
}

/** Insert at the caret and put the caret where the snippet says. */
function insertAtCaret(
  ta: HTMLTextAreaElement | null,
  value: string,
  text: string,
  caret: number,
  onChange: (v: string) => void
) {
  const start = ta?.selectionStart ?? value.length;
  const end = ta?.selectionEnd ?? value.length;
  const next = value.slice(0, start) + text + value.slice(end);
  onChange(next);
  // The caret lands inside the structure that was just inserted — √(here) —
  // which is what makes a nested expression a sequence of presses rather than
  // an exercise in counting brackets. After the state round-trip, hence rAF.
  requestAnimationFrame(() => {
    if (!ta) return;
    const at = start + caret;
    ta.focus();
    ta.setSelectionRange(at, at);
  });
}

type Voice = ReturnType<typeof useVoiceInput>;
/** What the hand on the mic is doing: holding it, and whether it has slid off to cancel. */
type Hold = { holding: boolean; away: boolean };

/**
 * THE MIC, HELD: press and talk, let go and the words land in the box to edit
 * (lib/logos4/voice.ts holdOutcome decides what letting go does). A mouse, a
 * finger or a pen holds it through pointer capture, so letting go anywhere
 * counts; sliding a long way off before letting go cancels. Space or Enter,
 * held on the focused mic, does the same from a keyboard. A press with no hand
 * behind it — a screen reader activating the button — toggles instead: once to
 * start, again to stop.
 */
function HoldMic({ mic, onHold }: { mic: Voice; onHold: (h: Hold) => void }) {
  const holding = useRef(false);
  /** this press was a hold already handled — the click the browser sends after it is not a toggle */
  const handled = useRef(false);
  const from = useRef<{ x: number; y: number } | null>(null);
  const away = useRef(false);
  const live = mic.state === 'recording' || mic.state === 'asking';
  const begin = () => {
    holding.current = true;
    handled.current = true;
    away.current = false;
    onHold({ holding: true, away: false });
    mic.press();
  };
  const end = (cancel = false) => {
    if (!holding.current) return;
    holding.current = false;
    mic.release({ away: cancel || away.current });
    away.current = false;
    from.current = null;
    onHold({ holding: false, away: false });
  };
  return (
    <button
      type="button"
      className={`lg-mic is-hold${live ? ' is-on' : ''}`}
      onPointerDown={(e) => {
        if ((e.pointerType === 'mouse' && e.button !== 0) || mic.state === 'transcribing') return;
        // no focus moves and no text is selected: the caret stays where the words will go
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* a pointer the browser will not capture still ends with pointerup here */
        }
        from.current = { x: e.clientX, y: e.clientY };
        begin();
      }}
      onPointerMove={(e) => {
        if (!holding.current || !from.current) return;
        const off = Math.hypot(e.clientX - from.current.x, e.clientY - from.current.y) > SLIDE_CANCEL_PX;
        if (off !== away.current) {
          away.current = off;
          onHold({ holding: true, away: off });
        }
      }}
      onPointerUp={() => end()}
      onPointerCancel={() => end(true)}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !holding.current && mic.state !== 'transcribing') {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          end();
        }
      }}
      onBlur={() => end()}
      onClick={() => {
        if (holding.current || handled.current) {
          handled.current = false;
          return;
        }
        if (mic.state === 'recording') mic.stop();
        else if (mic.state === 'idle' || mic.state === 'error') void mic.start();
      }}
      onContextMenu={(e) => e.preventDefault()}
      disabled={mic.state === 'transcribing'}
      aria-pressed={live}
      aria-label={live ? 'Recording — let go to add it' : 'Hold to talk'}
      title={live ? 'Let go to add it — slide away to cancel' : 'Hold to talk — the words land here for you to edit'}
    >
      {live ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      )}
    </button>
  );
}

export function LogosComposer({
  value,
  onChange,
  mathAvailable,
  mathTopic,
  drafts,
  setDrafts,
  onSend,
  busy,
  waiting,
  readImage,
  readDocument,
  onOpenDoc,
  focusSignal,
  replyTo,
  onCancelReply,
  group,
  about,
  onClearAbout,
  voice,
  layout = 'inline',
  onStop,
  footer,
  sendable,
  onCapture,
  idlePlaceholder,
  voiceButton,
  voiceLive,
}: {
  /**
   * Reads a file — a PDF, Word, a spreadsheet, slides, Markdown, CSV… — into
   * a document attachment (lib/docs/client.ts). Without it, the composer
   * takes images and plain text only, as it always did.
   */
  readDocument?: (file: File) => Promise<Attachment>;
  /** open a document's reading beside the map */
  onOpenDoc?: (docId: string) => void;
  value: string;
  onChange: (v: string) => void;
  /** text put into the box from elsewhere — a figure's template, a suggestion — brings the caret here, at `caret` or the end */
  focusSignal?: { n: number; caret?: number } | null;
  /** show the maths control at all — decided by context, not by a setting */
  mathAvailable?: boolean;
  mathTopic?: MathTopic;
  drafts: Draft[];
  setDrafts: (fn: (prev: Draft[]) => Draft[]) => void;
  onSend: () => void;
  busy: boolean;
  /** hands an image to the vision pass; returns what Logos read in it */
  readImage: (dataUrl: string) => Promise<string>;
  /** the message this one will answer — Reply on a message puts it here */
  replyTo?: ReplyRef | null;
  onCancelReply?: () => void;
  /**
   * Logos 4, Point & Ask: what is selected in the workspace — the thing this
   * message will be about. Shown on the box so it is never a surprise, and
   * cleared with one press.
   */
  about?: { kind: string; label: string; of?: string } | null;
  onClearAbout?: () => void;
  /**
   * Logos 4, Voice to Text: offer the mic. It is still drawn only where the
   * browser can record and the server can transcribe (useVoiceInput).
   */
  voice?: boolean;
  /**
   * Logos 5: the box stacked — the words on top, one row of tools under them
   * (attach and capture behind "+", the host's own controls, the mic, maths,
   * and send — which becomes Stop while an answer is arriving).
   */
  layout?: 'inline' | 'stacked';
  /** stop the answer that is arriving (shown in place of send while busy) */
  onStop?: () => void;
  /**
   * The turn has gone and nothing of the answer has arrived yet: the send
   * button turns into a spinner and takes nothing more until the words begin
   * (Alex Tran, Logos 5 Comments v2 — no second submission mid-flight).
   */
  waiting?: boolean;
  /** the host's controls in the tool row — the model and depth */
  footer?: ReactNode;
  /** something is ready to send with no words typed (Logos 5: an artifact chosen, made from the conversation so far) */
  sendable?: boolean;
  /** Quick Capture, offered under "+" beside attaching */
  onCapture?: () => void;
  /** what the empty box says when nothing else applies */
  idlePlaceholder?: string;
  /** Socria Voice's button (components/logos5/SocriaVoice.tsx), beside the box's other tools */
  voiceButton?: ReactNode;
  /** Socria Voice is listening: the hold-to-talk mic steps aside, so one microphone is in use at a time */
  voiceLive?: boolean;
  /**
   * Others are here: a message goes to everyone, and Socria answers when it
   * is mentioned (@socria) or replied to. Talking to the others never waits
   * on Socria, so sending stays open while it answers someone.
   */
  group?: boolean;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [keypad, setKeypad] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!mathAvailable) setKeypad(false);
  }, [mathAvailable]);
  const dragDepth = useRef(0);

  // Spoken words land where the caret was, as if typed there; never sent.
  const mic = useVoiceInput((words) => {
    const el = taRef.current;
    const at = insertSpoken(value, words, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length);
    onChange(at.text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at.caret, at.caret);
      grow();
    });
  });
  const micOn = !!voice && mic.available && !voiceLive;
  // Voice starting takes the microphone: a hold in progress is let go of, unrecorded
  const micCancel = mic.cancel;
  useEffect(() => {
    if (voiceLive) micCancel();
  }, [voiceLive, micCancel]);
  const listening = mic.state === 'recording' || mic.state === 'asking';
  // a hand on the mic: the bar says "let go", or "let go to cancel" once it has slid off
  const [hold, setHold] = useState<Hold>({ holding: false, away: false });

  const readying = drafts.some((d) => d.status === 'reading');
  const canSend = (!!value.trim() || drafts.some((d) => d.status === 'ready') || !!sendable) && (!busy || !!group) && !readying;
  // "@so…" being typed in a group: offer to finish it as @socria
  const [caret, setCaret] = useState(0);
  const [mentionOff, setMentionOff] = useState(-1);
  const mentionStart = group ? mentionAt(value, caret) : -1;
  const offering = mentionStart >= 0 && mentionStart !== mentionOff;
  function takeMention() {
    const el = taRef.current;
    if (mentionStart < 0) return;
    const next = `${value.slice(0, mentionStart)}@socria ${value.slice(caret).replace(/^\s+/, '')}`;
    const at = mentionStart + 8;
    onChange(next);
    setCaret(at);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at, at);
    });
  }

  const grownAt = useRef(0);
  function grow() {
    const el = taRef.current;
    if (!el) return;
    // Not laid out yet — hidden, or not in the page: measured now it would be
    // sized to nothing and come back a line tall, the rest of the words cut
    // off above it. It is measured the moment it has a width (below).
    if (!el.clientWidth) {
      el.style.height = '';
      el.style.overflowY = '';
      return;
    }
    grownAt.current = el.clientWidth;
    el.style.height = 'auto';
    // Room for a real paragraph, but never so tall it eats the conversation:
    // 240px, then it scrolls inside (Alex Tran, Logos 5 Comments v2).
    const cap = 240;
    el.style.height = Math.min(el.scrollHeight, cap) + 'px';
    // A scrollbar only when there is more than the box shows (an empty box
    // showed one, its italic placeholder a little taller than a line) — and
    // never words cut off with no way to scroll up to them.
    el.style.overflowY = el.scrollHeight > el.clientHeight + 1 ? 'auto' : 'hidden';
  }

  /** what the empty box says — the same words in both layouts */
  const shownPlaceholder = replyTo
    ? `Reply to ${replyTo.who}…`
    : about
      ? `Ask about “${about.label.length > 40 ? `${about.label.slice(0, 39)}…` : about.label}”…`
      : group
        ? 'Message everyone — @socria to ask Socria'
        : busy
          ? 'Keep writing — you can send once Socria has replied'
          : layout === 'stacked'
            ? idlePlaceholder ?? 'What are you working through?'
            : 'What are you working through?';
  // Text also arrives without a keystroke — a failed send hands the message
  // back, a panel puts a question in to be finished — and the box has to come
  // back with it. An empty box is as tall as what it says: the longer words it
  // says while Socria replies wrap on a phone, and the box must come back to
  // one line when they go.
  useLayoutEffect(grow, [value, shownPlaceholder]);
  // So does a new width: shown after being hidden, the box floated or docked,
  // the window resized. The words wrap again, so it is measured again.
  useEffect(() => {
    const el = taRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth && el.clientWidth !== grownAt.current) grow();
    });
    ro.observe(el);
    // and the font arriving after the words did wraps them again too
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    fonts?.addEventListener?.('loadingdone', grow);
    return () => {
      ro.disconnect();
      fonts?.removeEventListener?.('loadingdone', grow);
    };
    // grow reads only the ref and the window; the box is re-observed if its layout changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // Something offered a sentence to finish — a row operation's shape, a scene to build — and the box is where
  // it is finished and sent: the caret goes to the gap it left, or to the end.
  useEffect(() => {
    const el = taRef.current;
    if (!focusSignal || !el) return;
    el.focus();
    const at = Math.min(focusSignal.caret ?? el.value.length, el.value.length);
    el.setSelectionRange(at, at);
  }, [focusSignal]);

  useEffect(() => {
    const onResize = () => grow();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function addDraft(d: Draft) {
    setDrafts((prev) => (prev.length >= MAX_ATTACHMENTS ? prev : [...prev, d]));
  }

  function addNote(text: string, name?: string) {
    const clipped = text.slice(0, MAX_NOTE_CHARS);
    if (text.length > MAX_NOTE_CHARS) {
      setNotice(`That was trimmed to the first ${MAX_NOTE_CHARS.toLocaleString()} characters.`);
    }
    addDraft({
      id: nextId(),
      kind: 'note',
      name,
      origin: guessOrigin(clipped),
      text: clipped,
      words: wordCount(clipped),
      status: 'ready',
    });
  }

  async function addImage(file: File) {
    const id = nextId();
    try {
      const prepared = await prepareImage(file);
      addDraft({
        id,
        kind: 'image',
        name: prepared.name,
        thumb: prepared.thumb,
        status: 'reading',
      });
      try {
        const reading = await readImage(prepared.full);
        setDrafts((prev) =>
          prev.map((d) => (d.id === id ? { ...d, reading, status: 'ready' } : d))
        );
      } catch (e: any) {
        setDrafts((prev) =>
          prev.map((d) =>
            d.id === id
              ? { ...d, status: 'error', error: e?.message || 'could not be read' }
              : d
          )
        );
      }
    } catch (e: any) {
      setNotice(e?.message || 'That file could not be added.');
    }
  }

  async function addDocument(file: File) {
    const id = nextId();
    addDraft({ id, kind: 'doc', name: file.name, status: 'reading' });
    try {
      const att = await readDocument!(file);
      setDrafts((prev) => prev.map((d) => (d.id === id ? { ...att, id, status: 'ready' } : d)));
    } catch (e: any) {
      setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, status: 'error', error: e?.message || 'could not be read' } : d)));
    }
  }

  async function takeFiles(files: FileList | File[]) {
    setNotice(null);
    const list = Array.from(files).slice(0, MAX_ATTACHMENTS);
    for (const f of list) {
      if (isImageFile(f)) await addImage(f);
      else if (readDocument) {
        const kind = kindOfFile(f.name, f.type);
        if (kind === 'secret' || (kind === 'unsupported' && !isTextFile(f)) || /\.zip$/i.test(f.name)) setNotice(/\.zip$/i.test(f.name) ? 'Attach the files inside the zip one by one.' : refusalFor(f.name));
        else await addDocument(f);
      } else if (isTextFile(f)) {
        try {
          const { text, name } = await readTextFile(f);
          if (text.trim()) addNote(text, name);
        } catch (e: any) {
          setNotice(e?.message || 'That file could not be read.');
        }
      } else {
        setNotice('Images and plain text files only.');
      }
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imgs = items
      .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter(Boolean) as File[];

    if (imgs.length) {
      e.preventDefault();
      void takeFiles(imgs);
      return;
    }

    // A long paste becomes a note so the box stays a place to think, not a
    // wall of someone else's text.
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (text.length > NOTE_THRESHOLD) {
      e.preventDefault();
      addNote(text);
      setNotice('Added as a note — say what you want looked at.');
    }
  }

  return (
    <div className="lg-composer" data-tour="composer">
      <div
        className={`lg-composer-box${dragging ? ' is-dropping' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (e.dataTransfer?.files?.length) void takeFiles(e.dataTransfer.files);
        }}
      >
        {replyTo && (
          <div className="lg-reply-chip" role="status">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10a6 6 0 0 1 6 6v4" />
            </svg>
            <span className="lg-reply-text">
              <span className="lg-reply-k">Replying to {replyTo.who}</span>
              <span className="lg-reply-x">{replyTo.excerpt}</span>
            </span>
            {onCancelReply && (
              <button type="button" className="lg-reply-cancel" aria-label={`Stop replying to ${replyTo.who}`} title="Stop replying (Esc)" onClick={onCancelReply}>
                ×
              </button>
            )}
          </div>
        )}

        {about && (
          <div className="lg-reply-chip lg-about-chip" role="status" aria-live="polite">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
            </svg>
            <span className="lg-reply-text">
              <span className="lg-reply-k">Asking about</span>
              <span className="lg-reply-x">
                {about.kind === 'expression' ? <TeX tex={about.label} /> : about.label}
                {about.of ? <span className="lg-about-of"> · {about.of}</span> : null}
              </span>
            </span>
            {onClearAbout && (
              <button type="button" className="lg-reply-cancel" aria-label={`Stop asking about ${about.label}`} title="Clear the selection" onClick={onClearAbout}>
                ×
              </button>
            )}
          </div>
        )}

        {offering && (
          <button
            type="button"
            className="lg-mention-offer"
            onMouseDown={(e) => e.preventDefault()}
            onClick={takeMention}
          >
            <span className="lg-mention">@socria</span>
            <span>ask Socria — Tab to finish</span>
          </button>
        )}

        <AttachmentList
          items={drafts}
          onRemove={(id) => setDrafts((prev) => prev.filter((d) => d.id !== id))}
          onOrigin={(id, origin) =>
            setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, origin } : d)))
          }
          onOpenDoc={onOpenDoc}
        />

        {keypad && mathAvailable && (
          <MathKeypad
            topic={mathTopic ?? 'general'}
            onClose={() => setKeypad(false)}
            onInsert={(text, caret) =>
              insertAtCaret(taRef.current, value, text, caret, (v) => {
                onChange(v);
                grow();
              })
            }
          />
        )}

        {micOn && (listening || mic.state === 'transcribing') && (
          <div className={`lg-voice${hold.holding && hold.away ? ' is-away' : ''}`} role="status" aria-live="polite">
            <span className={`lg-voice-dot${mic.state === 'recording' ? ' is-live' : ''}`} aria-hidden="true" />
            <span className="lg-voice-k">
              {mic.state === 'asking'
                ? 'Waiting for the microphone…'
                : mic.state === 'transcribing'
                  ? 'Turning that into text…'
                  : hold.holding && hold.away
                    ? 'Let go to cancel'
                    : `Listening ${clock(mic.seconds)}`}
              {mic.state === 'recording' && !(hold.holding && hold.away) && <span className="lg-voice-cap"> / {clock(MAX_RECORD_SECONDS)}</span>}
            </span>
            {hold.holding && mic.state === 'recording' && !hold.away && <span className="lg-voice-how">Let go to add it · slide away to cancel</span>}
            {mic.state !== 'transcribing' && !hold.holding && (
              <>
                <button type="button" className="lg-voice-btn" onClick={mic.cancel}>
                  Cancel
                </button>
                {mic.state === 'recording' && (
                  <button type="button" className="lg-voice-btn is-done" onClick={mic.stop}>
                    Done
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {layout === 'stacked' ? (
          <>
            <div className="l5-crow">
            {/* the paperclip, inside the pill, to the left of the words */}
            <button
              type="button"
              className="lg-attach l5-clip"
              onClick={() => fileRef.current?.click()}
              disabled={drafts.length >= MAX_ATTACHMENTS}
              aria-label={readDocument ? 'Attach a document or an image' : 'Attach an image or a text file'}
              title={readDocument ? 'Attach a document or an image' : 'Attach an image or a text file'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.5 3.5 0 1 1 5 5l-8 8a2 2 0 0 1-3-3l7.5-7.5" />
              </svg>
            </button>
            <textarea
              ref={taRef}
              value={value}
              rows={1}
              // NEVER disabled. A disabled textarea drops focus and refuses the
              // caret, so while Socria replied the person could not type — the
              // "I have to fold the conversation away to type" report. Only
              // sending waits for the reply (canSend); writing never does.
              placeholder={shownPlaceholder}
              aria-busy={busy || undefined}
              onChange={(e) => {
                onChange(e.target.value);
                setCaret(e.target.selectionStart ?? e.target.value.length);
                grow();
              }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (offering && (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey))) {
                  e.preventDefault();
                  takeMention();
                  return;
                }
                if (e.key === 'Escape') {
                  if (offering) {
                    e.preventDefault();
                    setMentionOff(mentionStart);
                    return;
                  }
                  if (replyTo && onCancelReply) {
                    e.preventDefault();
                    onCancelReply();
                    return;
                  }
                }
                // Enter sends, Shift+Enter is a new line — and Enter that ends a
                // word being composed (Japanese, Chinese, an accent) is not a send
                if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as KeyboardEvent).isComposing) {
                  e.preventDefault();
                  if (canSend && !waiting) {
                    onSend();
                    if (taRef.current) taRef.current.style.height = 'auto';
                  }
                }
              }}
            />
            </div>
            <div className="l5-ctools">
            {onCapture ? (
              <L5Menu
                label="Add"
                className="lg-plus"
                align="start"
                up
                button={
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                }
                items={[{ label: 'Quick capture', hint: 'Keep a thought for later', onSelect: onCapture }]}
              />
            ) : null}
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={readDocument ? DOC_ACCEPT : 'image/png,image/jpeg,image/webp,image/gif,text/plain,text/markdown,.txt,.md,.csv,.log,.json'}
              className="lg-file"
              onChange={(e) => {
                if (e.target.files?.length) void takeFiles(e.target.files);
                e.target.value = '';
              }}
            />
              {footer && <span className="l5-ctools-mid">{footer}</span>}
              <span className="l5-ctools-end">
              {voiceButton}
              {micOn && <HoldMic mic={mic} onHold={setHold} />}
              {/* Appears only when mathematics is in play, and stays put once it
                  has — see lib/math-context.ts for why that hysteresis matters. */}
              {mathAvailable && (
                <button
                  type="button"
                  className={`lg-mathbtn${keypad ? ' is-on' : ''}`}
                  onClick={() => setKeypad((k) => !k)}
                  aria-pressed={keypad}
                  aria-label={keypad ? 'Hide mathematical symbols' : 'Mathematical symbols'}
                  title={keypad ? 'Hide symbols' : 'Mathematical symbols'}
                >
                  ∑
                </button>
              )}
              {waiting && !group ? (
                <button type="button" className="lg-send is-waiting" disabled aria-label="Sent — waiting for the first words" title="Sent — waiting for the first words">
                  <span className="lg-send-spin" aria-hidden="true" />
                </button>
              ) : onStop && busy && !group ? (
                <button type="button" className="lg-send is-stop" onClick={onStop} aria-label="Stop the answer" title="Stop">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="7" y="7" width="10" height="10" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  className="lg-send"
                  onClick={() => {
                    if (!canSend) return;
                    onSend();
                    if (taRef.current) taRef.current.style.height = 'auto';
                  }}
                  disabled={!canSend}
                  aria-label="Send"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              )}
              </span>
            </div>
          </>
        ) : (
          <div className="lg-composer-row">
            <button
              type="button"
              className="lg-attach"
              onClick={() => fileRef.current?.click()}
              disabled={drafts.length >= MAX_ATTACHMENTS}
              aria-label={readDocument ? 'Attach a document or an image' : 'Attach an image or a text file'}
              title={readDocument ? 'Attach a document or an image' : 'Attach an image or a text file'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.5 3.5 0 1 1 5 5l-8 8a2 2 0 0 1-3-3l7.5-7.5" />
              </svg>
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={readDocument ? DOC_ACCEPT : 'image/png,image/jpeg,image/webp,image/gif,text/plain,text/markdown,.txt,.md,.csv,.log,.json'}
              className="lg-file"
              onChange={(e) => {
                if (e.target.files?.length) void takeFiles(e.target.files);
                e.target.value = '';
              }}
            />

            <textarea
              ref={taRef}
              value={value}
              rows={1}
              // NEVER disabled. A disabled textarea drops focus and refuses the
              // caret, so while Socria replied the person could not type — the
              // "I have to fold the conversation away to type" report. Only
              // sending waits for the reply (canSend); writing never does.
              placeholder={shownPlaceholder}
              aria-busy={busy || undefined}
              onChange={(e) => {
                onChange(e.target.value);
                setCaret(e.target.selectionStart ?? e.target.value.length);
                grow();
              }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (offering && (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey))) {
                  e.preventDefault();
                  takeMention();
                  return;
                }
                if (e.key === 'Escape') {
                  if (offering) {
                    e.preventDefault();
                    setMentionOff(mentionStart);
                    return;
                  }
                  if (replyTo && onCancelReply) {
                    e.preventDefault();
                    onCancelReply();
                    return;
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) {
                    onSend();
                    if (taRef.current) taRef.current.style.height = 'auto';
                  }
                }
              }}
            />

            {micOn && <HoldMic mic={mic} onHold={setHold} />}

            {/* Appears only when mathematics is in play, and stays put once it
                has — see lib/math-context.ts for why that hysteresis matters. */}
            {mathAvailable && (
              <button
                type="button"
                className={`lg-mathbtn${keypad ? ' is-on' : ''}`}
                onClick={() => setKeypad((k) => !k)}
                aria-pressed={keypad}
                aria-label={keypad ? 'Hide mathematical symbols' : 'Mathematical symbols'}
                title={keypad ? 'Hide symbols' : 'Mathematical symbols'}
              >
                ∑
              </button>
            )}

            <button
              type="button"
              className="lg-send"
              onClick={() => {
                if (!canSend) return;
                onSend();
                if (taRef.current) taRef.current.style.height = 'auto';
              }}
              disabled={!canSend}
              aria-label="Send"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        )}

        {dragging && <div className="lg-drop-hint">Drop it here</div>}
      </div>

      {micOn && mic.state === 'error' && mic.error && (
        <p className="lg-composer-note lg-voice-err" role="alert">
          {mic.error}{' '}
          <button type="button" className="lg-voice-link" onClick={mic.retry}>
            {mic.canRetryAudio ? 'Retry' : 'Try again'}
          </button>{' '}
          <button type="button" className="lg-voice-link" onClick={mic.dismiss}>
            Dismiss
          </button>
        </p>
      )}
      {mic.capped && mic.state === 'transcribing' && <p className="lg-composer-note">Stopped at two minutes — transcribing what was said.</p>}
      {micOn && mic.hint && mic.state === 'idle' && (
        <p className="lg-composer-note lg-voice-hint" role="status">
          {mic.hint === 'ready' ? 'The microphone is on. Hold the mic while you talk.' : 'Hold the mic while you talk — let go and the words appear here.'}
        </p>
      )}

      {(notice || readying) && (
        <p className="lg-composer-note">
          {readying ? (drafts.some((d) => d.status === 'reading' && d.kind === 'doc') ? 'Reading the document…' : 'Reading the image…') : notice}
        </p>
      )}
    </div>
  );
}
