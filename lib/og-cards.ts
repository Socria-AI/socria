// lib/og-cards.ts
//
// What each link-preview card says — the 1200×630 image X, LinkedIn, Slack,
// iMessage and Discord show when somebody shares a Socria link.
//
// LOOKED UP, NEVER TAKEN FROM THE ADDRESS. The card route is public, and a
// route that printed whatever text the URL carried would hand anybody a
// Socria-branded image saying anything at all. So a card exists only for a
// page this file knows — a fixed page, a docs page by its slug, a blog post by
// the title Sanity holds for it — and every other key gets the plain card.
//
// The offers obey the same rule as their pages: the student card only while
// a free month can still begin, the invitation only while referrals run.
//
// Pure: the route passes in the clock, the docs list, the post it fetched and
// the referral settings.

import { TAGLINE } from './seo';
import { STUDENT_OFFER } from './socria-edu';
import { priceWithPeriod } from './socria-one';

export interface OgCard {
  /** the small line above the title */
  kicker: string;
  /** the large line */
  title: string;
  /** one sentence under it */
  line: string;
}

export interface OgDoc {
  slug: string;
  title: string;
  blurb: string;
}

export interface OgContext {
  now: number;
  docs: readonly OgDoc[];
  /** the post, when the key is a blog post and Sanity had it */
  post?: { title: string; excerpt?: string | null } | null;
  /** the referral programme, when it is running */
  referral?: { enabled: boolean; signupDays: number } | null;
}

export const DEFAULT_CARD: OgCard = {
  kicker: 'Socria',
  title: `${TAGLINE}.`,
  line: 'The AI that sharpens your reasoning instead of doing it for you.',
};

const FIXED: Record<string, OgCard> = {
  home: DEFAULT_CARD,
  logos: {
    kicker: 'Socria Logos',
    title: 'Watch your reasoning take shape.',
    line: 'A live map of what you’re claiming, assuming and still asking — beside the conversation.',
  },
  explore: {
    kicker: 'Explore Socria',
    title: 'What a thinking environment is for.',
    line: 'Research, learning, decisions, argument and creative work — in the running product.',
  },
  one: {
    kicker: 'Socria One',
    title: 'Everything Socria does, without the ceiling.',
    line: `No daily count, and lines of thinking as you need them — ${priceWithPeriod()}.`,
  },
  charter: {
    kicker: 'Socria',
    title: 'The Socria Charter.',
    line: 'The machines work for us. Not the other way around.',
  },
  docs: {
    kicker: 'Socria Docs',
    title: 'How the whole thing works.',
    line: 'The models, the Thinking Map, documents, Socria One and your data.',
  },
  blog: {
    kicker: 'The Socria Blog',
    title: 'Notes on thinking clearly.',
    line: 'Essays on reasoning, metacognition and human-first AI.',
  },
  support: {
    kicker: 'Socria Support',
    title: 'Answers, and a person when you need one.',
    line: 'What people actually ask about Socria.',
  },
  surfaces: {
    kicker: 'Socria Logos',
    title: 'Physics you can move.',
    line: 'A Kerr black hole, the thermal history of the universe, gravity as an N-body integration.',
  },
  logos2: {
    kicker: 'Socria Logos 2',
    title: 'A workspace you arrange.',
    line: 'A Thinking Map, a transcript and a working surface.',
  },
  privacy: { kicker: 'Socria', title: 'Privacy.', line: 'What Socria collects, why, and how to get it back or deleted.' },
  terms: { kicker: 'Socria', title: 'Terms.', line: 'The agreement for using Socria.' },
  security: { kicker: 'Socria', title: 'Security.', line: 'How Socria protects accounts and data.' },
  subprocessors: { kicker: 'Socria', title: 'Sub-processors.', line: 'Who processes data on Socria’s behalf, and why.' },
  'sign-up': {
    kicker: 'Socria',
    title: `${TAGLINE}.`,
    line: 'Create your free account — and keep your thinking across every device.',
  },
  'sign-in': DEFAULT_CARD,
};

const EVENT_CARDS: Record<string, OgCard> = {
  'in-public-002': {
    kicker: 'Socria · Event · Free',
    title: 'Socria: In Public 002.',
    line: 'Building Socria in public — entrepreneurship, AI and product. Maverick Hall 1309, UT Arlington.',
  },
};

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];
const days = (n: number) => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Shorten to a card's room, at a word, with an ellipsis. */
export function fit(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:—–-]+$/, '')}…`;
}

/** The card for a key — the path segments after /og/. */
export function ogCardFor(key: readonly string[], ctx: OgContext): OgCard {
  const k = key.filter(Boolean);
  if (k.length === 0) return DEFAULT_CARD;
  if (k.length === 1) {
    if (k[0] === 'students') {
      if (ctx.now >= STUDENT_OFFER.closes) return DEFAULT_CARD;
      return {
        kicker: 'For UTA students',
        title: 'Your first month of Socria One, free.',
        line: 'Verify your UTA email by 9 December. No card, and nothing renews.',
      };
    }
    if (k[0] === 'invited') {
      const r = ctx.referral;
      if (!r?.enabled) return FIXED['sign-up'];
      return {
        kicker: 'A friend invited you',
        title: `${cap(days(r.signupDays))} days of Socria One, free.`,
        line: 'Create your free account — no card needed.',
      };
    }
    return FIXED[k[0]] ?? DEFAULT_CARD;
  }
  if (k.length === 2 && k[0] === 'docs') {
    const d = ctx.docs.find((x) => x.slug === k[1]);
    return d ? { kicker: 'Socria Docs', title: fit(d.title, 70), line: fit(d.blurb, 120) } : FIXED.docs;
  }
  // An event's card: fixed text per event, never read from the address and
  // never a date — a date on a share card outlives a change to it.
  if (k.length === 2 && k[0] === 'events') return EVENT_CARDS[k[1]] ?? DEFAULT_CARD;
  if (k.length === 2 && k[0] === 'blog') {
    const p = ctx.post;
    return p?.title
      ? { kicker: 'The Socria Blog', title: fit(p.title, 90), line: fit(p.excerpt || 'Notes on thinking clearly.', 120) }
      : FIXED.blog;
  }
  return DEFAULT_CARD;
}
