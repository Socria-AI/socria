// lib/ux-v0/fonts.ts — the typefaces SocriaUX v0 may choose, and how to load them.
//
// The model names fonts; it never invents them. A name outside this list is
// replaced by the nearest default of its kind, so a brief or a spec can only
// ever ask for a face that exists and that Google Fonts will serve. Each entry
// carries the axis request Google's CSS2 API accepts for that family — a
// request for a weight a static family does not have is refused outright,
// which is why the weights are written per family rather than assumed (every
// request below was checked against the API). `weights` is what the family
// really has, so a look that asks for weight 800 of a face that stops at 700
// is drawn at 700, never synthesised; `italic` says whether a true italic is
// loaded, so emphasis is never a slanted roman.

export type FontKind = 'serif' | 'sans' | 'mono';

export interface FontEntry {
  name: string;
  kind: FontKind;
  /** the CSS2 axis query; empty for a single-style family */
  axes: string;
  /** a word on its character, offered to the model so it can choose deliberately */
  note: string;
  /** the weights it has: a range [min, max] for a variable family, or the list for a static one */
  weights: readonly number[];
  variable?: boolean;
  /** a true italic is loaded */
  italic?: boolean;
  /** drawn for headlines only: never set as running text */
  displayOnly?: boolean;
}

const V = (min: number, max: number) => ({ weights: [min, max], variable: true });

export const FONTS: readonly FontEntry[] = [
  // serifs
  { name: 'Instrument Serif', kind: 'serif', axes: 'ital@0;1', note: 'condensed editorial display serif, one weight', weights: [400], italic: true, displayOnly: true },
  { name: 'Fraunces', kind: 'serif', axes: 'ital,wght@0,300..900;1,300..900', note: 'soft, characterful old-style display serif', ...V(300, 900), italic: true },
  { name: 'Playfair Display', kind: 'serif', axes: 'ital,wght@0,400..900;1,400..900', note: 'high-contrast classic display serif', ...V(400, 900), italic: true },
  { name: 'DM Serif Display', kind: 'serif', axes: 'ital@0;1', note: 'robust, warm display serif, one weight', weights: [400], italic: true, displayOnly: true },
  { name: 'Cormorant Garamond', kind: 'serif', axes: 'ital,wght@0,300..700;1,300..700', note: 'delicate, refined Garamond for luxury; at 500, Socria’s own voice', ...V(300, 700), italic: true },
  { name: 'Libre Baskerville', kind: 'serif', axes: 'ital,wght@0,400;0,700;1,400', note: 'sturdy book serif, very readable', weights: [400, 700], italic: true },
  { name: 'Lora', kind: 'serif', axes: 'ital,wght@0,400..700;1,400..700', note: 'calligraphic, friendly text serif', ...V(400, 700), italic: true },
  { name: 'Newsreader', kind: 'serif', axes: 'ital,wght@0,300..700;1,300..700', note: 'journalistic text serif', ...V(300, 700), italic: true },
  { name: 'Source Serif 4', kind: 'serif', axes: 'ital,wght@0,300..800;1,300..800', note: 'neutral, professional text serif', ...V(300, 800), italic: true },
  { name: 'EB Garamond', kind: 'serif', axes: 'ital,wght@0,400..800;1,400..800', note: 'classical Garamond for long reading', ...V(400, 800), italic: true },
  { name: 'Bodoni Moda', kind: 'serif', axes: 'ital,wght@0,400..900;1,400..900', note: 'fashion-magazine Didone', ...V(400, 900), italic: true },
  { name: 'Young Serif', kind: 'serif', axes: '', note: 'chunky, confident heading serif, one weight', weights: [400], displayOnly: true },
  { name: 'Old Standard TT', kind: 'serif', axes: 'ital,wght@0,400;0,700;1,400', note: 'nineteenth-century scholarly serif', weights: [400, 700], italic: true },
  { name: 'Spectral', kind: 'serif', axes: 'ital,wght@0,300;0,400;0,600;1,300;1,400', note: 'quiet screen-first literary serif', weights: [300, 400, 600], italic: true },
  { name: 'IBM Plex Serif', kind: 'serif', axes: 'ital,wght@0,400;0,600;1,400', note: 'engineered, institutional serif', weights: [400, 600], italic: true },
  { name: 'Gloock', kind: 'serif', axes: '', note: 'sharp high-contrast poster serif, one weight', weights: [400], displayOnly: true },
  { name: 'Crimson Pro', kind: 'serif', axes: 'ital,wght@0,200..900;1,200..900', note: 'bookish old-style serif with a wide weight range', ...V(200, 900), italic: true },
  { name: 'Literata', kind: 'serif', axes: 'ital,opsz,wght@0,7..72,200..900;1,7..72,200..900', note: 'a reading serif with optical sizes: fine at text, sharp at display', ...V(200, 900), italic: true },
  { name: 'Libre Caslon Text', kind: 'serif', axes: 'ital,wght@0,400;0,700;1,400', note: 'a warm Caslon for long reading', weights: [400, 700], italic: true },
  { name: 'Cinzel', kind: 'serif', axes: 'wght@400..900', note: 'inscriptional Roman capitals: monumental titles', ...V(400, 900), displayOnly: true },
  { name: 'Marcellus', kind: 'serif', axes: '', note: 'flared classical display serif, one weight', weights: [400], displayOnly: true },
  { name: 'Prata', kind: 'serif', axes: '', note: 'elegant high-contrast Didone, one weight', weights: [400], displayOnly: true },
  { name: 'Italiana', kind: 'serif', axes: '', note: 'thin, fashion-plate display serif, one weight', weights: [400], displayOnly: true },
  { name: 'Abril Fatface', kind: 'serif', axes: '', note: 'heavy Didone poster face, one weight', weights: [400], displayOnly: true },
  { name: 'Roboto Slab', kind: 'serif', axes: 'wght@100..900', note: 'plain engineered slab', ...V(100, 900) },
  { name: 'Zilla Slab', kind: 'serif', axes: 'wght@300;400;500;600;700', note: 'contemporary slab with a typewriter memory', weights: [300, 400, 500, 600, 700] },
  { name: 'Alfa Slab One', kind: 'serif', axes: '', note: 'very heavy slab for blunt headlines, one weight', weights: [400], displayOnly: true },
  // sans
  { name: 'Inter', kind: 'sans', axes: 'wght@100..900', note: 'neutral UI sans, excellent at small sizes', ...V(100, 900) },
  { name: 'DM Sans', kind: 'sans', axes: 'wght@100..900', note: 'geometric, low-contrast, friendly', ...V(100, 900) },
  { name: 'Manrope', kind: 'sans', axes: 'wght@200..800', note: 'modern semi-rounded grotesk', ...V(200, 800) },
  { name: 'Space Grotesk', kind: 'sans', axes: 'wght@300..700', note: 'technical grotesk with quirks', ...V(300, 700) },
  { name: 'Work Sans', kind: 'sans', axes: 'wght@100..900', note: 'plain, open grotesk', ...V(100, 900) },
  { name: 'Plus Jakarta Sans', kind: 'sans', axes: 'wght@200..800', note: 'contemporary, product-friendly sans', ...V(200, 800) },
  { name: 'IBM Plex Sans', kind: 'sans', axes: 'wght@100..700', note: 'engineered corporate sans', ...V(100, 700) },
  { name: 'Outfit', kind: 'sans', axes: 'wght@100..900', note: 'clean geometric display sans', ...V(100, 900) },
  { name: 'Sora', kind: 'sans', axes: 'wght@100..800', note: 'wide, techy geometric sans', ...V(100, 800) },
  { name: 'Archivo', kind: 'sans', axes: 'wght@100..900', note: 'grotesk with presence in headlines', ...V(100, 900) },
  { name: 'Public Sans', kind: 'sans', axes: 'wght@100..900', note: 'civic, strong, neutral', ...V(100, 900) },
  { name: 'Karla', kind: 'sans', axes: 'wght@200..800', note: 'quirky small grotesk', ...V(200, 800) },
  { name: 'Syne', kind: 'sans', axes: 'wght@400..800', note: 'art-gallery display sans', ...V(400, 800) },
  { name: 'Bricolage Grotesque', kind: 'sans', axes: 'wght@200..800', note: 'expressive contemporary grotesque', ...V(200, 800) },
  { name: 'Geist', kind: 'sans', axes: 'wght@100..900', note: 'precise contemporary grotesk; Socria’s interface face', ...V(100, 900) },
  { name: 'Instrument Sans', kind: 'sans', axes: 'wght@400..700', note: 'crisp, slightly narrow neo-grotesk', ...V(400, 700) },
  { name: 'Hanken Grotesk', kind: 'sans', axes: 'wght@100..900', note: 'warm, open grotesk', ...V(100, 900) },
  { name: 'Familjen Grotesk', kind: 'sans', axes: 'wght@400..700', note: 'idiosyncratic Scandinavian grotesk', ...V(400, 700) },
  { name: 'Unbounded', kind: 'sans', axes: 'wght@200..900', note: 'wide, rounded display sans for loud headlines', ...V(200, 900), displayOnly: true },
  { name: 'Anton', kind: 'sans', axes: '', note: 'tall condensed poster sans, one heavy weight', weights: [400], displayOnly: true },
  { name: 'Big Shoulders Display', kind: 'sans', axes: 'wght@400..900', note: 'industrial condensed display sans', ...V(400, 900), displayOnly: true },
  { name: 'Schibsted Grotesk', kind: 'sans', axes: 'wght@400..900', note: 'newsroom grotesk, sturdy at every size', ...V(400, 900) },
  { name: 'Red Hat Display', kind: 'sans', axes: 'wght@300..900', note: 'geometric display sans with open counters', ...V(300, 900) },
  { name: 'Epilogue', kind: 'sans', axes: 'wght@100..900', note: 'expressive grotesk with a wide weight range', ...V(100, 900) },
  { name: 'Chivo', kind: 'sans', axes: 'wght@100..900', note: 'strong, slightly compressed grotesk', ...V(100, 900) },
  { name: 'Darker Grotesque', kind: 'sans', axes: 'wght@300..900', note: 'high-contrast fashion grotesk', ...V(300, 900), displayOnly: true },
  { name: 'Rubik', kind: 'sans', axes: 'wght@300..900', note: 'soft-cornered friendly sans', ...V(300, 900) },
  { name: 'Urbanist', kind: 'sans', axes: 'wght@100..900', note: 'low-contrast geometric sans', ...V(100, 900) },
  { name: 'Onest', kind: 'sans', axes: 'wght@100..900', note: 'neutral humanist sans for interfaces', ...V(100, 900) },
  { name: 'Figtree', kind: 'sans', axes: 'wght@300..900', note: 'clean, friendly geometric sans', ...V(300, 900) },
  { name: 'Oswald', kind: 'sans', axes: 'wght@200..700', note: 'condensed gothic for tall headlines', ...V(200, 700), displayOnly: true },
  { name: 'Barlow Condensed', kind: 'sans', axes: 'wght@400;500;600;700', note: 'signage-like condensed grotesk', weights: [400, 500, 600, 700], displayOnly: true },
  { name: 'Bebas Neue', kind: 'sans', axes: '', note: 'all-capitals condensed display, one weight', weights: [400], displayOnly: true },
  { name: 'Archivo Black', kind: 'sans', axes: '', note: 'very heavy grotesk for blunt headlines, one weight', weights: [400], displayOnly: true },
  { name: 'Dela Gothic One', kind: 'sans', axes: '', note: 'massive, inky display gothic, one weight', weights: [400], displayOnly: true },
  { name: 'Orbitron', kind: 'sans', axes: 'wght@400..900', note: 'squared, futurist display sans', ...V(400, 900), displayOnly: true },
  { name: 'Michroma', kind: 'sans', axes: '', note: 'wide technical display sans, one weight', weights: [400], displayOnly: true },
  { name: 'Syncopate', kind: 'sans', axes: 'wght@400;700', note: 'wide unicase display sans', weights: [400, 700], displayOnly: true },
  { name: 'Chakra Petch', kind: 'sans', axes: 'wght@300;400;500;600;700', note: 'squared, instrument-panel sans', weights: [300, 400, 500, 600, 700] },
  // mono
  { name: 'IBM Plex Mono', kind: 'mono', axes: 'wght@400;500;600', note: 'engineered mono', weights: [400, 500, 600] },
  { name: 'JetBrains Mono', kind: 'mono', axes: 'wght@100..800', note: 'developer mono', ...V(100, 800) },
  { name: 'Space Mono', kind: 'mono', axes: 'wght@400;700', note: 'retro geometric mono', weights: [400, 700] },
  { name: 'Geist Mono', kind: 'mono', axes: 'wght@100..900', note: 'precise contemporary mono', ...V(100, 900) },
  { name: 'DM Mono', kind: 'mono', axes: 'wght@300;400;500', note: 'soft, even mono', weights: [300, 400, 500] },
  { name: 'Martian Mono', kind: 'mono', axes: 'wght@100..800', note: 'wide, sturdy mono for labels', ...V(100, 800) },
  { name: 'Fragment Mono', kind: 'mono', axes: 'ital@0;1', note: 'a mono drawn from a grotesk, one weight', weights: [400], italic: true },
  { name: 'Rubik Mono One', kind: 'mono', axes: '', note: 'heavy display mono, one weight', weights: [400], displayOnly: true },
];

const BY_NAME = new Map(FONTS.map((f) => [f.name.toLowerCase(), f]));

/**
 * Faces only SocriaUX Graphics offers, for the axes its type controls set: width, slant, optical size, casualness and
 * monospacing. They are kept out of FONTS on purpose. A website chooses, loads and measures its faces from that list
 * (the model's menu and schemas, design-system imports, the type panel, headline fitting by measured advances), and
 * none of that changes because Graphics has more faces. Their advances are not measured: text set in them is sized
 * from the generic widths.
 */
export const GRAPHIC_ONLY_FONTS: readonly FontEntry[] = [
  { name: 'Anybody', kind: 'sans', axes: 'ital,wdth,wght@0,50..150,100..900;1,50..150,100..900', note: 'a variable grotesk that stretches from compressed to extended: experimental type', ...V(100, 900), italic: true },
  { name: 'Roboto Flex', kind: 'sans', axes: 'opsz,slnt,wdth,wght@8..144,-10..0,25..151,100..1000', note: 'a parametric grotesk with width, slant and optical-size axes', ...V(100, 900) },
  { name: 'Recursive', kind: 'sans', axes: 'slnt,wght,CASL,CRSV,MONO@-15..0,300..1000,0..1,0..1,0..1', note: 'a variable face that moves from sans to mono and from linear to casual', ...V(300, 900) },
  // the faces Style Intelligence draws historical and cultural languages with (styles/library-*.ts): each request
  // checked against Google Fonts' CSS2 API (all answered 200, 20 November 2026)
  { name: 'Federant', kind: 'serif', axes: '', note: 'an Art Nouveau display serif with organic, whiplash strokes', weights: [400], displayOnly: true },
  { name: 'Elsie', kind: 'serif', axes: 'wght@400;900', note: 'a Nouveau display serif with swelling curves and high contrast', weights: [400, 900], displayOnly: true },
  { name: 'Cormorant Unicase', kind: 'serif', axes: 'wght@300;400;500;600;700', note: 'a unicase Garamond for Jugendstil and Arts and Crafts lettering', weights: [300, 400, 500, 600, 700], displayOnly: true },
  { name: 'Metamorphous', kind: 'serif', axes: '', note: 'a calligraphic Jugendstil serif with medieval capitals', weights: [400], displayOnly: true },
  { name: 'Limelight', kind: 'serif', axes: '', note: 'an Art Deco display face of hairlines and heavy stems', weights: [400], displayOnly: true },
  { name: 'Poiret One', kind: 'sans', axes: '', note: 'a thin geometric Art Deco sans of circles and lines', weights: [400], displayOnly: true },
  { name: 'Federo', kind: 'sans', axes: '', note: 'a 1920s geometric display sans with Deco proportions', weights: [400], displayOnly: true },
  { name: 'Josefin Sans', kind: 'sans', axes: 'ital,wght@0,100..700;1,100..700', note: 'a geometric sans with vintage, 1920s proportions', ...V(100, 700), italic: true },
  { name: 'Jost', kind: 'sans', axes: 'ital,wght@0,100..900;1,100..900', note: 'a geometric sans in the Futura tradition: circles, triangles, Bauhaus', ...V(100, 900), italic: true },
  { name: 'Shrikhand', kind: 'serif', axes: '', note: 'a heavy display face with ball terminals, 1970s and psychedelic', weights: [400], displayOnly: true },
  { name: 'Fascinate', kind: 'sans', axes: '', note: 'a heavy Deco display with stencil-like cuts', weights: [400], displayOnly: true },
  { name: 'Monoton', kind: 'sans', axes: '', note: 'letters drawn in parallel neon lines: synthwave and retro signage', weights: [400], displayOnly: true },
  { name: 'Righteous', kind: 'sans', axes: '', note: 'a rounded retro-futurist display sans', weights: [400], displayOnly: true },
  { name: 'Gravitas One', kind: 'serif', axes: '', note: 'a Victorian fat face of extreme contrast', weights: [400], displayOnly: true },
  { name: 'Rye', kind: 'serif', axes: '', note: 'an ornamented wood type of Victorian playbills', weights: [400], displayOnly: true },
  { name: 'Sancreek', kind: 'serif', axes: '', note: 'a spurred circus and Western wood type', weights: [400], displayOnly: true },
  { name: 'Holtwood One SC', kind: 'serif', axes: '', note: 'a wide wood-type capital for posters and playbills', weights: [400], displayOnly: true },
  { name: 'Ultra', kind: 'serif', axes: '', note: 'a fat slab of letterpress and vintage advertising', weights: [400], displayOnly: true },
  { name: 'Bevan', kind: 'serif', axes: 'ital@0;1', note: 'a heavy slab serif of vintage advertising', weights: [400], italic: true, displayOnly: true },
  { name: 'UnifrakturMaguntia', kind: 'serif', axes: '', note: 'a blackletter Fraktur for mastheads and underground flyers', weights: [400], displayOnly: true },
  { name: 'Uncial Antiqua', kind: 'serif', axes: '', note: 'an uncial book hand for Arts and Crafts lettering', weights: [400], displayOnly: true },
  { name: 'Fondamento', kind: 'serif', axes: 'ital@0;1', note: 'a calligraphic italic hand', weights: [400], italic: true, displayOnly: true },
  { name: 'Bangers', kind: 'sans', axes: '', note: 'comic-book capitals, leaning and loud', weights: [400], displayOnly: true },
  { name: 'Luckiest Guy', kind: 'sans', axes: '', note: 'heavy rounded cartoon lettering', weights: [400], displayOnly: true },
  { name: 'Comic Neue', kind: 'sans', axes: 'ital,wght@0,300;0,400;0,700;1,300;1,400;1,700', note: 'a tidied comic hand: early web and personal pages', weights: [300, 400, 700], italic: true },
  { name: 'Lobster', kind: 'serif', axes: '', note: 'a bold connected script of diner signs and vintage ads', weights: [400], displayOnly: true },
  { name: 'Pacifico', kind: 'serif', axes: '', note: 'a surf-brush script, retro and sunlit', weights: [400], displayOnly: true },
  { name: 'Special Elite', kind: 'mono', axes: '', note: 'a worn typewriter with ink spread: zines and dossiers', weights: [400] },
  { name: 'Courier Prime', kind: 'mono', axes: 'ital,wght@0,400;0,700;1,400;1,700', note: 'a typewriter mono for captions and copy', weights: [400, 700], italic: true },
  { name: 'Permanent Marker', kind: 'sans', axes: '', note: 'felt-marker capitals, hand-drawn', weights: [400], displayOnly: true },
  { name: 'Rock Salt', kind: 'sans', axes: '', note: 'a scratchy, nervous handwriting', weights: [400], displayOnly: true },
  { name: 'Caveat Brush', kind: 'sans', axes: '', note: 'a quick brush hand for painted lettering', weights: [400], displayOnly: true },
  { name: 'Amatic SC', kind: 'sans', axes: 'wght@400;700', note: 'tall hand-drawn capitals', weights: [400, 700], displayOnly: true },
  { name: 'Rubik Distressed', kind: 'sans', axes: '', note: 'a heavy rounded grotesk with worn, eroded edges', weights: [400], displayOnly: true },
  { name: 'Rubik Wet Paint', kind: 'sans', axes: '', note: 'a heavy grotesk dripping paint', weights: [400], displayOnly: true },
  { name: 'Rubik Glitch', kind: 'sans', axes: '', note: 'a heavy grotesk sliced by scanline glitches', weights: [400], displayOnly: true },
  { name: 'Black Ops One', kind: 'sans', axes: '', note: 'a military stencil', weights: [400], displayOnly: true },
  { name: 'Saira Stencil One', kind: 'sans', axes: '', note: 'an engineered stencil sans', weights: [400], displayOnly: true },
  { name: 'Big Shoulders Stencil Display', kind: 'sans', axes: 'wght@100..900', note: 'a condensed industrial stencil', ...V(100, 900), displayOnly: true },
  { name: 'Audiowide', kind: 'sans', axes: '', note: 'a wide technical display of the space age', weights: [400], displayOnly: true },
  { name: 'Krona One', kind: 'sans', axes: '', note: 'an extended geometric grotesk', weights: [400], displayOnly: true },
  { name: 'Rajdhani', kind: 'sans', axes: 'wght@300;400;500;600;700', note: 'a squared technical sans of interfaces and dials', weights: [300, 400, 500, 600, 700] },
  { name: 'Share Tech Mono', kind: 'mono', axes: '', note: 'a squared terminal mono', weights: [400] },
  { name: 'Major Mono Display', kind: 'mono', axes: '', note: 'a geometric unicase mono display', weights: [400], displayOnly: true },
  { name: 'Tektur', kind: 'sans', axes: 'wdth,wght@75..100,400..900', note: 'an angular technical grotesk with a width axis', ...V(400, 900) },
  { name: 'Exo 2', kind: 'sans', axes: 'ital,wght@0,100..900;1,100..900', note: 'a technological sans, softened', ...V(100, 900), italic: true },
  { name: 'Russo One', kind: 'sans', axes: '', note: 'a heavy geometric sans of Constructivist posters', weights: [400], displayOnly: true },
  { name: 'Staatliches', kind: 'sans', axes: '', note: 'a condensed poster capital in the Bauhaus and Constructivist manner', weights: [400], displayOnly: true },
  { name: 'Notable', kind: 'sans', axes: '', note: 'an extended heavy capital for walls of type', weights: [400], displayOnly: true },
  { name: 'Bungee', kind: 'sans', axes: '', note: 'a vertical signage face, blocky and urban', weights: [400], displayOnly: true },
  { name: 'Bungee Shade', kind: 'sans', axes: '', note: 'signage letters with a cast shade', weights: [400], displayOnly: true },
  { name: 'VT323', kind: 'mono', axes: '', note: 'a terminal pixel face', weights: [400] },
  { name: 'Press Start 2P', kind: 'mono', axes: '', note: 'an eight-bit pixel face', weights: [400], displayOnly: true },
  { name: 'Silkscreen', kind: 'sans', axes: 'wght@400;700', note: 'a small pixel face for interface labels', weights: [400, 700], displayOnly: true },
  { name: 'Nunito', kind: 'sans', axes: 'ital,wght@0,200..1000;1,200..1000', note: 'a rounded, friendly sans', ...V(200, 1000), italic: true },
  { name: 'Quicksand', kind: 'sans', axes: 'wght@300..700', note: 'a rounded geometric sans, light and soft', ...V(300, 700) },
  { name: 'Fredoka', kind: 'sans', axes: 'wdth,wght@75..125,300..700', note: 'a rounded playful sans with a width axis', ...V(300, 700) },
  { name: 'Hind', kind: 'sans', axes: 'wght@300;400;500;600;700', note: 'a humanist sans in the Frutiger manner', weights: [300, 400, 500, 600, 700] },
  { name: 'Rozha One', kind: 'serif', axes: '', note: 'a high-contrast display serif from Indian type design', weights: [400], displayOnly: true },
  { name: 'Teko', kind: 'sans', axes: 'wght@300..700', note: 'a condensed sans from Indian type design', ...V(300, 700) },
  { name: 'Sarpanch', kind: 'sans', axes: 'wght@400;500;600;700;800;900', note: 'a squared, wide display sans from Indian type design', weights: [400, 500, 600, 700, 800, 900], displayOnly: true },
  { name: 'Kalam', kind: 'sans', axes: 'wght@300;400;700', note: 'an informal handwriting', weights: [300, 400, 700] },
  { name: 'Khand', kind: 'sans', axes: 'wght@300;400;500;600;700', note: 'a condensed grotesk from Indian type design', weights: [300, 400, 500, 600, 700] },
  { name: 'Yeseva One', kind: 'serif', axes: '', note: 'a decorative didone with soft curves', weights: [400], displayOnly: true },
  { name: 'Fjalla One', kind: 'sans', axes: '', note: 'a condensed headline sans of newspapers and ads', weights: [400], displayOnly: true },
  { name: 'Playfair Display SC', kind: 'serif', axes: 'ital,wght@0,400;0,700;0,900;1,400;1,700;1,900', note: 'high-contrast small capitals', weights: [400, 700, 900], italic: true, displayOnly: true },
  { name: 'Shippori Mincho', kind: 'serif', axes: 'wght@400;500;600;700;800', note: 'a Mincho serif whose Latin follows Japanese book typography', weights: [400, 500, 600, 700, 800] },
];

/** Families a graphic loads with more axes than a website does, so its text can set them. A website's Fraunces is
 * loaded exactly as before (optical sizing would change how its pages draw). */
const GRAPHIC_AXES: Readonly<Record<string, string>> = {
  Fraunces: 'ital,opsz,wght,SOFT,WONK@0,9..144,300..900,0..100,0..1;1,9..144,300..900,0..100,0..1',
};

/** Every face Graphics offers: the website faces (with the axes a graphic loads), then the Graphics-only ones. */
export const GRAPHIC_FONTS: readonly FontEntry[] = [
  ...FONTS.map((f) => (GRAPHIC_AXES[f.name] ? { ...f, axes: GRAPHIC_AXES[f.name] } : f)),
  ...GRAPHIC_ONLY_FONTS,
];

const GRAPHIC_BY_NAME = new Map(GRAPHIC_FONTS.map((f) => [f.name.toLowerCase(), f]));

/** A face Graphics offers, as its list spells it, or null. */
export function graphicFont(name: unknown): FontEntry | null {
  if (typeof name !== 'string') return null;
  return GRAPHIC_BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

/** For the drawing helpers below: a website face as the website list has it, else a Graphics-only face. A name on the
 * website list always resolves exactly as it did before Graphics had faces of its own. */
const anyFace = (name: string): FontEntry | null => knownFont(name) ?? graphicFont(name);

export const DEFAULT_DISPLAY = 'Fraunces';
export const DEFAULT_BODY = 'Inter';

/** A font name, as the list spells it — or null when it is not on the list. */
export function knownFont(name: unknown): FontEntry | null {
  if (typeof name !== 'string') return null;
  return BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

/** A display face from what was asked, else the default. */
export function displayFont(name: unknown): string {
  return knownFont(name)?.name ?? DEFAULT_DISPLAY;
}

/** A body face from what was asked (never a display-only face), else the default. */
export function bodyFont(name: unknown): string {
  const f = knownFont(name);
  return f && !f.displayOnly ? f.name : DEFAULT_BODY;
}

/** The weight a family can really draw nearest to the one asked. */
export function nearestWeight(name: string, want: number): number {
  const f = anyFace(name);
  if (!f) return Math.max(100, Math.min(900, Math.round(want / 100) * 100));
  if (f.variable) return Math.max(f.weights[0], Math.min(f.weights[1], Math.round(want / 50) * 50));
  return [...f.weights].sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0];
}

/**
 * How wide each family sets: the average advance per character, in ems, of capitals and of lower case, at
 * 400 and at 800 (or the nearest weight the family has). Measured by SocriaUX in Chromium with each family's
 * Google Fonts files, over twelve common words ("drawings", "downloadable", "international"…), November 2026.
 * Used to size a headline so its longest word fits the screen instead of breaking in the middle.
 */
const ADVANCE: Record<string, readonly [up400: number, lo400: number, up800: number, lo800: number]> = {
  'Instrument Serif': [0.477, 0.386, 0.477, 0.386],
  Fraunces: [0.701, 0.536, 0.746, 0.584],
  'Playfair Display': [0.645, 0.511, 0.694, 0.53],
  'DM Serif Display': [0.601, 0.508, 0.601, 0.508],
  'Cormorant Garamond': [0.638, 0.438, 0.65, 0.444],
  'Libre Baskerville': [0.799, 0.583, 0.827, 0.603],
  Lora: [0.67, 0.529, 0.688, 0.544],
  Newsreader: [0.684, 0.478, 0.731, 0.519],
  'Source Serif 4': [0.673, 0.546, 0.686, 0.572],
  'EB Garamond': [0.663, 0.43, 0.687, 0.476],
  'Bodoni Moda': [0.692, 0.522, 0.738, 0.564],
  'Young Serif': [0.765, 0.567, 0.765, 0.567],
  'Old Standard TT': [0.704, 0.475, 0.712, 0.49],
  Spectral: [0.705, 0.5, 0.72, 0.512],
  'IBM Plex Serif': [0.672, 0.54, 0.695, 0.559],
  Gloock: [0.677, 0.525, 0.677, 0.525],
  Inter: [0.669, 0.533, 0.689, 0.568],
  'DM Sans': [0.626, 0.526, 0.66, 0.567],
  Manrope: [0.625, 0.527, 0.662, 0.567],
  'Space Grotesk': [0.616, 0.551, 0.62, 0.551],
  'Work Sans': [0.662, 0.553, 0.681, 0.567],
  'Plus Jakarta Sans': [0.664, 0.547, 0.682, 0.567],
  'IBM Plex Sans': [0.632, 0.512, 0.657, 0.537],
  Outfit: [0.644, 0.504, 0.677, 0.535],
  Sora: [0.711, 0.583, 0.727, 0.605],
  Archivo: [0.68, 0.502, 0.723, 0.574],
  'Public Sans': [0.666, 0.525, 0.698, 0.55],
  Karla: [0.6, 0.524, 0.665, 0.567],
  Syne: [0.639, 0.504, 1.177, 0.921],
  'Bricolage Grotesque': [0.64, 0.537, 0.677, 0.573],
  Geist: [0.644, 0.517, 0.685, 0.572],
  'Instrument Sans': [0.674, 0.525, 0.68, 0.549],
  'Hanken Grotesk': [0.621, 0.506, 0.633, 0.516],
  'Familjen Grotesk': [0.596, 0.482, 0.613, 0.51],
  Unbounded: [0.84, 0.69, 0.888, 0.745],
  Anton: [0.467, 0.461, 0.467, 0.461],
  'Big Shoulders Display': [0.344, 0.331, 0.444, 0.422],
  'IBM Plex Mono': [0.6, 0.6, 0.6, 0.6],
  'JetBrains Mono': [0.6, 0.6, 0.6, 0.6],
  'Space Mono': [0.612, 0.612, 0.612, 0.612],
  'Geist Mono': [0.6, 0.6, 0.6, 0.6],
  // the faces added later, measured the same way in Chromium with their Google Fonts files over a different set of
  // twelve words, then scaled to this table's own words by the ratio found on five faces measured both ways (capitals
  // ×1.024, lower case ×1.044); monospaced faces are their fixed advance
  'Crimson Pro': [0.583, 0.46, 0.63, 0.505],
  Literata: [0.682, 0.538, 0.725, 0.608],
  'Libre Caslon Text': [0.745, 0.538, 0.791, 0.6],
  Cinzel: [0.685, 0.659, 0.746, 0.673],
  Marcellus: [0.636, 0.512, 0.636, 0.512],
  Prata: [0.749, 0.549, 0.749, 0.549],
  Italiana: [0.577, 0.47, 0.577, 0.47],
  'Abril Fatface': [0.669, 0.535, 0.669, 0.535],
  'Roboto Slab': [0.678, 0.544, 0.695, 0.552],
  'Zilla Slab': [0.642, 0.494, 0.658, 0.514],
  'Alfa Slab One': [0.782, 0.611, 0.782, 0.611],
  'Schibsted Grotesk': [0.66, 0.523, 0.719, 0.577],
  'Red Hat Display': [0.659, 0.497, 0.69, 0.543],
  Epilogue: [0.591, 0.562, 0.658, 0.598],
  Chivo: [0.65, 0.546, 0.669, 0.566],
  'Darker Grotesque': [0.531, 0.395, 0.569, 0.443],
  Rubik: [0.634, 0.529, 0.688, 0.595],
  Urbanist: [0.611, 0.495, 0.641, 0.52],
  Onest: [0.657, 0.528, 0.691, 0.55],
  Figtree: [0.652, 0.505, 0.673, 0.535],
  Oswald: [0.485, 0.403, 0.532, 0.458],
  'Barlow Condensed': [0.436, 0.383, 0.464, 0.412],
  'Bebas Neue': [0.388, 0.396, 0.388, 0.396],
  'Archivo Black': [0.763, 0.62, 0.763, 0.62],
  'Dela Gothic One': [0.908, 0.671, 0.908, 0.671],
  Orbitron: [0.788, 0.624, 0.788, 0.631],
  Michroma: [0.991, 0.71, 0.991, 0.71],
  Syncopate: [0.823, 0.857, 0.914, 0.942],
  'Chakra Petch': [0.611, 0.516, 0.638, 0.541],
  'DM Mono': [0.6, 0.6, 0.6, 0.6],
  'Martian Mono': [0.7, 0.7, 0.7, 0.7],
  'Fragment Mono': [0.618, 0.618, 0.618, 0.618],
  'Rubik Mono One': [0.85, 0.85, 0.85, 0.85],
};

/** The same measure for the faces only Graphics offers: Chromium, each family's Google Fonts files, twelve common words
 * ("drawings", "exhibition", "quarterly"…), at 400 and at 800 or the nearest weight the family has, 20 November 2026. */
const GRAPHIC_ADVANCE: Record<string, readonly [up400: number, lo400: number, up800: number, lo800: number]> = {
  'Federant': [0.616, 0.503, 0.616, 0.503],
  'Elsie': [0.61, 0.484, 0.677, 0.536],
  'Cormorant Unicase': [0.626, 0.503, 0.637, 0.509],
  'Metamorphous': [0.746, 0.604, 0.746, 0.604],
  'Limelight': [0.669, 0.591, 0.669, 0.591],
  'Poiret One': [0.552, 0.441, 0.552, 0.441],
  'Federo': [0.626, 0.431, 0.626, 0.431],
  'Josefin Sans': [0.674, 0.476, 0.688, 0.51],
  'Jost': [0.597, 0.444, 0.684, 0.513],
  'Shrikhand': [0.709, 0.595, 0.709, 0.595],
  'Fascinate': [0.639, 0.594, 0.639, 0.594],
  'Monoton': [0.775, 0.735, 0.775, 0.735],
  'Righteous': [0.618, 0.499, 0.618, 0.499],
  'Gravitas One': [0.902, 0.797, 0.902, 0.797],
  'Rye': [0.719, 0.58, 0.719, 0.58],
  'Sancreek': [0.557, 0.516, 0.557, 0.516],
  'Holtwood One SC': [0.85, 0.784, 0.85, 0.784],
  'Ultra': [0.814, 0.702, 0.814, 0.702],
  'Bevan': [0.82, 0.631, 0.82, 0.631],
  'UnifrakturMaguntia': [0.792, 0.411, 0.792, 0.411],
  'Uncial Antiqua': [0.758, 0.625, 0.758, 0.625],
  'Fondamento': [0.683, 0.46, 0.683, 0.46],
  'Bangers': [0.403, 0.406, 0.403, 0.406],
  'Luckiest Guy': [0.57, 0.576, 0.57, 0.576],
  'Comic Neue': [0.594, 0.445, 0.587, 0.449],
  'Lobster': [0.579, 0.421, 0.579, 0.421],
  'Pacifico': [0.786, 0.441, 0.786, 0.441],
  'Special Elite': [0.599, 0.577, 0.599, 0.577],
  'Courier Prime': [0.6, 0.6, 0.6, 0.6],
  'Permanent Marker': [0.659, 0.536, 0.659, 0.536],
  'Rock Salt': [0.84, 0.665, 0.84, 0.665],
  'Caveat Brush': [0.474, 0.38, 0.474, 0.38],
  'Amatic SC': [0.322, 0.318, 0.326, 0.322],
  'Rubik Distressed': [0.685, 0.585, 0.685, 0.585],
  'Rubik Wet Paint': [0.685, 0.585, 0.685, 0.585],
  'Rubik Glitch': [0.685, 0.585, 0.685, 0.585],
  'Black Ops One': [0.685, 0.594, 0.685, 0.594],
  'Saira Stencil One': [0.636, 0.514, 0.636, 0.514],
  'Big Shoulders Stencil Display': [0.334, 0.315, 0.431, 0.402],
  'Audiowide': [0.762, 0.599, 0.762, 0.599],
  'Krona One': [0.868, 0.706, 0.868, 0.706],
  'Rajdhani': [0.506, 0.429, 0.517, 0.45],
  'Share Tech Mono': [0.54, 0.54, 0.54, 0.54],
  'Major Mono Display': [0.74, 0.74, 0.74, 0.74],
  'Tektur': [0.625, 0.53, 0.625, 0.542],
  'Exo 2': [0.594, 0.497, 0.632, 0.535],
  'Russo One': [0.673, 0.551, 0.673, 0.551],
  'Staatliches': [0.422, 0.422, 0.422, 0.422],
  'Notable': [0.808, 0.808, 0.808, 0.808],
  'Bungee': [0.707, 0.707, 0.707, 0.707],
  'Bungee Shade': [0.807, 0.807, 0.807, 0.807],
  'VT323': [0.4, 0.4, 0.4, 0.4],
  'Press Start 2P': [1, 1, 1, 1],
  'Silkscreen': [0.712, 0.712, 0.837, 0.837],
  'Nunito': [0.643, 0.485, 0.669, 0.517],
  'Quicksand': [0.622, 0.496, 0.631, 0.523],
  'Fredoka': [0.62, 0.482, 0.609, 0.492],
  'Hind': [0.575, 0.46, 0.612, 0.492],
  'Rozha One': [0.586, 0.522, 0.586, 0.522],
  'Teko': [0.367, 0.318, 0.489, 0.425],
  'Sarpanch': [0.635, 0.538, 0.675, 0.58],
  'Kalam': [0.58, 0.432, 0.575, 0.462],
  'Khand': [0.419, 0.382, 0.455, 0.402],
  'Yeseva One': [0.663, 0.555, 0.663, 0.555],
  'Fjalla One': [0.464, 0.42, 0.464, 0.42],
  'Playfair Display SC': [0.626, 0.61, 0.663, 0.637],
  'Shippori Mincho': [0.737, 0.519, 0.767, 0.549],
  'Anybody': [0.581, 0.531, 0.674, 0.633],
  'Roboto Flex': [0.487, 0.379, 0.591, 0.511],
  'Recursive': [0.612, 0.543, 0.612, 0.543],
};

/** The average advance of one character of this face at this weight, in ems (capitals or lower case). */
export function advanceEm(name: string, weight: number, upper: boolean): number {
  const f = anyFace(name);
  const a = f ? (ADVANCE[f.name] ?? GRAPHIC_ADVANCE[f.name]) : undefined;
  if (!a) return f?.kind === 'mono' ? 0.6 : upper ? 0.72 : 0.56;
  const t = Math.max(0, Math.min(1, (weight - 400) / 400));
  return upper ? a[0] + (a[2] - a[0]) * t : a[1] + (a[3] - a[1]) * t;
}

/** The variable axes a graphic loads a family with (italic and the weight range aside), each with its range: what a
 * text's own axes may set. A static family has none. */
export function fontAxes(name: string): Record<string, [number, number]> {
  const f = graphicFont(name);
  if (!f || !f.axes.includes('@')) return {};
  const [tagsPart, valuesPart] = f.axes.split('@');
  const first = valuesPart.split(';')[0].split(',');
  const out: Record<string, [number, number]> = {};
  tagsPart.split(',').forEach((t, i) => {
    if (t === 'ital' || t === 'wght') return;
    const m = (first[i] ?? '').match(/^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/);
    if (m) out[t] = [Number(m[1]), Number(m[2])];
  });
  return out;
}

/** Whether the family has a true italic loaded. */
export function hasItalic(name: string): boolean {
  return !!anyFace(name)?.italic;
}

/** The stylesheet URL that loads these families for a website, or null when there are none. */
export function fontStylesheet(names: readonly string[]): string | null {
  return stylesheetOf(names, knownFont);
}

/** The stylesheet URL that loads these families for a graphic (its own faces and axes too), or null. */
export function graphicFontStylesheet(names: readonly string[]): string | null {
  return stylesheetOf(names, graphicFont);
}

function stylesheetOf(names: readonly string[], look: (n: string) => FontEntry | null): string | null {
  const families = [...new Set(names)]
    .map((n) => look(n))
    .filter((f): f is FontEntry => !!f)
    .map((f) => `family=${encodeURIComponent(f.name).replace(/%20/g, '+')}${f.axes ? `:${f.axes}` : ''}`);
  if (!families.length) return null;
  return `https://fonts.googleapis.com/css2?${[...new Set(families)].join('&')}&display=swap`;
}

/** The CSS font-family value for a face, with a fallback of its kind. */
export function fontStack(name: string): string {
  const f = anyFace(name);
  const fallback = f?.kind === 'serif' ? 'Georgia, "Times New Roman", serif' : f?.kind === 'mono' ? 'ui-monospace, Menlo, monospace' : 'system-ui, -apple-system, "Segoe UI", sans-serif';
  return `"${f?.name ?? name}", ${fallback}`;
}

/** The list, as one compact line per font, for a prompt. */
export function fontMenu(): string {
  return FONTS.map((f) => `${f.name} (${f.kind}${f.displayOnly ? ', headlines only' : ''}: ${f.note})`).join('; ');
}
