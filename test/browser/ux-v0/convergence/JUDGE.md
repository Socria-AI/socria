# Blind judging of the convergence benchmark

The pictures are copied by `blind.py` into one folder as `img-NN.png`, shuffled with a fixed seed; the judge sees no
condition, set or seed, only each picture and the brief it answers (`briefs.json`). The key stays outside that folder.

For each picture the judge writes one line of JSON to `judgements.jsonl`:

```json
{"img": "img-07.png",
 "adherence": 1-5,      // does it answer this brief: the subject, the words given, the register asked for
 "craft": 1-5,          // hierarchy, spacing, type set well, nothing cut off or colliding, finish
 "distinctiveness": 1-5,// could this only be for this brief? 1 = could be any client's, 5 = unmistakably this one
 "generic": 1-5,        // how much it looks like generic generated design: 1 = not at all, 5 = entirely
 "motifs": ["…"],       // which of these it shows: cream-ground, dark-premium-ground, refined-serif-display,
                        // tracked-small-caps-labels, hairline-rules, foot-details-strip, corner-label-pair,
                        // arch-or-semicircle, sun-or-circle-disc, concentric-rings, literal-subject-icon, centred-stack
 "note": "one sentence"}
```

Every rating is about the picture as a piece of graphic design for its brief. Restraint is not penalised where the
brief asks for it; novelty is not rewarded for itself.
