'use client';
// components/ux-v0/BriefDoc.tsx — the design brief, the designer's to edit and approve.
//
// Every field can be written over directly (no model call); "Refine" in the
// composer asks SocriaUX to change it in words. The palette shows the contrast
// each role will have on the page; the typefaces are chosen from the same list
// the generator uses, set live. Approving locks the version a design is
// generated from, and leads to the art direction — or straight to a design,
// in the direction SocriaUX chooses.

import { useEffect, useMemo } from 'react';
import { contrastRatio } from '@/lib/ux/audit';
import { FONTS, fontStack, fontStylesheet } from '@/lib/ux-v0/fonts';
import { PALETTE_ROLES, hex, type DesignBrief, type MoodboardRef, type PaletteRole } from '@/lib/ux-v0/types';

const LINES = (v: string[]) => v.join('\n');
const SPLIT = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);

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

function Field({ label, value, onChange, rows = 2, hint }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string }) {
  return (
    <label className="v0-brief-field">
      <span className="sb-label">{label}</span>
      <textarea className="v0-field" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="v0-quiet">{hint}</span>}
    </label>
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
    { label: 'Muted text on background', a: role('muted'), b: role('background'), need: 4.5 },
    { label: 'Button text on accent', a: role('accent-text'), b: role('accent'), need: 4.5 },
  ];
  const kept = refs.filter((r) => r.state === 'kept');
  return (
    <div className="v0-brief">
      <header className="v0-brief-head">
        <div>
          <span className="sb-label">
            Brief · version {version} · {approved ? 'approved' : 'draft'}
          </span>
          <h2 className="v0-brief-title">{brief.objective}</h2>
        </div>
      </header>

      <div className="v0-brief-grid">
        <div className="v0-brief-col">
          <Field label="Objective" value={brief.objective} onChange={(v) => set('objective', v)} />
          <Field label="Audience" value={brief.audience} onChange={(v) => set('audience', v)} />
          <Field label="What they come to do" value={LINES(brief.userGoals)} onChange={(v) => set('userGoals', SPLIT(v))} rows={4} hint="One per line." />
          <Field label="Personality" value={brief.personality.join(', ')} onChange={(v) => set('personality', v.split(',').map((x) => x.trim()).filter(Boolean))} rows={1} />
          <Field label="Visual direction" value={brief.visualDirection} onChange={(v) => set('visualDirection', v)} rows={3} />
          <Field label="Layout" value={brief.layoutDirection} onChange={(v) => set('layoutDirection', v)} rows={3} />
          <Field label="What it must do" value={LINES(brief.functionalRequirements)} onChange={(v) => set('functionalRequirements', SPLIT(v))} rows={4} hint="One per line." />
          {brief.openQuestions.length > 0 && <Field label="Still open" value={LINES(brief.openQuestions)} onChange={(v) => set('openQuestions', SPLIT(v))} rows={3} />}
        </div>
        <div className="v0-brief-col">
          <div className="v0-brief-field">
            <span className="sb-label">Palette</span>
            <ul className="v0-pal-edit">
              {brief.palette.map((c, i) => (
                <li key={i}>
                  <span className="v0-swatch is-lg" style={{ background: c.hex }} aria-hidden="true" />
                  <select
                    className="v0-select"
                    value={c.role}
                    onChange={(e) => set('palette', brief.palette.map((x, j) => (j === i ? { ...x, role: e.target.value as PaletteRole } : x)))}
                    aria-label={`Role of ${c.name}`}
                  >
                    {PALETTE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <input
                    className="v0-field v0-hex"
                    defaultValue={c.hex}
                    aria-label={`${c.role} colour`}
                    onBlur={(e) => {
                      const h = hex(e.target.value);
                      if (h) set('palette', brief.palette.map((x, j) => (j === i ? { ...x, hex: h } : x)));
                      else e.target.value = c.hex;
                    }}
                  />
                </li>
              ))}
            </ul>
            <ul className="v0-facts">
              {checks.map((ch) =>
                ch.a && ch.b ? (
                  <li key={ch.label} className={contrastRatio(ch.a, ch.b) >= ch.need ? '' : 'is-fail'}>
                    <span className="v0-fact-l">{ch.label}</span>
                    <span className="v0-fact-v">{contrastRatio(ch.a, ch.b).toFixed(2)}:1</span>
                    <span className="v0-fact-p">{contrastRatio(ch.a, ch.b) >= ch.need ? 'Meets' : 'Falls short of'} {ch.need}:1</span>
                  </li>
                ) : null
              )}
            </ul>
          </div>
          <div className="v0-brief-field">
            <span className="sb-label">Typography</span>
            <div className="v0-type-pick">
              <select className="v0-select" value={brief.typography.display} onChange={(e) => set('typography', { ...brief.typography, display: e.target.value })} aria-label="Display face">
                {FONTS.map((f) => (
                  <option key={f.name}>{f.name}</option>
                ))}
              </select>
              <select className="v0-select" value={brief.typography.body} onChange={(e) => set('typography', { ...brief.typography, body: e.target.value })} aria-label="Body face">
                {FONTS.filter((f) => !f.displayOnly && f.kind !== 'mono').map((f) => (
                  <option key={f.name}>{f.name}</option>
                ))}
              </select>
            </div>
            <p className="v0-type-display" style={{ fontFamily: fontStack(brief.typography.display) }}>
              {brief.personality.slice(0, 3).join(', ') || 'Headline'}
            </p>
            <p className="v0-type-body" style={{ fontFamily: fontStack(brief.typography.body) }}>
              {brief.audience || 'Body text for the people this is for.'}
            </p>
            {brief.typography.rationale && <p className="v0-quiet">{brief.typography.rationale}</p>}
          </div>
          <div className="v0-brief-field">
            <span className="sb-label">References</span>
            {!kept.length && <p className="v0-quiet">No images kept on the moodboard. The design will use variants that need none.</p>}
            <div className="v0-ref-strip">
              {kept.map((r) => {
                const on = brief.references.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`v0-ref${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    title={r.attribution}
                    onClick={() => set('references', on ? brief.references.filter((x) => x !== r.id) : [...brief.references, r.id])}
                  >
                    <img src={r.thumb} alt={r.title || 'Reference'} referrerPolicy="no-referrer" />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="v0-brief-field">
            <span className="sb-label">Kind of design</span>
            <div className="v0-type-pick">
              <select className="v0-select" value={brief.pageType} onChange={(e) => set('pageType', e.target.value as DesignBrief['pageType'])} aria-label="Kind of design">
                <option value="website">Website</option>
                <option value="app-screen">App screen</option>
              </select>
              <select className="v0-select" value={brief.platform} onChange={(e) => set('platform', e.target.value as DesignBrief['platform'])} aria-label="Platform">
                <option value="web">Web</option>
                <option value="mobile">Mobile</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <footer className="v0-brief-foot">
        {approved && hasDesign ? (
          <>
            <button type="button" className="sb-btn is-primary" onClick={onSkip} disabled={!!busy}>
              {busy ? busy : 'Generate again from this brief'}
            </button>
            <button type="button" className="sb-link" onClick={onApprove} disabled={!!busy}>
              Choose a different direction
            </button>
          </>
        ) : (
          <>
            <button type="button" className="sb-btn is-primary" onClick={onApprove} disabled={!!busy}>
              {busy ? busy : 'Approve and choose a direction'}
            </button>
            <button type="button" className="sb-link" onClick={onSkip} disabled={!!busy}>
              Approve and let SocriaUX choose
            </button>
          </>
        )}
        <button type="button" className="sb-link" onClick={onBack}>
          Back to the moodboard
        </button>
        <span className="v0-quiet">Edit anything above directly, or say what to change below.</span>
      </footer>
    </div>
  );
}
