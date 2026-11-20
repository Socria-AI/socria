// lib/ux-v0/graphics/composition/schema.ts — the Composition Plan: how a graphic is organised, decided before it is drawn.
//
// Style decides the visual language (styles/*): the faces, the palette, the shapes, the surface. Composition decides
// how that language is spent in space: where the eye lands first, what it reads next, how the frame is divided, how
// the words, the pictures and the geometry relate. The two are planned apart, so one style can be composed many ways
// and one composition can be spoken in many styles.
//
// A Composition Plan names a FAMILY (sixty, in five groups: geometric and spatial, typography-driven, image-driven,
// experimental, information-oriented), the family's own PARAMETERS (each family varies inside itself: a radial
// composition may centre on the frame or on a corner beyond it, carry its words inside the circle, round it or beneath
// it), the hierarchy and the reading order, the typography's part in the structure, the picture's, the shapes', the
// layering, the negative space, the density, a seed, and the RELATIONSHIPS that hold it together (anchored, aligned,
// contained, overlapping, avoiding, surrounding, along a path…), each hard, soft or a preference.
//
// The plan is not the document. It is validated here (normalizeCompositionPlan: unknown families refused, parameters
// clamped to their ranges, relationships held to the grammar), kept with the artboard it made as a record of how it
// was composed, and drawn by the solver (render.ts) into ordinary editable objects. A plan from anywhere — the
// planner, the explorer, an edit in words, a model — goes through the same door.

export const COMPOSITION_SCHEMA = 1;

export const FAMILY_GROUPS = ['geometric', 'typography', 'image', 'experimental', 'information'] as const;
export type FamilyGroup = (typeof FAMILY_GROUPS)[number];
export const GROUP_LABEL: Record<FamilyGroup, string> = {
  geometric: 'Geometric and spatial',
  typography: 'Typography-driven',
  image: 'Image-driven',
  experimental: 'Experimental',
  information: 'Information-oriented',
};

/** Nine places in the frame. */
export const ANCHORS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'] as const;
export type Anchor = (typeof ANCHORS)[number];
export const READINGS = ['down', 'across', 'diagonal', 'radial', 'z', 'around', 'free'] as const;
export type Reading = (typeof READINGS)[number];
export const FOCALS = ['type', 'image', 'shape', 'pattern', 'data'] as const;
export type Focal = (typeof FOCALS)[number];
/** How the words take part in the structure. */
export const TYPE_MODES = ['stacked', 'line', 'vertical', 'rotated', 'arc', 'ring', 'wave', 'cropped', 'repeated', 'collage', 'narrow', 'outline', 'fill'] as const;
export type TypeMode = (typeof TYPE_MODES)[number];
export const HIERARCHIES = ['scale', 'contrast', 'position', 'colour', 'image', 'typographic', 'isolation', 'repetition'] as const;
export type Hierarchy = (typeof HIERARCHIES)[number];
export const LAYERINGS = ['flat', 'overlap', 'deep', 'interleaved'] as const;
export type Layering = (typeof LAYERINGS)[number];
export const SPACES = ['generous', 'balanced', 'tight', 'directional'] as const;
export type Space = (typeof SPACES)[number];

/** The relationships the grammar can state (grammar.ts says what each means and checks it). */
export const RELATION_KINDS = [
  'align',
  'distribute',
  'contain',
  'overlap',
  'anchor',
  'center',
  'offset',
  'rotate',
  'scale',
  'crop',
  'mask',
  'group',
  'repeat',
  'mirror',
  'surround',
  'intersect',
  'follow-path',
  'spacing',
  'hierarchy',
  'contrast',
  'negative-space',
  'avoid',
] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];
/** What a relationship can name: the parts of a composition, the frame and its safe area. */
export const PARTS = ['headline', 'subhead', 'meta', 'cta', 'brand', 'body', 'items', 'details', 'image', 'figure', 'field', 'frame', 'pattern', 'artboard', 'safe'] as const;
export type Part = (typeof PARTS)[number];
export const PRIORITIES = ['hard', 'soft', 'aesthetic'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Relation {
  kind: RelationKind;
  a: Part;
  b?: Part;
  /** where (anchor, align: which edge or corner) */
  at?: Anchor;
  /** an amount: degrees for rotate, a multiple for scale, a share of the frame for spacing and negative space */
  value?: number;
  priority: Priority;
}

export interface ParamSpec {
  key: string;
  label: string;
  /** numbers vary continuously within [min, max]; choices are one of a list */
  min?: number;
  max?: number;
  choices?: readonly string[];
  def: number | string;
}

export interface FamilyInfo {
  id: string;
  label: string;
  group: FamilyGroup;
  /** what it is, for a person choosing it */
  description: string;
  focal: Focal;
  /** a picture: required (an image-led family needs one), optional, or unused */
  image: 'required' | 'optional' | 'none';
  /** numbers to chart: required by a data-led family (none are ever invented) */
  data?: boolean;
  /** 0 asymmetric … 100 symmetric, as the family usually is */
  symmetry: number;
  /** the density it works within, 0 sparse … 100 dense */
  density: readonly [number, number];
  reading: Reading;
  /** 0 conventional … 100 experimental */
  experimental: number;
  /** a banner's very wide frame suits it */
  wide?: boolean;
  params: readonly ParamSpec[];
  /** the relationships it is built on */
  relations: readonly RelationKind[];
}

const n = (key: string, label: string, min: number, max: number, def: number): ParamSpec => ({ key, label, min, max, def });
const c = (key: string, label: string, choices: readonly string[], def?: string): ParamSpec => ({ key, label, choices, def: def ?? choices[0] });
const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

/** The sixty families: flexible structural approaches, each varying inside itself by its parameters. */
export const FAMILIES: readonly FamilyInfo[] = [
  // ── geometric and spatial ──
  {
    id: 'radial',
    label: 'Radial',
    group: 'geometric',
    description: 'Everything radiates from one centre: sectors, rays or petals, the words inside, round or beneath it.',
    focal: 'shape',
    image: 'optional',
    symmetry: 70,
    density: [30, 75],
    reading: 'radial',
    experimental: 35,
    params: [c('center', 'Centre', ['mc', 'tc', 'bc', 'tl', 'br', 'ml', 'mr']), n('count', 'Divisions', 6, 24, 12), c('text', 'Words', ['inside', 'beneath', 'ring', 'beside']), c('figure', 'Figure', ['sectors', 'rays', 'dots', 'petals'])],
    relations: ['center', 'surround', 'repeat', 'contain'],
  },
  {
    id: 'concentric',
    label: 'Concentric',
    group: 'geometric',
    description: 'Rings within rings about one point, the words in the core or crossing them.',
    focal: 'shape',
    image: 'optional',
    symmetry: 75,
    density: [25, 65],
    reading: 'radial',
    experimental: 30,
    params: [n('rings', 'Rings', 3, 8, 5), c('center', 'Centre', ['mc', 'tc', 'bc', 'ml', 'mr', 'tl', 'br']), c('ring', 'Ring', ['circle', 'square', 'polygon']), c('text', 'Words', ['core', 'beneath', 'crossing'])],
    relations: ['center', 'repeat', 'surround', 'contain'],
  },
  {
    id: 'diagonal',
    label: 'Diagonal',
    group: 'geometric',
    description: 'The frame read on a slant: bands across it, the words along or against them, the details in the far corner.',
    focal: 'type',
    image: 'optional',
    symmetry: 15,
    density: [30, 70],
    reading: 'diagonal',
    experimental: 40,
    params: [n('angle', 'Angle', -38, 38, -24), n('bands', 'Bands', 1, 3, 2), c('text', 'Words', ['along', 'across', 'corner'])],
    relations: ['rotate', 'align', 'anchor', 'intersect'],
  },
  {
    id: 'axial',
    label: 'Axial',
    group: 'geometric',
    description: 'One axis organises the frame; the parts hang from it, alternating or to one side.',
    focal: 'type',
    image: 'optional',
    symmetry: 45,
    density: [25, 60],
    reading: 'down',
    experimental: 25,
    params: [c('axis', 'Axis', ['vertical', 'horizontal']), n('at', 'Axis position', 0.3, 0.7, 0.42), c('rhythm', 'Rhythm', ['alternate', 'one-side', 'mirrored'])],
    relations: ['align', 'anchor', 'distribute'],
  },
  {
    id: 'symmetrical',
    label: 'Symmetrical',
    group: 'geometric',
    description: 'Mirrored about the centre line: the words on the axis, the figures in pairs, a frame if it suits.',
    focal: 'type',
    image: 'optional',
    symmetry: 100,
    density: [25, 65],
    reading: 'down',
    experimental: 10,
    params: [c('frame', 'Frame', ['none', 'arch', 'border', 'medallion']), c('head', 'Headline', ['top', 'middle', 'bottom']), c('motif', 'Figures', ['pair', 'crown', 'base'])],
    relations: ['mirror', 'center', 'align'],
  },
  {
    id: 'asymmetrical',
    label: 'Asymmetrical',
    group: 'geometric',
    description: 'A weighted balance: one large mass in a third, the words set against it in the opposite one.',
    focal: 'shape',
    image: 'optional',
    symmetry: 10,
    density: [30, 65],
    reading: 'z',
    experimental: 30,
    params: [c('mass', 'Mass', ['left', 'right', 'top', 'bottom']), n('size', 'Mass size', 0.4, 0.9, 0.65), c('head', 'Headline', CORNERS)],
    relations: ['anchor', 'avoid', 'negative-space'],
  },
  {
    id: 'modular-grid',
    label: 'Modular grid',
    group: 'geometric',
    description: 'A grid of modules: the headline takes a span of them, figures and colour fill others.',
    focal: 'type',
    image: 'optional',
    symmetry: 55,
    density: [45, 85],
    reading: 'z',
    experimental: 20,
    params: [n('rows', 'Rows', 3, 6, 4), n('cols', 'Columns', 2, 4, 3), c('span', 'Headline span', ['wide', 'tall', 'corner']), n('fill', 'Filled modules', 0.3, 0.8, 0.5)],
    relations: ['contain', 'align', 'distribute', 'spacing'],
  },
  {
    id: 'column-grid',
    label: 'Column grid',
    group: 'geometric',
    description: 'Columns shown by rules: the headline spans some, the details keep to one.',
    focal: 'type',
    image: 'optional',
    symmetry: 30,
    density: [30, 70],
    reading: 'down',
    experimental: 10,
    params: [n('cols', 'Columns', 3, 6, 4), n('start', 'Headline starts at column', 0, 2, 0), c('rules', 'Rules', ['on', 'off']), c('head', 'Headline', ['top', 'middle', 'bottom'])],
    relations: ['align', 'contain', 'spacing'],
  },
  {
    id: 'hierarchical-grid',
    label: 'Hierarchical grid',
    group: 'geometric',
    description: 'Unequal regions in proportion: a large one for what leads, smaller ones for what follows.',
    focal: 'type',
    image: 'optional',
    symmetry: 25,
    density: [35, 70],
    reading: 'z',
    experimental: 15,
    params: [n('split', 'Proportion', 0.5, 0.72, 0.62), c('orient', 'Divided in', ['rows', 'columns']), c('lead', 'Leads', ['type', 'figure'])],
    relations: ['contain', 'hierarchy', 'align'],
  },
  {
    id: 'broken-grid',
    label: 'Broken grid',
    group: 'geometric',
    description: 'A grid kept and then broken: one part pushed off its lines across the others.',
    focal: 'type',
    image: 'optional',
    symmetry: 20,
    density: [40, 75],
    reading: 'z',
    experimental: 50,
    params: [n('cols', 'Columns', 3, 5, 4), c('break', 'What breaks it', ['headline', 'figure', 'both']), n('offset', 'Offset', 0.05, 0.25, 0.12)],
    relations: ['align', 'offset', 'overlap'],
  },
  {
    id: 'isometric',
    label: 'Isometric',
    group: 'geometric',
    description: 'Space drawn in isometric projection: blocks and planes, the words set on a plane or above it.',
    focal: 'shape',
    image: 'none',
    symmetry: 35,
    density: [40, 75],
    reading: 'diagonal',
    experimental: 45,
    params: [n('cubes', 'Blocks', 3, 9, 5), c('head', 'Headline', ['above', 'plane', 'beside']), c('tilt', 'Leaning', ['left', 'right'])],
    relations: ['repeat', 'align', 'rotate'],
  },
  {
    id: 'spiral',
    label: 'Spiral',
    group: 'geometric',
    description: 'A spiral of elements winding to a centre, the words at its eye or along its turn.',
    focal: 'shape',
    image: 'optional',
    symmetry: 30,
    density: [35, 75],
    reading: 'around',
    experimental: 50,
    params: [n('turns', 'Turns', 2, 5, 3), c('center', 'Eye', ['mc', 'tl', 'br', 'bl', 'tr']), c('text', 'Words', ['center', 'beside', 'path'])],
    relations: ['follow-path', 'repeat', 'center'],
  },
  {
    id: 'circular',
    label: 'Circular',
    group: 'geometric',
    description: 'The composition held in one great circle: the words inside it, round its edge, or both.',
    focal: 'shape',
    image: 'optional',
    symmetry: 80,
    density: [25, 60],
    reading: 'around',
    experimental: 25,
    params: [n('size', 'Circle', 0.6, 1, 0.82), c('at', 'Circle at', ['mc', 'tc', 'bc']), c('text', 'Words', ['inside', 'arc', 'both'])],
    relations: ['contain', 'surround', 'center', 'follow-path'],
  },
  {
    id: 'angular',
    label: 'Angular',
    group: 'geometric',
    description: 'The frame cut by sharp angled planes; the words aligned to one of the cuts.',
    focal: 'shape',
    image: 'optional',
    symmetry: 15,
    density: [35, 70],
    reading: 'diagonal',
    experimental: 40,
    params: [n('planes', 'Planes', 2, 5, 3), n('angle', 'Cut', 12, 40, 24), c('head', 'Headline', ['plane', 'ground'])],
    relations: ['intersect', 'rotate', 'align'],
  },
  {
    id: 'layered-geometry',
    label: 'Layered geometry',
    group: 'geometric',
    description: 'Geometric planes stacked and mixing where they overlap, the words over the stack or beside it.',
    focal: 'shape',
    image: 'optional',
    symmetry: 35,
    density: [40, 75],
    reading: 'free',
    experimental: 35,
    params: [n('planes', 'Planes', 3, 6, 4), n('offset', 'Offset', 0.03, 0.12, 0.07), c('blend', 'Mixing', ['multiply', 'normal']), c('head', 'Headline', ['over', 'beside'])],
    relations: ['overlap', 'offset', 'repeat'],
  },
  // ── typography-driven ──
  {
    id: 'typography-dominant',
    label: 'Typography-dominant',
    group: 'typography',
    description: 'The words are the composition: the headline as large as the frame allows, little else.',
    focal: 'type',
    image: 'none',
    symmetry: 40,
    density: [35, 80],
    reading: 'down',
    experimental: 20,
    params: [c('at', 'Headline', ['middle', 'top', 'bottom']), c('align', 'Alignment', ['left', 'center', 'right']), c('figure', 'Accompaniment', ['none', 'rule', 'small'])],
    relations: ['hierarchy', 'anchor', 'contain'],
  },
  {
    id: 'oversized-cropped-typography',
    label: 'Oversized cropped type',
    group: 'typography',
    description: 'The headline drawn larger than the frame and cut by its edge, as an image; set again, whole, to be read.',
    focal: 'type',
    image: 'none',
    symmetry: 20,
    density: [50, 90],
    reading: 'free',
    experimental: 55,
    params: [c('edge', 'Cut by', ['left', 'right', 'top', 'bottom']), n('scale', 'Scale', 1.4, 3, 2), c('real', 'Readable headline', ['corner', 'beneath', 'beside'])],
    relations: ['crop', 'scale', 'hierarchy'],
  },
  {
    id: 'text-as-image',
    label: 'Text as image',
    group: 'typography',
    description: 'The headline treated as the picture: filled with pattern, outlined and stacked, extruded or graded.',
    focal: 'type',
    image: 'none',
    symmetry: 45,
    density: [35, 75],
    reading: 'down',
    experimental: 45,
    params: [c('treatment', 'Treatment', ['pattern-fill', 'outline-stack', 'extrude', 'gradient']), c('at', 'Headline', ['middle', 'top', 'bottom'])],
    relations: ['hierarchy', 'mask', 'contain'],
  },
  {
    id: 'vertical-typography',
    label: 'Vertical typography',
    group: 'typography',
    description: 'The headline turned on its side up one edge; the details read across the rest.',
    focal: 'type',
    image: 'optional',
    symmetry: 20,
    density: [30, 65],
    reading: 'down',
    experimental: 35,
    params: [c('edge', 'Edge', ['left', 'right']), c('details', 'Details', ['bottom', 'top', 'beside'])],
    relations: ['rotate', 'anchor', 'align'],
  },
  {
    id: 'rotational-typography',
    label: 'Rotational typography',
    group: 'typography',
    description: 'Words set at an angle to the frame and to each other: a turned headline, the details crossing it.',
    focal: 'type',
    image: 'optional',
    symmetry: 15,
    density: [35, 70],
    reading: 'diagonal',
    experimental: 50,
    params: [c('angle', 'Angle', ['-90', '-45', '-15', '15', '45']), c('echo', 'Crossing line', ['none', 'cross']), c('at', 'Centred on', ['mc', 'tl', 'br'])],
    relations: ['rotate', 'intersect', 'center'],
  },
  {
    id: 'experimental-line-breaking',
    label: 'Experimental line-breaking',
    group: 'typography',
    description: 'The headline broken word by word into a narrow, ragged column, set off the axis.',
    focal: 'type',
    image: 'none',
    symmetry: 15,
    density: [30, 70],
    reading: 'down',
    experimental: 55,
    params: [n('width', 'Column', 0.4, 0.64, 0.5), c('align', 'Ragged', ['left', 'right', 'center']), c('at', 'Column at', ['tl', 'tr', 'bl', 'mc'])],
    relations: ['anchor', 'align', 'negative-space'],
  },
  {
    id: 'typographic-collage',
    label: 'Typographic collage',
    group: 'typography',
    description: 'Each word in a face and colour of its own, cut and pasted on plates, as one headline.',
    focal: 'type',
    image: 'none',
    symmetry: 20,
    density: [50, 85],
    reading: 'free',
    experimental: 60,
    params: [n('faces', 'Faces', 2, 4, 3), c('plates', 'Plates', ['on', 'off']), n('tilt', 'Tilt', 0, 12, 5)],
    relations: ['overlap', 'rotate', 'group'],
  },
  {
    id: 'repeated-typography',
    label: 'Repeated typography',
    group: 'typography',
    description: 'The headline repeated behind itself, fading or outlined, the original standing out.',
    focal: 'type',
    image: 'none',
    symmetry: 40,
    density: [45, 85],
    reading: 'down',
    experimental: 40,
    params: [n('count', 'Copies', 3, 9, 5), c('dir', 'Direction', ['down', 'diagonal', 'across']), n('fade', 'Fade', 0.3, 0.9, 0.6)],
    relations: ['repeat', 'offset', 'hierarchy'],
  },
  {
    id: 'minimal-typographic-hierarchy',
    label: 'Minimal typographic hierarchy',
    group: 'typography',
    description: 'Few words, precisely sized and placed: the space is most of the design.',
    focal: 'type',
    image: 'none',
    symmetry: 20,
    density: [5, 30],
    reading: 'down',
    experimental: 15,
    params: [c('corner', 'Set in', CORNERS), n('size', 'Headline scale', 0.4, 0.7, 0.55), c('mark', 'Mark', ['dot', 'rule', 'none'])],
    relations: ['anchor', 'negative-space', 'align'],
  },
  {
    id: 'dense-editorial-typography',
    label: 'Dense editorial typography',
    group: 'typography',
    description: 'An editorial page: a strong headline over ruled columns of the other words, set close.',
    focal: 'type',
    image: 'optional',
    symmetry: 35,
    density: [60, 95],
    reading: 'down',
    experimental: 15,
    params: [n('cols', 'Columns', 2, 4, 3), c('rules', 'Rules', ['heavy', 'hair']), c('head', 'Headline', ['masthead', 'column'])],
    relations: ['align', 'distribute', 'spacing'],
  },
  // ── image-driven ──
  {
    id: 'full-bleed-photography',
    label: 'Full-bleed photography',
    group: 'image',
    description: 'The picture fills the frame; the words on a ground of their own over it.',
    focal: 'image',
    image: 'required',
    symmetry: 40,
    density: [40, 80],
    reading: 'down',
    experimental: 10,
    wide: true,
    params: [c('text', 'Words', ['bl', 'tl', 'br', 'mc', 'band']), c('overlay', 'Ground for the words', ['plate', 'gradient', 'none'])],
    relations: ['contain', 'contrast', 'anchor'],
  },
  {
    id: 'split-image',
    label: 'Split image',
    group: 'image',
    description: 'The picture and the words share the frame, side by side or one above the other.',
    focal: 'image',
    image: 'required',
    symmetry: 50,
    density: [35, 70],
    reading: 'across',
    experimental: 10,
    wide: true,
    params: [c('side', 'Picture', ['left', 'right', 'top', 'bottom']), n('ratio', 'Picture share', 0.4, 0.65, 0.55)],
    relations: ['align', 'contain', 'avoid'],
  },
  {
    id: 'image-collage',
    label: 'Image collage',
    group: 'image',
    description: 'Several cuts of the pictures laid over each other at slight angles, the headline across them.',
    focal: 'image',
    image: 'required',
    symmetry: 20,
    density: [55, 90],
    reading: 'free',
    experimental: 45,
    params: [n('tiles', 'Pieces', 3, 6, 4), n('tilt', 'Tilt', 0, 10, 5), c('head', 'Headline', ['over', 'band'])],
    relations: ['overlap', 'rotate', 'crop'],
  },
  {
    id: 'masked-image',
    label: 'Masked image',
    group: 'image',
    description: 'The picture cut to a shape of the language: a circle, an arch, a blob or a polygon.',
    focal: 'image',
    image: 'required',
    symmetry: 45,
    density: [30, 65],
    reading: 'down',
    experimental: 25,
    params: [c('mask', 'Shape', ['circle', 'arch', 'blob', 'polygon']), c('at', 'Shape at', ['tc', 'mc', 'tr', 'ml']), n('size', 'Size', 0.5, 0.9, 0.7)],
    relations: ['mask', 'anchor', 'avoid'],
  },
  {
    id: 'cinematic-focal',
    label: 'Cinematic focal',
    group: 'image',
    description: 'The picture in a wide letterbox band on a dark field, credited like a film.',
    focal: 'image',
    image: 'required',
    symmetry: 60,
    density: [30, 60],
    reading: 'down',
    experimental: 20,
    wide: true,
    params: [c('band', 'Band', ['middle', 'top', 'bottom']), n('ratio', 'Band proportion', 2, 2.6, 2.35)],
    relations: ['contain', 'center', 'align'],
  },
  {
    id: 'multi-image-editorial',
    label: 'Multi-image editorial',
    group: 'image',
    description: 'Pictures in an editorial arrangement of unequal frames, captioned.',
    focal: 'image',
    image: 'required',
    symmetry: 35,
    density: [55, 90],
    reading: 'z',
    experimental: 20,
    params: [c('pattern', 'Arrangement', ['row', 'grid', 'stack']), c('captions', 'Captions', ['on', 'off'])],
    relations: ['align', 'distribute', 'crop'],
  },
  {
    id: 'image-with-negative-space',
    label: 'Image with negative space',
    group: 'image',
    description: 'A small picture placed with intent in a large quiet field; the words small and exact.',
    focal: 'image',
    image: 'required',
    symmetry: 20,
    density: [10, 35],
    reading: 'down',
    experimental: 25,
    params: [c('corner', 'Picture at', ['tl', 'tr', 'bl', 'br', 'mc']), n('size', 'Picture size', 0.32, 0.56, 0.44)],
    relations: ['anchor', 'negative-space', 'align'],
  },
  {
    id: 'image-as-background',
    label: 'Image as background',
    group: 'image',
    description: 'The picture behind everything, toned down in the language’s colour; the headline large over it.',
    focal: 'type',
    image: 'required',
    symmetry: 45,
    density: [40, 75],
    reading: 'down',
    experimental: 15,
    wide: true,
    params: [n('tint', 'Tone', 0.3, 0.8, 0.55), c('text', 'Words', ['mc', 'bl', 'tl'])],
    relations: ['contain', 'contrast', 'overlap'],
  },
  {
    id: 'framed-imagery',
    label: 'Framed imagery',
    group: 'image',
    description: 'The picture mounted in a frame or mat, captioned like a print on a wall.',
    focal: 'image',
    image: 'required',
    symmetry: 70,
    density: [25, 55],
    reading: 'down',
    experimental: 10,
    params: [c('frame', 'Frame', ['mat', 'thick', 'double']), c('caption', 'Caption', ['below', 'beside'])],
    relations: ['contain', 'center', 'align'],
  },
  {
    id: 'fragmented-imagery',
    label: 'Fragmented imagery',
    group: 'image',
    description: 'The picture cut into strips or shards, slid out of register.',
    focal: 'image',
    image: 'required',
    symmetry: 25,
    density: [45, 80],
    reading: 'free',
    experimental: 55,
    params: [n('strips', 'Strips', 3, 8, 5), c('dir', 'Cut', ['vertical', 'horizontal', 'diagonal']), n('offset', 'Slide', 0.02, 0.1, 0.05)],
    relations: ['crop', 'offset', 'repeat'],
  },
  // ── experimental ──
  {
    id: 'freeform',
    label: 'Freeform',
    group: 'experimental',
    description: 'Parts placed by eye rather than grid, balanced by weight, each where it is furthest from the rest.',
    focal: 'shape',
    image: 'optional',
    symmetry: 20,
    density: [30, 70],
    reading: 'free',
    experimental: 55,
    params: [n('elements', 'Figures', 3, 6, 4), c('balance', 'Balance', ['weighted', 'spread'])],
    relations: ['avoid', 'distribute', 'negative-space'],
  },
  {
    id: 'controlled-chaos',
    label: 'Controlled chaos',
    group: 'experimental',
    description: 'Many figures thrown across the frame, turned and overlapping; the words held on a calm ground.',
    focal: 'pattern',
    image: 'optional',
    symmetry: 10,
    density: [70, 95],
    reading: 'free',
    experimental: 75,
    params: [n('count', 'Figures', 12, 40, 24), n('rotation', 'Turn', 0, 90, 45), c('plate', 'Ground for the words', ['on', 'off'])],
    relations: ['repeat', 'rotate', 'overlap', 'contrast'],
  },
  {
    id: 'fragmented',
    label: 'Fragmented',
    group: 'experimental',
    description: 'The whole composition cut into shards and slid apart, the words still whole.',
    focal: 'shape',
    image: 'optional',
    symmetry: 15,
    density: [45, 80],
    reading: 'free',
    experimental: 70,
    params: [n('shards', 'Shards', 3, 7, 4), n('offset', 'Slide', 0.02, 0.12, 0.06), c('dir', 'Cut', ['vertical', 'diagonal', 'horizontal'])],
    relations: ['crop', 'offset', 'group'],
  },
  {
    id: 'deconstructed',
    label: 'Deconstructed',
    group: 'experimental',
    description: 'A grid taken apart: rules misaligned, blocks slipped, the words just off where they would be.',
    focal: 'type',
    image: 'optional',
    symmetry: 15,
    density: [40, 75],
    reading: 'free',
    experimental: 70,
    params: [n('displace', 'Slip', 0.03, 0.15, 0.08), n('rules', 'Rules', 2, 6, 4), n('tilt', 'Tilt', 0, 8, 3)],
    relations: ['offset', 'rotate', 'overlap'],
  },
  {
    id: 'layered-collage',
    label: 'Layered collage',
    group: 'experimental',
    description: 'Layers of cut paper and colour stacked with shadows; the words on the top layer.',
    focal: 'shape',
    image: 'optional',
    symmetry: 20,
    density: [50, 85],
    reading: 'free',
    experimental: 50,
    params: [n('layers', 'Layers', 3, 6, 4), c('shadow', 'Shadow', ['soft', 'hard']), c('head', 'Headline', ['top', 'torn'])],
    relations: ['overlap', 'offset', 'group'],
  },
  {
    id: 'extreme-asymmetry',
    label: 'Extreme asymmetry',
    group: 'experimental',
    description: 'Everything pushed into one corner; the rest of the frame left empty on purpose.',
    focal: 'type',
    image: 'optional',
    symmetry: 0,
    density: [10, 40],
    reading: 'down',
    experimental: 60,
    params: [c('corner', 'Corner', CORNERS), n('extent', 'Extent', 0.25, 0.45, 0.34)],
    relations: ['anchor', 'negative-space'],
  },
  {
    id: 'visual-interruption',
    label: 'Visual interruption',
    group: 'experimental',
    description: 'A bold band cuts through the frame and the headline; the words read across the break.',
    focal: 'shape',
    image: 'optional',
    symmetry: 30,
    density: [35, 70],
    reading: 'down',
    experimental: 55,
    params: [c('band', 'Band', ['horizontal', 'diagonal', 'vertical']), n('at', 'Band position', 0.3, 0.7, 0.48), n('weight', 'Band weight', 0.06, 0.18, 0.1)],
    relations: ['intersect', 'contrast', 'overlap'],
  },
  {
    id: 'optical-illusion',
    label: 'Optical illusion',
    group: 'experimental',
    description: 'A field that vibrates — concentric, striped or checked — around a calm space for the words.',
    focal: 'pattern',
    image: 'none',
    symmetry: 60,
    density: [60, 95],
    reading: 'radial',
    experimental: 65,
    params: [c('pattern', 'Field', ['concentric', 'stripes', 'checker', 'radial']), c('calm', 'Calm space', ['mc', 'bc', 'tc'])],
    relations: ['surround', 'contrast', 'negative-space'],
  },
  {
    id: 'pattern-driven',
    label: 'Pattern-driven',
    group: 'experimental',
    description: 'A procedural pattern carries the frame; the words cut out of it or set on a band.',
    focal: 'pattern',
    image: 'none',
    symmetry: 45,
    density: [55, 90],
    reading: 'down',
    experimental: 45,
    params: [c('gen', 'Pattern', ['style', 'grid', 'dots', 'waves', 'truchet', 'halftone']), n('scale', 'Scale', 0.6, 1.6, 1), c('head', 'Words', ['plate', 'band', 'cutout'])],
    relations: ['repeat', 'contrast', 'contain'],
  },
  {
    id: 'procedural-composition',
    label: 'Procedural composition',
    group: 'experimental',
    description: 'Figures arranged by a rule — a rose, a phyllotaxis, a sine field, a Lissajous figure — with editable numbers.',
    focal: 'shape',
    image: 'none',
    symmetry: 50,
    density: [40, 80],
    reading: 'radial',
    experimental: 60,
    params: [c('fn', 'Rule', ['phyllotaxis', 'rose', 'lissajous', 'sine-grid']), n('n', 'Figures', 20, 80, 44)],
    relations: ['repeat', 'follow-path', 'center'],
  },
  {
    id: 'organic-flow',
    label: 'Organic flow',
    group: 'experimental',
    description: 'Lines and forms that flow like water or growth; the words ride the current or rest beside it.',
    focal: 'shape',
    image: 'optional',
    symmetry: 25,
    density: [35, 75],
    reading: 'across',
    experimental: 45,
    params: [n('lines', 'Currents', 6, 16, 10), n('flow', 'Flow', 0.3, 1, 0.6), c('text', 'Words', ['calm', 'wave'])],
    relations: ['follow-path', 'repeat', 'avoid'],
  },
  {
    id: 'spatial-tension',
    label: 'Spatial tension',
    group: 'experimental',
    description: 'Two masses almost touching: the gap between them is what the eye goes to.',
    focal: 'shape',
    image: 'optional',
    symmetry: 25,
    density: [25, 60],
    reading: 'free',
    experimental: 55,
    params: [n('gap', 'Gap', 0.01, 0.06, 0.025), c('dir', 'Meeting', ['h', 'v', 'diag']), c('mass', 'Mass', ['circle', 'block'])],
    relations: ['spacing', 'anchor', 'intersect'],
  },
  {
    id: 'edge-cropped',
    label: 'Edge-cropped',
    group: 'experimental',
    description: 'One great figure cut by the edge of the frame; the words held at the opposite side.',
    focal: 'shape',
    image: 'optional',
    symmetry: 15,
    density: [30, 65],
    reading: 'z',
    experimental: 40,
    params: [c('edge', 'Cut by', ['left', 'right', 'top', 'bottom', 'corner']), n('scale', 'Figure', 0.9, 1.6, 1.2), c('head', 'Headline', ['opposite', 'over'])],
    relations: ['crop', 'anchor', 'negative-space'],
  },
  {
    id: 'irregular-modular',
    label: 'Irregular modular',
    group: 'experimental',
    description: 'Modules of unequal sizes, split again and again; content in some, colour in others.',
    focal: 'type',
    image: 'optional',
    symmetry: 20,
    density: [50, 85],
    reading: 'z',
    experimental: 40,
    params: [n('splits', 'Divisions', 3, 6, 4), n('ratio', 'Proportion', 0.3, 0.7, 0.55)],
    relations: ['contain', 'align', 'spacing'],
  },
  {
    id: 'mixed-media',
    label: 'Mixed media',
    group: 'experimental',
    description: 'Picture, pattern, type and drawn marks combined, each in its own technique.',
    focal: 'shape',
    image: 'optional',
    symmetry: 20,
    density: [50, 85],
    reading: 'free',
    experimental: 55,
    params: [c('order', 'What leads', ['pattern', 'type', 'image']), n('marks', 'Marks', 2, 5, 3)],
    relations: ['overlap', 'group', 'contrast'],
  },
  // ── information-oriented ──
  {
    id: 'infographic-hierarchy',
    label: 'Infographic hierarchy',
    group: 'information',
    description: 'A key figure of the words set as data: one number very large, the facts labelled round it.',
    focal: 'data',
    image: 'none',
    symmetry: 35,
    density: [40, 75],
    reading: 'down',
    experimental: 20,
    params: [c('figure', 'Key figure', ['date', 'initial']), c('at', 'Figure at', ['top', 'middle'])],
    relations: ['hierarchy', 'align', 'group'],
  },
  {
    id: 'timeline',
    label: 'Timeline',
    group: 'information',
    description: 'The facts as stations on a line, in order: when, where, what.',
    focal: 'data',
    image: 'none',
    symmetry: 30,
    density: [35, 70],
    reading: 'down',
    experimental: 15,
    wide: true,
    params: [c('orient', 'Line', ['vertical', 'horizontal']), n('axis', 'Line position', 0.2, 0.8, 0.3)],
    relations: ['distribute', 'align', 'follow-path'],
  },
  {
    id: 'diagrammatic',
    label: 'Diagrammatic',
    group: 'information',
    description: 'The parts as nodes joined by lines: a chain, a star or a branching tree.',
    focal: 'data',
    image: 'none',
    symmetry: 40,
    density: [35, 70],
    reading: 'free',
    experimental: 30,
    params: [c('layout', 'Diagram', ['chain', 'star', 'tree'])],
    relations: ['distribute', 'group', 'align'],
  },
  {
    id: 'data-led',
    label: 'Data-led',
    group: 'information',
    description: 'The numbers given, charted, lead; the words explain them.',
    focal: 'data',
    image: 'none',
    data: true,
    symmetry: 35,
    density: [45, 80],
    reading: 'down',
    experimental: 15,
    params: [c('chart', 'Chart', ['bars', 'dots'])],
    relations: ['hierarchy', 'align', 'distribute'],
  },
  {
    id: 'comparison-layout',
    label: 'Comparison',
    group: 'information',
    description: 'Two sides set against each other across a divide.',
    focal: 'type',
    image: 'optional',
    symmetry: 85,
    density: [35, 70],
    reading: 'across',
    experimental: 15,
    wide: true,
    params: [c('split', 'Divided', ['vertical', 'horizontal']), c('divider', 'Divide', ['rule', 'gap', 'versus'])],
    relations: ['mirror', 'align', 'contrast'],
  },
  {
    id: 'annotated-editorial',
    label: 'Annotated editorial',
    group: 'information',
    description: 'One figure at the centre, its facts written round it on leader lines.',
    focal: 'shape',
    image: 'optional',
    symmetry: 30,
    density: [35, 70],
    reading: 'around',
    experimental: 30,
    params: [c('figure', 'Figure', ['motif', 'circle', 'image']), n('notes', 'Notes', 2, 4, 3)],
    relations: ['surround', 'align', 'follow-path'],
  },
  {
    id: 'technical-schematic',
    label: 'Technical schematic',
    group: 'information',
    description: 'A drawing sheet: a measured grid, dimension lines, a title block.',
    focal: 'shape',
    image: 'none',
    symmetry: 40,
    density: [45, 80],
    reading: 'z',
    experimental: 25,
    params: [n('grid', 'Grid', 6, 14, 10), c('dims', 'Dimensions', ['on', 'off']), c('head', 'Title', ['title-block', 'top'])],
    relations: ['align', 'contain', 'spacing'],
  },
  {
    id: 'sequential-narrative',
    label: 'Sequential narrative',
    group: 'information',
    description: 'The words told in numbered panels, one after another.',
    focal: 'type',
    image: 'optional',
    symmetry: 40,
    density: [45, 80],
    reading: 'z',
    experimental: 20,
    params: [n('panels', 'Panels', 3, 4, 3), c('dir', 'Order', ['down', 'across', 'z'])],
    relations: ['distribute', 'align', 'hierarchy'],
  },
  {
    id: 'information-dense-grid',
    label: 'Information-dense grid',
    group: 'information',
    description: 'A tight grid of cells, every fact in its own, with small figures between.',
    focal: 'type',
    image: 'optional',
    symmetry: 45,
    density: [70, 95],
    reading: 'z',
    experimental: 15,
    params: [n('cells', 'Cells', 6, 12, 8), c('figure', 'Figures', ['dots', 'bars', 'marks'])],
    relations: ['contain', 'distribute', 'spacing'],
  },
  {
    id: 'presentation-oriented',
    label: 'Presentation',
    group: 'information',
    description: 'Set like a slide: the title in its corner, a rule, the points, a figure to one side.',
    focal: 'type',
    image: 'optional',
    symmetry: 30,
    density: [30, 60],
    reading: 'z',
    experimental: 10,
    wide: true,
    params: [c('figure', 'Figure', ['right', 'left', 'bottom']), c('rule', 'Rule', ['on', 'off'])],
    relations: ['align', 'anchor', 'hierarchy'],
  },
];

export type FamilyId = string;
export const FAMILY_BY_ID: ReadonlyMap<string, FamilyInfo> = new Map(FAMILIES.map((f) => [f.id, f]));
export const FAMILY_IDS: readonly string[] = FAMILIES.map((f) => f.id);

/** How a composition is organised (see the head of this file). */
export interface CompositionPlan {
  schema: number;
  id: string;
  /** what it was planned for: the brief's headline */
  brief: string;
  /** the style it was planned with (its primary id), or none */
  style: string | null;
  family: FamilyId;
  /** who draws it: the family's own renderer, or the style's own construction for this family ("construction:<id>") */
  renderer: string;
  /** the family's parameters (FamilyInfo.params): its internal variation */
  params: Record<string, number | string>;
  focal: { kind: Focal; anchor: Anchor; secondary: Anchor[] };
  reading: Reading;
  /** the order the eye should take */
  order: Part[];
  hierarchy: { strategy: Hierarchy; /** the headline's size over the details', as intended */ ratio: number; /** 0 flat … 100 steep */ intensity: number };
  typography: { mode: TypeMode; /** 0 quiet … 100 the headline as large as the frame allows */ scale: number; breaks: 'natural' | 'balanced' | 'narrow' | 'single'; crop: 'none' | 'decorative' };
  imagery: { placement: string; mask: string; /** 0 … 100 of the frame */ dominance: number } | null;
  shapes: { strategy: 'none' | 'figure' | 'distribution' | 'pattern' | 'frame' | 'planes'; distribution: string | null };
  layering: Layering;
  space: { strategy: Space; toward: Anchor | null; /** the share of the frame left empty, 0–100 */ target: number };
  density: number;
  experimentation: number;
  symmetry: number;
  /** how the palette is used: the style's ground, its ink as the ground, or its accent as the ground */
  colour: 'ground' | 'inverse' | 'accent-field';
  /** the effect it is meant to have, in a few words */
  emotion: string;
  relations: Relation[];
  constraints: { /** words and logos inside the safe area */ safe: boolean; /** ids of objects that may not move */ locked: string[]; /** the person asked for consistency, not variety */ consistent: boolean };
  seed: number;
  variation: { strength: number; parent?: string; intervention?: string; batch?: string; index?: number };
}

const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const clean = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? v
        .replace(/<[^>]*>/g, '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, max)
    : '';
const num = (v: unknown, lo: number, hi: number, def: number): number => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : def;
};
const pick = <T extends string>(v: unknown, list: readonly T[], def: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : def);

/** A family's parameters held to their ranges and choices; missing ones take the family's defaults. */
export function paramsFor(family: FamilyInfo, raw: unknown): Record<string, number | string> {
  const r = o(raw);
  const out: Record<string, number | string> = {};
  for (const p of family.params) {
    if (p.choices) out[p.key] = pick(String(r[p.key] ?? ''), p.choices, String(p.def));
    else {
      const v = num(r[p.key], p.min ?? 0, p.max ?? 1, Number(p.def));
      // whole numbers stay whole (counts, columns, rings)
      out[p.key] = Number.isInteger(Number(p.def)) && Number.isInteger(p.min ?? 0) && Number.isInteger(p.max ?? 1) && (p.max ?? 1) - (p.min ?? 0) >= 2 ? Math.round(v) : Math.round(v * 1000) / 1000;
    }
  }
  return out;
}

/** Why a plan cannot be used, or nothing: for plans from outside (a model, a file, the explorer). */
export function planProblems(v: unknown): string[] {
  const r = o(v);
  const problems: string[] = [];
  if (!v || typeof v !== 'object') return ['A composition plan must be an object.'];
  if (typeof r.family !== 'string' || !FAMILY_BY_ID.has(r.family)) problems.push(`The family “${String(r.family ?? '').slice(0, 40)}” is not one SocriaUX composes.`);
  if (r.schema !== undefined && num(r.schema, 0, 999, 0) > COMPOSITION_SCHEMA) problems.push(`The plan is of a newer schema (${r.schema}) than this version reads (${COMPOSITION_SCHEMA}).`);
  return problems;
}

/** A relationship held to the grammar, or nothing. */
export function relationOf(v: unknown): Relation | null {
  const r = o(v);
  if (!(RELATION_KINDS as readonly string[]).includes(r.kind) || !(PARTS as readonly string[]).includes(r.a)) return null;
  const b = (PARTS as readonly string[]).includes(r.b) ? (r.b as Part) : undefined;
  const at = (ANCHORS as readonly string[]).includes(r.at) ? (r.at as Anchor) : undefined;
  const value = typeof r.value === 'number' && Number.isFinite(r.value) ? Math.max(-1000, Math.min(1000, r.value)) : undefined;
  return { kind: r.kind, a: r.a, ...(b ? { b } : {}), ...(at ? { at } : {}), ...(value !== undefined ? { value } : {}), priority: pick(r.priority, PRIORITIES, 'soft') };
}

/**
 * A plan held to the schema: the only way a plan from anywhere is used. Unknown families are refused (null); every
 * other value is clamped, picked from its list or given its default. Idempotent.
 */
export function normalizeCompositionPlan(v: unknown): CompositionPlan | null {
  if (planProblems(v).length) return null;
  const r = o(v);
  const fam = FAMILY_BY_ID.get(r.family)!;
  const focal = o(r.focal);
  const hier = o(r.hierarchy);
  const typo = o(r.typography);
  const img = r.imagery ? o(r.imagery) : null;
  const shp = o(r.shapes);
  const space = o(r.space);
  const cons = o(r.constraints);
  const vari = o(r.variation);
  const order = arr(r.order).filter((p): p is Part => (PARTS as readonly string[]).includes(p as string));
  return {
    schema: COMPOSITION_SCHEMA,
    id: clean(r.id, 40).replace(/[^a-z0-9_-]/gi, '') || `cp-${Math.abs(Math.round(num(r.seed, 0, 2 ** 31, 0))).toString(36)}`,
    brief: clean(r.brief, 160),
    style: typeof r.style === 'string' && r.style ? clean(r.style, 60).replace(/[^a-z0-9_-]/gi, '') || null : null,
    family: fam.id,
    renderer: typeof r.renderer === 'string' && /^construction:[a-z0-9-]{2,40}$/.test(r.renderer) ? r.renderer : 'family',
    params: paramsFor(fam, r.params),
    focal: {
      kind: pick(focal.kind, FOCALS, fam.focal),
      anchor: pick(focal.anchor, ANCHORS, 'mc'),
      secondary: arr(focal.secondary)
        .filter((a): a is Anchor => (ANCHORS as readonly string[]).includes(a as string))
        .slice(0, 3),
    },
    reading: pick(r.reading, READINGS, fam.reading),
    order: order.length ? [...new Set(order)].slice(0, 10) : ['headline', 'subhead', 'meta', 'cta', 'brand'],
    hierarchy: { strategy: pick(hier.strategy, HIERARCHIES, 'scale'), ratio: num(hier.ratio, 1, 40, 6), intensity: num(hier.intensity, 0, 100, 60) },
    typography: {
      mode: pick(typo.mode, TYPE_MODES, 'stacked'),
      scale: num(typo.scale, 0, 100, 60),
      breaks: pick(typo.breaks, ['natural', 'balanced', 'narrow', 'single'] as const, 'natural'),
      crop: pick(typo.crop, ['none', 'decorative'] as const, 'none'),
    },
    imagery: img ? { placement: clean(img.placement, 40) || 'none', mask: clean(img.mask, 40) || 'none', dominance: num(img.dominance, 0, 100, 0) } : null,
    shapes: { strategy: pick(shp.strategy, ['none', 'figure', 'distribution', 'pattern', 'frame', 'planes'] as const, 'figure'), distribution: typeof shp.distribution === 'string' ? clean(shp.distribution, 40) || null : null },
    layering: pick(r.layering, LAYERINGS, 'overlap'),
    space: { strategy: pick(space.strategy, SPACES, 'balanced'), toward: (ANCHORS as readonly string[]).includes(space.toward) ? space.toward : null, target: num(space.target, 0, 100, 35) },
    density: num(r.density, 0, 100, (fam.density[0] + fam.density[1]) / 2),
    experimentation: num(r.experimentation, 0, 100, fam.experimental),
    symmetry: num(r.symmetry, 0, 100, fam.symmetry),
    colour: pick(r.colour, ['ground', 'inverse', 'accent-field'] as const, 'ground'),
    emotion: clean(r.emotion, 120),
    relations: arr(r.relations)
      .map(relationOf)
      .filter((x): x is Relation => !!x)
      .slice(0, 40),
    constraints: {
      safe: cons.safe !== false,
      locked: arr(cons.locked)
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.slice(0, 40))
        .slice(0, 50),
      consistent: cons.consistent === true,
    },
    seed: Math.abs(Math.round(num(r.seed, 0, 2 ** 31 - 1, 0))),
    variation: {
      strength: num(vari.strength, 0, 100, 50),
      ...(typeof vari.parent === 'string' ? { parent: clean(vari.parent, 40) } : {}),
      ...(typeof vari.intervention === 'string' ? { intervention: clean(vari.intervention, 120) } : {}),
      ...(typeof vari.batch === 'string' ? { batch: clean(vari.batch, 40) } : {}),
      ...(typeof vari.index === 'number' && Number.isFinite(vari.index) ? { index: Math.max(0, Math.min(99, Math.round(vari.index))) } : {}),
    },
  };
}

/** The family a plan names, with its parameters' current values said in words (for the explorer and the notes). */
export function describePlan(plan: CompositionPlan): string {
  const fam = FAMILY_BY_ID.get(plan.family);
  if (!fam) return plan.family;
  const bits = fam.params
    .map((p) => {
      const v = plan.params[p.key];
      if (v === undefined) return '';
      return `${p.label.toLowerCase()} ${typeof v === 'number' ? (Number.isInteger(v) ? v : Math.round(v * 100) / 100) : v}`;
    })
    .filter(Boolean);
  return `${fam.label}${bits.length ? ` (${bits.join(', ')})` : ''}`;
}

// ── composition memory (memory.ts uses it; kept here so a document can hold it without the planner) ──

export const MEMORY_SCOPES = ['batch', 'artboard', 'project', 'board'] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];
export const MEMORY_VERDICTS = ['shown', 'selected', 'rejected'] as const;
export type MemoryVerdict = (typeof MEMORY_VERDICTS)[number];
/** At most this many entries are kept: the oldest shown ones go first, choices last. */
export const MAX_MEMORY = 60;

export interface MemoryEntry {
  at: number;
  family: string;
  /** the composition's signature, encoded (signature.ts) */
  sig: string;
  verdict: MemoryVerdict;
  scope: MemoryScope;
  artboard?: string;
  style?: string;
}

/** A memory held to its shape and its bound (see MAX_MEMORY). */
export function normalizeMemory(v: unknown): MemoryEntry[] {
  const out: MemoryEntry[] = [];
  for (const raw of arr(v)) {
    const r = o(raw);
    if (typeof r.family !== 'string' || (!FAMILY_BY_ID.has(r.family) && !/^construction:[a-z0-9-]{2,40}$/.test(r.family))) continue;
    const sig = typeof r.sig === 'string' ? r.sig.replace(/[^a-z0-9.|:,=_-]/gi, '').slice(0, 400) : '';
    if (!sig) continue;
    out.push({
      at: Math.round(num(r.at, 0, 1e13, 0)),
      family: r.family,
      sig,
      verdict: pick(r.verdict, MEMORY_VERDICTS, 'shown'),
      scope: pick(r.scope, MEMORY_SCOPES, 'project'),
      ...(typeof r.artboard === 'string' ? { artboard: r.artboard.replace(/[^\w-]/g, '').slice(0, 96) } : {}),
      ...(typeof r.style === 'string' ? { style: r.style.replace(/[^a-z0-9_-]/gi, '').slice(0, 60) } : {}),
    });
  }
  if (out.length <= MAX_MEMORY) return out;
  // the bound: the person's choices kept longest, then the newest shown
  const keep = out.filter((e) => e.verdict !== 'shown').slice(-MAX_MEMORY);
  const room = MAX_MEMORY - keep.length;
  const shown = room > 0 ? out.filter((e) => e.verdict === 'shown').slice(-room) : [];
  return [...keep, ...shown].sort((a, b) => a.at - b.at);
}
