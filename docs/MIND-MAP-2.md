# Mind Map 2.0: one map, three ways of working with it

Logos 6, November 2026. The model and its rules are pure code in `lib/logos.ts` (fields and cleaning), `lib/map-edit.ts` (edits), `lib/logos6/graph.ts` (lines, structure, layouts) and `lib/logos6/protect.ts` (the map pass). The canvas is `components/logos6/ThinkingCanvas.tsx` and `thinking-canvas.css`. Navigation is `components/logos5/nav-side.ts` and `NavMover.tsx`.

Ideas, Logic Map and Structure used to be three entries, and in places three drawings of the same conversation. Now they are one **Mind Map**: one canonical graph of cards and lines, shown three ways.
- **Ideas**: brainstorm. Put ideas anywhere, connect them, group them.
- **Logic**: reasoning. Why ideas connect: support, tension, dependency, cause.
- **Structure**: organisation. What sits inside what, as a tree and an outline.

Switching between them changes how the map is drawn, never what it holds. Nothing is copied, nothing is lost, and a card you moved stays where you put it.

## 1. How it fits together

```
the conversation ─→ map pass (server) ─→ keepPlaced (protect.ts) ─┐
                                                                   ├─→ ThinkingMap {nodes, edges} ─→ the canvas
the person ─→ canvas / inspectors / outline ─→ editMap(edits) ─────┘        (one map per conversation)   Ideas | Logic | Structure
                                                │                                                          │
                                                └→ applyMapEdits (map-edit.ts): history, save, sanitizeMap  └→ visual bus: cards can be
                                                                                                                pointed at by Socria
```

- There is one map per conversation (`ThinkingMap`). Every view reads it, and every edit goes through `editMap` and `applyMapEdits`. Each edit is recorded in the map's history and saved with the conversation.
- The server cleans every saved map (`sanitizeMap`), whatever the browser sends.
- Each mode is a **projection** of the same map: `ideasPlaces`, `logicPlaces` and `structureRows` / `structurePlaces` in `graph.ts`. No mode keeps its own copy of a card.

## 2. A card (`LogosNode` + `NodeMind`)

A card keeps everything it had before: id, type, label, detail, status, group, evidence, history. It may now also carry `mind`. Every field is optional, so a card can still be just its title.

| Field | What it holds | Cleaned to |
|---|---|---|
| `subtitle` | a line under the title | 90 characters |
| `meaning` | what it means, in the person's words | 400 |
| `why` | why it matters | 400 |
| `notes` | free notes, several lines | 2000 |
| `tags` | short labels | 8; lower case, unique, `#` stripped |
| `sources` | `{title, url?}` | 6; links only `http(s)` |
| `assumptions` | what it takes for granted | 6 |
| `props` | your own fields `{k, v}` | 8 |
| `tone`, `shape` | colour (`moss`, `sky`, `amber`, `rose`, `violet`, `slate`) and form (`card`, `pill`, `note`) | listed values only |
| `pos` | where it was put: `pos.i` in Ideas, `pos.l` in Logic | within ±20000, whole numbers |
| `order`, `folded`, `top` | Structure: order among siblings, folded, and "at the top level by choice" | |
| `detailYours` | the detailed explanation was written or kept by the person | |
| `ai` | Socria's interpretation `{meaning?, why?}`, kept apart from the person's words | 400 each |
| `made`, `edited` | when | |

`sanitizeNodeMind` drops unknown fields, and it drops a `mind` with nothing in it.

**Stored information against Socria's reading.** The inspector never presents an interpretation as fact.
- A card's detailed explanation, when Socria wrote it, is labelled **"Explanation · Socria's reading of the conversation"**. Once the person edits it, it is theirs (`detailYours`).
- Socria's interpretation (`mind.ai`) appears in its own box, labelled as Socria's, with **Keep it as mine**. That copies it into the person's fields, only where those fields are empty.
- Nothing is generated to fill an empty field. An empty field says so and offers a place to write.

## 3. A line (`LogosEdge`)

Lines are first-class objects.

| Field | What it holds |
|---|---|
| `id` | a stable identity. When none is stored, `edgeIdOf` derives one deterministically (FNV-1a of `from>to:relation`, or `:structure`). |
| `from`, `to`, `relation` | the cards and the kind: supports, conflicts, depends, causes, leads to, part of, is a, applies to, and the rest of `LogosRelation` |
| `label` | the words on the line |
| `kind` | `'structure'` for a line of hierarchy; absent for a line of meaning |
| `why` | why it holds |
| `evidence` | what bears it out (up to 4 × 240 characters) |
| `status` | `'confirmed'` (by the person) or `'suggested'` (by Socria). Absent means read from the conversation. |
| `confidence` | only on a suggestion, 0–1, two decimal places |

Three statuses are shown, from `lineStatus`:
- **Confirmed by you**: drawn solid. Every line of structure counts as confirmed.
- **Suggested by Socria**: drawn dashed.
- **Read from the conversation**: drawn dashed.

Lines are coloured by **family**, not by relation: support, tension, dependency, cause, sequence, containment, association (`FAMILY_OF`). Each line's label is a button that opens it.

**Structure is not meaning.** "A sits inside B" (`kind: 'structure'`, relation forced to `part_of`) is a different line from "A supports B", even between the same cards. They have different dedupe keys, and removing or changing one never touches the other. `unlink` takes an optional `kind` (`'structure'` or `'meaning'`) and `was` (one relation), so a removal hits only what it names.

## 4. Structure: a deterministic tree, never a loop

`structureRows(map)` turns the graph into a tree. It never edits the map.

1. **The person's choices first.** Each card's lines of structure give it a parent. One parent each: when there are several, the first is taken, deterministically. A choice that would make a loop is skipped.
2. **Then containment read from meaning**, for cards with no chosen parent. It goes in rank order:
   1. `part_of`: the from-card sits inside the to-card;
   2. `is_a`;
   3. `applies_to`;
   4. `supports` / `justifies`;
   5. `depends`: "A depends on B" puts B under A.

   Each such row is marked **inferred**. It is drawn with a light dotted connector, and the outline says "from its connections". It is never written into the map.
3. **`mind.top`** keeps a card at the top level even when a line of meaning would place it inside another.
4. **Order.** Siblings follow `mind.order` when one is set; the rest come after, in their order on the map. Top-level cards with no order set are ordered by type: goal and objective, then question and decision, then claim, thesis and theorem, then category, then concept, then the rest.
5. **Folding** (`mind.folded`) hides a card's descendants. Finding a hidden card in Structure unfolds its ancestors.

**Loops are refused, with a reason.** `wouldCycle(map, child, parent)` walks the lines of structure. The `parent` edit refuses a loop and says why: *"“X” cannot sit inside “Y”: “Y” already sits inside it."*

**Moving a card in the tree.**
- `parent` replaces only that card's lines of structure. Its lines of meaning stay.
- `parent: null` puts the card at the top level (`mind.top`).
- The outline's keys: Tab moves a card inside the one above, Shift+Tab moves it out, Alt+↑/↓ reorders it.
- Each row has buttons for the same moves. The inspector's "Sits inside" list offers only parents that make no loop.

## 5. The three ways of working

| | Ideas | Logic | Structure |
|---|---|---|---|
| Layout | `ideasPlaces`: groups as soft hulls; cards where the person put them (`pos.i`) | `logicPlaces`: layered by what rests on what, ordered to reduce crossings; cards where the person put them (`pos.l`) | `structureRows`: a tree with an outline beside it |
| Moving a card | drag: the `place` edit, `mode: 'ideas'` | drag: `place`, `mode: 'logic'` | Tab, Shift+Tab, Alt+↑↓, the row buttons, or "Sits inside" |
| Adding | quick add; double-click marks where the card lands | quick add | quick add, inside the selected card |
| Connecting | drag from a card's handle to another card. This makes a confirmed `relates` line and opens it to be named. | as Ideas | through the tree |
| Focus | | one **Show** choice: all lines, tensions, support, assumptions, suggested (`logicFocus`) | fold and unfold |

What is kept:
- Each mode keeps its own pan and zoom. The view is fitted only the first time, or when the number of cards changes. So a card you moved is where you left it, on the map and on screen, after switching away and back.
- The mode itself is remembered per conversation in local storage (`socria.mindmap.mode.<conversation>`).
- On a phone or in a narrow pane (under 560px), the first fit keeps cards legible, at 70% or more. A map that does not fit at that size starts from its top left, ready to be moved about. **Fit** shows the whole map, however small.
- Other drawings of the map (flow, timeline, cycle, tree, parts, concept, matrix) are still offered under **Also drawn as**, inside **More** at the end of the tools row with **Copy the outline**. They open beside the canvas, with a way back.
- The bar stays quiet. The three ways of working and the add field are on the first row; the second holds only what the mode needs (the **Show** choice in Logic), the chat's work, the zoom and **More**. A mode's description is its tab's tooltip. The drag help shows while the map has three cards or fewer, and stays for screen readers after that, as do Structure's keys. On a phone the add field folds behind **+ Add** (the chatbox takes ideas too).

## 6. Inspecting a card, inspecting a line

**A card.** Click it, or select it from the outline. The inspector leads with what most people need:
- the title;
- what it means and why it matters;
- the detailed explanation, labelled as above, when there is one;
- Socria's interpretation, when there is one;
- **connections**: every line in or out, phrased from this card's side ("is supported by", "contains"), each with its why;
- their notes, and evidence from documents when there is some;
- **Ask Socria about this**;
- **Take off the map**. This asks for confirmation inline, not in a browser dialog.

**More details**, one step away, holds the rest: subtitle, kind and group, an explanation when there is none yet, where it sits in the structure, tags, assumptions, sources, your fields, tone and shape. What is filled in among them is named on the way in ("More details · tags, sources"). On a phone the inspector is a sheet that takes the room it needs above the chatbox.

Every field can be edited in place. Each change is one edit, so it can be undone.

**A line.** Clicking it answers "why are these connected?" The inspector shows:
- its kind (changeable) and its label;
- why it holds, and what bears it out;
- its status.

It offers:
- **Confirm**, which makes it the person's;
- **Ask Socria why**, which puts a question about this line into the composer;
- **Dismiss** for a suggestion, **Remove** for a line, and **Take out of the structure** for a line of hierarchy.

When the map holds no reason for a line, the inspector says so, whoever drew it:
- read from the conversation: *"it has no explanation stored. Ask why, or write the reason yourself."*
- suggested: *"Socria suggested this line without a reason stored. Ask why before you confirm it."*
- confirmed: *"No reason is written for this line yet."*

It never makes one up.

## 7. The edits (`lib/map-edit.ts`)

New edits:

| Edit | What it does |
|---|---|
| `{op:'mind', id, set}` | sets fields of `mind`. An empty value (`''`, `[]`, `false`, `null`) clears that field. |
| `{op:'place', id, mode, x, y}` | where the card was put in Ideas or Logic |
| `{op:'parent', id, parent \| null}` | where the card sits in the structure. Loops are refused with a reason. |
| `{op:'order', id, order}` / `{op:'fold', id, folded}` | the order among siblings; folded or not |
| `{op:'explain', from, to, was?, why?, evidence?, status?}` | why a line holds, what bears it out, and confirming it |

Changed edits:
- `link` takes `status` and `why`. Its duplicate check ignores lines of structure.
- `add` takes `mind`, and a `parent` that creates a line of structure.
- `unlink` takes `was` and `kind`.

Each edit says what it did in plain words ("Confirmed the line from …", "Explained the line …"). Those words appear in the map's history and undo.

## 8. The map pass cannot take away the person's work (`keepPlaced`)

When Socria redraws the map from the conversation, `keepPlaced` runs on the new map before it lands.
- **Cards the person made, placed or wrote on are kept.** That covers cards added by hand, findings, and cards with anything authored in `mind`. Their `mind` is carried to the matching card (matched by label), and they are put back if the pass dropped them.
- **Lines the person confirmed, and every line of structure, are kept.** When the pass renamed a card's id, the line's ends are remapped to the new id. A line's identity, why, evidence, status and label are carried to the pass's matching line. A dropped line is restored, within the map's line limit. The cards at the ends of these lines are kept too.

So a re-read of the conversation can add, refine or re-word, but it never deletes what the person built.

## 9. Navigation: the views sit where you put them

**One entry.** In the Everything view, the views are: Everything · **Mind Map** · Files · Artifacts · Words.
- The Mind Map entry replaces the separate Ideas entry and the Logic Map button.
- In a page view, the switch reads Conversation · Files · Artifacts · **Mind Map** (`VIEW_LABELS`).
- Practice and the other views are unchanged.

**Left by default, movable.**
- In the Everything view, the views form a rail on the **left**.
- **Move the views** (the ⇄ control) puts them on the left, along the top, or on the right.
- The choice is remembered (`socria.nav.side`) and shared by every open view.
- **The control stays in sight.** Along the top it is pinned to the end of the row, which scrolls sideways when it holds more than fits. In a rail it is pinned to the rail's foot.
- **Its choices float over the page** (`NavMover.tsx`, `menuPlace`). They sit under the button, or over it when the window has no room below, on the button's side of the window and always inside it. They are drawn into the app's root, so no row, rail or bar can clip them. (The row along the top used to clip them, so the menu could not be seen when the views were on top.)
- The keys reach the choices: the current one takes the focus, Escape gives the focus back to the button, and tabbing away closes them.

**The page header.** In a page view, the same choice moves the switch within the header:
- left: just after the conversation's name;
- top: in the middle;
- right: by the global controls.

The header measures itself. When the chosen place cannot hold the switch and at least 140px of the name, the switch sits in the middle, until the bar is as wide as that place needed. It never overflows the bar (tested at 1100px).

**Phones** keep the views in a row along the top. The choice applies on wider screens.

## 10. The most recent conversation

The conversation you touched last (`latestOf`, the newest `updatedAt`) has a small moss dot:
- in the list of conversations (`LogosRail`);
- in search's recent conversations (`MapFind`).

The dot is labelled "Your most recent conversation" for screen readers and on hover. Nothing else about the list changes.

## 11. Socria and the canvas

- **What is on screen reaches Socria.** While the Mind Map is open, the turn's note (`VisNote.on`, from `canvasLine`) lists up to 24 cards with their exact ids, within 900 characters. Socria can point at a card while it explains, with a marker on its own words: `[opportunity cost](vis:focus/node:oc)`. The note is clipped and cleaned like everything else from a browser (`sanitizeVisNote`). It is read as context, never as the person's words.
- **Asking to see a card.** "Highlight opportunity cost" is done on the canvas, before anything is sent: the card is lit, selected and brought into view. In Structure, its ancestors are unfolded. The visual bus does this (`readVisualAsk`, `sequence`, `select`), with the same rules as every other picture.
- **One selection.** A card selected by Socria, by a request or by the person is the same selection on the bus and in the canvas.
- **Asking about a card or a line** puts a question that names it into the composer. The person sends it.

## 12. Naming

The view is called **Mind Map** wherever a person meets it:
- the switch and the Everything rail;
- the board's map column and the Everything card's kicker;
- the beside pane's title, search results, Focus, and the slice under a reply;
- what Socria says when it opens the view;
- the guide's tabs, AR mode's confirmation, the voice commands' group, and the writing board's link control.

Some copy still says "Logic Map", deliberately, because tests pin it and it is outside this change:
- the share poster;
- the privacy panel;
- the workspace's surface names;
- Study's description;
- the plan and usage wording in `lib/entitlements.ts` and the usage-limit notice.

Renaming those is a separate product decision. Code identifiers (`logic_map`, `LENSES`) are unchanged, so saved layouts, deep links and preferences keep working.

## 13. Validation

- `test/mind-map.test.mjs`: 70 checks. It covers:
  - cleaning: limits, links, tags, positions, unknown fields;
  - every edit, including loop refusal with its reason and structural lines kept apart from lines of meaning;
  - the projection: explicit first, inferred by rank, `top`, order, folding, no loops on hostile input;
  - layouts that keep manual positions; connections phrased from each side;
  - `keepPlaced` keeping notes, confirmed lines, structure and positions through a redraw that renamed ids;
  - the canvas rendered in each mode with its inspectors, and its legible first fit on a phone;
  - the latest-conversation marker, the navigation default, the header's fallback, the naming, the note to Socria and the local highlight.
- The suites pinned to the old names were updated for the new ones: `logos5-views`, `logos5-space`, `ux-audit-55`, `logos5-one-view`, `logos6-ui`, `interactive-chat`.
- **In the real app** (a Playwright harness with Clerk stubbed and conversations mocked, 1440 × 900):
  1. the views on the left with the Mind Map entry;
  2. the canvas open in Ideas;
  3. a card added;
  4. a card opened, with its meaning and connections, and a note kept;
  5. a line opened, explained and confirmed, plus the Support filter;
  6. a card indented in the outline;
  7. a card moved, then the same place on the map and on screen after Logic and back;
  8. "Highlight opportunity cost." lighting the card without a request to the model;
  9. the views moved to the top and the right, and remembered;
  10. the saved map carrying the note, the confirmed line, the structure and the positions;
  11. the page header with the switch beside the name and the name in full, falling back to the middle at 1100px and returning at 1440px;
  12. the most recent conversation marked;
  13. a phone (390 × 844): the views along the top with no mover, the canvas drawn at 70% from its left edge, nothing wider than the screen, and a card opened as a sheet within the screen.

  There were no page errors.
- Typecheck, the full suite and the production build: see the commit that adds this file.

## 14. Limits and what is next

- The specification this was built from was cut off in its section 6 ("Clicking an edge should reveal why the connected…"). Lines open on a click and explain themselves from what the map holds. Anything the rest of that section asked for is not here.
- `mind.ai` has a home and a display, but no model writes it yet. The map pass still writes `detail` (labelled as Socria's reading) and lines read from the conversation. Generating interpretations and suggested lines with a confidence is the next step. The fields, the dashed drawing, Confirm and Dismiss are ready for it.
- Layouts are deterministic and in-house (layered with barycentre ordering, a tree, group hulls). They are tuned for maps of tens of cards. Very large maps have not been measured.
- Practice is unchanged. The other drawings remain under "Also drawn as". They read the same map but are not edited in place.
- One parent per card in the projection, by design. A card that belongs in two places keeps a line of meaning to the second.
