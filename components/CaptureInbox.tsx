'use client';

// Logos 4, Quick Capture: the inbox.
//
// Two taps: open it (the box is already focused), save. A photo is one tap
// more — taken or picked, read once up front like the composer's, kept as
// what was read plus a thumbnail. Each capture can be edited, deleted, or
// taken somewhere: a new line of thinking, a card on the map, or the composer.
// Nothing is turned into anything by itself, and nothing is ever sent.
//
// Signed in, captures live in the account (/api/captures). Signed out — or
// on a deployment whose database has no captures table yet — they stay in
// this browser, and the inbox says which. Captures left on the device are
// moved into the account the next time it can take them.
//
// THE LOOK (the brand book): a page of a notebook, not a stack of cards. The
// box is the one white surface — the composer is the only white in the app —
// and what was kept is set in the serif, because it is something said, under
// a micro-label for its day and time, with hairlines between. Each keeps one
// way forward in moss (Think it through →, the optional action's serif-italic
// link) and the rest as quiet words. Things arrive the way ideas form: fast
// out, a long settle; with reduced motion, not at all.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_CAPTURE_TEXT,
  captureTitle,
  cleanCapture,
  cleanCaptureAttachment,
  newCaptureId,
  orderCaptures,
  readLocalCaptures,
  writeLocalCaptures,
  type Capture,
} from '@/lib/logos4/captures';
import { browserStorage } from '@/lib/logos4/resume';
import { prepareImage, isImageFile } from '@/lib/logos-upload';
import type { Attachment } from '@/lib/logos-attachments';
import './capture-inbox.css';

type Where = 'account' | 'device';

const MOVE_BATCH = 20;

const when = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** The day a capture was kept, as a notebook heads its page: Today, Yesterday, or the date. */
function dayOf(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const t = new Date(now);
  if (d.toDateString() === t.toDateString()) return 'Today';
  const y = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() === t.getFullYear() ? {} : { year: 'numeric' }) });
}

/** The captures under their days, in the order they are listed. */
function byDay(list: Capture[]): { day: string; items: Capture[] }[] {
  const out: { day: string; items: Capture[] }[] = [];
  for (const c of list) {
    const day = dayOf(c.createdAt);
    const last = out[out.length - 1];
    if (last?.day === day) last.items.push(c);
    else out.push({ day, items: [c] });
  }
  return out;
}

const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || '');

async function call(method: string, body?: unknown): Promise<{ status: number; j: any }> {
  const r = await fetch('/api/captures', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}

export function CaptureInbox({
  open,
  onClose,
  signedIn,
  readImage,
  onNewThread,
  onAddToMap,
  onToComposer,
}: {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
  /** the composer's own vision pass: what a photo shows, read once */
  readImage: (dataUrl: string) => Promise<string>;
  onNewThread: (c: Capture) => void;
  /** absent when there is no map to add to (e.g. read-only) */
  onAddToMap?: (c: Capture) => void;
  onToComposer: (c: Capture) => void;
}) {
  const [where, setWhere] = useState<Where>(signedIn ? 'account' : 'device');
  const [list, setList] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<{ status: 'reading' | 'ready' | 'error'; attachment?: Attachment; thumb: string; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const backTo = useRef<HTMLElement | null>(null);

  const keepLocal = useCallback((next: Capture[]) => {
    if (!writeLocalCaptures(browserStorage(), next)) setProblem('This browser’s storage is full or blocked, so that capture couldn’t be kept here.');
  }, []);

  // Open: load where captures live, and move any left on this device into the account.
  const load = useCallback(async () => {
    const local = readLocalCaptures(browserStorage());
    if (!signedIn) {
      setWhere('device');
      setList(local);
      return;
    }
    setLoading(true);
    setProblem(null);
    try {
      const { status, j } = await call('GET');
      if (status === 200 && j.unavailable) {
        setWhere('device');
        setList(local);
        return;
      }
      if (status !== 200) {
        setWhere('device');
        setList(local);
        setProblem(j.error ? `${j.error} Showing captures on this device.` : 'The inbox couldn’t be reached. Showing captures on this device.');
        return;
      }
      setWhere('account');
      let account = orderCaptures(((j.captures ?? []) as unknown[]).map((x) => cleanCapture(x)).filter((c): c is Capture => !!c));
      if (local.length) {
        let moved = 0;
        const left: Capture[] = [];
        for (let i = 0; i < local.length; i += MOVE_BATCH) {
          const batch = local.slice(i, i + MOVE_BATCH);
          const r = await call('POST', { captures: batch }).catch(() => ({ status: 0, j: {} }));
          if (r.status === 200) moved += batch.length;
          else left.push(...batch);
        }
        keepLocal(left);
        if (moved) {
          account = orderCaptures([...local.filter((c) => !left.includes(c)), ...account]);
          setToast(`Moved ${moved} capture${moved === 1 ? '' : 's'} from this device into your account.`);
        }
        if (left.length) setProblem(`${left.length} capture${left.length === 1 ? '' : 's'} stayed on this device and will move next time.`);
      }
      setList(account);
    } catch {
      setWhere('device');
      setList(local);
      setProblem('The inbox couldn’t be reached. Showing captures on this device.');
    } finally {
      setLoading(false);
    }
  }, [signedIn, keepLocal]);

  useEffect(() => {
    if (!open) return;
    backTo.current = document.activeElement as HTMLElement | null;
    setToast(null);
    void load();
    requestAnimationFrame(() => boxRef.current?.focus());
    return () => {
      backTo.current?.focus?.();
    };
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (editing) setEditing(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, editing]);

  async function takePhoto(file: File) {
    if (!isImageFile(file)) return setProblem('That isn’t a photo.');
    setProblem(null);
    try {
      const p = await prepareImage(file);
      setPhoto({ status: 'reading', thumb: p.thumb });
      try {
        const reading = await readImage(p.full);
        setPhoto({ status: 'ready', thumb: p.thumb, attachment: cleanCaptureAttachment({ kind: 'image', name: p.name, thumb: p.thumb, reading }) });
      } catch (e: any) {
        // the picture is kept even if it could not be read; it says so
        setPhoto({ status: 'error', thumb: p.thumb, attachment: cleanCaptureAttachment({ kind: 'image', name: p.name, thumb: p.thumb }), error: e?.message || 'It couldn’t be read, but it can still be kept.' });
      }
    } catch (e: any) {
      setProblem(e?.message || 'That photo couldn’t be added.');
    }
  }

  async function save() {
    const now = Date.now();
    const c = cleanCapture({ id: newCaptureId(), text, attachment: photo?.attachment, createdAt: now, updatedAt: now }, now);
    if (!c || saving || photo?.status === 'reading') return;
    setSaving(true);
    setProblem(null);
    try {
      if (where === 'account') {
        const { status, j } = await call('POST', { captures: [c] }).catch(() => ({ status: 0, j: {} as any }));
        if (status !== 200) {
          if (status === 409) return setProblem(j.error);
          // not lost: kept on the device, moved next time
          keepLocal([c, ...readLocalCaptures(browserStorage())]);
          setProblem('Couldn’t reach your account, so it was kept on this device. It moves to your account next time.');
        }
      } else {
        keepLocal([c, ...list]);
      }
      setList((l) => orderCaptures([c, ...l]));
      setText('');
      setPhoto(null);
      setToast('Kept for later.');
      boxRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Capture) {
    if (!window.confirm(`Delete “${captureTitle(c)}”? This can’t be undone.`)) return;
    const before = list;
    const next = list.filter((x) => x.id !== c.id);
    setList(next);
    if (where === 'device') return keepLocal(next);
    const { status, j } = await call('DELETE', { id: c.id }).catch(() => ({ status: 0, j: {} as any }));
    if (status !== 200) {
      setList(before);
      setProblem(j.error || 'That capture couldn’t be deleted. Try again.');
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const c = list.find((x) => x.id === editing.id);
    if (!c) return setEditing(null);
    const now = Date.now();
    const next = cleanCapture({ ...c, text: editing.text, updatedAt: now }, now);
    if (!next) return setProblem('A capture needs some words or a photo. Delete it instead?');
    if (where === 'account') {
      const { status, j } = await call('PATCH', { id: c.id, text: next.text, attachment: next.attachment ?? null }).catch(() => ({ status: 0, j: {} as any }));
      if (status !== 200) return setProblem(j.error || 'That change couldn’t be saved. Try again.');
    }
    const updated = list.map((x) => (x.id === c.id ? next : x));
    setList(updated);
    if (where === 'device') keepLocal(updated);
    setEditing(null);
  }

  if (!open) return null;
  const canSave = (!!text.trim() || !!photo?.attachment) && !saving && photo?.status !== 'reading';
  const days = byDay(list);
  let n = 0;

  return (
    <div className="qc-veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} className="qc" role="dialog" aria-modal="true" aria-labelledby="lg-cap-title" tabIndex={-1}>
        <header className="qc-head">
          <div className="qc-bar">
            <p className="qc-lbl">
              Quick capture
              {list.length > 0 && <span>{list.length} kept</span>}
            </p>
            <button type="button" className="qc-x" aria-label="Close the inbox" onClick={onClose}>
              ×
            </button>
          </div>
          <h2 id="lg-cap-title" className="qc-title">
            Keep it for <em>later</em>.
          </h2>
          <p className="qc-where">
            {where === 'account' ? 'Private to your account. Nothing here is sent or filed until you choose.' : signedIn ? 'Kept on this device for now — the account inbox isn’t available here yet.' : 'Kept on this device. Sign in to keep captures in your account.'}
          </p>
        </header>

        <div className="qc-box">
          <textarea
            id="lg-cap-text"
            aria-label="A thought, a note, anything for later"
            ref={boxRef}
            value={text}
            maxLength={MAX_CAPTURE_TEXT}
            placeholder="A thought, a note, anything for later…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void save();
              }
            }}
          />
          {photo && (
            <div className="qc-pending">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="qc-thumb" src={photo.thumb} alt="The photo to keep" />
              <span className="qc-pending-t">{photo.status === 'reading' ? 'Reading the photo…' : photo.status === 'error' ? photo.error : 'Photo ready.'}</span>
              <button type="button" className="qc-quiet" onClick={() => setPhoto(null)}>
                Remove
              </button>
            </div>
          )}
          <div className="qc-row">
            <button type="button" className="qc-photo" onClick={() => fileRef.current?.click()} disabled={!!photo}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4.5 8.5h3l1.6-2.5h5.8l1.6 2.5h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />
                <circle cx="12" cy="13.5" r="3.2" />
              </svg>
              Add photo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/heic"
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void takePhoto(f);
                e.target.value = '';
              }}
            />
            <span className="qc-grow" />
            <kbd className="qc-kbd" aria-hidden="true">
              {isMac() ? '⌘' : 'Ctrl'} ↵
            </kbd>
            <button type="button" className="qc-save" onClick={() => void save()} disabled={!canSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {problem && (
          <p className="qc-note" role="alert">
            {problem}
          </p>
        )}
        {toast && !problem && (
          <p className="qc-toast" role="status" key={toast + list.length}>
            {toast}
          </p>
        )}

        <div className="qc-page">
          {loading ? (
            <p className="qc-opening">Opening the inbox…</p>
          ) : list.length === 0 ? (
            <div className="qc-empty">
              <p className="qc-empty-h">Nothing kept yet.</p>
              <p className="qc-empty-b">Whatever you save here waits until you’re ready for it.</p>
              <p className="qc-empty-tip">
                Or start a message with <q>capture:</q> anywhere in Socria — it lands here, and nothing is sent.
              </p>
            </div>
          ) : (
            <ul className="qc-list" aria-label="Captures">
              {days.map((d) => (
                <li key={d.day} className="qc-day">
                  <h3 className="qc-day-h">{d.day}</h3>
                  <ul className="qc-items">
                    {d.items.map((c) => {
                      const isEditing = editing?.id === c.id;
                      const long = c.text.length > 220 || c.text.split('\n').length > 4;
                      const delay = Math.min(n++, 8) * 40;
                      return (
                        <li key={c.id} className="qc-item" style={{ animationDelay: `${delay}ms` }}>
                          <p className="qc-meta">
                            <span>{when(c.createdAt)}</span>
                            {c.attachment?.kind === 'image' && <span>Photo</span>}
                          </p>
                          <div className="qc-item-top">
                            {c.attachment?.kind === 'image' && c.attachment.thumb && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img className="qc-thumb" src={c.attachment.thumb} alt={c.attachment.reading ? `Photo: ${captureTitle(c)}` : 'Captured photo'} />
                            )}
                            {isEditing ? (
                              <textarea
                                className="qc-edit"
                                aria-label="Edit the capture"
                                autoFocus
                                value={editing.text}
                                maxLength={MAX_CAPTURE_TEXT}
                                onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
                              />
                            ) : (
                              <p className={`qc-text${long && expanded !== c.id ? ' is-clamped' : ''}`}>{c.text || captureTitle(c)}</p>
                            )}
                          </div>
                          {long && !isEditing && (
                            <button type="button" className="qc-quiet qc-more" onClick={() => setExpanded(expanded === c.id ? null : c.id)} aria-expanded={expanded === c.id}>
                              {expanded === c.id ? 'Less' : 'More'}
                            </button>
                          )}
                          <div className="qc-acts">
                            {isEditing ? (
                              <>
                                <button type="button" className="qc-save is-small" onClick={() => void saveEdit()}>
                                  Save
                                </button>
                                <button type="button" className="qc-quiet" onClick={() => setEditing(null)}>
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="qc-go" onClick={() => onNewThread(c)} title="Start a new line of thinking with this in the box — nothing is sent">
                                  Think it through <span aria-hidden="true">→</span>
                                </button>
                                <span className="qc-more-acts">
                                  {onAddToMap && (
                                    <button type="button" className="qc-quiet" onClick={() => onAddToMap(c)}>
                                      Add to map
                                    </button>
                                  )}
                                  <button type="button" className="qc-quiet" onClick={() => onToComposer(c)} title="Put it in the message you’re writing — nothing is sent">
                                    Use in message
                                  </button>
                                  <button type="button" className="qc-quiet" onClick={() => setEditing({ id: c.id, text: c.text })}>
                                    Edit
                                  </button>
                                  <button type="button" className="qc-quiet is-danger" onClick={() => void remove(c)}>
                                    Delete
                                  </button>
                                </span>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
