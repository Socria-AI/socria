// The sidebar's foot, in the Core rail and the Logos rail.
//
// Socria One's card, then two rows and nothing else: Import your history (the
// existing import) and Memory (/memory, the Mind Graph). No sync tagline, no
// second sign-in line, no feedback link: signing in is offered at the top of
// the rail and in the header, and feedback lives under Manage Account.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

/** The JSX of `<div className="s-foot">` up to the element that closes it. */
function footOf(src) {
  const at = src.indexOf('<div className="s-foot">');
  if (at < 0) return '';
  let depth = 0;
  const tag = /<(\/?)div\b[^>]*?(\/?)>/g;
  tag.lastIndex = at;
  for (let m; (m = tag.exec(src)); ) {
    if (m[2] === '/') continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return src.slice(at, m.index + m[0].length);
  }
  return '';
}
const rows = (foot) => [...foot.matchAll(/className="s-link"[\s\S]*?<span>([^<]+)<\/span>/g)].map((m) => m[1].trim());
/** What a person can see: no comments, no hover titles. */
const shown = (foot) => foot.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\stitle="[^"]*"/g, '');
const clutter = /s-vow|s-feedback|FEEDBACK_URL|Send feedback|Synced across|Kept in this browser|Nothing here is sent|Sign in to sync|from other AIs|className="(?:yes|no)"/;

console.log('=== the Core rail ===');
{
  const foot = footOf(read('app/chat/page.tsx'));
  ok('the foot is found', foot.length > 0);
  ok('Socria One\'s card stays, when the plan is known', /planState\.known && <OneFoot state=\{planState\} \/>/.test(foot));
  ok('two rows: Import your history, then Memory', JSON.stringify(rows(foot)) === '["Import your history","Memory"]', JSON.stringify(rows(foot)));
  ok('Import opens the existing import', /setImportOpen\(true\)/.test(foot));
  ok('Memory goes to /memory', /<Link href="\/memory" className="s-link"/.test(foot));
  ok('imported history in use is a dot, not a sentence', /importedProfile && \(\s*<span className="s-link-on">/.test(foot));
  ok('no tagline, no sign-in line, no feedback link, no second line of description', !clutter.test(shown(foot)), (shown(foot).match(clutter) ?? [])[0]);
}

console.log('\n=== the Logos rail ===');
{
  const src = read('components/LogosRail.tsx');
  const foot = footOf(src);
  ok('the foot is found', foot.length > 0);
  ok('Memory alone: importing feeds Core, not Logos', JSON.stringify(rows(foot)) === '["Memory"]', JSON.stringify(rows(foot)));
  ok('Memory goes to /memory', /<Link href="\/memory" className="s-link"/.test(foot));
  ok('no tagline and no feedback link', !clutter.test(shown(foot)), (shown(foot).match(clutter) ?? [])[0]);
  ok('nor the prop that only the tagline read', !/\bcloud\b/.test(src));
}

console.log('\n=== feedback, under Manage Account ===');
{
  const sheet = read('components/account/AccountSheet.tsx');
  ok('the account sheet links to the feedback form', /import \{ FEEDBACK_URL \} from '@\/lib\/feedback'/.test(sheet) && /<a className="act" href=\{FEEDBACK_URL\} target="_blank" rel="noopener noreferrer"/.test(sheet));
  ok('in a section of its own', /<span className="lbl">Feedback<\/span>/.test(sheet));
  ok('and nowhere in either rail', !/FEEDBACK_URL/.test(read('app/chat/page.tsx')) && !/FEEDBACK_URL/.test(read('components/LogosRail.tsx')));
}

console.log('\n=== the style ===');
{
  const css = read('app/app-shell.css');
  ok('the rows are the rail\'s row, a size quieter', /\.app-root \.s-link\{[^}]*padding:6px 9px;border-radius:7px/.test(css));
  ok('their icons are muted until hovered', /\.app-root \.s-link svg\{[^}]*color:var\(--ink-45\)/.test(css) && /\.app-root \.s-link:hover svg\{color:var\(--moss-700\)\}/.test(css));
  ok('the old tagline and feedback styles are gone', !/\.app-root \.s-vow\{/.test(css) && !/\.app-root \.s-feedback\{/.test(css));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
