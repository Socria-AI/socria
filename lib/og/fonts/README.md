These are the faces the link-preview cards (`app/og/[...key]/route.tsx`) are
set in. They are the same fonts as `app/fonts/`, converted from WOFF2 to TTF —
the card renderer reads TTF, OTF and WOFF but not WOFF2 — and cut down to Latin
text and punctuation, so each card loads about 40 KB of type rather than the
whole family.

- Instrument Serif, regular and italic — © 2022 The Instrument Serif Project
  Authors, SIL Open Font License 1.1.
- Inter, static 400 and 600 instances of the variable font — © 2016 The Inter
  Project Authors, SIL Open Font License 1.1.

To regenerate after the source fonts change, convert `app/fonts/*.woff2` with
fontTools (`pip install fonttools brotli`): subset to U+0020–007E, U+00A0–00FF,
U+2010–2027, U+2030–203A, U+20AC, U+2122, U+2190–2193, and for Inter pin
`wght` to 400 and 600 with `fontTools.varLib.instancer` first.
