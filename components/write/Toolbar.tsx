'use client';

// components/write/Toolbar.tsx — the Writing Space's formatting bar.
//
// One quiet row over the page, in the order a word processor's has it: undo,
// the paragraph's style, the font and its size, emphasis and colour, a link,
// what can be put in, alignment and spacing, lists and indentation — and,
// only while the caret is in a table or a picture is picked out, a second row
// of what can be done to it. On a phone the same row scrolls sideways and its
// menus open as sheets from the bottom.
//
// Every button keeps the page's selection (mousedown never takes the focus),
// so a format lands on the words that were selected; a choice made with
// nothing selected is held at the caret for what is typed next.

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_FONT, DEFAULT_SIZE, FONT_KEYS, FONT_SIZES, FONTS, fontInfo, type Align, type BlockType } from '@/lib/write/doc';
import type { FormatOp, FormatState } from './Editor';

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const key = (k: string) => (isMac() ? k.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧') : k);

const STYLES: [BlockType, string][] = [
  ['p', 'Normal text'],
  ['h1', 'Heading 1'],
  ['h2', 'Heading 2'],
  ['h3', 'Heading 3'],
  ['quote', 'Quotation'],
  ['code', 'Code'],
];

// a palette a writer reaches for: the greys, then the colours, then their deeper and paler shades
const COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#d9d9d9', '#efefef', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#9900ff',
  '#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#674ea7',
  '#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#20124d',
];
const HIGHLIGHTS = ['#fff2a8', '#ffff00', '#d9f2d0', '#00ff00', '#cfe2f3', '#00ffff', '#f4cccc', '#ff00ff', '#fce5cd', '#d9d2e9'];

export interface ToolbarProps {
  state: FormatState | null;
  docFont: string | undefined;
  docSize: number | undefined;
  narrow: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onFormat: (op: FormatOp) => void;
  onLink: () => void;
  onPicture: () => void;
  onTable: (rows: number, cols: number) => void;
  onRule: () => void;
  onPageBreak: () => void;
  onFind: () => void;
  onOutline: () => void;
  onPage: () => void;
  // the table the caret is in
  onTableOp: (op: 'row-above' | 'row-below' | 'col-left' | 'col-right' | 'del-row' | 'del-col' | 'head' | 'del-table') => void;
  // the picture picked out
  onPictureOp: (op: { w?: number; align?: Align | null; alt?: true; replace?: true; remove?: true }) => void;
}

function Icon({ d, title }: { d: string; title?: string }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      {title ? <title>{title}</title> : null}
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const I = {
  undo: 'M7 6 3.5 9.5 7 13M4 9.5h7.5a4.5 4.5 0 0 1 0 9H9',
  redo: 'M13 6l3.5 3.5L13 13M16 9.5H8.5a4.5 4.5 0 0 0 0 9H11',
  link: 'M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9',
  left: 'M3.5 5h13M3.5 8.5h8.5M3.5 12h13M3.5 15.5h8.5',
  center: 'M3.5 5h13M6 8.5h8M3.5 12h13M6 15.5h8',
  right: 'M3.5 5h13M8 8.5h8.5M3.5 12h13M8 15.5h8.5',
  justify: 'M3.5 5h13M3.5 8.5h13M3.5 12h13M3.5 15.5h13',
  spacing: 'M9 5h7.5M9 10h7.5M9 15h7.5M4.5 4v12M3 6l1.5-2L6 6M3 14l1.5 2L6 14',
  bullets: 'M8 5.5h8.5M8 10h8.5M8 14.5h8.5M4 5.5h.01M4 10h.01M4 14.5h.01',
  numbers: 'M8 5.5h8.5M8 10h8.5M8 14.5h8.5M3.5 4.5l1-.5v3M3.5 9.5h1.6l-1.6 2h1.7M3.5 13.5h1.5l-.8 1 .8 1H3.5',
  outdent: 'M9 5.5h7.5M9 10h7.5M9 14.5h7.5M6 7.5 3.5 10 6 12.5',
  indent: 'M9 5.5h7.5M9 10h7.5M9 14.5h7.5M3.5 7.5 6 10l-2.5 2.5',
  plus: 'M10 4.5v11M4.5 10h11',
  more: 'M5 10h.01M10 10h.01M15 10h.01',
  picture: 'M3.5 5.5h13v9h-13zM6.5 12l2.5-3 2 2.2 1.5-1.7 2 2.5M7 8h.01',
  table: 'M3.5 4.5h13v11h-13zM3.5 8.5h13M3.5 12h13M8 4.5v11M12 4.5v11',
}

/** A menu that opens under its button (a sheet on a phone) and closes on a choice, Escape or a click away. */
function Menu({ label, title, children, open, setOpen, wide, button }: { label: React.ReactNode; title: string; children: React.ReactNode; open: boolean; setOpen: (v: boolean) => void; wide?: boolean; button?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open, setOpen]);
  return (
    <span className="w-tb-menuwrap" ref={ref}>
      <button type="button" className={`w-tb-btn${button ? ` ${button}` : ''}${open ? ' is-on' : ''}`} aria-haspopup="menu" aria-expanded={open} title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <span className={`w-tb-menu${wide ? ' is-wide' : ''}`} role="menu" onMouseDown={(e) => e.preventDefault()} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          {children}
        </span>
      )}
    </span>
  );
}

export function Toolbar(p: ToolbarProps) {
  const s = p.state;
  const [open, setOpen] = useState<string | null>(null);
  const menu = (id: string) => ({ open: open === id, setOpen: (v: boolean) => setOpen(v ? id : null) });
  const run = (op: FormatOp) => {
    setOpen(null);
    p.onFormat(op);
  };
  const block = s?.block ?? 'p';
  const styleLabel = STYLES.find(([t]) => t === block)?.[1] ?? (block === 'ul' || block === 'ol' ? 'List' : 'Normal text');
  const fontKey = s?.font ?? p.docFont ?? DEFAULT_FONT;
  const fontLabel = fontInfo(fontKey).label || 'Font';
  const size = s?.size ?? p.docSize ?? DEFAULT_SIZE;
  const [sizeText, setSizeText] = useState(String(size));
  useEffect(() => setSizeText(String(size)), [size]);
  const [grid, setGrid] = useState<[number, number]>([0, 0]);
  const flag = (t: 'b' | 'i' | 'u' | 's' | 'sup' | 'sub') => !!s?.flags[t];
  const align = s?.align ?? 'left';
  const disabled = !!s?.selected && s.selected.t !== 'img';
  const btn = (on: boolean) => `w-tb-btn${on ? ' is-on' : ''}`;
  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className={`w-tb${p.narrow ? ' is-narrow' : ''}`} role="toolbar" aria-label="Formatting">
      <div className="w-tb-row">
        <button type="button" className="w-tb-btn" title={`Undo (${key('Ctrl+Z')})`} aria-label="Undo" disabled={!p.canUndo} onMouseDown={keep} onClick={p.onUndo}>
          <Icon d={I.undo} />
        </button>
        <button type="button" className="w-tb-btn" title={`Redo (${key('Ctrl+Shift+Z')})`} aria-label="Redo" disabled={!p.canRedo} onMouseDown={keep} onClick={p.onRedo}>
          <Icon d={I.redo} />
        </button>
        <span className="w-tb-sep" aria-hidden="true" />
        <Menu label={<span className="w-tb-text is-style">{styleLabel}</span>} title="Paragraph style" button="is-wide" {...menu('style')}>
          {STYLES.map(([t, label]) => (
            <button key={t} type="button" role="menuitemradio" aria-checked={block === t} className={`w-tb-item is-${t}`} onClick={() => run({ kind: 'block', t })}>
              {label}
            </button>
          ))}
        </Menu>
        <Menu label={<span className="w-tb-text is-font" style={{ fontFamily: fontInfo(fontKey).css }}>{fontLabel}</span>} title="Font" button="is-wide" {...menu('font')}>
          {FONT_KEYS.map((k) => (
            <button key={k} type="button" role="menuitemradio" aria-checked={fontKey === k} className="w-tb-item" style={{ fontFamily: FONTS[k].css }} onClick={() => run({ kind: 'value', t: 'font', v: k === (p.docFont ?? DEFAULT_FONT) ? null : k })}>
              {FONTS[k].label}
            </button>
          ))}
          {!FONT_KEYS.includes(fontKey as never) && (
            <button type="button" role="menuitemradio" aria-checked className="w-tb-item" style={{ fontFamily: fontInfo(fontKey).css }}>
              {fontLabel}
            </button>
          )}
        </Menu>
        <span className="w-tb-size" role="group" aria-label="Font size">
          <button type="button" className="w-tb-btn is-small" title={`Smaller (${key('Ctrl+Shift+,')})`} aria-label="Smaller" onMouseDown={keep} onClick={() => run({ kind: 'size-step', dir: -1 })}>
            −
          </button>
          <input
            className="w-tb-sizein"
            value={sizeText}
            inputMode="decimal"
            aria-label="Size in points"
            list="w-sizes"
            onChange={(e) => setSizeText(e.target.value.replace(/[^\d.]/g, '').slice(0, 4))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const n = Number(sizeText);
                if (n >= 6 && n <= 96) run({ kind: 'value', t: 'size', v: String(n) });
              }
            }}
            onBlur={() => setSizeText(String(size))}
          />
          <datalist id="w-sizes">
            {FONT_SIZES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <button type="button" className="w-tb-btn is-small" title={`Larger (${key('Ctrl+Shift+.')})`} aria-label="Larger" onMouseDown={keep} onClick={() => run({ kind: 'size-step', dir: 1 })}>
            +
          </button>
        </span>
        <span className="w-tb-sep" aria-hidden="true" />
        <button type="button" className={btn(flag('b'))} aria-pressed={flag('b')} title={`Bold (${key('Ctrl+B')})`} aria-label="Bold" disabled={disabled} onMouseDown={keep} onClick={() => run({ kind: 'flag', t: 'b' })}>
          <b className="w-tb-glyph">B</b>
        </button>
        <button type="button" className={btn(flag('i'))} aria-pressed={flag('i')} title={`Italic (${key('Ctrl+I')})`} aria-label="Italic" disabled={disabled} onMouseDown={keep} onClick={() => run({ kind: 'flag', t: 'i' })}>
          <i className="w-tb-glyph">I</i>
        </button>
        <button type="button" className={btn(flag('u'))} aria-pressed={flag('u')} title={`Underline (${key('Ctrl+U')})`} aria-label="Underline" disabled={disabled} onMouseDown={keep} onClick={() => run({ kind: 'flag', t: 'u' })}>
          <u className="w-tb-glyph">U</u>
        </button>
        <Menu
          label={
            <span className="w-tb-color" aria-hidden="true">
              <span className="w-tb-glyph">A</span>
              <span className="w-tb-swatch" style={{ background: s?.color ?? 'currentColor' }} />
            </span>
          }
          title="Text colour"
          {...menu('color')}
        >
          <button type="button" role="menuitem" className="w-tb-item" onClick={() => run({ kind: 'value', t: 'color', v: null })}>
            Automatic
          </button>
          <span className="w-tb-swatches">
            {COLORS.map((c) => (
              <button key={c} type="button" role="menuitemradio" aria-checked={s?.color === c} aria-label={`Colour ${c}`} title={c} className="w-tb-chip" style={{ background: c }} onClick={() => run({ kind: 'value', t: 'color', v: c })} />
            ))}
          </span>
        </Menu>
        <Menu
          label={
            <span className="w-tb-color" aria-hidden="true">
              <span className="w-tb-glyph is-mark" style={{ background: s?.bg ?? 'transparent' }}>
                ab
              </span>
            </span>
          }
          title="Highlight"
          {...menu('bg')}
        >
          <button type="button" role="menuitem" className="w-tb-item" onClick={() => run({ kind: 'value', t: 'bg', v: null })}>
            None
          </button>
          <span className="w-tb-swatches">
            {HIGHLIGHTS.map((c) => (
              <button key={c} type="button" role="menuitemradio" aria-checked={s?.bg === c} aria-label={`Highlight ${c}`} title={c} className="w-tb-chip" style={{ background: c }} onClick={() => run({ kind: 'value', t: 'bg', v: c })} />
            ))}
          </span>
        </Menu>
        <span className="w-tb-sep" aria-hidden="true" />
        <button type="button" className={btn(!!s?.link)} title={`Link (${key('Ctrl+K')})`} aria-label="Link" onMouseDown={keep} onClick={() => (setOpen(null), p.onLink())}>
          <Icon d={I.link} />
        </button>
        <Menu label={<Icon d={I.plus} />} title="Insert" {...menu('insert')}>
          <button type="button" role="menuitem" className="w-tb-item" onClick={() => (setOpen(null), p.onPicture())}>
            <Icon d={I.picture} /> Picture…
          </button>
          <span className="w-tb-label">Table</span>
          <span className="w-tb-grid" role="group" aria-label="Table size" onMouseLeave={() => setGrid([0, 0])}>
            {Array.from({ length: 6 }, (_, r) =>
              Array.from({ length: 6 }, (_, c) => (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  className={`w-tb-gridcell${r < grid[0] && c < grid[1] ? ' is-on' : ''}`}
                  aria-label={`${r + 1} by ${c + 1} table`}
                  onMouseEnter={() => setGrid([r + 1, c + 1])}
                  onFocus={() => setGrid([r + 1, c + 1])}
                  onClick={() => (setOpen(null), p.onTable(r + 1, c + 1))}
                />
              ))
            )}
          </span>
          <span className="w-tb-label is-quiet">{grid[0] ? `${grid[0]} × ${grid[1]}` : 'Choose a size'}</span>
          <button type="button" role="menuitem" className="w-tb-item" onClick={() => (setOpen(null), p.onRule())}>
            Horizontal line
          </button>
          <button type="button" role="menuitem" className="w-tb-item" onClick={() => (setOpen(null), p.onPageBreak())}>
            Page break <kbd>{key('Ctrl+Enter')}</kbd>
          </button>
        </Menu>
        <span className="w-tb-sep" aria-hidden="true" />
        <Menu label={<Icon d={I[align]} />} title="Alignment" {...menu('align')}>
          {(['left', 'center', 'right', 'justify'] as const).map((a) => (
            <button key={a} type="button" role="menuitemradio" aria-checked={align === a} className="w-tb-item" onClick={() => (s?.selected?.t === 'img' ? (setOpen(null), p.onPictureOp({ align: a === 'left' ? null : a })) : run({ kind: 'para', patch: { align: a === 'left' ? null : a } }))}>
              <Icon d={I[a]} /> {a === 'left' ? 'Left' : a === 'center' ? 'Centre' : a === 'right' ? 'Right' : 'Justify'}{' '}
              <kbd>{key(`Ctrl+Shift+${a === 'left' ? 'L' : a === 'center' ? 'E' : a === 'right' ? 'R' : 'J'}`)}</kbd>
            </button>
          ))}
        </Menu>
        <Menu label={<Icon d={I.spacing} />} title="Line and paragraph spacing" {...menu('spacing')}>
          {[1, 1.15, 1.5, 2].map((v) => (
            <button key={v} type="button" role="menuitemradio" aria-checked={(s?.lh ?? null) === v} className="w-tb-item" onClick={() => run({ kind: 'para', patch: { lh: v } })}>
              {v === 1 ? 'Single' : v === 2 ? 'Double' : v}
            </button>
          ))}
          <button type="button" role="menuitem" className="w-tb-item" onClick={() => run({ kind: 'para', patch: { lh: null } })}>
            As the page sets it
          </button>
          <span className="w-tb-rule" />
          <button type="button" role="menuitem" className="w-tb-item" onClick={() => run({ kind: 'para', patch: { sb: 12 } })}>
            Add space before
          </button>
          <button type="button" role="menuitem" className="w-tb-item" onClick={() => run({ kind: 'para', patch: { sb: 0 } })}>
            Remove space before
          </button>
          <button type="button" role="menuitem" className="w-tb-item" onClick={() => run({ kind: 'para', patch: { sa: 12 } })}>
            Add space after
          </button>
          <button type="button" role="menuitem" className="w-tb-item" onClick={() => run({ kind: 'para', patch: { sa: 0 } })}>
            Remove space after
          </button>
        </Menu>
        <button type="button" className={btn(block === 'ul')} aria-pressed={block === 'ul'} title={`Bulleted list (${key('Ctrl+Shift+8')})`} aria-label="Bulleted list" onMouseDown={keep} onClick={() => run({ kind: 'list', t: 'ul' })}>
          <Icon d={I.bullets} />
        </button>
        <button type="button" className={btn(block === 'ol')} aria-pressed={block === 'ol'} title={`Numbered list (${key('Ctrl+Shift+7')})`} aria-label="Numbered list" onMouseDown={keep} onClick={() => run({ kind: 'list', t: 'ol' })}>
          <Icon d={I.numbers} />
        </button>
        <button type="button" className="w-tb-btn" title={`Decrease indent (${key('Ctrl+[')})`} aria-label="Decrease indent" onMouseDown={keep} onClick={() => run({ kind: 'indent', delta: -1 })}>
          <Icon d={I.outdent} />
        </button>
        <button type="button" className="w-tb-btn" title={`Increase indent (${key('Ctrl+]')})`} aria-label="Increase indent" onMouseDown={keep} onClick={() => run({ kind: 'indent', delta: 1 })}>
          <Icon d={I.indent} />
        </button>
        <span className="w-tb-sep" aria-hidden="true" />
        <Menu label={<Icon d={I.more} />} title="More formatting" {...menu('more')}>
          <button type="button" role="menuitemcheckbox" aria-checked={flag('s')} className="w-tb-item" onClick={() => run({ kind: 'flag', t: 's' })}>
            <s>Strikethrough</s> <kbd>{key('Ctrl+Shift+X')}</kbd>
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={flag('sup')} className="w-tb-item" onClick={() => run({ kind: 'flag', t: 'sup' })}>
            Superscript <kbd>{key('Ctrl+.')}</kbd>
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={flag('sub')} className="w-tb-item" onClick={() => run({ kind: 'flag', t: 'sub' })}>
            Subscript <kbd>{key('Ctrl+,')}</kbd>
          </button>
          <button type="button" role="menuitem" className="w-tb-item" onClick={() => run({ kind: 'clear' })}>
            Clear formatting <kbd>{key('Ctrl+\\')}</kbd>
          </button>
          <span className="w-tb-rule" />
          <button type="button" role="menuitem" className="w-tb-item" onClick={() => (setOpen(null), p.onFind())}>
            Find and replace <kbd>{key('Ctrl+F')}</kbd>
          </button>
          <button type="button" role="menuitem" className="w-tb-item" onClick={() => (setOpen(null), p.onOutline())}>
            Outline
          </button>
          <button type="button" role="menuitem" className="w-tb-item" onClick={() => (setOpen(null), p.onPage())}>
            Page setup…
          </button>
        </Menu>
      </div>
      {s?.cell && (
        <div className="w-tb-row is-context" role="group" aria-label="Table">
          <span className="w-tb-label">
            <Icon d={I.table} /> Table
          </span>
          <button type="button" className="w-tb-btn is-text" onMouseDown={keep} onClick={() => p.onTableOp('row-above')}>
            Row above
          </button>
          <button type="button" className="w-tb-btn is-text" onMouseDown={keep} onClick={() => p.onTableOp('row-below')}>
            Row below
          </button>
          <button type="button" className="w-tb-btn is-text" onMouseDown={keep} onClick={() => p.onTableOp('col-left')}>
            Column left
          </button>
          <button type="button" className="w-tb-btn is-text" onMouseDown={keep} onClick={() => p.onTableOp('col-right')}>
            Column right
          </button>
          <span className="w-tb-sep" aria-hidden="true" />
          <button type="button" className="w-tb-btn is-text" onMouseDown={keep} onClick={() => p.onTableOp('del-row')}>
            Delete row
          </button>
          <button type="button" className="w-tb-btn is-text" onMouseDown={keep} onClick={() => p.onTableOp('del-col')}>
            Delete column
          </button>
          <span className="w-tb-sep" aria-hidden="true" />
          <button type="button" className={`w-tb-btn is-text${s.cell.head ? ' is-on' : ''}`} aria-pressed={s.cell.head} onMouseDown={keep} onClick={() => p.onTableOp('head')}>
            Header row
          </button>
          <button type="button" className="w-tb-btn is-text is-danger" onMouseDown={keep} onClick={() => p.onTableOp('del-table')}>
            Delete table
          </button>
        </div>
      )}
      {s?.selected?.t === 'img' && (
        <div className="w-tb-row is-context" role="group" aria-label="Picture">
          <span className="w-tb-label">
            <Icon d={I.picture} /> Picture
          </span>
          {[
            [33, 'Small'],
            [60, 'Medium'],
            [100, 'Full width'],
          ].map(([w, label]) => (
            <button key={w} type="button" className="w-tb-btn is-text" onMouseDown={keep} onClick={() => p.onPictureOp({ w: w as number })}>
              {label}
            </button>
          ))}
          <span className="w-tb-sep" aria-hidden="true" />
          {(['left', 'center', 'right'] as const).map((a) => (
            <button key={a} type="button" className={btn(align === a)} aria-pressed={align === a} aria-label={`Picture ${a === 'center' ? 'centred' : `to the ${a}`}`} title={a === 'center' ? 'Centre' : a === 'left' ? 'Left' : 'Right'} onMouseDown={keep} onClick={() => p.onPictureOp({ align: a === 'left' ? null : a })}>
              <Icon d={I[a]} />
            </button>
          ))}
          <span className="w-tb-sep" aria-hidden="true" />
          <button type="button" className="w-tb-btn is-text" onMouseDown={keep} onClick={() => p.onPictureOp({ alt: true })}>
            Describe it…
          </button>
          <button type="button" className="w-tb-btn is-text" onMouseDown={keep} onClick={() => p.onPictureOp({ replace: true })}>
            Replace…
          </button>
          <button type="button" className="w-tb-btn is-text is-danger" onMouseDown={keep} onClick={() => p.onPictureOp({ remove: true })}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
