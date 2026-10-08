'use client';
// components/share/MindShare.tsx
//
// "Share" on the Memory page. What Socria remembers about a person is never
// shared — not by link, not by invitation, not to a Project's other members
// (lib/mind/atlas.ts projectGraph). What CAN be shared is a Project: its
// conversations, maps, models and goals, which is the part of a Mind graph
// that is about the work rather than the person. So this sheet says that in
// one line and offers the Projects, each one press from its Share sheet.

import { useEffect, useState } from 'react';
import { ShareDialog } from './ShareDialog';
import './share.css';

export function MindShare({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [projects, setProjects] = useState<{ id: string; name: string }[] | null>(null);
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    setPick(null);
    void (async () => {
      const res = await fetch('/api/projects', { cache: 'no-store' }).catch(() => null);
      const j = res && res.ok ? await res.json().catch(() => null) : null;
      setProjects((j?.projects ?? []).filter((p: { archived?: boolean }) => !p.archived).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
    })();
  }, [open]);
  if (!open) return null;
  if (pick) return <ShareDialog type="project" id={pick.id} title={pick.name} open onClose={() => { setPick(null); onClose(); }} onUpgrade={() => window.location.assign('/one')} />;
  return (
    <div className="sh-scrim" role="dialog" aria-modal="true" aria-label="Share your thinking">
      <div className="sh-back" onClick={onClose} aria-hidden="true" />
      <div className="sh-sheet">
        <header className="sh-head">
          <span className="sh-kicker">Share</span>
          <h2>Your memory stays yours.</h2>
          <button className="sh-x" onClick={onClose} aria-label="Close">×</button>
        </header>
        <p className="sh-privacy" style={{ marginTop: 10, fontSize: 13.5, color: 'var(--ink-70)' }}>
          What Socria remembers about you is never shared. To think with someone, share a Project — everyone in it works on the
          same conversations, maps, models and goals, and sees that Project’s graph. Nothing about you comes with it.
        </p>
        <span className="sh-k">Share a Project</span>
        {projects === null ? (
          <p className="sh-quiet">Reading your Projects…</p>
        ) : projects.length ? (
          <ul className="ms-list">
            {projects.map((p) => (
              <li key={p.id}>
                <button onClick={() => setPick(p)}>
                  <span>{p.name}</span>
                  <i>Share →</i>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sh-quiet">No Projects yet. Make one in the sidebar, and it can be shared from here or from its home.</p>
        )}
        <footer className="sh-foot"><button className="sh-btn" onClick={onClose}>Done</button></footer>
      </div>
    </div>
  );
}
