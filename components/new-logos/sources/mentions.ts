// components/new-logos/sources/mentions.ts — what the things @-mentioned in a question bring with it.
//
// A SOURCE becomes a document attachment on the person's message, exactly as a document attached in the existing
// interface is (its reading's id, name, pages, format, original), with a short text of the passages that bear on the
// question for wherever the reading is not at hand; the turn then sends those passages as `docs` (ask.ts). A COMPONENT
// (an artifact, a finding, a question, a decision, an objective, a conversation) brings a few lines of what it says,
// in the focus brief the endpoint already accepts — an artifact its structured state (lib/new-logos/context.ts).

import type { SourceDoc } from '@/lib/docs/types';
import { artifactFacts } from '@/lib/new-logos/context';
import { TYPE_LABEL, type NodeRow } from '@/lib/new-logos/model';
import type { SourceMeta } from '@/lib/new-logos/sources';
import type { About } from '../ask';
import type { Mention } from './Omnibox';

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function factsOf(n: NodeRow): string[] {
  const c = n.content as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  if (n.type === 'artifact') return artifactFacts(n, 6).map((l) => `  ${l}`);
  const body = str(c.body) || str(c.rationale) || str(c.resolution) || str(c.outcome) || str(n.description);
  return body ? [`  ${cut(body, 200)}`] : [];
}

export async function mentionContext(
  mentions: readonly Mention[],
  text: string,
  deps: { sources: readonly SourceMeta[]; nodes: readonly NodeRow[]; passages: (q: { ids: string[]; query: string }) => Promise<{ docs: SourceDoc[] }> }
): Promise<{ attachments: unknown[]; about?: About }> {
  const picked = mentions.filter((m) => m.kind === 'source').map((m) => deps.sources.find((s) => s.id === m.id)).filter((s): s is SourceMeta => !!s);
  const readable = picked.filter((s) => s.doc_id);
  const { docs } = readable.length ? await deps.passages({ ids: readable.map((s) => s.id), query: text }) : { docs: [] as SourceDoc[] };
  const attachments = readable.map((s) => {
    const d = docs.find((x) => x.id === s.doc_id);
    const words = d ? d.blocks.map((b) => b.text).join('\n\n') : '';
    return {
      kind: 'doc',
      name: s.name,
      origin: 'source',
      doc: s.doc_id,
      text: cut(words, 1500),
      ...(words.length > 1500 ? { truncated: true } : {}),
      pages: s.pages,
      format: s.format,
      ...(s.file_id ? { file: s.file_id } : {}),
      ...(s.size ? { size: s.size } : {}),
      ...(s.mime ? { mime: s.mime } : {}),
    };
  });
  const lines: string[] = [];
  for (const s of picked.filter((x) => !x.doc_id)) lines.push(`Image mentioned: ${s.name} (kept as an image; its words are not read)`);
  const nodes = mentions.filter((m) => m.kind !== 'source').map((m) => deps.nodes.find((n) => n.id === m.id)).filter((n): n is NodeRow => !!n);
  for (const n of nodes) {
    if (lines.length >= 12) break;
    lines.push(cut(`${TYPE_LABEL[n.type].one} mentioned: ${n.title || 'a conversation'}`, 220));
    for (const f of factsOf(n)) if (lines.length < 12) lines.push(cut(f, 220));
  }
  const about: About | undefined = lines.length ? { label: cut(mentions.filter((m) => m.kind !== 'source' || !picked.find((p) => p.id === m.id)?.doc_id).map((m) => m.label).join(', '), 80) || 'what was mentioned', of: 'what this question mentions', lines } : undefined;
  return { attachments, about };
}
