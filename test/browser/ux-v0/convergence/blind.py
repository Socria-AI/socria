"""test/browser/ux-v0/convergence/blind.py — the pictures of every set, shuffled and renamed for a blind judge.

  python3 test/browser/ux-v0/convergence/blind.py <blind-dir> <key-file> before-s1=<dir> after-s1=<dir> ...

Copies each V-* picture to <blind-dir>/img-NN.png in a seeded shuffle (the judge sees no set, seed or condition) and
writes <blind-dir>/briefs.json (img → the brief text it answers, which the judge needs) and, elsewhere, <key-file>
(img → set and brief), read back only when the judgements are tallied.
"""
import json
import os
import random
import re
import shutil
import sys

blind, keyfile, *sets = sys.argv[1:]
here = os.path.dirname(os.path.abspath(__file__))
briefs = {b["id"]: b["brief"] for b in json.load(open(os.path.join(here, "briefs.json")))}
items = []
for s in sets:
    label, d = s.split("=", 1)
    for f in sorted(os.listdir(d)):
        m = re.match(r"^(V-[a-z]+)-[a-z0-9]+\.png$", f)
        if m:
            items.append({"set": label, "brief": m.group(1), "file": os.path.join(d, f)})
random.Random(20261128).shuffle(items)
os.makedirs(blind, exist_ok=True)
key, shown = {}, {}
for i, it in enumerate(items, 1):
    name = f"img-{i:02d}.png"
    shutil.copyfile(it["file"], os.path.join(blind, name))
    key[name] = {"set": it["set"], "brief": it["brief"]}
    shown[name] = briefs[it["brief"]]
json.dump(shown, open(os.path.join(blind, "briefs.json"), "w"), indent=1)
json.dump(key, open(keyfile, "w"), indent=1)
# three judges, each seeing every version of its briefs (so its ratings compare like with like), in shuffled order
groups = [["V-architecture", "V-brutalist", "V-children", "V-electronic"], ["V-fashion", "V-fintech", "V-hospitality"], ["V-law", "V-literary", "V-science"]]
for i, g in enumerate(groups, 1):
    names = [n for n, k in key.items() if k["brief"] in g]
    open(os.path.join(blind, f"judge-{i}.txt"), "w").write("\n".join(names) + "\n")
print(f"{len(items)} pictures in {blind}; judges: " + ", ".join(f"{i}: {sum(1 for k in key.values() if k['brief'] in g)}" for i, g in enumerate(groups, 1)))
