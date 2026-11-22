// lib/ux-v0/studio/modes.ts — the six things SocriaUX makes, said plainly: what each is, how it goes, and a few ways
// to begin. One platform, six capabilities; the engines behind them are the ones the workspaces already use.

import type { StudioMode } from './schema';

export interface ModeInfo {
  mode: StudioMode;
  label: string;
  /** what it is, in a line */
  line: string;
  /** how it goes, in a sentence: the workflow it opens */
  does: string;
  /** ways to begin, in the person's voice */
  examples: string[];
  /** where the work continues */
  workspace: string;
}

export const MODES: readonly ModeInfo[] = [
  {
    mode: 'graphic',
    label: 'Graphic',
    line: 'Posters, posts, covers, cards and charts.',
    does: 'Your words, exactly — composed three ways, then changed by hand or in words.',
    examples: ['A poster for “Field Lines”, a creative coding night', 'An Instagram carousel on five habits of calm teams', 'A cover for an album called “Low Tide”'],
    workspace: 'the graphics workspace',
  },
  {
    mode: 'website',
    label: 'Website',
    line: 'A site or a page that works.',
    does: 'Purpose, people and what it must do first — then a designed, working page you keep shaping.',
    examples: ['A website for a yoga studio with bookings', 'A portfolio for an illustrator', 'A launch page with a waiting list'],
    workspace: 'the website workspace',
  },
  {
    mode: 'logo',
    label: 'Logo',
    line: 'A mark, a wordmark, an identity.',
    does: 'Concepts constructed from the name and what it stands for — never picked from a library.',
    examples: ['A logo for “Halden”, a small coffee roastery', 'A monogram for an architecture practice', 'A wordmark for a children’s bookshop'],
    workspace: 'the logo explorer',
  },
  {
    mode: 'system',
    label: 'Design system',
    line: 'Bring your brand in.',
    does: 'Tokens, guidelines, a website or Figma — kept, versioned and carried into everything you make.',
    examples: ['Import our tokens.json', 'Read our brand guidelines PDF', 'Take the design system from our website'],
    workspace: 'the design system manager',
  },
  {
    mode: 'board',
    label: 'Board',
    line: 'A whole campaign in one system.',
    does: 'Many materials, each its own composition, one identity across all of them.',
    examples: ['A launch campaign: two posters, three posts and a website', 'Everything for a summer festival', 'An identity rollout for a new café'],
    workspace: 'the board',
  },
  {
    mode: 'critique',
    label: 'Critique',
    line: 'Bring a design to look at closely.',
    does: 'Select any part and reason it through — SocriaUX asks before it suggests, and changes nothing for you.',
    examples: ['Critique this landing page', 'What is not working in this poster?', 'Review the hierarchy of this screen'],
    workspace: 'the critique workspace',
  },
];

export const modeInfo = (m: StudioMode): ModeInfo => MODES.find((x) => x.mode === m) ?? MODES[0];
