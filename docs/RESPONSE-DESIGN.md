# Response design — how a Logos 5 reply reads (logos5-v4)

A Logos 5 reply should read like something written for one person by someone
who has thought about their problem — not a document dropped into a chat
window. This page records what changed, in the prompt and on the page, and the
rules that hold it in place.

## The problem

Asked "I need to redesign an onboarding system for Socria's new Logos 5
relaunch", the v3 persona produced the chatbot reply: a sentence of preamble,
five bolded sections of advice that would fit anyone's project, and "Would you
like me to go deeper on any of these?". Three of its own lines invited that:

- "Short by default (one to five sentences)" read as a cap to be worked around
  with structure.
- "Name the two or three directions it could go" became the directions written
  out in full.
- "**bold** as a list label" became a heading on every section.

The reference reply for the benchmark, in that shape, is about 210 words with
five headings and seventeen bullets. The redesigned shape is about 150 words,
its paths element included: a
statement of the real problem, one concrete starting point, the wrinkle the
relaunch adds, and three ways onward offered as a paths element rather than
written out. Both are fixtures (the "after" is the dev fake's scripted reply,
`scripts/dev/fake-openai.mjs`) used to exercise the renderer; they show the
target shape, and are not measurements of the live model.

## In the prompt

`lib/runtime/behavior.ts`, persona `logos5-v4`. The core says each rule in a
line, so the cached system message stays inside its budget
(`test/runtime.test.mjs`: under 56% of the Logos 3.5 prompt):

- **Lead with what matters**: the first sentence is the answer, the finding, or
  the real problem under the request. No preamble, no announced structure.
- **Length follows the work**, never a habit. No word limit — depth is still
  depth — but each thing is said once, with no generic advice and no recap.
- **At most one question**, and only one whose answer would change what is
  said next. Never a closing "would you like me to go deeper…?".
- **An open request is not a cue for a complete plan.**
- Bold only as a list item's label; no headings unless the turn's note asks.

The planner (`lib/runtime/presentation.ts`) reads the turn and adds a shape
note only when it applies:

- **open** — an open piece of work ("I need to redesign…", "help me plan…"):
  the problem that matters, one concrete starting point particular to them, and
  the ways onward as a paths block, then stop.
- **deeper** — "go deeper on …": depth on that one thread, as long as it needs,
  in parts with their own short headings so it can be read a part at a time.

Two inline elements were added for these shapes (`lib/inline-ui.ts`):

- **paths** — two to four ways onward, each a label and a line; pressing one
  asks "Go deeper: <label>".
- **decide** — a weighted comparison for a choice: options scored 0–3 against
  criteria, weights the person sets (a reply's own weights are dropped), a live
  leaning, and "Open in Artifacts" as a ranking.

## On the page

`lib/reply-layout.ts` (pure) decides how a reply's blocks sit;
`components/RichText.tsx` (`EditorialText`) draws them; `components/logos5/reply.css`
styles them in the conversation's own tokens.

| Piece | Rule |
|---|---|
| The lead | A short opening statement (at most 42 words, with at least 25 after it) is set as a standfirst in the serif. A reply of a line or two stays conversation. |
| Faked headings | "**1. Clarify the goals**" alone on a line is read as a heading and drawn as one (`h2`, the message's own outline). |
| Terms | A list whose every item is a bold label and its text is laid out as label and text, not bold bullets. |
| Folds | After the first part, a later part folds once 60 words have been said before it: its title and first words show, the rest is a native `<details>`. A finished part under three lines is shown open. The rule looks only backward, so a reply folds the same way while streaming as when it lands. "Open all" opens every fold. |
| Never folded | The closing question and a paths block — they belong to the whole reply. |
| Streaming | The settled part is laid out; the tail renders as it arrives, and a fold still being written says "Writing…". |

Accessibility: folds are native `<details>` (keyboard, screen readers and
find-in-page reach inside), headings never skip a level, the fold preview is
`aria-hidden`, paths and decide controls carry labels, contrast holds on the
struck-through decide rows, forced-colors and reduced-motion rules are in
place, and phone layouts wrap the decide table rather than scroll.

## Tests

`test/reply-shape.test.mjs` pins the persona rules, the planner's shapes, the
layout (lead, faked headings, terms, folds, streaming split) and the two
elements; `presentation`, `runtime`, `runtime-register`, `runtime-route`,
`think-together-chat`, `four-views` and `logos5-ui` pin what they share with it.

## Not yet verified

The shapes are verified against the renderer with fixture replies and against
the prompt as text. How the live model follows `logos5-v4` on the benchmark
and on ordinary turns needs a run against the real provider, which this
environment does not reach.
