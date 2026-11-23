'use client';

// components/ux-v0/graphics/GraphicsWorkspace.tsx — a graphics project: its brief, three directions, and the editor.
//
// Nothing here calls a model. The brief is read from the designer's words and corrected in fields (GraphicBrief.tsx);
// the directions are SocriaUX's own art-direction engine (lib/ux-v0/direction.ts) given to graphics
// (graphicDirectionOf), or an approved website's direction, so a brand carries across media; the composition is
// planned and placed in code (compose.ts), checked and repaired at most twice (check.ts); a change asked in words is
// read into validated operations (edit.ts) and shown as a preview before it is applied. The editor itself
// (GraphicEditor.tsx) is shared with the graphic materials of a board. The project is saved like a website
// (useV0Project).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SAVE_WORDS, useV0Project } from '../useV0Project';
import { addUpload } from '../uploads';
import { getProject, listProjects } from '@/lib/ux-v0/store';
import { normalizeBrief, type DesignProject } from '@/lib/ux-v0/types';
import { proposeDirections } from '@/lib/ux-v0/direction';
import { newId, type Asset, type GraphicDoc } from '@/lib/ux-v0/graphics/doc';
import { accentFor, composeGraphic, graphicDirectionOf, type GraphicBrief, type GraphicDirection } from '@/lib/ux-v0/graphics/compose';
import { interpretations } from '@/lib/ux-v0/graphics/generative/engine';
import { languageDirection } from '@/lib/ux-v0/graphics/generative/language';
import { refineDoc } from '@/lib/ux-v0/graphics/check';
import { canvasMeasure } from '@/lib/ux-v0/graphics/raster';
import { emptyGraphicState, MAX_GRAPHIC_VERSIONS, type GraphicState, type GraphicVersion } from '@/lib/ux-v0/graphics/state';
import { styledOptions } from '@/lib/ux-v0/graphics/styles/propose';
import { GraphicEditor, directionOfDoc, type EditorNote } from './GraphicEditor';
import { LogoConceptsStage } from './LogoPanel';
import { putProject } from '@/lib/ux-v0/store';
import { makeProject } from '@/lib/ux-v0/types';
import { startBoard } from '@/lib/ux-v0/boards/pipeline';
import type { BoardBrief } from '@/lib/ux-v0/boards/model';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import { directionFaces, facesUsed, loadFaces, useAssetUrls, useFaceMeasure } from './faces';
import { BriefStage, DirectionsStage, briefOf, fieldsOf, KIND_LABEL, type BriefFields, type WebsiteSource } from './GraphicBrief';
import { brandDirections } from '@/lib/ux-v0/dsi/generate';
import { guardedForBrand } from '@/lib/ux-v0/dsi/adapters';
import { bindForBrand } from '@/lib/ux-v0/dsi/link';
import { fidelityOfDoc } from '@/lib/ux-v0/dsi/fidelity';
import { useLinkedSystem } from '../systems/useLinkedSystem';
import { SystemBadge } from '../systems/SystemBadge';
import { StudioRail, useRailReply } from '../studio/StudioRail';
import { combineDirections, directionsWithPrefs, prefsOf, withTreatment } from '@/lib/ux-v0/studio/apply';
import { COMBINE_WORDS, colourFirst, ordinalsIn } from '@/lib/ux-v0/studio/director';

type View = 'brief' | 'directions' | 'edit';
type Note = EditorNote;

const seedOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 9973;
const pushVersion = (list: GraphicVersion[], doc: GraphicDoc, label: string): GraphicVersion[] => [...list, { doc, label: label.slice(0, 160), at: Date.now() }].slice(-MAX_GRAPHIC_VERSIONS);
const DEFAULT_NAMES = new Set(['Untitled design', 'Untitled graphic', '']);

export function GraphicsWorkspace({ initial, signedIn, onExit, startIntent, onOpenProject }: { initial: DesignProject; signedIn: boolean; onExit: () => void; startIntent?: string; onOpenProject?: (id: string) => void }) {
  const { project, update, save, current } = useV0Project(initial, signedIn);
  // a work made in conversation opens on the work alone, the conversation beside it; the panels come out by hand
  const [railOpen, setRailOpen] = useState(false);
  const [byHand, setByHand] = useState(() => !initial.studio || initial.studio.via === 'hand');
  const g: GraphicState = project.graphic ?? emptyGraphicState();
  const setG = useCallback((fn: (x: GraphicState) => GraphicState) => update((p) => ({ ...p, graphic: fn(p.graphic ?? emptyGraphicState()) })), [update]);

  const [view, setView] = useState<View>(g.doc ? 'edit' : g.options.length ? 'directions' : 'brief');
  const [fields, setFields] = useState<BriefFields>(() => fieldsOf(g.brief, g.brief ? '' : startIntent ?? project.intent ?? ''));
  const [error, setError] = useState('');
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState('');
  const [round, setRound] = useState(0);
  const [seen, setSeen] = useState<string[]>([]);
  const [siteDir, setSiteDir] = useState<GraphicDirection | null>(null);
  const [websites, setWebsites] = useState<WebsiteSource[]>([]);
  const [planNotes, setPlanNotes] = useState<string[]>([]);
  // the registry design system the graphic is built in (identity only: the composition stays the engine's)
  const linked = useLinkedSystem(project.systemLink);
  const brandOpts = useMemo(() => ({ mode: project.systemLink?.mode, overrides: project.systemLink?.overrides }), [project.systemLink]);
  const fidelity = useMemo(() => (linked && g.doc ? fidelityOfDoc(g.doc, linked.content, brandOpts) : null), [linked, g.doc, brandOpts]);

  // ── fonts and measuring: the faces of the design and of the directions on offer ──
  const faces = useMemo(() => [...(g.doc ? facesUsed(g.doc) : []), ...g.options.flatMap(directionFaces)], [g.doc, g.options]);
  const { measure, refresh: refreshMeasure } = useFaceMeasure(faces);

  // ── pictures kept in this browser, shown by object address ──
  const allAssets = useMemo(() => {
    const m = new Map<string, Asset>();
    for (const a of [...(g.assets ?? []), ...(g.doc?.assets ?? [])]) m.set(a.id, a);
    return [...m.values()];
  }, [g.assets, g.doc]);
  const { href, resolve, missing: missingUploads } = useAssetUrls(allAssets);

  // ── the websites whose direction a graphic may take ──
  useEffect(() => {
    listProjects()
      .then((xs) => setWebsites(xs.filter((s) => !s.graphic && s.mode === 'create' && s.direction && s.id !== project.id).map((s) => ({ id: s.id, name: s.name || 'Untitled', direction: s.direction }))))
      .catch(() => undefined);
  }, [project.id]);
  useEffect(() => {
    if (!g.source || siteDir) return;
    getProject(g.source.projectId)
      .then((p) => p?.direction.chosen && setSiteDir(graphicDirectionOf(p.direction.chosen)))
      .catch(() => undefined);
  }, [g.source, siteDir]);

  const useWebsite = async (id: string | null) => {
    if (!id) {
      setSiteDir(null);
      setG((x) => ({ ...x, source: undefined }));
      return;
    }
    const p = await getProject(id);
    const d = p?.direction.chosen;
    if (!p || !d) return setError('That website has no approved direction yet.');
    setError('');
    setSiteDir(graphicDirectionOf(d));
    setG((x) => ({ ...x, source: { projectId: id, name: p.name || 'Untitled' } }));
  };

  // ── pictures ──
  const uploadPicture = async (f: File): Promise<Asset | null> => {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) {
      const msg = `“${f.name}” is not a picture SocriaUX can use here (PNG, JPG, WebP or GIF).`;
      view === 'edit' ? setNote({ tone: 'warn', text: msg }) : setError(msg);
      return null;
    }
    const r = await addUpload(f);
    if (!r.ok) {
      view === 'edit' ? setNote({ tone: 'warn', text: r.error }) : setError(r.error);
      return null;
    }
    return { id: newId('as'), kind: 'image', src: `upload:${r.ref.providerId}`, width: r.ref.width, height: r.ref.height, name: (r.ref.title || f.name).slice(0, 120), credit: 'Your own', source: 'upload' };
  };

  // ── directions ──
  const proposeFor = useCallback(
    (brief: GraphicBrief, r: number, already: readonly string[]): GraphicDirection[] => {
      // the accent read from the brief (a colour it names, else its mood and subject), each language's way with it after
      const accent = accentFor(brief, project.id);
      const db = normalizeBrief({
        pageType: 'website',
        objective: brief.purpose || brief.content.headline,
        personality: brief.mood,
        visualDirection: [brief.purpose, brief.mood.join(', ')].filter(Boolean).join('. '),
        palette: [{ name: 'Accent', hex: accent.hex, role: 'accent' }],
        typography: { display: '', body: '' },
        decisions: { colour: 'delegated', typography: 'delegated' },
      });
      if (!db) return [];
      // what the studio's conversation decided reaches the engine as its own inputs: the designer's values (Creative
      // DNA), what to avoid, their words for the look
      const prefs = project.studio ? prefsOf(project.studio) : null;
      const dirs = proposeDirections({ brief: db, salt: project.id, round: r, seen: already, count: 3, ...(project.dna ? { dna: project.dna } : {}), ...(prefs?.avoid.length ? { avoid: prefs.avoid.join('. ') } : {}), ...(prefs?.styleWords ? { notes: prefs.styleWords } : {}) }).map((d) => graphicDirectionOf(d));
      // each in a design language chosen from the brief (a style it names first), none of them a default; and each an
      // independent interpretation (its own lead and seed), so the three are three concepts, not three colourways
      const options = styledOptions(brief, dirs, { salt: `${project.id}|${r}`, seedKey: project.id, seen: already }).options;
      // directions are not only styles: the last is a language generated from the brief itself (its temperament and the
      // things it names give the palette and the faces; no style profile)
      const generated = languageDirection(brief.purpose || brief.content.headline, brief.mood, `${project.id}|${r}`);
      const mixed = [...options.slice(0, Math.max(1, options.length - 1)), generated];
      const leads = interpretations({ count: mixed.length, salt: `${project.id}|${r}`, hasImage: brief.images.length > 0, hasData: !!brief.content.data?.length });
      const out = mixed.map((d, i) => ({ ...d, generative: { seed: leads[i].seed, emphasis: leads[i].emphasis, ...(leads[i].unexpected ? { constraints: { unexpected: true } } : {}) } }));
      // the palette, faces and composition chosen in the conversation (never over a design system's identity)
      const held = prefs ? directionsWithPrefs(out, prefs, { keepIdentity: !!linked }) : out;
      // within a design system: each direction keeps its own expression and speaks the system's identity
      return linked ? brandDirections(linked.content, held, brandOpts) : held;
    },
    [project.id, project.studio, project.dna, linked, brandOpts],
  );

  /** The design composed in a direction, checked and repaired, as the current document and a version. */
  const composeIn = async (dir: GraphicDirection, brief: GraphicBrief) => {
    setBusy(`Composing in “${dir.name}”…`);
    const changed = await loadFaces(directionFaces(dir));
    const m = canvasMeasure();
    const t0 = performance.now();
    // within a design system the brand is named, so its approved logo has a place in the composition
    const named = linked && !brief.content.brand ? { ...brief, content: { ...brief.content, brand: linked.content.identity.name } } : brief;
    const composed = composeGraphic(named, dir, { measure: m, seed: seedOf(project.id), assets: g.assets ?? [], name: current.current.name });
    const { plans, placeholders } = composed;
    // the person's own pictures, treated as they chose in the conversation (the engine's own effects; changeable after)
    const doc = project.studio ? withTreatment(composed.doc, prefsOf(project.studio)) : composed.doc;
    // within a design system: its approved logo placed and its hard rules resolved first, then the checks and repairs
    // judge the colours the design will really have (lib/ux-v0/dsi/adapters.ts guardedForBrand)
    const brand = linked ? guardedForBrand(doc, linked.content, brandOpts, m) : null;
    const refined = brand ?? refineDoc(doc, m);
    const finalDoc = refined.doc;
    let bindings = g.bindings;
    let brandLine = '';
    if (linked && brand) {
      bindings = bindForBrand(finalDoc, dir.look);
      const f = fidelityOfDoc(finalDoc, linked.content, brandOpts);
      brandLine = `Brand fidelity to ${linked.rec.name}: ${f.score}${brand.placed ? ', with its approved logo' : ''}${f.findings.length ? ` (${f.findings.length} finding${f.findings.length === 1 ? '' : 's'}: ${f.findings[0].message})` : ''}.`;
    }
    const ms = Math.round(performance.now() - t0);
    setG((x) => ({ ...x, brief, direction: dir, doc: finalDoc, ...(bindings ? { bindings } : {}), versions: pushVersion(x.versions, finalDoc, `Composed in “${dir.name}”`) }));
    setPlanNotes([...new Set([...plans.flatMap((p) => p.said), ...(g.source ? [] : [`Colour: ${accentFor(brief, project.id).why}.`])])].slice(0, 9));
    const remaining = refined.remaining.filter((f) => f.severity !== 'low').length;
    setNote({
      tone: placeholders.length || remaining ? 'warn' : 'ok',
      text: [
        `Composed and checked in ${ms} ms, without a model.`,
        brandLine,
        refined.fixed.length ? `Fixed before showing: ${refined.fixed.slice(0, 3).map((f) => f.replace(/\.$/, '')).join('; ')}.` : '',
        remaining ? `${remaining} thing${remaining === 1 ? '' : 's'} left to look at (Checks, with nothing selected).` : '',
        placeholders.length ? `Still to give: ${placeholders.join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    });
    if (changed) refreshMeasure();
    setBusy('');
    setView('edit');
  };

  /** A logo brief: concepts explored (no directions, no templates), the first on its artboard, the concepts shown. */
  const exploreLogo = (brief: GraphicBrief) => {
    setBusy('Constructing logo concepts from the brief…');
    setTimeout(() => {
      const t0 = performance.now();
      const { doc } = composeGraphic(brief, directionOfDoc({ schema: 1, id: 'x', name: 'x', tokens: { colors: { background: '#f6f4ef', surface: '#ffffff', text: '#16181c', muted: '#5d5a52', accent: '#2b4c6f', accentText: '#ffffff', line: '#d8d3c6' }, fonts: { display: 'Inter', body: 'Inter' } }, artboards: [], assets: [], revision: 0, updatedAt: 0 }), { seed: seedOf(project.id), name: current.current.name });
      const rec = doc.artboards.find((b) => b.logo)?.logo;
      const ms = Math.round(performance.now() - t0);
      setG((x) => ({ ...x, brief, options: [], direction: null, doc, versions: pushVersion(x.versions, doc, 'Logo concepts explored') }));
      setNote({ tone: 'ok', text: `${rec?.concepts.length ?? 0} logo concepts constructed in ${ms} ms, without a model and without a library of logos.` });
      setBusy('');
      setView('directions');
    }, 0);
  };

  /** A board made from an approved logo's identity: its materials planned in that system, opened. */
  const makeBoard = async (sys: MasterDesignSystem) => {
    const name = sys.name || project.name;
    const brief: BoardBrief = { purpose: `The ${name} identity in use: a social post, a poster, a business card, a presentation, a website and packaging.`, name, content: { headline: name, ...(g.brief?.content.subhead ? { subhead: g.brief.content.subhead } : {}), brand: name }, mood: sys.personality, materials: [{ kind: 'social', count: 1 }, { kind: 'poster', count: 1 }, { kind: 'card', count: 1 }, { kind: 'presentation', count: 1 }, { kind: 'website', count: 1 }, { kind: 'mockup', count: 1, template: 'box' }], images: [], annotate: true };
    const p: DesignProject = { ...makeProject('create', `${name} — identity board`), medium: 'board', board: startBoard(brief, sys, { request: brief.purpose }), intent: brief.purpose };
    await putProject(p);
    setNote({ tone: 'ok', text: `A board “${p.name}” was made from the identity, its materials planned in the approved logo’s system.${onOpenProject ? ' Opening it.' : ' It is in your designs.'}` });
    if (onOpenProject) onOpenProject(p.id);
  };

  const continueFromBrief = () => {
    const brief = briefOf(fields, (g.assets ?? []).map((a) => a.id));
    if (!brief) return setError('Write the headline first: SocriaUX composes around your words and never invents them.');
    setError('');
    update((p) => ({ ...p, name: DEFAULT_NAMES.has(p.name) ? brief.content.headline.slice(0, 80) : p.name, intent: p.intent || fields.words.slice(0, 600), graphic: { ...(p.graphic ?? emptyGraphicState()), brief } }));
    if (brief.kind === 'logo') return exploreLogo(brief);
    if (siteDir && g.source) return void composeIn(siteDir, brief);
    const options = proposeFor(brief, 0, []);
    setRound(0);
    setSeen(options.flatMap((o) => [o.language, ...(o.style ? [o.style.primary] : [])]));
    setG((x) => ({ ...x, brief, options }));
    setView('directions');
  };

  const moreDirections = () => {
    if (!g.brief) return;
    const r = round + 1;
    const options = proposeFor(g.brief, r, seen);
    setRound(r);
    setSeen((s) => [...new Set([...s, ...options.flatMap((o) => [o.language, ...(o.style ? [o.style.primary] : [])])])]);
    setG((x) => ({ ...x, options: siteDir && x.source ? [siteDir, ...options] : options }));
  };

  // ── a work begun in the studio: its brief came from the conversation, so the directions (or the logo concepts)
  // follow at once, as they would from Continue ──
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    // within a design system, its identity first (it loads a moment after the workspace opens)
    if (project.systemLink && !linked) return;
    autoStarted.current = true;
    const b = g.brief;
    if (project.studio?.status !== 'started' || !b || g.options.length || g.doc) return;
    if (b.kind === 'logo') return exploreLogo(b);
    const options = proposeFor(b, 0, []);
    setSeen(options.flatMap((o) => [o.language, ...(o.style ? [o.style.primary] : [])]));
    setG((x) => ({ ...x, options }));
    setView('directions');
    setNote({ tone: 'ok', text: 'Three directions from the conversation: your words, in what you chose. Choose one to develop.' });
  }, [linked]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the conversation beside the workspace: words go to the editor (or choose among the directions) ──
  const [inbox, setInbox] = useState<{ id: number; words: string } | null>(null);
  const [asked, setAsked] = useState<{ text: string } | null>(null);
  const waitReply = useRailReply(asked, (a) => a.text);
  const railAsk = async (words: string): Promise<string | null> => {
    if (view === 'edit' && g.doc) {
      const wait = waitReply();
      setInbox((i) => ({ id: (i?.id ?? 0) + 1, words }));
      return wait;
    }
    if (view === 'directions' && !isLogo && g.brief) {
      const low = words.toLowerCase();
      const ords = ordinalsIn(low).filter((i) => g.options[i]);
      // two of them made one: the colours of the one named with "colours" (else the first named), the rest of the other
      if (ords.length >= 2 && COMBINE_WORDS.test(low)) {
        const [a, b] = colourFirst(low, ords);
        const d = combineDirections(g.options[a], g.options[b]);
        void composeIn(d, g.brief);
        return `Composing “${d.name}”: the colours of ${g.options[a].name}, the type and structure of ${g.options[b].name}.`;
      }
      if (/\b(you choose|you pick|you decide|surprise me|up to you|your call|pick for me|choose for me|whatever you think)\b/.test(low)) {
        void composeIn(g.options[0], g.brief);
        return `I’d take “${g.options[0].name}”: composing in it now. Change anything by hand, or here in words.`;
      }
      if (/\b(more|others?|another|different|new ones?|again|none|neither|not these|nothing like)\b/.test(low)) {
        moreDirections();
        return 'Three others, kept apart from those you have seen. Say what you’d like instead, if you know, and I’ll lean that way.';
      }
      if (ords.length && g.options[ords[0]]) {
        void composeIn(g.options[ords[0]], g.brief);
        return `Composing in “${g.options[ords[0]].name}”. Then change anything by hand, or here in words.`;
      }
      return 'Say “the second one”, “the first’s colours with the third”, “something different”, or “you choose”.';
    }
    if (view === 'directions' && isLogo) return 'Choose a concept and develop it; then ask for any change here in words.';
    return 'Finish the brief on the left and continue: the directions follow from it.';
  };

  /** A document from the editor: the current one, and a version when it says so. */
  const onEditorChange = (next: GraphicDoc, meta: { label: string; version?: boolean }) => setG((x) => ({ ...x, doc: next, ...(meta.version ? { versions: pushVersion(x.versions, next, meta.label) } : {}) }));

  const isLogo = g.brief?.kind === 'logo' && !!g.doc?.artboards.some((b) => b.logo);
  const steps: { id: View; label: string; ok: boolean }[] = [
    // a work begun in conversation has its brief there, not in a form
    ...(project.studio && project.studio.via !== 'hand' ? [] : [{ id: 'brief' as View, label: 'Brief', ok: true }]),
    isLogo ? { id: 'directions', label: 'Concepts', ok: true } : { id: 'directions', label: 'Directions', ok: !!g.brief && g.options.length > 0 },
    { id: 'edit', label: 'Design', ok: !!g.doc },
  ];

  return (
    <>
    {project.studio && <StudioRail studio={project.studio} onStudio={(fn) => update((p) => (p.studio ? { ...p, studio: fn(p.studio) } : p))} onAsk={railAsk} placeholder={view === 'edit' ? 'Say what to change: “make the headline bigger”, “warmer colours”…' : view === 'directions' ? '“The second one”, “the first’s colours with the third”, “something different”' : 'Say what to change'} systemName={linked?.rec.name ?? null} onOpenChange={setRailOpen} />}
    <div className="v0 sb gx">
      <header className="v0-head">
        <div className="v0-head-l">
          <button type="button" className="v0-home" onClick={onExit} aria-label="All designs">
            <img src="/socria-mark.png" alt="" width={20} height={20} />
            <span className="v0-brand">
              Socria<em>UX</em>
            </span>
            <span className="v0-tag">Graphics</span>
          </button>
          <span className="v0-slash" aria-hidden="true">
            /
          </span>
          <input className="v0-name" value={project.name} onChange={(e) => update((p) => ({ ...p, name: e.target.value.slice(0, 80) }))} aria-label="Graphic name" />
        </div>
        <nav className="sb-seg v0-steps" aria-label="Steps">
          {steps.map((s) => (
            <button key={s.id} type="button" className={`sb-seg-item${view === s.id ? ' is-on' : ''}`} aria-current={view === s.id ? 'step' : undefined} disabled={!s.ok} onClick={() => setView(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="v0-head-r">
          <SystemBadge
            project={project}
            linked={linked}
            fidelity={fidelity ? { score: fidelity.score, findings: fidelity.findings.length } : null}
            onApply={(fn) => {
              const r = fn(current.current);
              update(() => r.project);
              setNote({ tone: 'ok', text: r.say });
            }}
          />
          <span className="gx-free" title="Composition, checks and changes in words run in this browser, without a model.">
            No model calls · $0
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

      {busy && (
        <p className="gx-busy" role="status">
          {busy}
        </p>
      )}

      {view === 'brief' && (
        <BriefStage
          fields={fields}
          setFields={setFields}
          assets={g.assets ?? []}
          thumb={(a) => href(a.id, a.src)}
          onUpload={async (f) => {
            const a = await uploadPicture(f);
            if (a) setG((x) => ({ ...x, assets: [...(x.assets ?? []), a] }));
          }}
          onRemoveAsset={(id) => setG((x) => ({ ...x, assets: (x.assets ?? []).filter((a) => a.id !== id) }))}
          websites={websites}
          source={g.source ?? null}
          onUseWebsite={useWebsite}
          onContinue={continueFromBrief}
          error={error}
        />
      )}

      {view === 'directions' && isLogo && g.doc && (
        <LogoConceptsStage doc={g.doc} measure={measure} onDoc={(next, label) => setG((x) => ({ ...x, doc: next, versions: pushVersion(x.versions, next, label) }))} onDevelop={() => setView('edit')} onBack={() => setView('brief')} />
      )}

      {view === 'directions' && g.brief && !isLogo && (
        <DirectionsStage brief={g.brief} options={g.options} assets={g.assets ?? []} measure={measure} href={href} source={g.source ?? null} onChoose={(d) => void composeIn(d, g.brief!)} onMore={moreDirections} onCombine={(a, b) => void composeIn(combineDirections(a, b), g.brief!)} onBack={!project.studio || project.studio.via === 'hand' ? () => setView('brief') : undefined} />
      )}

      {view === 'edit' && g.doc && (
        <GraphicEditor
          doc={g.doc}
          onChange={onEditorChange}
          name={project.name}
          direction={g.direction ?? null}
          kind={g.brief?.kind}
          kindLabel={g.brief ? KIND_LABEL[g.brief.kind] : undefined}
          measure={measure}
          href={href}
          resolve={resolve}
          missingUploads={missingUploads}
          upload={uploadPicture}
          note={note}
          onNote={setNote}
          versions={g.versions}
          onKeepVersion={(d) => setG((x) => ({ ...x, versions: pushVersion(x.versions, d, 'Kept by hand') }))}
          planNotes={planNotes}
          brand={{ title: g.direction?.name ?? g.doc.direction?.name ?? 'This design', note: g.source ? <p className="v0-quiet">The direction of the website “{g.source.name}”.</p> : undefined }}
          allowOpen
          onMakeBoard={(sys) => void makeBoard(sys)}
          inbox={inbox}
          onAsked={(t) => setAsked({ text: t })}
          focus={!!project.studio && !byHand}
          onFocus={project.studio ? (f) => setByHand(!f) : undefined}
          hideAsk={!!project.studio && railOpen}
        />
      )}
    </div>
    </>
  );
}
