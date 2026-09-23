// lib/core4/questions.ts
//
// Interrogative work in what Socria actually SAYS, whatever the move is called.
//
// The old question limit priced only the move labelled ASK. A HINT that was
// two questions, or a CHALLENGE ending "what would happen if…?", cost nothing
// — so once asking was priced out, the questions moved into other labels and
// the person kept getting interviewed. The fix is to measure the thing the
// person experiences: sentences that hand them thinking to do. That includes
// the disguised forms — "consider whether…", "ask yourself…", "it might be
// worth thinking about…" — which are questions with the question mark taken
// off, and which perform exactly the same function.
//
// Pure. Deterministic.

/** Code and quotations are set aside: a question inside them is not put to the person. */
function prose(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    // A blockquote is text Socria wrote FOR them — a draft email, a quoted
    // passage — not something it asks them (run 4, expert-017).
    .replace(/^[ \t]*>.*$/gm, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/[“"][^”"\n]{0,300}[”"]/g, ' ');
}

/**
 * Sentences, each with its trailing punctuation and whitespace, in order.
 *
 * A sentence ends at terminal punctuation — with any closing quotes,
 * brackets or markdown emphasis after it — followed by whitespace or the
 * end; or at a newline. So "1.3558" and "e.g." mid-sentence do not split,
 * and "**Revenue.** Exempting…" keeps its bold markers together (a deletion
 * that split them left a stray "**" in front of the next sentence).
 */
export function sentencesOf(text: string): string[] {
  // Abbreviations never end a sentence (council D4): "e.g." was splitting
  // a sentence in two, and half of it was then taken for a closing offer.
  const ABBR = /\b(e\.g|i\.e|etc|vs|cf|et al|approx|Dr|Mr|Mrs|Ms|St|No|Fig|Eq|p|pp)\.(?=\s)/g;
  const shielded = text.replace(ABBR, (m) => m.slice(0, -1) + '\u2024');
  const out0 = shielded.match(/(?:[^.!?\n]|[.!?](?![.!?]*["'’”)\]*_]*(?:\s|$)))+(?:[.!?]+["'’”)\]*_]*(?=\s|$)|\n+|$)\s*/g) ?? [];
  return out0.map((s) => s.replace(/\u2024/g, '.')).filter((s) => s.trim());
}

/** A bare markdown header sentence: "**Revenue.**", "### Costs". */
const HEADER = /^(?:\*\*[^*\n]{1,80}\*\*|__[^_\n]{1,80}__|#{1,6} [^\n]{1,80})\s*$/;

/**
 * The text with the named sentences removed — matched by containment in
 * either direction, so a quote that includes or omits a bold lead-in still
 * finds its sentence — and any header left with nothing under it removed
 * too. Null if nothing is left. Code blocks are never touched.
 */
export function deleteSentences(text: string, drop: readonly string[]): string | null {
  const targets = drop.map((d) => d.trim()).filter(Boolean);
  if (!targets.length) return text.trim() || null;
  const blocks: string[] = [];
  const shielded = text.replace(/```[\s\S]*?```/g, (m) => {
    blocks.push(m);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  const parts = sentencesOf(shielded);
  const gone = parts.map((raw) => {
    const t = raw.trim();
    if (!t || t.includes('\u0000')) return false;
    // Exact always; containment only between substantial texts, so a short
    // fragment cannot take an unrelated sentence with it.
    return targets.some((d) => d === t || (t.length >= 12 && d.length >= 12 && (d.includes(t) || t.includes(d))));
  });
  const kept: string[] = [];
  parts.forEach((raw, i) => {
    if (gone[i]) return;
    // A header whose content was all deleted: the next surviving sentence is
    // a new paragraph (or there is none), and the one after it was removed.
    if (HEADER.test(raw.trim()) && gone[i + 1]) {
      let j = i + 1;
      while (j < parts.length && gone[j]) j++;
      const nextStartsParagraph = j >= parts.length || /\n\s*$/.test(parts[j - 1]) || HEADER.test(parts[j].trim());
      if (nextStartsParagraph) return;
    }
    kept.push(raw);
  });
  const out = kept.join('').replace(/\u0000(\d+)\u0000/g, (_, n) => blocks[Number(n)]).replace(/\n{3,}/g, '\n\n').trim();
  return out || null;
}

const WH = String.raw`(?:whether|what|how|why|which|where|when|who|if)`;

/**
 * Directing the person to do the thinking, without a question mark.
 * Each needs a wh-clause (or an explicit "yourself") after the verb, so
 * "Consider the case x = 0: …" — which SUPPLIES content — is not counted.
 */
const DISGUISED = new RegExp(
  [
    String.raw`^(?:so,?\s+|now,?\s+|maybe\s+|perhaps\s+|first,?\s+|next,?\s+)?(?:think about|consider|reflect on|ponder|notice|figure out|work out)\s+${WH}\b`,
    String.raw`^(?:so,?\s+|now,?\s+)?ask yourself\b`,
    String.raw`^(?:so,?\s+|now,?\s+)?(?:try to|see if you can)\s+(?:figure|work|think|spot|find|notice)\b`,
    String.raw`\b(?:i(?:'d| would)|let me) (?:encourage|invite|challenge|urge) you to (?:think|consider|reflect|ask)\b`,
    String.raw`\bit (?:might|may|could|would) be worth (?:thinking|considering|asking yourself|reflecting)\b`,
    String.raw`\bworth (?:thinking|asking yourself) (?:about )?${WH}\b`,
    String.raw`^(?:so,?\s+)?what do you think\b`,
    String.raw`^i wonder ${WH}\b`,
    String.raw`^(?:so,?\s+)?how (?:might|would|could) you\b`,
  ].join('|'),
  'i'
);

/** Closing offers: a request for more of the person's time, not a move. */
// Closing offers, and comprehension checks that are always stripped (council D4).
// An offer has a first-person shape (council D4): "I can also…", "want me
// to…", "let me know if…". A conditional that gives ADVICE ("If you want
// something to suggest, a short comment would…") is not an offer — run 1
// deleted one from the middle of a reply because it started "If you want".
const OFFER = /^(?:let me know|feel free to (?:ask|reach|ping|let me)|if you(?:'d| would) like(?:,)? (?:i|me)\b|if you want(?:,)? (?:i|me)\b|if (?:that|this) helps,? (?:i|let me)\b|want me to|shall i|should i|would you like (?:me|to see|a|an|the)|happy to|i can also|do you want me to|does (?:that|this) (?:make sense|help)|make sense\?|any questions|is (?:that|this) clear|sound good|hope (?:this|that) helps)\b/i;

const SYCOPHANCY = /^(?:great|excellent|good|fantastic|wonderful|interesting|fascinating) (?:question|point|thought|observation)[.!,]?|^(?:you(?:'re| are) (?:absolutely |completely |totally )?right)[.!,]|^(?:what a (?:great|good|fascinating) )|^(?:i love (?:this|that|how you))/i;

export interface Interrogatives {
  explicit: string[];
  disguised: string[];
  offers: string[];
}

export function interrogatives(text: string): Interrogatives {
  const out: Interrogatives = { explicit: [], disguised: [], offers: [] };
  for (const raw of sentencesOf(prose(text))) {
    // A sentence that opens a blockquote line (the stream gate sees sentences
    // without their line) is quoted material, not a question to them.
    if (/^\s*>/.test(raw)) continue;
    const s = raw.trim().replace(/^[-*•\d.)\s]+/, '');
    if (!s) continue;
    if (OFFER.test(s)) out.offers.push(raw.trim());
    else if (/\?["'’”)\]]*\s*$/.test(s)) out.explicit.push(raw.trim());
    else if (DISGUISED.test(s)) out.disguised.push(raw.trim());
  }
  return out;
}

/** How much interrogative work a reply puts to the person. Offers are not counted here. */
export function questionLoad(text: string): number {
  const q = interrogatives(text);
  return q.explicit.length + q.disguised.length;
}

export function asksAnything(text: string): boolean {
  return questionLoad(text) > 0;
}

/**
 * How many of Socria's most recent replies in a row put interrogative work to
 * the person, and the share of the last `window` replies that did.
 * Read from the transcript the person saw — the move labels do not matter.
 */
export function questionPressure(
  messages: readonly { role: string; content: string }[],
  window = 6
): { streak: number; density: number; recent: number } {
  const replies = messages.filter((m) => m.role === 'assistant');
  let streak = 0;
  for (let i = replies.length - 1; i >= 0; i--) {
    if (!asksAnything(replies[i].content)) break;
    streak++;
  }
  const recent = replies.slice(-window);
  const density = recent.length ? recent.filter((m) => asksAnything(m.content)).length / recent.length : 0;
  // Question-bearing replies among the last three (council D4: at most one
  // in any four consecutive replies outside practice).
  const last3 = replies.slice(-3).filter((m) => asksAnything(m.content)).length;
  return { streak, density, recent: last3 };
}

/**
 * The reply with interrogative work beyond `keep` removed, closing offers
 * removed, and a sycophantic opener removed. Returns null if nothing of
 * substance would remain — the caller must then regenerate rather than send
 * an empty or gutted reply.
 *
 * Deterministic and conservative: it deletes sentences, never rewrites them.
 */
export function stripInterrogatives(text: string, keep: 0 | 1 = 0): { text: string | null; removed: string[] } {
  const removed: string[] = [];
  // Work on the reply with code blocks and blockquotes protected: sentences
  // inside code, or inside a draft written for them, are never removed.
  const blocks: string[] = [];
  const shielded = text.replace(/```[\s\S]*?```|^[ \t]*>.*$/gm, (m) => {
    blocks.push(m);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  const parts = sentencesOf(shielded);
  let kept = 0;
  const out: string[] = [];
  parts.forEach((raw, i) => {
    const s = raw.trim().replace(/^[-*•\d.)\s]+/, '');
    if (s.includes('\u0000')) {
      out.push(raw);
      return;
    }
    if (i === 0 && SYCOPHANCY.test(s)) {
      const rest = raw.replace(SYCOPHANCY, '').replace(/^[\s,.!-]+/, '');
      removed.push(raw.trim());
      if (rest.trim()) out.push(rest.charAt(0).toUpperCase() + rest.slice(1));
      return;
    }
    if (OFFER.test(s)) {
      removed.push(raw.trim());
      return;
    }
    const isQ = /\?["'’”)\]]*\s*$/.test(s) || DISGUISED.test(s);
    if (isQ) {
      if (kept < keep) {
        kept++;
        out.push(raw);
      } else {
        removed.push(raw.trim());
      }
      return;
    }
    out.push(raw);
  });
  const joined = out
    .join('')
    .replace(/\u0000(\d+)\u0000/g, (_, n) => blocks[Number(n)])
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // Substance: at least one non-trivial sentence left.
  const substantive = sentencesOf(prose(joined)).some((s) => s.trim().split(/\s+/).length >= 4) || /```/.test(joined);
  return { text: substantive ? joined : null, removed };
}

export function hasSycophanticOpener(text: string): boolean {
  const first = sentencesOf(text.trim())[0]?.trim() ?? '';
  return SYCOPHANCY.test(first);
}

/** The reply without its sycophantic opener (and nothing else changed); null if nothing is left. */
export function stripSycophanticOpener(text: string): string | null {
  const t = text.trim();
  if (!hasSycophanticOpener(t)) return t;
  const rest = t.replace(SYCOPHANCY, '').replace(/^[\s,.!—-]+/, '');
  return rest.trim() ? rest.charAt(0).toUpperCase() + rest.slice(1) : null;
}
