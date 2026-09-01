"""Generate Socria's favicon set from the black logo mark.

Two renderings, because one does not survive the whole size range.

The mark is six hand-drawn lines converging on a point above a square seen in
perspective. Downscaled honestly to 16px those lines fall between pixels and
average into a grey triangle — the detail does not soften, it takes the
silhouette with it. So the smallest icon is DRAWN: the outer converging pair,
the base, and the point they aim at. From 32px up the real logo resolves and
is used as-is.

The plate is Socria's paper rather than transparency. A black mark on
transparency vanishes into a dark tab bar, and the mark is meant to be black.
"""
import io, struct
from PIL import Image, ImageDraw, ImageFilter

SRC = 'public/socria-logo.png'
PAPER = (245, 243, 235)
INK = (17, 17, 17)

_im = Image.open(SRC).convert('RGBA')
_box = _im.split()[3].getbbox()
_ink = _im.crop(_box)
_w, _h = _ink.size
_side = max(_w, _h)
_sq = Image.new('RGBA', (_side, _side), (0, 0, 0, 0))
_sq.paste(_ink, ((_side - _w) // 2, (_side - _h) // 2), _ink)
_pad = int(_side * 0.13)
CANVAS = Image.new('RGBA', (_side + _pad * 2, _side + _pad * 2), (0, 0, 0, 0))
CANVAS.paste(_sq, (_pad, _pad), _sq)


def photographic(size, thicken=0):
    """The real logo, flattened onto paper."""
    src = CANVAS
    if thicken:
        alpha = src.split()[3].filter(ImageFilter.MaxFilter(thicken))
        src = Image.merge('RGBA', (*src.split()[:3], alpha))
    small = src.resize((size, size), Image.LANCZOS)
    plate = Image.new('RGBA', (size, size), (*PAPER, 255))
    plate.alpha_composite(small)
    return plate.convert('RGB')


def drawn(size, ss=8):
    """The mark reduced to what survives at the smallest sizes."""
    S = size * ss
    im = Image.new('RGB', (S, S), PAPER)
    d = ImageDraw.Draw(im)
    w = max(ss, int(S * 0.055))
    P = lambda x, y: (x * S, y * S)
    L, T, R, B = P(0.07, 0.74), P(0.5, 0.655), P(0.93, 0.74), P(0.5, 0.825)
    d.line([L, T, R, B, L], fill=INK, width=w, joint='curve')
    d.line([L, P(0.455, 0.20)], fill=INK, width=w)
    d.line([R, P(0.545, 0.20)], fill=INK, width=w)
    r = S * 0.055
    cx, cy = P(0.5, 0.115)
    d.ellipse([cx - r, cy - r * 0.82, cx + r, cy + r * 0.82], outline=INK, width=w)
    return im.resize((size, size), Image.LANCZOS)


# 16 is drawn; everything above it resolves from the real mark.
FRAMES = [(16, drawn(16)), (32, photographic(32, 9)),
          (48, photographic(48, 7)), (64, photographic(64, 5))]

# Written by hand: PIL's ICO writer takes one image and downscales it to every
# requested size, which would throw away the per-size work that is the entire
# reason for shipping an .ico.
pngs = []
for _, img in FRAMES:
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    pngs.append(buf.getvalue())

out = bytearray(struct.pack('<HHH', 0, 1, len(pngs)))
offset = 6 + 16 * len(pngs)
for (s, _), data in zip(FRAMES, pngs):
    out += struct.pack('<BBBBHHII', s, s, 0, 0, 1, 32, len(data), offset)
    offset += len(data)
for data in pngs:
    out += data
open('app/favicon.ico', 'wb').write(bytes(out))

photographic(512).save('app/icon.png')
photographic(180).save('app/apple-icon.png')
print('app/favicon.ico  16(drawn) 32 48 64')
print('app/icon.png 512  ·  app/apple-icon.png 180')
