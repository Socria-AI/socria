# SocriaUX — dynamic creative discovery

Prompt → a few questions drawn for it → the work → changes in your own words.

You type what you want into the one chatbox. SocriaUX reads it, asks only what the work cannot be made without (a
poster's words, a logo's name), then at most three creative questions — each generated for this brief — and makes the
work. There is no stage of choosing a direction, a look or a system first: once the brief is enough, the design is
composed, and everything is changed afterwards, conversationally.

## What was audited, and what was replaced

| Before | Where | Now |
| --- | --- | --- |
| A fixed optional "How should it feel?" question with suggestion pairs per subject (`FEEL_PAIRS`) | `lib/ux-v0/studio/director.ts` | Dynamic creative questions (`lib/ux-v0/studio/discovery.ts`), written by the model when it can be reached |
| A website's "three looks" offered in the conversation (choose, combine, "something different") | `director.ts` (`looks` move, `chooseLook`, `lookOnOffer`), `Conversation.tsx` (`Looks`) | Removed. The page is made in the first system the board engine draws from the words and answers |
| Three graphic directions to choose from after the conversation | `GraphicsWorkspace.tsx` (`directions` view), `GraphicBrief.tsx` (`DirectionsStage`) | Removed. The design is composed at once; other concepts are asked for in the editor (Concepts panel) or in words |
| Logo concepts stage before the editor | `GraphicsWorkspace.tsx`, `LogoPanel.tsx` | The first concept opens in the editor at once. Every concept side by side is still there, as an optional view opened from the Logo tab |
| Three board systems to choose from | `BoardWorkspace.tsx` (`system` view) | Removed. The board is made at once in the first system drawn for its words; the System panel changes it afterwards |
| "Nothing here calls a model." | `Conversation.tsx` | Gone: the questions may be written by the model now |

The underlying generative engines — the art-direction engine, the generative graphics engine, the logo engine, the board
pipeline, the website engine, the creative executor — are unchanged and still do all of the making.

## How much is asked (`lib/ux-v0/studio/discovery.ts` `creativeNeeds`)

1. What the work cannot be made without, as before (`director.ts`): a poster's words, a logo's name, a campaign's pieces.
2. Content that changes the work, only when nothing says it: what a logo's business does (`about`), what people should
   do on a website (`purpose`), whether pictures you brought are placed or only lend their look (`pictures`).
3. Visual questions — a mood (`vibe`), colours (`colour`), lettering (`type`) — as optional aids, within a **visual
   budget fixed from the opening brief**:
   - none when the brief says how the work should feel (its colours and lettering follow from the feel), or already
     says a good deal (colours, a typeface, details, references, pictures);
   - one (the feel) when it says a little;
   - two when it says nothing beyond what the work needs.

   Never all three; never more than two. A logo asks lettering first, then colour; a poster, a campaign or a site asks
   the feel first, then colour; lettering is asked of a poster only when its words make the lettering matter.
4. At most three creative questions in a conversation (`MAX_CREATIVE_QUESTIONS`), each asked once.
5. Never what is already said: the work's own words (its name, its headline, in quotes) are what it says, not how it
   should look — "Blue Hour" names no colour, "Spring Fair" asks for no flowers, "Ocean Labs" says nothing of what the
   business does.

A complete brief is made at once. "Skip" decides that one and moves on; "Surprise me" or "Make it now" leaves everything
open to SocriaUX and makes the work; "Show me others" asks the same question with other options.

## The visual answers

Every option is generated for the brief; nothing is picked from a fixed list of palettes, pairings or moods.

- **Moods** (`vibeChoices`): composed from the engine's qualities. The subject's temperament (the lexicon's domains:
  energy, warmth, play, gravity — a bakery is warm and lively, a finance summit grave and cool) and the words' own lean
  place it among the qualities (`axesOf`: how loud, warm, deep and precise each quality makes a design). The nearest
  mood leads, with its nearest companion; later moods are as different from those offered as the plausible half of the
  qualities allows. A world the words name outside the work's own words (clouds, the ocean) leads as a theme. Each mood
  has its own colours (the subject's own language moved by its qualities), a type character and forms, and is named in
  plain adjectives. Each is **drawn small by the engine itself** (`lib/ux-v0/studio/vibe-preview.ts`: its ground, two
  engine forms from `drawForm`, the brief's own words set in its type, its accent).
- **Palettes** (`paletteChoices`): the engine's colour languages for this subject (`languageFor`: the temperaments the
  words name, then those the subject suggests, and the hues of things named — bread, embers, the sea), deep grounds for
  most options when the words or a chosen mood lean dark. After a mood is chosen, palettes are drawn for it. Each is made
  to read (ink 4.5:1 on its ground, an accent that stands apart) and says how its colours relate. A colour of your own is
  a tap away (a colour picker), and colours can be named in words or hex codes.
- **Lettering** (`typeChoices`): pairings of real faces from the font library (`lib/ux-v0/fonts.ts`), for the characters
  the brief, a chosen mood and the subject's own language point to, spread across kinds of letter. A reading face is
  always a text face (`readableSet`). The specimens set the brief's own words (its headline or name) and are shown only
  once the faces have loaded.
- **Written questions**: two to four suggested answers, or your own words.

The UI is `components/ux-v0/studio/DiscoveryOptions.tsx` (in the Socria design system: cards at 18px lifting two pixels,
names in the voice, notes operated, actions as pills).

## Answers, and where they land

A tap, your own words, "skip" or "surprise me" lands on the decisions the engines already read (`apply.ts` `prefsOf`):

| Answer | Kept as | Read by |
| --- | --- | --- |
| A mood | `${p}.vibe` (its qualities, name, note, colours, type character, theme), personality words, look words | Palette and faces when nothing more particular was chosen; its qualities carried into the composed work by the creative executor (`lib/ux-v0/studio/realise.ts` → `executePlan`) |
| A palette, hex codes, colours named or described | `${p}.palette` (ground, ink, accent, accent2, name) | Every engine's palette |
| A pairing, a typeface named, a style of letter described | `${p}.type` (display, body, weight, case) | Every engine's faces (`facesOf` reads the fields) |
| What a logo stands for / what a site is for / pictures | `l.about` / `w.purpose` + `w.functions` / `${p}.pictures`, as before | As before |
| A question the model wrote about something else | `d.<topic>` and the words kept with everything said | The engines' readers of the brief |

Words that are about something else (colours named while the mood is asked, a site to learn from) are read for what they
say, and the question stays waiting.

## The model's part (`lib/ux-v0/studio/discovery-model.ts`, `/api/ux-v0/studio-questions`, `components/ux-v0/studio/questionPlanner.ts`)

The reader asks its question at once, so a conversation never waits on a model. When the model can be reached, the
browser sends the conversation as it stands (`questionContextOf`: the brief, what is known and decided, the questions
asked with their answers, what the reader would ask next, the questions and visual questions left) and the reader's
question is held back for a moment ("Thinking about what would change this most…"). The model answers under a strict
schema (stage `studio-questions`, economy tier, at most 1,600 output tokens): one question with options written for this
brief — palettes, pairings from the font library only (the schema's enum), moods in the engine's vocabulary — or
`ready` when the brief is enough. `normalizeQuestionAnswer` holds it to its shape and to the conversation's rules again,
on the server and in the browser: colours that are colours (made to read), faces in the library with text faces for
reading, qualities and themes that exist, at least two options that hold, nothing asked twice, nothing the brief already
says, never past the budget, never a third visual question. The model's question takes the reader's place in the same
turn (`rethinkQuestion`); "ready" turns it into the making note (`enoughToMake`). Answered meanwhile, signed out, not
configured, busy or over a limit: the reader's question stands, and the model is left alone for a while.

No model was called while building or testing this: the route is tested against the scripted fake client, and the
browser checks script the route.

## Generation, then refinement

The work begins the moment the brief is enough:

- **Graphics** (`GraphicsWorkspace.tsx` `makeNow`): composed in the first direction the art-direction engine proposes,
  held to what the conversation decided, then the chosen mood's qualities carried in by the creative executor (forms,
  depth, ground; its colours and faces already held). A logo's concepts are constructed and the first opens in the
  editor.
- **Boards** (`BoardWorkspace.tsx` `makeIn`): made at once in the first system drawn for the words (a website's approved
  system, or a registry design system's identity, when given).
- **Websites** (`begin.ts` `startFrom`): made in the first look the board engine draws, held to the conversation's
  colours and faces.

Afterwards, everything is changed in your own words — colours, typography, layout, imagery, mood, identity — through the
creative and precise edit paths (docs/SOCRIAUX-CREATIVE-INTELLIGENCE.md), which keep what you did not ask to change.

## Verification

No model was called and no paid service was used: the model's side is tested against the scripted fake client (route
tests) and a scripted route in the browser.

**Unit — `test/studio.test.mjs` (234 checks).** Vague prompts (a jazz night, a bakery post: a mood, then colours), detailed
briefs (made at once, nothing asked), a feel in the words (no visual questions), colours named (never asked about
colours), a typeface named (never asked about lettering), a subject named (a logo not asked what it stands for), a design
system linked (no visual questions); across thirteen briefs walked to the end: at most three creative questions, at most
two visual, each asked once, then the work. Custom answers: one hex code (the accent, made to read), colours named, a way
of colouring described, a colour picked, typefaces named (exactly those), a style of letter described (a real pairing),
a feel in words (the engine's qualities), a world named (its theme). Skipped questions, "surprise me", "make it now",
"show me others" (other options, kept apart from those offered), a reply that only points to sites (read; the question
waits; the address never becomes the brief), colours named while the mood is asked (the palette, and the mood still
asked). Options held to their shape: every palette's ink 4.5:1 on its ground, every pairing from the font library with a
text face for reading, pairings and moods distinct, moods named in adjectives, subjects with close colours still given
real alternatives, a mood drawn by the engine with the brief's own words. The model's output normalised: bad colours and
faces dropped, at least two options or no question, never a question already asked or already answered, never past the
budget, "ready". The model's question taking the reader's place and "ready" making the work; a waiting question and its
options surviving a reload; the chosen mood's colours and faces reaching the engines and its qualities carried into a
composed poster by the creative executor (the words and the palette kept).

**Routes — `test/ux-v0-route.test.mjs`.** `/api/ux-v0/studio-questions`: signed out refused before any call; no context, or a
critique, refused; no questions left answers "ready" without a call; a scripted model question passed through
`normalizeQuestionAnswer` (qualities outside the vocabulary dropped, a mood with none dropped, ink made to read); the
strict schema sent (`socriaux_studio_questions`); the rules, vocabulary and font library in the instructions and the
budget in the input; a repeated question refused (422, the reader's stands); "ready"; prose and upstream failures as calm
errors; every call logged and priced on the `studio-questions` stage. `test/ux-v0.test.mjs` lists the new stage among the
structured ones and in the routing table (economy).

**Full suite.** `npm test`: all 396 suites passed (studio 234, ux-v0 routes 225, ux-v0 933, creative 93).

**Browser (the built app under `next start`, Clerk placeholder keys, signed out).** `studio-qa.mjs` 44/44 ·
`graphics-qa.mjs` 58/58 · `boards-qa.mjs` 62/62 · `logo-qa.mjs` 24/24 · `creative-qa.mjs` 28/28 · `style-qa.mjs` 34/34 ·
`dsi-qa.mjs` 44/44 · `ceiling-qa.mjs` 47/47. The studio run drives the whole flow as a person would: a detailed brief
made at once; a vague one asked what it is and what it says, then a mood (tiles drawn by the engine in the poster's own
words, "show me others", a tap) and the poster made in it; a thin brief skipped to its colours and answered with a hex
code; a reload keeping the question and its options; a logo's lettering set in real faces (checked as loaded by the
browser), a pairing tapped, "surprise me"; the questions route scripted so the model's question takes the reader's place
and "ready" makes the work; a website made at once; websites pointed to while a question waits; a phone's width.

## Found and fixed along the way

- Options were not subject-aware at first (the same four palettes for a jazz night, a coffee logo and a bakery): the
  generators now read the subject's temperament and the things it names.
- A detailed brief that stated its feel was still asked about colours: a stated feel now leaves no room for visual
  questions, and the budget is fixed from the opening brief so answering one question never removes the next.
- The work's own words were read as art direction ("Blue Hour" as a colour, "Spring Fair" as flowers): quoted words are
  now content only.
- A reply that only pointed to a website was taken as the answer to the question waiting.
- The lexicon pairs Bebas Neue with a display-only reading face: discovery always offers a text face for reading.
- The concept comparison added in the previous change reused the class `.gx-compare`, which broke the Style Explorer's
  compare view; it is `.gx-cmp-*` now.
- Since that change, "remove the gradient treatment" and "make the layout more asymmetrical" on a design in a style went
  to the creative planner, which did not flatten the gradients on shapes: the style module answers those two first now.
- "New graphic / board in it" from the Design System Manager started the work with a list of systems loaded before the
  system was made, so the work was not made in it; the list is refreshed when the conversation begins. Inside a design
  system no visual questions are asked: its identity decides.
- The website "looks" preview (`WebsiteShot`) and its idle-time queue, used only by the removed line-up, were removed.

## Limits — said plainly

- The model path has not been exercised against a live model here (no key may be used, and the network allows no model
  host); it is exercised against a scripted fake with the same contract.
- Without the model, the reader writes the questions: its text is a template filled for the work (the options are
  generated). The model writes freer questions when it can be reached.
- Moods and palettes from the reader depend on the lexicon's domains: a subject it does not know gets moods from the
  words' own temperament and the widest variety instead.
- A website's mood reaches it as colours and faces only (the website engine has no forms to carry a mood's qualities).
