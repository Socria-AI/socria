// test/transfer-explore.test.mjs — the UT Austin Fall 2026 transfer results
// (lib/transfer/explore.ts and the page at /transfer/ut-austin-fall-2026).
//
// The rows are what applicants reported, read out of the shared sheet's PDF;
// these checks hold the cleaned data to its own rules (one known decision per
// row, GPAs on the 4.0 scale or kept as written, majors named once) and the
// page's arithmetic to the rows.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as X from './.tmp/explore.mjs';
import * as K from './.tmp/campaign-under-test.mjs';
import * as SEO from './.tmp/seo.mjs';
import * as OG from './.tmp/og-cards.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? `\n      ${detail}` : ''}`);
  if (!cond) failed += 1;
};

const R = X.ROWS;

console.log('\n=== the rows ===');
ok('284 responses (285 in the sheet, one left out)', R.length === 284 && X.SOURCE.left_out === 1, String(R.length));
ok('ids are unique', new Set(R.map((r) => r.id)).size === R.length);
ok('the impossible response is not among them (GPA 6, 12,345 hours)', !R.some((r) => r.id === 111) && !R.some((r) => r.gpaRaw === '6'));
ok('every decision is one of four', R.every((r) => ['first', 'second', 'denied', 'unknown'].includes(r.decision)));
ok('only one decision was not said', R.filter((r) => r.decision === 'unknown').length === 1);
const o = X.outcome(R);
ok('outcomes add up', o.first + o.second + o.denied + o.unknown === o.n && o.known === o.n - 1, JSON.stringify(o));
ok('148 first-choice, 28 another major, 107 denied', o.first === 148 && o.second === 28 && o.denied === 107, JSON.stringify(o));
ok('74 applied through CAP', R.filter((r) => r.cap).length === 74, String(R.filter((r) => r.cap).length));
ok('every date is a real day in May–July 2026', R.every((r) => /^2026-0[5-7]-\d\d$/.test(r.date) && !Number.isNaN(Date.parse(r.date))));
ok('every GPA is on the 4.0 scale, or null with what they wrote kept', R.every((r) => (r.gpa != null ? r.gpa > 0 && r.gpa <= 4 : !r.gpaRaw || r.gpaRaw.length > 0)));
ok('a weighted GPA is kept as written and left off the scale', R.some((r) => r.gpa == null && r.gpaRaw === '4.4W'));
ok('hours are whole numbers or null', R.every((r) => r.hours == null || (Number.isInteger(r.hours) && r.hours >= 0 && r.hours < 200)));
ok('"Applied with 62, 54 accepted" counts as 62 hours, with the words kept', R.some((r) => r.hours === 62 && r.hoursRaw === 'Applied with 62, 54 accepted'));
ok('residency is one of three or not said', R.every((r) => r.residency == null || ['In-state', 'Out-of-state', 'International'].includes(r.residency)));
ok('"n/a" and the like count as nothing given', !R.some((r) => /^(n\/?a|none|na|\.)$/i.test(r.extra)));

console.log('\n=== majors, named once ===');
const majors = new Set(R.map((r) => r.major));
for (const bad of ['Gov', 'Governemnt', 'ECE', 'Econ', 'Psych', 'BSDS', 'HDFS', 'Civil Emgineering', 'Speech Language HearingDenied', 'Unspecified - MIS intendedAdmitted']) {
  ok(`no "${bad}"`, !majors.has(bad));
}
ok('Government, Economics and Electrical & Computer Engineering are each one major', ['Government', 'Economics', 'Electrical & Computer Engineering'].every((m) => majors.has(m)));
ok('a matched major keeps how it was written', R.some((r) => r.major === 'Government' && r.majorRaw && r.majorRaw !== 'Government'));
ok('no major carries a decision word stuck to it', R.every((r) => !/(Admitted|Denied)$/.test(r.major) && !/(Admitted|Denied)$/.test(r.majorRaw ?? '')));
ok('the two-choice row is McCombs Marketing, with the second choice noted', R.some((r) => r.college === 'McCombs Business' && r.major === 'Marketing' && /Advertising/.test(r.majorRaw ?? '')));
ok('every college is one of UT’s', R.every((r) => ['Liberal Arts', 'Cockrell Engineering', 'Natural Sciences', 'Moody Communication', 'McCombs Business', 'Education', 'Fine Arts', 'Nursing', 'Jackson Geosciences', 'Information', 'Architecture'].includes(r.college)));

console.log('\n=== filters ===');
const cap = X.filterRows(R, { ...X.NO_FILTERS, applicant: 'cap' });
ok('CAP only', cap.length === 74 && cap.every((r) => r.cap));
ok('external only', X.filterRows(R, { ...X.NO_FILTERS, applicant: 'external' }).length === 210);
const la = X.filterRows(R, { ...X.NO_FILTERS, college: 'Liberal Arts' });
ok('a college', la.length > 100 && la.every((r) => r.college === 'Liberal Arts'));
const hi = X.filterRows(R, { ...X.NO_FILTERS, gpa: '3.9' });
ok('a GPA band includes its floor and leaves out unknowns', hi.every((r) => r.gpa != null && r.gpa >= 3.9) && hi.some((r) => r.gpa === 3.9));
const mid = X.filterRows(R, { ...X.NO_FILTERS, gpa: '3.7' });
ok('a band stops short of the next one', mid.every((r) => r.gpa >= 3.7 && r.gpa < 3.9));
ok('bands do not overlap and cover every GPA', X.GPA_BANDS.reduce((n, b) => n + X.filterRows(R, { ...X.NO_FILTERS, gpa: b.key }).length, 0) === R.filter((r) => r.gpa != null).length);
ok('hour bands cover every number of hours', X.HOURS_BANDS.reduce((n, b) => n + X.filterRows(R, { ...X.NO_FILTERS, hours: b.key }).length, 0) === R.filter((r) => r.hours != null).length);
ok('filters combine', X.filterRows(R, { ...X.NO_FILTERS, applicant: 'cap', college: 'Liberal Arts', gpa: '3.9' }).every((r) => r.cap && r.college === 'Liberal Arts' && r.gpa >= 3.9));
ok('active count', X.activeCount(X.NO_FILTERS) === 0 && X.activeCount({ ...X.NO_FILTERS, applicant: 'cap', major: 'Economics' }) === 2);

console.log('\n=== the address ===');
const f = { ...X.NO_FILTERS, applicant: 'cap', college: 'Liberal Arts', major: 'Economics', gpa: '3.7', hours: '30' };
ok('no filters, no query', X.toQuery(X.NO_FILTERS) === '');
ok('filters round-trip through the address', JSON.stringify(X.fromQuery(X.toQuery(f))) === JSON.stringify(f), X.toQuery(f));
ok('names with spaces and ampersands survive', X.fromQuery(X.toQuery({ ...X.NO_FILTERS, major: 'Electrical & Computer Engineering' })).major === 'Electrical & Computer Engineering');
const junk = X.fromQuery('?who=admin&college=Hogwarts&major=<script>&gpa=9&hours=-1&residency=Mars');
ok('anything that names nothing in the data is dropped', JSON.stringify(junk) === JSON.stringify(X.NO_FILTERS), JSON.stringify(junk));

console.log('\n=== what the page says ===');
ok('percentages are of known decisions', X.pct(o.first, o) === Math.round((148 / 283) * 100));
ok('median of an even list', X.median([1, 2, 3, 4]) === 2.5 && X.median([3]) === 3 && X.median([]) === null);
const med = X.medians(R);
ok('admitted applicants reported a higher median GPA than those denied', med.gpa.admitted > med.gpa.denied, JSON.stringify(med));
const groups = X.byGroup(R, 'college');
ok('colleges, the largest first, adding up to every row', groups[0].name === 'Liberal Arts' && groups.reduce((n, g) => n + g.n, 0) === R.length);
const days = X.byDay(R);
ok('one entry per day from the first decision to the last', days[0].date === '2026-05-15' && days[days.length - 1].date === '2026-07-02' && days.length === 49, `${days[0]?.date} … ${days.at(-1)?.date} (${days.length})`);
ok('days add up to every row', days.reduce((n, d) => n + d.n, 0) === R.length);
ok('day label', X.dayLabel('2026-05-15') === '15 May' && X.dayLabel('2026-07-02', true) === '2 Jul');
const h1 = X.headline(X.NO_FILTERS, o);
ok('the headline for everyone', /^284 applicants reported their decisions\.$/.test(h1.lead) && /^62% were admitted: 52% to their first-choice major, 10% to another major\.$/.test(h1.result), `${h1.lead} ${h1.result}`);
const capLa = { ...X.NO_FILTERS, applicant: 'cap', college: 'Liberal Arts', gpa: '3.9' };
const h2 = X.headline(capLa, X.outcome(X.filterRows(R, capLa)));
ok('the headline names who the filters describe', /CAP applicants to Liberal Arts with a GPA of 3\.90 or above/.test(h2.lead), h2.lead);
ok('a lone response reads as one', /^One /.test(X.headline({ ...X.NO_FILTERS, major: 'Marketing' }, X.outcome(X.filterRows(R, { ...X.NO_FILTERS, major: 'Marketing' }))).lead));
ok('too few to read into says so', /Too few/.test(X.headline({ ...X.NO_FILTERS, major: 'Marketing' }, X.outcome(X.filterRows(R, { ...X.NO_FILTERS, major: 'Marketing' }))).result));
ok('nothing matching says so', /^No /.test(X.headline({ ...X.NO_FILTERS, major: 'Marketing', applicant: 'cap' }, X.outcome([])).lead));
ok('who, with hours and residency', X.whoPhrase({ ...X.NO_FILTERS, residency: 'International', hours: '60' }) === 'international applicants with 60 or more credit hours');

console.log('\n=== what people said mattered ===');
ok('themes by keyword', X.themesOf('VP of DECA: Marketing Published Mental Health Research').includes('Research') && X.themesOf('VP of DECA').includes('Leadership'));
ok('letters of recommendation', X.themesOf('strong letters of rec, 5 years relevant work history').join() === 'Work and internships,Letters and essays');
ok('nothing for nothing', X.themesOf('').length === 0 && X.themesOf('Luck and aura').length === 0);
const t = X.themeShares(R);
ok('shares are of those who answered', t.answered.admitted > 100 && t.answered.denied > 50 && t.themes.every((x) => x.admittedPct >= 0 && x.admittedPct <= 100));
ok('every theme is counted', t.themes.length === X.THEMES.length);

console.log('\n=== the table ===');
const byGpa = X.sortRows(R, 'gpa', 'desc');
ok('sorted by GPA, unknowns last', byGpa[0].gpa === 4 && byGpa[byGpa.length - 1].gpa == null);
ok('ascending keeps unknowns last too', X.sortRows(R, 'gpa', 'asc').at(-1).gpa == null && X.sortRows(R, 'gpa', 'asc')[0].gpa != null);
ok('by decision: first choice first', X.sortRows(R, 'decision', 'asc')[0].decision === 'first');
ok('search needs every word', X.search(R, 'research engineering').every((r) => /research/i.test(r.extra) && /engineering/i.test(`${r.college} ${r.major}`)));
ok('search finds CAP', X.search(R, 'cap').length >= 74);
ok('an empty search is everything', X.search(R, '  ').length === R.length);

console.log('\n=== open to everyone ===');
ok('the relaunch never hides it', K.decide('/transfer/ut-austin-fall-2026', false).do === 'next' && K.decide('/transfer', false).do === 'next');
ok('…but /transferable is not under it', K.decide('/transferable', false).do !== 'next');
ok('it is in the sitemap’s list', SEO.PUBLIC_PAGES.some((p) => p.path === '/transfer/ut-austin-fall-2026'));
ok('its link card says what it is, from a fixed list', OG.ogCardFor(['transfer'], { now: 0, docs: [] }).title === 'Who got in, and with what.');
const page = readFileSync(join(root, 'app/transfer/ut-austin-fall-2026/page.tsx'), 'utf8');
ok('the page names itself through pageMetadata', /pageMetadata\(/.test(page) && /og: 'transfer'/.test(page));
const ui = readFileSync(join(root, 'app/transfer/ut-austin-fall-2026/TransferExplorer.tsx'), 'utf8');
ok('the page says where the data came from and that it is self-reported', /About this data/.test(ui) && /filled in themselves/.test(ui) && /not part of UT Austin/.test(ui));
ok('every decision colour is also said in words (a key)', /<Key /.test(ui) && /DECISION_LABEL\[/.test(ui));
const css = readFileSync(join(root, 'app/transfer/transfer.css'), 'utf8');
ok('a dark version of every decision colour', (css.match(/--xf-first:/g) ?? []).length === 3 && (css.match(/--xf-denied:/g) ?? []).length === 3);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
