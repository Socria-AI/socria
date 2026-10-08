// Think Together as a group chat — the seams, source-level.
//
// The behaviour is proved elsewhere: the sync in share-sync (every way a turn
// and Socria's answer used to vanish, replayed), the route in share-e2e, the
// helpers and the room's reducer in chat-thread, the model's side in logos3.
// This pins the wiring that joins them, so a later change cannot quietly put
// back the stale-snapshot landing, the wholesale replace, or a model call for
// a message nobody addressed to Socria.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const app = read('components/LogosApp.tsx');
const send = app.slice(app.indexOf('async function send('), app.indexOf('// ── FOUND ALONG THE WAY'));

console.log('=== Socria speaks when it is asked ===');
ok('a group is anyone else here right now — a room, or a shared line of thinking', /function groupNow\(\): boolean \{[\s\S]{0,300}roomRef\.current\.people\.length >= 2[\s\S]{0,200}togetherRef\.current\.people\.some\(\(p\) => !p\.you\)/.test(app));
ok('the rule is the shared one: @socria, or a reply to Socria', /const asks = callsSocria\(\{ group, text: content, replyTo: replying \}\);/.test(send));
const plain = send.slice(send.indexOf('if (!asks) {'), send.indexOf('// One answer at a time'));
ok('anything else is posted to everyone and nothing more — no model, no map pass', /postTurn\(turn, true\)/.test(plain) && !/fetch\(|refreshMap\(|takeObjects\(/.test(plain) && /return;\s*\}$/.test(plain.trim()));
ok('talking to the others never waits on Socria; asking it again does, and says so', send.indexOf('if (!asks)') < send.indexOf('if (busy)') && /Socria is still answering — send this again in a moment\./.test(send));
ok('in a group the question is posted at once, so it is there while Socria answers', /const sent = postTurn\(turn, group\);/.test(send));
ok('Socria is told who asked, and how', /how: replying\?\.role === 'assistant' && !mentionsSocria\(content\) \? 'reply' : 'mention'/.test(send) && /\.\.\.\(addressed && people\.length >= 2 \? \{ addressed \} : \{\}\)/.test(send));
ok('everyone else sees an answer is coming', /if \(group\) togetherRef\.current\?\.asking\(true\);/.test(send) && /togetherRef\.current\?\.asking\(false\);/.test(send));

console.log('=== nothing said is wiped ===');
ok('the answer lands in the conversation as it is now — never the copy taken at sending', /patchSession\(sid, \(s\) => \(\{ \.\.\.s, messages: landReply\(s\.messages, sent, reply\) \}\)\)/.test(send) && !/messages: landed \}/.test(send));
ok('in a room it goes through the room\'s record', /if \(inShared\) roomRef\.current\.onLocalReply\(reply\);/.test(send));
ok('a failed turn is taken out by its own name, alone; in a group it stays said', /withoutTurn\(sn\.messages, sent\)/.test(send) && /withoutTurn\(s\.messages, sent\)/.test(send) && /Your message is posted — mention @socria to ask again\./.test(send) && !/messages: before \}/.test(send));
ok('every message is made with a name', (send.match(/id: newMsgId\(\)/g) ?? []).length >= 4 && /const said: Msg = \{ id: newMsgId\(\)/.test(app));
ok('a command\'s turn and its answer go through the room\'s record in a room', /roomRef\.current\.onLocalReply\(\{ \.\.\.reply/.test(app.slice(app.indexOf('function postPair('))));
ok('the extractor hears the other person too', /chronRef\.current = withArrived\(chronRef\.current, shared\.messages\)/.test(app) && /chronRef\.current = withArrived\(chronRef\.current, cur\.messages\)/.test(app));
const hook = read('components/useLogosCollab.ts');
ok('in a room, an event that changes nothing repaints nothing', /const next = applyEvent\(st, ev\);[\s\S]{0,300}if \(next === st\) return;/.test(hook));
ok('  and Socria\'s answer is an event of its own, signed by nobody', /const onLocalReply = useCallback\([\s\S]{0,300}const \{ by: _signed, \.\.\.words \} = m;[\s\S]{0,200}emit\(\{ kind: 'message', message: reply \}/.test(hook));
const shared = read('components/share/useSharedSession.ts');
ok('a shared session writes what is new by id, read when the write goes', /const local = optsRef\.current\.getLocal\(id\);\s*if \(!local\) return false;\s*const o = outgoing\(seen\.current, local\);/.test(shared));
ok('  and tries again when a write fails', /later\(res\.status === 429/.test(shared) && /RETRY_MS = \[2000, 4000, 8000, 16000, 30000\]/.test(shared));
ok('  every answer is for the session it was asked about', (shared.match(/if \(sid\.current !== id/g) ?? []).length >= 3);

console.log('=== a group chat ===');
const msg = read('components/LogosMessage.tsx');
ok('you on the right, everyone else on the left with a face, Socria with its mark', /is-\$\{side\}/.test(msg) && /<SocriaFace \/>/.test(msg) && /initialOf\(who\)/.test(msg));
ok('a run from one person shows the name once', /\(group \? side !== 'mine' && !cont : side === 'socria'\)/.test(msg) && /cont=\{!!prev && !prev\.synthesis && authorKey\(prev\) === authorKey\(m\)\}/.test(app));
ok('each person in their own colour', /hue=\{groupView && side === 'other' \? hueOf\(authorKey\(m\)\) : undefined\}/.test(app));
ok('Socria says whom it is answering', /<span className="lg-msg-to"> → \{to\}<\/span>/.test(msg));
ok('the conversation reads as a group whenever it is shared, not only while someone is here', /const groupView = room\.active \|\| together\.active \|\| messages\.some/.test(app));

console.log('=== reply and copy, alone too ===');
ok('every Socria message can be replied to and copied', /canReply=\{!togetherReadOnly && \(m\.role === 'assistant' \|\| \(groupView && side === 'other'\)\)\}/.test(app) && /<MsgActions m=\{m\} who="Socria"/.test(app));
ok('Copy says Copied only when it worked', /if \(await copyText\(m\.content\)\) \{\s*setCopied\(true\);/.test(msg));
const composer = read('components/LogosComposer.tsx');
ok('the composer shows what it replies to, and Esc lets it go', /Replying to \{replyTo\.who\}/.test(composer) && /if \(replyTo && onCancelReply\) \{\s*e\.preventDefault\(\);\s*onCancelReply\(\);/.test(composer));
ok('"@so" is finished as @socria, by Tab or Enter', /if \(offering && \(e\.key === 'Tab' \|\| \(e\.key === 'Enter' && !e\.shiftKey\)\)\)/.test(composer));
ok('a quote goes to its message by scrolling the thread itself, never scrollIntoView', /t\.scrollTop \+= el\.getBoundingClientRect\(\)\.top/.test(app) && !/scrollIntoView/.test(app.slice(app.indexOf('function jumpTo('), app.indexOf('const convoBody'))));
const core = read('app/chat/page.tsx');
ok('Core chat: Reply and Copy under Socria\'s answers, the reply carried to the model', /<TurnActions text=\{copy\} onReply=\{onReply\} align="start" \/>/.test(core) && /\.\.\.\(replying \? \{ replyTo: replying \} : \{\}\)/.test(core));
const att = read('lib/chat-attachments.ts');
ok('  forRequest carries it, and the route folds it into one quoted line', /\.\.\.ref\(m\)/.test(att) && /content: withQuote\(m\),/.test(att) && /content: withQuote\(m\) \}\)\)/.test(read('app/api/chat/route.ts')));

console.log('=== Core, together ===');
const st = read('components/share/SharedThread.tsx');
ok('the poll joins, never replaces: what was just said stays on screen', /setConvo\(\{ \.\.\.j\.conversation, messages: withPending\(j\.conversation\.messages \?\? \[\]\) \}\)/.test(st) && !/setConvo\(j\.conversation\)/.test(st));
ok('Socria\'s answer is on screen the moment it is written, kept until the server holds it', /pending\.current\.set\(answer\.id!, answer\);\s*setConvo/.test(st));
ok('a save that fails is tried again, and never says anything twice', /await new Promise\(\(r\) => setTimeout\(r, 900 \* 2 \*\* attempt\)\)/.test(st) && /Not saved yet — it stays here/.test(st));
ok('the same rule for asking Socria', /const asks = callsSocria\(\{ group, text, replyTo: replying \}\);/.test(st));

console.log('=== privacy, kept ===');
ok('no memory, no Mind graph, no understanding pass in anything others share', /const u = isSignedIn && !shared \? understandingRef\.current : null;/.test(send) && /workspaceOn && cloud && !shared/.test(send) && /!shared &&\s*!sharedIdsRef\.current\.has\(sid\)/.test(send));
const route = read('app/api/logos/chat/route.ts');
ok('…and the route refuses memory whenever two or more are named', /!sharedCtx\.shared && !twoPeople\) \{/.test(route));
ok('a quote reaches the model only as one fixed-format line on a person\'s turn', /const ref = m\.role === 'user' \? cleanReplyRef\(m\.replyTo\) : undefined;/.test(route) && /quoteLine\(ref\)/.test(route));
ok('presence carries one known word for "asking", or nothing', /c\?\.doing === 'asking' \? \{ doing: 'asking' as const \} : \{\}/.test(read('lib/share/collab.ts')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
