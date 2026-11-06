// lib/logos5/studyDesk.ts — STUDY, READ LEFT TO RIGHT (Logos 5.5, Screen 4).
//
// Your files, what was made from them, and what was said, in that order. The
// files say which topics each holds and whether each is on your map yet;
// choosing a topic decides what the middle shows; "Show all" takes the
// choice back. Everything here is read from what the study and the map
// already hold — nothing is guessed: a topic is "on your map" only when an
// idea on the Logic Map carries its name, and an artifact belongs to a topic
// only when it was made for it (practice) or names it.

export interface DeskTopic {
  id: string;
  title: string;
  /** the files it rests on, by doc id */
  docs: string[];
}

export interface DeskFile {
  doc: string;
  name: string;
  pages: number;
}

export interface DeskArtifact {
  key: string;
  kind: string;
  title: string;
  /** the topic it was made for, when that is known (practice) */
  topic?: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"'’‘.,:;!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A study's topics as the desk reads them: each with the files it rests on, from its passages and quotes. */
export function deskTopicsOf(topics: { id: string; title: string; blocks: { doc: string }[]; quotes: { doc: string }[] }[]): DeskTopic[] {
  return topics.map((t) => ({ id: t.id, title: t.title, docs: [...new Set([...t.blocks.map((b) => b.doc), ...t.quotes.map((q) => q.doc)])] }));
}

/** "PDF", "DOCX", "Photo" — what a file is, from its name. */
export function fileKind(name: string): string {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(name.trim())?.[1]?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "webp", "heic", "heif", "gif"].includes(ext))
    return "Photo";
  if (["md", "txt", "rtf"].includes(ext)) return "Notes";
  if (["doc", "docx", "odt"].includes(ext)) return "Doc";
  if (["ppt", "pptx", "odp", "key"].includes(ext)) return "Slides";
  if (["xls", "xlsx", "ods", "csv", "tsv"].includes(ext)) return "Sheet";
  return ext ? ext.toUpperCase() : "File";
}

/** A file's name without its extension — what the person would call it. */
export function fileTitle(name: string): string {
  const t = name
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_]+/g, " ")
    .trim();
  return t || name;
}

/** The topics a file holds, in the study's own order. */
export function topicsOf(file: DeskFile, topics: DeskTopic[]): DeskTopic[] {
  return topics.filter((t) => t.docs.includes(file.doc));
}

/** Which topics are on the Logic Map: an idea there carries the topic's name, or the topic's name holds the idea's. */
export function onMap(topics: DeskTopic[], nodeLabels: string[]): Set<string> {
  const labels = nodeLabels.map(norm).filter((l) => l.length >= 3);
  const out = new Set<string>();
  for (const t of topics) {
    const n = norm(t.title);
    if (n.length < 3) continue;
    if (
      labels.some(
        (l) => l === n || l.includes(n) || (l.length >= 8 && n.includes(l)),
      )
    )
      out.add(t.id);
  }
  return out;
}

/** The topic an artifact belongs to: the one it was made for, else the one its title names (the longest that fits). */
export function topicOfArtifact(
  a: DeskArtifact,
  topics: DeskTopic[],
): string | null {
  if (a.topic && topics.some((t) => t.id === a.topic)) return a.topic;
  const title = norm(a.title);
  let best: DeskTopic | null = null;
  for (const t of topics) {
    const n = norm(t.title);
    if (n.length < 4 || !title.includes(n)) continue;
    if (!best || n.length > norm(best.title).length) best = t;
  }
  return best?.id ?? null;
}

/** What the middle shows: everything, or what was made for the topic chosen — and, either way, by kind if one is chosen. */
export function deskArtifacts<A extends DeskArtifact>(
  all: A[],
  topics: DeskTopic[],
  topic: string | null,
  kind: string | null,
): A[] {
  return all.filter(
    (a) =>
      (!topic || topicOfArtifact(a, topics) === topic) &&
      (!kind || a.kind === kind),
  );
}

/** The kinds that are there, in the order first made — for "All kinds ▾". */
export function kindsOf(all: DeskArtifact[]): string[] {
  return [...new Set(all.map((a) => a.kind))];
}

/** "PDF · 7 topics · 5 on your map" */
export function fileMeta(
  file: DeskFile,
  topics: DeskTopic[],
  mapped: Set<string>,
): string {
  const mine = topicsOf(file, topics);
  const on = mine.filter((t) => mapped.has(t.id)).length;
  const parts = [fileKind(file.name)];
  if (mine.length)
    parts.push(`${mine.length} ${mine.length === 1 ? "topic" : "topics"}`);
  else if (file.pages > 0)
    parts.push(`${file.pages} ${file.pages === 1 ? "page" : "pages"}`);
  if (mine.length) parts.push(on ? `${on} on your map` : "not on your map yet");
  return parts.join(" · ");
}
