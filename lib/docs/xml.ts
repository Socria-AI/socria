// lib/docs/xml.ts — a small, forgiving XML reader for the inside of Office files.
//
// Word's equations (OMML), its tables and its styles are trees, and reading
// them as a flat run of tags loses what makes them what they are: a fraction's
// numerator from its denominator, a merged cell from an empty one. This reads
// XML into a tree of { name, attrs, children } and text — no DTDs, no
// namespaces resolved (prefixes are kept as written: "w:p", "m:f"), nothing
// fetched. Malformed input yields what could be read, never an exception.
//
// PURE.

export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: (XNode | string)[];
}

export function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const safeChar = (cp: number) => (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '');

/** XML text into a tree. The root is a synthetic node named "#root". */
export function parseXml(xml: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, children: [] };
  const stack: XNode[] = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.\-]*)((?:\s+[\w:.\-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) {
      top.children.push(m[1]);
      continue;
    }
    if (m[6] !== undefined) {
      if (m[6].trim() || top.name.endsWith(':t') || top.name === 't' || top.name.endsWith(':delText') || top.name.endsWith(':instrText')) top.children.push(decodeEntities(m[6]));
      continue;
    }
    const [, , close, name, attrText, self] = m;
    if (!name) continue;
    if (close) {
      // close the nearest open element of that name; anything left open inside it closes with it
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const attrs: Record<string, string> = {};
    if (attrText) {
      for (const a of attrText.matchAll(/([\w:.\-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? '');
    }
    const node: XNode = { name, attrs, children: [] };
    top.children.push(node);
    if (!self) stack.push(node);
  }
  return root;
}

export const isNode = (c: XNode | string): c is XNode => typeof c !== 'string';

/** Direct children with a name. */
export function kids(n: XNode | undefined, name?: string): XNode[] {
  if (!n) return [];
  return n.children.filter((c): c is XNode => isNode(c) && (name === undefined || c.name === name));
}

/** The first direct child with a name. */
export const kid = (n: XNode | undefined, name: string): XNode | undefined => kids(n, name)[0];

/** Every descendant with a name, in document order. */
export function find(n: XNode | undefined, name: string, out: XNode[] = []): XNode[] {
  if (!n) return out;
  for (const c of n.children) {
    if (!isNode(c)) continue;
    if (c.name === name) out.push(c);
    find(c, name, out);
  }
  return out;
}

/** The first descendant with a name. */
export function first(n: XNode | undefined, name: string): XNode | undefined {
  if (!n) return undefined;
  for (const c of n.children) {
    if (!isNode(c)) continue;
    if (c.name === name) return c;
    const f = first(c, name);
    if (f) return f;
  }
  return undefined;
}

/** All text under a node, in order. */
export function textOf(n: XNode | string | undefined): string {
  if (n === undefined) return '';
  if (!isNode(n)) return n;
  return n.children.map(textOf).join('');
}

/** An attribute by its local name, whatever its prefix ("w:val" or "val"). */
export function attr(n: XNode | undefined, local: string): string | undefined {
  if (!n) return undefined;
  if (local in n.attrs) return n.attrs[local];
  for (const [k, v] of Object.entries(n.attrs)) if (k.endsWith(`:${local}`)) return v;
  return undefined;
}

/**
 * A relationship id (r:id) — an element may carry a plain id too (a slide's
 * <p:sldId id="256" r:id="rId2"/>), and only the relationship's will do.
 */
export function relId(n: XNode | undefined): string | undefined {
  if (!n) return undefined;
  if ('r:id' in n.attrs) return n.attrs['r:id'];
  for (const [k, v] of Object.entries(n.attrs)) if (k.endsWith(':id')) return v;
  return undefined;
}
