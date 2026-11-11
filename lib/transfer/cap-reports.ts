// lib/transfer/cap-reports.ts — CAP STUDENTS' OWN STORIES OF GETTING INTO UT AUSTIN.
//
// Public Reddit posts (r/UTAdmissions, r/UTAustinAdmissions2, r/UTAustin) in
// which a CAP student — or a parent or friend — says how the move to UT Austin
// went, gathered for the transfer page's third data set. Stories, not
// statistics: nobody verified them, the people who post are not a fair sample,
// and several give few details. Each says how much it can be leaned on
// (`confidence`) and links to where it was said.
//
// Left out: posts with no outcome yet, advice from people who did not say they
// were admitted, and reports of CAP students "denied" — completing CAP
// guarantees the College of Liberal Arts, so a CAP denial is a major that was
// not given, not UT (the same rule the Fall 2026 forum data follows).

export type Confidence = 'detailed' | 'sparse' | 'secondhand' | 'likely';

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  detailed: 'First-person, detailed',
  sparse: 'First-person, few details',
  secondhand: 'Secondhand',
  likely: 'Likely, not confirmed',
};

export type Destination = 'McCombs' | 'Moody' | 'Liberal Arts' | 'Engineering';

export interface CapReport {
  id: string;
  /** the CAP campus, when they said */
  school: string | null;
  destination: Destination;
  /** what they were admitted to, in words */
  outcome: string;
  gpa: number | null;
  hours: number | null;
  /** the year they moved, when they said */
  cycle: string | null;
  confidence: Confidence;
  /** what they reported doing, in short */
  did: string[];
  /** what the story suggests, and what it does not */
  takeaway: string;
  url: string;
}

export const CAP_REPORTS: readonly CapReport[] = [
  {
    id: 'MC-01',
    school: 'UTSA',
    destination: 'McCombs',
    outcome: 'Admitted to McCombs',
    gpa: 4.0,
    hours: null,
    cycle: '2026',
    confidence: 'detailed',
    did: [
      'Résumé focused on business and their intended specialisation',
      'Heavily involved at UTSA, and built real friendships there',
      'An internship through a friend’s uncle',
      'UTSA alumni events, where they met recruiters',
    ],
    takeaway: 'Turned campus involvement into actual opportunities: the internship and recruiter contact are more concrete than club membership alone.',
    url: 'https://www.reddit.com/r/UTAdmissions/comments/1ukyu36/mccombs_acceptance_as_utsa_cap_student_tips_and/',
  },
  {
    id: 'MC-02',
    school: 'UTSA',
    destination: 'McCombs',
    outcome: 'Admitted to McCombs (second choice was Government)',
    gpa: 3.9,
    hours: null,
    cycle: null,
    confidence: 'detailed',
    did: [
      'A+ in Calculus I and II, Statistics, Microeconomics and Macroeconomics',
      'No recommendation letters and no clubs at UTSA',
      'Worked extensively in a family business, and wrote the essay about it',
    ],
    takeaway: 'A business-club résumé is not the only route: substantial real work, told well, can carry an application. One story, not proof that letters or activities do not matter.',
    url: 'https://www.reddit.com/r/UTAdmissions/comments/1up8vhy/got_into_mccombs_with_okay_stats_as_cap/',
  },
  {
    id: 'MC-03',
    school: null,
    destination: 'McCombs',
    outcome: 'Admitted to McCombs, transferred Fall 2025',
    gpa: 4.0,
    hours: null,
    cycle: '2025',
    confidence: 'detailed',
    did: [
      'Two letters: someone they worked for, and their Calculus I instructor',
      'More than eight Calculus practice exams',
      'Worked on the essay about 30 minutes a week, and had others read it',
    ],
    takeaway: 'Letters add most from people who saw the work first-hand. They also warned that a 4.0 was not enough for everyone the following year.',
    url: 'https://www.reddit.com/r/UTAdmissions/comments/1vzdulg/can_anyone_dm_me_tips_or_guides_on_how_to_land/',
  },
  {
    id: 'MC-04',
    school: 'UTA',
    destination: 'McCombs',
    outcome: 'Completed CAP at UTA, later graduated from McCombs',
    gpa: null,
    hours: null,
    cycle: null,
    confidence: 'sparse',
    did: ['Called CAP worthwhile for them, but a risky path'],
    takeaway: 'UTA to McCombs has been done, but this post gives no GPA or activities to learn from.',
    url: 'https://www.reddit.com/r/UTAdmissions/comments/1ikc0u3/anyone-with-experience-with-the-cap-program-that/',
  },
  {
    id: 'MC-05',
    school: null,
    destination: 'McCombs',
    outcome: 'Admitted to McCombs',
    gpa: null,
    hours: null,
    cycle: null,
    confidence: 'sparse',
    did: ['Posted that their status updated for McCombs, as a CAP student'],
    takeaway: 'Another direct CAP-to-McCombs admission, with nothing to say about GPA or résumé.',
    url: 'https://www.reddit.com/r/UTAdmissions/comments/1lg9e0m/accepted_into_business/',
  },
  {
    id: 'MC-06',
    school: 'UTSA',
    destination: 'McCombs',
    outcome: 'Probably admitted to McCombs (read from a portal signal)',
    gpa: 4.0,
    hours: null,
    cycle: null,
    confidence: 'likely',
    did: [
      'Business Student Council ambassador',
      'Co-founded a business buying and selling collectibles',
      'About 1.5 years at Bill Miller BBQ and two years at H-E-B',
      'Called the essay decent rather than exceptional',
    ],
    takeaway: 'A strong profile, but the post read a portal status that others said was not definitive.',
    url: 'https://www.reddit.com/r/UTAdmissions/comments/1leh96m/cap_student_into_mccombs/',
  },
  {
    id: 'MC-07',
    school: null,
    destination: 'Liberal Arts',
    outcome: 'Admitted to Economics, then moved to McCombs from inside UT',
    gpa: null,
    hours: null,
    cycle: null,
    confidence: 'detailed',
    did: [
      'Finished high school with a 2.8 GPA and a 1060 SAT',
      'Completed CAP, entered UT in Economics',
      'Took the McCombs prerequisites at UT, held executive roles in organisations',
    ],
    takeaway: 'A weak high-school record did not rule out business later. Not a direct CAP-to-McCombs move, and their college GPA was not given.',
    url: 'https://www.reddit.com/r/UTAdmissions/comments/1ua2jmz/graduated_hs_with_28_gpa_mccombs/',
  },
  {
    id: 'MC-08',
    school: 'UT Tyler',
    destination: 'McCombs',
    outcome: 'Admitted to McCombs in 2022, as told by someone who knew them',
    gpa: null,
    hours: null,
    cycle: '2022',
    confidence: 'secondhand',
    did: ['No GPA or activities given'],
    takeaway: 'UT Tyler CAP students have reached McCombs; nothing here to learn a profile from.',
    url: 'https://www.reddit.com/r/UTAdmissions/comments/1ds2h9t/mccombs_cap/',
  },
  {
    id: 'O-01',
    school: 'UTA',
    destination: 'Moody',
    outcome: 'Admitted to Public Relations',
    gpa: 4.0,
    hours: null,
    cycle: null,
    confidence: 'detailed',
    did: ['No campus organisations; outside class, they worked jobs'],
    takeaway: 'A strong GPA and real work can be enough without campus clubs.',
    url: 'https://www.reddit.com/r/UTAustinAdmissions2/comments/1aq6zcr/cap_external_transfer/',
  },
  {
    id: 'O-02',
    school: 'UTA',
    destination: 'Moody',
    outcome: 'Admitted to Advertising',
    gpa: 3.969,
    hours: null,
    cycle: null,
    confidence: 'detailed',
    did: [
      'American Advertising Federation (AAF) and American Institute of Graphic Arts (AIGA)',
      'Essays tailored to why this school and this programme',
    ],
    takeaway: 'Organisations in the field, and an essay specific about why the major.',
    url: 'https://www.reddit.com/r/UTAustinAdmissions2/comments/1aq6zcr/cap_external_transfer/',
  },
  {
    id: 'O-03',
    school: 'UTSA',
    destination: 'Moody',
    outcome: 'Admitted to Speech, Language & Hearing Sciences',
    gpa: 3.88,
    hours: null,
    cycle: null,
    confidence: 'secondhand',
    did: ['Their parent credited the essay and the résumé'],
    takeaway: 'CAP students reach Moody majors beyond Advertising and Public Relations.',
    url: 'https://www.reddit.com/r/UTAustinAdmissions2/comments/rtotx2/what_are_my_chances/',
  },
  {
    id: 'O-04',
    school: null,
    destination: 'Moody',
    outcome: 'Admitted to Advertising',
    gpa: 3.8,
    hours: null,
    cycle: null,
    confidence: 'secondhand',
    did: ['Their parent said they had few extracurriculars'],
    takeaway: 'GPA and how many activities you have do not explain every decision. Secondhand, so not proof that a 3.8 beats a 4.0.',
    url: 'https://www.reddit.com/r/UTAustin/comments/1ai39w1/what_is_yalls_opinion_on_the_cap_program/',
  },
  {
    id: 'O-05',
    school: 'UTSA',
    destination: 'Moody',
    outcome: 'Admitted to Moody (major not said)',
    gpa: 4.0,
    hours: 30,
    cycle: null,
    confidence: 'sparse',
    did: ['A year at UTSA: 30 hours, 4.0'],
    takeaway: 'A clean record and the hours, with little else said.',
    url: 'https://www.reddit.com/r/UTAdmissions/comments/1saqqz4/can_anyone_share_their_ut_cap_experiences/',
  },
  {
    id: 'O-06',
    school: 'UTRGV',
    destination: 'Liberal Arts',
    outcome: 'Admitted to Human Dimensions of Organizations (first choice was Speech, Language & Hearing Sciences)',
    gpa: 3.3,
    hours: 30,
    cycle: null,
    confidence: 'detailed',
    did: [
      'Failed Biology in the fall; GPA fell to 2.8',
      'Replaced it with Psychology after checking with advisors, with As in the spring',
      'Watched their institutional GPA and the 30-hour requirement closely',
    ],
    takeaway: 'The CAP guarantee held after a hard semester, but not for their first-choice major.',
    url: 'https://www.reddit.com/r/UTAdmissions/comments/1leoq2x/got-into-ut-austin-through-cap-even-after-failing/',
  },
  {
    id: 'D-03',
    school: 'UT Tyler',
    destination: 'Engineering',
    outcome: 'Admitted to Aerospace Engineering, as told by another CAP student',
    gpa: 4.0,
    hours: null,
    cycle: null,
    confidence: 'secondhand',
    did: ['Calculus III, Physics for Scientists and Engineers I and II, General Chemistry I and II with labs', 'No college extracurriculars'],
    takeaway: 'For engineering, the courses taken may matter a great deal. Secondhand, not a verified profile.',
    url: 'https://www.reddit.com/r/UTAdmissions/comments/1ks8e3s/chance_me_real_quick/',
  },
];

export const DESTINATIONS: readonly Destination[] = ['McCombs', 'Moody', 'Liberal Arts', 'Engineering'];

/** What UT and UTA themselves say, for the stories' context. Check the pages: rules and dates change. */
export const CAP_RULES = {
  guarantee:
    'Completing CAP guarantees admission to the College of Liberal Arts — not McCombs, and not every Liberal Arts major. Economics, for one, is not a sure fallback.',
  requirements: 'At UTA: 30 approved hours taken there during the CAP year, at least a 3.2 GPA, at least one approved maths course, and summer enrolment.',
  mccombs:
    'McCombs takes transfers for fall only, as Unspecified Business, and looks for five courses: Calculus I, Calculus II, Microeconomics, Macroeconomics and Rhetoric & Writing.',
  dates: 'Major selection opens in January or February and closes by 1 March; supplements by 10 March; final transcript by 1 June; decisions by 30 June.',
  sources: [
    { label: 'UTA — UT CAP', url: 'https://www.uta.edu/student-success/advising/ut-cap' },
    { label: 'UT Austin — Transitioning through CAP', url: 'https://admissions.utexas.edu/apply/alternative-pathways-to-enrollment/cap/transitioning-to-ut-austin/' },
    { label: 'UT Austin — Transfer admission', url: 'https://admissions.utexas.edu/apply/transfer-students/' },
    { label: 'UT Austin — Colleges and degrees', url: 'https://admissions.utexas.edu/explore/colleges-degrees/' },
  ],
} as const;
