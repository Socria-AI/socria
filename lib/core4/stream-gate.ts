// lib/core4/stream-gate.ts
//
// The streaming sentence gate, for Core 4 moves that are not buffered.
//
// Text goes out as complete sentences as it arrives — except that any
// interrogative sentence (explicit, disguised, or a closing offer) is HELD.
// If more exposition follows, the held question was rhetorical and is
// released in order; whatever is still held at the end of the stream ships
// only within the question budget. A sycophantic opener is removed from the
// first sentence. Code blocks pass through untouched.
//
// This is what makes the budget hold on streamed replies: the person never
// sees a question the budget did not allow, and nothing is un-sent.
//
// Pure.

import { interrogatives, hasSycophanticOpener, stripSycophanticOpener } from './questions';

/**
 * For unbuffered moves: emit text as complete sentences, but HOLD back any
 * interrogative sentence and a sycophantic opener until the end, where the
 * question budget decides. Code blocks pass through untouched.
 */
export class SentenceGate {
  private buf = '';
  private held: string[] = [];
  private inCode = false;
  private first = true;
  out = '';

  constructor(private emit: (s: string) => void) {}

  push(delta: string) {
    this.buf += delta;
    for (;;) {
      if (this.inCode) {
        const end = this.buf.indexOf('```');
        if (end < 0) return;
        const chunk = this.buf.slice(0, end + 3);
        this.buf = this.buf.slice(end + 3);
        this.inCode = false;
        this.send(chunk);
        continue;
      }
      const fence = this.buf.indexOf('```');
      const m = /[.!?]+["'’”)\]]*\s+|\n{2,}/.exec(this.buf);
      if (fence >= 0 && (!m || fence < m.index)) {
        const before = this.buf.slice(0, fence);
        if (before.trim()) this.consider(before);
        this.buf = this.buf.slice(fence);
        this.inCode = true;
        const end = this.buf.indexOf('```', 3);
        if (end < 0) return;
        const chunk = this.buf.slice(0, end + 3);
        this.buf = this.buf.slice(end + 3);
        this.inCode = false;
        this.send(chunk);
        continue;
      }
      if (!m) return;
      const sentence = this.buf.slice(0, m.index + m[0].length);
      this.buf = this.buf.slice(m.index + m[0].length);
      this.consider(sentence);
    }
  }

  private consider(sentence: string) {
    if (this.first && sentence.trim()) {
      this.first = false;
      // "Great question — the answer is 42." keeps "The answer is 42."
      if (hasSycophanticOpener(sentence)) {
        const rest = stripSycophanticOpener(sentence);
        if (rest === null) return;
        sentence = rest + (/\s*$/.exec(sentence)?.[0] ?? '');
      }
    }
    const q = interrogatives(sentence);
    if (q.explicit.length || q.disguised.length || q.offers.length) {
      this.held.push(sentence);
      return;
    }
    this.flushHeldInline();
    this.send(sentence);
  }

  /** A question followed by more exposition was rhetorical: release it in order. */
  private flushHeldInline() {
    if (!this.held.length) return;
    const rhetorical = this.held.filter((h) => !interrogatives(h).offers.length);
    this.held = [];
    for (const h of rhetorical) this.send(h);
  }

  private send(s: string) {
    this.out += s;
    this.emit(s);
  }

  /** End of stream: the trailing held sentences ship only within the budget. Returns what was dropped. */
  finish(maxQuestions: 0 | 1): string[] {
    if (this.buf.trim()) this.consider(this.buf);
    this.buf = '';
    const dropped: string[] = [];
    let allowed = maxQuestions;
    for (const h of this.held) {
      const q = interrogatives(h);
      if (!q.offers.length && allowed > 0) {
        allowed--;
        this.send(h);
      } else dropped.push(h.trim());
    }
    this.held = [];
    return dropped;
  }
}
