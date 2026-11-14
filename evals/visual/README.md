# Visual explanations against text only

`scenarios.mjs` holds thirteen cases from the visual-explanation brief:

- a limit that is not the value;
- a derivative;
- Riemann sums;
- a tax on a market;
- a monopoly;
- forces on a box;
- binary search;
- a stack;
- causes;
- an expert asking in notation;
- a fact;
- small talk;
- an invalid picture.

`run.mjs` sends each through the real reply route twice: text only (`LOGOS_INLINE=off`: no element offered, any written dropped) and visual (on).

```
node evals/visual/run.mjs                        # offline: no key, no network
OPENAI_API_KEY=… node evals/visual/run.mjs --live [--repeat 3]
```

**Offline,** the model is a recorder that streams our scripted reply. It measures:

- which representation Socria chooses;
- whether a valid picture reaches the person intact through the stream gate in the visual arm, and never in the text arm;
- that an invalid picture is refused and its prose stands alone;
- the cost: model calls (none added), prompt characters, and the route's time.

The last recorded run is in [`results/offline-2026-11-14.md`](results/offline-2026-11-14.md).

**Live,** the real model answers both arms. The pairs are saved blind (`blind-packet.json`, with the key in `blind-key.json`) for people to read with the rubric in `evals/engagement/rubric.md`, adapted: which reply would you rather have learned from, and is anything in either wrong. Nobody has read any yet.

Neither run shows that anyone understands more. That needs readers, then real use.
