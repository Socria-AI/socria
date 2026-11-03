// lib/paste.ts — WHAT A PASTE CARRIES, as files.
//
// A screenshot copied to the clipboard (Cmd/Ctrl-Shift-4, Snipping Tool, "Copy
// image" in a browser) arrives on paste as a file — but browsers disagree on
// where: Chrome lists it in `items`, Safari and Firefox in `files`, and some
// list the same picture in both. A file copied in Finder or Explorer arrives in
// `files` too. This gathers them once each, in order.
//
// Every browser names a pasted screenshot "image.png" (or nothing at all), so
// three pasted in a row would read as three of the same; each is renamed for
// when it was pasted, so the chips and the conversation can tell them apart.
//
// PURE but for constructing a File. No reading here: the composer and the
// start box take the files exactly as if they had been dropped.

/** The slice of a clipboard this reads (a real DataTransfer satisfies it). */
export interface ClipLike {
  items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }> | null;
  files?: ArrayLike<File> | null;
}

/** The names browsers give a pasted picture that say nothing about it. */
const GENERIC = /^(image|blob|untitled|pasted ?image)?(\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|avif))?$/i;

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
};

const two = (n: number) => String(n).padStart(2, '0');

/** "Screenshot 14.05.32.png": the name a pasted picture is given, from when it was pasted. */
export function pastedName(type: string, at: Date, n = 0): string {
  const ext = EXT[type.toLowerCase()] ?? 'png';
  const stamp = `${two(at.getHours())}.${two(at.getMinutes())}.${two(at.getSeconds())}`;
  return `Screenshot ${stamp}${n > 0 ? ` (${n + 1})` : ''}.${ext}`;
}

/** Whether a name says nothing about the file. */
export const isGenericName = (name: string) => GENERIC.test(name.trim());

/**
 * The files a paste carries, each once. With `imagesOnly`, only pictures.
 * Pictures with a name that says nothing are renamed for when they were pasted.
 */
export function pastedFiles(clip: ClipLike | null | undefined, opts: { imagesOnly?: boolean; at?: Date } = {}): File[] {
  if (!clip) return [];
  const found: File[] = [];
  const seen = new Set<string>();
  const add = (f: File | null | undefined) => {
    if (!f) return;
    // the same picture listed in both places: same name, size and type
    const key = `${f.name}|${f.size}|${f.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(f);
  };
  for (const it of Array.from(clip.items ?? [])) if (it.kind === 'file') add(it.getAsFile());
  for (const f of Array.from(clip.files ?? [])) add(f);

  const isImage = (f: File) => /^image\//i.test(f.type);
  const keep = opts.imagesOnly ? found.filter(isImage) : found;
  const at = opts.at ?? new Date();
  let n = 0;
  return keep.map((f) => {
    if (!isImage(f) || !isGenericName(f.name)) return f;
    const name = pastedName(f.type, at, n++);
    try {
      return new File([f], name, { type: f.type, lastModified: f.lastModified || at.getTime() });
    } catch {
      return f; // no File constructor (very old browsers): keep it as it came
    }
  });
}

/**
 * Whether a paste is the files it carries rather than its text.
 *
 * Word, Excel, Pages and Google Docs put a PICTURE of what was copied on the
 * clipboard beside its text: pasting a paragraph must give the paragraph, not
 * a screenshot of it. So text wins whenever there is any — except when the
 * text is only the files' own names, as a file copied in Finder or Explorer is.
 */
export function pasteIsFiles(text: string | null | undefined, files: readonly File[]): boolean {
  if (!files.length) return false;
  const t = (text ?? '').trim();
  if (!t) return true;
  const lines = t.split(/\r?\n/).map((l) => l.trim().split(/[\\/]/).pop() ?? '').filter(Boolean);
  const names = new Set(files.map((f) => f.name));
  return lines.length > 0 && lines.every((l) => names.has(l));
}

/** Whether focus is somewhere a paste belongs to already (a field, an editor). */
export function isEditable(el: Element | null | undefined): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const t = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color', 'image'].includes(t);
  }
  return (el as HTMLElement).isContentEditable === true;
}
