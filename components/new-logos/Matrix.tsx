'use client';
// components/new-logos/Matrix.tsx — THE NESTED MATRIX: how work is organised and reached.
//
// A matrix is what one objective contains (or the top level, which contains the objectives and everything placed
// nowhere in particular). An objective's tile is wider than the rest and shows ITS matrix inside it in miniature —
// the decomposition is visible before it is entered; entering it opens that matrix at full size, and the breadcrumbs
// lead back up. Other nodes are tiles told apart by glyph, label and what they hold, not by colour.
//
// Everything is created in place ("New"), moved with "Move to…" or by dragging a tile onto an objective or a
// breadcrumb, renamed where it is shown, and archived rather than deleted. No depth limit.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { NODE_TYPES, TYPE_LABEL, type NodeRow, type NodeType } from '@/lib/new-logos/model';
import { STARTERS, STARTER_LABEL, sanitizeComposition, starterComposition, type Starter } from '@/lib/new-logos/primitives';
import { summarize } from '@/lib/new-logos/compose';
import { childrenOf, indexNodes, isWithin } from '@/lib/new-logos/ops';
import { displayTitle, type Conversation } from '@/lib/new-logos/convo';
import { useNL } from './state';
import { Dialog, Glyph, Menu, nodeHref, nodeTitle, typeLabel, when } from './ui';

const DRAG_NODE = 'application/x-workspace-node';
const DRAG_CONV = 'application/x-workspace-conversation';

/** Where something can be moved: every active objective but itself and what it contains. */
export function ObjectivePicker({
  title,
  exclude,
  current,
  onPick,
  onClose,
}: {
  title: string;
  exclude?: string | null;
  current?: string | null;
  onPick: (parentId: string | null) => void;
  onClose: () => void;
}) {
  const { nodes } = useNL();
  const [q, setQ] = useState('');
  const index = useMemo(() => indexNodes(nodes), [nodes]);
  const rows = useMemo(() => {
    const out: { n: NodeRow; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const n of childrenOf(nodes, parent).filter((x) => x.type === 'objective')) {
        out.push({ n, depth });
        walk(n.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [nodes]);
  const needle = q.trim().toLowerCase();
  return (
    <Dialog title={title} onClose={onClose}>
      <input className="nl-input" placeholder="Find an objective" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find an objective" />
      <div className="nl-pick">
        {!needle ? (
          <button type="button" onClick={() => onPick(null)} disabled={current === null}>
            <Glyph type="home" />
            <span>Top level</span>
          </button>
        ) : null}
        {rows
          .filter(({ n }) => !needle || n.title.toLowerCase().includes(needle))
          .map(({ n, depth }) => {
            const blocked = !!exclude && isWithin(index, n.id, exclude);
            return (
              <button key={n.id} type="button" disabled={blocked || current === n.id} onClick={() => onPick(n.id)} style={{ paddingLeft: 8 + (needle ? 0 : depth * 18) }}>
                <Glyph type="objective" />
                <span>{n.title}</span>
              </button>
            );
          })}
        {!rows.length ? <p className="nl-hint">No objectives yet.</p> : null}
      </div>
    </Dialog>
  );
}

/** Choose one of the person's conversations (the unplaced ones first). */
export function ConversationPicker({ title, onPick, onClose }: { title: string; onPick: (c: Conversation) => void; onClose: () => void }) {
  const { conversations, nodes } = useNL();
  const [q, setQ] = useState('');
  const placed = new Set(nodes.filter((n) => n.type === 'conversation' && n.archived_at === null).map((n) => n.conversation_id));
  const needle = q.trim().toLowerCase();
  const list = [...conversations.values()]
    .filter((c) => !needle || displayTitle(c.title).toLowerCase().includes(needle))
    .sort((a, b) => Number(placed.has(a.id)) - Number(placed.has(b.id)) || b.updatedAt - a.updatedAt)
    .slice(0, 200);
  return (
    <Dialog title={title} onClose={onClose}>
      <input className="nl-input" placeholder="Find a conversation" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a conversation" />
      <div className="nl-pick">
        {list.map((c) => (
          <button key={c.id} type="button" onClick={() => onPick(c)}>
            <Glyph type="conversation" />
            <span>{displayTitle(c.title)}</span>
            <span className="nl-hint" style={{ marginLeft: 'auto', flex: 'none' }}>
              {placed.has(c.id) ? 'placed' : when(c.updatedAt)}
            </span>
          </button>
        ))}
        {!list.length ? <p className="nl-hint">No conversations found.</p> : null}
      </div>
    </Dialog>
  );
}

/** What a tile says under its title, per type. */
function meta(n: NodeRow, kids: NodeRow[], conv: Conversation | undefined): string[] {
  switch (n.type) {
    case 'objective': {
      const counts = NODE_TYPES.map((t) => [t, kids.filter((k) => k.type === t).length] as const).filter(([, c]) => c > 0);
      const parts = counts.map(([t, c]) => `${c} ${(c === 1 ? TYPE_LABEL[t].one : TYPE_LABEL[t].many).toLowerCase()}`);
      return [...(n.state !== 'active' ? [cap(n.state)] : []), ...(parts.length ? parts : ['Empty'])];
    }
    case 'conversation':
      return conv ? [`${conv.messages.length} message${conv.messages.length === 1 ? '' : 's'}`, when(conv.updatedAt)] : ['No longer exists'];
    case 'question':
      return [cap(n.state)];
    case 'knowledge':
      return [origin(n), cap(String(n.content.kind ?? 'finding'))];
    case 'decision':
      return [n.state === 'accepted' ? 'Accepted by you' : cap(n.state), ...(n.provenance.origin === 'ai' ? ['Proposed by the assistant'] : [])];
    case 'artifact':
      return [summarize(sanitizeComposition(n.content)), cap(n.state)];
  }
}

/** An artifact's tile, in words: the first line of its text, or its description. */
function artifactTileText(n: NodeRow): string {
  const c = sanitizeComposition(n.content);
  const text = c.primitives.find((p) => p.type === 'text' && p.data.body.trim());
  const first = text && text.type === 'text' ? text.data.body.split('\n').find((l) => l.trim()) ?? '' : '';
  return first.replace(/\{\{[^}]*\}\}/g, '…').replace(/^#+\s*/, '') || n.description;
}

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, ' ') : s);
export function origin(n: NodeRow): string {
  const p = n.provenance;
  if (p.origin === 'ai') return 'AI-generated';
  if (p.origin === 'external') return p.source?.label ? `Source: ${p.source.label}` : 'External source';
  return 'Yours';
}

function Tile({
  node,
  onMove,
  dragging,
  setDragging,
}: {
  node: NodeRow;
  onMove: (n: NodeRow) => void;
  dragging: string | null;
  setDragging: (id: string | null) => void;
}) {
  const { nodes, conversations, nodeAction, createNode, deleteNode, say } = useNL();
  const [over, setOver] = useState(false);
  const kids = node.type === 'objective' ? childrenOf(nodes, node.id) : [];
  const conv = node.conversation_id ? conversations.get(node.conversation_id) : undefined;
  const title = nodeTitle(node, conversations);
  const objective = node.type === 'objective';
  const accepts = objective
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (dragging === node.id) return;
          e.preventDefault();
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: async (e: React.DragEvent) => {
          e.preventDefault();
          setOver(false);
          const id = e.dataTransfer.getData(DRAG_NODE);
          const convId = e.dataTransfer.getData(DRAG_CONV);
          if (id && id !== node.id) {
            const r = await nodeAction(id, 'move', { parentId: node.id });
            say(r.ok ? `Moved into “${node.title}”.` : r.error ?? null);
          } else if (convId) {
            const r = await createNode({ type: 'conversation', conversationId: convId, parentId: node.id });
            say(r.ok ? `Placed in “${node.title}”.` : r.error ?? null);
          }
        },
      }
    : {};
  const body = node.type === 'artifact' ? artifactTileText(node) : node.type === 'knowledge' ? String(node.content.body ?? '') : node.description;
  return (
    <div
      className={`nl-tile is-${node.type}${over ? ' is-drop' : ''}${dragging === node.id ? ' is-dragging' : ''}${node.type === 'conversation' && !conv ? ' is-unavailable' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_NODE, node.id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(node.id);
      }}
      onDragEnd={() => setDragging(null)}
      {...accepts}
    >
      <Link href={nodeHref(node)} className="nl-tile-link">
        <span className="nl-tile-type">
          <Glyph type={node.type} />
          {typeLabel(node.type)}
        </span>
        <span className="nl-tile-title">{title}</span>
        {objective ? (
          <span className="nl-nest" aria-label={`Inside: ${kids.length} item${kids.length === 1 ? '' : 's'}`}>
            {kids.slice(0, 6).map((k) => (
              <span key={k.id} className={`nl-nest-cell is-${k.type}`}>
                <Glyph type={k.type} size={12} />
                <span>{nodeTitle(k, conversations)}</span>
              </span>
            ))}
            {kids.length > 6 ? <span className="nl-nest-cell">+{kids.length - 6} more</span> : null}
            {!kids.length ? <span className="nl-nest-empty">Nothing inside yet</span> : null}
          </span>
        ) : body ? (
          <span className="nl-tile-body">{body}</span>
        ) : null}
        <span className="nl-tile-meta">
          {meta(node, kids, conv).map((m) => (
            <span key={m}>{m}</span>
          ))}
        </span>
      </Link>
      <div className="nl-tile-menu">
        <Menu label={`Actions for ${title}`}>
          {(close) => (
            <>
              {node.type === 'objective' ? (
                <Link href={`/new-logos/w/${encodeURIComponent(node.id)}`} role="menuitem" className="nl-menu-link" onClick={close}>
                  Open workspace
                </Link>
              ) : null}
              <button type="button" role="menuitem" onClick={() => (close(), onMove(node))}>
                Move to…
              </button>
              {node.type === 'conversation' ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    close();
                    const r = await deleteNode(node.id);
                    say(r.ok ? 'Removed from this matrix. The conversation itself is unchanged.' : r.error ?? null);
                  }}
                >
                  Remove from this matrix
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    close();
                    const r = await nodeAction(node.id, 'archive');
                    say(r.ok ? `Archived “${title}”. It is kept in Archive.` : r.error ?? null);
                  }}
                >
                  Archive
                </button>
              )}
            </>
          )}
        </Menu>
      </div>
    </div>
  );
}

const CREATABLE: NodeType[] = ['objective', 'conversation', 'question', 'knowledge', 'decision', 'artifact'];

function CreateForm({ parentId, onClose }: { parentId: string | null; onClose: () => void }) {
  const { createNode, setup, say } = useNL();
  const router = useRouter();
  const [type, setType] = useState<NodeType>('objective');
  const [starter, setStarter] = useState<Starter>('text');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const organised = setup !== false;
  const submit = async () => {
    if (type === 'conversation') {
      router.push(`/new-logos/c/new${parentId ? `?in=${encodeURIComponent(parentId)}` : ''}`);
      return;
    }
    setBusy(true);
    const r = await createNode({ type, title, parentId, ...(type === 'artifact' ? { content: starterComposition(starter) } : {}) });
    setBusy(false);
    if (!r.ok || !r.node) return say(r.error ?? 'Could not create it.');
    onClose();
    router.push(nodeHref(r.node));
  };
  return (
    <form
      className="nl-create"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="nl-seg" role="group" aria-label="Type">
        {CREATABLE.map((t) => (
          <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} disabled={!organised && t !== 'conversation'}>
            <Glyph type={t} size={14} />
            {typeLabel(t)}
          </button>
        ))}
      </div>
      {type === 'conversation' ? (
        <div className="nl-row">
          <button type="submit" className="nl-btn is-primary">
            Start a conversation
          </button>
          {organised ? (
            <button type="button" className="nl-btn" onClick={() => setPicking(true)}>
              Add an existing conversation
            </button>
          ) : null}
          <button type="button" className="nl-btn is-quiet" onClick={onClose}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="nl-row">
          <input
            className="nl-input nl-grow"
            autoFocus
            placeholder={type === 'objective' ? 'What do you want to accomplish, investigate or understand?' : `${typeLabel(type)} title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label={`${typeLabel(type)} title`}
            style={{ minWidth: 220 }}
          />
          {type === 'artifact' ? (
            <select className="nl-select" style={{ width: 'auto' }} value={starter} onChange={(e) => setStarter(e.target.value as Starter)} aria-label="What the artifact begins with">
              {STARTERS.map((k) => (
                <option key={k} value={k}>
                  Begin with: {STARTER_LABEL[k]}
                </option>
              ))}
            </select>
          ) : null}
          <button type="submit" className="nl-btn is-primary" disabled={busy || !title.trim()}>
            Create
          </button>
          <button type="button" className="nl-btn is-quiet" onClick={onClose}>
            Cancel
          </button>
        </div>
      )}
      {picking ? (
        <ConversationPicker
          title="Add an existing conversation"
          onClose={() => setPicking(false)}
          onPick={async (c) => {
            setPicking(false);
            const r = await createNode({ type: 'conversation', conversationId: c.id, parentId });
            if (r.ok) onClose();
            say(r.ok ? `Added “${displayTitle(c.title)}”.` : r.error ?? null);
          }}
        />
      ) : null}
    </form>
  );
}

/** A matrix: the members of `parentId` (null: the top level), with a place to make more. */
export function Matrix({ parentId, readOnly }: { parentId: string | null; readOnly?: boolean }) {
  const { nodes, nodeAction, say, setup } = useNL();
  const [moving, setMoving] = useState<NodeRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const members = childrenOf(nodes, parentId);
  return (
    <>
      <div className="nl-matrix" style={{ gridAutoFlow: 'row dense' }}>
        {members.map((n) => (
          <Tile key={n.id} node={n} onMove={setMoving} dragging={dragging} setDragging={setDragging} />
        ))}
        {!readOnly && !creating ? (
          <div className="nl-tile nl-new">
            <button type="button" className="nl-new-open" onClick={() => setCreating(true)}>
              <span aria-hidden="true">+</span> New
            </button>
          </div>
        ) : null}
        {!readOnly && creating ? <CreateForm parentId={parentId} onClose={() => setCreating(false)} /> : null}
      </div>
      {!members.length && setup !== false && !creating ? (
        <p className="nl-hint" style={{ marginTop: 12 }}>
          {parentId
            ? 'Break this objective down: add the objectives, questions, conversations, knowledge, decisions and artifacts that belong to it.'
            : 'Start with something you want to accomplish, investigate or understand — or just start a conversation; organising can come later.'}
        </p>
      ) : null}
      {moving ? (
        <ObjectivePicker
          title={`Move “${moving.type === 'conversation' ? 'conversation' : moving.title}” to…`}
          exclude={moving.id}
          current={moving.parent_id}
          onClose={() => setMoving(null)}
          onPick={async (target) => {
            const r = await nodeAction(moving.id, 'move', { parentId: target });
            setMoving(null);
            say(r.ok ? 'Moved.' : r.error ?? null);
          }}
        />
      ) : null}
    </>
  );
}

export { DRAG_CONV, DRAG_NODE };
