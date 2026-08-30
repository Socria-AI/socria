// lib/synthesis.ts
// Parse Core 3's structured synthesis block out of an assistant message.
//
// Format Core 3 emits:
//   ::synthesis
//   # Optional title
//   ## Section label
//   - bullet
//   - bullet
//   ## Another label
//   - bullet
//   ::end
//
// A message may contain prose before and/or after the block. During
// streaming the block may be incomplete (`::synthesis` seen, no `::end`
// yet) — parseMessage flags that so the UI can show a placeholder.

export interface SynthesisSection {
  label: string;
  items: string[];
}

export interface SynthesisData {
  title?: string;
  sections: SynthesisSection[];
}

export type MessageSegment =
  | { type: 'text'; text: string }
  | { type: 'synthesis'; data: SynthesisData }
  | { type: 'synthesis-pending' };

const OPEN = '::synthesis';
const CLOSE = '::end';

export function parseSynthesisBody(body: string): SynthesisData {
  const lines = body.split('\n');
  let title: string | undefined;
  const sections: SynthesisSection[] = [];
  let current: SynthesisSection | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('##')) {
      const label = line.replace(/^#+\s*/, '').trim();
      if (label) {
        current = { label, items: [] };
        sections.push(current);
      }
    } else if (line.startsWith('#')) {
      const t = line.replace(/^#+\s*/, '').trim();
      if (t && !title) title = t;
    } else if (line.startsWith('-') || line.startsWith('*') || line.startsWith('•')) {
      const item = line.replace(/^[-*•]\s*/, '').trim();
      if (item && current) current.items.push(item);
    } else if (current) {
      // Continuation line for the last bullet.
      const last = current.items[current.items.length - 1];
      if (last != null) {
        current.items[current.items.length - 1] = `${last} ${line}`.trim();
      }
    }
  }

  return {
    title,
    sections: sections.filter((s) => s.items.length > 0),
  };
}

export function parseMessage(content: string): MessageSegment[] {
  const openIdx = content.indexOf(OPEN);
  if (openIdx === -1) {
    return [{ type: 'text', text: content }];
  }

  const afterOpen = openIdx + OPEN.length;
  const closeIdx = content.indexOf(CLOSE, afterOpen);

  const before = content.slice(0, openIdx).trim();
  const segments: MessageSegment[] = [];
  if (before) segments.push({ type: 'text', text: before });

  if (closeIdx === -1) {
    // Block not yet closed (still streaming). Show a placeholder.
    segments.push({ type: 'synthesis-pending' });
    return segments;
  }

  const body = content.slice(afterOpen, closeIdx);
  const data = parseSynthesisBody(body);
  if (data.sections.length > 0) {
    segments.push({ type: 'synthesis', data });
  }

  const after = content.slice(closeIdx + CLOSE.length).trim();
  if (after) segments.push({ type: 'text', text: after });

  return segments;
}

export function hasSynthesis(content: string): boolean {
  return content.includes(OPEN) && content.includes(CLOSE);
}

// ===== Guided answer choices =====

const CHOICES_OPEN = '::choices';
const CHOICES_CLOSE = '::end';
const MAX_CHOICES = 6;

// Extract the ::choices block from an assistant message. Returns the
// content with the block removed (so it never renders as raw text) plus
// the parsed choice strings. While streaming, an unclosed ::choices block
// is stripped from the body and yields no choices yet.
export function splitChoices(content: string): {
  body: string;
  choices: string[];
} {
  const openIdx = content.indexOf(CHOICES_OPEN);
  if (openIdx === -1) return { body: content, choices: [] };

  const afterOpen = openIdx + CHOICES_OPEN.length;
  const closeIdx = content.indexOf(CHOICES_CLOSE, afterOpen);

  if (closeIdx === -1) {
    // Block still streaming — hide it until complete.
    return { body: content.slice(0, openIdx).trimEnd(), choices: [] };
  }

  const block = content.slice(afterOpen, closeIdx);
  const choices = block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-') || l.startsWith('*') || l.startsWith('•'))
    .map((l) => l.replace(/^[-*•]\s*/, '').trim())
    .filter((l) => l.length > 0 && l.length <= 140)
    .slice(0, MAX_CHOICES);

  const body =
    (content.slice(0, openIdx) + content.slice(closeIdx + CHOICES_CLOSE.length))
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  return { body, choices };
}
