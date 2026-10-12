// lib/docs/text.ts — numbers, signs and words, read the way documents write them.
//
// A document's numbers are where a reading most often goes quietly wrong: a
// minus sign drawn as an en dash, a loss written "(1,200)", a percentage whose
// sign sat in a separate glyph, a unit two spaces away. Every check that a
// number survived extraction, and every check that a claim's number is in its
// source, reads numbers through here — so "−1,200", "-1,200", "–1,200" and
// "(1,200)" are all the same negative twelve hundred, and "2019–2021" is a
// range, not a negative year.
//
// PURE.

export interface NumberToken {
  /** as written */
  raw: string;
  value: number;
  /** written as negative — a minus, a dash used as one, or accounting brackets */
  negative: boolean;
  /** what it is measured in, when written beside it: "%", "$", "kg", "°C" */
  unit?: string;
  /** where it starts in the text */
  at: number;
}

const DASHES = '‐‑‒–—―−﹣－';
const MINUS_LIKE = new RegExp(`[-${DASHES}]`);
const CURRENCY = '$€£¥₹';

/** Units written after a number, longest first so "km/h" wins over "km". */
const UNITS = [
  'km/h', 'm/s²', 'm/s', 'kg/m³', 'mol/L', 'mg/dL', 'mmHg', 'kWh', 'MWh', 'GWh', 'kPa', 'MPa', 'GPa', 'kHz', 'MHz', 'GHz', 'kcal',
  'mL', 'ml', 'μm', 'µm', 'nm', 'mm', 'cm', 'km', 'mg', 'kg', 'μg', 'µg', 'ms', 'μs', 'µs', 'ns', 'kJ', 'MJ', 'kW', 'MW', 'GW', 'kV',
  'mA', 'Pa', 'Hz', 'dB', 'ppm', 'ppb', 'mol', 'bn', 'mn', '°C', '°F', '°', '%', '‰', 'kN', 'Nm', 'lb', 'lbs', 'oz', 'ft', 'in', 'mi',
  'yr', 'yrs', 'hrs', 'hr', 'min', 'sec', 'h', 's', 'g', 'm', 'K', 'J', 'W', 'V', 'A', 'N', 'L', 'M', 'k',
];
const UNIT_RX = new RegExp(`^\\s?(${UNITS.map((u) => u.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')})(?![A-Za-z0-9])`);

const NUM = new RegExp(
  // an opening bracket (accounting), a sign, a currency, the digits, a decimal part, an exponent, a closing bracket
  // (whitespace only AFTER a sign or a currency, so a match never starts on a space)
  String.raw`(\()?(?:([+\-${DASHES}±])\s?)?(?:([${CURRENCY}])\s?)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:[eE]([+\-${DASHES}]?\d{1,3}))?(\))?`,
  'g'
);

/**
 * Every number written in some text, with its sign and unit as written.
 * A dash is a minus only where it could not be a range or a hyphen — after
 * a space, an opening bracket, an operator or the start, never after a digit
 * or a letter ("2019–2021", "COVID-19", "x-3" are not negatives).
 */
export function numbersIn(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  if (!text) return out;
  NUM.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NUM.exec(text))) {
    const start = m.index;
    const [whole, open, sign, cur, digits, exp, close] = m;
    // part of a word or an identifier ("Q1", "H2O", "ID42") is not a number in the text
    const prev = text[start - 1] ?? '';
    if (!open && !sign && !cur && /[A-Za-z_]/.test(prev)) continue;
    if (!digits) continue;
    // a dash is a minus only where it could not be a range or a hyphen
    const before = text[start - 1] ?? '';
    const negative0 = !!sign && sign !== '+' && sign !== '±' && !/[0-9A-Za-z)\]]/.test(before);
    const accounting = !!open && !!close && !sign;
    const negative = negative0 || accounting;
    let value = Number(digits.replace(/,/g, ''));
    if (exp) value *= Math.pow(10, Number(exp.replace(new RegExp(`[${DASHES}]`), '-')));
    if (!Number.isFinite(value)) continue;
    if (negative) value = -value;
    const after = text.slice(start + whole.length, start + whole.length + 8);
    const u = UNIT_RX.exec(after);
    const unit = cur ? cur : u ? u[1] : undefined;
    // the raw text: a sign only when it was read as one, never a range's dash
    const raw = sign && !negative0 ? whole.slice(whole.indexOf(sign) + sign.length) : whole;
    out.push({ raw: raw.trim(), value, negative, ...(unit ? { unit } : {}), at: start });
  }
  return out;
}

/** A number as a comparable key: its value to 10 significant figures, its sign kept. */
export function numberKey(n: number): string {
  if (!Number.isFinite(n)) return 'NaN';
  return String(Number(n.toPrecision(10)));
}

/** The multiset of numbers in some text, as keys → counts. */
export function numberBag(text: string): Map<string, number> {
  const bag = new Map<string, number>();
  for (const t of numbersIn(text)) bag.set(numberKey(t.value), (bag.get(numberKey(t.value)) ?? 0) + 1);
  return bag;
}

/** Ligatures, full-width forms and the like folded; dashes and quotes made plain; spaces collapsed. */
export function plain(s: string): string {
  return s
    .normalize('NFKC')
    .replace(new RegExp(`[${DASHES}]`, 'g'), '-')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/ | | | /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** For matching: plain, lower case, punctuation off. */
export function matchable(s: string): string {
  return plain(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.%-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(
  'the a an and or but of to in on at by for with from as is are was were be been being this that these those it its into than then there their they them we our you your he she his her not no nor so such which who whom whose what when where why how all any both each few more most other some can could may might must shall should will would do does did done have has had having also only very just about above after again against before below between during further here once over same too under until up out off while because through'.split(
    ' '
  )
);

/** The words in some text that carry its meaning — three letters or more, not the glue. */
export function contentWords(s: string): string[] {
  return matchable(s)
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP.has(w) && /\p{L}/u.test(w));
}

/** How much of `a`'s content `b` holds: 0..1, the share of a's content words found in b. */
export function coverage(a: string, b: string): number {
  const aw = contentWords(a);
  if (!aw.length) return 0;
  const bw = new Set(contentWords(b));
  let hit = 0;
  for (const w of aw) if (bw.has(w) || bw.has(w.replace(/s$/, '')) || bw.has(`${w}s`)) hit++;
  return hit / aw.length;
}

/** Characters that mean a font's glyphs could not be decoded: the replacement mark, private use, "(cid:12)". */
export function undecodable(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 0xfffd || (c >= 0xe000 && c <= 0xf8ff) || (c >= 0xf0000 && c <= 0x10ffff)) n++;
  }
  n += (s.match(/\(cid:\d+\)/g) ?? []).length * 3;
  return n;
}

/** Mathematical characters — what makes a line read as an equation rather than prose. */
export const MATH_CHARS = /[=≠≈≤≥<>±∓×÷·∑∏∫∮∂∇√∞∈∉⊂⊃∪∩∀∃→←↔⇒⇔^_αβγδεζηθικλμνξοπρστυφχψωΓΔΘΛΞΠΣΦΨΩ′″]/g;

/** Words that are the start of a sentence-ish line — used to tell a paragraph from a label. */
export function wordsIn(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** A caption: "Figure 3:", "Table 2.", "Fig. 4b —", "Exhibit iv)". */
export const CAPTION = /^(fig(?:ure)?|table|tab|chart|exhibit|plate|scheme|graph|diagram)\.?\s*([0-9]+|[ivxlc]+)[a-z]?\s*[:.\-–—)]\s*\S/i;
/** What a caption is a caption of. */
export const captionKind = (t: string): 'figure' | 'table' | null =>
  /^(fig(?:ure)?|chart|plate|scheme|graph|diagram)\b/i.test(t) ? 'figure' : /^(table|tab|exhibit)\b/i.test(t) ? 'table' : null;
/** The mark that starts a list item: a bullet, "3.", "(b)", "iv)". */
export const LIST_MARK = /^(?:[•●○◦▪▫■□‣⁃∙·\-–—*]|\(?\d{1,2}[.)]|\(?[a-z][.)]|\(?(?:i{1,3}|iv|v|vi{0,3}|ix|x)[.)])\s+/i;
/** A page number standing alone: "12", "Page 3 of 9", "- 4 -", "xii". */
export const PAGE_NUM = /^(?:page\s*)?(?:\d{1,4}|[ivxlc]{1,6})(?:\s*(?:of|\/)\s*\d{1,4})?$|^[-–—]\s*\d{1,4}\s*[-–—]$/i;

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ' };
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎' };

/**
 * Raised or lowered text in the Unicode characters that keep it so — x² and
 * H₂O read the same in any font — or null when one of its characters has no
 * such form (then the caller writes it plainly, never half-converted).
 */
export function toScript(s: string, where: 'sup' | 'sub'): string | null {
  const map = where === 'sup' ? SUP : SUB;
  const chars = [...s];
  return chars.length && chars.every((c) => map[c]) ? chars.map((c) => map[c]).join('') : null;
}

