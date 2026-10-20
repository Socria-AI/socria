// Logos 5's screen pieces, gathered for test/logos5-ui.test.mjs: the turn,
// the pending reply, the chrome around the conversation, rich reading, and the
// per-browser stage preferences. Rendered with react-dom/server there.
export { L5Message, L5Pending } from '@/components/logos5/L5Message';
export { L5Header, L5LinkBar, L5StageHead, L5Outline } from '@/components/logos5/L5Chrome';
export { RichText, StreamingRichText } from '@/components/RichText';
export { parseBlocks, splitInline } from '@/lib/rich-text';
export { readStagePrefs, writeStagePrefs, logos5On, DEFAULT_STAGE_SHARE, STAGE_KEY } from '@/lib/logos5/flags';
// the study path: intake, board, a topic, practice, the steps — and the Universal Map
export { StudyIntake, StudyBoard, StartPanel, TopicInspector, StudyPractice, StudySteps, PracticeEmpty } from '@/components/logos5/Study';
export { UniverseView } from '@/components/logos5/Universe';
export { checkPractice } from '@/lib/logos5/study';
