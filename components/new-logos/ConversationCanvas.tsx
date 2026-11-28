'use client';
// components/new-logos/ConversationCanvas.tsx — A CONVERSATION, AS AN EVOLVING REPRESENTATION OF THE PROBLEM.
//
// What is said here is not answered with a message. The Smart Omnibox reads it first: an instruction about the
// workspace ("group these", "turn this into a graph", "connect pricing to revenue", "/table …") runs through the
// operation engine at once; anything else — a question, a thought, an instruction only reasoning can carry out — is a
// turn for the representation intelligence (POST /api/new-logos/represent), which changes the conversation's
// REPRESENTATION (lib/new-logos/representation.ts): the question, what is known, the possibilities, what is still
// unknown, people and things, measures, timelines, steps, documents, a live model. Each turn revises what is there
// rather than adding a reply; the person changes it directly too, with no question asked; every change can be undone.
// (components/new-logos/engine/useWorkspace.tsx holds all of that, shared with an objective's space.)
//
// The conversation's data is unchanged: one ordered list of messages in the canonical conversation, read and written
// through the existing API, so the other interface shows the same thread — each turn's record, built from the items, is
// saved as its reply. What the other interface said and the representation has not taken in yet appears as exchanges,
// compact, until the next turn takes them in. Before the representation's table exists, turns are answered as
// exchanges, as before.

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RELATION_LABEL, type NodeRow, type NodeType, type RelationKind } from '@/lib/new-logos/model';
import { displayTitle, failureText, newConversationId, newMessage, placementOf, titleFromMessage, type StoredMessage } from '@/lib/new-logos/convo';
import { DEFAULT_SIZE, exchangeRef, exchangesOf, excerpt, factLines, nodeRef, placeMissing, placeNear, type Exchange } from '@/lib/new-logos/canvas';
import { isRepRef } from '@/lib/new-logos/rep-layout';
import { useNL } from './state';
import { starterComposition, type Starter } from '@/lib/new-logos/primitives';
import { artifactFacts } from '@/lib/new-logos/context';
import { askMessage, docIdsIn, reply, saveAsk, type About } from './ask';
import { Omnibox, type Mention } from './sources/Omnibox';
import { mentionContext } from './sources/mentions';
import { useCanvasSources } from './sources/useCanvasSources';
import { useSources } from './sources/state';
import { exchangeDocs, withoutCitations } from '@/lib/new-logos/sources';
import { Canvas, type CanvasLine, type CanvasObject } from './canvas/Canvas';
import { ExchangeCard, NodeCard } from './canvas/Cards';
import { Creator, isRepMakeable, type Makeable } from './canvas/Creator';
import { ConnectChooser, WorkspaceFrame } from './canvas/Frame';
import { useCanvasLayout } from './canvas/useLayout';
import { ObjectivePicker } from './Matrix';
import { Crumbs, InlineText, typeLabel, when } from './ui';
import { useWorkspace } from './engine/useWorkspace';
import { commandById } from '@/lib/new-logos/engine/commands';
import { RepHistory } from './represent/RepChrome';
import { mentionsOf, mergeAbout } from './sources/mentions';

const W = { exchange: 320, exchangeOpen: 480, node: 280, nodeOpen: 420, docOpen: 620 };

export function ConversationCanvas({ id }: { id: string }) {
  const nl = useNL();
  const { conversations, conversationsLoaded, nodes, relations, setup, appendTurns, rename, createNode, link, nodeAction, say } = nl;
  const { sources, passages, addRef } = useSources();
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
  const [working, setWorking] = useState<{ key: string; text: string; first: boolean; at: { x: number; y: number } } | null>(null);
  const [notes, setNotes] = useState<Record<string, { text: string; retry: boolean }>>({});
  const abouts = useRef<Record<string, About>>({});
  const [creator, setCreator] = useState<{ at: { x: number; y: number }; screen: { x: number; y: number }; types: Makeable[] } | null>(null);
  const [connecting, setConnecting] = useState<{ from: string; to: string; screen: { x: number; y: number } } | null>(null);
  const [history, setHistory] = useState(false);
  const [focus, setFocus] = useState<{ ref: string; nonce: number; ifHidden?: boolean; refs?: string[] } | null>(null);
  const [placing, setPlacing] = useState(false);
  const busy = !!streaming || !!working;
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

  const centre = () => {
    const v = L.layout.view ?? { x: window.innerWidth / 2, y: window.innerHeight / 2, k: 1 };
    return { x: (window.innerWidth / 2 - v.x) / v.k, y: (window.innerHeight / 2 - 48 - v.y) / v.k };
  };

  // ── turns: the representation intelligence, or (before its table exists) a reply as before ──
  const deps = useCallback((placed: boolean) => ({ appendTurns, placed, passages: (q: { docIds: string[]; query: string }) => passages(q) }), [appendTurns, passages]);
  const thinkRef = useRef<(text: string, about: About | undefined, refs: string[], kind: 'question' | 'instruction') => void>(() => {});
  const WS = useWorkspace({
    wsKey: `c:${convId}`,
    enabled: !isNew || created,
    container: container?.id ?? null,
    L,
    measured,
    exchanges: exchanges.map((e) => ({ key: e.key, text: excerpt(e.ask?.content ?? e.replies[0]?.content ?? '', 80) })),
    think: (t, a, r, k) => thinkRef.current(t, a, r, k),
    setFocus,
    openHistory: () => setHistory(true),
    busy,
    working: working ? { text: working.text, stop: () => abort.current?.abort() } : null,
  });
  const repMode = WS.R.setup !== false;
  const taken = useMemo(() => new Set(WS.R.rep.turns), [WS.R.rep.turns]);
  /** exchanges drawn: before the representation exists, all; then only what it has not taken in (said elsewhere) */
  const shownExchanges = useMemo(() => (repMode ? exchanges.filter((e) => !(e.ask?.id && (taken.has(e.ask.id) || working?.key === e.ask.id))) : exchanges), [repMode, exchanges, taken, working]);

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
  const sizeOf = useCallback((ref: string) => (isRepRef(ref) ? WS.sizeOf(ref) : measured.current[ref] ?? { w: widthOf(ref), h: L.layout.items[ref]?.open ? 440 : DEFAULT_SIZE.h }), [widthOf, L.layout.items, WS]);
  const wanted = useMemo(
    () => [
      ...shownExchanges.map((e) => ({ ref: exchangeRef(e) })),
      ...kept.map((n) => {
        const ex = exchangeOfMessage(n.provenance.messageId);
        return { ref: nodeRef(n.id), ...(ex && shownExchanges.includes(ex) ? { near: exchangeRef(ex) } : {}) };
      }),
    ],
    [shownExchanges, kept, exchangeOfMessage]
  );
  const layout = useMemo(() => (L.loaded ? placeMissing(L.layout, wanted, sizeOf) : L.layout), [L.loaded, L.layout, wanted, sizeOf]);
  // placed once it is known whether the conversation is represented (until then, which exchanges show is not known)
  const repKnown = isNew || WS.R.loaded;
  useEffect(() => {
    if (!L.loaded || !repKnown) return;
    const fresh = Object.keys(layout.items).filter((r) => !L.layout.items[r]);
    if (!fresh.length) return;
    const first = !Object.keys(L.layout.items).length;
    const lastRef = shownExchanges.length ? exchangeRef(shownExchanges[shownExchanges.length - 1]) : null;
    L.setItems(Object.fromEntries(fresh.map((r) => [r, { ...layout.items[r], ...(first && r === lastRef && !repMode ? { open: true } : {}) }])));
  }, [L, layout, shownExchanges, repMode, repKnown]);

  // ── sources placed here (a reference to the library's record each) ──
  const src = useCanvasSources({ layout, setItem: L.setItem, sizeOf, centre, conversationId: created ? convId : undefined, focusOn: (ref) => setFocus({ ref, nonce: Date.now() }) });

  /** A turn begun: the person's message saved first (never lost), then the representation (or a reply) asked for. */
  async function turn(text: string, partAbout: About | undefined, refs: string[]) {
    if (busy) return;
    const srcRefs = refs.filter((r) => r.startsWith('s:'));
    const asMentions = mentionsOf(refs, sources, nodes);
    const ctx = asMentions.length ? await mentionContext(asMentions, text, { sources, nodes, passages }) : { attachments: [] as unknown[], about: undefined };
    const about = mergeAbout(partAbout, ctx.about);
    const mine = askMessage(text, about, Date.now(), ctx.attachments);
    const key = mine.id as string;
    if (about) abouts.current[key] = about;
    const first = !created && !conv;
    if (repMode) setWorking({ key, text: WS.R.rep.items.length ? 'Working it into the picture' : 'Taking this in', first: !WS.R.rep.items.length, at: centre() });
    else {
      const ref = exchangeRef(key);
      const p = placeMissing(layout, [{ ref, near: shownExchanges.length ? exchangeRef(shownExchanges[shownExchanges.length - 1]) : undefined }], (r) => (r === ref ? { w: W.exchangeOpen, h: 440 } : sizeOf(r))).items[ref];
      L.setItem(ref, { ...p, open: true });
      setFocus({ ref, nonce: Date.now() });
      setStreaming({ key, text: '' });
    }
    setLocal((l) => [...l, mine]);
    const saved = await saveAsk(deps(false), convId, mine, first ? { title: titleFromMessage(text) } : undefined);
    if (!saved.ok) {
      setLocal((l) => l.filter((m) => m.id !== key));
      setStreaming(null);
      setWorking(null);
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
    if (repMode) await represent(mine, about, srcRefs, [...messages.filter((m) => m.id !== key)], placedNow);
    else await answer(key, [...messages.filter((m) => m.id !== key), mine], placedNow);
  }
  thinkRef.current = (t, a, r) => void turn(t, a, r);

  /** The representation intelligence takes the turn in: the picture changes; its record is saved as the reply. */
  async function represent(mine: StoredMessage, about: About | undefined, srcRefs: string[], before: StoredMessage[], placed: boolean) {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setWorking((w) => w ?? { key: mine.id as string, text: 'Working it into the picture', first: false, at: centre() });
    const res = await WS.R.turn(
      {
        message: { id: mine.id, content: mine.content },
        history: before.slice(-40).map((m) => ({ id: m.id, role: m.role, content: m.content })),
        ...(about ? { about: { label: about.label, of: about.of, lines: about.lines } } : {}),
        sourceIds: srcRefs.map((r) => r.slice(2)),
        docIds: docIdsIn([...before, mine]),
      },
      ctrl.signal
    );
    abort.current = null;
    setWorking(null);
    if (res.ok) {
      WS.nearRef.current = res.near;
      if (res.entry) WS.engine.record(res.entry.summary, res.entry.id, 'ai');
      // the turn in words, as the conversation's reply: what the other interface shows
      await appendTurns(convId, [newMessage('assistant', res.record, Date.now())]);
      WS.setNote({ summary: res.entry?.summary ?? 'Nothing needed changing.', undoable: !!res.entry, alternatives: res.alternatives });
      if (res.commands.length) await WS.runFromModel(res.commands);
      // what changed, brought into view together (only if it is not already)
      const touched = [...res.changes.added, ...res.changes.revised].map((id) => `r:${id}`);
      if (touched.length) window.setTimeout(() => setFocus({ ref: touched[0], refs: touched, nonce: Date.now(), ifHidden: true }), 160);
      return;
    }
    if (res.setup === false) return void answer(mine.id as string, [...before, mine], placed);
    if (res.status === 499) return WS.setNote({ summary: 'Stopped. Your words are kept.', failed: { retry: () => void represent(mine, about, srcRefs, before, placed) } });
    WS.setNote({ summary: res.error || failureText(res.status), failed: { retry: () => void represent(mine, about, srcRefs, before, placed) } });
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
    if (i < 0 || !ex.ask) return;
    if (repMode) void represent(ex.ask, abouts.current[ex.key], [], messages.slice(0, i), !!live);
    else void answer(ex.key, messages.slice(0, i + 1), !!live);
  }

  async function keep(type: NodeType, ex: Exchange, which: 'ask' | 'reply') {
    const m = which === 'reply' ? ex.replies[ex.replies.length - 1] : ex.ask;
    if (!m) return;
    const text = withoutCitations(which === 'reply' ? ex.replies.map((r) => r.content).join('\n\n') : m.content);
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
    for (const d of exchangeDocs(messages, ex)) {
      const s = sources.find((x) => x.doc_id === d.doc_id);
      if (!s) continue;
      const fromReply = which === 'reply';
      const at = fromReply && d.passages.length ? d.passages.slice(0, 6) : [null];
      for (const passage of at) await addRef({ sourceId: s.id, nodeId: r.node.id, passage, origin: fromReply ? 'ai' : 'human', ground: fromReply ? 'interpretation' : null });
    }
    if (live) await link(r.node.id, live.id, 'derived_from');
    say(`Kept as ${typeLabel(type).toLowerCase()}${type === 'decision' && which === 'reply' ? ', a proposal until you accept it' : ''}.`);
  }

  async function createAt(type: Makeable, text: string, at: { x: number; y: number }, starter: Starter = 'text') {
    setCreator(null);
    if (type === 'ask') return void turn(text, undefined, []);
    if (isRepMakeable(type)) {
      if (!created && !conv) return say('Ask something first: the conversation begins with its first question.');
      return WS.makeAt(type, at, text);
    }
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
  const hideRef = (ref: string) => WS.hidden.has(ref);
  const objects: CanvasObject[] = [
    ...WS.objects,
    ...shownExchanges
      .filter((ex) => !hideRef(exchangeRef(ex)))
      .map((ex) => {
        const ref = exchangeRef(ex);
        const open = !!layout.items[ref]?.open;
        return {
          ref,
          width: widthOf(ref),
          label: `Exchange: ${excerpt(ex.ask?.content ?? '', 80)}`,
          className: `is-exchange ${WS.classOf(ref)}`,
          content: (
            <ExchangeCard
              ex={ex}
              open={open}
              streaming={streaming?.key === ex.key ? streaming.text : null}
              note={notes[ex.key] ?? null}
              busy={busy}
              onToggle={() => L.setItem(ref, { open: !open })}
              onAsk={(t) => void turn(t, aboutExchange(ex), [])}
              onKeep={(t, which) => void keep(t, ex, which)}
              onRetry={() => retry(ex)}
              docs={exchangeDocs(messages, ex)}
            />
          ),
        };
      }),
    ...kept
      .filter((n) => !hideRef(nodeRef(n.id)))
      .map((n) => {
        const ref = nodeRef(n.id);
        const open = !!layout.items[ref]?.open;
        return {
          ref,
          width: widthOf(ref),
          label: `${typeLabel(n.type)}: ${n.title}`,
          connectable: true,
          className: WS.classOf(ref),
          content: <NodeCard node={n} open={open} busy={busy} onToggle={() => L.setItem(ref, { open: !open })} onAsk={(t) => void turn(t, aboutNode(n), [ref])} />,
        };
      }),
    ...src.objects.filter((o) => !hideRef(o.ref)).map((o) => ({ ...o, className: `${o.className ?? ''} ${WS.classOf(o.ref)}` })),
  ];
  // the first question, while it is being taken in: shown where it was asked, at once
  if (working?.first && !WS.R.rep.items.length) {
    objects.push({
      ref: 'r:pending_turn',
      width: 420,
      label: `Being taken in: ${working.text}`,
      content: (
        <div className="nl-r is-question is-pending">
          <p className="nl-r-text">{local.find((m) => m.id === working.key)?.content ?? conv?.messages.find((m) => m.id === working.key)?.content ?? ''}</p>
          <span className="nl-rwork" aria-hidden="true" />
        </div>
      ),
    });
  }
  const present = new Set(objects.map((o) => o.ref));
  const lines: CanvasLine[] = [
    ...WS.lines,
    ...src.lines(present),
    ...Object.entries(layout.items)
      .filter(([ref, it]) => it.from && present.has(ref) && present.has(it.from))
      .map(([ref, it]) => ({ id: `from-${ref}`, from: it.from as string, to: ref, label: 'asked about', style: 'dashed' as const, quiet: true })),
    ...kept.flatMap((n): CanvasLine[] => {
      const ex = exchangeOfMessage(n.provenance.messageId);
      return ex && present.has(exchangeRef(ex)) && present.has(nodeRef(n.id)) ? [{ id: `kept-${n.id}`, from: exchangeRef(ex), to: nodeRef(n.id), label: `kept as ${typeLabel(n.type).toLowerCase()}`, style: 'dotted', quiet: true }] : [];
    }),
    ...relations.filter((r) => present.has(nodeRef(r.from_id)) && present.has(nodeRef(r.to_id))).map((r) => ({ id: r.id, from: nodeRef(r.from_id), to: nodeRef(r.to_id), label: RELATION_LABEL[r.kind], style: 'solid' as const, quiet: true })),
  ];
  const shown = useMemo(() => {
    const items = { ...layout.items, ...WS.tilePlaces };
    if (working?.first && !WS.R.rep.items.length) items['r:pending_turn'] = { x: Math.round(working.at.x - 210), y: Math.round(working.at.y - 40) };
    return { ...layout, items };
  }, [layout, WS.tilePlaces, working, WS.R.rep.items.length]);

  const openCreatorAtCentre = () => {
    const sx = window.innerWidth / 2, sy = window.innerHeight / 2;
    setCreator({ at: centre(), screen: { x: sx - 180, y: sy - 80 }, types: ['question', 'knowledge', 'decision', 'artifact'] });
  };

  if (!isNew && conversationsLoaded && !conv && !local.length)
    return (
      <main className="nl-page is-narrow">
        <Crumbs nodes={nodes} at={null} current="Conversation" />
        <div className="nl-empty">This conversation does not exist, was deleted, or is not on this account.</div>
      </main>
    );

  return (
    <WorkspaceFrame
      omnibox={
        <Omnibox
          placeholder={repMode ? (WS.R.rep.items.length || shownExchanges.length ? 'Ask, add what you know, or say what to do. / for commands, @ to point at anything' : 'Ask anything, or describe what you are working through') : exchanges.length ? 'Ask, or type @ to bring in a source or anything in the workspace' : 'Ask anything. Type @ to bring in a source'}
          busy={busy}
          autoFocus={isNew && !messages.length}
          conversationId={created ? convId : undefined}
          onAsk={(t, m) => WS.submit(t, m)}
          onMake={setup === false || !created ? undefined : openCreatorAtCentre}
          extra={WS.mentionables}
          slash={WS.slash}
          pointing={WS.pointing}
          onUnpoint={WS.unpoint}
        />
      }
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
            ) : null}
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
        created || exchanges.length ? (
          <button type="button" className="nl-btn is-quiet is-small" aria-expanded={history} onClick={() => setHistory((h) => !h)}>
            History
          </button>
        ) : null
      }
      drawer={
        history ? (
          repMode ? (
            <RepHistory
              log={WS.R.log}
              messages={messages}
              onClose={() => setHistory(false)}
              onBack={(entryId) =>
                void WS.R.undo(entryId).then((r) => {
                  WS.setNote({ summary: r.ok ? r.summary ?? 'Back to before that change.' : r.error ?? 'Not undone.', undoable: false });
                  if (r.ok && r.entry) WS.engine.record(r.summary ?? 'Went back', r.entry, 'person');
                })
              }
            />
          ) : (
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
                        WS.select([ref]);
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
          )
        ) : null
      }
    >
      {L.loaded && (!repMode || WS.R.loaded || isNew) ? (
        <Canvas
          objects={objects}
          lines={lines}
          layout={shown}
          selected={WS.primary}
          onSelect={(ref) => WS.select(ref ? [ref] : [])}
          onMove={(ref, x, y) => (ref.startsWith('r:') || ref.startsWith('g:') ? WS.onMove(ref, x, y) : L.setItem(ref, { x, y }))}
          onView={L.setView}
          onCreateAt={(at, screen) => setCreator({ at, screen, types: repMode && created ? ['ask', 'observation', 'hypothesis', 'unknown'] : setup === false || !created ? ['ask'] : ['ask', 'question', 'knowledge', 'decision', 'artifact'] })}
          onDropSource={src.dropSource}
          onDropFiles={(files, at) => void src.dropFiles(files, at)}
          onConnect={(from, to) => {
            if (src.connect(from, to)) return;
            if (from.startsWith('r:') && to.startsWith('r:')) {
              const p = commandById('connect')!.plan({ ...WS.ctx, selection: [from, to] }, { from, to });
              if (!('error' in p)) void WS.runPlan(p);
              return;
            }
            if (!from.startsWith('n:') || !to.startsWith('n:')) return say('Connections join two parts of the picture, or two nodes. Keep a part in the workspace to connect it to a node.');
            const el = document.querySelector(`[data-ref="${CSS.escape(to)}"]`)?.getBoundingClientRect();
            setConnecting({ from, to, screen: { x: el ? el.left : window.innerWidth / 2, y: el ? el.top : window.innerHeight / 2 } });
          }}
          focus={focus}
          onSizes={(s) => (measured.current = s)}
          {...WS.canvasProps}
          empty={
            <div>
              <p>Ask anything in the box below.</p>
              <p className="nl-hint">What you ask becomes a picture of the problem you can work on: possibilities, what is known, what is missing, models. Double-click anywhere to add something of your own; type / for commands.</p>
            </div>
          }
        />
      ) : (
        <p className="nl-hint" style={{ padding: 24 }}>
          Loading…
        </p>
      )}
      {WS.overlays}
      {creator ? <Creator screen={creator.screen} types={setup === false && creator.types.some((t) => !isRepMakeable(t) && t !== 'ask') ? ['ask'] : creator.types} onClose={() => setCreator(null)} onSubmit={(t, text, starter) => void createAt(t, text, creator.at, starter)} /> : null}
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
