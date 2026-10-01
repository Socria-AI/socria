// A CONVERSATION IS NOT A CORE CHAT OR A LOGOS SESSION.
//
// Reported, with a screenshot of the rail: four model specifications typed into
// Core chats — "log(wage) = β0 + β1·educ…", "Plot quantity demanded Q =" — none
// of which could be opened on the surface that draws models. `kind` was a GATE:
// LogosApp loaded `.filter(c => c.kind === 'logos')`, so a conversation that
// began in Core was not merely unopened there, it was absent.
//
// The rule this suite pins is the one lib/session-rail.ts had already reached
// for filing and the loader never got: the surface is an implementation detail
// of how a conversation started. `kind` is a MEMORY of where it was last left,
// the picker moves it, and the thread comes with it.

import {
  surfaceOf, surfaceForModel, moves, moved,
  hasHistory, hasMap, owesExtraction, moveNote,
} from './.tmp/conversation-surface.mjs';
import { SOCRIA_MODELS } from './.tmp/socria-prompt.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const CORE = SOCRIA_MODELS['core-4'];
const LOGOS = SOCRIA_MODELS['logos-2'];
const said = (n) => ({ messages: Array.from({ length: n }, (_, i) => ({ role: 'user', content: `m${i}` })) });
const drawn = (n) => ({ map: { nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}` })) } });

console.log('=== the models this is routed by are the real ones ===');
{
  ok('Core 4 exists and is not a Logos surface', !!CORE && !CORE.logosSurface);
  ok('Logos 2 exists and is one', !!LOGOS && LOGOS.logosSurface === true);
  // Read from the registry rather than hard-coded here: a model added later
  // routes correctly without this file being touched.
  const logosIds = Object.keys(SOCRIA_MODELS).filter((k) => SOCRIA_MODELS[k].logosSurface);
  ok('every Logos-surface model routes to logos',
    logosIds.every((k) => surfaceForModel(SOCRIA_MODELS[k]) === 'logos'), logosIds.join(','));
  ok('every other model routes to chat',
    Object.keys(SOCRIA_MODELS).filter((k) => !logosIds.includes(k))
      .every((k) => surfaceForModel(SOCRIA_MODELS[k]) === 'chat'));
}

console.log('\n=== where a conversation opens ===');
{
  ok('an unmarked row opens where it always did', surfaceOf({}) === 'chat');
  ok('  including one written before the column existed', surfaceOf({ kind: null }) === 'chat');
  ok('a chat opens on chat', surfaceOf({ kind: 'chat' }) === 'chat');
  ok('a logos session opens on logos', surfaceOf({ kind: 'logos' }) === 'logos');
  ok('nonsense is not a third surface', surfaceOf({ kind: 'banana' }) === 'chat');
}

console.log('\n=== picking a model moves the conversation you are in ===');
{
  const chat = { kind: 'chat', ...said(6) };
  ok('a Core conversation, picking Logos, moves', moves(chat, LOGOS));
  ok('  and picking Core again does not', !moves(chat, CORE));
  const now = moved(chat, LOGOS);
  ok('  the move writes the new surface', now.kind === 'logos');
  // THE WHOLE POINT. A move is a change of where it opens, not of what it is.
  ok('  and the thread comes with it', now.messages.length === 6);
  ok('  the same thread, not a copy of some of it',
    JSON.stringify(now.messages) === JSON.stringify(chat.messages));
  ok('  and the original is not mutated', chat.kind === 'chat');
  ok('moving back is just as plain', moved(now, CORE).kind === 'chat');
  ok('  with the thread still on it', moved(now, CORE).messages.length === 6);
  // A move that changes nothing returns the same object, so a picker that fires
  // on every render does not write to the database on every render.
  ok('choosing the surface it is already on is a no-op', moved(chat, CORE) === chat);
}

console.log('\n=== a map is owed once, over what was already said ===');
{
  ok('a Core thread arriving in Logos owes a map', owesExtraction({ kind: 'chat', ...said(8) }, LOGOS));
  // Not twice. Re-extracting would overwrite nodes somebody moved or deleted,
  // and the extractor cannot tell which of them were theirs.
  ok('  but not when one has already been drawn',
    !owesExtraction({ kind: 'chat', ...said(8), ...drawn(5) }, LOGOS));
  ok('  nor for a conversation with nothing in it', !owesExtraction({ kind: 'chat', ...said(0) }, LOGOS));
  ok('  nor when the destination is Core', !owesExtraction({ kind: 'chat', ...said(8) }, CORE));
  ok('a map with an empty node list is no map', !hasMap({ map: { nodes: [] } }));
  ok('  and neither is a missing one', !hasMap({}) && !hasMap({ map: null }));
  ok('history is turns, not a title', hasHistory(said(1)) && !hasHistory({ messages: [] }) && !hasHistory({}));
}

console.log('\n=== and the person is told, because a thread jumping surface is disorienting ===');
{
  ok('no move, nothing said', moveNote({ kind: 'chat' }, CORE) === null);
  const toLogos = moveNote({ kind: 'chat', ...said(6) }, LOGOS);
  ok('moving a thread into Logos says the thread came too', /already said/.test(toLogos ?? ''), toLogos);
  ok('  and that the map is being drawn from it', /drawn from it/.test(toLogos ?? ''), toLogos);
  const withMap = moveNote({ kind: 'chat', ...said(6), ...drawn(3) }, LOGOS);
  ok('a thread that already has a map is not told one is being drawn',
    !/drawn from it/.test(withMap ?? '') && /the map you had/.test(withMap ?? ''), withMap);
  const empty = moveNote({ kind: 'chat' }, LOGOS);
  ok('an empty conversation is not promised a map of nothing',
    /starts where you do/.test(empty ?? ''), empty);
  const back = moveNote({ kind: 'logos', ...drawn(4) }, CORE);
  ok('going back says the map is kept', /kept/.test(back ?? ''), back);
  ok('  and does not promise a map that was never drawn',
    !/kept/.test(moveNote({ kind: 'logos' }, CORE) ?? ''), moveNote({ kind: 'logos' }, CORE));
}

console.log('\n=== nothing it is handed can make it throw ===');
{
  for (const junk of [null, undefined, 42, 'x', [], true]) {
    let threw = null;
    try { surfaceOf(junk ?? {}); moves(junk ?? {}, undefined); moved(junk ?? {}, undefined); owesExtraction(junk ?? {}, undefined); moveNote(junk ?? {}, undefined); }
    catch (e) { threw = e; }
    ok(`${JSON.stringify(junk)} is survivable`, threw === null, String(threw));
  }
  ok('an unknown model is a Core model', surfaceForModel(undefined) === 'chat');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
