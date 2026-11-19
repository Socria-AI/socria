// lib/ux-v0/intent.ts — what is being made, before how it looks.
//
// THE FAILURE THIS ENDS. "Booking screen for a yoga studio" came back as a
// landing page ABOUT booking: a nav, an oversized headline, "Begin" and "Read
// more", empty space, and no way to book. Traced, the causes were structural,
// not the model's: a brief could only be a "website" or an "app-screen"; the
// generation prompt required every website to be "a nav first, a footer last,
// 5–9 sections between them"; the section library had no way to choose a day
// or a time; and the Direction studies drew the same hard-coded landing page
// for every brief.
//
// An intent separates WHAT IS BEING MADE from how it should look:
//
//   kind          the experience: a site, a booking screen, a checkout, a
//                 dashboard, a form, a multi-step flow, an editorial
//                 publication, a portfolio, an interactive piece, a data
//                 visualisation, an app screen. Hybrids keep their requirements
//                 (a site WITH class booking is a site that must offer booking).
//   screen        a task-first screen (the interface itself) or a composed page
//   task          what the person using it does, in one line
//   requirements  each with a stable id, what satisfies it (a component), and
//                 whose it is: the designer's words, or SocriaUX's reading
//   prohibitions  what the designer ruled out
//   signals       the words it was read from, shown to the designer, who can
//                 correct the reading (and that correction is final)
//
// The reading is deterministic and explainable: the designer's own phrases
// decide it. A model's reading (the brief) is used only where those phrases say
// little, and the designer's correction always wins.

export const EXPERIENCES = ['site', 'booking', 'checkout', 'dashboard', 'form', 'flow', 'app', 'editorial', 'portfolio', 'interactive', 'data'] as const;
export type Experience = (typeof EXPERIENCES)[number];

export const EXPERIENCE_LABEL: Record<Experience, string> = {
  site: 'A website',
  booking: 'A booking screen',
  checkout: 'A checkout',
  dashboard: 'A dashboard',
  form: 'A form',
  flow: 'A multi-step flow',
  app: 'An app screen',
  editorial: 'An editorial publication',
  portfolio: 'A portfolio',
  interactive: 'An interactive experience',
  data: 'A data visualisation',
};

/** Task-first experiences: the interface itself, not a page about it. */
const SCREENS: ReadonlySet<Experience> = new Set(['booking', 'checkout', 'dashboard', 'form', 'flow', 'app', 'data']);

export type Authority = 'designer' | 'socriaux';

export interface Requirement {
  /** stable: the same need keeps the same id through every revision */
  id: string;
  text: string;
  /** the component that satisfies it, when one does */
  component?: 'booking' | 'form' | 'table' | 'chart' | 'stat-cards' | 'gallery' | 'list' | 'pricing' | 'faq' | 'scene' | 'configurator';
  authority: Authority;
  required: boolean;
}

export interface DesignIntent {
  kind: Experience;
  screen: boolean;
  task: string;
  /** what is being booked, bought or looked at, when it was said ("yoga class") */
  subject: string;
  requirements: Requirement[];
  prohibitions: string[];
  /** the phrases the reading rests on */
  signals: string[];
  /** how the kind was decided: the designer's words, their correction, or the brief's reading */
  source: 'words' | 'designer' | 'brief' | 'default';
  /** the designer wrote the task themselves: it is kept through every rewrite */
  taskByDesigner?: boolean;
  /** requirements the designer took out: never put back by a later reading */
  dropped?: string[];
}

type Rule = { kind: Experience; re: RegExp; weight: number; say: string };

/** Phrases that name the thing itself. "X screen", "X flow", "X interface" weigh most. */
const RULES: readonly Rule[] = [
  { kind: 'booking', re: /\b(booking|reservation|appointment|scheduling)\s+(screen|flow|interface|ui|page|widget|form|step|view|panel)\b/, weight: 6, say: 'a booking screen' },
  { kind: 'booking', re: /\b(select|choose|pick)s?\s+(a\s+|the\s+)?(time|date|slot|session|day)\b/, weight: 5, say: 'choosing a time' },
  { kind: 'booking', re: /\b(book|reserve)\s+(a|an|the|their|your|my)?\s*(class|session|table|appointment|room|court|lesson|tour|seat|slot|ticket|treatment|visit)/, weight: 4, say: 'booking' },
  { kind: 'booking', re: /\b(time\s*slots?|availability|available sessions)\b/, weight: 3, say: 'availability' },
  { kind: 'checkout', re: /\b(checkout|check-out|cart|basket|payment (screen|flow|page|form)|order summary|purchase flow)\b/, weight: 5, say: 'a checkout' },
  { kind: 'dashboard', re: /\b(dashboard|admin (panel|screen)|control panel|analytics|monitoring|console|metrics overview|kpis?)\b/, weight: 5, say: 'a dashboard' },
  { kind: 'form', re: /\b(sign[- ]?up|signup|registration|application|enrol?ment|intake|contact|feedback)\s+(form|screen|page)\b|\b(survey|questionnaire)\b/, weight: 5, say: 'a form' },
  { kind: 'flow', re: /\b(multi[- ]?step|wizard|onboarding (flow|screens?)|step[- ]by[- ]step|workflow|multi[- ]screen)\b/, weight: 5, say: 'a multi-step flow' },
  { kind: 'data', re: /\b(data visuali[sz]ation|research visuali[sz]ation|interactive (chart|map)|data explorer|visuali[sz]e (the )?data)\b/, weight: 5, say: 'a data visualisation' },
  // a research or data interface said in its own words: exploring readings, comparing over time, a time series
  { kind: 'data', re: /\b(research (interface|tool|portal|platform|database)|data (portal|tool|interface)|explore (the |their |its )?(data|readings|measurements|records|results|observations)|time[- ]series|(station|sensor|field|lab) (readings|measurements|data)|compare (\w+ ){1,3}(over|across) (a|the) (decade|years?|time|stations?|sites?|samples?))\b/, weight: 5, say: 'a data interface' },
  { kind: 'app', re: /\b(app screen|mobile app|application screen|in-app|settings screen|profile screen|inbox|screen for)\b/, weight: 3, say: 'an app screen' },
  { kind: 'portfolio', re: /\bportfolio\b/, weight: 5, say: 'a portfolio' },
  { kind: 'editorial', re: /\b(magazine|editorial|journal|publication|lookbook|zine|long-?read|article)\b/, weight: 4, say: 'an editorial publication' },
  { kind: 'interactive', re: /\b(interactive (experience|story|piece)|immersive|exhibition|game|playful experience)\b/, weight: 4, say: 'an interactive experience' },
  { kind: 'site', re: /\b(website|web site|landing page|homepage|home page|marketing (site|page)|microsite|one-pager)\b/, weight: 4, say: 'a website' },
  { kind: 'site', re: /\b(promot(e|es|ing)|advertis(e|ing)|marketing|announc(e|es|ing)|launch(ing)? page|showcas(e|ing))\b/, weight: 3, say: 'promoting it' },
];

/** "A website promoting a yoga booking app": the functional words are what the site is ABOUT. */
const ABOUT = /\b(website|site|landing page|page|homepage|campaign)\s+(promoting|for|about|advertising|announcing|selling|introducing|showcasing)\s+(a|an|the|our|my)?\s*[\w\s-]{0,30}?\b(app|tool|product|service|platform|software)\b/;

const lower = (s: string) => ` ${String(s ?? '').toLowerCase().replace(/[’']/g, "'")} `;

function subjectOf(n: string): string {
  const m =
    n.match(/\b(book|reserve)\s+(?:a|an|the|their|your|my)?\s*([a-z]+\s+)?(class|session|table|appointment|room|court|lesson|tour|seat|treatment|visit|haircut|massage|facial|consultation|fitting|viewing|tasting|call|demo|slot|desk|stay)\b/) ??
    n.match(/\b(for)\s+(?:a|an|the|their|your|my)?\s*(?:already[- ]\w+\s+)?([a-z]+\s+)(class|session|table|appointment|lesson|tour|treatment|visit)\b/) ??
    n.match(/\b(?:for|at)\s+(?:a|an|the|my|our)?\s*([a-z]+)\s+(studio|gym|clinic|salon|restaurant|spa|school|club)\b/);
  if (!m) return '';
  if (m[3]) return `${(m[2] ?? '').trim()} ${m[3]}`.trim();
  const place = m[2];
  const what = m[1];
  const thing = /studio|gym|school|club/.test(place) ? 'class' : /restaurant/.test(place) ? 'table' : 'appointment';
  return `${what} ${thing}`.trim();
}

/** What each experience must at least let someone do, and the component that does it. */
const NEEDS: Partial<Record<Experience, Omit<Requirement, 'authority'>[]>> = {
  booking: [{ id: 'req-book', text: 'Choose a day and an available time, then confirm the booking', component: 'booking', required: true }],
  checkout: [{ id: 'req-pay', text: 'Review the order and confirm it', component: 'form', required: true }],
  dashboard: [
    { id: 'req-overview', text: 'See the key figures at a glance', component: 'stat-cards', required: true },
    { id: 'req-detail', text: 'Inspect the items behind them', component: 'table', required: true },
  ],
  form: [{ id: 'req-form', text: 'Fill in and submit the form, with clear validation', component: 'form', required: true }],
  data: [{ id: 'req-data', text: 'Read the data and compare it', component: 'chart', required: true }],
};

/** Requirements the designer's words add to any experience ("a site WITH class booking"). */
const MENTIONS: readonly { re: RegExp; req: Omit<Requirement, 'authority'> }[] = [
  // a booking is of a time; "reserve one" (a product, a pre-order) is not one
  { re: /\b(book(s|ed|ing|ings)?|appointments?)\b|\breserv(e|es|ed|ing|ations?)\b(?!\s+(one|yours|it|them|now|your own|a pair|the (first|product|piece|object|model)))/, req: { id: 'req-book', text: 'Book a time', component: 'booking', required: true } },
  // records to look through: the table that holds them
  { re: /\b(inspect|browse|filter|search|look through) (the |each |every |their |its )?([\w']+ )?(readings|records|log|logs|entries|rows|measurements|observations)\b/, req: { id: 'req-records', text: 'Look through the records', component: 'table', required: true } },
  // 3D and configuring: only when the words ask for them, never as a default for "premium" or "immersive" alone
  { re: /\b(3d|three[- ]dimensional|in three dimensions|360(°| degrees?)? view|turn (it|the product|the object) (in|by) (the|your) hand|webgl|rotat(e|able) (the )?(product|object|model))\b/, req: { id: 'req-3d', text: 'Turn the object in three dimensions', component: 'scene', required: true } },
  { re: /\b(configurat(or|ion)|configure|customi[sz]e (it|yours?|the (product|object|chair|bag|piece))|choose (a|the|its) (finish|colou?r|size|material|glaze|fabric)|build your own)\b/, req: { id: 'req-configure', text: 'Configure the product and see the total', component: 'configurator', required: true } },
  { re: /\b(donat(e|es|ing|ion|ions)|make a gift|give monthly)\b/, req: { id: 'req-donate', text: 'Give a donation', component: 'form', required: true } },
  { re: /\b(registration|application|enrol(l)?ment|order|request|quote|feedback|survey|rsvp)\s+form\b/, req: { id: 'req-form-named', text: 'Fill in the form', component: 'form', required: true } },
  { re: /\b(contact|enquir(y|e)|get in touch|newsletter|sign[- ]?up)\b/, req: { id: 'req-contact', text: 'Get in touch or sign up', component: 'form', required: false } },
  { re: /\b(pricing|prices|plans|membership)\b/, req: { id: 'req-pricing', text: 'Compare prices or plans', component: 'pricing', required: false } },
  { re: /\b(timetable|schedule|menu|programme|program|line-?up)\b/, req: { id: 'req-schedule', text: 'Read the timetable', component: 'list', required: false } },
  { re: /\b(faq|questions)\b/, req: { id: 'req-faq', text: 'Find answers to common questions', component: 'faq', required: false } },
];

const PROHIBIT = /\b(?:no|without|never|avoid|not)\s+([a-z][a-z -]{2,40}?)(?=[,.;]|\s+(?:and|but|or)\b|$)/g;

/**
 * The intent in the designer's words. `override` is the designer's own
 * correction of the kind ("it's a website, not a booking screen"): final.
 * `briefKind` is the brief's reading, used only when the words say little.
 */
export function readIntent(words: string, opts: { override?: Experience | null; briefKind?: Experience | null } = {}): DesignIntent {
  const n = lower(words);
  const score = new Map<Experience, number>();
  const signals: string[] = [];
  for (const r of RULES) {
    if (r.re.test(n)) {
      score.set(r.kind, (score.get(r.kind) ?? 0) + r.weight);
      if (!signals.includes(r.say)) signals.push(r.say);
    }
  }
  // a site ABOUT a booking app is a site: the functional words describe what it promotes
  if (ABOUT.test(n)) {
    score.set('site', (score.get('site') ?? 0) + 6);
    signals.push('a site about a product');
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
  let kind: Experience = ranked[0]?.[0] ?? 'site';
  let source: DesignIntent['source'] = ranked.length ? 'words' : 'default';
  const weak = !ranked.length || ranked[0][1] < 4;
  if (weak && opts.briefKind && (EXPERIENCES as readonly string[]).includes(opts.briefKind)) {
    kind = opts.briefKind;
    source = 'brief';
  }
  if (opts.override && (EXPERIENCES as readonly string[]).includes(opts.override)) {
    kind = opts.override;
    source = 'designer';
  }
  const requirements: Requirement[] = [];
  const add = (r: Omit<Requirement, 'authority'>, authority: Authority) => {
    if (!requirements.some((x) => x.id === r.id)) requirements.push({ ...r, authority });
  };
  for (const r of NEEDS[kind] ?? []) add(r, source === 'words' || source === 'designer' ? 'designer' : 'socriaux');
  // what the designer mentioned besides (a site that must also take bookings) — but never the
  // product a site is about ("a website promoting a booking app" does not take bookings itself)
  // "the reservation" of a product to configure or pre-order is not the booking of a time: without a time, a
  // date, a session or a table anywhere in the words, and with a product to turn or configure, it is not read as one
  const productReserve =
    !/\b(book(ing)?|appointments?)\b/.test(n) &&
    /\breserv/.test(n) &&
    !/\b(times?|dates?|slots?|days?|sessions?|tables?|class(es)?|nights?|stays?|rooms?|seats?|courts?|lessons?|tours?|visits?)\b/.test(n) &&
    (MENTIONS.some((m) => (m.req.id === 'req-3d' || m.req.id === 'req-configure') && m.re.test(n)) || /\b(pre-?orders?|products?)\b/.test(n));
  if (!ABOUT.test(n) || kind !== 'site') for (const m of MENTIONS) if (m.re.test(n) && !(productReserve && m.req.id === 'req-book')) add(m.req, 'designer');
  const prohibitions: string[] = [];
  for (const m of n.matchAll(PROHIBIT)) {
    const p = m[1].trim();
    if (p && !prohibitions.includes(p) && prohibitions.length < 8) prohibitions.push(p);
  }
  return {
    kind,
    screen: SCREENS.has(kind),
    task: taskFor(kind, subjectOf(n)),
    subject: subjectOf(n),
    requirements,
    prohibitions,
    signals: signals.slice(0, 6),
    source,
  };
}

function taskFor(kind: Experience, subject: string): string {
  const what = subject || 'it';
  switch (kind) {
    case 'booking':
      return `Choose a time for ${subject ? `the ${subject}` : 'a session'} and book it`;
    case 'checkout':
      return 'Review an order and confirm it';
    case 'dashboard':
      return 'See what matters at a glance, then look into the detail';
    case 'form':
      return 'Fill in the form and send it';
    case 'flow':
      return 'Move through the steps to finish the task';
    case 'data':
      return 'Read and compare the data';
    case 'app':
      return `Use ${what} on one screen`;
    case 'portfolio':
      return 'See the work, then get in touch';
    case 'editorial':
      return 'Read and browse';
    case 'interactive':
      return 'Explore the experience';
    default:
      return 'Understand the offer and take the next step';
  }
}

/** An intent from anywhere (the brief, the browser) made valid, or null. */
export function normalizeIntent(v: unknown): DesignIntent | null {
  const r = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  if (!r || !(EXPERIENCES as readonly string[]).includes(r.kind as string)) return null;
  const kind = r.kind as Experience;
  const str = (x: unknown, n: number) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const reqs: Requirement[] = [];
  for (const q of Array.isArray(r.requirements) ? r.requirements.slice(0, 16) : []) {
    const o = q && typeof q === 'object' ? (q as Record<string, unknown>) : null;
    const id = o && typeof o.id === 'string' && /^req-[a-z0-9-]{1,40}$/.test(o.id) ? o.id : null;
    const text = str(o?.text, 200);
    if (!id || !text || reqs.some((x) => x.id === id)) continue;
    const component = ['booking', 'form', 'table', 'chart', 'stat-cards', 'gallery', 'list', 'pricing', 'faq', 'scene', 'configurator'].includes(o?.component as string) ? (o!.component as Requirement['component']) : undefined;
    reqs.push({ id, text, ...(component ? { component } : {}), authority: o?.authority === 'designer' ? 'designer' : 'socriaux', required: o?.required !== false });
  }
  return {
    kind,
    screen: SCREENS.has(kind),
    task: str(r.task, 200) || taskFor(kind, str(r.subject, 60)),
    subject: str(r.subject, 60),
    requirements: reqs,
    prohibitions: (Array.isArray(r.prohibitions) ? r.prohibitions : []).map((x) => str(x, 60)).filter(Boolean).slice(0, 8),
    signals: (Array.isArray(r.signals) ? r.signals : []).map((x) => str(x, 60)).filter(Boolean).slice(0, 6),
    source: (['words', 'designer', 'brief', 'default'] as const).includes(r.source as any) ? (r.source as DesignIntent['source']) : 'brief',
    ...(r.taskByDesigner === true ? { taskByDesigner: true } : {}),
    ...(Array.isArray(r.dropped) && r.dropped.length ? { dropped: [...new Set(r.dropped.filter((x): x is string => typeof x === 'string' && /^req-[a-z0-9-]{1,40}$/.test(x)))].slice(0, 24) } : {}),
  };
}

/** A new requirement the designer wrote: its id is stable for the same words. */
export function requirementFrom(text: string, authority: Authority = 'designer'): Requirement {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  let h = 0x811c9dc5;
  for (const ch of t.toLowerCase()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const lowered = lower(t);
  const comp = MENTIONS.find((m) => m.re.test(lowered))?.req.component;
  return { id: `req-${h.toString(36)}`, text: t, ...(comp ? { component: comp } : {}), authority, required: true };
}

/** The components a design must contain to do what its intent requires. */
export function requiredComponents(intent: DesignIntent): Requirement['component'][] {
  return [...new Set(intent.requirements.filter((r) => r.required && r.component).map((r) => r.component))];
}

/** Section kinds that make a page a landing page: out of place on a task-first screen unless asked for. */
export const LANDING_KINDS: ReadonlySet<string> = new Set(['nav', 'hero', 'cta', 'footer', 'logos', 'quote', 'stats', 'gallery', 'split', 'pricing']);

/**
 * How a design for this intent is structured, said to the generator. A screen
 * is the task, first and dominant; a site follows a visitor's path. Nothing is
 * universal: no nav, hero or footer is assumed for a screen.
 */
export function structureRule(intent: DesignIntent, pageType: 'website' | 'app-screen'): string {
  if (intent.screen) {
    const comps = requiredComponents(intent).join(', ') || 'the component the task needs';
    return [
      `This is ${EXPERIENCE_LABEL[intent.kind].toLowerCase()}, the interface itself: NOT a page about it. Task: ${intent.task}.`,
      `- The task is the screen: ${comps} first and dominant, fully written (real items, the states it has).`,
      '- No marketing hero, no feature grid, no testimonials, no call-to-action band, no footer — unless the brief asks for one.',
      pageType === 'app-screen' ? '- Product chrome only where it helps: an app-nav or app-header is optional; a single focused screen may have neither.' : '- No site navigation unless the brief asks for it.',
      '- Content is demonstration data where real data is not given (times, names, figures): plausible, consistent, and said to be sample data in the component\'s note. Never claim a booking, payment or submission really happened.',
    ].join('\n');
  }
  if (intent.kind === 'portfolio' || intent.kind === 'editorial' || intent.kind === 'interactive') {
    return `- Structure: ${EXPERIENCE_LABEL[intent.kind].toLowerCase()}: the work or the writing leads; sections only where they serve it. A nav and a footer are optional; no generic marketing sections.`;
  }
  return '- Structure: the order a visitor needs: what this is, why it matters to them, how to act. A nav and a footer where a site needs them; 3–9 sections, each earning its place; one primary action, repeated at most twice.';
}

// ── demonstration content for a booking, when the brief gives no times ──

/** Sample days and times: plausible, deterministic, and labelled as samples wherever they are drawn. */
export function sampleBooking(intent: DesignIntent | null, brief: { objective?: string; audience?: string } = {}): Record<string, unknown> {
  const subject = intent?.subject || 'class';
  const name = subject
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
  const days = [
    { label: 'Today', slots: [['07:00', 'full'], ['12:30', 'open'], ['18:00', 'few']] },
    { label: 'Tomorrow', slots: [['07:00', 'open'], ['09:30', 'open'], ['12:30', 'few'], ['18:00', 'open'], ['19:30', 'full']] },
    { label: 'Wed', slots: [['07:00', 'open'], ['18:00', 'open'], ['19:30', 'open']] },
    { label: 'Thu', slots: [['09:30', 'few'], ['12:30', 'open'], ['18:00', 'open']] },
    { label: 'Fri', slots: [['07:00', 'open'], ['17:30', 'open']] },
  ];
  return {
    eyebrow: '',
    title: 'Choose a time',
    intro: '',
    item: name,
    details: ['[Duration]', '[Teacher]', '[Room]'],
    days: days.map((d) => ({ label: d.label, date: '', slots: d.slots.map(([time, status]) => ({ time, status, note: '' })) })),
    action: 'Book this time',
    confirmTitle: 'You’re booked',
    confirmText: 'A confirmation would be sent to you here.',
    note: 'Sample times for this prototype — not live availability. No booking is made.',
  };
}

/** The words a brief was written in, for reading an intent from an older brief that has none stored. */
export function briefWords(brief: { objective?: string; functionalRequirements?: readonly string[]; layoutDirection?: string; visualDirection?: string; userGoals?: readonly string[] }): string {
  return [brief.objective, ...(brief.functionalRequirements ?? []), ...(brief.userGoals ?? []), brief.layoutDirection].filter(Boolean).join('. ');
}

/** A brief's intent: the one stored with it, or read from its words (briefs written before intents). */
export function intentOf(brief: { intent?: DesignIntent; objective?: string; functionalRequirements?: readonly string[]; layoutDirection?: string; userGoals?: readonly string[]; pageType?: string } | null | undefined): DesignIntent {
  if (brief?.intent) return brief.intent;
  const read = readIntent(briefWords(brief ?? {}));
  // an older app-screen brief with nothing more to go on stays an app screen
  return read.source === 'default' && brief?.pageType === 'app-screen' ? { ...read, kind: 'app', screen: true, task: taskFor('app', '') } : read;
}

/** The page type a design for this intent is drawn as: a task-first screen is an app screen, never a site. */
export function pageTypeFor(intent: DesignIntent, pageType: 'website' | 'app-screen'): 'website' | 'app-screen' {
  return intent.screen ? 'app-screen' : pageType;
}

/**
 * The intent a brief is written with. Read from the DESIGNER'S words (their first description, their
 * answers, what they asked to change), never from the model's prose; the model's own reading of the kind
 * (`briefKind`) counts only where those words say little. What the designer decided before survives a
 * rewrite: their correction of the kind (`current.source === 'designer'`), and the requirements and
 * prohibitions they added. `override` is a correction made now.
 */
export function settleIntent(words: string, opts: { briefKind?: unknown; current?: DesignIntent | null; override?: unknown } = {}): DesignIntent {
  const valid = (k: unknown): k is Experience => typeof k === 'string' && (EXPERIENCES as readonly string[]).includes(k);
  const override = valid(opts.override) ? opts.override : opts.current?.source === 'designer' ? opts.current.kind : null;
  const read = readIntent(words, { override, briefKind: valid(opts.briefKind) ? opts.briefKind : null });
  const cur = opts.current;
  if (!cur) return read;
  // what the designer took out stays out; what they wrote stays in
  const dropped = cur.dropped ?? [];
  const requirements = read.requirements.filter((r) => !dropped.includes(r.id));
  for (const r of cur.requirements) if (r.authority === 'designer' && !requirements.some((x) => x.id === r.id)) requirements.push(r);
  const prohibitions = [...new Set([...read.prohibitions, ...cur.prohibitions])].slice(0, 8);
  const task = cur.taskByDesigner && read.kind === cur.kind ? cur.task : read.task;
  return {
    ...read,
    task,
    requirements,
    prohibitions,
    subject: read.subject || cur.subject,
    ...(cur.taskByDesigner && read.kind === cur.kind ? { taskByDesigner: true } : {}),
    ...(dropped.length ? { dropped } : {}),
  };
}

/** The words a designer has said so far: their description, their answers, and their latest instruction. */
export function designerWords(intentText: string, questions: readonly { answer?: string; delegated?: boolean }[] = [], extra = ''): string {
  const answers = questions.filter((q) => q.answer && !q.delegated && !/^(not sure|you decide)/i.test(q.answer)).map((q) => q.answer);
  return [intentText, ...answers, extra].filter(Boolean).join('. ');
}

/** The designer's correction of the kind: final, with the kind's own needs, keeping every requirement they wrote. */
export function correctKind(intent: DesignIntent, kind: Experience): DesignIntent {
  const base: Requirement[] = (NEEDS[kind] ?? []).map((r) => ({ ...r, authority: 'designer' as const }));
  const kept = intent.requirements.filter((r) => r.authority === 'designer' && !base.some((b) => b.id === r.id) && !Object.values(NEEDS).some((ns) => ns?.some((n) => n.id === r.id)));
  const dropped = (intent.dropped ?? []).filter((id) => !base.some((b) => b.id === id));
  return { ...intent, kind, screen: SCREENS.has(kind), task: intent.taskByDesigner ? intent.task : taskFor(kind, intent.subject), requirements: [...base, ...kept], source: 'designer', ...(dropped.length ? { dropped } : { dropped: undefined }) };
}

/** Requirements from edited lines: an unchanged line keeps its id; a new or reworded one gets its own. */
export function requirementsFromLines(lines: readonly string[], previous: readonly Requirement[]): Requirement[] {
  const out: Requirement[] = [];
  for (const line of lines) {
    const t = line.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const same = previous.find((r) => r.text === t);
    const r = same ?? requirementFrom(t, 'designer');
    if (!out.some((x) => x.id === r.id)) out.push(r);
  }
  return out;
}

/** The intent with the designer's edit of its requirements: what they took out is remembered, so no rewrite puts it back. */
export function editRequirements(intent: DesignIntent, lines: readonly string[]): DesignIntent {
  const requirements = requirementsFromLines(lines, intent.requirements);
  const gone = intent.requirements.filter((r) => !requirements.some((x) => x.id === r.id)).map((r) => r.id);
  const dropped = [...new Set([...(intent.dropped ?? []).filter((id) => !requirements.some((x) => x.id === id)), ...gone])].slice(0, 24);
  return { ...intent, requirements, ...(dropped.length ? { dropped } : { dropped: undefined }) };
}
