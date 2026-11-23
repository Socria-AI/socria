// lib/ux-v0/design/start.ts — a studio conversation becoming a design project: the brief, written down, and the first
// request the workspace makes on opening.
//
// Nothing is designed here. The conversation (lib/ux-v0/studio) collected what the work is, its words, what it
// should feel like and anything the person chose (colours, faces, a mood, references, pictures); this writes all of
// that into the project's memory as a brief in plain language, which the designer reads on every request, and picks
// the format the first artboard is made in. The workspace sends the first request the moment it opens.

import type { DesignProject } from '../types';
import type { StudioState } from '../studio/schema';
import { said } from '../studio/schema';
import { boardBriefOf, graphicBriefOf, logoBriefOf, prefsOf } from '../studio/apply';
import { emptyState, type DesignAsset, type DesignState } from './doc';
import { formatFromWords, formatOf, DEFAULT_FORMAT } from './formats';

const line = (label: string, v: string | string[] | undefined | null) => {
  const s = Array.isArray(v) ? v.filter(Boolean).join(' · ') : v ?? '';
  return s.trim() ? `${label}: ${s.trim()}` : '';
};

interface Content {
  headline: string;
  subhead?: string;
  body?: string;
  cta?: string;
  meta?: string[];
  brand?: string;
  items?: string[];
}

function contentLines(c: Content | null | undefined): string[] {
  if (!c) return [];
  return [
    line('Headline (exactly)', c.headline),
    line('Supporting line', c.subhead),
    line('Body', c.body),
    line('Details', c.meta),
    line('Call to action', c.cta),
    line('Brand or author', c.brand),
    line('Points', c.items),
  ].filter(Boolean);
}

/** The first thing the workspace asks the designer, for a project of this kind. */
export function firstRequest(kind: string): string {
  if (kind === 'logo') return 'Design the logo from the brief: a mark and a wordmark, presented on a logo sheet with its one-colour and small-size versions.';
  if (kind === 'campaign') return 'Make the set of materials in the brief as one campaign: one idea, carried across every format, each artboard composed for its own shape.';
  if (kind === 'website') return 'Design the page from the brief: a real page with its sections, its copy and its working parts.';
  return 'Make the first design from the brief.';
}

/** A studio conversation's graphic, logo or board as a design project (not yet stored). */
export function designFromStudio(p: DesignProject, st: StudioState, o: { assets?: { id: string; src: string; name: string; width: number; height: number }[]; now?: number } = {}): { ok: true; project: DesignProject; said: string } | { ok: false; error: string } {
  const now = o.now ?? Date.now();
  const prefs = (() => {
    try {
      return prefsOf(st);
    } catch {
      return null;
    }
  })();
  const person = st.transcript.filter((m) => m.from === 'person' && m.text.trim()).map((m) => m.text.trim());
  let kind = 'graphic';
  let name = p.name;
  let format = DEFAULT_FORMAT;
  const lines: string[] = [];
  if (st.mode === 'logo') {
    const b = logoBriefOf(st);
    if (!b) return { ok: false, error: 'A logo needs its name first.' };
    kind = 'logo';
    format = 'logo-sheet';
    name = b.content.headline;
    lines.push(`A logo for “${b.content.headline}”.`, ...contentLines(b.content), line('What it stands for', b.purpose));
  } else if (st.mode === 'board') {
    const b = boardBriefOf(st, []);
    if (!b) return { ok: false, error: 'A board needs its line and at least one material.' };
    kind = 'campaign';
    name = b.name;
    const firstFormat = b.materials.map((m) => (m as { format?: string }).format).find((f) => !!formatOf(f));
    format = firstFormat ?? 'instagram-portrait';
    lines.push(`A campaign: ${b.purpose}`, ...contentLines(b.content), line('Materials', b.materials.map((m) => `${m.count} × ${(m as { label?: string }).label ?? m.kind}${(m as { format?: string }).format ? ` (${(m as { format?: string }).format})` : ''}`)));
  } else {
    const b = graphicBriefOf(st, []);
    if (!b) return { ok: false, error: 'Write the headline first: SocriaUX sets your words and never invents them.' };
    kind = b.kind;
    name = b.content.headline;
    format = b.formats.map((f) => formatOf(f)?.id).find(Boolean) ?? formatFromWords(`${st.prompt} ${b.kind}`)?.id ?? DEFAULT_FORMAT;
    lines.push(`A ${b.kind}: ${b.purpose}`, ...contentLines(b.content));
  }
  lines.unshift(`In their words: “${st.prompt.trim()}”`);
  if (person.length > 1) lines.push(line('Said since', person.slice(1, 12)));
  if (prefs) {
    lines.push(
      line('How it should feel', [...prefs.personality, prefs.styleWords].filter(Boolean)),
      prefs.palette ? line('Colours they chose', Object.entries(prefs.palette).map(([k, v]) => `${k} ${v}`)) : '',
      prefs.faces ? line('Faces they chose', [`display ${prefs.faces.display}`, `text ${prefs.faces.body}`]) : '',
      line('To avoid', prefs.avoid),
      prefs.vibe?.name ? line('Mood chosen', prefs.vibe.name) : ''
    );
  }
  const brief = lines.filter(Boolean).join('\n').slice(0, 4000);
  const assets: DesignAsset[] = (o.assets ?? []).map((a) => ({ id: a.id.replace(/[^\w-]/g, '').slice(0, 40) || `img${Math.random().toString(36).slice(2, 8)}`, name: a.name, src: a.src, width: a.width, height: a.height }));
  const state: DesignState = { ...emptyState(kind, format, brief), assets };
  const DEFAULT_NAMES = new Set(['Untitled design', 'Untitled graphic', 'Untitled board', '']);
  const started: StudioState = { ...st, status: 'started', startedAt: now };
  const project: DesignProject = {
    ...p,
    name: DEFAULT_NAMES.has(p.name) ? (name || 'Untitled design').slice(0, 80) : p.name,
    medium: 'design',
    intent: p.intent || st.prompt.slice(0, 600),
    design: state,
    studio: said(started, { from: 'socria', kind: 'note', text: `Designing “${(name || 'it').slice(0, 80)}” from what you told me.`, at: now }),
    updatedAt: now,
  };
  return { ok: true, project, said: kind === 'logo' ? 'the logo' : kind === 'campaign' ? 'the campaign' : 'the design' };
}
