'use client';

import { useEffect } from 'react';

// Ports socria.js (the motion + scroll engine) into a client component that
// runs after hydration. Cleans up DOM mutations and rAF loops when the
// landing route unmounts so navigating to /chat doesn't leak the reading
// rail, scroll hint, or rAF callbacks.
export function LandingMotion() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doc = document.documentElement;
    const cleanup: Array<() => void> = [];

    // --- 1. Word-rise text reveal ---
    const counter = { i: 0 };
    function makeWord(contentNode: Node) {
      const w = document.createElement('span');
      w.className = 'word';
      const inner = document.createElement('span');
      inner.className = 'word-inner';
      inner.style.setProperty('--i', String(counter.i++));
      inner.appendChild(contentNode);
      w.appendChild(inner);
      return w;
    }
    function buildNodes(node: Node): Node[] {
      const out: Node[] = [];
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const parts = (child.textContent || '').split(/(\s+)/);
          parts.forEach((p) => {
            if (p === '') return;
            if (/^\s+$/.test(p)) {
              out.push(document.createTextNode(p));
              return;
            }
            out.push(makeWord(document.createTextNode(p)));
          });
        } else if ((child as Element).nodeName === 'BR') {
          out.push(child.cloneNode());
        } else if (
          (child as Element).nodeName === 'SPAN' &&
          !(child as Element).querySelector('svg')
        ) {
          const clone = child.cloneNode(false);
          buildNodes(child).forEach((n) => clone.appendChild(n));
          out.push(clone);
        } else {
          out.push(makeWord(child.cloneNode(true)));
        }
      });
      return out;
    }
    function splitInto(el: Element) {
      counter.i = 0;
      const frag = buildNodes(el);
      el.innerHTML = '';
      frag.forEach((n) => el.appendChild(n));
      el.setAttribute('data-anim', 'words');
    }
    const splitTargets = Array.from(
      document.querySelectorAll(
        '.hero-head, .section-head, .problem .lead, .risk .lead, .risk .punch, .why .big, .couplet p, .final h2, .mv-item h3, .uc-cell h3, .what .lede'
      )
    );
    if (!reduce) {
      splitTargets.forEach((el) => {
        el.classList.remove('reveal', 'd1', 'd2', 'd3', 'd4');
        splitInto(el);
      });
    }

    // --- 2. Intersection reveals ---
    const revealEls = Array.from(
      document.querySelectorAll('.reveal, [data-anim]')
    );
    let io: IntersectionObserver | null = null;
    if (reduce || !('IntersectionObserver' in window)) {
      revealEls.forEach((el) => el.classList.add('in'));
    } else {
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
        { threshold: 0.16, rootMargin: '0px 0px -8% 0px' }
      );
      revealEls.forEach((el) => io!.observe(el));
      const safetyTimer = window.setTimeout(() => {
        const vh = window.innerHeight;
        const broken = revealEls.some((el) => {
          const r = el.getBoundingClientRect();
          const inView = r.top < vh * 0.9 && r.bottom > 0;
          if (!inView) return false;
          return (
            !el.classList.contains('in') ||
            getComputedStyle(el).opacity === '0'
          );
        });
        if (broken) {
          doc.classList.remove('js-anim');
          revealEls.forEach((el) => {
            el.classList.add('in', 'anim-done');
            (el as HTMLElement).style.transition = 'none';
            (el as HTMLElement).style.animation = 'none';
            (el as HTMLElement).style.opacity = '1';
            (el as HTMLElement).style.transform = 'none';
          });
          document.querySelectorAll<HTMLElement>('.word-inner').forEach((w) => {
            w.style.transition = 'none';
            w.style.transform = 'none';
          });
        }
      }, 1500);
      cleanup.push(() => window.clearTimeout(safetyTimer));
    }

    // --- 3. Cursor-follow spotlight ---
    const spotlitTargets: Array<{ el: HTMLElement; onMove: any; onLeave: any }> =
      [];
    if (!reduce && window.matchMedia('(pointer:fine)').matches) {
      ['.risk', '.final', '.sc-logo'].forEach((sel) => {
        const s = document.querySelector<HTMLElement>(sel);
        if (!s) return;
        s.classList.add('has-spot');
        const spot = document.createElement('div');
        spot.className = 'spotlight';
        s.insertBefore(spot, s.firstChild);
        const onMove = (ev: PointerEvent) => {
          const r = s.getBoundingClientRect();
          s.style.setProperty('--mx', ev.clientX - r.left + 'px');
          s.style.setProperty('--my', ev.clientY - r.top + 'px');
          s.classList.add('lit');
        };
        const onLeave = () => s.classList.remove('lit');
        s.addEventListener('pointermove', onMove);
        s.addEventListener('pointerleave', onLeave);
        spotlitTargets.push({ el: s, onMove, onLeave });
        cleanup.push(() => spot.remove());
      });
      cleanup.push(() => {
        spotlitTargets.forEach(({ el, onMove, onLeave }) => {
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerleave', onLeave);
          el.classList.remove('has-spot', 'lit');
        });
      });
    }

    // --- 4. Scroll hint ---
    const hero = document.querySelector<HTMLElement>('.hero');
    let hint: HTMLDivElement | null = null;
    if (hero) {
      hint = document.createElement('div');
      hint.className = 'scrollhint';
      hint.innerHTML = '<span>Scroll to think</span><span class="ln"></span>';
      hero.appendChild(hint);
      cleanup.push(() => hint?.remove());
    }

    // --- 5. Reading rail ---
    const ucIntro = document.querySelector('.block.tight.bg-paper');
    if (ucIntro && !ucIntro.id) ucIntro.id = 'uses';
    const railMap = [
      { id: 'top', label: 'Intro' },
      { id: 'problem', label: 'Problem' },
      { id: 'what', label: 'What' },
      { id: 'how', label: 'Method' },
      { id: 'uses', label: 'Uses' },
      { id: 'philosophy', label: 'Why' },
      { id: 'start', label: 'Start' },
    ];
    const rail = document.createElement('nav');
    rail.className = 'rail';
    rail.setAttribute('aria-label', 'Section navigation');
    railMap.forEach((m) => {
      const a = document.createElement('a');
      a.href = '#' + m.id;
      a.innerHTML =
        '<span class="lbl">' + m.label + '</span><span class="dotr"></span>';
      a.dataset.id = m.id;
      rail.appendChild(a);
    });
    document.body.appendChild(rail);
    const railLinks = Array.from(rail.querySelectorAll<HTMLAnchorElement>('a'));
    cleanup.push(() => rail.remove());

    const darkSections = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.hero, .showcase, .marquee, .risk, .final, footer'
      )
    );

    // --- 6. Marquee ---
    const mTrack = document.querySelector<HTMLElement>('.marquee-track');
    let mX = 0;
    let mWidth = 0;
    let vel = 0;
    let lastY = window.scrollY;
    if (mTrack) {
      mTrack.style.animation = 'none';
      requestAnimationFrame(() => {
        mWidth = mTrack.scrollWidth / 2;
      });
    }

    // --- 7. Movements ---
    const movements = document.querySelector<HTMLElement>('.movements');
    const mvItems = Array.from(
      document.querySelectorAll<HTMLElement>('.mv-item')
    );
    const mvLight = document.querySelector<HTMLElement>('.mv-light');
    const mvFill = document.querySelector<HTMLElement>('.mv-track-fill');
    const mvNum = document.querySelector<HTMLElement>('.mv-num');
    const mvLabels = ['Reflection', 'Clarification', 'Exploration', 'Ownership'];
    function updateMovements() {
      if (!movements || !mvItems.length) return;
      const rect = movements.getBoundingClientRect();
      const vh = window.innerHeight;
      const totalScroll = movements.offsetHeight - vh;
      const prog =
        totalScroll > 0
          ? Math.max(0, Math.min(1, -rect.top / totalScroll))
          : 0;
      if (mvLight) mvLight.style.top = 10 + prog * 78 + '%';
      if (mvFill) mvFill.style.height = prog * 100 + '%';
      const vc = vh / 2;
      let best = 0;
      let bestD = Infinity;
      mvItems.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const c = r.top + r.height / 2;
        const d = Math.abs(c - vc);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      mvItems.forEach((el, i) => el.classList.toggle('active', i === best));
      if (mvNum) mvNum.textContent = '0' + (best + 1) + ' · ' + mvLabels[best];
    }

    // --- 8. Parallax ---
    const scLogo = document.querySelector<HTMLElement>('.sc-logo .mark');
    const showcase = document.querySelector<HTMLElement>('.showcase');
    const ucCells = Array.from(
      document.querySelectorAll<HTMLElement>('.uc-cell > div')
    );
    const ucGrid = document.querySelector<HTMLElement>('.uc-grid');

    // --- Core scroll/progress ---
    const progress = document.querySelector<HTMLElement>('.progress');
    const navEl = document.querySelector<HTMLElement>('header.nav');
    const floatCta = document.querySelector<HTMLElement>('.floating-cta');
    const scrollHint = hero ? hero.querySelector<HTMLElement>('.scrollhint') : null;

    function updateRail(st: number) {
      const vh = window.innerHeight;
      const marker = vh * 0.42;
      let activeId = 'top';
      railMap.forEach((m) => {
        const el = document.getElementById(m.id);
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top <= marker) activeId = m.id;
      });
      railLinks.forEach((a) =>
        a.classList.toggle('active', a.dataset.id === activeId)
      );
      let darkNow = false;
      darkSections.forEach((s) => {
        const r = s.getBoundingClientRect();
        if (r.top <= marker && r.bottom > marker) darkNow = true;
      });
      rail.classList.toggle('on-dark', darkNow);
    }

    function onScroll() {
      const st = window.scrollY || doc.scrollTop;
      const h = doc.scrollHeight - window.innerHeight;
      if (progress) progress.style.width = (h > 0 ? (st / h) * 100 : 0) + '%';
      if (floatCta && hero) {
        const hb = hero.offsetTop + hero.offsetHeight;
        floatCta.classList.toggle('show', st > hb - 200);
      }
      if (scrollHint) scrollHint.style.opacity = st > 80 ? '0' : '0.65';

      vel = st - lastY;
      lastY = st;

      if (!reduce) {
        if (scLogo && showcase) {
          const sr = showcase.getBoundingClientRect();
          if (sr.bottom > 0 && sr.top < window.innerHeight) {
            const p =
              (window.innerHeight - sr.top) / (window.innerHeight + sr.height);
            scLogo.style.transform = 'translateY(' + (p - 0.5) * -46 + 'px)';
          }
        }
        if (ucGrid) {
          const gr = ucGrid.getBoundingClientRect();
          if (gr.bottom > 0 && gr.top < window.innerHeight) {
            ucCells.forEach((c, i) => {
              const amt = i % 2 === 0 ? 1 : -1;
              const p2 =
                (window.innerHeight - gr.top) /
                (window.innerHeight + gr.height);
              c.style.transform = 'translateY(' + (p2 - 0.5) * 22 * amt + 'px)';
            });
          }
        }
      }

      updateMovements();
      updateRail(st);
    }

    let rafId = 0;
    function raf() {
      if (mTrack && mWidth) {
        const speed = 0.6 + Math.min(Math.abs(vel) * 0.25, 7);
        mX -= speed;
        if (mX <= -mWidth) mX += mWidth;
        const skew = Math.max(-6, Math.min(6, vel * 0.4));
        mTrack.style.transform =
          'translateX(' + mX + 'px) skewX(' + skew + 'deg)';
        vel *= 0.9;
      }
      rafId = requestAnimationFrame(raf);
    }
    if (!reduce && mTrack) rafId = requestAnimationFrame(raf);
    cleanup.push(() => {
      if (rafId) cancelAnimationFrame(rafId);
    });

    const onResize = () => {
      if (mTrack) mWidth = mTrack.scrollWidth / 2;
      onScroll();
    };
    const onNavScroll = () => {
      if (navEl) {
        navEl.classList.toggle(
          'scrolled',
          (window.scrollY || doc.scrollTop) > 10
        );
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    if (navEl) window.addEventListener('scroll', onNavScroll, { passive: true });
    onScroll();
    cleanup.push(() => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onNavScroll);
      io?.disconnect();
      doc.classList.remove('js-anim');
    });

    return () => {
      cleanup.forEach((fn) => {
        try {
          fn();
        } catch {}
      });
    };
  }, []);

  return null;
}
