// lib/ux-v0/design/elements.ts — an artboard's HTML, made safe and given stable ids; and the edits made by hand.
//
// Everything here works on the fragment as text, through a parser passed in (the browser's DOMParser; jsdom in the
// tests), so the same code runs in the workspace and under test.
//
// SANITISING. A fragment may hold markup, inline SVG and <style>. It may not hold scripts, event handlers, frames,
// objects, embeds, forms that post, <base>, <meta> or <link> (faces are linked by the frame itself, from the font
// library), nor javascript: addresses. A whole document written by mistake is reduced to its styles and its body.
// The frame it is drawn in is sandboxed and allows no network calls besides (lib/ux-v0/sandbox.ts): this is the
// first wall, not the only one.
//
// IDS. Every element gets data-sx="eN" when it has none (or a duplicate), so the canvas, the inspector, comments and
// the model all name the same element. An element the model keeps, keeps its id.

export type Parse = (html: string) => Document;

const DROP = 'script, iframe, frame, frameset, object, embed, applet, portal, base, meta, link, noscript, template';
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'background', 'data'];
const NO_ID = new Set(['style', 'br', 'wbr', 'defs', 'stop', 'title', 'desc', 'metadata', 'lineargradient', 'radialgradient', 'clippath', 'mask', 'pattern', 'filter', 'symbol', 'marker']);
const MAX_IDS = 2000;

const bodyOf = (parse: Parse, html: string): HTMLElement => {
  const d = parse(`<!doctype html><html><head></head><body>${html}</body></html>`);
  return d.body;
};

/** The fragment cleaned (see the head of this file) and every element given an id. */
export function prepareFragment(html: string, parse: Parse): string {
  let src = html ?? '';
  // a whole document: its head's styles and its body
  if (/<html[\s>]|<body[\s>]|<head[\s>]/i.test(src)) {
    const d = parse(src);
    const styles = Array.from(d.head?.querySelectorAll('style') ?? [])
      .map((s) => s.outerHTML)
      .join('\n');
    src = `${styles}\n${d.body?.innerHTML ?? ''}`;
  }
  const body = bodyOf(parse, src);
  for (const el of Array.from(body.querySelectorAll(DROP))) el.remove();
  for (const el of Array.from(body.querySelectorAll('form'))) {
    el.removeAttribute('action');
    el.removeAttribute('method');
  }
  const all = Array.from(body.querySelectorAll('*'));
  for (const el of all) {
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on')) el.removeAttribute(a.name);
      else if (URL_ATTRS.includes(n) && /^\s*(javascript|vbscript|data:text\/html)/i.test(a.value)) el.removeAttribute(a.name);
      else if (n === 'style' && /expression\(|javascript:/i.test(a.value)) el.removeAttribute(a.name);
    }
  }
  for (const s of Array.from(body.querySelectorAll('style'))) s.textContent = (s.textContent ?? '').replace(/@import[^;]*;?/gi, '').replace(/javascript:/gi, '');
  giveIds(body);
  return body.innerHTML.trim();
}

function insideNoId(el: Element): boolean {
  for (let p: Element | null = el.parentElement; p; p = p.parentElement) if (NO_ID.has(p.tagName.toLowerCase())) return true;
  return false;
}

function giveIds(root: Element): void {
  const els = Array.from(root.querySelectorAll('*')).filter((el) => !NO_ID.has(el.tagName.toLowerCase()) && !insideNoId(el));
  const seen = new Set<string>();
  let max = 0;
  for (const el of els) {
    const v = el.getAttribute('data-sx');
    const m = v ? /^e(\d{1,6})$/.exec(v) : null;
    if (m && !seen.has(v!)) {
      seen.add(v!);
      max = Math.max(max, Number(m[1]));
    } else if (v) el.removeAttribute('data-sx');
  }
  let given = 0;
  for (const el of els) {
    if (el.hasAttribute('data-sx')) continue;
    if (seen.size + given >= MAX_IDS) break;
    el.setAttribute('data-sx', `e${++max}`);
    given++;
  }
}

const find = (body: HTMLElement, id: string): HTMLElement | null => (/^e\d{1,6}$/.test(id) ? (body.querySelector(`[data-sx="${id}"]`) as HTMLElement | null) : null);

export interface ElementFacts {
  id: string;
  tag: string;
  text: string;
  classes: string;
  style: string;
}

/** What an element is, read from the fragment (the canvas adds what it measures). */
export function elementFacts(html: string, id: string, parse: Parse): ElementFacts | null {
  const el = find(bodyOf(parse, html), id);
  if (!el) return null;
  return { id, tag: el.tagName.toLowerCase(), text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200), classes: el.getAttribute('class') ?? '', style: el.getAttribute('style') ?? '' };
}

/** A label for an element, for the person and the model: "the h1 “Rooms for Living”". */
export function labelOf(f: ElementFacts | null): string {
  if (!f) return 'the artboard';
  const what = f.tag === 'div' || f.tag === 'span' ? (f.classes.split(/\s+/)[0] || f.tag) : f.tag;
  return f.text ? `${what} “${f.text.slice(0, 50)}${f.text.length > 50 ? '…' : ''}”` : what;
}

export type HandEdit =
  | { op: 'style'; id: string; props: Record<string, string | null> }
  | { op: 'text'; id: string; text: string }
  | { op: 'move'; id: string; dx: number; dy: number }
  | { op: 'remove'; id: string }
  | { op: 'duplicate'; id: string }
  | { op: 'order'; id: string; to: 'front' | 'back' };

const CSS_PROP = /^-?[a-z][a-z-]{0,40}$/;
const CSS_VALUE_BAD = /[<>{};]|expression\(|javascript:|url\(\s*['"]?\s*(?!data:|asset:)/i;

const px = (v: string | null | undefined): number => {
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec((v ?? '').trim());
  return m ? Number(m[1]) : 0;
};

/** An edit made by hand on the canvas, applied to the fragment; null when it cannot be (the element is gone). */
export function applyHandEdit(html: string, e: HandEdit, parse: Parse): string | null {
  const body = bodyOf(parse, html);
  const el = find(body, e.id);
  if (!el) return null;
  switch (e.op) {
    case 'style':
      for (const [k, v] of Object.entries(e.props)) {
        if (!CSS_PROP.test(k)) continue;
        if (v == null || v === '') el.style.removeProperty(k);
        else if (!CSS_VALUE_BAD.test(v)) el.style.setProperty(k, v.slice(0, 300));
      }
      if (!el.getAttribute('style')) el.removeAttribute('style');
      break;
    case 'text': {
      const doc = el.ownerDocument;
      const lines = e.text.slice(0, 5000).split('\n');
      // the element's own runs of text are replaced; an element holding other elements keeps them
      const onlyText = Array.from(el.childNodes).every((n) => n.nodeType === 3 || (n.nodeType === 1 && /^(br|span|em|strong|b|i)$/i.test((n as Element).tagName) && !(n as Element).querySelector('*')));
      if (!onlyText) {
        const t = Array.from(el.childNodes).find((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
        if (t) t.textContent = e.text.slice(0, 5000);
        else return null;
        break;
      }
      el.textContent = '';
      lines.forEach((l, i) => {
        if (i) el.appendChild(doc.createElement('br'));
        el.appendChild(doc.createTextNode(l));
      });
      break;
    }
    case 'move': {
      const [x, y] = (el.style.getPropertyValue('translate') || '0px 0px').split(/\s+/);
      const nx = Math.round((px(x) + e.dx) * 10) / 10;
      const ny = Math.round((px(y ?? '0px') + e.dy) * 10) / 10;
      if (nx === 0 && ny === 0) el.style.removeProperty('translate');
      else el.style.setProperty('translate', `${nx}px ${ny}px`);
      if (!el.getAttribute('style')) el.removeAttribute('style');
      break;
    }
    case 'remove':
      el.remove();
      break;
    case 'duplicate': {
      const c = el.cloneNode(true) as HTMLElement;
      c.removeAttribute('data-sx');
      for (const k of Array.from(c.querySelectorAll('[data-sx]'))) k.removeAttribute('data-sx');
      const [x, y] = (el.style.getPropertyValue('translate') || '0px 0px').split(/\s+/);
      c.style.setProperty('translate', `${px(x) + 24}px ${px(y ?? '0px') + 24}px`);
      el.after(c);
      break;
    }
    case 'order': {
      const parent = el.parentElement;
      if (!parent) return null;
      if (e.to === 'front') parent.appendChild(el);
      else {
        // behind its siblings, but after any <style> so the styles still come first
        const firstNonStyle = Array.from(parent.children).find((c) => c.tagName.toLowerCase() !== 'style' && c !== el);
        parent.insertBefore(el, firstNonStyle ?? null);
      }
      break;
    }
  }
  giveIds(body);
  return body.innerHTML.trim();
}

/** The faces a fragment and the shared CSS name, as written in font-family declarations. */
export function facesNamed(...css: string[]): string[] {
  const out = new Set<string>();
  for (const s of css) {
    for (const m of s.matchAll(/font-family\s*:\s*([^;}"]+(?:"[^"]*"[^;}"]*)*)/gi)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().replace(/^['"]|['"]$/g, '').replace(/\s*!important$/, '').trim();
        if (name && !/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit|initial|unset|var\()/i.test(name)) out.add(name);
      }
    }
    for (const m of s.matchAll(/font\s*:[^;}]*?(?:\d+(?:px|pt|em|rem|%)\S*)\s+([^;}]+)/gi)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().replace(/^['"]|['"]$/g, '').trim();
        if (name && !/^(serif|sans-serif|monospace|var\()/i.test(name)) out.add(name);
      }
    }
  }
  return [...out].slice(0, 12);
}

/** The words on an artboard, in order (for the model's summary of artboards it is not editing, and for search). */
export function wordsOf(html: string, parse: Parse, max = 400): string {
  const body = bodyOf(parse, html);
  for (const s of Array.from(body.querySelectorAll('style, svg defs'))) s.remove();
  return (body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}
