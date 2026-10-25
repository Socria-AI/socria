// app/docs/content/index.ts — slug → page component.
//
// Each page is a plain server component in this folder; the registry carries
// its metadata. Adding a page = one file here + one entry in registry.ts.

import type { ComponentType } from 'react';
import { Overview } from './overview';
import { Logos5 } from './logos-5';
import { History } from './history';
import { UseCases } from './use-cases';
import { Models } from './models';
import { Logos } from './logos';
import { Logos2 } from './logos-2';
import { Logos3 } from './logos-3';
import { Logos35 } from './logos-3-5';
import { Logos3Engineering } from './logos-3-engineering';
import { Logos3Dynamics } from './logos-3-dynamics';
import { ThinkingMapDoc } from './thinking-map';
import { Economics } from './economics';
import { Mathematics } from './mathematics';
import { DepthPersonality } from './depth-personality';
import { DraftsGrounding } from './drafts-grounding';
import { SocriaOne } from './socria-one';
import { AccountsData } from './accounts-data';

export const CONTENT: Record<string, ComponentType> = {
  overview: Overview,
  'logos-5': Logos5,
  history: History,
  'use-cases': UseCases,
  models: Models,
  logos: Logos,
  'logos-2': Logos2,
  'logos-3': Logos3,
  'logos-3-5': Logos35,
  'logos-3-engineering': Logos3Engineering,
  'logos-3-dynamics': Logos3Dynamics,
  'thinking-map': ThinkingMapDoc,
  mathematics: Mathematics,
  economics: Economics,
  'depth-personality': DepthPersonality,
  'drafts-grounding': DraftsGrounding,
  'socria-one': SocriaOne,
  'accounts-data': AccountsData,
};
