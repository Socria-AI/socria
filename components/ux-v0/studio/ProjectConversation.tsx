'use client';
// components/ux-v0/studio/ProjectConversation.tsx — a project still in conversation: the one writer of its record
// (useV0Project, like every workspace). For a graphic, a logo, a campaign or a website, each time the person speaks
// SocriaUX decides one thing — ask one question, or make it (lib/ux-v0/studio/discover.ts; the model decides when it
// can be reached: ./discoverClient.ts) — and "make it", "you decide" or "surprise me" make it at once. Websites the
// person points to are read for reference (/api/ux-v0/reference) before the turn that follows, files are attached as
// they come, and the work begins as soon as the brief is enough, with no direction to choose first. A critique and a
// design-system import keep their own short exchange (lib/ux-v0/studio/director.ts): they only need the file.

import { useEffect, useRef, useState } from 'react';
import { SAVE_WORDS, useV0Project } from '../useV0Project';
import { putProject } from '@/lib/ux-v0/store';
import type { DesignProject } from '@/lib/ux-v0/types';
import { said, type StudioMode, type StudioState } from '@/lib/ux-v0/studio/schema';
import { readyToMake, referenceUrls, respond, seedFromWords, type DirectorEnv } from '@/lib/ux-v0/studio/director';
import { applyDecision, awaitingTurn, chooseAid, isCreative, makeNow, makingNow, personSays, wantsMake } from '@/lib/ux-v0/studio/discover';
import { addReference, referenceOf, type SiteRead } from '@/lib/ux-v0/studio/references';
import { researchAskOf, type ResearchResponse } from '@/lib/ux-v0/research/schema';
import type { SystemRecord } from '@/lib/ux-v0/dsi/registry';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import { Conversation } from './Conversation';
import { decideTurn, TurnCancelled } from './discoverClient';
import { attachFiles, switchMode } from './begin';
import { usableSystems } from './SystemPicker';

const STARTING: Record<StudioMode, string> = {
  graphic: 'Composing it from what you said…',
  logo: 'Constructing logo concepts from the name and what it stands for…',
  website: 'Making the page: its structure, its working parts, your words…',
  board: 'Planning the board and the identity its pieces share…',
  system: 'Opening the import with what you brought…',
  critique: 'Opening the design…',
};

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
};

export function ProjectConversation(props: {
  initial: DesignProject;
  signedIn: boolean;
  nonce: string;
  systems: readonly SystemRecord[];
  /** begin the work: resolves with why it could not, or null once it has (and the view has moved on) */
  onStart: (p: DesignProject, st: StudioState, websiteSystems: readonly MasterDesignSystem[]) => Promise<string | null>;
  onExit: () => void;
  onManageSystems: () => void;
}) {
  const { project, update, save, current } = useV0Project(props.initial, props.signedIn);
  const st = project.studio!;
  const [starting, setStarting] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  // the record as this conversation last wrote it: every change goes through here, so an answer that arrives while a
  // site is being read never loses one that was made in between
  const latest = useRef(st);
  latest.current = st;
  const commit = (next: StudioState) => {
    latest.current = next;
    update((p) => (p.studio ? { ...p, studio: next } : p));
  };
  const change = (fn: (s: StudioState) => StudioState) => commit(fn(latest.current));

  const usable = usableSystems(props.systems);
  const rec = usable.find((r) => r.id === st.systemId) ?? null;
  const env: DirectorEnv = { hasSystem: !!rec, ...(rec ? { systemName: rec.name } : {}) };
  const envRef = useRef(env);
  envRef.current = env;

  const start = async (from: StudioState) => {
    setError('');
    setStarting(STARTING[from.mode]);
    await putProject({ ...current.current, studio: from });
    // a website is made in the first look its words call for (within its design system when it has one)
    const err = await props.onStart({ ...current.current, studio: from }, from, []);
    if (err) {
      setStarting('');
      setError(err);
    }
  };
  /** Made now if the conversation's last word was that it is being made (a switch of kind can say so, or ask). */
  const after = async () => {
    if (readyToMake(latest.current, envRef.current)) await start(latest.current);
  };

  // creative discovery: SocriaUX's turn, decided by the model when it can be reached (the reader otherwise). A turn
  // still being decided when the person says something else is let go; the newer words get the turn.
  const [thinking, setThinking] = useState(false);
  const turning = useRef<AbortController | null>(null);
  const creative = isCreative(st.mode);
  const turn = async () => {
    turning.current?.abort();
    const ctl = new AbortController();
    turning.current = ctl;
    const from = latest.current;
    setThinking(true);
    try {
      const d = await decideTurn(from, { projectId: project.id, signal: ctl.signal, ...(envRef.current.systemName ? { systemName: envRef.current.systemName } : {}) });
      if (ctl.signal.aborted || latest.current.transcript.length !== from.transcript.length) return;
      commit(applyDecision(latest.current, d));
      if (d.action === 'make') await start(latest.current);
    } catch (e) {
      if (!(e instanceof TurnCancelled)) setError('Something went wrong while thinking about that. Say it again, or press “Make it now”.');
    } finally {
      if (turning.current === ctl) setThinking(false);
    }
  };
  useEffect(() => () => turning.current?.abort(), []);
  /** Whatever the person does next is answered on its own: a turn still being decided is let go. */
  const settle = () => {
    turning.current?.abort();
    setThinking(false);
  };

  // a conversation that said it was making the work, opened before it could (a reload): it is made now
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    if (st.status !== 'discovering') return;
    if (isCreative(st.mode)) {
      // a conversation opened on the person's words (a new one, or one left before SocriaUX answered): its turn now;
      // one that said it was making the work before it could: made now
      if (makingNow(st)) void start(st);
      else if (awaitingTurn(st)) void turn();
      return;
    }
    const last = [...st.transcript].reverse().find((m) => m.from === 'socria');
    if (last?.kind === 'note' && readyToMake(st, env)) void start(st);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Websites the person pointed to, read one after another; what was read (or why it could not be) is said. */
  const readSites = async (urls: readonly string[]) => {
    for (const url of urls) {
      const host = hostOf(url);
      setReading((r) => [...r, host]);
      try {
        const res = await fetch('/api/ux-v0/reference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
        const j = (await res.json().catch(() => null)) as { read?: SiteRead; preview?: string; error?: string } | null;
        if (res.ok && j?.read) {
          const ref = referenceOf(j.read);
          if (j.preview) setPreviews((p) => ({ ...p, [ref.id]: j.preview! }));
          change((s) => addReference(s, ref));
        } else {
          const why = res.status === 429 ? 'too many sites read just now — try again in a minute' : (j?.error ?? 'it did not answer').replace(/\.$/, '').toLowerCase();
          change((s) => said(s, { from: 'socria', kind: 'note', text: `I couldn’t read ${host}: ${why}. Tell me what you like about it, or drop in a screenshot.` }));
        }
      } catch {
        change((s) => said(s, { from: 'socria', kind: 'note', text: `I couldn’t reach ${host} from here. Tell me what you like about it, or drop in a screenshot.` }));
      } finally {
        setReading((r) => r.filter((x) => x !== host));
      }
    }
  };

  /** References searched for through the workspace's provider; what was found (each with its source), or why nothing
   * was, is said — never results that were not found. */
  const [searching, setSearching] = useState('');
  const searchRefs = async (ask: { query: string; kind: 'websites' | 'images' }) => {
    setSearching(ask.query);
    try {
      const res = await fetch('/api/ux-v0/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ask) });
      const j = (await res.json().catch(() => null)) as ResearchResponse | null;
      if (res.status === 429) return change((s) => said(s, { from: 'socria', kind: 'note', text: 'Too many searches just now — try again in a minute. Links you paste are read meanwhile.' }));
      if (!j || !Array.isArray(j.results)) return change((s) => said(s, { from: 'socria', kind: 'note', text: 'The search did not happen just now, so nothing was found. Paste links to sites you like, or drop in pictures.' }));
      if (j.status !== 'ok' || !j.results.length) return change((s) => said(s, { from: 'socria', kind: 'note', text: j.message }));
      const results = j.results.slice(0, 12).map((r) => ({ id: r.id, kind: r.kind, title: r.title, url: r.url, host: r.host, ...(r.snippet ? { snippet: r.snippet } : {}), ...(r.thumb ? { thumb: r.thumb } : {}), provider: r.provider }));
      change((s) => said(s, { from: 'socria', kind: 'research', text: `${j.message} Each one is linked to where it was found. Choose the ones worth learning from and I will read them — they are for inspiration, never copied into the work.`, found: { query: j.query, provider: j.provider ?? 'search', results } }));
    } catch {
      change((s) => said(s, { from: 'socria', kind: 'note', text: 'The search could not be reached from here, so nothing was found. Paste links to sites you like, or drop in pictures.' }));
    } finally {
      setSearching('');
    }
  };
  // an opening sentence that asks for references: they are searched for at once
  const searchedOpening = useRef(false);
  useEffect(() => {
    if (searchedOpening.current) return;
    searchedOpening.current = true;
    const ask = researchAskOf(st.prompt);
    if (ask && st.transcript.length <= 3 && !st.transcript.some((m) => m.kind === 'research' || /^Looking for references/.test(m.text))) {
      change((s) => said(s, { from: 'socria', kind: 'note', text: `Looking for references: “${ask.query}”.` }));
      void searchRefs(ask);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSend = async (text: string, files: File[]) => {
    setError('');
    settle();
    let ids: string[] = [];
    if (files.length) {
      const r = await attachFiles(files, { critique: latest.current.mode === 'critique', hold: latest.current.mode === 'system' });
      if (r.error) setError(r.error);
      if (r.attachments.length) {
        ids = r.attachments.map((a) => a.id);
        // what the files settle is taken from them (a critique's design, a design system's source)
        change((s) => seedFromWords({ ...s, attachments: [...s.attachments, ...r.attachments].slice(-16) }));
      }
      if (!r.attachments.length && !text) return;
    }
    if (isCreative(latest.current.mode)) {
      commit(personSays(latest.current, text || (ids.length ? 'These' : ''), { attachments: ids }));
      // "make it", "you decide", "surprise me": made now, with what is understood
      if (wantsMake(text)) {
        commit(applyDecision(latest.current, makeNow(latest.current)));
        return start(latest.current);
      }
      // a site to learn from is read before SocriaUX answers; a search is run when one was asked for
      const urls = referenceUrls(text);
      if (urls.length) await readSites(urls);
      const ask = researchAskOf(text);
      if (ask && !urls.length) {
        change((s) => said(s, { from: 'socria', kind: 'note', text: `Looking for references: “${ask.query}”.` }));
        await searchRefs(ask);
        return;
      }
      return turn();
    }
    const turn0 = respond(latest.current, text || (ids.length ? 'These' : ''), env, { attachments: ids });
    commit(turn0.st);
    if (turn0.switchTo) {
      change((s) => switchMode(s, turn0.switchTo!));
      return after();
    }
    // a site to learn from is read before anything is made from what was said; a search is run when one was asked for
    if (turn0.research.length) await readSites(turn0.research);
    if (turn0.search) await searchRefs(turn0.search);
    if (turn0.move.kind === 'create') await after();
  };

  const onMake = async () => {
    settle();
    if (isCreative(latest.current.mode)) {
      commit(applyDecision(personSays(latest.current, 'Make it now'), makeNow(latest.current)));
      return start(latest.current);
    }
    const t = respond(latest.current, 'Make it now', env);
    commit(t.st);
    if (t.move.kind === 'create') await start(latest.current);
  };

  /** One of the options a creative question offered, tapped: the decision taken, then the next question or the work. */
  const onChoose = async (optionId: string) => {
    setError('');
    settle();
    // an option an aid offered (its place in the aid): said as the person's reply and kept as their taste (aids are
    // only ever shown in creative discovery)
    const next = chooseAid(latest.current, Number(optionId));
    if (!next) return;
    commit(next);
    return turn();
  };

  return (
    <Conversation
      studio={st}
      env={env}
      nonce={props.nonce}
      saveWords={SAVE_WORDS[save]}
      systems={props.systems}
      onSystem={(id) => {
        const r = usable.find((x) => x.id === id);
        change((s) => said({ ...s, systemId: r ? r.id : undefined }, { from: 'socria', kind: 'change', text: r ? `Made in ${r.name} from here: its colours, type and logo, with every composition still its own.` : 'No design system: I’ll propose an identity from your words.' }));
      }}
      onManageSystems={async () => {
        await putProject(current.current);
        props.onManageSystems();
      }}
      onSend={(t, f) => void onSend(t, f)}
      searching={searching}
      onUseFound={(url) => void readSites([url])}
      onMake={() => void onMake()}
      onChoose={(id) => void onChoose(id)}
      thinking={thinking}
      onReference={(id, patch) => change((s) => ({ ...s, references: (s.references ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)) }))}
      previews={previews}
      reading={reading}
      starting={starting}
      error={error}
      onExit={async () => {
        await putProject(current.current);
        props.onExit();
      }}
      onSwitchMode={(mode) => {
        if (isCreative(latest.current.mode) && isCreative(mode)) {
          // another kind of work: said, and SocriaUX thinks again about what it needs
          settle();
          change((s) => said({ ...s, mode, modeBy: 'person' }, { from: 'person', kind: 'reply', text: `Make it a ${mode === 'board' ? 'campaign' : mode} instead.` }));
          void turn();
          return;
        }
        change((s) => switchMode(s, mode));
        void after();
      }}
    />
  );
}
