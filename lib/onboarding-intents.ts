// lib/onboarding-intents.ts
//
// THE WAYS IN, AND THE WAYS TO THINK — the onboarding's own vocabulary, as
// data, outside the component that shows it.
//
// They lived in components/onboarding/FirstRunIntro.tsx, a client component,
// which is fine for the screen and useless to anything on the server: a
// server module that imports a value from a 'use client' file gets a client
// reference, not the array. The developer dashboard (app/dev/dashboard) needs
// the same five starting points and the same three starting models to label
// what people chose, so they live here and the component reads them from here.
//
// PURE.

import type { IntentId } from './onboarding-roles';

/**
 * Five ways in. Each changes the placeholder and the one example under the
 * field — never what the person may bring.
 */
export interface Intent {
  id: IntentId;
  title: string;
  /** when this is the way in, in a few words */
  when: string;
  placeholder: string;
  /** one real example, pressable — it prefills, it never sends */
  eg: string;
}

export const INTENTS: Intent[] = [
  { id: 'decide', title: 'Make a decision', when: 'Both options keep pulling at you', placeholder: 'The decision you keep turning over…', eg: 'Offered a job. More money, bigger company. I keep going back and forth.' },
  { id: 'understand', title: 'Understand something', when: 'It has not clicked yet', placeholder: 'The thing that will not sit still…', eg: 'I can do the chain rule fine but I genuinely do not know what a derivative is.' },
  { id: 'develop', title: 'Develop an idea', when: 'It is only half-formed', placeholder: 'The idea, as far as it goes…', eg: 'A newsletter about how cities decide things. I have the name and nothing else.' },
  { id: 'problem', title: 'Work through a problem', when: 'Something is stuck', placeholder: 'The problem, in your own words…', eg: 'Our churn doubled after the price change and I cannot tell which half caused it.' },
  { id: 'research', title: 'Research something', when: 'The sources disagree', placeholder: 'What you are trying to find out…', eg: 'Two papers on whether remote work hurts junior developers. One says yes, one says no.' },
];

/** How they like to think — and so which model they start on. */
export type StartModel = 'core-4' | 'logos-2' | 'logos-3';

export const START_MODELS: readonly StartModel[] = ['core-4', 'logos-2', 'logos-3'];

/** What each answer to "how do you like to think?" is called, for anyone reading the counts. */
export const START_MODEL_LABELS: Record<StartModel, string> = {
  'core-4': 'Talk it through (Core 4)',
  'logos-2': 'See it laid out (Logos 2)',
  'logos-3': 'See it laid out (Logos)',
};
