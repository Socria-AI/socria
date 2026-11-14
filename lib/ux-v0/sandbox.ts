// lib/ux-v0/sandbox.ts — an uploaded (or generated) page, made safe to draw.
//
// THE PAGE NEVER SHARES SOCRIA'S ORIGIN. It is drawn in an iframe with
// `sandbox="allow-scripts"` and never `allow-same-origin`: an opaque origin,
// with no access to Socria's cookies, storage, or the page around it, no
// popups, no forms, no top-level navigation. That is the wall.
//
// This module builds the document that goes in it, and is the second wall:
//
//   - A Content-Security-Policy is the first thing in <head>: no network calls
//     (connect-src 'none'), no frames, no plugins, no form posts, no <base>.
//     With the page's scripts off (the default) only our inspector runs, by
//     nonce; inline handlers and every other script are refused by the
//     browser even if one slipped past the steps below.
//   - What could navigate or reach out is removed: <meta http-equiv=refresh>,
//     <base>, the page's own CSP, frames, objects and embeds — and, with
//     scripts off, every <script>, every on* attribute and every javascript:
//     URL.
//   - The inspector (lib/ux-v0/inspector.ts) is added last; it reports what is
//     selected by postMessage, and the workspace treats those messages as
//     untrusted (components/ux-v0/Frame.tsx checks the sender and the shape).
//
// Pure: parsing is passed in (the browser's DOMParser; jsdom under test).

export interface SandboxOptions {
  /** HTML string → inert Document (DOMParser, 'text/html') */
  parse: (html: string) => Document;
  runScripts: boolean;
  nonce: string;
  inspector: string;
}

export interface SandboxResult {
  doc: string;
  removed: { scripts: number; handlers: number; jsUrls: number; refresh: number; base: number; frames: number; csp: number };
}

/** The policy the frame's document carries. */
export function cspFor(runScripts: boolean, nonce: string): string {
  const scripts = runScripts ? "'unsafe-inline' https:" : `'nonce-${nonce}'`;
  return [
    "default-src 'none'",
    `script-src ${scripts}`,
    "style-src 'unsafe-inline' https: data:",
    'img-src https: data: blob:',
    'font-src https: data:',
    'media-src https: data: blob:',
    "connect-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
}

const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href', 'data', 'poster', 'background'];

export function buildSandboxDoc(html: string, opts: SandboxOptions): SandboxResult {
  const removed = { scripts: 0, handlers: 0, jsUrls: 0, refresh: 0, base: 0, frames: 0, csp: 0 };
  const doc = opts.parse(html || '<!doctype html><title>Empty</title>');
  const all = (sel: string) => Array.from(doc.querySelectorAll(sel));

  for (const m of all('meta[http-equiv]')) {
    const v = (m.getAttribute('http-equiv') || '').toLowerCase();
    if (v === 'refresh') {
      m.remove();
      removed.refresh++;
    } else if (v === 'content-security-policy' || v === 'content-security-policy-report-only') {
      m.remove();
      removed.csp++;
    }
  }
  for (const b of all('base')) {
    b.remove();
    removed.base++;
  }
  for (const f of all('iframe, frame, frameset, object, embed, portal, applet')) {
    f.remove();
    removed.frames++;
  }
  if (!opts.runScripts) {
    for (const s of all('script')) {
      s.remove();
      removed.scripts++;
    }
    for (const el of all('*')) {
      for (const a of Array.from(el.attributes)) {
        const name = a.name.toLowerCase();
        if (name.startsWith('on')) {
          el.removeAttribute(a.name);
          removed.handlers++;
        } else if (URL_ATTRS.includes(name) && /^\s*(javascript|vbscript):/i.test(a.value)) {
          el.removeAttribute(a.name);
          removed.jsUrls++;
        }
      }
    }
  }

  const head = doc.head ?? doc.documentElement.insertBefore(doc.createElement('head'), doc.documentElement.firstChild);
  const csp = doc.createElement('meta');
  csp.setAttribute('http-equiv', 'Content-Security-Policy');
  csp.setAttribute('content', cspFor(opts.runScripts, opts.nonce));
  head.insertBefore(csp, head.firstChild);
  if (!head.querySelector('meta[charset]')) {
    const cs = doc.createElement('meta');
    cs.setAttribute('charset', 'utf-8');
    head.insertBefore(cs, head.firstChild);
  }
  if (!head.querySelector('meta[name="viewport"]')) {
    const vp = doc.createElement('meta');
    vp.setAttribute('name', 'viewport');
    vp.setAttribute('content', 'width=device-width, initial-scale=1');
    head.appendChild(vp);
  }
  const body = doc.body ?? doc.documentElement.appendChild(doc.createElement('body'));
  const script = doc.createElement('script');
  script.setAttribute('nonce', opts.nonce);
  script.textContent = opts.inspector;
  body.appendChild(script);

  return { doc: `<!doctype html>\n${doc.documentElement.outerHTML}`, removed };
}

/** A nonce: random, so a page cannot guess it into a script of its own. */
export function makeNonce(): string {
  const b = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
