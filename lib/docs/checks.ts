// lib/docs/checks.ts — checking a reading against the file it came from.
//
// A reading is not trusted because it looks right. Each document is checked
// against what the file itself holds, and what the checks find is shown with
// the document and carried to every model that reads it:
//
//   numbers     every number the file's text holds is in the reading, and the
//               reading holds no number the file does not — signs included,
//               so a dropped minus is caught (single digits are left out of
//               the comparison: they are exponents, footnote marks and list
//               numbers as often as values)
//   minus       negatives in the file are negatives in the reading
//   duplicates  the same passage read twice; text the file drew twice (fake
//               bold) is reported as removed
//   tables      ragged rows, a one-column "table", words in a column of numbers
//   equations   characters that could not be decoded; brackets that do not pair
//   encoding    pages whose text is mostly undecodable — a font without a map
//   scans       pages that are images and wait for a vision reading
//   unread      pages past the reading limit
//   empty       nothing could be read at all
//
// PURE.

import { numbersIn, numberKey, undecodable } from './text';
import type { DocCheck, SourceDoc } from './types';

/**
 * The text of a page as the file holds it — every character, in any order.
 * n = 0 is the whole document, for formats whose pages are not fixed (a Word
 * file flows; where its pages break depends on the printer).
 */
export interface RawPage {
  n: number;
  text: string;
}

const SUPS: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '⁻': '-', '₋': '-' };
// a raised or lowered run is its own number, never more digits of the one before
// it: "10⁶" is 10 and 6, "3.5¹²" is 3.5 and the mark 12 — on both sides alike
const unscript = (s: string) => s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉⁻₋]+/g, (run) => ` ${[...run].map((c) => SUPS[c] ?? c).join('')}`);

/** The numbers worth comparing in some text: values, not exponents or marks. */
function valueBag(text: string): Map<string, { n: number; neg: number }> {
  const bag = new Map<string, { n: number; neg: number }>();
  for (const t of numbersIn(unscript(text))) {
    const digits = t.raw.replace(/[^0-9]/g, '');
    if (digits.length < 2 && !/[.,]/.test(t.raw)) continue;
    const k = numberKey(Math.abs(t.value));
    const e = bag.get(k) ?? { n: 0, neg: 0 };
    e.n++;
    if (t.negative) e.neg++;
    bag.set(k, e);
  }
  return bag;
}

const pagesText = (doc: SourceDoc, n: number) =>
  [...doc.blocks.filter((b) => (n === 0 || b.page === n) && b.kind !== 'table').map((b) => b.text), ...doc.tables.filter((t) => n === 0 || t.page === n).map((t) => t.rows.flat().join(' '))].join('\n');

function list(xs: (number | string)[], max = 4): string {
  const s = xs.slice(0, max).join(', ');
  return xs.length > max ? `${s} and ${xs.length - max} more` : s;
}

/** Every check, run over a document and (where there is one) the raw text of its pages. */
export function checkDoc(doc: SourceDoc, raw: RawPage[] = [], extra: { overprints?: number; notes?: DocCheck[] } = {}): DocCheck[] {
  const checks = runChecks(doc, raw, extra);
  // what the reader itself noticed joins the check of the same kind, at the graver level
  const rank = { ok: 0, warn: 1, fail: 2 } as const;
  for (const n of extra.notes ?? []) {
    const c = checks.find((x) => x.id === n.id);
    if (!c) {
      checks.push(n);
      continue;
    }
    c.says = c.level === 'ok' && n.level !== 'ok' ? n.says : `${c.says} ${n.says}`;
    if (rank[n.level] > rank[c.level]) c.level = n.level;
    if (n.pages?.length) c.pages = [...new Set([...(c.pages ?? []), ...n.pages])];
    if (n.blocks?.length) c.blocks = [...new Set([...(c.blocks ?? []), ...n.blocks])];
  }
  return checks;
}

function runChecks(doc: SourceDoc, raw: RawPage[], extra: { overprints?: number }): DocCheck[] {
  const checks: DocCheck[] = [];
  if (!doc.blocks.length && !doc.pages.some((p) => p.ocr === 'needed')) {
    checks.push({ id: 'empty', level: 'fail', says: 'Nothing in it could be read.' });
    return checks;
  }

  // NUMBERS AND SIGNS — the file's text against the reading, page by page
  if (raw.length) {
    const missing: { page: number; n: string }[] = [];
    const extraNums: { page: number; n: string }[] = [];
    const signs: number[] = [];
    for (const r of raw) {
      const want = valueBag(r.text);
      const got = valueBag(pagesText(doc, r.n));
      for (const [k, w] of want) {
        const g = got.get(k);
        if (!g || g.n < w.n) missing.push({ page: r.n, n: k });
        else if (g.neg < w.neg) signs.push(r.n);
      }
      for (const [k, g] of got) {
        const w = want.get(k);
        if (!w || w.n < g.n) extraNums.push({ page: r.n, n: k });
      }
    }
    if (missing.length || extraNums.length) {
      const parts = [
        missing.length ? `${missing.length} number${missing.length === 1 ? '' : 's'} in the file did not come through (${list(missing.map((m) => m.n))})` : '',
        extraNums.length ? `${extraNums.length} appear in the reading but not in the file (${list(extraNums.map((m) => m.n))})` : '',
      ].filter(Boolean);
      const pages = [...new Set([...missing, ...extraNums].map((m) => m.page).filter((p) => p > 0))];
      checks.push({ id: 'numbers', level: 'fail', says: `${parts.join('; ')}.`, ...(pages.length ? { pages } : {}) });
    } else {
      checks.push({ id: 'numbers', level: 'ok', says: 'Every number in the file’s text is in the reading, and nothing else.' });
    }
    const signPages = [...new Set(signs)].filter((p) => p > 0);
    if (signs.length && !signPages.length) checks.push({ id: 'minus', level: 'fail', says: 'A minus sign was lost.' });
    else if (signs.length) checks.push({ id: 'minus', level: 'fail', says: `A minus sign was lost on page${signPages.length === 1 ? '' : 's'} ${list(signPages)}.`, pages: signPages });
    else checks.push({ id: 'minus', level: 'ok', says: 'Negative numbers kept their signs.' });
  }

  // DUPLICATES — a passage read more times than the file holds it
  const squash = (t: string) => t.replace(/\s+/g, '');
  const rawOf = (page: number) => squash(raw.filter((r) => r.n === 0 || r.n === page).map((r) => r.text).join(''));
  const timesIn = (hay: string, needle: string) => {
    let n = 0;
    for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) n++;
    return n;
  };
  const groups = new Map<string, string[]>();
  for (const b of doc.blocks) {
    if (b.kind === 'header' || b.kind === 'footer' || b.text.length < 40) continue;
    const k = `${b.page}:${b.text}`;
    groups.set(k, [...(groups.get(k) ?? []), b.id]);
  }
  const dupes: string[] = [];
  for (const [k, ids] of groups) {
    if (ids.length < 2) continue;
    const page = Number(k.slice(0, k.indexOf(':')));
    const held = raw.length ? timesIn(rawOf(page), squash(k.slice(k.indexOf(':') + 1))) : 1;
    if (ids.length > Math.max(1, held)) dupes.push(...ids.slice(Math.max(1, held)));
  }
  if (dupes.length) checks.push({ id: 'duplicates', level: 'warn', says: `${dupes.length} passage${dupes.length === 1 ? ' was' : 's were'} read twice on the same page.`, blocks: dupes });
  else if (extra.overprints) checks.push({ id: 'duplicates', level: 'ok', says: `Text the file drew twice (${extra.overprints} time${extra.overprints === 1 ? '' : 's'}, for bold) was kept once.` });

  // TABLES
  const tableNotes: string[] = [];
  const tablePages: number[] = [];
  for (const t of doc.tables) {
    const width = Math.max(...t.rows.map((r) => r.length));
    if (width < 2) {
      tableNotes.push(`${t.id} has one column`);
      tablePages.push(t.page);
      continue;
    }
    const body = t.rows.slice(t.head);
    for (let c = 0; c < width; c++) {
      const vals = body.map((r) => (r[c] ?? '').trim()).filter(Boolean);
      // a number as tables write them — "1,250", "-3.1%", "(450)", and "1200,5" where a comma is the decimal point
      const nums = vals.filter((v) => (numbersIn(v).length === 1 || /^[-−]?\d{1,3}(?:[.\s]\d{3})*,\d+$|^[-−]?\d+,\d+$/.test(v)) && v.replace(/[\d.,%()\-−–+$€£¥₹\s]/g, '').length <= 4);
      if (vals.length >= 3 && nums.length / vals.length >= 0.6 && nums.length < vals.length) {
        tableNotes.push(`a column of ${t.id} (p. ${t.page}) is mostly numbers with ${vals.length - nums.length} other entr${vals.length - nums.length === 1 ? 'y' : 'ies'}`);
        tablePages.push(t.page);
      }
    }
    const empty = body.reduce((n, r) => n + r.filter((c) => !c.trim()).length, 0);
    if (body.length && empty / (body.length * width) > 0.4) {
      tableNotes.push(`${t.id} (p. ${t.page}) has many empty cells — its columns may not have lined up`);
      tablePages.push(t.page);
    }
  }
  if (doc.tables.length) {
    checks.push(
      tableNotes.length
        ? { id: 'tables', level: 'warn', says: `${tableNotes.slice(0, 3).join('; ')}.`, pages: [...new Set(tablePages)] }
        : { id: 'tables', level: 'ok', says: `${doc.tables.length} table${doc.tables.length === 1 ? '' : 's'} read with regular rows and columns.` }
    );
  }

  // EQUATIONS
  const eqs = doc.blocks.filter((b) => b.kind === 'equation');
  const badEq = eqs.filter((b) => undecodable(b.text) > 0 || !paired(b.text));
  if (eqs.length) {
    checks.push(
      badEq.length
        ? { id: 'equations', level: 'warn', says: `${badEq.length} of ${eqs.length} equation${eqs.length === 1 ? '' : 's'} may have lost symbols — check them against the page.`, blocks: badEq.map((b) => b.id) }
        : { id: 'equations', level: 'ok', says: `${eqs.length} equation${eqs.length === 1 ? '' : 's'} read with every symbol decoded.` }
    );
  }

  // ENCODING, SCANS, UNREAD
  const garbled = doc.blocks.filter((b) => (b.conf ?? 1) <= 0.4).map((b) => b.page);
  if (garbled.length) checks.push({ id: 'encoding', level: 'fail', says: `The text on page${new Set(garbled).size === 1 ? '' : 's'} ${list([...new Set(garbled)])} is mostly characters the file does not map to letters.`, pages: [...new Set(garbled)] });
  const scans = doc.pages.filter((p) => p.ocr === 'needed').map((p) => p.n);
  const read = doc.pages.filter((p) => p.ocr === 'done').map((p) => p.n);
  const failed = doc.pages.filter((p) => p.ocr === 'failed').map((p) => p.n);
  if (scans.length) checks.push({ id: 'scans', level: 'warn', says: `Page${scans.length === 1 ? '' : 's'} ${list(scans)} ${scans.length === 1 ? 'is a picture' : 'are pictures'} with no text of ${scans.length === 1 ? 'its' : 'their'} own${read.length ? ` (page${read.length === 1 ? '' : 's'} ${list(read)} ${read.length === 1 ? 'has' : 'have'} been read from the image)` : ''} — not yet read.`, pages: scans });
  else if (failed.length) checks.push({ id: 'scans', level: 'fail', says: `Page${failed.length === 1 ? '' : 's'} ${list(failed)} could not be read from the image.`, pages: failed });
  else if (read.length) checks.push({ id: 'scans', level: 'ok', says: `Page${read.length === 1 ? '' : 's'} ${list(read)} ${read.length === 1 ? 'was' : 'were'} read from the image of the page, and marked as such.`, pages: read });
  if (doc.unread) checks.push({ id: 'unread', level: 'warn', says: `Pages ${doc.unread.from}–${doc.unread.to} were not read (the first ${doc.unread.from - 1} were).` });
  return checks;
}

/** Whether the brackets in some text pair up. */
function paired(s: string): boolean {
  const open = '([{';
  const close = ')]}';
  const st: string[] = [];
  for (const ch of s) {
    if (open.includes(ch)) st.push(ch);
    else if (close.includes(ch)) {
      const o = st.pop();
      if (o === undefined || open.indexOf(o) !== close.indexOf(ch)) return false;
    }
  }
  return st.length === 0;
}
