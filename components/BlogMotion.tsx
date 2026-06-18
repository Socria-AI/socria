'use client';

import { useEffect } from 'react';

// Ports blog.js (word-rise + intersection reveals + progress bar) to a
// client component scoped to the journal pages. Cleans up listeners and
// IntersectionObserver on unmount.
export function BlogMotion() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doc = document.documentElement;
    const cleanups: Array<() => void> = [];

    let ci = 0;
    function makeWord(node: Node) {
      const w = document.createElement('span');
      w.className = 'word';
      const inner = document.createElement('span');
      inner.className = 'word-inner';
      inner.style.setProperty('--i', String(ci++));
      inner.appendChild(node);
      w.appendChild(inner);
      return w;
    }
    function build(node: Node): Node[] {
      const out: Node[] = [];
      Array.from(node.childNodes).forEach((c) => {
        if (c.nodeType === 3) {
          (c.textContent || '').split(/(\s+)/).forEach((p) => {
            if (p === '') return;
            if (/^\s+$/.test(p)) {
              out.push(document.createTextNode(p));
              return;
            }
            out.push(makeWord(document.createTextNode(p)));
          });
        } else if ((c as Element).nodeName === 'BR') {
          out.push(c.cloneNode());
        } else if (
          (c as Element).nodeName === 'SPAN' &&
          !(c as Element).querySelector('svg')
        ) {
          const cl = c.cloneNode(false);
          build(c).forEach((n) => cl.appendChild(n));
          out.push(cl);
        } else {
          out.push(makeWord(c.cloneNode(true)));
        }
      });
      return out;
    }
    function split(el: Element) {
      ci = 0;
      const frag = build(el);
      el.innerHTML = '';
      frag.forEach((n) => el.appendChild(n));
      el.setAttribute('data-anim', 'words');
    }

    const splitTargets = Array.from(
      document.querySelectorAll(
        '.mast h1, .feature h2, .subscribe h2, .posts .grid-head h3'
      )
    );
    if (!reduce) {
      splitTargets.forEach((el) => {
        el.classList.remove('reveal', 'd1', 'd2', 'd3');
        split(el);
      });
    }

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
            el.classList.add('in', 'anim-done');
            (el as HTMLElement).style.transition = 'none';
            (el as HTMLElement).style.opacity = '1';
            (el as HTMLElement).style.transform = 'none';
          });
          document
            .querySelectorAll<HTMLElement>('.word-inner')
            .forEach((w) => {
              w.style.transition = 'none';
              w.style.transform = 'none';
            });
        }
      }, 1500);
      cleanups.push(() => window.clearTimeout(t));
    }

    const progress = document.querySelector<HTMLElement>('.progress');
    function onScroll() {
      const st = window.scrollY || doc.scrollTop;
      const h = doc.scrollHeight - window.innerHeight;
      if (progress)
        progress.style.width = (h > 0 ? (st / h) * 100 : 0) + '%';
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    cleanups.push(() => window.removeEventListener('scroll', onScroll));
    cleanups.push(() => {
      io?.disconnect();
      doc.classList.remove('js-anim');
    });

    return () => cleanups.forEach((c) => c());
  }, []);

  return null;
}
