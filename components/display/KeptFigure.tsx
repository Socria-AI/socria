'use client';

// components/display/KeptFigure.tsx — AN ELEMENT KEPT FROM THE CONVERSATION, drawn — and the place it is changed.
//
// The same component the conversation drew it with (components/inline/InlineUI.tsx), opened at the state the person
// left it in, and still theirs to work with: what they do with it here is kept with it (lib/objects/display-kept.ts,
// op "state") and shows in the conversation too, where the same artifact is drawn (one identity, two places).
//
// EDIT opens the artifact's own workspace: the artifact large, the controls for what it is beside it
// (components/display/SpecEditor.tsx), the picture following every change at once. A change that holds is saved by
// itself after a pause, as a step of the artifact's history (op "spec", with what changed said) — so Undo and Redo
// (the shell's, ⌘Z) step through edits, the version list shows every one with who made it, and any version can be
// shown again or copied out as an artifact of its own. Asking for a change in words is here too: words the artifact
// can read as an edit ("add the curve y = 2 + x called supply") are applied at once; anything else goes to Socria in
// the conversation, which changes this artifact in place rather than making another (an edit block,
// lib/artifact-edit.ts). Moving a slider or opening a part is using it, never editing it: only Edit opens the editor.

import { useEffect, useRef, useState } from 'react';
import { InlineBlock, type InlineHost } from '@/components/inline/InlineUI';
import { Inline } from '@/components/RichText';
import { keptName, readKeptEdit, type KeptState } from '@/lib/objects/display-kept';
import { stepWho } from '@/lib/objects/core';
import { changeSaid, editsBetween, specChanges } from '@/lib/artifact-edit';
import type { InlineSpec } from '@/lib/inline-ui';
import type { FigureProps } from '@/components/objects/figures';
import { DisplayShell, useDisplay } from './DisplayShell';
import { SpecEditor } from './SpecEditor';
import './kept.css';

const EDIT_KEY = 'socria.edit.';
/** Edit pressed in the conversation: the artifact opens with its editor open (read once, then forgotten). */
export function requestEdit(id: string): void {
  try {
    sessionStorage.setItem(EDIT_KEY + id, '1');
  } catch {
    // a browser with no storage opens it without the editor; Edit is one press away
  }
}
function takeEditRequest(id: string): boolean {
  try {
    const v = sessionStorage.getItem(EDIT_KEY + id);
    if (v) sessionStorage.removeItem(EDIT_KEY + id);
    return !!v;
  } catch {
    return false;
  }
}

const ago = (at: number | undefined) => {
  if (!at) return '';
  const s = Math.max(0, (Date.now() - at) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-opacity', 'opacity', 'font-size', 'font-weight', 'font-family', 'font-style', 'paint-order', 'text-anchor'];
/** The picture as a standalone SVG: its styles written into it, so it looks the same outside Socria. */
function svgOf(root: HTMLElement | null): string | null {
  const svg = root?.querySelector('svg');
  if (!svg) return null;
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const src = [svg, ...svg.querySelectorAll('*')];
  const dst = [copy, ...copy.querySelectorAll('*')];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const style = STYLE_PROPS.map((k) => `${k}:${cs.getPropertyValue(k)}`).filter((x) => !x.endsWith(':')).join(';');
    (dst[i] as Element).setAttribute('style', style);
  });
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = svg.viewBox?.baseVal;
  if (vb?.width) {
    copy.setAttribute('width', String(vb.width));
    copy.setAttribute('height', String(vb.height));
  }
  return new XMLSerializer().serializeToString(copy);
}
const fileName = (s: string) => s.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'artifact';

export function KeptFigure(p: FigureProps) {
  const d = useDisplay<KeptState>(p);
  const s = d.state;
  const [editing, setEditing] = useState(() => p.mode === 'live' && takeEditRequest(p.obj.id));
  const [draft, setDraft] = useState<InlineSpec | null>(null);
  const [versions, setVersions] = useState(false);
  const [asked, setAsked] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const pic = useRef<HTMLDivElement>(null);
  // AUTOSAVE: a version that holds and differs from the one showing is saved as a step after a pause
  useEffect(() => {
    if (!draft || !d.live) return;
    const changes = specChanges(s.spec, draft);
    if (!changes.length) return;
    const t = setTimeout(() => {
      // what changed, as edits — the whole version only when that is shorter (a step keeps 6000 characters a value)
      const said = changeSaid(changes);
      const ops = editsBetween(s.spec, draft);
      const asEdits = ops ? JSON.stringify(ops) : null;
      const whole = JSON.stringify(draft);
      const saved = asEdits && asEdits.length < whole.length ? d.act('edit', { ops: asEdits, said }) : d.act('spec', { spec: whole, said });
      if (saved) {
        setDraft(null);
        setNote(`Saved — ${said}.`);
      }
    }, 900);
    return () => clearTimeout(t);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  // a step taken elsewhere (Undo, Socria's change) supersedes a draft that was not saved yet
  useEffect(() => setDraft(null), [p.at, p.obj.states.length]);
  if (p.mode !== 'live')
    return (
      <DisplayShell p={p} d={d}>
        {null}
      </DisplayShell>
    );
  const shown = draft ?? s.spec;
  const when = s.from.at ? new Date(s.from.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const host: InlineHost = {
    state: s.ui ? { 0: s.ui } : {},
    live: d.live,
    ...(d.live ? { onState: (_n: number, st) => void d.act('state', { state: JSON.stringify(st) }) } : {}),
  };
  const ask = () => {
    const text = asked.trim();
    if (!text) return;
    const read = readKeptEdit(text, s);
    if (read && d.act(read.op, read.args)) {
      setNote(`Changed — ${String(read.args.said)}.`);
      setAsked('');
      return;
    }
    if (p.onSend) {
      p.onSend(`${s.title}: ${text}`);
      setNote('Asked Socria — the change will appear here, as a new version you can undo.');
      setAsked('');
    } else setNote('Say it in the conversation, and Socria will change this one.');
  };
  const latest = p.at === p.obj.states.length - 1;
  // VERSIONS are what was changed — by an edit, the editor or Socria. Using it (a slider moved, a part opened) is a
  // step too, so Undo takes it back, but not a version: listed, they would bury the edits
  const edits = p.obj.steps.map((st, i) => ({ st, at: i + 1 })).filter((v) => v.st.op !== 'state');
  const onVersion = [0, ...edits.map((v) => v.at)].filter((at) => at <= p.at).pop() ?? 0;
  const tools = (
    <>
      {d.live && (
        <button type="button" className={`dsp-tool${editing ? ' is-on' : ''}`} aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done' : 'Edit'}
        </button>
      )}
      <button type="button" className={`dsp-tool${versions ? ' is-on' : ''}`} aria-pressed={versions} onClick={() => setVersions((v) => !v)}>
        Versions{edits.length ? ` (${edits.length + 1})` : ''}
      </button>
      {d.live && p.onWorkspace && (
        <button
          type="button"
          className="dsp-tool"
          onClick={() => {
            const r = p.onWorkspace!({ type: 'branch', obj: p.obj.id, at: p.at });
            setNote(r.ok ? 'Copied as an artifact of its own, from the version showing.' : r.why ?? 'It could not be copied.');
          }}
        >
          Duplicate
        </button>
      )}
      <span className="kp-export">
        <button type="button" className={`dsp-tool${exporting ? ' is-on' : ''}`} aria-expanded={exporting} onClick={() => setExporting((x) => !x)}>
          Export
        </button>
        {exporting && (
          <span className="kp-export-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { download(`${fileName(s.title)}.json`, new Blob([JSON.stringify({ title: s.title, spec: s.spec, ...(s.ui ? { ui: s.ui } : {}), from: s.from, versions: p.obj.states.length }, null, 2)], { type: 'application/json' })); setExporting(false); }}>
              Data (JSON)
            </button>
            <button type="button" role="menuitem" onClick={() => { const svg = svgOf(pic.current); if (svg) download(`${fileName(s.title)}.svg`, new Blob([svg], { type: 'image/svg+xml' })); else setNote('This one has no picture to export — its data can be.'); setExporting(false); }}>
              Picture (SVG)
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const svg = svgOf(pic.current);
                setExporting(false);
                if (!svg) return setNote('This one has no picture to export — its data can be.');
                const img = new Image();
                img.onload = () => {
                  const c = document.createElement('canvas');
                  c.width = img.width * 2;
                  c.height = img.height * 2;
                  const g = c.getContext('2d');
                  if (!g) return;
                  g.fillStyle = getComputedStyle(document.body).backgroundColor || '#fff';
                  g.fillRect(0, 0, c.width, c.height);
                  g.drawImage(img, 0, 0, c.width, c.height);
                  c.toBlob((b) => b && download(`${fileName(s.title)}.png`, b), 'image/png');
                };
                img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
              }}
            >
              Image (PNG)
            </button>
          </span>
        )}
      </span>
    </>
  );
  const element = (
    <div className="kp-body" ref={pic}>
      <InlineBlock spec={shown} open={false} n={0} host={host} renderInline={(t, k) => <Inline text={t} math keyBase={`kp-${k}`} />} />
    </div>
  );
  return (
    <DisplayShell p={p} d={d} aside={keptName(s.spec)} tools={tools}>
      <p className="kp-from">
        Kept from the conversation
        {s.from.said ? <> — <q>{s.from.said}</q></> : null}
        {when ? <span className="kp-when"> · {when}</span> : null}
      </p>
      {versions && (
        <div className="kp-versions" role="region" aria-label="Versions">
          <ol>
            <li className={onVersion === 0 ? 'is-on' : ''}>
              <button type="button" onClick={() => p.onSeek?.(0)} aria-current={onVersion === 0 ? 'true' : undefined}>
                {p.obj.trimmed ? 'The earliest version kept' : 'As kept from the conversation'}
              </button>
              <span className="kp-v-meta">{ago(s.from.at)}</span>
            </li>
            {edits.map(({ st, at }) => (
              <li key={at} className={onVersion === at ? 'is-on' : ''}>
                <button type="button" onClick={() => p.onSeek?.(at)} aria-current={onVersion === at ? 'true' : undefined}>
                  {st.said.charAt(0).toUpperCase() + st.said.slice(1)}
                </button>
                <span className="kp-v-meta">
                  {stepWho(st)} · {ago(st.at)}
                </span>
              </li>
            ))}
          </ol>
          {!latest && <p className="kp-v-note">Showing an earlier version. Changing it from here replaces the later ones — or Duplicate it first to keep both.</p>}
        </div>
      )}
      {editing ? (
        // the editor's two columns follow the room it is given (a panel beside the board is narrower than the screen)
        <div className="kp-edit-host">
          <div className="kp-edit">
            <div className="kp-edit-pic">{element}</div>
            <aside className="kp-edit-panel" aria-label="Change it">
              <SpecEditor spec={shown} onChange={(next) => setDraft(next)} />
              <form
                className="kp-ask"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask();
                }}
              >
                <label className="se-k" htmlFor={`kp-ask-${p.obj.id}`}>
                  Or say what to change
                </label>
                <span className="kp-ask-row">
                  <input id={`kp-ask-${p.obj.id}`} value={asked} placeholder="Add another curve… make it a tree… compare two scenarios" onChange={(e) => setAsked(e.target.value)} />
                  <button type="submit" className="dsp-tool" disabled={!asked.trim()}>
                    Change
                  </button>
                </span>
              </form>
              {draft && <p className="kp-saving" aria-live="polite">Saving…</p>}
            </aside>
          </div>
        </div>
      ) : (
        element
      )}
      {note && (
        <p className="kp-note" role="status">
          {note}
        </p>
      )}
    </DisplayShell>
  );
}
