// Logos 5's screen pieces, gathered for test/logos5-ui.test.mjs: the turn,
// the pending reply, the chrome around the conversation, rich reading, and the
// per-browser stage preferences. Rendered with react-dom/server there.
export { L5Message, L5Pending } from '@/components/logos5/L5Message';
export { L5Header, L5LinkBar, L5StageHead, L5Outline, L5Switch, MindButton } from '@/components/logos5/L5Chrome';
export { L5Ask } from '@/components/logos5/L5Ask';
export { RichText, StreamingRichText, closingQuestion } from '@/components/RichText';
export { parseBlocks, splitInline } from '@/lib/rich-text';
export { readStagePrefs, writeStagePrefs, logos5On, DEFAULT_STAGE_SHARE, STAGE_KEY } from '@/lib/logos5/flags';
// the study path: intake, board, a topic, practice, the three views — and the Universal Map
export { StudyIntake, StudyBoard, StartPanel, TopicInspector, StudyPractice, PracticeEmpty, ComponentsEmpty, ArtifactsView } from '@/components/logos5/Study';
export { UniverseView } from '@/components/logos5/Universe';
// the Mind Graph: what Socria remembers, drawn as a mind
export { MindGraphView } from '@/components/logos5/MindGraph';
export { mindDrawing, groupOf, subOf, memoryMatches, hash as mindHash } from '@/lib/logos5/mindgraph';
export { checkPractice } from '@/lib/logos5/study';
