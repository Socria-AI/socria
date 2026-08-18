// The Logos mark: a brain seen from above, drawn as separated strokes rather
// than one closed outline — the gaps are the point, since the thing it stands
// for is thinking in pieces that haven't joined up yet.
//
// Inline SVG on currentColor so it inherits whatever it sits in, stays crisp
// at any size, and needs no network request. The viewBox is cropped tight to
// the drawing, so `size` is the height the mark actually occupies rather than
// the height of a mostly-empty square.

export function LogosMark({
  size = 26,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className ? `lg-mark ${className}` : 'lg-mark'}
      width={size}
      height={size}
      viewBox="234 228 644 656"
      fill="none"
      stroke="currentColor"
      strokeWidth="31"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* the longitudinal fissure, broken in the middle */}
      <path d="M556 250 C 552 344 546 468 546 590" />
      <path d="M551 602 C 549 690 548 762 547 838" />

      {/* left hemisphere, four arcs with air between them */}
      <path d="M505 262 C 462 272 424 300 385 348" />
      <path d="M370 380 C 342 434 320 494 310 554" />
      <path d="M301 598 C 299 662 317 718 352 764" />
      <path d="M390 778 C 428 818 472 846 524 862" />

      {/* right hemisphere */}
      <path d="M607 262 C 650 272 688 300 727 348" />
      <path d="M742 380 C 770 434 792 494 802 554" />
      <path d="M811 598 C 813 662 795 718 760 764" />
      <path d="M722 778 C 684 818 640 846 588 862" />

      {/* folds, left */}
      <path d="M430 374 C 460 410 490 455 515 500" />
      <path d="M358 494 C 404 518 452 546 487 578 C 494 610 496 650 497 690" />
      <path d="M356 698 C 379 674 407 651 435 632" />

      {/* folds, right */}
      <path d="M684 374 C 654 410 624 455 599 500" />
      <path d="M752 500 C 706 524 658 550 625 580 C 616 612 612 652 610 690" />
      <path d="M756 698 C 733 674 705 651 677 632" />
    </svg>
  );
}
