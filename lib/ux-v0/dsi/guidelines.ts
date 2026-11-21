// lib/ux-v0/dsi/guidelines.ts — brand guidelines read as evidence: what they state, what can be read off them, and
// what they leave unsaid.
//
// The text arrives as blocks (a swatch's caption, a paragraph, a list item, a table row) with their page. From them:
//
//   colours      each named colour with the values written beside it (HEX, RGB, CMYK, Pantone) — explicit; a swatch
//                drawn without a screen value is matched to its caption by order (extracted); a colour given only in
//                CMYK gets an approximate screen value labelled as SocriaUX's conversion (inferred), never as the brand's
//   typefaces    families named with their use (headlines, body) and weights — explicit
//   type scale   sizes stated in pt or px
//   rules        do's and don'ts, never/always/must statements, with a check where one can be read exactly (clear space,
//                minimum size, palette only, no gradients, headline case, contrast)
//   statements   personality, tone, imagery, layout and graphic devices, from their sections
//   unknowns     the categories the guidelines do not cover, said
//
// Every fact carries its page and the words it was read from. Nothing is invented: a rule the guidelines do not state
// is not added, and SocriaUX's own readings are labelled as such.

import { FONTS } from '../fonts';
import { colourFromDtcg } from './colour';
import { emptyContent, uid, type IntelItem, type IntelKind, type RoleBinding, type RuleCheck, type SourceRef, type SystemContent, type Token } from './schema';

export interface GBlock {
  id: number;
  page: number;
  lines: string[];
  /** the block is a heading (large type, or # in Markdown) */
  heading?: boolean;
  level?: number;
}

export interface ColourFact {
  name: string;
  hex?: string;
  rgb?: string;
  cmyk?: string;
  pantone?: string;
  roleHint?: string;
  page: number;
  quote: string;
  basis: 'explicit' | 'extracted' | 'inferred';
  note?: string;
}

export interface FontFact {
  family: string;
  role?: 'display' | 'body' | 'mono';
  weights: number[];
  page: number;
  quote: string;
}

export interface SizeFact {
  label: string;
  px: number;
  stated: string;
  page: number;
  quote: string;
}

export interface GuidelineFacts {
  name: string;
  description: string;
  colours: ColourFact[];
  fonts: FontFact[];
  sizes: SizeFact[];
  items: IntelItem[];
  sections: { title: string; page: number; kind: string }[];
  unknown: string[];
}

const SECTION_KINDS: [string, RegExp][] = [
  ['colour', /colou?r|palette|swatch/i],
  ['typography', /typograph|typeface|font|type scale|lettering/i],
  ['logo', /logo|logotype|wordmark|brand ?mark|symbol|lockup|clear ?space|minimum size/i],
  ['imagery', /imagery|photograph|illustration|picture/i],
  ['tone', /tone|voice|messaging|copy ?writing/i],
  ['personality', /personality|values|essence|character|who we are|our brand|mission/i],
  ['composition', /layout|grid|composition|spacing|white ?space/i],
  ['motif', /pattern|graphic device|motif|texture|graphic element/i],
  ['rules', /do'?s|don'?ts|usage|rules|misuse/i],
];

export const sectionKind = (title: string) => SECTION_KINDS.find(([, re]) => re.test(title))?.[0] ?? 'other';

const WEIGHTS: [RegExp, number][] = [
  [/\bthin|hairline\b/i, 100],
  [/\bextra ?light|ultra ?light\b/i, 200],
  [/\blight\b/i, 300],
  [/\bregular|book|roman|normal\b/i, 400],
  [/\bmedium\b/i, 500],
  [/\bsemi ?bold|demi ?bold\b/i, 600],
  [/\bextra ?bold|ultra ?bold\b/i, 800],
  [/\bbold\b/i, 700],
  [/\bblack|heavy\b/i, 900],
];
const WEIGHT_WORD = /\b(Thin|Hairline|Extra ?Light|Light|Regular|Book|Roman|Medium|Semi ?Bold|SemiBold|Demi ?Bold|Bold|Extra ?Bold|Black|Heavy)\b/i;

/** Families SocriaUX recognises in prose: the faces it serves and well-known commercial ones. */
const KNOWN_FAMILIES = [
  ...FONTS.map((f) => f.name),
  'Helvetica Neue', 'Helvetica', 'Arial', 'Futura', 'Gotham', 'Avenir Next', 'Avenir', 'Garamond', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Söhne', 'Sohne', 'GT America', 'GT Walsheim', 'Graphik', 'Circular', 'Proxima Nova', 'Brandon Grotesque', 'Gill Sans', 'Univers', 'Frutiger', 'DIN', 'Akzidenz-Grotesk', 'Baskerville', 'Caslon', 'Didot', 'Bodoni', 'Times New Roman', 'Georgia', 'Merriweather', 'Source Sans Pro', 'Source Serif Pro', 'IBM Plex Sans', 'IBM Plex Serif', 'IBM Plex Mono', 'Fira Sans', 'Nunito', 'Raleway', 'Work Sans', 'Noto Sans', 'Noto Serif', 'Segoe UI', 'SF Pro', 'Tiempos', 'Canela', 'Neue Haas Grotesk', 'Suisse Int’l', 'Aktiv Grotesk', 'Calibre', 'Apercu', 'Maison Neue', 'Aeonik', 'Satoshi', 'General Sans', 'Recoleta', 'Cooper', 'Domaine', 'Lyon', 'Publico', 'Freight', 'Minion', 'Sabon', 'Bembo', 'Courier', 'Consolas', 'Menlo',
].sort((a, b) => b.length - a.length);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FAMILY_RE = new RegExp(`\\b(${KNOWN_FAMILIES.map(esc).join('|')})\\b`, 'g');

const HEX = /(?:^|[^\w&])#([0-9a-f]{6}|[0-9a-f]{3})\b|\bhex(?:adecimal)?\s*[:#]?\s*#?([0-9a-f]{6})\b/i;
const RGB = /\brgb\s*[:(]?\s*(\d{1,3})[\s,/]+(\d{1,3})[\s,/]+(\d{1,3})\b|\bR\s*(\d{1,3})\s*G\s*(\d{1,3})\s*B\s*(\d{1,3})\b/i;
const CMYK = /\bcmyk\s*[:(]?\s*(\d{1,3})%?[\s,/]+(\d{1,3})%?[\s,/]+(\d{1,3})%?[\s,/]+(\d{1,3})%?|\bC\s*(\d{1,3})\s*M\s*(\d{1,3})\s*Y\s*(\d{1,3})\s*K\s*(\d{1,3})\b/i;
const PANTONE = /\b(?:pantone|pms)\s*([\w-]{1,12}(?:\s?[CUM])?)\b/i;
const ROLE_HINT = /\((primary|secondary|tertiary|accent|background|text|neutral|highlight|base|dark|light)\)|\b(primary|secondary|accent|background|text) colou?r\b/i;
const VALUE_LINE = /^(hex|rgb|cmyk|pantone|pms|r\s*\d|c\s*\d|#[0-9a-f]{3,6})\b/i;

const hx2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** An approximate screen colour from CMYK (naive conversion: SocriaUX's estimate, not a managed colour profile). */
export function cmykToHex(c: number, m: number, y: number, k: number): string {
  const [C, M, Y, K] = [c, m, y, k].map((v) => Math.max(0, Math.min(100, v)) / 100);
  return `#${hx2(255 * (1 - C) * (1 - K))}${hx2(255 * (1 - M) * (1 - K))}${hx2(255 * (1 - Y) * (1 - K))}`;
}

const sentences = (s: string) =>
  s
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/)
    .map((x) => x.trim())
    .filter(Boolean);
const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/^[•\-–*·]\s*/, '').trim();

/** A rule's machine check, when the sentence states one exactly. */
export function checkOf(s: string): RuleCheck | undefined {
  const t = s.toLowerCase();
  const neg = /\b(don'?t|do not|never|avoid|no)\b/.test(t);
  if (/logo/.test(t) && neg && /stretch|distort|skew|squash|squeeze|recolou?r|change (the|its) colou?r|rotate|outline|add (effects|shadows)/.test(t)) return { kind: 'logo-unaltered' };
  const cs = t.match(/clear ?space[^.]*?(\d{1,3})\s*%/) ?? t.match(/(\d{1,3})\s*%[^.]*clear ?space/);
  if (cs) return { kind: 'logo-clear-space', ratio: Math.min(4, Number(cs[1]) / 100) };
  if (/clear ?space/.test(t) && /\bhalf\b/.test(t)) return { kind: 'logo-clear-space', ratio: 0.5 };
  const ms = t.match(/(?:minimum size|smaller than|no smaller than|at least|min(?:imum)? width)[^.]*?(\d{1,4})\s*px/);
  if (ms && /logo|mark|symbol|wordmark/.test(t)) return { kind: 'logo-min-size', px: Number(ms[1]) };
  if (/(only use|use only|never use)[^.]*colou?rs?[^.]*(palette|brand)|colou?rs? (from|in) (this|the) palette only|only use colou?rs from/.test(t)) return { kind: 'palette-only' };
  if (neg && /gradient/.test(t)) return { kind: 'no-gradients' };
  if (/headline|heading/.test(t) && /(all caps|uppercase|capitals|upper case)/.test(t) && !neg) return { kind: 'headline-case', case: 'upper' };
  if (/headline|heading/.test(t) && /sentence case/.test(t)) return { kind: 'headline-case', case: 'sentence' };
  const ct = t.match(/(\d(?:\.\d)?)\s*:\s*1/);
  if (ct && /contrast/.test(t)) return { kind: 'min-contrast', ratio: Number(ct[1]) };
  if (/(single|one) accent|accent sparingly/.test(t)) return { kind: 'max-accents', n: 1 };
  return undefined;
}

const RULE_START = /^(do not|don'?t|never|always|must|avoid|only|please do not|use only|keep|ensure|make sure|no )/i;
const RULE_WORDING = /\b(never|must|always|only|do not|don'?t|avoid|keep|ensure|make sure|no)\b/i;
const DESCRIPTIVE = ['tone', 'imagery', 'personality', 'composition', 'motif'];

/** What a set of guideline blocks states (see the head of this file). */
export function readGuidelines(blocks: readonly GBlock[], src: SourceRef, opts: { fills?: { hex: string; page: number }[] } = {}): GuidelineFacts {
  const facts: GuidelineFacts = { name: '', description: '', colours: [], fonts: [], sizes: [], items: [], sections: [], unknown: [] };
  let section = { title: '', kind: 'other', page: 1 };
  const seen = new Set<string>();
  const ev = (page: number, quote: string) => [{ source: { ...src, page }, quote: quote.slice(0, 300) }];
  const addItem = (kind: IntelKind, statement: string, page: number, quote: string, check?: RuleCheck, confidence = 1) => {
    const key = `${kind}|${statement.toLowerCase()}`;
    if (seen.has(key) || facts.items.length >= 120) return;
    seen.add(key);
    // a checkable rule worded as a rule (never, must, only, keep…) is a constraint; a description is a preference
    const hard = !!check && RULE_WORDING.test(statement);
    facts.items.push({ id: uid('gl'), kind, statement: statement.slice(0, 400), status: 'confirmed', basis: 'explicit', evidence: ev(page, quote), confidence, enforce: hard ? 'hard' : 'soft', ...(check ? { check } : {}) });
  };
  for (const b of blocks) {
    const text = tidy(b.lines.join(' '));
    if (!text) continue;
    if (b.heading) {
      if (!facts.name && /guidelines?|brand ?book|identity|style ?guide/i.test(text)) facts.name = text.replace(/\b(brand|visual|identity)?\s*(guidelines?|brand ?book|style ?guide|standards|manual)\b.*$/i, '').replace(/\s+(brand|identity)$/i, '').trim().slice(0, 60);
      else if (!facts.name && b.level === 1) facts.name = text.slice(0, 60);
      section = { title: text.slice(0, 80), kind: sectionKind(text), page: b.page };
      facts.sections.push({ ...section });
      continue;
    }
    if (!facts.description && text.length > 40 && !VALUE_LINE.test(text) && section.kind !== 'colour') facts.description = sentences(text)[0]?.slice(0, 300) ?? '';
    // colours: a block holding values is one colour (its first plain line names it)
    const hasValue = b.lines.some((l) => HEX.test(l) || RGB.test(l) || CMYK.test(l) || PANTONE.test(l));
    if (hasValue && facts.colours.length < 40) {
      const nameLine = b.lines.find((l) => !VALUE_LINE.test(l.trim()) && !HEX.test(l) && tidy(l).length <= 60) ?? '';
      const hint = (nameLine.match(ROLE_HINT) ?? text.match(ROLE_HINT))?.slice(1).find(Boolean)?.toLowerCase();
      const name = tidy(nameLine.replace(ROLE_HINT, '').replace(/[:–-]\s*$/, '')) || `Colour ${facts.colours.length + 1}`;
      const hexes = [...text.matchAll(new RegExp(HEX.source, 'gi'))].map((m) => (m[1] ?? m[2]).toLowerCase()).map((h) => (h.length === 3 ? h.split('').map((c) => c + c).join('') : h));
      const rgb = text.match(RGB);
      const cmyk = text.match(CMYK);
      const pms = text.match(PANTONE);
      const rgbNums = rgb ? (rgb.slice(1, 4).every(Boolean) ? rgb.slice(1, 4) : rgb.slice(4, 7)).map(Number) : null;
      const cmykNums = cmyk ? (cmyk.slice(1, 5).every(Boolean) ? cmyk.slice(1, 5) : cmyk.slice(5, 9)).map(Number) : null;
      const base = { roleHint: hint, page: b.page, quote: text.slice(0, 200), ...(rgbNums ? { rgb: rgbNums.join(' ') } : {}), ...(cmykNums ? { cmyk: cmykNums.join(' ') } : {}), ...(pms ? { pantone: pms[1].trim() } : {}) };
      if (hexes.length > 1 && !rgbNums) hexes.forEach((h, i) => facts.colours.push({ ...base, name: `${name} ${i + 1}`, hex: `#${h}`, basis: 'explicit' }));
      else if (hexes.length) facts.colours.push({ ...base, name, hex: `#${hexes[0]}`, basis: 'explicit' });
      else if (rgbNums && rgbNums.every((n) => n <= 255)) facts.colours.push({ ...base, name, hex: colourFromDtcg({ colorSpace: 'srgb', components: rgbNums.map((n) => n / 255) }) ?? undefined, basis: 'explicit', note: 'from the RGB values stated' });
      else facts.colours.push({ ...base, name, basis: 'explicit', note: 'no screen value stated (print values only)' });
      continue;
    }
    // typefaces
    const famHits = [...text.matchAll(FAMILY_RE)].map((m) => m[1]);
    const setIn = text.match(/\b(?:set in|typeface is|typeface:|font:|font is|use)\s+([A-Z][\w’'-]+(?:\s[A-Z][\w’'-]+){0,2})(?=\s+(?:Thin|Light|Regular|Book|Medium|Semi ?Bold|Bold|Black|Heavy)\b|[.,;]|\s+for\b|$)/);
    const candidates = [...new Set([...famHits, ...(setIn && (section.kind === 'typography' || /typeface|font/i.test(text)) ? [setIn[1].replace(WEIGHT_WORD, '').trim()] : [])])].filter((f) => f && f.length < 40);
    if (candidates.length && (section.kind === 'typography' || /typeface|font|set in|headline|body copy/i.test(text))) {
      for (const family of candidates) {
        const after = text.slice(text.indexOf(family) + family.length, text.indexOf(family) + family.length + 40);
        const weights = WEIGHTS.filter(([re]) => re.test(after.split(/[,.;]/)[0])).map(([, w]) => w);
        const allW = [...text.matchAll(new RegExp(`${esc(family)}\\s+(${WEIGHT_WORD.source.slice(3, -3)})`, 'gi'))].map((m) => WEIGHTS.find(([re]) => re.test(m[1]))?.[1]).filter((w): w is number => !!w);
        const role: FontFact['role'] = /headline|heading|display|title|primary typeface/i.test(`${section.title} ${text}`) && !/body|copy|secondary/i.test(text.split(family)[0].slice(-60)) ? 'display' : /body|copy|text|secondary|paragraph/i.test(`${section.title} ${text}`) ? 'body' : /mono|code/i.test(text) ? 'mono' : undefined;
        const prev = facts.fonts.find((f) => f.family.toLowerCase() === family.toLowerCase());
        if (prev) prev.weights = [...new Set([...prev.weights, ...weights, ...allW])].sort((a, z) => a - z);
        else facts.fonts.push({ family, ...(role ? { role } : {}), weights: [...new Set([...weights, ...allW])].sort((a, z) => a - z), page: b.page, quote: text.slice(0, 200) });
      }
    }
    // type scale
    for (const m of text.matchAll(/\b(H[1-6]|Display|Headline|Heading|Title|Subtitle|Lead|Body|Caption|Small|Label)\s*[:\-–]?\s*(\d{1,3}(?:\.\d+)?)\s*(pt|px)\b/gi)) {
      const n = Number(m[2]);
      const px = Math.round((m[3].toLowerCase() === 'pt' ? (n * 4) / 3 : n) * 100) / 100;
      if (px >= 6 && px <= 400 && !facts.sizes.some((s) => s.label.toLowerCase() === m[1].toLowerCase())) facts.sizes.push({ label: m[1], px, stated: `${m[2]}${m[3]}`, page: b.page, quote: text.slice(0, 160) });
    }
    // a personality written as a list of words ("Steady. Practical. Warm.")
    if (section.kind === 'personality') {
      const frags = text.split(/[.,;·|/]|\band\b/).map((w) => w.trim()).filter(Boolean);
      if (frags.length >= 2 && frags.length <= 8 && frags.every((w) => w.split(/\s+/).length <= 2 && /^[A-Za-z’'-]+( [A-Za-z’'-]+)?$/.test(w))) {
        addItem('personality', `Personality: ${frags.map((w) => w.toLowerCase()).join(', ')}`, b.page, text);
        continue;
      }
    }
    // rules and statements, sentence by sentence
    const sents = sentences(text);
    for (const s of sents) {
      const check = checkOf(s);
      const ruleish = !!check || RULE_START.test(s) || section.kind === 'rules' || (/\b(never|must not|must|always|do not|don'?t)\b/i.test(s) && !DESCRIPTIVE.includes(section.kind));
      if (ruleish && s.length >= 12 && s.length <= 300) {
        const bySection: Partial<Record<string, IntelKind>> = { logo: 'logo', colour: 'colour', typography: 'typography', imagery: 'imagery', composition: 'composition', motif: 'motif', tone: 'tone' };
        const kind: IntelKind = /logo|symbol|wordmark/i.test(s) ? 'logo' : bySection[section.kind] ?? (/colou?r|palette|accent|gradient|background/i.test(s) ? 'colour' : /typeface|font|headline|type|text/i.test(s) ? 'typography' : /photo|image/i.test(s) ? 'imagery' : 'restriction');
        addItem(kind, s, b.page, s, check);
        continue;
      }
      if (section.kind === 'personality' && s.length <= 120) {
        const words = s.split(/[.,;]|\band\b/).map((w) => w.trim()).filter((w) => w && w.split(/\s+/).length <= 2);
        if (words.length >= 2 && words.length <= 8 && words.every((w) => /^[A-Za-z’'-]+( [A-Za-z’'-]+)?$/.test(w))) addItem('personality', `Personality: ${words.map((w) => w.toLowerCase()).join(', ')}`, b.page, s);
        else if (s.length > 20 && /\b(we are|we're|our personality|feels?|character|spirit|voice)\b/i.test(s) && facts.items.filter((i) => i.kind === 'personality').length < 4) addItem('personality', s, b.page, s, undefined, 0.9);
      } else if (section.kind === 'tone' && s.length > 20 && facts.items.filter((i) => i.kind === 'tone').length < 4) addItem('tone', s, b.page, s);
      else if (section.kind === 'imagery' && s.length > 20 && facts.items.filter((i) => i.kind === 'imagery').length < 4) addItem('imagery', s, b.page, s);
      else if (section.kind === 'composition' && s.length > 15 && /grid|column|white ?space|margin|align|spacing|whitespace/i.test(s)) addItem('composition', s, b.page, s);
      else if (section.kind === 'motif' && s.length > 15 && facts.items.filter((i) => i.kind === 'motif').length < 3) addItem('motif', s, b.page, s);
    }
  }
  // swatches drawn without a written screen value, matched to their captions by order on the page
  if (opts.fills?.length) {
    const named = new Set(facts.colours.map((c) => c.hex).filter(Boolean) as string[]);
    for (const c of facts.colours.filter((x) => !x.hex)) {
      const free = opts.fills.filter((f) => f.page === c.page && !named.has(f.hex) && !/^#(000000|ffffff|1d1d1b)$/.test(f.hex));
      const idx = facts.colours.filter((x) => x.page === c.page && !x.hex).indexOf(c);
      const fill = free[idx];
      if (fill) {
        c.hex = fill.hex;
        c.basis = 'extracted';
        c.note = `the swatch drawn beside ${c.name} on page ${c.page} (matched by order); the guidelines write only ${c.cmyk ? `CMYK ${c.cmyk}` : ''}${c.cmyk && c.pantone ? ' and ' : ''}${c.pantone ? `Pantone ${c.pantone}` : ''}`;
        named.add(fill.hex);
      }
    }
  }
  for (const c of facts.colours.filter((x) => !x.hex && x.cmyk)) {
    const [cc, m, y, k] = c.cmyk!.split(' ').map(Number);
    c.hex = cmykToHex(cc, m, y, k);
    c.basis = 'inferred';
    c.note = `approximate screen colour converted by SocriaUX from CMYK ${c.cmyk}: the guidelines give no screen value`;
  }
  const kinds = new Set(facts.items.map((i) => i.kind));
  const covered: Record<string, boolean> = { colour: facts.colours.length > 0, typography: facts.fonts.length > 0, logo: kinds.has('logo'), imagery: kinds.has('imagery'), tone: kinds.has('tone'), personality: kinds.has('personality'), composition: kinds.has('composition') };
  facts.unknown = Object.entries(covered)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  return facts;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'colour';

/** What the guidelines state, as a system's content: tokens for colours, faces and sizes; statements and rules as intelligence. */
export function guidelinesContent(f: GuidelineFacts, src: SourceRef, opts: { now?: number } = {}): { content: SystemContent; notes: string[] } {
  const now = opts.now ?? Date.now();
  const content = emptyContent(f.name || 'Brand guidelines');
  content.identity.description = f.description;
  const notes: string[] = [];
  const tok = (path: string, t: Omit<Token, 'path' | 'provenance'>, page: number, status: Token['provenance']['status'], confidence: number, note?: string, quote?: string) => {
    if (content.tokens[path]) return;
    content.tokens[path] = { path, ...t, provenance: { source: { ...src, page }, importedAt: now, original: t.value, status, confidence, ...(note || quote ? { note: [note, quote ? `“${quote.slice(0, 120)}”` : ''].filter(Boolean).join(' — ') } : {}) } };
  };
  const roles: Partial<Record<string, RoleBinding>> = {};
  for (const c of f.colours) {
    if (!c.hex) continue;
    const path = `color.brand.${slug(c.name)}`;
    const print = [c.cmyk ? `CMYK ${c.cmyk}` : '', c.pantone ? `Pantone ${c.pantone}` : '', c.rgb ? `RGB ${c.rgb}` : ''].filter(Boolean).join(' · ');
    tok(path, { type: 'color', value: c.hex, ...(print ? { description: `${c.name} · ${print}` } : { description: c.name }), ...(c.cmyk || c.pantone ? { extensions: { 'org.socriaux.print': { ...(c.cmyk ? { cmyk: c.cmyk } : {}), ...(c.pantone ? { pantone: c.pantone } : {}), stated: true } } } : {}) }, c.page, c.basis === 'explicit' ? 'imported' : 'inferred', c.basis === 'explicit' ? 1 : c.basis === 'extracted' ? 0.7 : 0.4, c.note, c.quote);
    const h = c.roleHint;
    const set = (role: string, status: 'confirmed' | 'inferred', why: string) => !roles[role] && (roles[role] = { path, status, confidence: status === 'confirmed' ? 0.95 : 0.6, why });
    if (h === 'accent' || h === 'highlight') set('accent', 'confirmed', `the guidelines call ${c.name} the ${h}`);
    else if (h === 'background' || h === 'base' || h === 'light') set('background', h === 'background' ? 'confirmed' : 'inferred', `the guidelines call ${c.name} ${h}`);
    else if (h === 'text' || h === 'dark') set('text', h === 'text' ? 'confirmed' : 'inferred', `the guidelines call ${c.name} ${h}`);
    else if (h === 'secondary' || h === 'tertiary') set('accent2', 'inferred', `the guidelines call ${c.name} ${h}`);
    else if (h === 'primary') set('accent2', 'inferred', `${c.name} is the primary brand colour`);
  }
  if (!roles.accent && roles.accent2) {
    roles.accent = roles.accent2;
    delete roles.accent2;
  }
  for (const fo of f.fonts) {
    const path = fo.role ? `font.family.${fo.role}` : `font.family.${slug(fo.family)}`;
    tok(path, { type: 'fontFamily', value: fo.family }, fo.page, 'imported', 1, undefined, fo.quote);
    if (fo.role && fo.weights.length) tok(`font.weight.${fo.role}`, { type: 'fontWeight', value: fo.weights[0] }, fo.page, 'imported', 1, undefined, fo.quote);
    if (fo.role && !roles[fo.role]) roles[fo.role] = { path, status: 'confirmed', confidence: 0.95, why: `the guidelines set ${fo.role === 'display' ? 'headlines' : fo.role === 'body' ? 'text' : 'code'} in ${fo.family}` };
  }
  for (const s of f.sizes) tok(`font.size.${slug(s.label)}`, { type: 'dimension', value: `${s.px}px`, description: `${s.label}: ${s.stated} in the guidelines` }, s.page, 'imported', 1, s.stated.endsWith('pt') ? `${s.stated} at 96 px per inch` : undefined, s.quote);
  content.roles = roles as SystemContent['roles'];
  content.intelligence = f.items;
  if (f.unknown.length) notes.push(`Not covered by the guidelines: ${f.unknown.join(', ')}. Nothing was added for them.`);
  const extracted = f.colours.filter((c) => c.basis === 'extracted').length;
  const inferred = f.colours.filter((c) => c.basis === 'inferred').length;
  if (extracted) notes.push(`${extracted} colour${extracted === 1 ? '' : 's'} read from the swatches drawn in the document (no screen value written).`);
  if (inferred) notes.push(`${inferred} colour${inferred === 1 ? '' : 's'} given only for print: an approximate screen value was converted by SocriaUX and marked as an inference.`);
  return { content, notes };
}

/** Markdown guidelines as blocks: headings, paragraphs, list items and table rows. */
export function markdownBlocks(text: string): GBlock[] {
  const out: GBlock[] = [];
  let para: string[] = [];
  let id = 0;
  const flush = () => {
    if (para.length) out.push({ id: id++, page: 1, lines: para });
    para = [];
  };
  for (const raw of text.split(/\r?\n/).slice(0, 20000)) {
    const line = raw.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '');
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      flush();
      out.push({ id: id++, page: 1, lines: [h[2].trim()], heading: true, level: h[1].length });
      continue;
    }
    if (/^\s*\|/.test(line)) {
      flush();
      if (/^\s*\|?\s*:?-{2,}/.test(line)) continue;
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length) out.push({ id: id++, page: 1, lines: cells });
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      flush();
      out.push({ id: id++, page: 1, lines: [line.replace(/^\s*([-*+]|\d+[.)])\s+/, '')] });
      continue;
    }
    if (!line.trim()) flush();
    else para.push(line.trim());
  }
  flush();
  return out;
}
