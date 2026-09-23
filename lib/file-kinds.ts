// lib/file-kinds.ts
//
// What a file IS, decided by its name — shared by the composer (which reads
// plain text itself and hands everything else to the server) and by the
// server reader (lib/file-extract.ts). Pure; safe in the browser.

/** Read as UTF-8 exactly as they are. Code counts: people think in it too. */
export const TEXT_EXTENSIONS = [
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'log', 'xml', 'html', 'htm',
  'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'tex', 'bib', 'srt', 'vtt', 'rst', 'org',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'ipynb', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'sql', 'sh', 'bash', 'zsh', 'r', 'm', 'scala',
  'lua', 'pl', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'graphql', 'proto', 'dart',
] as const;

/** Need unpacking, which happens on the server. */
export const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'rtf', 'zip'] as const;

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const;

/**
 * Never read, even inside a zip. A .env or a private key pasted into a model
 * is a secret handed to a third party; nobody attaching "my project" means
 * that, and the zip is exactly how it would happen without their noticing.
 */
const SECRET_NAMES = /(^|\/)(\.env(\..*)?|id_rsa|id_ed25519|.*\.pem|.*\.key|.*\.p12|.*\.pfx|credentials(\.json)?|\.npmrc|\.netrc|\.pypirc)$/i;

export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

export function isSecretFile(name: string): boolean {
  return SECRET_NAMES.test(name.trim());
}

export type FileKind = 'text' | 'document' | 'image' | 'secret' | 'unsupported';

export function kindOfFile(name: string, mime = ''): FileKind {
  if (isSecretFile(name)) return 'secret';
  const ext = extensionOf(name);
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext) || /^image\/(png|jpeg|webp|gif)$/.test(mime)) return 'image';
  if ((DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) return 'document';
  if ((TEXT_EXTENSIONS as readonly string[]).includes(ext) || /^text\//.test(mime) || mime === 'application/json') return 'text';
  return 'unsupported';
}

/** What to say when a file cannot be taken, in words that say what to do instead. */
export function refusalFor(name: string): string {
  const ext = extensionOf(name);
  if (isSecretFile(name)) return `${name} looks like a secrets file, so it was left out.`;
  if (ext === 'doc') return `${name} is an old Word file. Save it as .docx and attach that.`;
  if (ext === 'ppt') return `${name} is an old PowerPoint file. Save it as .pptx and attach that.`;
  if (ext === 'xls') return `${name} is an old Excel file. Save it as .xlsx and attach that.`;
  if (ext === 'heic' || ext === 'heif') return `${name} is a HEIC photo. Export it as JPEG and attach that.`;
  if (ext === 'pages' || ext === 'key' || ext === 'numbers') return `${name} is an Apple iWork file. Export it as PDF and attach that.`;
  return `${name} is not a kind of file Socria can read yet.`;
}

/** The accept list for the file picker. */
export const ACCEPT_ATTR = [
  ...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS, ...TEXT_EXTENSIONS,
].map((e) => `.${e}`).join(',');

/**
 * Per-file ceiling on extracted text, for Core 4. Larger than Logos's note
 * cap because a document is attached to be WORKED with — about 15k tokens,
 * roughly a 40-page paper.
 */
export const MAX_FILE_TEXT = 60_000;

/** Vercel refuses request bodies over 4.5 MB, so the reader stops just short. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
