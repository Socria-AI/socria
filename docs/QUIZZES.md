# Quizzes — source-grounded, adaptive, reviewed, remembered

A student types "Quiz me for my microeconomics exam." Socria finds the course and its materials on their device,
reads how the professor asks questions, and aims at what the student has missed before. It makes a quiz as an
artifact in the conversation, one question at a time. Each answer is graded by the server, whose answer keys never
reach the browser in the clear. The quiz adapts as the student goes, and turns into a short review at the end.
The conversation knows every question and answer exactly, and the learning ledger keeps what each one showed.

**Quiz → Evaluate → Review → Explore → Retest → Improve.**

Before this, a quiz request was a chat "practice turn". The reply model wrote questions in prose, one at a time,
and graded the answers in prose. There was no answer key, nothing was recorded or graded by rule, there was no
review, and there was no structured history for a later "why did I miss question 4?". The course profile
(`docs/TEACHING.md`) already shaped those turns. It now shapes the quiz artifact.

---

## 1. Where it sits

| Concern | Module |
|---|---|
| The quiz as an artifact: state, operations, what the conversation is told | `lib/objects/display-quiz.ts` (display kind `quiz`) |
| Question types, keys, records, limits | `lib/quiz/types.ts` |
| Reading the request: count, mode, difficulty, formats, topics, named sources | `lib/quiz/scope.ts` |
| Named material, missing files, Socria's notes | `lib/quiz/context.ts` |
| The professor's style, with its basis | `lib/quiz/style.ts` (on `lib/teaching`) |
| The brief, reading the model's JSON, shuffling, sources, keys | `lib/quiz/generate.ts` |
| Checks on every generated question | `lib/quiz/validate.ts` |
| Grading every type; what a wrong answer may show; what each mode reveals | `lib/quiz/grade.ts` |
| Sealing keys, signing grades (server only) | `lib/quiz/seal.ts` |
| Which question comes next | `lib/quiz/adapt.ts` |
| The review, the completion note, the conversation's facts | `lib/quiz/review.ts` |
| Mastery evidence in the learning ledger | `lib/quiz/mastery.ts`, `lib/quiz/evidence.ts`, `lib/runtime/explain.ts` (`LedgerEntry.q`) |
| Measures for future experiments | `lib/quiz/measures.ts` |
| Making a quiz | `app/api/logos/quiz/route.ts` |
| Grading, revealing, finishing | `app/api/logos/quiz/grade/route.ts` |
| The quiz and its review, drawn | `components/display/QuizFigure.tsx`, `quiz.css` |
| Starting from the chat; the ledger, the note, deep dives, follow-ups | `components/LogosApp.tsx` (the `QUIZZES` section, `send` intercept) |
| MR: a request the quiz took is not a quiz contract in words | `app/api/logos/chat/route.ts` (`QUIZ_TAKEN`) |

---

## 2. The flow

1. **The request.**
   - `send` recognises a request to be quizzed (`asksForQuiz`), in the ordinary ways of asking: "quiz me on…",
     "I want to be quizzed", "test my knowledge of…", "ask me some questions about…", "can I have a quiz on…",
     "let's do a quiz", "practice questions on…", "a 10-question quiz", and the common misspelling "quizz me". It
     is not used for a question *about* a quiz ("what's on the quiz on Friday?").
   - **From the Everything view.** Once a conversation has a reply, its board offers a **Quiz me on this** card
     (on the zoomed board, a tile with **Start the quiz**). Pressing it is the same as asking in words, on what
     the conversation has been about. The card steps aside while a quiz is being taken.
   - The student's message stays in the conversation, marked `via: 'quiz'`.
   - Nothing goes to the chat reply. MR reads that message as "a quiz was made as an artifact", so the chat does
     not also start quizzing in words, and the review afterwards can be explained.
   - **Nothing to quiz on.** "Quiz me" with no topic, no material, no course and nothing yet in the conversation
     gets one question ("What would you like the quiz to be on?"), and the next message is the topic, rather
     than a quiz on a subject picked at random. "Quiz me on this" or "on what we covered" means the conversation
     itself, whose subject goes with the request.
2. **Context**, in the browser, where the materials live:
   - **The course.** It is chosen by `courseFor`:
     - the course linked to the conversation;
     - else the course of the documents in the conversation;
     - else the course named in the message;
     - else an unmistakable topic match.
   - **When it could be either of two courses**, Socria asks one short question ("Which course is this quiz
     for — ECO 304K or ECO 420?"). Naming one in the reply starts the quiz.
   - **Material.** The documents in the conversation come first, then the course's teaching materials. Past exams
     and quizzes are never used as material: they shape the style, and their questions are not copied.
   - **Named material.** "From the Lecture 7 slides" is matched by its numbers and words (`docNamed`). If it is not
     there, Socria says so and makes nothing from general knowledge, unless the student says general questions
     are fine.
   - **What else is sent:** the course pack (codes, terms and concepts, never passages), the learning ledger, and
     the stems already asked on this scope. None of these is sent on a shared conversation.
3. **Generation** (server), made to work every time:
   - **In parts at the same time** (`partsOf`): an 8-question quiz is two calls of four questions (and their
     variants) running together, at most five calls however long the quiz. Each call is short, so it finishes
     whole and inside the route's 60 seconds. Each has its own time limit, and a part that fails costs only its
     own questions. Each part is told which concepts the others cover.
   - **Cut-off replies are still read** (`salvageQuiz`). If a reply stops at its token limit, every question that
     arrived whole is kept.
   - **What a model actually writes is read** (`normaliseItem`):
     - the other names for fields ("question", "why", "rationale") and for types ("multiple_choice",
       "true_false", "short_answer", "select_all");
     - options as plain strings;
     - the right option named by its letter or its own words;
     - a true/false answer given in its options;
     - a bare number or phrase as the answer;
     - citations written as "[1:p3.12]", "doc 1, p3.12" or "p3.12".

     A bare number naming the right option is never taken: whether it counts from 0 or 1 would be a guess, and a
     wrong key is worse than none.
   - **One more part for what is missing.** When a part failed, or questions did not pass their checks, one more
     call writes the shortfall while there is time. It is told what is already asked, so nothing repeats.
   - Every question is checked (§5).
   - Options are shuffled, with the right answer spread evenly across positions.
   - Keys are sealed for this student (§6).
   - If, after all that, too few questions hold up, it says so rather than padding the quiz.
   - **The browser tries once more** on a failure that is not about the request: the server or the network
     failing, a time-out, or a gateway's error page. Never on an answer about the request (missing material, too
     few held up, too many requests). Each failure is then said plainly.
4. **The artifact.**
   - A `quiz` display is added to the conversation's map, drawn in the Everything view (a live card, in the turn
     it was made in, so a phone shows it under its note, and its review under the score once finished) and the
     expanded workspace (Artifacts).
   - It is one object, so the two views can never disagree, and a page reload restores it exactly. The history
     replays deterministically.
   - Socria says in a line what was made and from what. For example: "Here's an 8-question quiz on monopoly
     pricing, from ECO 101 Lecture 6 and ECO 101 Lecture 7."
5. **Taking it.** One question at a time; the next question is chosen by what the answers show (§7).
6. **The end.** The quiz becomes its review (§8).
   - The conversation gets one note, for example: "You scored 6/8 (7 with a second try). The misses were on
     monopoly pricing. You can review them in the quiz or practise those concepts again."
   - The learning ledger records what each question showed (§10).

---

## 3. Modes

| Mode | Asked for by | During the quiz | At the end |
|---|---|---|---|
| Guided practice (default) | — ("guided", "with explanations") | Right: the answer and why. A first miss: a cue to reason with, and what the answer *may* show. The student can try once more or see the answer. A second miss: the answer and why. | Review |
| Marks as you go | "no explanations until the end", "don't show me the answers" | Right or not, nothing more | Review with every answer and why |
| Exam simulation | "exam simulation", "mock exam", "timed", "like the real exam" | Nothing: each answer is final and saved, and the next question follows | Everything graded and explained at once |

- **The server enforces the mode**, because it is sealed into each key. A browser that claims another mode gets
  nothing more.
- **Count, difficulty and formats are honoured as asked:**
  - "10 questions" (up to 25);
  - "harder", "easier", "mixed";
  - "multiple choice only", "true/false", "short answer", "with graphs".
- **Defaults:** 8 questions in practice and 10 in an exam simulation, in the course's own mix of formats (§4).
- **Difficulty from the chat.** While a quiz is open, "make it harder" or "easier" changes the questions from then
  on (`readQuizOp`).

---

## 4. The professor's style

`styleOf` reads the course pack built by `lib/teaching` (one profile per course and instructor) and takes what bears
on asking questions:

- the formats and their shares;
- how often questions turn on a graph or a calculation;
- whether they ask students to recall or apply;
- the traps the course sets (NOT/EXCEPT, telling ideas apart, one best answer, scale);
- how many steps a question takes;
- the course's own terms.

Each line given to the question writer carries its basis:

| Basis | When | What the student is told |
|---|---|---|
| Observed | counted in past quizzes or exams they added | "Questions follow how ECO 304K has asked in the past quizzes and exams you added (about 70% multiple choice). They are new questions, not a prediction of the exam." |
| Inferred | slides, notes, a syllabus's own claims, or too little evidence | "…read from your slides and notes; no past quizzes or exams were added, so the format is a reasonable guess, not observed." |
| Unknown | nothing says | "…general good practice for the subject." |

- A style read from slides alone is never "observed".
- The formats are planned in the course's shares (`planTypes`, largest remainder). The evaluation shows a gap of 0
  points on three course mixes.
- No past wording is used: a stem that shares several five-word runs with the course's past questions is refused
  (`copied`).
- No sentence that predicts an exam survives, in a stem, an explanation or a cue (`predictsExam`).

---

## 5. Every question checked (`lib/quiz/validate.ts`)

Each check is deterministic, with no extra model call. A question that fails is dropped and counted by its reason
(the route logs the counts), never repaired into something else.

| Check | Refused |
|---|---|
| Answer key | not exactly one right option (all that apply: two or more, not all); a number that is not finite or has no sensible tolerance; an expression that does not compile; a short answer with nothing to check against |
| Ambiguity | two options with the same words (punctuation aside) or the same number in two forms; "all/none of the above"; a hedged true/false ("sometimes", "can") |
| Giveaways | the right option's words in the stem; the right option conspicuously the longest; numerical options in mixed units |
| Arithmetic | the model's worked `calc` does not give the stated value |
| Figure | a curve that does not compile across its range; a point outside it; an answer said to be where two curves meet that is not where they meet |
| Sources | a citation to a passage the material does not hold; in a quiz confined to named material, a question that cites none |
| Honesty | an exam prediction; copied past wording |
| Repetition | a near-duplicate of another question, or of one already asked on this scope |
| Explanation | missing or empty. Explanations are kept to two sentences. |

---

## 6. Answer integrity (`lib/quiz/seal.ts`)

- **Keys are sealed.** A question's key holds the right option, the number and its tolerance, the accepted answers,
  the explanation, the cue, what each wrong option may suggest, and the mode. It is sealed with AES-256-GCM before
  anything is sent.
  - The additional data binds it to the owner (the account, or the conversation with the typed access key), the
    quiz and the question. A key copied to another question, quiz or account does not open (403).
  - The browser holds an opaque string per question. Nothing in the page, its attributes or the creation response
    gives an answer away, and the browser test checks this.
- **Grades are signed.** Every grade is HMAC-signed over the owner, quiz, question, attempt, a digest of the answer,
  and the grade. The display keeps the signature with the attempt.
- **The record is immutable.**
  - A graded attempt is never re-graded (the `grade` operation refuses a second grade for the same attempt).
  - A second try is a new attempt.
  - Finishing ends answering.
  - Practice after a deep dive is a new quiz, linked to this one, so the original score is never rewritten.
- **The secret** is `QUIZ_SECRET`, else `CONNECTION_SECRET`, else `CLERK_SECRET_KEY`, each derived for this use
  alone. Without any of them, the routes answer 503.
- **The same answer always gets the same grade.** A retry after a lost connection therefore cannot grade
  differently.
- **An answer is saved before it is sent for grading.** Offline, the answer waits and "Check again" grades it.
  Answers still unchecked at the end are graded from the review.

---

## 7. Adaptation (`lib/quiz/adapt.ts`)

The quiz is generated with a pool: its planned questions, plus a variant (a different question on the same
concept) for the concepts that matter most. After each answer, the next question is chosen by these rules:

- **Retests.** After a miss (a first attempt not right, even if a second try got there), a variant on that concept
  comes back two questions later, and once at most per concept.
- **Coverage.** A concept not yet asked comes before a second question on one that has been, and never three in a
  row on one topic. Near the end, coverage wins over a second look.
- **Priority.** In order: what was asked for, what was missed before (from the ledger), what is due for review,
  and what the course stresses and they have not met.
- **Difficulty.** One step up on a topic going well and one step down on one going badly. "Easier" or "harder"
  moves the whole quiz.
- **Exam simulation** keeps the planned order: no adapting, no retests.

The rules are deterministic: the same answers always lead to the same next question.

---

## 8. The review

The review is the same artifact, turned over:

- **The header:** the title, the score (only answers right at the first try, alone), the number right on a second
  try, missed and unanswered, and the topics to review.
- **Questions you missed come first.** Each card shows:
  - the number, topic and question;
  - **Your answer** (for a second-try one, *your first answer*);
  - **Correct answer**;
  - **Why**, in one or two sentences;
  - what the answer may show (a possibility unless confirmed);
  - the source;
  - **Dive deeper**, which opens three choices:
    - **Understand the reasoning** and **Review the concept** send a message about that question, with the
      question in focus (its full record goes with the turn);
    - **Try a similar question** makes three new questions on that concept, linked to this quiz.
- **Right answers** can be shown with a toggle and are never explained at length unasked.
- **A perfect score** says one quiz does not show it will stay, and offers a harder quiz. It never declares mastery.
- **Three next steps:**
  - **Practise weak spots:** new questions on what was missed, never the same ones;
  - **Take another quiz:** the same scope, adapted, harder after a perfect score;
  - **Back to the conversation.**
- **Look through the questions** shows the quiz as it was taken.

---

## 9. The conversation knows the quiz

Every turn, the quiz's facts reach the reply through the display system (`objectsBlock` → `quizFacts`):

- the title, mode, phase and score;
- every question asked, with its options, the answer given, the grade, and (once the student has seen them) the
  right answer and why;
- what a wrong answer may show, with its evidence level;
- the sources.

The display's `tell` instructs the model:

- answer from the question exactly as listed, never reconstruct or invent one;
- say a possible misconception as a possibility;
- do not ask quiz questions in the chat;
- while a quiz is being taken, do not give or hint at an unfinished question's answer. The Answer Guard is on while
  a quiz is taken, and off once it is finished.

So "Why did I miss question 7?" is answered from question 7 as it was asked. Deep dives also put the question
itself in focus (`partFacts`).

**Chat to quiz:**
- a request starts a quiz;
- a course named after the clarification starts the waiting one;
- "make it harder" or "easier" changes the quiz in hand;
- the review's buttons make follow-up quizzes, each linked to the one it came from (`links`, `children`).

**Events.** The display's own step history (`next`, `answer`, `grade`, `reveal`, `finish`, `look`, `follow`) is
the structured, persisted record of what happened. Content-free product events are counted besides:
`quiz_created`, `quiz_completed`, `quiz_deep_dive` and `quiz_follow_up`.

---

## 10. Mastery (`lib/quiz/mastery.ts`)

Every finished question is written once into the learning ledger the explanation engine already keeps (in the
browser only, behind its gates, never on a shared conversation). There is no second memory:

- **Counts and box.** The right and wrong counts and the Leitner box move exactly as any check moves them: up only
  for a first-try right answer, back to the start on a miss. That box schedules the delayed review (`dueTopics`),
  which later quizzes aim at.
- **Quiz detail** is kept beside them on the same entry (`q`):
  - the last 12 answers, each with when, right or not, difficulty, demand (recall, application or transfer),
    whether it was helped, and whether it was a retest;
  - where a mistake stands;
  - recent misconception tags.
- **Mistake states:** missed → under review (opened in the review, or gone deeper) → retested (right later, on a
  different question) → retained (right again at least a day later). A later miss sends it back to missed, and an
  old miss counts for less with time.
- **Estimates.** These come from a Beta posterior over weighted answers:
  - a helped answer counts half;
  - an easy miss or a hard right counts a little more;
  - answers fade by half every 45 days.

  They are said in words with their uncertainty (Not enough to say yet, Not there yet, Getting there, Solid so far,
  Secure). There is never a precise percentage from a handful of answers, and "Secure" needs right answers of more
  than one kind, a retention check, and enough of them.

---

## 11. Measured

From `test/quiz-eval.test.mjs`: deterministic, on an invented course's material (`test/fixtures/quiz-material.mjs`),
with no model call. A model's actual question quality is not measured here: the evaluation measures what the code
does with what a model writes.

| Measure | Result | Baseline |
|---|---|---|
| Flawed candidates refused, for the flaw they carry | 12/12 | 0/12 with no checks |
| Fit candidates kept | 8/8 | 8/8 |
| Labelled answers graded as they should be | 49/49 | — |
| Questions spent on concepts the simulated student does not know | 54.2% | 41.7% in the planned order |
| Missed concepts retested within the quiz | 91.7% (100% of those the quiz had room for, after covering every concept) | 0% |
| Most questions on any one concept | 2 | 2 |
| Concepts covered (of 5), worst simulated student | 5 | 4 |
| Scripted histories reaching the right mistake state | 6/6 | — |
| Answers kept through a lost grading request; graded by the end, after a reload | 3/3; 6/6 | — |
| Questions the conversation can quote exactly | 6/6 | none recorded before |
| Largest gap between planned formats and a course's observed shares | 0 points | fixed mix |

**Learning outcomes.** `measuresOf` computes, from the ledger's quiz evidence, what a future experiment would read:
accuracy on questions not seen before, retention after a delay, and hours from a first miss to a right retest.
Comparing adaptive practice with the planned order, or guided practice with marks only, needs a real study with
students. None has been run.

---

## 12. Tests

| Suite | What it holds |
|---|---|
| `test/quiz.test.mjs` (116) | grading for every type, including equivalent forms and confirmed, plausible or insufficient mistakes; request reading, in the ordinary ways of asking and not for a question about a quiz; every check; even answer positions; sealing and signing; adaptation; the display's operations, permissions and replay; the review and facts; mastery states; style basis; what a model actually writes read into the shape asked for (and a guessed key refused); a cut-off reply salvaged; parts planned and merged |
| `test/quiz-route.test.mjs` (39) | through the real routes: a quiz made from passages with no answer in the clear; observed against inferred style from a real course pack; missing sources refused; grading by mode; keys refused for another account or question; the chat told the quiz's facts; MR not taking up a quiz contract for a request the quiz took; written in two parts at once; a failed part made up by one more; a cut-off reply used; loose model output making a full quiz whose keys grade right; every call failing answered with a 502 |
| `test/quiz-eval.test.mjs` (11) | the evaluation above |
| `scripts/verify-quiz.mjs` | in Chromium: the whole flow, the exam simulation, two views as one object, phone, dark, reduced motion, no keys in the page, requests carrying only sealed keys |
| full app, in Chromium (not committed; run during the fix) | asked for in words through a failed first attempt; taken in the Everything view; a phone by touch, start to review; "quiz me" with nothing to go on; the Everything view's Quiz me card |

---

## 13. Limitations

- **A model writes the questions.** The checks catch what can be checked by rule: keys, arithmetic, figures,
  sources, duplicates, giveaways and honesty. They cannot judge whether a plausible distractor teaches well, or
  whether a question tests what matters most. Those are judged by the course profile's guidance and the model.
- **Short answers** are graded by accepted answers and key terms. When the words neither match nor clearly miss,
  the student checks their answer against the model answer, and that self-mark is kept as such. No model grades
  open answers.
- **Graphs are curves drawn from expressions** (supply and demand, costs, functions), plus marked points. There are
  no shaded areas or drawing-to-answer.
- **Attached files.** A quiz request sent with a new file attached goes to the chat as before. The quiz uses files
  already in the conversation or the course.
- **Merges.** Quiz state is saved with the conversation like every display. A save made from a stale copy (two
  tabs answering at once) keeps the stored copy's objects, as for any display.
- **Without an account** (the typed access key), keys are bound to the conversation rather than a person: anyone
  holding both the access key and the conversation id could grade against them.
- **No live model in the tests.** The evaluation feeds the code fixed candidates. The quality of questions a live
  model writes for a real course has not been measured.
