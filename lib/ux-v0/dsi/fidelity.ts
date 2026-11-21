// lib/ux-v0/dsi/fidelity.ts — how faithful a design is to its design system, checked in code.
//
// Identity is what is checked, never composition: the colours a design uses against the system's palette, its faces
// against the system's faces (as SocriaUX draws them), the approved logo (present where the brand is named, at its own
// proportions, not cropped, filtered or recoloured, above its minimum size, with its clear space), and every hard rule
// the system states that can be checked (headline case, no gradients, contrast, how many accents). Soft preferences
// that are not met are said as notes, not counted as failures. Each finding names what it is about and why.

import { contrastRatio } from '../../ux/audit';
import type { Artboard, GraphicDoc, ImageNode, Node, TextNode } from '../graphics/doc';
import { walk } from '../graphics/doc';
import { backdropAt, clearSpaceIntruders } from '../graphics/brandguard';
import { productPalette, brandLogo, type AdaptOpts } from './adapters';
import { assetDocId } from './assets';
import { hexOf, rgbDistance } from './colour';
import { bindingRules } from './intelligence';
import { resolveAll } from './tokens';
import type { RuleCheck, SystemContent } from './schema';

export interface FidelityFinding {
  severity: 'high' | 'medium' | 'low';
  rule: string;
  message: string;
  nodes: string[];
}

export interface Fidelity {
  score: number;
  findings: FidelityFinding[];
  checks: { name: string; passed: boolean; detail: string }[];
}

/** Every colour the system holds (all tokens, every mode) and the colours its products derive. */
export function systemPalette(c: SystemContent, opts: AdaptOpts = {}): string[] {
  const out = new Set<string>();
  for (const mode of c.modes) for (const r of resolveAll(c, { mode }).values()) if (r.ok && r.type === 'color') {
    const h = hexOf(r.value);
    if (h) out.add(h);
  }
  const pal = productPalette(c, opts);
  Object.values(pal.colors).forEach((h) => out.add(h.toLowerCase()));
  if (pal.accent2) out.add(pal.accent2.toLowerCase());
  return [...out];
}

const near = (hex: string, palette: readonly string[], tol = 10) => palette.some((p) => rgbDistance(p, hex) <= tol);
const isNeutral = (hex: string) => {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) < 16;
};

/** Colours a node paints with (not inside a linked logo, whose colours are the logo's own). */
function paints(n: Node): { prop: string; hex: string }[] {
  const out: { prop: string; hex: string }[] = [];
  const any = n as unknown as Record<string, unknown>;
  if (n.type === 'text' || n.type === 'chart') {
    const h = hexOf((n as TextNode).color);
    if (h) out.push({ prop: 'color', hex: h });
  }
  // a run of words in its own colour is a paint like any other
  if (n.type === 'text') for (const r of (n as TextNode).runs ?? []) {
    const h = r.color ? hexOf(r.color) : null;
    if (h) out.push({ prop: 'run', hex: h });
  }
  if (n.type === 'shape') {
    const h = typeof any.fill === 'string' ? hexOf(any.fill) : null;
    if (h) out.push({ prop: 'fill', hex: h });
    const st = any.stroke as { color?: string } | undefined;
    const s = st?.color ? hexOf(st.color) : null;
    if (s) out.push({ prop: 'stroke', hex: s });
  }
  return out;
}

const hasGradient = (n: Node) => {
  const any = n as unknown as Record<string, unknown>;
  const f = any.fill as unknown;
  return !!f && typeof f === 'object' && /gradient|linear|radial/i.test(JSON.stringify(f).slice(0, 80));
};

/** A graphic document's fidelity to a system (see the head of this file). */
export function fidelityOfDoc(doc: GraphicDoc, c: SystemContent, opts: AdaptOpts = {}): Fidelity {
  const findings: FidelityFinding[] = [];
  const checks: Fidelity['checks'] = [];
  const palette = systemPalette(c, opts);
  const pal = productPalette(c, opts);
  const faces = new Set([pal.fonts.display, pal.fonts.body, pal.fonts.mono].filter(Boolean).map((f) => String(f).toLowerCase()));
  const rules = bindingRules(c);
  const hard = (k: RuleCheck['kind']) => rules.hard.find((i) => i.check?.kind === k);
  const soft = (k: RuleCheck['kind']) => rules.soft.find((i) => i.check?.kind === k);
  const offColours = new Map<string, string[]>();
  const offFaces = new Map<string, string[]>();
  const accents = new Set<string>();
  let gradients: string[] = [];
  let caseOff: string[] = [];
  const caseRule = (hard('headline-case') ?? soft('headline-case'))?.check as Extract<RuleCheck, { kind: 'headline-case' }> | undefined;
  const lowContrast: string[] = [];
  const minContrast = ((hard('min-contrast') ?? soft('min-contrast'))?.check as Extract<RuleCheck, { kind: 'min-contrast' }> | undefined)?.ratio ?? 4.5;
  const logoNodes: { node: ImageNode; board: Artboard }[] = [];
  const namedAsText: string[] = [];
  const name = c.identity.name.trim().toLowerCase();
  for (const b of doc.artboards) {
    const ground = typeof b.background === 'string' ? hexOf(b.background) : null;
    if (ground && !near(ground, palette)) offColours.set(ground, [...(offColours.get(ground) ?? []), `${b.name} background`]);
    const inLogo = new Set<string>();
    for (const l of walk(b)) {
      const n = l.node;
      if (n.type === 'group' && n.link) for (const x of walk({ ...b, children: n.children } as Artboard)) inLogo.add(x.node.id);
    }
    for (const l of walk(b)) {
      const n = l.node;
      if (n.link?.startsWith('brand:') && n.type === 'image') logoNodes.push({ node: n as ImageNode, board: b });
      if (n.link || inLogo.has(n.id) || n.decorative) continue;
      for (const p of paints(n)) {
        if (!near(p.hex, palette)) offColours.set(p.hex, [...(offColours.get(p.hex) ?? []), n.name ?? n.id]);
        else if (!isNeutral(p.hex)) accents.add(palette.find((x) => rgbDistance(x, p.hex) <= 10)!);
      }
      if (hasGradient(n)) gradients.push(n.name ?? n.id);
      if (n.type === 'text') {
        const t = n as TextNode;
        if (!faces.has(t.font.toLowerCase())) offFaces.set(t.font, [...(offFaces.get(t.font) ?? []), t.name ?? t.id]);
        if (caseRule && (t.role === 'headline' || t.role === 'subhead')) {
          const actual = t.case === 'upper' ? 'upper' : t.case === 'lower' ? 'lower' : 'sentence';
          const isUpperText = t.text === t.text.toUpperCase() && /[A-Z]/.test(t.text);
          const effective = actual === 'sentence' && isUpperText ? 'upper' : actual;
          if (effective !== caseRule.case) caseOff.push(t.name ?? t.id);
        }
        if (ground && t.role !== 'logo') {
          // the words' colour and every coloured run in them, on what is really under them
          const cols = [hexOf(t.color), ...(t.runs ?? []).map((r) => (r.color ? hexOf(r.color) : null))].filter((x): x is string => !!x);
          const under = b.children.some((x) => x.id === t.id) ? backdropAt(b, t) : ground;
          if (cols.some((col) => contrastRatio(col, under) < (t.size >= 24 ? 3 : minContrast))) lowContrast.push(t.name ?? t.id);
        }
        if (name && t.role === 'logo' && t.text.trim().toLowerCase() === name) namedAsText.push(t.name ?? t.id);
      }
    }
  }
  const paletteOnly = hard('palette-only');
  checks.push({ name: 'Palette', passed: offColours.size === 0, detail: offColours.size ? `${offColours.size} colour${offColours.size === 1 ? '' : 's'} outside the system` : 'every colour is the system’s' });
  for (const [hex, where] of offColours) findings.push({ severity: paletteOnly ? 'high' : 'medium', rule: 'palette', message: `${hex} is not in ${c.identity.name}${paletteOnly ? ' (the system allows its palette only)' : ''}: ${where.slice(0, 3).join(', ')}`, nodes: where.slice(0, 12) });
  checks.push({ name: 'Faces', passed: offFaces.size === 0, detail: offFaces.size ? `${[...offFaces.keys()].join(', ')} not the system’s` : `set in ${[...faces].join(' and ')}` });
  for (const [f, where] of offFaces) findings.push({ severity: hard('fonts-only') ? 'high' : 'medium', rule: 'faces', message: `${f} is not one of ${c.identity.name}’s faces: ${where.slice(0, 3).join(', ')}`, nodes: where.slice(0, 12) });
  if (caseRule) {
    checks.push({ name: 'Headline case', passed: !caseOff.length, detail: caseOff.length ? `${caseOff.length} headline${caseOff.length === 1 ? '' : 's'} not in ${caseRule.case} case` : `${caseRule.case} case` });
    if (caseOff.length) findings.push({ severity: hard('headline-case') ? 'high' : 'low', rule: 'headline-case', message: `Headlines should be in ${caseRule.case} case: ${caseOff.slice(0, 3).join(', ')}`, nodes: caseOff });
  }
  if (hard('no-gradients') || soft('no-gradients')) {
    checks.push({ name: 'No gradients', passed: !gradients.length, detail: gradients.length ? `${gradients.length} gradient fill${gradients.length === 1 ? '' : 's'}` : 'none used' });
    if (gradients.length) findings.push({ severity: hard('no-gradients') ? 'high' : 'low', rule: 'no-gradients', message: `${c.identity.name} does not use gradients: ${gradients.slice(0, 3).join(', ')}`, nodes: gradients });
  }
  const maxAccents = ((hard('max-accents') ?? soft('max-accents'))?.check as Extract<RuleCheck, { kind: 'max-accents' }> | undefined)?.n;
  if (maxAccents) {
    const chromatic = [...accents].filter((h) => !isNeutral(h) && h !== pal.colors.background && h !== pal.colors.text);
    checks.push({ name: 'Accents', passed: chromatic.length <= maxAccents + 1, detail: `${chromatic.length} chromatic colour${chromatic.length === 1 ? '' : 's'} used` });
    if (chromatic.length > maxAccents + 1) findings.push({ severity: hard('max-accents') ? 'medium' : 'low', rule: 'max-accents', message: `More accent colours than ${c.identity.name} allows (${chromatic.join(', ')})`, nodes: [] });
  }
  checks.push({ name: 'Contrast', passed: !lowContrast.length, detail: lowContrast.length ? `${lowContrast.length} text${lowContrast.length === 1 ? '' : 's'} below ${minContrast}:1` : `all text at ${minContrast}:1 or more` });
  if (lowContrast.length) findings.push({ severity: 'high', rule: 'contrast', message: `Text below ${minContrast}:1 on its ground: ${lowContrast.slice(0, 3).join(', ')}`, nodes: lowContrast });
  // the approved logo
  const logo = brandLogo(c);
  if (logo) {
    const id = assetDocId(logo);
    const minPx = ((hard('logo-min-size') ?? soft('logo-min-size'))?.check as Extract<RuleCheck, { kind: 'logo-min-size' }> | undefined)?.px;
    const clear = ((hard('logo-clear-space') ?? soft('logo-clear-space'))?.check as Extract<RuleCheck, { kind: 'logo-clear-space' }> | undefined)?.ratio;
    const issues: string[] = [];
    for (const { node: n, board } of logoNodes) {
      const a = doc.assets.find((x) => x.id === n.asset);
      if (!a) {
        issues.push(`${n.name ?? n.id}: its picture is missing`);
        continue;
      }
      if (!n.asset.startsWith('bs') || (n.asset !== id && !c.assets.some((x) => x.approved && assetDocId(x) === n.asset))) issues.push(`${n.name ?? n.id}: not an approved logo file`);
      const ratio = n.w / Math.max(1, n.h);
      const own = a.width / Math.max(1, a.height);
      if (Math.abs(ratio - own) / own > 0.03) issues.push(`${n.name ?? n.id}: stretched out of its proportions`);
      if (n.crop || n.filter || n.adjust || n.mask) issues.push(`${n.name ?? n.id}: cropped, masked or filtered`);
      if (n.opacity < 1 || n.rotation) issues.push(`${n.name ?? n.id}: faded or rotated`);
      if (minPx && n.w < minPx) issues.push(`${n.name ?? n.id}: ${Math.round(n.w)}px wide, below the ${minPx}px minimum`);
      if (clear) {
        const intruder = clearSpaceIntruders(board, n, clear)[0];
        if (intruder) issues.push(`${n.name ?? n.id}: ${intruder.name ?? intruder.id} sits inside its clear space`);
      }
    }
    checks.push({ name: 'Logo', passed: !issues.length && !namedAsText.length, detail: logoNodes.length ? (issues.length ? issues[0] : `${logoNodes.length} approved logo${logoNodes.length === 1 ? '' : 's'}, unaltered`) : namedAsText.length ? 'the brand named in text, not the approved logo' : 'no logo in this design' });
    for (const i of issues) findings.push({ severity: 'high', rule: 'logo', message: i, nodes: [] });
    if (namedAsText.length) findings.push({ severity: 'medium', rule: 'logo', message: `The brand is set as text where its approved logo belongs: ${namedAsText.slice(0, 2).join(', ')}`, nodes: namedAsText });
  }
  const penalty = findings.reduce((s, f) => s + (f.severity === 'high' ? 14 : f.severity === 'medium' ? 6 : 2), 0);
  return { score: Math.max(0, 100 - penalty), findings, checks };
}

/** A website design's fidelity: its token slots against the system's (through the website pipeline's own check). */
export function fidelityOfTokens(tokens: { colors: Record<string, string>; fonts: { display: string; body: string } }, c: SystemContent, opts: AdaptOpts = {}): Fidelity {
  const palette = systemPalette(c, opts);
  const pal = productPalette(c, opts);
  const findings: FidelityFinding[] = [];
  for (const [k, v] of Object.entries(tokens.colors)) if (!near(v, palette) && !['muted', 'line', 'surface', 'accentText'].includes(k)) findings.push({ severity: 'medium', rule: 'palette', message: `${k} ${v} is not in ${c.identity.name}`, nodes: [] });
  for (const f of [tokens.fonts.display, tokens.fonts.body]) if (![pal.fonts.display, pal.fonts.body].includes(f)) findings.push({ severity: 'medium', rule: 'faces', message: `${f} is not one of ${c.identity.name}’s faces`, nodes: [] });
  const checks = [
    { name: 'Palette', passed: !findings.some((f) => f.rule === 'palette'), detail: 'the design’s colour slots' },
    { name: 'Faces', passed: !findings.some((f) => f.rule === 'faces'), detail: `${tokens.fonts.display} / ${tokens.fonts.body}` },
  ];
  return { score: Math.max(0, 100 - findings.length * 8), findings, checks };
}
