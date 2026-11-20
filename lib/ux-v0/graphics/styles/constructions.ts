// lib/ux-v0/graphics/styles/constructions.ts — the style constructions, gathered for the composer's table of layouts.
//
// A construction is how a design language organises a frame (an axial deco frame, a constructivist diagonal, a
// riso overprint, a vertical axis with one symbol): forty-one of them, each with the variants its styles need, so a
// style changes what is built — the grid, the focal point, the shapes, where the words sit — not only its colours.

import type { Kit } from '../compose';
import { STYLE_CONSTRUCTION_IDS, type StyleConstruction } from './schema';
import type { Layout } from './constructions-kit';
import { layoutsA } from './constructions-a';
import { layoutsB } from './constructions-b';

export function styleLayouts(k: Kit): Record<StyleConstruction, Layout> {
  const all = { ...layoutsA(k), ...layoutsB(k) };
  const out = {} as Record<StyleConstruction, Layout>;
  for (const id of STYLE_CONSTRUCTION_IDS) {
    const l = all[id];
    if (!l) throw new Error(`The style construction “${id}” has no layout.`);
    out[id] = l;
  }
  return out;
}
