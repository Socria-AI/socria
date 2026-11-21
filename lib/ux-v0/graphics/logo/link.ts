// lib/ux-v0/graphics/logo/link.ts — an approved logo used across a board's materials as linked instances: where a
// material sets the brand's name as text (role "logo"), the approved mark is placed instead, fitted to the same box (a
// horizontal lockup in a wide place, the symbol or a stacked lockup in a square one), in the version that reads on
// that ground. Each instance records which logo it is (link) and a hash of what was drawn (linkHash). When the
// approved logo changes, every instance still as drawn is rebuilt; one the person has edited (its content no longer
// matches its hash) is kept as a local override and said, never overwritten.

import { contrastRatio } from '../../../ux/audit';
import type { Artboard, GraphicDoc, GroupNode, Node, TextNode } from '../doc';
import { hash32 } from '../styles/hash';
import { readLogoBrief } from './brief';
import { coloursFor, fitLockup } from './build';
import type { LockupKind, LogoConcept } from './concepts';
import { conceptFrom } from './rebuild';
import type { ConceptRecord } from './record';

/** The logo a system's record holds, rebuilt (null when the system has only a typed name). */
export function conceptOfMark(mark: { concept: ConceptRecord; name: string } | undefined | null): LogoConcept | null {
  if (!mark) return null;
  const brief = readLogoBrief(mark.name, { name: mark.name });
  return conceptFrom({ ...mark.concept, wordmark: { ...mark.concept.wordmark, text: mark.name } }, brief);
}

/** A hash of what an instance draws (its geometry and colours, not its ids or position on the artboard). */
export function contentHash(n: Node): string {
  const strip = (k: string, v: unknown) => (k === 'id' || k === 'link' || k === 'linkHash' || k === 'name' ? undefined : typeof v === 'number' ? Math.round(v * 10) / 10 : v);
  const g = n as GroupNode;
  return (hash32(JSON.stringify({ w: Math.round(n.w), h: Math.round(n.h), children: g.children ?? [] }, strip)) >>> 0).toString(36);
}

const lockupFor = (w: number, h: number, c: LogoConcept): LockupKind => (w / Math.max(1, h) > 2.2 ? (c.mark ? 'horizontal' : 'wordmark') : c.mark ? (h > 140 ? 'stacked' : 'symbol') : 'wordmark');

function schemeOn(c: LogoConcept, ground: string): 'full' | 'white' | 'black' {
  if (contrastRatio(c.palette.primary, ground) >= 3 && contrastRatio(c.palette.ink, ground) >= 4.5) return 'full';
  return contrastRatio('#ffffff', ground) >= contrastRatio('#111111', ground) ? 'white' : 'black';
}

/** One linked instance of the logo fitted to a box on an artboard. */
export function instanceFor(c: LogoConcept, box: { x: number; y: number; w: number; h: number }, ground: string, id: string): GroupNode {
  const kind = lockupFor(box.w, box.h, c);
  const g = fitLockup(c, kind, box, coloursFor(c, schemeOn(c, ground), null));
  const node: GroupNode = { ...g, id, name: `${c.wordmark.text} logo (linked)`, link: `logo:${c.id}` };
  return { ...node, linkHash: contentHash(node) };
}

const groundOf = (b: Artboard) => (typeof b.background === 'string' ? b.background : '#ffffff');

/** The brand's typed name replaced by linked instances of the approved logo (see the head of this file). */
export function placeLogo(doc: GraphicDoc, c: LogoConcept): { doc: GraphicDoc; placed: number } {
  let placed = 0;
  const name = c.wordmark.text.trim().toLowerCase();
  const artboards = doc.artboards.map((b) => {
    const children = b.children.map((n): Node => {
      if (n.type !== 'text' || n.role !== 'logo' || n.decorative) return n;
      const t = n as TextNode;
      if (t.text.trim().toLowerCase() !== name || t.rotation || t.path) return n;
      placed++;
      const box = { x: t.x, y: t.y, w: t.w, h: Math.max(t.h, t.size * 1.2) };
      return instanceFor(c, box, groundOf(b), `${t.id}L`);
    });
    return { ...b, children };
  });
  return { doc: placed ? { ...doc, artboards, revision: doc.revision + 1 } : doc, placed };
}

/** Every linked instance rebuilt for a new logo, unless it was edited (then kept, and said). */
export function relinkLogo(doc: GraphicDoc, c: LogoConcept): { doc: GraphicDoc; updated: number; kept: string[] } {
  let updated = 0;
  const kept: string[] = [];
  const walk = (nodes: Node[], ground: string): Node[] =>
    nodes.map((n) => {
      if (n.link?.startsWith('logo:')) {
        if (n.linkHash && contentHash(n) !== n.linkHash) {
          kept.push(`${n.name ?? 'A logo'} was edited in this material: kept as a local override`);
          return n;
        }
        if (n.link === `logo:${c.id}`) return n;
        updated++;
        const fresh = instanceFor(c, { x: n.x, y: n.y, w: n.w, h: n.h }, ground, n.id);
        return fresh;
      }
      return n.type === 'group' ? { ...n, children: walk(n.children, ground) } : n;
    });
  const artboards = doc.artboards.map((b) => ({ ...b, children: walk(b.children, groundOf(b)) }));
  return { doc: updated ? { ...doc, artboards, revision: doc.revision + 1 } : doc, updated, kept };
}

/** Whether a node sits inside a linked logo instance (its colours are the logo's, not the system's tokens). */
export function insideLinkedLogo(board: Artboard, id: string): boolean {
  const seek = (nodes: Node[], inLogo: boolean): boolean => nodes.some((n) => (n.id === id ? inLogo : n.type === 'group' ? seek(n.children, inLogo || !!n.link) : false));
  return seek(board.children, false);
}
