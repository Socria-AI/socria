// components/ux-v0/studio/glyphs.tsx — the studio's marks, drawn by hand in the house style: a 24-unit box, no fill,
// the stroke in the colour of the words around it, round ends and joins, hidden from assistive technology (every glyph
// sits beside words that say the same). There is no icon library.

import type { StudioMode } from '@/lib/ux-v0/studio/schema';

type P = { size?: number; className?: string };

function G({ size = 17, className, children }: P & { children: React.ReactNode }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const Attach = (p: P) => (
  <G {...p}>
    <path d="M20 11.5 12.4 19a5 5 0 0 1-7-7l7.8-7.8a3.3 3.3 0 0 1 4.7 4.7l-7.6 7.6a1.7 1.7 0 0 1-2.4-2.4l6.9-6.9" />
  </G>
);
export const LinkMark = (p: P) => (
  <G {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </G>
);
export const Arrow = (p: P) => (
  <G {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </G>
);
export const ArrowUp = (p: P) => (
  <G {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </G>
);
export const Back = (p: P) => (
  <G {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </G>
);
export const Close = (p: P) => (
  <G {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </G>
);
export const Check = (p: P) => (
  <G {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </G>
);
export const Plus = (p: P) => (
  <G {...p}>
    <path d="M12 5v14M5 12h14" />
  </G>
);
export const Minus = (p: P) => (
  <G {...p}>
    <path d="M5 12h14" />
  </G>
);
export const Up = (p: P) => (
  <G {...p}>
    <path d="m6 15 6-6 6 6" />
  </G>
);
export const Down = (p: P) => (
  <G {...p}>
    <path d="m6 9 6 6 6-6" />
  </G>
);
/** Leaving a choice to SocriaUX: an open hand of four points, never a sparkle or a dice. */
export const Leave = (p: P) => (
  <G {...p}>
    <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
    <circle cx="12" cy="12" r="1.4" />
  </G>
);
export const Chat = (p: P) => (
  <G {...p}>
    <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V16h0a2.5 2.5 0 0 1-2-2.5z" />
  </G>
);
export const Panel = (p: P) => (
  <G {...p}>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M10 5v14" />
  </G>
);
export const Swatches = (p: P) => (
  <G {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <path d="M13 16.5h7M16.5 13v7" />
  </G>
);
export const Search = (p: P) => (
  <G {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.5-4.5" />
  </G>
);
export const Picture = (p: P) => (
  <G {...p}>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <circle cx="9.5" cy="10" r="1.6" />
    <path d="m5 17 5-4.5 3.5 3 2.5-2 3 2.5" />
  </G>
);
export const FileMark = (p: P) => (
  <G {...p}>
    <path d="M7 3.5h6.5L18 8v12.5H7z" />
    <path d="M13.5 3.5V8H18" />
  </G>
);

/** Each mode's mark: what it makes, drawn as plainly as possible. */
export function ModeGlyph({ mode, size = 22, className }: P & { mode: StudioMode }) {
  switch (mode) {
    case 'graphic':
      return (
        <G size={size} className={className}>
          <rect x="6" y="3.5" width="12" height="17" rx="1" />
          <path d="M9 8h6M9 11h4" />
          <circle cx="14" cy="16" r="2" />
        </G>
      );
    case 'website':
      return (
        <G size={size} className={className}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 9h18M7 13h6M7 16h4" />
        </G>
      );
    case 'logo':
      return (
        <G size={size} className={className}>
          <circle cx="12" cy="12" r="8" />
          <path d="M9 15.5V8.5l6 7v-7" />
        </G>
      );
    case 'system':
      return (
        <G size={size} className={className}>
          <rect x="4" y="4" width="16" height="4.5" rx="1" />
          <rect x="4" y="10" width="16" height="4.5" rx="1" />
          <rect x="4" y="16" width="9" height="4" rx="1" />
        </G>
      );
    case 'board':
      return (
        <G size={size} className={className}>
          <rect x="3" y="4" width="8" height="10" rx="1" />
          <rect x="13" y="4" width="8" height="6" rx="1" />
          <rect x="13" y="12" width="8" height="8" rx="1" />
          <rect x="3" y="16" width="8" height="4" rx="1" />
        </G>
      );
    case 'critique':
      return (
        <G size={size} className={className}>
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="m15 15 5 5M8 10.5h5" />
        </G>
      );
  }
}
