// The Logos 2 mark: a neuron — a broken ring for the cell body, five
// dendrites branching off it, and one axon running down to its terminals.
// Every stroke is separate and the ring is broken into six arcs; the gaps are
// the point, since the thing it stands for is thinking in pieces that are
// still connecting up.
//
// Traced from the 2000 px master and kept in that trace's coordinate space,
// so the proportions and the stroke weight stay as drawn; the viewBox crops
// it square around the mark. Left and right are mirror images about x = 966.

const VB = { x: 60, y: 80, w: 1812, h: 1812 };
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
      strokeWidth="66"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* the cell body: a ring broken into six arcs */}
      <path d="M882 675 A190 190 0 0 1 1050 675" />
      <path d="M808 735 A190 190 0 0 0 778 805" />
      <path d="M1122 735 A190 190 0 0 1 1153 805" />
      <path d="M778 895 A190 190 0 0 0 918 1037" />
      <path d="M1153 895 A190 190 0 0 1 1012 1037" />

      {/* upper dendrites, each forking in two */}
      <path d="M803 657 C 740 575 690 505 618 425" />
      <path d="M600 357 C 555 270 531 200 531 135" />
      <path d="M561 397 C 480 366 400 357 318 366" />
      <path d="M1129 657 C 1192 575 1242 505 1314 425" />
      <path d="M1332 357 C 1377 270 1401 200 1401 135" />
      <path d="M1371 397 C 1452 366 1532 357 1614 366" />

      {/* side dendrites */}
      <path d="M714 860 C 590 880 500 915 406 983" />
      <path d="M127 955 C 210 945 280 945 346 970" />
      <path d="M357 1035 C 295 1095 250 1165 222 1236" />
      <path d="M1218 860 C 1342 880 1432 915 1526 983" />
      <path d="M1805 955 C 1722 945 1652 945 1586 970" />
      <path d="M1575 1035 C 1637 1095 1682 1165 1710 1236" />

      {/* the axon, and its three terminals */}
      <path d="M965 1108 C 940 1280 990 1400 965 1525" />
      <path d="M965 1600 L 965 1826" />
      <path d="M916 1590 C 865 1670 812 1735 742 1802" />
      <path d="M1014 1590 C 1065 1670 1118 1735 1190 1802" />
    </svg>
  );
}
