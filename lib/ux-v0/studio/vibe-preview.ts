// lib/ux-v0/studio/vibe-preview.ts — a mood drawn small, by the engine itself: its ground, its forms (creative/forms.ts
// drawForm, the same forms the work would be composed with), the brief's own words set in the mood's type, and its
// accent. Not a picture of a style from a library: each tile is the vibe offered for this brief, as the engine reads it.

import { drawForm, type FormKind } from '../graphics/creative/forms';
import type { TypeCharacter } from '../graphics/creative/lexicon';
import { normalizeDoc, type GraphicDoc, type Node } from '../graphics/doc';
import { FONTS } from '../fonts';
import { mix } from '../color';
import { readableSet, type VibeChoice } from './discovery';

/** The faces a mood's preview is set in (for loading before it is measured). */
export function vibeFaces(v: Pick<VibeChoice, 'character'>): { display: string; body: string; weight: number; case: 'none' | 'upper' } {
  const set = readableSet(v.character as TypeCharacter, 0);
  const f = FONTS.find((x) => x.name === set.display) as { weights?: readonly number[]; variable?: boolean } | undefined;
  const list = f?.weights ?? [400, 700];
  const weight = f?.variable && list.length === 2 ? Math.max(list[0], Math.min(list[1], set.weight)) : list.reduce((a, b) => (Math.abs(b - set.weight) < Math.abs(a - set.weight) ? b : a), list[0]);
  return { display: set.display, body: set.body, weight, case: set.case };
}

let seq = 0;
const id = (p: string) => `${p}${(seq++).toString(36)}`;

/** A small artboard for one mood: 320 × 196, its words the sample given (the headline or the name). */
export const VIBE_PREVIEW = { width: 320, height: 196 } as const;
export function vibePreviewDoc(v: VibeChoice, sample: string, seed = 1): GraphicDoc {
  const W = VIBE_PREVIEW.width;
  const H = VIBE_PREVIEW.height;
  const faces = vibeFaces(v);
  const { ground, ink, accent } = v.palette;
  const support = v.palette.support[0] ?? mix(accent, ground, 0.45);
  const forms: Node[] =
    v.form === 'none'
      ? []
      : [
          ...drawForm(v.form as FormKind, { x: W * 0.52, y: H * 0.08, w: W * 0.44, h: H * 0.5, far: 0.6 }, { color: support, color2: accent, abstraction: 40, depth: 1 }, seed),
          ...drawForm(v.form as FormKind, { x: W * 0.62, y: H * 0.3, w: W * 0.34, h: H * 0.4, far: 0.2 }, { color: accent, color2: support, abstraction: 40, depth: 1 }, seed + 7),
        ];
  const words = (sample || 'Your words').slice(0, 28);
  const long = words.length > 14;
  const text = {
    id: id('vt'),
    type: 'text',
    role: 'headline',
    name: 'Headline',
    x: 20,
    y: H - (long ? 98 : 80),
    w: W - 40,
    h: long ? 80 : 62,
    rotation: 0,
    opacity: 1,
    text: words,
    font: faces.display,
    weight: faces.weight,
    size: long ? 29 : 36,
    lineHeight: 1.02,
    tracking: faces.case === 'upper' ? 40 : -10,
    align: 'left',
    valign: 'bottom',
    color: ink,
    case: faces.case,
    autoHeight: false,
  };
  const bar = { id: id('vb'), type: 'shape', role: 'motif', name: 'Accent', decorative: true, shape: 'rect', x: 20, y: 22, w: 34, h: 5, rotation: 0, opacity: 1, fill: accent };
  const doc = normalizeDoc({
    schema: 1,
    id: id('vd'),
    name: v.name,
    tokens: { colors: { background: ground, surface: ground, text: ink, muted: mix(ink, ground, 0.45), accent, accentText: ground, line: mix(ink, ground, 0.8) }, fonts: { display: faces.display, body: faces.body } },
    artboards: [{ id: id('va'), name: v.name, width: W, height: H, unit: 'px', dpi: 72, background: ground, bleed: 0, safe: 12, children: [...forms, bar, text] }],
    assets: [],
    revision: 1,
    updatedAt: 0,
  });
  if (!doc) throw new Error('vibe preview');
  return doc;
}
