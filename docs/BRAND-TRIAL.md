# The Socria brandbook, on trial in SocriaUX

**Brandbook:** Version 2, November 2026 (it replaced Version 1, whose voice was Old Standard TT). **Applied to:** `/ux` and `/ux-v0` only. Every other page keeps the Logos system.

The point is to try the new system on two real products before deciding whether it replaces the Logos system everywhere.

## Where it lives

| Piece | File |
|---|---|
| The brand as code: tokens, pills, segmented tabs, surfaces, kind glyphs, type roles, motion and the floating shadow, all scoped under `.sb` | `components/brand/socria-brand.css` |
| Cormorant Garamond Medium and medium italic (Socria's voice) and Geist (the person, the interface, the record), self-hosted with their OFL licences and not preloaded | `app/fonts/`, registered in `app/layout.tsx` as `--font-cormorant` and `--font-geist` |
| `/ux-v0`: Logos classes replaced by brand classes (`sb-btn`, `sb-link`, `sb-seg`, `sb-label`, `sb-compose`, `sb-card`, `sb-glyph`) | `components/ux-v0/*` |
| `/ux`: its `--ux-*` tokens point at brand values, plus a brand pass at the end of its sheet | `components/ux/ux.css` |
| The `/ux-v0` home: an entrance and the collection, drawn as a design museum's archive (below) | `components/ux-v0/Home.tsx`, `components/ux-v0/home.css` |

## What the brandbook asked, and how it was applied

- **Colour, one job each.** Paper is the ground and ink every word. Deep moss #354620 is moss text and the one filled control; moss #5E7633 is fills and glyphs. Apricot is the question waiting on you, the one solid surface. Lake is evidence, burgundy is what Socria adds and what is wrong, and cobalt, plum and ochre are accents. Every text pairing used reads at 4.5:1 or better.
- **Two faces.** Socria's questions, headlines and readings' verdicts are in Cormorant Garamond Medium (500, never bold), with italic for the one word a sentence turns on; everything operated, and everything you write, is in Geist (your words at 500). Cormorant is small for its size, so it is never set below 20px: smaller text that was in the voice (evidence quotes, small card titles) is Geist. Labels are Geist 600 at 13px in sentence case: the brandbook asks for no capitals.
- **Looking new.**
  - Cards are white surfaces, not outlines; anything you kept takes the moss tint.
  - Every control is a pill; words still act inside cards (*Keep*, *Replace*, *Dismiss*).
  - Tabs are segmented, and the chosen one sits on paper.
  - Only what floats casts a shadow: the question card, the composer, the card in hand, popovers, and the design on its canvas.
  - There is no grain, gradient or glow anywhere.
- **Kinds.** The question card carries the apricot arch, objections in a critique carry the cobalt diamond, and the circle, quarter and square are in the brand layer for the kinds that need them.

## The `/ux-v0` home

The home is drawn as a design museum's archive rather than a dashboard, inside the brandbook: "new comes from space, scale and softness".

- **One grid.** Twelve columns run from the masthead to the colophon; strong ink rules open each part and hairlines divide within it.
- **Scale.** The question is very large in Cormorant ("What do you want to *make*?"), against small archival labels in Geist. It stands beside Fig. 1, the brandbook's apricot arch, the shape of the question.
- **Two doors.** The question opens a created work. Below it, a quieter band takes a design to critique, chosen or dropped.
- **The chronology.** A strip of the five steps a created work goes through.
- **The collection.** The works hang as exhibits in an uneven rhythm: the latest featured across the wall, then 5|7, 4|4|4, 7|5. Each exhibit has a plate and a wall label.
  - **The plate** is a live miniature of the design itself: the same renderer, sealed in a frame with no scripts, loaded only near the screen.
  - **The wall label** gives a number in the collection (the order works were begun), the kind, the state and the dates.
  - **The index view** lists the same works as a catalogue.
  - **Finding works.** Search (title or idea), kind and order; the view and the order are remembered.
  - **Deleting** is still asked in place, with "Keep it" focused.
- **Motion.** Exhibits settle in at 320ms. A plate lifts and its title is underlined on hover. Opening or leaving a work is a short cross-fade (view transitions, where the browser has them). None of it runs for a visitor who asks for less motion.
- **The editor is unchanged.** It stays a clean working surface.

## Where it bends, and why

- Geist is used up to weight 600. The brandbook allows 700, but the house rule (`test/ux-consistency.test.mjs`) caps weights at 600, and none of the brandbook's app sizes needs 700.
- Moss #5E7633 lives only in a token named `--sb-moss-tone`, because the house test allows that green only under a tone name. That matches the brandbook: moss text is deep moss.
- The designs SocriaUX generates are the designer's, not Socria's, so they are not drawn in the brand.

## To adopt it everywhere

Grow `components/brand/socria-brand.css` into the house system, move `.sb`'s tokens to the root, and retire `components/logos5/l5-controls.css` component by component. The house tests in `test/ux-consistency.test.mjs` would then describe the brandbook instead of Logos 5.
