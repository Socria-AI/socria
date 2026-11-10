// lib/ux/templates.ts — where a project starts.
//
// Blank frames for the two common sizes, two starter screens, and one worked
// example. The starter screens are ordinary first drafts with ordinary first-
// draft problems in them — a placeholder used as a label, a second primary
// button, grey helper text — because a designer learns more from critiquing a
// believable draft than a perfect one.

import {
  makeArtboard,
  makeElement,
  makeNode,
  makeProject,
  uid,
  type Artboard,
  type ResearchNote,
  type UXElement,
  type UXProject,
} from './model';

export type TemplateId = 'blank-mobile' | 'blank-desktop' | 'signup' | 'dashboard';

export const TEMPLATES: { id: TemplateId; name: string; size: string; note: string }[] = [
  { id: 'blank-mobile', name: 'Blank mobile', size: '390 × 844', note: 'An empty phone screen.' },
  { id: 'blank-desktop', name: 'Blank desktop', size: '1280 × 800', note: 'An empty desktop screen.' },
  { id: 'signup', name: 'Sign-up form', size: '390 × 844', note: 'A first-draft mobile sign-up, ready to critique.' },
  { id: 'dashboard', name: 'Dashboard', size: '1280 × 800', note: 'A first-draft analytics overview.' },
];

const el = (kind: UXElement['kind'], at: Partial<UXElement>) => makeElement(kind, at);

function signup(at: Partial<Artboard> = {}): Artboard {
  return makeArtboard({
    name: 'Sign up',
    w: 390,
    h: 844,
    ...at,
    elements: [
      el('image', { x: 24, y: 72, w: 48, h: 48, text: 'Logo', radius: 12, fill: '#e4eada', name: 'Logo' }),
      el('heading', { x: 24, y: 148, w: 342, h: 40, text: 'Create your account', fontSize: 28, name: 'Title' }),
      el('text', { x: 24, y: 196, w: 342, h: 44, text: 'Book appointments, see results and message your clinic in one place.', fontSize: 14, color: '#9a988f', name: 'Intro' }),
      el('input', { x: 24, y: 268, w: 342, h: 48, text: 'Full name', label: '', name: 'Name field' }),
      el('input', { x: 24, y: 328, w: 342, h: 48, text: 'Email', label: '', name: 'Email field' }),
      el('input', { x: 24, y: 388, w: 342, h: 48, text: 'Password', label: '', name: 'Password field' }),
      el('text', { x: 24, y: 444, w: 342, h: 32, text: 'Min. 8 characters, one number, one symbol, no spaces', fontSize: 11, color: '#b3b1a8', name: 'Password rules' }),
      el('checkbox', { x: 24, y: 492, w: 20, h: 20, label: 'I agree to the Terms and Privacy Policy', name: 'Consent' }),
      el('button', { x: 24, y: 548, w: 342, h: 52, text: 'Create account', name: 'Create account' }),
      el('button', { x: 24, y: 612, w: 342, h: 52, text: 'Continue with Google', variant: 'primary', fill: '#26485a', name: 'Google' }),
      el('link', { x: 118, y: 690, w: 154, h: 20, text: 'Already a member? Log in', fontSize: 13, name: 'Log in' }),
    ],
  });
}

function dashboard(at: Partial<Artboard> = {}): Artboard {
  const cards: UXElement[] = [];
  const labels = ['Active users', 'Revenue', 'Churn', 'Sessions'];
  labels.forEach((l, i) => {
    const x = 32 + i * 304;
    cards.push(el('rect', { x, y: 168, w: 288, h: 132, fill: '#f4f1e8', radius: 14, name: `${l} card` }));
    cards.push(el('text', { x: x + 20, y: 188, w: 200, h: 20, text: l, fontSize: 13, color: '#8f8d84', name: `${l} label` }));
    cards.push(el('heading', { x: x + 20, y: 216, w: 200, h: 40, text: ['12,480', '$84.2k', '3.1%', '41,902'][i], fontSize: 32, name: `${l} value` }));
    cards.push(el('text', { x: x + 20, y: 262, w: 200, h: 20, text: ['+4.2% vs last week', '+1.8% vs last week', '−0.3 pts', '+9.6% vs last week'][i], fontSize: 12, color: '#7aa05a', name: `${l} delta` }));
  });
  return makeArtboard({
    name: 'Overview',
    w: 1280,
    h: 800,
    background: '#ffffff',
    ...at,
    elements: [
      el('nav', { x: 0, y: 0, w: 1280, h: 64, text: 'Overview · Customers · Revenue · Reports · Settings', name: 'Top navigation' }),
      el('heading', { x: 32, y: 96, w: 400, h: 40, text: 'Overview', fontSize: 30, name: 'Title' }),
      el('button', { x: 952, y: 96, w: 140, h: 40, text: 'Export', name: 'Export' }),
      el('button', { x: 1104, y: 96, w: 144, h: 40, text: 'New report', name: 'New report' }),
      ...cards,
      el('rect', { x: 32, y: 324, w: 800, h: 420, fill: '#f4f1e8', radius: 14, name: 'Chart panel' }),
      el('heading', { x: 56, y: 348, w: 400, h: 28, text: 'Active users, last 30 days', fontSize: 18, name: 'Chart title' }),
      el('image', { x: 56, y: 392, w: 752, h: 328, text: 'Line chart of daily active users', fill: '#e9e5d9', radius: 8, name: 'Chart' }),
      el('rect', { x: 856, y: 324, w: 392, h: 420, fill: '#f4f1e8', radius: 14, name: 'Activity panel' }),
      el('heading', { x: 880, y: 348, w: 300, h: 28, text: 'Recent activity', fontSize: 18, name: 'Activity title' }),
      el('text', { x: 880, y: 392, w: 344, h: 300, text: 'Acme Co upgraded to Pro · 2m ago. Jordan invited 3 teammates · 14m ago. Invoice #4021 failed · 1h ago. Northwind exported a report · 3h ago.', fontSize: 14, color: '#4a4a43', name: 'Activity list' }),
      el('link', { x: 880, y: 708, w: 120, h: 20, text: 'View all', fontSize: 13, name: 'View all' }),
    ],
  });
}

export function artboardFromTemplate(id: TemplateId, at: Partial<Artboard> = {}): Artboard {
  switch (id) {
    case 'blank-mobile':
      return makeArtboard({ name: 'Screen', w: 390, h: 844, ...at });
    case 'blank-desktop':
      return makeArtboard({ name: 'Screen', w: 1280, h: 800, ...at });
    case 'signup':
      return signup(at);
    case 'dashboard':
      return dashboard(at);
  }
}

/** A worked example with every part of the workspace in use. */
export function exampleProject(now = Date.now()): UXProject {
  const ab = signup({ x: 0, y: 0 });
  const find = (name: string) => ab.elements.find((e) => e.name === name)!.id;
  const r = (text: string, source: string, kind: ResearchNote['kind'], tags: string[], isEvidence = true): ResearchNote => ({
    id: uid('r'),
    kind,
    source,
    text,
    tags,
    isEvidence,
    createdAt: now,
  });
  const research = [
    r('“I just want to book the appointment. Why do I need an account to do that?”', 'P2, interview, 64, retired', 'interview', ['account', 'friction']),
    r('Three of five participants hesitated at the password field and scrolled up to re-read the rules.', 'Usability test, round 1', 'usability-test', ['password', 'errors']),
    r('“My daughter usually does this kind of thing for me on her phone.”', 'P4, interview, 71', 'interview', ['proxy', 'caregiver']),
    r('62% of new sign-ups come from a link in the appointment reminder SMS.', 'Analytics, last 90 days', 'analytics', ['entry', 'mobile']),
    r('Most patients would rather use Google than create a password.', 'Product meeting', 'other', ['social-login'], false),
  ];
  const need = makeNode('need', 'Book an appointment without friction', { x: 40, y: 40, detail: 'The account is a means; the appointment is the goal.' });
  const ev1 = makeNode('evidence', 'Patients question why an account is needed', { x: 40, y: 220, source: 'research', researchId: research[0].id });
  const asm = makeNode('assumption', 'Patients prefer Google sign-in over a password', { x: 380, y: 40, elementId: find('Google'), artboardId: ab.id, detail: 'Raised in a product meeting; not observed.' });
  const dec = makeNode('decision', 'Require an account before booking', { x: 380, y: 220, artboardId: ab.id, detail: 'Accounts let the clinic send results securely.', tradeoffs: 'Adds a step before the thing people came for.' });
  const qn = makeNode('question', 'Who completes this form — the patient or a family member?', { x: 720, y: 130, source: 'research', researchId: research[2].id });
  return makeProject('Clinic sign-up', {
    createdAt: now,
    updatedAt: now,
    stage: 'explore',
    brief: {
      problem: 'New patients arriving from an appointment reminder abandon sign-up before booking. Completion from the SMS link is 38%.',
      users: 'Patients of a community clinic, many over 60, often on a phone, sometimes helped by a family member.',
      goals: 'More patients reach a booked appointment from the reminder link.',
      constraints: 'Results must be delivered securely, so some form of identity is required eventually.',
      success: 'Completion from the SMS link above 60% without more support calls.',
    },
    artboards: [ab],
    research,
    nodes: [need, ev1, asm, dec, qn],
    edges: [
      { id: uid('e'), from: ev1.id, to: dec.id, kind: 'contradicts' },
      { id: uid('e'), from: dec.id, to: need.id, kind: 'depends' },
      { id: uid('e'), from: asm.id, to: dec.id, kind: 'informs' },
    ],
  });
}
