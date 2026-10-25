// The sidebar's foot, in the Logos rail — the one rail since the Core chat was
// archived on 24 October 2026. (The Core rail's foot also carried Socria
// One's card and Import your history; both went with it.)
//
// Two rows and nothing else: Memory (/memory, the Mind Graph) and Send
// feedback (the form, in a new tab — it is under Manage Account too). No sync
// tagline and no sign-in line.

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
const clutter = /s-vow|s-feedback|Synced across|Kept in this browser|Nothing here is sent|Sign in to sync|from other AIs|className="(?:yes|no)"/;
/** The feedback row: the one form, in a new tab, never the opener's window. */
const feedbackRow = (foot) => /<a\s+href=\{FEEDBACK_URL\}\s+target="_blank"\s+rel="noopener noreferrer"\s+className="s-link"/.test(foot);

// The Core rail's foot (Socria One's card, Import your history, Memory, Send feedback) was archived with the Core chat.

console.log('=== the Logos rail ===');
{
  const src = read('components/LogosRail.tsx');
  const foot = footOf(src);
  ok('the foot is found', foot.length > 0);
  ok('Memory, then Send feedback: importing feeds Core, not Logos', JSON.stringify(rows(foot)) === '["Memory","Send feedback"]', JSON.stringify(rows(foot)));
  ok('feedback opens the one form, in a new tab', feedbackRow(foot) && /import \{ FEEDBACK_URL \} from '@\/lib\/feedback'/.test(src));
  ok('Memory goes to /memory', /<Link href="\/memory" className="s-link"/.test(foot));
  ok('no tagline', !clutter.test(shown(foot)), (shown(foot).match(clutter) ?? [])[0]);
  ok('nor the prop that only the tagline read', !/\bcloud\b/.test(src));
}

console.log('\n=== feedback, under Manage Account ===');
{
  const sheet = read('components/account/AccountSheet.tsx');
  ok('the account sheet links to the feedback form', /import \{ FEEDBACK_URL \} from '@\/lib\/feedback'/.test(sheet) && /<a className="act" href=\{FEEDBACK_URL\} target="_blank" rel="noopener noreferrer"/.test(sheet));
  ok('in a section of its own', /<span className="lbl">Feedback<\/span>/.test(sheet));
  // One rail now: the Core rail's foot went with the Core chat.
  ok('and in the rail\'s foot, the same constant', /href=\{FEEDBACK_URL\}/.test(footOf(read('components/LogosRail.tsx'))));
}

console.log('\n=== signing out, from the account page ===');
{
  const settings = read('components/account/AccountSettings.tsx');
  const panel = read('components/account/SignOutPanel.tsx');
  ok('the account page ends with Sign out', /<DevicesPanel \/>\s*<SignOutPanel \/>/.test(settings));
  ok('it clears this browser\'s Socria data before signing out', /clearSocriaLocalData\(\);\s*void signOut\(\{ redirectUrl: '\/' \}\)/.test(panel));
}

console.log('\n=== joining with a code: the popup ===');
{
  const page = read('app/chat/page.tsx');
  const dialog = read('components/share/ShareDialog.tsx');
  // The Core rail's "Join with a code" button, its mount of this popup and what waited on it (anythingOpen) were archived with the Core chat; nothing else mounts the popup.
  ok('the popup asks for the code, focused, and closes on Escape', /export function JoinCodeDialog/.test(dialog) && /<JoinWithCode onDone=\{onClose\} autoFocus \/>/.test(dialog) && /e\.key === 'Escape'/.test(dialog) && /aria-label="Join with a code"/.test(dialog));
  ok('Shared with you no longer carries the field', !/s-joincode|<JoinWithCode \/>/.test(page));
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
