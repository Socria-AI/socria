// Think Together, wired: the shared line of thinking in Logos, the shared
// Project's people and activity, and the Mind graph's Share. Source-level
// checks of the seams; the behaviour behind them is in share-e2e (routes) and
// share-sync (the sync decisions).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const app = read('components/LogosApp.tsx');
const hook = read('components/share/useSharedSession.ts');

console.log('=== a shared Logos session is written through the share routes ===');
ok('the active shared session pushes its turns and map, never a whole-row save', /if \(t\?\.active && s\.id === activeIdRef\.current\) \{[\s\S]{0,120}void t\.push\(\);\s*t\.keepOwn\(s\.draft, s\.contexts\);\s*return;/.test(app));
ok('someone else\'s session is never saved as one\'s own', /if \(foreignIdsRef\.current\.has\(s\.id\)\) return;/.test(app));
ok('it is opened from a share link through the share gate', /sharedLink = q\.get\('shared'\) === '1'/.test(app) && /\/api\/shared\/conversation\/\$\{encodeURIComponent\(wanted\)\}/.test(app) && /foreignIdsRef\.current\.add\(c\.id\)/.test(app));
ok('what the server holds is put on screen for the session it was read for, without saving it back', /onRemote: \(id, r\) => \{\s*patchSession\(\s*id,[\s\S]{0,300}false\s*\);/.test(app));
ok('the map — its nodes, models, objects and plots — is what syncs, when the server\'s is taken', /map: r\.map !== undefined \? \(\(r\.map as LogosSession\['map'\]\) \?\? cur\.map\) : cur\.map/.test(app));
ok('on any Logos surface, signed in, outside a code-joined room — a shared session is never saved whole', /enabled: !!isSignedIn && !room\.active,/.test(app));

console.log('=== the sync itself ===');
ok('turns and the map go out through one serialised queue', /const next = queue\.current\.then\(run, run\);/.test(hook));
ok('a stale map is answered with the current one, which is MERGED with this screen\'s — the turns sent with it went in anyway', /const conflict = res\.status === 409 && !!j\?\.conflict;/.test(hook) && /take\(id, \{ messages: j\.messages, map: j\.map \?\? null, title: '', updatedAt: Number\(j\.updatedAt\) \|\| 0 \}, \{ conflict, sent \}\)/.test(hook));
ok('  and a map that went in moves the version on the server\'s answer, not on its bytes', /const sent = o\.map !== undefined && !conflict && j\?\.accepted\?\.map !== false \? o\.map : undefined;/.test(hook) && !/mapKey\(o\.map\)/.test(hook));
ok('a refused write (a viewer) stops retrying', /res\.status === 403[\s\S]{0,200}blocked\.current = true/.test(hook));
ok('  and from then on follows the shared map, as a viewer\'s role does from the start', /res\.status === 403[\s\S]{0,300}readOnly\.current = true/.test(hook) && /readOnly\.current = blocked\.current \|\| \(typeof j\.role === 'string' && !can\(j\.role as Role, 'edit'\)\)/.test(hook));
ok('every row the server sends is joined with the screen, never laid over it', /const r = absorb\(base, remote, local \?\? \{ messages: \[\], map: null \}, \{ busy: optsRef\.current\.busy, conflict: how\.conflict, sent: how\.sent, readOnly: readOnly\.current \}\);/.test(hook) && /optsRef\.current\.onRemote\(id, \{\s*messages: r\.messages,/.test(hook));
ok('  and the map put on screen is the one absorb decided — the merge, after a refusal', /\.\.\.\(r\.takeMap \? \{ map: r\.map \} : \{\}\)/.test(hook) && /\.\.\.\(r\.lost\?\.length \? \{ lost: r\.lost \} : \{\}\)/.test(hook));
const route = read('app/api/shared/conversation/[id]/route.ts');
ok('the route says what of a write went in', /accepted: \{ map: patch\.map !== undefined, turns: fresh\.length \}/.test(route));
ok('presence leaves when the session closes', /leave: true/.test(hook));
ok('the owner\'s draft goes through the same queue, and the row it answers with is taken in like any other', (() => { const k = hook.slice(hook.indexOf('const keepOwn'), hook.indexOf('const recheck')); return /queue\.current\.then\(run, run\)/.test(k) && /take\(id, \{ messages: j\.messages/.test(k); })());

console.log('=== roles, in the interface as on the server ===');
ok('a viewer or commenter cannot send', /togetherRef\.current\?\.active && togetherRef\.current\.role !== 'owner' && togetherRef\.current\.role !== 'editor'/.test(app));
ok('  and is told what they can do', /You can read and comment on this line of thinking\./.test(app));

console.log('=== presence and pointers ===');
ok('who is here sits beside Share', /tg-faces/.test(app) && /setShareOpen\(true\)/.test(app));
ok('pointers are reported over the map and drawn for everyone else', /useMapPointer\(together\.active, together\.point\)/.test(app) && /<RemoteCursors people=\{together\.people\} \/>/.test(app));
const rc = read('components/share/RemoteCursors.tsx');
ok('  in map coordinates, through each screen\'s own camera', /toWorld\(/.test(rc) && /toScreen\(/.test(rc) && /camFromTransform\(/.test(rc));
ok('a room joined by its old code keeps its bar; otherwise Share is the way in', /collab && room\.active \? \(\s*<CollabBar room=\{room\} \/>/.test(app));

console.log('=== a shared Project ===');
const home = read('components/projects/ProjectHome.tsx');
ok('people, presence and activity appear only once it is shared', /const shared = j\.role !== 'owner' \|\| \(j\.members\?\.length \?\? 0\) > 0 \|\| !!j\.link \|\| !!j\.code;\s*if \(!shared\) return;/.test(home) && /\{people && \(/.test(home));
ok('  and who is on its home now', /type: 'project', id \}/.test(home) && /ph-faces/.test(home));

console.log('=== the Mind graph\'s Share ===');
const mem = read('components/mind/MindGraphView.tsx');
const ms = read('components/share/MindShare.tsx');
ok('the Memory page has Share', /setSharing\(true\)/.test(mem) && /<MindShare open=\{sharing\}/.test(mem));
ok('  which never shares the memory itself — it offers a Project', /Your memory stays yours\./.test(ms) && /<ShareDialog type="project"/.test(ms) && !/type="conversation"/.test(ms));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
