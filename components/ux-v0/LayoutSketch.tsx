'use client';
// components/ux-v0/LayoutSketch.tsx — a layout drawn as a grey sketch, with the designer's own words in it.
//
// The layout question and the brief's layout decisions are about priority, not
// grids: what someone sees first, what sits beside what, where the words align,
// the part pictures play. Each is drawn here as a small wireframe (no colour,
// no style, only the arrangement) that carries the designer's words, their
// subject and their name, so a choice reads as their page and not as a
// template. It shows what a decision means; the design itself still varies
// everything that was left open (lib/ux-v0/layout.ts).

import type { Arrangement, LayoutAlign, Lead, PictureRole } from '@/lib/ux-v0/layout';

export interface SketchProps {
  /** what leads; nothing: open, drawn faintly */
  lead?: Lead | null;
  /** the kind of work (lib/ux-v0/intent.ts Experience) */
  kind?: string;
  /** the task a site carries, if any */
  task?: 'booking' | 'form' | null;
  /** what is booked or shown, in the designer's words */
  subject?: string;
  /** a few of the designer's words, for the headline */
  words?: string;
  arrangement?: Arrangement;
  align?: LayoutAlign;
  pictures?: PictureRole;
  /** a name for the sketch when it stands alone; beside a label that says the same, it is decorative */
  title?: string;
  className?: string;
}

const W = 120;
const H = 84;
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** A few of the designer's own words for a sketch: a name they gave ("called Fade & Co"), else how their description begins. */
export function sketchWords(text: string, subject = ''): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const named = t.match(/\b(?:called|named)\s+([A-Z0-9][\w'’&.-]*(?:\s+(?:&\s+)?[A-Z0-9][\w'’&.-]*){0,2})/);
  if (named) return named[1];
  const rest = t
    .replace(/^(i|we)\s+(want|need|would like|'d like)\s+(to\s+(make|build|design|create)\s+)?/i, '')
    .replace(/^(make|build|design|create)\s+(me\s+|us\s+)?/i, '')
    .replace(/^(an?|the|my|our)\s+/i, '')
    .replace(/^((booking|landing|web|home)\s?(page|screen|site)|website|site|homepage|app( screen)?|page|screen|dashboard|portfolio|form)\s+(for|about|of|to)\s+/i, '')
    .replace(/^(an?|the|my|our)\s+/i, '');
  const first = rest.split(/[.,;:—–!?(]/)[0].split(' ').slice(0, 3).join(' ').trim();
  return cap(first || subject || 'Your words');
}

function Pic({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g className="ls-pic">
      <rect x={x} y={y} width={w} height={h} />
      <path d={`M${x} ${y}L${x + w} ${y + h}M${x + w} ${y}L${x} ${y + h}`} />
    </g>
  );
}
const Line = ({ x, y, w }: { x: number; y: number; w: number }) => <rect className="ls-line" x={x} y={y} width={w} height={2} rx={1} />;
const Bar = ({ x, y, w, h = 4 }: { x: number; y: number; w: number; h?: number }) => <rect className="ls-ink" x={x} y={y} width={w} height={h} />;
const Act = ({ x, y, w }: { x: number; y: number; w: number }) => <rect className="ls-act" x={x} y={y} width={w} height={6} />;
const Box = ({ x, y, w, h, className = 'ls-card' }: { x: number; y: number; w: number; h: number; className?: string }) => <rect className={className} x={x} y={y} width={w} height={h} />;
function Word({ x, y, t, size = 7, anchor = 'start', n = 20 }: { x: number; y: number; t: string; size?: number; anchor?: 'start' | 'middle'; n?: number }) {
  return (
    <text className="ls-word" x={x} y={y} fontSize={size} textAnchor={anchor}>
      {cut(t, n)}
    </text>
  );
}

function times(x: number, y: number, cols: number, rows: number, w: number, h: number, gap = 4) {
  const out = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) out.push(<rect key={`t${r}-${c}`} className={`ls-tile${r === Math.min(1, rows - 1) && c === 1 ? ' is-on' : ''}`} x={x + c * (w + gap)} y={y + r * (h + gap)} width={w} height={h} />);
  return out;
}

function fields(x: number, y: number, w: number, n: number) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(<Line key={`l${i}`} x={x} y={y + i * 13} w={Math.round(w * 0.32)} />);
    out.push(<Box key={`f${i}`} className="ls-field" x={x} y={y + i * 13 + 3.5} w={w} h={7} />);
  }
  return out;
}

/** Lines of text in a column, the last one shorter. */
function lines(x: number, y: number, w: number, n: number, step = 4.5, center = false) {
  return Array.from({ length: n }, (_, i) => {
    const lw = i === n - 1 ? Math.round(w * 0.6) : w - (i % 3) * 3;
    return <Line key={`p${i}`} x={center ? x + (w - lw) / 2 : x} y={y + i * step} w={lw} />;
  });
}

function chart(x: number, y: number, w: number, h: number) {
  const pts = [0.62, 0.48, 0.55, 0.3, 0.38, 0.16].map((v, i, a) => `${(x + (i * w) / (a.length - 1)).toFixed(1)},${(y + v * h).toFixed(1)}`).join(' ');
  return (
    <g>
      <path className="ls-axis" d={`M${x} ${y}V${y + h}H${x + w}`} />
      <polyline className="ls-chart" points={pts} />
    </g>
  );
}

function statCards(y: number, h: number) {
  return [8, 44, 80].map((x) => (
    <g key={`s${x}`}>
      <Box x={x} y={y} w={32} h={h} />
      <Line x={x + 4} y={y + 4} w={14} />
      <Bar x={x + 4} y={y + h - 9} w={16} h={5} />
    </g>
  ));
}

/** The kind's own default when nothing is decided: what an open choice would most often start from. */
function openLead(kind: string): Lead {
  if (kind === 'booking') return 'task';
  if (kind === 'dashboard' || kind === 'data') return 'figures';
  if (kind === 'form' || kind === 'checkout' || kind === 'flow') return 'task';
  if (kind === 'portfolio') return 'work';
  return 'words';
}

function body(p: Required<Pick<SketchProps, 'kind' | 'subject' | 'words'>> & SketchProps, lead: Lead) {
  const pic = p.pictures !== 'none';
  const center = p.align === 'center';
  const formish = p.kind === 'form' || p.kind === 'checkout' || p.kind === 'flow' || (lead === 'task' && p.task === 'form');
  const bookingish = p.kind === 'booking' || (lead === 'task' && p.task === 'booking');
  const booked = p.subject ? `Book a ${p.subject}` : 'Choose a time';

  if (lead === 'task' && bookingish) {
    return (
      <>
        <Word x={center ? W / 2 : 8} y={18} t={booked} anchor={center ? 'middle' : 'start'} />
        {times(8, 24, 4, 3, 23, 9)}
        <Act x={center ? 46 : 84} y={68} w={28} />
      </>
    );
  }
  if (lead === 'subject') {
    if (p.arrangement === 'single')
      return (
        <>
          <Box x={8} y={14} w={104} h={24} />
          {pic && <Pic x={12} y={18} w={28} h={16} />}
          <Word x={pic ? 46 : 12} y={25} t={cap(p.subject || 'What is booked')} n={18} />
          <Line x={pic ? 46 : 12} y={29} w={40} />
          {times(8, 44, 4, 2, 23, 8)}
          <Act x={84} y={70} w={28} />
        </>
      );
    const cardX = 8;
    const cardW = p.arrangement === 'split' ? 50 : 42;
    const tx = cardX + cardW + 8;
    const tw = (112 - tx - 4) / 2;
    return (
      <>
        <Box x={cardX} y={14} w={cardW} h={60} />
        {pic && <Pic x={cardX + 4} y={18} w={cardW - 8} h={20} />}
        <Word x={cardX + 4} y={pic ? 47 : 26} t={cap(p.subject || 'What is booked')} n={Math.round(cardW / 4)} />
        <Line x={cardX + 4} y={pic ? 51 : 30} w={cardW - 14} />
        <Line x={cardX + 4} y={pic ? 55 : 34} w={cardW - 22} />
        {times(tx, 16, 2, 4, tw, 8)}
        <Act x={tx} y={66} w={112 - tx} />
      </>
    );
  }
  if (lead === 'picture' && bookingish) {
    return (
      <>
        {pic ? <Pic x={0} y={11} w={W} h={40} /> : <Box className="ls-block" x={0} y={11} w={W} h={40} />}
        <g className="ls-over">
          <Word x={center ? W / 2 : 8} y={44} t={p.words} size={8.5} anchor={center ? 'middle' : 'start'} />
        </g>
        {times(8, 57, 4, 1, 23, 9)}
        <Act x={84} y={71} w={28} />
      </>
    );
  }
  if (formish) {
    if (lead === 'why')
      return (
        <>
          <Word x={8} y={20} t={p.words} size={8} n={12} />
          {lines(8, 26, 44, 6)}
          {fields(62, 16, 50, 3)}
          <Act x={62} y={58} w={50} />
        </>
      );
    const fx = center ? 26 : 8;
    return (
      <>
        <Word x={fx} y={18} t={p.words} size={8} />
        {fields(fx, 24, 68, 3)}
        <Act x={fx} y={66} w={30} />
      </>
    );
  }
  if (lead === 'figures')
    return (
      <>
        {statCards(14, 20)}
        {chart(8, 40, 104, 18)}
        {lines(8, 64, 104, 3, 5)}
      </>
    );
  if (lead === 'trend')
    return (
      <>
        {chart(8, 14, 104, 36)}
        {statCards(56, 14)}
        <Line x={8} y={76} w={60} />
      </>
    );
  if (lead === 'detail')
    return (
      <>
        <Bar x={8} y={14} w={104} h={5} />
        {Array.from({ length: 6 }, (_, i) => (
          <g key={`r${i}`}>
            <Line x={8} y={24 + i * 8} w={40} />
            <Line x={56} y={24 + i * 8} w={26} />
            <circle className="ls-dot" cx={106} cy={25 + i * 8} r={1.8} />
          </g>
        ))}
        <path className="ls-axis" d="M8 74H112" />
      </>
    );
  if (lead === 'work')
    return (
      <>
        <Word x={8} y={18} t={p.words} size={7.5} />
        {[0, 1, 2].map((c) => [0, 1].map((r) => <Pic key={`w${c}-${r}`} x={8 + c * 36.5} y={24 + r * 27} w={31.5} h={23} />))}
      </>
    );
  if (lead === 'text')
    return (
      <>
        <Word x={center ? W / 2 : 14} y={20} t={p.words} size={9} anchor={center ? 'middle' : 'start'} />
        {lines(center ? 22 : 14, 28, 76, 10, 4.6, center)}
      </>
    );
  if (lead === 'picture')
    return (
      <>
        {pic ? <Pic x={0} y={11} w={W} h={50} /> : <Box className="ls-block" x={0} y={11} w={W} h={50} />}
        <g className="ls-over">
          <Word x={center ? W / 2 : 8} y={53} t={p.words} size={9} anchor={center ? 'middle' : 'start'} />
        </g>
        {lines(center ? 30 : 8, 67, 60, 2, 5, center)}
      </>
    );
  // a statement: the designer's words, set large
  const shape = !pic ? 'single' : p.arrangement ?? 'asymmetric';
  if (shape === 'layered')
    return (
      <>
        <Pic x={0} y={11} w={W} h={H - 11} />
        <g className="ls-over">
          <Word x={center ? W / 2 : 10} y={44} t={p.words} size={11} anchor={center ? 'middle' : 'start'} n={16} />
          <Act x={center ? 48 : 10} y={52} w={24} />
        </g>
      </>
    );
  if (shape === 'single')
    return (
      <>
        <Word x={center ? W / 2 : 8} y={32} t={p.words} size={12} anchor={center ? 'middle' : 'start'} n={16} />
        {lines(center ? 26 : 8, 40, 68, 2, 5, center)}
        <Act x={center ? 48 : 8} y={53} w={24} />
        {pic && <Pic x={8} y={64} w={104} h={16} />}
      </>
    );
  const colW = shape === 'split' ? 50 : 44;
  const px = 8 + colW + 6;
  return (
    <>
      <Word x={center ? 8 + colW / 2 : 8} y={34} t={p.words} size={10} anchor={center ? 'middle' : 'start'} n={Math.round(colW / 4.6)} />
      {lines(8, 42, colW - 4, 3, 5, center)}
      <Act x={center ? 8 + colW / 2 - 11 : 8} y={60} w={22} />
      <Pic x={px} y={14} w={112 - px} h={62} />
    </>
  );
}

/** A layout as a grey sketch: the frame of a page, its navigation, and what leads it. */
export function LayoutSketch(props: SketchProps) {
  const kind = props.kind ?? 'site';
  const open = !props.lead;
  const lead = props.lead ?? openLead(kind);
  const p = { ...props, kind, subject: props.subject ?? '', words: props.words || cap(props.subject ?? '') || 'Your words' };
  const named = !!props.title;
  return (
    <svg
      className={`ls${open ? ' is-open' : ''}${props.className ? ` ${props.className}` : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      role={named ? 'img' : undefined}
      aria-label={named ? props.title : undefined}
      aria-hidden={named ? undefined : true}
      focusable="false"
    >
      <rect className="ls-frame" x={0.5} y={0.5} width={W - 1} height={H - 1} />
      <rect className="ls-ink" x={6} y={4.5} width={12} height={3} />
      <Line x={86} y={5} w={7} />
      <Line x={96} y={5} w={7} />
      <Line x={106} y={5} w={7} />
      {body(p, lead)}
    </svg>
  );
}
