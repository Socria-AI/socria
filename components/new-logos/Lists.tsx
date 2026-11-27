'use client';
// components/new-logos/Lists.tsx — two views over everything: every conversation (placed or not, newest first, with
// where each one sits), and the archive (what was taken away, kept, and restorable).

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ancestorsOf, indexNodes } from '@/lib/new-logos/ops';
import { displayTitle, placementOf } from '@/lib/new-logos/convo';
import { useNL } from './state';
import { ConversationPicker, ObjectivePicker } from './Matrix';
import { ConfirmDialog, Crumbs, Glyph, nodeHref, nodeTitle, typeLabel, when } from './ui';

export function AllConversations() {
  const { conversations, conversationsLoaded, nodes, createNode, nodeAction, setup, say } = useNL();
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'loose'>('all');
  const [placing, setPlacing] = useState<string | null>(null);
  const index = useMemo(() => indexNodes(nodes), [nodes]);
  const needle = q.trim().toLowerCase();
  const rows = [...conversations.values()]
    .map((c) => {
      const p = placementOf(nodes, c.id);
      const live = p && p.archived_at === null ? p : undefined;
      const path = live ? ancestorsOf(index, live.id).map((a) => a.title) : [];
      return { c, live, path };
    })
    .filter((r) => (only === 'loose' ? !r.live : true))
    .filter((r) => !needle || displayTitle(r.c.title).toLowerCase().includes(needle))
    .sort((a, b) => b.c.updatedAt - a.c.updatedAt);
  return (
    <main className="nl-page is-narrow">
      <Crumbs nodes={nodes} at={null} current="Conversations" />
      <div className="nl-head">
        <h1 className="nl-title">Conversations</h1>
        <p className="nl-sub">Every conversation on this account — the same ones, with the same messages, wherever you open them.</p>
        <div className="nl-row">
          <input className="nl-input nl-grow" placeholder="Find a conversation" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a conversation" style={{ minWidth: 200 }} />
          <div className="nl-seg" role="group" aria-label="Show">
            <button type="button" aria-pressed={only === 'all'} onClick={() => setOnly('all')}>
              All
            </button>
            <button type="button" aria-pressed={only === 'loose'} onClick={() => setOnly('loose')}>
              Not in an objective
            </button>
          </div>
          <Link href="/new-logos/c/new" className="nl-btn is-primary">
            New conversation
          </Link>
        </div>
      </div>
      {!conversationsLoaded ? (
        <p className="nl-hint">Loading…</p>
      ) : rows.length ? (
        <div className="nl-list">
          {rows.map(({ c, live, path }) => (
            <div key={c.id} className="nl-list-row">
              <Glyph type="conversation" />
              <Link href={`/new-logos/c/${encodeURIComponent(c.id)}`} className="nl-list-main">
                <span className="nl-list-title">{displayTitle(c.title)}</span>
                <span className="nl-list-meta">
                  {c.messages.length} message{c.messages.length === 1 ? '' : 's'} · {when(c.updatedAt)} · {live ? (path.length ? path.join(' / ') : 'Top level') : 'Not in an objective'}
                </span>
              </Link>
              {setup !== false ? (
                <button type="button" className="nl-btn is-small" onClick={() => setPlacing(c.id)}>
                  {live ? 'Move…' : 'Place…'}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="nl-empty">No conversations{needle ? ' match' : ' yet'}.</div>
      )}
      {placing ? (
        <ObjectivePicker
          title="Place this conversation in…"
          current={(() => {
            const p = placementOf(nodes, placing);
            return p && p.archived_at === null ? p.parent_id : undefined;
          })()}
          onClose={() => setPlacing(null)}
          onPick={async (parentId) => {
            const p = placementOf(nodes, placing);
            const r = p && p.archived_at === null ? await nodeAction(p.id, 'move', { parentId }) : await createNode({ type: 'conversation', conversationId: placing, parentId });
            setPlacing(null);
            say(r.ok ? 'Placed.' : r.error ?? null);
          }}
        />
      ) : null}
    </main>
  );
}

export function Archive() {
  const { nodes, conversations, nodeAction, deleteNode, setup, say } = useNL();
  const [confirming, setConfirming] = useState<string | null>(null);
  const archived = nodes.filter((n) => n.archived_at !== null).sort((a, b) => (b.archived_at ?? 0) - (a.archived_at ?? 0));
  const contains = (id: string) => nodes.filter((n) => n.parent_id === id).length;
  return (
    <main className="nl-page is-narrow">
      <Crumbs nodes={nodes} at={null} current="Archive" />
      <div className="nl-head">
        <h1 className="nl-title">Archive</h1>
        <p className="nl-sub">Archived work is kept, with everything inside it, until you restore it. Deleting for good is only possible once something is archived and empty.</p>
      </div>
      {setup === false ? null : archived.length ? (
        <div className="nl-list">
          {archived.map((n) => {
            const kids = contains(n.id);
            return (
              <div key={n.id} className="nl-list-row">
                <Glyph type={n.type} />
                <Link href={nodeHref(n)} className="nl-list-main">
                  <span className="nl-list-title">{nodeTitle(n, conversations)}</span>
                  <span className="nl-list-meta">
                    {typeLabel(n.type)} · archived {when(n.archived_at ?? 0)}
                    {kids ? ` · contains ${kids}` : ''}
                  </span>
                </Link>
                <button
                  type="button"
                  className="nl-btn is-small"
                  onClick={async () => {
                    const r = await nodeAction(n.id, 'restore');
                    say(r.ok ? (r.node?.parent_id === null && n.parent_id ? 'Restored at the top level (what contained it is archived or gone).' : 'Restored.') : r.error ?? null);
                  }}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="nl-btn is-small is-danger"
                  disabled={kids > 0}
                  title={kids ? 'Move or delete what it contains first' : undefined}
                  onClick={() => setConfirming(n.id)}
                >
                  Delete…
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="nl-empty">Nothing is archived.</div>
      )}
      {confirming ? (
        <ConfirmDialog
          title="Delete for good?"
          body={`“${nodeTitle(nodes.find((x) => x.id === confirming) ?? archived[0], conversations)}” will be deleted permanently, with its history and relations. This cannot be undone.`}
          action="Delete it"
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            const r = await deleteNode(confirming);
            say(r.ok ? 'Deleted.' : r.error ?? null);
          }}
        />
      ) : null}
    </main>
  );
}

export { ConversationPicker };
