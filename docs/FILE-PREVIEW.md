# Native file preview (Logos 5.5)

Opening a file in Socria shows the file as itself: a PDF's own pages, a Word document laid out as Word lays it out, a deck's slides, a workbook's grid, the picture at its real size. It never shows the text Socria extracted dressed up as the document.

## Three things, kept apart

| | What it is | Where it lives | Who uses it |
|---|---|---|---|
| **The original** | The file as it was attached, byte for byte | This device (IndexedDB `socria-files`), and with a signed-in account in private storage (`socria-files` bucket, `<account digest>/<sha-256 prefix>`) | The preview, and the person (Download original) |
| **The preview** | The original drawn in the browser | Nowhere: it is drawn from the original each time it is opened | The person |
| **The reading** | The text, tables, figures and checks Socria takes from the file (lib/docs) | This device (IndexedDB `socria-docs`), and the conversation as an attachment's text | Socria: replies, citations, the Logic Map |

Socria never reads the preview, and the preview never draws the reading. The preview has a second tab, **What Socria read**, which shows the reading under a line that says plainly what it is.

## How a file travels

1. **Attached** (composer, start box). Two things happen side by side:
   - `readDocument` makes the reading, as before (`/api/files/read`, or in the browser for text). Nothing about the reading changed.
   - `keep()` (components/preview/context.tsx → lib/preview/originals.ts) hashes the file, keeps it on this device, and for a signed-in account uploads it to private storage through a one-time signed link (`POST /api/files/original`). The attachment gets `file` (the id), `size`, `mime`, `at` (lib/logos-attachments.ts).
2. **Opened** from a chip, a picture, a card in Files or the space. `findOriginal` asks this device first, then the account (`GET /api/files/original/[id]`, which returns a five-minute link). The preview draws it.
3. **Not found.** Signed out on another device, shared with someone else, or attached before originals were kept: the preview says which, plainly, and offers the reading. A photo falls back to the conversation's 720px copy and says it is a smaller copy.

## The viewers (components/preview)

| Kind | Viewer | How |
|---|---|---|
| PDF | `PdfView` | pdf.js (through unpdf, already in the bundle). Every page laid out at its own size first; a page drawn only near the screen, at the screen's sharpness; zoom redraws what is in view. A password-protected PDF says so. |
| Word (.docx) | `DocxView` | docx-preview, inside a shadow root so the document's styles and Socria's never touch. Links kept only for http(s)/mailto, opened in a new tab; scripts, frames and forms removed. |
| PowerPoint (.pptx) | `SlidesView` + lib/preview/slides.ts | Our own reader: slide size, every shape's position (placeholders inherit from the layout and master), text runs with size, weight, colour and bullets, theme colours through the master's colour map, groups, pictures, tables, backgrounds, speaker notes. Charts and SmartArt are shown as labelled boxes, never guessed at. Thumbnails, arrow keys, Present (full screen). |
| Excel (.xlsx), CSV, TSV | `SheetView` + lib/preview/sheet.ts, numfmt.ts | Our own reader: sheets as tabs, column letters and row numbers that stay in view, frozen panes, merges, widths and heights, and each cell through its number format (currency, percentages, dates, times, scientific, colours, sections). Up to 2,000 rows × 80 columns, said when there is more. |
| Images | `ImageView` | The original at its full size: fit, zoom, drag to pan, double press for real pixels. HEIC is converted in the browser. |
| Text, code, Markdown, HTML, notebooks | `TextView` | Code with line numbers; Markdown rendered (source a press away); HTML in a sandboxed frame that runs nothing and fetches nothing; Jupyter cells and outputs. |
| Others (ODT, ODP, ODS, RTF) | — | Said plainly that there is no visual preview yet, with Download original and What Socria read. |

The panel is a side panel on wide screens (the conversation stays where it is, and usable) and fills the screen on a phone, with "Back to the conversation" at the top. Escape closes it; ← → page; + − 0 zoom.

## Security and limits

- Originals are kept only for signed-in accounts, under a folder that is a digest of the account; the path is always built from the caller's own account, so no id reaches anyone else's file.
- The upload is signed only after the plan's size limit and the file's kind are checked (never a secrets file). The bucket's own ceiling is the largest plan's. A file larger than the caller's plan, uploaded around the check, is removed when it is read.
- Links to read an original last five minutes and are never cached.
- Someone a conversation is shared with sees the reading, never the original.
- Deleting a conversation removes the originals only it held; deleting the account removes all of them; the account export lists them with links.

## Tests

- `test/file-preview.test.mjs` — number formats, workbooks (styles, merges, dates, hidden sheets, caps, damaged files), CSV, decks (placeholders, bullets, notes, tables, pictures, groups, theme colours).
- `test/file-originals-route.test.mjs` — signed out, kinds, plan limits, owner-only reads, oversized uploads removed, attachments, conversation deletion, export, account deletion.
- `.journeys/file-preview.mjs`, `.journeys/file-preview-chat.mjs` — real files (a 31-page PDF, a Word report with a table and picture, a deck, a 3,000-row workbook, CSV, Markdown, code, HTML, ODT, damaged files) attached and opened, desktop and phone.
