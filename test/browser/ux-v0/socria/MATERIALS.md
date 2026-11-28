# Socria — the real materials in this repository

What the Socria benchmark (test/browser/ux-v0/socria) may use. Everything here is in the repository, with its source;
nothing else about the company may be assumed. Gathered 28 November 2026.

## Brand assets
- `public/socria-logo.png` (1080×1080): the Socria mark, black on white — "six hand-drawn lines converging on a point
  above a square seen in perspective" (`scripts/make-icons.py:5-6`).
- `public/socria-mark.png` (961×896): the same mark cropped tight, ink #1F1F1F; used in the masthead lock-up.
- `app/icon.png` (512), `app/apple-icon.png` (180), `app/favicon.ico`: the mark on paper #F5F3EB.
- `public/socria-one-mark.png` (1280×1280): "The seal" — an italic serif "I" in prussian #26485A inside two rings (Socria One).
- `public/logos-mark.png` (1080×1080, moss #354620) and `components/LogosMark.tsx` (the same drawing as SVG): a filled
  circle, a solid line to an open circle, a dashed line to a dashed circle.
- `public/socria-charter.pdf`: "The Socria Charter", two pages.
- No SVG Socria logo and no wordmark image: the wordmark is live text ("Socria" in the serif beside the mark;
  SocriaUX's is `Socria<em>UX</em>`).
- Fonts in `app/fonts`: Instrument Serif and Inter (the whole app), Cormorant Garamond 500 and Geist (SocriaUX), Kalam,
  STIX Two Text.

## Colours and rules
- `app/globals.css:8-65`: paper #F5F3EB, ink #1F1F1F, moss #354620 ("the one moss"), moss-tone #5e7633, sage #9CB874,
  forest #2c3b18, gold #b8a26b, tension #9C5B3C, prussian #26485A.
- `components/site/site.css:35-36`: paper #f4f1e8, ink #20201b.
- `components/brand/socria-brand.css:1-22` ("Brand Book Edition No. 1"): "moss is the brand"; moss #5e7633, paper
  #f5f3eb ("never pure white"), ink #20201b, Moss 700 #465a26; rust #9c5b3c friction, prussian research, forest
  #1a2410, gold "a single ornament"; "Instrument Serif, weight 400 only, for anything said… Inter for anything
  operated"; "Sentence case; headlines end with a full stop"; kind glyphs (circle idea, arch question, quarter file,
  diamond objection, square made); motion: "nothing bounces".
- `docs/BRAND-TRIAL.md` ("Brandbook: Version 2, November 2026"): Cormorant and Geist, apricot, lake, burgundy, cobalt.
- `.design-sync/conventions.md:3`: "Socria is a thinking environment, not a dashboard."

## Company
- Mission: "Socria exists to build artificial intelligence for one purpose: human enhancement."
  (`components/site/Charter.tsx:13`). "The machines work for us. Not the other way around." (`:40`).
  "[Good AI] leaves the person using it more capable, never more dependent." (`:20`)
- Tagline: "Think for Yourself" (`lib/seo.ts:31`). "Socria is a Human-First AI that asks before it answers." (`:43`)
- "an AI thinking environment that strengthens your reasoning instead of doing it for you" (`lib/seo.ts:338`).
- Philosophy: "the thinking should stay yours"; "Human-First AI" (`app/docs/content/overview.tsx:25-33`); protected
  principles: Authorship, The Answer Guard, Transparency, Nothing held hostage (`:86-112`).
- "a Human-First AI company being built in the open at UT Arlington" (`supabase/schema.sql:1275`).
- Contact: hellosocria@gmail.com; socria.app; LinkedIn /company/socria; Instagram and TikTok @socriaai.
- Team (one public credit line): Pradeep Muraliram (founder), Madison Carby (creative & brand), Yara Al-Laham
  (growth & analytics), Alex Tran (product manager) (`app/transfer/ut-austin-fall-2026/TransferExplorer.tsx:654-655`).
- Event: "Socria: In Public 002" at CETD; free; date not confirmed (`lib/newsletter-issues.ts:43-52`).

## Products
- **Socria / Logos 5**: "Socria is one model, Logos 5, at socria.app/chat". "a conversation that asks as well as
  answers, the Logic Map beside it, models it can compute and documents it reads" (`lib/seo.ts:339`). Views:
  Conversation, Files, Artifacts, Logic Map. Homepage capabilities (`components/site/Landing.tsx:92-129`): "Asks before
  it answers", "Your reasoning, on a map", "Pictures you can move", "One conversation, one objective", "Citations that
  point at something real", "Practice from your own material".
- **Socria One**: $15/month; "Socria, without a daily limit — same models, same map." (`lib/socria-one.ts`).
- **SocriaUX**: "A design workspace with a reasoning system beside it." (`docs/SOCRIAUX.md:3`); "for designers who want
  to get better, not just faster." (`lib/og-cards.ts:62`).
- **New Logos**: "an internal development identifier. It is not a product name" (`docs/NEW-LOGOS.md:3-4`).
- **Stratus**: no file, no commit, no mention anywhere. Not supplied.

## Copy
- "Come out sharper." / "It still answers, but it asks first, so the next one needs less help than this one." /
  "A thinking environment, not an answer machine." / "Anything you bring, you leave better at." / "The next one will
  need less help." (`components/site/Landing.tsx:325-471`)
- "Most AI is built to think for you. Socria is built to make you think better." (`docs/LAUNCH.md`)
- "Think out loud, and watch the shape of your reasoning appear beside you." / "The thinking stays yours."
  (`.trailer/build.mjs:124-160`)
- Audience: students ("Study with an AI that makes you think") and not only students ("essays and problem sets, but
  also proposals, decisions, research and letters"); SocriaUX: designers.

## Product pictures
- `docs/first-run-shots/` (10 PNGs, about 1300×860): onboarding screens and archived earlier screens.
- `docs/mockups/logos-tv-screen.png`, `logos-tesla-screen.png` (flat UI), `logos-tv-living-room.png`,
  `logos-tesla-parked.png` (3D renders, no people).
- `mockups/logos-4/` (38): "proposed feature mockups… Nothing here is shipped". `mockups/logos-5-memory/` (12): the
  person shown is illustrative.

## Not available (do not invent)
Stratus; photographs of people, team, events, campus or customers; the brandbook document itself; an SVG logo or
wordmark file; testimonials, user numbers or measured results; a confirmed event date; an About page, team bios, a
company address.

## Inconsistencies found in the current identity
1. Typefaces: Instrument Serif + Inter (app, Charter, brand layer "Edition No. 1") vs Cormorant + Geist (Brandbook
   "Version 2", SocriaUX).
2. The main green: #354620 "the one moss" (app) vs #5e7633 primary with #465a26 for text (brand layer).
3. Paper and ink: #F5F3EB / #1F1F1F (app) vs #f4f1e8 / #20201b (site).
4. Token names against their values: `--sb-apricot` is #e4eada (pale green), `--sb-cobalt` is #9c5b3c (rust).
5. The Logos mark described as "a brain seen from above" in one comment; the drawing is a node graph.
6. Tagline spelling: "Think for Yourself" / "Think For Yourself." / "THINK FOR YOURSELF." / "AI that sharpens your
   thinking."
7. Free tier: "Free: 20,000 tokens a day" (site) vs "Socria has no free tier… seven-day hard trial" (`docs/TRIAL.md`).
8. Whether it answers: "it will not hand you the conclusion" (support FAQ) vs "Does Socria refuse to give answers? No."
