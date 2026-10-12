// lib/docs/types.ts — what Socria knows about a document, and where each piece came from.
//
// A document is read ONCE into this structure, and everything downstream —
// the reply, the map, a chart made from one of its tables, an equation sent to
// the Plot lens — works from it. Nothing works from "the PDF" or "the text".
//
// Every piece keeps its source: the page it is on, where on that page, how it
// was read (the file's own text layer or structure, or a vision model looking
// at a picture of the page), and how sure the reading is. A block's id names
// its page and its place there ("p3.12" is the twelfth block read on page 3),
// so a citation is legible to a person and checkable by code.
//
// What a block says is VERBATIM: the text as the file holds it. Nothing here
// is a paraphrase. Interpretation — a figure described by a vision model, a
// claim on the map — lives elsewhere and points back here.
//
// PURE. Shared by the server reader, the browser and the routes.

export const DOC_FORMATS = ['pdf', 'docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'rtf', 'md', 'txt', 'csv', 'tsv', 'html', 'tex', 'ipynb', 'image', 'code'] as const;
export type DocFormat = (typeof DOC_FORMATS)[number];

export const BLOCK_KINDS = [
  'title',
  'heading',
  'paragraph',
  'list',
  'quote',
  'caption',
  'footnote',
  'table',
  'figure',
  'equation',
  'code',
  'note',
  'header',
  'footer',
] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

/**
 * How a piece was read:
 *   text        the PDF's own text layer — the characters the file holds
 *   structured  the file's own structure (Word, Excel, PowerPoint, Markdown, CSV…)
 *   vision      a vision model reading a picture of the page (a scan, a photo, a figure)
 */
export const READ_METHODS = ['text', 'structured', 'vision'] as const;
export type ReadMethod = (typeof READ_METHODS)[number];

/** What is known to be doubtful about a piece, said where the piece is shown. */
export const BLOCK_FLAGS = [
  'illegible', // part of it could not be read, and says so ([illegible])
  'uncertain', // read, but not confidently
  'handwriting', // read from handwriting
  'symbols-missing', // the file's characters could not all be decoded — mathematics especially
  'hyphen-joined', // a word broken across lines was joined
  'overprint-removed', // the file drew the same text twice (fake bold); one copy kept
  'unverified-numbers', // a vision reading holds numbers the page's own text does not
  'corrected', // the person corrected it
  'misread', // the person marked it as read wrongly
] as const;
export type BlockFlag = (typeof BLOCK_FLAGS)[number];

/** A rectangle on the page as fractions of its width and height: x0, y0, x1, y1, from the top left. */
export type Box = [number, number, number, number];

export interface DocBlock {
  /** "p3.12": page and order of reading on it — unique in the document */
  id: string;
  /** 1-based; the slide of a presentation, the sheet of a spreadsheet */
  page: number;
  kind: BlockKind;
  /** verbatim — for a table, its rows as text; for a figure, its caption or alt text */
  text: string;
  /** a heading's level (1–6); a list item's depth (1–4) */
  level?: number;
  box?: Box;
  /** the table this block is, when kind is 'table' */
  table?: string;
  /** the figure this block is, when kind is 'figure' */
  figure?: string;
  /** an equation in linear form, as close to the file as it can be put */
  tex?: string;
  method: ReadMethod;
  /** 0..1, absent when the reading is as good as the file */
  conf?: number;
  flags?: BlockFlag[];
  /** what the reading said before the person corrected it — kept so a correction can be taken back */
  was?: string;
}

export interface DocTable {
  id: string;
  page: number;
  /** cells as written; '' for an empty cell — never a guess */
  rows: string[][];
  /** how many leading rows are headings */
  head: number;
  caption?: string;
  box?: Box;
  method: ReadMethod;
  conf?: number;
  flags?: BlockFlag[];
}

/**
 * What a figure is:
 *   image     a picture (a photograph, a scan, a screenshot, a plot saved as an image)
 *   chart     a chart the file draws from numbers it holds — read into its table
 *   diagram   SmartArt and the like — its words are read, in order
 *   drawing   shapes and lines
 *   equation  an equation stored as an embedded object (Equation Editor, MathType): not readable as text, and said so
 *   object    some other embedded object
 */
export const FIGURE_KINDS = ['image', 'chart', 'diagram', 'drawing', 'equation', 'object'] as const;
export type FigureKind = (typeof FIGURE_KINDS)[number];

/** The kind of chart the file itself says a chart is. */
export const CHART_KINDS = ['bar', 'column', 'line', 'area', 'pie', 'doughnut', 'scatter', 'bubble', 'radar', 'stock', 'surface', 'combo', 'other'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

export interface DocFigure {
  id: string;
  page: number;
  kind?: FigureKind;
  /** for a chart: what kind the file says it is */
  chart?: ChartKind;
  caption?: string;
  /** the file's own description of it (alt text), when it has one */
  alt?: string;
  /**
   * A vision model's description of what it shows — an INTERPRETATION, said
   * to be one wherever it is shown, and never quoted as the document's words.
   */
  described?: string;
  /** the table holding the numbers it draws, when the file holds them (a chart made in Word, PowerPoint or Excel) */
  table?: string;
  box?: Box;
  method: ReadMethod;
}

export interface DocPage {
  n: number;
  /** the page's size in points, for drawing boxes over it */
  w?: number;
  h?: number;
  /** how the page was read; 'none' when nothing on it could be */
  method: ReadMethod | 'none';
  /** characters read from it */
  chars: number;
  /** images drawn on it */
  images: number;
  /** a scan (no usable text layer) waits for, or has had, a vision reading */
  ocr: 'none' | 'needed' | 'done' | 'failed';
  /** a hash of what was read from it, so an unchanged page is never read twice */
  hash?: string;
}

export const CHECK_IDS = ['numbers', 'duplicates', 'order', 'tables', 'equations', 'minus', 'encoding', 'scans', 'unread', 'empty'] as const;
export type CheckId = (typeof CHECK_IDS)[number];

/** One automated check of the reading, and what it found — shown with the document. */
export interface DocCheck {
  id: CheckId;
  level: 'ok' | 'warn' | 'fail';
  says: string;
  pages?: number[];
  blocks?: string[];
}

export interface SourceDoc {
  v: 1;
  /** a hash of the file's bytes — the same file is the same document */
  id: string;
  name: string;
  format: DocFormat;
  /** the document's own title, when it states one */
  title?: string;
  /** pages (slides, sheets) in the file */
  pageCount: number;
  /** the pages read, in order */
  pages: DocPage[];
  /** everything read, in reading order */
  blocks: DocBlock[];
  tables: DocTable[];
  figures: DocFigure[];
  checks: DocCheck[];
  /** pages beyond the reading limit — said, never silently dropped */
  unread?: { from: number; to: number };
  readAt?: number;
}

/** A pointer from something Socria or the person made back into a document. */
export interface Cite {
  /** the document's id */
  doc: string;
  /** the block's id ("p3.12") */
  block: string;
}

/**
 * What a claim stands on, relative to its sources:
 *   verbatim        the source says it, in these words (or near enough)
 *   derived         computed from numbers the source states
 *   interpretation  a reading of what the source says — cited, but not its words
 *   unsupported     nothing cited holds it
 */
export const GROUNDS = ['verbatim', 'derived', 'interpretation', 'unsupported'] as const;
export type Ground = (typeof GROUNDS)[number];
