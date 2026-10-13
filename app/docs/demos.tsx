'use client';

// app/docs/demos.tsx — the docs' live demonstrations, each loaded on its own.
//
// Every docs page is one route, and a route ships the code of every client
// component its pages import. The docs content imported the demos directly,
// so all of them — the maths boards, the Logos map, the displays, the 3D
// scene — rode along on every docs page, the overview included: 772 kB of
// script to read a page of prose. Through next/dynamic each demo is its own
// chunk, fetched only by a page that shows it. Server rendering is kept, so
// a demo's markup is still in the page for a reader without script and for a
// crawler.

import dynamic from 'next/dynamic';

const docs = () => import('./DocsDemo');
const logos = () => import('@/app/logos/LogosDemo');

export const DemoEngineering = dynamic(() => docs().then((m) => m.DemoEngineering));
export const DemoShowcase = dynamic(() => docs().then((m) => m.DemoShowcase));
export const DemoLimitsTable = dynamic(() => docs().then((m) => m.DemoLimitsTable));
export const DemoModelPicker = dynamic(() => docs().then((m) => m.DemoModelPicker));
export const DemoLibraryFigure = dynamic(() => docs().then((m) => m.DemoLibraryFigure));
export const DemoModelWorkspace = dynamic(() => docs().then((m) => m.DemoModelWorkspace));
export const DemoRefusal = dynamic(() => docs().then((m) => m.DemoRefusal));
export const DemoChips = dynamic(() => docs().then((m) => m.DemoChips));
export const DemoSynthesis = dynamic(() => docs().then((m) => m.DemoSynthesis));
export const DemoAdAs = dynamic(() => docs().then((m) => m.DemoAdAs));
export const DemoCeiling = dynamic(() => docs().then((m) => m.DemoCeiling));
export const DemoMarket = dynamic(() => docs().then((m) => m.DemoMarket));
export const DemoPpc = dynamic(() => docs().then((m) => m.DemoPpc));
export const DemoCollege = dynamic(() => docs().then((m) => m.DemoCollege));
export const DemoPlot = dynamic(() => docs().then((m) => m.DemoPlot));
export const DemoVizDerivative = dynamic(() => docs().then((m) => m.DemoVizDerivative));
export const DemoVizLimit = dynamic(() => docs().then((m) => m.DemoVizLimit));
export const DemoVizOthers = dynamic(() => docs().then((m) => m.DemoVizOthers));
export const DemoVizRiemann = dynamic(() => docs().then((m) => m.DemoVizRiemann));
export const DemoVizTaylor = dynamic(() => docs().then((m) => m.DemoVizTaylor));

export const DisplaysShowcase = dynamic(() => import('./DocsDisplays').then((m) => m.DisplaysShowcase));
export const DemoScene = dynamic(() => import('./DocsScene').then((m) => m.DemoScene));

export const DemoSplit = dynamic(() => logos().then((m) => m.DemoSplit));
export const DemoLenses = dynamic(() => logos().then((m) => m.DemoLenses));
export const DemoMoves = dynamic(() => logos().then((m) => m.DemoMoves));
export const DemoBoard = dynamic(() => logos().then((m) => m.DemoBoard));
export const DemoGuard = dynamic(() => logos().then((m) => m.DemoGuard));
export const DemoControls = dynamic(() => logos().then((m) => m.DemoControls));
