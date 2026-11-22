// The six dogfood projects (docs/SOCRIAUX-CREATIVE-WORKSPACE.md §6), shared by dogfood.mjs and sol-eval.mjs:
// Socria's promotional site and product announcement (the benchmark's briefs), a research lab, an
// experimental portfolio, a finance interface and a dance company. Each has a brief, the pictures it may
// place, and hand-written sections (for runs where the copy is fixed and only the design system is measured).
import { BRIEFS } from './benchmark-briefs.mjs';

/** The projects, built with the modules under test (V). */
export function projectsFor(V) {
  const ref = (n, o = {}) => ({ provider: 'openverse', providerId: n, id: `openverse:${n}`, url: `https://images.example.test/${n}.jpg`, thumb: `https://images.example.test/${n}.jpg`, width: 1600, height: 1067, title: n.replace(/-/g, ' '), creator: 'A', creatorUrl: '', sourceUrl: 'https://example.org/' + n, license: 'CC BY 2.0', licenseUrl: '', attribution: n, category: 'imagery', state: 'kept', ...o });
  const brief = (o) => V.normalizeBrief({ pageType: 'website', platform: 'web', userGoals: [], functionalRequirements: [], openQuestions: [], references: [], ...o }, null);

  const fromBench = (id) => {
    const b = BRIEFS.find((x) => x.id === id);
    return { brief: V.normalizeBrief(b.brief, null), sections: b.sections, pics: [] };
  };

  const PROJECTS = [
    { id: 'socria-promo', name: 'Socria, promotional site', ...fromBench('socria') },
    { id: 'socria-launch', name: 'Socria One, product announcement', ...fromBench('socria-one') },
    {
      id: 'research',
      name: 'Northfield Climate Lab, research site',
      brief: brief({
        objective: 'Share the lab’s research on coastal flooding, its open data and papers, and recruit doctoral students.',
        audience: 'Researchers, policy makers and prospective doctoral students',
        personality: ['rigorous', 'clear', 'open', 'calm'],
        visualDirection: 'Precise and data-forward, like a well-made academic report: editorial, quiet, trustworthy.',
        palette: [{ hex: '#f7f7f4', role: 'background' }, { hex: '#14213d', role: 'text' }, { hex: '#1d6e8a', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }],
        typography: { display: 'Source Serif 4', body: 'Public Sans', rationale: '' },
        layoutDirection: 'An index of programmes, figures, papers and data.',
      }),
      pics: ['dusk', 'grid'],
      sections: [
        { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: 'Northfield Climate Lab', links: ['Research', 'Data', 'Papers', 'People'], cta: 'Apply' } },
        { id: 'hero', kind: 'hero', variant: 'editorial', content: { eyebrow: 'Coastal flooding, measured', title: 'How the sea comes *in*, street by street.', subtitle: 'Twenty years of tide, rain and surge records, open to anyone, and the models we build from them.', primary: 'Explore the data', secondary: 'Read the papers' }, images: ['openverse:dusk'] },
        { id: 'figs', kind: 'stats', variant: 'row', content: { items: [{ value: '2,400', label: 'gauges' }, { value: '20 yrs', label: 'of records' }, { value: '61', label: 'papers' }] } },
        { id: 'prog', kind: 'features', variant: 'index', content: { title: 'Programmes', items: [{ title: 'Surge forecasting', text: 'Predicting the next ten days of coastal water levels.' }, { title: 'Urban drainage', text: 'Where rain goes when the drains are full.' }, { title: 'Policy and risk', text: 'Turning flood models into decisions councils can make.' }] } },
        { id: 'data', kind: 'split', variant: 'image-right', content: { eyebrow: 'Open data', title: 'Every measurement, downloadable', text: 'Hourly records from every gauge, documented and licensed for reuse.', bullets: ['CSV and NetCDF', 'Versioned releases', 'API access'], cta: 'Browse the data' }, images: ['openverse:grid'] },
        { id: 'cta', kind: 'cta', variant: 'band', content: { title: 'Doctoral places for 2027', text: 'Four funded places, starting in October.', primary: 'Apply by 31 January' } },
        { id: 'foot', kind: 'footer', variant: 'columns', content: { brand: 'Northfield Climate Lab', tagline: 'Coastal flooding, measured.', columns: [{ title: 'Lab', links: ['Research', 'People'] }], legal: '© Northfield' } },
      ],
    },
    {
      id: 'portfolio',
      name: 'Mira Okafor, experimental portfolio',
      brief: brief({
        objective: 'Show Mira’s illustration and animation work and bring in editorial and studio commissions.',
        audience: 'Art directors at magazines, studios and agencies',
        personality: ['playful', 'strange', 'bold', 'warm'],
        visualDirection: 'Experimental: oversized type, colour fields, asymmetric, the work at full size.',
        palette: [{ hex: '#fff4e6', role: 'background' }, { hex: '#1e1b18', role: 'text' }, { hex: '#e8452c', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }],
        typography: { display: 'Unbounded', body: 'Inter', rationale: '' },
        layoutDirection: 'The work first, words second.',
      }),
      pics: ['people', 'ceramic', 'window', 'marble'],
      sections: [
        { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: 'Mira Okafor', links: ['Work', 'Motion', 'About'], cta: 'Commission' } },
        { id: 'hero', kind: 'hero', variant: 'poster', content: { eyebrow: 'Illustration · animation', title: 'Drawings that *move*.', subtitle: 'For magazines, studios and the odd record sleeve.', primary: 'See the work' } },
        { id: 'work', kind: 'gallery', variant: 'mosaic', content: { title: 'Recent work' }, images: ['openverse:people', 'openverse:ceramic', 'openverse:window', 'openverse:marble'] },
        { id: 'about', kind: 'text', variant: 'lead', content: { title: 'Mira draws the way people talk with their hands.', paragraphs: ['Ten years of editorial illustration, three animated shorts, and a habit of drawing on the train.'] } },
        { id: 'q', kind: 'quote', variant: 'pull', content: { quote: 'She made our quarterly feel like a comic you wanted to keep.', author: 'An art director', role: 'a design magazine' } },
        { id: 'cta', kind: 'cta', variant: 'statement', content: { title: 'Got a strange brief?', primary: 'Write to Mira' } },
        { id: 'foot', kind: 'footer', variant: 'simple', content: { brand: 'Mira Okafor', tagline: 'Drawings that move.', legal: '© Mira Okafor' } },
      ],
    },
    {
      id: 'product-ui',
      name: 'Ledgerline, finance operations interface',
      brief: brief({
        objective: 'Give finance teams one calm screen for this month’s close: what is reconciled, what is not, and who is on it.',
        audience: 'Finance operations leads in mid-sized companies',
        personality: ['precise', 'calm', 'trustworthy'],
        visualDirection: 'A sophisticated product interface: dense where it must be, quiet everywhere else.',
        palette: [{ hex: '#ffffff', role: 'background' }, { hex: '#101828', role: 'text' }, { hex: '#3b5bdb', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }],
        typography: { display: 'Inter', body: 'Inter', rationale: '' },
        pageType: 'app-screen',
      }),
      pics: [],
      sections: [
        { id: 'nav', kind: 'app-nav', variant: 'sidebar', content: { brand: 'Ledgerline', items: ['Close', 'Accounts', 'Reconcile', 'Reports', 'Team'], active: 'Close', user: 'A. Finance' } },
        { id: 'head', kind: 'app-header', variant: 'default', content: { title: 'November close', subtitle: 'Day 3 of 5 · 82% reconciled', actions: ['Export', 'Assign'], search: true } },
        { id: 'figs', kind: 'stat-cards', variant: 'default', content: { items: [{ label: 'Reconciled', value: '82%', delta: '+9 today', trend: 'up' }, { label: 'Open items', value: '146', delta: '−31', trend: 'down' }, { label: 'Days left', value: '2', trend: 'flat' }] } },
        { id: 'chart', kind: 'chart', variant: 'area', content: { title: 'Reconciled by day', labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], series: [{ name: 'This month', values: [31, 58, 82, 82, 82] }, { name: 'Last month', values: [24, 49, 71, 90, 100] }] } },
        { id: 'table', kind: 'table', variant: 'default', content: { title: 'Accounts', columns: ['Account', 'Owner', 'Status'], rows: [{ cells: ['Bank: operating', 'Priya'], status: 'Reconciled' }, { cells: ['Payroll', 'Tom'], status: 'Open' }, { cells: ['Card spend', 'Ana'], status: 'In review' }] } },
      ],
    },
    {
      id: 'motion-site',
      name: 'Pulse Dance Company, motion-rich site',
      brief: brief({
        objective: 'Sell tickets for Pulse’s 2027 season and make the company’s movement felt before anyone reads a word.',
        audience: 'Contemporary dance audiences and curious first-timers',
        personality: ['kinetic', 'bold', 'physical', 'night'],
        visualDirection: 'Motion-rich: kinetic type, a dark stage, light in one strong colour.',
        palette: [{ hex: '#0f0e12', role: 'background' }, { hex: '#f4f1ea', role: 'text' }, { hex: '#ff3d7f', role: 'accent' }, { hex: '#0f0e12', role: 'accent-text' }],
        typography: { display: 'Anton', body: 'Inter', rationale: '' },
        layoutDirection: 'One huge statement, then the season as a running list.',
      }),
      pics: ['people', 'dusk', 'window'],
      sections: [
        { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: 'Pulse', links: ['Season', 'Company', 'Visit'], cta: 'Tickets' } },
        { id: 'hero', kind: 'hero', variant: 'statement', content: { eyebrow: 'Season 2027', title: 'Bodies in *motion*.', subtitle: 'Six new works, one stage, forty nights.', primary: 'Book the season', secondary: 'Watch the trailer' } },
        { id: 'works', kind: 'features', variant: 'columns', content: { title: 'This season', items: [{ title: 'Undertow', text: 'Twelve dancers and a falling wall of sound.' }, { title: 'Glass hours', text: 'A duet for two dancers and one light.' }, { title: 'Run', text: 'Forty minutes that never stop.' }] } },
        { id: 'gal', kind: 'gallery', variant: 'grid', content: { title: 'In rehearsal' }, images: ['openverse:people', 'openverse:dusk', 'openverse:window'] },
        { id: 'figs', kind: 'stats', variant: 'giant', content: { items: [{ value: '6', label: 'new works' }, { value: '40', label: 'nights' }] } },
        { id: 'cta', kind: 'cta', variant: 'statement', content: { title: 'Book the whole season', primary: 'Season tickets' } },
        { id: 'foot', kind: 'footer', variant: 'simple', content: { brand: 'Pulse Dance Company', tagline: 'Bodies in motion.', legal: '© Pulse' } },
      ],
    },
  ];
  return { PROJECTS, ref, brief };
}
