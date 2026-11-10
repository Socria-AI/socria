'use client';

// components/ux/UXWorkspace.tsx — one SocriaUX project, open.
//
// Three columns: the project on the left (brief, layers, screens), the design
// in the middle — or, one key away, the map of the reasoning behind it — and
// SocriaUX on the right. The centre is always the work. Everything on either
// side is about whatever is selected in it, and everything SocriaUX proposes
// lands back in it: pinned to an element, or drawn on the map beside the
// elements it concerns.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { reduce, uid, STAGES, STAGE_META, type Stage, type UXMessage, type UXProject } from '@/lib/ux/model';
import { auditArtboard, type Finding } from '@/lib/ux/audit';
import { INTENT_META, type Intent } from '@/lib/ux/reasoning';
import { nextArtboardSlot } from '@/lib/ux/model';
import { useProject, type SaveState } from './useProject';
import { UXCanvas, type Selection, type Tool } from './UXCanvas';
import { UXMap } from './UXMap';
import { UXPanel, type PanelTab } from './UXPanel';
import { UXRail, type RailTab } from './UXRail';
import { boardSizeFor, readScreenshot } from './image';

const SAVE_LABEL: Record<SaveState, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  'local-only': 'Saved in this browser',
  quota: 'Browser storage is full — remove a screenshot',
  synced: 'Saved and synced',
  'sync-failed': 'Saved here · sync failed',
};

const TOOLS: { tool: Tool; label: string; key: string; icon: React.ReactNode }[] = [
  { tool: 'select', label: 'Select', key: 'V', icon: <path d="M5 3l14 8-6 2-2 6z" /> },
  { tool: 'hand', label: 'Pan (or hold Space)', key: '', icon: <path d="M8 13V5.5a1.5 1.5 0 013 0V12m0-1V4.5a1.5 1.5 0 013 0V12m0-6.5a1.5 1.5 0 013 0V14a7 7 0 01-7 7h-.6a6 6 0 01-4.6-2.2L3.4 16a1.6 1.6 0 012.4-2.1L8 16" /> },
  { tool: 'heading', label: 'Heading', key: 'H', icon: <path d="M6 4v16M18 4v16M6 12h12" /> },
  { tool: 'text', label: 'Text', key: 'T', icon: <path d="M5 6V4h14v2M12 4v16M9 20h6" /> },
  { tool: 'button', label: 'Button', key: 'B', icon: <rect x="3" y="7" width="18" height="10" rx="5" /> },
  { tool: 'input', label: 'Input field', key: 'I', icon: <><rect x="3" y="8" width="18" height="9" rx="2" /><path d="M7 11v3" /></> },
  { tool: 'checkbox', label: 'Checkbox', key: 'C', icon: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 12l3 3 5-6" /></> },
  { tool: 'link', label: 'Link', key: 'L', icon: <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /> },
  { tool: 'image', label: 'Image', key: 'G', icon: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 16l5-5 4 4 3-3 6 6" /></> },
  { tool: 'rect', label: 'Shape', key: 'R', icon: <rect x="4" y="5" width="16" height="14" rx="2" /> },
  { tool: 'nav', label: 'Navigation bar', key: '', icon: <><path d="M3 6h18M3 6v4h18V6" /><path d="M6 8h3M11 8h3" /></> },
  { tool: 'annotate', label: 'Note (pin a thought)', key: 'N', icon: <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" /> },
];
const KEY_TOOL: Record<string, Tool> = Object.fromEntries(TOOLS.filter((t) => t.key).map((t) => [t.key.toLowerCase(), t.tool]));

const STAGE_TABS: Record<Stage, { rail?: RailTab; panel?: PanelTab; view?: 'design' | 'map' }> = {
  frame: { rail: 'brief', panel: 'reason' },
  design: { rail: 'screens', view: 'design' },
  explore: { panel: 'critique', view: 'design' },
  evidence: { panel: 'evidence', view: 'map' },
  refine: { panel: 'decisions' },
};

const typing = (t: EventTarget | null) => !!(t as HTMLElement)?.closest?.('input, textarea, select, [contenteditable="true"]');

export function UXWorkspace({ initial, signedIn, onExit }: { initial: UXProject; signedIn: boolean; onExit: () => void }) {
  const { project, dispatch, undo, redo, canUndo, canRedo, save } = useProject(initial, { signedIn });
  const projectRef = useRef(project);
  projectRef.current = project;

  const [selection, setSelection] = useState<Selection>({ artboardId: initial.artboards[0]?.id ?? null, elementId: null });
  const lastBoard = useRef<string | null>(initial.artboards[0]?.id ?? null);
  if (selection.artboardId) lastBoard.current = selection.artboardId;
  const focusArtboardId =
    (selection.artboardId && project.artboards.some((a) => a.id === selection.artboardId) && selection.artboardId) ||
    (lastBoard.current && project.artboards.some((a) => a.id === lastBoard.current) && lastBoard.current) ||
    project.artboards[0]?.id ||
    null;

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [view, setView] = useState<'design' | 'map'>('design');
  const [tool, setTool] = useState<Tool>('select');
  const [railTab, setRailTab] = useState<RailTab>(initial.brief.problem.trim() ? (initial.artboards.length ? 'layers' : 'screens') : 'brief');
  const [panelTab, setPanelTab] = useState<PanelTab>('reason');
  const [showChecks, setShowChecks] = useState(true);
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const [openPin, setOpenPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; signIn?: boolean } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitSignal, setFitSignal] = useState(0);
  const [railOpen, setRailOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const camRef = useRef<{ zoomBy: (f: number) => void; fit: () => void; k: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // findings the designer set aside, per project, in this browser
  const dismissKey = `socria.ux.dismissed.v1:${project.id}`;
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(dismissKey) || '[]'));
    } catch {
      return new Set();
    }
  });
  const dismiss = (id: string) =>
    setDismissed((s) => {
      const n = new Set(s);
      n.add(id);
      try {
        localStorage.setItem(dismissKey, JSON.stringify([...n].slice(-400)));
      } catch {
        /* storage full: the dismissal lasts this session */
      }
      return n;
    });

  const allFindings = useMemo(() => project.artboards.flatMap((a) => auditArtboard(a)).filter((f) => !dismissed.has(f.id)), [project.artboards, dismissed]);
  const focusFindings = useMemo(() => {
    const ab = project.artboards.find((a) => a.id === focusArtboardId);
    return ab ? auditArtboard(ab) : [];
  }, [project.artboards, focusArtboardId]);

  const select = useCallback(
    (s: Selection) => {
      setSelection(s);
      if (s.elementId && railTab === 'brief') setRailTab('layers');
    },
    [railTab]
  );

  const showNode = (id: string) => {
    setView('map');
    setSelectedNode(id);
  };
  const showElement = (s: Selection) => {
    setView('design');
    setSelection(s);
    setRailTab('layers');
  };
  const onFinding = (f: Finding) => {
    setActiveFinding(f.id);
    setPanelTab('critique');
    setPanelOpen(true);
    if (f.elementId) setSelection({ artboardId: f.artboardId, elementId: f.elementId });
    else setSelection({ artboardId: f.artboardId, elementId: null });
  };

  const setStage = (s: Stage) => {
    dispatch({ type: 'stage/set', stage: s });
    const t = STAGE_TABS[s];
    if (t.rail) setRailTab(t.rail);
    if (t.panel) setPanelTab(t.panel);
    if (t.view) setView(t.view);
  };

  // ── asking SocriaUX ────────────────────────────────────────────────
  const ask = useCallback(
    async (intent: Intent, message: string, over?: Partial<Selection & { nodeId: string | null }>) => {
      const cur = projectRef.current;
      const focus = {
        artboardId: over && 'artboardId' in over ? over.artboardId ?? null : selection.artboardId ?? focusArtboardId,
        elementId: over && 'elementId' in over ? over.elementId ?? null : selection.elementId,
        nodeId: over && 'nodeId' in over ? over.nodeId ?? null : view === 'map' ? selectedNode : null,
      };
      const text = message.trim() || INTENT_META[intent].prompt;
      const mine: UXMessage = {
        id: uid('m'),
        role: 'designer',
        text,
        mode: cur.mode,
        kind: 'note',
        focus,
        questions: [],
        principles: [],
        suggestions: [],
        code: null,
        createdAt: Date.now(),
      };
      dispatch({ type: 'message/add', message: mine });
      const snapshot = reduce(cur, { type: 'message/add', message: mine });
      setPanelTab('reason');
      setPanelOpen(true);
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/ux/reason', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // the model reasons from elements, never pixels: screenshots stay here
            project: { ...snapshot, artboards: snapshot.artboards.map((a) => ({ ...a, image: a.image ? { ...a.image, src: 'data:image/png;base64,' } : null })) },
            intent,
            mode: cur.mode,
            message: text,
            focus,
          }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.message) {
          setError({
            text:
              res.status === 401
                ? 'Reasoning with SocriaUX needs a Socria account.'
                : res.status === 429
                  ? j?.error || 'That is the limit for now. Your work is saved; try again shortly.'
                  : j?.error || 'SocriaUX could not answer just now. Your work is saved; try again in a moment.',
            signIn: res.status === 401,
          });
          return;
        }
        dispatch({ type: 'message/add', message: j.message });
      } catch {
        setError({ text: 'You appear to be offline. Your work is saved in this browser.' });
      } finally {
        setBusy(false);
      }
    },
    [dispatch, selection, focusArtboardId, view, selectedNode]
  );

  // ── screenshots ────────────────────────────────────────────────────
  const importShot = useCallback(
    async (file: File) => {
      try {
        const shot = await readScreenshot(file);
        const { w, h } = boardSizeFor(shot);
        const slot = nextArtboardSlot(projectRef.current, w);
        const id = uid('ab');
        dispatch({
          type: 'artboard/add',
          artboard: {
            id,
            name: file.name ? file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 60) || 'Screenshot' : 'Screenshot',
            x: slot.x,
            y: slot.y,
            w,
            h,
            background: '#ffffff',
            elements: [],
            image: shot,
            parentId: null,
            intent: '',
            createdAt: Date.now(),
          },
        });
        setSelection({ artboardId: id, elementId: null });
        setView('design');
        setFitSignal((n) => n + 1);
        setNotice('Screenshot added. Pin notes on it with N, or place elements over the parts you want measured.');
        window.setTimeout(() => setNotice(null), 6000);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'The image could not be added.');
        window.setTimeout(() => setNotice(null), 5000);
      }
    },
    [dispatch]
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        importShot(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [importShot]);

  // ── keyboard ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (typing(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        if (typing(e.target)) return;
        e.preventDefault();
        redo();
        return;
      }
      if (typing(e.target)) return;
      const ab = projectRef.current.artboards.find((a) => a.id === selection.artboardId);
      const el = ab?.elements.find((x) => x.id === selection.elementId);
      if (e.key === 'Escape') {
        setTool('select');
        setOpenPin(null);
        if (selection.elementId) setSelection({ artboardId: selection.artboardId, elementId: null });
        return;
      }
      if (view === 'design' && el && ab) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          dispatch({ type: 'element/remove', artboardId: ab.id, id: el.id });
          setSelection({ artboardId: ab.id, elementId: null });
          return;
        }
        const step = e.shiftKey ? 10 : 1;
        const nudge: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (nudge[e.key]) {
          e.preventDefault();
          dispatch({ type: 'element/update', artboardId: ab.id, id: el.id, patch: { x: el.x + nudge[e.key][0], y: el.y + nudge[e.key][1] } });
          return;
        }
        if (mod && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          const id = uid('el');
          dispatch({ type: 'element/add', artboardId: ab.id, element: { ...el, id, x: el.x + 16, y: el.y + 16 } });
          setSelection({ artboardId: ab.id, elementId: id });
          return;
        }
      }
      if (mod || e.altKey) return;
      if (e.key === 'Tab' && e.shiftKey) return;
      if (e.key === '1') setView('design');
      else if (e.key === '2') setView('map');
      else if (view === 'design' && (e.key === '0' || (e.shiftKey && e.key === '!'))) setFitSignal((n) => n + 1);
      else if (view === 'design' && KEY_TOOL[e.key.toLowerCase()]) setTool(KEY_TOOL[e.key.toLowerCase()]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, view, dispatch, undo, redo]);

  const stageIndex = STAGES.indexOf(project.stage);

  return (
    <div className={`uxr lg-tokens${railOpen ? ' rail-open' : ''}${panelOpen ? ' panel-open' : ''}`}>
      <header className="uxh">
        <div className="uxh-left">
          <button type="button" className="uxh-home" onClick={onExit} aria-label="All projects">
            <img src="/socria-mark.png" alt="" width={22} height={22} />
            <span className="uxh-brand">
              Socria<em>UX</em>
            </span>
          </button>
          <span className="uxh-slash" aria-hidden="true">
            /
          </span>
          <input className="uxh-name" value={project.name} onChange={(e) => dispatch({ type: 'project/rename', name: e.target.value })} aria-label="Project name" />
        </div>
        <nav className="uxh-stages" aria-label="Workflow stage">
          {STAGES.map((s, i) => (
            <button
              key={s}
              type="button"
              className={`uxh-stage${project.stage === s ? ' is-on' : ''}${i < stageIndex ? ' is-past' : ''}`}
              onClick={() => setStage(s)}
              title={STAGE_META[s].hint}
              aria-current={project.stage === s ? 'step' : undefined}
            >
              <span className="uxh-stage-n">{['I', 'II', 'III', 'IV', 'V'][i]}</span>
              {STAGE_META[s].label}
            </button>
          ))}
        </nav>
        <div className="uxh-right">
          <div className="uxr-seg" role="radiogroup" aria-label="View">
            <button type="button" role="radio" aria-checked={view === 'design'} className={view === 'design' ? 'is-on' : ''} onClick={() => setView('design')} title="Design (1)">
              Design
            </button>
            <button type="button" role="radio" aria-checked={view === 'map'} className={view === 'map' ? 'is-on' : ''} onClick={() => setView('map')} title="Reasoning map (2)">
              Map{project.nodes.length ? ` · ${project.nodes.length}` : ''}
            </button>
          </div>
          <button type="button" className="uxr-icon" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a6 6 0 010 12h-3" />
            </svg>
          </button>
          <button type="button" className="uxr-icon" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 14l5-5-5-5" />
              <path d="M20 9H10a6 6 0 000 12h3" />
            </svg>
          </button>
          <span className={`uxh-save s-${save}`} role="status">
            {SAVE_LABEL[save]}
          </span>
          {!signedIn && (
            <a className="uxh-signin" href="/sign-in?redirect_url=/ux">
              Sign in
            </a>
          )}
          <button type="button" className="uxh-toggle rail" onClick={() => (setRailOpen((v) => !v), setPanelOpen(false))} aria-label="Project panel" aria-expanded={railOpen}>
            Project
          </button>
          <button type="button" className="uxh-toggle panel" onClick={() => (setPanelOpen((v) => !v), setRailOpen(false))} aria-label="SocriaUX panel" aria-expanded={panelOpen}>
            SocriaUX
          </button>
        </div>
      </header>

      <div className="uxw">
        <UXRail
          project={project}
          dispatch={dispatch}
          tab={railTab}
          onTab={setRailTab}
          selection={selection}
          onSelect={(s) => (setView('design'), select(s))}
          focusArtboardId={focusArtboardId}
          onShowNode={showNode}
          onUpload={() => fileRef.current?.click()}
          ask={ask}
          busy={busy}
        />

        <main className="uxw-center" aria-label={view === 'design' ? 'Design' : 'Reasoning map'}>
          <div className="uxw-stagehint">
            <span>{STAGE_META[project.stage].label}</span> — {STAGE_META[project.stage].hint}
          </div>
          {view === 'design' ? (
            <>
              <UXCanvas
                project={project}
                dispatch={dispatch}
                selection={selection}
                onSelect={select}
                tool={tool}
                onTool={setTool}
                findings={allFindings}
                showChecks={showChecks}
                activeFinding={activeFinding}
                onFinding={onFinding}
                openPin={openPin}
                onOpenPin={setOpenPin}
                onAsk={(prompt, focus) => ask('ask', prompt, focus)}
                fitSignal={fitSignal}
                camRef={camRef}
                onZoom={setZoom}
              />
              <div className="uxw-toolbar" role="toolbar" aria-label="Tools">
                {TOOLS.map((t) => (
                  <button
                    key={t.tool}
                    type="button"
                    className={`uxw-tool${tool === t.tool ? ' is-on' : ''}`}
                    onClick={() => setTool(t.tool)}
                    title={`${t.label}${t.key ? ` (${t.key})` : ''}`}
                    aria-label={t.label}
                    aria-pressed={tool === t.tool}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {t.icon}
                    </svg>
                  </button>
                ))}
                <span className="uxw-tsep" />
                <button type="button" className={`uxw-tool wide${showChecks ? ' is-on' : ''}`} onClick={() => setShowChecks((v) => !v)} aria-pressed={showChecks} title="Show what the checks measured">
                  Checks
                </button>
                <span className="uxw-tsep" />
                <div className="uxc-zoom">
                  <button type="button" className="uxw-tool" onClick={() => camRef.current?.zoomBy(1 / 1.2)} aria-label="Zoom out">
                    −
                  </button>
                  <button type="button" className="uxw-zoomval" onClick={() => setFitSignal((n) => n + 1)} title="Fit to screen (0)">
                    {Math.round(zoom * 100)}%
                  </button>
                  <button type="button" className="uxw-tool" onClick={() => camRef.current?.zoomBy(1.2)} aria-label="Zoom in">
                    +
                  </button>
                </div>
              </div>
            </>
          ) : (
            <UXMap
              project={project}
              dispatch={dispatch}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
              selection={selection}
              onShowElement={showElement}
              onAsk={(prompt, focus) => ask('ask', prompt, { nodeId: focus.nodeId, artboardId: focusArtboardId, elementId: null })}
            />
          )}
          {notice && (
            <div className="uxw-notice" role="status">
              {notice}
            </div>
          )}
        </main>

        <UXPanel
          project={project}
          dispatch={dispatch}
          tab={panelTab}
          onTab={setPanelTab}
          selection={selection}
          selectedNode={view === 'map' ? selectedNode : null}
          onSelect={(s) => (setView('design'), setSelection(s))}
          onClearFocus={() => {
            setSelection({ artboardId: null, elementId: null });
            setSelectedNode(null);
          }}
          onShowNode={showNode}
          findings={focusFindings}
          dismissed={dismissed}
          onDismiss={dismiss}
          activeFinding={activeFinding}
          onFinding={onFinding}
          showChecks={showChecks}
          onShowChecks={setShowChecks}
          onOpenPin={(id) => {
            const a = project.annotations.find((x) => x.id === id);
            setView('design');
            if (a) setSelection({ artboardId: a.artboardId, elementId: a.elementId });
            setOpenPin(id);
          }}
          ask={ask}
          busy={busy}
          error={error}
          signedIn={signedIn}
          focusArtboardId={focusArtboardId}
        />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importShot(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
