'use client';

// "Import your history" — the user copies a prompt, runs it over their
// history in another AI (ChatGPT, Claude, …), then pastes the resulting
// profile here. Socria injects it as background so it knows them from
// message one.

import { useEffect, useState } from 'react';
import { AI_IMPORT_PROMPT, MAX_IMPORTED_PROFILE_CHARS } from '@/lib/socria-prompt';

export function ImportProfileModal({
  open,
  onClose,
  profile,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  profile: string;
  onSave: (profile: string) => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  // Re-sync the draft each time the modal opens.
  useEffect(() => {
    if (open) {
      setDraft(profile);
      setCopied(false);
      setSaved(false);
    }
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(AI_IMPORT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard API unavailable — leave the prompt selectable below.
    }
  }

  function save() {
    onSave(draft.trim());
    setSaved(true);
    setTimeout(() => onClose(), 700);
  }

  function removeProfile() {
    setDraft('');
    onSave('');
  }

  return (
    <div
      className="core3-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="core3-modal-card import-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="core3-modal-close" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="core3-modal-content">
          <p className="core3-modal-eyebrow">Bring your context with you</p>
          <h2 id="import-modal-title" className="core3-modal-title">
            Import your history from{' '}
            <span className="core3-modal-title-accent">other AIs</span>
          </h2>
          <p className="import-modal-sub">
            Socria can start from what another assistant already knows about
            you — your goals, projects, and how you think.
          </p>

          <div className="import-step">
            <div className="import-step-head">
              <span className="import-step-n">1</span>
              <span>
                Copy this prompt and run it in your other AI (ChatGPT, Claude,
                Gemini…) — ideally in a chat where it can see your history.
              </span>
            </div>
            <div className="import-prompt-box">
              <pre>{AI_IMPORT_PROMPT}</pre>
            </div>
            <button type="button" className="import-btn" onClick={copyPrompt}>
              {copied ? 'Copied ✓' : 'Copy prompt'}
            </button>
          </div>

          <div className="import-step">
            <div className="import-step-head">
              <span className="import-step-n">2</span>
              <span>Paste the profile it produces here.</span>
            </div>
            <textarea
              className="import-textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_IMPORTED_PROFILE_CHARS}
              rows={7}
              placeholder="Paste the generated profile…"
            />
            <div className="import-actions">
              <button
                type="button"
                className="import-btn primary"
                onClick={save}
                disabled={!draft.trim() && !profile}
              >
                {saved ? 'Saved ✓' : 'Save to Socria'}
              </button>
              {profile && (
                <button type="button" className="import-btn danger" onClick={removeProfile}>
                  Remove imported history
                </button>
              )}
            </div>
            <p className="import-fine">
              Stored privately{profile ? ' · currently active' : ''} — Socria
              uses it quietly as background and never recites it. The live
              conversation always wins over the profile.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
