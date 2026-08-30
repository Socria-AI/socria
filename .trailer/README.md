# Feature trailer — build

Storyboard artboards for a Socria Logos feature trailer, built from the REAL
product interface rather than mockups.

    node .trailer/export.mjs   # needs the app running on :3141
    node .trailer/build.mjs

`export.mjs` drives a browser over CDP, waits for each demo surface to settle,
and serializes its subtree together with only the CSS rules that actually match
it — so the map's node coordinates are the settled force-simulation output and
the Board's arrows are its own SVG. Fragments land in `frag/` (derived).

`build.mjs` seats each fragment on a paper frame with a beat number, headline
and one line of copy, and writes the `.dc.html` artboards plus `canvas.json`.

Fonts: the app self-hosts its four faces at paths a published canvas cannot
reach, so the artboards re-link the same families from Google Fonts — the one
host those canvases admit.
