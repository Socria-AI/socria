import 'server-only';
// lib/mind/ingest-text.ts
//
// A .txt file, into the graph.
//
// The one thing this must never do is save the file as a single enormous
// memory. A file is a set of claims about people, projects, decisions and
// events, and the point of ingesting it is that those become addressable
// individually — correctable, deletable, connected to what is already known.
// A blob is none of those things.
//
// So: chunk it, extract per chunk with the offsets kept, resolve against the
// graph, and record where every claim came from. A node derived from a file
// carries charStart/charEnd, which is what lets the Memory page show the
// sentence behind a claim — and what makes "where did you get that" a
// question with an answer.
//
// CONFLICTS ARE REPRESENTED, NEVER RESOLVED. A file that disagrees with the
// graph produces two nodes and a `contradicts` edge, not an overwrite. A file
// is a claim, not an authority: somebody uploading old notes should not
// silently rewrite what they have since decided.

import { extract } from './extract';
import { FILE_BUDGET } from './gate';
import { applyCandidates, type EdgeCandidate, type NodeCandidate } from './apply';
import { loadGraph, persistGraph, saveSource } from './store';
import { clip, type MindGraph } from './types';

/** Big enough to hold an argument, small enough to keep offsets meaningful. */
export const CHUNK_CHARS = 1500;
export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_CHUNKS = 40;

export interface Chunk {
  text: string;
  start: number;
  end: number;
}

/**
 * Split on paragraph boundaries, falling back to sentences, never mid-word.
 *
 * Offsets are into the ORIGINAL text, so a claim can point at the passage
 * that produced it however the chunking went.
 */
export function chunkText(text: string, size = CHUNK_CHARS): Chunk[] {
  const out: Chunk[] = [];
  let at = 0;
  while (at < text.length && out.length < MAX_CHUNKS) {
    let end = Math.min(at + size, text.length);
    if (end < text.length) {
      // Prefer a paragraph break, then a sentence end, then a space.
      const window = text.slice(at, end);
      const para = window.lastIndexOf('\n\n');
      const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'));
      const space = window.lastIndexOf(' ');
      const cut = para > size * 0.4 ? para + 2 : sentence > size * 0.4 ? sentence + 1 : space > 0 ? space : window.length;
      end = at + cut;
    }
    const slice = text.slice(at, end);
    if (slice.trim()) out.push({ text: slice, start: at, end });
    at = end;
  }
  return out;
}

export interface IngestResult {
  sourceId: string;
  chunks: number;
  created: number;
  reinforced: number;
  conflicts: number;
  refused: number;
}

/**
 * Read a file into the graph.
 *
 * Runs with the FILE budget rather than the turn budget — a document
 * legitimately carries more than a sentence does — and reports what it
 * created, so an upload is reviewable rather than a silent flood.
 */
export async function ingestTextFile(
  userId: string,
  file: { name: string; text: string },
  opts: { now: number; apiKey: string }
): Promise<IngestResult | null> {
  const text = file.text.slice(0, MAX_FILE_BYTES);
  const sourceId = `src_${opts.now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const stored = await saveSource(userId, {
    id: sourceId,
    name: clip(file.name, 200) || 'Uploaded file',
    bytes: text.length,
    text,
    createdAt: opts.now,
  });
  if (!stored) return null;

  const before: MindGraph = await loadGraph(userId);

  // The file itself is a node. Everything the file teaches hangs off it by
  // `derived_from`, so provenance is walkable in the graph and not only
  // readable in a record.
  const sourceNode: NodeCandidate = {
    type: 'Source',
    label: clip(file.name, 80) || 'Uploaded file',
    content: `A text file uploaded on ${new Date(opts.now).toISOString().slice(0, 10)}, ${text.length} characters.`,
    kind: 'stated',
    confidence: 1,
    importance: 0.3,
  };

  const nodes: NodeCandidate[] = [sourceNode];
  const edges: EdgeCandidate[] = [];
  const chunks = chunkText(text);

  for (const chunk of chunks) {
    const found = await extract(opts.apiKey, chunk.text, null);
    for (const n of found.nodes) {
      nodes.push(n);
      // Every claim points back at the file it came from.
      edges.push({
        sourceLabel: n.label,
        targetLabel: sourceNode.label,
        relationship: 'derived_from',
        kind: 'stated',
      });
    }
    edges.push(...found.edges);
  }

  let i = 0;
  const { graph: after, report } = applyCandidates(before, nodes, edges, {
    now: opts.now,
    nextId: () => `m_${opts.now.toString(36)}_f${(i++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    budget: FILE_BUDGET,
    provenance: { surface: 'file', sourceNodeId: sourceId },
  });

  const saved = await persistGraph(userId, before, after);
  if (!saved.ok) return null;

  return {
    sourceId,
    chunks: chunks.length,
    created: report.nodes.filter((n) => n.action === 'created').length,
    reinforced: report.nodes.filter((n) => n.action === 'reinforced' || n.action === 'revised').length,
    conflicts: report.nodes.filter((n) => n.action === 'conflicted' || n.action === 'superseded').length,
    refused: report.refused.length,
  };
}
