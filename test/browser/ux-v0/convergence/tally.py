"""test/browser/ux-v0/convergence/tally.py — the blind judgements, joined back to their conditions.

  python3 test/browser/ux-v0/convergence/tally.py <blind-dir> <key-file> [out.json]
"""
import json
import os
import sys
from collections import defaultdict

blind, keyfile, *rest = sys.argv[1:]
key = json.load(open(keyfile))
rows = []
for f in sorted(os.listdir(blind)):
    if f.startswith("judgements-") and f.endswith(".jsonl"):
        for line in open(os.path.join(blind, f)):
            line = line.strip()
            if line:
                j = json.loads(line)
                k = key.get(j["img"])
                if k:
                    rows.append({**j, **k, "condition": k["set"].split("-")[0]})
out = {}
for c in sorted(set(r["condition"] for r in rows)):
    rs = [r for r in rows if r["condition"] == c]
    motifs = defaultdict(int)
    for r in rs:
        for m in r.get("motifs", []):
            motifs[m] += 1
    mean = lambda k: round(sum(r[k] for r in rs) / len(rs), 2)
    out[c] = {"judged": len(rs), "adherence": mean("adherence"), "craft": mean("craft"), "distinctiveness": mean("distinctiveness"), "generic": mean("generic"), "motifs": dict(sorted(motifs.items(), key=lambda x: -x[1]))}
per_brief = defaultdict(dict)
for b in sorted(set(r["brief"] for r in rows)):
    for c in out:
        rs = [r for r in rows if r["brief"] == b and r["condition"] == c]
        if rs:
            per_brief[b][c] = {k: round(sum(r[k] for r in rs) / len(rs), 1) for k in ("adherence", "craft", "distinctiveness", "generic")}
result = {"conditions": out, "perBrief": per_brief, "notes": [{k: r[k] for k in ("set", "brief", "note")} for r in rows]}
print(json.dumps({"conditions": out, "perBrief": per_brief}, indent=1))
if rest:
    json.dump(result, open(rest[0], "w"), indent=1)
