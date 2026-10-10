// lib/support-faq.ts
//
// THE QUESTIONS PEOPLE ACTUALLY ARRIVE WITH, and the answers to them.
//
// Ported from the design project's support page. DATA, in its own module and
// not inlined in the component, for one reason: every line of it is a CLAIM
// ABOUT THE PRODUCT, and a claim about the product can go out of date silently.
// A support page that confidently tells somebody to sign in with Google after
// Google sign-in was taken off is worse than no support page — it sends them to
// a button that is not there and makes them doubt themselves rather than the
// page. Kept here, the claims can be checked by a test (test/support-faq.test.mjs)
// and read by a person in one sitting.
//
// WHAT I CHANGED FROM THE DESIGN'S COPY, and why. The export was written
// against an older state of the product and four of its answers were no longer
// true on this branch:
//
//   · "email, Google or Apple" — the sign-in form has no provider buttons at
//     all now (lib/auth-flow.ts: Google is withheld, and the form never grew
//     Apple). Telling somebody to use the method they signed up with is still
//     right; naming the wrong methods is not.
//   · "Core 3.1 for almost everything" — Core 4 is the production flagship and
//     is what the rest of the site introduces. A support page recommending the
//     model before it reads as though nobody told support.
//   · "Logos" as a thing you pick — Logos 1 is withdrawn in favour of Logos 2
//     (lib/socria-prompt.ts), so the name people see is Logos 2.
//   · the free tier — the export did not mention its limits at all, and they
//     are the single most likely reason somebody arrives at a support page.
//     They are now by the day as well as the month (lib/entitlements.ts), and
//     the suite holds these answers to the plan table's own numbers.
//
// Answers carry inline HTML because the design's do — <em>, <b> and links are
// part of how these read. It is OUR OWN STRING in OUR OWN SOURCE, never
// anything a person typed, which is what makes rendering it as HTML safe here
// and would not make it safe anywhere else.

export interface FaqItem {
  q: string;
  /** paragraphs, in order */
  a: string[];
  /** a numbered sequence, when the answer is a procedure */
  steps?: string[];
  /** what to say after the steps */
  after?: string[];
}

export interface FaqTopic {
  id: string;
  t: string;
  qs: FaqItem[];
}

export const TOPICS: FaqTopic[] = [
  {
    id: 'start',
    t: 'Getting started',
    qs: [
      {
        q: 'What is Socria, in one sentence?',
        a: [
          'A human-first AI that asks before it answers. It surfaces your assumptions and names your tensions, <em>but it will not hand you the conclusion.</em>',
        ],
      },
      {
        q: 'Do I need an account to use it?',
        a: [
          'For Core 3.1, no — it works signed out for one session, and the conversation stays in this browser rather than being saved anywhere. After that, sign in to keep going.',
          'Core 4 and Logos need an account. Core 4 keeps a record of the reasoning itself, and a Thinking Map has to be kept somewhere.',
        ],
      },
      {
        q: 'Which model should I pick?',
        a: [
          '<b>Core 4</b> for almost everything. It decides each turn which part of the work is yours, does the research and the checking in full, and hands back the step that would have made you more capable for taking it.',
          '<b>Logos 3</b> when you want to see your reasoning drawn as a map beside the conversation, with what you describe built as models you can move — alone or with someone. <b>Core 3.1</b> if you would rather set the depth yourself.',
        ],
      },
      {
        q: 'What do I get without paying?',
        a: [
          'In Core — Core 3.1 and Core 4 together — 4 new chats and 20 messages a day, on the UTC day. A chat is counted when it is <em>started</em>, so going back to one you have already begun never costs a chat, only its messages.',
          'In Logos, 2 new lines of thinking a calendar month and 10 messages a day; a message to a node’s own conversation counts too. Every lens, every depth and Draft Space are the same on both plans, and a map grows as far as the thinking does.',
          'Reach a limit and nothing is taken away: everything you started stays open, and the day’s allowance comes back tomorrow. You can share one chat at a time, and join anyone else’s for free — what you send Socria there counts toward your own day, never theirs.',
        ],
      },
      {
        q: 'Why does it keep answering my questions with questions?',
        a: [
          'Because that is the product. If you want a finished answer, Socria is the wrong tool — and it will say so rather than pretend. <em>The question it asks is usually the one you were avoiding.</em>',
        ],
      },
    ],
  },
  {
    id: 'account',
    t: 'Account and sign-in',
    qs: [
      {
        q: 'I can’t sign in.',
        a: [
          'Signing in is by email: you type your address, and Socria either asks for your password or sends you a code. There are no provider buttons to press.',
          'Try these, in order:',
        ],
        steps: [
          'Check that the address is the one you signed up with.',
          'Look in spam for the code; it expires after ten minutes.',
          'Clear the site’s cookies and try once more in a private window.',
        ],
        after: [
          'If you originally signed up through Google, that account still works and still signs in — write to us from the panel on this page and we will get you back to it.',
        ],
      },
      {
        q: 'How do I change my picture?',
        a: [
          'Open your account from the avatar in the top right, then <a href="/account/picture">Change your picture</a>. You can download it as a file too.',
        ],
      },
      {
        q: 'Can I move my conversations from signed-out to an account?',
        a: [
          'Yes. Sign in from the same browser and the sessions you had are carried over the first time. After that, nothing is kept locally.',
        ],
      },
    ],
  },
  {
    id: 'one',
    t: 'Socria One and billing',
    qs: [
      {
        q: 'What does Socria One add?',
        a: [
          'No daily count on chats or messages, in Core or in Logos, and lines of thinking held only by a fair-use ceiling. Socria carries more of how you reason between conversations (160 things, against 12), reads documents up to 30 MB rather than 4 MB, and shares as many chats as you like, and whole Projects. $15 a month.',
          '<a href="/one">See the full comparison</a>.',
        ],
      },
      {
        q: 'How do I cancel?',
        a: [
          'From your account: <em>Membership · Manage membership</em>, which opens Stripe’s billing portal. Cancelling takes effect at the end of the month you have paid for.',
          'Your maps stay yours either way. Nothing is deleted when a membership ends.',
        ],
      },
      {
        q: 'Can I get a refund?',
        a: [
          'If you were charged and did not mean to be, write to us within 14 days and we will refund it. We would rather lose the month than keep money you did not choose to spend.',
        ],
      },
      {
        q: 'Is there a student or team price?',
        a: [
          'Not yet. When there is, it will be on the Socria One page — not buried in a sales call.',
        ],
      },
    ],
  },
  {
    id: 'memory',
    t: 'Memory and your data',
    qs: [
      {
        q: 'What does Socria remember about me?',
        a: [
          'Exactly what is on <a href="/account/data">your memory page</a>, and nothing else. If it is not on that page, Socria does not know it.',
        ],
      },
      {
        q: 'Something it remembers is wrong.',
        a: [
          'Open it on the memory page and either edit it, change its status, or mark what is wrong with it. Marking deletes nothing and can be undone; Socria treats the claim as disputed from then on.',
        ],
      },
      {
        q: 'How do I delete everything?',
        a: [
          'Account · <em>Your thinking</em> · Delete everything. It is immediate and it does not come back — so export first if you might want any of it.',
        ],
      },
      {
        q: 'Do you train on my conversations?',
        a: ['No. Your reasoning is not used to train any model, ours or anyone else’s.'],
      },
    ],
  },
  {
    id: 'logos',
    t: 'Logos and the map',
    qs: [
      {
        q: 'Logos says I’ve used today’s messages.',
        a: [
          'On the free plan Logos holds 10 messages a day, on the UTC day, and a message to a node’s own conversation counts. Your lines of thinking stay open and stay yours, and the day’s messages come back tomorrow; Socria One has no daily count.',
          'The map itself never stops growing. On both plans it grows as far as the thinking does.',
        ],
      },
      {
        q: 'Why won’t it just tell me the answer to my maths problem?',
        a: [
          'While you are learning, the Answer Guard keeps the answer for you to reach. You can ask for a hint, and if you truly need it, <em>Show me anyway</em> is always there.',
        ],
      },
      {
        q: 'Can I export a map?',
        a: ['Yes — as Markdown or JSON, from your account under <em>Export every map</em>.'],
      },
    ],
  },
];

/** Where a message goes when nothing on the page answers it. */
export const SUPPORT_EMAIL = 'hellosocria@gmail.com';

/** Everything in one list, for counting and for search. */
export function allItems(topics: readonly FaqTopic[] = TOPICS): FaqItem[] {
  return topics.flatMap((t) => t.qs);
}

/**
 * Everything an item says, as plain words.
 *
 * Tags stripped, because somebody searching for "memory" should not match the
 * `href="/account/data"` in an answer that never says the word — a search that
 * hits on markup is a search that finds the wrong thing and cannot explain why.
 */
export function plainText(it: FaqItem): string {
  return [it.q, ...it.a, ...(it.steps ?? []), ...(it.after ?? [])]
    .join(' ')
    .replace(/<[^>]+>/g, '')
    .toLowerCase();
}

/**
 * The topics, narrowed to one and to a search term.
 *
 * Topics that end up with nothing in them are dropped rather than shown empty:
 * an empty section reads as a category the product has no answers for.
 */
export function filterTopics(term: string, topic: string, topics: readonly FaqTopic[] = TOPICS): FaqTopic[] {
  const t = term.trim().toLowerCase();
  return topics
    .filter((s) => topic === 'all' || s.id === topic)
    .map((s) => ({ ...s, qs: s.qs.filter((it) => !t || plainText(it).includes(t)) }))
    .filter((s) => s.qs.length > 0);
}

/**
 * Wrap every occurrence of `term` in a mark, WITHOUT touching the tags.
 *
 * The naive replace puts a `<mark>` inside `href="…"` the moment somebody
 * searches for "account", which silently breaks the link. So the string is
 * split into tags and text and only the text is marked.
 */
export function highlight(html: string, term: string): string {
  const t = term.trim();
  if (!t) return html;
  const safe = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${safe})`, 'gi');
  return html.replace(/(<[^>]+>)|([^<]+)/g, (_m, tag: string, txt: string) =>
    tag ? tag : txt.replace(re, '<mark class="hl">$1</mark>')
  );
}
