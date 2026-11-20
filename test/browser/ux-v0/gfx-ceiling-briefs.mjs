// test/browser/ux-v0/gfx-ceiling-briefs.mjs — the thirty briefs of the Graphics creative-ceiling benchmark
// (its section 16), each as a designer would write it. Shared by the benchmark and the probes.
import { readFileSync } from 'node:fs';
import { FX } from './env.mjs';

export const pic = (f, w, h) => ({ id: `p${f.replace(/\W/g, '')}`, kind: 'image', src: `data:image/jpeg;base64,${readFileSync(FX + f).toString('base64')}`, width: w, height: h, name: f.replace(/\.jpg$/, ''), credit: 'SocriaUX test fixture', source: 'upload' });

export const CEILING_BRIEFS = [
  { n: 1, name: 'Swiss editorial poster', words: 'A Swiss poster for “Form Follows Function”, a lecture on Swiss graphic design, “Josef Müller-Brockmann and the grid”, swiss, grid-based', content: { brand: 'Kunstgewerbeschule', meta: ['14 May 2027, 19:00', 'Aula, Zürich'] } },
  { n: 2, name: 'Brutalist typography', words: 'A brutalist typographic poster “No more quiet buildings”, raw, brutalist', content: { brand: 'Concrete Assembly', meta: ['Manifesto reading', '2 April 2027'] } },
  { n: 3, name: 'Luxury fashion ad', words: 'A luxury fashion advertisement for “Maison Orée”, “The Autumn Collection”, luxurious, elegant', content: { cta: 'Discover the collection', brand: 'Maison Orée' }, images: ['window.jpg'] },
  { n: 4, name: 'Experimental electronic music poster', words: 'An experimental poster for “Signal / Noise”, an electronic music night, “Modular synthesis until dawn”, experimental, electronic', content: { brand: 'Basement Lab', meta: ['9 August 2027', 'Warehouse 7, Berlin'] } },
  { n: 5, name: 'Minimalist product announcement', words: 'A minimalist product announcement for “Aurel Ceramic Kettle”, “Pours like silk”, minimal', content: { cta: 'Order now', brand: 'Aurel' }, images: ['ceramic.jpg'] },
  { n: 6, name: 'Maximalist abstract', words: 'A maximalist poster “Everything, All at Once”, a festival of colour, maximalist, loud', content: { brand: 'Chroma Fest', meta: ['1–3 June 2027', 'Parque, Porto'] } },
  { n: 7, name: 'Organic fluid', words: 'An organic, fluid poster for “Tidewater”, a botanical garden night walk, “Follow the river”, organic, flowing', content: { brand: 'Jardim Botânico', meta: ['Every Friday in July', '21:00'] } },
  { n: 8, name: 'Geometric brand identity', words: 'A geometric brand identity board for “Kubik Studio”, an architecture practice, geometric, bauhaus', content: { brand: 'Kubik Studio', subhead: 'Architecture in whole numbers' }, kind: 'identity' },
  { n: 9, name: 'Technical conference poster', words: 'A poster for “Systems 2027”, a technology conference, “Infrastructure for the next decade”, technical, engineering', content: { brand: 'Systems Conf', meta: ['3–5 November 2027', 'Rotterdam Ahoy'] } },
  { n: 10, name: 'Cinematic product ad', words: 'A cinematic advertisement for “Nocturne”, noise-cancelling headphones, “Hear the silence”, cinematic, dramatic', content: { brand: 'Nocturne Audio', meta: ['Available 12 October'] }, images: ['dusk.jpg'] },
  { n: 11, name: 'Retro poster', words: 'A retro poster for “Sunset Drive-In”, a summer film night, “Double feature under the stars”, retro, 70s', content: { brand: 'Sunset Drive-In', meta: ['Saturdays in August', 'Gates 20:00'] } },
  { n: 12, name: 'Futuristic interface-inspired', words: 'A futuristic, interface-inspired Instagram post for “Orbit OS 3”, “The operating system for your home”, futuristic, interface', content: { brand: 'Orbit', cta: 'Join the beta' } },
  { n: 13, name: 'Magazine cover', words: 'An editorial magazine cover “The Craft Issue”, “Makers who slowed down”, editorial', content: { brand: 'Atelier', items: ['The potter who waits a year', 'Inside the last loom in town', 'A kitchen without plastic'] }, images: ['pour.jpg'] },
  { n: 14, name: 'Album cover', words: 'An album cover for “Static Bloom”, abstract, experimental', content: { brand: 'Mira Sol' } },
  { n: 15, name: 'Book cover', words: 'A book cover for the novel “The Salt Archive”, literary, serious', content: { brand: 'Inês Duarte' } },
  { n: 16, name: 'Social campaign', words: 'An Instagram portrait post for a campaign “Every river starts as a stream”, “Protect the headwaters”, serious, bold', content: { brand: 'Clearwater Trust', cta: 'Sign the pledge' }, kind: 'social', formats: ['instagram-portrait'] },
  { n: 17, name: 'Scientific infographic', words: 'A scientific infographic “How much of Earth’s water is fresh”, scientific', content: { data: [{ label: 'Salt water', value: 97.5 }, { label: 'Fresh water', value: 2.5 }], dataUnit: '%', dataSource: 'USGS Water Science School', items: ['Most fresh water is locked in ice.'] } },
  { n: 18, name: 'Geometric pattern', words: 'A geometric pattern poster for “Tessellate”, an exhibition of Islamic geometry, geometric, modular', content: { brand: 'Museu do Oriente', meta: ['10 March – 30 June 2027'] } },
  { n: 19, name: 'Halftone', words: 'A halftone poster for “Print Is Not Dead”, a zine fair, halftone, newsprint', content: { brand: 'Small Press Club', meta: ['5–6 October 2027', 'Old Market Hall'] }, images: ['people.jpg'] },
  { n: 20, name: 'Typography-only', words: 'A typography-only poster for “Words Fail Me”, a poetry slam, type only', content: { brand: 'Open Mic Society', meta: ['Thursday 18 March', '20:00'] } },
  { n: 21, name: 'Collage', words: 'A collage poster for “Found Objects”, a mixed-media show, collage, zine', content: { brand: 'Gallery Twelve', meta: ['April 2027'] }, images: ['marble.jpg'] },
  { n: 22, name: 'Monochromatic editorial', words: 'A monochromatic editorial poster “Black Paper”, an essay series on architecture, “Seven essays on concrete”, monochrome, editorial', content: { brand: 'Black Paper Press' } },
  { n: 23, name: 'High-contrast experimental', words: 'A high-contrast experimental poster for “Glitch Theory”, a talk on digital errors, experimental, black and white, glitch', content: { brand: 'Error Studies', meta: ['22 January 2027'] } },
  { n: 24, name: 'Soft organic brand', words: 'A soft organic brand post for “Lull”, a sleep-wellness studio, “Rest is a practice”, soft, organic, pastel', content: { brand: 'Lull', cta: 'Book a session' } },
  { n: 25, name: 'Angular technical ad', words: 'An angular, technical advertisement for “Vektor X1”, a carbon racing bicycle, “Built for the climb”, angular, dynamic, technical', content: { brand: 'Vektor', cta: 'Ride it' } },
  { n: 26, name: 'Premium packaging label', words: 'A premium packaging label for “Wild Fennel Honey”, “Raw, from the Alentejo hills”, premium, label', content: { brand: 'Colmeia', meta: ['250 g', 'Harvested August 2026'] } },
  { n: 27, name: 'Abstract vector', words: 'An abstract vector poster “Unsaid Shapes”, an abstract art exhibition, abstract', content: { brand: 'Galeria Nove', meta: ['4 March – 12 April 2027'] } },
  { n: 28, name: 'Procedural line-field', words: 'A generative line-field poster for “Field Lines”, a creative coding meetup, generative, procedural', content: { brand: 'Code & Canvas', meta: ['Every first Tuesday', 'Lab 3'] } },
  { n: 29, name: 'Multi-material campaign', words: 'A multi-format campaign for “Night Market Lisbon”, “Food, music and makers after dark”, playful', content: { brand: 'Night Market', meta: ['Every Friday in July', 'Ribeira, Lisbon'] } },
  { n: 30, name: 'Website-to-graphics adaptation', words: 'A poster for the opening night of “Salt & Ember”, “Twelve tables, one fire”, 2 May 2027', content: { brand: 'Salt & Ember', meta: ['2 May 2027'] }, fromWebsite: true },
];

const SIZES = { 'window.jpg': [800, 600], 'ceramic.jpg': [800, 600], 'dusk.jpg': [800, 600], 'pour.jpg': [800, 600], 'people.jpg': [800, 600], 'marble.jpg': [800, 600] };
export const assetsFor = (spec) => (spec.images ?? []).map((f) => pic(f, ...(SIZES[f] ?? [800, 600])));

/** The briefs composed as the app composes them: the brief read from the words, its directions from SocriaUX's own
 * engine (the website's approved direction for the adaptation), the first direction used. */
export function composeAll(V, salt = 'ceiling') {
  const C = V.gfxCompose;
  const wbrief = V.normalizeBrief({ pageType: 'website', platform: 'web', objective: 'A website for Salt & Ember, a twelve-table restaurant cooking over fire, where guests book a table and read the menu.', personality: ['warm', 'confident'], visualDirection: 'Warm and editorial, firelight and dark wood.', palette: [], typography: { display: '', body: '' }, decisions: { colour: 'delegated', typography: 'delegated' } }, new Set());
  const siteDir = V.proposeDirections({ brief: wbrief, salt: 'graphics-bench-site' })[1];
  const directionsFor = (brief, s) => {
    const accent = C.accentFor(brief, s);
    const db = V.normalizeBrief({ pageType: 'website', objective: brief.purpose || brief.content.headline, personality: brief.mood, visualDirection: [brief.purpose, brief.mood.join(', ')].filter(Boolean).join('. '), palette: [{ name: 'Accent', hex: accent.hex, role: 'accent' }], typography: { display: '', body: '' }, decisions: { colour: 'delegated', typography: 'delegated' } });
    return V.proposeDirections({ brief: db, salt: s, count: 3 }).map((d) => C.graphicDirectionOf(d));
  };
  return CEILING_BRIEFS.map((spec) => {
    const assets = assetsFor(spec);
    const extra = { ...(spec.kind ? { kind: spec.kind } : {}), ...(spec.formats ? { formats: spec.formats } : {}), images: assets.map((a) => a.id) };
    const brief = C.readGraphicBrief(spec.words, extra);
    brief.content = { ...brief.content, ...spec.content };
    const dir = spec.fromWebsite ? C.graphicDirectionOf(siteDir) : directionsFor(brief, `${salt}-${spec.n}`)[0];
    const t0 = performance.now();
    const made = C.composeGraphic(brief, dir, { seed: spec.n * 7, assets, name: spec.name });
    return { spec, brief, dir, made, ms: performance.now() - t0 };
  });
}
