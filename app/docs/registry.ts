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

/**
 * A page about something Socria no longer offers. The banner every such page
 * opens with is drawn from this (Article.tsx), so the pages cannot disagree
 * about when, what replaced it, or where somebody's conversations went.
 */
export interface Archived {
  /** what is archived, as a reader would name it */
  what: string;
  /** when it stopped being offered, as a phrase that follows "It was archived": "on 24 October 2026" */
  on: string;
  /** what it gave way to, in a sentence that follows "It gave way to" */
  replacedBy: string;
}

export interface DocPage {
  slug: string;
  title: string;
  /** short line under the title, and the description on the index cards */
  blurb: string;
  group: string;
  /** set on every page in 'Earlier Socria' that describes a model no longer offered */
  archived?: Archived;
}

/** The day Logos 5 became the only Socria, and the models still offered beside it were archived. */
export const ARCHIVE_DATE = '24 October 2026';

export const DOC_GROUPS = [
  'Start here',
  'Logos 5',
  'The reasoning environment',
  'Plans & accounts',
  'Earlier Socria',
] as const;

export const DOC_PAGES: DocPage[] = [
  {
    slug: 'overview',
    title: 'What Socria is',
    blurb: 'A thinking environment, not an answer machine — Logos 5, what never changes, and how these docs are organized.',
    group: 'Start here',
  },
  {
    slug: 'use-cases',
    title: 'What to use it for',
    blurb: 'Deciding, learning, studying, writing, building a model, working through math — and where in Logos 5 each one happens.',
    group: 'Start here',
  },
  {
    slug: 'logos-5',
    title: 'Socria Logos 5',
    blurb: 'The Universal Map, a line of thinking in four views, replies that turn interactive only where it helps, Write, Memory — and what it will not do.',
    group: 'Logos 5',
  },
  {
    slug: 'models',
    title: 'One model',
    blurb: 'Why Socria is one model now, the one setting it has, and where the models before it went.',
    group: 'Logos 5',
  },
  {
    slug: 'thinking-map',
    title: 'The Thinking Map',
    blurb: 'The Logic Map’s vocabulary: node types, relationships, the four lenses, and the four moves a node opens.',
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
    slug: 'logos-3-engineering',
    title: 'Engineering',
    blurb: 'Engines, mechanisms, circuits, structures, flows, flight, reactions and control — what to ask for, what the engine builds, and the numbers it computes, each checked — and CAD-style designs drawn in 3D.',
    group: 'The reasoning environment',
  },
  {
    slug: 'logos-3-dynamics',
    title: 'Dynamics and chaos',
    blurb: 'Maps and flows: the road to chaos and Feigenbaum’s δ, a strange attractor, the Lorenz butterfly cut by a Poincaré section, and predator–prey cycles — each built live, each number computed.',
    group: 'The reasoning environment',
  },
  {
    slug: 'depth-personality',
    title: 'Length, Personality & instructions',
    blurb: 'The one setting a reply has, the one personality it talks in, your own instructions, and what always stays fixed.',
    group: 'The reasoning environment',
  },
  {
    slug: 'drafts-grounding',
    title: 'Write, Notes & grounding',
    blurb: 'Where an argument is put together and written — yours to write, Socria only when asked — and how what you say gets grounded in real material.',
    group: 'The reasoning environment',
  },
  {
    slug: 'socria-one',
    title: 'Socria One',
    blurb: 'The free tier, the subscription, when Socria asks, codes, and how billing behaves.',
    group: 'Plans & accounts',
  },
  {
    slug: 'accounts-data',
    title: 'Accounts & your data',
    blurb: 'Signed out vs signed in, what is stored where, sync, and deletion.',
    group: 'Plans & accounts',
  },
  {
    slug: 'history',
    title: 'The history of Socria',
    blurb: 'Every Logos, from the first to Logos 5 — what each one was, what it added, and why the next one changed it.',
    group: 'Earlier Socria',
  },
  {
    slug: 'logos',
    title: 'Socria Logos',
    blurb: 'The original reasoning environment — the conversation and a live map side by side. Superseded by Logos 2.',
    group: 'Earlier Socria',
    archived: { what: 'The original Logos', on: 'when Logos 2 arrived', replacedBy: 'Logos 2, then each Logos after it' },
  },
  {
    slug: 'logos-2',
    title: 'Socria Logos 2',
    blurb: 'The conversation, a live map, and models the engine built from what you said — what you could build, and what carried into Logos 5.',
    group: 'Earlier Socria',
    archived: { what: 'Logos 2', on: `on ${ARCHIVE_DATE}`, replacedBy: 'Logos 5' },
  },
  {
    slug: 'logos-3',
    title: 'Socria Logos 3',
    blurb: 'The conversation, the map, models the engine solved and designs drawn in 3D from your words, in one workspace. It became Logos 3.5, then Logos 4 and Logos 5.',
    group: 'Earlier Socria',
    archived: { what: 'Logos 3', on: 'on 11 October 2026, when it became Logos 3.5', replacedBy: 'Logos 3.5, Logos 4 and then Logos 5' },
  },
  {
    slug: 'logos-3-5',
    title: 'What was new in Logos 3.5',
    blurb: 'Charts, plans, calendars, comparisons, diagrams, number lines and decisions made from your own words beside the map — plus the experiences, a memory that tracks how your thinking changes, and what it would not do.',
    group: 'Earlier Socria',
    archived: { what: 'Logos 3.5', on: 'on 19 October 2026, when it became Logos 4', replacedBy: 'Logos 4, then Logos 5' },
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
