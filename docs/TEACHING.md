# Teaching and assessment profiles (Logos 5.5)

A student adds a course's materials: the syllabus, lecture slides and notes, past quizzes and exams they are
allowed to use, study guides and assignments. Socria reads how that course teaches and how it asks questions,
shows the student what it found and where, and uses it in their conversations. Explanations use the course's
terms and its way into a topic. Practice questions make the same reasoning demands as the course's own, aimed
at what this student has got wrong or not yet practised. Socria never claims to know what will be on an exam.

Everything here is worked out in code, without a model call. Every claim in a profile says which passages
support it, whether it was counted, read from a pattern or only stated by the syllabus, and how sure it is.

> **A note on names.** The request called MR "Memory & Reasoning". In this repository MR is **Metacognitive
> Regulation** ([MR.md](MR.md)): a control plane that holds no content by design. Its state is typed codes,
> and its ledger stores no text. A course profile holds passages from the student's own files, so it cannot
> live inside MR without breaking that rule. Profiles are therefore a knowledge layer of Socria's memory,
> kept beside the student's documents and learning ledger. MR still governs how they are used on practice
> turns: a request to practise is a quiz request under MR's existing contract (section 7).

---

## 1. Where it sits

| Concern | Module | Notes |
|---|---|---|
| Reading files | `lib/docs` (existing) | The same readers and block model as document intelligence: every passage with its page and block id. Scans go through the existing vision reading. |
| Ingestion | `lib/teaching/materials.ts` | `digestMaterial`: what kind of material it is, which course, instructor and term, its units (each question, slide or section) and what can be counted in each. |
| Observation | `lib/teaching/observe.ts` | `observe`: from digests to observations, each with evidence, basis and confidence (`calibrate`). |
| Profile | `lib/teaching/profile.ts` | One profile per course and instructor. Adding, allowing and removing materials, corrections, history, sanitising. |
| Storage | `lib/teaching/store.ts` | IndexedDB `socria-courses`, beside `socria-docs`. Which conversation is in which course: `socria.course.links.v1`. |
| Retrieval and use | `lib/teaching/use.ts` | `courseFor`, `packOf`, `sanitizeCoursePack`, `learnerOf`, `courseLean`, `practiceSpec`, `renderCourseGuidance`, `predictsExam`, `copiedWording`, `effectsOf`. |
| Explanation planner | `lib/runtime/explain.ts` | `CourseLean` on `ExplainInput`; `leanRotation` for reframes; the worked-example rung. |
| The turn | `app/api/logos/chat/route.ts` | Pack read behind the ledger's gate; guidance in the turn context; the reply gate; trace header and log line. |
| The profile in the app | `components/logos5/CourseSheet.tsx`, `course.css`, `components/LogosApp.tsx` | A sheet inside Logos 5, opened from the chatbox chip, the "+" menu and More. |
| Clear memory | `lib/local-data.ts` | `clearLocalMemory()` clears profiles and links. |

### The turn, with a course in it

```
browser  profiles (IndexedDB)
         └ courseFor(linked → materials → named → topic; 'off' for this conversation → none)
           └ packOf(profile) ─────────────────────────── body.course   (not sent on a shared conversation)

route    comprehensionAllowed && Logos 5 && LOGOS_COURSES ≠ off → sanitizeCoursePack(body.course)
         ├ planExplanation({ course: courseLean(pack, text) })   worked example first, picture, contrast
         ├ renderCourseGuidance(pack, { ledger, practice, … })   the "THIS COURSE" block in the turn context
         │    learnerOf(pack.concepts, ledger) → weak · due · unseen · strong · lost with
         │    practice turn → practiceSpec → formats, demands, traps, difficulty, targets, ways to avoid
         ├ MR regulateTurn (unchanged)                            a practice request is a quiz request → preserve_challenge
         ├ reply gate (held and streamed)                         drops any sentence that predicts an exam; counted
         └ after the reply                                        copied wording measured against the pack's hashes; logged
```

With no pack, or with `LOGOS_COURSES=off`, the prompt is byte-for-byte what it was before (tested).

---

## 2. Materials

| Kind | Shows | Notes |
|---|---|---|
| Syllabus | what the course says of itself | Its claims are **stated**, never observed (section 3). |
| Lecture slides, notes, other material | how the course teaches | Cut into slides or sections by their headings. |
| Past exam, past quiz | how the course asks | Used only once the student ticks **Allowed to use**. Until then the file is kept, listed and waiting. |
| Assignment, study guide | how the course asks | Cut into questions like an exam. |

**What a file is.** Read from the file: syllabus cues first, then the file's name ("Lecture 5 notes" is notes,
"Week 3 slides" is a deck), then its content (numbered questions, options). The student can always change it.

**Which course.** The course code ("ECO 304K"), title, instructor and term are read from the file. A profile's
key is the course and the instructor, so two instructors of one course are two profiles. Files added together
that name no course join the profile the batch's other files name. A sortable order comes only from a named
term ("Fall 2025"), so trends are read only across termed files.

**The digest.** Each file is read once into units:
- an exam's questions, each with its format (multiple choice, true or false, short answer, free response in
  parts, calculation, essay, proof, matching, fill in the blank), its demand (recall, understand, apply,
  analyse, evaluate, create, read from the stem and parts only), numbers, a graph or figure, traps, scenario,
  justification, points;
- a deck's slides or a handout's sections, each with how it opens (example, definition, question), what it
  contains (worked examples, analogies, applications, equations, diagrams, links back to earlier topics,
  checks, recaps, objectives).

It also keeps the file's terms, the abbreviations it defines ("marginal revenue (MR)"), the terms it defines
in so many words, and counts across its prose. For past questions it keeps hashes of every five-word run
(32-bit FNV-1a), never the runs themselves. The file itself is not needed again, except to change its kind.

---

## 3. Observations

Fifteen dimensions, as the request lists them:

| Side | Dimension | Example codes |
|---|---|---|
| Assessment | Question formats | `format.mcq`, `format.free`, `format.tf`, `format.calc`, `parts` |
| | Difficulty | `difficulty.direct`, `difficulty.mixed`, `difficulty.multistep` |
| | Understanding or recall | `recall.memory`, `recall.understand`, `recall.apply` |
| | Numbers and application | `numeric.frequent`, `numeric.some`, `numeric.none` |
| | Graphs and diagrams | `graphs.frequent`, `graphs.some` |
| | Wording and traps | `trap.negation`, `trap.absolute`, `trap.allabove`, `trap.contrast`, `trap.best`, `trap.scale` |
| | What keeps coming up | `topics.recurring` |
| | How it has changed | `trend.<code>.up`, `trend.<code>.down` |
| Teaching | Explanation depth | `depth.*` |
| | Terminology | `terms.vocabulary` |
| | Concepts or practice | `emphasis.*` |
| | Examples, analogies and applications | `examples.frequent`, `examples.analogies`, `examples.applications` |
| | How topics are introduced | `intro.example-first`, `intro.definition-first`, `intro.question-first` |
| | Connections it draws | `links.back`, `links.pairs` |
| | How lessons are built | `structure.*` |
| Stated | (the syllabus) | `stated.cumulative`, `stated.closed-book`, `stated.graphs`, `stated.weights`, … |

**Basis.** Every observation is one of:
- **Observed**: a count of what is in the materials ("7 of 10 past questions are multiple choice").
- **Inferred**: a pattern read from those counts ("most questions ask you to apply an idea"), said as
  Socria's reading, with the counts it rests on.
- **Stated**: what the syllabus says the course will do. It is the course's claim about itself, never
  something seen.

**Confidence** comes only from the evidence: `score = strength × breadth × consistency × basis`, where
`strength = 1 − e^(−units/4)`, breadth is 0.6, 0.82 or 1 for one, two or three or more materials, and basis
is 1 (observed), 0.8 (inferred) or 0.55 (stated). The label then has caps:
- fewer than two supporting units: low;
- fewer than four, or a single material: moderate at most;
- stated: low at most for teaching, moderate at most for assessment;
- inferred from a single material: moderate at most.

**A syllabus alone is never enough.** When a profile has only a syllabus, every observation carries a caveat
saying so, and nothing about teaching rises above low.

**Evidence.** Up to six places per observation, spread across materials: the file, the page, the block, and
the passage's own words (verbatim, at most 160 characters). Each opens the original file at that passage in
the existing preview.

**Concepts.** What the course keeps coming back to, weighted by how often a concept appears in past questions
(more) and in teaching (less), with where.

---

## 4. Updates, corrections and history

- **Adding** a file digests it and rebuilds the profile from all its usable digests. **Allowing** a past exam
  or quiz brings it into use. **Removing** a file takes it out. Each rebuild records what changed: added,
  removed, new, gone, stronger, weaker, shifted.
- **Corrections.** "Not right" (with an optional note) takes an observation out of everything that travels
  with a turn, and keeps it visible with Undo. "Right" is recorded. Observation ids are stable
  (`dimension:what`), so a correction survives later rebuilds.
- **History.** The last 40 changes, shown under **What changed**.
- **Limits.** 12 profiles, 24 materials a profile.

---

## 5. Retrieval during a conversation

`courseFor` picks at most one course per turn, in this order:
1. the course the student linked to this conversation;
2. the course whose materials are in this conversation;
3. the course the message names ("for ECO 304K");
4. the course whose concepts the message is about, only when that is unmistakable (a score of at least two,
   with a clear margin over any other course).

The student can turn courses off for a conversation. What travels is not the profile but a **pack**: the
codes in force (with confidence, basis and share; at most 32), the course's terms (12) and abbreviations (6),
its concepts with their weight and how many past questions asked about them (12), and up to 600 hashes from
past questions. No passages travel. Observations the student marked wrong never travel.

---

## 6. Personalised explanation

The pack becomes a typed lean for the explanation planner (`courseLean`), from codes that are at least
moderate confidence:
- the course opens topics with an example → the planner puts a worked example first on a what, how or why
  question (reason `course-example-first`), unless the student is an expert or has had one already;
- the course draws, or asks about graphs → a picture comes first when the planner reframes a concept;
- the course's questions turn on telling ideas apart → a contrast comes before an analogy.

The turn's guidance gives the course's own terms and abbreviations that bear on the message, and notes when
the concept is one the course keeps coming back to ("asked about in 3 past questions"). It is combined with
the student's learning ledger (`lib/logos5/learning.ts`): the course's concepts they have got wrong more
often than right, are due to review, have not met, or hold; and the ways in that left them lost on a course
concept, so a mistake is explained another way.

---

## 7. Adaptive assessment

A turn is practice when the planner reads a request to practise or MR's own quiz pattern matches
(`lib/mr/ifr.ts` `QUIZ`). MR's quiz contract then keeps the difficulty (`preserve_challenge`): course
practice does not bypass MR. The practice spec (`practiceSpec`) asks for:
- the course's **formats**, in the shares its past questions show ("about 3 in 5 multiple choice; the rest
  free response, in parts that build on each other"), one question at a time;
- its **demands**: reading or drawing a graph, working with numbers, a scenario to reason about, a reason to
  justify the answer;
- its **traps**, used fairly and named in the feedback;
- its **difficulty**, one step easier on a concept the student has got wrong, building up to it;
- **targets**, in order: what the student asked to practise, what they got wrong, what is due, what the course
  has asked about at least twice and they have not practised, then what the course stresses;
- **ways in to avoid** when a mistake needs explaining.

**Reasoning demands, not wording.** The model never sees the course's past wording. The guidance asks for new
questions with the same demands. After the reply, its five-word runs are hashed and compared with the pack's
hashes, and the count is logged (`copied=N`).

**Practise in this course's style** in the sheet links the conversation to the course and puts a quiz request
in the composer, starting with the student's weakest, due or most asked concept.

---

## 8. Never a prediction

- The sheet says it on every profile: "This shows how the course has taught and asked questions in the
  materials you added. It cannot tell you what will be on an exam."
- The guidance tells the model never to say or suggest that a question will be on an exam.
- The reply gate drops any sentence that does (`predictsExam`: a prediction pattern, unless the sentence
  disclaims one), on both the held and the streamed path. Each drop is counted (`predicted=N`).

---

## 9. The profile in the app

Inside Logos 5, not a separate dashboard. It opens from:
- the **chatbox chip** ("ECO 304K · Smith") when a course applies to this conversation;
- **"+" → Course profile**;
- **More → Your courses**.

The sheet shows:
- the course and instructor, with a switcher when there are several;
- **In this conversation**: use it here, not here, or let Socria decide;
- **What this changes**: plain lines on how explanations and practice change, and the Practise button;
- tabs: **How it asks**, **How it teaches**, **What keeps coming up**, **Materials** (kind, Allowed to use,
  Remove) and **What changed**;
- an adder for more files, with the permission box for past exams and quizzes.

Each observation shows what was found, its confidence, its basis, how much supports it, any caveat, the
evidence (each opens the file at its passage), and **Right** / **Not right**. On a phone the sheet is full
height. Type sizes and radii are the Logos 5 system's (`test/logos5-system.test.mjs`).

---

## 10. Privacy and gates

- Profiles are kept in this browser only, like the documents they come from. The server keeps nothing.
- The pack is read only where the learning ledger may be: never on a shared or collaborative thread, for a
  guest, with two people present, on a sensitive or off-the-record turn, or in an incognito conversation. The
  client does not send it on a shared conversation either.
- What the server says about a course is content-free: the `X-Socria-Course` header
  (`why=linked;codes=28;g=1;p=0`) and the log line (`[course] … copied=N;predicted=N`).
- "Clear memory", signing out and deleting the account clear profiles and links.
- `LOGOS_COURSES=off` turns it off for a deployment.

---

## 11. Tests

`node test/teaching.test.mjs` (124 checks), on invented materials (`test/fixtures/course-materials.mjs`:
an ECO 304K syllabus, slides, two midterms, a quiz, and another instructor's section):
- ingestion: kinds, course, instructor and term; questions, inline options and parts; notes and decks;
- extraction: what each dimension finds in the fixtures, and what it must not (structural headings, generic
  words, options raising the demand);
- basis: observed, inferred and stated kept apart; a syllabus alone stays low and carries a caveat;
- evidence: every quote is verbatim from the file, on the page it says;
- confidence: the caps and the ordering;
- updates: adding, allowing, removing, history, corrections and Undo surviving rebuilds;
- instructors: two instructors of one course are two profiles;
- retrieval: `courseFor` in each order, `off`, the pack's limits and sanitising;
- the learner: weak, due, unseen, strong, lost with;
- explanation leans and guidance; the practice spec;
- prediction filtering, both ways; copied wording; the student-facing lines.

`node test/teaching-route.test.mjs` (23 checks), through the real chat route with fakes:
- off, or no pack: the prompt is byte-identical;
- a learning turn: the block is in the turn context only, with the course's terms, emphasis and the
  student's struggles; the header is content-free;
- the planner leans to a worked example (`course-example-first`);
- a practice turn: the spec is there, and MR's `preserve_challenge` holds;
- a predicting sentence is dropped and counted; copied wording is counted;
- the gate holds for a guest, a collaborative thread and an off-the-record turn; a malformed pack is ignored.

A browser journey (desktop and phone, signed in against a fake model) added four files in one go with the
permission box ticked, opened an observation's evidence and then the file at that passage, marked an
observation not right with a note, went through every tab, and used Practise, which linked the conversation
and filled the composer. The turn that followed carried the pack, with no passages in it.

---

## 12. Limitations

- **One browser.** Profiles do not follow the student to another device. Syncing them would need a server
  table and a migration, which has not been done.
- **Heuristic reading.** Extraction is pattern-based, written for English, and tested on invented
  materials. It has not been evaluated by people against real courses.
- **Scans.** Scanned or handwritten exams are only as good as the vision reading.
- **Copied wording is measured, not prevented.** On a streamed reply the count is logged after the fact. The
  model never sees past wording, which is the main protection.
- **The prediction filter is a pattern.** It can miss a prediction phrased in a way it does not know.
- **MR is unchanged.** Course practice runs under MR's existing quiz contract. Profiles are not in MR's
  ledger, which is content-free by design.
- **Changing a file's kind** needs the document still kept in this browser.
- **No Memory view entry.** Profiles are reached from the chip, "+" and More, not from the Memory view.
- **Trends** need files that name their terms.
- **Nothing here shows that it improves learning.** That needs a study with real students.
