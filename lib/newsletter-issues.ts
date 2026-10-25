// lib/newsletter-issues.ts
//
// Every issue of the Socria newsletter, oldest first.
//
// An issue is written here, reviewed like any other change, and deployed
// before it can be sent: the senders (the daily schedule, app/api/cron/
// newsletter, and the hand-send route, app/api/email/newsletter) send only an
// issue they find in this list, by id. Nothing posted to either can put words
// in front of subscribers that were not committed here first.
//
// THE SCHEDULE. Every issue without `draft` is approved, and approved issues
// go out one every other day (NEWSLETTER_EVERY_DAYS), in the order they are
// listed here. Approving an issue is taking its `draft` off and deploying;
// holding one back is putting `draft: true` back. With no approved issue
// waiting, nothing goes — the schedule never writes one.
//
// Before approving, rehearse: the hand-send route's dry run renders the issue
// and counts who would get it, and sends nothing. The commands are in
// docs/DEPLOYMENT.md under "Newsletter".
//
// Each draft below says what must be true on production before it is
// approved: an issue only ever describes what subscribers can use today.
// A time-sensitive draft sits near the top, so it goes at the next turn once
// it is approved rather than after everything already waiting.
//
// Links to Logos use /chat?model=logos-3 — that is Logos 3.5. The older
// ?model=logos opens Logos 2.
//
// An id is permanent once an issue has gone out to anyone — it is the key
// that makes the issue once-ever per person, so a changed id is a new issue
// and would go to everyone again. The suite checks every entry here with
// issueProblems (lib/newsletter.ts), so a malformed issue fails the build
// rather than the send.

import type { NewsletterIssue } from './newsletter';

export const NEWSLETTER_ISSUES: readonly NewsletterIssue[] = [
  {
    // APPROVE ONLY ONCE the events pages are live on production (they are on
    // dev only). Says no date on purpose: the date is not confirmed. Do not add
    // food, prizes or anything else until it is confirmed. Near the top so it
    // goes at the next turn once approved.
    id: '2026-11-in-public-002',
    draft: true,
    subject: 'Socria: In Public 002, at UT Arlington',
    preheader: 'An open conversation about building Socria in public. Free to attend.',
    paragraphs: [
      'We are holding the second In Public: an open conversation about how Socria is being built, what is working, what is not and the decisions behind it, and about starting something, building a product people use, and working with AI without handing it your thinking.',
      'It is in Maverick Hall, Room 1309, at the University of Texas at Arlington, and admission is free. The date and time will be on the event page as soon as they are set.',
      'If you are nearby, RSVP so we know you are coming.',
    ],
    link: { label: 'See the event and RSVP', path: '/events/in-public-002' },
  },
  {
    // LIVE ON PRODUCTION (Logos 3.5).
    id: '2026-10-meet-logos',
    subject: 'Logos 3.5: watch your thinking take shape',
    preheader: 'Say what you are working through. A map of your reasoning builds beside the conversation.',
    paragraphs: [
      'Logos is the part of Socria made for thinking something through rather than getting a quick answer. You talk it through in the conversation, and beside it a map of your reasoning builds as you go: your claims, assumptions, tensions and evidence, labelled in your own words.',
      'Ask for what would help and it is made beside the map: a chart of your numbers, a timeline, a checklist, a comparison, a decision laid out, or a model of a system you can change with sliders.',
      'It works best on something real you are stuck on. Start with one sentence about it.',
    ],
    link: { label: 'Open Logos 3.5', path: '/chat?model=logos-3' },
  },
  {
    // LIVE ON PRODUCTION (Crossroads, Logos 3.5).
    id: '2026-10-crossroads',
    subject: 'Stuck between two choices? Lay it out.',
    preheader: 'Crossroads puts your options, what matters to you and the open questions side by side.',
    paragraphs: [
      'Tell Logos about a decision, such as "Should I take the job in Austin or stay in Dallas?", and it opens a Crossroads beside your map: your options, what matters to you, the pros and cons, the assumptions underneath them, a few scenarios, and the questions still open.',
      'The ratings are yours to give and the decision stays yours. If you weight what matters, the score says plainly that it is not a verdict, only a way to see your own priorities side by side.',
    ],
    link: { label: 'Try it in Logos', path: '/chat?model=logos-3' },
  },
  {
    // LIVE ON PRODUCTION (Logos 3.5 documents).
    id: '2026-10-documents',
    subject: 'Logos now reads what you attach',
    preheader: 'A PDF, a Word file, slides or a spreadsheet, and every reply shows where it came from.',
    paragraphs: [
      'Logos 3.5 now reads the documents you give it: a PDF, a Word file, slides or a spreadsheet, scanned pages included.',
      'Ask about one and the reply cites the passage it rests on. Each citation is checked against the document itself and marked when it is a reading of the passage rather than its words, so you can see what is quoted, what is inferred, and what the document does not say.',
      'Open the document beside your map to read it page by page, correct a passage that was read wrongly, or turn one of its tables into a chart.',
    ],
    link: { label: 'Open Logos', path: '/chat?model=logos-3' },
  },
  {
    // LIVE ON PRODUCTION (Untangle, Logos 3.5).
    id: '2026-10-untangle',
    subject: 'Too much in your head? Untangle it.',
    preheader: 'Put it all in one message. Logos separates it and sorts it, in your own words.',
    paragraphs: [
      'Write everything on your mind in one go, such as "Untangle this: I need to finish the essay, my car is making a noise, mom’s birthday is Friday, not sure if I should drop chem, rent is due."',
      'Logos splits it into separate thoughts, keeps your wording, and sorts them into tasks, ideas, problems, questions, goals and uncertainties. Any connection it suggests between them is marked as a suggestion, so you decide what actually relates to what.',
    ],
    link: { label: 'Try it in Logos', path: '/chat?model=logos-3' },
  },
  {
    // LIVE ON PRODUCTION (charts from the person's own words, Logos 3.5).
    id: '2026-10-charts-from-words',
    subject: 'Type your numbers. Get the chart.',
    preheader: 'Every number exactly as you wrote it. No model retypes them.',
    paragraphs: [
      'In Logos, write your numbers the way you would say them, such as "Chart my spending: rent 1200, food 400, transport 150", and the chart is drawn straight from your words. No model copies the numbers across, so none can be dropped, rounded or relabelled on the way.',
      'Ask for the form you want, such as a pie, bars or a line over time, or switch it afterwards. Edit any cell by hand, or say "set food to 450". The chart says where its numbers came from, and it never makes up numbers you did not give.',
    ],
    link: { label: 'Try it in Logos', path: '/chat?model=logos-3' },
  },
  {
    // LIVE ON PRODUCTION (the UTA student month, lib/socria-edu.ts). Time
    // sensitive: a month can begin until the end of 9 December 2026. Pull it
    // if it has not gone out by early December.
    id: '2026-11-students',
    subject: 'UTA students: your first month of Socria One is free',
    preheader: 'Add your @mavs.uta.edu address before December 9 and a free month starts. No card needed.',
    paragraphs: [
      'If you are a student at UT Arlington, your first month of Socria One is free. Sign in, add your @mavs.uta.edu address under Account, and enter the code sent to it. Thirty days start then.',
      'Socria One has no daily message limit, remembers 160 things about how you reason instead of 12, and reads documents up to 30 MB. No card is asked for and nothing renews. A free month can begin until the end of December 9, 2026, Central time.',
    ],
    link: { label: 'See the student offer', path: '/students' },
  },
  {
    // LIVE ON PRODUCTION (the moves on a map card). Says nothing about web
    // sources: Explore and Research search the web only where a search
    // provider is configured, and that is not confirmed for production.
    id: '2026-10-challenge-and-trace',
    subject: 'Ask Logos to push back on your idea',
    preheader: 'Click any card on your map and choose Challenge, or Trace it back to where it came from.',
    paragraphs: [
      'Every card on your Thinking Map has moves of its own. Click one and choose Challenge, and Logos gives you up to four pressure points on it: the places it could be pressed hardest.',
      'Choose Trace to see where the idea came from, quoted word for word from what you said. Explore gives you the wider context of an idea, and Add context attaches your own material to the card. Trace is free on every plan.',
    ],
    link: { label: 'Try it in Logos', path: '/chat?model=logos-3' },
  },
  {
    // LIVE ON PRODUCTION (computed mathematics and pushback, Core 4 and Logos 3.5).
    // No error rates are claimed: none were measured against the live model.
    id: '2026-10-checked-maths',
    subject: 'Socria now checks its maths, and holds its ground',
    preheader: 'Derivatives, integrals and limits are worked out, not recalled. Push back and it re-derives.',
    paragraphs: [
      'When a reply does calculus, algebra or arithmetic, Socria now works it out rather than recalling it: derivatives, integrals, limits, the solutions of an equation, unit conversions. If a step does not match what was computed, the reply is corrected, and says so.',
      'It also holds its ground. Ask "isn’t that positive?" or "my textbook says otherwise" and it re-derives the step instead of agreeing with whoever spoke last. If you caught a real mistake, it says so plainly. If you did not, it shows you where the step goes.',
    ],
    link: { label: 'Try it in Socria', path: '/chat' },
  },
  {
    // APPROVE ONLY ONCE Sharing works on production (supabase/think-together.sql
    // has been run there; docs/SHARING.md). The button is "Share".
    id: '2026-11-think-together',
    draft: true,
    subject: 'Think it through together',
    preheader: 'Share a line of thinking. Everyone can write in it, and Socria answers when asked.',
    paragraphs: [
      'Press Share in a line of thinking to bring in the people you are working it out with: by email, by link, or with an invite code. Each person can read it, comment on it, or think in it with you, and everyone sees the same conversation and the same map.',
      'Socria is in the conversation too, and answers when someone asks it: type @socria, or reply to one of its messages. The rest of the time it stays out of the way, and nothing anyone writes, Socria included, disappears.',
    ],
    link: { label: 'Open Logos', path: '/chat?model=logos-3' },
  },
  {
    // LIVE ON PRODUCTION (everyday displays, Logos 3.5). The examples are the
    // user docs' own (app/docs/content/logos-3-5.tsx).
    id: '2026-11-everyday-displays',
    subject: 'Timelines, flowcharts and comparisons, from one sentence',
    preheader: 'Ask in plain words and it opens beside your map, ready to edit.',
    paragraphs: [
      'Logos makes the everyday displays you would otherwise build by hand. "Create a timeline: kickoff Jan 5, design Feb 1 – Feb 10, launch Mar 15." "Make a flowchart: wake up -> shower -> breakfast -> leave." "Compare iPhone and Pixel on price, camera and battery." Checklists, kanban boards, mind maps, decision trees and Venn diagrams work the same way.',
      'Each one says what it was made from, whether your words, your map or a draft of Socria’s, and you can change it by hand or by saying so, such as "show it as a calendar". Undo and redo are always there, and Socria never overwrites what you wrote.',
    ],
    link: { label: 'Try it in Logos', path: '/chat?model=logos-3' },
  },
  {
    // LIVE ON PRODUCTION (Synthesize).
    id: '2026-11-synthesize',
    subject: 'See where your thinking stands',
    preheader: 'Synthesize reads your map and shows what is settled, what is open and what is in tension.',
    paragraphs: [
      'Once your map has a few things on it, press Synthesize beside the message box. Logos reads the map you built and shows you what your thinking has become: what is established, what is taking shape, where it is in tension, and what is still open.',
      'It also says what it would question, and offers at most three possibilities. None of it touches your map unless you choose Add to map, and the next synthesis shows what changed since this one.',
    ],
    link: { label: 'Try it in Logos', path: '/chat?model=logos-3' },
  },
  {
    // APPROVE ONLY ONCE the Rewards tables exist on production ("Socria
    // Rewards" in supabase/schema.sql, plus rls.sql) and the challenge ring
    // shows there (docs/REWARDS.md).
    id: '2026-11-rewards',
    draft: true,
    subject: 'Build a five-card map, get a week of Socria One',
    preheader: 'And a link to share: a friend who joins gets a week too.',
    paragraphs: [
      'Build one map in Logos with at least five connected ideas of your own and you get seven days of Socria One, with no card and no waiting. The ring at the top of the sidebar shows how close you are.',
      'You also have a link of your own to share. A friend who joins with it gets seven days of Socria One, and you get seven more once they have had two real sessions. A paid subscription is never touched by any of this.',
    ],
    link: { label: 'Try it in Logos', path: '/chat?model=logos-3' },
  },
  {
    // LIVE ON PRODUCTION (models the engine builds and solves). The example is
    // the engine's own (lib/model/engineering.ts).
    id: '2026-11-models',
    subject: 'Describe a system. Get a model you can change.',
    preheader: 'Springs, circuits, beams, reactions: built and solved, with sliders that recompute it.',
    paragraphs: [
      'Describe a system to Logos and the engine builds a working model of it, such as "Model a 1 kg mass on a 20 N/m spring with a 0.6 N·s/m damper, released from 1 m." Move a slider and it is solved again, or change it in words: "change this mass to 4 kg."',
      'It also solves systems of linear equations and draws them, with the solution where the lines meet. When something is outside what it can solve, it says so rather than guessing.',
    ],
    link: { label: 'Try it in Logos', path: '/chat?model=logos-3' },
  },
  {
    // LIVE ON PRODUCTION (Draft Space). Lists the selection moves that do not
    // depend on web search.
    id: '2026-11-draft-space',
    subject: 'A page that only you write on',
    preheader: 'Draft Space: write it yourself, with help on any passage you select.',
    paragraphs: [
      'Press Draft in the Logos header for a blank page that is yours alone. Logos never writes into it.',
      'Select a passage when you want help with it: Clarify, Challenge, Trace or Refine. Refine proposes new wording, and nothing changes unless you choose Use this. Hold in view pins a card from your map beside the page while you write. Draft Space is free on every plan.',
    ],
    link: { label: 'Open Logos', path: '/chat?model=logos-3' },
  },
  {
    // LIVE ON PRODUCTION (practice displays). Examples from the displays' own prompts.
    id: '2026-11-practice',
    subject: 'Practise with your own material',
    preheader: 'Supply and demand you can predict, accounting worksheets, and quizzes from your own map.',
    paragraphs: [
      'Logos can turn what you are studying into practice. "Make a supply and demand practice where demand is P = 100 − 2Q and supply is P = 20 + 2Q" gives you a market to predict, then reveal. "Give me a balance sheet worksheet" gives you one that is checked by the standard rules.',
      'Or say "Quiz me on this map" to practise recalling what you have built, with hints that come one at a time. The results describe that attempt only, and nothing claims you have mastered anything.',
    ],
    link: { label: 'Try it in Logos', path: '/chat?model=logos-3' },
  },
  {
    // LIVE ON PRODUCTION (graphs and number lines). Examples from the user docs.
    id: '2026-11-graphs',
    subject: 'Graph it, or put it on a number line',
    preheader: 'Type the expression or the inequality. Logos draws exactly what you wrote.',
    paragraphs: [
      'Type "Graph y = x^(2/3) from −8 to 8" and Logos draws the curve. Type "Show −2 ≤ x < 5 or x = 7 on a number line" and you get the line, with the interval notation and set-builder form written beside it.',
      'It draws what you wrote rather than solving it for you, so it shows you the problem instead of skipping it. A letter you have not given a value is left for you to set, not guessed.',
    ],
    link: { label: 'Try it in Logos', path: '/chat?model=logos-3' },
  },
  {
    // LIVE ON PRODUCTION, labelled experimental (Live 3D). Example from
    // lib/logos3-showcase.ts. Never claims anything would hold or fly.
    id: '2026-11-live-3d',
    subject: 'Describe a part. See it in 3D.',
    preheader: 'Live 3D, an experiment in Logos: designs drawn from your description.',
    paragraphs: [
      'Open + View, choose Live 3D, and describe a part in the conversation, such as "draw a NACA 2412 aluminium wing with chord 1.5 m and span 5.35 m." It previews as you type and is built when you send.',
      'Select a part to adjust it, and undo a whole description at once. It shows the volume, and the mass when you name a material. It is an experiment and a geometric preview only: nothing is loaded or simulated, and it never tells you something would hold.',
    ],
    link: { label: 'Try it in Logos', path: '/chat?model=logos-3' },
  },
  {
    // LIVE ON PRODUCTION (Memory and the Mind atlas). Needs an account.
    id: '2026-11-memory',
    subject: 'What Socria remembers, and how your thinking changed',
    preheader: 'Your Memory page shows what Socria keeps, and lets you confirm, reject or forget it.',
    paragraphs: [
      'Socria remembers a few things about how you reason and carries them between conversations. Your Memory page shows all of it: what is remembered, your conversations around it grouped by project, and the models and plots that belong to them.',
      'Under "How your thinking has changed" you can confirm, reject or forget what Socria thinks has changed, and contradictions are shown rather than quietly resolved. Off the record keeps nothing, and nothing from a shared chat is remembered.',
    ],
    link: { label: 'Open your Memory', path: '/memory' },
  },
  {
    // APPROVE ONLY ONCE Logos 4 is live on production (it is on dev only).
    id: '2026-11-point-and-ask',
    draft: true,
    subject: 'Point at it, then ask',
    preheader: 'Select a card, a bar, a cell or a passage, and your question is about that.',
    paragraphs: [
      'In Logos you can now select almost anything and ask about it: a card on your map, a bar or a slice of a chart, a cell in a table, a passage in a document, or a formula in one of Socria’s replies.',
      'The message box shows what is selected, so "why is this one so high?" means that bar. The conversation keeps a note of what each question was about, so it still reads correctly when you come back to it.',
    ],
    link: { label: 'Open Logos', path: '/chat?model=logos-3' },
  },
  {
    // APPROVE ONLY ONCE Logos 4 is live on production (it is on dev only).
    id: '2026-11-pick-up-where-you-left',
    draft: true,
    subject: 'Logos opens where you left it',
    preheader: 'Your place in the conversation, the message you were writing, what you had selected.',
    paragraphs: [
      'Close the tab, reload, or switch to another line of thinking and back, and Logos opens where you were: scrolled to the same place, the message you had half written still in the box, the same thing selected, and a document open at the page you were reading.',
      'This is kept in your browser, on that device, and nowhere else. When you start something new, Logos offers the latest line of thinking that is still waiting on you, with the question it was waiting on.',
    ],
    link: { label: 'Open Logos', path: '/chat?model=logos-3' },
  },
  {
    // APPROVE ONLY ONCE Logos 4 is live on production, and the `captures`
    // table has been created there (supabase/schema.sql and rls.sql).
    id: '2026-11-quick-capture',
    draft: true,
    subject: 'Keep a thought for later, in two taps',
    preheader: 'A note or a photo of a whiteboard, saved without starting a conversation.',
    paragraphs: [
      'Quick Capture is a private inbox in Logos. Tap Capture beside the message box, write a line or add a photo of a whiteboard or a page of notes, and save it. A photo is read once, so its words come with it.',
      'When you are ready, turn a capture into a new line of thinking, a card on your map, or part of the message you are writing. Nothing is sent or filed by itself, and any capture can be edited or deleted. Signed in, your captures are kept in your account.',
    ],
    link: { label: 'Open Logos', path: '/chat?model=logos-3' },
  },
  {
    // APPROVE ONLY ONCE Logos 4 is live on production and the mic has been
    // tried there (it transcribes with the production OpenAI key).
    id: '2026-11-voice',
    draft: true,
    subject: 'Talk instead of type',
    preheader: 'Speak into Logos. The words land in the box for you to edit before anything is sent.',
    paragraphs: [
      'The message box in Logos has a microphone now. Tap it, say what you are working through, tap Done, and your words appear where your cursor was, ready to read, fix and send when you choose. Nothing is sent by itself.',
      'The recording is turned into text and then discarded: the audio is not stored. A recording can be up to two minutes long.',
    ],
    link: { label: 'Open Logos', path: '/chat?model=logos-3' },
  },
];
