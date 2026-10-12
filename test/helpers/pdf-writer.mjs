// A small PDF writer for the document benchmark — real PDFs, with known contents.
//
// The document pipeline is judged against GROUND TRUTH, and the only way to
// know the truth of a PDF exactly is to write it: every line placed at a known
// position in a known font, every table cell known, every equation known. This
// writes PDF 1.4 by hand — the standard 14 fonts (no embedding), text drawn
// with Tj at absolute positions, optional raster images (a "scanned" page is a
// page whose only content is one image), optional lines — and nothing else.
//
// Text strings are encoded for the font: WinAnsi for the text fonts, the
// Symbol font's own encoding for mathematics (α, ∑, √, ≤, −…), so a reader is
// tested on the same font-encoding problems real papers pose.

import { deflateSync } from 'node:zlib';

// WinAnsi: Latin-1 plus the 0x80–0x9F block
const WINANSI_EXTRA = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
  'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

// the Symbol font's encoding, for the characters a paper needs
const SYMBOL = {
  α: 0x61, β: 0x62, χ: 0x63, δ: 0x64, ε: 0x65, φ: 0x66, γ: 0x67, η: 0x68, ι: 0x69, κ: 0x6b, λ: 0x6c, μ: 0x6d, ν: 0x6e, π: 0x70, θ: 0x71,
  ρ: 0x72, σ: 0x73, τ: 0x74, ω: 0x77, ξ: 0x78, ψ: 0x79, ζ: 0x7a, Δ: 0x44, Σ: 0x53, Ω: 0x57, Φ: 0x46, Γ: 0x47, Λ: 0x4c, Π: 0x50,
  '−': 0x2d, '+': 0x2b, '=': 0x3d, '(': 0x28, ')': 0x29, '[': 0x5b, ']': 0x5d, '/': 0x2f, '<': 0x3c, '>': 0x3e, '.': 0x2e, ',': 0x2c,
  '≤': 0xa3, '≥': 0xb3, '≠': 0xb9, '≈': 0xbb, '±': 0xb1, '×': 0xb4, '÷': 0xb8, '∞': 0xa5, '√': 0xd6, '∑': 0xe5, '∫': 0xf2, '∂': 0xb6,
  '∈': 0xce, '→': 0xae, '·': 0xd7, '°': 0xb0, ' ': 0x20,
  0: 0x30, 1: 0x31, 2: 0x32, 3: 0x33, 4: 0x34, 5: 0x35, 6: 0x36, 7: 0x37, 8: 0x38, 9: 0x39,
};

/** The fonts every page may use, by resource name. */
export const FONTS = {
  F1: 'Helvetica',
  F2: 'Helvetica-Bold',
  F3: 'Times-Roman',
  F4: 'Times-Italic',
  F5: 'Symbol',
  F6: 'Courier',
  F7: 'Times-Bold',
};

function encode(text, font) {
  const out = [];
  for (const ch of text) {
    let code;
    if (font === 'F5') code = SYMBOL[ch];
    else {
      const cp = ch.codePointAt(0);
      code = cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) ? cp : WINANSI_EXTRA[ch];
    }
    if (code === undefined) throw new Error(`pdf-writer: ${JSON.stringify(ch)} cannot be drawn in ${FONTS[font]}`);
    out.push(code);
  }
  // a PDF literal string: backslash, parentheses escaped; everything else as octal past ASCII
  return out
    .map((c) => (c === 0x28 || c === 0x29 || c === 0x5c ? `\\${String.fromCharCode(c)}` : c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : `\\${c.toString(8).padStart(3, '0')}`))
    .join('');
}

/**
 * A PDF from pages. Each page: { width, height, texts: [{ x, y, size, font, text }],
 * images: [{ x, y, w, h, iw, ih, gray: Uint8Array }], lines: [{ x1, y1, x2, y2, width }] }.
 * y is from the BOTTOM, as PDF has it. Returns a Buffer.
 */
export function makePdf(pages, { title } = {}) {
  const objects = []; // index i is object i+1
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add(null);
  const pagesObj = add(null);
  const fontIds = {};
  for (const [name, base] of Object.entries(FONTS)) {
    fontIds[name] = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${base}${base === 'Symbol' ? '' : ' /Encoding /WinAnsiEncoding'} >>`);
  }
  const fontRes = Object.entries(fontIds).map(([n, id]) => `/${n} ${id} 0 R`).join(' ');
  const kids = [];
  for (const p of pages) {
    const W = p.width ?? 612;
    const H = p.height ?? 792;
    const xobjs = [];
    const ops = [];
    (p.images ?? []).forEach((im, i) => {
      const data = deflateSync(Buffer.from(im.gray));
      const id = add({ dict: `<< /Type /XObject /Subtype /Image /Width ${im.iw} /Height ${im.ih} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>`, data });
      xobjs.push(`/Im${i + 1} ${id} 0 R`);
      ops.push(`q ${im.w} 0 0 ${im.h} ${im.x} ${im.y} cm /Im${i + 1} Do Q`);
    });
    for (const l of p.lines ?? []) ops.push(`${l.width ?? 0.6} w ${l.x1} ${l.y1} m ${l.x2} ${l.y2} l S`);
    for (const t of p.texts ?? []) {
      ops.push(`BT /${t.font ?? 'F1'} ${t.size ?? 10} Tf 1 0 0 1 ${t.x} ${t.y} Tm (${encode(t.text, t.font ?? 'F1')}) Tj ET`);
    }
    const stream = Buffer.from(ops.join('\n'), 'latin1');
    const content = add({ dict: `<< /Length ${stream.length} >>`, data: stream });
    const page = add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << ${fontRes} >>${xobjs.length ? ` /XObject << ${xobjs.join(' ')} >>` : ''} >> /Contents ${content} 0 R >>`);
    kids.push(page);
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = title ? add(`<< /Title (${encode(title, 'F1')}) >>`) : 0;

  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let pos = chunks[0].length;
  objects.forEach((o, i) => {
    offsets.push(pos);
    let buf;
    if (typeof o === 'string') buf = Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1');
    else buf = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${o.dict}\nstream\n`, 'latin1'), o.data, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    chunks.push(buf);
    pos += buf.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R${info ? ` /Info ${info} 0 R` : ''} >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(chunks);
}

/** Lines of text set at a font size and leading, from a top y — the shape most fixtures need. */
export function setLines(lines, { x, top, size = 10, leading = size * 1.25, font = 'F3' }) {
  return lines.map((text, i) => ({ x, y: top - i * leading, size, font, text }));
}

/** A gray "scan": a page-sized image of soft noise with darker bands where lines of text would be. */
export function scanImage(iw = 340, ih = 440, seed = 7) {
  const gray = new Uint8Array(iw * ih);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < ih; y++) {
    const band = y > 40 && y < ih - 40 && Math.floor(y / 9) % 2 === 0;
    for (let x = 0; x < iw; x++) {
      const ink = band && x > 30 && x < iw - 30 && rnd() < 0.35;
      gray[y * iw + x] = ink ? 40 + Math.floor(rnd() * 40) : 225 + Math.floor(rnd() * 25);
    }
  }
  return { gray, iw, ih };
}
