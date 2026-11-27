'use client';
// components/new-logos/Home.tsx — the top level: the matrix of objectives and whatever was placed at the top, and
// beside it the conversations not placed in any objective — reachable without organising anything first.

import Link from 'next/link';
import { unplaced, displayTitle } from '@/lib/new-logos/convo';
import { useNL } from './state';
import { Matrix, DRAG_CONV } from './Matrix';
import { Glyph, when } from './ui';

export function Home() {
  const { loaded, nodes, conversations, conversationsLoaded, setup } = useNL();
  const loose = unplaced([...conversations.values()], nodes).sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <main className="nl-page">
      <div className="nl-head">
        <h1 className="nl-title">Home</h1>
        <p className="nl-sub">What you are working on, broken down into the objectives, questions, conversations and other work that serve it.</p>
      </div>
      {loaded ? <Matrix parentId={null} readOnly={setup === false} /> : <p className="nl-hint">Loading…</p>}

      <h2 className="nl-h2">Conversations not in an objective</h2>
      {!conversationsLoaded ? (
        <p className="nl-hint">Loading…</p>
      ) : (
        <>
          <div className="nl-matrix">
            <Link href="/new-logos/c/new" className="nl-tile nl-new" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--nl-muted)' }}>
              <span>+ New conversation</span>
            </Link>
            {loose.slice(0, 11).map((c) => (
              <Link
                key={c.id}
                href={`/new-logos/c/${encodeURIComponent(c.id)}`}
                className="nl-tile"
                draggable={setup !== false}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_CONV, c.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <span className="nl-tile-link">
                  <span className="nl-tile-type">
                    <Glyph type="conversation" />
                    Conversation
                  </span>
                  <span className="nl-tile-title">{displayTitle(c.title)}</span>
                  <span className="nl-tile-meta">
                    <span>
                      {c.messages.length} message{c.messages.length === 1 ? '' : 's'}
                    </span>
                    <span>{when(c.updatedAt)}</span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
          <p className="nl-hint" style={{ marginTop: 12 }}>
            {loose.length > 11 ? `${loose.length - 11} more. ` : ''}
            <Link href="/new-logos/conversations" style={{ textDecoration: 'underline' }}>
              All conversations
            </Link>
            {setup !== false ? ' · Drag a conversation onto an objective to place it there.' : ''}
          </p>
        </>
      )}
    </main>
  );
}
