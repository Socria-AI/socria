'use client';
// components/logos5/MakeGallery.tsx — WHAT TO MAKE, SEEN BEFORE IT IS CHOSEN.
//
// "Make the GUI of selecting artifacts more visual, like you can see examples
// of them before choosing, instead of small buttons." Each choice
// (lib/logos5/make.ts) is a card showing its template: a display's own figure
// drawn over its catalogue example (components/display/Gallery.tsx
// sampleObject) — the figure the person will get, on example words, never a
// mock-up — and, for what the engine builds itself (a plot, a simulation, a 3D
// model, a CAD studio), a small drawing of one. Pressing a card chooses it;
// the composer then asks what it is about, and Socria fills the template in
// (CAD opens its studio in Artifacts, to be described).
//
// One button per card, stretched over it: the preview is a picture (inert,
// hidden from assistive technology), so nothing inside it can be tabbed to or
// pressed, and a button never holds another.

import { memo, useMemo } from 'react';
import { ObjectFigure } from '@/components/objects/ObjectFigure';
import { sampleObject } from '@/components/display/Gallery';
import { MAKE_CHOICES, type MakeChoice } from '@/lib/logos5/make';
import { templateChoice, type ArtifactTemplate } from '@/lib/logos5/templates';
import { create, EMPTY_SPACE, type ThoughtObject } from '@/lib/objects';
import { removeTemplateHere, useTemplates } from './useTemplates';
import './make-gallery.css';

/** React 18 has no typed `inert`: a picture of the figure, not a second copy to tab through. */
const INERT = { inert: '' } as Record<string, string>;

/** Example objects are made once per page, not every time the sheet opens. */
const samples = new Map<string, ThoughtObject | null>();
function sampleFor(c: MakeChoice): ThoughtObject | null {
  if (!c.template) return null;
  if (!samples.has(c.id)) samples.set(c.id, sampleObject(c.template.kind, c.template.view));
  return samples.get(c.id) ?? null;
}

export function MakeGallery({
  onPick,
  selected = null,
  compact = false,
  own,
}: {
  onPick: (id: string) => void;
  selected?: string | null;
  /** the composer's sheet: smaller cards, two or three to a row */
  compact?: boolean;
  /** the person's templates — read from this device when not given */
  own?: readonly ArtifactTemplate[];
}) {
  const kept = useTemplates();
  const mine = own ?? kept;
  return (
    <ul className={`mkg${compact ? ' is-compact' : ''}`} aria-label="Choose what to make">
      {MAKE_CHOICES.map((c) => (
        <MakeCard key={c.id} c={c} on={selected === c.id} onPick={onPick} />
      ))}
      {/* THEIR OWN: a custom artifact saved as a template, made again for what they say (lib/logos5/templates.ts) */}
      {mine.length > 0 && (
        <li className="mkg-sec" aria-hidden="true">
          Yours <span>saved on this device</span>
        </li>
      )}
      {mine.map((t) => (
        <MakeCard key={t.id} c={templateChoice(t)} on={selected === `tpl:${t.id}`} onPick={onPick} template={t} />
      ))}
    </ul>
  );
}

/** A saved template, drawn by the custom artifact's own figure over what it held when it was saved. */
function templateSample(t: ArtifactTemplate): ThoughtObject | null {
  try {
    return create(EMPTY_SPACE, 'custom', { title: t.name, about: t.about, blocks: t.blocks }, { origin: 'person', name: 'Ex' })?.obj ?? null;
  } catch {
    return null;
  }
}

const MakeCard = memo(function MakeCard({ c, on, onPick, template }: { c: MakeChoice; on: boolean; onPick: (id: string) => void; template?: ArtifactTemplate }) {
  const sample = useMemo(() => (template ? templateSample(template) : sampleFor(c)), [c, template]);
  return (
    <li className={`mkg-card${on ? ' is-on' : ''}${template ? ' is-own' : ''}`} data-make={c.id}>
      <div className="mkg-preview" aria-hidden="true" {...INERT}>
        {sample ? (
          <div className="mkg-figure">
            <ObjectFigure obj={sample} at={sample.at} mode="live" />
          </div>
        ) : (
          <Drawing id={c.id} />
        )}
      </div>
      <button type="button" className="mkg-pick" aria-pressed={on} onClick={() => onPick(c.id)}>
        <span className="mkg-name">{c.label}</span>
        <span className="mkg-about">{c.about}</span>
      </button>
      {template && (
        <button type="button" className="mkg-remove" aria-label={`Remove the template “${template.name}”`} title="Remove this template" onClick={() => removeTemplateHere(template.id)}>
          ×
        </button>
      )}
    </li>
  );
});

/** What the engine builds, drawn small: a curve on its axes, a pendulum on its slider, a solid. */
function Drawing({ id }: { id: string }) {
  if (id === 'plot') {
    return (
      <svg className="mkg-draw" viewBox="0 0 200 120" role="presentation">
        <line x1="20" y1="100" x2="186" y2="100" className="mkg-axis" />
        <line x1="34" y1="112" x2="34" y2="10" className="mkg-axis" />
        {[60, 90, 120, 150].map((x) => (
          <line key={x} x1={x} y1="98" x2={x} y2="102" className="mkg-axis" />
        ))}
        <path d="M44 18 C 70 96, 96 104, 110 100 S 150 84, 176 16" className="mkg-curve" />
        <circle cx="110" cy="100" r="4" className="mkg-dot" />
        <text x="114" y="92" className="mkg-text">y = x² − 3</text>
      </svg>
    );
  }
  if (id === 'simulation') {
    return (
      <svg className="mkg-draw" viewBox="0 0 200 120" role="presentation">
        <line x1="70" y1="12" x2="130" y2="12" className="mkg-axis" />
        <path d="M62 74 A 72 72 0 0 0 138 74" className="mkg-arc" />
        <line x1="100" y1="12" x2="128" y2="76" className="mkg-rod" />
        <circle cx="128" cy="78" r="9" className="mkg-bob" />
        <line x1="40" y1="104" x2="160" y2="104" className="mkg-track" />
        <line x1="40" y1="104" x2="104" y2="104" className="mkg-track-on" />
        <circle cx="104" cy="104" r="5" className="mkg-dot" />
      </svg>
    );
  }
  if (id === 'cad') {
    // a desk drawn in the studio: its top, two legs, a drawer, and a dimension line
    return (
      <svg className="mkg-draw" viewBox="0 0 200 120" role="presentation">
        <path d="M40 46 L132 30 L168 42 L76 60 Z" className="mkg-face-top" />
        <path d="M40 46 L76 60 L76 66 L40 52 Z" className="mkg-face-left" />
        <path d="M76 60 L168 42 L168 48 L76 66 Z" className="mkg-face-right" />
        <path d="M44 52 L44 96 M72 64 L72 106 M162 48 L162 92" className="mkg-edge" />
        <path d="M120 54 L156 47 L156 64 L120 71 Z" className="mkg-face-right" />
        <path d="M40 46 L132 30 L168 42 L76 60 Z M40 46 L40 52 L76 66 L168 48 L168 42 M76 60 L76 66 M120 54 L156 47 L156 64 L120 71 Z" className="mkg-edge" />
        <line x1="40" y1="112" x2="76" y2="118" className="mkg-axis" />
        <text x="44" y="110" className="mkg-text">120 cm</text>
      </svg>
    );
  }
  return (
    <svg className="mkg-draw" viewBox="0 0 200 120" role="presentation">
      <path d="M100 14 L148 38 L100 62 L52 38 Z" className="mkg-face-top" />
      <path d="M52 38 L100 62 L100 108 L52 84 Z" className="mkg-face-left" />
      <path d="M148 38 L100 62 L100 108 L148 84 Z" className="mkg-face-right" />
      <path d="M100 14 L148 38 L148 84 L100 108 L52 84 L52 38 Z M100 62 L100 108 M52 38 L100 62 L148 38" className="mkg-edge" />
    </svg>
  );
}
