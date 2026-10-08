'use client';

// The composer takes more than a sentence.
//
// Paste a page of notes and it becomes an attached note rather than swallowing
// the box — you keep room to say what you actually want looked at. Drop or
// paste an image and it's read once, up front, so the reply and the map both
// work from the same material.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MathKeypad } from './MathKeypad';
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
import { mentionAt, type ReplyRef } from '@/lib/chat-thread';
import './logos-thread.css';

export interface Draft extends Attachment {
  id: string;
  status: 'reading' | 'ready' | 'error';
  error?: string;
}

let seq = 0;
const nextId = () => `att_${++seq}_${Date.now().toString(36)}`;

export function AttachmentList({
  items,
  onRemove,
  onOrigin,
}: {
  items: (Attachment & { id?: string; status?: string; error?: string })[];
  onRemove?: (id: string) => void;
  /** correcting whose thinking a note is — only offered while it's a draft */
  onOrigin?: (id: string, origin: AttachmentOrigin) => void;
}) {
  const [openNote, setOpenNote] = useState<string | null>(null);
  if (!items.length) return null;

  return (
    <div className="lg-atts">
      {items.map((a, i) => {
        const id = a.id ?? String(i);
        const isOpen = openNote === id;
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

export function LogosComposer({
  value,
  onChange,
  mathAvailable,
  mathTopic,
  drafts,
  setDrafts,
  onSend,
  busy,
  readImage,
  focusSignal,
  replyTo,
  onCancelReply,
  group,
}: {
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

  const readying = drafts.some((d) => d.status === 'reading');
  const canSend = (!!value.trim() || drafts.some((d) => d.status === 'ready')) && (!busy || !!group) && !readying;
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

  function grow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // Room for a real paragraph, but never so tall it eats the conversation.
    el.style.height = Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.34)) + 'px';
  }

  // Text also arrives without a keystroke — a failed send hands the message
  // back, and the box has to come back with it.
  useLayoutEffect(grow, [value]);

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

  async function takeFiles(files: FileList | File[]) {
    setNotice(null);
    const list = Array.from(files).slice(0, MAX_ATTACHMENTS);
    for (const f of list) {
      if (isImageFile(f)) await addImage(f);
      else if (isTextFile(f)) {
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

        <div className="lg-composer-row">
          <button
            type="button"
            className="lg-attach"
            onClick={() => fileRef.current?.click()}
            disabled={drafts.length >= MAX_ATTACHMENTS}
            aria-label="Attach an image or a text file"
            title="Attach an image or a text file"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.5 3.5 0 1 1 5 5l-8 8a2 2 0 0 1-3-3l7.5-7.5" />
            </svg>
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,text/plain,text/markdown,.txt,.md,.csv,.log,.json"
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
            placeholder={
              replyTo
                ? `Reply to ${replyTo.who}…`
                : group
                  ? 'Message everyone — @socria to ask Socria'
                  : busy
                    ? 'Keep writing — you can send once Socria has replied'
                    : 'What are you working through?'
            }
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

        {dragging && <div className="lg-drop-hint">Drop it here</div>}
      </div>

      {(notice || readying) && (
        <p className="lg-composer-note">
          {readying ? 'Reading the image…' : notice}
        </p>
      )}
    </div>
  );
}
