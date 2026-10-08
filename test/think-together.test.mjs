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
ok('the active shared session pushes its turns and map, never a whole-row save', /if \(t\?\.active && s\.id === activeIdRef\.current\) \{\s*void t\.push\(\{ messages: s\.messages, map: s\.map \}\);\s*t\.keepOwn\(s\.draft, s\.contexts\);\s*return;/.test(app));
ok('someone else\'s session is never saved as one\'s own', /if \(foreignIdsRef\.current\.has\(s\.id\)\) return;/.test(app));
ok('it is opened from a share link through the share gate', /sharedLink = q\.get\('shared'\) === '1'/.test(app) && /\/api\/shared\/conversation\/\$\{encodeURIComponent\(wanted\)\}/.test(app) && /foreignIdsRef\.current\.add\(c\.id\)/.test(app));
ok('a newer version from someone else is put on screen without saving it back', /onRemote: \(r\) => \{[\s\S]{0,300}patchSession\([\s\S]{0,300}false\s*\);/.test(app));
ok('the map — its nodes, models, objects and plots — is what syncs', /map: \(r\.map as LogosSession\['map'\]\) \?\? cur\.map/.test(app));
ok('on any Logos surface, signed in, outside a code-joined room — a shared session is never saved whole', /enabled: !!isSignedIn && !room\.active,/.test(app));

console.log('=== the sync itself ===');
ok('turns and the map go out through one serialised queue', /const next = queue\.current\.then\(run, run\);/.test(hook));
ok('a stale map is answered with the current one, which is adopted', /res\.status === 409 && j\?\.conflict/.test(hook) && /optsRef\.current\.onRemote\(remote\)/.test(hook));
ok('a refused write (a viewer) stops retrying', /res\.status === 403[\s\S]{0,200}blocked\.current = true/.test(hook));
ok('a poll only replaces the screen when nothing is pending and nothing is streaming', /mayAdopt\(seen\.current, remote\.updatedAt, local, optsRef\.current\.busy\)/.test(hook));
ok('presence leaves when the session closes', /leave: true/.test(hook));
ok('the owner\'s draft goes through the same queue, and its version is recorded', /seen\.current = \{ \.\.\.seen\.current, version: Number\(j\.updatedAt\) \}/.test(hook));

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
