// SOCRIA VOICE (EXPERIMENTAL) — "make the entire Logos 5 workspace operable
// through natural speech, with full voice parity with typed chat … Socria must
// respond in text … do not simulate unsupported functionality."
//
//   the turn          settings, Voice's own words, steps, what Socria is told
//   the ear           where a turn starts and ends (the level detector), what
//                     the two recognisers report, one turn as a WAV
//   the yes           what waits for a "yes" before it goes anywhere
//   the workspace     every press said as a sentence (lib/logos5/commands.ts)
//   the writing       created, edited, formatted and dictated in words
//   the Logic Map     an idea added in words, "that" and "another", select,
//                     undo and redo of a change made on a map that moved on
//   the screen        the button, the panel in each of its states, the notice
//   the wiring        one dispatcher for typed and spoken turns, read from the
//                     source: no second chatbot, no speech synthesis
//
// Browser journeys (a scripted recogniser; Chromium's fake microphone for
// Socria's own transcription) are run by hand: see docs/LOGOS-5-RUNTIME.md §22.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as V from './.tmp/voice-under-test.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el);

// ── the turn ─────────────────────────────────────────────────────────
console.log('the turn');
{
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  ok('settings: defaults before anything is chosen (no recogniser chosen, not yet agreed to)', J(V.readVoiceSettings(store)) === J(V.DEFAULT_VOICE) && V.DEFAULT_VOICE.consented === false && V.DEFAULT_VOICE.engine === null);
  V.writeVoiceSettings(store, { engine: 'socria', pace: 'patient', autoSend: false, whileAnswering: 'interrupt', consented: true });
  ok('  kept, and read back', J(V.readVoiceSettings(store)) === J({ engine: 'socria', pace: 'patient', autoSend: false, whileAnswering: 'interrupt', consented: true }));
  mem.set('socria.voice.v1', '{"engine":"siri","pace":"slow","autoSend":0,"whileAnswering":"shout","consented":"yes"}');
  ok('  anything not a setting falls back (consent is only ever a real true)', J(V.readVoiceSettings(store)) === J({ engine: null, pace: 'normal', autoSend: true, whileAnswering: 'hold', consented: false }));
  mem.set('socria.voice.v1', '{nope');
  ok('  a broken store is the defaults', V.readVoiceSettings(store).pace === 'normal');
  ok('  storage that throws is survived', V.writeVoiceSettings({ getItem: () => null, setItem: () => { throw new Error('full'); } }, V.DEFAULT_VOICE) === V.DEFAULT_VOICE);
  ok('the pause that ends a turn, by pace: short < medium < long', V.ENDPOINT_MS.quick < V.ENDPOINT_MS.normal && V.ENDPOINT_MS.normal < V.ENDPOINT_MS.patient && V.ENDPOINT_MS.normal === 1400);
  ok('a microphone is not left open: five minutes without a word turns Voice off', V.IDLE_OFF_MS === 300000);

  ok('the recogniser: the one chosen, where this browser has it', V.pickEngine({ browser: true, socria: true }, 'socria') === 'socria');
  ok('  chosen but missing here: the browser’s own, else Socria’s', V.pickEngine({ browser: true, socria: false }, 'socria') === 'browser' && V.pickEngine({ browser: false, socria: true }, 'browser') === 'socria');
  ok('  neither: none (and the button is not drawn)', V.pickEngine({ browser: false, socria: false }, null) === null);

  ok('a spoken turn as a message: spaces tidied, control characters gone, a capital to start', V.cleanUtterance('  what   is\u0007 tax incidence ') === 'What is tax incidence');
  ok('  kept to a length', V.cleanUtterance('a'.repeat(5000)).length === V.MAX_SPOKEN_CHARS);
  ok('  nothing said is nothing', V.cleanUtterance('   ') === '');
}
{
  const c = (t, ctx) => V.readControl(t, ctx)?.control ?? null;
  ok('Voice’s own words: "stop" stops the answer', c('stop') === 'stop' && c('Please stop.') === 'stop' && c('Socria, stop') === 'stop' && c('hold on') === 'stop');
  ok('  "stop listening" turns Voice off — not the same as "stop"', c('stop listening') === 'end' && c("I'm done") === 'end' && c('turn off voice') === 'end');
  ok('  "pause listening" pauses', c('pause listening') === 'pause' && c('mute the mic') === 'pause');
  ok('  "yes" and "no" answer a confirmation, and only one', c('yes', { confirming: true }) === 'yes' && c('go ahead', { confirming: true }) === 'yes' && c('no', { confirming: true }) === 'no' && c('cancel', { confirming: true }) === 'no' && c('yes') === null && c('no') === null);
  ok('  "help", dictation on and off, "send"', c('what can I say') === 'help' && c('start dictating') === 'dictate' && c('stop dictating') === 'undictate' && c('send it') === 'send');
  const d = V.readControl('add a branch called cost no scratch that');
  ok('  "…scratch that" at the end throws the turn away', d?.control === 'discard' && /add a branch/.test(d.rest), J(d));
  ok('  only a whole turn: a sentence that contains "stop" is for Socria', c('stop me if this is wrong but rent is too high') === null && c('how do I stop procrastinating') === null);
}
{
  const cmd = (p) => !!V.readWorkspaceCommand(p, { artifacts: [] }) || !!V.readMapAdd(p, { nodes: [], edges: [] });
  const s = (t) => V.splitSteps(t, cmd);
  ok('steps: "open the Logic Map, then add a branch called cost" is two', J(s('open the Logic Map, then add a branch called cost')) === J(['open the Logic Map', 'add a branch called cost']));
  ok('  "after that" and ";" too, and a step for Socria keeps its words', J(s('go to content; after that explain the second document')) === J(['go to content', 'explain the second document']));
  ok('  a plain "and" only when every part is a command', J(s('open the logic map and add a branch called cost')) === J(['open the logic map', 'add a branch called cost']) && s('open the logic map and tell me what you see').length === 1);
  ok('  "if the rent goes up then I move" is a sentence, whole', s('if the rent goes up then I move').length === 1);
  ok('  a one-word part, or more than four steps: whole', s('open the map then go').length === 1 && s('go home then go back then go home then go back then go home').length === 1);
  ok('  a turn that is one command is never cut ("remove rent and food")', J(V.splitSteps('remove rent and food', () => true)) === J(['remove rent and food']));
}
{
  ok('Socria is told when a turn was said, and only then: misheard words, guessed punctuation, answer in text', /SPOKEN/.test(V.SPOKEN_TURN) && /misheard/.test(V.SPOKEN_TURN) && /in text/.test(V.SPOKEN_TURN));
  const route = read('app/api/logos/chat/route.ts');
  ok('  in the turn’s own context, not the cached prompt', /last\.via === 'voice' \? SPOKEN_TURN : ''/.test(route) && route.indexOf('SPOKEN_TURN :') > route.indexOf('const turnContext ='));
}

// ── the ear ──────────────────────────────────────────────────────────
console.log('the ear');
{
  ok('loudness: silence is -100 dB; a half-scale sine is about -9 dB', V.rmsDb(new Float32Array(512)) === -100 && Math.abs(V.rmsDb(Float32Array.from({ length: 4800 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / 48000))) + 9.03) < 0.2);
  const run = (vad, frames) => frames.map((db) => vad.push(db)).filter(Boolean);
  const q = (n) => Array(n).fill(-80);
  const l = (n) => Array(n).fill(-20);
  let vad = V.createVad({ frameMs: 50, endpointMs: 1400 });
  ok('a quiet room starts nothing', run(vad, q(40)).length === 0);
  ok('  a click (two loud frames) is not a turn', run(vad, [...l(2), ...q(10)]).length === 0);
  ok('  speech starts a turn (three loud frames)', J(run(vad, l(3))) === J(['start']) && vad.speaking);
  ok('  a breath shorter than the pace goes on', run(vad, [...q(20), ...l(10)]).length === 0 && vad.speaking);
  const mid = [];
  for (let i = 0; i < 20; i++) {
    vad.push(-80);
    mid.push(vad.ending);
  }
  ok('  the pause that will end it fills, 0 → 1', mid[0] === 0 && mid[19] > mid[10] && mid[19] < 1 && mid[19] > 0.6, J(mid.map((x) => x.toFixed(2))));
  ok('  and the pace’s pause ends it', J(run(vad, q(8))) === J(['end']) && !vad.speaking && vad.tail >= 1400);
  vad = V.createVad({ frameMs: 50 });
  ok('a burst too short to be words is noise, and thrown away', J(run(vad, [...q(10), ...l(3), ...q(30)])) === J(['start', 'noise']));
  vad = V.createVad({ frameMs: 50, maxTurnMs: 2000 });
  ok('a turn that runs to the limit is ended for them', J(run(vad, [...q(10), ...l(42)])) === J(['start', 'end']));
  vad = V.createVad({ frameMs: 50 });
  ok('the floor is read as the microphone opens: a room with a hum is not a turn', run(vad, Array(200).fill(-40)).length === 0 && !vad.speaking && vad.floor > -45, vad.floor);
  ok('  speech still rises above it', run(vad, l(8)).includes('start'));
  vad.tune({ endpointMs: 600 });
  ok('  a new pace takes hold mid-turn', J(run(vad, q(13))) === J(['end']));
  vad = V.createVad({ frameMs: 50 });
  const fan = run(vad, [...q(10), ...Array(400).fill(-45)]);
  ok('  a fan that comes on later: the floor rises to it, and it is soon not speech', !vad.speaking && fan.length <= 2 && vad.floor > -50, J({ fan, floor: vad.floor }));
  ok('  speech between quiet words keeps the floor down', (() => { const v = V.createVad({ frameMs: 50 }); run(v, q(10)); for (let i = 0; i < 300; i++) v.push(i % 6 < 4 ? -20 : -75); return v.floor < -50 && v.speaking; })());
  ok('the meter: 0–1', vad.level >= 0 && vad.level <= 1);
}
{
  const r = (t, f) => ({ isFinal: f, length: 1, 0: { transcript: t } });
  ok('the browser’s results: what is settled, and what is still being heard', J(V.readResults([r('add a branch', true), r(' called co', false)])) === J({ finals: 'add a branch', interim: 'called co' }));
  ok('  a phone’s results, each everything so far, are not doubled', V.readResults([r('open the', true), r('open the logic map', true)]).finals === 'open the logic map');
  ok('  all of it, when the turn ends', V.heardOf({ finals: 'add a branch', interim: 'called cost' }) === 'add a branch called cost');
  ok('  nothing is nothing', J(V.readResults(null)) === J({ finals: '', interim: '' }));
  ok('its errors: silence and a stop asked for are ordinary — listening starts again', V.browserProblem('no-speech') === null && V.browserProblem('aborted') === null);
  const n = V.browserProblem('network');
  ok('  a service that cannot be reached says so, and offers Socria’s transcription', n.kind === 'network' && n.switchable && /couldn’t be reached/.test(n.message));
  ok('  a refused microphone says how to allow it', /Allow it for this site/.test(V.browserProblem('not-allowed').message) && V.browserProblem('not-allowed').retryable);
  ok('  no microphone, and anything unknown, say so', V.browserProblem('audio-capture').kind === 'no-mic' && V.browserProblem('bad-grammar').kind === 'service');
  const now = 100000;
  ok('a recogniser that keeps stopping with nothing heard is reported, not restarted forever', V.mayRestart([now - 1000, now - 900, now - 800, now - 700, now - 600], now) && !V.mayRestart([now - 1000, now - 900, now - 800, now - 700, now - 600, now - 500], now));
  ok('  restarts spaced out are fine; each quiet one waits a little longer, up to 2 s', V.mayRestart(Array.from({ length: 10 }, (_, i) => now - 20000 - i * 3000), now) && V.restartDelay(0) < V.restartDelay(2) && V.restartDelay(10) === 2000);
}
{
  const o = V.transcribeOutcome;
  ok('Socria’s transcription: words are a turn', J(o(200, { text: ' hello there ' })) === J({ ok: true, text: 'hello there' }));
  ok('  no words in it was a noise: nothing is said about it', o(422, { error: 'No words were heard.' }).silent === true && o(200, { text: '' }).silent === true);
  const busy = o(429, { error: 'Too many' }, '12');
  ok('  busy: tried again after the time it asks for (within reason)', busy.problem.kind === 'limit' && busy.retryAfterMs === 12000 && o(429, {}, '999').retryAfterMs === 30000 && o(429, {}, null).retryAfterMs === 8000);
  ok('  not signed in: said, with the browser’s recogniser offered', o(401, {}).problem.kind === 'signed-out' && o(401, {}).problem.switchable);
  ok('  switched off for this deployment: said', o(503, { error: 'Voice input isn’t available here.' }).problem.message === 'Voice input isn’t available here.');
  ok('  failed: the server’s words, and Retry', o(502, { error: 'That recording couldn’t be transcribed. Try again.' }).problem.retryable && /couldn’t be transcribed/.test(o(502, {}).problem.message));
  ok('the other recogniser, when one fails', V.otherEngine('browser', { browser: true, socria: true }) === 'socria' && V.otherEngine('socria', { browser: false, socria: true }) === null);
}
{
  const at48 = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(i / 10));
  const r = V.resample(at48, 48000);
  ok('one turn as a file: 48 kHz to 16 kHz, a third the samples', r.length === 16000);
  ok('  each the mean of the three it stands for', Math.abs(r[5] - (at48[15] + at48[16] + at48[17]) / 3) < 1e-6);
  ok('  44.1 kHz too', V.resample(new Float32Array(44100), 44100).length === 16000);
  const wav = new DataView(V.turnWav([at48.slice(0, 24000), at48.slice(24000)], 48000));
  const tag = (o) => String.fromCharCode(wav.getUint8(o), wav.getUint8(o + 1), wav.getUint8(o + 2), wav.getUint8(o + 3));
  ok('  a WAV: RIFF, PCM, mono, 16-bit, 16 kHz', tag(0) === 'RIFF' && tag(8) === 'WAVE' && tag(12) === 'fmt ' && wav.getUint16(20, true) === 1 && wav.getUint16(22, true) === 1 && wav.getUint16(34, true) === 16 && wav.getUint32(24, true) === 16000);
  ok('  a second of speech is 32 KB — a minute fits what /api/transcribe takes', wav.byteLength === 44 + 32000 && 44 + 60 * 32000 < 4 * 1024 * 1024);
  const loud = new DataView(V.encodeWav(Float32Array.from([2, -2, 0.5])));
  ok('  too loud is clipped, not wrapped', loud.getInt16(44, true) === 32767 && loud.getInt16(46, true) === -32768);
  ok('  frames for 400 ms of pre-roll at 48 kHz in 2048-sample frames', V.framesFor(400, 2048, 48000) === 10);
}

// ── the yes ──────────────────────────────────────────────────────────
console.log('the yes');
{
  const r = V.riskOf;
  ok('removing ideas from the map: named, as the reader read them', r('remove rent and food', { mapRemoves: ['Rent is high', 'Food'] })?.what === 'Remove “Rent is high” and “Food” from the Logic Map?');
  ok('  deleting from their writing: the words that would go', r('delete that paragraph', { docDelete: 'The sample was small' })?.what === 'Delete “The sample was small” from your writing?');
  ok('  an artifact’s removal, as the artifact says it', r('remove milk', { objectRemove: 'removed milk from the list' })?.what === 'Removed milk from the list?');
  ok('  a question about deleting is a question', r('how do I remove a node?') === null && r('should I delete the old draft?') === null);
  ok('  "delete everything", said: asked first', r('delete everything')?.level === 'destructive' && r('clear all my notes')?.level === 'destructive');
  ok('  memory: keeping and forgetting are sensitive', r('remember that I am vegetarian')?.level === 'sensitive' && /Take this out of what Socria remembers/.test(r('forget what I said about my job')?.what ?? ''));
  ok('  sharing their work is sensitive', r('share this with Sam')?.level === 'sensitive' && r('make this public')?.level === 'sensitive');
  ok('  anything else goes without asking', r('what is a mortgage') === null && r('open the logic map') === null && r('add a branch called cost') === null);
}

// ── the workspace, in words ──────────────────────────────────────────
console.log('the workspace');
{
  const arts = [
    { key: 'd:a1', kind: 'Chart', title: 'Monthly budget' },
    { key: 'd:a2', kind: 'Custom', title: 'Habit tracker' },
    { key: 'w:doc', kind: 'Writing', title: 'Field notes' },
  ];
  const conv = [
    { id: 's1', title: 'Rent or buy' },
    { id: 's2', title: 'Tax incidence' },
  ];
  const w = (t, over = null) => V.readWorkspaceCommand(t, { artifacts: arts, conversations: conv, over });
  ok('the four views', w('open the logic map')?.view === 'logic_map' && w('go to content')?.view === 'content' && w('show me the chat')?.view === 'chat' && w('Show artifacts.')?.view === 'artifacts' && w('can you take me to the thinking map please')?.view === 'logic_map');
  ok('Split View: beside, side by side, closed', w('put the logic map beside')?.kind === 'beside' && w('split view with content')?.view === 'content' && J(w('show chat and logic map side by side')) === J({ kind: 'pair', view: 'chat', beside: 'logic_map' }) && w('close the split view')?.kind === 'close-beside');
  ok('an artifact by its name, by the words of it, by a kind there is one of', w('open the monthly budget')?.key === 'd:a1' && w('show me the habit tracker')?.key === 'd:a2' && w('open the chart')?.key === 'd:a1');
  ok('  a name that matches nothing is not guessed at', w('open the recipe scaler') === null);
  ok('another line of thinking, by its title', w('open my rent or buy conversation')?.id === 's1' && w('go to the conversation about tax incidence')?.id === 's2');
  ok('  over the Universal Map, a name is a line of thinking', w('open tax incidence', 'home')?.kind === 'thinking');
  ok('home, back, new, Memory', w('go home')?.kind === 'home' && w('go back', 'home')?.kind === 'back' && w('go back') === null && w('start a new line of thinking')?.kind === 'new' && w('open my memory')?.kind === 'memory');
  ok('the length dial', w('shorter answers')?.length === 'concise' && w('give me more detailed answers')?.length === 'detailed' && w('normal length')?.length === 'standard');
  ok('Undo and Redo', ['undo', 'undo that', 'undo the last edit', 'take that back'].every((t) => w(t)?.kind === 'undo') && ['redo', 'put it back'].every((t) => w(t)?.kind === 'redo'));
  ok('Start writing, Synthesize, Retry, Save as template', w('start writing')?.kind === 'writing' && w('synthesize')?.kind === 'synthesize' && w('try again')?.kind === 'retry' && w('save this as a template')?.kind === 'template');
  ok('search — said as search; "find the derivative" is a question for Socria', w('search for rent')?.query === 'rent' && w('open search')?.kind === 'search' && w('find the derivative of x squared') === null);
  ok('Map this conversation, Save the map as an image, the bars, Quick Capture, clear the selection', w('map this conversation')?.kind === 'remap' && w('save the map as an image')?.kind === 'map-image' && w('hide the bars')?.hide === true && w('show the bars')?.hide === false && w('open quick capture')?.kind === 'captures' && w('clear the selection')?.kind === 'deselect');
  ok('a whole turn only: a sentence that contains a command is for Socria', w('can you open the map of Europe I drew last week and explain it') === null && w('I think we should go home early today') === null);
  ok('Split View offers only what is here: an empty view is said, not opened', /nothing in Content yet/.test(V.besideEmpty('content', { content: 0, ideas: 3, artifacts: 1 })) && V.besideEmpty('logic_map', { content: 0, ideas: 3, artifacts: 0 }) === null);
  ok('"capture: call the landlord" — kept as said', V.readCapture('capture: call the landlord on Monday') === 'Call the landlord on Monday' && V.readCapture('what does capture mean') === null);
}
{
  const t0 = 1000;
  const slot = { fill: 'add a branch called {}', at: t0 };
  ok('the words a command was missing: the next short turn completes it', J(V.fillSlot(slot, 'Cost.', t0 + 5000)) === J({ command: 'add a branch called Cost' }));
  ok('  "never mind" lets it go', J(V.fillSlot(slot, 'never mind', t0 + 5000)) === J({ dropped: true }));
  ok('  a question, another command, a long sentence, or later: a turn of its own', V.fillSlot(slot, 'why is rent so high?', t0) === null && V.fillSlot(slot, 'open the logic map', t0) === null && V.fillSlot(slot, 'one two three four five six seven eight nine', t0) === null && V.fillSlot(slot, 'cost', t0 + V.SLOT_MS + 1) === null);
  ok('  a question is the words when a question was asked for', J(V.fillSlot({ fill: 'add a question called {}', at: t0 }, 'why is rent so high?', t0)) === J({ command: 'add a question called why is rent so high?' }));
}

// ── the writing, in words ────────────────────────────────────────────
console.log('the writing');
{
  const r = V.readDocCommand;
  ok('add: a heading, a paragraph, a bullet, a numbered item, a quote', r('add a heading called results')?.text === 'Results' && r('add a heading called results')?.t === 'h2' && r('add a subheading called method')?.t === 'h3' && r('add a title called field notes')?.t === 'h1' && r('add a paragraph saying the sample was small')?.t === 'p' && r('add a bullet: check the totals')?.t === 'ul' && r('add a numbered step: weigh it')?.t === 'ol' && r('add a quote: less is more')?.t === 'quote');
  ok('  "type …" and "insert the words …" write; "insert a table" and "type of analysis" do not', r('type the sample was small')?.text === 'The sample was small' && r('insert the words see appendix')?.text === 'See appendix' && r('insert a table') === null && r('type of analysis matters here') === null);
  ok('  a word cased its own way keeps it', r('add a heading called iPhone sales')?.text === 'iPhone sales');
  ok('shape and format', r('make that a heading')?.t === 'h2' && r('turn the last paragraph into a bullet list')?.target.of === 'paragraph' && r('bold that')?.mark === 'b' && r('make it italic')?.mark === 'i' && r('underline the last sentence')?.target.kind === 'sentence');
  ok('change: that heading, a heading by name, that, the title, a word everywhere', r('change that heading to methods')?.target.of === 'heading' && r('change the heading “Results” to Findings')?.target.text === 'Results' && r('change that to the sample was large')?.op === 'retext' && r('change the title to field notes')?.op === 'title' && J(r('replace rent with housing')) === J({ op: 'replace', find: 'rent', with: 'housing' }));
  ok('  "change that heading" — to what? asked, and the next words answer', J(r('change that heading')) === J({ op: 'ask', question: 'What should the heading say?', fill: 'change that heading to {}' }));
  ok('delete: that paragraph, the last sentence', r('delete that paragraph')?.op === 'delete' && r('delete the last sentence')?.target.kind === 'sentence');
  ok('  a question about the writing is for Socria', r('what should my heading say?') === null && r('is this paragraph too long') === null);

  const at = Date.now();
  const doc0 = V.emptyDoc(at);
  const a = V.applyDocCommand;
  let res = a(doc0, r('add a heading called results'));
  ok('applied: a document’s lone empty line is used, not left', res.doc.blocks.length === 1 && res.doc.blocks[0].t === 'h2' && res.said === 'Added a heading to your writing: “Results”.');
  let doc = res.doc;
  res = a(doc, r('type the sample was small. but the trend was clear'), { that: res.block });
  doc = res.doc;
  const p1 = res.block;
  ok('  a paragraph after it', doc.blocks.length === 2 && doc.blocks[1].t === 'p');
  res = a(doc, r('bold that'), { that: p1 });
  ok('  "bold that": the block just written', (res.doc.blocks[1].marks ?? []).some((m) => m.t === 'b'));
  res = a(res.doc, r('bold that'), { that: p1 });
  ok('  again: the bold comes off, and says so', !(res.doc.blocks[1].marks ?? []).some((m) => m.t === 'b') && /^Took the bold off/.test(res.said), res.said);
  res = a(doc, r('change that heading to methods'), { that: p1 });
  ok('  "that heading" from inside its section: the heading over it', res.doc.blocks[0].text === 'Methods' && res.said === 'Changed “Results” to “Methods”.');
  res = a(doc, r('change the heading “Discussion” to x'));
  ok('  a heading that is not there: said', /no heading called “Discussion”/.test(res.refused ?? ''));
  res = a(doc, r('make that a heading'), { that: p1 });
  ok('  "make that a heading"', res.doc.blocks[1].t === 'h2');
  res = a(doc, r('replace small with large'));
  ok('  "replace … with …": everywhere it is', /large/.test(res.doc.blocks[1].text) && res.said === 'Replaced “small” with “large”.');
  res = a(doc, r('delete the last sentence'));
  ok('  "delete the last sentence"', res.doc.blocks[1].text === 'The sample was small.', res.doc.blocks[1].text);
  ok('  what a delete would take is said before it happens', V.docDeleteOf(doc, r('delete that paragraph'), { that: p1 }) === 'The sample was small. but the trend was clear');
  res = a(doc, r('change the title to field notes'));
  ok('  the title', res.doc.title === 'Field notes');

  ok('dictation: spoken punctuation, "new line", "new paragraph"', J(V.dictationParts('the costs comma and the risks period new paragraph next one new line two')) === J([{ text: 'the costs, and the risks.', newBlock: false }, { text: 'next one\ntwo', newBlock: true }]));
  let d = V.dictate(doc, 'Next we look at the costs period', { after: null });
  ok('  a dictation starts a paragraph of its own, at the end', d.doc.blocks.length === 3 && d.doc.blocks[2].text === 'Next we look at the costs.');
  const into = d.block;
  d = V.dictate(d.doc, 'And then the risks', { into });
  ok('  the next turn continues it — a new sentence keeps its capital', d.doc.blocks[2].text === 'Next we look at the costs. And then the risks', d.doc.blocks[2].text);
  d = V.dictate(d.doc, 'Which matter more', { into });
  ok('  mid-sentence, the recogniser’s capital comes off', d.doc.blocks[2].text.endsWith('the risks which matter more'), d.doc.blocks[2].text);
  d = V.dictate(d.doc, 'I think so new paragraph done', { into });
  ok('  "I" keeps its capital; "new paragraph" starts the next, capitalised', /matter more I think so$/.test(d.doc.blocks[2].text) && d.doc.blocks[3].text === 'Done', J(d.doc.blocks.map((b) => b.text)));
  ok('  after the block the caret is in, when there is one', V.dictate(doc, 'between', { after: doc.blocks[0].id }).doc.blocks[1].text === 'Between');
}

// ── the Logic Map, in words ──────────────────────────────────────────
console.log('the Logic Map');
{
  const map = {
    nodes: [
      { id: 'a', type: 'idea', label: 'Rent is high', status: 'open' },
      { id: 'b', type: 'idea', label: 'Budget', status: 'open' },
      { id: 'c', type: 'idea', label: 'I think that cost matters', status: 'open' },
    ],
    edges: [{ from: 'a', to: 'b', relation: 'relates', strength: 'normal' }],
  };
  const add = (t, recent) => V.readMapAdd(t, map, recent);
  ok('"add a branch called cost": hung from the idea at the centre', J(add('add a branch called cost').edits) === J([{ op: 'add', node: { label: 'cost', type: 'idea' }, near: 'a' }]));
  ok('  "…to budget": from the idea named', add('add a branch called cost to budget').edits[0].near === 'b' && add('put an idea about cost under budget').edits[0].near === 'b');
  ok('  "another": beside the last one added, from what it hangs from', add('add another branch about time', { id: 'n_cost', label: 'cost', near: 'b' }).edits[0].near === 'b');
  ok('  a question is a question', add('add a question: why is rent so high?').edits[0].node.type === 'question');
  ok('  "make a question about photosynthesis" asks Socria to write one — not the map', add('make a question about photosynthesis') === null);
  ok('  nothing to say: asked, and the next words answer', J(add('add a branch')) === J({ refused: 'What should the new branch say?', fill: 'add a branch called {}' }));
  ok('  a target that is not there: said', /Nothing on the map is called “groceries”/i.test(add('add a branch called cost to groceries').refused));
  const about = (t, recent) => V.readMapCommandAbout(t, map, recent);
  const rent = { id: 'a', label: 'Rent is high' };
  ok('"that", "it", "this": the idea last touched', about('rename that to housing', rent).edits[0].label === 'housing' && about('remove it', rent).edits[0].id === 'a' && about('mark that as resolved', rent).edits[0].status === 'resolved' && about('connect that to budget', rent).edits[0].to === 'b');
  ok('  nothing touched: "that" is not a label to look for (not “I think that cost matters”)', about('remove that', null) === null && V.readMapCommand('remove that', map)?.edits?.[0]?.id === 'c');
  ok('  "remove this idea about rent" names its idea', about('remove this idea about rent', null).edits[0].id === 'a');
  ok('  "rename that" — to what? asked', J(about('rename that', rent)) === J({ refused: 'What should “Rent is high” be called?', fill: 'rename “Rent is high” to {}' }));
  ok('"select the rent idea": the card in hand (Point & Ask)', V.readMapSelect('select the rent idea', map).node.id === 'a' && V.readMapSelect('focus on budget', map).node.id === 'b' && /Nothing on the map/.test(V.readMapSelect('select the groceries node', map).refused) && V.readMapSelect('select all of it', map) === null);

  const added = V.applyMapEdits(map, [{ op: 'add', node: { label: 'Cost', type: 'idea' }, near: 'b' }]).map;
  const undone = V.replayMapChange(added, added, map);
  ok('undo an addition: gone, and the extractor told it stays gone', !undone.map.nodes.some((n) => n.label === 'Cost') && undone.map.removed?.includes('cost') && undone.changed === 1);
  const redone = V.replayMapChange(undone.map, map, added);
  ok('  redo: back, with its connection, and no longer kept off', redone.map.nodes.some((n) => n.label === 'Cost') && redone.map.edges.length === 2 && !redone.map.removed);
  const removed = V.applyMapEdits(map, [{ op: 'remove', id: 'a' }]).map;
  const back = V.replayMapChange(removed, removed, map);
  ok('undo a removal: the idea and its connections back, as they were', back.map.nodes.find((n) => n.id === 'a')?.label === 'Rent is high' && back.map.edges.some((e) => e.from === 'a' && e.to === 'b') && !back.map.removed);
  const renamed = V.applyMapEdits(map, [{ op: 'rename', id: 'a', label: 'Housing' }]).map;
  const movedOn = V.applyMapEdits(renamed, [{ op: 'rename', id: 'a', label: 'Housing costs' }]).map;
  ok('undo on a map that moved on: an idea changed since is left as it is now', V.replayMapChange(movedOn, renamed, map).changed === 0 && V.replayMapChange(renamed, renamed, map).map.nodes[0].label === 'Rent is high');
  const drawn = { ...added, nodes: [...added.nodes, { id: 'z', type: 'claim', label: 'Drawn by the map pass', status: 'open' }] };
  ok('  what the map pass drew since stays', V.replayMapChange(drawn, added, map).map.nodes.some((n) => n.id === 'z'));
}

// ── the screen ───────────────────────────────────────────────────────
console.log('the screen');
{
  const btn = html(h(V.VoiceButtonView, { phase: 'off', onPress: () => {} }));
  ok('the button: "Voice", marked Experimental, not pressed', /Voice/.test(btn) && /Experimental/.test(btn) && /aria-pressed="false"/.test(btn) && /sv-exp/.test(btn));
  ok('  on: pressed, and says pressing turns it off', /aria-pressed="true"/.test(html(h(V.VoiceButtonView, { phase: 'listening', onPress: () => {} }))) && /turn it off/.test(html(h(V.VoiceButtonView, { phase: 'listening', onPress: () => {} }))));
  const base = { has: { browser: true, socria: true }, engine: 'browser', phase: 'listening', heard: '', interim: '', level: 0, ending: 0, pending: 0, problem: null, failed: false, note: null };
  const act = { resume() {}, pause() {}, sendNow() {}, cancelTurn() {}, retry() {}, discardFailed() {}, dismiss() {} };
  const props = { act, busy: false, queued: [], confirming: null, outcome: null, dictating: false, boxMode: false, where: 'to Socria', onSettings() {}, onHelp() {}, onConfirm() {}, onDrop() {}, onStopAnswer() {}, onOff() {}, onSwitch() {} };
  const panel = (s, p = {}) => html(h(V.VoicePanelView, { ...props, ...p, s: { ...base, ...s } }));
  ok('the panel, listening: says so, how to talk, and Pause, help, settings, off', /Listening/.test(panel({})) && /it goes to Socria when you pause/.test(panel({})) && /Pause/.test(panel({})) && /What can I say/.test(panel({})) && /Turn Voice off/.test(panel({})));
  const hearing = panel({ phase: 'hearing', heard: 'add a branch', interim: 'called co', ending: 0.4 });
  ok('  hearing: the words as they are said (the unsettled ones lighter), the pause filling, Send now and Cancel', /add a branch/.test(hearing) && /sv-interim[^>]*>called co/.test(hearing) && /--sv-end:0.4/.test(hearing) && /Send now/.test(hearing) && /Cancel/.test(hearing));
  ok('  Socria’s recogniser: the microphone’s level', /scale\(1\.7/.test(panel({ engine: 'socria', level: 0.5 })) && /Turning that into text/.test(panel({ engine: 'socria', pending: 1 })));
  ok('  Socria answering: still listening, and Stop answer', /Socria is answering — still listening/.test(panel({}, { busy: true })) && /Stop answer/.test(panel({}, { busy: true })));
  ok('  a turn waiting for the answer, with Drop', /Sent when Socria finishes:[\s\S]*what is a mortgage[\s\S]*Drop/.test(panel({}, { busy: true, queued: [{ id: 'q', text: 'what is a mortgage' }] })));
  const conf = panel({}, { confirming: { what: 'Remove “cost” from the Logic Map?', level: 'destructive', text: 'Remove cost' } });
  ok('  a "yes" waited for: what would happen, what was heard, Yes and No', /role="alertdialog"/.test(conf) && /Remove “cost” from the Logic Map\?/.test(conf) && /Heard: “Remove cost”/.test(conf) && /Say “yes” or “no”/.test(conf) && />Yes</.test(conf) && />No</.test(conf));
  ok('  paused: the microphone off, Resume, and why', /Paused — the microphone is off/.test(panel({ phase: 'paused', note: 'Paused while this tab was in the background.' })) && /Resume/.test(panel({ phase: 'paused' })) && /in the background/.test(panel({ phase: 'paused', note: 'Paused while this tab was in the background.' })));
  const err = panel({ phase: 'error', problem: V.browserProblem('network') });
  ok('  stopped by a problem: said as an alert, Try again, and the other recogniser offered', /role="alert"/.test(err) && /couldn’t be reached/.test(err) && /Try again/.test(err) && /Use Socria’s transcription instead/.test(err));
  ok('  a turn that failed to transcribe: Retry and Discard, listening goes on', /Retry/.test(panel({ engine: 'socria', failed: true, problem: V.transcribeOutcome(502, {}).problem })) && /Discard/.test(panel({ engine: 'socria', failed: true, problem: V.transcribeOutcome(502, {}).problem })));
  ok('  dictating, and turns into the box', /Dictating into your writing/.test(panel({}, { dictating: true })) && /say “send” to send it/i.test(panel({}, { boxMode: true })));
  ok('  what the last turn did', /“Open the logic map”[\s\S]*Opened the Logic Map\./.test(panel({}, { outcome: { heard: 'Open the logic map', did: 'Opened the Logic Map.', at: 1 } })));
  ok('  floating over the Universal Map', /sv-panel is-floating/.test(panel({}, { floating: true })));
  ok('  a live region says the status, not every word', /role="status" aria-live="polite"/.test(panel({})));

  const sheet = (kind, has = { browser: true, socria: true }, settings = V.DEFAULT_VOICE) => html(h(V.VoiceSheet, { kind, has, settings, onChange() {}, onStart() {}, onClose() {} }));
  const notice = sheet('consent');
  ok('the notice before Voice first listens: what it does, nothing spoken back', /Socria answers in text/.test(notice) && /Nothing is spoken back/.test(notice) && /Experimental/.test(notice));
  ok('  where the audio goes, for each recogniser', /browser maker’s speech service/.test(notice) && /transcription Socria uses \(OpenAI\)/.test(notice) && /nothing is kept/.test(notice));
  ok('  the promises: the microphone off when paused, a yes before anything is taken away', /Pause turns it off/.test(notice) && /waits for your “yes”/.test(notice) && /marked with a microphone/.test(notice));
  ok('  Start Voice, or Not now', /Start Voice/.test(notice) && /Not now/.test(notice));
  ok('  only the recognisers this browser has are offered', !/Socria’s transcription<\/b>/.test(sheet('consent', { browser: true, socria: false })) && !/Your browser’s speech recognition<\/b>/.test(sheet('consent', { browser: false, socria: true })));
  ok('settings: the pause, where a turn goes, speaking while Socria answers', /Short/.test(sheet('settings')) && /Put it in the box/.test(sheet('settings')) && /Stop the answer/.test(sheet('settings')));
  const help = sheet('help');
  ok('what can be said: every group', V.VOICE_HELP.every((g) => help.includes(g.group)));
}

// ── every example in the help card is understood ─────────────────────
console.log('the help card');
{
  const map = { nodes: [{ id: 'r', type: 'idea', label: 'Rent', status: 'open' }, { id: 'h', type: 'idea', label: 'Housing', status: 'open' }], edges: [] };
  const ctx = { artifacts: [{ key: 'd:t', kind: 'Custom', title: 'Habit tracker' }], conversations: [{ id: 's', title: 'Rent' }], over: null };
  const recent = { id: 'r', label: 'Rent' };
  // examples that are for Socria (its runtime reads them), not one of the local readers
  const forSocria = new Set(['Make a chart: rent 1200, food 400', 'Make a custom artifact: a habit tracker', 'Set servings to 6', 'Tick milk', 'Challenge this', 'Type: …']);
  const quotes = V.VOICE_HELP.flatMap((g) => g.says.flatMap((s) => [...s.matchAll(/“([^”]+)”/g)].map((m) => m[1])));
  const understood = (q) =>
    forSocria.has(q) ||
    /…/.test(q) ||
    !!V.readControl(q, { confirming: false, dictating: false }) ||
    !!V.readWorkspaceCommand(q, ctx) ||
    !!V.readWorkspaceCommand(q, { ...ctx, over: 'home' }) ||
    !!V.readMapAdd(q, map, recent) ||
    !!V.readMapCommandAbout(q, map, recent) ||
    !!V.readMapSelect(q, map) ||
    !!V.readDocCommand(q) ||
    !!V.readCapture(q);
  const missed = quotes.filter((q) => !understood(q));
  ok(`all ${quotes.length} examples are read by the reader that does them`, quotes.length > 30 && missed.length === 0, J(missed));
}

// ── the wiring ───────────────────────────────────────────────────────
console.log('the wiring');
{
  const app = read('components/LogosApp.tsx');
  ok('one dispatcher: a spoken turn is sent through send(), marked as said — no second chatbot', /const p = send\(words, ready, replyTo, make, 'voice'\)/.test(app) && /\.\.\.\(via \? \{ via \} : \{\}\)/.test(app));
  ok('  the shared commands are read in send(), for typed and spoken turns alike', /const done = localCommand\(content\)/.test(app));
  ok('  the typed box is left alone by a spoken turn', /if \(via !== 'voice'\) setInput\(''\)/.test(app));
  ok('  a spoken turn waits while Socria answers, unless set to stop the answer', /whileAnswering === 'interrupt'\) stopAnswer\(\)/.test(app) && /function pumpVoice\(\)/.test(app));
  ok('  a destructive or sensitive spoken turn waits for a yes', /const risk = voiceRisk\(text\)/.test(app) && /riskOf\(text, \{ mapRemoves, docDelete, objectRemove \}\)/.test(app));
  ok('  a map command says what it did, or why not — never a refusal said as if done', /function runMapCommand/.test(app) && !/editMap\(cmd\.edits\) \?\? cmd\.said/.test(app));
  const src = ['components/logos5/useSocriaVoice.ts', 'components/logos5/SocriaVoice.tsx', 'lib/voice/speech.ts', 'components/LogosApp.tsx'].map(read).join('\n');
  ok('no speech synthesis anywhere: Socria answers in text', !/speechSynthesis|SpeechSynthesisUtterance|\.speak\(/.test(src));
  const conv = read('app/api/conversations/route.ts');
  ok('  "said" is saved with the message, and only on the person’s turns', /m\.role === 'user' && m\.via === 'voice' \? 'voice'/.test(conv) && /\.\.\.\(via \? \{ via \} : \{\}\)/.test(conv));
  const ear = read('components/logos5/useSocriaVoice.ts');
  ok('the microphone is released on pause, off, and when the page goes', /getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/.test(ear) && /dispose\(\)/.test(ear) && /visibilitychange/.test(ear));
  ok('  nothing is recorded between turns: a turn’s samples are kept only while it is spoken', /turnFrames = null/.test(ear) && !/localStorage|indexedDB/.test(ear));
  const composer = read('components/LogosComposer.tsx');
  ok('the button beside the box; the hold-to-talk mic steps aside while Voice listens', /\{voiceButton\}/.test(composer) && /mic\.available && !voiceLive/.test(composer));
  ok('switchable for a deployment: NEXT_PUBLIC_SOCRIA_VOICE=off', /process\.env\.NEXT_PUBLIC_SOCRIA_VOICE/.test(read('lib/voice/flag.ts')) && /SOCRIA_VOICE && hasAccess && !togetherReadOnly/.test(app));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
