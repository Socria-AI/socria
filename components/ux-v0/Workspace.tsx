'use client';
// components/ux-v0/Workspace.tsx — one SocriaUX v0 project, open.
//
// The design is the workspace. In Create: what you want to make → a question
// at a time over a growing moodboard → a brief you edit and approve → a
// generated design you inspect, question and change — with an art-direction
// step between the brief and the design (three visual languages to take,
// change, lock or leave to SocriaUX), and every generation drawn offscreen at
// desktop, tablet and phone widths, measured, and revised in at most two rounds
// before it is shown (the Checks tab says what was found). In Critique: a file you
// bring → the design on the canvas → an element or an area selected → a
// comment → a reasoning card attached to it. The rail holds what supports the
// design (cards, the selection, the brief, the history); the composer at the
// foot always comments on something specific.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BEHAVIOR_SOURCE } from '@/lib/ux-v0/behaviors';
import { MOTION_RUNTIME } from '@/lib/ux-v0/motion-runtime';
import { SCENE_RUNTIME } from '@/lib/ux-v0/scene-runtime';
import { INSPECTOR_SOURCE } from '@/lib/ux-v0/inspector';
import { renderDesign } from '@/lib/ux-v0/render';
import { LOCK_LABEL, briefKey, combineDirections, formed, languageOf, lockedChanges, normalizeDirection, proposeDirections, saltOf, type ArtDirection, type LockGroup } from '@/lib/ux-v0/direction';
import { MAX_REVISION_ROUNDS, evaluateDesign, fixesFor, type Evaluation, type Finding } from '@/lib/ux-v0/evaluate';
import { buildSandboxDoc, makeNonce } from '@/lib/ux-v0/sandbox';
import { applyPatch, kindDef, lookFromTokens, normalizeSpec, placeholdersIn, specDigest, type DesignSpec, type Motion, type Patch } from '@/lib/ux-v0/spec';
import { getArtifact, putArtifact } from '@/lib/ux-v0/store';
import type { Aspect } from '@/lib/ux-v0/discovery';
import {
  VIEWPORT_WIDTH,
  acceptDesign,
  addUsage,
  costPerAccepted,
  acceptedEconomics,
  currentSpec,
  fileId,
  normalizeRef,
  uid,
  type CardTurn,
  type DesignBrief,
  type BriefPart,
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
  type UsageTotals,
  type CallKind,
  type Viewport,
  STAGE_LABEL,
} from '@/lib/ux-v0/types';
import { interleave, searchOpenverse } from '@/lib/ux-v0/image-search';
import { operationId, post, type ApiResult, type CallTiming, type Progress } from './api';
import { readQuickEdit } from '@/lib/ux-v0/quick-edit';
import { offSystem } from '@/lib/ux-v0/design-system';
import { warnBefore, type BudgetSeen } from '@/lib/ux-v0/estimates';
import { BriefDoc } from './BriefDoc';
import { CardsRail } from './Cards';
import { DirectionBoard } from './DirectionBoard';
import { measurePage } from './measure';
import { Composer, type ComposeMode } from './Composer';
import { QuestionBand, QuestionsRail } from './Discovery';
import { LivingBrief } from './LivingBrief';
import { isContent, readBoard } from '@/lib/ux-v0/references';
import { PART_LABEL, briefToDesign, changedVisualParts, delegatedParts, mergeDecided } from '@/lib/ux-v0/brief';
import { ADJUST_GROUPS, ADJUST_LABEL, adjust, readAdjust, type Adjust } from '@/lib/ux-v0/refine-local';
import { addUpload, sampleSwatches, useUploads, withUploads } from './uploads';
import { Preview } from './Preview';
import { checkFile, fetchOriginal, imageSize, keepOriginal } from './files';
import { Inspect } from './Inspect';
import { SectionEditor } from './SectionEditor';
import { heldTouched, holdLocked, lockedTouched, setHeld, setLocked } from '@/lib/ux-v0/edit';
import { LAYOUT_QUESTION_ID } from '@/lib/ux-v0/layout';
import { designerWords } from '@/lib/ux-v0/intent';
import { elementSelection } from '@/lib/ux-v0/selection';
import { Moodboard } from './Moodboard';
import { MotionPanel } from './MotionPanel';
import { TypePanel } from './TypePanel';
import { PROC_LABEL, PROC_SAYS, paletteOf, procRef, ratioFor, type ProcKind, type ProcSpec } from '@/lib/ux-v0/assets';
import { DnaStudio, type Measuring } from './DnaStudio';
import { DnaGlyph, dnaWords } from './DnaParts';
import { measureReference } from './ref-dna-loader';
import { addDim, adoptLean, delegateAll, deriveDNA, dnaBasis, dnaConsistency, dnaKeyOf, dnaKeysFor, dnaOfDesign, dnaPatches, dnaValues, lockDim, lockedDnaMoves, releaseDim, removeDim, setDim, DNA_META, type CreativeDNA, type DnaInput, type DnaKey } from '@/lib/ux-v0/dna';
import { auditOriginality, originalityFixes, PATTERN_LABEL, type DesignSignature, type Originality } from '@/lib/ux-v0/originality';
import { intentOf } from '@/lib/ux-v0/intent';
import { listProjects } from '@/lib/ux-v0/store';
import type { PageAudit } from '@/lib/ux-v0/evaluate';
import { Stage, type SelectMode, type StageHandle } from './Stage';
import { PublishPanel } from './PublishPanel';
import { QualityPanel } from './QualityPanel';
import { regressions } from '@/lib/ux-v0/quality';
import { confine, describeBack, readScope, type Scope } from '@/lib/ux-v0/scope';
import { readTargeted } from '@/lib/ux-v0/targeted';
import { capVersions, describeChanges, restoredVersion } from '@/lib/ux-v0/history';
import { SAVE_WORDS, useV0Project } from './useV0Project';
import { applySystem } from '@/lib/ux-v0/dsi/link';
import { fidelityOfTokens } from '@/lib/ux-v0/dsi/fidelity';
import { useLinkedSystem } from './systems/useLinkedSystem';
import { SystemBadge } from './systems/SystemBadge';
import { StudioRail, useRailReply } from './studio/StudioRail';

type View = 'intent' | 'import' | 'discovery' | 'brief' | 'dna' | 'direction' | 'design';

/** A model operation in progress, as the working strip shows it: only what the server has said happened. */
interface Work {
  kind: string;
  label: string;
  op: string;
  startedAt: number;
  phase: 'sending' | 'accepted' | NonNullable<Progress['phase']>;
  model?: string;
  tier?: string;
  chars?: number;
  ctl: AbortController;
}

/** Where an operation has got, in words: each phase only once the server has said it. */
export function phaseWords(w: Pick<Work, 'phase' | 'model' | 'tier' | 'chars'>): string {
  const m = w.model ? `${w.model}${w.tier === 'premium' ? ' (premium)' : ''}` : 'the model';
  switch (w.phase) {
    case 'sending':
      return 'Sending';
    case 'accepted':
      return 'Received';
    case 'checking':
      return 'Checking the budgets';
    case 'asked':
      return `Asked ${m}`;
    case 'thinking':
      return `${m.charAt(0).toUpperCase()}${m.slice(1)} is thinking`;
    case 'writing':
      return `Writing: ${(w.chars ?? 0).toLocaleString()} characters`;
    case 'fallback':
      return `Too slow; asked ${m} instead`;
    case 'finishing':
      return 'Checking the answer';
    default:
      return 'Working';
  }
}

/** The operations running: what each is doing, for how long so far, and a way to stop it. */
function WorkStrip({ work }: { work: Work[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="v0-workstrip" role="group" aria-label="Working">
      {work.map((w) => (
        <div key={w.op} className="v0-workstrip-row">
          <span className="v0-workstrip-dot" aria-hidden="true" />
          <span className="v0-workstrip-what" role="status">
            {w.label} · <span className="v0-workstrip-phase">{phaseWords(w)}</span>
          </span>
          <span className="v0-workstrip-time" aria-hidden="true">
            {Math.max(0, Math.round((now - w.startedAt) / 1000))} s
          </span>
          <button type="button" className="sb-link is-meta v0-workstrip-stop" onClick={() => w.ctl.abort()}>
            Cancel
          </button>
        </div>
      ))}
    </div>
  );
}
type Rail = 'brief' | 'questions' | 'reasoning' | 'selection' | 'checks' | 'history' | 'publish' | 'file';

/** What the last look at the drawn design found, and what it fixed on its own. */
interface Checks {
  running: boolean;
  ev: Evaluation | null;
  fixed: string[];
  /** the version it was about */
  version: number;
  /** the page as measured at desktop width: what the originality audit reads of the rendered page */
  audit?: PageAudit | null;
  /** the page as measured at each width (the quality report reads all three) */
  audits?: { desktop: PageAudit | null; tablet: PageAudit | null; phone: PageAudit | null };
  /** fixes a repair round took back because they made something worse */
  undone?: string[];
}

/**
 * What a reference's measured DNA is kept against, so it is measured once and again only when its picture changes: an
 * upload by its id, a picture SocriaUX made by its recipe (it has no address of its own: it is drawn from the recipe),
 * any other by its address. A picture with nothing to key it would be measured again on every change of the board.
 */
function measuredAs(r: MoodboardRef): string {
  // kept as the measurement keeps it (lib/ux-v0/ref-dna.ts: at most 120 characters), or a long address never matches
  return (r.provider === 'upload' ? r.id : r.provider === 'socriaux' ? r.providerId || r.id : r.thumb || r.url).slice(0, 120);
}

/** What the Creative DNA is read from: the brief, the moodboard, the kind of work, the designer's first words. */
function dnaInputOf(p: DesignProject): DnaInput {
  const brief = p.brief.doc;
  return { brief, board: p.moodboard, kind: brief ? intentOf(brief).kind : 'site', words: p.intent };
}

/** The project's Creative DNA: read again when what it is read from changed; what the designer set or locked stays theirs. */
function dnaOf(p: DesignProject): CreativeDNA | null {
  if (!p.brief.doc && !p.moodboard.refs.some((r) => r.state === 'kept')) return p.dna ?? null;
  const input = dnaInputOf(p);
  if (p.dna && p.dna.basis === dnaBasis(input)) return p.dna;
  return deriveDNA(input, p.dna ?? null);
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
  // the designer's own references, with their addresses: object URLs for the workspace, data URLs for sealed frames
  const uiRefs = useUploads(project.moodboard.refs);
  const frameRefs = useUploads(project.moodboard.refs, true);
  const uiBoard = useMemo(() => ({ ...project.moodboard, refs: uiRefs }), [project.moodboard, uiRefs]);
  const spec = currentSpec(project);
  const art = project.artifact;
  const imported = art?.type === 'imported' ? art : null;

  const [view, setView] = useState<View>(() =>
    initial.mode === 'critique' ? (initial.artifact ? 'design' : 'import') : currentSpec(initial) ? 'design' : initial.direction.options.length && initial.brief.approved ? 'direction' : initial.brief.doc ? 'brief' : initial.intent ? 'discovery' : 'intent'
  );
  const [rail, setRail] = useState<Rail>(() => (initial.mode === 'create' && !currentSpec(initial) ? (initial.brief.doc ? 'questions' : 'brief') : 'reasoning'));
  const [selection, setSelection] = useState<SelectionContext | null>(null);
  // the section being changed directly: it stays open through each change (a change redraws the page and
  // clears the canvas selection), until another part is selected or the selection is cleared
  const [editing, setEditing] = useState<{ sectionId: string; path: string } | null>(null);
  useEffect(() => {
    const ux = selection?.element?.ux;
    if (ux?.section) setEditing({ sectionId: ux.section, path: ux.path });
  }, [selection]);
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [mode, setMode] = useState<SelectMode>(imported && imported.kind !== 'html' ? 'area' : 'element');
  const [composeMode, setComposeMode] = useState<ComposeMode>(initial.mode === 'create' ? 'change' : 'ask');
  const [text, setText] = useState('');
  const [intentText, setIntentText] = useState(startIntent ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  // the model operations running now: what each is, how far it has got (as the server said, never guessed), and its cancel
  const [work, setWork] = useState<Work[]>([]);
  const running = useRef(new Map<string, Work>());
  // what the browser measured of each call (its round trip beside the server's record), for the diagnostics
  const [calls, setCalls] = useState<CallTiming[]>([]);
  // what is spent of each budget, as the last answer said: to ask before a premium step that might not fit
  const budgetSeen = useRef<BudgetSeen | null>(null);
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
  // the Creative DNA's references, each measured once in this browser (lib/ux-v0/ref-dna.ts): what is being measured, what could not be
  const [measuring, setMeasuring] = useState<Measuring>({});
  const measuringNow = useRef(new Set<string>());
  // earlier designs in this browser, for the originality audit's check for repetition
  const [past, setPast] = useState<DesignSignature[]>([]);
  useEffect(() => {
    let live = true;
    listProjects()
      .then((all) => live && setPast(all.filter((x) => x.id !== initial.id && x.signature).map((x) => ({ ...x.signature!, project: x.id, name: x.name }))))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [initial.id]);
  // the Originality Audit of the design on the canvas: one pass of arithmetic, no model (lib/ux-v0/originality.ts)
  const originality = useMemo<Originality | null>(
    () =>
      spec && project.mode === 'create' && !imported
        ? auditOriginality({
            spec,
            brief: project.brief.doc,
            dna: project.dna ?? null,
            audit: checks && checks.version === spec.version ? checks.audit ?? null : null,
            words: [project.direction.notes, project.intent].filter(Boolean).join('. '),
            past,
            locks: project.direction.chosen?.locks ?? [],
            project: project.id,
          })
        : null,
    [spec, project.mode, imported, project.brief.doc, project.dna, checks, project.direction.notes, project.intent, past, project.direction.chosen, project.id]
  );
  // the design in a real viewport, its motion playing
  const [previewing, setPreviewing] = useState(false);
  // visual parts of the brief changed since the design was drawn: what "Apply to the design" would carry over
  const [briefEdits, setBriefEdits] = useState<BriefPart[]>([]);
  const stage = useRef<StageHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nonce = useMemo(() => makeNonce(), []);
  const started = useRef(false);

  const say = useCallback((text: string, kind: Notice['kind'] = 'info', extra: Partial<Notice> = {}) => setNotice({ text, kind, ...extra }), []);
  // the registry design system the website is built in: its brief is built within it as soon as there is one (the
  // website pipeline's own briefWithSystem), and a design takes its tokens; a pinned or newer version is the link's say
  const linked = useLinkedSystem(project.systemLink);
  useEffect(() => {
    const p = current.current;
    if (!linked || !p.systemLink || !p.brief.doc) return;
    const sys = p.brief.doc.system;
    if (sys?.link?.id === linked.rec.id && sys.link.version === p.systemLink.version) return;
    const r = applySystem(p, linked.rec, { pin: p.systemLink.pin });
    if (r.report.outcome === 'error') return;
    update(() => r.project);
    say(r.report.summary);
  }, [linked, project.brief.doc, project.systemLink?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const webFidelity = useMemo(() => {
    const spec = project.specs[project.specIndex];
    return linked && spec ? fidelityOfTokens(spec.tokens, linked.content, { mode: project.systemLink?.mode, overrides: project.systemLink?.overrides }) : null;
  }, [linked, project.specs, project.specIndex, project.systemLink]);
  // what the server said about a call's model or budget: shown at once, and kept in the cost panel
  const [spendNote, setSpendNote] = useState('');
  useEffect(() => {
    const heard = (e: Event) => {
      const t = String((e as CustomEvent).detail ?? '').slice(0, 400);
      if (!t) return;
      setSpendNote(t);
      say(t);
    };
    window.addEventListener('ux-v0-notice', heard);
    return () => window.removeEventListener('ux-v0-notice', heard);
  }, [say]);
  useEffect(() => {
    const timed = (e: Event) => setCalls((c) => [...c, (e as CustomEvent<CallTiming>).detail].slice(-30));
    const budget = (e: Event) => (budgetSeen.current = (e as CustomEvent<BudgetSeen>).detail ?? null);
    window.addEventListener('ux-v0-telemetry', timed);
    window.addEventListener('ux-v0-budget', budget);
    return () => {
      window.removeEventListener('ux-v0-telemetry', timed);
      window.removeEventListener('ux-v0-budget', budget);
    };
  }, []);
  // what a screen reader hears: each selection as it is made, or why a step went nowhere
  const [stepNote, setStepNote] = useState('');
  // missing linked files are mentioned once per file opened; the full list is under File
  const missingSaid = useRef<string | null>(null);
  useEffect(() => setStepNote(''), [selection?.id]);
  const failed = useCallback((r: { error: string; signIn?: boolean; cancelled?: boolean }) => say(r.error, r.cancelled ? 'info' : 'error', { signIn: r.signIn }), [say]);

  /**
   * One model operation: once (a second press while it runs does nothing), cancellable, named for the server
   * (so a retry of the same action is answered once), with its progress shown as the server reports it.
   * Null when the same operation is already running — unless `latestWins`, when the one running is cancelled
   * and this one asked instead (asking for other directions while the last ones are still being written).
   */
  const runOp = useCallback(async <T,>(kind: string, label: string, path: string, body: unknown, latestWins = false): Promise<ApiResult<T> | null> => {
    const already = running.current.get(kind);
    if (already && !latestWins) return null;
    if (already) already.ctl.abort();
    const ctl = new AbortController();
    const op = operationId(kind);
    const w: Work = { kind, label, op, startedAt: Date.now(), phase: 'sending', ctl };
    running.current.set(kind, w);
    setWork((ws) => [...ws, w]);
    const heard = (p: Progress) =>
      setWork((ws) => ws.map((x) => (x.op !== op ? x : { ...x, phase: p.type === 'accepted' ? 'accepted' : p.phase ?? x.phase, model: p.model ?? x.model, tier: p.tier ?? x.tier, chars: p.chars ?? x.chars })));
    try {
      return await post<T>(path, body, { signal: ctl.signal, operationId: op, onProgress: heard });
    } finally {
      if (running.current.get(kind)?.op === op) running.current.delete(kind);
      setWork((ws) => ws.filter((x) => x.op !== op));
    }
  }, []);

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
  const rendered = useMemo(() => (spec ? renderDesign(spec, frameRefs) : null), [spec, frameRefs]);
  const doc = useMemo(() => {
    const parse = (s: string) => new DOMParser().parseFromString(s, 'text/html');
    // a generated design: the inspector, and SocriaUX's own behaviour runtime (never the model's code)
    if (rendered && !imported) return buildSandboxDoc(rendered.html, { parse, runScripts: false, nonce, inspector: `${INSPECTOR_SOURCE}\n${BEHAVIOR_SOURCE}\n${MOTION_RUNTIME}${spec?.sections.some((x) => x.kind === 'scene') ? `\n${SCENE_RUNTIME}` : ''}` }).doc;
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
        // a found picture inspires; it is placed in the design only if the designer marks it as content
        const add = all.filter((x) => !known.has(x.id)).map((x) => ({ ...x, asContent: false }));
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
      const r = await runOp<{
        understanding: Understanding;
        questions: DiscoveryQuestion[];
        queries: { category: MoodCategory; query: string }[];
        palettes: Palette[];
        type: TypePair[];
        ready: boolean;
        note: string;
        usage: Usage;
      }>('discover', 'Thinking about what to ask next', '/api/ux-v0/discover', {
        projectId: p.id,
        action: 'turn',
        intent: over.intent ?? p.intent,
        questions: over.questions ?? p.discovery.questions,
        understanding: p.discovery.understanding,
        moodboard: p.moodboard,
        remark: over.remark ?? '',
      });
      setBusy(null);
      if (!r) return;
      if (!r.ok) return failed(r);
      const d = r.data;
      // never ask again about a topic already answered or left to SocriaUX
      const settled = new Set(p.discovery.questions.filter((q) => (q.answer && !/^(not sure|unsure|don't know|no idea)/i.test(q.answer)) || q.delegated).map((q) => q.topic));
      const fresh = d.questions.filter((q) => !settled.has(q.topic));
      update((p2) => ({
        ...p2,
        discovery: { questions: [...p2.discovery.questions, ...fresh].slice(-24), understanding: d.understanding, ready: d.ready || (!fresh.length && d.questions.length > 0), note: d.note },
        moodboard: { ...p2.moodboard, palettes: [...p2.moodboard.palettes, ...d.palettes].slice(-12), type: [...p2.moodboard.type, ...d.type].slice(-12) },
        usage: addUsage(p2.usage, d.usage),
      }));
      if (d.queries.length) await fetchImages(d.queries, 6);
    },
    [current, update, failed, fetchImages, runOp]
  );

  const begin = useCallback(
    async (intent: string) => {
      const t = intent.trim();
      if (!t) return;
      update((p) => ({ ...p, intent: t, name: p.name === 'Untitled design' ? nameFrom(t) : p.name }));
      setView('discovery');
      setRail('brief');
      await discoverTurn({ intent: t });
    },
    [update, discoverTurn]
  );

  const currentQuestion = project.discovery.questions.find((q) => !q.answer && !q.skipped && !q.delegated) ?? null;

  const answer = useCallback(
    async (qid: string, ans: string, skipped = false, delegated = false) => {
      const p = current.current;
      const questions = p.discovery.questions.map((q) => (q.id === qid ? { ...q, answer: skipped || delegated ? '' : ans.trim().slice(0, 800), skipped, delegated } : q));
      update((p2) => ({ ...p2, discovery: { ...p2.discovery, questions } }));
      // the layout question, asked once there was already enough for the brief, needs no further turn: the
      // brief reads its answer (lib/ux-v0/layout.ts settleLayout), so nothing is spent on it
      if (qid === LAYOUT_QUESTION_ID && p.discovery.ready) return;
      await discoverTurn({ questions });
    },
    [current, update, discoverTurn]
  );

  const setRef = (id: string, state: RefState) => update((p) => ({ ...p, moodboard: { ...p.moodboard, refs: p.moodboard.refs.map((r) => (r.id === id ? { ...r, state } : r)) } }));
  /** What a reference means changed: what to take, its note, key, steer away, on the page, its colours. A picture
      marked for the page joins the brief's pictures (and leaves them when unmarked). */
  const updateRef = (id: string, patch: Partial<MoodboardRef>) =>
    update((p) => {
      const refs = p.moodboard.refs.map((r) => (r.id === id ? normalizeRef({ ...r, ...patch, url: r.url, thumb: r.thumb }) ?? r : r));
      const ref = refs.find((r) => r.id === id);
      let brief = p.brief;
      if (brief.doc && ref && ('asContent' in patch || 'avoid' in patch)) {
        const rest = brief.doc.references.filter((x) => x !== id);
        brief = { ...brief, doc: { ...brief.doc, references: isContent(ref) ? [...rest, id] : rest } };
      }
      return { ...p, moodboard: { ...p.moodboard, refs }, brief };
    });
  /** The designer's own files onto the board, kept in this browser. */
  const uploadRefs = async (files: File[]) => {
    setImgError('');
    setImgBusy(files.length === 1 ? 'Adding your reference…' : `Adding ${Math.min(12, files.length)} references…`);
    const added: MoodboardRef[] = [];
    const errors: string[] = [];
    for (const f of files.slice(0, 12)) {
      const r = await addUpload(f);
      if (r.ok) added.push(r.ref);
      else errors.push(r.error);
    }
    setImgBusy(null);
    if (added.length) update((p) => ({ ...p, moodboard: { ...p.moodboard, refs: [...added, ...p.moodboard.refs] } }));
    if (errors.length) setImgError(errors.length > 1 ? `${errors[0]} (and ${errors.length - 1} more)` : errors[0]);
  };
  // ── the Creative DNA ────────────────────────────────────────────────
  // What it is read from changes (the brief, the references, what is taken or left from each): it is read again,
  // in code, at once; what the designer set or locked stays theirs. Nothing here asks a model.
  useEffect(() => {
    const p = current.current;
    const next = dnaOf(p);
    if (next && next !== p.dna) update((p2) => ({ ...p2, dna: dnaOf(p2) ?? next }), false);
  }, [project.brief.doc, project.moodboard, project.intent]); // eslint-disable-line react-hooks/exhaustive-deps
  const changeDna = (f: (d: CreativeDNA, input: DnaInput) => CreativeDNA) =>
    update((p) => {
      const input = dnaInputOf(p);
      return { ...p, dna: f(dnaOf(p) ?? deriveDNA(input, null), input) };
    });
  /** A kept reference's pixels, measured once in this browser and kept on it (a failure is said, not guessed around). */
  const measureRef = async (r: MoodboardRef) => {
    const ui = uiRefs.find((x) => x.id === r.id) ?? r;
    const src = ui.thumb || ui.url;
    const of = measuredAs(r);
    if (!src || measuringNow.current.has(r.id)) return;
    measuringNow.current.add(r.id);
    setMeasuring((m) => ({ ...m, [r.id]: { state: 'measuring' } }));
    const got = await measureReference(src, r.media, of);
    measuringNow.current.delete(r.id);
    if (got.ok) {
      updateRef(r.id, { dna: got.dna });
      setMeasuring(({ [r.id]: _done, ...rest }) => rest);
    } else setMeasuring((m) => ({ ...m, [r.id]: { state: 'failed', reason: got.reason } }));
  };
  // each kept reference (and each one to steer away from) measured once, again only when its picture changed
  useEffect(() => {
    if (project.mode !== 'create') return;
    const todo = project.moodboard.refs.filter((r) => (r.state === 'kept' || r.avoid) && !measuring[r.id] && r.dna?.of !== measuredAs(r));
    if (!todo.length) return;
    let stop = false;
    (async () => {
      for (const r of todo.slice(0, 8)) {
        if (stop) break;
        await measureRef(r);
      }
    })();
    return () => {
      stop = true;
    };
  }, [project.moodboard.refs, uiRefs]); // eslint-disable-line react-hooks/exhaustive-deps
  /** The DNA dimensions the designer locked that these changes would move the design away from. */
  const dnaMovedBy = (s: DesignSpec, patches: Patch[]): DnaKey[] => {
    const dna = dnaOf(current.current);
    if (!dna || !Object.values(dna.dims).some((d) => d?.locked)) return [];
    let t = s;
    for (const pt of patches) {
      const r = applyPatch(t, pt, current.current.moodboard);
      if (r.ok) t = r.spec;
    }
    return lockedDnaMoves(s, t, dna);
  };
  const dnaNames = (ks: DnaKey[]) => ks.map((k) => DNA_META[k].label.toLowerCase()).join(' and ');
  // a photograph from an image model: offered only where the server has one, its price said first
  const [imageGen, setImageGen] = useState<{ enabled: boolean; why: string; price: number } | null>(null);
  useEffect(() => {
    if (!signedIn || project.mode !== 'create') return;
    let live = true;
    fetch('/api/ux-v0/assets')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && j && setImageGen({ enabled: !!j.enabled, why: String(j.why ?? ''), price: Number(j.prices?.wide ?? 0) }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [signedIn, project.mode]);
  const photograph = (sectionId: string, confirmed = false) => {
    const p = current.current;
    const s = currentSpec(p);
    const sec = s?.sections.find((x) => x.id === sectionId);
    if (!s || !sec || sec.locked || !imageGen?.enabled) return;
    const what = (kindDef(sec.kind)?.label ?? 'part').toLowerCase();
    const ratio = ratioFor(sec.kind, sec.variant);
    if (!confirmed)
      return say(`A photograph for the ${what} from an image model costs about US$${imageGen.price.toFixed(2)}, counted apart from text. Make it?`, 'info', {
        acts: [
          { label: 'Make it', run: () => void photograph(sectionId, true), strong: true },
          { label: 'Not now', run: () => setNotice(null) },
        ],
      });
    void (async () => {
      setBusy('Making the photograph…');
      const look = s.look ?? lookFromTokens(s.tokens);
      const r = await runOp<{ image: { dataUrl: string; mime: string; prompt: string; model: string; cost: number }; usage: Usage }>('image', 'Making the photograph', '/api/ux-v0/assets', {
        projectId: p.id,
        brief: p.brief.doc,
        purpose: `the ${what}`,
        ratio,
        treatment: `${s.tokens.imageTreatment} treatment, ${look.language} direction`,
        colours: paletteOf(s.tokens, look.accent2),
      });
      setBusy(null);
      if (!r) return;
      if (!r.ok) return failed(r);
      const { image } = r.data;
      const blob = await (await fetch(image.dataUrl)).blob();
      const up = await addUpload(new File([blob], `photograph.${image.mime.split('/')[1] ?? 'png'}`, { type: image.mime }));
      if (!up.ok) return say(up.error, 'error');
      const made = `Made with ${image.model} for this project`;
      const ref = normalizeRef({ ...up.ref, title: `Photograph for the ${what}`, license: made, attribution: made, note: `Prompt: ${image.prompt}`.slice(0, 400), asContent: true, state: 'kept' }) ?? up.ref;
      const now = current.current;
      const cur = currentSpec(now);
      const sec2 = cur?.sections.find((x) => x.id === sectionId);
      if (!cur || !sec2) return;
      const board = { ...now.moodboard, refs: [ref, ...now.moodboard.refs] };
      const res = applyPatch(cur, { op: 'images', sectionId, images: sec2.images.length ? [ref.id, ...sec2.images.slice(1)] : [ref.id], summary: `A photograph for the ${what}` }, board);
      update((p2) => {
        const specs = res.ok ? capVersions([...p2.specs.slice(0, p2.specIndex + 1), { ...res.spec, version: cur.version + 1 }], p2.keptVersions) : p2.specs;
        return { ...p2, usage: addUsage(p2.usage, r.data.usage), moodboard: { ...p2.moodboard, refs: [ref, ...p2.moodboard.refs] }, specs, specIndex: specs.length - 1 };
      });
      if (res.ok) say(`The photograph is in place, and on the moodboard with its prompt and model (US$${image.cost.toFixed(2)}).`, 'info', { acts: [{ label: 'Undo', run: () => stepVersion(-1) }] });
      else say(`The photograph is on the moodboard, but could not be placed: ${res.error}`, 'error');
    })();
  };
  /** A picture SocriaUX makes for one part, in the design's own colours: on the moodboard with its reason, in place as one version. */
  const makeArt = (sectionId: string, kind: ProcKind) => {
    const p = current.current;
    const s = currentSpec(p);
    const sec = s?.sections.find((x) => x.id === sectionId);
    if (!s || !sec || sec.locked) return;
    const def = kindDef(sec.kind);
    const seed = (Date.now() + sectionId.length * 7919) % 2147483647;
    const proc: ProcSpec = { kind, seed, ratio: ratioFor(sec.kind, sec.variant), palette: paletteOf(s.tokens, (s.look ?? lookFromTokens(s.tokens)).accent2), ...((kind === 'form' || kind === 'pattern') && s.look?.form ? { form: s.look.form } : {}) };
    const ref = normalizeRef(procRef(proc, `Art for the ${(def?.label ?? 'part').toLowerCase()}: ${PROC_SAYS[kind]}, in this design’s own colours`, PROC_LABEL[kind]));
    if (!ref) return;
    const board = { ...p.moodboard, refs: [ref, ...p.moodboard.refs.filter((r) => r.id !== ref.id)] };
    const images = sec.images.length ? [ref.id, ...sec.images.slice(1)] : [ref.id];
    const res = applyPatch(s, { op: 'images', sectionId, images, summary: `${PROC_LABEL[kind]} made for the ${(def?.label ?? 'part').toLowerCase()}` }, board);
    if (!res.ok) return say(`That art could not be placed: ${res.error}`, 'error');
    update((p2) => {
      const specs = capVersions([...p2.specs.slice(0, p2.specIndex + 1), { ...res.spec, version: s.version + 1 }], p2.keptVersions);
      return { ...p2, moodboard: { ...p2.moodboard, refs: [ref, ...p2.moodboard.refs.filter((r) => r.id !== ref.id)] }, specs, specIndex: specs.length - 1 };
    });
    say(`Made: ${PROC_LABEL[kind].toLowerCase()} for the ${(def?.label ?? 'part').toLowerCase()}, in this design’s colours. It is on the moodboard with where it came from.`, 'info', {
      acts: [
        { label: 'Undo', run: () => stepVersion(-1) },
        { label: 'Another', run: () => makeArt(sectionId, kind) },
      ],
    });
    runChecks(res.spec);
  };
  /** A change of the design's motion: one version; a motion kept in the art direction or locked in the DNA is asked about first. */
  const changeMotion = (next: Partial<Motion>, label: string) => {
    const p = current.current;
    const s = currentSpec(p);
    if (!s) return;
    const now = (s.look ?? lookFromTokens(s.tokens)).motion;
    const patch: Patch = { op: 'look', look: { motion: { ...now, ...next } }, summary: `Motion: ${label}` };
    const hit = lockedChanges(s, patch, p.direction.chosen?.locks ?? []);
    const moved = dnaMovedBy(s, [patch]);
    if (hit.length || moved.length)
      return say(`${hit.length ? 'The motion is kept in the art direction.' : ''} ${moved.length ? `This moves the ${dnaNames(moved)} away from where you locked it in the Creative DNA.` : ''} Change it anyway?`.trim(), 'info', {
        acts: [
          { label: 'Change anyway', run: () => (applyLocal(patch, label), undefined), strong: true },
          { label: 'Keep it as it is', run: () => setNotice(null) },
        ],
      });
    applyLocal(patch, label);
  };

  const sampleRef = async (ref: MoodboardRef) => {
    const sw = await sampleSwatches(ref.thumb || ref.url);
    if (sw.length) updateRef(ref.id, { swatches: sw });
    else setImgError('That library does not let its pictures’ colours be read. Add your own copy to sample it.');
  };
  const addPalette = (pal: Palette) => update((p) => ({ ...p, moodboard: { ...p.moodboard, palettes: [...p.moodboard.palettes, pal].slice(-12) } }));
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
    const r = await runOp<{ direction: string; queries: { category: MoodCategory; query: string }[]; palettes: Palette[]; type: TypePair[]; usage: Usage }>('direction', 'Finding another direction', '/api/ux-v0/discover', {
      projectId: p.id,
      action: 'direction',
      aspect,
      intent: p.intent,
      questions: p.discovery.questions,
      understanding: p.discovery.understanding,
      moodboard: p.moodboard,
    });
    setImgBusy(null);
    if (!r) return;
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
    const r = await runOp<{ brief: DesignBrief; queries?: { category: MoodCategory; query: string }[]; usage: Usage }>('brief', refining ? 'Changing the brief' : 'Writing the brief', '/api/ux-v0/brief', {
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
    if (!r) return;
    if (!r.ok) return failed(r);
    // what the designer decided stays decided: locked parts keep their words, a changed approved part is reopened
    const merged = refining
      ? mergeDecided(r.data.brief, p.brief.doc)
      : { brief: { ...r.data.brief, ...(Object.keys(delegatedParts(p.discovery.questions)).length ? { decisions: { ...delegatedParts(p.discovery.questions), ...(r.data.brief.decisions ?? {}) } } : {}) }, kept: [], reopened: [] };
    update((p2) => ({ ...p2, brief: { doc: merged.brief, approved: false, version: p2.brief.version + 1 }, usage: addUsage(p2.usage, r.data.usage) }));
    setBriefEdits((e) => [...new Set([...e, ...changedVisualParts(p.brief.doc, merged.brief)])]);
    setView('brief');
    if (!refining) return;
    const keptNote = merged.kept.length ? ` Kept as you locked them: ${merged.kept.map((x) => PART_LABEL[x].toLowerCase()).join(', ')}.` : '';
    const reopenNote = merged.reopened.length ? ` Changed after you approved them, so they need your approval again: ${merged.reopened.map((x) => PART_LABEL[x].toLowerCase()).join(', ')}.` : '';
    say(`The brief was changed as you asked. Check it, then approve.${keptNote}${reopenNote}`);
    // the visual direction moved: the board follows, with images to keep or remove
    const qs = r.data.queries ?? [];
    if (qs.length) {
      const got = await fetchImages(qs, 4);
      if (got.length) say(`The brief was changed, and its visual direction moved: ${got.length} new image${got.length === 1 ? '' : 's'} on the moodboard to keep or remove.`, 'info', { acts: [{ label: 'See the moodboard', run: () => setView('discovery') }] });
    }
  };

  /** The brief's changed visual parts, carried into the design in place: a new version, no regeneration. */
  const applyBriefToDesign = () => {
    const p = current.current;
    const doc = p.brief.doc;
    const s = currentSpec(p);
    if (!doc || !s || !briefEdits.length) return;
    const next = briefToDesign(s, doc, briefEdits);
    update((p2) => {
      const specs = capVersions([...p2.specs.slice(0, p2.specIndex + 1), next], p2.keptVersions);
      const chosen = p2.direction.chosen ? { ...p2.direction.chosen, tokens: next.tokens, look: next.look, source: 'person' as const } : p2.direction.chosen;
      return { ...p2, specs, specIndex: specs.length - 1, direction: { ...p2.direction, chosen }, brief: { ...p2.brief, approved: true } };
    });
    const what = briefEdits.map((x) => PART_LABEL[x].toLowerCase()).join(', ');
    setBriefEdits([]);
    say(`Applied to the design without redrawing it: ${what}.`, 'info', { acts: [{ label: 'See it', run: () => setView('design'), strong: true }, { label: 'Undo', run: () => stepVersion(-1) }] });
  };

  /** From the questions: write the brief from what is known and open the directions, with nothing generated yet. */
  const seeDirections = async () => {
    await writeBrief();
    await new Promise((r) => setTimeout(r, 0));
    if (!current.current.brief.doc) return;
    openDirection();
  };

  /** From anywhere in the questions: write the brief from what is known, approve it, and design
      in the direction SocriaUX chooses. The brief stays there to read and change afterwards. */
  const designNow = async () => {
    await writeBrief();
    // the brief arrives through a state update: let it land before reading it back
    await new Promise((r) => setTimeout(r, 0));
    if (!current.current.brief.doc) return;
    update((p) => ({ ...p, brief: { ...p.brief, approved: true } }));
    await new Promise((r) => setTimeout(r, 0));
    await generate();
  };

  // ── art direction ───────────────────────────────────────────────────
  // The engine proposes at once, here, for nothing; when signed in, SocriaUX then writes each
  // direction's concept and voice for this brand. Edits lock what they touch.
  const directionAsk = (p: DesignProject, again: boolean) => {
    const st = p.direction;
    const base = st.options.find((o) => o.locks.length) ?? (st.chosen && st.chosen.locks.length ? st.chosen : null);
    const round = again ? st.round + 1 : st.round;
    const seen = again ? [...new Set([...st.seen, ...st.options.map((o) => o.language)])] : st.seen;
    // the project's own salt: this brief in another project is composed differently; its Creative DNA steers all three
    return { brief: p.brief.doc!, notes: st.notes, avoid: st.avoid, base, round, seen, board: readBoard(p.moodboard), salt: saltOf(p.id), dna: dnaOf(p) };
  };

  const proposeDirectionsFor = async (again: boolean) => {
    const p = current.current;
    if (!p.brief.doc) return;
    const ask = directionAsk(p, again);
    const options = proposeDirections(ask);
    update((p2) => ({ ...p2, direction: { ...p2.direction, options, round: ask.round, seen: [...new Set([...ask.seen, ...options.map((o) => o.language)])].slice(-24), forBrief: briefKey(p.brief.doc!), forDna: dnaKeyOf(ask.dna) } }));
    setDirNote('Writing each direction for this brand…');
    const r = await runOp<{ options: ArtDirection[]; usage: Usage }>('direct', 'Writing each direction for this brand', '/api/ux-v0/direct', { projectId: p.id, ...ask, base: ask.base }, true);
    if (!r) return;
    // replaced by a newer ask (its own note follows), or cancelled by the designer
    if (!r.ok && r.cancelled) return current.current.direction.round === ask.round ? setDirNote('Drawn by SocriaUX’s direction engine. The written concepts were cancelled.') : undefined;
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

  /** Swap one direction for one the engine has not shown yet; the other two, and any locks, stay. No model call. */
  const replaceDirection = (id: string) => {
    const p = current.current;
    if (!p.brief.doc) return;
    const st = p.direction;
    const shown = [...new Set([...st.seen, ...st.options.map((o) => o.language)])];
    const [fresh] = proposeDirections({ ...directionAsk(p, false), count: 1, round: st.round + 1, seen: shown });
    if (!fresh) return;
    update((p2) => ({
      ...p2,
      direction: {
        ...p2.direction,
        options: p2.direction.options.map((o) => (o.id === id ? { ...fresh, id: `${fresh.id}_${Date.now().toString(36)}` } : o)),
        seen: [...new Set([...p2.direction.seen, fresh.language])].slice(-24),
      },
    }));
  };

  const openDirection = () => {
    const p = current.current;
    if (!p.brief.doc) return;
    update((p2) => ({ ...p2, brief: { ...p2.brief, approved: true } }));
    setView('direction');
    // none yet, or made for a brief or a Creative DNA that has since changed
    if (!p.direction.options.length || p.direction.forBrief !== briefKey(p.brief.doc) || (p.direction.forDna ?? '') !== dnaKeyOf(dnaOf(p))) proposeDirectionsFor(false);
  };
  /** The brief approved: on to the Creative DNA (optional: Explore directions is one click on). */
  const openDna = () => {
    if (!current.current.brief.doc) return;
    update((p2) => ({ ...p2, brief: { ...p2.brief, approved: true }, dna: dnaOf(p2) ?? undefined }));
    setView('dna');
  };

  const editDirection = (id: string, next: ArtDirection, group: LockGroup) =>
    update((p) => ({ ...p, direction: { ...p.direction, options: p.direction.options.map((o) => (o.id === id ? { ...next, locks: [...new Set([...o.locks, group])], source: 'person' } : o)) } }));

  /** One direction kept, whole groups taken from another: a direction of its own beside the others (one at a time). */
  const combineDirection = (baseId: string, fromId: string, groups: LockGroup[]) => {
    const p = current.current;
    const base = p.direction.options.find((o) => o.id === baseId);
    const from = p.direction.options.find((o) => o.id === fromId);
    if (!base || !from) return;
    const made = combineDirections(base, from, groups);
    if (!made) return say('Choose two different directions, and at least one thing to take.', 'error');
    update((p2) => {
      // a new combination takes the place of an earlier one: the directions shown stay at most four
      const rest = p2.direction.options.filter((o) => o.id !== made.id && !o.id.includes('_x_'));
      const at = rest.findIndex((o) => o.id === baseId);
      const options = [...rest.slice(0, at + 1), made, ...rest.slice(at + 1)].slice(0, 4);
      return { ...p2, direction: { ...p2.direction, options } };
    });
    say(`${made.name} is beside the others: ${made.rationale[0]} Approve it to design with it.`, 'info');
  };

  const lockDirection = (id: string, group: LockGroup, on: boolean) =>
    update((p) => ({ ...p, direction: { ...p.direction, options: p.direction.options.map((o) => (o.id === id ? { ...o, locks: on ? [...new Set([...o.locks, group])] : o.locks.filter((g) => g !== group) } : o)) } }));

  const approveDirection = (d: ArtDirection) => {
    // where the chosen direction leaned away from the DNA, the DNA follows it: chosen, so the designer's
    const was = dnaOf(current.current);
    const dna = was ? adoptLean(was, d.dna, d.name) : null;
    update((p) => ({ ...p, ...(dna ? { dna } : {}), direction: { ...p.direction, chosen: d, approved: true } }));
    generate('', d, false, dna);
  };

  // ── looking at what was drawn ───────────────────────────────────────
  // Drawn offscreen at 1280, 834 and 390 px, measured, read. With `autofix`, the fixes that need no
  // words are applied — at most two rounds, never to what the designer locked or fixed — before
  // anyone sees the page. Otherwise the findings are only reported.
  const inspect = async (from: DesignSpec, autofix: boolean): Promise<{ spec: DesignSpec; fixed: string[]; ev: Evaluation; audit: PageAudit | null; audits: { desktop: PageAudit | null; tablet: PageAudit | null; phone: PageAudit | null }; undone: string[] }> => {
    const locks = current.current.direction.chosen?.locks ?? [];
    let audit: PageAudit | null = null;
    let audits: { desktop: PageAudit | null; tablet: PageAudit | null; phone: PageAudit | null } = { desktop: null, tablet: null, phone: null };
    const measureAt = async (s: DesignSpec) => {
      const html = renderDesign(s, withUploads(current.current.moodboard.refs, true)).html;
      const [desktop, tablet, phone] = await Promise.all([measurePage(html, 1280, 900, nonce), measurePage(html, 834, 1112, nonce), measurePage(html, 390, 844, nonce)]);
      audit = desktop;
      audits = { desktop, tablet, phone };
      // and whether it keeps what was decided: the approved direction, the brief's locked parts and rules, the pictures it may place
      return evaluateDesign(s, { desktop, tablet, phone }, locks, { direction: current.current.direction.chosen, brief: current.current.brief.doc, board: current.current.moodboard });
    };
    let spec = from;
    const fixed: string[] = [];
    const undone: string[] = [];
    let ev = await measureAt(spec);
    for (let round = 0; autofix && round < MAX_REVISION_ROUNDS; round++) {
      const fixes = fixesFor(ev);
      if (!fixes.length) break;
      const start = spec;
      const before = ev;
      const applied: { patch: Patch; section: string }[] = [];
      for (const f of fixes) {
        const res = applyPatch(spec, f.patch, current.current.moodboard);
        if (res.ok) (spec = res.spec), applied.push({ patch: f.patch, section: f.patch.sectionId ?? f.finding.section });
      }
      ev = await measureAt(spec);
      // checked for what it broke: a section where a failure appeared, or the findings grew, has its fixes taken back
      // (the round's other fixes stay), and the page is measured again
      const worse = new Set(regressions(before, ev));
      const back = applied.filter((a) => a.section && worse.has(a.section));
      if (back.length) {
        spec = start;
        for (const a of applied.filter((x) => !back.includes(x))) {
          const res = applyPatch(spec, a.patch, current.current.moodboard);
          if (res.ok) spec = res.spec;
        }
        undone.push(...back.map((a) => a.patch.summary));
        ev = await measureAt(spec);
      }
      fixed.push(...applied.filter((a) => !back.includes(a)).map((a) => a.patch.summary));
    }
    return { spec, fixed, ev, audit, audits, undone };
  };

  /** Check the design as it stands, and say what was found (nothing is changed). */
  const runChecks = async (from: DesignSpec) => {
    setChecks((c) => ({ running: true, ev: c?.ev ?? null, fixed: [], version: from.version }));
    const r = await inspect(from, false);
    setChecks({ running: false, ev: r.ev, fixed: [], version: from.version, audit: r.audit, audits: r.audits });
  };

  // ── generating and changing the design ──────────────────────────────
  const generate = async (dir = '', art: ArtDirection | null = null, confirmed = false, dnaUse: CreativeDNA | null = null): Promise<void> => {
    const p = current.current;
    if (!p.brief.doc) return;
    const approved = art ?? (p.direction.approved ? p.direction.chosen : null);
    // before a premium step that a budget might not hold: the measured cost, the limit, what is left — the designer decides
    const warn = !confirmed ? warnBefore('generate', budgetSeen.current) : null;
    if (warn) {
      say(`${warn} Design it anyway?`, 'info', { acts: [{ label: 'Design it', run: () => void generate(dir, art, true, dnaUse), strong: true }, { label: 'Not now', run: () => setNotice(null) }] });
      return;
    }
    const label = approved ? `Designing in the “${approved.name}” direction` : 'Designing from the brief';
    setBusy(`${label}…`);
    const version = (p.specs[p.specs.length - 1]?.version ?? 0) + 1;
    const r = await runOp<{ spec: DesignSpec; artDirection?: ArtDirection; placeholders: string[]; usage: Usage; notice?: string; complexity?: { level: 'low' | 'medium' | 'high'; why: string[]; tier: 'economy' | 'premium' } }>('generate', label, '/api/ux-v0/generate', { projectId: p.id, brief: p.brief.doc, moodboard: p.moodboard, direction: dir, artDirection: approved, version, dna: dnaUse ?? dnaOf(p) });
    setBusy(null);
    if (!r) return;
    // a failed or cancelled generation leaves the design on the canvas exactly as it was
    if (!r.ok) return failed(r);
    const drawn = normalizeSpec(r.data.spec, current.current.moodboard);
    if (!drawn) return say('The design that came back did not hold together. Nothing changed; try again.', 'error');
    // what the designer locked comes through a new generation exactly as it was
    const fresh = holdLocked(drawn, currentSpec(current.current)).spec;
    // before it is shown: drawn at desktop, tablet and phone widths, measured, and fixed where no words are needed
    setBusy('Checking it at desktop, tablet and phone widths…');
    setChecks({ running: true, ev: null, fixed: [], version: fresh.version });
    const checked = await inspect(fresh, true);
    setBusy(null);
    const kept: DesignSpec | null = checked.fixed.length
      ? { ...checked.spec, version: fresh.version + 1, reason: `Checked at desktop, tablet and phone: ${checked.fixed.length} fix${checked.fixed.length === 1 ? '' : 'es'}`, createdAt: Date.now() }
      : null;
    setChecks({ running: false, ev: checked.ev, fixed: checked.fixed, version: (kept ?? fresh).version, audit: checked.audit, audits: checked.audits, undone: checked.undone });
    update((p2) => {
      const specs = capVersions([...p2.specs, fresh, ...(kept ? [kept] : [])], p2.keptVersions);
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
    setEditing(null);
    setActiveCard(null);
    setView('design');
    setRail('checks');
    setMode('element');
    setComposeMode('change');
    const ph = r.data.placeholders;
    const done = ph.length ? `Designed. ${ph.length} placeholder${ph.length === 1 ? '' : 's'} for facts only you have: ${ph.slice(0, 5).join(', ')}${ph.length > 5 ? '…' : ''}` : 'Designed from the brief. Select any part to question or change it.';
    // how demanding the server read the page to be, and so which model made it: the cost explained
    const cx = r.data.complexity;
    const how = cx && cx.level !== 'medium' ? ` Read as ${cx.level === 'high' ? 'demanding' : 'simple'} (${cx.why.join(', ')}), so made on the ${cx.tier} model.` : '';
    // a fallback or a budget note is said with the result, never dropped by it
    say(`${done}${how}${r.data.notice ? ` ${r.data.notice}` : ''}`);
  };

  const applyLocal = useCallback(
    (patchOrPatches: Patch | Patch[], label: string) => {
      const p = current.current;
      const s = currentSpec(p);
      if (!s) return;
      // several patches (a pairing changes faces and weight) land as one version
      const patches = Array.isArray(patchOrPatches) ? patchOrPatches : [patchOrPatches];
      let res: ReturnType<typeof applyPatch> = { ok: true, spec: s, touched: [] };
      for (const pt of patches) {
        if (!res.ok) break;
        const next = applyPatch(res.spec, pt, p.moodboard);
        res = next.ok ? { ...next, spec: { ...next.spec, version: s.version + 1 } } : next;
      }
      if (!res.ok) return say(`That change could not be applied: ${res.error}`, 'error');
      const patch = patches[patches.length - 1];
      const lookChanged = patches.some((pt) => pt.op === 'tokens' || pt.op === 'look');
      update((p2) => {
        const specs = capVersions([...p2.specs.slice(0, p2.specIndex + 1), res.spec], p2.keptVersions);
        // what the designer changes in the look becomes the direction's: a later generation keeps it
        const chosen = p2.direction.chosen && lookChanged ? { ...p2.direction.chosen, tokens: res.spec.tokens, look: res.spec.look, source: 'person' as const } : p2.direction.chosen;
        return { ...p2, specs, specIndex: specs.length - 1, direction: { ...p2.direction, chosen } };
      });
      setSelection(null);
      say(`Changed: ${label || patch.summary || patch.op}.`, 'info', { acts: [{ label: 'Undo', run: () => stepVersion(-1) }] });
      runChecks(res.spec);
    },
    [current, update, say] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** A whole new version (a change held to what was asked): pushed as one version Undo takes back, then checked. */
  const applyVersion = (next: DesignSpec, label: string, said = '') => {
    const p = current.current;
    const s = currentSpec(p);
    if (!s) return;
    const v: DesignSpec = { ...next, version: s.version + 1, reason: label.charAt(0).toUpperCase() + label.slice(1), createdAt: Date.now() };
    update((p2) => {
      const specs = capVersions([...p2.specs.slice(0, p2.specIndex + 1), v], p2.keptVersions);
      return { ...p2, specs, specIndex: specs.length - 1 };
    });
    setSelection(null);
    say(`Changed: ${label}.${said ? ` ${said}` : ''}`, 'info', { acts: [{ label: 'Undo', run: () => stepVersion(-1) }] });
    runChecks(v);
  };

  /** A scoped edit counted: one more, and whether it had to be held to what was asked. */
  const countEdit = (scope: Scope, confined: boolean) => {
    if (!scope.strict && !scope.keep.length) return;
    update((p2) => ({ ...p2, edits: { edits: (p2.edits?.edits ?? 0) + 1, confined: (p2.edits?.confined ?? 0) + (confined ? 1 : 0) } }));
  };

  /**
   * A change made by hand (the type, a change asked for in words and read in code): applied at once as a version
   * Undo takes back, or asked about first when it touches what the designer locked (in the art direction, the
   * Creative DNA or a section), leaves their design system, or carries a concern of its own.
   */
  const applyChecked = (patches: Patch[], label: string, concern = '') => {
    const p = current.current;
    const s = currentSpec(p);
    if (!s || !patches.length) return;
    const locks = p.direction.chosen?.locks ?? [];
    const hit = [...new Set(patches.flatMap((pt) => lockedChanges(s, pt, locks)))];
    const sectionsHit = patches.flatMap((pt) => lockedTouched(s, pt));
    const heldHit = patches.flatMap((pt) => heldTouched(s, pt));
    const ds = p.brief.doc?.system;
    const outside = ds ? [...new Set(patches.flatMap((pt) => offSystem(pt, ds)))] : [];
    const moved = dnaMovedBy(s, patches);
    const concerns = [
      hit.length ? `This changes the ${hit.map((g) => LOCK_LABEL[g].toLowerCase()).join(' and ')}, which you locked in the art direction.` : '',
      moved.length ? `This moves the ${dnaNames(moved)} away from where you locked it in the Creative DNA.` : '',
      outside.length && ds ? `This uses ${outside.join(' and ')}, which ${outside.length > 1 ? 'are' : 'is'} not in your design system (${ds.name}).` : '',
      sectionsHit.length ? 'This changes a section you locked.' : '',
      heldHit.length ? 'This changes a composition you approved.' : '',
      concern,
    ].filter(Boolean);
    if (concerns.length)
      return say(`${concerns.join(' ')} Make the change anyway?`, 'info', {
        acts: [
          { label: 'Apply anyway', run: () => (applyLocal(patches, label), undefined), strong: true },
          { label: 'Keep it as it is', run: () => setNotice(null) },
        ],
      });
    applyLocal(patches, label);
  };

  /** One creative decision changed, everything else kept: in code, as a version Undo takes back. */
  const adjustDesign = (as: Adjust[]): boolean => {
    const p = current.current;
    const s = currentSpec(p);
    if (!s || !as.length) return false;
    const locks = p.direction.chosen?.locks ?? [];
    const done: { patches: Patch[]; label: string }[] = [];
    const refused: string[] = [];
    for (const a of as) {
      const r = adjust(s, a);
      if (!r) continue;
      const hit = [...new Set(r.patches.flatMap((pt) => lockedChanges(s, pt, locks)))];
      const moved = dnaMovedBy(s, r.patches);
      if (hit.length) refused.push(`${ADJUST_LABEL[a].toLowerCase()} would change ${hit.map((g) => LOCK_LABEL[g].toLowerCase()).join(' and ')}, which you locked`);
      else if (moved.length) refused.push(`${ADJUST_LABEL[a].toLowerCase()} would move the ${dnaNames(moved)} away from where you locked it in the Creative DNA`);
      else done.push(r);
    }
    if (done.length) applyLocal(done.flatMap((d) => d.patches), done.map((d) => d.label).join('; '));
    if (refused.length) say(`${done.length ? 'Done, except: ' : 'Nothing changed: '}${refused.join('; ')}. Unlock it to change it.`, 'info');
    else if (!done.length) say('Nothing to change: the design is already there.', 'info');
    return true;
  };

  const refine = async (comment: string) => {
    const p = current.current;
    const s = currentSpec(p);
    if (!s) return;
    const imported = !!p.artifact?.type?.startsWith('imported');
    // what the words allow the change to touch ("only the hero headline", "without changing the layout"): every
    // change below is held to it (lib/ux-v0/scope.ts)
    const scope = readScope(comment, s, selection);
    // a part named and one kind of change (another picture, angular shapes, a compact phone navigation, calmer
    // motion): done at once in code (lib/ux-v0/targeted.ts)
    const tq = !imported ? readTargeted(comment, s, p.moodboard, selection, scope) : null;
    if (tq && !tq.patches.length) return say(`Nothing to change: ${tq.label}.`, 'info');
    if (tq) {
      countEdit(scope, false);
      applyChecked(tq.patches, tq.label);
      return;
    }
    // the everyday small changes (a colour, a typeface, the corners, new words, the headline's size) are read in
    // code and done at once — no model, nothing regenerated — asked about first when they touch what the designer
    // locked, leave their design system, or would make text hard to read (lib/ux-v0/quick-edit.ts)
    const qe = !imported ? readQuickEdit(comment, s, selection) : null;
    if (qe && !qe.patches.length) return say(`Nothing to change: ${qe.label}.`, 'info');
    if (qe) {
      countEdit(scope, false);
      applyChecked(qe.patches, qe.label, qe.concern ? qe.concern.replace(/\s*Make the change anyway\?$/, '') : '');
      return;
    }
    // the everyday ways of asking for one change of the look are done at once, in code, keeping everything else
    const quick = readAdjust(comment);
    if (quick.length && !imported) {
      adjustDesign(quick);
      return;
    }
    setBusy('Working out the change…');
    const r = await runOp<{ understood: string; challenge: string; question: string; regenerate: string; patch: Patch; applies: boolean; locked?: LockGroup[]; error: string; usage: Usage }>('refine', 'Working out the change', '/api/ux-v0/refine', {
      projectId: p.id,
      brief: p.brief.doc,
      spec: s,
      moodboard: p.moodboard,
      selection,
      comment,
      force: false,
      locks: p.direction.chosen?.locks ?? [],
      dna: dnaOf(p),
    });
    setBusy(null);
    if (!r) return;
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
    // the model's change held to what the words allowed: anything it did beyond that is put back, and said
    const held = (() => {
      if (!scope.strict && !scope.keep.length) return null;
      const tried = applyPatch(s, d.patch, p.moodboard);
      if (!tried.ok) return null;
      const c = confine(s, tried.spec, scope);
      return c.back.length ? c : null;
    })();
    const apply = () => {
      countEdit(scope, !!held);
      if (held) applyVersion(held.spec, d.understood || d.patch.summary || 'the change', `Kept the rest exactly as it was: put back ${describeBack(held.back, s)}, which the change also touched.`);
      else applyLocal(d.patch, d.understood);
    };
    if (d.challenge)
      return say(d.challenge, 'info', {
        acts: [
          { label: 'Apply anyway', run: () => (apply(), undefined), strong: true },
          { label: 'Keep it as it is', run: () => setNotice(null) },
        ],
      });
    apply();
  };

  const stepVersion = (dir: -1 | 1) => {
    update((p) => {
      const i = Math.max(0, Math.min(p.specs.length - 1, p.specIndex + dir));
      return i === p.specIndex ? p : { ...p, specIndex: i };
    });
    setSelection(null);
  };

  /** Hold or release a composed part's approved composition: a new version (Undo takes it back). */
  const holdSection = (id: string, held: boolean) => {
    const p = current.current;
    const s = currentSpec(p);
    const next = s ? setHeld(s, id, held) : null;
    if (!s || !next) return;
    const v = { ...next, version: s.version + 1 };
    update((p2) => {
      const specs = capVersions([...p2.specs.slice(0, p2.specIndex + 1), v], p2.keptVersions);
      return { ...p2, specs, specIndex: specs.length - 1 };
    });
    say(held ? 'Composition approved. Its arrangement is held: its words and pictures can still change, and SocriaUX asks before rearranging it.' : 'Released. Its composition can be changed again.', 'info', { acts: [{ label: 'Undo', run: () => stepVersion(-1) }] });
  };
  /** An arrangement the designer set aside: not proposed again in this project. */
  const rejectComposition = (signature: string) => update((p2) => ({ ...p2, compositions: { rejected: [...new Set([...(p2.compositions?.rejected ?? []), signature])].slice(-60) } }));

  /** Lock or unlock one section: a new version (Undo takes it back), kept through generations and repairs. */
  const lockSection = (id: string, locked: boolean) => {
    const p = current.current;
    const s = currentSpec(p);
    const next = s ? setLocked(s, id, locked) : null;
    if (!s || !next) return;
    const v = { ...next, version: s.version + 1 };
    update((p2) => {
      const specs = capVersions([...p2.specs.slice(0, p2.specIndex + 1), v], p2.keptVersions);
      return { ...p2, specs, specIndex: specs.length - 1 };
    });
    say(locked ? 'Locked. It stays exactly as it is through new generations and repairs, and SocriaUX asks before changing it.' : 'Unlocked. It can be changed again.', 'info', { acts: [{ label: 'Undo', run: () => stepVersion(-1) }] });
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
      const r = await runOp<{ reasoning: Reasoning; artifactSummary: string | null; usage: Usage }>(`critique:${cardId}`, 'Reading the design', '/api/ux-v0/critique', {
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
      if (!r) return;
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
    [current, update, failed, runOp]
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
          { id: 'dna', label: 'DNA', ok: !!project.brief.doc },
          { id: 'direction', label: 'Direction', ok: !!project.brief.doc && (project.brief.approved || project.direction.options.length > 0) },
          { id: 'design', label: 'Design', ok: !!spec },
        ]
      : [];
  // before there is a design, the rail is the brief as it forms, and the conversation behind it;
  // on the brief itself, only the conversation (the brief is the page)
  const railShown: Rail = rail === 'brief' && (view === 'brief' || !!spec || project.mode !== 'create') ? 'questions' : rail;
  const railTabs: { id: Rail; label: string }[] =
    project.mode === 'create'
      ? [
          ...(!spec && view !== 'brief' ? [{ id: 'brief' as Rail, label: 'Brief so far' }] : []),
          { id: 'questions', label: 'Questions' },
          ...(spec ? [{ id: 'reasoning' as Rail, label: `Cards${project.cards.length ? ` ${project.cards.filter((c) => c.state !== 'dismissed').length}` : ''}` }] : []),
          ...(spec ? [{ id: 'selection' as Rail, label: 'Selection' }] : []),
          ...(spec ? [{ id: 'checks' as Rail, label: checks?.running ? 'Checking…' : 'Checks' }] : []),
          ...(spec ? [{ id: 'history' as Rail, label: 'Versions' }] : []),
          ...(spec ? [{ id: 'publish' as Rail, label: 'Publish' }] : []),
        ]
      : [
          { id: 'reasoning', label: `Cards${project.cards.length ? ` ${project.cards.filter((c) => c.state !== 'dismissed').length}` : ''}` },
          { id: 'selection', label: 'Selection' },
          { id: 'file', label: 'File' },
        ];

  const vpWidth = VIEWPORT_WIDTH[project.viewport];
  const isPage = !!doc;

  // ── the studio's conversation beside the workspace: words go where the composer would send them ──
  const heard = useMemo(() => (notice ? { text: notice.text } : null), [notice]);
  const waitReply = useRailReply(heard, (h) => h.text);
  const railAsk = async (words: string): Promise<string | null> => {
    const wait = waitReply(20000);
    if (view === 'discovery') {
      if (currentQuestion) await answer(currentQuestion.id, words);
      else await discoverTurn({ remark: words });
    } else if (view === 'brief') await writeBrief(words);
    else if (view === 'design' && (doc || fileUrl)) {
      if (spec && !imported && composeMode === 'change' && !activeCard) await refine(words);
      else await comment(words);
    } else return 'Open the design first: changes are made on the canvas, and kept here.';
    // what the workspace said back, if it said anything a moment after
    return Promise.race([wait, new Promise<string | null>((res) => window.setTimeout(() => res(null), 1800))]).then((r) => r ?? (view === 'design' ? 'Done: it is on the canvas.' : null));
  };

  return (
    <>
    {project.studio && <StudioRail studio={project.studio} onStudio={(fn) => update((p) => (p.studio ? { ...p, studio: fn(p.studio) } : p))} onAsk={railAsk} placeholder={project.mode === 'critique' ? 'Ask about the part you selected' : spec ? 'Say what to change: “make the headline shorter”, “warmer accent”…' : 'Say what to change'} systemName={linked?.rec.name ?? null} />}
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
          <SystemBadge
            project={project}
            linked={linked}
            fidelity={webFidelity ? { score: webFidelity.score, findings: webFidelity.findings.length } : null}
            onApply={(fn) => {
              const r = fn(current.current);
              update(() => r.project);
              say(r.say);
            }}
          />
          {project.usage.calls > 0 && <CostPanel usage={project.usage} note={spendNote} calls={calls} />}
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
                  <button type="button" className="sb-btn is-sm v0-preview-btn" onClick={() => setPreviewing(true)} title="See it in a real viewport, with its motion">
                    Preview
                  </button>
                </span>
              )}
              {spec && !imported && (
                <details className="v0-adjust v0-motion">
                  <summary className="sb-link is-meta">Type</summary>
                  <div className="v0-adjust-panel v0-motion-panel">
                    <TypePanel tokens={spec.tokens} look={spec.look ?? lookFromTokens(spec.tokens)} onChange={(patches, label) => applyChecked(patches, label)} />
                  </div>
                </details>
              )}
              {spec && !imported && (
                <details className="v0-adjust v0-motion">
                  <summary className="sb-link is-meta">Motion</summary>
                  <div className="v0-adjust-panel v0-motion-panel">
                    <MotionPanel motion={(spec.look ?? lookFromTokens(spec.tokens)).motion} onChange={changeMotion} />
                  </div>
                </details>
              )}
              {spec && !imported && (
                <details className="v0-adjust">
                  <summary className="sb-link is-meta">Adjust</summary>
                  <div className="v0-adjust-panel" role="group" aria-label="Change one decision, keep everything else">
                    <p className="v0-adjust-l">Change one thing; keep everything else. Each is a version Undo takes back.</p>
                    {ADJUST_GROUPS.map(([g, as]) => (
                      <div key={g} className="v0-adjust-row">
                        <span className="v0-adjust-g">{g}</span>
                        <span className="v0-adjust-acts">
                          {as.map((a) => (
                            <button key={a} type="button" className="sb-link is-meta" onClick={(e) => (adjustDesign([a]), (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'))}>
                              {ADJUST_LABEL[a]}
                            </button>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
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
                  n={project.discovery.questions.filter((q) => q.answer || q.skipped || q.delegated).length + 1}
                  busy={busy}
                  ready={project.discovery.ready}
                  answered={project.discovery.questions.filter((q) => q.answer).length}
                  note={project.discovery.note}
                  onAnswer={(a) => currentQuestion && answer(currentQuestion.id, a)}
                  onSkip={() => currentQuestion && answer(currentQuestion.id, '', true)}
                  onDelegate={() => currentQuestion && answer(currentQuestion.id, '', false, true)}
                  onSeeDirections={seeDirections}
                  intent={project.intent}
                  words={designerWords(project.intent, project.discovery.questions)}
                  board={uiBoard}
                  onPicture={(text: string, refId?: string) => {
                    if (refId) setRef(refId, 'kept');
                    if (currentQuestion) answer(currentQuestion.id, text);
                  }}
                  onBrief={() => writeBrief()}
                  onCombine={(o) => {
                    setText((t) => (t.trim() ? `${t.trim().replace(/[;,.]$/, '')}; ${o}` : o));
                    requestAnimationFrame(() => {
                      const el = document.querySelector<HTMLTextAreaElement>('.v0-compose textarea');
                      if (el) (el.focus(), el.setSelectionRange(el.value.length, el.value.length));
                    });
                  }}
                  onDesignNow={designNow}
                />
                <Moodboard
                  board={uiBoard}
                  onUpdate={updateRef}
                  onUpload={uploadRefs}
                  onAddPalette={addPalette}
                  onSample={sampleRef}
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
                refs={uiRefs}
                busy={busy}
                hasDesign={!!spec}
                onChange={(b) => {
                  const before = current.current.brief.doc;
                  if (spec) setBriefEdits((e) => [...new Set([...e, ...changedVisualParts(before, b)])]);
                  update((p) => ({ ...p, brief: { ...p.brief, doc: b, approved: false } }));
                }}
                edited={spec ? briefEdits : []}
                onApplyToDesign={applyBriefToDesign}
                onApprove={openDna}
                onSkip={() => {
                  update((p) => ({ ...p, brief: { ...p.brief, approved: true } }));
                  generate();
                }}
                onBack={() => setView('discovery')}
              />
            )}

            {view === 'dna' && project.brief.doc && (
              <DnaStudio
                dna={dnaOf(project) ?? deriveDNA(dnaInputOf(project), null)}
                kind={intentOf(project.brief.doc).kind}
                hasImages={(project.brief.doc.references ?? []).length > 0 || project.moodboard.refs.some((r) => r.state === 'kept' && r.asContent)}
                brief={project.brief.doc}
                name={project.name}
                salt={saltOf(project.id)}
                refs={uiRefs}
                frameRefs={frameRefs}
                measuring={measuring}
                nonce={nonce}
                busy={busy}
                onSet={(k, v) => changeDna((d) => setDim(d, k, v))}
                onLock={(k, on) => changeDna((d) => lockDim(d, k, on))}
                onRelease={(k) => changeDna((d, input) => releaseDim(d, k, input))}
                onDelegateAll={() => changeDna((d, input) => delegateAll(d, input))}
                onAdd={(k) => changeDna((d, input) => addDim(d, k, input))}
                onRemove={(k) => changeDna((d) => removeDim(d, k))}
                onAspects={(id, take, leave) => updateRef(id, { take, leave })}
                onMeasure={(r) => {
                  setMeasuring(({ [r.id]: _was, ...rest }) => rest);
                  void measureRef(r);
                }}
                onExplore={openDirection}
                onBack={() => setView('brief')}
              />
            )}

            {view === 'direction' && project.brief.doc && (
              <DirectionBoard
                state={project.direction}
                brief={project.brief.doc}
                name={project.name}
                refs={frameRefs}
                busy={busy}
                note={dirNote}
                onNotes={(notes, avoid) => update((p) => ({ ...p, direction: { ...p.direction, notes: notes.slice(0, 1200), avoid: avoid.slice(0, 400) } }))}
                onAsk={() => proposeDirectionsFor(true)}
                onEdit={editDirection}
                onLock={lockDirection}
                onApprove={approveDirection}
                onAuto={() => project.direction.options[0] && approveDirection(project.direction.options[0])}
                onBack={() => setView('dna')}
                onReplace={replaceDirection}
                onCombine={combineDirection}
                dna={dnaOf(project)}
                onOpenDna={() => setView('dna')}
                nonce={nonce}
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

          {work.length > 0 && <WorkStrip work={work} />}

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
              <button key={t.id} type="button" role="tab" aria-selected={railShown === t.id} className={`sb-seg-item${railShown === t.id ? ' is-on' : ''}`} onClick={() => setRail(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="v0-rail-scroll">
            {railShown === 'brief' && (
              <LivingBrief
                intent={project.intent}
                discovery={project.discovery}
                board={uiBoard}
                brief={project.brief}
                busy={busy}
                onIntent={(v) => (update((p) => ({ ...p, intent: v })), discoverTurn({ intent: v }))}
                onRef={setRef}
                onPalette={(id, state) => update((p) => ({ ...p, moodboard: { ...p.moodboard, palettes: p.moodboard.palettes.map((x) => (x.id === id ? { ...x, state } : x)) } }))}
                onType={(id, state) => update((p) => ({ ...p, moodboard: { ...p.moodboard, type: p.moodboard.type.map((x) => (x.id === id ? { ...x, state } : x)) } }))}
                onWrite={() => writeBrief()}
                onOpen={() => setView('brief')}
              />
            )}
            {railShown === 'questions' && (
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
            {rail === 'selection' && spec && !imported && editing && spec.sections.some((x) => x.id === editing.sectionId) && (
              <SectionEditor spec={spec} sectionId={editing.sectionId} path={editing.path} onPatch={(pt, label) => applyLocal(pt, label)} onLock={lockSection} onMakeArt={makeArt} imageGen={imageGen} onPhotograph={(id) => photograph(id)} viewport={project.viewport} refs={project.moodboard.refs} onFocus={(id, x, y) => updateRef(id, { focus: { x, y } })} strategy={project.direction.chosen && project.brief.doc ? formed(project.direction.chosen, project.brief.doc).strategy : null} rejected={project.compositions?.rejected ?? []} onHold={holdSection} onReject={rejectComposition} />
            )}
            {rail === 'selection' && (
              <Inspect
                sel={selection}
                onClear={() => (setSelection(null), setEditing(null))}
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
                {checks?.ev && checks.version === spec.version && (
                  <QualityPanel
                    spec={spec}
                    ev={checks.ev}
                    audits={checks.audits ?? { desktop: checks.audit ?? null, tablet: null, phone: null }}
                    originality={originality}
                    direction={project.direction.chosen}
                    html={rendered?.html ?? ''}
                    edits={project.edits ?? null}
                    undone={checks.undone ?? []}
                    onPublish={() => setRail('publish')}
                  />
                )}
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
                {project.dna && (
                  <section className="v0-cellset dna-canvas">
                    <span className="sb-label">Creative DNA</span>
                    {(() => {
                      const dna = project.dna!;
                      const own = dnaOfDesign(spec);
                      const c = dnaConsistency(spec, dna);
                      const drift = c.gaps.filter((g) => Math.abs(g.delta) > 15 && (dna.dims[g.key]?.locked || dna.dims[g.key]?.source === 'designer')).map((g) => g.key);
                      const brief = project.brief.doc;
                      const patches = drift.length
                        ? dnaPatches(spec, dna, drift, {
                            lang: languageOf(spec.look.language) ?? null,
                            kind: brief ? intentOf(brief).kind : 'site',
                            hasImages: spec.sections.some((x) => x.images.length > 0),
                            keepColours: !!brief?.system || brief?.decisions?.colour === 'locked' || (project.direction.chosen?.locks ?? []).includes('palette'),
                            keepType: !!brief?.system || brief?.decisions?.typography === 'locked' || (project.direction.chosen?.locks ?? []).includes('type'),
                            locks: project.direction.chosen?.locks ?? [],
                          })
                        : [];
                      return (
                        <>
                          <DnaGlyph dna={own} against={dnaValues(dna)} keys={dnaKeysFor(brief ? intentOf(brief).kind : 'site', false).filter((k) => dna.dims[k])} label="This design's DNA (filled), against yours (hollow)" />
                          <p className="v0-quiet">
                            This design reads <b>{dnaWords(own)}</b>. It keeps your DNA at <b>{c.score}</b> of 100.
                            {drift.length ? ` The ${drift.map((k) => DNA_META[k].label.toLowerCase()).join(' and ')} drifted from where you set it.` : ''}
                          </p>
                          <span className="v0-finding-acts">
                            {patches.length > 0 && (
                              <button type="button" className="sb-link is-meta is-strong" onClick={() => applyLocal(patches, `brought back to the Creative DNA (${drift.map((k) => DNA_META[k].label.toLowerCase()).join(', ')})`)}>
                                Bring it back to the DNA
                              </button>
                            )}
                            <button type="button" className="sb-link is-meta" onClick={() => setView('dna')}>
                              Shape the DNA
                            </button>
                          </span>
                        </>
                      );
                    })()}
                  </section>
                )}
                {originality && (
                  <section className="v0-cellset orig" aria-label="Originality">
                    <span className="sb-label">Originality</span>
                    <div className="orig-scores">
                      {(
                        [
                          ['distinctiveness', 'Its own'],
                          ['composition', 'Composed'],
                          ['relevance', 'Does its job'],
                          ['dna', 'Keeps its DNA'],
                        ] as const
                      ).map(([k, label]) => (
                        <span key={k} className="orig-score" title={originality.notes[k].join('; ') || 'Nothing lost'}>
                          <b>{originality.scores[k]}</b>
                          <span className="orig-score-l">{label}</span>
                          <span className="orig-bar" aria-hidden="true">
                            <i style={{ width: `${originality.scores[k]}%` }} />
                          </span>
                        </span>
                      ))}
                    </div>
                    {originality.findings.length === 0 ? (
                      <p className="v0-quiet">None of the patterns generated pages fall into{past.length ? ', and nothing repeated from your earlier designs' : ''}.</p>
                    ) : (
                      <ul className="orig-list">
                        {originality.findings.map((f) => (
                          <li key={f.pattern} className={f.justified ? 'is-allowed' : 'is-open'}>
                            <span className="orig-k">{f.justified ? 'Allowed' : 'Generic'} · {PATTERN_LABEL[f.pattern]}</span>
                            <span className="v0-body">{f.detail}</span>
                            {f.justified && f.because && <span className="v0-quiet">Because {f.because}.</span>}
                            {!f.justified && f.fix && f.fix.length > 0 && (
                              <span className="v0-finding-acts">
                                <button type="button" className="sb-link is-meta is-strong" onClick={() => applyLocal(f.fix!, f.fixLabel ?? f.label)}>
                                  {f.fixLabel ?? 'Fix it'}
                                </button>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {originality.findings.filter((f) => !f.justified && f.fix?.length).length > 1 && (
                      <button type="button" className="sb-btn is-sm" onClick={() => applyLocal(originalityFixes(originality), 'what nothing justified, made its own')}>
                        Fix what nothing justifies
                      </button>
                    )}
                    <p className="v0-quiet orig-foot">
                      Read in code from the design{checks?.audit && checks.version === spec.version ? ' and its rendered page' : ''}, against your brief, words and DNA — no model asked. Each fix is one version Undo takes back.
                    </p>
                  </section>
                )}
                <section className="v0-cellset">
                  <span className="sb-label">Drawn at desktop, tablet and phone widths</span>
                  {!checks || (checks.running && !checks.ev) ? (
                    <p className="v0-quiet" role="status">{checks?.running ? 'Measuring the page at 1280, 834 and 390 px…' : 'Not checked yet.'}</p>
                  ) : (
                    <>
                      <div className="v0-scores">
                        <span>
                          <b>{checks.ev?.quality ?? '–'}</b> works
                        </span>
                        <span>
                          <b>{checks.ev?.distinctiveness ?? '–'}</b> its own
                        </span>
                        <span>
                          <b>{checks.ev?.fidelity ?? '–'}</b> faithful
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
                          {f.why && <span className="v0-quiet v0-finding-why">Why: {f.why}</span>}
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
                {checks?.ev && checks.ev.kept?.length > 0 && (
                  <section className="v0-cellset">
                    <span className="sb-label">What it keeps</span>
                    <ul className="v0-plain v0-kept">
                      {checks.ev.kept.map((x, i) => (
                        <li key={i}>{x}</li>
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
                            <span>
                              {s.reason || 'A version'}
                              {(project.keptVersions ?? []).includes(s.version) && <span className="v0-version-kept"> · kept</span>}
                              {i > 0 && (() => {
                                const what = describeChanges(project.specs[i - 1], s);
                                return what.length ? <span className="v0-version-what">{what.slice(0, 3).join('; ')}{what.length > 3 ? `; ${what.length - 3} more` : ''}</span> : null;
                              })()}
                            </span>
                          </button>
                        </li>
                      ))}
                  </ol>
                </section>
                {spec && (
                  <section className="v0-cellset" aria-label="This version">
                    <span className="sb-label">Version {spec.version}</span>
                    {project.specIndex < project.specs.length - 1 && (
                      <>
                        <p className="v0-quiet">
                          Changed since, in the latest: {describeChanges(spec, project.specs[project.specs.length - 1]).join('; ') || 'nothing'}.
                        </p>
                        <button
                          type="button"
                          className="sb-link is-meta is-strong"
                          onClick={() => {
                            const latest = project.specs[project.specs.length - 1];
                            const v = restoredVersion(spec, latest.version + 1);
                            update((p2) => {
                              const specs = capVersions([...p2.specs, v], p2.keptVersions);
                              return { ...p2, specs, specIndex: specs.length - 1 };
                            });
                            say(`Restored version ${spec.version} as version ${v.version}. Nothing after it is lost: the versions in between are still here.`, 'info', { acts: [{ label: 'Undo', run: () => stepVersion(-1) }] });
                            runChecks(v);
                          }}
                        >
                          Restore this version
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="sb-link is-meta"
                      aria-pressed={(project.keptVersions ?? []).includes(spec.version)}
                      onClick={() =>
                        update((p2) => {
                          const kept = new Set(p2.keptVersions ?? []);
                          if (kept.has(spec.version)) kept.delete(spec.version);
                          else kept.add(spec.version);
                          return { ...p2, keptVersions: [...kept].slice(-30) };
                        })
                      }
                    >
                      {(project.keptVersions ?? []).includes(spec.version) ? 'Kept: let it go with the others' : 'Keep this version'}
                    </button>
                    <p className="v0-quiet">The last thirty versions are kept, and every version you keep, whatever its age.</p>
                  </section>
                )}
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
              </div>
            )}
            {rail === 'publish' && spec && !imported && (
              <PublishPanel
                spec={spec}
                refs={frameRefs}
                context={{ projectName: project.name, direction: project.direction.chosen ? { name: project.direction.chosen.name, language: project.direction.chosen.language, said: project.direction.chosen.strategy?.said ?? [] } : null }}
                onSite={(site, label) => applyChecked([{ op: 'site', site, summary: label.charAt(0).toUpperCase() + label.slice(1) }], label)}
                onDownloadPage={() => {
                  // one file: its motion, its runtime inlined, its forms sending where the designer set
                  const page = renderDesign(spec, frameRefs, { motion: 'play', runtime: true, live: true }).html;
                  const url = URL.createObjectURL(new Blob([page], { type: 'text/html' }));
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${(spec.title || project.name).replace(/[^\w-]+/g, '-').toLowerCase()}.html`;
                  a.click();
                  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                  update((p) => ({ ...p, usage: acceptDesign(p.usage, spec.version) }));
                }}
                onDownloaded={() => update((p) => ({ ...p, usage: acceptDesign(p.usage, spec.version) }))}
              />
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
      {previewing && spec && !imported && <Preview spec={spec} refs={frameRefs} nonce={nonce} title={spec.title || project.name} onClose={() => setPreviewing(false)} />}
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
    </>
  );
}

const STAGE_ORDER: readonly CallKind[] = ['discover', 'direction', 'brief', 'refine-brief', 'art-direction', 'generate', 'refine', 'critique', 'image'];

/** What the project has cost, by stage, as the provider reported it; and per accepted (downloaded) design. */
function CostPanel({ usage, note, calls }: { usage: UsageTotals; note: string; calls: CallTiming[] }) {
  const by = usage.byStage ?? {};
  const staged = STAGE_ORDER.filter((k) => by[k]?.calls);
  const counted = staged.reduce((n, k) => n + (by[k]?.calls ?? 0), 0);
  const per = costPerAccepted(usage);
  const econ = acceptedEconomics(usage);
  const accepted = usage.accepted?.length ?? 0;
  return (
    <details className="v0-cost">
      <summary title={`${usage.input.toLocaleString()} tokens read, ${usage.output.toLocaleString()} written`}>
        US${usage.cost.toFixed(4)} · {usage.calls} call{usage.calls === 1 ? '' : 's'}
      </summary>
      <div className="v0-cost-panel" role="group" aria-label="What this project has cost">
        <p className="v0-cost-h">What this project has cost, as the provider reported it</p>
        {staged.length > 0 && (
          <table className="v0-cost-table">
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Calls</th>
                <th scope="col">Premium</th>
                <th scope="col">US$</th>
              </tr>
            </thead>
            <tbody>
              {staged.map((k) => (
                <tr key={k}>
                  <th scope="row">{STAGE_LABEL[k]}</th>
                  <td>{by[k]!.calls}</td>
                  <td>{by[k]!.premium}</td>
                  <td>{by[k]!.cost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {usage.calls > counted && (
          <p className="v0-cost-l">
            {usage.calls - counted} earlier call{usage.calls - counted === 1 ? '' : 's'}, from before stages were recorded.
          </p>
        )}
        <p className="v0-cost-l">{per != null ? `Per accepted design: US$${per.toFixed(4)} (${accepted} downloaded).` : 'Cost per accepted design appears once you download a design.'}</p>
        {econ && (
          <p className="v0-cost-l">
            Of that, US${econ.text.toFixed(4)} for text and US${econ.images.toFixed(4)} for pictures; {econ.generations} generation{econ.generations === 1 ? '' : 's'} and {econ.refinements} model-worked change{econ.refinements === 1 ? '' : 's'} per accepted design
            {econ.seconds != null ? `, ${econ.seconds} s of model time` : ''}.
          </p>
        )}
        {note && <p className="v0-cost-l is-note">{note}</p>}
        {(usage.reasoning || usage.cached) && (
          <p className="v0-cost-l">
            Of {usage.output.toLocaleString()} tokens written, {(usage.reasoning ?? 0).toLocaleString()} were the model’s reasoning (billed, never shown); of {usage.input.toLocaleString()} read, {(usage.cached ?? 0).toLocaleString()} came from the provider’s cache (billed at its cached price).
          </p>
        )}
        {calls.some((c) => c.record) && <Diagnostics calls={calls} />}
      </div>
    </details>
  );
}

const secs = (ms: number | null | undefined) => (ms == null ? '—' : (ms / 1000).toFixed(1));

/** The last calls, each as the server recorded it and the browser measured it: where the time and the money went. */
function Diagnostics({ calls }: { calls: CallTiming[] }) {
  const rows = calls.filter((c) => c.record).slice(-12).reverse();
  return (
    <details className="v0-diag">
      <summary className="sb-link is-meta">Diagnostics: the last {rows.length} call{rows.length === 1 ? '' : 's'}</summary>
      <table className="v0-cost-table v0-diag-table">
        <thead>
          <tr>
            <th scope="col">Stage</th>
            <th scope="col">Model</th>
            <th scope="col" title="tokens read (from the cache) / written (reasoning)">Tokens</th>
            <th scope="col">US$</th>
            <th scope="col" title="before the model was asked: checks and budgets">Queue s</th>
            <th scope="col" title="from asking the model to its first output">First s</th>
            <th scope="col" title="the model, every attempt included">Model s</th>
            <th scope="col" title="the network and the platform: the browser's round trip less the server's own time">Net s</th>
            <th scope="col">Total s</th>
            <th scope="col">How it ended</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const r = c.record!;
            return (
              <tr key={`${r.op}-${i}`}>
                <th scope="row">{r.stage}</th>
                <td>{r.model ? `${r.model}${r.tier === 'premium' ? ' ★' : ''}` : '—'}</td>
                <td>
                  {r.input.toLocaleString()}
                  {r.cached ? ` (${r.cached.toLocaleString()})` : ''} / {r.output.toLocaleString()}
                  {r.reasoning ? ` (${r.reasoning.toLocaleString()})` : ''}
                </td>
                <td>{r.cost == null ? '—' : r.cost.toFixed(4)}</td>
                <td>{secs(r.queuedMs)}</td>
                <td>{secs(r.ttftMs)}</td>
                <td>{secs(r.modelMs)}</td>
                <td>{secs(c.networkMs)}</td>
                <td>{secs(c.clientMs)}</td>
                <td>
                  {r.outcome}
                  {r.retries ? ` · ${r.retries} retr${r.retries === 1 ? 'y' : 'ies'}` : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="v0-cost-l">★ the premium model. Times are seconds. Tokens: read (from the cache) / written (reasoning). Nothing here is a prompt or anything you wrote.</p>
    </details>
  );
}
