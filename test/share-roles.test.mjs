// The permission table, held down. Every route asks these questions; if the
// answers drift, a viewer edits or a guest re-shares.
import { can, rank, stronger, cleanRole, cleanType, cleanEmail, normalizeCode, codeFrom, showCode, cleanToken, mayHost, landing, ROLES, GRANTABLE, FREE_GUEST_TURNS_PER_DAY } from './.tmp/roles.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== who may do what ===');
const table = {
  owner: ['read', 'comment', 'edit', 'ask', 'share', 'delete'],
  editor: ['read', 'comment', 'edit', 'ask'],
  commenter: ['read', 'comment'],
  viewer: ['read'],
};
for (const role of ROLES) {
  for (const action of ['read', 'comment', 'edit', 'ask', 'share', 'delete']) {
    ok(`${role} ${table[role].includes(action) ? 'may' : 'may not'} ${action}`, can(role, action) === table[role].includes(action));
  }
}
ok('nobody may do anything without a role', !can(null, 'read') && !can(undefined, 'read') && !can('admin', 'read'));
ok('ownership is never granted', !GRANTABLE.includes('owner') && cleanRole('owner') === null);
ok('the stronger of two roles wins, either way round', stronger('viewer', 'editor') === 'editor' && stronger('editor', 'viewer') === 'editor' && stronger(null, 'commenter') === 'commenter');
ok('roles are ordered', rank('viewer') < rank('commenter') && rank('commenter') < rank('editor') && rank('editor') < rank('owner'));
ok('only known resource types', cleanType('project') === 'project' && cleanType('conversation') === 'conversation' && cleanType('mind') === null);

console.log('=== plans ===');
ok('hosting is Socria One', mayHost('one') && !mayHost('free'));
ok('a free guest has a real but bounded say', FREE_GUEST_TURNS_PER_DAY > 0 && FREE_GUEST_TURNS_PER_DAY < 100);

console.log('=== addresses, codes, tokens ===');
ok('an email is trimmed and lowercased', cleanEmail('  Bob@Example.COM ') === 'bob@example.com');
for (const bad of ['', 'bob', 'bob@', '@x.com', 'a b@x.com', 'bob@x', '<a@x.com>', 'x'.repeat(250) + '@x.com', 7, null]) {
  ok(`not an email: ${JSON.stringify(bad).slice(0, 20)}`, cleanEmail(bad) === null);
}
const c = codeFrom([0, 1, 2, 3, 4, 5, 6, 7]);
ok('a code is eight readable characters', /^[A-HJ-NP-Z2-9]{8}$/.test(c), c);
ok('  read back in any case, with or without a dash', normalizeCode(showCode(c).toLowerCase()) === c && normalizeCode(c) === c);
ok('  never 0/O or 1/I/L', !/[01OIL]/.test(codeFrom(Array.from({ length: 8 }, (_, i) => i * 37))));
ok('  junk is not a code', normalizeCode('ABC') === null && normalizeCode('ABCDEFG0') === null && normalizeCode(12345678) === null);
ok('a token is url-safe and long', cleanToken('a'.repeat(32)) && !cleanToken('a'.repeat(31)) && !cleanToken('a'.repeat(30) + '/.') && !cleanToken(null));

console.log('=== where joining lands ===');
ok('a Project → its home', landing({ type: 'project', id: 'p1', kind: 'project' }) === '/chat?p=p1');
ok('a Logos session → Logos 3, opened shared', landing({ type: 'conversation', id: 'lg_1', kind: 'logos' }) === '/chat?model=logos-3&s=lg_1&shared=1');
ok('a chat → the shared thread', landing({ type: 'conversation', id: 'c1', kind: 'chat' }) === '/chat?shared=c1');
ok('ids are encoded', landing({ type: 'project', id: 'a&b', kind: 'project' }) === '/chat?p=a%26b');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
