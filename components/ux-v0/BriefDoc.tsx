'use client';
// components/ux-v0/BriefDoc.tsx — the Living Brief: the designer's creative specification, as a document.
//
// Laid out like a studio's brand guidelines rather than a form: the objective
// as the headline, a numbered contents line, and the decisions hung on one
// grid, each with its kind's glyph and where it stands (suggested, approved,
// locked as a rule, or left to SocriaUX). Text is typeset until it is edited.
// The palette is a row of swatches to lift and re-colour, with the contrast
// each pairing will have; type is set live on the palette's own paper with
// its scale; references and the pictures on the page are kept apart.
//
// How it is laid out leads with the designer's layout decisions (what comes
// first, the arrangement, the alignment, the pictures), sketched, each said
// with where it came from, and each one theirs to set or leave to SocriaUX.
//
// Exact specifications are there for a designer who wants them — type scale,
// grid, width, density, corners, motion, a contrast target — and every one
// reaches the look the renderer draws (lib/ux-v0/direction.ts applyBrief).
// Optional parts (experience, motion, accessibility, smaller screens, rules)
// appear when a project needs them. Once a design exists, the visual parts
// changed here can be applied to it in place, without redrawing it.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { contrastRatio } from '@/lib/ux/audit';
import { DECISION_LABEL, PART_LABEL } from '@/lib/ux-v0/brief';
import { FONTS, fontStack, fontStylesheet } from '@/lib/ux-v0/fonts';
import { HEADLINE_LABEL, MOTION_LABEL, describeMotion, motionFor } from '@/lib/ux-v0/motion';
import { ASPECT_LABEL, isContent, takenFrom } from '@/lib/ux-v0/references';
import { GRIDS, MOTION_FEELS, STILL_MOTION, type Motion } from '@/lib/ux-v0/spec';
import { DECISIONS, PALETTE_ROLES, hex, type BriefPart, type BriefSpec, type Decision, type DesignBrief, type MoodboardRef, type PaletteRole } from '@/lib/ux-v0/types';
import { EXPERIENCES, EXPERIENCE_LABEL, correctKind, intentOf, pageTypeFor, editRequirements, type DesignIntent, type Experience } from '@/lib/ux-v0/intent';
import {
  ALIGN_LABEL,
  ARRANGEMENTS,
  ARRANGEMENT_LABEL,
  LAYOUT_ALIGNS,
  LAYOUT_KEY_LABEL,
  LEAD_LABEL,
  PICTURES_LABEL,
  PICTURE_ROLES,
  decideLayout,
  layoutSaid,
  layoutValueLabel,
  leadOptions,
  sketchContext,
  type Arrangement,
  type LayoutAlign,
  type LayoutKey,
  type Lead,
  type PictureRole,
} from '@/lib/ux-v0/layout';
import { LayoutSketch, sketchWords } from './LayoutSketch';

interface Props {
  brief: DesignBrief;
  version: number;
  approved: boolean;
  refs: MoodboardRef[];
  busy: string | null;
  hasDesign: boolean;
  onChange: (b: DesignBrief) => void;
  /** approve and choose the art direction */
  onApprove: () => void;
  /** approve and generate at once, in the direction SocriaUX chooses (or the one already chosen) */
  onSkip: () => void;
  onBack: () => void;
  /** visual parts changed since the design was drawn */
  edited: BriefPart[];
  /** carry them into the design in place */
  onApplyToDesign: () => void;
}

const ROLE_LABEL: Record<PaletteRole, string> = { background: 'Background', surface: 'Surface', text: 'Text', muted: 'Muted text', accent: 'Accent', 'accent-text': 'On accent', line: 'Lines' };
const GRID_LABEL: Record<string, string> = { stack: 'Stacked', editorial: 'Editorial side column', swiss: 'Strict columns', centered: 'Centred', asymmetric: 'Asymmetric', poster: 'Poster', modular: 'Modular cells' };
const RATIOS: [number, string][] = [
  [1.125, 'Very quiet, 1.125'],
  [1.2, 'Quiet, 1.2'],
  [1.25, 'Measured, 1.25'],
  [1.333, 'Balanced, 1.333'],
  [1.414, 'Pronounced, 1.414'],
  [1.5, 'Dramatic, 1.5'],
  [1.618, 'Poster, 1.618'],
];
const OPTIONAL: BriefPart[] = ['experience', 'motion', 'accessibility', 'responsive', 'rules'];

/** Text that is typeset until it is edited: a textarea that grows with what it holds. */
function Prose({ value, onChange, label, big = false, placeholder }: { value: string; onChange: (v: string) => void; label: string; big?: boolean; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} className={`st-prose${big ? ' is-big' : ''}`} rows={1} value={value} placeholder={placeholder} aria-label={label} spellCheck onChange={(e) => onChange(e.target.value)} />;
}

/** A short list, one line each: add with Enter, take away with ×. */
function Lines({ items, onChange, label, add, numbered = false }: { items: string[]; onChange: (v: string[]) => void; label: string; add: string; numbered?: boolean }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const v = draft.trim();
    if (v) onChange([...items, v]);
    setDraft('');
  };
  return (
    <div className="st-lines">
      <ol className={numbered ? 'is-numbered' : ''}>
        {items.map((x, i) => (
          <li key={i}>
            {numbered && (
              <span className="st-lines-n" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
            )}
            <Prose value={x} label={`${label} ${i + 1}`} onChange={(v) => onChange(items.map((y, j) => (j === i ? v : y)))} />
            <button type="button" className="st-x" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove “${x}”`}>
              ×
            </button>
          </li>
        ))}
      </ol>
      <input className="st-lines-add" value={draft} placeholder={add} aria-label={add} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commit())} />
    </div>
  );
}

/** Words, as tags: add with Enter or a comma, take one away with ×. */
function Words({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const v = draft.replace(/,/g, ' ').trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft('');
  };
  return (
    <div className="st-words">
      {items.map((w) => (
        <span key={w} className="st-word">
          {w}
          <button type="button" onClick={() => onChange(items.filter((x) => x !== w))} aria-label={`Remove “${w}”`}>
            ×
          </button>
        </span>
      ))}
      <input
        className="st-word-add"
        value={draft}
        placeholder={items.length ? 'Another word' : 'A word for its personality'}
        aria-label="Add a word to its personality"
        onChange={(e) => {
          const v = e.target.value;
          if (!v.endsWith(',')) return setDraft(v);
          const w = v.slice(0, -1).trim();
          if (w && !items.includes(w)) onChange([...items, w]);
          setDraft('');
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.preventDefault(), commit());
          if (e.key === 'Backspace' && !draft && items.length) onChange(items.slice(0, -1));
        }}
      />
    </div>
  );
}

/** Where a decision stands, set in the block's own label line. */
function Status({ part, value, onChange }: { part: BriefPart; value: Decision; onChange: (d: Decision) => void }) {
  return (
    <select className={`st-status s-${value}`} value={value} onChange={(e) => onChange(e.target.value as Decision)} aria-label={`${PART_LABEL[part]}: where it stands`} title="Suggested · Approved · Locked as a rule · SocriaUX decides">
      {DECISIONS.map((d) => (
        <option key={d} value={d}>
          {DECISION_LABEL[d]}
        </option>
      ))}
    </select>
  );
}

/** A choice that can also be left to the direction. */
function Spec<T extends string | number>({ label, value, options, onChange, disabled = false, empty = 'From the direction' }: { label: string; value: T | undefined; options: [T, string][]; onChange: (v: T | undefined) => void; disabled?: boolean; empty?: string }) {
  return (
    <label className="st-spec">
      <span>{label}</span>
      <select value={value === undefined ? '' : String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? undefined : (options.find(([v]) => String(v) === e.target.value)?.[0] as T))} aria-label={label}>
        <option value="">{empty}</option>
        {options.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * HOW IT IS LAID OUT, decided: what comes first, the arrangement, the alignment, the part pictures play. Each is
 * read from the designer's words or their answer to the layout question, said with where it came from, and
 * theirs to set or to leave to SocriaUX. What is decided holds in every direction and every generation (and is
 * carried into a design in place); what is left open, each direction sets its own way (lib/ux-v0/layout.ts).
 */
function LayoutDecide({ brief, onChange }: { brief: DesignBrief; onChange: (b: DesignBrief) => void }) {
  const intent = intentOf(brief);
  const d = brief.layout;
  const ctx = sketchContext(intent);
  const leads: [Lead, string][] = leadOptions(intent).map((o) => [o.value, o.label]);
  if (d?.lead && !leads.some(([v]) => v === d.lead)) leads.push([d.lead, LEAD_LABEL[d.lead]]);
  const put = (k: LayoutKey, v: string | undefined) => onChange({ ...brief, layout: decideLayout(d, k, v ?? null) });
  const first = d?.lead ? layoutValueLabel(intent, 'lead', d.lead).toLowerCase() : '';
  return (
    <div className="st-layout">
      <figure className="st-layout-sketch">
        <LayoutSketch
          lead={d?.lead ?? null}
          kind={ctx.kind}
          task={ctx.task}
          subject={ctx.subject}
          words={ctx.subject ? ctx.subject.charAt(0).toUpperCase() + ctx.subject.slice(1) : sketchWords(brief.objective)}
          arrangement={d?.arrangement}
          align={d?.align}
          pictures={d?.pictures}
          title={first ? `Sketch of the layout: ${first} first` : 'Sketch of the layout: what comes first is left open'}
        />
        <figcaption>{first ? 'A sketch of what you decided' : 'Left open: each direction leads its own way'}</figcaption>
      </figure>
      <div className="st-specs st-layout-specs">
        <Spec label={LAYOUT_KEY_LABEL.lead} value={d?.lead} options={leads} onChange={(v) => put('lead', v)} empty="SocriaUX decides" />
        <Spec label={LAYOUT_KEY_LABEL.arrangement} value={d?.arrangement} options={ARRANGEMENTS.map((a) => [a, ARRANGEMENT_LABEL[a]] as [Arrangement, string])} onChange={(v) => put('arrangement', v)} empty="SocriaUX decides" />
        <Spec label={LAYOUT_KEY_LABEL.align} value={d?.align} options={LAYOUT_ALIGNS.map((a) => [a, ALIGN_LABEL[a]] as [LayoutAlign, string])} onChange={(v) => put('align', v)} empty="SocriaUX decides" />
        <Spec label={LAYOUT_KEY_LABEL.pictures} value={d?.pictures} options={PICTURE_ROLES.map((x) => [x, PICTURES_LABEL[x]] as [PictureRole, string])} onChange={(v) => put('pictures', v)} empty="SocriaUX decides" />
      </div>
      <p className="st-why-note st-layout-said">{layoutSaid(d, intent)}</p>
    </div>
  );
}

/**
 * WHAT IT IS: the experience being made (a booking screen, a site, a dashboard…), its task, and what it must
 * do, each requirement with a stable id. Read from the designer's own words, said with the words it was read
 * from, and theirs to correct: a correction is final, survives every rewrite of the brief, and decides how the
 * design is built (lib/ux-v0/intent.ts).
 */
function IntentBlock({ brief, onChange }: { brief: DesignBrief; onChange: (b: DesignBrief) => void }) {
  const intent = intentOf(brief);
  const put = (next: DesignIntent) => onChange({ ...brief, intent: next, pageType: pageTypeFor(next, brief.pageType) });
  const by = intent.source === 'designer' ? 'as you set it' : intent.signals.length ? `read from your words: ${intent.signals.join(', ')}` : 'read from the brief';
  return (
    <section className="st-block c-12 st-intent" id="bp-intent" aria-label="What it is">
      <span className="st-block-label">
        <span className="st-glyph g-idea is-sm" aria-hidden="true" />
        <span className="sb-label">What it is</span>
        <span className="st-block-note">{by}</span>
      </span>
      <div className="st-intent-body">
        <div className="st-intent-what">
          <label className="st-intent-kind">
            <span className="v0-sr">What is being made</span>
            <select value={intent.kind} onChange={(e) => put(correctKind(intent, e.target.value as Experience))}>
              {EXPERIENCES.map((k) => (
                <option key={k} value={k}>
                  {EXPERIENCE_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <p className="st-intent-by">{intent.screen ? 'The interface itself, task first: no landing-page sections unless you ask for them.' : 'A composed page, opening on what matters most.'}</p>
          <label className="st-intent-task">
            <span className="st-intent-label">The task</span>
            <Prose value={intent.task} onChange={(v) => put({ ...intent, task: v.slice(0, 200), taskByDesigner: true })} label="The task" />
          </label>
        </div>
        <div className="st-intent-reqs">
          <span className="st-intent-label">It must let people</span>
          <Lines items={intent.requirements.map((r) => r.text)} onChange={(v) => put(editRequirements(intent, v))} label="Requirement" add="Add something it must let people do" />
          {intent.requirements.some((r) => r.component) && (
            <p className="st-intent-note">
              {intent.requirements
                .filter((r) => r.component)
                .map((r) => `${r.text.split(/[,.]/)[0]}: a working ${r.component === 'stat-cards' ? 'set of figures' : r.component}`)
                .join(' · ')}
            </p>
          )}
        </div>
        {intent.prohibitions.length > 0 && (
          <div className="st-intent-not">
            <span className="st-intent-label">Ruled out</span>
            <Words items={intent.prohibitions} onChange={(v) => put({ ...intent, prohibitions: v.slice(0, 8) })} />
          </div>
        )}
      </div>
    </section>
  );
}

export function BriefDoc({ brief, version, approved, refs, busy, hasDesign, onChange, onApprove, onSkip, onBack, edited, onApplyToDesign }: Props) {
  const set = <K extends keyof DesignBrief>(k: K, v: DesignBrief[K]) => onChange({ ...brief, [k]: v });
  const sp = brief.spec ?? {};
  const setSpec = <K extends keyof BriefSpec>(k: K, v: BriefSpec[K] | undefined) => {
    const next: BriefSpec = { ...sp };
    if (v === undefined) delete next[k];
    else next[k] = v;
    onChange({ ...brief, spec: Object.keys(next).length ? next : undefined });
  };
  const decision = (p: BriefPart): Decision => brief.decisions?.[p] ?? 'proposed';
  const decide = (p: BriefPart, d: Decision) => {
    const next = { ...(brief.decisions ?? {}) };
    if (d === 'proposed') delete next[p];
    else next[p] = d;
    onChange({ ...brief, decisions: Object.keys(next).length ? next : undefined });
  };
  const parts = brief.parts ?? [];
  const has: Record<string, boolean> = {
    experience: !!brief.experience || parts.includes('experience'),
    motion: !!sp.motion || parts.includes('motion'),
    accessibility: !!(brief.accessibility?.length || sp.contrast) || parts.includes('accessibility'),
    responsive: !!brief.responsive?.length || parts.includes('responsive'),
    rules: !!brief.rules?.length || parts.includes('rules'),
  };
  const addPart = (p: BriefPart) => onChange({ ...brief, parts: [...new Set([...parts, p])] });
  const dropPart = (p: BriefPart) => {
    const next: DesignBrief = { ...brief, parts: parts.filter((x) => x !== p) };
    if (p === 'experience') delete next.experience;
    if (p === 'motion') next.spec = (({ motion, ...rest }) => (Object.keys(rest).length ? rest : undefined))(sp);
    if (p === 'accessibility') (delete next.accessibility, (next.spec = (({ contrast, ...rest }) => (Object.keys(rest).length ? rest : undefined))(next.spec ?? {})));
    if (p === 'responsive') delete next.responsive;
    if (p === 'rules') delete next.rules;
    if (!next.parts?.length) delete next.parts;
    onChange(next);
  };

  const href = useMemo(() => fontStylesheet([brief.typography.display, brief.typography.body]), [brief.typography.display, brief.typography.body]);
  useEffect(() => {
    if (!href || document.querySelector(`link[data-v0-fonts="${CSS.escape(href)}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.dataset.v0Fonts = href;
    document.head.appendChild(l);
  }, [href]);

  const role = (r: PaletteRole) => brief.palette.find((p) => p.role === r)?.hex;
  const need = sp.contrast === 'AAA' ? 7 : 4.5;
  const checks: { label: string; a?: string; b?: string; need: number }[] = [
    { label: 'Text on background', a: role('text'), b: role('background'), need },
    { label: 'Muted text', a: role('muted'), b: role('background'), need },
    { label: 'Button text', a: role('accent-text'), b: role('accent'), need },
  ];
  const content = refs.filter(isContent);
  const inspiring = refs.filter((r) => r.state === 'kept' && !r.avoid && !isContent(r));
  const inBrief = content.filter((r) => brief.references.includes(r.id)).length;
  const setColour = (i: number, h: string) => set('palette', brief.palette.map((x, j) => (j === i ? { ...x, hex: h } : x)));
  const sample = brief.objective.split(/[.:;,—–-]/)[0].trim().split(/\s+/).slice(0, 6).join(' ') || 'A headline in this face';
  const bg = role('background') ?? '#ffffff';
  const fg = role('text') ?? '#111111';
  const accent = role('accent') ?? fg;
  const ratio = sp.ratio ?? 1.333;
  const sizes = [3, 2, 1, 0].map((k) => Math.round(17 * Math.pow(ratio, k)));
  const m: Motion | undefined = sp.motion;
  const counts = DECISIONS.filter((d) => d !== 'proposed').map((d) => [d, Object.values(brief.decisions ?? {}).filter((x) => x === d).length] as const).filter(([, n]) => n > 0);

  // the contents: every part on the board, numbered as it hangs
  const sections: [string, string][] = [
    ['intent', 'What it is'],
    ['audience', 'Audience'],
    ['goals', 'What they come to do'],
    ['personality', 'Personality'],
    ['colour', 'Colour'],
    ['type', 'Typography'],
    ['pictures', 'Pictures'],
    ['look', 'Look'],
    ['layout', 'Layout'],
    ...(has.motion ? ([['motion', 'Motion']] as [string, string][]) : []),
    ...(has.accessibility ? ([['accessibility', 'Accessibility']] as [string, string][]) : []),
    ['must', 'Must do'],
    ['open', 'Still open'],
    ...(has.rules ? ([['rules', 'Rules']] as [string, string][]) : []),
    ...(has.responsive ? ([['responsive', 'Smaller screens']] as [string, string][]) : []),
    ['format', 'Format'],
  ];
  const head = (label: string, part?: BriefPart, kind?: string, note?: string, removable?: BriefPart) => (
    <span className="st-block-label">
      {kind && <span className={`st-glyph g-${kind} is-sm`} aria-hidden="true" />}
      <span className="sb-label">{label}</span>
      {note && <span className="st-block-note">{note}</span>}
      {part && <Status part={part} value={decision(part)} onChange={(d) => decide(part, d)} />}
      {removable && (
        <button type="button" className="st-drop" onClick={() => dropPart(removable)} aria-label={`Take ${PART_LABEL[removable].toLowerCase()} out of the brief`} title="Take it out of the brief">
          ×
        </button>
      )}
    </span>
  );

  return (
    <div className="v0-brief st-brief">
      <header className="st-brief-bar">
        <p className="st-brief-meta">
          <span className="st-brief-kicker">The brief</span>
          <span>Version {version}</span>
          <span className={approved ? 'is-approved' : ''}>{approved ? 'Approved' : 'Draft, yours to change'}</span>
          {counts.length > 0 && <span className="st-brief-counts">{counts.map(([d, n]) => `${n} ${d === 'delegated' ? 'left to SocriaUX' : DECISION_LABEL[d].toLowerCase()}`).join(' · ')}</span>}
        </p>
        <div className="st-brief-acts">
          {approved && hasDesign ? (
            <>
              <button type="button" className="sb-link is-meta" onClick={onApprove} disabled={!!busy}>
                Choose a different direction
              </button>
              <button type="button" className="sb-btn is-primary" onClick={onSkip} disabled={!!busy}>
                {busy ? busy : 'Generate again from this brief'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="sb-link is-meta" onClick={onSkip} disabled={!!busy}>
                Approve and let SocriaUX choose
              </button>
              <button type="button" className="sb-btn is-primary" onClick={onApprove} disabled={!!busy}>
                {busy ? busy : 'Approve and choose a direction'}
              </button>
            </>
          )}
        </div>
      </header>

      {hasDesign && edited.length > 0 && (
        <div className="st-apply" role="status">
          <span>
            The design follows an earlier brief. Changed since: <b>{edited.map((p) => PART_LABEL[p].toLowerCase()).join(', ')}</b>.
          </span>
          <button type="button" className="sb-btn is-sm is-primary" onClick={onApplyToDesign} disabled={!!busy}>
            Apply to the design
          </button>
          <span className="st-apply-note">In place, as a new version you can undo; nothing is redrawn.</span>
        </div>
      )}

      <div className="st-brief-page">
        <div className="st-objective">
          <label className="v0-brief-field">
            <span className="st-block-label">
              <span className="st-glyph g-idea is-sm" aria-hidden="true" />
              <span className="sb-label">Objective</span>
            </span>
            <Prose value={brief.objective} onChange={(v) => set('objective', v)} label="Objective" big />
          </label>
          {has.experience && (
            <div className="st-experience">
              {head('How it should feel', 'experience', undefined, undefined, 'experience')}
              <Prose value={brief.experience ?? ''} onChange={(v) => set('experience', v)} label="How it should feel" placeholder="“Like walking into a quiet gallery on a Sunday morning”" />
            </div>
          )}
        </div>

        <nav className="st-contents" aria-label="Contents of the brief">
          {sections.map(([id, label], i) => (
            <a key={id} href={`#bp-${id}`}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              {label}
            </a>
          ))}
        </nav>

        <div className="st-board">
          <IntentBlock brief={brief} onChange={onChange} />
          <section className="st-block c-5" id="bp-audience" aria-label="Audience">
            {head('Audience', 'audience', 'idea')}
            <label className="v0-brief-field">
              <span className="v0-sr">Audience</span>
              <Prose value={brief.audience} onChange={(v) => set('audience', v)} label="Audience" />
            </label>
          </section>
          <section className="st-block c-4" id="bp-goals" aria-label="What they come to do">
            {head('What they come to do')}
            <Lines items={brief.userGoals} onChange={(v) => set('userGoals', v)} label="Goal" add="Add something they come to do" numbered />
          </section>
          <section className="st-block c-3" id="bp-personality" aria-label="Personality">
            {head('Personality', 'personality')}
            <Words items={brief.personality} onChange={(v) => set('personality', v)} />
          </section>

          <section className="st-block c-12 st-palette" id="bp-colour" aria-label="Palette">
            {head('Palette', 'colour', undefined, brief.palette.length ? `${brief.palette.length} colours` : undefined)}
            <ul className="st-swatches">
              {brief.palette.map((c, i) => {
                const light = contrastRatio('#111111', c.hex) > contrastRatio('#ffffff', c.hex);
                return (
                  <li key={i} className="st-swatch">
                    <label className="st-swatch-chip" style={{ background: c.hex, color: light ? '#20201b' : '#ffffff' }}>
                      <input type="color" value={c.hex} onChange={(e) => setColour(i, e.target.value)} aria-label={`Pick the ${ROLE_LABEL[c.role].toLowerCase()} colour`} />
                      <span className="st-swatch-name">{c.name}</span>
                    </label>
                    <select className="st-swatch-role" value={c.role} onChange={(e) => set('palette', brief.palette.map((x, j) => (j === i ? { ...x, role: e.target.value as PaletteRole } : x)))} aria-label={`Role of ${c.name}`}>
                      {PALETTE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    <input
                      key={c.hex}
                      className="st-swatch-hex"
                      defaultValue={c.hex}
                      aria-label={`${c.role} colour`}
                      spellCheck={false}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      onBlur={(e) => {
                        const h = hex(e.target.value);
                        if (h) setColour(i, h);
                        else e.target.value = c.hex;
                      }}
                    />
                  </li>
                );
              })}
            </ul>
            <ul className="st-contrast" aria-label="Contrast on the page">
              {checks.map((ch) => {
                if (!ch.a || !ch.b) return null;
                const r = contrastRatio(ch.a, ch.b);
                const ok = r >= ch.need;
                return (
                  <li key={ch.label} className={ok ? 'is-ok' : 'is-fail'}>
                    <span className="st-contrast-pair" aria-hidden="true" style={{ background: ch.b, color: ch.a }}>
                      Aa
                    </span>
                    <span className="st-contrast-l">{ch.label}</span>
                    <span className="st-contrast-v">{r.toFixed(1)}:1</span>
                    <span className="st-contrast-p">{ok ? `Meets ${sp.contrast === 'AAA' ? 'AAA' : 'AA'}` : `Below ${ch.need}:1`}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="st-block c-5 st-typeblock" id="bp-type" aria-label="Typography">
            {head('Typography', 'typography')}
            <div className="st-specimen" style={{ background: bg, color: fg }}>
              <p className="st-specimen-d" style={{ fontFamily: fontStack(brief.typography.display) }}>
                {sample}
              </p>
              <p className="st-specimen-b" style={{ fontFamily: fontStack(brief.typography.body) }}>
                {brief.audience ? brief.audience.slice(0, 150) : 'Body text for the people this is for, set at reading size.'}
              </p>
              <span className="st-specimen-rule" style={{ background: accent }} aria-hidden="true" />
            </div>
            <div className="st-faces">
              <label>
                <span>Headlines</span>
                <select value={brief.typography.display} onChange={(e) => set('typography', { ...brief.typography, display: e.target.value })} aria-label="Display face">
                  {FONTS.map((f) => (
                    <option key={f.name}>{f.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Text</span>
                <select value={brief.typography.body} onChange={(e) => set('typography', { ...brief.typography, body: e.target.value })} aria-label="Body face">
                  {FONTS.filter((f) => !f.displayOnly && f.kind !== 'mono').map((f) => (
                    <option key={f.name}>{f.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="st-specs">
              <Spec label="Scale" value={sp.ratio} options={RATIOS} onChange={(v) => setSpec('ratio', v)} />
            </div>
            <ul className="st-sizes" aria-label="The type scale at a 17 px body">
              {sizes.map((px, i) => (
                <li key={px}>
                  <span>{['Display', 'Heading', 'Subheading', 'Body'][i]}</span>
                  <b>{px} px</b>
                </li>
              ))}
            </ul>
            {brief.typography.rationale && <p className="st-why-note">{brief.typography.rationale}</p>}
          </section>

          <section className="st-block c-7" id="bp-pictures" aria-label="Pictures on the page">
            {head('Pictures on the page', 'imagery', 'file', content.length ? `${inBrief} of ${content.length} in the brief` : undefined)}
            {!content.length && <p className="st-none">No picture is marked for the page, so the design will be typographic, or carried by shape and colour. To place a picture, open its notes on the moodboard and choose “Use the picture on the page”.</p>}
            {content.length > 0 && (
              <ul className="st-refs">
                {content.map((r) => {
                  const on = brief.references.includes(r.id);
                  return (
                    <li key={r.id}>
                      <button type="button" className={`v0-ref st-ref${on ? ' is-on' : ''}`} aria-pressed={on} title={`${on ? 'In the brief' : 'Not in the brief'}: ${r.attribution}`} onClick={() => set('references', on ? brief.references.filter((x) => x !== r.id) : [...brief.references, r.id])}>
                        <img src={r.thumb || r.url} alt={r.title || 'Picture'} loading="lazy" referrerPolicy="no-referrer" />
                        <span className="st-ref-mark" aria-hidden="true">
                          {on ? 'In the brief' : 'Left out'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {inspiring.length > 0 && (
              <div className="st-inspire">
                <span className="st-inspire-l">What the references give it</span>
                <ul>
                  {inspiring.slice(0, 8).map((r) => {
                    const t = takenFrom(r);
                    return (
                      <li key={r.id}>
                        {r.media === 'video' ? <span className="st-inspire-clip" aria-hidden="true">Clip</span> : <img src={r.thumb || r.url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                        <span>
                          <b>{t.take.map((a) => ASPECT_LABEL[a]).join(', ') || 'Atmosphere'}</b>
                          {t.leave.length ? `, not ${t.leave.map((a) => ASPECT_LABEL[a].toLowerCase()).join(' or ')}` : ''}
                          {r.note ? ` · “${r.note.slice(0, 60)}”` : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          <section className="st-block c-5" id="bp-look" aria-label="How it should look">
            {head('How it should look')}
            <label className="v0-brief-field">
              <span className="v0-sr">How it should look</span>
              <Prose value={brief.visualDirection} onChange={(v) => set('visualDirection', v)} label="Visual direction" />
            </label>
          </section>
          <section className="st-block c-7" id="bp-layout" aria-label="How it is laid out">
            {head('How it is laid out', 'layout')}
            <LayoutDecide brief={brief} onChange={onChange} />
            <label className="v0-brief-field">
              <span className="v0-sr">How it is laid out</span>
              <Prose value={brief.layoutDirection} onChange={(v) => set('layoutDirection', v)} label="Layout" />
            </label>
            <div className="st-specs">
              <Spec label="Grid" value={sp.grid} options={GRIDS.map((g) => [g, GRID_LABEL[g]] as [typeof g, string])} onChange={(v) => setSpec('grid', v)} />
              <Spec label="Width" value={sp.width} options={[['narrow', 'Narrow'], ['standard', 'Standard'], ['wide', 'Wide']]} onChange={(v) => setSpec('width', v)} />
              <Spec label="Space" value={sp.density} options={[['compact', 'Compact'], ['comfortable', 'Comfortable'], ['spacious', 'Spacious']]} onChange={(v) => setSpec('density', v)} />
              <Spec label="Corners" value={sp.corners} options={[['none', 'Square'], ['soft', 'Soft'], ['round', 'Round']]} onChange={(v) => setSpec('corners', v)} />
            </div>
          </section>

          {has.motion && (
            <section className="st-block c-6" id="bp-motion" aria-label="Motion">
              {head('Motion', 'motion', undefined, undefined, 'motion')}
              <div className="st-specs">
                <Spec label="How it moves" value={m?.feel} options={MOTION_FEELS.map((f) => [f, MOTION_LABEL[f]] as [Motion['feel'], string])} onChange={(v) => setSpec('motion', v === undefined ? undefined : v === 'still' ? { ...STILL_MOTION } : motionFor(v))} />
                <Spec label="Headline" value={m && m.feel !== 'still' ? m.headline : undefined} disabled={!m || m.feel === 'still'} options={(['none', 'fade', 'mask', 'words', 'letters'] as const).map((h) => [h, HEADLINE_LABEL[h]] as [Motion['headline'], string])} onChange={(v) => m && setSpec('motion', { ...m, headline: v ?? motionFor(m.feel).headline })} />
                <Spec label="Parallax" value={m && m.feel !== 'still' ? m.parallax : undefined} disabled={!m || m.feel === 'still'} options={[[0, 'None'], [1, 'Gentle'], [2, 'Clear'], [3, 'Deep']]} onChange={(v) => m && setSpec('motion', { ...m, parallax: v ?? motionFor(m.feel).parallax })} />
              </div>
              <p className="st-why-note">{m ? describeMotion(m) : 'The direction’s own motion. Set it here to decide it yourself; locking it keeps it in every direction.'}</p>
            </section>
          )}
          {has.accessibility && (
            <section className="st-block c-6" id="bp-accessibility" aria-label="Accessibility">
              {head('Accessibility', 'accessibility', undefined, undefined, 'accessibility')}
              <div className="st-specs">
                <Spec label="Contrast" value={sp.contrast} options={[['AA', 'AA: 4.5:1'], ['AAA', 'AAA: 7:1']]} onChange={(v) => setSpec('contrast', v)} />
              </div>
              <Lines items={brief.accessibility ?? []} onChange={(v) => set('accessibility', v.length ? v : undefined)} label="Accessibility note" add="Add a need: “large text for older readers”" />
              <p className="st-why-note">Always: every text is checked on its own ground, and motion has a reduced-motion alternative.</p>
            </section>
          )}

          <section className="st-block c-6" id="bp-must" aria-label="What it must do">
            {head('What it must do', 'function', 'made')}
            <Lines items={brief.functionalRequirements} onChange={(v) => set('functionalRequirements', v)} label="Requirement" add="Add something it must do" />
          </section>
          <section className="st-block c-6 st-open" id="bp-open" aria-label="Still open">
            {head('Still open', undefined, 'question', brief.openQuestions.length ? 'answered later, or with placeholders' : undefined)}
            {brief.openQuestions.length ? <Lines items={brief.openQuestions} onChange={(v) => set('openQuestions', v)} label="Open question" add="Add something still open" /> : <p className="st-none">Nothing left open.</p>}
          </section>

          {has.rules && (
            <section className="st-block c-6 st-rules" id="bp-rules" aria-label="Rules">
              {head('Rules it must follow', 'rules', 'objection', 'never broken', 'rules')}
              <Lines items={brief.rules ?? []} onChange={(v) => set('rules', v.length ? v : undefined)} label="Rule" add="Add a rule: “no animation”, “no photographs of people”" />
              <p className="st-why-note">Everything else in the brief is a preference. A rule is read for every direction and given to SocriaUX as non-negotiable.</p>
            </section>
          )}
          {has.responsive && (
            <section className="st-block c-6" id="bp-responsive" aria-label="Smaller screens">
              {head('On smaller screens', 'responsive', undefined, undefined, 'responsive')}
              <Lines items={brief.responsive ?? []} onChange={(v) => set('responsive', v.length ? v : undefined)} label="Note for smaller screens" add="Add one: “booking stays one tap away on a phone”" />
            </section>
          )}

          <section className="st-block c-12 st-format" id="bp-format" aria-label="Format">
            <span className="st-block-label">
              <span className="sb-label">Format</span>
            </span>
            <span className="sb-seg is-tight" role="radiogroup" aria-label="Kind of design">
              {(
                [
                  ['website', 'Website'],
                  ['app-screen', 'App screen'],
                ] as const
              ).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={brief.pageType === v} className={`sb-seg-item${brief.pageType === v ? ' is-on' : ''}`} onClick={() => set('pageType', v)}>
                  {l}
                </button>
              ))}
            </span>
            <span className="sb-seg is-tight" role="radiogroup" aria-label="Platform">
              {(
                [
                  ['web', 'For the web'],
                  ['mobile', 'For phones'],
                ] as const
              ).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={brief.platform === v} className={`sb-seg-item${brief.platform === v ? ' is-on' : ''}`} onClick={() => set('platform', v)}>
                  {l}
                </button>
              ))}
            </span>
          </section>
        </div>

        {OPTIONAL.some((p) => !has[p]) && (
          <div className="st-addparts">
            <span>Add to the brief</span>
            {OPTIONAL.filter((p) => !has[p]).map((p) => (
              <button key={p} type="button" className="st-addpart" onClick={() => addPart(p)}>
                + {PART_LABEL[p]}
              </button>
            ))}
          </div>
        )}

        <footer className="st-brief-foot">
          <button type="button" className="sb-link is-meta" onClick={onBack}>
            ← Back to the moodboard
          </button>
          <span>Write over anything above, or say what to change below.</span>
        </footer>
      </div>
    </div>
  );
}
