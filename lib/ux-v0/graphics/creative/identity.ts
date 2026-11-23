// lib/ux-v0/graphics/creative/identity.ts — "turn this into a premium architectural studio identity".
//
// An identity names who the design is for — a kind of studio, shop, label or practice — and how it should come across.
// No identity is looked up in a list: the words are read for their temperament (premium → refined, playful, technical,
// heritage…) and the things they name, and a visual language is generated from that reading (generative/language.ts
// languageDirection: the palette from the temperament's hue logic, the faces from the font library, the case and weight
// with them). The plan then sets that language on the design — its colours role for role, its faces by role — with the
// qualities said (premium: fewer forms, depth, a graded ground) and, when the subject has a visual world of its own
// (architecture: lines and massing), its forms drawn abstractly so they read as an identity, not an illustration.
// The words, the composition and the pictures are kept: an identity changes how it looks, not what it says.

import type { GraphicDoc } from '../doc';
import { languageDirection, thingsIn } from '../generative/language';
import { qualitiesIn, themeIn, type Theme } from './lexicon';
import type { Change, CreativePlan } from './plan';

export interface IdentityRead {
  /** who it is for, in the person's words ("premium architectural studio") */
  subject: string;
  qualities: string[];
  plan: CreativePlan;
  /** the language generated for it, said */
  language: { name: string; said: string };
}

const lower = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

/** Words that name who a design speaks for (a kind of business, practice or field), not a look. */
const SUBJECT =
  /\b(studio|company|agency|firm|practice|brand|label|house|shop|store|restaurant|caf[eé]|bakery|hotel|gallery|museum|clinic|school|academy|startup|bank|magazine|festival|bar|brewery|winery|distillery|spa|salon|boutique|architect\w*|fashion|couture|tech|software|law|legal|finance|financial|consultancy|consulting|foundation|charity|band|orchestra|publisher|journal|bookshop|bookstore|florist|coffee|roaster\w*|tea|skincare|beauty|cosmetics|fitness|gym|yoga|wellness|travel|airline|automotive|furniture|interiors?|jewel\w*|perfume|fragrance|wine|beer|toy|games?|music|records?|theatre|theater|cinema|film|podcast|conference|summit|non-?profit|university|college|hospital|pharmacy|dental|vet|veterinary|kitchen|deli|market|farm|garden|nursery|photography|photographer|ceramics|pottery|craft|atelier|workshop|collective|co-?op|club|league|team|institute|lab|laboratory|observatory)\b/;

/** The identity the words ask the design to become, or null when they ask for something else. */
export function readIdentity(words0: string, ctx: { doc: GraphicDoc; board?: string }): IdentityRead | null {
  const w = lower(words0).replace(/[.!]+$/, '');
  if (!w || w.length > 240) return null;
  const m =
    w.match(/\b(?:turn|transform|make|change|rework|redo|reimagine|rebrand|redesign|convert|evolve)\b\s*(?:this|it|the design|the whole thing|everything)?\s*(?:into|as|to (?:be|feel like|look like)|feel like|look like|like)\s+(?:an?|the|our|my)?\s*(.+)$/) ??
    w.match(/^(?:an?|the)?\s*(.+?)\s+(?:identity|branding|brand identity|visual identity)\s*(?:please)?$/) ??
    w.match(/\b(?:give it|give this|make it look like it belongs to|make it feel like it'?s for|as if it were for)\s+(?:an?|the)?\s*(.+)$/);
  if (!m) return null;
  let subject = m[1].replace(/\b(identity|branding|brand identity|visual identity|look|aesthetic|style|feel|vibe|please|instead)\b/g, ' ').replace(/\s+/g, ' ').trim();
  // "an identity" for a theme alone ("a cloud-inspired identity") is the theme's, read elsewhere
  if (!SUBJECT.test(subject)) return null;
  subject = subject.slice(0, 80);
  const qs = qualitiesIn(subject).map((q) => q.id);
  const board = ctx.doc.artboards.find((b) => b.id === ctx.board) ?? ctx.doc.artboards[0];
  const things = thingsIn(subject);
  const lang = languageDirection(subject, qs, `identity|${board?.id ?? ''}|${subject}`, things);
  const t = lang.tokens;
  const changes: Change[] = [
    { decision: 'palette', colours: { ground: t.colors.background, ink: t.colors.text, accent: t.colors.accent, support: [t.accent2 ?? t.colors.muted, t.colors.muted].filter((c, i, a) => !!c && a.indexOf(c) === i).slice(0, 2) } },
    { decision: 'type', display: t.fonts.display, body: t.fonts.body, case: lang.look.case === 'upper' ? 'upper' : 'none' },
  ];
  if (qs.length) changes.push({ decision: 'mood', qualities: qs });
  // a subject with a visual world of its own (architecture: massing and lines) brings its forms, drawn abstractly
  const world: Theme | null = themeIn(subject);
  if (world) changes.push({ decision: 'forms', kind: world.forms2 ?? world.forms, abstraction: 88 });
  const plan: CreativePlan = {
    intent: 'brand',
    summary: `a ${subject} identity: ${lang.concept?.split(':')[0]?.toLowerCase() ?? 'a language generated from the words'}, ${t.fonts.display}${t.fonts.body !== t.fonts.display ? ` with ${t.fonts.body}` : ''}`,
    keep: ['words', 'composition', 'pictures'],
    changes,
    reason: `For a ${subject} identity, a language generated from those words: ${(lang.concept ?? '').replace(/\s*\(.*$/, '').replace(/\.$/, '')}${world ? `, with ${world.label}'s forms drawn abstractly` : ''}.`,
    by: 'reader',
  };
  return { subject, qualities: qs, plan, language: { name: lang.name, said: lang.concept ?? '' } };
}
