// lib/ux-v0/dsi/project-extract.ts — a design system drawn out of work already made in SocriaUX: a website (its
// attached design system, or its approved direction and current design), a graphic (its tokens, its direction's type
// habits, its approved logo) or a board (its Master Design System, with its logo, constraints, motifs and imagery).
//
// What the designer approved there (an approved direction, an approved logo, a board's system) is carried as
// approved; values the project merely holds are imported with the project as their source. A logo concept SocriaUX
// generated and the designer approved becomes an approved, protected asset (its SVG drawn from the concept); one only
// selected stays unapproved.

import { svgFile } from '../graphics/export';
import { conceptOfMark } from '../graphics/logo/link';
import { logoDoc } from '../graphics/logo/build';
import { selectedConcept } from '../graphics/logo/rebuild';
import type { DesignProject } from '../types';
import { importAsset } from './assets';
import { finish, type ImportIssue, type ImportResult } from './import-json';
import { emptyContent, uid, type BrandAsset, type IntelItem, type IntelKind, type SourceRef, type SystemContent, type Token, type TokenType, type TokenValue } from './schema';

const ROLES = ['background', 'surface', 'text', 'muted', 'accent', 'accentText', 'line'] as const;

async function logoAsset(svg: string, name: string, approved: boolean, src: SourceRef): Promise<BrandAsset | null> {
  const r = await importAsset({ name: `${name} logo.svg`, bytes: new TextEncoder().encode(svg), mime: 'image/svg+xml' }, { kind: 'logo', role: 'primary', approved, source: src });
  return r.asset ? { ...r.asset, notes: [...r.asset.notes, approved ? 'Approved in SocriaUX' : 'Generated in SocriaUX; not approved'].slice(0, 8) } : null;
}

/** A design system from one SocriaUX project (see the head of this file). */
export async function extractFromProject(p: DesignProject, opts: { now?: number } = {}): Promise<ImportResult> {
  const now = opts.now ?? Date.now();
  const issues: ImportIssue[] = [];
  const notes = new Set<string>();
  const src: SourceRef = { kind: 'project', ref: p.name || 'SocriaUX project', property: p.id };
  const content: SystemContent = emptyContent(p.name || 'From a SocriaUX project');
  const put = (path: string, type: TokenType, value: TokenValue, status: Token['provenance']['status'] = 'imported', note?: string) => {
    if (content.tokens[path] || value === '' || value === undefined || value === null) return;
    content.tokens[path] = { path, type, value, provenance: { source: { ...src, property: `${p.id}:${path}` }, importedAt: now, original: value, status, confidence: 1, ...(note ? { note } : {}) } };
  };
  const intel = (kind: IntelKind, statement: string, status: IntelItem['status'] = 'approved', enforce: IntelItem['enforce'] = 'soft') => content.intelligence.push({ id: uid('px'), kind, statement, status, basis: 'explicit', evidence: [{ source: src, quote: statement.slice(0, 200) }], confidence: 1, enforce });
  const bindRoles = () => {
    for (const r of ROLES) if (content.tokens[`color.${r}`]) content.roles[r] = { path: `color.${r}`, status: 'confirmed', confidence: 1, why: `the ${r} of ${p.name || 'the project'}` };
    if (content.tokens['color.accent2']) content.roles.accent2 = { path: 'color.accent2', status: 'confirmed', confidence: 1, why: 'its second accent' };
    if (content.tokens['font.family.display']) content.roles.display = { path: 'font.family.display', status: 'confirmed', confidence: 1, why: 'its display face' };
    if (content.tokens['font.family.body']) content.roles.body = { path: 'font.family.body', status: 'confirmed', confidence: 1, why: 'its text face' };
  };
  if (p.medium === 'board' && p.board?.system) {
    const s = p.board.system;
    content.identity = { name: s.name, description: s.direction.concept ?? s.direction.language ?? '' };
    for (const r of ROLES) put(`color.${r}`, 'color', s.tokens.colors[r]);
    if (s.tokens.accent2) put('color.accent2', 'color', s.tokens.accent2);
    put('font.family.display', 'fontFamily', s.tokens.fonts.display);
    put('font.family.body', 'fontFamily', s.tokens.fonts.body);
    put('font.weight.display', 'fontWeight', s.weights.display);
    put('font.weight.body', 'fontWeight', s.weights.body);
    if (s.type.case === 'upper') intel('typography', 'Headlines are set in capitals', 'approved', 'soft');
    if (s.type.tracking !== 'normal') intel('typography', `Headlines are tracked ${s.type.tracking}`);
    if (s.personality.length) intel('personality', `Personality: ${s.personality.join(', ')}`);
    for (const m of s.motifs.slice(0, 4)) intel('motif', `Motif: ${m}`);
    if (s.imagery) intel('imagery', `Imagery: ${s.imagery}`);
    for (const c of s.constraints.slice(0, 8)) intel('restriction', c);
    if (s.composition.density) intel('composition', `Density: ${s.composition.density}${s.composition.axis ? `, ${s.composition.axis} composition` : ''}`, 'approved', 'none');
    if (s.logo?.mark) {
      const c = conceptOfMark(s.logo.mark);
      if (c) {
        const doc = logoDoc(c, { transparent: true });
        const a = await logoAsset(svgFile(doc, doc.artboards[0]), s.logo.mark.name, true, { ...src, property: `${p.id}:logo` });
        if (a) content.assets.push(a);
      }
    } else if (s.logo?.text) notes.add(`${s.name}’s logo is its name set in ${s.tokens.fonts.display}; no logo artwork to carry.`);
    notes.add(`From the board ${p.name}: its Master Design System (identity only — the board’s compositions are not carried).`);
  } else if (p.medium === 'graphic' && p.graphic?.doc) {
    const d = p.graphic.doc;
    for (const r of ROLES) put(`color.${r}`, 'color', d.tokens.colors[r]);
    if (d.tokens.accent2) put('color.accent2', 'color', d.tokens.accent2);
    put('font.family.display', 'fontFamily', d.tokens.fonts.display);
    put('font.family.body', 'fontFamily', d.tokens.fonts.body);
    const look = p.graphic.direction?.look;
    if (look) {
      put('font.weight.display', 'fontWeight', look.weight);
      if (look.case === 'upper') intel('typography', 'Headlines are set in capitals');
      if (look.tracking !== 'normal') intel('typography', `Headlines are tracked ${look.tracking}`);
    }
    if (p.graphic.direction) content.identity.description = p.graphic.direction.concept ?? p.graphic.direction.language;
    for (const b of d.artboards) {
      const rec = b.logo;
      if (!rec) continue;
      const c = selectedConcept(rec);
      if (!c) continue;
      const approved = !!rec.approved && rec.approved === (rec.selected ?? rec.approved);
      const doc = logoDoc(c, { transparent: true });
      const a = await logoAsset(svgFile(doc, doc.artboards[0]), c.wordmark.text, approved, { ...src, property: `${p.id}:${b.id}:logo` });
      if (a && !content.assets.some((x) => x.hash === a.hash)) content.assets.push(a);
      if (!content.identity.name || content.identity.name === p.name) content.identity.name = c.wordmark.text;
    }
    notes.add(`From the graphic ${p.name}: its tokens and type habits (its composition is not carried).`);
  } else {
    const ds = p.brief.doc?.system;
    const spec = p.specs[p.specIndex] ?? p.specs[p.specs.length - 1];
    if (ds) {
      content.identity.name = ds.name;
      for (const r of ROLES) if (ds.roles[r]) put(`color.${r}`, 'color', ds.roles[r]!);
      for (const c of ds.colours) {
        const path = `color.palette.${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'colour'}`;
        if (c.mode === 'dark') {
          const t = content.tokens[path];
          if (t) t.modes = { ...(t.modes ?? {}), dark: c.hex };
        } else put(path, 'color', c.hex);
      }
      if (ds.colours.some((c) => c.mode === 'dark')) content.modes = ['light', 'dark'];
      for (const f of ds.fonts) put(`font.family.${f.role}`, 'fontFamily', f.family, 'imported', f.standIn !== f.family ? `drawn with ${f.standIn} in SocriaUX` : undefined);
      ds.sizes.forEach((v, i) => put(`font.size.${i + 1}`, 'dimension', `${v}px`));
      ds.spacing.forEach((v, i) => put(`space.${i + 1}`, 'dimension', `${v}px`));
      ds.radii.forEach((v, i) => put(`radius.${i + 1}`, 'dimension', `${v}px`));
      for (const r of ds.rules) intel('restriction', r, 'confirmed', 'soft');
      content.components = ds.components.map((c) => ({ id: uid('cp'), name: c.name, description: c.notes, variants: [], properties: [], tokens: [], source: src, notes: [] }));
      notes.add(`From ${p.name}’s attached design system (${ds.name}).`);
    } else if (spec) {
      for (const r of ROLES) put(`color.${r}`, 'color', spec.tokens.colors[r]);
      put('font.family.display', 'fontFamily', spec.tokens.fonts.display);
      put('font.family.body', 'fontFamily', spec.tokens.fonts.body);
      put('radius.default', 'dimension', spec.tokens.radius === 'none' ? '0px' : spec.tokens.radius === 'soft' ? '8px' : '16px', 'imported', `the design’s corners are ${spec.tokens.radius}`);
      if (spec.look) {
        put('font.weight.display', 'fontWeight', spec.look.weight);
        if (spec.look.case === 'upper') intel('typography', 'Headlines are set in capitals');
        if (spec.look.accent2) put('color.accent2', 'color', spec.look.accent2);
      }
      intel('composition', `Spacing is ${spec.tokens.scale}`, 'approved', 'none');
      notes.add(`From ${p.name}’s current design (version ${p.specIndex + 1}).`);
    } else {
      issues.push({ severity: 'error', message: `${p.name || 'That project'} has no design, direction or design system to draw from yet.` });
    }
    const chosen = p.direction.chosen;
    if (chosen) {
      content.identity.description = chosen.concept ?? '';
      intel('other', `Approved direction: ${chosen.name} (${chosen.language})`, 'approved', 'none');
    }
    const persona = p.brief.doc?.personality ?? [];
    if (persona.length) intel('personality', `Personality: ${persona.join(', ')}`);
  }
  bindRoles();
  if (!content.identity.name) content.identity.name = p.name || 'From a SocriaUX project';
  return finish(content, 'project', issues, notes, now);
}
