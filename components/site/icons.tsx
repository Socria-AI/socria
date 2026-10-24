// components/site/icons.tsx — the line icons the landing's product pictures
// draw, verbatim from the design. The design system ships no icon library:
// every glyph is a few strokes of inline SVG in currentColor.

const PATHS = {
  back: <path d="M15 18l-6-6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  split: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M13 4.5v15" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="12.5" r="3.2" />
      <path d="M12 9.3V4.5M9.3 14.2l-4.2 2.8M14.7 14.2l4.2 2.8M12 4.5l-2.2-1.6M12 4.5l2.2-1.6M5.1 17l-1.9.2M18.9 17l1.9.2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  map: (
    <>
      <circle cx="6" cy="7" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="12" cy="17" r="2.2" />
      <path d="M8 8l3 7M16.5 7.5 13 15" />
    </>
  ),
  copy: <path d="M9 9h11v11H9zM5 15V6a2 2 0 0 1 2-2h9" />,
  retry: (
    <>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7" />
      <path d="M20 4v4.7h-4.7" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.3" />
    </>
  ),
  clip: <path d="M21 12.5 12.6 21a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.6 3.6 0 0 1 5.1 5.1l-9 9a1.8 1.8 0 0 1-2.5-2.5L15.8 7.4" />,
  down: <path d="M6 9l6 6 6-6" />,
  send: <path d="M12 19V5M6 11l6-6 6 6" />,
} as const;

export type IcoName = keyof typeof PATHS | 'more';

export function Ico({ name, size = 15, stroke = 1.8 }: { name: IcoName; size?: number; stroke?: number }) {
  if (name === 'more') {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
        <circle cx="5.5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="18.5" cy="12" r="1.6" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
