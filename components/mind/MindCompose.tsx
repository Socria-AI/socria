'use client';
// components/mind/MindCompose.tsx
//
// The part of the Memory page where the person writes.
//
// Every other control here corrects something an extractor produced. This one
// starts from nothing: an object they name themselves, and a connection between
// two objects that they say is there. Until it existed, the only participant who
// could not add to their own workspace was them.
//
// THE REFUSALS ARE THE DESIGN. Three of them, and each is a choice rather than
// an error:
//   already there  — the thing they typed exists. It offers to CONNECT to it,
//                    because that is almost always what they were about to do.
//   forgotten      — they deleted this before. Forgetting holds by default, so
//                    nothing is written until they say "add it again" in so many
//                    words; the button is the only thing in the product that
//                    clears a tombstone.
//   full           — a limit, stated plainly, with what to do about it.
//
// No relationship is invented for them and no type is guessed: the pickers hold
// the vocabulary the graph already uses, and a word of their own is allowed,
// because an ontology that cannot grow stops describing the person's thinking
// and starts describing ours.

import { useMemo, useState } from 'react';
import { KNOWN_NODE_TYPES, KNOWN_RELATIONSHIPS } from '@/lib/mind/types';
import type { Node } from './MindGraphView';

/** What a write came back with. Refusals are values, not thrown. */
type Said = { tone: 'ok' | 'held'; text: string } | null;

export function MindCompose({
  nodes,
  busy,
  from,
  onDone,
  onSelect,
}: {
  nodes: Node[];
  busy: boolean;
  /** the node the person had open, offered as one end of a connection */
  from?: string | null;
  /** reload: whatever was written is now in the graph */
  onDone: (say: string) => void;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState<'none' | 'add' | 'link'>('none');
  const [sending, setSending] = useState(false);
  const [said, setSaid] = useState<Said>(null);

  // add
  const [type, setType] = useState('Concept');
  const [ownType, setOwnType] = useState('');
  const [label, setLabel] = useState('');
  const [content, setContent] = useState('');
  /** set when a create was refused because they forgot this before */
  const [reassert, setReassert] = useState(false);

  // link
  const [source, setSource] = useState(from ?? '');
  const [target, setTarget] = useState('');
  const [rel, setRel] = useState('depends_on');
  const [why, setWhy] = useState('');
  const [find, setFind] = useState('');

  const ordered = useMemo(
    () => [...nodes].sort((a, b) => a.label.localeCompare(b.label)),
    [nodes]
  );
  const matching = useMemo(() => {
    const q = find.trim().toLowerCase();
    const list = q ? ordered.filter((n) => n.label.toLowerCase().includes(q)) : ordered;
    return list.slice(0, 200);
  }, [ordered, find]);

  function reset() {
    setLabel(''); setContent(''); setOwnType(''); setReassert(false);
    setTarget(''); setWhy(''); setFind('');
  }

  async function add() {
    const kind = (ownType.trim() || type).trim();
    if (!label.trim() || !kind) return;
    setSending(true); setSaid(null);
    try {
      const res = await fetch('/api/mind/node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: kind, label: label.trim(), content: content.trim(), reassert }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'failed');

      if (j.ok === false) {
        setSaid({ tone: 'held', text: j.say });
        // "Already there" is an offer, not a dead end: open the connection form
        // with that object on one end and let them carry on.
        if (j.refused === 'exists' && j.id) {
          setSource(j.id);
          setOpen('link');
          onSelect(j.id);
        }
        // "You forgot this" arms the one button that clears a tombstone.
        if (j.refused === 'forgotten') setReassert(true);
        setSending(false);
        return;
      }

      reset();
      setOpen('none');
      onDone(j.say ?? 'Added.');
    } catch (e) {
      setSaid({ tone: 'held', text: e instanceof Error && e.message !== 'failed' ? e.message : 'That did not save.' });
    }
    setSending(false);
  }

  async function link() {
    if (!source || !target || source === target) return;
    setSending(true); setSaid(null);
    try {
      const res = await fetch('/api/mind/edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: source, targetId: target, relationship: rel, note: why.trim() }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'failed');
      if (j.ok === false) {
        setSaid({ tone: 'held', text: j.say });
        setSending(false);
        return;
      }
      reset();
      setOpen('none');
      onDone(j.say ?? 'Connected.');
    } catch (e) {
      setSaid({ tone: 'held', text: e instanceof Error && e.message !== 'failed' ? e.message : 'That did not save.' });
    }
    setSending(false);
  }

  const stop = busy || sending;
  const name = (id: string) => nodes.find((n) => n.id === id)?.label ?? '';

  return (
    <section className="mk">
      <div className="mk-bar">
        <button className={open === 'add' ? 'on' : ''} disabled={stop} onClick={() => setOpen(open === 'add' ? 'none' : 'add')}>
          Add something
        </button>
        <button
          className={open === 'link' ? 'on' : ''}
          disabled={stop || nodes.length < 2}
          onClick={() => {
            setSource(from ?? source);
            setOpen(open === 'link' ? 'none' : 'link');
          }}
          title={nodes.length < 2 ? 'Two things are needed before they can be connected' : undefined}
        >
          Connect two things
        </button>
      </div>

      {said && (
        <p className={`mk-said${said.tone === 'held' ? ' is-held' : ''}`} role="status">
          {said.text}
          {reassert && (
            <button className="mk-again" disabled={stop} onClick={() => void add()}>
              Add it again
            </button>
          )}
        </p>
      )}

      {open === 'add' && (
        <div className="mk-form">
          <label>
            <span>What kind of thing</span>
            <select value={type} disabled={stop} onChange={(e) => setType(e.target.value)}>
              {KNOWN_NODE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Or a word of your own</span>
            <input
              value={ownType}
              disabled={stop}
              placeholder="Constraint, Habit, Rule…"
              onChange={(e) => setOwnType(e.target.value)}
            />
          </label>
          <label className="wide">
            <span>What it is</span>
            <input
              value={label}
              disabled={stop}
              maxLength={80}
              placeholder="The lease ends in March"
              onChange={(e) => { setLabel(e.target.value); setReassert(false); }}
            />
          </label>
          <label className="wide">
            <span>Anything more (optional)</span>
            <textarea
              value={content}
              disabled={stop}
              maxLength={400}
              rows={2}
              placeholder="Two months' notice, so the decision is really February."
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
          <div className="mk-acts">
            <button className="go" disabled={stop || !label.trim()} onClick={() => void add()}>
              {reassert ? 'Add it again' : 'Add it'}
            </button>
            <button className="no" disabled={stop} onClick={() => { reset(); setOpen('none'); setSaid(null); }}>
              Cancel
            </button>
            <span className="mk-hint">Yours, and recorded as such — nothing will re-word or re-type it.</span>
          </div>
        </div>
      )}

      {open === 'link' && (
        <div className="mk-form">
          <label className="wide">
            <span>Find something</span>
            <input value={find} disabled={stop} placeholder="Type to narrow the lists" onChange={(e) => setFind(e.target.value)} />
          </label>
          <label>
            <span>This</span>
            <select value={source} disabled={stop} onChange={(e) => setSource(e.target.value)}>
              <option value="">Choose…</option>
              {matching.map((n) => (
                <option key={n.id} value={n.id}>{n.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Is related how</span>
            <select value={rel} disabled={stop} onChange={(e) => setRel(e.target.value)}>
              {KNOWN_RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </label>
          <label>
            <span>To this</span>
            <select value={target} disabled={stop} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose…</option>
              {matching.filter((n) => n.id !== source).map((n) => (
                <option key={n.id} value={n.id}>{n.label}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            <span>Why, in your words (optional)</span>
            <input
              value={why}
              disabled={stop}
              maxLength={200}
              placeholder="The lease is the reason, not the rent"
              onChange={(e) => setWhy(e.target.value)}
            />
          </label>
          {source && target && (
            <p className="mk-reads">
              Reads as: <b>{name(source)}</b> {rel.replace(/_/g, ' ')} <b>{name(target)}</b>.
            </p>
          )}
          <div className="mk-acts">
            <button className="go" disabled={stop || !source || !target || source === target} onClick={() => void link()}>
              Connect them
            </button>
            <button className="no" disabled={stop} onClick={() => { reset(); setOpen('none'); setSaid(null); }}>
              Cancel
            </button>
            <span className="mk-hint">A connection is what makes this reasoning rather than a list.</span>
          </div>
        </div>
      )}
    </section>
  );
}
