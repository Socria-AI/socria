'use client';
// components/logos5/MemoryView.tsx — MEMORY, in Logos 5: what Socria
// remembers about you, as a network you can move through, a record of how it
// changed, and the changes that wait for you.
//
// Three views of one memory, and no second store behind them:
//   Network  the atlas of a mind (lib/logos5/memoryAtlas.ts): eight regions,
//            every memory a neuron, every relationship one the store holds.
//            A region opens in place; a memory opens the inspector — what it
//            is, its state in words, why Socria keeps it (the conversation or
//            file, with Open), what it connects to, how it changed — with Edit,
//            "This isn't right" and Forget.
//   Changes  every change the memory records, newest first, what it was and
//            what it is now, in whose words, and what it reached.
//   Review   what waits for a decision, each choice saying what it will do.
//
// READ ONLY THROUGH THE PRIVATE-FILTERED FEEDS: /api/mind?scope=logos, the
// atlas and /api/mind/changes with scope=logos — the server cuts private
// memories out before anything is sent. Every write is the store's own
// (PATCH and DELETE /api/mind/node, POST /api/mind/changes), and after each
// one the view reads again, so what is shown is what was saved. Claims noticed
// once are not here: they carry no privacy mark, so they stay on the full
// Memory page, which can count it.
//
// A phone gets the same atlas folded in two columns, pinch to zoom, a list
// under every region, and the inspector as a sheet from the bottom.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CHANGE_KIND,
  REGION,
  REGIONS,
  changeCounts,
  dayOf,
  memoriesOf,
  passes,
  waitsForThem,
  type ChangeIn,
  type EdgeIn,
  type Memory,
  type MemoryFilter,
  type MemoryIn,
  type RegionId,
} from '@/lib/logos5/memoryAtlas';
import { L5Switch } from './L5Chrome';
import { MemoryNetwork } from './MemoryNetwork';
import { ChangeCard, Icon, Inspector, Mark, MemoryRow, choicesFor, reachOf, regionVar, type Decision, type PlaceIn, type Step } from './MemoryParts';
import './memory.css';

type Load =
  | { state: 'loading' }
  | { state: 'off'; say: 'signed-out' | 'unavailable' }
  | { state: 'ok'; nodes: MemoryIn[]; edges: EdgeIn[]; places: Map<string, PlaceIn[]>; titles: Map<string, string>; changes: ChangeIn[] };

type Tab = 'network' | 'changes' | 'review';
type ChangeFilter = 'all' | 'waiting' | 'confirmed' | 'superseded' | 'revised' | 'tension';

const CHANGE_FILTERS: [ChangeFilter, string][] = [
  ['all', 'All changes'],
  ['waiting', 'Waiting for you'],
  ['confirmed', 'Confirmed'],
  ['superseded', 'Changed position'],
  ['revised', 'Reworded'],
  ['tension', 'Contradictions'],
];
const MEMORY_FILTERS: [MemoryFilter, string][] = [
  ['all', 'All'],
  ['waiting', 'Waiting'],
  ['week', 'This week'],
  ['important', 'Important'],
];
const PAGE = 40;

const passesChange = (c: ChangeIn, f: ChangeFilter) =>
  f === 'all' ||
  (f === 'waiting' && c.review === 'proposed') ||
  (f === 'confirmed' && c.review === 'confirmed') ||
  (f === 'superseded' && c.kind === 'superseded') ||
  (f === 'revised' && c.kind === 'revised') ||
  (f === 'tension' && (c.kind === 'conflict' || c.kind === 'possible-conflict'));

/** What a person changed, said back to them, from the store's own answer. */
async function call(url: string, init: RequestInit): Promise<{ ok: boolean; say: string }> {
  try {
    const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => null);
    if (!r.ok || j?.ok === false) return { ok: false, say: j?.error || j?.say || 'That could not be saved just now.' };
    return { ok: true, say: j?.say || '' };
  } catch {
    return { ok: false, say: 'That could not be saved just now.' };
  }
}

export function MemoryView({
  signedIn,
  head,
  onOpen,
  narrow = false,
}: {
  signedIn: boolean;
  /** the screen's header, given the view switch for its middle */
  head: (center: ReactNode) => ReactNode;
  /** a conversation a memory was learned in, opened */
  onOpen: (place: PlaceIn) => void;
  narrow?: boolean;
}) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [tab, setTab] = useState<Tab>('network');
  const [open, setOpen] = useState<RegionId | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<MemoryFilter>('all');
  const [query, setQuery] = useState('');
  const [changeFilter, setChangeFilter] = useState<ChangeFilter>('all');
  const [changeRegion, setChangeRegion] = useState<RegionId | null>(null);
  const [changeSel, setChangeSel] = useState<string | null>(null);
  const [history, setHistory] = useState<Step[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pulse, setPulse] = useState<{ id: string; key: number } | null>(null);
  const [navFolded, setNavFolded] = useState(false);
  const [listMode, setListMode] = useState(false);
  const [full, setFull] = useState(false);
  const [pages, setPages] = useState<Partial<Record<RegionId, number>>>({});
  const [reduced, setReduced] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = useMemo(() => Date.now(), [load]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => setReduced(mq.matches);
    read();
    mq.addEventListener?.('change', read);
    return () => mq.removeEventListener?.('change', read);
  }, []);

  // ── reading: the same rows Core reads, private ones cut on the server ──
  const read = useCallback(async () => {
    if (!signedIn) return setLoad({ state: 'off', say: 'signed-out' });
    try {
      const [mr, ar, cr] = await Promise.all([
        fetch('/api/mind?scope=logos', { cache: 'no-store' }),
        fetch('/api/mind/atlas?scope=logos', { cache: 'no-store' }),
        fetch('/api/mind/changes?scope=logos', { cache: 'no-store' }),
      ]);
      const mind = mr.ok ? await mr.json().catch(() => null) : null;
      if (!mind || mind.storage?.ok === false) return setLoad({ state: 'off', say: 'unavailable' });
      const atlas = ar.ok ? await ar.json().catch(() => null) : null;
      const ch = cr.ok ? await cr.json().catch(() => null) : null;
      // where each memory was learned: the atlas's memory → conversation lines, with the conversations' names
      const chats = new Map<string, PlaceIn>();
      for (const n of atlas?.nodes ?? []) if (n.kind === 'chat' && typeof n.id === 'string') chats.set(n.id, { id: n.id.replace(/^c:/, ''), title: n.label || 'A conversation', surface: n.surface === 'core' ? 'core' : 'logos' });
      const places = new Map<string, PlaceIn[]>();
      for (const e of atlas?.edges ?? []) {
        if (e.rel !== 'learned_in' || typeof e.from !== 'string') continue;
        const chat = chats.get(e.to);
        if (!chat) continue;
        const id = e.from.replace(/^m:/, '');
        const list = places.get(id) ?? [];
        if (!list.some((p) => p.id === chat.id)) list.push(chat);
        places.set(id, list);
      }
      const titles = new Map([...chats.values()].map((p) => [p.id, p.title]));
      setLoad({
        state: 'ok',
        nodes: Array.isArray(mind.nodes) ? mind.nodes : [],
        edges: Array.isArray(mind.edges) ? mind.edges : [],
        places,
        titles,
        changes: Array.isArray(ch?.changes) ? ch.changes : [],
      });
    } catch {
      setLoad({ state: 'off', say: 'unavailable' });
    }
  }, [signedIn]);
  useEffect(() => {
    void read();
  }, [read]);

  const data = load.state === 'ok' ? load : null;
  const memories = useMemo(() => (data ? memoriesOf(data.nodes, data.edges, data.changes, now) : []), [data, now]);
  const byId = useMemo(() => new Map(memories.map((m) => [m.id, m])), [memories]);
  const edges = data?.edges ?? [];
  const changes = data?.changes ?? [];
  const proposed = changes.filter((c) => c.review === 'proposed');
  const chosen = sel ? byId.get(sel) ?? null : null;
  const matches = useMemo(() => (filter === 'all' && !query.trim() ? null : (m: Memory) => passes(m, filter, query)), [filter, query]);

  // a memory's history, from the record (and again after anything is written)
  useEffect(() => {
    if (!sel) return setHistory(null);
    let live = true;
    setHistory(null);
    fetch(`/api/mind/changes?scope=logos&node=${encodeURIComponent(sel)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && setHistory(Array.isArray(j?.evolution) ? j.evolution : []))
      .catch(() => live && setHistory([]));
    return () => {
      live = false;
    };
  }, [sel, data]);
  useEffect(() => setNote(null), [sel]);

  /** select a memory: its region opens around it, as it would from the map */
  const pick = useCallback(
    (id: string | null) => {
      setSel(id);
      if (!id) return;
      const m = byId.get(id);
      if (m && open !== m.region) setOpen(m.region);
      if (tab !== 'network') setTab('network');
      setListMode(false);
    },
    [byId, open, tab]
  );

  // Esc puts down what is selected, then closes the region; / goes to the search
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as Element | null)?.closest?.('input, textarea, [contenteditable="true"]');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key !== 'Escape' || e.defaultPrevented || typing) return;
      if (document.querySelector('[role="dialog"]:not(.l5mm-insp)')) return;
      if (full) setFull(false);
      else if (sel) setSel(null);
      else if (changeSel) setChangeSel(null);
      else if (open) setOpen(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [sel, open, changeSel, full]);

  // ── writing: the store's own routes, then read again ──
  const after = async (r: { ok: boolean; say: string }, glow: string | null, fallback: string) => {
    setNote(r.say || (r.ok ? fallback : 'That could not be saved just now.'));
    if (!r.ok) return;
    await read();
    if (glow) setPulse({ id: glow, key: Date.now() });
  };
  async function decide(id: string, decision: Decision) {
    const c = changes.find((x) => x.id === id);
    setBusy(true);
    const r = await call('/api/mind/changes?scope=logos', { method: 'POST', body: JSON.stringify({ id, decision }) });
    await after(r, decision === 'forget' ? c?.from.id ?? null : c?.to.id ?? null, 'Done.');
    if (r.ok && decision === 'forget' && c && sel === c.to.id) setSel(null);
    setBusy(false);
  }
  async function save(label: string, content: string) {
    if (!chosen) return;
    setBusy(true);
    const r = await call('/api/mind/node', { method: 'PATCH', body: JSON.stringify({ id: chosen.id, label: label.slice(0, 80), content: content.slice(0, 400) }) });
    await after(r, chosen.id, 'Saved.');
    setBusy(false);
  }
  async function confirm() {
    if (!chosen) return;
    setBusy(true);
    const r = await call('/api/mind/node', { method: 'PATCH', body: JSON.stringify({ id: chosen.id, confirm: true }) });
    await after(r, chosen.id, 'Confirmed — Socria holds it as yours, and won’t reword it.');
    setBusy(false);
  }
  async function challenge(why: string) {
    if (!chosen) return;
    setBusy(true);
    const r = await call('/api/mind/node', { method: 'PATCH', body: JSON.stringify({ id: chosen.id, challenge: why.slice(0, 300) }) });
    await after(r, chosen.id, 'Socria will hold it as something you disagreed with.');
    setBusy(false);
  }
  async function forget() {
    if (!chosen) return;
    setBusy(true);
    const r = await call('/api/mind/node', { method: 'DELETE', body: JSON.stringify({ id: chosen.id }) });
    if (r.ok) {
      setSel(null);
      await read();
      setNote(null);
    } else setNote(r.say);
    setBusy(false);
  }

  // ── the switch in the header ──
  const tabs = (
    <L5Switch
      label="Memory views"
      value={tab}
      onChange={(id) => {
        setTab(id as Tab);
        setChangeSel(null);
      }}
      items={[
        { id: 'network', label: 'Network' },
        { id: 'changes', label: 'Changes' },
        { id: 'review', label: 'Review', count: proposed.length },
      ]}
      wide={narrow}
    />
  );

  // ── the region list: the graph's other half, and its accessible form ──
  const counts = useMemo(() => {
    if (tab === 'network') {
      const c = Object.fromEntries(REGIONS.map((r) => [r.id, 0])) as Record<RegionId, number>;
      for (const m of memories) if (!matches || matches(m)) c[m.region] += 1;
      return c;
    }
    return changeCounts(tab === 'review' ? proposed : changes, byId, tab === 'review' ? 'proposed' : 'all');
  }, [tab, memories, matches, changes, proposed, byId]);
  const reviewByRegion = useMemo(() => changeCounts(proposed, byId, 'proposed'), [proposed, byId]);

  const regionRows = (big: boolean) =>
    REGIONS.map((r) => {
      const isOpen = tab === 'network' ? open === r.id || (big && listMode) : changeRegion === r.id;
      const mine = memories.filter((m) => m.region === r.id && (!matches || matches(m)));
      const page = pages[r.id] ?? PAGE;
      return (
        <div key={r.id} className={`l5mm-reg${isOpen ? ' is-on' : ''}${counts[r.id] ? '' : ' is-dim'}`} style={{ ['--c' as string]: regionVar(r.id) }}>
          <button
            type="button"
            className="l5mm-reg-h"
            aria-expanded={tab === 'network' ? isOpen : undefined}
            aria-pressed={tab !== 'network' ? isOpen : undefined}
            onClick={() => {
              if (tab === 'network') {
                setSel(null);
                setOpen(open === r.id ? null : r.id);
              } else setChangeRegion(changeRegion === r.id ? null : r.id);
            }}
          >
            <span className="l5mm-reg-dot" aria-hidden="true" />
            <span className="l5mm-reg-nm">
              {r.name}
              {tab === 'network' && !narrow && <small>{r.hint}</small>}
            </span>
            <span className="l5mm-reg-ct">{counts[r.id]}</span>
          </button>
          {tab === 'network' && isOpen && (
            <div className="l5mm-reg-list">
              {mine.slice(0, page).map((m) => (
                <MemoryRow key={m.id} m={m} on={sel === m.id} onPick={pick} big={big} />
              ))}
              {mine.length > page && (
                <button type="button" className="l5mm-more" onClick={() => setPages((p) => ({ ...p, [r.id]: page + PAGE }))}>
                  Show {Math.min(PAGE, mine.length - page)} more of {mine.length - page}
                </button>
              )}
              {!mine.length && <p className="l5mm-fine">{query || filter !== 'all' ? 'Nothing here matches.' : 'Nothing remembered here yet.'}</p>}
            </div>
          )}
        </div>
      );
    });

  const searchBox = (
    <label className="l5mm-search">
      <Icon name="search" size={15} />
      <input ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search memories…" aria-label="Search your memories" />
      {!narrow && <kbd aria-hidden="true">/</kbd>}
    </label>
  );
  const chips = (
    <div className="l5mm-chips" role="group" aria-label="Show">
      {MEMORY_FILTERS.map(([id, label]) => {
        const n = id === 'all' ? memories.length : memories.filter((m) => passes(m, id, '')).length;
        return (
          <button key={id} type="button" className={`l5mm-chip${filter === id ? ' is-on' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
            <span>{n}</span>
          </button>
        );
      })}
    </div>
  );

  const nav = (
    <aside className={`l5mm-nav${navFolded ? ' is-folded' : ''}`} aria-label="Regions">
      {navFolded ? (
        <button type="button" className="l5mm-unfold" onClick={() => setNavFolded(false)} aria-label="Show the regions">
          <Icon name="list" />
        </button>
      ) : (
        <>
          <div className="l5mm-nav-h">
            <span className="l5mm-k">{tab === 'network' ? 'Regions' : tab === 'changes' ? 'Changes by region' : 'To review, by region'}</span>
            <button type="button" className="l5mm-fold" onClick={() => setNavFolded(true)} aria-label="Fold the regions away">
              <Icon name="back" size={14} />
            </button>
          </div>
          {tab === 'network' && (
            <div className="l5mm-nav-find">
              {searchBox}
              {chips}
            </div>
          )}
          <div className="l5mm-nav-list">{regionRows(false)}</div>
          <div className="l5mm-nav-foot">
            <p className="l5mm-nav-note">
              <Icon name="lock" size={14} />
              <span>Memories from conversations you kept private never appear here.</span>
            </p>
            <a className="l5mm-nav-link" href="/memory">
              Everything, private included <Icon name="chevR" size={13} />
            </a>
          </div>
        </>
      )}
    </aside>
  );

  // ── the network ──
  const crumb = open ? (
    <div className="l5mm-ctl l5mm-crumb">
      <button type="button" onClick={() => (setSel(null), setOpen(null))}>
        <Icon name="net" size={14} />
        All regions
      </button>
      <span className="l5mm-sep" aria-hidden="true">
        ›
      </span>
      <b>{narrow ? REGION[open].short : REGION[open].name}</b>
      {!narrow && (
        <>
          <span className="l5mm-sep" aria-hidden="true">
            ·
          </span>
          <span>{`${memories.filter((m) => m.region === open).length} memories`}</span>
        </>
      )}
    </div>
  ) : (
    <p className="l5mm-ctl l5mm-hint">{narrow ? 'Pinch to zoom · tap a region to open it' : 'Select a region to open it — or any memory to see why Socria keeps it'}</p>
  );
  const network = (
    <MemoryNetwork
      memories={memories}
      byId={byId}
      edges={edges}
      narrow={narrow}
      open={open}
      onOpen={(r) => {
        setSel(null);
        setOpen(r);
      }}
      selected={sel}
      onSelect={pick}
      matches={matches}
      pulse={pulse}
      reduced={reduced}
      reviewCounts={reviewByRegion}
      insets={narrow ? { top: 46, right: 10, bottom: open ? 30 : 84, left: 10 } : { top: 56, right: 18, bottom: 70, left: 18 }}
      hint={crumb}
    >
      {narrow && !open && (
        <div className="l5mm-ctl l5mm-fab" role="group" aria-label="How to see it">
          <button type="button" className={listMode ? '' : 'is-on'} onClick={() => setListMode(false)} aria-pressed={!listMode}>
            <Icon name="net" />
            Network
          </button>
          <button type="button" className={listMode ? 'is-on' : ''} onClick={() => setListMode(true)} aria-pressed={listMode}>
            <Icon name="list" />
            List
          </button>
          <button type="button" onClick={() => setFull((v) => !v)} aria-pressed={full} aria-label={full ? 'Leave full screen' : 'Full screen'}>
            <Icon name={full ? 'shrink' : 'full'} />
          </button>
        </div>
      )}
    </MemoryNetwork>
  );

  const inspector = chosen ? (
    <Inspector
      key={chosen.id}
      m={chosen}
      now={now}
      edges={edges}
      byId={byId}
      places={data?.places.get(chosen.id) ?? []}
      changes={changes}
      history={history}
      busy={busy}
      note={note}
      onClose={() => setSel(null)}
      onSelect={pick}
      onOpenPlace={onOpen}
      onSave={(l, c) => void save(l, c)}
      onChallenge={(w) => void challenge(w)}
      onConfirm={() => void confirm()}
      onForget={() => void forget()}
      onDecide={(id, d) => void decide(id, d)}
      sheet={narrow}
    />
  ) : null;

  // ── Changes and Review ──
  const inRegion = (c: ChangeIn) => !changeRegion || [c.from.id, c.to.id].some((id) => byId.get(id)?.region === changeRegion);
  const timeline = changes.filter((c) => passesChange(c, changeFilter) && inRegion(c));
  const focus = changeSel ? changes.find((c) => c.id === changeSel) ?? null : null;
  const showInNetwork = (id: string) => (byId.has(id) ? pick(id) : undefined);

  const changesCol = (
    <main className="l5mm-col" aria-label="How your memory changed">
      <div className="l5mm-col-h">
        <h2>How your memory changed</h2>
        <p>Every change Socria read from a conversation, and every one you made. Proposed changes wait for you — nothing settles until you say so.</p>
      </div>
      <div className="l5mm-chips is-row" role="group" aria-label="Show">
        {CHANGE_FILTERS.map(([id, label]) => (
          <button key={id} type="button" className={`l5mm-chip${changeFilter === id ? ' is-on' : ''}`} aria-pressed={changeFilter === id} onClick={() => setChangeFilter(id)}>
            {label}
            {id === 'waiting' && proposed.length > 0 && <span>{proposed.length}</span>}
          </button>
        ))}
      </div>
      <div className="l5mm-tl">
        {timeline.map((c, i) => {
          const month = new Date(c.at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
          const prev = i ? new Date(timeline[i - 1].at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
          return (
            <div key={c.id}>
              {month !== prev && <div className="l5mm-month">{month}</div>}
              <div className="l5mm-tl-row">
                <span className="l5mm-tl-d">{dayOf(c.at, now)}</span>
                <span className={`l5mm-tl-rail${c.review === 'proposed' ? ' is-dash' : ''}${c.kind === 'possible-conflict' || c.kind === 'conflict' ? ' is-warn' : ''}`} aria-hidden="true">
                  <i />
                </span>
                <ChangeCard c={c} now={now} on={changeSel === c.id} busy={busy} onPick={() => setChangeSel(c.id)} onDecide={(id, d) => void decide(id, d)} onShow={showInNetwork} places={data?.titles} compact={c.review !== 'proposed' && changeSel !== c.id} />
              </div>
            </div>
          );
        })}
        {!timeline.length && <p className="l5mm-empty-line">{changes.length ? 'No change matches.' : 'No change recorded yet. When Socria reads that your thinking moved — a new position, better words, two claims in tension — it shows here.'}</p>}
      </div>
    </main>
  );

  const reviewItems = [...proposed].filter(inRegion).sort((a, b) => (b.kind === 'possible-conflict' ? 1 : 0) - (a.kind === 'possible-conflict' ? 1 : 0) || b.at - a.at);
  const reviewCol = (
    <main className="l5mm-col" aria-label="Review">
      <div className="l5mm-col-h">
        <h2>Review</h2>
        <p>Socria holds these lightly until you decide. Confirm what is right, reject what isn’t — rejecting puts back exactly what was there.</p>
      </div>
      {reviewItems.map((c) => (
        <ChangeCard key={c.id} c={c} now={now} on={changeSel === c.id} busy={busy} onPick={() => setChangeSel(c.id)} onDecide={(id, d) => void decide(id, d)} onShow={showInNetwork} places={data?.titles} />
      ))}
      {!reviewItems.length && (
        <p className="l5mm-empty-line">
          <Icon name="check" size={15} /> Nothing waits for you. Every change is settled.
        </p>
      )}
      {note && tab !== 'network' && (
        <p className="l5mm-say" role="status">
          {note}
        </p>
      )}
      <section className="l5mm-once">
        <span className="l5mm-k">Noticed once — not believed yet</span>
        <p>
          <Icon name="eye" size={15} /> Claims Socria has noticed only once are kept on your full Memory page, where conversations you kept private are counted too.{' '}
          <a href="/memory">Review them there</a>
        </p>
      </section>
    </main>
  );

  const side = focus ? (
    <aside className="l5mm-side" aria-label="The change, in the network">
      <div className="l5mm-insp-top">
        <span className="l5mm-k">In the network</span>
        <button type="button" className="l5mm-x" aria-label="Close" onClick={() => setChangeSel(null)}>
          <Icon name="x" />
        </button>
      </div>
      <h3>{focus.kind === 'possible-conflict' || focus.kind === 'conflict' ? 'Two claims that disagree' : focus.to.label}</h3>
      <p>When a memory changes, what rests on it may need another look — so you can see how far a change reaches.</p>
      <MiniNet c={focus} byId={byId} />
      <section className="l5mm-sec">
        <span className="l5mm-k">{focus.review === 'proposed' ? 'What each answer does' : 'Where it stands'}</span>
        {focus.review === 'proposed' ? (
          <ul className="l5mm-does">
            {choicesFor(focus).map((ch) => (
              <li key={ch.decision}>
                <b>{ch.label}</b> — {ch.does}
              </li>
            ))}
          </ul>
        ) : (
          <p className="l5mm-fine">{focus.legacy ? 'Recorded before changes were reviewed: kept as history.' : focus.surface === 'user' ? 'A change you made yourself.' : 'You confirmed it.'}</p>
        )}
      </section>
      {focus.review === 'proposed' && (
        <div className="l5mm-btns is-wrap">
          {choicesFor(focus).map((ch) => (
            <button key={ch.decision} type="button" className={`l5mm-btn is-${ch.tone}`} disabled={busy} onClick={() => void decide(focus.id, ch.decision)}>
              {ch.label}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="l5mm-btn is-quiet" onClick={() => showInNetwork(focus.to.id)}>
        <Icon name="net" size={14} /> Show it in the network
      </button>
    </aside>
  ) : null;

  // ── what there is to show ──
  let body: ReactNode;
  if (load.state === 'loading') body = <p className="l5mm-empty">Reading what Socria remembers…</p>;
  else if (load.state === 'off')
    body =
      load.say === 'signed-out' ? (
        <div className="l5mm-empty">
          <h2>Your memory lives with your account.</h2>
          <p>Sign in, and what Socria learns as you think things through gathers here — who matters, what you are working on, what you hold true — yours to edit, correct or forget.</p>
        </div>
      ) : (
        <div className="l5mm-empty">
          <h2>Socria’s memory isn’t reachable just now.</h2>
          <p>Your conversations are all still here. Try again in a moment.</p>
          <button type="button" className="l5mm-btn" onClick={() => void read()}>
            Try again
          </button>
        </div>
      );
  else if (!memories.length && tab === 'network')
    body = (
      <div className="l5mm-empty">
        <h2>Nothing remembered yet.</h2>
        <p>As you think things through, what Socria learns gathers here in eight regions — identity, goals, work, learning, people, preferences, what is happening now and what is still open — each with where it was learned, yours to edit or forget.</p>
      </div>
    );
  else if (narrow) {
    body =
      tab === 'network' ? (
        <div className={`l5mm-phone${full ? ' is-full' : ''}${open && !chosen && !listMode ? ' has-sheet' : ''}${chosen ? ' has-insp' : ''}`}>
          {listMode && !open ? (
            <div className="l5mm-plist">
              {searchBox}
              {chips}
              {regionRows(true)}
              <button type="button" className="l5mm-btn is-quiet" onClick={() => setListMode(false)}>
                <Icon name="net" size={14} /> Back to the network
              </button>
            </div>
          ) : (
            network
          )}
          {open && !chosen && (
            <div className="l5mm-sheet" role="region" aria-label={REGION[open].name}>
              <div className="l5mm-grab" aria-hidden="true" />
              {searchBox}
              {chips}
              <div className="l5mm-sheet-list">
                {memories
                  .filter((m) => m.region === open && (!matches || matches(m)))
                  .slice(0, pages[open] ?? PAGE)
                  .map((m) => (
                    <MemoryRow key={m.id} m={m} on={false} onPick={pick} big />
                  ))}
              </div>
            </div>
          )}
          {inspector}
        </div>
      ) : (
        <div className="l5mm-pcol">{tab === 'changes' ? changesCol : reviewCol}</div>
      );
  } else {
    body = (
      <div className={`l5mm-grid${navFolded ? ' is-folded' : ''}${(tab === 'network' && chosen) || (tab !== 'network' && side) ? ' has-side' : ''}`}>
        {nav}
        {tab === 'network' ? network : tab === 'changes' ? changesCol : reviewCol}
        {tab === 'network' ? inspector : side}
      </div>
    );
  }

  return (
    <div className={`l5mm-wrap${full ? ' is-full' : ''}`}>
      {!full && head(load.state === 'ok' && !narrow ? tabs : null)}
      {load.state === 'ok' && narrow && !full && <div className="l5x-tabs">{tabs}</div>}
      <section className={`l5mm${narrow ? ' is-narrow' : ''}`} aria-label="Memory">
        {body}
      </section>
    </div>
  );
}

/** A change, drawn small: what it was, what it is, and what it reached. */
function MiniNet({ c, byId }: { c: ChangeIn; byId: ReadonlyMap<string, Memory> }) {
  const reach = reachOf(c).slice(0, 3);
  const W = 340, H = reach.length ? 214 : 124;
  const same = c.from.id === c.to.id;
  const pts: { id: string; label: string; x: number; y: number; kind: 'from' | 'to' | 'reach'; region?: RegionId }[] = [];
  if (!same) pts.push({ id: c.from.id, label: c.from.label, x: 78, y: 66, kind: 'from', region: byId.get(c.from.id)?.region });
  pts.push({ id: c.to.id, label: c.to.label, x: same ? W / 2 : 262, y: 66, kind: 'to', region: byId.get(c.to.id)?.region });
  reach.forEach((a, i) => pts.push({ id: a.id, label: a.label, x: ((i + 1) * W) / (reach.length + 1), y: 162, kind: 'reach', region: byId.get(a.id)?.region }));
  const at = (id: string) => pts.find((p) => p.id === id);
  const short = (t: string) => (t.length > 22 ? `${t.slice(0, 21)}…` : t);
  const vs = c.kind === 'conflict' || c.kind === 'possible-conflict';
  return (
    <svg className="l5mm-mini" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${c.from.label} ${vs ? 'and' : 'to'} ${c.to.label}${reach.length ? `, reaching ${reach.map((a) => a.label).join(', ')}` : ''}`}>
      {!same && <path d={`M${78},66 Q${W / 2},${vs ? 30 : 40} ${262},66`} className={`l5mm-mini-l${vs ? ' is-conflict' : ''}${c.review === 'proposed' ? ' is-dash' : ''}`} />}
      {reach.map((a) => {
        const p = at(a.id)!, from = at(c.to.id)!;
        return <path key={a.id} d={`M${from.x},${from.y} L${p.x},${p.y}`} className="l5mm-mini-l is-reach" />;
      })}
      {pts.map((p) => (
        <g key={`${p.kind}-${p.id}`} style={{ ['--c' as string]: p.region ? regionVar(p.region) : 'var(--l5mm-ink-mark)' }}>
          <circle cx={p.x} cy={p.y} r={p.kind === 'reach' ? 7 : 11} className={`l5mm-body${p.kind === 'to' && c.review === 'proposed' ? ' is-dashed' : ''}${p.kind === 'from' && !vs ? ' is-old' : ''}`} strokeDasharray={p.kind === 'to' && c.review === 'proposed' ? '4 3' : undefined} />
          <circle cx={p.x} cy={p.y} r={p.kind === 'reach' ? 3.2 : 5} className="l5mm-core" />
          <text x={p.x} y={p.y + (p.kind === 'reach' ? 22 : 28)} textAnchor="middle" className="l5mm-mini-t">
            {short(p.label)}
          </text>
        </g>
      ))}
      <text x={W / 2} y={24} textAnchor="middle" className="l5mm-mini-k">
        {CHANGE_KIND[c.kind]}
      </text>
    </svg>
  );
}

export { Mark, waitsForThem };
