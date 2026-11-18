'use client';
// components/ux-v0/BriefDoc.tsx — the Living Brief: the designer's decisions, as a curated board.
//
// Not a specification form. The objective is the headline; around it, the
// decisions hang as blocks on one grid, each with a small label and its kind's
// glyph: who it is for, what they come to do, its personality as words, the
// palette as swatches (with the contrast each pairing will have on the page),
// the typefaces set live, the references kept from the moodboard, how it
// should look and be laid out, what it must do, and what is still open.
// Everything is written over in place, with no model call; "Refine" in the
// composer asks SocriaUX to change it in words. Approving locks the version a
// design is generated from, and leads to the art direction, or straight to a
// design in the direction SocriaUX chooses.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { contrastRatio } from '@/lib/ux/audit';
import { FONTS, fontStack, fontStylesheet } from '@/lib/ux-v0/fonts';
import { PALETTE_ROLES, hex, type DesignBrief, type MoodboardRef, type PaletteRole } from '@/lib/ux-v0/types';

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
}

const ROLE_LABEL: Record<PaletteRole, string> = { background: 'Background', surface: 'Surface', text: 'Text', muted: 'Muted text', accent: 'Accent', 'accent-text': 'On accent', line: 'Lines' };

/** Text that is typeset until it is edited: a textarea that grows with what it holds. */
function Prose({ value, onChange, label, big = false, placeholder }: { value: string; onChange: (v: string) => void; label: string; big?: boolean; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={`st-prose${big ? ' is-big' : ''}`}
      rows={1}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      spellCheck
      onChange={(e) => onChange(e.target.value)}
    />
  );
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
      <input
        className="st-lines-add"
        value={draft}
        placeholder={add}
        aria-label={add}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.preventDefault(), commit());
        }}
      />
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

/** One decision on the board: a small label with its kind, then the decision itself. */
function Block({ label, kind, className = '', children, note, field = false }: { label: string; kind?: 'idea' | 'question' | 'file' | 'objection' | 'made'; className?: string; children: React.ReactNode; note?: string; field?: boolean }) {
  const head = (
    <span className="st-block-label">
      {kind && <span className={`st-glyph g-${kind} is-sm`} aria-hidden="true" />}
      <span className="sb-label">{label}</span>
      {note && <span className="st-block-note">{note}</span>}
    </span>
  );
  // a block holding one piece of text is its label: clicking the label edits it
  if (field) {
    return (
      <label className={`v0-brief-field st-block ${className}`}>
        {head}
        {children}
      </label>
    );
  }
  return (
    <section className={`st-block ${className}`} aria-label={label}>
      {head}
      {children}
    </section>
  );
}

export function BriefDoc({ brief, version, approved, refs, busy, hasDesign, onChange, onApprove, onSkip, onBack }: Props) {
  const set = <K extends keyof DesignBrief>(k: K, v: DesignBrief[K]) => onChange({ ...brief, [k]: v });
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
  const checks: { label: string; a?: string; b?: string; need: number }[] = [
    { label: 'Text on background', a: role('text'), b: role('background'), need: 4.5 },
    { label: 'Muted text', a: role('muted'), b: role('background'), need: 4.5 },
    { label: 'Button text', a: role('accent-text'), b: role('accent'), need: 4.5 },
  ];
  const kept = refs.filter((r) => r.state === 'kept');
  const inBrief = kept.filter((r) => brief.references.includes(r.id)).length;
  const setColour = (i: number, h: string) => set('palette', brief.palette.map((x, j) => (j === i ? { ...x, hex: h } : x)));
  const sample = brief.objective.split(/[.:;,—–-]/)[0].trim().split(/\s+/).slice(0, 6).join(' ') || 'A headline in this face';
  const bg = role('background') ?? '#ffffff';
  const fg = role('text') ?? '#111111';
  const accent = role('accent') ?? fg;

  return (
    <div className="v0-brief st-brief">
      <header className="st-brief-bar">
        <p className="st-brief-meta">
          <span className="st-brief-kicker">The brief</span>
          <span>Version {version}</span>
          <span className={approved ? 'is-approved' : ''}>{approved ? 'Approved' : 'Draft, yours to change'}</span>
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

      <div className="st-brief-page">
        <label className="v0-brief-field st-objective">
          <span className="st-block-label">
            <span className="st-glyph g-idea is-sm" aria-hidden="true" />
            <span className="sb-label">Objective</span>
          </span>
          <Prose value={brief.objective} onChange={(v) => set('objective', v)} label="Objective" big />
        </label>

        <div className="st-board">
          <Block label="Audience" kind="idea" className="c-5" field>
            <Prose value={brief.audience} onChange={(v) => set('audience', v)} label="Audience" />
          </Block>
          <Block label="What they come to do" className="c-4">
            <Lines items={brief.userGoals} onChange={(v) => set('userGoals', v)} label="Goal" add="Add something they come to do" numbered />
          </Block>
          <Block label="Personality" className="c-3">
            <Words items={brief.personality} onChange={(v) => set('personality', v)} />
          </Block>

          <Block label="Palette" className="c-12 st-palette" note={brief.palette.length ? `${brief.palette.length} colours` : undefined}>
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
                    <span className="st-contrast-p">{ok ? 'Reads well' : `Below ${ch.need}:1`}</span>
                  </li>
                );
              })}
            </ul>
          </Block>

          <Block label="Typography" className="c-5 st-typeblock">
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
            {brief.typography.rationale && <p className="st-why-note">{brief.typography.rationale}</p>}
          </Block>

          <Block label="References" kind="file" className="c-7" note={kept.length ? `${inBrief} of ${kept.length} kept images in the brief` : undefined}>
            {!kept.length && <p className="st-none">No images kept on the moodboard, so the design will use layouts that need none.</p>}
            {kept.length > 0 && (
              <ul className="st-refs">
                {kept.map((r) => {
                  const on = brief.references.includes(r.id);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        className={`v0-ref st-ref${on ? ' is-on' : ''}`}
                        aria-pressed={on}
                        title={`${on ? 'In the brief' : 'Not in the brief'}: ${r.attribution}`}
                        onClick={() => set('references', on ? brief.references.filter((x) => x !== r.id) : [...brief.references, r.id])}
                      >
                        <img src={r.thumb} alt={r.title || 'Reference'} loading="lazy" referrerPolicy="no-referrer" />
                        <span className="st-ref-mark" aria-hidden="true">
                          {on ? 'In the brief' : 'Left out'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Block>

          <Block label="How it should look" className="c-6" field>
            <Prose value={brief.visualDirection} onChange={(v) => set('visualDirection', v)} label="Visual direction" />
          </Block>
          <Block label="How it is laid out" className="c-6" field>
            <Prose value={brief.layoutDirection} onChange={(v) => set('layoutDirection', v)} label="Layout" />
          </Block>

          <Block label="What it must do" kind="made" className="c-6">
            <Lines items={brief.functionalRequirements} onChange={(v) => set('functionalRequirements', v)} label="Requirement" add="Add something it must do" />
          </Block>
          <Block label="Still open" kind="question" className="c-6 st-open" note={brief.openQuestions.length ? 'answered later, or with placeholders' : undefined}>
            {brief.openQuestions.length ? <Lines items={brief.openQuestions} onChange={(v) => set('openQuestions', v)} label="Open question" add="Add something still open" /> : <p className="st-none">Nothing left open.</p>}
          </Block>

          <Block label="Format" className="c-12 st-format">
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
          </Block>
        </div>

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
