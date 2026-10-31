// The launch UX pass (docs/LOGOS-5-RUNTIME.md section 28): what a person met
// that got in their way, each held here so it does not come back.
//
//   the sign-up card covered the box; Voice covered the length dial on a phone;
//   the Logic Map tab gave way to Artifacts 700ms after it was chosen; the end
//   of the conversation slid under the dock; "↓ Latest" sat on the dock;
//   "Failed to fetch" and "Internal error" were shown as they came; a failed
//   first message left its title behind; out of messages, the guest wall's
//   "Keep going" reopened it; the phone header squeezed the title to "Sh…";
//   undo and View sat on top of "All"; a phone chart's words were 5px tall.
//
// The words a failure says are tested as a function; the rest is read from the
// source, as the suites beside this one do, and was checked in a browser
// (.journeys/uxfix) at 1440px and at 430, 414, 390, 375 and 360px.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendFailure, isNetworkFailure } from './.tmp/upstream-error.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, x)));

console.log('\nwhat a failed message says');
const e = (message, name = 'TypeError') => Object.assign(new Error(message), { name });
ok(
  'offline, said as offline, and the message is safe',
  sendFailure(e('Failed to fetch'), { online: false }) === 'You look offline. Your message is back in the box — send it again once you’re connected.'
);
for (const m of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'fetch failed']) {
  ok(`"${m}" is a request that never arrived`, isNetworkFailure(e(m)) && /^Socria couldn’t be reached\./.test(sendFailure(e(m), { online: true })));
}
ok('a bare "Internal error" becomes plain words', sendFailure(e('Internal error', 'Error')) === 'Socria couldn’t answer just now. Your message is back in the box — try sending it again.');
ok('so does "Something went wrong."', /^Socria couldn’t answer just now\./.test(sendFailure(e('Something went wrong.', 'Error'))));
ok('so does nothing at all', /^Socria couldn’t answer just now\./.test(sendFailure(null)));
ok(
  'a real sentence from the server is kept, with its reference',
  sendFailure(e('The model is not available to this account. (ref ab12cd)', 'Error')) ===
    'The model is not available to this account. (ref ab12cd) Your message is back in the box — try sending it again.'
);
ok('a sentence without a full stop gets one', sendFailure(e('That file is too large', 'Error')).startsWith('That file is too large. '));
ok('in a group, nothing is said to be back in the box', !/back in the box/.test(sendFailure(e('Internal error', 'Error'), { kept: false })));
ok('an ordinary error is not taken for a network failure', !isNetworkFailure(e('Something else', 'Error')));

console.log('\nthe app');
const app = read('components/LogosApp.tsx');
ok(
  'a failed send says it plainly and can be sent again from the error',
  /setError\(sendFailure\(e, \{ online \}\)\);\s*setRetryable\(true\);/.test(app) && /className="l5-error-retry"/.test(app) && /Try again/.test(app)
);
ok('an automatic title follows its messages; a given one is kept', /const auto = current\.title === UNTITLED \|\| current\.title === titleFor\(current\.messages\);/.test(app));
ok(
  'a view chosen by hand is not taken away by something made',
  /const choseSinceSent = \(\) => handChoseRef\.current > sentAtRef\.current;/.test(app) &&
    (app.match(/if \(!choseSinceSent\(\)\) setScreen\(\(s\) => onMade\(true, s, narrowRef\.current\)\);/g) || []).length === 2
);
ok(
  '  the tabs say when they were chosen; a send says when it went',
  /onChange=\{\(t\) => \{\s*handChoseRef\.current = Date\.now\(\);\s*setStudyTab\(t\);/.test(app) && /sentAtRef\.current = Date\.now\(\);/.test(app)
);
ok(
  '  and Artifacts gets its "new" dot instead',
  (app.match(/else if \(screenRef\.current\.view !== 'artifacts' && screenRef\.current\.beside !== 'artifacts'\) setArtFresh\(true\);/g) || []).length === 2
);
ok('the end stays in view: the dock and the thread are both watched', /<div className="l5-dock" ref=\{pinRef\}>/.test(app) && /<div className="l5-thread-in" ref=\{pinRef\}>/.test(app));
ok('  "↓ Latest" is placed from the dock’s measured height', /setProperty\('--l5-dock-h'/.test(app));
ok('  only scrolling up leaves the end', /if \(!atEnd && atEndRef\.current && t\.scrollTop >= wasTop - 1\)/.test(app));
ok(
  'on a phone, a new line of thinking and search are in ⋯, so the title has room',
  /onSearch=\{phone \? undefined :/.test(app) && /onNew=\{phone \? undefined :/.test(app) && /label: 'Search everything'/.test(app)
);
ok('  and the guest meter is said in words', /className="l5-guestmeter-s"/.test(app));
ok('big-screen mode is not offered on a phone', /\.\.\.\(!phone \|\| cabin/.test(app));
ok('the first map, out of view, is pointed to rather than offered as a picture', /FIRST_MAP_NOTE_ELSEWHERE/.test(app) && /See your Logic Map/.test(app));

console.log('\nthe parts');
const voice = read('components/logos5/SocriaVoice.tsx');
const vcss = read('components/logos5/voice.css');
ok('Voice is a wave, not a second microphone beside Hold to talk', /<Wave \/>\s*<span className="sv-btn-l">Voice<\/span>/.test(voice));
ok(
  '  on a phone it is an icon, 44px, its words kept for the screen reader',
  /\.l5-ctools \.sv-btn \{\s*width: 44px;/.test(vcss) && /\.l5-ctools \.sv-btn \.sv-btn-l \{\s*position: absolute;/.test(vcss)
);
ok('  "Experimental" is said quietly', /\.sv-exp \{[^}]*color: var\(--lg-ink-60\);/.test(vcss) && !/\.sv-exp \{[^}]*dashed/.test(vcss));
const l5v = read('components/logos5/l5v.css');
ok(
  'a phone’s width goes to the box, not to padding round it',
  /@media \(max-width: 560px\) \{\s*\.logos-root \.l5 \.l5-dock \{\s*padding: 6px 10px/.test(l5v) && /\.logos-root \.l5 \.l5-dock \.lg-composer \{\s*padding-left: 0;/.test(l5v)
);
ok('  the way back is a 44px target', /\.l5v-home \{\s*flex: none;\s*width: 44px;/.test(l5v));
const l5 = read('components/logos5/l5.css');
ok('  Make and the length dial are 44px tall', /\.l5-ctools \.mp-btn \{\s*height: 44px;/.test(l5));
const uni = read('components/logos5/universe.css');
ok(
  'undo and View sit beside the lenses on a phone, not on top of them',
  /\.l5h\.is-narrow \.l5h-tools \{\s*position: static;/.test(uni) && /\.l5h\.is-narrow \.l5h-right \{\s*flex-direction: row;/.test(uni)
);
const parts = read('components/logos5/UniverseParts.tsx');
ok('the start box’s count is words, and not shown at none', /found\.length > 0 && \(/.test(parts) && /\{found\.length\} found/.test(parts));
const plot = read('components/display/PlotFrame.tsx');
ok('a chart is drawn at the width it is shown at, so its words keep their size', /new ResizeObserver/.test(plot) && /viewBox=\{`0 0 \$\{W\} \$\{H\}`\}/.test(plot));
const wall = read('components/logos5/GuestWall.tsx');
ok('the guest card is lifted clear of the box, measured', /function useComposerLift/.test(wall));
const intro = read('components/onboarding/FirstRunIntro.tsx');
ok('a guest is not told to look in an account they do not have', /\{signedIn \? ' Change it any time in Manage Account\.' : ''\}/.test(intro));
const css = read('app/globals.css');
ok('secondary words are dark enough to read (4.8:1 on the paper)', /--lg-ink-60: rgba\(var\(--lg-ink-rgb, 35, 36, 31\), 0\.66\);/.test(css));

console.log(`\nux-polish: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
