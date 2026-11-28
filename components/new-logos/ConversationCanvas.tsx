'use client';
// components/new-logos/ConversationCanvas.tsx — A CONVERSATION, AS A SPACE.
//
// The conversation's data is unchanged: one ordered list of messages in the canonical conversation, read and written
// through the existing API, so the other interface shows the same thread. Here it is drawn as a space instead of a
// feed: each exchange (a person's turn and its replies) is an object, placed where it was asked — at a point on the
// plane, or beside the object it was asked about — moved, opened and closed at will. What was kept from it (knowledge,
// questions, decisions, documents) sits beside the exchange it came from. The chronological order is still there,
// in an index that opens on request, and is always the order the assistant reads.

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RELATION_LABEL, type NodeRow, type NodeType, type RelationKind } from '@/lib/new-logos/model';
import { displayTitle, newConversationId, placementOf, titleFromMessage, type StoredMessage } from '@/lib/new-logos/convo';
import { DEFAULT_SIZE, exchangeRef, exchangesOf, excerpt, factLines, nodeRef, placeMissing, placeNear, type Exchange } from '@/lib/new-logos/canvas';
import { useNL } from './state';
import { starterComposition, type Starter } from '@/lib/new-logos/primitives';
import { artifactFacts } from '@/lib/new-logos/context';
import { askMessage, reply, saveAsk, type About } from './ask';
import { Canvas, type CanvasLine, type CanvasObject } from './canvas/Canvas';
import { ExchangeCard, NodeCard } from './canvas/Cards';
import { Creator, type Makeable } from './canvas/Creator';
import { ConnectChooser, WorkspaceFrame } from './canvas/Frame';
import { useCanvasLayout } from './canvas/useLayout';
import { ObjectivePicker } from './Matrix';
import { Crumbs, InlineText, typeLabel, when } from './ui';

const W = { exchange: 320, exchangeOpen: 480, node: 280, nodeOpen: 420, docOpen: 620 };

export function ConversationCanvas({ id }: { id: string }) {
  const nl = useNL();
  const { conversations, conversationsLoaded, nodes, relations, setup, appendTurns, rename, createNode, link, nodeAction, say } = nl;
  const params = useSearchParams();
  const isNew = id === 'new';
  const [convId] = useState(() => (isNew ? newConversationId() : id));
  const [created, setCreated] = useState(!isNew);
  const inParam = params?.get('in') ?? null;
  const investigates = params?.get('investigates') ?? null;
  const conv = conversations.get(convId);
  const L = useCanvasLayout(`c:${convId}`);

  const [local, setLocal] = useState<StoredMessage[]>([]);
  const [streaming, setStreaming] = useState<{ key: string; text: string } | null>(null);
  const [notes, setNotes] = useState<Record<string, { text: string; retry: boolean }>>({});
  const abouts = useRef<Record<string, About>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [creator, setCreator] = useState<{ at: { x: number; y: number }; screen: { x: number; y: number } } | null>(null);
  const [connecting, setConnecting] = useState<{ from: string; to: string; screen: { x: number; y: number } } | null>(null);
  const [history, setHistory] = useState(false);
  const [focus, setFocus] = useState<{ ref: string; nonce: number } | null>(null);
  const [placing, setPlacing] = useState(false);
  const busy = !!streaming;
  const abort = useRef<AbortController | null>(null);
  const measured = useRef<Record<string, { w: number; h: number }>>({});

  const messages = useMemo(() => {
    const stored = conv?.messages ?? [];
    const have = new Set(stored.map((m) => m.id).filter(Boolean));
    return [...stored, ...local.filter((m) => !m.id || !have.has(m.id))];
  }, [conv, local]);
  const exchanges = useMemo(() => exchangesOf(messages), [messages]);
  const placement = placementOf(nodes, convId);
  const live = placement && placement.archived_at === null ? placement : undefined;
  const container = live?.parent_id ? nodes.find((n) => n.id === live.parent_id) : !created && inParam ? nodes.find((n) => n.id === inParam && n.type === 'objective') : undefined;
  const question = investigates ? nodes.find((n) => n.id === investigates) : undefined;
  const kept = useMemo(() => nodes.filter((n) => n.archived_at === null && n.provenance.conversationId === convId && n.type !== 'conversation'), [nodes, convId]);
  const title = conv ? displayTitle(conv.title) : created ? displayTitle('') : 'New conversation';

  useEffect(() => {
    document.title = `${title} · Workspace`;
  }, [title]);

  const exchangeOfMessage = useCallback((mid: string | undefined) => (mid ? exchanges.find((e) => e.ask?.id === mid || e.replies.some((r) => r.id === mid)) : undefined), [exchanges]);

  // ── where everything sits: saved places, and places found for what has none (stable once found) ──
  const widthOf = useCallback(
    (ref: string) => {
      const open = !!L.layout.items[ref]?.open;
      if (ref.startsWith('x:')) return open ? W.exchangeOpen : W.exchange;
      const n = nodes.find((x) => nodeRef(x.id) === ref);
      return open ? (n?.type === 'artifact' ? W.docOpen : W.nodeOpen) : W.node;
    },
    [L.layout.items, nodes]
  );
  // the size an object is drawn at, once drawn; until then, a fair estimate
  const sizeOf = useCallback((ref: string) => measured.current[ref] ?? { w: widthOf(ref), h: L.layout.items[ref]?.open ? 440 : DEFAULT_SIZE.h }, [widthOf, L.layout.items]);
  const wanted = useMemo(
    () => [
      ...exchanges.map((e) => ({ ref: exchangeRef(e) })),
      ...kept.map((n) => {
        const ex = exchangeOfMessage(n.provenance.messageId);
        return { ref: nodeRef(n.id), ...(ex ? { near: exchangeRef(ex) } : {}) };
      }),
    ],
    [exchanges, kept, exchangeOfMessage]
  );
  const layout = useMemo(() => (L.loaded ? placeMissing(L.layout, wanted, sizeOf) : L.layout), [L.loaded, L.layout, wanted, sizeOf]);
  useEffect(() => {
    if (!L.loaded) return;
    const fresh = Object.keys(layout.items).filter((r) => !L.layout.items[r]);
    if (!fresh.length) return;
    const first = !Object.keys(L.layout.items).length;
    const lastRef = exchanges.length ? exchangeRef(exchanges[exchanges.length - 1]) : null;
    // a history opened here for the first time: its latest exchange open, the rest compact
    L.setItems(Object.fromEntries(fresh.map((r) => [r, { ...layout.items[r], ...(first && r === lastRef ? { open: true } : {}) }])));
  }, [L, layout, exchanges]);

  // ── a turn ──
  const deps = useCallback((placed: boolean) => ({ appendTurns, placed }), [appendTurns]);

  async function ask(text: string, opts: { at?: { x: number; y: number }; from?: string; about?: About } = {}) {
    if (busy) return;
    const mine = askMessage(text, opts.about, Date.now());
    const key = mine.id as string;
    const ref = exchangeRef(key);
    if (opts.about) abouts.current[key] = opts.about;
    // the exchange appears where it was asked: at the point, or beside what it was asked about
    if (opts.at) L.setItem(ref, { ...placeNear(layout, opts.at, { w: W.exchangeOpen, h: 440 }, sizeOf), open: true, ...(opts.from ? { from: opts.from } : {}) });
    else {
      const p = placeMissing(layout, [{ ref, near: opts.from ?? (exchanges.length ? exchangeRef(exchanges[exchanges.length - 1]) : undefined) }], (r) => (r === ref ? { w: W.exchangeOpen, h: 440 } : sizeOf(r))).items[ref];
      L.setItem(ref, { ...p, open: true, ...(opts.from ? { from: opts.from } : { from: undefined }) });
    }
    setFocus({ ref, nonce: Date.now() });
    setLocal((l) => [...l, mine]);
    setStreaming({ key, text: '' });
    setNotes((n) => {
      const next = { ...n };
      delete next[key];
      return next;
    });
    const first = !created && !conv;
    const saved = await saveAsk(deps(false), convId, mine, first ? { title: titleFromMessage(text) } : undefined);
    if (!saved.ok) {
      setLocal((l) => l.filter((m) => m.id !== key));
      setStreaming(null);
      L.setItem(ref, null);
      say(saved.note);
      return;
    }
    setLocal((l) => l.filter((m) => m.id !== key));
    let placedNow = !!live;
    if (first) {
      setCreated(true);
      window.history.replaceState(null, '', `/new-logos/c/${encodeURIComponent(convId)}`);
      if (setup && (container || question)) {
        const r = await createNode({ type: 'conversation', conversationId: convId, parentId: container?.id ?? null });
        placedNow = !!r.ok;
        if (r.ok && r.node && question) await link(r.node.id, question.id, 'investigates');
      }
    }
    await answer(key, [...messages.filter((m) => m.id !== key), mine], placedNow);
  }

  async function answer(key: string, hist: StoredMessage[], placed: boolean) {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStreaming({ key, text: '' });
    const res = await reply(deps(placed), convId, hist, abouts.current[key], (t) => setStreaming({ key, text: t }), ctrl.signal);
    abort.current = null;
    setStreaming(null);
    if (!res.ok) setNotes((n) => ({ ...n, [key]: { text: res.note, retry: res.retry } }));
  }

  function retry(ex: Exchange) {
    const i = messages.findIndex((m) => m.id === ex.ask?.id);
    if (i < 0) return;
    void answer(ex.key, messages.slice(0, i + 1), !!live);
  }

  async function keep(type: NodeType, ex: Exchange, which: 'ask' | 'reply') {
    const m = which === 'reply' ? ex.replies[ex.replies.length - 1] : ex.ask;
    if (!m) return;
    const text = which === 'reply' ? ex.replies.map((r) => r.content).join('\n\n') : m.content;
    const r = await createNode({
      type,
      title: excerpt(text, 120) || typeLabel(type),
      parentId: container?.id ?? null,
      provenance: { origin: which === 'reply' ? 'ai' : 'human', conversationId: convId, ...(m.id ? { messageId: m.id } : {}) },
      ...(type === 'knowledge' ? { content: { body: text, kind: 'finding' } } : type === 'artifact' ? { content: starterComposition('text', text) } : type === 'decision' ? { content: { rationale: text } } : { description: text }),
    });
    if (!r.ok || !r.node) return say(r.error ?? null);
    const ref = nodeRef(r.node.id);
    const p = placeMissing(layout, [{ ref, near: exchangeRef(ex) }], sizeOf).items[ref];
    L.setItem(ref, { x: p.x, y: p.y });
    if (live) await link(r.node.id, live.id, 'derived_from');
    say(`Kept as ${typeLabel(type).toLowerCase()}${type === 'decision' && which === 'reply' ? ', a proposal until you accept it' : ''}.`);
  }

  async function createAt(type: Makeable, text: string, at: { x: number; y: number }, starter: Starter = 'text') {
    setCreator(null);
    if (type === 'ask') return void ask(text, { at });
    if (setup === false) return say('Questions, knowledge, decisions and artifacts are not available until their storage is set up.');
    if (!created && !conv) return say('Ask something first: the conversation begins with its first question.');
    const r = await createNode({ type, title: text, parentId: container?.id ?? null, provenance: { origin: 'human', conversationId: convId }, ...(type === 'artifact' ? { content: starterComposition(starter) } : {}) });
    if (!r.ok || !r.node) return say(r.error ?? null);
    L.setItem(nodeRef(r.node.id), { ...placeNear(layout, at, { w: type === 'artifact' ? W.docOpen : W.nodeOpen, h: 360 }, sizeOf), open: true });
    if (live) await link(r.node.id, live.id, 'derived_from');
  }

  const aboutExchange = (ex: Exchange): About => ({ label: excerpt(ex.ask?.content ?? ex.replies[0]?.content ?? '', 80) || 'an exchange', of: `the conversation “${title}”`, lines: factLines(ex.replies.map((r) => r.content).join('\n'), 8) });
  const aboutNode = (n: NodeRow): About => ({
    label: n.title,
    of: `the conversation “${title}”`,
    lines: n.type === 'artifact' ? artifactFacts(n) : [`A ${typeLabel(n.type).toLowerCase()}${n.type === 'decision' ? ` (${n.state})` : n.type === 'question' ? ` (${n.state})` : ''}`, ...factLines(String((n.content as Record<string, unknown>).body ?? (n.content as Record<string, unknown>).rationale ?? n.description ?? ''), 6)],
  });

  // ── what is drawn ──
  const objects: CanvasObject[] = [
    ...exchanges.map((ex) => {
      const ref = exchangeRef(ex);
      const open = !!layout.items[ref]?.open;
      return {
        ref,
        width: widthOf(ref),
        label: `Exchange: ${excerpt(ex.ask?.content ?? '', 80)}`,
        content: (
          <ExchangeCard
            ex={ex}
            open={open}
            streaming={streaming?.key === ex.key ? streaming.text : null}
            note={notes[ex.key] ?? null}
            busy={busy}
            onToggle={() => L.setItem(ref, { open: !open })}
            onAsk={(t) => void ask(t, { from: ref, about: aboutExchange(ex) })}
            onKeep={(t, which) => void keep(t, ex, which)}
            onRetry={() => retry(ex)}
          />
        ),
      };
    }),
    ...kept.map((n) => {
      const ref = nodeRef(n.id);
      const open = !!layout.items[ref]?.open;
      return {
        ref,
        width: widthOf(ref),
        label: `${typeLabel(n.type)}: ${n.title}`,
        connectable: true,
        content: <NodeCard node={n} open={open} busy={busy} onToggle={() => L.setItem(ref, { open: !open })} onAsk={(t) => void ask(t, { from: ref, about: aboutNode(n) })} />,
      };
    }),
  ];
  const present = new Set(objects.map((o) => o.ref));
  const lines: CanvasLine[] = [
    ...Object.entries(layout.items)
      .filter(([ref, it]) => it.from && present.has(ref) && present.has(it.from))
      .map(([ref, it]) => ({ id: `from-${ref}`, from: it.from as string, to: ref, label: 'asked about', style: 'dashed' as const })),
    ...kept.flatMap((n): CanvasLine[] => {
      const ex = exchangeOfMessage(n.provenance.messageId);
      return ex ? [{ id: `kept-${n.id}`, from: exchangeRef(ex), to: nodeRef(n.id), label: `kept as ${typeLabel(n.type).toLowerCase()}`, style: 'dotted' }] : [];
    }),
    ...relations
      .filter((r) => present.has(nodeRef(r.from_id)) && present.has(nodeRef(r.to_id)))
      .map((r) => ({ id: r.id, from: nodeRef(r.from_id), to: nodeRef(r.to_id), label: RELATION_LABEL[r.kind], style: 'solid' as const })),
  ];

  const openCreatorAtCentre = () => {
    const v = layout.view ?? { x: window.innerWidth / 2, y: window.innerHeight / 2, k: 1 };
    const sx = window.innerWidth / 2, sy = window.innerHeight / 2;
    setCreator({ at: { x: (sx - v.x) / v.k, y: (sy - 48 - v.y) / v.k }, screen: { x: sx - 180, y: sy - 80 } });
  };
  // a new conversation opens ready to ask
  useEffect(() => {
    if (isNew && L.loaded && !messages.length) openCreatorAtCentre();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, L.loaded]);

  if (!isNew && conversationsLoaded && !conv && !local.length)
    return (
      <main className="nl-page is-narrow">
        <Crumbs nodes={nodes} at={null} current="Conversation" />
        <div className="nl-empty">This conversation does not exist, was deleted, or is not on this account.</div>
      </main>
    );

  return (
    <WorkspaceFrame
      onAdd={openCreatorAtCentre}
      header={
        <>
          <Crumbs nodes={nodes} at={container?.id ?? null} current={title} />
          <div className="nl-row nl-ws-title">
            {conv ? <InlineText value={displayTitle(conv.title)} label="Conversation title" className="nl-ws-title-input" onSave={(t) => void rename(convId, t).then((ok) => !ok && say('Not renamed.'))} /> : <strong>{title}</strong>}
          </div>
          <div className="nl-row nl-hint">
            {container ? (
              <span>
                In{' '}
                <Link href={`/new-logos/w/${encodeURIComponent(container.id)}`} style={{ textDecoration: 'underline' }}>
                  {container.title}
                </Link>
              </span>
            ) : (
              <span>Not in an objective</span>
            )}
            {question ? <span>· investigating “{question.title}”</span> : null}
            {setup !== false && created ? (
              <button type="button" className="nl-btn is-quiet is-small" onClick={() => setPlacing(true)}>
                {live ? 'Move…' : 'Place in an objective…'}
              </button>
            ) : null}
          </div>
        </>
      }
      tools={
        <button type="button" className="nl-btn is-small" aria-expanded={history} onClick={() => setHistory((h) => !h)}>
          History{exchanges.length ? ` · ${exchanges.length}` : ''}
        </button>
      }
      drawer={
        history ? (
          <aside className="nl-ws-drawer nl-cv-ui" aria-label="History, in order">
            <div className="nl-panel-title">
              <span>In order</span>
              <button type="button" className="nl-icon-btn" aria-label="Close history" onClick={() => setHistory(false)}>
                ×
              </button>
            </div>
            <ol className="nl-history nl-cv-scroll">
              {exchanges.map((ex, i) => (
                <li key={ex.key}>
                  <button
                    type="button"
                    onClick={() => {
                      const ref = exchangeRef(ex);
                      L.setItem(ref, { open: true });
                      setSelected(ref);
                      setFocus({ ref, nonce: Date.now() });
                    }}
                  >
                    <span className="nl-hint">
                      {i + 1}
                      {ex.ask?.at ? ` · ${when(ex.ask.at)}` : ''}
                    </span>
                    <span>{excerpt(ex.ask?.content ?? ex.replies[0]?.content ?? '', 90)}</span>
                  </button>
                </li>
              ))}
              {!exchanges.length ? <li className="nl-hint">Nothing said yet.</li> : null}
            </ol>
          </aside>
        ) : null
      }
    >
      {L.loaded ? (
        <Canvas
          objects={objects}
          lines={lines}
          layout={layout}
          selected={selected}
          onSelect={setSelected}
          onMove={(ref, x, y) => L.setItem(ref, { x, y })}
          onView={L.setView}
          onCreateAt={(at, screen) => setCreator({ at, screen })}
          onConnect={(from, to) => {
            if (!from.startsWith('n:') || !to.startsWith('n:')) return say('Connections join nodes. Keep an exchange as a node to connect it.');
            const el = document.querySelector(`[data-ref="${CSS.escape(to)}"]`)?.getBoundingClientRect();
            setConnecting({ from, to, screen: { x: el ? el.left : window.innerWidth / 2, y: el ? el.top : window.innerHeight / 2 } });
          }}
          focus={focus}
          onSizes={(s) => (measured.current = s)}
          empty={
            <div>
              <p>Nothing here yet.</p>
              <p className="nl-hint">Double-click anywhere, or use Add, to ask the assistant. Each exchange becomes an object you can move, open and build on.</p>
            </div>
          }
        />
      ) : (
        <p className="nl-hint" style={{ padding: 24 }}>
          Loading…
        </p>
      )}
      {creator ? <Creator screen={creator.screen} types={setup === false || !created ? ['ask'] : ['ask', 'question', 'knowledge', 'decision', 'artifact']} onClose={() => setCreator(null)} onSubmit={(t, text, starter) => void createAt(t, text, creator.at, starter)} /> : null}
      {connecting ? (
        <ConnectChooser
          screen={connecting.screen}
          onClose={() => setConnecting(null)}
          onPick={async (kind: RelationKind) => {
            const c = connecting;
            setConnecting(null);
            const r = await link(c.from.slice(2), c.to.slice(2), kind);
            if (!r.ok) say(r.error ?? null);
          }}
        />
      ) : null}
      {placing ? (
        <ObjectivePicker
          title="Place this conversation in…"
          current={live?.parent_id}
          onClose={() => setPlacing(false)}
          onPick={async (parentId) => {
            setPlacing(false);
            const r = live ? await nodeAction(live.id, 'move', { parentId }) : await createNode({ type: 'conversation', conversationId: convId, parentId });
            say(r.ok ? 'Placed.' : r.error ?? null);
          }}
        />
      ) : null}
    </WorkspaceFrame>
  );
}
