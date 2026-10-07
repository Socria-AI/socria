// lib/onboarding-roles.ts
//
// WHAT THEY MOSTLY THINK ABOUT — asked once, in onboarding, and optional.
//
// Broad on purpose. "Studying" holds a medical student and a fourteen-year-old
// with a chemistry test; "Building" holds a founder and an engineer three
// layers down a codebase. Each is phrased to be interesting to anyone in it
// and specific to none of them, because the point is not to file somebody —
// it is to stop showing a student an example about churn.
//
// What it changes, and nothing else:
//   - the order of the starting points (a student sees Understand first),
//   - each starting point's placeholder and example, written for that life,
//   - one quiet line to Socria, so its examples and analogies land closer to
//     home. Never their level, never their field, never an assumption beyond
//     the words they picked — and never mentioned unless they mention it.
//
// Stored in this browser only (ROLE_KEY). Not an account field, not analytics
// beyond the id, never written into memory.
//
// PURE.

export type RoleId = 'study' | 'build' | 'research' | 'create' | 'lead' | 'care' | 'life';
export type IntentId = 'decide' | 'understand' | 'develop' | 'problem' | 'research';

export interface Role {
  id: RoleId;
  title: string;
  /** what it holds, broadly enough for anyone in it */
  line: string;
  /** the starting points, most likely first */
  order: IntentId[];
  /** per starting point: the placeholder and one real example */
  ways: Record<IntentId, { placeholder: string; eg: string }>;
  /** what Socria is told, in their terms */
  says: string;
}

export const ROLE_KEY = 'socria.role.v1';

export const ROLES: Role[] = [
  {
    id: 'study',
    title: 'Studying',
    line: 'A course, an exam, a subject that has not clicked yet',
    order: ['understand', 'problem', 'develop', 'research', 'decide'],
    says: 'studying — courses, exams, subjects they are learning',
    ways: {
      understand: { placeholder: 'The idea that will not sit still…', eg: 'I can do the chain rule fine but I genuinely do not know what a derivative is.' },
      problem: { placeholder: 'The problem, in your own words…', eg: 'I follow every lecture and still freeze on the problem sets.' },
      develop: { placeholder: 'The argument, as far as it goes…', eg: 'An essay argument I believe in but cannot defend yet.' },
      research: { placeholder: 'What you are trying to find out…', eg: 'My sources disagree about what caused the 2008 crisis and I need a position of my own.' },
      decide: { placeholder: 'The choice you keep turning over…', eg: 'Switch majors now, or finish the year and see?' },
    },
  },
  {
    id: 'build',
    title: 'Building',
    line: 'A product, a company, a codebase, a plan with moving parts',
    order: ['problem', 'decide', 'develop', 'understand', 'research'],
    says: 'building things — products, companies, systems',
    ways: {
      problem: { placeholder: 'The problem, in your own words…', eg: 'Our churn doubled after the price change and I cannot tell which half caused it.' },
      decide: { placeholder: 'The call you keep putting off…', eg: 'Rewrite the core service now, or keep patching it for another quarter?' },
      develop: { placeholder: 'The idea, as far as it goes…', eg: 'A tool for small clinics. I know the pain, not the product.' },
      understand: { placeholder: 'What does not add up…', eg: 'Why sign-up converts on desktop and dies on mobile.' },
      research: { placeholder: 'What you are trying to find out…', eg: 'Whether anyone would actually pay for this, or just upvote it.' },
    },
  },
  {
    id: 'research',
    title: 'Researching',
    line: 'Questions where the answer is not settled yet',
    order: ['research', 'understand', 'problem', 'develop', 'decide'],
    says: 'research — questions without settled answers',
    ways: {
      research: { placeholder: 'What you are trying to find out…', eg: 'Two papers on whether remote work hurts junior developers. One says yes, one says no.' },
      understand: { placeholder: 'The result that will not explain itself…', eg: 'Why my model fits the training data beautifully and nothing else.' },
      problem: { placeholder: 'Where it stopped making sense…', eg: 'The effect disappears when I control for one variable and I do not know why.' },
      develop: { placeholder: 'The hypothesis, as far as it goes…', eg: 'An explanation for both results, if I could only state it properly.' },
      decide: { placeholder: 'The choice you have to defend…', eg: 'Which of two methods I can defend to a reviewer who prefers the other.' },
    },
  },
  {
    id: 'create',
    title: 'Making',
    line: 'Writing, design, music — anything that goes through drafts',
    order: ['develop', 'problem', 'understand', 'decide', 'research'],
    says: 'making things — writing, design, art, anything with drafts',
    ways: {
      develop: { placeholder: 'The idea, as far as it goes…', eg: 'A newsletter about how cities decide things. I have the name and nothing else.' },
      problem: { placeholder: 'What is not working yet…', eg: 'The draft says everything I meant and still does not land.' },
      understand: { placeholder: 'What you cannot quite see…', eg: 'Why the middle drags when every part of it works on its own.' },
      decide: { placeholder: 'The fork you are standing at…', eg: 'Two endings, and each one makes the other half of the piece wrong.' },
      research: { placeholder: 'What you want to learn from…', eg: 'What made the work I admire feel inevitable rather than clever.' },
    },
  },
  {
    id: 'lead',
    title: 'Leading',
    line: 'Teams, plans, and calls that other people live with',
    order: ['decide', 'problem', 'develop', 'understand', 'research'],
    says: 'leading — teams, plans, decisions others depend on',
    ways: {
      decide: { placeholder: 'The decision you keep turning over…', eg: 'Promote from inside, or hire the senior person the team needs?' },
      problem: { placeholder: 'The problem, in your own words…', eg: 'We hit every milestone and the launch still slipped a month.' },
      develop: { placeholder: 'The plan, as far as it goes…', eg: 'Next year’s plan, without it just being this year plus ten percent.' },
      understand: { placeholder: 'What you cannot quite explain…', eg: 'Why two good teams keep blaming each other for the same delay.' },
      research: { placeholder: 'What you are trying to find out…', eg: 'Whether four-day weeks work for teams like ours, or only for the ones that write about it.' },
    },
  },
  {
    id: 'care',
    title: 'Helping people',
    line: 'Teaching, coaching, caring — thinking on someone else’s behalf',
    order: ['understand', 'problem', 'develop', 'decide', 'research'],
    says: 'helping people — teaching, coaching, care',
    ways: {
      understand: { placeholder: 'What you are trying to see clearly…', eg: 'Why the explanation that works for half the room loses the other half.' },
      problem: { placeholder: 'The problem, in your own words…', eg: 'Someone agrees with every plan we make and follows none of them.' },
      develop: { placeholder: 'The approach, as far as it goes…', eg: 'A way into fractions that starts from something they already care about.' },
      decide: { placeholder: 'The call you keep turning over…', eg: 'Push harder, or give them room — I have tried both.' },
      research: { placeholder: 'What you are trying to find out…', eg: 'What the evidence actually says about homework for ten-year-olds.' },
    },
  },
  {
    id: 'life',
    title: 'Life, mostly',
    line: 'Moves, money, people, what comes next',
    order: ['decide', 'understand', 'problem', 'develop', 'research'],
    says: 'their own life — choices, plans, people',
    ways: {
      decide: { placeholder: 'The decision you keep turning over…', eg: 'Offered a job. More money, bigger company. I keep going back and forth.' },
      understand: { placeholder: 'What you cannot quite explain…', eg: 'Why I keep saying yes to things I do not want to do.' },
      problem: { placeholder: 'The problem, in your own words…', eg: 'Two cities, two careers, one couple, and no compromise that works.' },
      develop: { placeholder: 'The idea, as far as it goes…', eg: 'A year off to build something — what it would need to be worth it.' },
      research: { placeholder: 'What you are trying to find out…', eg: 'Whether renting for good is really the worse deal everyone says it is.' },
    },
  },
];

export const roleOf = (id: unknown): Role | null => ROLES.find((r) => r.id === id) ?? null;

export function readRole(store?: Pick<Storage, 'getItem'> | null): RoleId | null {
  try {
    const s = store ?? (typeof window !== 'undefined' ? window.localStorage : null);
    return roleOf(s?.getItem(ROLE_KEY))?.id ?? null;
  } catch {
    return null;
  }
}

export function writeRole(id: RoleId | null, store?: Pick<Storage, 'setItem' | 'removeItem'> | null): void {
  try {
    const s = store ?? (typeof window !== 'undefined' ? window.localStorage : null);
    if (id && roleOf(id)) s?.setItem(ROLE_KEY, id);
    else s?.removeItem(ROLE_KEY);
  } catch {}
}

/**
 * The line a reply is given. Known ids only — the words are ours, never the
 * request's — and it says what it is for and what it is not.
 */
export function roleBlock(raw: unknown): string {
  const r = roleOf(raw);
  if (!r) return '';
  return `\n\nWHAT THEY TOLD SOCRIA THEY MOSTLY THINK ABOUT: ${r.says}. Use it only to pick examples and analogies that are closer to home. Do not assume their level, their field or anything else from it, and do not mention it unless they do.`;
}
