'use client';

// Ported from the standalone "Socria Journal" magazine.js — word typeset-in,
// scroll reveals, the spine/folio, masthead hide-on-scroll, dark-spread
// contrast, the pinned "Reframe" sequence, and the inline conversation demo.
// Adapted for Next: js-anim / on-dark toggle on the .mag-root element (the
// CSS is scoped there), scroll math stays on documentElement, and everything
// tears down on unmount.

import { useEffect } from 'react';

export function MagazineMotion() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scrollDoc = document.documentElement;
    const root = document.querySelector<HTMLElement>('.mag-root');
    if (!root) return;

    let alive = true;
    let rafId = 0;
    const timers: number[] = [];
    const ios: IntersectionObserver[] = [];
    const listeners: Array<[EventTarget, string, EventListener]> = [];
    const on = (t: EventTarget, ev: string, fn: EventListener, opts?: any) => {
      t.addEventListener(ev, fn, opts);
      listeners.push([t, ev, fn]);
    };

    // ---------- word split (typeset-in) ----------
    let wi = 0;
    function wrapWord(node: Node) {
      const w = document.createElement('span');
      w.className = 'word';
      const inner = document.createElement('i');
      inner.style.setProperty('--i', String(wi++));
      inner.appendChild(node);
      w.appendChild(inner);
      return w;
    }
    function splitText(t: string) {
      const out: Node[] = [];
      t.split(/(\s+)/).forEach((p) => {
        if (p === '') return;
        if (/^\s+$/.test(p)) {
          out.push(document.createTextNode(p));
          return;
        }
        out.push(wrapWord(document.createTextNode(p)));
      });
      return out;
    }
    function splitEl(el: Element) {
      wi = 0;
      const kids = Array.prototype.slice.call(el.childNodes) as Node[];
      const frag: Node[] = [];
      kids.forEach((c) => {
        if (c.nodeType === 3) {
          frag.push(...splitText(c.textContent || ''));
        } else if (c.nodeName === 'BR') {
          frag.push(c.cloneNode());
        } else if (c.nodeName === 'SPAN') {
          const clone = c.cloneNode(false);
          Array.prototype.slice.call(c.childNodes).forEach((g: Node) => {
            if (g.nodeType === 3) {
              splitText(g.textContent || '').forEach((nn) => clone.appendChild(nn));
            } else clone.appendChild(wrapWord(g.cloneNode(true)));
          });
          frag.push(clone);
        } else frag.push(wrapWord(c.cloneNode(true)));
      });
      el.innerHTML = '';
      frag.forEach((nn) => el.appendChild(nn));
      el.setAttribute('data-anim', '1');
    }

    let revealEls: Element[];
    if (!reduce) {
      Array.prototype.slice.call(root.querySelectorAll('[data-split]')).forEach(splitEl);
      root.classList.add('js-anim');
      revealEls = Array.prototype.slice.call(
        root.querySelectorAll('.fade, [data-anim], .ink-mark')
      );
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add('in');
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.18, rootMargin: '0px 0px -6% 0px' }
      );
      ios.push(io);
      revealEls.forEach((el) => io.observe(el));
      timers.push(
        window.setTimeout(() => {
          const vh0 = innerHeight;
          const broken = revealEls.some((el) => {
            const r = el.getBoundingClientRect();
            if (!(r.top < vh0 * 0.9 && r.bottom > 0)) return false;
            return !el.classList.contains('in') || getComputedStyle(el).opacity === '0';
          });
          if (broken) {
            root.classList.remove('js-anim');
            revealEls.forEach((el) => {
              el.classList.add('in');
              (el as HTMLElement).style.transition = 'none';
              (el as HTMLElement).style.opacity = '1';
              (el as HTMLElement).style.transform = 'none';
            });
            Array.prototype.slice
              .call(root.querySelectorAll('.word i'))
              .forEach((w: HTMLElement) => {
                w.style.transition = 'none';
                w.style.opacity = '1';
                w.style.transform = 'none';
              });
          }
        }, 1500)
      );
    } else {
      Array.prototype.slice
        .call(root.querySelectorAll('.fade, .ink-mark'))
        .forEach((el: Element) => el.classList.add('in'));
    }

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

    // ---------- refs ----------
    let vh = innerHeight;
    const masthead = document.getElementById('masthead');
    const progress = root.querySelector<HTMLElement>('.progress');
    const spineInk = root.querySelector<HTMLElement>('.spine .ink');
    const folioEl = document.getElementById('folio');
    const begin = document.getElementById('begin');
    const askSlip = document.getElementById('ask-slip');
    const convo = document.getElementById('conversation');
    const sReframe = root.querySelector<HTMLElement>('.pin-reframe');
    const rfPairs = Array.prototype.slice.call(
      root.querySelectorAll('.rf-pair')
    ) as HTMLElement[];
    const rfCue = root.querySelector<HTMLElement>('.rf-cue');
    function pinProgress(el: HTMLElement) {
      const r = el.getBoundingClientRect();
      const total = el.offsetHeight - vh;
      return total > 0 ? clamp01(-r.top / total) : 0;
    }
    const spreads = Array.prototype.slice.call(
      root.querySelectorAll('.spread')
    ) as HTMLElement[];
    const darkSpreads = Array.prototype.slice.call(
      root.querySelectorAll('.pull, .close')
    ) as HTMLElement[];
    const glows = darkSpreads;
    let lastY = -1;
    let lastNavY = 0;

    function update(y: number) {
      const docH = scrollDoc.scrollHeight - vh;
      const pageP = docH > 0 ? y / docH : 0;
      if (progress) progress.style.width = pageP * 100 + '%';
      if (spineInk) spineInk.style.height = pageP * 100 + '%';

      if (masthead) {
        masthead.classList.toggle('hidden', y > lastNavY && y > 260);
        lastNavY = y;
      }

      let darkNow = false;
      darkSpreads.forEach((s) => {
        const r = s.getBoundingClientRect();
        if (r.top <= 60 && r.bottom > 60) darkNow = true;
      });
      root!.classList.toggle('on-dark', darkNow);

      let cur: HTMLElement | null = null;
      spreads.forEach((s) => {
        const r = s.getBoundingClientRect();
        if (r.top <= vh * 0.4 && r.bottom > vh * 0.4) cur = s;
      });
      if (cur && folioEl) {
        const f = (cur as HTMLElement).getAttribute('data-folio');
        if (f && folioEl.textContent !== f) folioEl.textContent = f;
      }

      if (begin) begin.style.opacity = y > 70 ? '0' : '1';

      if (sReframe && rfPairs.length && !reduce) {
        const rp = pinProgress(sReframe);
        const n = rfPairs.length;
        const span = rp * (n + 0.55);
        const active = Math.min(n - 1, Math.floor(span));
        const local = span - active;
        rfPairs.forEach((p, i) => p.classList.toggle('on', i === active));
        const pc = rfPairs[active];
        const sh = pc.querySelector('.rf-shallow');
        const dp = pc.querySelector('.rf-deep');
        if (sh) sh.classList.toggle('struck', local > 0.4);
        if (dp) dp.classList.toggle('show', local > 0.5);
        if (rfCue) rfCue.classList.toggle('on', rp > 0.9);
      }

      if (askSlip) {
        let overConvo = false;
        if (convo) {
          const cr = convo.getBoundingClientRect();
          overConvo = cr.top < vh * 0.75 && cr.bottom > vh * 0.25;
        }
        askSlip.classList.toggle('show', y > vh * 0.9 && !overConvo);
      }

      if (!reduce) {
        glows.forEach((s) => {
          const r = s.getBoundingClientRect();
          if (r.bottom > 0 && r.top < vh) {
            const p = clamp01((vh - r.top) / (vh + r.height));
            s.style.setProperty('--gy', 24 + p * 44 + '%');
          }
        });
      }
    }

    function frame() {
      if (!alive) return;
      const y = scrollY || scrollDoc.scrollTop;
      if (y !== lastY) {
        lastY = y;
        update(y);
      }
      rafId = requestAnimationFrame(frame);
    }

    on(window, 'resize', () => {
      vh = innerHeight;
      lastY = -1;
    }, { passive: true });
    glows.forEach((s) => {
      on(s, 'pointermove', ((e: PointerEvent) => {
        const r = s.getBoundingClientRect();
        s.style.setProperty('--gx', e.clientX - r.left + 'px');
        s.style.setProperty('--gy', e.clientY - r.top + 'px');
      }) as EventListener);
    });
    rafId = requestAnimationFrame(frame);
    update(scrollY || 0);

    // ---------- stillness marginalia ----------
    if (!reduce) {
      const notes = Array.prototype.slice.call(
        root.querySelectorAll('.marginalia')
      ) as HTMLElement[];
      let stillTimer = 0;
      const armFn = () => {
        clearTimeout(stillTimer);
        stillTimer = window.setTimeout(() => {
          notes.forEach((nn) => {
            const host = nn.closest('.spread');
            if (!host) return;
            const r = host.getBoundingClientRect();
            if (r.top < vh * 0.5 && r.bottom > vh * 0.5) nn.classList.add('on');
          });
        }, 2600);
        timers.push(stillTimer);
      };
      ['scroll', 'pointermove', 'keydown', 'touchstart'].forEach((ev) =>
        on(window, ev, armFn, { passive: true })
      );
      armFn();
    } else {
      Array.prototype.slice
        .call(root.querySelectorAll('.marginalia'))
        .forEach((nn: Element) => nn.classList.add('on'));
    }

    // ---------- conversation demo: type transcript, then interactive ----------
    const SCRIPT: { k: RegExp; r: string }[] = [
      { k: /job|offer|career|quit|salary|work|boss|promotion/i, r: "Before the details — what would you be leaving behind, and does it still matter to you?" },
      { k: /strateg|growth|business|company|scale|revenue|market|customer/i, r: "What would have to be true for this to work — and which of those things are you assuming?" },
      { k: /start|idea|launch|startup|build|found/i, r: "What would have to be true for this to work — and which of those things are you assuming?" },
      { k: /argument|essay|writ|draft|paragraph|thesis|convince|reader/i, r: "What are you really trying to convince your reader of — and do you believe it yet?" },
      { k: /concept|understand|grasp|learn|study|confus|don'?t get|explain/i, r: "Explain it as simply as you can — where does the explanation get thin?" },
      { k: /move|city|relocat|country|abroad/i, r: "Before the logistics — are you moving toward something, or away from something?" },
      { k: /relationship|partner|marry|breakup|friend|family|love/i, r: "What do you actually need here that you're not getting?" },
      { k: /money|invest|buy|spend|save|afford|price/i, r: "Set the numbers aside a second. What is this really a decision about?" },
      { k: /should i/i, r: "Maybe. But first — what are you hoping I'll say, and why that answer?" },
      { k: /.*/, r: "Let's slow that down. What's the real question underneath this one?" },
    ];
    const transcript = document.getElementById('transcript');
    const seedLines = transcript
      ? (Array.prototype.slice.call(
          transcript.querySelectorAll('.dline[data-say]')
        ) as HTMLElement[])
      : [];
    const askInput = document.getElementById('ask-input') as HTMLInputElement | null;
    const askSend = document.getElementById('ask-send');
    const suggests = Array.prototype.slice.call(
      root.querySelectorAll('.suggest button')
    ) as HTMLElement[];

    function typeTx(el: HTMLElement, text: string, done?: () => void) {
      const tx = el.querySelector('.tx') as HTMLElement;
      if (reduce) {
        tx.textContent = text;
        el.classList.add('said');
        if (done) done();
        return;
      }
      el.classList.add('said');
      let i = 0;
      (function step() {
        if (!alive) return;
        i += 1 + Math.floor(Math.random() * 2);
        if (i >= text.length) {
          tx.textContent = text;
          if (done) done();
          return;
        }
        tx.innerHTML = '';
        tx.appendChild(document.createTextNode(text.slice(0, i)));
        const c = document.createElement('span');
        c.className = 'caret';
        tx.appendChild(c);
        timers.push(window.setTimeout(step, 16 + Math.random() * 24));
      })();
    }

    let played = false;
    if (transcript && !reduce) {
      seedLines.forEach((l) => {
        const tx = l.querySelector('.tx') as HTMLElement;
        (l as any).dataset.full = tx.textContent;
        tx.textContent = '';
      });
      const tio = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting && !played) {
              played = true;
              tio.disconnect();
              let idx = 0;
              (function next() {
                if (idx >= seedLines.length) return;
                const l = seedLines[idx];
                typeTx(l, (l as any).dataset.full, () => {
                  idx++;
                  timers.push(window.setTimeout(next, 360));
                });
              })();
            }
          });
        },
        { threshold: 0.5 }
      );
      ios.push(tio);
      tio.observe(transcript);
      timers.push(
        window.setTimeout(() => {
          if (!played) {
            seedLines.forEach((l) => {
              const tx = l.querySelector('.tx') as HTMLElement;
              tx.textContent = (l as any).dataset.full;
              l.classList.add('said');
            });
          }
        }, 3000)
      );
    }

    let busy = false;
    function appendYou(text: string) {
      if (!transcript) return;
      const p = document.createElement('p');
      p.className = 'dline you said';
      p.innerHTML = '<span class="who">You</span><span class="tx"></span>';
      (p.querySelector('.tx') as HTMLElement).textContent = text;
      transcript.appendChild(p);
    }
    function appendSocria(text: string) {
      if (!transcript) return;
      const p = document.createElement('p');
      p.className = 'dline ai said';
      p.innerHTML = '<span class="who">Socria</span><span class="tx"></span>';
      transcript.appendChild(p);
      typeTx(p, text, () => {
        busy = false;
      });
    }
    function askQ(q: string) {
      if (busy || !q.trim() || !askInput) return;
      busy = true;
      if (!played) {
        played = true;
        seedLines.forEach((l) => {
          const tx = l.querySelector('.tx') as HTMLElement;
          tx.textContent = (l as any).dataset.full || tx.textContent;
          l.classList.add('said');
        });
      }
      appendYou(q.trim());
      const m = SCRIPT.find((s) => s.k.test(q))!;
      askInput.value = '';
      timers.push(window.setTimeout(() => appendSocria(m.r), 560));
    }
    if (askSend && askInput) {
      on(askSend, 'click', () => askQ(askInput.value));
      on(askInput, 'keydown', ((e: KeyboardEvent) => {
        if (e.key === 'Enter') askQ(askInput.value);
      }) as EventListener);
      suggests.forEach((btn) => {
        on(btn, 'click', () => {
          askInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          askQ(btn.textContent || '');
        });
      });
    }

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      timers.forEach((t) => clearTimeout(t));
      ios.forEach((io) => io.disconnect());
      listeners.forEach(([t, ev, fn]) => t.removeEventListener(ev, fn));
    };
  }, []);

  return null;
}
