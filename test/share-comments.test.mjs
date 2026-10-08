// Comments, arranged — the decisions behind the comments interface: which
// threads show first, how many open threads sit on each card, what counts as
// new, what an anchor points at. And the parts are wired where people are.
import { readFileSync } from 'node:fs';
import { threadsOf, filterThreads, openByAnchor, unseenCount, readAnchor, nodeAnchor, messageAnchor, excerpt, whenSaid } from './.tmp/comments.mjs';
import { hueOf } from './.tmp/hue.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const c = (id, o = {}) => ({ id, anchor: '', parentId: null, author: 'Ann', authorId: 'a1', mine: false, body: id, at: 0, edited: false, resolved: false, ...o });

console.log('=== threads ===');
{
  const list = [
    c('old', { at: 10, anchor: 'node:n1' }),
    c('done', { at: 50, resolved: true, anchor: 'node:n1' }),
    c('new', { at: 30, anchor: 'message:2' }),
    c('r1', { at: 40, parentId: 'old', anchor: 'node:n1' }),
    c('r0', { at: 20, parentId: 'old', anchor: 'node:n1' }),
    c('orphan', { at: 99, parentId: 'nowhere' }),
    c('ghost', { at: 5, deleted: true, body: '', author: '' }),
    c('ghost2', { at: 6, deleted: true, body: '', author: '' }),
    c('r2', { at: 7, parentId: 'ghost2' }),
  ];
  const t = threadsOf(list);
  ok('open threads first, then by the latest thing said in them', t.map((x) => x.root.id).join() === 'old,new,ghost2,done', t.map((x) => x.root.id).join());
  ok('a reply brings its thread forward', t[0].last === 40);
  ok('replies in the order they were said', t[0].replies.map((r) => r.id).join() === 'r0,r1');
  ok('a reply to nothing is dropped', !t.some((x) => x.replies.some((r) => r.id === 'orphan')) && !t.some((x) => x.root.id === 'orphan'));
  ok('a deleted comment with no replies is gone', !t.some((x) => x.root.id === 'ghost'));
  ok('a deleted comment with replies stays, for them to hang from', t.some((x) => x.root.id === 'ghost2' && x.replies.length === 1));
  ok('resolved is not open', t.find((x) => x.root.id === 'done')?.open === false);
  ok('filters: open, resolved, all', filterThreads(t, 'open').length === 3 && filterThreads(t, 'resolved').length === 1 && filterThreads(t, 'all').length === 4);

  const pins = openByAnchor(list);
  ok('a pin counts open threads on its card, not comments', pins['node:n1'] === 1, JSON.stringify(pins));
  ok('  and a turn gets its own count', pins['message:2'] === 1);
  ok('  a resolved thread puts no pin anywhere', !Object.keys(pins).some((k) => pins[k] === 0));
}

console.log('=== what is new ===');
{
  const list = [c('a', { at: 100 }), c('b', { at: 200, mine: true }), c('d', { at: 300, deleted: true }), c('e', { at: 50 })];
  ok('comments by other people since you looked', unseenCount(list, 60) === 1);
  ok('your own never count', unseenCount([c('x', { at: 9, mine: true })], 0) === 0);
  ok('nothing is new once you have looked', unseenCount(list, 1000) === 0);
}

console.log('=== anchors ===');
ok('a card', readAnchor(nodeAnchor('n-7')).kind === 'node' && readAnchor('node:n-7').ref === 'n-7');
ok('a turn', readAnchor(messageAnchor(3)).kind === 'message' && readAnchor('message:3').ref === '3');
ok('the Project', readAnchor('project').kind === 'project');
ok('the whole thing', readAnchor('').kind === 'general');
ok('a turn is named by its first words, without markup', excerpt('## The **real** question is whether sleep matters more than diet here') === 'The real question is whether sleep matters more…', excerpt('## The **real** question is whether sleep matters more than diet here'));
ok('  short turns whole', excerpt('Why?') === 'Why?' && excerpt('   ') === 'a turn');
ok('times read as people say them', whenSaid(0, 30_000) === 'just now' && whenSaid(0, 5 * 60_000) === '5m ago' && whenSaid(0, 3 * 3600_000) === '3h ago');
ok('a person keeps their colour', hueOf('abc') === hueOf('abc') && /^#[0-9A-Fa-f]{6}$/.test(hueOf('xyz')));

console.log('=== wired where people are ===');
{
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const logos = read('components/LogosApp.tsx');
  ok('a shared Logos map has a Comments button beside Share', /<CommentsButton[\s\S]{0,500}className="sh-open"/.test(logos));
  ok('  pins on the cards, opening that card\'s threads', /<CommentPins[\s\S]{0,200}setCommentsOn\(nodeAnchor\(id\)\)/.test(logos));
  ok('  the selected card is what a new comment is about', /target=\{[\s\S]{0,120}focus\?\.kind === 'node'/.test(logos));
  ok('  only in a shared session', /together\.active && commentsOpen && \(/.test(logos) && /together\.active && \(\s*<CommentPins/.test(logos));
  ok('  comments are read for the session open now', /useComments\('conversation', activeId, together\.active\)/.test(logos));
  const thread = read('components/share/SharedThread.tsx');
  ok('a shared conversation uses the same threads, with replies', /<CommentThread/.test(thread) && /<CommentsPanel/.test(thread) && !/st-cform/.test(thread));
  const home = read('components/projects/ProjectHome.tsx');
  ok('a shared Project has a Discussion', /title="Discussion"/.test(home) && /generalAnchor="project"/.test(home) && /useComments\('project', id, !!people\)/.test(home));
  const parts = read('components/share/comments/Comments.tsx');
  ok('the interface decides no permission: it asks the state the server sent', !/role ===/.test(parts.replace(/state\.role/g, '')) && /state\.mayComment/.test(parts));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
