// app/docs/content/index.ts — slug → page component.
//
// Each page is a plain server component in this folder; the registry carries
// its metadata. Adding a page = one file here + one entry in registry.ts.

import type { ComponentType } from 'react';
import { Overview } from './overview';
import { UseCases } from './use-cases';
import { Models } from './models';
import { Core2 } from './core-2';
import { Core3 } from './core-3';
import { Logos } from './logos';
import { ThinkingMapDoc } from './thinking-map';
import { Mathematics } from './mathematics';
import { DepthPersonality } from './depth-personality';
import { DraftsGrounding } from './drafts-grounding';
import { SocriaOne } from './socria-one';
import { AccountsData } from './accounts-data';
import { Technical } from './technical';

export const CONTENT: Record<string, ComponentType> = {
  overview: Overview,
  'use-cases': UseCases,
  models: Models,
  'core-2': Core2,
  'core-3': Core3,
  logos: Logos,
  'thinking-map': ThinkingMapDoc,
  mathematics: Mathematics,
  'depth-personality': DepthPersonality,
  'drafts-grounding': DraftsGrounding,
  'socria-one': SocriaOne,
  'accounts-data': AccountsData,
  technical: Technical,
};
