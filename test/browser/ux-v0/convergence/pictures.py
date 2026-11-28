"""test/browser/ux-v0/convergence/pictures.py — what a set of first designs look like, measured from their pictures.

For each design-bench output folder given (label=folder), the picture of each V-* design (as drawn after its look pass)
is measured:
  - its ground: the most common colour, classed as light warm neutral (cream, bone, paper), light cool or white,
    dark, or coloured (a saturated field)
  - its colourfulness (Hasler and Suesstrunk) and mean lightness
  - layout similarity: every picture reduced to a 24 x 32 grey field; the mean correlation between designs for
    DIFFERENT briefs in a condition says how alike unrelated work looks (lower is more distinct); between the two
    seeds of the same brief, how settled one brief's answer is
Writes <out>/pictures.json and contact sheets <out>/sheet-<a>-<b>.jpg (each brief in a row: every set side by side).

  python3 test/browser/ux-v0/convergence/pictures.py <out-dir> before-s1=<dir> before-s2=<dir> after-s1=<dir> ...
"""
import json
import os
import re
import sys
from itertools import combinations

import numpy as np
from PIL import Image, ImageDraw, ImageFont

out, *sets = sys.argv[1:]
rows = []
for s in sets:
    label, d = s.split("=", 1)
    for f in sorted(os.listdir(d)):
        m = re.match(r"^(V-[a-z]+)-[a-z0-9]+\.png$", f)
        if not m:
            continue
        rows.append({"set": label, "condition": label.split("-")[0], "brief": m.group(1), "file": os.path.join(d, f)})


def ground_of(im):
    small = np.asarray(im.convert("RGB").resize((96, 128)), dtype=np.int32)
    q = (small // 16) * 16 + 8
    flat = q.reshape(-1, 3)
    vals, counts = np.unique(flat, axis=0, return_counts=True)
    g = vals[counts.argmax()]
    share = counts.max() / flat.shape[0]
    return [int(x) for x in g], float(share)


def class_of(rgb):
    r, g, b = [x / 255 for x in rgb]
    mx, mn = max(r, g, b), min(r, g, b)
    light = (mx + mn) / 2
    sat = 0 if mx == 0 else (mx - mn) / mx  # HSV saturation: steady near white, unlike HSL's
    if light >= 0.75 and sat <= 0.2:
        return "light warm neutral" if r >= b + 0.02 else "light cool / white"
    if light <= 0.22:
        return "dark"
    if sat <= 0.15:
        return "mid neutral"
    return "coloured"


def colourfulness(im):
    a = np.asarray(im.convert("RGB").resize((192, 256)), dtype=np.float64)
    rg = a[..., 0] - a[..., 1]
    yb = 0.5 * (a[..., 0] + a[..., 1]) - a[..., 2]
    return float(np.sqrt(rg.std() ** 2 + yb.std() ** 2) + 0.3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2))


def field(im):
    g = np.asarray(im.convert("L").resize((24, 32)), dtype=np.float64).ravel()
    sd = g.std()
    return (g - g.mean()) / (sd if sd > 1e-6 else 1)


for r in rows:
    im = Image.open(r["file"])
    gr, share = ground_of(im)
    r["ground"] = "#%02x%02x%02x" % tuple(gr)
    r["groundShare"] = round(share, 2)
    r["groundClass"] = class_of(gr)
    r["colourfulness"] = round(colourfulness(im), 1)
    r["lightness"] = round(float(np.asarray(im.convert("L"), dtype=np.float64).mean() / 255), 2)
    r["_f"] = field(im)

summary = {}
for c in sorted(set(r["condition"] for r in rows)):
    rs = [r for r in rows if r["condition"] == c]
    cross = [float(np.dot(a["_f"], b["_f"]) / len(a["_f"])) for a, b in combinations(rs, 2) if a["brief"] != b["brief"]]
    same = [float(np.dot(a["_f"], b["_f"]) / len(a["_f"])) for a, b in combinations(rs, 2) if a["brief"] == b["brief"]]
    classes = {}
    for r in rs:
        classes[r["groundClass"]] = classes.get(r["groundClass"], 0) + 1
    summary[c] = {
        "pictures": len(rs),
        "groundClasses": classes,
        "meanColourfulness": round(float(np.mean([r["colourfulness"] for r in rs])), 1),
        "meanLightness": round(float(np.mean([r["lightness"] for r in rs])), 2),
        "layoutSimilarityAcrossBriefs": round(float(np.mean(cross)), 3) if cross else None,
        "layoutSimilaritySameBrief": round(float(np.mean(same)), 3) if same else None,
    }

for r in rows:
    del r["_f"]
json.dump({"summary": summary, "pictures": rows}, open(os.path.join(out, "pictures.json"), "w"), indent=1)
print(json.dumps(summary, indent=1))
for r in rows:
    print(f'{r["set"]:10} {r["brief"]:16} ground {r["ground"]} ({r["groundClass"]}, {int(r["groundShare"]*100)}%)  colourful {r["colourfulness"]}')

# contact sheets: each brief a row, every set side by side, five briefs a sheet
labels = [s.split("=", 1)[0] for s in sets]
briefs = sorted(set(r["brief"] for r in rows))
W, H, PAD, HEAD = 300, 390, 14, 26
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
except OSError:
    font = ImageFont.load_default()
for i in range(0, len(briefs), 5):
    chunk = briefs[i : i + 5]
    sheet = Image.new("RGB", (PAD + len(labels) * (W + PAD), HEAD + len(chunk) * (H + PAD + HEAD)), (236, 236, 236))
    d = ImageDraw.Draw(sheet)
    for j, lab in enumerate(labels):
        d.text((PAD + j * (W + PAD), 4), lab, fill=(20, 20, 20), font=font)
    for k, b in enumerate(chunk):
        y = HEAD + k * (H + PAD + HEAD)
        d.text((PAD, y + 4), b, fill=(20, 20, 20), font=font)
        for j, lab in enumerate(labels):
            r = next((x for x in rows if x["brief"] == b and x["set"] == lab), None)
            if not r:
                continue
            im = Image.open(r["file"]).convert("RGB")
            im.thumbnail((W, H))
            sheet.paste(im, (PAD + j * (W + PAD) + (W - im.width) // 2, y + HEAD + (H - im.height) // 2))
    sheet.save(os.path.join(out, f"sheet-{i // 5 + 1}.jpg"), quality=86)
print("sheets:", [f"sheet-{i // 5 + 1}.jpg" for i in range(0, len(briefs), 5)])
