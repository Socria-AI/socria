# Project Home

Pressing a Project's name in the rail (Core or Logos) opens its home in the
main pane. The chevron beside the name still only folds the folder, and the
Project's chats stay in the rail, one click away. `?p=<id>` opens a home
directly and survives a reload. Opening any chat, or starting one, closes the
home.

Project Home **organises what is already there**; it replaces nothing.

## What is on it

| Section | Read from | What it will not do |
|---|---|---|
| Header | name, description, mark (glyph and colour) | Accept a mark outside the fixed lists (`cleanIcon`, `cleanColor`) |
| Overview | the Project's own content (`overview`) | Call something a theme unless it recurs across conversations (otherwise the label reads "Mostly about"). Quote Socria's suggestions as the person's ideas. List questions the map marks resolved |
| Continue | the most recent conversation, or one just before it that still holds open questions | — |
| The project, drawn | the Project's atlas (`lib/project-visual.ts`), see below | Show progress the person did not mark. Only goals marked done (`historical`) appear done |
| Conversations | all of them, grouped (this week, earlier this month, then by month) | The first eight show; "Show all" shows the rest. Rename is inline |
| Resources | Logos workspaces, models, plots, Draft Space notes, files | — |
| Synthesize | `POST /api/projects/[id]/synthesize` | Write to memory or to any conversation. It is labelled as a reading |

**Synthesize** reports what is established, what is still open, what pulls
against what, and what could be stronger.

- The model is given only the Project's own structure (`synthesisDigest`).
- Its answer is held to conversations that exist in the Project
  (`sanitizeSynthesis`).
- With no model, or a failed one, the structural reading is shown instead
  (`synthesizeFromStructure`).

**Layout.**

- Every section folds, and the folding is remembered per Project.
- The chosen visual is remembered too (`socria.projecthome.v1:<id>`).
- Phones get one column.

## The adaptive visual

`chooseVisual` reads three signals: what the maps were *building*
(`lib/representation.ts`), what kind of thinking they held, and their node
types. It offers every view the content supports, best first. The person can
always switch.

| View | Drawn when | What it shows |
|---|---|---|
| Idea map | always available | the Project in the middle, its conversations around it, and their ideas outside. A shared idea sits between the conversations that share it |
| Concept map | learning, mathematics, systems | the same, narrowed to concepts and questions |
| Evidence | research, argument | claims on the left and evidence on the right. Support and conflict are drawn differently |
| Roadmap | processes, plans, goals | the person's goals, then each conversation in the order it began, with its steps and constraints |
| Timeline | four or more conversations over more than two weeks | conversations in time, with arcs for what one carried into the next |
| Models | models and plots | every model, plot and object of thought, and the conversation it is in |

"Open in Logos" opens the Project's latest Logos session, or starts a new one
filed in the Project (`/chat?in=<project>`).

## Who sees what

Every read goes through `lib/project-access.ts`, which checks ownership first
and then sharing.

- **The owner** sees the Project as their memory holds it, minus private
  memories (`projectGraph(…, personal = true)`).
- **A collaborator** sees the Project's own content: its conversations, maps,
  plots, models and goals. They do not see anything Socria learned about the
  owner, or the owner's instructions to Socria
  (`projectGraph(…, personal = false)`).
- What a collaborator may do follows their role (`lib/share/roles.ts`). A
  viewer cannot rename, start conversations or change the mark.

Tests: `test/project-home.test.mjs`.
