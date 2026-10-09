// app/docs/registry.ts
//
// The docs wiki's table of contents. Pages live in content/ as TSX — prose
// with real markup, not markdown — and register here so the sidebar, the
// index, prev/next links and generateStaticParams all read one list.
//
// Order in this file IS the reading order.

import type { ReactNode } from 'react';

export interface DocSection {
  id: string;
  heading: string;
}

export interface DocPage {
  slug: string;
  title: string;
  /** short line under the title, and the description on the index cards */
  blurb: string;
  group: string;
}

export const DOC_GROUPS = [
  'Start here',
  'The models',
  'The reasoning environment',
  'Plans & accounts',
] as const;

export const DOC_PAGES: DocPage[] = [
  {
    slug: 'overview',
    title: 'What Socria is',
    blurb: 'A thinking environment, not an answer machine — and how these docs are organized.',
    group: 'Start here',
  },
  {
    slug: 'use-cases',
    title: 'What to use it for',
    blurb: 'Deciding, learning, writing, working through math — matched to the right model and settings.',
    group: 'Start here',
  },
  {
    slug: 'models',
    title: 'The models',
    blurb: 'Core 3.1, Core 4, Logos 2 and Logos 3 side by side — what each is for and how to switch.',
    group: 'The models',
  },
  {
    slug: 'core-2',
    title: 'Socria Core 2',
    blurb: 'Calm, restrained Socratic questioning. Retired on 2 October; Core 3.1 took its place.',
    group: 'The models',
  },
  {
    slug: 'core-3',
    title: 'Socria Core 3.1',
    blurb: 'The conversation that remembers, synthesizes, and follows your thinking across sessions.',
    group: 'The models',
  },
  {
    slug: 'core-4',
    title: 'Socria Core 4',
    blurb: 'Decides, each turn, which part of the work is yours — and contributes everything else.',
    group: 'The models',
  },
  {
    slug: 'logos',
    title: 'Socria Logos',
    blurb: 'The original reasoning environment — the conversation and a live map side by side. Superseded by Logos 2.',
    group: 'The models',
  },
  {
    slug: 'logos-2',
    title: 'Socria Logos 2',
    blurb: 'The conversation, a live map, and models the engine builds from what you say — what you can build, what to ask for, and what you can do with one.',
    group: 'The models',
  },
  {
    slug: 'logos-3',
    title: 'Socria Logos 3',
    blurb: 'The current Logos: the conversation, the map, models the engine solves and designs drawn in 3D from your words, in one workspace — and room for a second person.',
    group: 'The models',
  },
  {
    slug: 'logos-3-engineering',
    title: 'Engineering in Logos 3',
    blurb: 'Engines, mechanisms, circuits, structures, flows, flight, reactions and control — what to ask for, what the engine builds, and the numbers it computes, each checked — and CAD-style designs drawn in 3D.',
    group: 'The models',
  },
  {
    slug: 'logos-3-dynamics',
    title: 'Dynamics and chaos in Logos 3',
    blurb: 'Maps and flows: the road to chaos and Feigenbaum’s δ, a strange attractor, the Lorenz butterfly cut by a Poincaré section, and predator–prey cycles — each built live, each number computed.',
    group: 'The models',
  },
  {
    slug: 'thinking-map',
    title: 'The Thinking Map',
    blurb: 'Node types, relationships, the four lenses, and the four moves a node opens.',
    group: 'The reasoning environment',
  },
  {
    slug: 'mathematics',
    title: 'Mathematics',
    blurb: 'Math-aware maps, the Board, an interactive graph you can drive, and the Answer Guard.',
    group: 'The reasoning environment',
  },
  {
    slug: 'economics',
    title: 'Economics',
    blurb: 'Supply and demand, opportunity cost, the production frontier and AD–AS — drawn so you can move them.',
    group: 'The reasoning environment',
  },
  {
    slug: 'depth-personality',
    title: 'Depth, Personality & instructions',
    blurb: 'How far the thinking goes, the one personality it talks in — the same in Core 4 and Logos — your own instructions, and what always stays fixed.',
    group: 'The reasoning environment',
  },
  {
    slug: 'drafts-grounding',
    title: 'Draft Space & grounding',
    blurb: 'The one surface built for prose — yours to write — and how nodes get grounded in real material.',
    group: 'The reasoning environment',
  },
  {
    slug: 'socria-one',
    title: 'Socria One',
    blurb: 'The free tier, the subscription, when Socria asks, access codes, and how billing behaves.',
    group: 'Plans & accounts',
  },
  {
    slug: 'accounts-data',
    title: 'Accounts & your data',
    blurb: 'Signed out vs signed in, what is stored where, sync, and deletion.',
    group: 'Plans & accounts',
  },
];

export function docPage(slug: string): DocPage | undefined {
  return DOC_PAGES.find((p) => p.slug === slug);
}

export function neighbors(slug: string): { prev?: DocPage; next?: DocPage } {
  const i = DOC_PAGES.findIndex((p) => p.slug === slug);
  if (i < 0) return {};
  return { prev: DOC_PAGES[i - 1], next: DOC_PAGES[i + 1] };
}
