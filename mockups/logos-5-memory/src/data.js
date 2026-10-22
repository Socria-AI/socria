// mockups/logos-5-memory/src/data.js — ILLUSTRATIVE SAMPLE DATA for the mockups.
//
// One coherent person (Alex Rivera) so every state tells the same story.
// Every field below corresponds to something the Mind Graph store already
// keeps (lib/mind/types.ts) or derives (lib/mind/evolve.ts):
//   type / label / content          MindNode.type, .label, .content
//   status                          MindNode.status + Provenance.review
//   pinned                          derived: MindNode.importance >= 0.8
//   recent                          derived: MindNode.updatedAt within 7 days
//   faded                           derived: low MindNode.activation, or status historical/superseded
//   warn                            a 'possible-conflict' change (detectContradictions)
//   said / from / surface / when    Provenance.kind, .conversationId (titled), .surface, .at
//   seen                            MindNode.seen (distinct extractions)
// Nothing here is a confidence score, and nothing is shown that the store
// could not say. "Today" in these mockups is 22 Oct 2026.

window.MEM = {
  today: '22 Oct 2026',
  regions: [
    { id: 'identity', name: 'Identity', hint: 'What you value and hold true', color: '#3d4f25', types: 'Belief · Insight · Assumption · Value' },
    { id: 'goals', name: 'Goals', hint: 'Where you are heading', color: '#a3843e', types: 'Goal · Plan' },
    { id: 'work', name: 'Projects & Work', hint: 'What you are building', color: '#3e5f66', types: 'Project · Organization · Decision · Evidence' },
    { id: 'learning', name: 'Learning', hint: 'Ideas and sources you use', color: '#5f7f68', types: 'Concept · Source' },
    { id: 'people', name: 'People & Relationships', short: 'People', hint: 'Who matters, and how', color: '#8a5f62', types: 'Person' },
    { id: 'prefs', name: 'Preferences', hint: 'How you like things', color: '#74657d', types: 'Preference' },
    { id: 'recent', name: 'Recent Context', short: 'Recent', hint: 'What is happening now', color: '#8b7e6a', types: 'Event · Experience · Place' },
    { id: 'questions', name: 'Open Questions', short: 'Questions', hint: 'What is still undecided', color: '#5b6f8c', types: 'Question · Uncertainty' },
  ],
  nodes: [
    // identity
    { id: 'i1', r: 'identity', type: 'Belief', label: 'Craft over speed', content: 'Would rather ship something considered a week late than something careless on time.', status: 'confirmed', imp: 0.85, pinned: true, seen: 5, said: 'You said it', from: 'Monday check-in', surface: 'Core', when: '2 Sep' },
    { id: 'i2', r: 'identity', type: 'Insight', label: 'Thinks best by writing', content: 'Decisions get clearer once they are written out as a one-page memo.', status: 'confirmed', imp: 0.6, seen: 3, said: 'Socria noticed it in 3 conversations', from: 'Freelance or stay?', surface: 'Logos', when: '12 Aug' },
    { id: 'i3', r: 'identity', type: 'Value', label: 'Family comes first', content: 'Plans are made around time with family in San Antonio.', status: 'confirmed', imp: 0.75, seen: 4, said: 'You said it', from: 'Budget for the move', surface: 'Core', when: '30 Jun' },
    { id: 'i4', r: 'identity', type: 'Assumption', label: 'Stability over upside this year', content: 'With the move coming, a steady salary matters more than a bigger, riskier income.', status: 'tentative', imp: 0.55, seen: 2, said: 'A position you are trying on', from: 'Freelance or stay?', surface: 'Logos', when: '3 Oct' },
    { id: 'i6', r: 'identity', type: 'Belief', label: 'Remote work suits me', content: 'Prefers working from home to an office.', status: 'confirmed', imp: 0.5, seen: 3, said: 'You said it', from: 'Monday check-in', surface: 'Core', when: '14 Feb' },
    { id: 'i5', r: 'identity', type: 'Belief', label: 'Good design is mostly editing', content: 'The best work comes from cutting, not adding.', status: 'confirmed', imp: 0.4, faded: true, seen: 1, said: 'You said it', from: 'Portfolio notes', surface: 'Logos', when: '9 Feb' },
    // goals
    { id: 'g1', r: 'goals', type: 'Goal', label: 'Run the Lisbon half marathon', content: 'Race on 15 March; training four mornings a week.', status: 'confirmed', imp: 0.85, pinned: true, seen: 6, said: 'You said it', from: 'Half marathon plan', surface: 'Logos', when: '18 Sep' },
    { id: 'g3', r: 'goals', type: 'Plan', label: 'Move to Lisbon in January', content: 'A flat in Alfama from 5 January; Sam is moving too.', status: 'confirmed', imp: 0.9, pinned: true, seen: 8, said: 'You said it', from: 'Lisbon or Berlin?', surface: 'Logos', when: '4 Mar' },
    { id: 'g2', r: 'goals', type: 'Goal', label: 'Conversational Portuguese by summer', content: 'Hold a twenty-minute conversation without switching to English by June.', status: 'confirmed', imp: 0.7, seen: 4, said: 'You said it', from: 'Portuguese practice', surface: 'Logos', when: '11 Oct' },
    { id: 'g5', r: 'goals', type: 'Goal', label: 'Six months of runway', content: 'Savings to cover six months before deciding anything about freelancing.', status: 'confirmed', imp: 0.6, seen: 2, said: 'You said it', from: 'Budget for the move', surface: 'Core', when: '3 Oct' },
    { id: 'g4', r: 'goals', type: 'Plan', label: 'Move to Berlin', content: 'The plan until March: a studio in Neukölln and a German course.', status: 'superseded', imp: 0.4, faded: true, seen: 3, said: 'You said it', from: 'Lisbon or Berlin?', surface: 'Logos', when: 'Jan' },
    // work
    { id: 'w2', r: 'work', type: 'Project', label: 'Onboarding redesign', content: 'Rebuilding Tidewater’s first-run flow; v2 is due before the move.', status: 'confirmed', imp: 0.85, pinned: true, recent: true, seen: 7, said: 'You said it', from: 'Onboarding v2 scope', surface: 'Logos', when: '20 Oct' },
    { id: 'w1', r: 'work', type: 'Organization', label: 'Tidewater', content: 'Climate-tech startup where Alex is lead product designer.', status: 'confirmed', imp: 0.7, seen: 9, said: 'You said it', from: 'Monday check-in', surface: 'Core', when: '13 Oct' },
    { id: 'w3', r: 'work', type: 'Decision', label: 'Ship onboarding v2 in two phases', content: 'Phase one before the move; phase two from Lisbon in February.', status: 'proposed', imp: 0.75, recent: true, seen: 2, said: 'You said it', from: 'Onboarding v2 scope', surface: 'Logos', when: '20 Oct' },
    { id: 'w4', r: 'work', type: 'Evidence', label: '38% leave at step 3', content: 'From the Q3 funnel export: most new users leave at workspace setup.', status: 'confirmed', imp: 0.6, seen: 2, said: 'From your file', from: 'onboarding-funnel-q3.csv', surface: 'File', when: '14 Oct' },
    { id: 'w5', r: 'work', type: 'Decision', label: 'Turned down the agency offer', content: 'Said no to the Northwind role in September; staying at Tidewater through the move.', status: 'confirmed', imp: 0.55, seen: 2, said: 'You said it', from: 'Freelance or stay?', surface: 'Logos', when: '22 Sep' },
    { id: 'w7', r: 'work', type: 'Organization', label: 'Northwind Studio', content: 'Design agency that offered Alex a role in September.', status: 'confirmed', imp: 0.3, seen: 1, said: 'You said it', from: 'Freelance or stay?', surface: 'Logos', when: '22 Sep' },
    { id: 'w6', r: 'work', type: 'Project', label: 'Portfolio site', content: 'A personal site for case studies; paused since July.', status: 'confirmed', imp: 0.35, faded: true, seen: 2, said: 'You said it', from: 'Portfolio notes', surface: 'Logos', when: '8 Jul' },
    // learning
    { id: 'l1', r: 'learning', type: 'Concept', label: 'Systems thinking', content: 'Stocks, flows and feedback loops — used to reason about onboarding drop-off.', status: 'confirmed', imp: 0.65, seen: 4, said: 'You said it', from: 'Reading: Thinking in Systems', surface: 'Logos', when: '14 Oct' },
    { id: 'l2', r: 'learning', type: 'Source', label: 'Thinking in Systems', content: 'Donella Meadows. Notes uploaded on 2 Oct; chapters 1–3 read.', status: 'confirmed', imp: 0.5, seen: 2, said: 'From your file', from: 'meadows-notes.pdf', surface: 'File', when: '2 Oct' },
    { id: 'l3', r: 'learning', type: 'Concept', label: 'Portuguese past tenses', content: 'Pretérito perfeito or imperfeito — still mixing them up.', status: 'confirmed', imp: 0.45, recent: true, seen: 3, said: 'You said it', from: 'Portuguese practice', surface: 'Logos', when: '16 Oct' },
    { id: 'l4', r: 'learning', type: 'Concept', label: 'Zone 2 training', content: 'Easy runs at conversational pace build the base for the half.', status: 'confirmed', imp: 0.5, seen: 2, said: 'You said it', from: 'Half marathon plan', surface: 'Logos', when: '9 Oct' },
    // people
    { id: 'p1', r: 'people', type: 'Person', label: 'Sam', content: 'Alex’s partner; moving to Lisbon too.', status: 'confirmed', imp: 0.9, pinned: true, seen: 11, said: 'You said it', from: 'Lisbon or Berlin?', surface: 'Logos', when: '12 Oct' },
    { id: 'p2', r: 'people', type: 'Person', label: 'Maya Chen', content: 'Head of product at Tidewater; Alex’s manager.', status: 'confirmed', imp: 0.7, seen: 6, said: 'You said it', from: 'Monday check-in', surface: 'Core', when: '14 Oct' },
    { id: 'p3', r: 'people', type: 'Person', label: 'Elena Rivera', content: 'Alex’s mother, in San Antonio; visiting for the holidays.', status: 'confirmed', imp: 0.75, seen: 5, said: 'You said it', from: 'Budget for the move', surface: 'Core', when: '30 Jun' },
    { id: 'p4', r: 'people', type: 'Person', label: 'Jonas Berg', content: 'Former design director and mentor; thinks the portfolio is ready.', status: 'confirmed', imp: 0.55, seen: 2, said: 'You said it', from: 'Freelance or stay?', surface: 'Logos', when: '3 Oct' },
    // preferences
    { id: 'f1', r: 'prefs', type: 'Preference', label: 'Works best in the morning', content: 'Deep work before noon; meetings after.', status: 'confirmed', imp: 0.7, warn: true, seen: 6, said: 'You said it', from: 'Monday check-in', surface: 'Core', when: '18 Mar' },
    { id: 'f2', r: 'prefs', type: 'Preference', label: 'Best work late at night lately', content: 'The last three sprints happened after 10 pm.', status: 'proposed', imp: 0.5, recent: true, warn: true, seen: 1, said: 'You said it', from: 'Late-night sprint', surface: 'Logos', when: '19 Oct' },
    { id: 'f3', r: 'prefs', type: 'Preference', label: 'No meetings before 11', content: 'Keeps mornings free for focused work.', status: 'confirmed', imp: 0.55, seen: 3, said: 'You said it', from: 'Monday check-in', surface: 'Core', when: '18 Mar' },
    { id: 'f4', r: 'prefs', type: 'Preference', label: 'Short, direct answers', content: 'Replies without preamble; bullet points for plans.', status: 'confirmed', imp: 0.7, seen: 7, said: 'You said it', from: 'Weekly review', surface: 'Core', when: '1 Sep' },
    { id: 'f6', r: 'prefs', type: 'Preference', label: 'A shared studio desk in Lisbon', content: 'Wants a desk among other people, not a home office.', status: 'proposed', imp: 0.5, recent: true, seen: 1, said: 'You said it', from: 'Monday check-in', surface: 'Core', when: '21 Oct' },
    { id: 'f5', r: 'prefs', type: 'Preference', label: 'Vegetarian', content: 'Plans meals around it, travelling or not.', status: 'confirmed', imp: 0.4, faded: true, seen: 2, said: 'You said it', from: 'Lisbon or Berlin?', surface: 'Logos', when: 'Jan' },
    // recent
    { id: 'r1', r: 'recent', type: 'Event', label: 'Visa appointment, 4 Nov', content: 'At the Portuguese consulate in Houston, 9:30.', status: 'confirmed', imp: 0.7, recent: true, seen: 1, said: 'You said it', from: 'Budget for the move', surface: 'Core', when: '21 Oct' },
    { id: 'r2', r: 'recent', type: 'Experience', label: '16 km felt easy', content: 'Longest run so far, at a comfortable pace.', status: 'confirmed', imp: 0.45, recent: true, seen: 1, said: 'You said it', from: 'Half marathon plan', surface: 'Logos', when: '20 Oct' },
    { id: 'r3', r: 'recent', type: 'Place', label: 'Alfama flat', content: 'Lease signed; keys on 5 January.', status: 'confirmed', imp: 0.6, seen: 2, said: 'You said it', from: 'Lisbon or Berlin?', surface: 'Logos', when: '12 Oct' },
    { id: 'r4', r: 'recent', type: 'Event', label: 'Team offsite in Porto', content: 'Tidewater’s September offsite; met the Lisbon team.', status: 'confirmed', imp: 0.35, faded: true, seen: 1, said: 'You said it', from: 'Offsite recap', surface: 'Logos', when: '10 Sep' },
    // questions
    { id: 'q1', r: 'questions', type: 'Question', label: 'Go freelance next year?', content: 'Weighing it against stability; Jonas thinks the portfolio is ready.', status: 'confirmed', imp: 0.75, seen: 3, said: 'You asked it', from: 'Freelance or stay?', surface: 'Logos', when: '3 Oct' },
    { id: 'q2', r: 'questions', type: 'Uncertainty', label: 'Will the move delay v2?', content: 'Depends on how much of phase two can be done remotely.', status: 'confirmed', imp: 0.6, recent: true, seen: 2, said: 'You said it', from: 'Onboarding v2 scope', surface: 'Logos', when: '20 Oct' },
    { id: 'q3', r: 'questions', type: 'Question', label: 'Keep training through the move?', content: 'How to protect four runs a week during packing and travel.', status: 'confirmed', imp: 0.5, seen: 1, said: 'You asked it', from: 'Half marathon plan', surface: 'Logos', when: '16 Oct' },
  ],
  // relationships, in the store's own vocabulary (KNOWN_RELATIONSHIPS); `say` is how the page reads them
  edges: [
    ['g4', 'g3', 'superseded_by', 'became'],
    ['f1', 'f2', 'contradicts', 'possible contradiction', 'proposed'],
    ['i6', 'f6', 'superseded_by', 'may have become', 'proposed'],
    ['f3', 'f1', 'supports', 'supports'],
    ['g2', 'g3', 'motivated_by', 'motivated by'],
    ['w2', 'w1', 'belongs_to', 'part of'],
    ['w3', 'w2', 'part_of', 'part of'],
    ['w4', 'w3', 'evidence_for', 'evidence for'],
    ['w3', 'g3', 'constrained_by', 'constrained by'],
    ['w3', 'i1', 'motivated_by', 'motivated by'],
    ['l1', 'l2', 'learned_from', 'learned from'],
    ['l1', 'w2', 'used_by', 'used in'],
    ['p2', 'w2', 'works_on', 'works on'],
    ['p1', 'g3', 'associated_with', 'moving too'],
    ['q1', 'p4', 'associated_with', 'raised by'],
    ['q1', 'i4', 'constrained_by', 'constrained by'],
    ['q1', 'g5', 'depends_on', 'depends on'],
    ['q1', 'w6', 'associated_with', 'about'],
    ['q2', 'g3', 'depends_on', 'depends on'],
    ['q2', 'w3', 'depends_on', 'about'],
    ['q3', 'g1', 'depends_on', 'about'],
    ['q3', 'g3', 'depends_on', 'depends on'],
    ['r1', 'g3', 'part_of', 'part of'],
    ['r3', 'g3', 'part_of', 'part of'],
    ['r2', 'g1', 'evidence_for', 'evidence for'],
    ['l4', 'g1', 'supports', 'supports'],
    ['l3', 'g2', 'part_of', 'part of'],
    ['w5', 'i1', 'motivated_by', 'motivated by'],
    ['w5', 'w7', 'associated_with', 'about'],
    ['i3', 'p3', 'associated_with', 'about'],
    ['r4', 'w1', 'associated_with', 'with'],
    ['i2', 'w5', 'supports', 'how it was decided'],
    ['f2', 'w2', 'associated_with', 'during'],
  ],
};
