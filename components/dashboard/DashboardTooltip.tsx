'use client';
// components/dashboard/DashboardTooltip.tsx
//
// The hover layer for the developer dashboard's charts: one tooltip for the
// whole page, following whichever mark the pointer or the keyboard is on.
//
// Marks carry their readout as data attributes (data-tip-value, the number,
// and data-tip-label, what it is), so the charts stay server-rendered and this
// is the only JavaScript the page ships. Text goes in with textContent, never
// as markup. Everything it shows is also in each chart's table view: the
// tooltip enhances, it never gates.

import { useEffect, useRef } from 'react';

export function DashboardTooltip() {
  const tip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tip.current;
    const root = el?.closest('.dash');
    if (!el || !root) return;
    const value = el.querySelector('strong')!;
    const label = el.querySelector('span')!;
    const show = (mark: HTMLElement, x: number, y: number) => {
      value.textContent = mark.dataset.tipValue ?? '';
      label.textContent = mark.dataset.tipLabel ?? '';
      el.hidden = false;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8);
      const top = y - h - 12 < 8 ? y + 16 : y - h - 12;
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };
    const hide = () => {
      el.hidden = true;
    };
    const markOf = (t: EventTarget | null) => (t instanceof Element ? (t.closest('[data-tip-value]') as HTMLElement | null) : null);
    const onMove = (e: PointerEvent) => {
      const m = markOf(e.target);
      if (m) show(m, e.clientX, e.clientY);
      else hide();
    };
    const onFocus = (e: FocusEvent) => {
      const m = markOf(e.target);
      if (!m) return hide();
      const r = m.getBoundingClientRect();
      show(m, r.left + r.width / 2, r.top);
    };
    root.addEventListener('pointermove', onMove as EventListener);
    root.addEventListener('pointerleave', hide);
    root.addEventListener('focusin', onFocus as EventListener);
    root.addEventListener('focusout', hide);
    window.addEventListener('scroll', hide, { passive: true });
    return () => {
      root.removeEventListener('pointermove', onMove as EventListener);
      root.removeEventListener('pointerleave', hide);
      root.removeEventListener('focusin', onFocus as EventListener);
      root.removeEventListener('focusout', hide);
      window.removeEventListener('scroll', hide);
    };
  }, []);
  return (
    // Visual only: every mark already carries its readout as an aria-label,
    // so a screen reader hears it once, on focus, not twice.
    <div ref={tip} className="dash-tip" aria-hidden="true" hidden>
      <strong />
      <span />
    </div>
  );
}
