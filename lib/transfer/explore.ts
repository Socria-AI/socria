// lib/transfer/explore.ts — THE UT AUSTIN FALL 2026 TRANSFER RESULTS, ASKED.
//
// The page at /transfer/ut-austin-fall-2026 shows what transfer applicants
// reported about their own decisions: college, major, outcome, GPA, hours,
// residency, whether they came through CAP, and the one thing they think
// mattered most. Everything the page says is worked out here, from the rows
// in ut-austin-fall-2026.json, so it can be tested without a browser.
//
// WHERE THE ROWS CAME FROM. A shared form (the "Fall 2026 UT Austin External
// Transfer Forum Responses" sheet), exported to PDF and read back into rows.
// Majors were matched to UT's own names, with the wording as typed kept as
// `majorRaw`; a GPA above 4.0 (weighted) and hours written in words are kept
// as `gpaRaw` / `hoursRaw` and left off anything that plots or averages them.
// One response with impossible numbers (a GPA of 6, 12,345 hours) was left
// out. Long answers were cut off at the page edge in the source (`cut`).
// CAP responses marked "Denied" were removed: completing CAP guarantees the
// College of Liberal Arts, so a CAP "denial" is a major that was not given,
// not a refusal from UT (2 responses, Nursing and Civil Engineering).
//
// THREE DATA SETS, KEPT APART. The page shows one at a time (`set`):
//   2026    — the Fall 2026 forum above;
//   2023    — an unofficial Fall 2023 spreadsheet's CAP rows: 26 CAP students
//             who were admitted, with college, major, choice, GPA and hours.
//             Admits only, so it gives no rate;
//   reddit  — CAP students' own stories (lib/transfer/cap-reports.ts), shown
//             as stories, never counted into a rate.
//
// Pure: no React, no clock.

import DATA from './ut-austin-fall-2026.json';
import DATA_2023 from './ut-austin-fall-2023-cap.json';

export type Decision = 'first' | 'second' | 'denied' | 'unknown';

export type SetKey = '2026' | '2023' | 'reddit';

export interface TransferRow {
  id: number;
  /** which data set it came from; the Fall 2026 forum when absent */
  source?: '2026' | '2023';
  /** the decision date, YYYY-MM-DD, when the source gave one */
  date: string | null;
  college: string;
  major: string;
  /** the major as typed, when it was matched to another name */
  majorRaw?: string;
  /** what else the person said about their major */
  note?: string;
  decision: Decision;
  /** applied through the Coordinated Admission Program */
  cap: boolean;
  residency: 'In-state' | 'Out-of-state' | 'International' | null;
  /** on the 4.0 scale, or null when it was not given as one */
  gpa: number | null;
  gpaRaw?: string;
  hours: number | null;
  hoursRaw?: string;
  /** "What do you believe was your most impressive/significant extracurricular?" */
  extra: string;
  /** the answer was cut off in the source */
  cut?: boolean;
}

/** Completing CAP guarantees Liberal Arts: a CAP "denied" was a major not given, not UT. */
export const capDenied = (r: TransferRow) => r.cap && r.decision === 'denied';

const RAW_2026 = DATA as TransferRow[];

/** The Fall 2026 forum, without CAP "denials". */
export const ROWS: readonly TransferRow[] = RAW_2026.filter((r) => !capDenied(r));

/** The Fall 2023 spreadsheet's CAP admits. */
export const ROWS_2023: readonly TransferRow[] = (DATA_2023 as TransferRow[]).map((r) => ({ ...r, source: '2023' as const }));

export const SOURCE = {
  title: 'Fall 2026 UT Austin External Transfer Forum Responses',
  left_out: 1,
  cap_denied_removed: RAW_2026.filter(capDenied).length,
} as const;

export const SOURCE_2023 = {
  title: 'Unofficial UT Austin External Transfers Fall 2023 (Responses)',
  url: 'https://docs.google.com/spreadsheets/d/1pedDbdIwBVItusHrD4ix-GgJB_TdtjKax72AjjamBz8/edit?usp=sharing',
} as const;

export const SETS: readonly { key: SetKey; label: string; line: string }[] = [
  { key: '2026', label: 'Fall 2026 forum', line: 'Everyone who filled in the Fall 2026 transfer form: admitted and denied, CAP and external.' },
  { key: '2023', label: 'Fall 2023 sheet', line: 'CAP students who were admitted, from an unofficial Fall 2023 spreadsheet. Admits only, so no rate.' },
  { key: 'reddit', label: 'Reddit CAP stories', line: 'CAP students telling how they got in, in their own posts. Stories, not statistics.' },
];

/** The rows a set holds; the Reddit stories are not rows. */
export function rowsFor(set: SetKey): readonly TransferRow[] {
  return set === '2023' ? ROWS_2023 : set === '2026' ? ROWS : [];
}

// ── words ────────────────────────────────────────────────────────────

export const DECISIONS: readonly Exclude<Decision, 'unknown'>[] = ['first', 'second', 'denied'];

export const DECISION_LABEL: Record<Decision, string> = {
  first: 'Admitted, first-choice major',
  second: 'Admitted, another major',
  denied: 'Denied',
  unknown: 'Not said',
};

export const DECISION_SHORT: Record<Decision, string> = {
  first: 'First choice',
  second: 'Another major',
  denied: 'Denied',
  unknown: 'Not said',
};

// ── filters ──────────────────────────────────────────────────────────

export type Applicant = 'all' | 'cap' | 'external';

export interface Band {
  key: string;
  label: string;
  /** in a sentence: "a GPA of 3.90 or above" */
  phrase: string;
  min?: number;
  /** exclusive */
  max?: number;
}

export const GPA_BANDS: readonly Band[] = [
  { key: '3.9', label: '3.90 and above', phrase: 'a GPA of 3.90 or above', min: 3.9 },
  { key: '3.7', label: '3.70 – 3.89', phrase: 'a GPA of 3.70 to 3.89', min: 3.7, max: 3.9 },
  { key: '3.5', label: '3.50 – 3.69', phrase: 'a GPA of 3.50 to 3.69', min: 3.5, max: 3.7 },
  { key: '3.0', label: '3.00 – 3.49', phrase: 'a GPA of 3.00 to 3.49', min: 3.0, max: 3.5 },
  { key: 'lt3', label: 'Below 3.00', phrase: 'a GPA below 3.00', max: 3.0 },
];

export const HOURS_BANDS: readonly Band[] = [
  { key: 'lt30', label: 'Under 30', phrase: 'under 30 credit hours', max: 30 },
  { key: '30', label: '30 – 44', phrase: '30 to 44 credit hours', min: 30, max: 45 },
  { key: '45', label: '45 – 59', phrase: '45 to 59 credit hours', min: 45, max: 60 },
  { key: '60', label: '60 and more', phrase: '60 or more credit hours', min: 60 },
];

export interface Filters {
  set: SetKey;
  applicant: Applicant;
  college: string | null;
  major: string | null;
  residency: string | null;
  gpa: string | null;
  hours: string | null;
}

export const NO_FILTERS: Filters = { set: '2026', applicant: 'all', college: null, major: null, residency: null, gpa: null, hours: null };

const inBand = (v: number | null, band: Band | undefined) =>
  !band || (v != null && (band.min == null || v >= band.min) && (band.max == null || v < band.max));

export function matches(r: TransferRow, f: Filters): boolean {
  if (f.applicant === 'cap' && !r.cap) return false;
  if (f.applicant === 'external' && r.cap) return false;
  if (f.college && r.college !== f.college) return false;
  if (f.major && r.major !== f.major) return false;
  if (f.residency && r.residency !== f.residency) return false;
  if (!inBand(r.gpa, GPA_BANDS.find((b) => b.key === f.gpa))) return false;
  if (!inBand(r.hours, HOURS_BANDS.find((b) => b.key === f.hours))) return false;
  return true;
}

export function filterRows(rows: readonly TransferRow[], f: Filters): TransferRow[] {
  return rows.filter((r) => matches(r, f));
}

export function activeCount(f: Filters): number {
  return (f.applicant !== 'all' ? 1 : 0) + [f.college, f.major, f.residency, f.gpa, f.hours].filter(Boolean).length;
}

// ── the address ──────────────────────────────────────────────────────

const Q = { set: 'set', applicant: 'who', college: 'college', major: 'major', residency: 'residency', gpa: 'gpa', hours: 'hours' } as const;

/** The filters as a query string ("" when there are none), so a view can be shared. */
export function toQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.set !== '2026') p.set(Q.set, f.set);
  if (f.applicant !== 'all') p.set(Q.applicant, f.applicant);
  for (const k of ['college', 'major', 'residency', 'gpa', 'hours'] as const) {
    const v = f[k];
    if (v) p.set(Q[k], v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** The filters from a query string. Anything that names nothing in the data is dropped. */
export function fromQuery(search: string): Filters {
  const p = new URLSearchParams(search);
  const sv = p.get(Q.set);
  const set: SetKey = sv === '2023' || sv === 'reddit' ? sv : '2026';
  const rows = rowsFor(set);
  const known = (k: 'college' | 'major' | 'residency', v: string | null) => (v && rows.some((r) => r[k] === v) ? v : null);
  const who = p.get(Q.applicant);
  const gpa = p.get(Q.gpa);
  const hours = p.get(Q.hours);
  return {
    set,
    applicant: set === '2026' && (who === 'cap' || who === 'external') ? who : 'all',
    college: known('college', p.get(Q.college)),
    major: known('major', p.get(Q.major)),
    residency: known('residency', p.get(Q.residency)),
    gpa: GPA_BANDS.some((b) => b.key === gpa) ? gpa : null,
    hours: HOURS_BANDS.some((b) => b.key === hours) ? hours : null,
  };
}

// ── summaries ────────────────────────────────────────────────────────

export interface Outcome {
  n: number;
  first: number;
  second: number;
  denied: number;
  unknown: number;
  /** of those with a known decision */
  known: number;
}

export function outcome(rows: readonly TransferRow[]): Outcome {
  const o: Outcome = { n: rows.length, first: 0, second: 0, denied: 0, unknown: 0, known: 0 };
  for (const r of rows) o[r.decision] += 1;
  o.known = o.n - o.unknown;
  return o;
}

/** A share of the known decisions, as a whole percentage. */
export function pct(part: number, o: Outcome): number {
  return o.known ? Math.round((part / o.known) * 100) : 0;
}

export function median(values: readonly number[]): number | null {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export const admitted = (r: TransferRow) => r.decision === 'first' || r.decision === 'second';

/** Median GPA and hours of those admitted and those denied. */
export function medians(rows: readonly TransferRow[]) {
  const of = (pick: (r: TransferRow) => boolean, key: 'gpa' | 'hours') =>
    median(rows.filter(pick).map((r) => r[key]).filter((v): v is number => v != null));
  const denied = (r: TransferRow) => r.decision === 'denied';
  return {
    gpa: { admitted: of(admitted, 'gpa'), denied: of(denied, 'gpa') },
    hours: { admitted: of(admitted, 'hours'), denied: of(denied, 'hours') },
  };
}

export interface Group extends Outcome {
  name: string;
}

/** Outcomes per college or major, the largest first (ties by name). */
export function byGroup(rows: readonly TransferRow[], key: 'college' | 'major'): Group[] {
  const m = new Map<string, TransferRow[]>();
  for (const r of rows) m.set(r[key], [...(m.get(r[key]) ?? []), r]);
  return [...m.entries()]
    .map(([name, rs]) => ({ name, ...outcome(rs) }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

/** Every value of a field, the commonest first, with how many rows hold it. */
export function options(rows: readonly TransferRow[], key: 'college' | 'major' | 'residency'): { value: string; n: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = r[key];
    if (v) m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
}

export interface Day extends Outcome {
  date: string;
}

/** Decisions per day, from the first to the last, days with none included. */
export function byDay(rows: readonly TransferRow[]): Day[] {
  const dates = rows.map((r) => r.date).filter((d): d is string => !!d).sort();
  if (!dates.length) return [];
  const out: Day[] = [];
  const end = Date.parse(`${dates[dates.length - 1]}T00:00:00Z`);
  for (let t = Date.parse(`${dates[0]}T00:00:00Z`); t <= end; t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push({ date, ...outcome(rows.filter((r) => r.date === date)) });
  }
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "15 May" */
export function dayLabel(date: string, short = false): string {
  const [, m, d] = date.split('-').map(Number);
  const month = MONTHS[m - 1] ?? '';
  return `${d} ${short ? month.slice(0, 3) : month}`;
}

// ── what people said mattered ────────────────────────────────────────

export const THEMES: readonly { name: string; test: RegExp }[] = [
  { name: 'Work and internships', test: /\bwork|job|intern|employ|manager|part[- ]time|full[- ]time|retail|barista|cashier|assistant|tutor|co-?op\b|technician|\bscribe|\bem?t\b|\bcna\b|business owner|own business|career|teach|pilot/i },
  { name: 'Clubs, honours and awards', test: /club|\borg\b|\borgs\b|organi[sz]ation|society|member|deca|prssa|honou?rs|phi theta|\bptk\b|dean.?s list|award|scholar|competition|\bpatent/i },
  { name: 'Letters and essays', test: /letter|\brecs?\b|essay|statement|\blors?\b/i },
  { name: 'Leadership', test: /president|\bvp\b|vice|founder|founded|founding|officer|captain|\blead|director|chair|treasurer|secretary|head of/i },
  { name: 'Research', test: /research|\blab\b|publish|publication|thesis/i },
  { name: 'Service and volunteering', test: /volunteer|community service|\bservice\b|non-?profit|charity|outreach|mentor|brigade/i },
  { name: 'Sports and the arts', test: /sport|athlet|varsity|\bteam\b|soccer|football|basketball|\bband\b|music|\bart\b|\barts\b|theat|dance|choir|orchestra|formula sae/i },
];

export function themesOf(text: string): string[] {
  return THEMES.filter((t) => t.test.test(text)).map((t) => t.name);
}

export interface ThemeShare {
  name: string;
  /** how many admitted / denied answers mention it */
  admitted: number;
  denied: number;
  /** as a share of those who answered at all */
  admittedPct: number;
  deniedPct: number;
}

/** How often each theme comes up among admitted and denied answers. */
export function themeShares(rows: readonly TransferRow[]): { themes: ThemeShare[]; answered: { admitted: number; denied: number } } {
  const said = rows.filter((r) => r.extra);
  const a = said.filter(admitted);
  const d = said.filter((r) => r.decision === 'denied');
  const share = (part: number, of: number) => (of ? Math.round((part / of) * 100) : 0);
  const themes = THEMES.map((t) => {
    const na = a.filter((r) => t.test.test(r.extra)).length;
    const nd = d.filter((r) => t.test.test(r.extra)).length;
    return { name: t.name, admitted: na, denied: nd, admittedPct: share(na, a.length), deniedPct: share(nd, d.length) };
  }).sort((x, y) => y.admitted + y.denied - (x.admitted + x.denied));
  return { themes, answered: { admitted: a.length, denied: d.length } };
}

// ── the sentence at the top ──────────────────────────────────────────

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Who the filters describe: "CAP applicants to Liberal Arts with a GPA of 3.90 and above". */
export function whoPhrase(f: Filters): string {
  const who = f.applicant === 'cap' ? 'CAP applicants' : f.applicant === 'external' ? 'external transfer applicants' : 'applicants';
  const res = f.residency === 'In-state' ? 'in-state ' : f.residency === 'Out-of-state' ? 'out-of-state ' : f.residency === 'International' ? 'international ' : '';
  const where = f.major ? ` to ${f.major}${f.college ? ` (${f.college})` : ''}` : f.college ? ` to ${f.college}` : '';
  const gpa = GPA_BANDS.find((b) => b.key === f.gpa);
  const hours = HOURS_BANDS.find((b) => b.key === f.hours);
  const with_ = [gpa?.phrase, hours?.phrase].filter(Boolean);
  return `${res}${who}${where}${with_.length ? ` with ${with_.join(' and ')}` : ''}`;
}

/** The headline: how many people like this, and how it went for them. */
export function headline(f: Filters, o: Outcome): { lead: string; result: string } {
  if (f.set === '2023') {
    const who = whoPhrase(f).replace(/^applicants/, '');
    if (!o.n) return { lead: `No admitted CAP students${who} in the Fall 2023 sheet.`, result: 'Try widening a filter.' };
    return {
      lead: `${o.n === 1 ? 'One admitted CAP student' : `${o.n} admitted CAP students`}${who} reported their results.`,
      result: `${plural(o.first, 'got their first-choice major', 'got their first-choice major')}${o.second ? `, ${o.second} another major` : ''}. Admits only, so this says who got in, not how likely it was.`,
    };
  }
  if (!o.n) return { lead: `No ${whoPhrase(f)} reported a decision.`, result: 'Try widening a filter.' };
  const lead = `${o.n === 1 ? 'One' : o.n} ${o.n === 1 ? whoPhrase(f).replace(/applicants/, 'applicant') : whoPhrase(f)} reported ${o.n === 1 ? 'a decision' : 'their decisions'}.`;
  if (o.known < 5) {
    const bits = [o.first && plural(o.first, 'was admitted to their first-choice major', 'were admitted to their first-choice major'), o.second && `${o.second} to another major`, o.denied && `${o.denied} denied`].filter(Boolean);
    return { lead, result: bits.length ? `${bits.join(', ')}. Too few to read much into.` : 'Too few to read much into.' };
  }
  const adm = pct(o.first + o.second, o);
  return {
    lead,
    result: `${adm}% were admitted: ${pct(o.first, o)}% to their first-choice major${o.second ? `, ${pct(o.second, o)}% to another major` : ''}.`,
  };
}

// ── the table ────────────────────────────────────────────────────────

export type SortKey = 'date' | 'major' | 'decision' | 'gpa' | 'hours';

const DECISION_ORDER: Record<Decision, number> = { first: 0, second: 1, denied: 2, unknown: 3 };

/** Sorted rows; rows with nothing to sort by go last whichever way. */
export function sortRows(rows: readonly TransferRow[], key: SortKey, dir: 'asc' | 'desc'): TransferRow[] {
  const s = dir === 'asc' ? 1 : -1;
  const val = (r: TransferRow): number | string | null =>
    key === 'decision' ? DECISION_ORDER[r.decision] : key === 'major' ? r.major.toLowerCase() : key === 'date' ? r.date : r[key];
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x == null || y == null) return x == null && y == null ? a.id - b.id : x == null ? 1 : -1;
    return (x < y ? -1 : x > y ? 1 : 0) * s || a.id - b.id;
  });
}

/** Rows whose words contain every word searched for. */
export function search(rows: readonly TransferRow[], q: string): TransferRow[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...rows];
  return rows.filter((r) => {
    const hay = [r.college, r.major, r.majorRaw, r.note, r.extra, DECISION_LABEL[r.decision], r.cap ? 'CAP' : 'external transfer', r.residency].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

// ── asking Socria ────────────────────────────────────────────────────

/**
 * The question someone asks from the page, with what they were looking at,
 * as the first message of a Socria conversation: the question first (it
 * names the conversation), then what they were looking at. Socria does not see the
 * rows, so the figures go with the question: who the filters describe, how
 * it went for them, the medians, and what they most often named. Short, and
 * said to be self-reported, so the reply reasons from it rather than over it.
 */
export function askMessage(question: string, f: Filters, rows: readonly TransferRow[]): string {
  const q = question.replace(/\s+/g, ' ').trim().slice(0, 600);
  const o = outcome(rows);
  const m = medians(rows);
  const about =
    f.set === '2023'
      ? `an unofficial Fall 2023 spreadsheet of ${ROWS_2023.length} CAP students admitted to UT Austin (self-reported; admits only, so no acceptance rate can be drawn from it)`
      : `self-reported UT Austin Fall 2026 transfer decisions (${ROWS.length} applicants who filled in a shared form; not official, not a fair sample; CAP responses marked denied were left out, since completing CAP guarantees Liberal Arts)`;
  const lines = [q || 'Help me make sense of this for my own application.', '', `What I'm looking at: ${about}.`];
  if (activeCount(f)) lines.push(`Filtered to ${whoPhrase(f)}.`);
  if (o.known) {
    lines.push(
      f.set === '2023'
        ? `${o.n} admitted: ${o.first} to their first-choice major, ${o.second} to another major.`
        : `${o.n} reported: ${o.first} admitted to their first-choice major, ${o.second} to another major, ${o.denied} denied` +
            `${o.known >= 5 ? ` (${pct(o.first + o.second, o)}% admitted)` : ''}.`
    );
    const g = (v: number | null) => (v == null ? '—' : v.toFixed(2));
    if (f.set === '2023') lines.push(`Median GPA ${g(m.gpa.admitted)}, median credit hours ${m.hours.admitted ?? '—'}.`);
    else if (m.gpa.admitted != null || m.gpa.denied != null) lines.push(`Median GPA: admitted ${g(m.gpa.admitted)}, denied ${g(m.gpa.denied)}. Median credit hours: admitted ${m.hours.admitted ?? '—'}, denied ${m.hours.denied ?? '—'}.`);
    const t = themeShares(rows).themes.filter((x) => x.admitted + x.denied > 0).slice(0, 3);
    if (t.length) lines.push(`Most often named as their biggest extracurricular: ${t.map((x) => `${x.name.toLowerCase()} (admitted ${x.admittedPct}%, denied ${x.deniedPct}%)`).join('; ')}.`);
  } else {
    lines.push('Nobody matching these filters reported a decision.');
  }
  return lines.join('\n').slice(0, 2000);
}

/** A few ways in, worded for whoever the filters describe. */
export function askStarters(f: Filters): string[] {
  const who = f.applicant === 'cap' ? 'as a CAP student' : f.applicant === 'external' ? 'as an external transfer' : 'for me';
  const where = f.major ?? f.college;
  return [
    `What do these numbers actually mean ${who}${where ? ` applying to ${where}` : ''}?`,
    'How should I write about my strongest extracurricular?',
    f.applicant === 'cap' ? 'What should I do if I get a second-choice major?' : 'How much do GPA and credit hours seem to matter here?',
  ];
}

/** Asking from the Reddit stories: what they were reading, said plainly to be anecdotes. */
export function askStoriesMessage(question: string, reports: readonly { destination: string; outcome: string; gpa: number | null; school: string | null }[]): string {
  const q = question.replace(/\s+/g, ' ').trim().slice(0, 600);
  const lines = [
    q || 'Help me make sense of these CAP stories for my own application.',
    '',
    `What I'm looking at: ${reports.length} Reddit posts by or about CAP students who moved to UT Austin (first-person or secondhand, unverified, not a representative sample; completing CAP guarantees the College of Liberal Arts, not McCombs or every major).`,
    ...reports.slice(0, 12).map((r) => `- ${r.school ? `${r.school} CAP` : 'CAP'}: ${r.outcome}${r.gpa != null ? `, GPA ${r.gpa}` : ''}`),
  ];
  return lines.join('\n').slice(0, 2000);
}

export const STORY_STARTERS = [
  'What do the CAP-to-McCombs stories have in common?',
  'How should I plan my CAP year if I want McCombs?',
  'What should my backup be if I don’t get my major?',
];
