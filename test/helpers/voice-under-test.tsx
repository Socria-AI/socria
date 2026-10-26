// Socria Voice (experimental): what a spoken turn is before it is a message
// (lib/voice/speech.ts), where a turn starts and ends (vad.ts), what the two
// recognisers report (recognizer.ts), one turn as a file (wav.ts), what waits
// for a "yes" (risk.ts); the workspace and the writing operated in words
// (lib/logos5/commands.ts, lib/write/voice-edit.ts, lib/map-edit.ts); and the
// button and panel (components/logos5/SocriaVoice.tsx) — one bundle, for
// test/socria-voice.test.mjs.
export * from '@/lib/voice/speech';
export * from '@/lib/voice/vad';
export * from '@/lib/voice/recognizer';
export * from '@/lib/voice/wav';
export * from '@/lib/voice/risk';
export { readWorkspaceCommand, besideEmpty, fillSlot, readCapture, VIEW_SAID, SLOT_MS } from '@/lib/logos5/commands';
export { readDocCommand, applyDocCommand, docDeleteOf, dictationParts, dictate, blockFor } from '@/lib/write/voice-edit';
export { readMapAdd, readMapCommandAbout, readMapCommand, readMapSelect, replayMapChange, applyMapEdits } from '@/lib/map-edit';
export { emptyDoc, emptyBlock } from '@/lib/write/doc';
export { VoiceButton, VoiceButtonView, VoicePanel, VoicePanelView, VoiceSheet, VoiceOffNote } from '@/components/logos5/SocriaVoice';
export { createEar } from '@/components/logos5/useSocriaVoice';
