'use client';

import { useEffect } from 'react';

// Ports scrolly.js — word-rise reveals, the scroll-driven scene engine
// (thread of light, pinned problem/risk/movements/core3 scenes, nav
// contrast), and the scripted "Try it" demo — into a client component
// scoped to the scrollytelling landing. Cleans up rAF + listeners on
// unmount. The on-dark class is toggled on the .scrolly-root element
// (not body) so it never leaks into other pages.
export function ScrollyMotion() {
  useEffect(() => {
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    const doc = document.documentElement;
    const root = document.querySelector<HTMLElement>('.scrolly-root');
    const cleanups: Array<() => void> = [];
    let rafId = 0;

    // --- word-rise split ---
    let wi = 0;
    function wrap(content: Node) {
      const w = document.createElement('span');
      w.className = 'word';
      const inner = document.createElement('span');
      inner.className = 'word-inner';
      inner.style.setProperty('--i', String(wi++));
      inner.appendChild(content);
      w.appendChild(inner);
      return w;
    }
    function splitWords(el: Element) {
      wi = 0;
      const nodes: Node[] = [];
      Array.from(el.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          (child.textContent || '').split(/(\s+)/).forEach((p) => {
            if (p === '') return;
            if (/^\s+$/.test(p)) {
              nodes.push(document.createTextNode(p));
              return;
            }
            nodes.push(wrap(document.createTextNode(p)));
          });
        } else if ((child as Element).nodeName === 'BR') {
          nodes.push(child.cloneNode());
        } else if ((child as Element).nodeName === 'SPAN') {
          const c = child.cloneNode(false);
          Array.from(child.childNodes).forEach((g) => {
            if (g.nodeType === 3) {
              (g.textContent || '').split(/(\s+)/).forEach((p) => {
                if (p === '') return;
                if (/^\s+$/.test(p)) {
                  c.appendChild(document.createTextNode(p));
                  return;
                }
                c.appendChild(wrap(document.createTextNode(p)));
              });
            } else c.appendChild(wrap(g.cloneNode(true)));
          });
          nodes.push(c);
        } else nodes.push(wrap(child.cloneNode(true)));
      });
      el.innerHTML = '';
      nodes.forEach((n) => el.appendChild(n));
      el.setAttribute('data-anim', '1');
    }

    const splitTargets = Array.from(
      document.querySelectorAll('.scrolly-root [data-split]')
    );
    let io: IntersectionObserver | null = null;
    if (!reduce) {
      splitTargets.forEach(splitWords);
      const revealEls = Array.from(
        document.querySelectorAll('.scrolly-root .fade, .scrolly-root [data-anim]')
      );
      doc.classList.add('js-anim');
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add('in');
              io?.unobserve(e.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: '0px 0px -6% 0px' }
      );
      revealEls.forEach((el) => io!.observe(el));
      const t = window.setTimeout(() => {
        const vh = window.innerHeight;
        const broken = revealEls.some((el) => {
          const r = el.getBoundingClientRect();
          if (!(r.top < vh * 0.9 && r.bottom > 0)) return false;
          return (
            !el.classList.contains('in') ||
            getComputedStyle(el).opacity === '0'
          );
        });
        if (broken) {
          doc.classList.remove('js-anim');
          revealEls.forEach((el) => {
            el.classList.add('in');
            (el as HTMLElement).style.transition = 'none';
            (el as HTMLElement).style.opacity = '1';
            (el as HTMLElement).style.transform = 'none';
          });
          document
            .querySelectorAll<HTMLElement>('.scrolly-root .word-inner')
            .forEach((w) => {
              w.style.transition = 'none';
              w.style.transform = 'none';
            });
        }
      }, 1500);
      cleanups.push(() => window.clearTimeout(t));
    } else {
      Array.from(document.querySelectorAll('.scrolly-root .fade')).forEach(
        (el) => el.classList.add('in')
      );
    }

    // --- scroll engine ---
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    function pinProgress(el: HTMLElement, vh: number) {
      const r = el.getBoundingClientRect();
      const total = el.offsetHeight - vh;
      return total > 0 ? clamp01(-r.top / total) : 0;
    }

    let vhCache = window.innerHeight;
    const q = <T extends Element>(s: string) =>
      document.querySelector<T>(s);
    const qa = <T extends Element>(s: string) =>
      Array.from(document.querySelectorAll<T>(s));

    const thread = q<HTMLElement>('.scrolly-root .thread');
    const threadFill = thread
      ? thread.querySelector<HTMLElement>('.fill')
      : null;
    const threadOrb = thread ? thread.querySelector<HTMLElement>('.orb') : null;
    const nav = q<HTMLElement>('.scrolly-root header.nav');
    const heroStack = q<HTMLElement>('.scrolly-root .s-hero .stack');
    const heroHint = q<HTMLElement>('.scrolly-root .s-hero .hint');
    const sProblem = q<HTMLElement>('.scrolly-root .s-problem');
    const genLines = qa<HTMLElement>('.scrolly-root .gen-line');
    const coda = q<HTMLElement>('.scrolly-root .s-problem .coda');
    const sRisk = q<HTMLElement>('.scrolly-root .s-risk');
    const riskStage = sRisk
      ? sRisk.querySelector<HTMLElement>('.stage')
      : null;
    const sMv = q<HTMLElement>('.scrolly-root .s-mv');
    const mvSteps = qa<HTMLElement>('.scrolly-root .mv-step');
    const sCore3 = q<HTMLElement>('.scrolly-root .s-core3');
    const c3Feats = qa<HTMLElement>('.scrolly-root .c3-feat');
    const c3Bars = qa<HTMLElement>('.scrolly-root .c3-steps span i');
    const mvFill = q<HTMLElement>('.scrolly-root .mv-visual .trk-fill');
    const mvDot = q<HTMLElement>('.scrolly-root .mv-visual .lit-dot');
    const mvCap = q<HTMLElement>('.scrolly-root .mv-visual .cap');
    const mvBars = qa<HTMLElement>('.scrolly-root .mv-progress span i');
    const mvLabels = ['Reflection', 'Clarification', 'Exploration', 'Ownership'];
    const sFinal = q<HTMLElement>('.scrolly-root .s-final');
    const darkEls = [
      riskStage,
      sCore3,
      sFinal,
      q<HTMLElement>('.scrolly-root footer'),
    ].filter(Boolean) as HTMLElement[];

    let lastY = -1;
    let lastNavY = 0;

    function update(y: number) {
      const vh = vhCache;
      const docH = doc.scrollHeight - vh;
      const pageP = docH > 0 ? y / docH : 0;

      if (threadFill && threadOrb && thread) {
        threadFill.style.height = pageP * 100 + '%';
        threadOrb.style.top = pageP * 100 + '%';
        const orbY = pageP * vh;
        let dark = false;
        darkEls.forEach((s) => {
          const r = s.getBoundingClientRect();
          if (r.top <= orbY && r.bottom > orbY) dark = true;
        });
        thread.classList.toggle('dark', dark);
      }

      if (nav && root) {
        nav.classList.toggle('hidden', y > lastNavY && y > 240);
        lastNavY = y;
        let navDark = false;
        darkEls.forEach((s) => {
          const r = s.getBoundingClientRect();
          if (r.top <= 40 && r.bottom > 40) navDark = true;
        });
        root.classList.toggle('on-dark', navDark);
      }

      if (heroStack && !reduce) {
        const hp = clamp01(y / (vh * 0.9));
        heroStack.style.transform =
          'translateY(' + -hp * 60 + 'px) scale(' + (1 - hp * 0.06) + ')';
        heroStack.style.opacity = String(1 - hp * 1.15);
        if (heroHint) heroHint.style.opacity = y > 60 ? '0' : '1';
      }

      if (sProblem) {
        const p = pinProgress(sProblem, vh);
        genLines.forEach((l, i) => {
          const lit = p >= (i + 0.6) / 4.6;
          l.classList.toggle('lit', lit);
          if (!reduce) l.style.transform = 'translateX(' + (lit ? 0 : -14) + 'px)';
        });
        if (coda) coda.classList.toggle('lit', p >= 3.9 / 4.6);
      }

      if (riskStage && sRisk) {
        const rp = pinProgress(sRisk, vh);
        riskStage.classList.toggle('dark', rp > 0.32);
        const punch = sRisk.querySelector<HTMLElement>('.punch');
        if (punch && !reduce && rp > 0.32) {
          punch.style.transform = 'translateY(' + (rp - 0.32) * -40 + 'px)';
        }
      }

      if (sCore3 && c3Feats.length) {
        const cp = pinProgress(sCore3, vh);
        const ci = Math.min(c3Feats.length - 1, Math.floor(cp * c3Feats.length));
        c3Feats.forEach((f, i) => f.classList.toggle('on', i === ci));
        c3Bars.forEach((b, i) => {
          b.style.transform = 'scaleX(' + clamp01(cp * c3Feats.length - i) + ')';
        });
      }

      if (sMv && mvSteps.length) {
        const mp = pinProgress(sMv, vh);
        const idx = Math.min(mvSteps.length - 1, Math.floor(mp * mvSteps.length));
        mvSteps.forEach((s, i) => s.classList.toggle('on', i === idx));
        if (mvFill) mvFill.style.height = mp * 100 + '%';
        if (mvDot) mvDot.style.top = 8 + mp * 76 + '%';
        if (mvCap) mvCap.textContent = '0' + (idx + 1) + ' · ' + mvLabels[idx];
        mvBars.forEach((b, i) => {
          const seg = clamp01(mp * mvSteps.length - i);
          b.style.transform = 'scaleX(' + seg + ')';
        });
      }

      if (sFinal && !reduce) {
        const fr = sFinal.getBoundingClientRect();
        if (fr.top < vh && fr.bottom > 0) {
          const fp = clamp01((vh - fr.top) / (vh + fr.height));
          sFinal.style.setProperty('--gy', 20 + fp * 50 + '%');
        }
      }
    }

    function frame() {
      const y = window.scrollY || doc.scrollTop;
      if (y !== lastY) {
        lastY = y;
        update(y);
      }
      rafId = requestAnimationFrame(frame);
    }

    const onResize = () => {
      vhCache = window.innerHeight;
      lastY = -1;
    };
    window.addEventListener('resize', onResize, { passive: true });

    const onFinalMove = (e: PointerEvent) => {
      if (!sFinal) return;
      const r = sFinal.getBoundingClientRect();
      sFinal.style.setProperty('--gx', e.clientX - r.left + 'px');
      sFinal.style.setProperty('--gy', e.clientY - r.top + 'px');
    };
    if (sFinal) sFinal.addEventListener('pointermove', onFinalMove);

    rafId = requestAnimationFrame(frame);
    update(window.scrollY || 0);

    cleanups.push(() => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      if (sFinal) sFinal.removeEventListener('pointermove', onFinalMove);
      io?.disconnect();
      doc.classList.remove('js-anim');
      root?.classList.remove('on-dark');
    });

    // --- TRY IT (scripted demo) ---
    const tryBody = document.getElementById('try-body');
    const tryInput = document.getElementById('try-input') as HTMLInputElement | null;
    const trySend = document.getElementById('try-send');
    let tryEmpty = document.getElementById('try-empty');
    const chips = qa<HTMLElement>('.scrolly-root .try-chip');
    let busy = false;

    const SCRIPT: Array<{ k: RegExp; r: string }> = [
      { k: /job|offer|career|quit|salary|work|boss|promotion/i, r: 'Before the details — <em>what would you be leaving behind, and does it still matter to you?</em>' },
      { k: /start|business|company|idea|launch|startup|build/i, r: 'Interesting. <em>What would have to be true for this idea to work — and which of those things are you assuming?</em>' },
      { k: /move|city|relocat|country|abroad/i, r: 'Before the logistics — <em>are you moving toward something, or away from something?</em>' },
      { k: /relationship|partner|marry|breakup|friend|family/i, r: "That's worth thinking through slowly. <em>What do you actually need here that you're not getting?</em>" },
      { k: /study|school|degree|college|major|learn/i, r: "One question first: <em>are you choosing this because it interests you, or because it's expected of you?</em>" },
      { k: /money|invest|buy|spend|save|afford/i, r: 'Set the numbers aside for a second. <em>What is this money decision really a decision about?</em>' },
      { k: /should i/i, r: "Maybe. But first — <em>what are you hoping I'll say, and why that answer?</em>" },
      { k: /.*/, r: "Let's slow that down. <em>What's the real question underneath this one?</em>" },
    ];

    function escapeHtml(s: string) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function addMsg(kind: string, html: string) {
      const m = document.createElement('div');
      m.className = 'try-msg ' + kind;
      if (kind === 'ai') {
        m.innerHTML =
          '<div class="av"><img src="/socria-logo.png" alt=""></div><div class="bb"></div>';
      } else {
        m.innerHTML = '<div class="bb"></div>';
      }
      tryBody?.appendChild(m);
      const bb = m.querySelector<HTMLElement>('.bb')!;
      if (kind === 'me') bb.textContent = html;
      return bb;
    }
    function typeInto(bb: HTMLElement, html: string, done?: () => void) {
      if (reduce) {
        bb.innerHTML = html;
        done?.();
        return;
      }
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const text = tmp.textContent || '';
      let i = 0;
      const caret = '<span class="caret"></span>';
      function step() {
        i += 1 + Math.floor(Math.random() * 2);
        if (i >= text.length) {
          bb.innerHTML = html;
          done?.();
          return;
        }
        bb.innerHTML = escapeHtml(text.slice(0, i)) + caret;
        window.setTimeout(step, 18 + Math.random() * 26);
      }
      step();
    }
    function ask(qStr: string) {
      if (busy || !qStr.trim()) return;
      busy = true;
      if (tryEmpty) {
        tryEmpty.remove();
        tryEmpty = null;
      }
      chips.forEach((c) => (c.style.display = 'none'));
      addMsg('me', qStr.trim());
      const match = SCRIPT.find((s) => s.k.test(qStr))!;
      window.setTimeout(() => {
        const bb = addMsg('ai', '');
        typeInto(bb, match.r, () => (busy = false));
      }, 550);
      if (tryInput) tryInput.value = '';
    }

    const onSend = () => tryInput && ask(tryInput.value);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && tryInput) ask(tryInput.value);
    };
    const chipHandlers: Array<() => void> = [];
    if (trySend && tryInput) {
      trySend.addEventListener('click', onSend);
      tryInput.addEventListener('keydown', onKey);
      chips.forEach((c) => {
        const h = () => ask(c.textContent || '');
        c.addEventListener('click', h);
        chipHandlers.push(() => c.removeEventListener('click', h));
      });
    }
    cleanups.push(() => {
      trySend?.removeEventListener('click', onSend);
      tryInput?.removeEventListener('keydown', onKey);
      chipHandlers.forEach((fn) => fn());
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
