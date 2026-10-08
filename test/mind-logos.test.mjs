// Logos 3 remembers through the Mind graph — the same recall() and remember()
// Core 4 uses — and keeps Core 4's privacy rule while it does.
//
// The rule is the part that must not drift: off the record keeps nothing, a
// sensitive subject keeps the conversation to itself (written private, so it
// never comes back to Logos), and both are read from what the person said,
// in order, by the same reader Core uses.

import { logosPersistPolicy, logosMemoryText, cleanId } from './.tmp/logos-turn.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== what may be kept, read like Core 4 reads it ===');
{
  ok('an ordinary line of thinking is remembered', logosPersistPolicy(['Why does my model overfit?', 'So regularise?']) === 'full');
  ok('nothing said, nothing withheld', logosPersistPolicy([]) === 'full');
  ok('"off the record" keeps nothing', logosPersistPolicy(['Why does my model overfit?', 'This is off the record, but my advisor hates it.']) === 'none');
  ok('  and stays that way', logosPersistPolicy(['off the record: my advisor', 'anyway, back to the model']) === 'none');
  ok('  until they put it back', logosPersistPolicy(['off the record: my advisor', 'ok, back on the record now']) === 'full');
  ok('a sensitive subject keeps the conversation to itself', logosPersistPolicy(['I want to plan around my chemo schedule']) === 'conversation_only');
  ok('  and that is sticky', logosPersistPolicy(['I want to plan around my chemo schedule', 'Now the budget part']) === 'conversation_only');
  ok('  "remember this" does not undo it — only off-the-record can be lifted', logosPersistPolicy(['my divorce timeline', 'remember this']) === 'conversation_only');
  ok('off the record, then back on with something sensitive → conversation only', logosPersistPolicy(['off the record', 'back on the record — my diagnosis came in']) === 'conversation_only');
  ok('junk in the list is skipped', logosPersistPolicy([null, 7, '', 'fine']) === 'full');
}

console.log('=== the turn as the extractor reads it ===');
{
  const t = logosMemoryText('  Why does it overfit? ', 'Because it memorised noise.');
  ok('the same "User: / Socria:" shape Core sends', t === 'User: Why does it overfit?\n\nSocria: Because it memorised noise.', JSON.stringify(t));
  ok('  bounded', logosMemoryText('x'.repeat(9000), 'y'.repeat(9000)).length < 8100);
  ok('an id is held to a conversation id\'s shape', cleanId('lg_abc123') === 'lg_abc123' && cleanId('a b') === null && cleanId('x'.repeat(121)) === null && cleanId(5) === null);
}

console.log('=== the route: Logos 3, an account, never in a room ===');
{
  const route = read('app/api/logos/chat/route.ts');
  ok('the same recall Core uses, as the logos surface', /recall\(userId!, [\s\S]{0,260}surface: 'logos'/.test(route));
  ok('  and the same remember', /remember\(userId!, logosMemoryText\(/.test(route) && /surface: 'logos',\s*conversationId: mindConversation/.test(route));
  ok('only when asked, for an account, on the main thread, alone — and never in a shared conversation', /const mindOn = !!userId && body\?\.mind === true && !focusLabel && !body\?\.collab && !twoPeople && !sharedCtx\.shared;/.test(route));
  ok('off the record writes nothing', /mindOn && mindPolicy !== 'none' && reply\.trim\(\)/.test(route));
  ok('a sensitive conversation is written private', /mindPolicy === 'conversation_only' \? \{ private: true \}/.test(route));
  ok('the policy is folded over everything they said here', /logosPersistPolicy\(clean\.filter\(\(m: \{ role: string \}\) => m\.role === 'user'\)/.test(route));
  ok('the write is registered before the stream closes', /waitUntil\(write\(\)\)[\s\S]{0,120}controller\.close\(\)/.test(route));
  ok('the graph replaces the flat list only when it has something to say', /if \(fromGraph\.trim\(\)\) memoryBlock = /.test(route));
  const app = read('components/LogosApp.tsx');
  ok('the client asks for it on Logos 3 with an account, never in a shared room or line of thinking', /workspaceOn && cloud && !shared\s*\?\s*\{ mind: true/.test(app) && /const shared = inShared \|\| !!togetherRef\.current\?\.active \|\| foreignIdsRef\.current\.has\(sid\);/.test(app));
  ok('  and says which Project the chat is filed in', /projectId: active\.projectId/.test(app));
  const atlas = read('app/api/mind/atlas/route.ts');
  ok('the atlas route reads no messages', !/messages/.test(atlas.split('async function loadChats')[1].split('export async function GET')[0].replace(/\/\/.*|\*.*$/gm, '')));
  ok('  and scopes on the server', /searchParams\.get\('scope'\) === 'logos'/.test(atlas) && /buildAtlas\(\{[\s\S]*scope,/.test(atlas));
}

console.log('=== seeing it: the Mind view and the Memory page ===');
{
  const app = read('components/LogosApp.tsx');
  ok('Logos 3, with an account, gets a Mind button on the map', /primary && workspaceOn && cloud && \(\s*<button[\s\S]{0,200}lg-panel-mind/.test(app));
  ok('  it shows the atlas centred on this chat, through the logos scope', /<MindAtlas\s+scope="logos"\s+embedded\s+focusChat=\{activeId\}/.test(app));
  ok('  a connected Logos chat opens here, a Core chat in Core', /if \(surface === 'logos'\) switchSession\(id\);\s*else onOpenChat\?\.\(id\);/.test(app));
  ok('  and it reads again after a turn lands', /refreshKey=\{`\$\{activeId\}:\$\{messages\.length\}/.test(app));
  const atlasView = read('components/mind/MindAtlas.tsx');
  ok('the atlas view is read-only — it writes nothing', !/method: '(POST|PATCH|PUT|DELETE)'/.test(atlasView));
  ok('  and waits a moment before re-reading, because memory is written after the reply', /setTimeout\(\(\) => void load\(\), 5000\)/.test(atlasView));
  const mem = read('components/mind/MindGraphView.tsx');
  ok('the Memory page has Everything beside Graph and List', /setView\('everything'\)/.test(mem) && /<MindAtlas scope="all" onOpenChat=\{openChat\} \/>/.test(mem));
  ok('  and shows it even before any memory exists', /mem-everything[\s\S]{0,120}<MindAtlas scope="all"/.test(mem));
  const chat = read('app/chat/page.tsx');
  ok('a link can open one particular Core chat', (chat.match(/get\('c'\)/g) || []).length === 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
