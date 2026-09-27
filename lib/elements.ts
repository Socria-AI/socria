// lib/elements.ts
//
// The periodic table, as data a simulation can draw with.
//
// WHY THIS IS A FILE AND NOT A PALETTE. Colour for an element is not a design
// choice — there is a convention, and chemists read it: oxygen is red, nitrogen
// blue, carbon dark grey, sulfur yellow, phosphorus orange, the halogens green.
// That is the CPK scheme, extended by Jmol to the whole table, and it is what
// every molecular viewer since the 1980s has used. Inventing our own would make
// our pictures unreadable to exactly the people most able to read them.
//
// So the colours here are the Jmol values, and the rest of each row is what a
// simulation needs to do arithmetic rather than decoration: the atomic number,
// the standard atomic weight, the group and period, and the category. A picture
// that can only colour an atom is a picture that cannot weigh it.
//
// Pure data and pure functions. No imports, nothing to configure.

export type ElementCategory =
  | 'nonmetal'
  | 'noble'
  | 'alkali'
  | 'alkaline'
  | 'metalloid'
  | 'halogen'
  | 'transition'
  | 'post-transition'
  | 'lanthanide'
  | 'actinide'
  | 'unknown';

export interface Element {
  /** atomic number */
  z: number;
  symbol: string;
  name: string;
  /** standard atomic weight, in unified atomic mass units */
  mass: number;
  /** column of the table; null for the f-block, which sits outside it */
  group: number | null;
  period: number;
  category: ElementCategory;
  /** the Jmol/CPK colour, which is the one chemists expect */
  colour: string;
}

/**
 * z, symbol, name, mass, group, period, category, colour.
 *
 * Packed as tuples rather than objects because the same data written as 118
 * object literals is four times the bytes for no gain — `ELEMENTS` below turns
 * it into the shape everything else reads.
 */
type Row = [number, string, string, number, number | null, number, ElementCategory, string];

const ROWS: Row[] = [
  [1, 'H', 'Hydrogen', 1.008, 1, 1, 'nonmetal', '#FFFFFF'],
  [2, 'He', 'Helium', 4.0026, 18, 1, 'noble', '#D9FFFF'],
  [3, 'Li', 'Lithium', 6.94, 1, 2, 'alkali', '#CC80FF'],
  [4, 'Be', 'Beryllium', 9.0122, 2, 2, 'alkaline', '#C2FF00'],
  [5, 'B', 'Boron', 10.81, 13, 2, 'metalloid', '#FFB5B5'],
  [6, 'C', 'Carbon', 12.011, 14, 2, 'nonmetal', '#909090'],
  [7, 'N', 'Nitrogen', 14.007, 15, 2, 'nonmetal', '#3050F8'],
  [8, 'O', 'Oxygen', 15.999, 16, 2, 'nonmetal', '#FF0D0D'],
  [9, 'F', 'Fluorine', 18.998, 17, 2, 'halogen', '#90E050'],
  [10, 'Ne', 'Neon', 20.180, 18, 2, 'noble', '#B3E3F5'],
  [11, 'Na', 'Sodium', 22.990, 1, 3, 'alkali', '#AB5CF2'],
  [12, 'Mg', 'Magnesium', 24.305, 2, 3, 'alkaline', '#8AFF00'],
  [13, 'Al', 'Aluminium', 26.982, 13, 3, 'post-transition', '#BFA6A6'],
  [14, 'Si', 'Silicon', 28.085, 14, 3, 'metalloid', '#F0C8A0'],
  [15, 'P', 'Phosphorus', 30.974, 15, 3, 'nonmetal', '#FF8000'],
  [16, 'S', 'Sulfur', 32.06, 16, 3, 'nonmetal', '#FFFF30'],
  [17, 'Cl', 'Chlorine', 35.45, 17, 3, 'halogen', '#1FF01F'],
  [18, 'Ar', 'Argon', 39.95, 18, 3, 'noble', '#80D1E3'],
  [19, 'K', 'Potassium', 39.098, 1, 4, 'alkali', '#8F40D4'],
  [20, 'Ca', 'Calcium', 40.078, 2, 4, 'alkaline', '#3DFF00'],
  [21, 'Sc', 'Scandium', 44.956, 3, 4, 'transition', '#E6E6E6'],
  [22, 'Ti', 'Titanium', 47.867, 4, 4, 'transition', '#BFC2C7'],
  [23, 'V', 'Vanadium', 50.942, 5, 4, 'transition', '#A6A6AB'],
  [24, 'Cr', 'Chromium', 51.996, 6, 4, 'transition', '#8A99C7'],
  [25, 'Mn', 'Manganese', 54.938, 7, 4, 'transition', '#9C7AC7'],
  [26, 'Fe', 'Iron', 55.845, 8, 4, 'transition', '#E06633'],
  [27, 'Co', 'Cobalt', 58.933, 9, 4, 'transition', '#F090A0'],
  [28, 'Ni', 'Nickel', 58.693, 10, 4, 'transition', '#50D050'],
  [29, 'Cu', 'Copper', 63.546, 11, 4, 'transition', '#C88033'],
  [30, 'Zn', 'Zinc', 65.38, 12, 4, 'transition', '#7D80B0'],
  [31, 'Ga', 'Gallium', 69.723, 13, 4, 'post-transition', '#C28F8F'],
  [32, 'Ge', 'Germanium', 72.630, 14, 4, 'metalloid', '#668F8F'],
  [33, 'As', 'Arsenic', 74.922, 15, 4, 'metalloid', '#BD80E3'],
  [34, 'Se', 'Selenium', 78.971, 16, 4, 'nonmetal', '#FFA100'],
  [35, 'Br', 'Bromine', 79.904, 17, 4, 'halogen', '#A62929'],
  [36, 'Kr', 'Krypton', 83.798, 18, 4, 'noble', '#5CB8D1'],
  [37, 'Rb', 'Rubidium', 85.468, 1, 5, 'alkali', '#702EB0'],
  [38, 'Sr', 'Strontium', 87.62, 2, 5, 'alkaline', '#00FF00'],
  [39, 'Y', 'Yttrium', 88.906, 3, 5, 'transition', '#94FFFF'],
  [40, 'Zr', 'Zirconium', 91.224, 4, 5, 'transition', '#94E0E0'],
  [41, 'Nb', 'Niobium', 92.906, 5, 5, 'transition', '#73C2C9'],
  [42, 'Mo', 'Molybdenum', 95.95, 6, 5, 'transition', '#54B5B5'],
  [43, 'Tc', 'Technetium', 98, 7, 5, 'transition', '#3B9E9E'],
  [44, 'Ru', 'Ruthenium', 101.07, 8, 5, 'transition', '#248F8F'],
  [45, 'Rh', 'Rhodium', 102.91, 9, 5, 'transition', '#0A7D8C'],
  [46, 'Pd', 'Palladium', 106.42, 10, 5, 'transition', '#006985'],
  [47, 'Ag', 'Silver', 107.87, 11, 5, 'transition', '#C0C0C0'],
  [48, 'Cd', 'Cadmium', 112.41, 12, 5, 'transition', '#FFD98F'],
  [49, 'In', 'Indium', 114.82, 13, 5, 'post-transition', '#A67573'],
  [50, 'Sn', 'Tin', 118.71, 14, 5, 'post-transition', '#668080'],
  [51, 'Sb', 'Antimony', 121.76, 15, 5, 'metalloid', '#9E63B5'],
  [52, 'Te', 'Tellurium', 127.60, 16, 5, 'metalloid', '#D47A00'],
  [53, 'I', 'Iodine', 126.90, 17, 5, 'halogen', '#940094'],
  [54, 'Xe', 'Xenon', 131.29, 18, 5, 'noble', '#429EB0'],
  [55, 'Cs', 'Caesium', 132.91, 1, 6, 'alkali', '#57178F'],
  [56, 'Ba', 'Barium', 137.33, 2, 6, 'alkaline', '#00C900'],
  [57, 'La', 'Lanthanum', 138.91, null, 6, 'lanthanide', '#70D4FF'],
  [58, 'Ce', 'Cerium', 140.12, null, 6, 'lanthanide', '#FFFFC7'],
  [59, 'Pr', 'Praseodymium', 140.91, null, 6, 'lanthanide', '#D9FFC7'],
  [60, 'Nd', 'Neodymium', 144.24, null, 6, 'lanthanide', '#C7FFC7'],
  [61, 'Pm', 'Promethium', 145, null, 6, 'lanthanide', '#A3FFC7'],
  [62, 'Sm', 'Samarium', 150.36, null, 6, 'lanthanide', '#8FFFC7'],
  [63, 'Eu', 'Europium', 151.96, null, 6, 'lanthanide', '#61FFC7'],
  [64, 'Gd', 'Gadolinium', 157.25, null, 6, 'lanthanide', '#45FFC7'],
  [65, 'Tb', 'Terbium', 158.93, null, 6, 'lanthanide', '#30FFC7'],
  [66, 'Dy', 'Dysprosium', 162.50, null, 6, 'lanthanide', '#1FFFC7'],
  [67, 'Ho', 'Holmium', 164.93, null, 6, 'lanthanide', '#00FF9C'],
  [68, 'Er', 'Erbium', 167.26, null, 6, 'lanthanide', '#00E675'],
  [69, 'Tm', 'Thulium', 168.93, null, 6, 'lanthanide', '#00D452'],
  [70, 'Yb', 'Ytterbium', 173.05, null, 6, 'lanthanide', '#00BF38'],
  [71, 'Lu', 'Lutetium', 174.97, 3, 6, 'lanthanide', '#00AB24'],
  [72, 'Hf', 'Hafnium', 178.49, 4, 6, 'transition', '#4DC2FF'],
  [73, 'Ta', 'Tantalum', 180.95, 5, 6, 'transition', '#4DA6FF'],
  [74, 'W', 'Tungsten', 183.84, 6, 6, 'transition', '#2194D6'],
  [75, 'Re', 'Rhenium', 186.21, 7, 6, 'transition', '#267DAB'],
  [76, 'Os', 'Osmium', 190.23, 8, 6, 'transition', '#266696'],
  [77, 'Ir', 'Iridium', 192.22, 9, 6, 'transition', '#175487'],
  [78, 'Pt', 'Platinum', 195.08, 10, 6, 'transition', '#D0D0E0'],
  [79, 'Au', 'Gold', 196.97, 11, 6, 'transition', '#FFD123'],
  [80, 'Hg', 'Mercury', 200.59, 12, 6, 'transition', '#B8B8D0'],
  [81, 'Tl', 'Thallium', 204.38, 13, 6, 'post-transition', '#A6544D'],
  [82, 'Pb', 'Lead', 207.2, 14, 6, 'post-transition', '#575961'],
  [83, 'Bi', 'Bismuth', 208.98, 15, 6, 'post-transition', '#9E4FB5'],
  [84, 'Po', 'Polonium', 209, 16, 6, 'post-transition', '#AB5C00'],
  [85, 'At', 'Astatine', 210, 17, 6, 'halogen', '#754F45'],
  [86, 'Rn', 'Radon', 222, 18, 6, 'noble', '#428296'],
  [87, 'Fr', 'Francium', 223, 1, 7, 'alkali', '#420066'],
  [88, 'Ra', 'Radium', 226, 2, 7, 'alkaline', '#007D00'],
  [89, 'Ac', 'Actinium', 227, null, 7, 'actinide', '#70ABFA'],
  [90, 'Th', 'Thorium', 232.04, null, 7, 'actinide', '#00BAFF'],
  [91, 'Pa', 'Protactinium', 231.04, null, 7, 'actinide', '#00A1FF'],
  [92, 'U', 'Uranium', 238.03, null, 7, 'actinide', '#008FFF'],
  [93, 'Np', 'Neptunium', 237, null, 7, 'actinide', '#0080FF'],
  [94, 'Pu', 'Plutonium', 244, null, 7, 'actinide', '#006BFF'],
  [95, 'Am', 'Americium', 243, null, 7, 'actinide', '#545CF2'],
  [96, 'Cm', 'Curium', 247, null, 7, 'actinide', '#785CE3'],
  [97, 'Bk', 'Berkelium', 247, null, 7, 'actinide', '#8A4FE3'],
  [98, 'Cf', 'Californium', 251, null, 7, 'actinide', '#A136D4'],
  [99, 'Es', 'Einsteinium', 252, null, 7, 'actinide', '#B31FD4'],
  [100, 'Fm', 'Fermium', 257, null, 7, 'actinide', '#B31FBA'],
  [101, 'Md', 'Mendelevium', 258, null, 7, 'actinide', '#B30DA6'],
  [102, 'No', 'Nobelium', 259, null, 7, 'actinide', '#BD0D87'],
  [103, 'Lr', 'Lawrencium', 266, 3, 7, 'actinide', '#C70066'],
  [104, 'Rf', 'Rutherfordium', 267, 4, 7, 'transition', '#CC0059'],
  [105, 'Db', 'Dubnium', 268, 5, 7, 'transition', '#D1004F'],
  [106, 'Sg', 'Seaborgium', 269, 6, 7, 'transition', '#D90045'],
  [107, 'Bh', 'Bohrium', 270, 7, 7, 'transition', '#E00038'],
  [108, 'Hs', 'Hassium', 269, 8, 7, 'transition', '#E6002E'],
  [109, 'Mt', 'Meitnerium', 278, 9, 7, 'unknown', '#EB0026'],
  [110, 'Ds', 'Darmstadtium', 281, 10, 7, 'unknown', '#EE0021'],
  [111, 'Rg', 'Roentgenium', 282, 11, 7, 'unknown', '#F1001D'],
  [112, 'Cn', 'Copernicium', 285, 12, 7, 'unknown', '#F40019'],
  [113, 'Nh', 'Nihonium', 286, 13, 7, 'unknown', '#F70014'],
  [114, 'Fl', 'Flerovium', 289, 14, 7, 'unknown', '#FA0010'],
  [115, 'Mc', 'Moscovium', 290, 15, 7, 'unknown', '#FC000C'],
  [116, 'Lv', 'Livermorium', 293, 16, 7, 'unknown', '#FD0008'],
  [117, 'Ts', 'Tennessine', 294, 17, 7, 'unknown', '#FE0004'],
  [118, 'Og', 'Oganesson', 294, 18, 7, 'unknown', '#FF0000'],
];

export const ELEMENTS: Element[] = ROWS.map(
  ([z, symbol, name, mass, group, period, category, colour]) => ({
    z, symbol, name, mass, group, period, category, colour,
  })
);

const BY_SYMBOL = new Map(ELEMENTS.map((e) => [e.symbol.toLowerCase(), e]));

/** By atomic number, 1-indexed. */
export function element(z: number): Element | null {
  return ELEMENTS[z - 1] ?? null;
}

/** By symbol, case-insensitively — "fe", "Fe" and "FE" are all iron. */
export function bySymbol(symbol: string): Element | null {
  return BY_SYMBOL.get(symbol.trim().toLowerCase()) ?? null;
}

/**
 * The colour for an element, by number or symbol.
 *
 * WHITE HYDROGEN IS A PROBLEM ON PAPER. The CPK convention was made for dark
 * backgrounds, and this application's ground is cream — so #FFFFFF hydrogen
 * and #D9FFFF helium disappear on it entirely. `onPaper` darkens anything too
 * pale to survive, by the same rule for every element rather than by hand, so
 * the convention is kept where it works and bent only where it would vanish.
 */
export function elementColour(which: number | string, onPaper = false): string {
  const e = typeof which === 'number' ? element(which) : bySymbol(which);
  if (!e) return '#888888';
  return onPaper ? darkenForPaper(e.colour) : e.colour;
}

/** Push a colour down until it has enough contrast against a cream ground. */
export function darkenForPaper(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  // Relative luminance, the sRGB one. Above about 0.62 nothing reads on cream.
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum <= 0.62) return `#${m[1].toLowerCase()}`;
  const k = 0.62 / lum;
  r = Math.round(r * k);
  g = Math.round(g * k);
  b = Math.round(b * k);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Everything in a category, in order — for a legend, or to colour a series. */
export function inCategory(category: ElementCategory): Element[] {
  return ELEMENTS.filter((e) => e.category === category);
}

/**
 * The elements the Big Bang actually made, with their mass fractions.
 *
 * Almost nothing, and that is the point worth showing: three minutes of
 * nucleosynthesis produced hydrogen, a quarter helium by mass, a trace of
 * deuterium and lithium, and NOTHING heavier. Every carbon atom in a reader's
 * body was made later, in a star. `Y` is the helium mass fraction, which
 * `heliumFraction()` in lib/logos-physics.ts computes rather than quotes.
 */
export function primordial(Y: number): { symbol: string; fraction: number }[] {
  const y = Math.min(0.95, Math.max(0, Y));
  return [
    { symbol: 'H', fraction: 1 - y - 3.1e-5 - 5e-10 },
    { symbol: 'He', fraction: y },
    // deuterium is hydrogen-2; it is listed under H's colour deliberately
    { symbol: 'H', fraction: 3.1e-5 },
    { symbol: 'Li', fraction: 5e-10 },
  ];
}

/**
 * What a star of a given generation is made of, roughly — for anything that
 * wants to colour "metals" as the elements they actually are.
 *
 * Solar abundances by mass, which is the mixture nearly everything in the
 * galaxy is close to: three quarters hydrogen, a quarter helium, and one and a
 * half per cent everything else, of which oxygen and carbon are most.
 */
export const SOLAR_ABUNDANCE: { symbol: string; fraction: number }[] = [
  { symbol: 'H', fraction: 0.7381 },
  { symbol: 'He', fraction: 0.2485 },
  { symbol: 'O', fraction: 0.0065 },
  { symbol: 'C', fraction: 0.0024 },
  { symbol: 'Ne', fraction: 0.0012 },
  { symbol: 'Fe', fraction: 0.0011 },
  { symbol: 'N', fraction: 0.0007 },
  { symbol: 'Si', fraction: 0.0007 },
  { symbol: 'Mg', fraction: 0.0006 },
  { symbol: 'S', fraction: 0.0004 },
];
