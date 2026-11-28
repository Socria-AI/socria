'use client';
// components/new-logos/represent/RepChrome.tsx — what surrounds a representation, and only when it is wanted:
//   • the CHANGE NOTE: after a turn or a change, what changed in a sentence, with Undo and (when the assistant
//     offered one) another way of showing the problem; it fades when the next thing happens;
//   • WORKING: a line above the omnibox while the assistant takes a turn in, with Stop;
//   • HISTORY: every change in order — the assistant's and the person's — each reversible back to before it, and the
//     conversation's words in order (the transcript the other interface shows);
//   • FOCUS: one item alone, large, with everything that bears on it — the third level of disclosure.

import { useEffect, useState, type ReactNode } from 'react';
import { BASIS_WORD, FROM_WORD, KIND_WORD, REL_WORD, STATUS_WORD, isModelKind, itemById, relationsOf, otherEnd, type RelKind, type RepItem, type Representation } from '@/lib/new-logos/representation';
import type { LogLine } from '@/lib/new-logos/representation-service';
import type { StoredMessage } from '@/lib/new-logos/convo';
import { Prose } from '../Prose';
import { when } from '../ui';
import { RepObject, type RepModel } from './RepObject';

export interface Note {
  summary: string;
  /** Undo offered (the engine reverses the latest change) */
  undoable?: boolean;
  alternatives?: { label: string; ask: string }[];
  /** a failure, said plainly, with a way to try again */
  failed?: { retry: () => void } | null;
  /** what the words might have meant, when they could not be resolved: each selectable */
  candidates?: { label: string; ref: string }[];
  /** waiting for a yes */
  confirm?: { yes: () => void; no: () => void } | null;
}

export function ChangeNote({ note, onUndo, onAsk, onHistory, onClose, onPick }: { note: Note; onUndo: () => void; onAsk: (text: string) => void; onHistory: () => void; onClose: () => void; onPick?: (ref: string) => void }) {
  useEffect(() => {
    if (note.failed || note.confirm) return;
    const t = window.setTimeout(onClose, 12_000);
    return () => window.clearTimeout(t);
  }, [note, onClose]);
  return (
    <div className={`nl-rnote nl-cv-ui${note.failed ? ' is-failed' : ''}`} role="status" aria-live="polite">
      <span className="nl-rnote-text">{note.summary}</span>
      {note.failed ? (
        <button type="button" className="nl-btn is-small" onClick={note.failed.retry}>
          Try again
        </button>
      ) : null}
      {note.confirm ? (
        <>
          <button type="button" className="nl-btn is-primary is-small" onClick={note.confirm.yes}>
            Do it
          </button>
          <button type="button" className="nl-btn is-quiet is-small" onClick={note.confirm.no}>
            Cancel
          </button>
        </>
      ) : null}
      {note.candidates?.map((c) => (
        <button key={c.ref} type="button" className="nl-chip" onClick={() => onPick?.(c.ref)}>
          {c.label}
        </button>
      ))}
      {note.undoable ? (
        <button type="button" className="nl-linkish" onClick={onUndo}>
          Undo
        </button>
      ) : null}
      {note.alternatives?.map((a) => (
        <button key={a.label} type="button" className="nl-chip" onClick={() => onAsk(a.ask)} title={a.ask}>
          {a.label}
        </button>
      ))}
      {!note.failed && !note.confirm && note.undoable ? (
        <button type="button" className="nl-linkish" onClick={onHistory}>
          History
        </button>
      ) : null}
      <button type="button" className="nl-icon-btn is-quiet" aria-label="Dismiss" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

export function Working({ text, onStop }: { text: string; onStop?: () => void }) {
  return (
    <div className="nl-rnote is-working nl-cv-ui" role="status" aria-live="polite">
      <span className="nl-rwork" aria-hidden="true" />
      <span className="nl-rnote-text">{text}</span>
      {onStop ? (
        <button type="button" className="nl-linkish" onClick={onStop}>
          Stop
        </button>
      ) : null}
    </div>
  );
}

/** Every change, newest first, each reversible back to before it; then the conversation's words, in order. */
export function RepHistory({ log, messages, onBack, onClose }: { log: LogLine[]; messages: StoredMessage[]; onBack: (entryId: string) => void; onClose: () => void }) {
  const undone = new Set(log.flatMap((l) => l.undoes ?? []));
  return (
    <aside className="nl-ws-drawer nl-cv-ui" aria-label="History">
      <div className="nl-panel-title">
        <span>History</span>
        <button type="button" className="nl-icon-btn" aria-label="Close history" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="nl-cv-scroll nl-rhist">
        {log.length ? (
          <ol className="nl-rhist-log">
            {[...log].reverse().map((l) => (
              <li key={l.id} className={undone.has(l.id) ? 'is-undone' : ''}>
                <div className="nl-rhist-sum">{l.summary}</div>
                <div className="nl-hint">
                  {l.by === 'person' ? 'You' : 'The assistant'} · {when(l.at)}
                  {l.read ? ` · read as ${l.read}` : ''}
                </div>
                <button type="button" className="nl-linkish" onClick={() => onBack(l.id)}>
                  Back to before this
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="nl-hint">No changes yet.</p>
        )}
        <details className="nl-rhist-words">
          <summary>The conversation, in words ({messages.length})</summary>
          <ol>
            {messages.map((m, k) => (
              <li key={m.id ?? k} className={`is-${m.role}`}>
                <div className="nl-hint">{m.role === 'user' ? 'You' : 'Recorded'}{m.at ? ` · ${when(m.at)}` : ''}</div>
                {m.role === 'user' ? <p>{m.content}</p> : <Prose text={m.content} />}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </aside>
  );
}

function Related({ rep, it, onSelect }: { rep: Representation; it: RepItem; onSelect: (id: string) => void }) {
  const rels = relationsOf(rep, it.id);
  if (!rels.length) return null;
  return (
    <ul className="nl-rfocus-rels">
      {rels.map((r) => {
        const o = itemById(rep, otherEnd(r, it.id));
        if (!o) return null;
        const out = r.from === it.id;
        return (
          <li key={r.id} className={`is-${r.status}`}>
            <span className="nl-hint">{out ? `It ${r.label || REL_WORD[r.kind]}` : `${KIND_WORD[o.kind]} that ${r.label || REL_WORD[r.kind]} it`}</span>
            <button type="button" className="nl-linkish" onClick={() => onSelect(o.id)}>
              {o.text || KIND_WORD[o.kind]}
            </button>
            <span className="nl-hint">{r.status === 'established' ? 'established' : 'not established'}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** One item, alone and large, with everything that bears on it. */
export function RepFocus({ it, rep, model, run, onClose, onSelect, onSource, sourceName, children }: { it: RepItem; rep: Representation; model: RepModel; run: Parameters<typeof RepObject>[0]['run']; onClose: () => void; onSelect: (id: string) => void; onSource: (sourceId: string, passage?: string) => void; sourceName: (id: string) => string | null; children?: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  const standing =
    it.kind === 'hypothesis' ? `Possibility · ${STATUS_WORD[it.status]}` : it.kind === 'statement' || it.kind === 'metric' ? BASIS_WORD[it.basis] : it.kind === 'observation' ? FROM_WORD[it.from] : KIND_WORD[it.kind];
  return (
    <div className="nl-rfocus nl-cv-ui" role="dialog" aria-label={`Focus: ${it.text || KIND_WORD[it.kind]}`}>
      <div className="nl-rfocus-card">
        <div className="nl-ri-head">
          <span className="nl-ri-kind">{standing}</span>
          <span className="nl-grow" />
          <button type="button" className="nl-btn is-quiet is-small" onClick={onClose}>
            Close
          </button>
        </div>
        <div className={`nl-rfocus-item${isModelKind(it.kind) ? ' is-model' : ''}`}>
          <RepObject item={it} model={model} fresh={null} selected run={run} onSource={onSource} sourceName={sourceName} />
        </div>
        {it.detail ? <p className="nl-rfocus-detail">{it.detail}</p> : null}
        {it.kind === 'hypothesis' && it.because ? <p className="nl-hint">Because {it.because}</p> : null}
        <Related rep={rep} it={it} onSelect={onSelect} />
        {it.was?.length ? (
          <div className="nl-rfocus-was">
            <h3 className="nl-ri-h">Earlier</h3>
            <ul>
              {[...it.was].reverse().map((w, k) => (
                <li key={k}>{w.text}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** What a connection drawn between two items means, and whether it is established or only possible. */
export function RepConnectChooser({ screen, onPick, onClose }: { screen: { x: number; y: number }; onPick: (kind: RelKind, status: 'established' | 'unverified') => void; onClose: () => void }) {
  const [established, setEstablished] = useState(false);
  const left = typeof window === 'undefined' ? screen.x : Math.max(12, Math.min(screen.x, window.innerWidth - 252));
  const top = typeof window === 'undefined' ? screen.y : Math.max(60, Math.min(screen.y, window.innerHeight - 420));
  const KINDS: RelKind[] = ['supports', 'contradicts', 'explains', 'causes', 'leads_to', 'answers', 'depends_on', 'part_of', 'relates'];
  return (
    <div className="nl-creator nl-cv-ui" style={{ left, top, width: 240 }} role="dialog" aria-label="What does this connection mean?">
      <div className="nl-label">The first…</div>
      <div className="nl-pick">
        {KINDS.map((k) => (
          <button key={k} type="button" onClick={() => onPick(k, established ? 'established' : 'unverified')}>
            <span>{REL_WORD[k]}</span>
          </button>
        ))}
      </div>
      <label className="nl-row nl-hint">
        <input type="checkbox" checked={established} onChange={(e) => setEstablished(e.target.checked)} />
        <span>Established, not only possible</span>
      </label>
      <button type="button" className="nl-btn is-quiet is-small" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
