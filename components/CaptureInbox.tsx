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
import './logos4.css';

type Where = 'account' | 'device';

const MOVE_BATCH = 20;

const when = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

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
      setToast('Captured.');
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

  return (
    <div className="lg-cap-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} className="lg-cap" role="dialog" aria-modal="true" aria-labelledby="lg-cap-title" tabIndex={-1}>
        <div className="lg-cap-head">
          <h2 id="lg-cap-title" className="lg-cap-title">
            Quick Capture
          </h2>
          <button type="button" className="lg-cap-x" aria-label="Close the inbox" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="lg-cap-where">
          {where === 'account' ? 'Private to your account. Nothing here is sent or filed until you choose.' : signedIn ? 'Kept on this device for now — the account inbox isn’t available here yet.' : 'Kept on this device. Sign in to keep captures in your account.'}
        </p>

        <div className="lg-cap-new">
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
            <div className="lg-cap-pending">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="lg-cap-thumb" src={photo.thumb} alt="The photo to keep" />
              <span className="grow">{photo.status === 'reading' ? 'Reading the photo…' : photo.status === 'error' ? photo.error : 'Photo ready.'}</span>
              <button type="button" className="lg-cap-btn" onClick={() => setPhoto(null)}>
                Remove
              </button>
            </div>
          )}
          <div className="lg-cap-row">
            <button type="button" className="lg-cap-btn" onClick={() => fileRef.current?.click()} disabled={!!photo}>
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
            <span className="grow" />
            <button type="button" className="lg-cap-btn is-primary" onClick={() => void save()} disabled={!canSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {problem && (
          <p className="lg-cap-note" role="alert">
            {problem}
          </p>
        )}
        {toast && !problem && (
          <p className="lg-cap-toast" role="status">
            {toast}
          </p>
        )}

        {loading ? (
          <p className="lg-cap-empty">Opening the inbox…</p>
        ) : list.length === 0 ? (
          <p className="lg-cap-empty">Nothing captured yet. Whatever you save here waits until you’re ready for it.</p>
        ) : (
          <ul className="lg-cap-list" aria-label="Captures">
            {list.map((c) => {
              const isEditing = editing?.id === c.id;
              const long = c.text.length > 220 || c.text.split('\n').length > 4;
              return (
                <li key={c.id} className="lg-cap-item">
                  <div className="lg-cap-item-top">
                    {c.attachment?.kind === 'image' && c.attachment.thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="lg-cap-thumb" src={c.attachment.thumb} alt={c.attachment.reading ? `Photo: ${captureTitle(c)}` : 'Captured photo'} />
                    )}
                    <div className="lg-cap-item-body">
                      {isEditing ? (
                        <div className="lg-cap-edit">
                          <textarea
                            aria-label="Edit the capture"
                            autoFocus
                            value={editing.text}
                            maxLength={MAX_CAPTURE_TEXT}
                            onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
                          />
                        </div>
                      ) : (
                        <p className={`lg-cap-item-text${long && expanded !== c.id ? ' is-clamped' : ''}`}>{c.text || captureTitle(c)}</p>
                      )}
                      <div className="lg-cap-item-meta">
                        {when(c.createdAt)}
                        {c.attachment?.kind === 'image' ? ' · photo' : ''}
                        {long && !isEditing && (
                          <>
                            {' · '}
                            <button type="button" className="lg-voice-link" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                              {expanded === c.id ? 'Less' : 'More'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="lg-cap-actions">
                    {isEditing ? (
                      <>
                        <button type="button" className="lg-cap-btn is-primary" onClick={() => void saveEdit()}>
                          Save
                        </button>
                        <button type="button" className="lg-cap-btn" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="lg-cap-btn" onClick={() => onNewThread(c)} title="Start a new line of thinking with this in the box — nothing is sent">
                          Think it through
                        </button>
                        {onAddToMap && (
                          <button type="button" className="lg-cap-btn" onClick={() => onAddToMap(c)}>
                            Add to map
                          </button>
                        )}
                        <button type="button" className="lg-cap-btn" onClick={() => onToComposer(c)} title="Put it in the message you’re writing — nothing is sent">
                          Use in message
                        </button>
                        <button type="button" className="lg-cap-btn" onClick={() => setEditing({ id: c.id, text: c.text })}>
                          Edit
                        </button>
                        <button type="button" className="lg-cap-btn is-danger" onClick={() => void remove(c)}>
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
