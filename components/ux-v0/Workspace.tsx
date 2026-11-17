'use client';
// components/ux-v0/Workspace.tsx — one SocriaUX v0 project, open.
//
// The design is the workspace. In Create: what you want to make → a question
// at a time over a growing moodboard → a brief you edit and approve → a
// generated design you inspect, question and change — with an art-direction
// step between the brief and the design (three visual languages to take,
// change, lock or leave to SocriaUX), and every generation drawn offscreen at
// desktop and phone widths, measured, and revised in at most two rounds
// before it is shown (the Checks tab says what was found). In Critique: a file you
// bring → the design on the canvas → an element or an area selected → a
// comment → a reasoning card attached to it. The rail holds what supports the
// design (cards, the selection, the brief, the history); the composer at the
// foot always comments on something specific.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { INSPECTOR_SOURCE } from '@/lib/ux-v0/inspector';
import { renderDesign } from '@/lib/ux-v0/render';
import { LOCK_LABEL, briefKey, languageOf, normalizeDirection, proposeDirections, type ArtDirection, type LockGroup } from '@/lib/ux-v0/direction';
import { MAX_REVISION_ROUNDS, evaluateDesign, fixesFor, type Evaluation, type Finding } from '@/lib/ux-v0/evaluate';
import { buildSandboxDoc, makeNonce } from '@/lib/ux-v0/sandbox';
import { applyPatch, normalizeSpec, placeholdersIn, specDigest, type DesignSpec, type Patch } from '@/lib/ux-v0/spec';
import { getArtifact, putArtifact } from '@/lib/ux-v0/store';
import type { Aspect } from '@/lib/ux-v0/discovery';
import {
  VIEWPORT_WIDTH,
  addUsage,
  currentSpec,
  fileId,
  uid,
  type CardTurn,
  type DesignBrief,
  type DesignProject,
  type DiscoveryQuestion,
  type ImportedArtifact,
  type MoodCategory,
  type MoodboardRef,
  type Palette,
  type ReasoningCard,
  type Reasoning,
  type RefState,
  type SelectionContext,
  type TypePair,
  type Understanding,
  type Usage,
  type Viewport,
} from '@/lib/ux-v0/types';
import { interleave, searchOpenverse } from '@/lib/ux-v0/image-search';
import { post } from './api';
import { BriefDoc } from './BriefDoc';
import { CardsRail } from './Cards';
import { DirectionBoard } from './DirectionBoard';
import { measurePage } from './measure';
import { Composer, type ComposeMode } from './Composer';
import { QuestionBand, QuestionsRail } from './Discovery';
import { checkFile, fetchOriginal, imageSize, keepOriginal } from './files';
import { Inspect } from './Inspect';
import { elementSelection } from '@/lib/ux-v0/selection';
import { Moodboard } from './Moodboard';
import { Stage, type SelectMode, type StageHandle } from './Stage';
import { SAVE_WORDS, useV0Project } from './useV0Project';

type View = 'intent' | 'import' | 'discovery' | 'brief' | 'direction' | 'design';
type Rail = 'questions' | 'reasoning' | 'selection' | 'checks' | 'history' | 'file';

/** What the last look at the drawn design found, and what it fixed on its own. */
interface Checks {
  running: boolean;
  ev: Evaluation | null;
  fixed: string[];
  /** the version it was about */
  version: number;
}

interface Notice {
  text: string;
  kind: 'info' | 'error';
  signIn?: boolean;
  acts?: { label: string; run: () => void; strong?: boolean }[];
}

const nameFrom = (intent: string) => {
  const t = intent.replace(/\s+/g, ' ').trim().replace(/^(an?|the)\s+/i, '');
  return t.length > 48 ? `${t.slice(0, 47)}…` : t.charAt(0).toUpperCase() + t.slice(1);
};

const EXAMPLES = ['A premium coffee shop website', 'A landing page for a university student society', 'A SaaS analytics dashboard', 'A personal portfolio for an illustrator', 'A mobile app screen for booking classes'];

export function Workspace({ initial, signedIn, onExit, startIntent, startFile }: { initial: DesignProject; signedIn: boolean; onExit: () => void; startIntent?: string; startFile?: File | null }) {
  const { project, update, save, current } = useV0Project(initial, signedIn);
  const spec = currentSpec(project);
  const art = project.artifact;
  const imported = art?.type === 'imported' ? art : null;

  const [view, setView] = useState<View>(() =>
    initial.mode === 'critique' ? (initial.artifact ? 'design' : 'import') : currentSpec(initial) ? 'design' : initial.direction.options.length && initial.brief.approved ? 'direction' : initial.brief.doc ? 'brief' : initial.intent ? 'discovery' : 'intent'
  );
  const [rail, setRail] = useState<Rail>(() => (initial.mode === 'create' && !currentSpec(initial) ? 'questions' : 'reasoning'));
  const [selection, setSelection] = useState<SelectionContext | null>(null);
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [mode, setMode] = useState<SelectMode>(imported && imported.kind !== 'html' ? 'area' : 'element');
  const [composeMode, setComposeMode] = useState<ComposeMode>(initial.mode === 'create' ? 'change' : 'ask');
  const [text, setText] = useState('');
  const [intentText, setIntentText] = useState(startIntent ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState<string | null>(null);
  const [imgError, setImgError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingTurn, setPendingTurn] = useState<string | null>(null);
  const [fileHtml, setFileHtml] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileGone, setFileGone] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [checks, setChecks] = useState<Checks | null>(null);
  const [dirNote, setDirNote] = useState('');
  const stage = useRef<StageHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nonce = useMemo(() => makeNonce(), []);
  const started = useRef(false);

  const say = useCallback((text: string, kind: Notice['kind'] = 'info', extra: Partial<Notice> = {}) => setNotice({ text, kind, ...extra }), []);
  // what a screen reader hears: each selection as it is made, or why a step went nowhere
  const [stepNote, setStepNote] = useState('');
  // missing linked files are mentioned once per file opened; the full list is under File
  const missingSaid = useRef<string | null>(null);
  useEffect(() => setStepNote(''), [selection?.id]);
  const failed = useCallback((r: { error: string; signIn?: boolean }) => say(r.error, 'error', { signIn: r.signIn }), [say]);

  // ── the imported file, from this browser (or the account) ─────────────
  useEffect(() => {
    if (!imported) return;
    let url: string | null = null;
    let live = true;
    (async () => {
      let rec = await getArtifact(imported.id);
      if (!rec && imported.kept === 'account' && signedIn) {
        const blob = await fetchOriginal(imported.id);
        if (blob) {
          rec = { id: imported.id, name: imported.name, type: blob.type, data: blob, bytes: blob.size, createdAt: Date.now() };
          await putArtifact(rec);
        }
      }
      if (!live) return;
      if (!rec) {
        setFileGone(true);
        return;
      }
      if (imported.kind === 'html') setFileHtml(await rec.data.text());
      else {
        url = URL.createObjectURL(rec.data);
        setFileUrl(url);
      }
    })();
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [imported?.id, imported?.kind, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── what the canvas draws ───────────────────────────────────────────
  const rendered = useMemo(() => (spec ? renderDesign(spec, project.moodboard.refs) : null), [spec, project.moodboard.refs]);
  const doc = useMemo(() => {
    const parse = (s: string) => new DOMParser().parseFromString(s, 'text/html');
    if (rendered && !imported) return buildSandboxDoc(rendered.html, { parse, runScripts: false, nonce, inspector: INSPECTOR_SOURCE }).doc;
    if (imported?.kind === 'html' && fileHtml !== null) return buildSandboxDoc(fileHtml, { parse, runScripts: imported.runScripts, nonce, inspector: INSPECTOR_SOURCE }).doc;
    return null;
  }, [rendered, imported, fileHtml, nonce]);
  const placeholders = useMemo(() => (spec ? placeholdersIn(spec) : []), [spec]);

  // ── discovery ───────────────────────────────────────────────────────
  // the keyed libraries the server can ask (Unsplash, Pexels): null until it says, [] when none are set
  const libraries = useRef<string[] | null>(null);
  const fetchImages = useCallback(
    async (queries: { category: MoodCategory; query: string; page?: number }[], per = 6): Promise<MoodboardRef[]> => {
      if (!queries.length) return [];
      const p = current.current;
      const qs = queries.slice(0, 6).map((q) => ({ ...q, page: q.page ?? p.moodboard.queries.find((x) => x.query === q.query)?.page ?? 1 }));
      setImgBusy('Looking for images…');
      setImgError('');
      const seen = new Set(p.moodboard.seen);
      // the libraries with keys from the server, which also checks the person is signed in;
      // Openverse from this browser, which has its own allowance there
      const askServer = libraries.current === null || libraries.current.length > 0;
      const [server, open] = await Promise.all([
        askServer
          ? post<{ libraries?: string[]; results: { category: MoodCategory; query: string; page: number; next?: number; left?: number; refs: MoodboardRef[]; error: string }[] }>('/api/ux-v0/images', {
              projectId: p.id,
              queries: qs,
              seen: p.moodboard.seen,
              per,
            })
          : Promise.resolve(null),
        Promise.all(qs.map((q) => searchOpenverse(q, seen, per).catch(() => ({ refs: [] as MoodboardRef[], next: q.page, left: 0, error: 'The image library could not be reached just now.' })))),
      ]);
      setImgBusy(null);
      if (server && !server.ok && server.signIn) {
        setImgError('Sign in to let SocriaUX find images for the moodboard.');
        return [];
      }
      if (server?.ok) libraries.current = Array.isArray(server.data.libraries) ? server.data.libraries : null;
      const results = qs.map((q, i) => {
        const keyed = server?.ok ? server.data.results.find((x) => x.query === q.query) : undefined;
        const ov = open[i];
        const { taken, left } = interleave([keyed?.refs ?? [], ov.refs], seen, per);
        for (const r of taken) seen.add(r.id);
        const stay = left > 0 || (keyed?.left ?? 0) > 0 || ov.left > 0 || (keyed?.next ?? q.page + 1) === q.page;
        // a library that could not be reached, or was busy, says more than one that found nothing
        const errors = [ov.error, keyed?.error ?? ''].filter(Boolean);
        const error = taken.length ? '' : errors.find((e) => !/^Nothing found/.test(e)) ?? errors[0] ?? 'Nothing found for that.';
        return { ...q, refs: taken, next: stay ? q.page : q.page + 1, error };
      });
      const all = results.flatMap((x) => x.refs);
      update((p2) => {
        const known = new Set(p2.moodboard.refs.map((x) => x.id));
        const add = all.filter((x) => !known.has(x.id));
        const queriesNext = [...p2.moodboard.queries];
        for (const res of results) {
          const k = queriesNext.findIndex((x) => x.query === res.query);
          if (k >= 0) queriesNext[k] = { ...queriesNext[k], page: res.next };
          else queriesNext.push({ category: res.category, query: res.query, page: res.next });
        }
        return { ...p2, moodboard: { ...p2.moodboard, refs: [...p2.moodboard.refs, ...add], seen: [...new Set([...p2.moodboard.seen, ...add.map((x) => x.id)])], queries: queriesNext.slice(-60) } };
      });
      if (!all.length) setImgError(results.find((x) => x.error)?.error ?? 'Nothing found for that.');
      return all;
    },
    [update, current]
  );

  const discoverTurn = useCallback(
    async (over: { intent?: string; questions?: DiscoveryQuestion[]; remark?: string } = {}) => {
      const p = current.current;
      setBusy('Thinking about what to ask next…');
      const r = await post<{
        understanding: Understanding;
        questions: DiscoveryQuestion[];
        queries: { category: MoodCategory; query: string }[];
        palettes: Palette[];
        type: TypePair[];
        ready: boolean;
        note: string;
        usage: Usage;
      }>('/api/ux-v0/discover', {
        projectId: p.id,
        action: 'turn',
        intent: over.intent ?? p.intent,
        questions: over.questions ?? p.discovery.questions,
        understanding: p.discovery.understanding,
        moodboard: p.moodboard,
        remark: over.remark ?? '',
      });
      setBusy(null);
      if (!r.ok) return failed(r);
      const d = r.data;
      update((p2) => ({
        ...p2,
        discovery: { questions: [...p2.discovery.questions, ...d.questions].slice(-24), understanding: d.understanding, ready: d.ready, note: d.note },
        moodboard: { ...p2.moodboard, palettes: [...p2.moodboard.palettes, ...d.palettes].slice(-12), type: [...p2.moodboard.type, ...d.type].slice(-12) },
        usage: addUsage(p2.usage, d.usage),
      }));
      if (d.queries.length) await fetchImages(d.queries, 6);
    },
    [current, update, failed, fetchImages]
  );

  const begin = useCallback(
    async (intent: string) => {
      const t = intent.trim();
      if (!t) return;
      update((p) => ({ ...p, intent: t, name: p.name === 'Untitled design' ? nameFrom(t) : p.name }));
      setView('discovery');
      setRail('questions');
      await discoverTurn({ intent: t });
    },
    [update, discoverTurn]
  );

  const currentQuestion = project.discovery.questions.find((q) => !q.answer && !q.skipped) ?? null;

  const answer = useCallback(
    async (qid: string, ans: string, skipped = false) => {
      const p = current.current;
      const questions = p.discovery.questions.map((q) => (q.id === qid ? { ...q, answer: skipped ? '' : ans.trim().slice(0, 800), skipped } : q));
      update((p2) => ({ ...p2, discovery: { ...p2.discovery, questions } }));
      await discoverTurn({ questions });
    },
    [current, update, discoverTurn]
  );

  const setRef = (id: string, state: RefState) => update((p) => ({ ...p, moodboard: { ...p.moodboard, refs: p.moodboard.refs.map((r) => (r.id === id ? { ...r, state } : r)) } }));
  const replaceRef = async (ref: MoodboardRef) => {
    setRef(ref.id, 'rejected');
    const got = await fetchImages([{ category: ref.category, query: ref.query }], 1);
    // the state as it is now, not as this render saw it: a sign-in or provider error stands
    if (!got.length) setImgError((e) => e || 'No other image for that; try Another direction.');
  };
  const moreImages = () => {
    const recent = current.current.moodboard.queries.slice(-3);
    fetchImages(recent.map((q) => ({ category: q.category, query: q.query, page: q.page })), 6);
  };
  /** more from the searches behind one group of the board */
  const moreLike = (category: MoodCategory) => {
    const recent = current.current.moodboard.queries.filter((q) => q.category === category).slice(-2);
    if (!recent.length) return setImgError('Search for something first, or ask for another direction.');
    fetchImages(recent.map((q) => ({ category: q.category, query: q.query, page: q.page })), 6);
  };
  /** the designer's own search, in any of the libraries */
  const searchBoard = (category: MoodCategory, query: string) => {
    const q = query.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (q) fetchImages([{ category, query: q }], 8);
  };
  const direction = async (aspect: Aspect) => {
    const p = current.current;
    setImgBusy('Finding another direction…');
    const r = await post<{ direction: string; queries: { category: MoodCategory; query: string }[]; palettes: Palette[]; type: TypePair[]; usage: Usage }>('/api/ux-v0/discover', {
      projectId: p.id,
      action: 'direction',
      aspect,
      intent: p.intent,
      questions: p.discovery.questions,
      understanding: p.discovery.understanding,
      moodboard: p.moodboard,
    });
    setImgBusy(null);
    if (!r.ok) return setImgError(r.error);
    const d = r.data;
    update((p2) => ({ ...p2, moodboard: { ...p2.moodboard, palettes: [...p2.moodboard.palettes, ...d.palettes].slice(-12), type: [...p2.moodboard.type, ...d.type].slice(-12) }, usage: addUsage(p2.usage, d.usage) }));
    if (d.direction) say(`Another direction: ${d.direction}`);
    if (d.queries.length) await fetchImages(d.queries, 6);
  };

  // ── the brief ───────────────────────────────────────────────────────
  const writeBrief = async (instruction = '') => {
    const p = current.current;
    const refining = !!instruction && !!p.brief.doc;
    setBusy(refining ? 'Changing the brief…' : 'Writing the brief…');
    const r = await post<{ brief: DesignBrief; queries?: { category: MoodCategory; query: string }[]; usage: Usage }>('/api/ux-v0/brief', {
      projectId: p.id,
      action: refining ? 'refine' : 'synthesize',
      intent: p.intent,
      understanding: p.discovery.understanding,
      questions: p.discovery.questions,
      moodboard: p.moodboard,
      current: p.brief.doc,
      instruction,
    });
    setBusy(null);
    if (!r.ok) return failed(r);
    update((p2) => ({ ...p2, brief: { doc: r.data.brief, approved: false, version: p2.brief.version + 1 }, usage: addUsage(p2.usage, r.data.usage) }));
    setView('brief');
    if (!refining) return;
    say('The brief was changed as you asked. Check it, then approve.');
    // the visual direction moved: the board follows, with images to keep or remove
    const qs = r.data.queries ?? [];
    if (qs.length) {
      const got = await fetchImages(qs, 4);
      if (got.length) say(`The brief was changed, and its visual direction moved: ${got.length} new image${got.length === 1 ? '' : 's'} on the moodboard to keep or remove.`, 'info', { acts: [{ label: 'See the moodboard', run: () => setView('discovery') }] });
    }
  };

  // ── art direction ───────────────────────────────────────────────────
  // The engine proposes at once, here, for nothing; when signed in, SocriaUX then writes each
  // direction's concept and voice for this brand. Edits lock what they touch.
  const directionAsk = (p: DesignProject, again: boolean) => {
    const st = p.direction;
    const base = st.options.find((o) => o.locks.length) ?? (st.chosen && st.chosen.locks.length ? st.chosen : null);
    const round = again ? st.round + 1 : st.round;
    const seen = again ? [...new Set([...st.seen, ...st.options.map((o) => o.language)])] : st.seen;
    return { brief: p.brief.doc!, notes: st.notes, avoid: st.avoid, base, round, seen };
  };

  const proposeDirectionsFor = async (again: boolean) => {
    const p = current.current;
    if (!p.brief.doc) return;
    const ask = directionAsk(p, again);
    const options = proposeDirections(ask);
    update((p2) => ({ ...p2, direction: { ...p2.direction, options, round: ask.round, seen: [...new Set([...ask.seen, ...options.map((o) => o.language)])].slice(-24), forBrief: briefKey(p.brief.doc!) } }));
    setDirNote('Writing each direction for this brand…');
    const r = await post<{ options: ArtDirection[]; usage: Usage }>('/api/ux-v0/direct', { projectId: p.id, ...ask, base: ask.base });
    if (!r.ok) return setDirNote(r.signIn ? 'Drawn by SocriaUX’s direction engine. Sign in for concepts written for this brand.' : 'Drawn by SocriaUX’s direction engine; the written concepts could not be fetched just now.');
    setDirNote('');
    // a direction the designer has already changed stays theirs
    update((p2) => ({
      ...p2,
      direction: {
        ...p2.direction,
        options: p2.direction.options.map((o, i) => {
          const written = normalizeDirection(r.data.options?.[i]);
          return o.source === 'person' || !written || written.language !== o.language ? o : { ...written, id: o.id, locks: o.locks };
        }),
      },
      usage: addUsage(p2.usage, r.data.usage),
    }));
  };

  const openDirection = () => {
    const p = current.current;
    if (!p.brief.doc) return;
    update((p2) => ({ ...p2, brief: { ...p2.brief, approved: true } }));
    setView('direction');
    // none yet, or made for a brief that has since changed
    if (!p.direction.options.length || p.direction.forBrief !== briefKey(p.brief.doc)) proposeDirectionsFor(false);
  };

  const editDirection = (id: string, next: ArtDirection, group: LockGroup) =>
    update((p) => ({ ...p, direction: { ...p.direction, options: p.direction.options.map((o) => (o.id === id ? { ...next, locks: [...new Set([...o.locks, group])], source: 'person' } : o)) } }));

  const lockDirection = (id: string, group: LockGroup, on: boolean) =>
    update((p) => ({ ...p, direction: { ...p.direction, options: p.direction.options.map((o) => (o.id === id ? { ...o, locks: on ? [...new Set([...o.locks, group])] : o.locks.filter((g) => g !== group) } : o)) } }));

  const approveDirection = (d: ArtDirection) => {
    update((p) => ({ ...p, direction: { ...p.direction, chosen: d, approved: true } }));
    generate('', d);
  };

  // ── looking at what was drawn ───────────────────────────────────────
  // Drawn offscreen at 1280 and 390 px, measured, read. With `autofix`, the fixes that need no
  // words are applied — at most two rounds, never to what the designer locked or fixed — before
  // anyone sees the page. Otherwise the findings are only reported.
  const inspect = async (from: DesignSpec, autofix: boolean): Promise<{ spec: DesignSpec; fixed: string[]; ev: Evaluation }> => {
    const locks = current.current.direction.chosen?.locks ?? [];
    const measureAt = async (s: DesignSpec) => {
      const html = renderDesign(s, current.current.moodboard.refs).html;
      const [desktop, phone] = await Promise.all([measurePage(html, 1280, 900, nonce), measurePage(html, 390, 844, nonce)]);
      return evaluateDesign(s, { desktop, phone }, locks);
    };
    let spec = from;
    const fixed: string[] = [];
    let ev = await measureAt(spec);
    for (let round = 0; autofix && round < MAX_REVISION_ROUNDS; round++) {
      const fixes = fixesFor(ev);
      if (!fixes.length) break;
      for (const f of fixes) {
        const res = applyPatch(spec, f.patch, current.current.moodboard);
        if (res.ok) (spec = res.spec), fixed.push(f.patch.summary);
      }
      ev = await measureAt(spec);
    }
    return { spec, fixed, ev };
  };

  /** Check the design as it stands, and say what was found (nothing is changed). */
  const runChecks = async (from: DesignSpec) => {
    setChecks((c) => ({ running: true, ev: c?.ev ?? null, fixed: [], version: from.version }));
    const r = await inspect(from, false);
    setChecks({ running: false, ev: r.ev, fixed: [], version: from.version });
  };

  // ── generating and changing the design ──────────────────────────────
  const generate = async (dir = '', art: ArtDirection | null = null) => {
    const p = current.current;
    if (!p.brief.doc) return;
    const approved = art ?? (p.direction.approved ? p.direction.chosen : null);
    setBusy(approved ? `Designing in the “${approved.name}” direction…` : 'Designing from the brief…');
    const version = (p.specs[p.specs.length - 1]?.version ?? 0) + 1;
    const r = await post<{ spec: DesignSpec; artDirection?: ArtDirection; placeholders: string[]; usage: Usage }>('/api/ux-v0/generate', { projectId: p.id, brief: p.brief.doc, moodboard: p.moodboard, direction: dir, artDirection: approved, version });
    setBusy(null);
    if (!r.ok) return failed(r);
    const fresh = normalizeSpec(r.data.spec, current.current.moodboard);
    if (!fresh) return say('The design that came back did not hold together. Nothing changed; try again.', 'error');
    // before it is shown: drawn at desktop and phone widths, measured, and fixed where no words are needed
    setBusy('Checking it at desktop and phone widths…');
    setChecks({ running: true, ev: null, fixed: [], version: fresh.version });
    const checked = await inspect(fresh, true);
    setBusy(null);
    const kept: DesignSpec | null = checked.fixed.length
      ? { ...checked.spec, version: fresh.version + 1, reason: `Checked at desktop and phone: ${checked.fixed.length} fix${checked.fixed.length === 1 ? '' : 'es'}`, createdAt: Date.now() }
      : null;
    setChecks({ running: false, ev: checked.ev, fixed: checked.fixed, version: (kept ?? fresh).version });
    update((p2) => {
      const specs = [...p2.specs, fresh, ...(kept ? [kept] : [])].slice(-30);
      const used = r.data.artDirection ?? null;
      return {
        ...p2,
        specs,
        specIndex: specs.length - 1,
        artifact: { type: 'generated', createdAt: Date.now() },
        brief: { ...p2.brief, approved: true },
        // the direction the design follows, as the server applied it (revised in words, locks kept)
        direction: used ? { ...p2.direction, chosen: { ...used, locks: approved?.locks ?? used.locks }, approved: true } : p2.direction,
        usage: addUsage(p2.usage, r.data.usage),
      };
    });
    setSelection(null);
    setActiveCard(null);
    setView('design');
    setRail('checks');
    setMode('element');
    setComposeMode('change');
    const ph = r.data.placeholders;
    say(ph.length ? `Designed. ${ph.length} placeholder${ph.length === 1 ? '' : 's'} for facts only you have: ${ph.slice(0, 5).join(', ')}${ph.length > 5 ? '…' : ''}` : 'Designed from the brief. Select any part to question or change it.');
  };

  const applyLocal = useCallback(
    (patch: Patch, label: string) => {
      const p = current.current;
      const s = currentSpec(p);
      if (!s) return;
      const res = applyPatch(s, patch, p.moodboard);
      if (!res.ok) return say(`That change could not be applied: ${res.error}`, 'error');
      update((p2) => {
        const specs = [...p2.specs.slice(0, p2.specIndex + 1), res.spec].slice(-30);
        // what the designer changes in the look becomes the direction's: a later generation keeps it
        const chosen = p2.direction.chosen && (patch.op === 'tokens' || patch.op === 'look') ? { ...p2.direction.chosen, tokens: res.spec.tokens, look: res.spec.look, source: 'person' as const } : p2.direction.chosen;
        return { ...p2, specs, specIndex: specs.length - 1, direction: { ...p2.direction, chosen } };
      });
      setSelection(null);
      say(`Changed: ${label || patch.summary || patch.op}.`, 'info', { acts: [{ label: 'Undo', run: () => stepVersion(-1) }] });
      runChecks(res.spec);
    },
    [current, update, say] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const refine = async (comment: string) => {
    const p = current.current;
    const s = currentSpec(p);
    if (!s) return;
    setBusy('Working out the change…');
    const r = await post<{ understood: string; challenge: string; question: string; regenerate: string; patch: Patch; applies: boolean; locked?: LockGroup[]; error: string; usage: Usage }>('/api/ux-v0/refine', {
      projectId: p.id,
      brief: p.brief.doc,
      spec: s,
      moodboard: p.moodboard,
      selection,
      comment,
      force: false,
      locks: p.direction.chosen?.locks ?? [],
    });
    setBusy(null);
    if (!r.ok) return failed(r);
    const d = r.data;
    update((p2) => ({ ...p2, usage: addUsage(p2.usage, d.usage) }));
    if (d.question) return say(d.question, 'info');
    if (d.regenerate)
      return say(`That reads as a new direction rather than a change: ${d.regenerate}`, 'info', {
        acts: [
          { label: 'Generate again in this direction', run: () => generate(d.regenerate), strong: true },
          { label: 'Not now', run: () => setNotice(null) },
        ],
      });
    if (!d.applies) return say(d.error ? `That change could not be applied: ${d.error}` : 'SocriaUX could not turn that into a change. Try saying it more specifically.', 'error');
    if (d.challenge)
      return say(d.challenge, 'info', {
        acts: [
          { label: 'Apply anyway', run: () => (applyLocal(d.patch, d.understood), undefined), strong: true },
          { label: 'Keep it as it is', run: () => setNotice(null) },
        ],
      });
    applyLocal(d.patch, d.understood);
  };

  const stepVersion = (dir: -1 | 1) => {
    update((p) => {
      const i = Math.max(0, Math.min(p.specs.length - 1, p.specIndex + dir));
      return i === p.specIndex ? p : { ...p, specIndex: i };
    });
    setSelection(null);
  };

  // ── critique: cards ─────────────────────────────────────────────────
  const runTurn = useCallback(
    async (cardId: string, turn: CardTurn, history: CardTurn[], sel: SelectionContext) => {
      const p = current.current;
      const a = p.artifact;
      const imp = a?.type === 'imported' ? a : null;
      const s = currentSpec(p);
      const wantsSummary = !!imp && imp.kind !== 'html' && !imp.summary;
      const thumb = wantsSummary ? stage.current?.thumbnail() ?? null : null;
      const sectionId = sel.element?.ux?.section || sel.region?.elements.find((e) => e.ux)?.ux?.section || '';
      const section = s && sectionId ? JSON.stringify(s.sections.find((x) => x.id === sectionId) ?? '').slice(0, 1200) : '';
      setPendingTurn(turn.id);
      const r = await post<{ reasoning: Reasoning; artifactSummary: string | null; usage: Usage }>('/api/ux-v0/critique', {
        projectId: p.id,
        selection: sel,
        comment: turn.comment,
        history,
        brief: p.brief.doc,
        summary: imp ? imp.summary : s ? specDigest(s).slice(0, 2400) : '',
        section,
        kind: imp ? imp.kind : 'generated',
        name: imp ? imp.name : s?.title ?? p.name,
        viewport: sel.viewport,
        thumb,
      });
      setPendingTurn(null);
      update((p2) => ({
        ...p2,
        cards: p2.cards.map((c) =>
          c.id !== cardId
            ? c
            : { ...c, updatedAt: Date.now(), turns: c.turns.map((t) => (t.id !== turn.id ? t : r.ok ? { ...t, reasoning: r.data.reasoning, usage: r.data.usage, error: '' } : { ...t, error: r.error })) }
        ),
        usage: r.ok ? addUsage(p2.usage, r.data.usage) : p2.usage,
        artifact: r.ok && r.data.artifactSummary && p2.artifact?.type === 'imported' ? { ...p2.artifact, summary: r.data.artifactSummary } : p2.artifact,
      }));
      if (!r.ok && r.signIn) failed(r);
    },
    [current, update, failed]
  );

  const comment = async (words: string) => {
    const p = current.current;
    const card = activeCard ? p.cards.find((c) => c.id === activeCard) : null;
    const turn: CardTurn = { id: uid('t'), comment: words, reasoning: null, error: '', usage: null, createdAt: Date.now() };
    if (card) {
      update((p2) => ({ ...p2, cards: p2.cards.map((c) => (c.id === card.id ? { ...c, updatedAt: Date.now(), turns: [...c.turns, turn].slice(-12) } : c)) }));
      setRail('reasoning');
      await runTurn(card.id, turn, card.turns, card.selection);
      return;
    }
    if (!selection) return say('Select an element or draw an area first, so the comment is about something specific.', 'info');
    const n = p.cards.reduce((m, c) => Math.max(m, c.n), 0) + 1;
    const c: ReasoningCard = { id: uid('card'), n, selection, turns: [turn], state: 'open', createdAt: Date.now(), updatedAt: Date.now() };
    update((p2) => ({ ...p2, cards: [...p2.cards, c].slice(-120) }));
    setActiveCard(c.id);
    setRail('reasoning');
    await runTurn(c.id, turn, [], selection);
  };

  const retry = (cardId: string, turnId: string) => {
    const c = current.current.cards.find((x) => x.id === cardId);
    const i = c ? c.turns.findIndex((t) => t.id === turnId) : -1;
    if (!c || i < 0) return;
    const t = { ...c.turns[i], error: '' };
    update((p2) => ({ ...p2, cards: p2.cards.map((x) => (x.id === cardId ? { ...x, turns: x.turns.map((y) => (y.id === turnId ? t : y)) } : x)) }));
    runTurn(cardId, t, c.turns.slice(0, i), c.selection);
  };

  const showCard = (id: string) => {
    const c = current.current.cards.find((x) => x.id === id);
    if (!c) return;
    if (c.selection.viewport && c.selection.viewport !== current.current.viewport) update((p) => ({ ...p, viewport: c.selection.viewport as Viewport }), false);
    setSelection(c.selection);
    setActiveCard(id);
    setView('design');
    setRail('reasoning');
  };

  // ── import ──────────────────────────────────────────────────────────
  const importFile = useCallback(
    async (file: File) => {
      const checked = await checkFile(file);
      if (!checked.ok) return say(checked.error, 'error');
      const id = fileId();
      let size = { width: 0, height: 0 };
      if (checked.kind !== 'html') {
        try {
          size = await imageSize(file);
        } catch {
          return say('That image could not be read. Is it a complete file?', 'error');
        }
      }
      const kept = await putArtifact({ id, name: file.name, type: checked.type, data: file, bytes: file.size, createdAt: Date.now() });
      const artifact: ImportedArtifact = {
        type: 'imported',
        id,
        kind: checked.kind,
        name: file.name.slice(0, 160),
        bytes: file.size,
        width: size.width,
        height: size.height,
        runScripts: false,
        kept: 'device',
        missing: [],
        summary: '',
        createdAt: Date.now(),
      };
      update((p) => ({ ...p, artifact, name: p.name === 'Design critique' ? file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 80) : p.name, cards: [] }));
      if (checked.kind === 'html') setFileHtml(await file.text());
      else setFileUrl(URL.createObjectURL(file));
      setFileGone(false);
      setSelection(null);
      setMode(checked.kind === 'html' ? 'element' : 'area');
      setView('design');
      setRail('reasoning');
      if (!kept.ok) say(kept.reason === 'quota' ? 'This browser’s storage is full: the design is open, but will not be kept here.' : 'This browser will not keep the design after you leave.', 'error');
      if (signedIn) {
        const where = await keepOriginal(id, file, file.name, checked.type);
        update((p) => (p.artifact?.type === 'imported' && p.artifact.id === id ? { ...p, artifact: { ...p.artifact, kept: where } } : p), false);
      }
    },
    [say, update, signedIn]
  );

  // ── starting where the home screen left off ─────────────────────────
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (startFile) importFile(startFile);
    else if (startIntent && !initial.intent) begin(startIntent);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── viewports ───────────────────────────────────────────────────────
  // The page reflows at the new width; a selected element is found again by its selector (an area
  // no longer covers the same content, so it is let go).
  const switchViewport = (v: Viewport) => {
    const keep = selection?.type === 'element' ? selection.element?.selector ?? '' : '';
    update((p) => ({ ...p, viewport: v }), false);
    setSelection(null);
    if (!keep) return;
    const artifactId = imported ? imported.id : 'generated';
    const tryAt = async (delays: number[]) => {
      for (const ms of delays) {
        await new Promise((r) => setTimeout(r, ms));
        if (current.current.viewport !== v) return;
        const c = await stage.current?.repick(keep);
        if (c) return setSelection(elementSelection(c, artifactId, v));
      }
    };
    tryAt([250, 400, 800]);
  };

  // ── keys ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (e.key === 'Escape') {
        if (typing) return;
        setSelection(null);
        setActiveCard(null);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.metaKey || e.ctrlKey) && view === 'design' && !typing) {
          if (e.key === '=' || e.key === '+') (e.preventDefault(), stage.current?.zoomBy(1.2));
          else if (e.key === '-') (e.preventDefault(), stage.current?.zoomBy(1 / 1.2));
          else if (e.key === '0') (e.preventDefault(), stage.current?.fit());
        }
        return;
      }
      if (view !== 'design') return;
      if (e.key === 'e' && (!imported || imported.kind === 'html')) setMode('element');
      else if (e.key === 'a') setMode('area');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, imported]);

  // ── the composer ────────────────────────────────────────────────────
  const send = async () => {
    const words = text.trim();
    if (!words) return;
    setText('');
    setNotice(null);
    if (view === 'discovery') {
      if (currentQuestion) await answer(currentQuestion.id, words);
      else await discoverTurn({ remark: words });
      return;
    }
    if (view === 'brief') return writeBrief(words);
    if (view === 'design') {
      if (spec && !imported && composeMode === 'change' && !activeCard) return refine(words);
      return comment(words);
    }
  };

  const card = activeCard ? project.cards.find((c) => c.id === activeCard) ?? null : null;
  const guide =
    view === 'discovery'
      ? currentQuestion
        ? `Answering: ${currentQuestion.question}`
        : 'Tell SocriaUX anything else that matters'
      : view === 'brief'
        ? 'The brief'
        : card
          ? `Replying on card ${card.n}: ${card.selection.label}`
          : selection
            ? `On ${selection.label}`
            : spec && !imported && composeMode === 'change'
              ? 'The whole design'
              : 'Nothing selected: choose Element or Area above';
  const placeholder =
    view === 'discovery'
      ? currentQuestion
        ? 'Your answer, in your words'
        : 'Anything else about what you want to make'
      : view === 'brief'
        ? 'Say what to change in the brief'
        : card
          ? 'Reply, push back, or ask why'
          : composeMode === 'change' && spec && !imported
            ? 'Say what to change — “make the headline shorter”, “warmer accent”'
            : 'Ask about it — “why does this feel cluttered?”';
  const showComposer = view === 'discovery' || view === 'brief' || (view === 'design' && (!!doc || !!fileUrl));

  // ── layout ──────────────────────────────────────────────────────────
  const steps: { id: View; label: string; ok: boolean }[] =
    project.mode === 'create'
      ? [
          { id: 'discovery', label: 'Discovery', ok: !!project.intent },
          { id: 'brief', label: 'Brief', ok: !!project.brief.doc },
          { id: 'direction', label: 'Direction', ok: !!project.brief.doc && (project.brief.approved || project.direction.options.length > 0) },
          { id: 'design', label: 'Design', ok: !!spec },
        ]
      : [];
  const railTabs: { id: Rail; label: string }[] =
    project.mode === 'create'
      ? [
          { id: 'questions', label: 'Questions' },
          ...(spec ? [{ id: 'reasoning' as Rail, label: `Cards${project.cards.length ? ` ${project.cards.filter((c) => c.state !== 'dismissed').length}` : ''}` }] : []),
          ...(spec ? [{ id: 'selection' as Rail, label: 'Selection' }] : []),
          ...(spec ? [{ id: 'checks' as Rail, label: checks?.running ? 'Checking…' : 'Checks' }] : []),
          ...(spec ? [{ id: 'history' as Rail, label: 'Versions' }] : []),
        ]
      : [
          { id: 'reasoning', label: `Cards${project.cards.length ? ` ${project.cards.filter((c) => c.state !== 'dismissed').length}` : ''}` },
          { id: 'selection', label: 'Selection' },
          { id: 'file', label: 'File' },
        ];

  const vpWidth = VIEWPORT_WIDTH[project.viewport];
  const isPage = !!doc;

  return (
    <div className="v0 sb">
      <header className="v0-head">
        <div className="v0-head-l">
          <button type="button" className="v0-home" onClick={onExit} aria-label="All designs">
            <img src="/socria-mark.png" alt="" width={20} height={20} />
            <span className="v0-brand">
              Socria<em>UX</em>
            </span>
            <span className="v0-tag">v0</span>
          </button>
          <span className="v0-slash" aria-hidden="true">
            /
          </span>
          <input className="v0-name" value={project.name} onChange={(e) => update((p) => ({ ...p, name: e.target.value.slice(0, 80) }))} aria-label="Design name" />
        </div>
        {steps.length > 0 && (
          <nav className="sb-seg v0-steps" aria-label="Steps">
            {steps.map((s) => (
              <button key={s.id} type="button" className={`sb-seg-item${view === s.id ? ' is-on' : ''}`} aria-current={view === s.id ? 'step' : undefined} disabled={!s.ok} onClick={() => setView(s.id)}>
                {s.label}
              </button>
            ))}
          </nav>
        )}
        <div className="v0-head-r">
          <span className="v0-cost" title={`${project.usage.input.toLocaleString()} tokens read, ${project.usage.output.toLocaleString()} written`}>
            {project.usage.calls ? `US$${project.usage.cost.toFixed(4)} · ${project.usage.calls} call${project.usage.calls === 1 ? '' : 's'}` : ''}
          </span>
          <span className={`v0-save s-${save}`} role="status">
            {SAVE_WORDS[save]}
          </span>
          {!signedIn && (
            <a className="sb-link is-meta is-strong" href="/sign-in?redirect_url=/ux-v0">
              Sign in
            </a>
          )}
        </div>
      </header>

      <p className="v0-sr" aria-live="polite" aria-atomic="true">
        {stepNote || (selection ? `Selected: ${selection.label}` : '')}
      </p>
      <div className="v0-work">
        <main className="v0-main">
          {view === 'design' && (isPage || fileUrl) && (
            <div className="v0-toolbar" role="toolbar" aria-label="Canvas">
              <span className="sb-seg is-tight" role="radiogroup" aria-label="Select">
                <button type="button" role="radio" aria-checked={mode === 'element'} className={`sb-seg-item${mode === 'element' ? ' is-on' : ''}`} onClick={() => setMode('element')} disabled={!isPage} title="Select an element (E)">
                  Element
                </button>
                <button type="button" role="radio" aria-checked={mode === 'area'} className={`sb-seg-item${mode === 'area' ? ' is-on' : ''}`} onClick={() => setMode('area')} title="Drag to select an area (A)">
                  Area
                </button>
              </span>
              {isPage && (
                <span className="sb-seg is-tight" role="radiogroup" aria-label="Viewport">
                  {(['desktop', 'tablet', 'mobile'] as Viewport[]).map((v) => (
                    <button key={v} type="button" role="radio" aria-checked={project.viewport === v} className={`sb-seg-item${project.viewport === v ? ' is-on' : ''}`} onClick={() => switchViewport(v)}>
                      {v === 'desktop' ? 'Desktop' : v === 'tablet' ? 'Tablet' : 'Mobile'}
                    </button>
                  ))}
                </span>
              )}
              <span className="v0-zoom">
                <button type="button" className="sb-link is-meta" onClick={() => stage.current?.zoomBy(1 / 1.2)} aria-label="Zoom out">
                  −
                </button>
                <button type="button" className="sb-link is-meta v0-zoom-v" onClick={() => stage.current?.fit()} title="Fit to screen (⌘0)">
                  {Math.round(zoom * 100)}%
                </button>
                <button type="button" className="sb-link is-meta" onClick={() => stage.current?.zoomBy(1.2)} aria-label="Zoom in">
                  +
                </button>
              </span>
              {spec && !imported && (
                <span className="v0-zoom">
                  <button type="button" className="sb-link is-meta" onClick={() => stepVersion(-1)} disabled={project.specIndex <= 0}>
                    Undo
                  </button>
                  <button type="button" className="sb-link is-meta" onClick={() => stepVersion(1)} disabled={project.specIndex >= project.specs.length - 1}>
                    Redo
                  </button>
                  <button type="button" className="sb-link is-meta" onClick={() => setView('discovery')}>
                    Moodboard
                  </button>
                </span>
              )}
            </div>
          )}

          <div className="v0-center">
            {view === 'intent' && (
              <div className="v0-intent">
                <span className="sb-label">Create · SocriaUX v0</span>
                <h1 className="v0-intent-q">What do you want to make?</h1>
                <div className="sb-compose-line v0-intent-line">
                  <textarea
                    rows={2}
                    value={intentText}
                    placeholder="A website, a landing page, an app screen — and who it is for, if you know"
                    aria-label="What do you want to make?"
                    onChange={(e) => setIntentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        begin(intentText);
                      }
                    }}
                  />
                  <button type="button" className="sb-btn is-primary" onClick={() => begin(intentText)} disabled={!intentText.trim() || !!busy}>
                    Begin
                  </button>
                </div>
                <div className="v0-examples">
                  {EXAMPLES.map((x) => (
                    <button key={x} type="button" className="sb-link is-meta" onClick={() => setIntentText(x)}>
                      {x}
                    </button>
                  ))}
                </div>
                <p className="v0-quiet">SocriaUX will not generate anything yet. It asks first — a question at a time — and builds a moodboard as the direction becomes clear.</p>
              </div>
            )}

            {view === 'import' && (
              <div
                className="v0-import"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) importFile(f);
                }}
              >
                <span className="sb-label">Critique · SocriaUX v0</span>
                <h1 className="v0-intent-q">Bring a design to look at closely.</h1>
                <p className="v0-body">An HTML file (drawn in a sealed sandbox), or a PNG, JPG or SVG. Then select an element or drag across an area, and say what you see.</p>
                <div className="v0-q-acts">
                  <button type="button" className="sb-btn is-primary" onClick={() => fileInput.current?.click()}>
                    Choose a file
                  </button>
                  <span className="v0-quiet">or drop it here · HTML and SVG up to 2 MB, images up to 15 MB</span>
                </div>
              </div>
            )}

            {view === 'discovery' && (
              <div className="v0-discovery">
                <QuestionBand
                  q={currentQuestion}
                  n={project.discovery.questions.filter((q) => q.answer || q.skipped).length + 1}
                  busy={busy}
                  ready={project.discovery.ready}
                  answered={project.discovery.questions.filter((q) => q.answer).length}
                  note={project.discovery.note}
                  onAnswer={(a) => currentQuestion && answer(currentQuestion.id, a)}
                  onSkip={() => currentQuestion && answer(currentQuestion.id, '', true)}
                  onBrief={() => writeBrief()}
                />
                <Moodboard
                  board={project.moodboard}
                  sample={project.name}
                  busy={imgBusy}
                  error={imgError}
                  onRef={setRef}
                  onReplace={replaceRef}
                  onPalette={(id, state) => update((p) => ({ ...p, moodboard: { ...p.moodboard, palettes: p.moodboard.palettes.map((x) => (x.id === id ? { ...x, state } : x)) } }))}
                  onType={(id, state) => update((p) => ({ ...p, moodboard: { ...p.moodboard, type: p.moodboard.type.map((x) => (x.id === id ? { ...x, state } : x)) } }))}
                  onDirection={direction}
                  onMore={moreImages}
                  onMoreLike={moreLike}
                  onSearch={searchBoard}
                  signedIn={signedIn}
                />
              </div>
            )}

            {view === 'brief' && project.brief.doc && (
              <BriefDoc
                brief={project.brief.doc}
                version={project.brief.version}
                approved={project.brief.approved}
                refs={project.moodboard.refs}
                busy={busy}
                hasDesign={!!spec}
                onChange={(b) => update((p) => ({ ...p, brief: { ...p.brief, doc: b, approved: false } }))}
                onApprove={openDirection}
                onSkip={() => {
                  update((p) => ({ ...p, brief: { ...p.brief, approved: true } }));
                  generate();
                }}
                onBack={() => setView('discovery')}
              />
            )}

            {view === 'direction' && project.brief.doc && (
              <DirectionBoard
                state={project.direction}
                brief={project.brief.doc}
                name={project.name}
                refs={project.moodboard.refs}
                busy={busy}
                note={dirNote}
                onNotes={(notes, avoid) => update((p) => ({ ...p, direction: { ...p.direction, notes: notes.slice(0, 1200), avoid: avoid.slice(0, 400) } }))}
                onAsk={() => proposeDirectionsFor(true)}
                onEdit={editDirection}
                onLock={lockDirection}
                onApprove={approveDirection}
                onAuto={() => project.direction.options[0] && approveDirection(project.direction.options[0])}
                onBack={() => setView('brief')}
              />
            )}

            {view === 'design' && fileGone && <p className="v0-empty v0-center-msg">This design’s file is not in this browser{imported?.kept === 'account' ? ' and could not be fetched from your account' : ''}. Import it again to keep working.</p>}

            {view === 'design' && !fileGone && (isPage || fileUrl) && (
              <Stage
                ref={stage}
                artifactId={imported ? imported.id : 'generated'}
                kind={isPage ? 'page' : 'image'}
                doc={doc ?? undefined}
                imageUrl={fileUrl ?? undefined}
                width={isPage ? vpWidth : imported?.width || 1200}
                height={isPage ? undefined : imported?.height || 800}
                viewport={isPage ? project.viewport : null}
                mode={isPage ? mode : 'area'}
                selection={selection}
                cards={project.cards}
                activeCard={activeCard}
                onSelection={(s) => {
                  setSelection(s);
                  setActiveCard(null);
                  if (s && rail !== 'reasoning' && rail !== 'selection') setRail('selection');
                }}
                onPin={showCard}
                onPageReady={(info) => {
                  if (imported?.kind === 'html') update((p) => (p.artifact?.type === 'imported' ? { ...p, artifact: { ...p.artifact, width: info.width, height: info.height, summary: p.artifact.summary || info.outline } } : p), false);
                }}
                onMissing={(list) => {
                  update((p) => (p.artifact?.type === 'imported' ? { ...p, artifact: { ...p.artifact, missing: list } } : p), false);
                  if (imported && list.length && missingSaid.current !== imported.id) {
                    missingSaid.current = imported.id;
                    say('Some files this page links to could not load, so they are missing from the drawing. They are listed under File.');
                  }
                }}
                onZoom={setZoom}
                title={imported ? imported.name : spec?.title ?? project.name}
              />
            )}
            {view === 'design' && !fileGone && !isPage && !fileUrl && imported && <p className="v0-quiet v0-center-msg">Opening the design…</p>}
          </div>

          {notice && (
            <div className={`v0-notice${notice.kind === 'error' ? ' is-error' : ''}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
              <span>{notice.text}</span>
              {notice.signIn && (
                <a className="sb-link is-meta is-strong" href="/sign-in?redirect_url=/ux-v0">
                  Sign in
                </a>
              )}
              {notice.acts?.map((a) => (
                <button key={a.label} type="button" className={`sb-link is-meta${a.strong ? ' is-strong' : ''}`} onClick={() => (a.run(), setNotice(null))}>
                  {a.label}
                </button>
              ))}
              <button type="button" className="sb-link is-meta v0-notice-x" onClick={() => setNotice(null)} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}

          {showComposer && (
            <Composer
              guide={guide}
              onClearGuide={card ? () => setActiveCard(null) : selection && view === 'design' ? () => setSelection(null) : undefined}
              placeholder={placeholder}
              value={text}
              onChange={setText}
              onSend={send}
              busy={!!busy || !!pendingTurn}
              disabled={view === 'design' && !spec && !imported}
              modes={view === 'design' && spec && !imported && !card ? { value: composeMode, onChange: setComposeMode } : null}
              sendLabel={view === 'discovery' ? 'Answer' : view === 'brief' ? 'Refine' : composeMode === 'change' && spec && !imported && !card ? 'Change' : 'Comment'}
              foot={
                view === 'design' ? (
                  <span>
                    {mode === 'element' && isPage ? 'Click part of the design to select it' : 'Drag across the design to select an area'} · Space to move · Esc to clear
                  </span>
                ) : view === 'discovery' ? (
                  <span>{imgBusy ?? 'Keep, replace or remove images to steer the direction'}</span>
                ) : null
              }
            />
          )}
        </main>

        <aside className="v0-rail" aria-label="Design details">
          <div className="sb-seg is-tight v0-rail-tabs" role="tablist">
            {railTabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={rail === t.id} className={`sb-seg-item${rail === t.id ? ' is-on' : ''}`} onClick={() => setRail(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="v0-rail-scroll">
            {rail === 'questions' && (
              <QuestionsRail
                discovery={project.discovery}
                intent={project.intent}
                onIntent={(v) => (update((p) => ({ ...p, intent: v })), discoverTurn({ intent: v }))}
                onEdit={(id, a) => {
                  const questions = current.current.discovery.questions.map((q) => (q.id === id ? { ...q, answer: a, skipped: false } : q));
                  update((p) => ({ ...p, discovery: { ...p.discovery, questions } }));
                  discoverTurn({ questions });
                }}
              />
            )}
            {rail === 'reasoning' && (
              <CardsRail
                cards={project.cards}
                active={activeCard}
                pendingTurn={pendingTurn}
                onActivate={(id) => {
                  setActiveCard(id);
                  const c = id ? current.current.cards.find((x) => x.id === id) : null;
                  if (c) setSelection(c.selection);
                }}
                onShow={showCard}
                onState={(id, s) => update((p) => ({ ...p, cards: p.cards.map((c) => (c.id === id ? { ...c, state: s, updatedAt: Date.now() } : c)) }))}
                onRetry={retry}
                empty={view === 'design' ? 'Select part of the design and say what you see, or ask why. Each comment becomes a card attached to what it is about.' : 'Cards appear here once there is a design to comment on.'}
              />
            )}
            {rail === 'selection' && (
              <Inspect
                sel={selection}
                onClear={() => setSelection(null)}
                onStep={
                  selection?.element?.selector && isPage
                    ? async (dir) => {
                        const moved = await stage.current?.stepFrom(selection.element!.selector, dir);
                        if (!moved) setStepNote(dir === 'parent' ? 'Nothing above it to select.' : dir === 'child' ? 'Nothing inside it to select.' : `No ${dir === 'next' ? 'next' : 'previous'} element beside it.`);
                      }
                    : undefined
                }
                onPickElement={
                  isPage
                    ? async (sel) => {
                        const c = await stage.current?.repick(sel);
                        if (c) setSelection(elementSelection(c, imported ? imported.id : 'generated', project.viewport));
                      }
                    : undefined
                }
              />
            )}
            {rail === 'checks' && spec && (
              <div className="v0-rail-body">
                {project.direction.chosen && (
                  <section className="v0-cellset">
                    <span className="sb-label">The direction it follows</span>
                    <p className="v0-cell-title">{project.direction.chosen.name}</p>
                    <p className="v0-body">{project.direction.chosen.concept}</p>
                    <p className="v0-quiet">
                      {languageOf(project.direction.chosen.language)?.name ?? 'Its own'} · {spec.tokens.fonts.display} and {spec.tokens.fonts.body}
                      {project.direction.chosen.locks.length ? ` · kept: ${project.direction.chosen.locks.map((g) => LOCK_LABEL[g].toLowerCase()).join(', ')}` : ''}
                    </p>
                    <button type="button" className="sb-link is-meta is-strong" onClick={() => setView('direction')}>
                      Choose a different direction
                    </button>
                  </section>
                )}
                <section className="v0-cellset">
                  <span className="sb-label">Drawn at desktop and phone widths</span>
                  {!checks || (checks.running && !checks.ev) ? (
                    <p className="v0-quiet" role="status">{checks?.running ? 'Measuring the page at 1280 and 390 px…' : 'Not checked yet.'}</p>
                  ) : (
                    <>
                      <div className="v0-scores">
                        <span>
                          <b>{checks.ev?.quality ?? '–'}</b> works
                        </span>
                        <span>
                          <b>{checks.ev?.distinctiveness ?? '–'}</b> its own
                        </span>
                      </div>
                      <p className="v0-quiet" role="status">
                        {checks.running ? 'Measuring again…' : checks.ev?.summary}
                      </p>
                      {!checks.running && checks.version !== spec.version && <p className="v0-quiet">These checks are for version {checks.version}; this is version {spec.version}.</p>}
                    </>
                  )}
                  {checks && checks.fixed.length > 0 && (
                    <>
                      <span className="sb-label v0-sub">Fixed without asking</span>
                      <ul className="v0-plain">
                        {checks.fixed.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                      <p className="v0-quiet">Kept as its own version: Undo shows the design before.</p>
                    </>
                  )}
                </section>
                {checks?.ev && checks.ev.findings.length > 0 && (
                  <section className="v0-cellset">
                    <span className="sb-label">What it found</span>
                    <ul className="v0-findings">
                      {checks.ev.findings.slice(0, 12).map((f: Finding) => (
                        <li key={f.id} className={`is-${f.severity}`}>
                          <span className="v0-finding-k">{f.severity === 'high' ? 'Must fix' : f.severity === 'medium' ? 'Should fix' : 'Worth a look'} · {f.viewport}</span>
                          <span className="v0-body">{f.message}</span>
                          {f.blocked && <span className="v0-quiet">{f.blocked}</span>}
                          <span className="v0-finding-acts">
                            {f.fix && (
                              <button type="button" className="sb-link is-meta is-strong" onClick={() => applyLocal(f.fix!, f.fix!.summary)}>
                                Fix it
                              </button>
                            )}
                            {f.ask && (
                              <button type="button" className="sb-link is-meta" onClick={() => refine(f.ask!)} disabled={!!busy}>
                                Ask SocriaUX to fix it
                              </button>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {checks?.ev && checks.ev.signals.length > 0 && (
                  <section className="v0-cellset">
                    <span className="sb-label">What could make it look generic</span>
                    <ul className="v0-plain">
                      {checks.ev.signals.map((x, i) => (
                        <li key={i}>{x.reason}</li>
                      ))}
                    </ul>
                  </section>
                )}
                <section className="v0-cellset">
                  <button type="button" className="sb-link is-meta" onClick={() => runChecks(spec)} disabled={!!checks?.running}>
                    Check again
                  </button>
                </section>
              </div>
            )}
            {rail === 'history' && (
              <div className="v0-rail-body">
                <section className="v0-cellset">
                  <span className="sb-label">Versions of the design</span>
                  <ol className="v0-versions">
                    {project.specs
                      .map((s, i) => ({ s, i }))
                      .reverse()
                      .map(({ s, i }) => (
                        <li key={`${s.version}-${i}`}>
                          <button type="button" className={`v0-version${i === project.specIndex ? ' is-on' : ''}`} onClick={() => (update((p) => ({ ...p, specIndex: i })), setSelection(null))} aria-current={i === project.specIndex}>
                            <span className="v0-version-n">{s.version}</span>
                            <span>{s.reason || 'A version'}</span>
                          </button>
                        </li>
                      ))}
                  </ol>
                </section>
                {spec && spec.notes.length > 0 && (
                  <section className="v0-cellset">
                    <span className="sb-label">Adjusted for you</span>
                    <ul className="v0-plain">
                      {spec.notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {placeholders.length > 0 && (
                  <section className="v0-cellset">
                    <span className="sb-label">Placeholders to fill</span>
                    <p className="v0-quiet">Facts SocriaUX did not have and would not invent.</p>
                    <ul className="v0-plain">
                      {placeholders.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {rendered && rendered.credits.length > 0 && (
                  <section className="v0-cellset">
                    <span className="sb-label">Image credits on the page</span>
                    <ul className="v0-plain">
                      {rendered.credits.map((c) => (
                        <li key={c.id}>{c.text}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {rendered && (
                  <section className="v0-cellset">
                    <button
                      type="button"
                      className="sb-link is-meta is-strong"
                      onClick={() => {
                        const url = URL.createObjectURL(new Blob([rendered.html], { type: 'text/html' }));
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${(spec?.title || project.name).replace(/[^\w-]+/g, '-').toLowerCase()}.html`;
                        a.click();
                        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }}
                    >
                      Download the page as HTML
                    </button>
                  </section>
                )}
              </div>
            )}
            {rail === 'file' && imported && (
              <div className="v0-rail-body">
                <section className="v0-cellset">
                  <span className="sb-label">The file</span>
                  <dl className="v0-kv">
                    <dt>Name</dt>
                    <dd>{imported.name}</dd>
                    <dt>Kind</dt>
                    <dd>{imported.kind.toUpperCase()}</dd>
                    <dt>Size</dt>
                    <dd>{imported.bytes > 1e6 ? `${(imported.bytes / 1e6).toFixed(1)} MB` : `${Math.round(imported.bytes / 1000)} KB`}</dd>
                    {imported.kind !== 'html' && (
                      <>
                        <dt>Pixels</dt>
                        <dd>
                          {imported.width} × {imported.height}
                        </dd>
                      </>
                    )}
                    <dt>Kept</dt>
                    <dd>{imported.kept === 'account' ? 'With your account and in this browser' : imported.kept === 'failed' ? 'In this browser (keeping it with your account failed)' : 'In this browser'}</dd>
                  </dl>
                </section>
                {imported.kind === 'html' && (
                  <section className="v0-cellset">
                    <span className="sb-label">Page scripts</span>
                    <p className="v0-quiet">The page is drawn in a sealed sandbox: it cannot reach Socria or the network. Its own scripts are off unless you switch them on.</p>
                    <button type="button" className="sb-link is-meta is-strong" onClick={() => update((p) => (p.artifact?.type === 'imported' ? { ...p, artifact: { ...p.artifact, runScripts: !p.artifact.runScripts } } : p))}>
                      {imported.runScripts ? 'Turn the page’s scripts off' : 'Run the page’s scripts (sandboxed)'}
                    </button>
                  </section>
                )}
                {imported.missing.length > 0 && (
                  <section className="v0-cellset">
                    <span className="sb-label">Could not load</span>
                    <p className="v0-quiet">A single HTML file cannot bring the files it links to; these are missing from the drawing.</p>
                    <ul className="v0-plain v0-mono">
                      {imported.missing.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {imported.summary && (
                  <section className="v0-cellset">
                    <span className="sb-label">{imported.kind === 'html' ? 'Outline' : 'SocriaUX’s reading of it'}</span>
                    <p className="v0-body v0-pre">{imported.summary}</p>
                  </section>
                )}
                <section className="v0-cellset">
                  <button type="button" className="sb-link is-meta" onClick={() => fileInput.current?.click()}>
                    Replace the file
                  </button>
                </section>
              </div>
            )}
          </div>
        </aside>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".html,.htm,.png,.jpg,.jpeg,.svg,text/html,image/png,image/jpeg,image/svg+xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
