'use client';
// components/new-logos/NodeView.tsx — one node, opened. An objective opens as its own matrix (with its outcome and
// description above it); a question, a piece of knowledge, a decision or an artifact opens in its editor. Beside each:
// what it is related to, where it came from, and its history.
//
// Edits save as they are made (on leaving a field, or a moment after typing stops in a long text), against the node's
// version, so a change made elsewhere is never silently overwritten.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ARTIFACT_SUBTYPES,
  KNOWLEDGE_KINDS,
  RELATION_KINDS,
  RELATION_LABEL,
  STATES,
  type NodeRow,
  type Origin,
  type RelationKind,
} from '@/lib/new-logos/model';
import { ancestorsOf, indexNodes } from '@/lib/new-logos/ops';
import { useNL } from './state';
import { Matrix, ObjectivePicker, cap, origin } from './Matrix';
import { Prose } from './Prose';
import { ConfirmDialog, Crumbs, Dialog, Glyph, InlineText, Menu, nodeHref, nodeTitle, typeLabel, when } from './ui';

type Json = Record<string, unknown>;

/** Save through the latest action (the version moves with every save). */
function useSaver(node: NodeRow) {
  const { nodeAction, say } = useNL();
  const ref = useRef(nodeAction);
  ref.current = nodeAction;
  return async (fields: Json) => {
    const r = await ref.current(node.id, 'update', fields);
    if (!r.ok) say(r.error ?? 'Not saved.');
    return r.ok;
  };
}

function TextArea({ value, onSave, label, placeholder, rows = 3, mono, debounce }: { value: string; onSave: (v: string) => void; label: string; placeholder?: string; rows?: number; mono?: boolean; debounce?: number }) {
  const [v, setV] = useState(value);
  const dirty = useRef(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!dirty.current) setV(value);
  }, [value]);
  const flush = (text: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    dirty.current = false;
    if (text !== value) onSave(text);
  };
  return (
    <label className="nl-field">
      <span className="nl-label">{label}</span>
      <textarea
        className={`nl-textarea${mono ? ' nl-doc' : ''}`}
        rows={rows}
        value={v}
        placeholder={placeholder}
        onChange={(e) => {
          setV(e.target.value);
          dirty.current = true;
          if (debounce) {
            if (timer.current) window.clearTimeout(timer.current);
            const text = e.target.value;
            timer.current = window.setTimeout(() => flush(text), debounce);
          }
        }}
        onBlur={() => dirty.current && flush(v)}
      />
    </label>
  );
}

const lines = (v: unknown) => (Array.isArray(v) ? (v as string[]).join('\n') : '');
const toList = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

// ── side panels ──────────────────────────────────────────────────────

function LinkDialog({ node, onClose }: { node: NodeRow; onClose: () => void }) {
  const { nodes, conversations, link, say } = useNL();
  const [kind, setKind] = useState<RelationKind>('related_to');
  const [outgoing, setOutgoing] = useState(true);
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const index = useMemo(() => indexNodes(nodes), [nodes]);
  const needle = q.trim().toLowerCase();
  const options = nodes
    .filter((n) => n.archived_at === null && n.id !== node.id)
    .map((n) => ({ n, title: nodeTitle(n, conversations), path: ancestorsOf(index, n.id).map((a) => a.title).join(' / ') }))
    .filter((o) => !needle || o.title.toLowerCase().includes(needle))
    .slice(0, 150);
  const chosen = target ? nodes.find((n) => n.id === target) : null;
  return (
    <Dialog
      title="Relate to another node"
      onClose={onClose}
      foot={
        <>
          <button type="button" className="nl-btn is-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="nl-btn is-primary"
            disabled={!target}
            onClick={async () => {
              if (!target) return;
              const r = outgoing ? await link(node.id, target, kind) : await link(target, node.id, kind);
              say(r.ok ? 'Related.' : r.error ?? null);
              if (r.ok) onClose();
            }}
          >
            Relate
          </button>
        </>
      }
    >
      <div className="nl-row">
        <select className="nl-select" style={{ width: 'auto' }} value={outgoing ? 'out' : 'in'} onChange={(e) => setOutgoing(e.target.value === 'out')} aria-label="Direction">
          <option value="out">This</option>
          <option value="in">The other node</option>
        </select>
        <select className="nl-select" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value as RelationKind)} aria-label="Relationship">
          {RELATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {RELATION_LABEL[k]}
            </option>
          ))}
        </select>
        <span className="nl-hint">{outgoing ? 'the other node' : 'this'}</span>
      </div>
      {chosen ? (
        <p className="nl-hint">
          {outgoing ? `“${nodeTitle(node, conversations)}” ${RELATION_LABEL[kind]} “${nodeTitle(chosen, conversations)}”` : `“${nodeTitle(chosen, conversations)}” ${RELATION_LABEL[kind]} “${nodeTitle(node, conversations)}”`}
        </p>
      ) : null}
      <input className="nl-input" placeholder="Find a node" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a node" />
      <div className="nl-pick">
        {options.map((o) => (
          <button key={o.n.id} type="button" aria-pressed={target === o.n.id} onClick={() => setTarget(o.n.id)}>
            <Glyph type={o.n.type} />
            <span>{o.title}</span>
            {o.path ? (
              <span className="nl-hint" style={{ marginLeft: 'auto', flex: 'none', maxWidth: '40%' }}>
                {o.path}
              </span>
            ) : null}
          </button>
        ))}
        {!options.length ? <p className="nl-hint">Nothing to relate to yet.</p> : null}
      </div>
    </Dialog>
  );
}

export function Relations({ node, readOnly }: { node: NodeRow; readOnly?: boolean }) {
  const { relations, nodes, conversations, unlink, say } = useNL();
  const [adding, setAdding] = useState(false);
  const mine = relations.filter((r) => r.from_id === node.id || r.to_id === node.id);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (
    <section className="nl-panel" aria-label="Related">
      <div className="nl-panel-title">
        <span>Related</span>
        {!readOnly ? (
          <button type="button" className="nl-btn is-quiet is-small" onClick={() => setAdding(true)}>
            + Relate
          </button>
        ) : null}
      </div>
      {mine.length ? (
        <div>
          {mine.map((r) => {
            const out = r.from_id === node.id;
            const other = byId.get(out ? r.to_id : r.from_id);
            if (!other) return null;
            return (
              <div key={r.id} className="nl-rel">
                <Glyph type={other.type} size={14} />
                <span className="nl-rel-kind">{out ? RELATION_LABEL[r.kind] : `${RELATION_LABEL[r.kind]} this ←`}</span>
                <Link href={nodeHref(other)} title={nodeTitle(other, conversations)}>
                  {nodeTitle(other, conversations)}
                </Link>
                {!readOnly ? (
                  <button
                    type="button"
                    className="nl-icon-btn"
                    aria-label="Remove relationship"
                    onClick={async () => {
                      const x = await unlink(r.id);
                      if (!x.ok) say(x.error ?? null);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="nl-hint">Not related to anything yet. A relation can connect it to any objective or node without moving or copying it.</p>
      )}
      {adding ? <LinkDialog node={node} onClose={() => setAdding(false)} /> : null}
    </section>
  );
}

export function Provenance({ node }: { node: NodeRow }) {
  const p = node.provenance;
  return (
    <section className="nl-panel" aria-label="Where it came from">
      <div className="nl-panel-title">Where it came from</div>
      <div style={{ fontSize: 13, display: 'grid', gap: 4 }}>
        <span>{p.origin === 'ai' ? 'Generated by the assistant' : p.origin === 'external' ? 'From an external source' : 'Written by you'}</span>
        {p.source ? (
          <span className="nl-hint">
            {p.source.url ? (
              <a href={p.source.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
                {p.source.label}
              </a>
            ) : (
              p.source.label
            )}
          </span>
        ) : null}
        {p.conversationId ? (
          <Link href={`/new-logos/c/${encodeURIComponent(p.conversationId)}`} className="nl-hint" style={{ textDecoration: 'underline' }}>
            Taken from a conversation
          </Link>
        ) : null}
        {node.type === 'decision' ? <span className="nl-hint">{p.approvedAt ? `Accepted by you · ${when(p.approvedAt)}` : 'Not accepted'}</span> : null}
        <span className="nl-hint">
          Created {when(node.created_at)} · changed {when(node.updated_at)} · version {node.version}
        </span>
      </div>
    </section>
  );
}

export function History({ node }: { node: NodeRow }) {
  const { versions, nodeAction, say } = useNL();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<{ version: number; snapshot: Json; created_at: number }[] | null>(null);
  const [viewing, setViewing] = useState<{ version: number; snapshot: Json } | null>(null);
  useEffect(() => {
    if (open) void versions(node.id).then(setList);
  }, [open, node.id, node.version, versions]);
  return (
    <section className="nl-panel" aria-label="History">
      <div className="nl-panel-title">
        <span>History</span>
        <button type="button" className="nl-btn is-quiet is-small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open ? (
        list === null ? (
          <p className="nl-hint">Loading…</p>
        ) : list.length ? (
          <div>
            {list.map((v) => (
              <div key={v.version} className="nl-rel">
                <span className="nl-rel-kind">Version {v.version}</span>
                <span className="nl-hint" style={{ flex: 1 }}>
                  {when(v.created_at)}
                </span>
                <button type="button" className="nl-btn is-quiet is-small" onClick={() => setViewing(v)}>
                  View
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="nl-hint">No earlier versions yet.</p>
        )
      ) : null}
      {viewing ? (
        <Dialog
          title={`Version ${viewing.version}`}
          onClose={() => setViewing(null)}
          foot={
            node.archived_at === null ? (
              <button
                type="button"
                className="nl-btn is-primary"
                onClick={async () => {
                  const r = await nodeAction(node.id, 'restore-version', { versionNo: viewing.version });
                  say(r.ok ? 'Those words are back. The previous text is kept in history.' : r.error ?? null);
                  setViewing(null);
                }}
              >
                Bring back these words
              </button>
            ) : null
          }
        >
          <strong>{String(viewing.snapshot.title ?? '')}</strong>
          {viewing.snapshot.description ? <div className="nl-snapshot">{String(viewing.snapshot.description)}</div> : null}
          {(() => {
            const c = (viewing.snapshot.content ?? {}) as Json;
            const text = [c.body, c.rationale, c.resolution, c.outcome].filter((x) => typeof x === 'string' && x).join('\n\n');
            return text ? <div className="nl-snapshot">{text}</div> : null;
          })()}
          <span className="nl-hint">State then: {cap(String(viewing.snapshot.state ?? ''))}</span>
        </Dialog>
      ) : null}
    </section>
  );
}

// ── the page ─────────────────────────────────────────────────────────

function Header({ node, children }: { node: NodeRow; children?: React.ReactNode }) {
  const { nodeAction, deleteNode, say, conversations } = useNL();
  const router = useRouter();
  const save = useSaver(node);
  const [moving, setMoving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const archived = node.archived_at !== null;
  return (
    <div className="nl-head">
      <div className="nl-row" style={{ justifyContent: 'space-between' }}>
        <span className="nl-kicker">
          <Glyph type={node.type} />
          {typeLabel(node.type)}
          {archived ? ' · archived' : ''}
        </span>
        <Menu label="Node actions">
          {(close) =>
            archived ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    close();
                    const r = await nodeAction(node.id, 'restore');
                    say(r.ok ? 'Restored.' : r.error ?? null);
                  }}
                >
                  Restore
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    setConfirming(true);
                  }}
                >
                  Delete for good…
                </button>
              </>
            ) : (
              <>
                <button type="button" role="menuitem" onClick={() => (close(), setMoving(true))}>
                  Move to…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    close();
                    const r = await nodeAction(node.id, 'archive');
                    say(r.ok ? 'Archived. It is kept in Archive and can be restored.' : r.error ?? null);
                  }}
                >
                  Archive
                </button>
              </>
            )
          }
        </Menu>
      </div>
      <InlineText value={node.title} label="Title" onSave={(t) => void save({ title: t })} disabled={archived} />
      {children}
      {archived ? (
        <div className="nl-notice" role="status" style={{ marginBottom: 0 }}>
          This is archived. Restore it to change it.
          <button
            type="button"
            className="nl-btn is-small"
            onClick={async () => {
              const r = await nodeAction(node.id, 'restore');
              say(r.ok ? 'Restored.' : r.error ?? null);
            }}
          >
            Restore
          </button>
        </div>
      ) : null}
      {confirming ? (
        <ConfirmDialog
          title="Delete for good?"
          body={`“${nodeTitle(node, conversations)}” will be deleted permanently, with its history and relations. This cannot be undone.`}
          action="Delete it"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            const r = await deleteNode(node.id);
            if (r.ok) router.push('/new-logos/archive');
            say(r.ok ? 'Deleted.' : r.error ?? null);
          }}
        />
      ) : null}
      {moving ? (
        <ObjectivePicker
          title="Move to…"
          exclude={node.id}
          current={node.parent_id}
          onClose={() => setMoving(false)}
          onPick={async (parentId) => {
            const r = await nodeAction(node.id, 'move', { parentId });
            setMoving(false);
            say(r.ok ? 'Moved.' : r.error ?? null);
          }}
        />
      ) : null}
    </div>
  );
}

function StateControl({ node }: { node: NodeRow }) {
  const save = useSaver(node);
  if (node.type === 'decision' || node.type === 'conversation') return null;
  return (
    <div className="nl-seg" role="group" aria-label="State">
      {STATES[node.type].map((s) => (
        <button key={s} type="button" aria-pressed={node.state === s} disabled={node.archived_at !== null} onClick={() => node.state !== s && void save({ state: s })}>
          {cap(s)}
        </button>
      ))}
    </div>
  );
}

function ObjectiveBody({ node }: { node: NodeRow }) {
  const save = useSaver(node);
  const archived = node.archived_at !== null;
  return (
    <>
      <div className="nl-form" style={{ marginBottom: 24 }}>
        <label className="nl-field">
          <span className="nl-label">Outcome</span>
          <InlineText
            className="nl-input"
            label="Outcome"
            value={String(node.content.outcome ?? '')}
            placeholder="What does achieving this look like?"
            onSave={(v) => void save({ content: { outcome: v } })}
            disabled={archived}
          />
        </label>
        <TextArea label="Description" value={node.description} placeholder="Context, constraints, what is in and out of scope." onSave={(v) => void save({ description: v })} rows={2} />
      </div>
      <Matrix parentId={node.id} readOnly={archived} />
    </>
  );
}

function QuestionBody({ node }: { node: NodeRow }) {
  const save = useSaver(node);
  const { createNode, link, say } = useNL();
  const router = useRouter();
  const archived = node.archived_at !== null;
  return (
    <div className="nl-form">
      <TextArea label="What is unresolved" value={node.description} placeholder="Why it matters, what would settle it." onSave={(v) => void save({ description: v })} />
      <TextArea label="Resolution" value={String(node.content.resolution ?? '')} placeholder="Once you have an answer: what it is, and what settled it." onSave={(v) => void save({ content: { resolution: v } })} />
      {!archived ? (
        <div className="nl-row">
          <Link className="nl-btn" href={`/new-logos/c/new?investigates=${encodeURIComponent(node.id)}${node.parent_id ? `&in=${encodeURIComponent(node.parent_id)}` : ''}`}>
            Explore in a conversation
          </Link>
          <button
            type="button"
            className="nl-btn"
            onClick={async () => {
              const r = await createNode({ type: 'objective', title: node.title, parentId: node.parent_id, description: node.description });
              if (!r.ok || !r.node) return say(r.error ?? null);
              await link(r.node.id, node.id, 'derived_from');
              router.push(nodeHref(r.node));
            }}
          >
            Develop into an objective
          </button>
        </div>
      ) : null}
    </div>
  );
}

function KnowledgeBody({ node }: { node: NodeRow }) {
  const save = useSaver(node);
  const archived = node.archived_at !== null;
  const p = node.provenance;
  const setOrigin = (o: Origin) => void save({ provenance: { ...p, origin: o } });
  return (
    <div className="nl-form">
      <div className="nl-row">
        <div className="nl-seg" role="group" aria-label="Where it came from">
          {(['human', 'ai', 'external'] as Origin[]).map((o) => (
            <button key={o} type="button" aria-pressed={p.origin === o} disabled={archived} onClick={() => p.origin !== o && setOrigin(o)}>
              {o === 'human' ? 'Yours' : o === 'ai' ? 'AI-generated' : 'External source'}
            </button>
          ))}
        </div>
        <select className="nl-select" style={{ width: 'auto' }} value={String(node.content.kind ?? 'finding')} disabled={archived} onChange={(e) => void save({ content: { kind: e.target.value } })} aria-label="Kind">
          {KNOWLEDGE_KINDS.map((k) => (
            <option key={k} value={k}>
              {cap(k)}
            </option>
          ))}
        </select>
      </div>
      {p.origin === 'external' ? (
        <div className="nl-row">
          <InlineText className="nl-input nl-grow" label="Source" value={p.source?.label ?? ''} placeholder="Source (title, author, publication)" onSave={(v) => void save({ provenance: { ...p, source: { label: v, url: p.source?.url } } })} disabled={archived} />
          <InlineText className="nl-input nl-grow" label="Source address" value={p.source?.url ?? ''} placeholder="https://…" onSave={(v) => void save({ provenance: { ...p, source: { label: p.source?.label || v, url: v } } })} disabled={archived} />
        </div>
      ) : null}
      <TextArea label="What is known" value={String(node.content.body ?? '')} placeholder="The finding, evidence or observation, in full." rows={8} debounce={1200} onSave={(v) => void save({ content: { body: v } })} />
    </div>
  );
}

function DecisionBody({ node }: { node: NodeRow }) {
  const save = useSaver(node);
  const { nodeAction, say } = useNL();
  const archived = node.archived_at !== null;
  const act = async (a: 'accept' | 'reject' | 'reopen') => {
    const r = await nodeAction(node.id, a);
    say(r.ok ? (a === 'accept' ? 'Accepted as your decision.' : a === 'reject' ? 'Rejected.' : 'Reopened as a proposal.') : r.error ?? null);
  };
  return (
    <div className="nl-form">
      <div className="nl-notice" style={{ marginBottom: 0 }}>
        <span style={{ flex: 1 }}>
          {node.state === 'accepted'
            ? `Accepted by you${node.provenance.approvedAt ? ` · ${when(node.provenance.approvedAt)}` : ''}.`
            : node.state === 'rejected'
              ? 'Rejected.'
              : node.state === 'superseded'
                ? 'Superseded.'
                : node.provenance.origin === 'ai'
                  ? 'Proposed by the assistant. It is not your decision unless you accept it.'
                  : 'Proposed. Accept it when it is decided.'}
        </span>
        {!archived ? (
          <span className="nl-row">
            {node.state !== 'accepted' ? (
              <button type="button" className="nl-btn is-primary is-small" onClick={() => void act('accept')}>
                Accept
              </button>
            ) : null}
            {node.state === 'proposed' ? (
              <button type="button" className="nl-btn is-small" onClick={() => void act('reject')}>
                Reject
              </button>
            ) : null}
            {node.state !== 'proposed' ? (
              <button type="button" className="nl-btn is-small" onClick={() => void act('reopen')}>
                Reopen
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      <TextArea label="Rationale" value={String(node.content.rationale ?? '')} placeholder="Why this, and not the alternatives." onSave={(v) => void save({ content: { rationale: v } })} rows={4} />
      <TextArea label="Alternatives considered (one per line)" value={lines(node.content.alternatives)} onSave={(v) => void save({ content: { alternatives: toList(v) } })} />
      <TextArea label="Uncertainties (one per line)" value={lines(node.content.uncertainties)} placeholder="What could make this the wrong call." onSave={(v) => void save({ content: { uncertainties: toList(v) } })} />
      <p className="nl-hint">Relate supporting evidence (knowledge nodes, sources, conversations) under Related.</p>
    </div>
  );
}

function ArtifactBody({ node }: { node: NodeRow }) {
  const save = useSaver(node);
  const [preview, setPreview] = useState(false);
  const archived = node.archived_at !== null;
  const body = String(node.content.body ?? '');
  return (
    <div className="nl-form">
      <div className="nl-row">
        <select className="nl-select" style={{ width: 'auto' }} value={String(node.content.subtype ?? 'document')} disabled={archived} onChange={(e) => void save({ content: { subtype: e.target.value } })} aria-label="Artifact type">
          {ARTIFACT_SUBTYPES.map((s) => (
            <option key={s.id} value={s.id} disabled={!s.available}>
              {s.label}
              {s.available ? '' : ' (not available yet)'}
            </option>
          ))}
        </select>
        <span className="nl-grow" />
        <div className="nl-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>
            Edit
          </button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>
            Preview
          </button>
        </div>
      </div>
      {preview ? (
        <div className="nl-tile" style={{ padding: 20, minHeight: 420 }}>
          {body.trim() ? <Prose text={body} /> : <p className="nl-hint">Nothing written yet.</p>}
        </div>
      ) : (
        <TextArea label="Document" value={body} rows={20} mono debounce={1200} placeholder={'# Heading\n\nWrite in plain text or Markdown. Maths in $…$ or $$…$$.'} onSave={(v) => void save({ content: { body: v } })} />
      )}
      <p className="nl-hint">Saved as you type. Earlier versions are kept under History.</p>
    </div>
  );
}

export function NodeView({ id }: { id: string }) {
  const { loaded, nodes, setup } = useNL();
  const node = nodes.find((n) => n.id === id);
  if (!loaded) return <main className="nl-page"><p className="nl-hint">Loading…</p></main>;
  if (setup === false || !node)
    return (
      <main className="nl-page is-narrow">
        <Crumbs nodes={nodes} at={null} current="Not found" />
        <div className="nl-empty">This node does not exist, or it is not on this account.</div>
      </main>
    );
  const body =
    node.type === 'objective' ? <ObjectiveBody node={node} /> : node.type === 'question' ? <QuestionBody node={node} /> : node.type === 'knowledge' ? <KnowledgeBody node={node} /> : node.type === 'decision' ? <DecisionBody node={node} /> : node.type === 'artifact' ? <ArtifactBody node={node} /> : null;
  return (
    <main className="nl-page">
      <Crumbs nodes={nodes} at={node.parent_id} current={node.title} />
      <div className="nl-node">
        <div>
          <Header node={node}>
            <StateControl node={node} />
          </Header>
          {body}
        </div>
        <aside className="nl-side">
          <Relations node={node} readOnly={node.archived_at !== null} />
          <Provenance node={node} />
          <History node={node} />
        </aside>
      </div>
    </main>
  );
}
