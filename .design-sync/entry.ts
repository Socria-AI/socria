// .design-sync/entry.ts — the design-system surface of Socria.
//
// Socria is a private Next.js app: package.json has no `main`, no `exports`
// and there is no dist/, so nothing here is resolvable the way a published
// component library would be. This barrel is that missing entry, owned by the
// sync rather than by the app — putting it in components/ would add an export
// surface the product does not use and would drift the moment anyone tidied it.
//
// What it lists is every component that renders WITHOUT the app around it: no
// Clerk, no next/link or next/navigation, no fetch. The ones left out are not
// lesser components, they are app plumbing — LogosApp needs a router and a
// session, the account panels are Clerk's own primitives wearing Socria's
// clothes, and neither means anything inside a design tool.

export * from '../components/BlogMotion';
export * from '../components/ChoiceChips';
export * from '../components/CoverArt';
export * from '../components/DepthPicker';
export * from '../components/DraftResponsePanel';
export * from '../components/DraftSpace';
export * from '../components/EnvBadge';
export * from '../components/ExplorePanel';
export * from '../components/ImportProfileModal';
export * from '../components/InsightCard';
export * from '../components/InsightShareModal';
export * from '../components/JourneyDebugModal';
export * from '../components/LandingMotion';
export * from '../components/LogosComposer';
export * from '../components/LogosGuide';
export * from '../components/LogosMark';
export * from '../components/LogosRail';
export * from '../components/MagazineMotion';
export * from '../components/MapPoster';
export * from '../components/MapThumb';
export * from '../components/MathBoard';
export * from '../components/MathField';
export * from '../components/MathKeypad';
export * from '../components/MathPlot';
export * from '../components/MathViz';
export * from '../components/MatrixLens';
export * from '../components/ModelGlyph';
export * from '../components/ModelPicker';
export * from '../components/NodeGlyph';
export * from '../components/OneLock';
export * from '../components/OnePrompt';
export * from '../components/PersonalityDial';
export * from '../components/RichText';
export * from '../components/ScrollyMotion';
export * from '../components/SetupNotice';
export * from '../components/SocriaOneModal';
export * from '../components/StatusMark';
export * from '../components/SubscribeForm';
export * from '../components/SynthesisCard';
export * from '../components/TeX';
export * from '../components/ThinkingMap';
export * from '../components/TopicFilter';
export * from '../components/TryLogosModal';
export * from '../components/TryLogosPill';
