// Logos 3: notes on the work live in the conversation, not across the map;
// and the chats bar and header can be put away from the top right.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const app = readFileSync(new URL('../components/LogosApp.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/logos5/L5Views.tsx', import.meta.url), 'utf8');

console.log('=== notes on the work, in the conversation ===');
ok('one set of notes, for Logos 3 only', /const chatNotes =\s*workspaceOn && !busy && !mapping && \(buildNote \|\| found \|\| firstMapNote\)/.test(app));
ok('  what the engine built, the cue, the save nudge', /lg-annot-k">The model</.test(app) && /\{found\.kicker\}/.test(app) && /\{FIRST_MAP_NOTE\}/.test(app));
ok('  in the thread, under the latest reply and before a streaming one', /\{chatNotes\}[\s\S]{0,240}\{streaming && <L5Pending/.test(app));
// The folded conversation's peek, which carried them too, was archived with the Logos 4 dock: Logos 5 keeps them in the thread.
ok('the map panel no longer carries them in Logos 3', /buildNote && !mapping && !workspaceOn/.test(app) && /found && !buildNote && !mapping && !workspaceOn/.test(app) && /firstMapNote && !workspaceOn/.test(app));
ok('  each can still be put away', (app.match(/className="lg-annot-x"/g) ?? []).length === 3);

console.log('=== the chats bar and header, put away ===');
// Logos 5: the Logos 4 header's own button is gone with that header; the top bar's More menu carries "Hide the bars"
ok('a control in the header hides both', /\{ label: 'Hide the bars', sep: true, onSelect: \(\) => hideChrome\(true\) \}/.test(app) && /const moreEl = \(\s*<L5Menu\s+label="More"\s+items=\{l5Menu\}/.test(app) && /menu=\{moreEl\}/.test(app));
ok('  at the right, beside the account control', /<div className="l5v-top-r">\s*\{split\}\s*\{presence\}\s*\{menu\}\s*\{account\}\s*<\/div>/.test(shell) && /account=\{accountEl\}/.test(app));
ok('  the rail closes with it', /const listOpen = l5Manage && railOpen && !chromeHidden;/.test(app) && /\$\{listOpen \? ' list-open' : ' rail-closed'\}/.test(app) && /open=\{railOpen && !chromeHidden\}/.test(app));
ok('  the header goes, in Logos 2 and in Logos 3', /\.lg-split\.chrome-hidden \.lg-head,\s*\n\.logos-root \.lg-split\.chrome-hidden \.ws-top \{ display: none; \}/.test(css));
ok('  one button in the corner brings them back', /chromeHidden && \(\s*<button[\s\S]{0,60}className="lg-chrome-show"[\s\S]{0,60}onClick=\{\(\) => hideChrome\(false\)\}/.test(app) && /\.lg-chrome-show \{\s*\n\s*position: fixed; top: 10px; right: 12px;/.test(css));
ok('  remembered per browser, and a storage failure changes nothing', /localStorage\.getItem\(CHROME_KEY\) === 'hidden'/.test(app) && /const CHROME_KEY = 'socria\.logos\.chrome\.v1'/.test(app));
ok('  never a scrim over nothing', /railOpen && !chromeHidden && \(\s*<div className="lg-mscrim"/.test(app));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
