// lib/preview/numfmt.ts — a spreadsheet's number, shown the way the spreadsheet shows it.
//
// The reading of a workbook (lib/docs/xlsx.ts) keeps the STORED number, because
// that is what Socria reasons with. The preview is the other half: what a person
// sees in Excel — "£1,234.50", "12.5%", "3 Mar 2026", "1.20E+05", a negative in
// brackets and red. This is that, for the formats people actually use: sections
// (positive;negative;zero;text), literals, thousands, decimals, percent,
// scientific, currency, fractions left as decimals, dates and times, colours.
//
// PURE.

export interface Shown {
  text: string;
  /** a [Red]-style colour from the format, as CSS */
  color?: string;
}

/** Excel's built-in number formats by id (the ones a file may use without writing them out). */
export const BUILTIN_FORMATS: Record<number, string> = {
  0: 'General',
  1: '0',
  2: '0.00',
  3: '#,##0',
  4: '#,##0.00',
  5: '"$"#,##0_);("$"#,##0)',
  6: '"$"#,##0_);[Red]("$"#,##0)',
  7: '"$"#,##0.00_);("$"#,##0.00)',
  8: '"$"#,##0.00_);[Red]("$"#,##0.00)',
  9: '0%',
  10: '0.00%',
  11: '0.00E+00',
  12: '# ?/?',
  13: '# ??/??',
  14: 'm/d/yyyy',
  15: 'd-mmm-yy',
  16: 'd-mmm',
  17: 'mmm-yy',
  18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM',
  20: 'h:mm',
  21: 'h:mm:ss',
  22: 'm/d/yyyy h:mm',
  37: '#,##0_);(#,##0)',
  38: '#,##0_);[Red](#,##0)',
  39: '#,##0.00_);(#,##0.00)',
  40: '#,##0.00_);[Red](#,##0.00)',
  44: '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)',
  45: 'mm:ss',
  46: '[h]:mm:ss',
  47: 'mm:ss.0',
  48: '##0.0E+0',
  49: '@',
};

const COLORS: Record<string, string> = {
  red: '#c0392b',
  blue: '#1f5fbf',
  green: '#1e7b3a',
  black: 'inherit',
  white: '#ffffff',
  yellow: '#a08000',
  magenta: '#a0207a',
  cyan: '#137a8a',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Split a format into its sections, honouring quotes and escapes. */
function sections(code: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '"') q = !q;
    if (c === '\\' && !q) {
      cur += c + (code[i + 1] ?? '');
      i++;
      continue;
    }
    if (c === ';' && !q) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

/** The format with quoted literals and escapes taken out — for deciding what kind it is. */
const bare = (s: string) => s.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '');

export function isDateCode(code: string): boolean {
  const b = bare(code).replace(/General/gi, '');
  return /[dmyhs]/i.test(b) && !/^[\s#0?.,%E+\-()_*/]*$/i.test(b);
}

/** A serial date (1900 or 1904 system) as its parts, in UTC. */
function serialParts(n: number, date1904: boolean) {
  const days = Math.floor(n);
  const ms = Math.round((n - days) * 86_400_000);
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  // the 1900 system counts a 29 February 1900 that never was
  const d = new Date(base + (date1904 ? days : days >= 60 ? days - 1 : days) * 86_400_000 + ms);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), cs: Math.floor(d.getUTCMilliseconds() / 10), total: n };
}

function formatDate(n: number, sec: string, date1904: boolean): string {
  const p = serialParts(n, date1904);
  const ampm = /AM\/PM|A\/P/i.test(sec);
  const out: string[] = [];
  // tokens, so an "m" can be judged minutes (after an h, before an s) or months
  const toks: { t: string; lit?: boolean }[] = [];
  for (let i = 0; i < sec.length; ) {
    const c = sec[i];
    if (c === '"') {
      const j = sec.indexOf('"', i + 1);
      toks.push({ t: sec.slice(i + 1, j < 0 ? undefined : j), lit: true });
      i = j < 0 ? sec.length : j + 1;
      continue;
    }
    if (c === '\\') {
      toks.push({ t: sec[i + 1] ?? '', lit: true });
      i += 2;
      continue;
    }
    if (c === '[') {
      const j = sec.indexOf(']', i);
      const inner = sec.slice(i + 1, j < 0 ? undefined : j);
      if (/^h+$/i.test(inner)) toks.push({ t: `[${inner.toLowerCase()}]` });
      else if (/^m+$/i.test(inner)) toks.push({ t: `[${inner.toLowerCase()}]` });
      else if (/^s+$/i.test(inner)) toks.push({ t: `[${inner.toLowerCase()}]` });
      i = j < 0 ? sec.length : j + 1;
      continue;
    }
    if (/AM\/PM/i.test(sec.slice(i, i + 5))) {
      toks.push({ t: 'AM/PM' });
      i += 5;
      continue;
    }
    if (/A\/P/i.test(sec.slice(i, i + 3))) {
      toks.push({ t: 'A/P' });
      i += 3;
      continue;
    }
    const run = /^(y+|m+|d+|h+|s+|0+)/i.exec(sec.slice(i));
    if (run) {
      toks.push({ t: run[1].toLowerCase() });
      i += run[1].length;
      continue;
    }
    if (c === '_' || c === '*') {
      i += 2;
      continue;
    }
    toks.push({ t: c, lit: true });
    i++;
  }
  const isTime = (t: string | undefined) => !!t && (/^h+$/.test(t) || /^\[h+\]$/.test(t));
  const isSec = (t: string | undefined) => !!t && /^s+$/.test(t);
  const pad = (x: number, w = 2) => String(x).padStart(w, '0');
  for (let k = 0; k < toks.length; k++) {
    const { t, lit } = toks[k];
    if (lit) {
      out.push(t);
      continue;
    }
    if (/^y+$/.test(t)) out.push(t.length <= 2 ? pad(p.y % 100) : String(p.y));
    else if (/^m+$/.test(t)) {
      // minutes when it follows an hour or comes before seconds
      const prev = toks.slice(0, k).reverse().find((x) => !x.lit)?.t;
      const next = toks.slice(k + 1).find((x) => !x.lit)?.t;
      if ((isTime(prev) || isSec(next)) && t.length <= 2) out.push(t.length === 2 ? pad(p.mi) : String(p.mi));
      else if (t.length === 1) out.push(String(p.mo + 1));
      else if (t.length === 2) out.push(pad(p.mo + 1));
      else if (t.length === 3) out.push(MONTHS[p.mo].slice(0, 3));
      else if (t.length === 5) out.push(MONTHS[p.mo][0]);
      else out.push(MONTHS[p.mo]);
    } else if (/^d+$/.test(t)) {
      if (t.length === 1) out.push(String(p.d));
      else if (t.length === 2) out.push(pad(p.d));
      else if (t.length === 3) out.push(DAYS[p.wd].slice(0, 3));
      else out.push(DAYS[p.wd]);
    } else if (/^h+$/.test(t)) {
      const h = ampm ? p.h % 12 || 12 : p.h;
      out.push(t.length >= 2 ? pad(h) : String(h));
    } else if (/^\[h+\]$/.test(t)) out.push(String(Math.floor(p.total * 24)));
    else if (/^\[m+\]$/.test(t)) out.push(String(Math.floor(p.total * 1440)));
    else if (/^\[s+\]$/.test(t)) out.push(String(Math.floor(p.total * 86400)));
    else if (/^s+$/.test(t)) out.push(t.length >= 2 ? pad(p.s) : String(p.s));
    else if (/^0+$/.test(t)) out.push(pad(p.cs, 2).slice(0, t.length));
    else if (t === 'AM/PM') out.push(p.h < 12 ? 'AM' : 'PM');
    else if (t === 'A/P') out.push(p.h < 12 ? 'A' : 'P');
    else out.push(t);
  }
  return out.join('');
}

/** Group an integer string's digits in threes. */
const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function formatNumber(n: number, sec: string): string {
  // literals kept in order around the number; padding (_x) and fill (*x) take no room here
  let pre = '';
  let post = '';
  let pattern = '';
  let seen = false;
  let after = false;
  for (let i = 0; i < sec.length; i++) {
    const c = sec[i];
    let lit: string | null = null;
    if (c === '"') {
      const j = sec.indexOf('"', i + 1);
      lit = sec.slice(i + 1, j < 0 ? undefined : j);
      i = j < 0 ? sec.length : j;
    } else if (c === '\\') {
      lit = sec[i + 1] ?? '';
      i++;
    } else if (c === '_' || c === '*') {
      i++;
      lit = c === '_' ? '' : '';
    } else if (c === '[') {
      const j = sec.indexOf(']', i);
      const inner = sec.slice(i + 1, j < 0 ? undefined : j);
      const cur = /^\$([^-\]]*)/.exec(inner);
      lit = cur ? cur[1] : '';
      i = j < 0 ? sec.length : j;
    } else if (/[0#?.,%E+\-]/.test(c) && !(after && /[+\-]/.test(c) && !/E$/i.test(pattern))) {
      if (/[+\-]/.test(c) && !/E$/i.test(pattern)) lit = c;
      else {
        pattern += c;
        seen = true;
        continue;
      }
    } else if (c === 'e') {
      pattern += 'E';
      seen = true;
      continue;
    } else lit = c;
    if (lit !== null) {
      if (seen) {
        after = true;
        post += lit;
      } else pre += lit;
    }
  }
  if (!pattern) return pre + post;
  const pct = (pattern.match(/%/g) || []).length;
  let v = Math.abs(n) * Math.pow(100, pct);
  const core = pattern.replace(/%/g, '');
  const sci = /E[+\-]/i.exec(core);
  if (sci) {
    const [mant, exp] = [core.slice(0, sci.index), core.slice(sci.index + 2)];
    const decs = (mant.split('.')[1] ?? '').length;
    const intDigits = Math.max(1, (mant.split('.')[0].match(/[0#?]/g) || []).length);
    let e = v === 0 ? 0 : Math.floor(Math.log10(v));
    if (intDigits > 1) e = Math.floor(e / intDigits) * intDigits;
    let m = v / Math.pow(10, e);
    if (Number(m.toFixed(decs)) >= Math.pow(10, intDigits)) {
      m /= Math.pow(10, intDigits);
      e += intDigits;
    }
    const es = String(Math.abs(e)).padStart(Math.max(1, exp.replace(/[^0]/g, '').length), '0');
    return `${pre}${m.toFixed(decs)}E${e < 0 ? '-' : sci[0][1] === '+' ? '+' : ''}${es}${'%'.repeat(pct)}${post}`;
  }
  // a trailing comma scales by a thousand per comma
  const trail = /,+$/.exec(core.replace(/\..*$/, (m) => m.replace(/,+$/, '')))?.[0]?.length ?? 0;
  if (trail) v /= Math.pow(1000, trail);
  const [ip, dp = ''] = core.replace(/,+$/, '').split('.');
  const decs = (dp.match(/[0#?]/g) || []).length;
  const minDecs = (dp.match(/0/g) || []).length;
  let s = v.toFixed(decs);
  if (decs > minDecs) {
    // optional decimals (#) drop their trailing zeros
    s = s.replace(new RegExp(`0{1,${decs - minDecs}}$`), '');
    if (s.endsWith('.')) s = minDecs ? s : s.slice(0, -1);
  }
  let [i, d] = s.split('.');
  const minInt = (ip.match(/0/g) || []).length;
  if (i === '0' && minInt === 0 && d) i = '';
  i = i.padStart(minInt, '0');
  if (/,/.test(ip)) i = group(i);
  const num = d !== undefined && d !== '' ? `${i}.${d}` : i;
  return `${pre}${num}${'%'.repeat(pct)}${post}`;
}

/**
 * A cell's value as the spreadsheet shows it. `value` is the stored text (a
 * number as written in the file, or a string); `code` its number format.
 */
export function formatCell(value: string, code: string | undefined, date1904 = false): Shown {
  const raw = value ?? '';
  const isNum = /^-?\d*\.?\d+(?:[eE][-+]?\d+)?$/.test(raw.trim());
  if (!code || /^general$/i.test(code.trim())) return { text: isNum ? general(Number(raw)) : raw };
  const secs = sections(code);
  if (!isNum) {
    // text goes through the fourth section, where @ stands for it
    const t = secs[3] ?? (secs.length === 1 && /@/.test(secs[0]) ? secs[0] : null);
    if (t === null) return { text: raw };
    return { text: t.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1').replace(/_.|\*./g, '').replace(/@/g, raw).replace(/\[[^\]]*\]/g, '') };
  }
  const n = Number(raw);
  let sec = secs[0];
  let neg = n < 0;
  // a section with a condition ([>100]) is rare; it is read as the plain section it is
  if (n < 0 && secs.length >= 2 && secs[1].trim() !== '') {
    sec = secs[1];
    neg = false; // the negative section writes its own sign or brackets
  } else if (n === 0 && secs.length >= 3) sec = secs[2];
  const colorM = /\[(red|blue|green|black|white|yellow|magenta|cyan)\]/i.exec(sec);
  const color = colorM ? COLORS[colorM[1].toLowerCase()] : undefined;
  const clean = sec.replace(/\[(red|blue|green|black|white|yellow|magenta|cyan|color\s*\d+)\]/gi, '').replace(/\[[<>=][^\]]*\]/g, '');
  if (/^\s*general\s*$/i.test(clean)) return { text: (neg ? '-' : '') + general(Math.abs(n)), ...(color ? { color } : {}) };
  if (isDateCode(clean)) return { text: formatDate(n, clean, date1904), ...(color ? { color } : {}) };
  const text = formatNumber(n, clean);
  return { text: (neg && /\d/.test(text) ? '-' : '') + text, ...(color ? { color } : {}) };
}

/** "General": up to 11 significant characters, as Excel shows a number in a default-width column. */
export function general(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1e11 || a < 1e-9) return n.toExponential(5).replace(/\.?0+e/, 'E').replace('e', 'E').replace(/E\+?(-?)(\d)$/, 'E+$1$2'.replace('+-', '-'));
  return String(Number(n.toPrecision(11)));
}
