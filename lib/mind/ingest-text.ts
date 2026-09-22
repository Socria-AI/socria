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
import { associate, type ProjectContainer } from './projects';
import { clip, normalize, type MindGraph, type MindNode } from './types';

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
  /** how many of the touched nodes were tied to the Project, if there was one */
  associated: number;
}

/**
 * A name for the file's node that no other file's node already has.
 *
 * Needed because a name alone was never unique, and is now routinely not:
 * "notes.txt" in Calculus and "notes.txt" in Socria is the expected case
 * once each Project has files of its own.
 */
export function distinctSourceLabel(graph: MindGraph, name: string): string {
  const base = clip(name, 80) || 'Uploaded file';
  const taken = new Set(graph.nodes.filter((n) => n.type === 'Source').map((n) => normalize(n.label)));
  if (!taken.has(normalize(base))) return base;
  for (let i = 2; i < 1000; i++) {
    const next = `${base} (${i})`;
    if (!taken.has(normalize(next))) return next;
  }
  return `${base} (${Date.now().toString(36)})`;
}

/**
 * The file's own node, created directly — never through resolution.
 *
 * Resolution is for CLAIMS: two sentences that mean the same thing should
 * become one node. A file is not a claim, and a second upload is a second
 * file by definition. Sending it through the resolver merged every
 * same-named upload into the first one — and a distinct name did not save it,
 * because the resolver matches contained word sequences, so "notes txt 2"
 * resolved straight back to "notes txt". Everything learned from the second
 * file was then recorded as derived from the first.
 */
export function addSourceNode(
  graph: MindGraph,
  file: { name: string; chars: number },
  opts: { now: number; nextId: () => string }
): { graph: MindGraph; node: MindNode } {
  const node: MindNode = {
    id: opts.nextId(),
    type: 'Source',
    label: distinctSourceLabel(graph, file.name),
    content: `A text file uploaded on ${new Date(opts.now).toISOString().slice(0, 10)}, ${file.chars} characters.`,
    aliases: [],
    status: 'active',
    confidence: 1,
    certainty: 1,
    importance: 0.3,
    activation: 0.2,
    seen: 1,
    private: false,
    provenance: [{ kind: 'stated', surface: 'file', at: opts.now }],
    createdAt: opts.now,
    updatedAt: opts.now,
    lastAccessed: opts.now,
  };
  return { graph: { ...graph, nodes: [...graph.nodes, node] }, node };
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
  opts: {
    now: number;
    apiKey: string;
    /**
     * The Project the file was added to, already verified as the caller's.
     * The FILE belongs to it. What is learned from the file goes through
     * exactly the same extraction and resolution as any other file — it is
     * matched against the whole graph, not a Project's corner of it — and is
     * then tied to the Project. So a concept the file shares with another
     * Project reinforces the node that already exists instead of minting a
     * Project-local copy.
     */
    project?: ProjectContainer | null;
  }
): Promise<IngestResult | null> {
  const text = file.text.slice(0, MAX_FILE_BYTES);
  const sourceId = `src_${opts.now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const stored = await saveSource(userId, {
    id: sourceId,
    name: clip(file.name, 200) || 'Uploaded file',
    bytes: text.length,
    text,
    createdAt: opts.now,
    projectId: opts.project?.id ?? null,
  });
  if (!stored) return null;

  const before: MindGraph = await loadGraph(userId);

  let i = 0;
  const nextId = () => `m_${opts.now.toString(36)}_f${(i++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  // The file itself is a node. Everything the file teaches hangs off it by
  // `derived_from`, so provenance is walkable in the graph and not only
  // readable in a record.
  const { graph: withSource, node: sourceNode } = addSourceNode(
    before, { name: file.name, chars: text.length }, { now: opts.now, nextId }
  );

  const nodes: NodeCandidate[] = [];
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

  const { graph: after, report } = applyCandidates(withSource, nodes, edges, {
    now: opts.now,
    nextId,
    budget: FILE_BUDGET,
    provenance: { surface: 'file', sourceNodeId: sourceId },
  });

  let graph = after;
  let associated = 0;
  const anchor = opts.project?.nodeId;
  if (anchor && after.nodes.some((n) => n.id === anchor)) {
    const tied = associate(
      after,
      anchor,
      // The file's own node first: the FILE belongs to the Project.
      [{ id: sourceNode.id, action: 'created' as const }, ...report.nodes.map((r) => ({ id: r.id, action: r.action }))],
      {
        now: opts.now,
        nextId,
        provenance: { surface: 'file', sourceNodeId: sourceId },
      }
    );
    graph = tied.graph;
    associated = tied.created + tied.reinforced;
  }

  const saved = await persistGraph(userId, before, graph);
  if (!saved.ok) return null;

  return {
    sourceId,
    chunks: chunks.length,
    created: report.nodes.filter((n) => n.action === 'created').length,
    reinforced: report.nodes.filter((n) => n.action === 'reinforced' || n.action === 'revised').length,
    conflicts: report.nodes.filter((n) => n.action === 'conflicted' || n.action === 'superseded').length,
    refused: report.refused.length,
    associated,
  };
}
