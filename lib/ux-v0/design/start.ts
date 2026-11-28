// lib/ux-v0/design/start.ts — a studio conversation becoming a design project: the brief, written down, and the first
// request the workspace makes on opening.
//
// Nothing is designed here. The conversation (lib/ux-v0/studio/discover.ts) understood what the work is, what it is
// for, its words if any, how it should feel and anything the person picked (colours, faces, a mood, references,
// pictures); this writes that into the project's memory as a brief in their own words, which the designer reads on
// every request, and picks the format the first artboard is made in. The workspace sends the first request the
// moment it opens.

import type { DesignProject } from '../types';
import type { StudioState } from '../studio/schema';
import { said } from '../studio/schema';
import { designBriefOf, nameOf, personWordsOf } from '../studio/discover';
import { readFacts } from '../studio/facts';
import { emptyState, type DesignAsset, type DesignState } from './doc';
import { formatFromWords, formatOf, DEFAULT_FORMAT } from './formats';

/** The first thing the workspace asks the designer, for a project of this kind. */
export function firstRequest(kind: string): string {
  if (kind === 'logo') return 'Design the logo from the brief: a mark and a wordmark, presented on a logo sheet with its one-colour and small-size versions.';
  if (kind === 'campaign') return 'Make the set of materials in the brief as one campaign: one idea, carried across every format, each artboard composed for its own shape.';
  if (kind === 'website') return 'Design the page from the brief: a real page with its sections, its copy and its working parts.';
  return 'Make the first design from the brief.';
}

/** The kind of design a conversation's graphic is, read from what was said (poster, social, cover…). */
function graphicKind(words: string): string {
  const f = readFacts(words);
  if (f.kind && !['logo', 'campaign', 'identity'].includes(f.kind)) return f.kind;
  return 'graphic';
}

/**
 * A studio conversation's graphic, logo or campaign as a design project (not yet stored). The brief is what discovery
 * understood (lib/ux-v0/studio/discover.ts designBriefOf: their words, the conversation, what was asked for, what is
 * implied, SocriaUX's tentative reading marked as such, what they picked and what they turned down); nothing is
 * required beyond it — words not given are written as stand-ins by the designer and said to be.
 */
export function designFromStudio(p: DesignProject, st: StudioState, o: { assets?: { id: string; src: string; name: string; width: number; height: number }[]; now?: number } = {}): { ok: true; project: DesignProject; said: string } | { ok: false; error: string } {
  const now = o.now ?? Date.now();
  const words = personWordsOf(st).join('\n') || st.prompt;
  const kindWords = `${st.brief?.kind ?? ''} ${words}`;
  const kind = st.mode === 'logo' ? 'logo' : st.mode === 'board' ? 'campaign' : graphicKind(kindWords);
  const format = st.mode === 'logo' ? 'logo-sheet' : formatFromWords(kindWords)?.id ?? (st.mode === 'board' ? 'instagram-portrait' : DEFAULT_FORMAT);
  const name = nameOf(st);
  const brief = designBriefOf(st);
  const assets: DesignAsset[] = (o.assets ?? []).map((a) => ({ id: a.id.replace(/[^\w-]/g, '').slice(0, 40) || `img${Math.random().toString(36).slice(2, 8)}`, name: a.name, src: a.src, width: a.width, height: a.height }));
  const state: DesignState = { ...emptyState(kind, formatOf(format) ? format : DEFAULT_FORMAT, brief), assets };
  const DEFAULT_NAMES = new Set(['Untitled design', 'Untitled graphic', 'Untitled board', '']);
  const started: StudioState = { ...st, status: 'started', startedAt: now };
  const project: DesignProject = {
    ...p,
    name: DEFAULT_NAMES.has(p.name) ? (name || 'Untitled design').slice(0, 80) : p.name,
    medium: 'design',
    intent: p.intent || st.prompt.slice(0, 600),
    design: state,
    studio: said(started, { from: 'socria', kind: 'note', text: `Designing ${name ? `“${name.slice(0, 80)}”` : 'it'} from what you told me.`, at: now }),
    updatedAt: now,
  };
  return { ok: true, project, said: kind === 'logo' ? 'the logo' : kind === 'campaign' ? 'the campaign' : 'the design' };
}
