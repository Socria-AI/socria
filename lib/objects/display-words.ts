// lib/objects/display-words.ts — a display read straight from the person's own words.
//
// "Chart my monthly spending: rent 1200, food 400, transport 150" holds
// everything a chart needs: three labels, three numbers, what they are. Asking
// a language model to copy those into JSON is the slowest and least reliable
// way to make it — the copy can drop a row, round a number, decline, or call
// the numbers examples — so wherever the words themselves hold the display's
// contents, code reads them here and the model is never asked.
//
// Kept to what is plainly written. A label is the words written beside a
// number; a number is one the person typed ("1,200", "$1,200", "40%"); a
// date is a real calendar day. What cannot be read for certain is left to the
// drafted path (display-propose.ts), where the seal still checks it. When the
// person gave nothing to fill a display with, it is made EMPTY and says so —
// a template to fill in, never numbers or items made up.
//
// PURE.

import { cleanText, readDay } from './display-base';
import { DATA_LIMITS, dataFromCSV, readNumber, sanitizeData, VIEW_NAME, type DataState, type DataView } from './display-data';

// ── numbers as people write them beside a label ─────────────────────

/** One labelled number, as written. */
export interface Pair {
  label: string;
  value: number;
  /** a unit written with the number: "$", "%", "hours" */
  unit?: string;
}

const CURRENCY_SIGN: Record<string, string> = { $: '$', '£': '£', '€': '€', '¥': '¥', '₹': '₹' };
const UNIT_WORDS: [RegExp, string][] = [
  [/^(?:dollars?|usd|bucks)\b/i, '$'],
  [/^(?:euros?|eur)\b/i, '€'],
  [/^(?:pounds sterling|gbp|quid)\b/i, '£'],
  [/^(?:rupees?|inr)\b/i, '₹'],
  [/^(?:yen|jpy)\b/i, '¥'],
  [/^(?:hours?|hrs?)\b/i, 'hours'],
  [/^(?:minutes?|mins?)\b/i, 'min'],
  [/^(?:seconds?|secs?)\b/i, 's'],
  [/^(?:kilograms?|kgs?)\b/i, 'kg'],
  [/^(?:pounds|lbs?)\b/i, 'lb'],
  [/^(?:kilometers?|kilometres?|km)\b/i, 'km'],
  [/^(?:miles?|mi)\b/i, 'mi'],
  [/^(?:kcal|calories)\b/i, 'kcal'],
  [/^(?:points?|pts)\b/i, 'points'],
  [/^(?:steps)\b/i, 'steps'],
  [/^(?:pages)\b/i, 'pages'],
  [/^(?:words)\b/i, 'words'],
  [/^(?:people|students|users|customers|visitors)\b/i, ''],
];

/**
 * A number token: never part of a word ("Q1", "COVID19"), with a sign, a
 * currency sign, thousands grouped properly, a decimal part, a percent sign,
 * and a k / M / bn written straight after it.
 */
const NUMBER = /(?<![\p{L}\p{N}.])([-−]\s?)?([$£€¥₹])?\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(%|k\b|K\b|M\b|mn\b|bn\b)?/gu;

interface NumberToken {
  value: number;
  unit?: string;
  start: number;
  end: number;
}

function numbersOf(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (const m of text.matchAll(NUMBER)) {
    let n = readNumber(`${m[1] ? '-' : ''}${m[3]}`);
    if (n === null) continue;
    const scale = m[4] === 'k' || m[4] === 'K' ? 1e3 : m[4] === 'M' || m[4] === 'mn' ? 1e6 : m[4] === 'bn' ? 1e9 : 1;
    n = Number((n * scale).toPrecision(10));
    let unit = m[4] === '%' ? '%' : m[2] ? CURRENCY_SIGN[m[2]] : undefined;
    let end = (m.index ?? 0) + m[0].length;
    // a unit word straight after the number: "7 hours", "1200 dollars on rent"
    const rest = text.slice(end).replace(/^\s+/, '');
    for (const [rx, u] of UNIT_WORDS) {
      const w = rx.exec(rest);
      if (w) {
        if (u && !unit) unit = u;
        end = text.length - rest.length + w[0].length;
        break;
      }
    }
    out.push({ value: n, ...(unit ? { unit } : {}), start: m.index ?? 0, end });
  }
  return out;
}

/** Words around a label that are not the label: the request, fillers, connectives. */
const LEAD = /^(?:and|&|plus|also|then|with|i\s+spent|i\s+paid|i\s+made|i\s+earned|we\s+spent|spent|paid|made|earned|got|on|for|in|of|my|our|the|a|an|about|around|roughly|approximately|approx|chart|plot|graph|draw|make|create|build|show|me|us|visuali[sz]e|tabulate|please|pls|pie|bar|line|chart|graph|of|these|those|this|that|data|numbers|values|figures|is|was)\s+(?=\S)/i;
const TRAIL = /(?:\s*[:=\-–—~]|\s+(?:is|was|are|were|at|of|costs?|cost me|came to|totals?|totalled|about|around|roughly|approx\.?|for|with))\s*$/i;

/** The label written before a number, or null when there is none worth calling one. */
function labelBefore(raw: string): string | null {
  let t = raw.replace(/[\s,;]+$/, '');
  // "Chart my spending: rent" → "rent"; "Jan:" → "Jan"
  const colon = t.lastIndexOf(':');
  if (colon >= 0) t = t.slice(colon + 1).trim() || t.slice(0, colon);
  t = t.replace(/[“”"()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 6; i++) {
    const before = t;
    t = t.replace(TRAIL, '').replace(LEAD, '').trim();
    if (t === before) break;
  }
  t = t.replace(/^[-–—•*·\d.)]+\s+/, '').trim();
  // "my expenses are rent" → "rent": what follows the last linking word is the label
  const link = [...t.matchAll(/\b(?:are|is|were|was|include|includes|including|like|being|namely)\b/gi)].pop();
  if (link && t.slice((link.index ?? 0) + link[0].length).trim()) t = t.slice((link.index ?? 0) + link[0].length).trim();
  if (!/\p{L}/u.test(t) || t.length > DATA_LIMITS.text || t.split(' ').length > 5) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** The label written after a number: "1200 on rent", "$40 for books". */
function labelAfter(raw: string): string | null {
  const m = /^\s*(?:on|for|in|towards?|to)\s+(?:my\s+|the\s+|our\s+)?([\p{L}][\p{L}\p{N}' &/-]{0,38}?)\s*(?:[.!]|$)/u.exec(raw);
  if (!m) return null;
  const t = m[1].trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}

/** Split on the commas, semicolons, new lines and "and"s between pairs — never inside "1,200". */
function segmentsOf(text: string): string[] {
  return text
    .split(/(?:,(?!\d{3}(?!\d)))|;|\n|\s+and\s+|\s+&\s+|\s+plus\s+|\.\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

const REQUEST_WORD = /\b(?:chart|plot|graph|draw|make|create|build|show|visuali[sz]e|tabulate|histogram|table|pie|bar|line|scatter|heat ?map|give|turn|put)\b/i;

/** The part of a message that holds the numbers: after "…:" when what is before it is the request. */
function dataPart(text: string): { request: string; data: string } {
  const c = text.indexOf(':');
  if (c > 0) {
    const before = text.slice(0, c);
    const after = text.slice(c + 1);
    if (/\d/.test(after) && (REQUEST_WORD.test(before) || (!/\d/.test(before) && before.trim().split(/\s+/).length > 1))) return { request: before, data: after };
  }
  // no colon: the request is the first line, or runs up to the first labelled number — less that label
  const first = numbersOf(text)[0];
  if (!first) return { request: text, data: '' };
  const head = text.slice(0, first.start);
  const nl = head.indexOf('\n');
  if (nl >= 0) return { request: head.slice(0, nl), data: text };
  const label = labelBefore(head);
  const bare = head.replace(/[\s:=\-–—]+$/, '');
  const request = label && bare.toLowerCase().endsWith(label.toLowerCase()) ? bare.slice(0, -label.length) : head;
  return { request, data: text };
}

/**
 * Every labelled number in some words, in the order written, and the numbers
 * written without a label ("scores: 70, 85, 90").
 */
export function readPairs(text: string): { pairs: Pair[]; loose: { value: number; unit?: string }[] } {
  const pairs: Pair[] = [];
  const loose: { value: number; unit?: string }[] = [];
  for (const seg of segmentsOf(text)) {
    // "2019: 100", "2020 - 150": a year that labels a number
    const yr = /^(\d{4})\s*[:=\-–—]?\s+([-−]?[$£€¥₹]?\d[\d,]*(?:\.\d+)?%?)\s*$/.exec(seg) ?? /^(\d{4})\s*[:=\-–—]\s*([-−]?[$£€¥₹]?\d[\d,]*(?:\.\d+)?%?)\s*$/.exec(seg);
    if (yr && Number(yr[1]) >= 1800 && Number(yr[1]) <= 2200) {
      const tok = numbersOf(yr[2])[0];
      if (tok) {
        pairs.push({ label: yr[1], value: tok.value, ...(tok.unit ? { unit: tok.unit } : {}) });
        continue;
      }
    }
    const nums = numbersOf(seg);
    if (!nums.length) continue;
    let from = 0;
    nums.forEach((n, i) => {
      const before = seg.slice(from, n.start);
      const after = seg.slice(n.end, nums[i + 1]?.start ?? seg.length);
      // "1200 on rent" — the label after, when nothing labels it before
      const label = (nums.length === 1 ? labelAfter(after) : null) ?? labelBefore(before);
      if (label) pairs.push({ label, value: n.value, ...(n.unit ? { unit: n.unit } : {}) });
      else loose.push({ value: n.value, ...(n.unit ? { unit: n.unit } : {}) });
      from = n.end;
    });
  }
  return { pairs, loose };
}

// ── what the labels are ──────────────────────────────────────────────

const MONTHS = /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?:\s+\d{2,4})?$/i;
const WEEKDAYS = /^(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\.?$/i;
const QUARTERS = /^(?:q[1-4](?:\s+\d{2,4})?|(?:first|second|third|fourth)\s+quarter)$/i;
const PERIODS = /^(?:week|wk|day|month|year|term|semester|round|session|lesson|stage|phase|sprint|trial|run|attempt|test|quiz|exam)\s*\d{1,3}$/i;
const YEARS = /^(?:18|19|20|21)\d{2}$/;

/** What a column of labels is called, and whether they run in time (drawn as a line). */
function labelsAre(labels: string[]): { name: string; inTime: boolean } {
  const all = (rx: RegExp) => labels.length > 0 && labels.every((l) => rx.test(l.trim()));
  if (all(MONTHS)) return { name: 'Month', inTime: true };
  if (all(WEEKDAYS)) return { name: 'Day', inTime: true };
  if (all(YEARS)) return { name: 'Year', inTime: true };
  if (all(QUARTERS)) return { name: 'Quarter', inTime: true };
  if (all(PERIODS)) {
    const w = /^[a-z]+/i.exec(labels[0].trim())?.[0] ?? 'Period';
    return { name: w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(), inTime: true };
  }
  return { name: 'Category', inTime: false };
}

// ── what it is a chart of ────────────────────────────────────────────

const NOT_SUBJECT =
  /\b(?:please|pls|can|could|would|will|you|i|we|want|wanna|need|like|id|make|create|draw|build|generate|give|show|chart|charts|plot|graph|visuali[sz]e|tabulate|turn|put|into|as|me|us|a|an|the|my|our|these|those|this|that|of|for|showing|with|it|them|pie|donut|doughnut|bar|column|line|area|scatter|histogram|heat|heatmap|map|table|spreadsheet|chart|graph|plot|horizontal|vertical|stacked|grouped|quick|simple|nice|new|from|using|based|on|out|below|following|here|data|numbers|is|are|was|were|mind|concept|flowchart|flow|timeline|checklist|venn|diagram|decision|tree|org|kanban|board|calendar|list|number|matrix|comparison|scoring|weighted|storyboard|plan|pros\s+(?:and|&)\s+cons|pros|cons)\b/gi;

/** "Chart my monthly spending" → "Monthly spending"; nothing left → null. */
export function subjectOf(request: string): string | null {
  const t = request
    .replace(/[^\p{L}\p{N}'\s-]/gu, ' ')
    .replace(NOT_SUBJECT, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || !/\p{L}/u.test(t)) return null;
  const s = cleanText(t, 60);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── a chart, from what was written ───────────────────────────────────

export interface FromWords<S> {
  state: S;
  /** one line for the person, in their terms, when there is more to say than what was made */
  says?: string;
  /** made with nothing in it, to be filled in */
  empty?: boolean;
}

const COUNT_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const UNIT_PERIOD = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(months?|weeks?|days?|years?|quarters?|terms?|semesters?)\b/i;

/** "over six months", "for 12 weeks": a count of rows, and what each is called. */
function periodOf(text: string): { n: number; name: string } | null {
  const m = UNIT_PERIOD.exec(text);
  if (!m) return null;
  const n = COUNT_WORDS[m[1].toLowerCase()] ?? Number(m[1]);
  if (!(n >= 1 && n <= 24)) return null;
  const w = m[2].replace(/s$/i, '');
  return { n, name: w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() };
}

/** Numbers that only count the rows asked for ("six months") or name a day are not data. */
export function dataNumbersIn(text: string): number {
  const stripped = text.replace(new RegExp(UNIT_PERIOD.source, 'gi'), ' ').replace(/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g, ' ');
  return numbersOf(stripped).length;
}

const isTable = (line: string, sep: string) => line.split(sep).length >= 2;

/** A table pasted as CSV, tab- or pipe-separated lines: the first line names the columns. */
function pastedTable(text: string, title: string): DataState | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^\|?\s*:?-{2,}/.test(l));
  for (const sep of ['\t', '|', ',']) {
    const block: string[] = [];
    for (const l of lines) {
      if (isTable(l, sep)) block.push(l);
      else if (block.length >= 3) break;
      else block.length = 0;
    }
    if (block.length < 3) continue;
    const widths = block.map((l) => l.replace(/^\||\|$/g, '').split(sep).length);
    if (!widths.every((w) => w === widths[0])) continue;
    const csv = block
      .map((l) =>
        l
          .replace(/^\||\|$/g, '')
          .split(sep)
          .map((c) => {
            const v = c.trim();
            return /[",\n]/.test(v) && sep !== ',' ? `"${v.replace(/"/g, '""')}"` : v;
          })
          .join(',')
      )
      .join('\n');
    const s = dataFromCSV(csv, title, { basis: 'given', by: 'person' });
    if (s && s.columns.some((c) => c.type === 'number') && s.rows.length) return s;
  }
  return null;
}

/**
 * Groups of numbers: "Jan: sales 10, costs 5; Feb: sales 12, costs 6" — a
 * label leading each group, the same names inside each. Read as a table with
 * one column per name, so it draws as grouped bars or several lines.
 */
function groupedTable(text: string): { x: string[]; series: string[]; cells: (number | null)[][]; unit?: string } | null {
  const groups = text
    .split(/;|\n/)
    .map((g) => g.trim())
    .filter(Boolean);
  if (groups.length < 2) return null;
  const x: string[] = [];
  const series: string[] = [];
  const rows: Map<string, number>[] = [];
  const units = new Set<string>();
  for (const g of groups) {
    const m = /^([^:]{1,40}):\s*(.+)$/.exec(g);
    if (!m) return null;
    const head = labelBefore(m[1]);
    const { pairs } = readPairs(m[2]);
    if (!head || pairs.length < 2) return null;
    x.push(head);
    const row = new Map<string, number>();
    for (const p of pairs) {
      const key = p.label.toLowerCase();
      if (!series.some((s) => s.toLowerCase() === key)) series.push(p.label);
      row.set(key, p.value);
      if (p.unit) units.add(p.unit);
    }
    rows.push(row);
  }
  if (series.length < 2 || series.length > DATA_LIMITS.columns - 1) return null;
  // every group names (mostly) the same things, or this is not one table
  const shared = series.filter((s) => rows.filter((r) => r.has(s.toLowerCase())).length >= Math.ceil(rows.length / 2));
  if (shared.length < series.length) return null;
  return { x, series, cells: rows.map((r) => series.map((s) => r.get(s.toLowerCase()) ?? null)), ...(units.size === 1 ? { unit: [...units][0] } : {}) };
}

const viewFor = (asked: string | undefined, inTime: boolean): DataView => {
  if (asked && (DATA_VIEWS_ALL as readonly string[]).includes(asked)) return asked as DataView;
  return inTime ? 'line' : 'bar';
};
const DATA_VIEWS_ALL = ['table', 'bar', 'line', 'area', 'scatter', 'pie', 'histogram', 'heatmap'] as const;

/**
 * A chart from the person's words, or null when the words do not hold one
 * plainly enough — then the drafted path is tried. `view` is the view the
 * request named; `earlier` the person's earlier messages, newest last, read
 * only when this one points back at them ("chart these").
 */
export function dataFromWords(said: string, opts: { view?: string; earlier?: readonly string[] } = {}): FromWords<DataState> | null {
  const own = dataFromMessage(said, said, opts.view);
  if (own) return own;
  // "make a pie chart of these expenses": the numbers are in what they said before
  if (/\b(?:these|those|this|that|above|them|it|the\s+(?:numbers|data|figures|values|list|amounts|expenses|scores|results))\b/i.test(said)) {
    const earlier = [...(opts.earlier ?? [])].reverse().filter((t) => t !== said).slice(0, 4);
    for (const t of earlier) {
      const made = dataFromMessage(t, said, opts.view);
      if (made) return made;
    }
  }
  return null;
}

function dataFromMessage(text: string, request: string, view?: string): FromWords<DataState> | null {
  const { request: asked, data } = dataPart(text);
  const subject = subjectOf(request === text ? asked : dataPart(request).request) ?? subjectOf(asked);
  const title = subject ?? (view && view in VIEW_NAME ? VIEW_NAME[view as DataView].replace(/^./, (c) => c.toUpperCase()) : 'Your numbers');
  const by = 'person' as const;

  const pasted = pastedTable(text, title);
  if (pasted) {
    const first = pasted.columns.findIndex((c) => c.type === 'text' || c.type === 'category');
    const labels = first >= 0 ? pasted.rows.map((r) => String(r.cells[first] ?? '')) : [];
    const v = viewFor(view, pasted.columns.some((c) => c.type === 'date') || labelsAre(labels).inTime);
    const s = sanitizeData({ ...pasted, view: v });
    if (s) return { state: s };
  }

  const grouped = groupedTable(data || text);
  if (grouped) {
    const { name, inTime } = labelsAre(grouped.x);
    const sInTime = labelsAre(grouped.series).inTime;
    // the labels that run in time go along the x axis: "sales: Jan 10, Feb 12; costs: Jan 5, Feb 6"
    const flip = sInTime && !inTime;
    const xs = flip ? grouped.series : grouped.x;
    const ss = flip ? grouped.x : grouped.series;
    const cell = (i: number, j: number) => (flip ? grouped.cells[j][i] : grouped.cells[i][j]);
    const columns = [
      { id: 'c1', name: flip ? labelsAre(xs).name : name, type: 'text', by },
      ...ss.map((s, j) => ({ id: `c${j + 2}`, name: cleanText(s, DATA_LIMITS.name), type: 'number', ...(grouped.unit ? { unit: grouped.unit } : {}), by })),
    ];
    const rows = xs.map((x, i) => ({ cells: [x, ...ss.map((_, j) => cell(i, j))], by }));
    const v = viewFor(view, flip || inTime);
    const s = sanitizeData({ title, view: v, basis: 'given', columns, rows, x: 'c1', y: columns.slice(1, 1 + DATA_LIMITS.series).map((c) => c.id) });
    if (s) return { state: s };
  }

  const { pairs, loose } = readPairs(data || text);
  const units = new Set([...pairs, ...loose].map((p) => p.unit ?? ''));
  const unit = units.size === 1 ? [...units][0] : '';
  if (pairs.length >= 1 && pairs.length >= loose.length) {
    // every pair as written, in order — a label written twice is two rows, not a guess at which one counts
    const kept = pairs;
    if (kept.length > DATA_LIMITS.rows) return null;
    const { name, inTime } = labelsAre(kept.map((p) => p.label));
    const v = viewFor(view, inTime);
    const valueName = cleanText(subject ?? (unit && '$£€¥₹'.includes(unit) ? 'Amount' : 'Value'), DATA_LIMITS.name);
    const s = sanitizeData({
      title,
      view: v,
      basis: 'given',
      columns: [
        { id: 'c1', name, type: 'text', by },
        { id: 'c2', name: valueName === name ? 'Value' : valueName, type: 'number', ...(unit ? { unit } : {}), by },
      ],
      rows: kept.map((p) => ({ cells: [p.label, p.value], by })),
      x: 'c1',
      y: ['c2'],
    });
    if (!s) return null;
    return { state: s };
  }
  // numbers with no labels: "these scores: 70, 85, 90, 65, 88"
  if (loose.length >= 2 && !pairs.length) {
    const valueName = cleanText(subject ?? 'Value', DATA_LIMITS.name);
    const histogram = view === 'histogram' || (!view && /\b(?:distribution|spread|histogram|frequenc)/i.test(request));
    if (histogram) {
      const s = sanitizeData({ title, view: 'histogram', basis: 'given', columns: [{ id: 'c1', name: valueName, type: 'number', ...(unit ? { unit } : {}), by }], rows: loose.map((p) => ({ cells: [p.value], by })), x: 'c1' });
      return s ? { state: s } : null;
    }
    // drawn in the order written: the position is the only label they have
    const v = viewFor(view, false);
    const ordinal = v === 'line' || v === 'area' || v === 'scatter';
    const s = sanitizeData({
      title,
      view: v,
      basis: 'given',
      columns: [
        { id: 'c1', name: '#', type: ordinal ? 'number' : 'text', by },
        { id: 'c2', name: valueName, type: 'number', ...(unit ? { unit } : {}), by },
      ],
      rows: loose.map((p, i) => ({ cells: [ordinal ? i + 1 : String(i + 1), p.value], by })),
      x: 'c1',
      y: ['c2'],
    });
    return s ? { state: s, says: `Made from your ${loose.length} numbers, in the order you wrote them — give each a label and it will use them.` } : null;
  }
  return null;
}

/**
 * A chart with nothing in it yet, for a request that gave no numbers: the
 * columns it names, as many empty rows as it asked for ("over six months"),
 * and nothing made up to fill them.
 */
export function emptyChart(said: string, opts: { view?: string } = {}): FromWords<DataState> {
  const { request } = dataPart(said);
  const subject = subjectOf(request);
  const period = periodOf(said);
  const view = viewFor(opts.view, !!period);
  const title = subject ?? 'Your numbers';
  const n = period?.n ?? 3;
  const s = sanitizeData({
    title,
    view,
    basis: 'given',
    columns: [
      { id: 'c1', name: period?.name ?? 'Label', type: 'text', by: 'person' },
      { id: 'c2', name: cleanText(subject ?? 'Value', DATA_LIMITS.name), type: 'number', by: 'person' },
    ],
    rows: Array.from({ length: n }, () => ({ cells: [null, null], by: 'person' })),
    x: 'c1',
    y: ['c2'],
  })!;
  const what = period ? `each ${period.name.toLowerCase()}` : 'each row';
  return {
    state: s,
    empty: true,
    says: `No numbers were given, so nothing was made up: the ${VIEW_NAME[view]} is empty — type a label and a number for ${what} (or say them) and it draws as you go.`,
  };
}

// ── lists: a checklist, the steps of a flow, the branches of a mind map ─

/** "buy milk, call mom and pay rent", a bulleted or numbered list, one per line → the items, as written. */
export function listIn(text: string): string[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const bulleted = lines.filter((l) => /^(?:[-*•·◦▪]|\d{1,2}[.)]|\[[ x]?\])\s+/i.test(l));
  const raw =
    bulleted.length >= 2
      ? bulleted.map((l) => l.replace(/^(?:[-*•·◦▪]|\d{1,2}[.)]|\[[ x]?\])\s+/i, ''))
      : lines.length >= 3
        ? lines
        : text.split(/\s*[;,]\s*(?:and\s+|then\s+)?|\s+and\s+(?=\S)/i);
  return raw
    .map((x) => cleanText(x.replace(/^(?:and|then|also|&)\s+/i, '').replace(/[.;]+$/, ''), 120))
    .filter((x) => x.length >= 2 && /\p{L}/u.test(x))
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .slice(0, 40);
}

/** What follows the request: after "…:" or on the lines below it. Null when the request holds no list. */
function afterRequest(text: string): string | null {
  const nl = text.indexOf('\n');
  const c = text.indexOf(':');
  if (c > 0 && (nl < 0 || c < nl) && text.slice(c + 1).trim()) return text.slice(c + 1).trim();
  if (nl > 0 && text.slice(nl + 1).trim()) return text.slice(nl + 1).trim();
  return null;
}

const POINTS_BACK = /\b(?:these|those|this|that|above|them|it|my\s+(?:notes|list|tasks|steps|deadlines|ideas|points))\b/i;

/** The list a request carries, or — when it points back at it — the list in what they said just before. */
function listFor(said: string, earlier: readonly string[] = []): { items: string[]; from: 'here' | 'before' } | null {
  const here = afterRequest(said);
  if (here) {
    const items = listIn(here);
    if (items.length >= 1) return { items, from: 'here' };
  }
  if (POINTS_BACK.test(said)) {
    for (const t of [...earlier].reverse().filter((x) => x !== said).slice(0, 3)) {
      const items = listIn(t);
      if (items.length >= 2) return { items, from: 'before' };
    }
  }
  return null;
}

/** "Make a checklist: buy milk, call mom, pay rent" → a checklist of those, in that order, as theirs. */
export function checklistFromWords(said: string, opts: { earlier?: readonly string[]; view?: string; title?: string } = {}): FromWords<unknown> | null {
  const list = listFor(said, opts.earlier);
  if (!list) return null;
  const title = opts.title ?? subjectOf(said.split(/[:\n]/)[0]) ?? 'Checklist';
  return {
    state: { title, view: opts.view ?? 'checklist', items: list.items.map((text, i) => ({ id: `i${i + 1}`, text, by: 'person' })), links: [] },
  };
}

// ── days: a timeline, a calendar ─────────────────────────────────────

const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
const WEEKDAY = String.raw`(?:mon|tues|wednes|thurs|fri|satur|sun)day`;
const DAY_PHRASE = new RegExp(
  String.raw`\b(?:\d{4}-\d{1,2}-\d{1,2}|${MONTH}\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?${MONTH}\.?(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|today|tomorrow|next\s+week|(?:next|this)\s+${WEEKDAY}|${WEEKDAY}|in\s+\d{1,3}\s+(?:days?|weeks?|months?))\b`,
  'gi'
);

/** "kickoff Jan 5" → { text: "Kickoff", date }, "design Feb 1 – Feb 10" → with an end; null without a day. */
function datedItem(seg: string, today: string): { text: string; date: string; end?: string } | null {
  const found = [...seg.matchAll(DAY_PHRASE)];
  if (!found.length) return null;
  const date = readDay(found[0][0], today);
  if (!date) return null;
  const second = found[1] ? readDay(found[1][0], today) : null;
  const end = second && second > date ? second : undefined;
  let text = seg;
  for (const f of found.slice(0, end ? 2 : 1)) text = text.replace(f[0], ' ');
  text = text
    .replace(/\s*(?:[-–—]|to|until|till|through|thru)\s*(?=$|\s)/gi, ' ')
    .replace(/\b(?:on|by|due(?:\s+on|\s+by)?|is|at|from|starts?|ends?|for)\s*$/i, '')
    .replace(/^\s*(?:on|by|due|is|at|from)\s+/i, '')
    .replace(/[\s,:;.()-]+$/, '')
    .replace(/^[\s,:;.()-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/\p{L}/u.test(text)) return null;
  return { text: text.charAt(0).toUpperCase() + text.slice(1), date, ...(end ? { end } : {}) };
}

/**
 * "Create a timeline: kickoff Jan 5, design Feb 1, launch Mar 15" → a plan
 * whose items are on those days. Every day is one the person wrote, read
 * against today; an item written without a day keeps no day.
 */
export function datedFromWords(said: string, opts: { today: string; earlier?: readonly string[]; view?: string } ): FromWords<unknown> | null {
  const read = (text: string) => {
    const protectedYears = text.replace(new RegExp(String.raw`(\b${MONTH}\.?\s+\d{1,2}(?:st|nd|rd|th)?),\s+(\d{4})\b`, 'gi'), '$1 $2');
    const segs = protectedYears
      .split(/\n|;|,(?!\d)|\s+and\s+(?=\S)/i)
      .map((s) => s.replace(/^(?:[-*•·]|\d{1,2}[.)])\s+/, '').trim())
      .filter(Boolean);
    const items = segs.map((s) => datedItem(s, opts.today)).filter((x): x is NonNullable<typeof x> => !!x);
    return items.length >= 1 && items.length >= Math.ceil(segs.length / 2) ? items : null;
  };
  const here = afterRequest(said);
  let items = here ? read(here) : null;
  if (!items && POINTS_BACK.test(said)) {
    for (const t of [...(opts.earlier ?? [])].reverse().filter((x) => x !== said).slice(0, 3)) {
      items = read(t);
      if (items) break;
    }
  }
  if (!items) return null;
  const title = subjectOf(said.split(/[:\n]/)[0]) ?? 'Timeline';
  return {
    state: {
      title,
      view: opts.view ?? 'timeline',
      items: items.slice(0, 40).map((x, i) => ({ id: `i${i + 1}`, text: x.text, date: x.date, ...(x.end ? { end: x.end } : {}), by: 'person' })),
      links: [],
    },
  };
}

// ── a flow: steps in order ───────────────────────────────────────────

/** "wake up -> shower -> breakfast", "first X, then Y, then Z", a numbered list → the steps, in order. */
function stepsIn(text: string): string[] | null {
  const arrows = text.split(/\s*(?:->|→|=>|⟶|>>)\s*/);
  if (arrows.length >= 2) return arrows.map((s) => cleanText(s.replace(/[.;]+$/, ''), 60)).filter(Boolean);
  if (/\bthen\b/i.test(text)) {
    const parts = text
      .split(/\s*(?:,\s*(?:and\s+)?then|\s+and\s+then|;\s*then|\.\s*then|\bthen)\s+/i)
      .map((s) => cleanText(s.replace(/^(?:first(?:ly)?|start(?:ing)? (?:by|with)|begin (?:by|with))[,\s]+/i, '').replace(/^(?:and\s+)?(?:finally|lastly)[,\s]+/i, '').replace(/[.;]+$/, ''), 60))
      .filter((s) => s.length >= 2);
    if (parts.length >= 2) return parts;
  }
  const list = listIn(text);
  return list.length >= 2 && /\n/.test(text) ? list.map((s) => cleanText(s, 60)) : null;
}

/** A flowchart of the steps the person wrote, joined in their order — nothing added between them. */
export function flowFromWords(said: string, opts: { earlier?: readonly string[] } = {}): FromWords<unknown> | null {
  const here = afterRequest(said);
  let steps = here ? stepsIn(here) : null;
  if (!steps && POINTS_BACK.test(said)) {
    for (const t of [...(opts.earlier ?? [])].reverse().filter((x) => x !== said).slice(0, 3)) {
      steps = stepsIn(t);
      if (steps) break;
    }
  }
  if (!steps || steps.length < 2) return null;
  const nodes = steps.slice(0, 30).map((label, i) => ({ id: `n${i + 1}`, label: label.charAt(0).toUpperCase() + label.slice(1), by: 'person' }));
  return {
    state: {
      title: subjectOf(said.split(/[:\n]/)[0]) ?? 'Process',
      view: 'flow',
      nodes,
      edges: nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id, by: 'person' })),
      root: nodes[0].id,
    },
  };
}

/** "mind map of my project: design, budget, team" → the subject at the centre, their branches round it. */
export function mindFromWords(said: string, opts: { view?: string } = {}): FromWords<unknown> | null {
  const here = afterRequest(said);
  const branches = here ? listIn(here) : [];
  if (branches.length < 2) return null;
  const centre = subjectOf(said.split(/[:\n]/)[0]) ?? 'Centre';
  const nodes = [{ id: 'n1', label: centre, by: 'person' }, ...branches.slice(0, 29).map((label, i) => ({ id: `n${i + 2}`, label: cleanText(label, 60), by: 'person' }))];
  return {
    state: { title: centre, view: opts.view ?? 'mind', nodes, edges: nodes.slice(1).map((n) => ({ from: 'n1', to: n.id, by: 'person' })), root: 'n1' },
  };
}

// ── sets: a Venn diagram ─────────────────────────────────────────────

/**
 * "a venn diagram of cats and dogs" → two empty sets named as they said;
 * "cats: fur, whiskers; dogs: fur, bark" → their members, and an element
 * written under two sets sits in both — the overlap is computed, not guessed.
 */
export function vennFromWords(said: string): FromWords<unknown> | null {
  const here = afterRequest(said);
  // members listed under each set's name
  if (here) {
    const groups = here
      .split(/;|\n/)
      .map((g) => /^\s*([^:]{1,40}):\s*(.+)$/.exec(g))
      .filter((m): m is RegExpExecArray => !!m);
    if (groups.length >= 2 && groups.length <= 3) {
      const sets = groups.map((g, i) => ({ id: `s${i + 1}`, name: cleanText(g[1], 40).replace(/^./, (c) => c.toUpperCase()), by: 'person' }));
      const elements: { id: string; label: string; sets: string[]; by: 'person' }[] = [];
      groups.forEach((g, i) => {
        for (const label of listIn(g[2])) {
          const same = elements.find((e) => e.label.toLowerCase() === label.toLowerCase());
          if (same) {
            if (!same.sets.includes(sets[i].id)) same.sets.push(sets[i].id);
          } else elements.push({ id: `e${elements.length + 1}`, label, sets: [sets[i].id], by: 'person' });
        }
      });
      return { state: { title: sets.map((s) => s.name).join(' · '), view: 'venn', sets, elements } };
    }
  }
  // the sets named in the request: "of cats and dogs", "comparing A, B and C"
  const m = /\b(?:of|for|comparing|between|with|showing)\s+(.+?)(?:[.?!:]|$)/i.exec(said.split('\n')[0]);
  if (!m) return null;
  const names = m[1]
    .split(/\s*,\s*(?:and\s+)?|\s+(?:and|vs\.?|versus|&)\s+/i)
    .map((x) => cleanText(x.replace(/^(?:the|my|our)\s+/i, ''), 40))
    .filter((x) => x.length >= 2);
  if (names.length < 2 || names.length > 3) return null;
  const sets = names.map((n, i) => ({ id: `s${i + 1}`, name: n.charAt(0).toUpperCase() + n.slice(1), by: 'person' }));
  return {
    state: { title: sets.map((s) => s.name).join(' · '), view: 'venn', sets, elements: [] },
    empty: true,
    says: 'The sets are named as you said; nothing is in them yet — add what belongs where, and what they share is worked out.',
  };
}

// ── options against criteria: a comparison, a weighted score ─────────

const optionSplit = /\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|vs\.?|versus|or|against|with|to)\s+/i;
const tidyOption = (x: string) =>
  cleanText(
    x
      .replace(/^(?:the|my|our|a|an)\s+/i, '')
      .replace(/\s+(?:in|as|into)\s+(?:a\s+)?(?:table|chart|grid|matrix|comparison).*$/i, '')
      .replace(/\s+side\s+by\s+side.*$/i, '')
      .replace(/[.?!]+$/, ''),
    60
  );

/**
 * "compare iPhone and Pixel on price, camera and battery" → the options and
 * criteria they named, every weight even (5) and every score empty: how much
 * each matters and how each option does are the person's to say.
 */
export function compareFromWords(said: string, opts: { view?: string } = {}): FromWords<unknown> | null {
  const line = said.replace(/\n/g, ' ');
  const m =
    /\bcompar(?:e|ing)\s+(.+?)(?:\s+(?:on|by|for|across|in terms of|using|against the criteria(?: of)?)\s+(.+?))?(?:[.?!]|$)/i.exec(line) ??
    /^(?:[^:]*\b(?:table|chart|matrix|grid|comparison|scoring)\b[^:]*:\s*)?(.+?)\s+(?:vs\.?|versus)\s+(.+?)(?:[.?!]|$)/i.exec(line);
  if (!m) return null;
  let optionsText = m[1];
  let criteriaText = m[2] ?? '';
  if (!/\bcompar/i.test(m[0])) {
    // "iPhone vs Pixel": both sides are options
    optionsText = `${m[1]} vs ${m[2]}`;
    criteriaText = '';
  }
  const crit = /\bcriteria\s*:?\s*(.+?)(?:[.?!]|$)/i.exec(line);
  if (crit) criteriaText = crit[1];
  const options = [...new Map(optionsText.split(optionSplit).map(tidyOption).filter((x) => x.length >= 1).map((x) => [x.toLowerCase(), x])).values()];
  if (options.length < 2 || options.length > 8) return null;
  const criteria = criteriaText ? listIn(criteriaText).map((c) => cleanText(c, 40)) : [];
  if (!criteria.length) return null;
  return {
    state: {
      title: options.slice(0, 3).join(' vs '),
      view: opts.view ?? 'matrix',
      options: options.map((name, i) => ({ id: `o${i + 1}`, name: name.charAt(0).toUpperCase() + name.slice(1), by: 'person' })),
      criteria: criteria.slice(0, 10).map((name, i) => ({ id: `c${i + 1}`, name: name.charAt(0).toUpperCase() + name.slice(1), weight: 5, by: 'person' })),
      scores: [],
    },
    says: 'Every criterion starts equally weighted and every score empty — how much each matters, and how each option does, is yours to say.',
  };
}

// ── for and against: pros and cons ───────────────────────────────────

/**
 * "pros and cons of moving to Denver" → the option and its not-doing it,
 * with the pros and cons they listed ("pros: cheaper rent, mountains; cons:
 * far from family") filed under it. Nothing is weighed, and nothing decided.
 */
export function prosConsFromWords(said: string): FromWords<unknown> | null {
  const first = said.split('\n')[0];
  const m = /\bpros?\s+(?:and|&|\/)\s+cons?\b(?:\s+(?:list|chart|table))?\s+(?:of|for|about|on)\s+(.+?)(?:[.?!:;]|$)/i.exec(first);
  const named = m?.[1] ? cleanText(m[1].replace(/^(?:the|my|our)\s+/i, '').replace(/^(?:whether\s+)?(?:to\s+|i\s+should\s+)/i, ''), 60) : '';
  const lists = { pro: [] as string[], con: [] as string[] };
  for (const part of said.split(/;|\n|\.\s+/)) {
    const g = /^\s*(pros?|cons?|for|against|upsides?|downsides?)\s*[:\-–—]\s*(.+)$/i.exec(part);
    if (!g) continue;
    const kind = /^(?:pros?|for|upsides?)$/i.test(g[1]) ? 'pro' : 'con';
    lists[kind].push(...listIn(g[2]));
  }
  if (!named && !lists.pro.length && !lists.con.length) return null;
  const option = named ? named.charAt(0).toUpperCase() + named.slice(1) : 'This option';
  const notes = [
    ...lists.pro.map((text) => ({ alt: 'a1', kind: 'pro', text, by: 'person' })),
    ...lists.con.map((text) => ({ alt: 'a1', kind: 'con', text, by: 'person' })),
  ];
  return {
    state: {
      title: `Pros and cons: ${option}`.slice(0, 80),
      decision: named ? `Pros and cons of ${named}` : 'Pros and cons',
      decisionBy: 'person',
      view: 'compare',
      alternatives: [
        { id: 'a1', name: option, by: 'person' },
        { id: 'a2', name: `Not ${option.charAt(0).toLowerCase()}${option.slice(1)}`, by: 'person' },
      ],
      notes,
    },
    ...(notes.length ? {} : { says: 'Nothing is listed yet — add each pro and con where it belongs. Nothing is weighed or decided for you.' }),
  };
}

// ── a decision tree: the choice and its branches ─────────────────────

/**
 * "a decision tree for whether to launch now or wait" → the decision at the
 * root and one branch per option they named. Probabilities and payoffs are
 * left out: they are added only where the person gives them, and what a
 * branch is worth is then computed, never written.
 */
export function decisionTreeFromWords(said: string): FromWords<unknown> | null {
  const first = said.split('\n')[0];
  const m =
    /\b(?:whether\s+(?:to\s+|i\s+should\s+|we\s+should\s+)?|should\s+(?:i|we)\s+|between\s+|choose\s+between\s+|deciding\s+(?:whether\s+(?:to\s+)?|between\s+)?)(.+?)(?:[?.!]|$)/i.exec(first);
  if (!m) return null;
  const parts = m[1].split(/\s*,\s*(?:or\s+)?|\s+or\s+|\s+and\s+(?=\S)/i).map((x) => cleanText(x.replace(/^(?:to\s+)/i, ''), 50)).filter((x) => x.length >= 2);
  const opts = parts.length === 1 ? [parts[0], `Not ${parts[0]}`] : parts;
  if (opts.length < 2 || opts.length > 6) return null;
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const question = `${cap(opts.slice(0, 3).join(' or '))}?`.slice(0, 60);
  // each option leads to an outcome whose worth is not known yet — never a payoff made up for it
  const nodes = [{ id: 'd', label: question, kind: 'decision', by: 'person' }, ...opts.map((o, i) => ({ id: `o${i + 1}`, label: cap(o), kind: 'outcome', by: 'person' }))];
  return {
    state: { title: question.replace(/\?$/, ''), view: 'decision', nodes, edges: opts.map((_, i) => ({ from: 'd', to: `o${i + 1}`, by: 'person' })), root: 'd' },
    says: 'Each branch is one of your options. Add what could happen next, with chances and payoffs only where you know them — what each branch is worth is then computed.',
  };
}
