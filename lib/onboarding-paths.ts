// lib/onboarding-paths.ts
//
// WHAT BRINGS THEM, AND WHERE TO START — the onboarding's third and fourth
// beats, as data (components/onboarding/FirstRunIntro.tsx shows them).
//
// The third beat asks what brings somebody to Socria, in the words they would
// use themselves: studying, trying to understand something, a decision. Each
// answer is a path. The fourth beat offers three ways to start down it, each
// a whole first message they could have written — pressing one puts it in the
// field, where it can be changed before anything is sent — or their own words.
// Whatever they start becomes their first conversation, counted like any other.
//
// A path may say what they mostly think about (lib/onboarding-roles.ts), for
// the one quiet line Socria is told; "trying to understand something" and "a
// decision" say nothing about a life or a field, so those set no role.
//
// The ids are a fixed vocabulary: the developer dashboard counts them
// (lib/product-event-kinds.ts) and never anything typed.
//
// PURE.

import type { IntentId, RoleId } from './onboarding-roles';

export type PathId = 'study' | 'understand' | 'decide' | 'build' | 'write' | 'research';

/** One way to start: a whole first message, and the kind of thinking it is. */
export interface UseCase {
  id: string;
  /** a few words on the card */
  title: string;
  /** the first message itself — put in the field, never sent until they start */
  text: string;
  intent: IntentId;
}

export interface Path {
  id: PathId;
  title: string;
  /** what it holds, broadly enough for anyone in it */
  line: string;
  /** the icon (components/onboarding/ObIcon.tsx) */
  icon: string;
  /** what they mostly think about, when the path says so; null when it says nothing about a life */
  role: RoleId | null;
  /** three ways to start, the likeliest first */
  uses: readonly UseCase[];
}

export const PATHS: readonly Path[] = [
  {
    id: 'study',
    title: 'Studying',
    line: 'A course, an exam, a subject that has not clicked yet',
    icon: 'study',
    role: 'study',
    uses: [
      { id: 'study-concept', title: 'Finally get a concept', intent: 'understand', text: 'I can do the chain rule fine, but I genuinely do not know what a derivative is.' },
      { id: 'study-exam', title: 'Plan for an exam', intent: 'problem', text: 'I have a biology exam in two weeks and my notes are a mess. Help me work out what to revise first.' },
      { id: 'study-test', title: 'Test what I know', intent: 'understand', text: 'Ask me questions about the causes of the First World War until I can explain them without my notes.' },
    ],
  },
  {
    id: 'understand',
    title: 'Understanding something',
    line: 'An idea, a system, a story in the news',
    icon: 'understand',
    role: null,
    uses: [
      { id: 'understand-how', title: 'How something works', intent: 'understand', text: 'Explain how inflation actually works — what causes it, and why it is so hard to stop.' },
      { id: 'understand-news', title: 'Make sense of the news', intent: 'understand', text: 'Help me understand what is really going on in a news story I keep seeing, and what is still unknown.' },
      { id: 'understand-steps', title: 'Step by step', intent: 'understand', text: 'Walk me through how a web page gets from a server to my phone, one step at a time.' },
    ],
  },
  {
    id: 'decide',
    title: 'Making a decision',
    line: 'Two paths, and both keep pulling at you',
    icon: 'decide',
    role: null,
    uses: [
      { id: 'decide-job', title: 'A job offer', intent: 'decide', text: 'I have been offered a job. More money, a bigger company — and I keep going back and forth.' },
      { id: 'decide-move', title: 'Move, or stay', intent: 'decide', text: 'I am deciding whether to move to a new city for work or stay near my family.' },
      { id: 'decide-two', title: 'Choose between two', intent: 'decide', text: 'Help me choose between two options I keep going back and forth on, and see what each one rests on.' },
    ],
  },
  {
    id: 'build',
    title: 'Building something',
    line: 'A product, a project, a plan with moving parts',
    icon: 'build',
    role: 'build',
    uses: [
      { id: 'build-idea', title: 'Pressure-test an idea', intent: 'develop', text: 'Pressure-test my business idea: who would pay for it, and why might it fail?' },
      { id: 'build-cause', title: 'Find the real cause', intent: 'problem', text: 'Our churn doubled after the price change and I cannot tell which half of the change caused it.' },
      { id: 'build-plan', title: 'Plan a project', intent: 'problem', text: 'Help me plan a side project from the first idea to a first version I could show someone.' },
    ],
  },
  {
    id: 'write',
    title: 'Writing',
    line: 'An essay, a pitch, an argument to make',
    icon: 'create',
    role: 'create',
    uses: [
      { id: 'write-argument', title: 'Shape an argument', intent: 'develop', text: 'I have an essay argument I believe in but cannot defend yet. Help me find where it is weak.' },
      { id: 'write-outline', title: 'Outline before writing', intent: 'develop', text: 'Help me outline a piece of writing before I start the first draft — what it says, and in what order.' },
      { id: 'write-pitch', title: 'Make a pitch clearer', intent: 'develop', text: 'My pitch is too long and nobody remembers it. Help me find the one thing that matters.' },
    ],
  },
  {
    id: 'research',
    title: 'Researching',
    line: 'A question where the sources disagree',
    icon: 'research',
    role: 'research',
    uses: [
      { id: 'research-disagree', title: 'Sources that disagree', intent: 'research', text: 'Two papers on whether remote work hurts junior developers. One says yes, one says no. Which holds up?' },
      { id: 'research-evidence', title: 'What the evidence says', intent: 'research', text: 'What does the evidence actually say about intermittent fasting, and how strong is it?' },
      { id: 'research-map', title: 'Map a topic', intent: 'research', text: 'Map what is known, and what is not, about microplastics in drinking water.' },
    ],
  },
];

export const PATH_IDS: readonly PathId[] = PATHS.map((p) => p.id);

export const pathOf = (id: unknown): Path | null => PATHS.find((p) => p.id === id) ?? null;

/**
 * The path a role already answered on this browser leads to — someone who
 * told an earlier onboarding they mostly study is not asked again, and starts
 * on the student's ways in. A role with no path of its own (leading, helping
 * people) starts on the mixed set.
 */
export function pathForRole(role: RoleId | null | undefined): Path | null {
  if (!role) return null;
  return PATHS.find((p) => p.role === role) ?? null;
}

/**
 * Where to start, for a path — or, with none (they skipped, or their role has
 * no path), one way in from each of the four most common paths.
 */
export function usesFor(path: Path | null): readonly UseCase[] {
  if (path) return path.uses;
  return (['understand', 'decide', 'study', 'build'] as const).map((id) => pathOf(id)!.uses[0]);
}
