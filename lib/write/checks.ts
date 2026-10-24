// lib/write/checks.ts — proofreading that needs no model.
//
// What can be decided by a rule is decided by a rule, here, on the device, as
// the person writes: a doubled word, a misspelling that is never a word,
// "could of", a missing capital, a sentence that runs to fifty words, a claim
// of research with nothing cited. Each finding says how sure it is —
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

import { isHeading, isList, isTextType, textBlocks, textOrder, type Block, type WriteDoc } from './doc';

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
    if (out.some((x) => x.s < e && s < x.e && x.kind === kind)) return;
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

  return out.slice(0, 12);
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
