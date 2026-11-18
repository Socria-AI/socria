'use client';
// components/ux-v0/measure.ts — a design drawn offscreen at one width, and measured as laid out.
//
// The canvas shows one viewport; the checks need two (1280 and 390 px). Each
// is a throwaway sandboxed frame — `allow-scripts` only, never same-origin,
// exactly like the canvas — holding the page and the inspector, which answers
// one `audit` message with what the browser actually drew (lib/ux-v0/
// audit-source.ts). What comes back is believed only from that frame and only
// in the audit's shape (normalizeAudit). The frame is removed as soon as it
// answers, or after `timeout` with nothing.

import { BEHAVIOR_SOURCE } from '@/lib/ux-v0/behaviors';
import { INSPECTOR_SOURCE } from '@/lib/ux-v0/inspector';
import { normalizeAudit, type PageAudit } from '@/lib/ux-v0/evaluate';
import { buildSandboxDoc } from '@/lib/ux-v0/sandbox';

export function measurePage(html: string, width: number, height: number, nonce: string, timeout = 9000): Promise<PageAudit | null> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('title', 'Measuring the design');
    frame.tabIndex = -1;
    frame.className = 'v0-measure';
    frame.style.cssText = `position:fixed;left:-${width + 4000}px;top:0;width:${width}px;height:${height}px;border:0;opacity:0;pointer-events:none`;
    const parse = (s: string) => new DOMParser().parseFromString(s, 'text/html');
    // measured with its behaviours, so the audit can try them (lib/ux-v0/behaviors.ts selfTest)
    frame.srcdoc = buildSandboxDoc(html, { parse, runScripts: false, nonce, inspector: `${INSPECTOR_SOURCE}\n${BEHAVIOR_SOURCE}` }).doc;
    const id = Math.random().toString(36).slice(2);
    let done = false;
    let ask: number | undefined;
    const finish = (a: PageAudit | null) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', on);
      window.clearTimeout(t);
      window.clearTimeout(ask);
      frame.remove();
      resolve(a);
    };
    // ask once the page has settled: after it is ready, again after each late change of size (fonts, images)
    const settle = (ms: number) => {
      window.clearTimeout(ask);
      ask = window.setTimeout(() => frame.contentWindow?.postMessage({ __uxv0: 1, type: 'audit', id }, '*'), ms);
    };
    const on = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow) return;
      const m = e.data;
      if (!m || typeof m !== 'object' || m.__uxv0 !== 1) return;
      if (m.type === 'ready') settle(1400);
      else if (m.type === 'size') settle(450);
      else if (m.type === 'audit' && m.id === id) finish(normalizeAudit(m.result));
    };
    window.addEventListener('message', on);
    const t = window.setTimeout(() => finish(null), timeout);
    document.body.appendChild(frame);
  });
}
