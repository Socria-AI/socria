// lib/write/checks.ts — proofreading that needs no model.
//
// What can be decided by a rule is decided by a rule, here, on the device, as
// the person writes: a doubled word, a misspelling that is never a word,
// "could of", "they was", "their is", a bracket never closed, a missing
// capital, a sentence that runs to fifty words, "in order to" where "to" will
// do, a claim of research with nothing cited. Each finding says how sure it
// is —
//
//   definite    a rule of English is broken; there is one right answer
//   likely      almost certainly wrong, but the context could make it right — and the note says what
//   suggestion  a judgement call; shown only when the person asks for the full check
//
// — and why, in a sentence. Nothing here rewrites anything: a finding with
// one right answer carries it as a fix the person accepts or not; everything
// else is theirs to resolve. What needs a reading of the argument (does this
// follow, is this claim carrying the paragraph) is left to the model, and
// only when asked (lib/write/assist.ts).
//
// Quotations are someone else's words: only whether they are cited is checked.
//
// PURE.

import { findText, isHeading, isList, isTextType, replaceText, spliceBlock, textBlocks, textOrder, type Block, type WriteDoc } from './doc';

export const ISSUE_KINDS = ['spelling', 'grammar', 'clarity', 'logic', 'support', 'repetition', 'structure', 'citation'] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

export const ISSUE_KIND_LABEL: Record<IssueKind, string> = {
  spelling: 'Spelling',
  grammar: 'Grammar',
  clarity: 'Clarity',
  logic: 'Logic',
  support: 'Unsupported claim',
  repetition: 'Repetition',
  structure: 'Structure',
  citation: 'Citation',
};

export type Certainty = 'definite' | 'likely' | 'suggestion';

export interface Issue {
  /** a signature: the same finding on the same words keeps it across edits, so a dismissal holds */
  id: string;
  block: string;
  /** the words, as offsets into the block's text; a finding about a whole block covers all of it */
  s: number;
  e: number;
  kind: IssueKind;
  certainty: Certainty;
  rule: string;
  title: string;
  why: string;
  /** the words it was found on, as they were — a fix lands only where they still are */
  text: string;
  /** what the words become, when there is one right answer */
  fix?: string;
  by: 'check' | 'socria';
}

// ── signatures ───────────────────────────────────────────────────────

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** The id of a finding: its rule, its block and its words — and which of their occurrences in that block. */
export function issueId(rule: string, block: Block, s: number, e: number): string {
  const words = block.text.slice(s, e).toLowerCase();
  let nth = 0;
  for (let k = block.text.toLowerCase().indexOf(words); k >= 0 && k < s; k = block.text.toLowerCase().indexOf(words, k + 1)) nth++;
  return `${rule}:${hash(`${block.id}|${words}|${nth}`)}`;
}

// ── word lists ───────────────────────────────────────────────────────

// Misspellings that are never words. A word that is a word somewhere (British
// spellings, "wether", "dependant") is not here.
const MISSPELT: Record<string, string> = {
  teh: 'the', adn: 'and', taht: 'that', thier: 'their', recieve: 'receive', recieved: 'received', reciept: 'receipt', beleive: 'believe', beleived: 'believed',
  belive: 'believe', acheive: 'achieve', acheived: 'achieved', wierd: 'weird', freind: 'friend', freinds: 'friends', peice: 'piece', seperate: 'separate',
  seperately: 'separately', definately: 'definitely', definatly: 'definitely', defiantly_: 'definitely', occured: 'occurred', occurence: 'occurrence', occuring: 'occurring',
  untill: 'until', wich: 'which', becuase: 'because', becasue: 'because', alot: 'a lot', accomodate: 'accommodate', accomodation: 'accommodation',
  arguement: 'argument', arguements: 'arguments', begining: 'beginning', beggining: 'beginning', calender: 'calendar', commitee: 'committee', comittee: 'committee',
  concious: 'conscious', embarass: 'embarrass', embarassed: 'embarrassed', enviroment: 'environment', enviromental: 'environmental', existance: 'existence',
  goverment: 'government', govenment: 'government', independant: 'independent', liason: 'liaison', millenium: 'millennium', neccessary: 'necessary',
  necessery: 'necessary', noticable: 'noticeable', occassion: 'occasion', occassionally: 'occasionally', persue: 'pursue', posession: 'possession',
  preceeding: 'preceding', publically: 'publicly', recomend: 'recommend', reccomend: 'recommend', recommand: 'recommend', refered: 'referred',
  relevent: 'relevant', succesful: 'successful', successfull: 'successful', sucessful: 'successful', supercede: 'supersede', suprise: 'surprise',
  suprised: 'surprised', tommorow: 'tomorrow', tommorrow: 'tomorrow', truely: 'truly', writting: 'writing', accross: 'across', adress: 'address',
  agressive: 'aggressive', apparantly: 'apparently', basicly: 'basically', buisness: 'business', catagory: 'category', cemetary: 'cemetery',
  collegue: 'colleague', comming: 'coming', completly: 'completely', concensus: 'consensus', critisism: 'criticism', curiousity: 'curiosity',
  decieve: 'deceive', dissapoint: 'disappoint', dissapointed: 'disappointed', excercise: 'exercise', familar: 'familiar', finaly: 'finally',
  foriegn: 'foreign', fourty: 'forty', guage: 'gauge', garantee: 'guarantee', happend: 'happened', harrass: 'harass', hieght: 'height',
  immediatly: 'immediately', incidently: 'incidentally', interupt: 'interrupt', knowlege: 'knowledge', lenght: 'length', libary: 'library',
  maintainance: 'maintenance', manuever: 'manoeuvre', mispell: 'misspell', naturaly: 'naturally', ninty: 'ninety', oppurtunity: 'opportunity',
  oppertunity: 'opportunity', paralell: 'parallel', particulary: 'particularly', percieve: 'perceive', percieved: 'perceived', posible: 'possible',
  prefered: 'preferred', presense: 'presence', privelege: 'privilege', priviledge: 'privilege', probly: 'probably', propoganda: 'propaganda',
  religous: 'religious', remeber: 'remember', resistence: 'resistance', responsability: 'responsibility', rythm: 'rhythm', sieze: 'seize',
  similiar: 'similar', sincerly: 'sincerely', speach: 'speech', strenght: 'strength', sucess: 'success', temperture: 'temperature',
  tendancy: 'tendency', threshhold: 'threshold', tounge: 'tongue', truley: 'truly', unforseen: 'unforeseen', unfortunatly: 'unfortunately',
  usefull: 'useful', vaccum: 'vacuum', visable: 'visible', wholy: 'wholly', yeild: 'yield', acknowlege: 'acknowledge', analize: 'analyse',
  aquire: 'acquire', aquired: 'acquired', asthetic: 'aesthetic', athiest: 'atheist', beautifull: 'beautiful', bizzare: 'bizarre', cheif: 'chief',
  comparitive: 'comparative', competance: 'competence', concieve: 'conceive', consistant: 'consistent', contraversial: 'controversial',
  convienient: 'convenient', definitly: 'definitely', develope: 'develop', diffrent: 'different', dilemna: 'dilemma', discription: 'description',
  efficent: 'efficient', equiptment: 'equipment', evidance: 'evidence', explaination: 'explanation', facinating: 'fascinating', fullfil: 'fulfil',
  grammer: 'grammar', gratefull: 'grateful', hypocracy: 'hypocrisy', ignorence: 'ignorance', imaginery: 'imaginary', inteligent: 'intelligent',
  intresting: 'interesting', irrelevent: 'irrelevant', judgement_: 'judgement', medecine: 'medicine', mischevious: 'mischievous', neice: 'niece',
  occurrance: 'occurrence', paticular: 'particular', perseverence: 'perseverance', personel_: 'personnel', persistant: 'persistent', phenomenom: 'phenomenon',
  pronounciation: 'pronunciation', questionaire: 'questionnaire', realy: 'really', reccommend: 'recommend', recieving: 'receiving', referance: 'reference',
  relize: 'realise', repitition: 'repetition', restaraunt: 'restaurant', rediculous: 'ridiculous', sacrafice: 'sacrifice', scedule: 'schedule',
  sentance: 'sentence', signifigant: 'significant', strategicly: 'strategically', suceed: 'succeed', sufficent: 'sufficient', surley: 'surely',
  thoughtfull: 'thoughtful', togehter: 'together', tradgedy: 'tragedy', transfered: 'transferred', underate: 'underrate', wether_: 'whether',
  whereever: 'wherever', wheather: 'whether', withold: 'withhold', youre_: "you're",
};
for (const k of Object.keys(MISSPELT)) if (k.endsWith('_')) delete MISSPELT[k];

// Words often doubled on purpose ("had had", "that that") — never flagged.
const DOUBLE_OK = new Set(['had', 'that', 'is', 'do', 'bye', 'no', 'ha', 'so', 'very', 'really', 'tsk', 'knock', 'chop', 'pooh', 'yada', 'tom', 'boo', 'there', 'can', 'well', 'go', 'hmm', 'blah', 'la', 'oh', 'her', 'him', 'you']);

const ABBREV = new Set(['e.g', 'i.e', 'etc', 'vs', 'cf', 'approx', 'incl', 'no', 'fig', 'figs', 'p', 'pp', 'vol', 'ch', 'sec', 'st', 'dr', 'mr', 'mrs', 'ms', 'jr', 'sr', 'prof', 'mt', 'u.s', 'a.m', 'p.m', 'al', 'ed', 'eds', 'est', 'dept', 'univ', 'inc', 'ltd', 'co', 'corp', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'op', 'cit', 'ibid', 'viz', 'ca', 'c']);
// words that start with a lower-case letter even at the start of a sentence
const LOWER_OK = /^(iPhone|iPad|iPod|iOS|iMac|iCloud|eBay|macOS|npm|pH|x|y|z|n|k|t|i\.e\.|e\.g\.)\b/;

// "an" before these, though they start with a consonant; "a" before these, though they start with a vowel
const AN_EXCEPT = /^(hour|hon(est|or|our)|heir)/i;
const A_EXCEPT = /^(uni(?![mnd])|unanim|use|usu|uti|ure|uro|eu|one(?!r)|once|ubiq|ufo|ewe|uganda|ukrain|ural|utopi)/i;
// words people write both ways ("an historic", "a historic") — left alone
const A_AN_EITHER = /^(unid|herb|histor|hotel|humbl)/i;

const STOP = new Set(
  'the a an and or but if then than that this these those of to in on for with as at by from is are was were be been being it its i you he she they we my your our their his her not no do does did have has had will would can could should may might must about into over under just very really more most some any all what which who when where how why so because there here them us me him also such each other only own same than too'.split(' ')
);

// Findings about a sentence or a paragraph as a whole, not about some of its words.
const WIDE = new Set(['long-sentence', 'long-paragraph', 'unsupported', 'uncited-quote', 'same-opening']);

// Phrases that say no more than a shorter one. Each is a judgement call: the
// longer one is not wrong, and the writer may want its rhythm.
const WORDY: [RegExp, string | ((m: RegExpMatchArray) => string), string][] = [
  [/\bin order to\b/gi, 'to', '“In order to” usually says no more than “to”.'],
  [/\bdue to the fact that\b/gi, 'because', '“Because” says the same in one word.'],
  [/\bin spite of the fact that\b/gi, 'although', '“Although” says the same in one word.'],
  [/\bdespite the fact that\b/gi, 'although', '“Although” says the same in one word.'],
  [/\bat this point in time\b/gi, 'now', '“Now” says the same in one word.'],
  [/\bat the present time\b/gi, 'now', '“Now” says the same in one word.'],
  [/\bfor the purpose of\b/gi, 'for', '“For” usually says the same.'],
  [/\b(has|have) the ability to\b/gi, 'can', '“Can” says the same in one word.'],
  [/\bin the event that\b/gi, 'if', '“If” says the same in one word.'],
  [/\ba (large|great) number of\b/gi, 'many', '“Many” says the same in one word.'],
  [/\bthe (vast )?majority of\b/gi, 'most', '“Most” says the same in one word.'],
  [/\bwith (regard|regards|respect) to\b/gi, 'about', '“About” (or “on”) usually says the same.'],
  [/\beach and every\b/gi, 'every', '“Each and every” says “every” twice.'],
  [/\bvery unique\b/gi, 'unique', '“Unique” already means one of a kind, so it does not take “very”.'],
  [/\babsolutely (essential|necessary)\b/gi, (m) => m[1], 'What is essential cannot be more so; “absolutely” adds nothing.'],
  [/\bend result\b/gi, 'result', 'A result is already the end.'],
  [/\bpast history\b/gi, 'history', 'History is already past.'],
  [/\bfuture plans\b/gi, 'plans', 'Plans are already for the future.'],
  [/\bfree gift\b/gi, 'gift', 'A gift is already free.'],
  [/\bbasic fundamentals\b/gi, 'fundamentals', 'Fundamentals are already basic.'],
  [/\bcompletely (finished|eliminated|destroyed|eliminate|destroy)\b/gi, (m) => m[1], 'This already says “completely”.'],
  [/\brevert back\b/gi, 'revert', 'To revert is already to go back.'],
  [/\bclose proximity\b/gi, 'proximity', 'Proximity is already closeness.'],
];

// ── one block ────────────────────────────────────────────────────────

interface Ctx {
  /** this block cites something, or grew from a card linked to a passage */
  supported: boolean;
}

const WORD = /[A-Za-z][A-Za-z'’-]*/g;

/** Whether an offset is inside an address, an email or a file name — where nothing is checked. */
function inCode(text: string, s: number, e: number): boolean {
  const left = text.lastIndexOf(' ', s - 1) + 1;
  let right = text.indexOf(' ', e);
  if (right < 0) right = text.length;
  const token = text.slice(left, right);
  return /:\/\/|www\.|@\w|\.(com|org|net|edu|gov|io|ai|co|uk|js|ts|tsx|py|md|pdf|docx?)\b|[_#\\/]|\d[A-Za-z]|[A-Za-z]\d/i.test(token);
}

/** The sentences of a block, with their offsets. "e.g." and "Dr." do not end one; a line break does. */
export function sentences(text: string): { s: number; e: number; text: string }[] {
  const out: { s: number; e: number; text: string }[] = [];
  const push = (from: number, to: number) => {
    const piece = text.slice(from, to);
    const lead = piece.length - piece.trimStart().length;
    const body = piece.trim();
    if (body) out.push({ s: from + lead, e: from + lead + body.length, text: body });
  };
  let start = 0;
  const re = /([.!?]+)(["”’')\]]*)(?=\s|$)|\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const nl = m[0] === '\n';
    if (!nl && m[1] === '.') {
      const before = text.slice(start, m.index);
      const word = /([A-Za-z][A-Za-z.]*)$/.exec(before)?.[1] ?? '';
      if (word && ABBREV.has(word.toLowerCase().replace(/\.$/, ''))) continue;
      // an initial: "J. Smith"
      if (/^[A-Z]$/.test(word)) continue;
    }
    push(start, nl ? m.index : m.index + m[0].length);
    start = m.index + m[0].length;
  }
  push(start, text.length);
  return out;
}

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

function caseLike(model: string, word: string): string {
  if (model === model.toUpperCase() && model.length > 1) return word.toUpperCase();
  if (model[0] === model[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

/** What the rules find in one block, given whether it is supported. Cached by the block object itself. */
export function checkBlock(block: Block, ctx: Ctx): Issue[] {
  const text = block.text;
  const supported = ctx.supported || !!block.cites?.length;
  // code is not prose, and a picture, a line or a table has no words of its own here (a table's cells are read one by one)
  if (!text.trim() || block.t === 'code' || !isTextType(block.t)) return [];
  const out: Issue[] = [];
  const add = (rule: string, kind: IssueKind, certainty: Certainty, s: number, e: number, title: string, why: string, fix?: string) => {
    // one finding of a kind on the same words; a finding about a whole sentence or paragraph stands beside them
    if (out.some((x) => x.s < e && s < x.e && x.kind === kind && !WIDE.has(x.rule) && !WIDE.has(rule))) return;
    out.push({ id: issueId(rule, block, s, e), block: block.id, s, e, kind, certainty, rule, title, why, text: text.slice(s, e), ...(fix !== undefined ? { fix } : {}), by: 'check' });
  };

  // a quotation is someone else's words: only its citation is the writer's business
  if (block.t === 'quote') {
    if (!block.cites?.length && words(text) >= 6)
      add('uncited-quote', 'citation', 'likely', 0, text.length, 'Quotation without a source', 'These read as someone else’s words, and nothing says whose. Cite the passage they come from.');
    return out;
  }

  const prose = block.t === 'p' || isList(block.t);

  // doubled words: "the the"
  for (const m of text.matchAll(/\b([A-Za-z]+)(\s+)(\1)\b/gi)) {
    const w = m[1].toLowerCase();
    if (DOUBLE_OK.has(w) || m[1].length < 1) continue;
    const s = m.index!;
    // Proper names said twice ("Walla Walla") are left alone
    if (/^[A-Z]/.test(m[1]) && /^[A-Z]/.test(m[3]) && s > 0 && !/[.!?]\s*$/.test(text.slice(0, s))) continue;
    if (m[2].includes('\n')) continue;
    add('repeat-word', 'grammar', 'definite', s, s + m[0].length, 'Repeated word', `“${m[1]}” is written twice in a row.`, m[1]);
  }

  // misspellings that are never words
  for (const m of text.matchAll(WORD)) {
    const raw = m[0].replace(/[’']s$/, '');
    const fix = MISSPELT[raw.toLowerCase()];
    if (!fix) continue;
    const s = m.index!;
    const e = s + raw.length;
    if (inCode(text, s, e)) continue;
    add('spelling', 'spelling', 'definite', s, e, 'Spelling', `“${raw}” is usually spelt “${fix}”.`, caseLike(raw, fix));
  }

  // "could of" → "could have" ("would, of course," is fine)
  for (const m of text.matchAll(/\b(could|should|would|must|might)\s+of\b(?!\s+course)/gi)) {
    const s = m.index!;
    add('could-of', 'grammar', 'definite', s, s + m[0].length, '“of” for “have”', `After “${m[1]}”, the word is “have” — “of” is how it sounds, not how it is written.`, `${m[1]} have`);
  }

  // "more then" → "more than"
  for (const m of text.matchAll(/\b(more|less|better|worse|rather|greater|fewer|larger|smaller|higher|lower|older|younger|faster|slower|longer|shorter|bigger|easier|harder|other)\s+(then)\b/gi)) {
    const s = m.index! + m[0].length - m[2].length;
    add('then-than', 'grammar', 'likely', s, s + 4, '“then” for “than”', `A comparison takes “than”. “Then” is about time — if that is what you mean here, leave it.`, caseLike(m[2], 'than'));
  }

  // "it's own" → "its own"; "its a" → "it's a"
  for (const m of text.matchAll(/\b(it[’']s)\s+own\b/gi)) {
    const s = m.index!;
    add('its-own', 'grammar', 'definite', s, s + m[1].length, '“it’s” for “its”', '“It’s” means “it is”. Belonging to it is “its”, with no apostrophe.', caseLike(m[1], 'its'));
  }
  for (const m of text.matchAll(/\b(its)\s+(a|an|not|been|going to|gonna)\b/gi)) {
    const s = m.index!;
    add('its-is', 'grammar', 'likely', s, s + 3, '“its” for “it’s”', '“Its” is belonging to it; “it is” is “it’s”. If you mean something that belongs to it, leave it.', caseLike(m[1], 'it’s'));
  }
  for (const m of text.matchAll(/\b(your)\s+(welcome|a|an|not|going to|right|wrong)\b/gi)) {
    const s = m.index!;
    add('your-youre', 'grammar', 'likely', s, s + 4, '“your” for “you’re”', '“You’re” is “you are”; “your” is belonging to you. If it belongs to them, leave it.', caseLike(m[1], 'you’re'));
  }

  // "its" where "it is" is meant, before the words that only follow "it is"
  for (const m of text.matchAll(/\b(its)\s+(important|true|clear|obvious|hard|easy|possible|impossible|likely|unlikely|necessary|essential|worth|just|also|still|really|so|too|always|never|getting|becoming)\b/gi)) {
    const s = m.index!;
    add('its-is', 'grammar', 'likely', s, s + 3, '“its” for “it’s”', '“Its” is belonging to it; “it is” is “it’s”. If you mean something that belongs to it, leave it.', caseLike(m[1], 'it’s'));
  }

  // the verb agreeing with its subject: "they was", "I is", "she have", "they has"
  const wordBefore = (at: number) => /([A-Za-z’']+)\s*$/.exec(text.slice(0, at))?.[1]?.toLowerCase() ?? '';
  // a word that asks, or a helper, puts the bare verb after "he" or "she" correctly: "did she have", "should it have"
  const AUX = /^(did|does|do|didn[’']t|doesn[’']t|will|would|could|should|might|must|may|can|shall|let|to|make|makes|made|help|helps|helped|see|saw|watch|hear|heard)$/;
  // "thank you is", "singular they is", "the word we is": the pronoun is not the subject
  const NOT_SUBJECT = /^(thank|bless|singular|royal|the|a|word|pronoun|editorial)$/;
  for (const m of text.matchAll(/\b(they|we|you)\s+(was)\b/gi)) {
    if (NOT_SUBJECT.test(wordBefore(m.index!))) continue;
    const s = m.index! + m[0].length - 3;
    add('agree-was', 'grammar', 'definite', s, s + 3, `“${m[1]} was”`, `With “${m[1].toLowerCase()}”, the verb is “were”. In dialogue that speaks this way on purpose, dismiss this.`, caseLike(m[2], 'were'));
  }
  for (const m of text.matchAll(/\b(I)\s+(is|are|has|does|doesn[’']t)\b/g)) {
    const prev = /([A-Za-z]+)\s*$/.exec(text.slice(0, m.index!))?.[1] ?? '';
    // "Part I is", "World War I has": a numeral, not the writer — a capital that does not start the sentence
    const lead = text.slice(0, m.index!).replace(/[A-Za-z]+\s*$/, '');
    const initial = !lead.trim() || /[.!?]["”’)]?\s*$/.test(lead);
    if ((/^[A-Z]/.test(prev) && !initial) || /^(part|chapter|book|volume|vol|act|scene|phase|stage|war|section|appendix|figure|fig|table|type|class|level|grade|unit|model|series|article|annex|exhibit)$/i.test(prev)) continue;
    const fix = { is: 'am', are: 'am', has: 'have', does: 'do', 'doesn’t': 'don’t', "doesn't": "don't" }[m[2]] ?? null;
    if (!fix) continue;
    const s = m.index! + m[0].length - m[2].length;
    add('agree-i', 'grammar', 'likely', s, s + m[2].length, `“I ${m[2]}”`, `With “I”, the verb is “${fix}”. If “I” here is a numeral or a letter (“Part I”), leave it.`, fix);
  }
  for (const m of text.matchAll(/\b(he|she|it)\s+(have|haven[’']t|don[’']t)\b/gi)) {
    if (AUX.test(wordBefore(m.index!))) continue;
    const verb = m[2].toLowerCase();
    const fix = verb === 'have' ? 'has' : verb.startsWith('haven') ? `hasn${verb.slice(5)}` : `doesn${verb.slice(3)}`;
    const s = m.index! + m[0].length - m[2].length;
    add('agree-3', 'grammar', 'likely', s, s + m[2].length, `“${m[1]} ${m[2]}”`, `With “${m[1].toLowerCase()}”, the verb is “${fix}” — unless a word like “did” or “should” comes first (“did she have”).`, caseLike(m[2], fix));
  }
  for (const m of text.matchAll(/\b(they|we|you)\s+(has|does|doesn[’']t|is)\b/gi)) {
    const w = wordBefore(m.index!);
    if (AUX.test(w) || NOT_SUBJECT.test(w)) continue;
    const verb = m[2].toLowerCase();
    const fix = verb === 'has' ? 'have' : verb === 'does' ? 'do' : verb === 'is' ? 'are' : `don${verb.slice(5)}`;
    const s = m.index! + m[0].length - m[2].length;
    add('agree-pl', 'grammar', 'likely', s, s + m[2].length, `“${m[1]} ${m[2]}”`, `With “${m[1].toLowerCase()}”, the verb is “${fix}”.`, caseLike(m[2], fix));
  }
  for (const m of text.matchAll(/\b(he|she|it)\s+(were)\b/gi)) {
    // "if it were", "as though she were", "as it were": the subjunctive, which is right
    if (/\b(if|though|wish|wished|wishes|suppose|supposing|imagine|unless|lest|as)\b[^.!?;]*$/i.test(text.slice(Math.max(0, m.index! - 60), m.index!))) continue;
    const s = m.index! + m[0].length - 4;
    add('agree-were', 'grammar', 'likely', s, s + 4, `“${m[1]} were”`, `With “${m[1].toLowerCase()}”, it is usually “was”. After “if” or “as though” — something imagined — “were” is right, and this would not be marked.`, caseLike(m[2], 'was'));
  }

  // there, their, they're
  for (const m of text.matchAll(/\b(their)\s+(is|are|was|were|will be|has been|have been)\b/gi)) {
    const s = m.index!;
    add('their-there', 'grammar', 'likely', s, s + 5, '“their” for “there”', '“Their” is belonging to them; “there is” and “there are” say that something exists.', caseLike(m[1], 'there'));
  }
  for (const m of text.matchAll(/\b(there|they[’']re)\s+own\b/gi)) {
    const s = m.index!;
    add('there-own', 'grammar', 'definite', s, s + m[1].length, `“${m[1]} own”`, '“Their own” — belonging to them — is spelt “their”.', caseLike(m[1], 'their'));
  }

  // "between you and I" → "me" (after a preposition, the object). Only where nothing follows the "I" —
  // "for you and I think…" starts a new clause, and is right
  for (const m of text.matchAll(/\b(between)\s+(you|him|her|them|us)\s+and\s+(I)(?![’'\w])|\b(for|with|to|from|of|about|against|among|beside|without)\s+(you|him|her|them|us)\s+and\s+(I)(?=\s*[.,;:!?)”"]|\s*$)/g)) {
    const prep = (m[1] ?? m[4]).toLowerCase();
    const pron = m[2] ?? m[5];
    const s = m.index! + m[0].length - 1;
    add('and-i', 'grammar', 'likely', s, s + 1, '“and I” after a preposition', `After “${prep}”, it is “me”: you would write “${prep} me”, so it is “${prep} ${pron} and me”.`, 'me');
  }

  // "may of", "ought to of" → "have" (the rest of "could of" is below)
  for (const m of text.matchAll(/\b(may|ought to)\s+of\b(?!\s+course)/g)) {
    const s = m.index!;
    add('could-of', 'grammar', 'definite', s, s + m[0].length, '“of” for “have”', `After “${m[1]}”, the word is “have” — “of” is how it sounds, not how it is written.`, `${m[1]} have`);
  }

  // words that are swapped for others that sound like them
  for (const m of text.matchAll(/\b(to|will|would|could|might|may|don[’']t|didn[’']t|do not|does not|did not|cannot|can[’']t)\s+(loose)\b/gi)) {
    const s = m.index! + m[0].length - 5;
    add('loose-lose', 'grammar', 'likely', s, s + 5, '“loose” for “lose”', '“Lose” is to stop having something; “loose” is not tight. If you mean to set something free, leave it.', caseLike(m[2], 'lose'));
  }
  for (const m of text.matchAll(/\b(an|the|any|no|little)\s+(affect)\b/gi)) {
    const s = m.index! + m[0].length - 6;
    add('affect-effect', 'grammar', 'likely', s, s + 6, '“affect” for “effect”', 'The result is an “effect”; to “affect” is to change something. (In psychology “affect” is also a noun — then leave it.)', caseLike(m[2], 'effect'));
  }
  for (const m of text.matchAll(/\b(less)\s+(people|persons|students|children|kids|things|items|words|books|cars|days|weeks|months|years|hours|minutes|mistakes|errors|options|choices|jobs|cases|times|calories|members|users|employees|workers|countries|cities|homes|houses)\b/gi)) {
    const s = m.index!;
    add('less-fewer', 'grammar', 'likely', s, s + 4, '“less” for “fewer”', `Things that can be counted take “fewer” (fewer ${m[2].toLowerCase()}); “less” is for amounts (less time, less money).`, caseLike(m[1], 'fewer'));
  }
  for (const m of text.matchAll(/\b(amount)\s+of\s+(people|persons|students|children|things|items|words|books|cars|days|years|mistakes|errors|options|choices|jobs|cases|times|members|users|employees|countries|cities|homes|houses)\b/gi)) {
    const s = m.index!;
    add('amount-number', 'grammar', 'likely', s, s + 6, '“amount of” for “number of”', `Things that can be counted take “number of”; “amount of” is for what cannot (an amount of water).`, caseLike(m[1], 'number'));
  }
  for (const m of text.matchAll(/\b(irregardless)\b/gi)) {
    const s = m.index!;
    add('irregardless', 'grammar', 'likely', s, s + m[0].length, '“irregardless”', '“Regardless” says it; “irregardless” is read by many as an error.', caseLike(m[1], 'regardless'));
  }
  for (const m of text.matchAll(/\bfor all intensive purposes\b/gi)) {
    const s = m.index!;
    add('intents', 'grammar', 'definite', s, s + m[0].length, '“intensive purposes”', 'The phrase is “for all intents and purposes”.', caseLike(m[0], 'for all intents and purposes'));
  }
  for (const m of text.matchAll(/\b(its[’'])(?=\s)/gi)) {
    const s = m.index!;
    add('its-apos', 'grammar', 'definite', s, s + m[1].length, '“its’”', '“Its’” is never right: belonging to it is “its”; “it is” is “it’s”.', caseLike(m[1], 'its'));
  }

  // spaces: two between words, none after a comma, one before ; : ! ?
  for (const m of text.matchAll(/([^\s])( {2,})(?=[^\s])/g)) {
    const s = m.index! + 1;
    const afterStop = /[.!?]["”’)]?$/.test(m[1]);
    add('double-space', 'grammar', afterStop ? 'likely' : 'definite', s, s + m[2].length, 'Extra space', afterStop ? 'Two spaces after a full stop are a typewriter habit; one is the rule in print.' : 'There are two spaces between these words.', ' ');
  }
  for (const m of text.matchAll(/([A-Za-z]{2,}),([A-Za-z]{2,})/g)) {
    const s = m.index! + m[1].length;
    if (inCode(text, m.index!, s + 1 + m[2].length)) continue;
    add('comma-space', 'grammar', 'likely', s, s + 1, 'Missing space', 'There is no space after the comma.', ', ');
  }
  for (const m of text.matchAll(/([A-Za-z0-9”"’)])(\s+)([;:!?])(?=\s|$)/g)) {
    if (m[2].includes('\n')) continue;
    const s = m.index! + 1;
    add('space-punct', 'grammar', 'likely', s, s + m[2].length + 1, 'Space before punctuation', `In English there is no space before “${m[3]}”. (French puts one there — if this is French, leave it.)`, m[3]);
  }

  // a / an
  for (const m of text.matchAll(/(^|[\s(“"])(a|an|A|An)\s+([A-Za-z][\w'’-]*)/g)) {
    const art = m[2];
    const next = m[3];
    const s = m.index! + m[1].length;
    if (next.length < 2 || next === next.toUpperCase()) continue;
    // a capital "A" mid-sentence is a name or a grade ("Plan A is"), not an article
    if (/^A/.test(art) && s > 0 && !/([.!?]["”’)]?\s+|^\s*)$/.test(text.slice(0, s))) continue;
    if (inCode(text, s, s + art.length + 1 + next.length) || A_AN_EITHER.test(next)) continue;
    const vowel = /^[aeiou]/i.test(next);
    const wantsAn = (vowel && !A_EXCEPT.test(next)) || AN_EXCEPT.test(next);
    const isAn = art.toLowerCase() === 'an';
    if (wantsAn === isAn) continue;
    const fix = caseLike(art, wantsAn ? 'an' : 'a');
    add('a-an', 'grammar', 'likely', s, s + art.length, `“${art}” before “${next}”`, `Before a word that ${wantsAn ? 'starts with a vowel sound' : 'starts with a consonant sound'}, it is “${fix.toLowerCase()}”. It goes by the sound, not the letter — say it aloud if unsure.`, fix);
  }

  // lower-case "i" on its own
  for (const m of text.matchAll(/(^|[\s(“"‘])(i)(?=$|[\s,.;:!?’'”")]|[’'](m|ve|ll|d)\b)/g)) {
    const s = m.index! + m[1].length;
    if (/^i\.e/i.test(text.slice(s, s + 3))) continue;
    // "(i)" numbers a list
    if (text[s - 1] === '(' && text[s + 1] === ')') continue;
    add('cap-i', 'grammar', 'definite', s, s + 1, 'Capital I', '“I” is always a capital letter.', 'I');
  }

  // space before a comma or full stop; doubled punctuation; no space after a sentence
  for (const m of text.matchAll(/(\S)(\s+)([,.])(?!\.)(?=\s|$)/g)) {
    if (m[2].includes('\n')) continue;
    const s = m.index! + 1;
    add('space-punct', 'grammar', 'definite', s, s + m[2].length + 1, 'Space before punctuation', `There is a space before the “${m[3]}”.`, m[3]);
  }
  for (const m of text.matchAll(/([,;])\1+|\.{2,}/g)) {
    // three or more full stops are an ellipsis
    if (m[0][0] === '.' && m[0].length !== 2) continue;
    const s = m.index!;
    const one = m[0][0];
    add('double-punct', 'grammar', one === '.' ? 'likely' : 'definite', s, s + m[0].length, 'Doubled punctuation', one === '.' ? 'Two full stops — one, or three for an ellipsis.' : `“${one}” is written twice.`, one);
  }
  for (const m of text.matchAll(/([a-z]{2,})([.!?;,])([A-Z][a-z]+)/g)) {
    const s = m.index! + m[1].length;
    if (inCode(text, m.index!, s + 1 + m[3].length)) continue;
    add('missing-space', 'grammar', 'likely', s, s + 1, 'Missing space', `There is no space after the “${m[2]}”.`, `${m[2]} `);
  }

  // a sentence that starts in lower case
  if (prose) {
    for (const sn of sentences(text)) {
      const first = /^["“‘'(]*([a-z][\w’'-]*)/.exec(sn.text);
      if (!first) continue;
      const at = sn.s + sn.text.indexOf(first[1]);
      if (LOWER_OK.test(text.slice(at))) continue;
      // a paragraph's first sentence is checked only in real paragraphs; list items are often fragments
      if (at === 0 || sn.s === 0) {
        if (isList(block.t) || words(text) < 8) continue;
      }
      const before = text.slice(0, sn.s).trimEnd();
      if (before && !/[.!?]["”’)]*$/.test(before)) continue;
      if (/[:;]$/.test(before)) continue;
      add('sentence-cap', 'grammar', 'likely', at, at + 1, 'Capital letter', 'A sentence starts with a capital letter. If this continues the sentence before, check the punctuation between them.', first[1][0].toUpperCase());
    }
  }

  // long sentences, long paragraphs
  if (prose) {
    for (const sn of sentences(text)) {
      const n = words(sn.text);
      if (n > 42) add('long-sentence', 'clarity', 'suggestion', sn.s, sn.e, 'A long sentence', `This sentence is ${n} words long. Past about thirty, readers start to lose its thread — see whether it is carrying more than one idea.`);
    }
    const n = words(text);
    if (block.t === 'p' && n > 230) add('long-paragraph', 'structure', 'suggestion', 0, text.length, 'A long paragraph', `This paragraph runs to ${n} words. A paragraph usually makes one point; see whether this one makes two.`);
  }

  // the same opening, three sentences running
  if (prose) {
    const sns = sentences(text);
    for (let k = 2; k < sns.length; k++) {
      const op = (x: { text: string }) => /^["“‘'(]*([A-Za-z’']+)/.exec(x.text)?.[1]?.toLowerCase();
      const a = op(sns[k - 2]);
      if (a && a === op(sns[k - 1]) && a === op(sns[k]) && !['the', 'a', 'an'].includes(a)) {
        add('same-opening', 'repetition', 'suggestion', sns[k].s, sns[k].s + a.length, 'The same opening', `Three sentences in a row start with “${a}”. Varying one of them makes the paragraph easier to hear.`);
        break;
      }
    }
  }

  // a distinctive word used twice within a few words
  if (prose) {
    const toks = Array.from(text.matchAll(/[A-Za-z][A-Za-z’'-]{5,}/g));
    for (let k = 1; k < toks.length; k++) {
      const w = toks[k][0].toLowerCase();
      if (STOP.has(w)) continue;
      for (let j = Math.max(0, k - 6); j < k; j++) {
        if (toks[j][0].toLowerCase() !== w) continue;
        const gap = words(text.slice(toks[j].index! + toks[j][0].length, toks[k].index!));
        if (gap > 0 && gap <= 6) {
          const s = toks[k].index!;
          add('close-repeat', 'repetition', 'suggestion', s, s + toks[k][0].length, 'A word repeated close together', `“${toks[k][0]}” comes twice within a few words.`);
        }
        break;
      }
    }
  }

  // a bracket or a quotation opened and never closed (or closed and never opened)
  if (prose || isHeading(block.t)) {
    const open: number[] = [];
    let stray = -1;
    for (let k = 0; k < text.length; k++) {
      const c = text[k];
      const lead = text.slice(Math.max(0, k - 3), k);
      // ":(" and ":)" are faces
      if (c === '(' && !/[:;]-?$/.test(lead)) open.push(k);
      else if (c === ')') {
        if (open.length) {
          open.pop();
          continue;
        }
        // with nothing open, "1)" and "a)" number a list
        if (/(^|\s)[A-Za-z0-9]{1,2}$/.test(lead) || /[:;]-?$/.test(lead)) continue;
        if (stray < 0) stray = k;
      }
    }
    if (open.length) add('bracket-open', 'grammar', 'likely', open[open.length - 1], open[open.length - 1] + 1, 'A bracket never closed', 'This bracket is opened and not closed in this paragraph.');
    else if (stray >= 0) add('bracket-close', 'grammar', 'likely', stray, stray + 1, 'A bracket never opened', 'This closing bracket has no opening one before it in this paragraph.');
    const opens = (text.match(/“/g) ?? []).length;
    const closes = (text.match(/”/g) ?? []).length;
    if (opens > closes) {
      const at = text.lastIndexOf('“');
      add('quote-open', 'grammar', 'likely', at, at + 1, 'A quotation never closed', 'These quotation marks open and do not close in this paragraph. (A quotation running over several paragraphs closes only at its end — then leave it.)');
    } else if ((text.match(/"/g) ?? []).length % 2 === 1 && !/\d"/.test(text)) {
      const at = text.lastIndexOf('"');
      add('quote-open', 'grammar', 'likely', at, at + 1, 'A quotation mark without its pair', 'There is an odd number of quotation marks in this paragraph — one has lost its pair.');
    }
  }

  // wordiness: a phrase that says no more than a shorter one — a judgement call, offered, never underlined
  if (prose || isHeading(block.t)) {
    for (const [re, to, why] of WORDY) {
      for (const m of text.matchAll(re)) {
        const s = m.index!;
        const fix = typeof to === 'function' ? to(m) : to;
        add('wordy', 'clarity', 'suggestion', s, s + m[0].length, `“${m[0]}”`, why, caseLike(m[0], fix));
      }
    }
  }

  // research and figures with nothing behind them
  if (prose && !supported) {
    const claims = [
      /\b(studies|research|researchers|scientists|experts|evidence|data|statistics|surveys?|polls?|a (recent )?(study|survey|report|poll))\s+(show|shows|showed|shown|prove|proves|proved|suggests?|suggested|found|finds|indicates?|indicated|confirms?|confirmed|says?|said|agree|agreed|demonstrates?|demonstrated|reveals?|revealed)\b/i,
      /\baccording to (research|studies|experts|scientists|statistics|a (recent )?(study|survey|report|poll))\b/i,
      /\b(it is|it['’]s) (a )?(well[- ])?(known|proven|established|documented) (fact )?that\b/i,
      /\beveryone knows\b/i,
      /\b\d+(\.\d+)?\s?(%|percent|per cent)/i,
      /\b\d+ (out of|in) (every )?\d+\b/i,
      /\b\d[\d,.]*\s+(million|billion|thousand)\b/i,
    ];
    for (const sn of sentences(text)) {
      const hit = claims.map((re) => re.exec(sn.text)).find(Boolean);
      if (!hit) continue;
      add('unsupported', 'support', 'likely', sn.s, sn.e, 'A claim with nothing behind it', 'This rests on research or a figure, and nothing in your draft says where it comes from. Link the passage it comes from, or name the source yourself — Socria will not supply one.');
    }
  }

  // someone else's words, in quotation marks, uncited
  if (prose && !block.cites?.length) {
    for (const m of text.matchAll(/[“"]([^”"]{30,})[”"]/g)) {
      if (words(m[1]) < 8) continue;
      const s = m.index!;
      add('uncited-quote', 'citation', 'likely', s, s + m[0].length, 'Quotation without a source', 'These read as someone else’s words, and nothing says whose. Cite the passage they come from.');
    }
  }

  return out.slice(0, 16);
}

// ── the whole document ───────────────────────────────────────────────

const cache = new WeakMap<Block, { supported: boolean; issues: Issue[] }>();

/** Cards that point at a passage — a block grown from one stands on it. */
function supportedCards(doc: Pick<WriteDoc, 'cards'>): Set<string> {
  return new Set(doc.cards.filter((c) => c.links?.some((l) => l.k === 'doc')).map((c) => c.id));
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

/**
 * Every finding in the document, in reading order, without the ones the
 * person dismissed. Unchanged blocks are not checked again: a block that has
 * not changed is the same object, and its findings are kept with it.
 */
export function checkDoc(doc: Pick<WriteDoc, 'blocks' | 'cards' | 'dismissed'>): Issue[] {
  const backed = supportedCards(doc);
  const out: Issue[] = [];
  // every block of words: paragraphs, headings, lists, quotes — and each cell of a table
  for (const b of textBlocks(doc)) {
    const supported = !!b.cites?.length || !!b.from?.some((f) => backed.has(f));
    let hit = cache.get(b);
    if (!hit || hit.supported !== supported) {
      hit = { supported, issues: checkBlock(b, { supported }) };
      cache.set(b, hit);
    }
    out.push(...hit.issues);
  }

  // across blocks: a heading with nothing under it; a sentence said twice
  for (let k = 0; k < doc.blocks.length; k++) {
    const b = doc.blocks[k];
    if (!isHeading(b.t) || !b.text.trim()) continue;
    const lvl = Number(b.t[1]);
    let j = k + 1;
    while (j < doc.blocks.length && !doc.blocks[j].text.trim()) j++;
    const next = doc.blocks[j];
    if (!next || (isHeading(next.t) && Number(next.t[1]) <= lvl)) {
      out.push({ id: issueId('empty-heading', b, 0, b.text.length), block: b.id, s: 0, e: b.text.length, kind: 'structure', certainty: 'suggestion', rule: 'empty-heading', title: 'Nothing under this heading', why: 'There is nothing under this heading yet — fine for an outline; worth a look before it goes anywhere.', text: b.text, by: 'check' });
    }
  }
  const seen = new Map<string, string>();
  for (const b of doc.blocks) {
    if (b.t === 'quote' || isHeading(b.t) || b.t === 'code' || !isTextType(b.t)) continue;
    for (const sn of sentences(b.text)) {
      if (words(sn.text) < 6) continue;
      const key = norm(sn.text);
      if (!seen.has(key)) {
        seen.set(key, b.id);
        continue;
      }
      out.push({ id: issueId('duplicate-sentence', b, sn.s, sn.e), block: b.id, s: sn.s, e: sn.e, kind: 'repetition', certainty: 'likely', rule: 'duplicate-sentence', title: 'Said twice', why: 'This sentence appears earlier in your draft, word for word.', text: sn.text, by: 'check' });
    }
  }

  const dismissed = new Set(doc.dismissed);
  const order = textOrder(doc);
  return out
    .filter((i) => !dismissed.has(i.id))
    .sort((a, b) => (order.get(a.block)! - order.get(b.block)!) || a.s - b.s);
}

/** What is shown under the words as the person writes: only what is definite or likely. */
export const inline = (issues: Issue[]) => issues.filter((i) => i.certainty !== 'suggestion');

/** The Check list's three groups, by kind: the language, how it reads, and what holds it up. */
export const ISSUE_GROUPS: { key: string; label: string; kinds: IssueKind[] }[] = [
  { key: 'language', label: 'Spelling and grammar', kinds: ['spelling', 'grammar'] },
  { key: 'clarity', label: 'Clarity and style', kinds: ['clarity', 'repetition', 'structure'] },
  { key: 'support', label: 'Reasoning and sources', kinds: ['logic', 'support', 'citation'] },
];

/**
 * Every fix of these findings made at once — "Fix all": each only where its
 * words still are, from the end of a block back so the offsets before it stay
 * true, and none that overlaps one already made. Returns the new document and
 * how many were made. Nothing without a fix is touched.
 */
export function applyFixes(doc: WriteDoc, issues: Issue[]): { doc: WriteDoc; applied: number } {
  const byBlock = new Map<string, Issue[]>();
  for (const i of issues) {
    if (i.fix === undefined) continue;
    const list = byBlock.get(i.block) ?? [];
    list.push(i);
    byBlock.set(i.block, list);
  }
  let d = doc;
  let applied = 0;
  for (const [id, list] of Array.from(byBlock)) {
    let b = findText(d, id);
    if (!b) continue;
    let floor = Infinity;
    for (const i of [...list].sort((x, y) => y.s - x.s || y.e - x.e)) {
      if (i.e > floor || b.text.slice(i.s, i.e) !== i.text) continue;
      b = spliceBlock(b, i.s, i.e, i.fix!);
      floor = i.s;
      applied++;
    }
    d = replaceText(d, b);
  }
  return { doc: d, applied };
}
