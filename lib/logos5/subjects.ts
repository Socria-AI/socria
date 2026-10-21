// lib/logos5/subjects.ts — WHAT EACH CONVERSATION IS ABOUT, WITHOUT ASKING.
//
// The Universal Map can be seen by subject, and nobody should have to file a
// conversation to get there (the first rule of "Clearer Structures and UI":
// zero mandatory homework — everything is organised passively first). So a
// conversation's subject is read from what is already there, the surest
// first:
//   • the course its study was sorted under — "ACCT 2301 · Exam 2";
//   • a course code in its name, its first question or what it was about;
//   • the field Socria's map named while it thought ("Accounting"), or the
//     kind of picture it drew (supply and demand is economics);
//   • the words it uses, weighed against a short list of fields.
// A Project is the person's own word and comes before all of this, and so
// does a subject the person gave a conversation by dragging it there
// (spatial.ts puts those first). What none of this can place goes in
// "Everything else" — never into a wrong subject because one had to be chosen.
//
// PURE.

export interface Subject {
  /** `c:<code>` for a course, `f:<field>` for a field */
  key: string;
  name: string;
  kind: 'course' | 'field';
  /** the field a course belongs to, when its code or name says ("ACCT" is accounting) */
  field?: string;
}

/** The key of everything else: what nothing places, or what the person put there. */
export const OTHER = 'other';

/** What a conversation says about itself, as the map reads it (universe.ts Tile.about). */
export interface About {
  title: string;
  /** the course its study was sorted under, or '' */
  course: string;
  /** the field the map named, or '' */
  domain: string;
  /** what it was about, in the person's words, or '' */
  topic: string;
  /** the kind of picture it drew, or '' */
  viz: string;
  /** the first thing asked in it, or '' */
  asked: string;
  /** its ideas and its study's topics */
  ideas: readonly string[];
  /** where it stands now */
  stands: string;
}

// ── fields ───────────────────────────────────────────────────────────

interface Field {
  key: string;
  name: string;
  /** phrases, as regex source, lower case; each counts once however often it is said */
  words: string[];
}

/** In order of precedence: when two fields are equally likely, the earlier is taken. */
const FIELDS: Field[] = [
  { key: 'accounting', name: 'Accounting', words: ['accruals?', 'accrual basis', 'adjusting entr\\w*', 'journal entr\\w*', 'ledgers?', 'debits?', 'balance sheets?', 'income statements?', 'trial balance', 'depreciation', 'amorti[sz]ation', 'prepaid', 'unearned', 'gaap', 'ifrs', 'revenue recognition', 'fifo', 'lifo', 'cogs', 'bookkeeping', 'accounts? payable', 'accounts? receivable', 'retained earnings', 't-accounts?', 'reconciliation', 'accounting', 'auditing'] },
  { key: 'finance', name: 'Finance', words: ['npv', 'irr', 'wacc', 'capm', 'portfolios?', 'bonds? yield', 'dividends?', 'valuation', 'discount rate', 'present value', 'future value', 'annuit\\w+', 'capital budgeting', 'stock market', 'compound interest', 'equity', 'hedg\\w+', 'finance', 'financial'] },
  { key: 'economics', name: 'Economics', words: ['supply and demand', 'supply', 'demand curve', 'elasticity', 'gdp', 'inflation', 'monetary', 'fiscal', 'marginal', 'oligopol\\w+', 'monopol\\w+', 'game theory', 'equilibrium', 'macroeconomics?', 'microeconomics?', 'opportunity cost', 'comparative advantage', 'keynes\\w*', 'recession', 'unemployment', 'tariffs?', 'externalit\\w+', 'consumer surplus', 'ppf', 'economics?', 'economy'] },
  { key: 'statistics', name: 'Statistics', words: ['regression', 'p-values?', 'p values?', 'hypothesis tests?', 'null hypothesis', 'variance', 'standard deviation', 'distributions?', 'sampling', 'confidence intervals?', 'anova', 'chi-square\\w*', 'correlation', 'bayes\\w*', 'probabilit\\w+', 't-tests?', 'z-scores?', 'statistics?', 'statistical'] },
  { key: 'mathematics', name: 'Mathematics', words: ['calculus', 'derivatives? of', 'partial derivatives?', 'chain rule', 'product rule', 'quotient rule', 'integrals?', 'integration by parts', 'limits? of', 'matri(?:x|ces)', 'linear algebra', 'eigen\\w*', 'vectors?', 'proofs?', 'theorems?', 'equations?', 'polynomials?', 'quadratic', 'logarithms?', 'trigonometry', 'trig', 'geometry', 'algebra', 'taylor series', 'power series', 'geometric series', 'differential equations?', 'slope', 'tangent lines?', 'fractions?', 'math\\w*'] },
  { key: 'physics', name: 'Physics', words: ['velocity', 'acceleration', 'forces?', 'momentum', 'newton\\w*', 'kinematics', 'quantum', 'thermodynamics', 'circuits?', 'voltage', 'resistance', 'magnetic', 'electric fields?', 'wavelength', 'wave functions?', 'optics', 'relativity', 'gravity', 'torque', 'friction', 'projectiles?', 'physics'] },
  { key: 'chemistry', name: 'Chemistry', words: ['molecules?', 'molecular', 'chemical reactions?', 'reaction rates?', 'stoichiometry', 'acids?', 'ph scale', 'organic chemistry', 'covalent', 'ionic', 'moles?', 'molar\\w*', 'titration', 'enthalpy', 'oxidation', 'redox', 'periodic table', 'chemical compounds?', 'chemistry', 'chemical'] },
  { key: 'biology', name: 'Biology', words: ['cell biology', 'stem cells?', 'cell membranes?', 'cell division', 'blood cells?', 'dna', 'rna', 'genes?', 'genetic\\w*', 'proteins?', 'evolution', 'enzymes?', 'mitosis', 'meiosis', 'photosynthesis', 'organisms?', 'ecology', 'species', 'anatomy', 'physiology', 'neurons?', 'immune', 'bacteria', 'virus\\w*', 'metabolism', 'biology'] },
  { key: 'health', name: 'Health', words: ['patients?', 'diagnos\\w+', 'symptoms?', 'diseases?', 'pharmacolog\\w+', 'dosage', 'nursing', 'clinical', 'medical', 'medicine', 'nutrition', 'health'] },
  { key: 'psychology', name: 'Psychology', words: ['psycholog\\w+', 'cognitive', 'behaviou?r\\w*', 'conditioning', 'freud\\w*', 'personality', 'therapy', 'anxiety', 'motivation', 'perception', 'cognitive bias\\w*'] },
  { key: 'computing', name: 'Computer science', words: ['algorithms?', 'data structures?', 'recursion', 'python', 'javascript', 'typescript', 'java', 'c\\+\\+', 'rust', 'golang', 'programming', 'coding', 'code', 'databases?', 'sql', 'apis?', 'react(?:\\.js| hooks?| components?)', 'frontend', 'backend', 'compilers?', 'big o', 'machine learning', 'neural networks?', 'software', 'debug\\w*', 'git'] },
  { key: 'engineering', name: 'Engineering', words: ['engineering', 'cad', 'beams?', 'stress analysis', 'load bearing', 'circuit design', 'mechanical', 'structural'] },
  { key: 'history', name: 'History', words: ['history', 'historical', 'wars?', 'revolution\\w*', 'empires?', 'centur\\w+', 'treat(?:y|ies)', 'colonial\\w*', 'ancient', 'medieval', 'civil rights', 'cold war', 'dynast\\w+'] },
  { key: 'politics', name: 'Politics', words: ['politics', 'political', 'elections?', 'government', 'democrac\\w+', 'senate', 'parliament', 'public policy', 'voting'] },
  { key: 'law', name: 'Law', words: ['law', 'legal', 'contracts?', 'torts?', 'constitution\\w*', 'statutes?', 'courts?', 'case law', 'liability', 'lawsuits?', 'plaintiffs?', 'defendants?'] },
  { key: 'philosophy', name: 'Philosophy', words: ['philosoph\\w+', 'ethics', 'ethical', 'kant\\w*', 'utilitarian\\w*', 'epistemolog\\w+', 'metaphysics', 'plato', 'aristotle', 'nietzsche', 'moral\\w*', 'free will', 'existential\\w*'] },
  { key: 'literature', name: 'Literature', words: ['novels?', 'poems?', 'poetry', 'shakespeare', 'literary', 'literature', 'narrative', 'sonnets?', 'character analysis', 'themes? in'] },
  { key: 'languages', name: 'Languages', words: ['spanish', 'french', 'german', 'japanese', 'chinese', 'mandarin', 'korean', 'italian', 'grammar', 'vocabulary', 'conjugat\\w+', 'verb tenses?', 'pronunciation'] },
  { key: 'arts', name: 'Arts', words: ['music', 'chords?', 'melod\\w+', 'harmony', 'painting', 'sculpture', 'art history', 'films?', 'photography', 'drawing'] },
  { key: 'research', name: 'Research', words: ['thesis', 'dissertation', 'methodology', 'literature review', 'research questions?', 'qualitative', 'quantitative', 'participants', 'data collection', 'coding scheme'] },
  { key: 'writing', name: 'Writing', words: ['essays?', 'drafts?', 'outlines?', 'paragraphs?', 'thesis statements?', 'cover letters?', 'emails?', 'blog posts?', 'rewrite', 'proofread\\w*', 'speech\\w*', 'writing'] },
  { key: 'careers', name: 'Careers', words: ['jobs?', 'interviews?', 'r[eé]sum[eé]s?', 'cvs?', 'salary', 'salaries', 'offers?', 'careers?', 'internships?', 'recruiters?', 'hiring', 'negotiat\\w+', 'linkedin'] },
  { key: 'business', name: 'Business', words: ['startups?', 'business plans?', 'business', 'strategy', 'marketing', 'customers?', 'pricing', 'product (?:launch|market fit|strategy|roadmap)', 'revenue', 'profits?', 'sales', 'brand\\w*', 'competitors?', 'launch\\w*', 'pitch\\w*', 'investors?', 'founders?'] },
  { key: 'money', name: 'Money', words: ['budget\\w*', 'savings?', 'rent', 'mortgages?', 'flatmates?', 'buy a (?:flat|house|home)', 'apartments?', 'lease', 'tax(?:es|ation)?', 'tax returns?', 'credit cards?', 'loans?', 'debts?', 'spending', 'runway', 'freelanc\\w+', 'invoices?'] },
  { key: 'life', name: 'Life', words: ['trips?', 'travel\\w*', 'vacation', 'holiday', 'weekend', 'flights?', 'hotels?', 'itinerar\\w+', 'recipes?', 'cooking', 'workouts?', 'fitness', 'gym', 'moving house', 'wedding', 'gifts?', 'birthday'] },
];

const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));
const FIELD_RE = new Map(FIELDS.map((f) => [f.key, new RegExp(`(?:^|[^a-z0-9])(${f.words.join('|')})(?=$|[^a-z0-9])`, 'g')]));

/** A field by its key, or null. */
export function fieldName(key: string): string | null {
  return FIELD_BY_KEY.get(key)?.name ?? null;
}

export const fieldSubject = (key: string): Subject | null => {
  const f = FIELD_BY_KEY.get(key);
  return f ? { key: `f:${f.key}`, name: f.name, kind: 'field' } : null;
};

/** How strongly a text speaks of each field: the distinct phrases it uses, times how much the text counts. */
function scoreInto(scores: Map<string, number>, text: string, weight: number) {
  const t = ` ${text.toLowerCase()} `;
  if (!t.trim()) return;
  for (const f of FIELDS) {
    const re = FIELD_RE.get(f.key)!;
    re.lastIndex = 0;
    const seen = new Set<string>();
    // the separator after a phrase is left for the next one's leading edge (the lookahead does not take it)
    for (let m = re.exec(t); m; m = re.exec(t)) seen.add(m[1]);
    if (seen.size) scores.set(f.key, (scores.get(f.key) ?? 0) + seen.size * weight);
  }
}

/** The field the words lean to, if they lean clearly enough; equally strong, the earlier field. */
export function fieldOfWords(parts: readonly { text: string; weight: number }[], least = 3): string | null {
  const scores = new Map<string, number>();
  for (const p of parts) scoreInto(scores, p.text, p.weight);
  let best: string | null = null;
  let top = 0;
  for (const f of FIELDS) {
    const s = scores.get(f.key) ?? 0;
    if (s > top) {
      top = s;
      best = f.key;
    }
  }
  return top >= least ? best : null;
}

// ── courses ──────────────────────────────────────────────────────────

/** Department codes, as universities write them, and the field each is. */
const DEPTS: Record<string, string> = {
  ACCT: 'accounting', ACC: 'accounting', ACTG: 'accounting',
  FIN: 'finance', FINA: 'finance',
  ECON: 'economics', ECO: 'economics',
  STAT: 'statistics', STA: 'statistics',
  MATH: 'mathematics', MAT: 'mathematics', MTH: 'mathematics', CALC: 'mathematics',
  PHYS: 'physics', PHY: 'physics',
  CHEM: 'chemistry', CHM: 'chemistry',
  BIOL: 'biology', BIO: 'biology', BIOS: 'biology',
  NURS: 'health', KINE: 'health', HLTH: 'health', PHAR: 'health',
  PSYC: 'psychology', PSY: 'psychology', PSYCH: 'psychology',
  CS: 'computing', CSE: 'computing', COSC: 'computing', CMSC: 'computing', CSCI: 'computing', COMP: 'computing', CIS: 'computing', INFO: 'computing',
  ENGR: 'engineering', ECE: 'engineering', MAE: 'engineering',
  HIST: 'history',
  POLS: 'politics', GOVT: 'politics', POLI: 'politics', PSCI: 'politics',
  LGST: 'law', BLAW: 'law',
  PHIL: 'philosophy',
  ENGL: 'literature', LIT: 'literature',
  SPAN: 'languages', FREN: 'languages', GERM: 'languages', CHIN: 'languages', JAPN: 'languages', ITAL: 'languages', KORE: 'languages',
  MKTG: 'business', MGMT: 'business', BUS: 'business', BUSI: 'business', ENTR: 'business',
  ARTS: 'arts', MUS: 'arts', MUSI: 'arts', FILM: 'arts',
};

/** Capitals and a number that are not a course. */
const NOT_COURSES = new Set(['ISO', 'COVID', 'FY', 'CY', 'AY', 'SY', 'GPT', 'CPU', 'GPU', 'RAM', 'USB', 'HDMI', 'MP', 'TV', 'PS', 'RTX', 'GTX', 'RX', 'AM', 'PM', 'UTC', 'GMT', 'ID', 'NO', 'PO', 'PIN', 'SAT', 'ACT', 'GRE', 'GMAT', 'LSAT', 'MCAT', 'IELTS', 'TOEFL', 'SDG', 'CVE', 'RFC', 'IEEE', 'ISBN', 'DOI', 'HTTP', 'HTML', 'CSS', 'API', 'SQL', 'AWS', 'IBM', 'BMW', 'AMD', 'UTF', 'ASCII', 'PDF', 'MB', 'GB', 'TB', 'KB', 'MHZ', 'GHZ', 'KM', 'KG', 'MM', 'CM', 'USA', 'UK', 'EU', 'UN', 'NBA', 'NFL', 'FIFA', 'WW', 'II', 'III', 'IV', 'VI', 'VII', 'XP', 'OS', 'IOS', 'PC', 'MAC', 'TAX', 'FORM', 'W', 'I', 'A', 'Q']);

const KNOWN = Object.keys(DEPTS).sort((a, b) => b.length - a.length).join('|');
/** a department the map knows, written any way */
const KNOWN_CODE = new RegExp(`(?:^|[^A-Za-z0-9])(${KNOWN})[\\s-]?(\\d{3,4})[A-Za-z]?(?=$|[^A-Za-z0-9])`, 'i');
/** any other code, only in capitals */
const CAPS_CODE = /(?:^|[^A-Za-z0-9])([A-Z]{2,5})[\s-]?(\d{3,4})[A-Z]?(?=$|[^A-Za-z0-9])/g;

/** The course a text names by its code, if it names one: "acct 2301" is ACCT 2301. */
export function courseIn(text: string): Subject | null {
  if (!text) return null;
  const k = KNOWN_CODE.exec(text);
  if (k) {
    const dept = k[1].toUpperCase();
    return { key: `c:${dept.toLowerCase()}${k[2]}`, name: `${dept} ${k[2]}`, kind: 'course', field: DEPTS[dept] };
  }
  CAPS_CODE.lastIndex = 0;
  for (let m = CAPS_CODE.exec(text); m; m = CAPS_CODE.exec(text)) {
    const dept = m[1];
    const n = Number(m[2]);
    // a year is not a course number, unless the department is one the map knows
    if (NOT_COURSES.has(dept) || (n >= 1900 && n <= 2099)) continue;
    return { key: `c:${dept.toLowerCase()}${m[2]}`, name: `${dept} ${m[2]}`, kind: 'course' };
  }
  return null;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/**
 * The course a study was sorted under: its code if it has one, otherwise its
 * name — "Intro to Psychology · Midterm" is Intro to Psychology.
 */
export function courseOfStudy(course: string): Subject | null {
  const c = (course || '').trim();
  if (!c) return null;
  const coded = courseIn(c);
  if (coded) return coded;
  const name = c.split(/\s+[·•|–—-]\s+|:\s/)[0].trim();
  if (name.length < 3 || name.length > 40 || !/[a-z]/i.test(name)) return null;
  const plainField = DOMAIN_SAYS[name.toLowerCase()];
  if (plainField) return fieldSubject(plainField);
  // an exam or a chapter is when, not what
  if (/^(exam|midterm|final|quiz|test|chapter|ch\.?|unit|week|lecture|review)\b/i.test(name)) return null;
  const field = fieldOfWords([{ text: name, weight: 3 }], 1);
  return { key: `c:${slug(name)}`, name, kind: 'course', ...(field ? { field } : {}) };
}

// ── what the map named, and what it drew ─────────────────────────────

const DOMAIN_SAYS: Record<string, string> = {
  accounting: 'accounting', bookkeeping: 'accounting', 'financial accounting': 'accounting', 'managerial accounting': 'accounting',
  finance: 'finance', 'corporate finance': 'finance', investing: 'finance', investments: 'finance',
  'personal finance': 'money', money: 'money', budgeting: 'money', taxes: 'money', tax: 'money',
  economics: 'economics', microeconomics: 'economics', macroeconomics: 'economics', econ: 'economics',
  statistics: 'statistics', stats: 'statistics', probability: 'statistics', 'data analysis': 'statistics',
  mathematics: 'mathematics', math: 'mathematics', maths: 'mathematics', calculus: 'mathematics', algebra: 'mathematics', geometry: 'mathematics', 'linear algebra': 'mathematics',
  physics: 'physics', chemistry: 'chemistry', biology: 'biology',
  medicine: 'health', health: 'health', nursing: 'health', nutrition: 'health',
  psychology: 'psychology',
  'computer science': 'computing', programming: 'computing', 'software engineering': 'computing', 'software development': 'computing', coding: 'computing', 'web development': 'computing', 'machine learning': 'computing',
  engineering: 'engineering',
  history: 'history', politics: 'politics', 'political science': 'politics', government: 'politics',
  law: 'law', philosophy: 'philosophy', ethics: 'philosophy',
  literature: 'literature', english: 'literature',
  languages: 'languages', 'language learning': 'languages', linguistics: 'languages',
  art: 'arts', arts: 'arts', music: 'arts', design: 'arts', film: 'arts',
  research: 'research', 'research methods': 'research', academia: 'research',
  writing: 'writing', 'creative writing': 'writing', communication: 'writing',
  careers: 'careers', career: 'careers', 'job search': 'careers', employment: 'careers',
  business: 'business', entrepreneurship: 'business', startups: 'business', marketing: 'business', management: 'business',
  travel: 'life', cooking: 'life', fitness: 'life', lifestyle: 'life', 'personal life': 'life',
  // the names the map gives that are a field already here by another name: one subject, not two
  astrophysics: 'physics', astronomy: 'physics', cosmology: 'physics', mechanics: 'physics', 'quantum mechanics': 'physics',
  econometrics: 'statistics', 'data science': 'statistics', analytics: 'statistics', 'data analytics': 'statistics',
  'artificial intelligence': 'computing', ai: 'computing', robotics: 'computing', technology: 'computing', tech: 'computing', 'information technology': 'computing', cybersecurity: 'computing',
  'user experience design': 'computing', 'user experience': 'computing', 'ux design': 'computing', ux: 'computing', 'ui design': 'computing', 'technical issue': 'computing', 'technical support': 'computing', troubleshooting: 'computing',
  journalism: 'writing', copywriting: 'writing', editing: 'writing', blogging: 'writing',
  creativity: 'arts', 'graphic design': 'arts', photography: 'arts', 'visual arts': 'arts',
  'career development': 'careers', 'professional development': 'careers', 'job hunting': 'careers', interviewing: 'careers',
  'daily routine': 'life', routine: 'life', habits: 'life', 'personal development': 'life', 'self improvement': 'life', 'self-improvement': 'life', productivity: 'life', relationships: 'life', family: 'life', parenting: 'life',
};

/**
 * Names the map gives a conversation that say nothing about its subject: a
 * way of thinking, or nothing at all. They make no subject of their own — the
 * conversation's words decide, or it is in everything else.
 */
const VAGUE = new Set([
  'general', 'general knowledge', 'misc', 'miscellaneous', 'other', 'others', 'various', 'everyday', 'personal', 'none', 'unknown',
  'personal decision', 'personal decisions', 'personal decision-making', 'personal decision making', 'decision making', 'decision-making', 'decisions', 'life decisions',
  'planning', 'problem solving', 'problem-solving', 'reasoning', 'critical thinking', 'thinking', 'reflection', 'self-reflection', 'brainstorming', 'ideas',
  'advice', 'help', 'question', 'questions', 'conversation', 'chat', 'education', 'learning', 'studying', 'study skills', 'school', 'homework',
]);

/** The field a picture belongs to: supply and demand is economics; a derivative is mathematics. */
const VIZ_FIELD: Record<string, string> = {
  function: 'mathematics', limit: 'mathematics', derivative: 'mathematics', riemann: 'mathematics', taylor: 'mathematics', sequence: 'mathematics', vectors: 'mathematics', matrix: 'mathematics', ode: 'mathematics', surface: 'mathematics',
  distribution: 'statistics',
  'supply-demand': 'economics', ppc: 'economics', 'ad-as': 'economics',
  flow: 'physics', simulation: 'physics',
};

const titleCase = (s: string) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase());

/** The field the map named, as one the map knows, or as itself when it is a plain short name. */
export function fieldOfDomain(domain: string): Subject | null {
  const d = (domain || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!d || VAGUE.has(d)) return null;
  const known = DOMAIN_SAYS[d] ?? fieldOfWords([{ text: d, weight: 3 }], 3);
  if (known) return fieldSubject(known);
  if (d.length < 3 || d.length > 28 || !/^[a-z][a-z &'-]*$/.test(d) || d.split(' ').length > 3) return null;
  return { key: `f:${slug(d)}`, name: titleCase(d), kind: 'field' };
}

// ── a conversation's subject ─────────────────────────────────────────

/** What one conversation is about, the surest reading first; null when nothing says. */
export function subjectOf(a: About): Subject | null {
  const study = courseOfStudy(a.course);
  if (study) return study;
  const coded = courseIn(a.title) ?? courseIn(a.topic) ?? courseIn(a.asked);
  if (coded) return coded;
  const named = fieldOfDomain(a.domain);
  if (named) return named;
  if (a.viz && VIZ_FIELD[a.viz]) return fieldSubject(VIZ_FIELD[a.viz]);
  const field = fieldOfWords([
    { text: a.title, weight: 3 },
    { text: a.topic, weight: 3 },
    { text: a.ideas.slice(0, 8).join(' · '), weight: 2 },
    { text: a.asked, weight: 1.5 },
    { text: a.stands, weight: 1 },
  ]);
  return field ? fieldSubject(field) : null;
}

/**
 * What a Project is about, for the conversations not filed in it that are
 * about the same: a course or a field in its name, or else what most of its
 * own conversations are about.
 */
export function subjectOfProject(name: string, members: readonly (Subject | null)[]): Subject | null {
  const coded = courseIn(name);
  if (coded) return coded;
  const named = fieldOfWords([{ text: name, weight: 3 }], 3);
  if (named) return fieldSubject(named);
  const count = new Map<string, { s: Subject; n: number }>();
  for (const s of members) if (s) count.set(s.key, { s, n: (count.get(s.key)?.n ?? 0) + 1 });
  const best = [...count.values()].sort((x, y) => y.n - x.n || (x.s.key < y.s.key ? -1 : 1))[0];
  return best && best.n >= 2 && best.n * 2 >= members.length ? best.s : null;
}

/** Two subjects are the same subject: the same key, or a course and the field it is in. */
export function sameSubject(a: Subject | null, b: Subject | null): boolean {
  if (!a || !b) return false;
  if (a.key === b.key) return true;
  const fa = a.kind === 'field' ? a.key.slice(2) : a.field;
  const fb = b.kind === 'field' ? b.key.slice(2) : b.field;
  // a course and a field: the same when the course is in that field; two courses are never the same by field alone
  return (a.kind === 'field' || b.kind === 'field') && !!fa && fa === fb;
}
