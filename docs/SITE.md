# The public site

Three pages, from the claude.ai/design project "Human Enhancement landing
page" (screens `Socria Landing`, `Socria One` and `Socria Charter`, built on
the Socria design system, `SocriaDesignSystem_060a22`):

| Route | Page | What it is |
|---|---|---|
| `/` | `components/site/Landing.tsx` | "Come out sharper." Logos 5 framed on the cover, one sample conversation with the cards it drew in the margin, three demos that play once seen, the plans, the close. |
| `/one` | `components/site/One.tsx` | Socria One: the deep-blue cover, the position, the five things One holds, the join band. |
| `/charter` | `components/site/Charter.tsx` | The founding text, one column; the same document as a PDF at `/socria-charter.pdf`. |

`/logos` is where every "Start a conversation" points. It opens Logos
(`/chat?model=logos`, carrying any query string), so the site never has to
change when what that button opens does.

## How it is built

- **Components** come from the design system's port in `components/ds`
  (`bundle.ts`, machine-extracted from the design project's bundle;
  `index.ts`, the typed contract). The pages use `Logo`, `Button`,
  `LogosNode`, `SpreadHead` and `OneMark` from it — the same components the
  design renders, not lookalikes.
- **Styles** are one sheet, `components/site/site.css`, scoped under
  `.site-root` with an `s-` prefix on every class (Tailwind's utilities are
  global). The design's values are the design system's tokens, declared on
  the root: the canonical paper and ink, moss, the One blues. The Logos
  palette the map cards read comes from `.lg-tokens` in `app/globals.css`.
- **Server components** throughout. The only parts that run in the browser:
  the map's edges (`MapEdges.tsx`, measured from where the cards land), the
  three demos (`UseCase.tsx`), and the One button (`OneJoin.tsx`).
- **The product pictures are pictures.** The Logos 5 shell and the cards in
  the margin and the demos are `inert` — nothing to tab to, nothing that
  pretends to be a control — and the shell is one labelled figure.
- **Before anything runs** (on the server, with scripts off, or with reduced
  motion asked for) a demo is its final state. Only a browser that can play
  it sets it back to the start, and it plays when a third of it is in view.

## Where the design was departed from, and why

- **The One button checks out.** The design links "Become a member" back to
  the page; here the cover's and the join band's go through
  `/api/stripe/checkout` (surface `one-page`): signed out, to sign-in and
  back; already a member, into Logos. A member is shown "Open Logos", not
  sold One again. Socria One from a reward alone still sells, and says the
  reward's remaining days are saved. The masthead's button goes down to the
  join band, where the price sits beside the button.
- **The numbers are read, not written.** The price comes from
  `lib/socria-one`, the counts from `lib/entitlements` and
  `lib/share/roles`. The design's memory line said free "remembers the
  conversation"; free carries twelve things about you between
  conversations, so the ledger says that.
- **Every foot carries Privacy and Terms**, including the Charter's, which
  the design left with only the PDF link.
- **Phones.** The masthead's button steps down to the system's `sm` size; the
  product shell keeps the back pill, title and avatar; narrow demos show the
  two tabs they are about (Chat, Logic Map); the Charter's column is the
  screen less its margins, so the design's padding cannot push it past the
  edge.

## The Charter PDF

`public/socria-charter.pdf` is the design project's `uploads/charter.pdf`
(identical to `Socria Charter (2).pdf`), with its metadata changed and
nothing else: the title said "Socria Charter design development" and the
creator field carried the designer's browser string. The text is
byte-identical (checked with `pdftotext`), and the cross-reference table was
rewritten so every object's offset still lands on it.

## What went

The old homepage (the journal issue: `components/journal/*`,
`app/journal.css`), the old One pages (`app/one/OneIssue.tsx`,
`OneStory.tsx`, `one.css`), the Logos explainer (`app/logos/LogosIssue.tsx`,
`LogosStory.tsx`, `logos.css`) and the unused "quiet" chrome
(`components/quiet/*`, `app/quiet.css`). The design-system port moved from
`components/journal/ds*.ts` to `components/ds/`. `app/logos/LogosDemo.tsx`
stays: the docs mount it.

## Verified

Chromium at 1440×900 and 390×844: no horizontal scroll; the map's edges
drawn; the demos armed until seen, played, replayable; reduced motion shows
the final state with no Replay; "A conversation" lands below the masthead;
signed out, "Become a member" posts the `one-page` checkout and goes to
`/sign-in?redirect_url=%2Fone`. `test/seo.test.mjs` renders all three pages.
Not verified: Safari, Firefox, real phones, a signed-in member's view of
`/one` in the browser, and the Stripe checkout beyond the 401.
