// The Logos mark: a brain seen from above, drawn as separated strokes rather
// than one closed outline — the gaps are the point, since the thing it stands
// for is thinking in pieces that haven't joined up yet.
//
// Traced in the original artwork's 1080 coordinate space and then cropped by
// viewBox, so the proportions and stroke weight stay exactly as drawn. The two
// mid-branches are deliberately not mirrored: the right one starts lower than
// the left in the original, and that asymmetry is what keeps it from reading
// like a piece of clip art.

const VB = { x: 280, y: 245, w: 550, h: 626 };
const RATIO = VB.w / VB.h;

export function LogosMark({
  size = 26,
  className,
}: {
  /** rendered height in px; the width follows the artwork's proportions */
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className ? `lg-mark ${className}` : 'lg-mark'}
      width={Math.round(size * RATIO)}
      height={size}
      viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="22"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* longitudinal fissure, broken just below the middle */}
      <path d="M553 258 C 551 350 549 470 548 588" />
      <path d="M551 601 C 550 690 548 764 547 838" />

      {/* left hemisphere: four arcs with air between them */}
      <path d="M497 256 C 448 266 398 300 360 383" />
      <path d="M352 415 C 336 465 310 520 303 578" />
      <path d="M293 622 C 291 682 303 738 352 772" />
      <path d="M392 782 C 414 818 458 846 528 860" />

      {/* right hemisphere */}
      <path d="M613 256 C 662 266 712 300 750 383" />
      <path d="M758 415 C 774 465 800 520 807 578" />
      <path d="M817 622 C 819 682 807 738 758 772" />
      <path d="M718 782 C 696 818 652 846 582 860" />

      {/* folds, left */}
      <path d="M432 372 C 458 402 490 448 518 500" />
      <path d="M352 497 C 400 520 452 550 485 578 C 492 612 494 650 495 690" />
      <path d="M348 700 C 370 678 404 652 437 632" />

      {/* folds, right */}
      <path d="M678 372 C 652 402 620 448 592 500" />
      <path d="M748 520 C 706 538 656 556 625 578 C 618 612 616 650 615 690" />
      <path d="M762 700 C 740 678 706 652 673 632" />
    </svg>
  );
}
