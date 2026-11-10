// lib/preview/kinds.ts — which preview a file opens in, and how it is described.
//
// PURE. Decided by the file's name first (what the person called it), then its type,
// then the reading's format — and a kind nobody can draw is said plainly rather than
// shown as its extracted text pretending to be the document.

import { extensionOf } from '@/lib/file-kinds';

export type PreviewKind = 'pdf' | 'docx' | 'slides' | 'sheet' | 'delimited' | 'image' | 'markdown' | 'html' | 'text' | 'none';

const CODE = new Set(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'sql', 'sh', 'bash', 'zsh', 'r', 'm', 'scala', 'lua', 'pl', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'graphql', 'proto', 'dart', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'xml', 'tex', 'bib', 'log', 'txt', 'srt', 'vtt', 'rst', 'org', 'ipynb']);

export function previewKindOf(name: string, mime = '', format = ''): PreviewKind {
  const ext = extensionOf(name || '');
  if (ext === 'pdf' || mime === 'application/pdf' || format === 'pdf') return 'pdf';
  if (['docx', 'docm', 'dotx'].includes(ext) || format === 'docx') return 'docx';
  if (['pptx', 'pptm', 'ppsx'].includes(ext) || format === 'pptx') return 'slides';
  if (['xlsx', 'xlsm'].includes(ext) || format === 'xlsx') return 'sheet';
  if (['csv', 'tsv'].includes(ext) || mime === 'text/csv' || format === 'csv' || format === 'tsv') return 'delimited';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'heif'].includes(ext) || /^image\/(png|jpeg|webp|gif)$/.test(mime) || format === 'image') return 'image';
  if (['md', 'markdown'].includes(ext) || format === 'md') return 'markdown';
  if (['html', 'htm'].includes(ext) || format === 'html') return 'html';
  if (CODE.has(ext) || /^text\//.test(mime) || ['txt', 'code', 'tex', 'ipynb'].includes(format)) return 'text';
  return 'none';
}

/** The name of a kind of file, as a person would say it. */
export function kindLabel(name: string, kind: PreviewKind): string {
  const ext = extensionOf(name || '');
  const by: Record<string, string> = { pdf: 'PDF', docx: 'Word document', docm: 'Word document', pptx: 'PowerPoint', ppsx: 'PowerPoint', xlsx: 'Excel workbook', xlsm: 'Excel workbook', csv: 'CSV', tsv: 'TSV', md: 'Markdown', html: 'Web page', htm: 'Web page', odt: 'OpenDocument text', odp: 'OpenDocument slides', ods: 'OpenDocument sheet', rtf: 'Rich text', zip: 'Zip archive', ipynb: 'Notebook', txt: 'Text', json: 'JSON' };
  if (by[ext]) return by[ext];
  if (kind === 'image') return ext ? `${ext.toUpperCase()} image` : 'Image';
  if (kind === 'text') return ext ? `${ext.toUpperCase()} file` : 'Text';
  return ext ? `${ext.toUpperCase()} file` : 'File';
}

/** Bytes as a person reads them: 812 KB, 2.4 MB. */
export function sizeLabel(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Pages, slides or sheets, counted in the file's own word. */
export function countLabel(kind: PreviewKind, n: number | undefined): string {
  if (!n || n < 1) return '';
  const [one, many] = kind === 'slides' ? ['slide', 'slides'] : kind === 'sheet' ? ['sheet', 'sheets'] : ['page', 'pages'];
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The type an original is stored and downloaded under: what the browser said,
 * unless it is a type a browser would run or render as a page if the file were
 * ever opened directly — then plain bytes.
 */
export function storedTypeFor(name: string, mime = ''): string {
  const ext = extensionOf(name || '');
  const by: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    md: 'text/markdown',
    txt: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  const t = (mime || by[ext] || '').toLowerCase();
  if (!t || /html|javascript|ecmascript|svg|xml|xhtml/.test(t)) return 'application/octet-stream';
  return /^[a-z]+\/[a-z0-9.+-]{1,80}$/.test(t) ? t : 'application/octet-stream';
}
