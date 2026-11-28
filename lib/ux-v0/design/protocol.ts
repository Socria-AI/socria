// lib/ux-v0/design/protocol.ts — how the model answers, read as it is written.
//
// The model writes the design itself, so its answer is not JSON (HTML inside JSON strings is escaped, slower to write
// and easy to break). It is a handful of plain tags around real HTML and CSS:
//
//   <say>One or two sentences to the person.</say>
//   <artboard id="new-1" name="Poster" format="a3" group="directions" beside="ab123"> …HTML… </artboard>
//   <artboard id="ab123"> …the whole artboard again… </artboard>          (a rewrite of one that exists)
//   <edit artboard="ab123"><find>exact text</find><replace>new text</replace></edit>
//   <remove artboard="ab123"/>
//   <tokens> …CSS shared by every artboard… </tokens>
//   <remember>a decision that should hold from now on</remember>
//   <question>What to ask<option>One</option><option>Another</option></question>
//   <ok/>                                                                    (a look that found nothing to fix)
//   <lock artboard="ab123" element="e12">the headline</lock>                  (the person said to keep it as it is)
//   <keep what="typography" artboard="ab123"/>   <keep what="colours" artboard="ab123"/>
//   <finding kind="communication" artboard="ab123" element="e12">what is happening<fix>what would address it</fix></finding>
//
// The parser reads the whole text so far every time it is called: while the answer streams, an artboard that is still
// being written comes back as `open`, with what it has so far, so the canvas can draw it as it grows. Nothing here
// trusts what it reads: lib/ux-v0/design/apply.ts decides what each block may do.

export interface ArtboardBlock {
  kind: 'artboard';
  id: string;
  name: string;
  format: string;
  width: number | null;
  height: number | null;
  group: string | null;
  beside: string | null;
  /** it moves: the length of its animation in seconds (seconds="6") */
  seconds: number | null;
  html: string;
  /** still being written */
  open: boolean;
}
export interface EditBlock {
  kind: 'edit';
  artboard: string;
  pairs: { find: string; replace: string }[];
  open: boolean;
}
export type Block =
  | ArtboardBlock
  | EditBlock
  | { kind: 'remove'; artboard: string }
  | { kind: 'tokens'; css: string; open: boolean }
  | { kind: 'remember'; text: string }
  | { kind: 'question'; text: string; options: string[] }
  | { kind: 'lock'; artboard: string; element: string; what: string }
  | { kind: 'keep'; what: 'faces' | 'colours'; artboard: string }
  | { kind: 'finding'; type: string; artboard: string; element: string | null; text: string; fix: string };

export interface Answer {
  say: string;
  blocks: Block[];
  /** the look found nothing to fix */
  ok: boolean;
  /** the text ended inside a block (still streaming, or cut off) */
  open: boolean;
}

const TAGS = ['say', 'artboard', 'edit', 'remove', 'tokens', 'remember', 'question', 'ok', 'lock', 'keep', 'finding'] as const;
type Tag = (typeof TAGS)[number];
const OPEN_RE = new RegExp(`<(${TAGS.join('|')})\\b([^>]*?)(/?)>`, 'gi');

const attrsOf = (s: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = (m[2] ?? m[3] ?? '').slice(0, 200);
  return out;
};
const int = (v: string | undefined) => {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const clean = (s: string) => s.replace(/^\s*```[a-z]*\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');
const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

function readEdit(inner: string, closed: boolean): { pairs: { find: string; replace: string }[]; open: boolean } {
  const pairs: { find: string; replace: string }[] = [];
  const re = /<find>([\s\S]*?)<\/find>\s*<replace>([\s\S]*?)<\/replace>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) pairs.push({ find: m[1], replace: m[2] });
  return { pairs, open: !closed };
}

/** The answer as far as it has been written (see the head of this file). */
export function parseAnswer(raw: string): Answer {
  const src = clean(raw ?? '');
  const blocks: Block[] = [];
  let say = '';
  let ok = false;
  let open = false;
  let at = 0;
  OPEN_RE.lastIndex = 0;
  for (;;) {
    OPEN_RE.lastIndex = at;
    const m = OPEN_RE.exec(src);
    if (!m) break;
    const tag = m[1].toLowerCase() as Tag;
    const a = attrsOf(m[2]);
    const selfClosing = m[3] === '/';
    const start = m.index + m[0].length;
    if (tag === 'ok') {
      ok = true;
      at = start;
      continue;
    }
    if (tag === 'remove') {
      if (a.artboard) blocks.push({ kind: 'remove', artboard: a.artboard });
      // tolerate <remove artboard="x"></remove>
      const close = src.indexOf('</remove>', start);
      at = !selfClosing && close >= 0 && close - start < 40 ? close + 9 : start;
      continue;
    }
    if (tag === 'keep') {
      const what = /typ|font|face|letter/i.test(a.what ?? '') ? 'faces' : /colou?r|palette/i.test(a.what ?? '') ? 'colours' : null;
      if (what && a.artboard) blocks.push({ kind: 'keep', what, artboard: a.artboard });
      const close = src.indexOf('</keep>', start);
      at = !selfClosing && close >= 0 && close - start < 40 ? close + 7 : start;
      continue;
    }
    if (selfClosing) {
      at = start;
      continue;
    }
    const closeTag = `</${tag}>`;
    const close = src.toLowerCase().indexOf(closeTag, start);
    const closed = close >= 0;
    const inner = closed ? src.slice(start, close) : src.slice(start);
    if (!closed) open = true;
    switch (tag) {
      case 'say':
        say = (say ? `${say}\n` : '') + text(inner);
        break;
      case 'artboard':
        blocks.push({
          kind: 'artboard',
          id: a.id || 'new',
          name: a.name || '',
          format: a.format || '',
          width: int(a.width),
          height: int(a.height),
          group: a.group || null,
          beside: a.beside || null,
          seconds: a.seconds && Number.isFinite(parseFloat(a.seconds)) && parseFloat(a.seconds) >= 0.5 ? Math.min(60, parseFloat(a.seconds)) : null,
          html: inner.trim(),
          open: !closed,
        });
        break;
      case 'edit': {
        const e = readEdit(inner, closed);
        blocks.push({ kind: 'edit', artboard: a.artboard || '', pairs: e.pairs, open: e.open });
        break;
      }
      case 'tokens':
        blocks.push({ kind: 'tokens', css: inner.trim(), open: !closed });
        break;
      case 'remember':
        if (closed && text(inner)) blocks.push({ kind: 'remember', text: text(inner).slice(0, 300) });
        break;
      case 'lock':
        if (closed && a.artboard && /^e\d{1,6}$/.test(a.element ?? '')) blocks.push({ kind: 'lock', artboard: a.artboard, element: a.element, what: text(inner).slice(0, 120) || 'an element' });
        break;
      case 'finding': {
        if (!closed) break;
        const fix = text(inner.match(/<fix>([\s\S]*?)<\/fix>/i)?.[1] ?? '').slice(0, 500);
        const said = text(inner.replace(/<fix>[\s\S]*?<\/fix>/gi, '')).slice(0, 700);
        if (said) blocks.push({ kind: 'finding', type: (a.kind ?? '').toLowerCase(), artboard: a.artboard ?? '', element: /^e\d{1,6}$/.test(a.element ?? '') ? a.element : null, text: said, fix });
        break;
      }
      case 'question': {
        if (!closed) break;
        const options = [...inner.matchAll(/<option>([\s\S]*?)<\/option>/gi)].map((x) => text(x[1]).slice(0, 120)).filter(Boolean).slice(0, 6);
        const q = text(inner.replace(/<option>[\s\S]*?<\/option>/gi, ''));
        if (q) blocks.push({ kind: 'question', text: q.slice(0, 600), options });
        break;
      }
    }
    if (!closed) break;
    at = close + closeTag.length;
  }
  // an answer with no tags at all is something said
  if (!blocks.length && !say && !ok && src.trim() && !/<(artboard|edit|say|finding)\b/i.test(src)) say = text(src).slice(0, 2000);
  return { say: say.slice(0, 4000), blocks, ok, open };
}
