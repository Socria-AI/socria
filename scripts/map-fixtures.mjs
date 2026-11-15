// scripts/map-fixtures.mjs — SYNTHETIC CONVERSATIONS FOR THE UNIVERSAL MAP: deterministic, no person in them.
//
// Used by scripts/map-gallery.tsx (the map drawn in a real browser by scripts/verify-map.mjs) and by
// test/logos5-universal-map.test.mjs. Each conversation is a line of thinking with a few ideas, a subject read
// from its map (map.ask), and messages whose times place it in the past: some today, some this week, this month,
// and back over two years — so every temporal scale has something of its own.

const SUBJECTS = [
  { domain: 'Biology', topics: ['the immune system', 'photosynthesis', 'cell division', 'genetics', 'enzymes', 'the nervous system', 'evolution', 'ecosystems'] },
  { domain: 'Economics', topics: ['inflation', 'supply and demand', 'monetary policy', 'game theory', 'taxes on sellers', 'comparative advantage', 'interest rates'] },
  { domain: 'Programming', topics: ['recursion', 'React state', 'SQL joins', 'async JavaScript', 'type systems', 'hash maps', 'testing strategy', 'caching'] },
  { domain: 'History', topics: ['the French Revolution', 'the Cold War', 'the Industrial Revolution', 'the Roman Republic', 'the printing press'] },
  { domain: 'Statistics', topics: ['p-values', 'Bayes theorem', 'regression', 'sampling bias', 'confidence intervals'] },
  { domain: 'Philosophy', topics: ['free will', 'utilitarianism', 'the problem of evil', 'personal identity', 'Stoicism'] },
  { domain: 'Physics', topics: ['entropy', 'special relativity', 'quantum tunnelling', 'orbits', 'electric fields'] },
  { domain: 'Writing', topics: ['my thesis introduction', 'a cover letter', 'essay structure', 'a short story opening'] },
  { domain: 'Personal finance', topics: ['an emergency fund', 'index funds', 'a mortgage', 'a monthly budget'] },
  { domain: 'Music theory', topics: ['chord progressions', 'the circle of fifths', 'counterpoint'] },
  { domain: 'Design', topics: ['typography', 'colour contrast', 'onboarding flows', 'information hierarchy'] },
  { domain: 'Spanish', topics: ['the subjunctive', 'ser and estar', 'travel phrases'] },
];
const ANGLES = ['How does', 'Why does', 'What is', 'Explain', 'Help me understand', 'Practise', 'Compare', 'Questions about', 'Notes on', 'Revising'];
const IDEAS = ['definition', 'example', 'mechanism', 'cause', 'effect', 'exception', 'history', 'formula', 'misconception', 'application', 'counterpoint', 'evidence', 'summary', 'question'];

/** a small deterministic generator (mulberry32) */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;

/**
 * n conversations ending at `now`. Ages: ~8% today, ~17% earlier this week, ~25% earlier this month, the rest
 * spread back over two years (denser recently). A few are Core chats, a few are filed in the given Projects.
 */
export function makeConversations(n, { now = Date.UTC(2026, 10, 15, 15, 0, 0), seed = 7, projects = [] } = {}) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    // the busiest subjects get the most conversations
    const s = SUBJECTS[Math.min(SUBJECTS.length - 1, Math.floor(Math.pow(r(), 1.6) * SUBJECTS.length))];
    const topic = s.topics[Math.floor(r() * s.topics.length)];
    const angle = ANGLES[Math.floor(r() * ANGLES.length)];
    const u = r();
    const age = u < 0.08 ? r() * 0.4 * DAY : u < 0.25 ? (1 + r() * 5.5) * DAY : u < 0.5 ? (7 + r() * 22) * DAY : (30 + Math.pow(r(), 1.7) * 700) * DAY;
    const last = now - age;
    const span = Math.min(age * 0.5, r() * 3 * DAY);
    const first = last - span;
    const turns = 1 + Math.floor(r() * 14);
    const messages = [];
    for (let k = 0; k < turns; k++) {
      const at = Math.round(first + ((last - first) * k) / Math.max(1, turns - 1));
      messages.push({ role: 'user', content: `${angle} ${topic}?`, at });
      messages.push({ role: 'assistant', content: `On ${topic}: the ${IDEAS[(i + k) % IDEAS.length]} matters most here.`, at: at + 5000 });
    }
    const ideaN = 2 + Math.floor(r() * 7);
    const nodes = [];
    for (let k = 0; k < ideaN; k++) nodes.push({ id: `n${k}`, label: `${topic} ${IDEAS[(i * 3 + k) % IDEAS.length]}` });
    const edges = nodes.slice(1).map((nd, k) => ({ from: nodes[Math.floor(k / 2)].id, to: nd.id }));
    const core = r() < 0.12;
    const projectId = projects.length && r() < 0.15 ? projects[Math.floor(r() * projects.length)].id : null;
    const title = `${angle} ${topic}`.replace(/^\w/, (c) => c.toUpperCase());
    out.push(
      core
        ? { id: `c${i}`, kind: 'core', title, updatedAt: Math.round(last), projectId }
        : { id: `s${i}`, title, updatedAt: Math.round(last), projectId, map: { nodes, edges, ask: { topic, domain: s.domain } }, messages }
    );
  }
  return out;
}

export const FIXTURE_PROJECTS = [
  { id: 'p_thesis', name: 'Thesis', color: 'moss', createdAt: Date.UTC(2026, 0, 10) },
  { id: 'p_startup', name: 'Startup ideas', color: 'plum', createdAt: Date.UTC(2026, 4, 2) },
];
