# Document intelligence (Logos 5.5)

A document in Socria is something to question, not something to summarise at length. A question is answered the way it was asked, from the document's own passages, with the page it came from. Socria's own reading of a document is there when the person asks for it. Every point in that reading rests on passages the person can open in the file itself.

This builds on what was already there, and duplicates none of it:
- the readers and the block model (`lib/docs`: every passage with its page, kind, box, confidence and doubts);
- grounding and citation checks (`lib/docs/ground.ts`);
- the native preview (`components/preview`, docs/FILE-PREVIEW.md);
- the Diagram display (`lib/objects/display-diagram.ts`);
- the model router and Sleep Mode metering.

## What a question asks for (lib/docs/intent.ts)

Each question about the documents is read in code, with no model call, as one of eight kinds:

| Kind | Example | What the model is shown, beyond the outline | How the answer is shaped | Room | Model |
|---|---|---|---|---|---|
| locate | "Where does it give the deadline?" | the matching passages and little else | a sentence or two, with its key | +120 | standard |
| explain | "What does 'bed-days' mean here?" | the matches, headings and equations favoured | plain meaning first, then the document's words | +260 | deep |
| summary | "What are the key findings?" | the first passage of every section; abstract and conclusion favoured | main point first, three to five essentials; qualifiers kept | +340 | deep |
| compare | "Compare the two reports" | the room shared evenly between documents | the difference that matters first; silence is not disagreement | +420 | deep |
| critique | "What does it assume?" | method, results, limitations and discussion, matched or not | claim, evidence, assumption and stated limits kept apart, weakest link first | +420 | deep |
| data | "What does table 2 show?" | every table and chart, whatever the words match | values read exactly from rows; described charts give no exact values | +320 | deep |
| apply | "How would I use this on my ward?" | recommendations and discussion favoured | what the document establishes, kept apart from Socria's judgement | +320 | deep |
| general | anything else | as before | as before | +310 | deep |

What each kind changes:
- **Passages shown** (`lib/docs/render.ts`). A document that fits is still shown whole, so nothing it says can be missed. Shaping applies only when it does not fit.
- **Room for the reply.** The reply's room follows the kind.
- **Model.** A lookup does not ask for the deep model (`lib/model-router.ts` `docLight`).
- **Instructions.** One line goes into the turn's context, never into the document's fence.
- **Logging.** The kind appears in `X-Socria-Runtime` as `docs=N:kind`.

**Follow-ups.** The passages the last reply cited are carried into the next turn (`renderDocs` `recent`). "Why?" or "and the second one?" is therefore read against what was just discussed, and its query is read together with the question before it. The header says `:carried` when this happens.

**Compression.** The rules for documents (`DOC_RULES`) now ask for:
- the answer first and briefly;
- the essential finding before the detail;
- shorter wording, never changed meaning (conditions, numbers and qualifiers kept).

## Socria's reading of a document (lib/docs/brief.ts, /api/docs/brief)

This is made when the person presses **Read it for me** in the preview's Analysis tab, never on its own. It takes one model call. The result is kept on the person's device (IndexedDB `socria-briefs`, `lib/docs/brief-store.ts`) and never on a server.

- **What the model is shown** (`briefMaterial`). The whole document, sampled:
  - every heading;
  - the opening of every section;
  - every table, chart, caption and equation;
  - the closing passages;
  - the rest spread evenly through the document.

  A 300-page report is read end to end in outline, not just its first pages, and the analysis says how much it read.
- **What is asked.** The gist, findings, claims with their evidence and assumptions, the limits the document states, terms and how they link, what each table shows, and three or four questions to ask next. Every item must cite passages by key, and every quotation must be copied from its passage.
- **What is kept** (`sanitizeBrief`). Only what the document bears out:
  - an item citing no passage that exists is dropped;
  - a quotation is cut from the passage itself (`verbatimFrom`), never the model's words dressed as the document's;
  - an item is dropped if a number it gives is not in its passages, its sign is flipped, it states a multiple in words ("tripled") that the passage does not, it "quotes" words the passage does not hold, or the passages barely touch it;
  - a term the passages never name is dropped, and a link survives only between terms that were kept;
  - what a table shows must be said in that table's own numbers;
  - an assumption is always marked as Socria's reading.

  The dropped are counted and said ("2 points were left out because the document did not bear them out"), never shown.
- **What is computed, not asked:**
  - the structure (the document's own headings);
  - how well it was read (`qualityOf`): pages read from their pictures, pages not yet read, passages marked uncertain, and what the reading checks found, with a level (good, mixed or poor) and one plain line;
  - which tables and charts exist.
- **When the model does not answer,** or nothing it says holds up, the analysis is made without it (`plainBrief`) and says so.
- **Access and limits.**
  - Who may ask, the rate limit and Sleep Mode are the same as every Logos route.
  - The document is claimed once against the month's documents, under the same key as anywhere else it goes, so a document already in a conversation costs nothing more.
  - A kept reading is read back through `restoreBrief`, so a document corrected since keeps only the points that still stand on it.

## In the preview (components/preview)

The preview keeps the three layers apart:
- the **original** (kept on the device and with the account);
- the **preview** (the original, drawn);
- the **reading** ("What Socria read").

Socria's analysis is a fourth thing, in its own tab, and says what it is.

- **Analysis tab** (`AnalysisPane`).
  - The quality line and the contents show at once, at no cost.
  - The analysis comes in folds, the first one open: What it finds, How it argues, What it admits, Terms, Tables and charts, Contents.
  - Socria's sentences are set plain. The document's own words are set as quotations with their page, shown only when they add something to Socria's sentence.
  - "Ask next" questions are put in the composer for the person to send or change; nothing is sent for them.
  - "Map the argument" and "Map the terms" file a Diagram in Artifacts (`lib/docs/brief-map.ts`): a tree of claims, evidence, assumptions and stated limits, or a concept map of the terms. Each node notes its page.
- **A passage in the original** (`lib/preview/locate.ts`). Pressing a page link in the analysis, a citation chip in a reply, or a passage in "What Socria read" opens the file at that passage:
  - **PDF and slides:** the passage's box from the reading is marked on the page.
  - **Word:** the preview lays the document out afresh, so its pages are not the reading's; the passage is found by its words and marked.
  - **Sheet:** found by its first cell.
  - **Text and Markdown:** found by its words. A numbered or lettered item ("4.", "(b)") is looked for without its number, which the rendered list draws rather than writes.

  When a passage cannot be found on the drawn page, the strip says so and its words are above it.
- **Picking a passage by pressing the page.** On a PDF or a deck, a faint box follows the pointer over the passages the reading boxed, and a press picks one.
- **The passage strip.** It names the page and the passage's words, and offers:
  - **Ask about this:** the passage becomes what the next message is about, through the same "Asking about" chip and `docFocus` as Point & Ask. On a phone the preview closes to show it.
  - **See it as read** or **Show it in the file.**
  - **Done.**
- **Citations.** A citation chip opens the original at the passage when the original is kept. A document attached before originals were kept opens its reading with the passage selected, as before.

## Tests

- `test/docs-intelligence.test.mjs`, 126 checks:
  - question kinds and what each changes;
  - shaping of long documents: lookup, critique, overview, data, follow-up carry, comparison balance;
  - the analysis material for large documents;
  - the sanitiser: invented numbers, forged quotations, missing citations, unnamed terms, links, table claims, caps and duplicates;
  - the reading's quality and scans, the plain fallback, reading a kept analysis back;
  - locating passages: picking, marking, finding by words;
  - the diagrams, accepted by the real Diagram display;
  - the route: access, malformed and forged readings, non-JSON answers, nothing holding up, provider down, no key;
  - the chat route: lookup vs critique headers, model level, room and context line, follow-up carry.
- `test/sleep.test.mjs` adds the analysis route to every model-calling route's Sleep Mode checks (resting refused before any model call; awake held and settled).
- `.journeys/doc-intel.mjs` (local) covers, on desktop and phone with real files:
  - a study PDF asked about, its citation opened in the original and marked, then asked about;
  - the analysis made, a page link followed, the hover box, a passage picked by press;
  - the argument mapped into Artifacts, a question put in the composer;
  - a Word report's passage found in the laid-out pages.
