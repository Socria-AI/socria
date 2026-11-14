# The engagement evaluation

Twelve scripted conversations for the allocation's engagement reading (`lib/runtime/engagement.ts`, [docs/LOGOS-ENGAGEMENT.md](../../docs/LOGOS-ENGAGEMENT.md)), run through the real reply route with the reading off and on.

It answers three questions, and is careful about which it can answer:

| Question | Answered here? |
|---|---|
| Does the reading decide what the design says it should, on each kind of turn? | Yes, in code (`test/engagement.test.mjs`) and through the route (`run.mjs`). |
| What does it change in what the reply model is told, and what does it cost? | Yes, measured through the route. |
| Are the replies better for it? | **Not without a model and readers.** `run.mjs --live` produces the pairs; `rubric.md` is how they are read. Nothing here has been read by a person yet. |
| Do people take part more willingly, and is that good for them? | **No.** That needs real conversations. See "In production" below. |

## The scenarios

`scenarios.mjs` holds twelve conversations, one for each case in the brief, 45 turns in all:

| | Scenario | What is wanted |
|---|---|---|
| S01 | An absurd question, asked for fun | A real answer, enjoyed. Not a dry fact, and not a lesson. |
| S02 | A casual conversation about an everyday thing | Interest in what they said, in proportion. A clean end when they go. (Its opening turn is left as it is today, on purpose: see the document, §3.3.) |
| S03 | Good news, shared | Gladness about the thing itself, and the one question a friend would ask. |
| S04 | Venting | To be heard. Said in so many words: room, and nothing asked. |
| S05 | An idea, explored | Their idea taken up and pushed on; a back-and-forth once there is one. |
| S06 | Learning a difficult concept | The explanation engine plans the question. This reading adds nothing to it. |
| S07 | Brainstorming a startup | Ideas, generously, and the choosing handed back. |
| S08 | A direct factual question | The answer. Nothing after it. |
| S09 | Socria's question, let pass | Not repeated; nothing else asked that turn. Two in a row, and questions wait. |
| S10 | Socria's reasoning, challenged | The objection engaged on its merits, first. |
| S11 | Wanting to conclude | One line back, in kind. No question, no offer, nothing new. |
| S12 | A long conversation whose intentions change | Each of ten turns met as what it is. |

Each turn says what the person writes, what the reading should decide (`expect`), and the reply that followed, which becomes history for the next turn. **The replies are scripted by us.** They exist so the next turn has something to answer, let pass or close on. They are not evidence of what a model would write.

Some turns also carry `tempt`: a reply written the way a habit writes it, with a closing question where none is wanted. The runner sends it through the real stream gate in both arms to show what would reach the person.

## The stand-aside corpus

`stand-aside.mjs` is the other half, and the more important one. The scenarios show the reading doing what it should. The corpus holds 178 messages, and 10 answers, on which it must do **nothing**: mentions of leaving that are not goodbyes, requests that end on a polite "Thanks", needs and emergencies stated as sentences, and statements of loss, harm and fear. They were written by an independent adversarial pass that the first version of the reading failed (the document, §8.2).

`test/engagement.test.mjs` holds the rule down: on none of them is the turn closed, the question budget lowered, or a line added that plays or pushes. When a new misread is found, add the message to the corpus. Never remove one.

## Running it

```
node evals/engagement/run.mjs                      # offline: no key, no network
OPENAI_API_KEY=… node evals/engagement/run.mjs --live [--repeat 3] [--only S03]
```

Both write `results.json` and `report.md` to `evals/engagement/runs/<mode>-<time>/` (ignored by git). The offline run exits non-zero if any turn is read differently from its `expect`, if the reading ever raises the question budget, or if the off arm shows any trace of the reading.

### Offline

The model is a recorder that streams a scripted reply. What is measured is what the product does, which code decides:

- the reading on every turn (strategy, invitation, continuation, the line), taken from the route's own trace;
- the turn's instructions in both arms, and exactly what was added;
- the question budget before and after (the reading may close it and must never open it);
- what reaches the person when a reply is written by habit, through the real gate;
- cost: model calls per turn, characters added to the prompt, the route's own time.

The last recorded run is kept in [`results/offline-2026-11-14.md`](results/offline-2026-11-14.md).

### Live

The same turns with the real model, both arms, the history held identical (the scripted replies) so only the reply under test differs. It writes `blind-packet.json` (each pair as A and B, in an order drawn at random per pair) and `blind-key.json` (which arm each was). Read the packet against `rubric.md` before opening the key.

- A live model is sampled. Use `--repeat 3` or more before reading anything into a difference on one turn.
- No judge model is run. A model grading replies for "engagement" tends to reward exactly the things this work avoids: questions, enthusiasm, length.
- Without `OPENAI_API_KEY` the live run says so and produces nothing.

## In production

Scripted conversations cannot show whether people want to answer. Real ones can, without reading anyone's words. With `LOGOS_ENGAGEMENT=shadow` or `on`, every reply logs one content-free line:

```
[engage] build/subtle/deepen,cue:built,uptake:took,cap:1,own:1,follow:0,why:took,ended:statement,mode:on
```

`uptake` is what the person did with the question Socria's previous reply ended on (`took`, `brief`, `unsure`, `declined`, `passed`, `closed`, or `unasked`). `own` and `follow` say whether this message brought something of their own or asked about what Socria had just said. `ended` is how this reply ended. So what a reply drew is read from the next turn's line.

`shadow` makes the reading and logs it while changing nothing, so a deployment can record a baseline first. [docs/LOGOS-ENGAGEMENT.md §9](../../docs/LOGOS-ENGAGEMENT.md) gives the measures, what would count as better or worse, and what must not be counted at all (messages per conversation, time spent).
